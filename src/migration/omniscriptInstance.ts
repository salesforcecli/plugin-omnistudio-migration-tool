import { AnyJson } from '@salesforce/ts-types';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';

import OmniScriptInstanceMappings from '../mappings/OmniScriptInstance';
import { QueryTools } from '../utils';
import { Logger } from '../utils/logger';
import { isStandardDataModel, isStandardDataModelWithMetadataAPIEnabled } from '../utils/dataModelService';
import { SaveForLaterAssessmentInfo } from '../utils/interfaces';
import { Constants } from '../utils/constants/stringContants';
import { OmniscriptNameMapping, OSAssessmentInfo } from '../../src/utils';
import { BaseMigrationTool, ComponentType } from './base';
import { InvalidEntityTypeError, MigrationResult, MigrationTool, ObjectMapping } from './interfaces';
import { createProgressBar } from './base';

export class OmniScriptInstanceMigrationTool extends BaseMigrationTool implements MigrationTool {
  private readonly IS_STANDARD_DATA_MODEL: boolean = isStandardDataModel();

  public constructor(namespace: string, connection: Connection, logger: Logger, messages: Messages<string>, ux: Ux) {
    super(namespace, connection, logger, messages, ux);
  }

  public getName(): string {
    return Constants.OmniScriptSavedSessionsDisplayName;
  }

  public getRecordName(record: AnyJson): string {
    return (record['Name'] as string) || (record['Id'] as string);
  }

  public getMappings(): ObjectMapping[] {
    return [
      {
        source: Constants.OmniScriptInstanceObjectName,
        target: Constants.OmniScriptSavedSessionObjectName,
      },
    ];
  }

  public async truncate(): Promise<void> {
    // Truncation is needed when we migrate from custom to standard data model
    // For custom data model, no truncation is required
    if (this.IS_STANDARD_DATA_MODEL) {
      Logger.logVerbose(this.messages.getMessage('skippingTruncation'));
      return;
    }

    // Delete ALL records from Core, just like OS, IP, and DM do
    // This ensures a clean migration state
    await super.truncate(Constants.OmniScriptSavedSessionObjectName);
  }

  /**
   * Assess Save for Later instances for migration readiness
   * Checks dependencies on OmniScript migration status
   */
  public async assess(omniAssessmentInfos?: {
    osAssessmentInfos: OSAssessmentInfo[];
  }): Promise<SaveForLaterAssessmentInfo[]> {
    try {
      if (isStandardDataModelWithMetadataAPIEnabled()) {
        return [];
      }

      Logger.log(
        this.messages.getMessage('startingOmniScriptAssessment', [Constants.OmniScriptSavedSessionsDisplayName])
      );

      const omniscriptInstances = await this.queryOmniscriptInstance();
      Logger.log(
        this.messages.getMessage('foundOmniScriptsToAssess', [
          omniscriptInstances.length,
          Constants.OmniScriptSavedSessionsDisplayName,
        ])
      );

      if (omniscriptInstances.length === 0) {
        return [];
      }

      const { omniProcessesSet, omniscriptSet } = await this.assessPrepare(omniscriptInstances, omniAssessmentInfos);

      const progressBar = createProgressBar('Assessing', this.getName() as ComponentType);
      progressBar.start(omniscriptInstances.length, 0);

      const assessmentInfos: SaveForLaterAssessmentInfo[] = [];
      let progressCounter = 0;

      // Process and set the migration status for both saved sessions and omniscripts
      for (const osInstance of omniscriptInstances) {
        const assessInfo: SaveForLaterAssessmentInfo = this.performAssessment(
          osInstance,
          omniProcessesSet,
          omniscriptSet
        );
        assessmentInfos.push(assessInfo);
        progressBar.update(++progressCounter);
      }

      progressBar.stop();

      Logger.log(
        this.messages.getMessage('assessedOmniScriptsCount', [
          assessmentInfos.length,
          Constants.OmniScriptSavedSessionsDisplayName,
        ])
      );

      return assessmentInfos;
    } catch (err) {
      if (err instanceof InvalidEntityTypeError) {
        throw err;
      }
      Logger.error(this.messages.getMessage('errorDuringSaveForLaterAssessment', [(err as Error).message]));
      return [];
    }
  }

