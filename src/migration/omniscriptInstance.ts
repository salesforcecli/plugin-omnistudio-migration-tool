import { AnyJson } from '@salesforce/ts-types';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';

import OmniScriptInstanceMappings from '../mappings/OmniScriptInstance';
import OmniScriptMappings from '../mappings/OmniScript';
import { QueryTools } from '../utils';
import { Logger } from '../utils/logger';
import { NetUtils } from '../utils/net';
import { isStandardDataModel, isStandardDataModelWithMetadataAPIEnabled } from '../utils/dataModelService';
import { SaveForLaterAssessmentInfo } from '../utils/interfaces';
import { Constants } from '../utils/constants/stringContants';
import { OmniscriptNameMapping, OSAssessmentInfo } from '../../src/utils';
import { BaseMigrationTool, ComponentType } from './base';
import {
  InvalidEntityTypeError,
  MigrationResult,
  MigrationTool,
  ObjectMapping,
  UploadRecordResult,
} from './interfaces';
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

      const { omniProcessMap, omniscriptSet } = await this.assessPrepare(omniscriptInstances, omniAssessmentInfos);

      const progressBar = createProgressBar('Assessing', this.getName() as ComponentType);
      progressBar.start(omniscriptInstances.length, 0);

      const assessmentInfos: SaveForLaterAssessmentInfo[] = [];
      let progressCounter = 0;

      // Process and set the migration status for both saved sessions and omniscripts
      for (const osInstance of omniscriptInstances) {
        const assessInfo: SaveForLaterAssessmentInfo = this.performAssessment(
          osInstance,
          omniProcessMap,
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
   * Migration of Save for Later instances
   */
  public async migrate(): Promise<MigrationResult[]> {
    if (isStandardDataModelWithMetadataAPIEnabled()) {
      return [];
    }

    const originalOsInstanceRecords = new Map<string, unknown>();
    const osInstanceUploadInfo = new Map<string, UploadRecordResult>();

    try {
      // we could also verify if current user has permission to read OmniScriptSavedSession
      // verify custom field PackageSavedSessionId__c exists in OmniScriptSavedSession
      const hasCustomField = await this.hasCustomFieldPackageSavedSessionId();
      if (!hasCustomField) {
        Logger.error(
          'Missing custom field. Please add custom field PackageSavedSessionId__c to OmniscriptSavedSession. Please read docs.'
        );
        return [];
      }

      const omniscriptInstances = await this.queryOmniscriptInstance();
      Logger.log(
        this.messages.getMessage('foundOmniScriptsToMigrate', [
          omniscriptInstances.length,
          Constants.OmniScriptSavedSessionsDisplayName,
        ])
      );

      if (omniscriptInstances.length === 0) {
        return [];
      }

      const { omniProcessMap, omniscriptSet } = await this.assessPrepare(omniscriptInstances);

      const progressBar = createProgressBar('Migrating', this.getName() as ComponentType);
      progressBar.start(omniscriptInstances.length, 0);

      let progressCounter = 0;

      // Process and set the migration status for both saved sessions and omniscripts
      for (const osInstance of omniscriptInstances) {
        const migratedInfo: UploadRecordResult = await this.performMigration(osInstance, omniProcessMap, omniscriptSet);
        const osInstanceId = String(osInstance['Id'] ?? '');
        osInstanceUploadInfo.set(osInstanceId, migratedInfo);
        originalOsInstanceRecords.set(osInstanceId, osInstance);

        progressBar.update(++progressCounter);
      }

      progressBar.stop();
    } catch (error) {
      Logger.error('Something failed when migrating omniscript saved sessions', error);
    }

    return [
      {
        name: this.getName(),
        results: osInstanceUploadInfo,
        records: originalOsInstanceRecords,
      },
    ];
  }

  private async assessPrepare(
    omniscriptInstances: AnyJson[],
    omniAssessmentInfos?: {
      osAssessmentInfos: OSAssessmentInfo[];
    }
  ): Promise<{ omniProcessMap: Map<string, string>; omniscriptSet: Set<string> }> {
    let omniscriptSet: Set<string> = new Set();
    if (omniAssessmentInfos && omniAssessmentInfos.osAssessmentInfos) {
      omniscriptSet = this.extractUniqueNamesFromOmniscriptAssessment(omniAssessmentInfos.osAssessmentInfos);
    }

    const omniscriptTypes: Set<string> = new Set();

    // extract all OmniscriptType__c field from omniscriptInstance to prepare for query
    // NOTE : if OmniscriptType__c is null for an omniscriptInstance,
    // it means that the original omniscript has been deleted AND this specific instance might be unrepairable
    for (const osInst of omniscriptInstances) {
      const osType = String(osInst[this.getOmniscriptInstancePackageFieldKey('OmniScriptType__c')] ?? '');
      if (osInst && osType !== '') {
        omniscriptTypes.add(osType);
      }
    }

    // query for Omniscript__c if omniscriptAssessment did not provide any information
    if (omniscriptSet.size === 0) {
      const packageOmniscripts: AnyJson = await this.queryPackageOmniscriptsWithType(omniscriptTypes);
      const osType = this.getOmniscriptPackageFieldKey('Type__c');
      const osSubType = this.getOmniscriptPackageFieldKey('SubType__c');
      const osLanguage = this.getOmniscriptPackageFieldKey('Language__c');
      // extract the unique string for each omni process, store it in a set, it will be used
      // later to determine the omniscript migration status
      // omniscriptSet = packageOmniscripts.reduce((newSet: Set<string>, os: AnyJson) => {
      //   const uniqueOmniProcessString =
      //     String(os[osType] ?? '') + String(os[osSubType] ?? '') + String(os[osLanguage] ?? '');
      //   if (uniqueOmniProcessString !== '') {
      //     newSet.add(uniqueOmniProcessString);
      //   }
      //   return newSet;
      // }, new Set());

      omniscriptSet = new Set<string>();

      for (const pkgos of packageOmniscripts) {
        const uniqueOmniProcessString =
          String(pkgos[osType] ?? '') + String(pkgos[osSubType] ?? '') + String(pkgos[osLanguage] ?? '');
        if (uniqueOmniProcessString !== '') {
          omniscriptSet.add(uniqueOmniProcessString);
        }
      }
    }

    // query for OmniProcesses matching the types defined in the OmniscriptInstance__c
    const omniProcesses: AnyJson = await this.queryOmniProcessesWithType(omniscriptTypes);

    // extract the unique string for each omni process, store it in a set, it will be used
    // later to determine the omniscript migration status
    const omniProcessMap: Map<string, string> = new Map<string, string>();
    for (const omniProcess of omniProcesses) {
      const uniqueOmniProcessString: string =
        String(omniProcess['Type'] ?? '') +
        String(omniProcess['SubType'] ?? '') +
        String(omniProcess['Language'] ?? '');
      const recordId = String(omniProcess['Id']);
      if (uniqueOmniProcessString !== '' && recordId !== '') {
        omniProcessMap.set(uniqueOmniProcessString, recordId);
      }
    }

    return {
      omniProcessMap,
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
    omniProcessMap: Map<string, string>,
    omniscriptSet: Set<string>
  ): SaveForLaterAssessmentInfo {
    const osId = String(osInstance[this.getOmniscriptInstancePackageFieldKey('OmniScriptId__c')] ?? '');
    const osType = String(osInstance[this.getOmniscriptInstancePackageFieldKey('OmniScriptType__c')] ?? '');
    const osSubType = String(osInstance[this.getOmniscriptInstancePackageFieldKey('OmniScriptSubType__c')] ?? '');
    const osLanguage = String(osInstance[this.getOmniscriptInstancePackageFieldKey('OmniScriptLanguage__c')] ?? '');

    const osInstanceId = String(osInstance['Id'] ?? '');
    const osInstanceName = String(osInstance['Name'] ?? '');
    const osInstanceStatus = String(osInstance[this.getOmniscriptInstancePackageFieldKey('Status__c')] ?? '');
    const osInstanceLastSaved = String(osInstance[this.getOmniscriptInstancePackageFieldKey('LastSaved__c')] ?? '');

    const uniqueOmniProcessString = osType + osSubType + osLanguage;

    const osUniqueName = osType !== '' ? `${osType}_${osSubType}_${osLanguage}` : '';
    const errors: string[] = [];
    const dependencies: string[] = [];

    let migrationStatus: SaveForLaterAssessmentInfo['migrationStatus'] = 'Ready for migration';
    let omniScriptMigrationStatus: SaveForLaterAssessmentInfo['omniScriptMigrationStatus'] = 'Ready for migration';

    // if omniscriptInstance's referenced omniscript is not migrated to core
    // then check the passed in omniscripts assessments from managed package
    if (omniProcessMap.has(uniqueOmniProcessString)) {
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

  private async performMigration(
    osInstance: AnyJson,
    omniProcessMap: Map<string, string>,
    omniscriptSet: Set<string>
  ): Promise<UploadRecordResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let skipped = false;

    // Extract OmniScript Instance data
    const osInstanceId = String(osInstance['Id'] ?? '');
    const osInstanceName = String(osInstance['Name'] ?? '');
    const osTypeFieldKey: string = this.getOmniscriptInstancePackageFieldKey('OmniScriptType__c');
    const osSubTypeFieldKey: string = this.getOmniscriptInstancePackageFieldKey('OmniScriptSubType__c');
    const osLanguageFieldKey: string = this.getOmniscriptInstancePackageFieldKey('OmniScriptLanguage__c');

    const osType = String(osInstance[osTypeFieldKey] ?? '');
    const osSubType = String(osInstance[osSubTypeFieldKey] ?? '');
    const osLanguage = String(osInstance[osLanguageFieldKey] ?? '');

    if (osType === '' || osSubType === '' || osLanguage === '') {
      errors.push(
        `${osInstanceName} has missing fields for ${osTypeFieldKey}, ${osSubTypeFieldKey}, ${osLanguageFieldKey}`
      );
      skipped = true;
      const uploadedRecord: UploadRecordResult = {
        referenceId: osInstanceId,
        id: '',
        success: errors.length === 0,
        hasErrors: errors.length > 0,
        errors,
        warnings,
        newName: osInstanceName,
        skipped,
      };

      return uploadedRecord;
    }

    // Extract OmniProcess Id from omniProcessSet
    const uniqueOmniProcessString = osType + osSubType + osLanguage;
    const targetOmniProcessId = omniProcessMap.get(uniqueOmniProcessString);

    if (!targetOmniProcessId) {
      errors.push(`No matching OmniProcess found for ${osType}_${osSubType}_${osLanguage}`);
      skipped = true;
      const uploadedRecord: UploadRecordResult = {
        referenceId: osInstanceId,
        id: '',
        success: errors.length === 0,
        hasErrors: errors.length > 0,
        errors,
        warnings,
        newName: osInstanceName,
        skipped,
      };

      return uploadedRecord;
    }

    Logger.log(`Found OmniProcess ${targetOmniProcessId}`);

    // Construct data for OmniScriptSavedSession
    const savedSessionData: AnyJson = {};

    // Map fields from OmniScriptInstance__c to OmniScriptSavedSession
    for (const [packageField, coreField] of Object.entries(OmniScriptInstanceMappings)) {
      const packageFieldKey = this.getOmniscriptInstancePackageFieldKey(packageField);
      const sourceValue = String(osInstance[packageFieldKey] ?? '');

      if (sourceValue !== '') {
        savedSessionData[coreField] = sourceValue;
      }
    }
    // transform the URLS
    delete savedSessionData['IsWebCompEnabled'];
    delete savedSessionData['OmniScriptVersionNumber'];
    delete savedSessionData['OmniScriptType'];
    delete savedSessionData['OmniScriptSubType'];
    delete savedSessionData['OmniScriptLanguage'];
    savedSessionData['Name'] = osInstanceName;
    savedSessionData['OmniScriptId'] = targetOmniProcessId;
    savedSessionData['PackageSavedSessionId__c'] = osInstanceId;

    Logger.logVerbose(`Constructed OmniScriptSavedSession data for ${osInstanceName}`);

    // Upload to OmniScriptSavedSession
    const omniscriptSavedSessionResult: CreateOmniscriptSavedSessionResult =
      await this.migrateCreateOmniscriptSavedSession(osInstanceId, osInstanceName, savedSessionData);
    if (omniscriptSavedSessionResult?.errors?.length > 0) {
      errors.concat(omniscriptSavedSessionResult.errors);
    }

    // Extract Id for OmniScriptSavedSession
    const newSavedSessionId = omniscriptSavedSessionResult?.id;
    if (!newSavedSessionId) {
      Logger.error(`No Id returned from OmniScriptSavedSession upload for ${osInstanceName}`);
      errors.push('OmniScriptSavedSession upload succeeded but no Id was returned');
      errors.push('Skipping attachment upload.');
    } else {
      // Extract all attachment object information for current omniscriptInstance record
      // includes the url to the content of the attachment Body
      const attachments: AnyJson[] = await this.queryAttachments(osInstanceId);
      Logger.log(`Found ${attachments.length} attachments for OmniScript Instance ${osInstanceId}`);

      // Download attachment body
      const attachmentBodyData: AttachmentDownloadResult[] = await this.downloadAttachments(attachments);

      // Transform / replace references to managed package in attachments Body  : OmniscriptFullJSON.json

      // Upload Attachment with Saved Session's Id as ParentId
      const uploadAttachmentResult: MigrateUploadAttachmentsResult = await this.migrateUploadAttachments(
        attachmentBodyData,
        newSavedSessionId,
        osInstanceName
      );
      if (uploadAttachmentResult?.errors?.length > 0) {
        errors.concat(uploadAttachmentResult.errors);
      }
    }

    const uploadedRecord: UploadRecordResult = {
      referenceId: osInstanceId,
      id: newSavedSessionId,
      success: errors.length === 0,
      hasErrors: errors.length > 0,
      errors,
      warnings,
      newName: osInstanceName,
      skipped,
    };

    return uploadedRecord;
  }

  private async migrateCreateOmniscriptSavedSession(
    osInstanceId: string,
    osInstanceName: string,
    savedSessionData: AnyJson
  ): Promise<CreateOmniscriptSavedSessionResult> {
    const errors: string[] = [];
    let recordId = '';
    let uploadResult: UploadRecordResult;

    Logger.logVerbose(`Session data upload : ${JSON.stringify(savedSessionData)}`);

    try {
      uploadResult = await NetUtils.createOne(
        this.connection,
        Constants.OmniScriptSavedSessionObjectName,
        osInstanceId,
        savedSessionData
      );

      if (!uploadResult.success || uploadResult.hasErrors) {
        Logger.error(`Failed to upload OmniScriptSavedSession for ${osInstanceName} ${JSON.stringify(uploadResult)}`);
        errors.push(JSON.stringify(uploadResult.errors));
      }

      Logger.logVerbose(`Successfully uploaded OmniScriptSavedSession: ${uploadResult.id}`);

      recordId = uploadResult.id || '';
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`Error uploading OmniScriptSavedSession for ${osInstanceName}: ${errorMsg}`);
      errors.push(errorMsg);
    }

    return {
      id: recordId,
      createOmniscriptSavedSessionSuccess: errors.length === 0,
      errors,
    };
  }

  private async migrateUploadAttachments(
    attachments: AttachmentDownloadResult[],
    savedSessionId: string,
    osInstanceName: string
  ): Promise<MigrateUploadAttachmentsResult> {
    let attachmentsUploaded = 0;
    const errors: string[] = [];

    if (attachments.length > 0) {
      Logger.logVerbose(`Uploading ${attachments.length} attachments for ${osInstanceName}`);

      for (const attachment of attachments) {
        const attachmentName = String(attachment['name'] ?? '');
        const attachmentData: AnyJson = {
          ParentId: savedSessionId,
          Name: attachmentName,
          Body: String(attachment['body'] ?? ''),
        };

        const attachmentId = String(attachment['id'] ?? '');

        try {
          const attachResult = await NetUtils.createOne(
            this.connection,
            Constants.AttachmentObjectName,
            attachmentId,
            attachmentData
          );

          if (!attachResult.success || attachResult.hasErrors) {
            const errorMsg = `Failed to upload attachment ${attachmentName} ${JSON.stringify(attachResult.errors)}`;
            Logger.warn(errorMsg);
            errors.push(errorMsg);
          } else {
            attachmentsUploaded++;
            Logger.logVerbose(`Successfully uploaded attachment: ${attachmentName}`);
          }
        } catch (error) {
          const errorMsg = `Error uploading attachment ${attachmentName}: ${
            error instanceof Error ? error.message : String(error)
          }`;
          Logger.warn(errorMsg);
          errors.push(errorMsg);
        }
      }

      Logger.log(`Uploaded ${attachmentsUploaded}/${attachments.length} attachments for ${osInstanceName}`);
    }

    return {
      attachmentUploadSuccess: attachmentsUploaded === 3,
      errors,
    };
  }

  /**
   * Query Omni Process (Core) and filter by type using QueryTools pattern
   * Uses mappings to determine which fields to query
   */
  private async queryOmniProcessesWithType(omniProcessTypes: Set<string>): Promise<AnyJson[]> {
    const fields = ['Id', 'Name', 'Type', 'SubType', 'Language'];
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
   * Query Omniscripts__c (Package) and filter by type using QueryTools pattern
   * Uses mappings to determine which fields to query
   */
  private async queryPackageOmniscriptsWithType(omniscriptTypes: Set<string>): Promise<AnyJson[]> {
    const osType = String(this.getOmniscriptPackageFieldKey('Type__c') ?? '');
    const osSubType = String(this.getOmniscriptPackageFieldKey('SubType__c') ?? '');
    const osLanguage = String(this.getOmniscriptPackageFieldKey('Language__c') ?? '');
    const osIsActive = String(this.getOmniscriptPackageFieldKey('IsActive__c') ?? '');
    const fields = [osType, osSubType, osLanguage];
    const osTypeList = Array.from(omniscriptTypes);
    const typeInListFilter = `${osType} IN (${osTypeList.map((s) => `'${s}'`).join(',')})`;
    const filters = [`${osIsActive} = true`];
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
                        FROM ${this.namespace}__${Constants.OmniscriptObjectName} 
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
    filters.set(this.getOmniscriptInstanceFieldKey('Status__c'), 'In Progress');

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

  private async queryAttachments(attachmentParentId: string): Promise<AnyJson[]> {
    const fields = ['Id', 'Name', 'Body', 'ContentType'];
    const filterStr = `WHERE ParentId = '${attachmentParentId}'`;
    /**
     * SELECT Id, Name, Body, ContentType FROM Attachment WHERE ParentId = a3eSB000000DI0jYAG)
     */
    const queryString = `SELECT ${fields.join(',')} 
                        FROM ${Constants.AttachmentObjectName} 
                        ${filterStr}`;

    try {
      return await QueryTools.queryCustom(this.connection, queryString);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      Logger.error(this.messages.getMessage('errorOmniProcessWithTypeQuery'), error);
      return [];
    }
  }

  private async hasCustomFieldPackageSavedSessionId(): Promise<boolean> {
    const fields = ['Name', 'PackageSavedSessionId__c'];
    /**
     * SELECT Name, PackageSavedSessionId__c FROM OmniscriptSavedSession LIMIT 1
     */
    const queryString = `SELECT ${fields.join(',')} 
                        FROM ${Constants.OmniScriptSavedSessionObjectName} 
                        LIMIT 1`;

    try {
      await QueryTools.queryCustom(this.connection, queryString);
      return true;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      Logger.error('Does not have PackageSavedSessionId__c', error);
      return false;
    }
  }

  /**
   * Download attachment bodies from Salesforce
   *
   * @param connection - Salesforce connection instance
   * @param attachmentBodyPaths - Array of attachment body URLs (e.g., /services/data/v67.0/sobjects/Attachment/00PSB000003DJG12AO/Body)
   * @returns Array of downloaded attachment data with bodies and any errors
   */
  private async downloadAttachments(attachments: AnyJson[]): Promise<AttachmentDownloadResult[]> {
    const results: AttachmentDownloadResult[] = [];

    const errors: string[] = [];

    for (const attachment of attachments) {
      if (!attachment) {
        errors.push('Failed to download attachment');
        break;
      }
      const attachmentId = String(attachment['Id'] ?? '');
      const attachmentName = String(attachment['Name'] ?? '');
      const path = String(attachment['Body'] ?? '');
      let body = '';

      try {
        const raw = await this.connection.request<string | Buffer>({
          method: 'GET',
          url: path,
        });

        if (typeof raw === 'object') {
          body = JSON.stringify(raw);
        } else if (typeof raw === 'string') {
          body = raw;
        }

        Logger.logVerbose(`Successfully downloaded attachment ${attachmentId}, size: ${body.length} bytes`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to download attachment from path ${path}:`, error);
        errors.push(errorMsg);
      }

      results.push({
        id: attachmentId,
        name: attachmentName,
        body,
        originalPath: path,
        errors,
      });
    }

    return results;
  }

  /**
   * Get field key with namespace prefix from OmniscriptInstanceMapping
   * Uses mappings object to get the source field name, then adds namespace if needed
   */
  private getOmniscriptInstanceFieldKey(fieldName: string, useStandardDataModel = false): string {
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

  private getOmniscriptInstancePackageFieldKey(fieldName: string): string {
    return this.getOmniscriptInstanceFieldKey(fieldName, false);
  }

  /**
   * Get field key with namespace prefix from OmniscriptMapping
   * Uses mappings object to get the source field name, then adds namespace if needed
   */
  private getOmniscriptFieldKey(fieldName: string, useStandardDataModel = false): string {
    // If fieldName is already a key in mappings, use it directly
    if (Object.prototype.hasOwnProperty.call(OmniScriptMappings, fieldName)) {
      if (useStandardDataModel) {
        const mappedValue = OmniScriptMappings[fieldName as keyof typeof OmniScriptMappings];
        return mappedValue;
      }
      return `${this.namespace}__${fieldName}`;
    }
    // Otherwise, assume it's already the correct field name
    return fieldName;
  }

  private getOmniscriptPackageFieldKey(fieldName: string): string {
    return this.getOmniscriptFieldKey(fieldName, false);
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

interface CreateOmniscriptSavedSessionResult {
  id: string;
  createOmniscriptSavedSessionSuccess: boolean;
  errors: string[];
}

interface MigrateUploadAttachmentsResult {
  attachmentUploadSuccess: boolean;
  errors: string[];
}

interface AttachmentDownloadResult {
  id: string;
  name: string;
  body: string;
  originalPath: string;
  errors: string[];
}
