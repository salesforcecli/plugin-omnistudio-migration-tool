import { AnyJson } from '@salesforce/ts-types';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';

import OmniScriptInstanceMappings from '../mappings/OmniScriptInstance';
import { QueryTools } from '../utils';
import { Logger } from '../utils/logger';
import { isStandardDataModel, isStandardDataModelWithMetadataAPIEnabled } from '../utils/dataModelService';
import { SaveForLaterAssessmentInfo } from '../utils/interfaces';
import { Constants, Status } from '../utils/constants/stringContants';
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
    osAssessmentInfos: Array<{ id: string; oldName?: string; name: string; migrationStatus: string }>;
  }): Promise<SaveForLaterAssessmentInfo[]> {
    try {
      if (isStandardDataModelWithMetadataAPIEnabled()) {
        return [];
      }

      Logger.log(
        this.messages.getMessage('startingOmniScriptAssessment', [Constants.OmniScriptSavedSessionsDisplayName])
      );

      const packageInstances = await this.queryPackageInstances();
      Logger.log(
        this.messages.getMessage('foundOmniScriptsToAssess', [
          packageInstances.length,
          Constants.OmniScriptSavedSessionsDisplayName,
        ])
      );

      if (packageInstances.length === 0) {
        return [];
      }

      // Create a map of migrated OmniScript IDs for quick lookup
      const readyToMigrateOmniScriptIds = new Set<string>();
      if (omniAssessmentInfos) {
        // Collect all successfully migrated OmniScript IDs
        omniAssessmentInfos.osAssessmentInfos.forEach((info) => {
          if (info.migrationStatus === Status.ReadyForMigration) {
            readyToMigrateOmniScriptIds.add(info.id);
          }
        });
      }

      const progressBar = createProgressBar('Assessing', this.getName() as ComponentType);
      progressBar.start(packageInstances.length, 0);

      const assessmentInfos: SaveForLaterAssessmentInfo[] = [];
      let progressCounter = 0;

      for (const packageInstance of packageInstances) {
        try {
          const assessmentInfo = await this.assessSingleInstance(
            packageInstance,
            readyToMigrateOmniScriptIds,
            omniAssessmentInfos
          );
          assessmentInfos.push(assessmentInfo);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          Logger.error(`Error assessing instance ${String(packageInstance['Id'])}:`, error);
          assessmentInfos.push({
            id: String(packageInstance['Id']),
            name: String(packageInstance['Name'] || ''),
            oldName: String(packageInstance['Name'] || ''),
            omniScriptId: String(this.getPackageFieldValue(packageInstance, 'OmniScriptId__c') || ''),
            omniScriptName: '',
            status: String(this.getPackageFieldValue(packageInstance, 'Status__c') || ''),
            lastSaved: String(this.getPackageFieldValue(packageInstance, 'LastSaved__c') || ''),
            migrationStatus: Status.Failed as 'Failed',
            infos: [],
            warnings: [],
            errors: [errorMsg],
          });
        }

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
      Logger.error('Error during Save for Later assessment', err);
      return [];
    }
  }

  /**
   * Migration of Save for Later instances (Story 3)
   * TODO: Implement in Story 3
   */
  public async migrate(): Promise<MigrationResult[]> {
    return Promise.resolve([
      {
        name: this.getName(),
        results: new Map(),
        records: new Map(),
      },
    ]);
  }

  /**
   * Assess a single instance and return its assessment info
   */
  private async assessSingleInstance(
    packageInstance: AnyJson,
    readyToMigrateOmniScriptIds: Set<string>,
    omniAssessmentInfos?: {
      osAssessmentInfos: Array<{ id: string; oldName?: string; name: string; migrationStatus: string }>;
    }
  ): Promise<SaveForLaterAssessmentInfo> {
    const packageInstanceId = String(packageInstance['Id']);
    const packageOmniScriptId = String(this.getPackageFieldValue(packageInstance, 'OmniScriptId__c') || '');
    const status = String(this.getPackageFieldValue(packageInstance, 'Status__c') || '');
    const lastSaved = String(this.getPackageFieldValue(packageInstance, 'LastSaved__c') || '');
    const name = String(packageInstance['Name'] || '');

    const { omniScriptName, omniScriptMigrationStatus } = await this.getOmniScriptInfo(
      packageOmniScriptId,
      readyToMigrateOmniScriptIds,
      omniAssessmentInfos
    );

    const { migrationStatus, warnings, errors, infos } = this.determineMigrationStatus(
      packageOmniScriptId,
      omniScriptMigrationStatus
    );

    return {
      id: packageInstanceId,
      name,
      oldName: name,
      omniScriptId: packageOmniScriptId,
      omniScriptName,
      status,
      lastSaved,
      migrationStatus,
      infos,
      warnings,
      errors,
      omniScriptMigrationStatus,
    };
  }

  /**
   * Get OmniScript information for a given ID
   */
  private async getOmniScriptInfo(
    packageOmniScriptId: string,
    readyToMigrateOmniScriptIds: Set<string>,
    omniAssessmentInfos?: {
      osAssessmentInfos: Array<{ id: string; oldName?: string; name: string; migrationStatus: string }>;
    }
  ): Promise<{
    omniScriptName: string;
    omniScriptMigrationStatus?:
      | 'Ready for migration'
      | 'Failed'
      | 'Skipped'
      | 'Complete'
      | 'Needs manual intervention'
      | 'Warnings';
  }> {
    let omniScriptName = '';
    let omniScriptMigrationStatus:
      | 'Ready for migration'
      | 'Failed'
      | 'Skipped'
      | 'Complete'
      | 'Needs manual intervention'
      | 'Warnings'
      | undefined;

    if (packageOmniScriptId) {
      if (readyToMigrateOmniScriptIds.has(packageOmniScriptId)) {
        omniScriptMigrationStatus = Status.ReadyForMigration as 'Ready for migration';
      } else if (omniAssessmentInfos) {
        const osInfo = omniAssessmentInfos.osAssessmentInfos.find((info) => info.id === packageOmniScriptId);
        if (osInfo) {
          omniScriptName = osInfo.name;
          // Type guard to ensure migrationStatus is valid
          omniScriptMigrationStatus = osInfo.migrationStatus as
            | 'Ready for migration'
            | 'Failed'
            | 'Skipped'
            | 'Complete'
            | 'Needs manual intervention'
            | 'Warnings';
        }
      }

      if (!omniScriptName && packageOmniScriptId) {
        omniScriptName = await this.queryOmniScriptName(packageOmniScriptId);
      }
    }

    return { omniScriptName, omniScriptMigrationStatus };
  }

  /**
   * Query OmniScript name by ID using QueryTools with filter map
   */
  private async queryOmniScriptName(omniScriptId: string): Promise<string> {
    try {
      const filters = new Map<string, unknown>();
      filters.set('Id', omniScriptId);

      const omniScriptObjectName = this.IS_STANDARD_DATA_MODEL ? Constants.OmniProcessObjectName : 'OmniScript__c';

      const results = await QueryTools.queryWithFilter(
        this.connection,
        this.getQueryNamespace(),
        omniScriptObjectName,
        ['Name'],
        filters
      );

      if (results && results.length > 0) {
        return String(results[0]['Name'] || '');
      }
    } catch (error) {
      Logger.logVerbose(`Error querying OmniScript ${omniScriptId}: ${String(error)}`);
    }
    return '';
  }

  /**
   * Determine migration status based on OmniScript status
   */
  private determineMigrationStatus(
    packageOmniScriptId: string,
    omniScriptMigrationStatus: string
  ): {
    migrationStatus: 'Ready for migration' | 'Failed' | 'Skipped' | 'Needs manual intervention' | 'Warnings';
    warnings: string[];
    errors: string[];
    infos: string[];
  } {
    let migrationStatus: 'Ready for migration' | 'Failed' | 'Skipped' | 'Needs manual intervention' | 'Warnings' =
      Status.ReadyForMigration as 'Ready for migration';
    const warnings: string[] = [];
    const errors: string[] = [];
    const infos: string[] = [];

    if (!packageOmniScriptId) {
      migrationStatus = Status.NeedsManualIntervention as 'Needs manual intervention';
      errors.push('Missing OmniScriptId__c');
    } else if (!omniScriptMigrationStatus || omniScriptMigrationStatus === Status.Skipped) {
      migrationStatus = Status.Skipped as 'Skipped';
      warnings.push(`OmniScript ${packageOmniScriptId} not assessed or not found`);
    } else if (
      omniScriptMigrationStatus === Status.NeedsManualIntervention ||
      omniScriptMigrationStatus === Status.Failed
    ) {
      migrationStatus = Status.NeedsManualIntervention as 'Needs manual intervention';
      warnings.push(`Dependent OmniScript has status: ${omniScriptMigrationStatus}`);
    } else if (omniScriptMigrationStatus === Status.Warnings) {
      migrationStatus = Status.Warnings as 'Warnings';
      warnings.push('Dependent OmniScript has warnings');
    } else if (
      omniScriptMigrationStatus === Status.Complete ||
      omniScriptMigrationStatus === Status.ReadyForMigration
    ) {
      migrationStatus = Status.ReadyForMigration as 'Ready for migration';
      infos.push('Dependent OmniScript is ready for migration');
    }

    return { migrationStatus, warnings, errors, infos };
  }

  /**
   * Query Package instances using QueryTools pattern
   * Uses mappings to determine which fields to query
   */
  private async queryPackageInstances(): Promise<AnyJson[]> {
    const fields = this.getQueryFields();

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
      throw err;
    }
  }

  /**
   * Get field key with namespace prefix from mappings
   * Uses mappings object to get the source field name, then adds namespace if needed
   */
  private getFieldKey(fieldName: string): string {
    // If fieldName is already a key in mappings, use it directly
    if (Object.prototype.hasOwnProperty.call(OmniScriptInstanceMappings, fieldName)) {
      const mappedValue = OmniScriptInstanceMappings[fieldName as keyof typeof OmniScriptInstanceMappings];
      return this.IS_STANDARD_DATA_MODEL ? mappedValue : this.namespacePrefix + fieldName;
    }
    // Otherwise, assume it's already the correct field name
    return this.IS_STANDARD_DATA_MODEL ? fieldName : this.namespacePrefix + fieldName;
  }

  /**
   * Get package field value using mappings
   */
  private getPackageFieldValue(packageInstance: AnyJson, mappingKey: string): unknown {
    const fieldKey = this.getFieldKey(mappingKey);
    return packageInstance[fieldKey];
  }

  /**
   * Get all field keys from mappings for querying
   * Returns field names without namespace prefix - QueryTools will add it
   */
  private getQueryFields(): string[] {
    // Return mapping keys directly - QueryTools.buildCustomObjectFields() will add namespace prefix
    return Object.keys(OmniScriptInstanceMappings);
  }

  private getQueryNamespace(): string {
    return this.IS_STANDARD_DATA_MODEL ? '' : this.namespace;
  }
}