  /**
   * Migration of Save for Later instances (Story 3)
   * TODO: Implement in Story 3
   */
  public async migrate(): Promise<MigrationResult[]> {
    const queryAttachments = await this.queryAttachments(new Set());
    if (queryAttachments) {
      Logger.log('temporary placeholder');
    }
    return Promise.resolve([
      {
        name: this.getName(),
        results: new Map(),
        records: new Map(),
      },
    ]);
  }

  private async assessPrepare(
    omniscriptInstances: AnyJson[],
    omniAssessmentInfos?: {
      osAssessmentInfos: OSAssessmentInfo[];
    }
  ): Promise<{ omniProcessesSet: Set<string>; omniscriptSet: Set<string> }> {
    let omniscriptSet: Set<string> = new Set();
    if (omniAssessmentInfos && omniAssessmentInfos.osAssessmentInfos) {
      omniscriptSet = this.extractUniqueNamesFromOmniscriptAssessment(omniAssessmentInfos.osAssessmentInfos);
    }

    const omniscriptTypes: Set<string> = new Set();

    // extract all OmniscriptType__c field from omniscriptInstance to prepare for query
    // NOTE : if OmniscriptType__c is null for an omniscriptInstance,
    // it means that the original omniscript has been deleted AND this specific instance might be unrepairable
    for (const osInst of omniscriptInstances) {
      const osType = String(osInst[this.getPackageFieldKey('OmniScriptType__c')] ?? '');
      if (osInst && osType !== '') {
        omniscriptTypes.add(osType);
      }
    }

    // query for OmniProcesses matching the types defined in the OmniscriptInstance__c
    const omniProcesses: AnyJson = await this.queryOmniProcessesWithType(omniscriptTypes);

    // extract the unique string for each omni process, store it in a set, it will be used
    // later to determine the omniscript migration status
    const omniProcessesSet = omniProcesses.reduce((newSet: Set<string>, op: AnyJson) => {
      const uniqueOmniProcessString =
        String(op['Type'] ?? '') + String(op['SubType'] ?? '') + String(op['Language'] ?? '');
      if (uniqueOmniProcessString !== '') {
        newSet.add(uniqueOmniProcessString);
      }
      return newSet;
    }, new Set());

    return {
      omniProcessesSet,
      omniscriptSet,
    };
  }

  private extractUniqueNamesFromOmniscriptAssessment(osAssessmentInfos: OSAssessmentInfo[]): Set<string> {
    const omniscriptSet: Set<string> = new Set();
    if (Array.isArray(osAssessmentInfos)) {
      for (const osAssessInfo of osAssessmentInfos) {
        // assessment info for omniscripts will show what the old and newType, newSubtype and newLanguage
        // newType, newSubType, newLanguage will show up regardless of migration,
        // so that OmniProcess doesn't even have to exist

        if (osAssessInfo) {
          const nameMapping: OmniscriptNameMapping | undefined = osAssessInfo['nameMapping'];
          if (nameMapping != null) {
            const uniqueOmniscriptString =
              String(nameMapping['newType'] ?? '') +
              String(nameMapping['newSubType'] ?? '') +
              String(nameMapping['newLanguage'] ?? '');

            if (uniqueOmniscriptString !== '') {
              omniscriptSet.add(uniqueOmniscriptString);
            }
          }
        }
      }
    }

    return omniscriptSet;
  }

