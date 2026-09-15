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

const SOURCE_CHUNK_SIZE = 200;
// Salesforce REST requests allow up to 6 MB for JSON payloads; retain 1 MB of headroom.
const ATTACHMENT_REQUEST_BODY_BYTE_LIMIT = 5 * 1024 * 1024;
const ATTACHMENT_REQUEST_ENVELOPE_BYTE_LENGTH = Buffer.byteLength(JSON.stringify({ records: [] }), 'utf8');

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

      // verify custom field PackageSavedSessionId__c exists in OmniScriptSavedSession
      const hasStandardField = await this.hasStandardFieldPackageSavedSessionId();
      if (!hasStandardField) {
        Logger.log(this.messages.getMessage('ossMissingStandardField'));
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
      // verify custom field PackageSavedSessionId__c exists in OmniScriptSavedSession
      const hasStandardField = await this.hasStandardFieldPackageSavedSessionId();
      if (!hasStandardField) {
        Logger.log(this.messages.getMessage('ossMissingStandardField'));
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

      const { omniProcessMap } = await this.assessPrepare(omniscriptInstances);

      const progressBar = createProgressBar('Migrating', this.getName() as ComponentType);
      progressBar.start(omniscriptInstances.length, 0);

      let progressCounter = 0;

      for (let offset = 0; offset < omniscriptInstances.length; offset += SOURCE_CHUNK_SIZE) {
        const sourceChunk = omniscriptInstances.slice(offset, offset + SOURCE_CHUNK_SIZE);
        await this.performMigrationChunk(sourceChunk, omniProcessMap, osInstanceUploadInfo);

        for (const osInstance of sourceChunk) {
          const osInstanceId = String(osInstance['Id'] ?? '');
          originalOsInstanceRecords.set(osInstanceId, osInstance);
          progressBar.update(++progressCounter);
        }
      }

      progressBar.stop();
    } catch (error) {
      Logger.error(this.messages.getMessage('ossMigrationFailed'), error);
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

  private prepareMigration(
    osInstance: AnyJson,
    omniProcessMap: Map<string, string>
  ): PreparedSession | UploadRecordResult {
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
        this.messages.getMessage('ossMissingFieldValue', [
          osInstanceName,
          osTypeFieldKey,
          osSubTypeFieldKey,
          osLanguageFieldKey,
        ])
      );
      skipped = true;
      return {
        referenceId: osInstanceId,
        id: '',
        success: errors.length === 0,
        hasErrors: errors.length > 0,
        errors,
        warnings,
        newName: osInstanceName,
        skipped,
      };
    }

    // Extract OmniProcess Id from omniProcessSet
    const uniqueOmniProcessString = osType + osSubType + osLanguage;
    const targetOmniProcessId = omniProcessMap.get(uniqueOmniProcessString);

    if (!targetOmniProcessId) {
      errors.push(this.messages.getMessage('ossOmniscriptNeedsMigration', [osType, osSubType, osLanguage]));
      skipped = true;
      return {
        referenceId: osInstanceId,
        id: '',
        success: errors.length === 0,
        hasErrors: errors.length > 0,
        errors,
        warnings,
        newName: osInstanceName,
        skipped,
      };
    }

    Logger.debug(this.messages.getMessage('ossFoundOmniProcess', [osType, osSubType, osLanguage, targetOmniProcessId]));

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

    delete savedSessionData['IsWebCompEnabled'];
    delete savedSessionData['OmniScriptVersionNumber'];
    delete savedSessionData['OmniScriptType'];
    delete savedSessionData['OmniScriptSubType'];
    delete savedSessionData['OmniScriptLanguage'];
    savedSessionData['Name'] = osInstanceName;
    savedSessionData['OmniScriptId'] = targetOmniProcessId;
    if (savedSessionData['ManagedPkgSessKey']) {
      savedSessionData['ManagedPkgSessKey'] = osInstanceId;
    }

    savedSessionData['attributes'] = {
      type: Constants.OmniScriptSavedSessionObjectName,
      referenceId: osInstanceId,
    };

    return { osInstanceId, osInstanceName, osType, osSubType, osLanguage, savedSessionData };
  }

  // Each phase remains serial; batching only reduces API round trips.
  // eslint-disable-next-line complexity
  private async performMigrationChunk(
    osInstances: AnyJson[],
    omniProcessMap: Map<string, string>,
    uploadInfo: Map<string, UploadRecordResult>
  ): Promise<void> {
    const preparedSessions: PreparedSession[] = [];
    for (const osInstance of osInstances) {
      const prepared = this.prepareMigration(osInstance, omniProcessMap);
      if ('savedSessionData' in prepared) {
        preparedSessions.push(prepared);
      } else {
        uploadInfo.set(prepared.referenceId, prepared);
      }
    }

    if (preparedSessions.length === 0) return;

    let createResults: Map<string, UploadRecordResult>;
    try {
      createResults = await NetUtils.create(
        this.connection,
        Constants.OmniScriptSavedSessionObjectName,
        preparedSessions.map((session) => session.savedSessionData)
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      for (const session of preparedSessions) {
        const msg = this.messages.getMessage('ossCreateOssError', [session.osInstanceName, errorMsg]);
        Logger.error(msg);
        uploadInfo.set(session.osInstanceId, this.createUploadResult(session, '', [msg]));
      }
      return;
    }

    const successfulSessions: CreatedSession[] = [];
    for (const session of preparedSessions) {
      const createResult = createResults.get(session.osInstanceId);
      const errors: string[] = [];
      const recordId = createResult?.id ?? '';
      if (
        !createResult ||
        createResult.success === false ||
        createResult.hasErrors ||
        createResult.errors?.length > 0 ||
        recordId === ''
      ) {
        const errMsg = this.messages.getMessage('ossCreateOssFailure', [
          session.osInstanceName,
          JSON.stringify(createResult),
        ]);
        Logger.error(errMsg);
        errors.push(errMsg);
        const skipMsg = this.messages.getMessage('ossSkipAttachmentUpload', [session.osInstanceName]);
        Logger.error(skipMsg);
        errors.push(skipMsg);
      } else {
        Logger.logVerbose(this.messages.getMessage('ossCreateOssSuccess', [recordId]));
        successfulSessions.push({ ...session, recordId });
      }
      uploadInfo.set(session.osInstanceId, this.createUploadResult(session, recordId, errors));
    }

    if (successfulSessions.length === 0) return;

    const updateRecords = successfulSessions.map((session) =>
      Object.assign({}, session.savedSessionData, {
        attributes: { type: Constants.OmniScriptSavedSessionObjectName },
        Id: session.recordId,
        ResumeUrl: this.replaceResumeSessionUrl(
          String(session.savedSessionData['ResumeUrl'] ?? ''),
          session.osType,
          session.osSubType,
          session.osLanguage,
          session.recordId
        ),
        RelativeResumeUrl: this.replaceResumeSessionUrl(
          String(session.savedSessionData['RelativeResumeUrl'] ?? ''),
          session.osType,
          session.osSubType,
          session.osLanguage,
          session.recordId
        ),
      })
    );

    try {
      const updateResults = await NetUtils.update(this.connection, updateRecords);
      for (const session of successfulSessions) {
        const updateResult = updateResults.get(session.recordId);
        if (!updateResult || !updateResult.success || updateResult.hasErrors) {
          this.addError(
            uploadInfo,
            session.osInstanceId,
            this.messages.getMessage('ossUpdateOssFailure', [session.osInstanceName, JSON.stringify(updateResult)])
          );
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      for (const session of successfulSessions) {
        this.addError(
          uploadInfo,
          session.osInstanceId,
          this.messages.getMessage('ossUpdateOssError', [session.osInstanceName, errorMsg])
        );
      }
    }

    const attachmentRecords: AnyJson[] = [];
    const attachmentOwners = new Map<string, { session: CreatedSession; attachmentName: string }>();
    for (const session of successfulSessions) {
      const attachments = await this.queryAttachments(session.osInstanceId);
      Logger.log(this.messages.getMessage('ossFoundAttachments', [attachments.length, session.osInstanceId]));
      const downloads = await this.downloadAttachments(attachments);
      if (downloads.length > 0) {
        Logger.logVerbose(
          this.messages.getMessage('ossAttachmentUploadStart', [downloads.length, session.osInstanceName])
        );
      }
      for (const attachment of downloads) {
        if (attachment.errors.length > 0) {
          attachment.errors.forEach((error) => this.addError(uploadInfo, session.osInstanceId, error));
          continue;
        }
        const referenceId = `${session.osInstanceId}_${attachment.id}`;
        attachmentOwners.set(referenceId, { session, attachmentName: attachment.name });
        const attachmentRecord: AnyJson = {
          attributes: { type: Constants.AttachmentObjectName, referenceId },
          ParentId: session.recordId,
          Name: attachment.name,
          Body: attachment.body,
        };
        if (attachment.contentType) attachmentRecord['ContentType'] = attachment.contentType;
        attachmentRecords.push(attachmentRecord);
      }
    }

    if (attachmentRecords.length === 0) return;

    let attachmentBatch: AnyJson[] = [];
    let attachmentBatchBytes = ATTACHMENT_REQUEST_ENVELOPE_BYTE_LENGTH;

    const recordAttachmentResult = (attachment: AnyJson, result?: UploadRecordResult): void => {
      const attachmentId = String((attachment['attributes'] as AnyJson)['referenceId']);
      const owner = attachmentOwners.get(attachmentId);
      if (!owner) return;
      if (!result || result.success === false || result.hasErrors || result.errors?.length > 0 || !result.id) {
        const errorMsg = this.messages.getMessage('ossAttachmentUploadFailed', [
          owner.attachmentName,
          JSON.stringify(result?.errors),
        ]);
        Logger.warn(errorMsg);
        this.addError(uploadInfo, owner.session.osInstanceId, errorMsg);
      } else {
        Logger.logVerbose(this.messages.getMessage('ossAttachmentUploadSuccess', [String(attachment['Name'] ?? '')]));
      }
    };

    const flushAttachmentBatch = async (): Promise<void> => {
      if (attachmentBatch.length === 0) return;
      const batch = attachmentBatch;
      attachmentBatch = [];
      attachmentBatchBytes = ATTACHMENT_REQUEST_ENVELOPE_BYTE_LENGTH;
      try {
        const attachmentResults = await NetUtils.create(this.connection, Constants.AttachmentObjectName, batch);
        for (const attachment of batch) {
          const attachmentId = String((attachment['attributes'] as AnyJson)['referenceId']);
          recordAttachmentResult(attachment, attachmentResults.get(attachmentId));
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        for (const attachment of batch) {
          const attachmentId = String((attachment['attributes'] as AnyJson)['referenceId']);
          const owner = attachmentOwners.get(attachmentId);
          if (owner) {
            this.addError(
              uploadInfo,
              owner.session.osInstanceId,
              this.messages.getMessage('ossAttachmentUploadError', [owner.attachmentName, errorMsg])
            );
          }
        }
      }
    };

    for (const attachment of attachmentRecords) {
      const attachmentId = String((attachment['attributes'] as AnyJson)['referenceId']);
      const recordBytes = Buffer.byteLength(JSON.stringify(attachment), 'utf8');
      const singleRecordBytes = ATTACHMENT_REQUEST_ENVELOPE_BYTE_LENGTH + recordBytes;
      if (singleRecordBytes > ATTACHMENT_REQUEST_BODY_BYTE_LIMIT) {
        await flushAttachmentBatch();
        const attachmentData = { ...(attachment as Record<string, unknown>) };
        delete attachmentData.attributes;
        const result = await NetUtils.createOne(
          this.connection,
          Constants.AttachmentObjectName,
          attachmentId,
          attachmentData
        );
        recordAttachmentResult(attachment, result);
        continue;
      }

      const separatorBytes = attachmentBatch.length === 0 ? 0 : 1;
      if (
        attachmentBatch.length === SOURCE_CHUNK_SIZE ||
        attachmentBatchBytes + separatorBytes + recordBytes > ATTACHMENT_REQUEST_BODY_BYTE_LIMIT
      ) {
        await flushAttachmentBatch();
      }
      attachmentBatch.push(attachment);
      attachmentBatchBytes += (attachmentBatch.length === 1 ? 0 : 1) + recordBytes;
    }
    await flushAttachmentBatch();
  }

  private createUploadResult(session: PreparedSession, id: string, errors: string[]): UploadRecordResult {
    return {
      referenceId: session.osInstanceId,
      id,
      success: errors.length === 0,
      hasErrors: errors.length > 0,
      errors,
      warnings: [],
      newName: session.osInstanceName,
      skipped: false,
    };
  }

  private addError(uploadInfo: Map<string, UploadRecordResult>, referenceId: string, error: string): void {
    const result = uploadInfo.get(referenceId);
    if (result) {
      result.errors.push(error);
      result.success = false;
      result.hasErrors = true;
    }
  }

  private replaceResumeSessionUrl(
    url: string,
    osType: string,
    osSubType: string,
    osLanguage: string,
    osInstanceId: string
  ): string {
    let updatedUrl: string = url;

    // not a real url
    const urlHostTemp = 'https://migrationtool.omnistudio.salesforce.com';
    let urlObj: URL;

    if (this.isAbsoluteUrl(updatedUrl)) {
      urlObj = new URL(updatedUrl);
    } else {
      // relative url requires a temporary host
      urlObj = new URL(updatedUrl, urlHostTemp);
    }

    urlObj.searchParams.set('c__InstanceId', osInstanceId);
    urlObj.searchParams.set('omniscript__type', osType);
    urlObj.searchParams.set('omniscript__subType', osSubType);
    urlObj.searchParams.set('omniscript__language', osLanguage);
    urlObj.searchParams.delete('c__target');

    // replace aura wrapper
    if (urlObj.pathname.indexOf('vlocityLWCOmniWrapper') > -1) {
      urlObj.pathname = '/lightning/page/omnistudio/omniscript';
    }

    if (urlObj.origin === urlHostTemp) {
      updatedUrl = urlObj.pathname + urlObj.search;
    } else {
      updatedUrl = urlObj.toString();
    }

    return updatedUrl;
  }

  private isAbsoluteUrl(urlString: string): boolean {
    try {
      new URL(urlString);
      return true; // If no error, it's absolute
    } catch {
      return false; // If error, it's relative or invalid
    }
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

  /**
   * Checks if Omniscript Saved Session has the standard field, ManagedPackageSessKey
   * if true, 264+
   * if false 262 and before
   *
   * @returns true or false
   */
  private async hasStandardFieldPackageSavedSessionId(): Promise<boolean> {
    const fields = ['Name', '	ManagedPkgSessKey'];
    /**
     * SELECT Name, ManagedPkgSessKey FROM OmniscriptSavedSession LIMIT 1
     */
    const queryString = `SELECT ${fields.join(',')} 
                        FROM ${Constants.OmniScriptSavedSessionObjectName} 
                        LIMIT 1`;

    try {
      await QueryTools.queryCustom(this.connection, queryString);
      return true;
    } catch (err: unknown) {
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

    for (const attachment of attachments) {
      const errors: string[] = [];
      const attachmentId = String(attachment['Id'] ?? '');
      const attachmentName = String(attachment['Name'] ?? '');
      const contentType = String(attachment['ContentType'] ?? '');
      const path = String(attachment['Body'] ?? '');
      let body = '';

      try {
        const raw = await this.connection.request<string | Buffer>({
          method: 'GET',
          url: path,
        });

        if (Buffer.isBuffer(raw)) {
          body = raw.toString('base64');
        } else if (typeof raw === 'string') {
          // jsforce exposes binary response strings using the binary (latin1) encoding.
          body = Buffer.from(raw, 'binary').toString('base64');
        }

        Logger.logVerbose(this.messages.getMessage('ossAttachmentDownloadSuccess', [attachmentId, body.length]));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const msg = this.messages.getMessage('ossAttachmentDownloadFailed', [path, JSON.stringify(errorMsg)]);
        Logger.error(msg);
        errors.push(msg);
      }

      results.push({
        id: attachmentId,
        name: attachmentName,
        contentType,
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

interface PreparedSession {
  osInstanceId: string;
  osInstanceName: string;
  osType: string;
  osSubType: string;
  osLanguage: string;
  savedSessionData: AnyJson;
}

interface CreatedSession extends PreparedSession {
  recordId: string;
}

interface AttachmentDownloadResult {
  id: string;
  name: string;
  contentType: string;
  body: string;
  originalPath: string;
  errors: string[];
}