  private performAssessment(
    osInstance: AnyJson,
    omniProcessSet: Set<string>,
    omniscriptSet: Set<string>
  ): SaveForLaterAssessmentInfo {
    const osId = String(osInstance[this.getPackageFieldKey('OmniScriptId__c')] ?? '');
    const osType = String(osInstance[this.getPackageFieldKey('OmniScriptType__c')] ?? '');
    const osSubType = String(osInstance[this.getPackageFieldKey('OmniScriptSubType__c')] ?? '');
    const osLanguage = String(osInstance[this.getPackageFieldKey('OmniScriptLanguage__c')] ?? '');

    const osInstanceId = String(osInstance['Id'] ?? '');
    const osInstanceName = String(osInstance['Name'] ?? '');
    const osInstanceStatus = String(osInstance[this.getPackageFieldKey('Status__c')] ?? '');
    const osInstanceLastSaved = String(osInstance[this.getPackageFieldKey('LastSaved__c')] ?? '');

    const uniqueOmniProcessString = osType + osSubType + osLanguage;

    const osUniqueName = osType !== '' ? `${osType}_${osSubType}_${osLanguage}` : '';
    const errors: string[] = [];
    const dependencies: string[] = [];

    let migrationStatus: SaveForLaterAssessmentInfo['migrationStatus'] = 'Ready for migration';
    let omniScriptMigrationStatus: SaveForLaterAssessmentInfo['omniScriptMigrationStatus'] = 'Ready for migration';

    // if omniscriptInstance's referenced omniscript is not migrated to core
    // then check the passed in omniscripts assessments from managed package
    if (omniProcessSet.has(uniqueOmniProcessString)) {
      // active Omni Process is in the org (already migrated)
      migrationStatus = 'Ready for migration';
      omniScriptMigrationStatus = 'Complete';
    } else if (omniscriptSet.has(uniqueOmniProcessString)) {
      // active Omniscript__c is in the org
      // No active Omni Process
      migrationStatus = 'Ready for migration';
      omniScriptMigrationStatus = 'Ready for migration';

      const osNeedsToBeDeployed = this.messages.getMessage('omniscriptNeedsToBeMigrated', [osUniqueName]);
      errors.push(osNeedsToBeDeployed);
      dependencies.push(osUniqueName);
    } else {
      // both Omniscript__c and Omni Process does not exist in the org, panic
      // OR
      // OmniscriptInstance having no data for OmniScriptType__c probably means the Omniscript__c no longer exists in the Org.
      migrationStatus = 'Needs manual intervention';
      omniScriptMigrationStatus = 'Needs manual intervention';

      const unableToFindOs = this.messages.getMessage('unableToFindActiveOmniscript', [osUniqueName]);
      const followUpMsg = this.messages.getMessage('omniscriptDoesNotExistOrActivate');
      let msg = `${unableToFindOs}`;
      if (osType === '') {
        const noOsFound = this.messages.getMessage('noOmniscriptFoundForOsInstance', [osInstanceName]);
        // OmniscriptInstance having no data for OmniScriptType__c probably means the Omniscript no longer exists in the Org.
        msg = `${noOsFound}`;
      }

      errors.push(msg);
      errors.push(followUpMsg);
    }

    const assessInfo = {
      id: osInstanceId,
      name: osInstanceName,
      oldName: osInstanceName,
      omniScriptId: osId,
      omniScriptName: osUniqueName,
      status: osInstanceStatus,
      lastSaved: osInstanceLastSaved,
      migrationStatus,
      omniScriptMigrationStatus,
      dependenciesOS: dependencies,
      errors,
      infos: [],
      warnings: [],
    };

    return assessInfo;
  }

  /**
   * Query Omni Process (Core) and filter by type using QueryTools pattern
   * Uses mappings to determine which fields to query
   */
  private async queryOmniProcessesWithType(omniProcessTypes: Set<string>): Promise<AnyJson[]> {
    const fields = ['Name', 'Type', 'SubType', 'Language'];
    const osTypeList = Array.from(omniProcessTypes);
    const typeInListFilter = `Type IN (${osTypeList.map((s) => `'${s}'`).join(',')})`;
    const filters = ['IsActive = true'];
    let filterQuery = '';
    if (osTypeList.length > 0) {
      filters.push(typeInListFilter);
      filterQuery = filters.join(' AND ');
    } else {
      filterQuery = filters.join('');
    }
    /**
     * SELECT Name, Type, SubType, Language FROM OmniProcess WHERE Type IN ('sfl','test','other') AND IsActive = true
     */
    const queryString = `SELECT ${fields.join(',')} 
                        FROM ${Constants.OmniProcessObjectName} 
                        WHERE ${filterQuery}`;

    try {
      return await QueryTools.queryCustom(this.connection, queryString);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      Logger.error(this.messages.getMessage('errorOmniProcessWithTypeQuery'), error);
      return [];
    }
  }

  /**
   * Query OmniscriptInstance__c (Package) using QueryTools pattern
   * Uses mappings to determine which fields to query
   */
  private async queryOmniscriptInstance(): Promise<AnyJson[]> {
    const fields = this.getQueryFields(OmniScriptInstanceMappings, false);

    const filters = new Map<string, unknown>();
    // Only migrate 'In Progress' sessions
    filters.set(this.getFieldKey('Status__c'), 'In Progress');

    try {
      return await QueryTools.queryWithFilter(
        this.connection,
        this.getQueryNamespace(),
        Constants.OmniScriptInstanceObjectName,
        fields,
        filters
      );
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorCode' in err && err.errorCode === 'INVALID_TYPE') {
        throw new InvalidEntityTypeError(
          `${Constants.OmniScriptInstanceObjectName} type is not found under this namespace`
        );
      }
      return [];
    }
  }

  /**
   * Query for all attachments with the following parent ids
   *
   * @param attachmentParentIds a set containing ids
   * @returns a list of attachment records with parent ids matching the list of parent ids provided
   */

  private async queryAttachments(attachmentParentIds: Set<string>): Promise<AnyJson[]> {
    const fields = ['Id', 'Name', 'Body'];
    const parentIdsList = Array.from(attachmentParentIds);
    const parentIdInListFilter = `ParentId IN (${parentIdsList.map((s) => `'${s}'`).join(',')})`;
    let filterQuery = ' WHERE ';
    if (parentIdInListFilter.length > 0) {
      filterQuery = parentIdInListFilter;
    }
    /**
     * SELECT Id, Name, Body FROM Attachment WHERE ParentId IN ('a3eSB000000DI0jYAG','test','other')
     */
    const queryString = `SELECT ${fields.join(',')} 
                        FROM ${Constants.AttachmentObjectName} 
                        ${filterQuery}`;

    try {
      return await QueryTools.queryCustom(this.connection, queryString);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      Logger.error(this.messages.getMessage('errorOmniProcessWithTypeQuery'), error);
      return [];
    }
  }

  /**
   * Get field key with namespace prefix from mappings
   * Uses mappings object to get the source field name, then adds namespace if needed
   */
  private getFieldKey(fieldName: string, useStandardDataModel = false): string {
    // If fieldName is already a key in mappings, use it directly
    if (Object.prototype.hasOwnProperty.call(OmniScriptInstanceMappings, fieldName)) {
      if (useStandardDataModel) {
        const mappedValue = OmniScriptInstanceMappings[fieldName as keyof typeof OmniScriptInstanceMappings];
        return mappedValue;
      }
      return `${this.namespace}__${fieldName}`;
    }
    // Otherwise, assume it's already the correct field name
    return fieldName;
  }

  private getPackageFieldKey(fieldName: string): string {
    return this.getFieldKey(fieldName, false);
  }

  /**
   * Get all field keys from mappings for querying
   * Returns field names without namespace prefix - QueryTools will add it
   */
  private getQueryFields(objectMap: AnyJson, useStandardDataModel: boolean): string[] {
    if (useStandardDataModel) {
      return Object.values(objectMap) as string[];
    }
    return Object.keys(objectMap);
  }

  /**
   * Returns the namespace of the managed package
   *
   * @param useStandardDataModel false by default
   * @returns empty string or namespace
   */
  private getQueryNamespace(useStandardDataModel = false): string {
    return useStandardDataModel ? '' : this.namespace;
  }
}
