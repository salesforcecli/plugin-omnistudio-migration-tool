/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';

import OmniScriptInstanceMappings from '../mappings/OmniScriptInstance';
import { QueryTools } from '../utils';
import { BaseMigrationTool, ComponentType } from './base';
import {
  InvalidEntityTypeError,
  MigrationResult,
  MigrationTool,
  ObjectMapping,
  UploadRecordResult,
} from './interfaces';
import { NetUtils, RequestMethod } from '../utils/net';
import { Logger } from '../utils/logger';
import { createProgressBar } from './base';
import { isStandardDataModel, isStandardDataModelWithMetadataAPIEnabled } from '../utils/dataModelService';
import { SaveForLaterAssessmentInfo } from '../utils/interfaces';

export class OmniScriptInstanceMigrationTool extends BaseMigrationTool implements MigrationTool {
  private readonly IS_STANDARD_DATA_MODEL: boolean = isStandardDataModel();

  // Source Custom Object Names
  static readonly OMNISCRIPTINSTANCE_NAME = 'OmniScriptInstance__c';

  // Target Standard Objects Name
  static readonly OMNISCRIPTSAVEDSESSION_NAME = 'OmniScriptSavedSession';

  // Required attachment file names
  private readonly REQUIRED_ATTACHMENT_NAMES = [
    'OmniScriptFullJSON.json',
    'OmniScriptDataJSON.json',
    'OmniScriptFilesMap.json',
  ];

  constructor(namespace: string, connection: Connection, logger: Logger, messages: Messages<string>, ux: Ux) {
    super(namespace, connection, logger, messages, ux);
  }

  getName(): string {
    return 'OmniScript Saved Sessions';
  }

  getRecordName(record: string): string {
    return record['Name'] || record['Id'];
  }

  getMappings(): ObjectMapping[] {
    return [
      {
        source: OmniScriptInstanceMigrationTool.OMNISCRIPTINSTANCE_NAME,
        target: OmniScriptInstanceMigrationTool.OMNISCRIPTSAVEDSESSION_NAME,
      },
    ];
  }

  async truncate(): Promise<void> {
    // Truncation is needed when we migrate from custom to standard data model
    // For custom data model, no truncation is required
    if (this.IS_STANDARD_DATA_MODEL) {
      Logger.logVerbose(this.messages.getMessage('skippingTruncation'));
      return;
    }

    // Delete ALL records from Core, just like OS, IP, and DM do
    // This ensures a clean migration state
    await super.truncate(OmniScriptInstanceMigrationTool.OMNISCRIPTSAVEDSESSION_NAME);
  }

  /**
   * Assess Save for Later instances for migration readiness
   * Checks dependencies on OmniScript migration status
   */
  public async assess(omniAssessmentInfos?: {
    osAssessmentInfos: any[];
    ipAssessmentInfos: any[];
  }): Promise<SaveForLaterAssessmentInfo[]> {
    try {
      if (isStandardDataModelWithMetadataAPIEnabled()) {
        return [];
      }

      // Skip if Foundation Package (uses same object name as Core)
      if (this.isFoundationPackage()) {
        Logger.logVerbose('Skipping Save for Later assessment for Foundation Package');
        return [];
      }

      Logger.log(this.messages.getMessage('startingOmniScriptAssessment', ['OmniScript Saved Sessions']));

      const packageInstances = await this.queryPackageInstances();
      Logger.log(
        this.messages.getMessage('foundOmniScriptsToAssess', [packageInstances.length, 'OmniScript Saved Sessions'])
      );

      if (packageInstances.length === 0) {
        return [];
      }

      // Create a map of migrated OmniScript IDs for quick lookup
      const migratedOmniScriptIds = new Set<string>();
      if (omniAssessmentInfos) {
        // Collect all successfully migrated OmniScript IDs
        omniAssessmentInfos.osAssessmentInfos.forEach((info) => {
          if (info.migrationStatus === 'Ready for migration' || info.migrationStatus === 'Complete') {
            migratedOmniScriptIds.add(info.id);
          }
        });
        omniAssessmentInfos.ipAssessmentInfos.forEach((info) => {
          if (info.migrationStatus === 'Ready for migration' || info.migrationStatus === 'Complete') {
            migratedOmniScriptIds.add(info.id);
          }
        });
      }

      const progressBar = createProgressBar('Assessing', this.getName() as ComponentType);
      progressBar.start(packageInstances.length, 0);

      const assessmentInfos: SaveForLaterAssessmentInfo[] = [];
      let progressCounter = 0;

      for (const packageInstance of packageInstances) {
        try {
          const packageInstanceId = packageInstance['Id'];
          const packageOmniScriptId = this.getPackageFieldValue(packageInstance, 'OmniScriptId__c');
          const status = this.getPackageFieldValue(packageInstance, 'Status__c') || '';
          const lastSaved = this.getPackageFieldValue(packageInstance, 'LastSaved__c') || '';
          const name = packageInstance['Name'] || '';

          // Get OmniScript name for display
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
            // Check if OmniScript is migrated
            if (migratedOmniScriptIds.has(packageOmniScriptId)) {
              omniScriptMigrationStatus = 'Complete';
            } else if (omniAssessmentInfos) {
              // Check assessment status
              const osInfo = omniAssessmentInfos.osAssessmentInfos.find((info) => info.id === packageOmniScriptId);
              const ipInfo = omniAssessmentInfos.ipAssessmentInfos.find((info) => info.id === packageOmniScriptId);
              const info = osInfo || ipInfo;
              if (info) {
                omniScriptName = info.oldName || info.name || '';
                omniScriptMigrationStatus = info.migrationStatus;
              } else {
                // OmniScript not found in assessment - might not be assessed yet
                omniScriptMigrationStatus = 'Skipped';
              }
            }

            // Query OmniScript name if not found
            if (!omniScriptName && packageOmniScriptId) {
              try {
                const omniScriptQuery = `SELECT Id, Name FROM ${this.getOmniScriptObjectName()} WHERE Id = '${packageOmniScriptId}' LIMIT 1`;
                const omniScriptResult = await this.connection.query(omniScriptQuery);
                if (omniScriptResult.records && omniScriptResult.records.length > 0) {
                  omniScriptName = omniScriptResult.records[0]['Name'] || '';
                }
              } catch (error) {
                Logger.logVerbose(`Error querying OmniScript ${packageOmniScriptId}: ${error}`);
              }
            }
          }

          // Determine migration status
          let migrationStatus: 'Ready for migration' | 'Failed' | 'Skipped' | 'Needs manual intervention' | 'Warnings' =
            'Ready for migration';
          const warnings: string[] = [];
          const errors: string[] = [];
          const infos: string[] = [];

          if (!packageOmniScriptId) {
            migrationStatus = 'Needs manual intervention';
            errors.push('Missing OmniScriptId__c');
          } else if (!omniScriptMigrationStatus || omniScriptMigrationStatus === 'Skipped') {
            migrationStatus = 'Needs manual intervention';
            warnings.push(`OmniScript ${packageOmniScriptId} not assessed or not found`);
          } else if (
            omniScriptMigrationStatus === 'Needs manual intervention' ||
            omniScriptMigrationStatus === 'Failed'
          ) {
            migrationStatus = 'Needs manual intervention';
            warnings.push(`Dependent OmniScript has status: ${omniScriptMigrationStatus}`);
          } else if (omniScriptMigrationStatus === 'Warnings') {
            migrationStatus = 'Warnings';
            warnings.push(`Dependent OmniScript has warnings`);
          } else if (omniScriptMigrationStatus === 'Complete' || omniScriptMigrationStatus === 'Ready for migration') {
            migrationStatus = 'Ready for migration';
            infos.push('Dependent OmniScript is ready for migration');
          }

          assessmentInfos.push({
            id: packageInstanceId,
            name: name,
            oldName: name,
            omniScriptId: packageOmniScriptId || '',
            omniScriptName: omniScriptName,
            status: status,
            lastSaved: lastSaved,
            migrationStatus: migrationStatus,
            infos: infos,
            warnings: warnings,
            errors: errors,
            omniScriptMigrationStatus: omniScriptMigrationStatus,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          Logger.error(`Error assessing instance ${packageInstance['Id']}:`, error);
          assessmentInfos.push({
            id: packageInstance['Id'],
            name: packageInstance['Name'] || '',
            oldName: packageInstance['Name'] || '',
            omniScriptId: this.getPackageFieldValue(packageInstance, 'OmniScriptId__c') || '',
            omniScriptName: '',
            status: this.getPackageFieldValue(packageInstance, 'Status__c') || '',
            lastSaved: this.getPackageFieldValue(packageInstance, 'LastSaved__c') || '',
            migrationStatus: 'Failed',
            infos: [],
            warnings: [],
            errors: [errorMsg],
          });
        }

        progressBar.update(++progressCounter);
      }

      progressBar.stop();

      Logger.log(
        this.messages.getMessage('assessedOmniScriptsCount', [assessmentInfos.length, 'OmniScript Saved Sessions'])
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

  async migrate(): Promise<MigrationResult[]> {
    if (isStandardDataModelWithMetadataAPIEnabled()) {
      return [
        {
          name: this.getName(),
          results: new Map<string, UploadRecordResult>(),
          records: new Map<string, any>(),
        },
      ];
    }

    // Skip if Foundation Package (uses same object name as Core)
    if (this.isFoundationPackage()) {
      Logger.logVerbose('Skipping Save for Later migration for Foundation Package');
      return [
        {
          name: this.getName(),
          results: new Map<string, UploadRecordResult>(),
          records: new Map<string, any>(),
        },
      ];
    }

    const packageInstances = await this.queryPackageInstances();

    if (packageInstances.length === 0) {
      Logger.log('No package instances found to migrate');
      return [
        {
          name: this.getName(),
          results: new Map<string, UploadRecordResult>(),
          records: new Map<string, any>(),
        },
      ];
    }

    Logger.log(`Found ${packageInstances.length} instances to migrate`);

    const progressBar = createProgressBar('Migrating', this.getName() as ComponentType);
    progressBar.start(packageInstances.length, 0);

    const results = new Map<string, UploadRecordResult>();
    const originalRecords = new Map<string, any>();
    let progressCounter = 0;

    for (const packageInstance of packageInstances) {
      try {
        const packageInstanceId = packageInstance['Id'];
        originalRecords.set(packageInstanceId, packageInstance);

        // Get Package OmniScript ID using mappings
        const packageOmniScriptId = this.getPackageOmniScriptId(packageInstance);
        if (!packageOmniScriptId) {
          Logger.logVerbose(`Skipping instance ${packageInstanceId} - missing OmniScriptId__c`);
          results.set(packageInstanceId, {
            referenceId: packageInstanceId,
            id: '',
            success: false,
            hasErrors: true,
            errors: ['Missing OmniScriptId__c'],
            warnings: [],
          });
          progressBar.update(++progressCounter);
          continue;
        }

        // Lookup Core OmniProcess ID using NameMappingRegistry
        const coreOmniProcessId = await this.getCoreOmniProcessId(packageOmniScriptId);
        if (!coreOmniProcessId) {
          Logger.logVerbose(
            `Skipping instance ${packageInstanceId} - OmniScript ${packageOmniScriptId} not migrated yet`
          );
          results.set(packageInstanceId, {
            referenceId: packageInstanceId,
            id: '',
            success: false,
            hasErrors: true,
            errors: [`OmniScript ${packageOmniScriptId} not migrated to Core`],
            warnings: [],
          });
          progressBar.update(++progressCounter);
          continue;
        }

        // Query package attachments
        const packageAttachments = await this.queryPackageAttachments(packageInstanceId);

        // Map and create Core instance
        const coreInstanceData = this.mapPackageInstanceToCore(packageInstance, coreOmniProcessId, packageInstanceId);

        // Create Core instance
        const createResult = await NetUtils.createOne(
          this.connection,
          OmniScriptInstanceMigrationTool.OMNISCRIPTSAVEDSESSION_NAME,
          packageInstanceId,
          coreInstanceData
        );

        if (!createResult?.success || !createResult?.id) {
          results.set(packageInstanceId, {
            referenceId: packageInstanceId,
            id: '',
            success: false,
            hasErrors: true,
            errors: createResult?.errors || ['Failed to create Core instance'],
            warnings: createResult?.warnings || [],
          });
          progressBar.update(++progressCounter);
          continue;
        }

        const coreInstanceId = createResult.id;

        // Update URLs with new instance ID
        await this.updateCoreInstanceUrls(coreInstanceId, packageInstance, coreOmniProcessId);

        // Transform and migrate attachments
        await this.migrateAttachments(
          packageAttachments,
          packageInstance,
          coreInstanceId,
          coreOmniProcessId,
          packageInstanceId
        );

        results.set(packageInstanceId, {
          referenceId: packageInstanceId,
          id: coreInstanceId,
          success: true,
          hasErrors: false,
          errors: [],
          warnings: createResult.warnings || [],
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Logger.error(`Error migrating instance ${packageInstance['Id']}:`, error);
        results.set(packageInstance['Id'], {
          referenceId: packageInstance['Id'],
          id: '',
          success: false,
          hasErrors: true,
          errors: [errorMsg],
          warnings: [],
        });
      }

      progressBar.update(++progressCounter);
    }

    progressBar.stop();

    return [
      {
        name: this.getName(),
        results,
        records: originalRecords,
      },
    ];
  }

  /**
   * Check if this is Foundation Package
   */
  private isFoundationPackage(): boolean {
    // Foundation package uses OmniScriptSavedSession, not OmniScriptInstance__c
    // We check this by attempting to query the package object
    // If OmniScriptInstance__c doesn't exist, it might be Foundation
    // Default to non-Foundation, will be handled by query errors in queryPackageInstances
    return false;
  }

  /**
   * Query Package instances using QueryTools pattern
   * Uses mappings to determine which fields to query
   */
  private async queryPackageInstances(): Promise<AnyJson[]> {
    const fields = this.getQueryFields();

    const filters = new Map<string, any>();
    // Only migrate 'In Progress' sessions
    filters.set(this.getFieldKey('Status__c'), 'In Progress');

    try {
      return await QueryTools.queryWithFilter(
        this.connection,
        this.getQueryNamespace(),
        OmniScriptInstanceMigrationTool.OMNISCRIPTINSTANCE_NAME,
        fields,
        filters
      );
    } catch (err: any) {
      if (err.errorCode === 'INVALID_TYPE') {
        throw new InvalidEntityTypeError(
          `${OmniScriptInstanceMigrationTool.OMNISCRIPTINSTANCE_NAME} type is not found under this namespace`
        );
      }
      throw err;
    }
  }

  /**
   * Query Package attachments for an instance
   */
  private async queryPackageAttachments(packageInstanceId: string): Promise<Map<string, any>> {
    const query = `SELECT Id, Name, Body, ContentType, ParentId, BodyLength, Description, OwnerId, IsPrivate
                  FROM Attachment
                  WHERE ParentId = '${packageInstanceId}'
                  AND Name IN ('${this.REQUIRED_ATTACHMENT_NAMES.join("', '")}')`;

    const result = await this.connection.query(query);
    const attachmentsMap = new Map<string, any>();

    // Initialize with empty placeholders
    this.REQUIRED_ATTACHMENT_NAMES.forEach((fileName) => {
      attachmentsMap.set(fileName, {
        Name: fileName,
        Body: null,
        ContentType: 'application/json',
        Id: null,
      });
    });

    // Populate with actual attachments
    if (result.records) {
      result.records.forEach((att: any) => {
        attachmentsMap.set(att.Name, att);
      });
    }

    return attachmentsMap;
  }

  /**
   * Get Package OmniScript ID from instance using mappings
   */
  private getPackageOmniScriptId(packageInstance: AnyJson): string {
    return this.getPackageFieldValue(packageInstance, 'OmniScriptId__c') || '';
  }

  /**
   * Get Core OmniProcess ID from Package OmniScript ID
   * Queries the Package OmniScript to get its Type/SubType/Language,
   * then finds the corresponding Core OmniProcess using cleaned names from NameMappingRegistry
   */
  private async getCoreOmniProcessId(packageOmniScriptId: string): Promise<string | null> {
    try {
      // Query Package OmniScript to get Type, SubType, Language
      const packageOmniScriptQuery = `SELECT Id, ${this.getOmniScriptFieldKey('Type__c')}, ${this.getOmniScriptFieldKey(
        'SubType__c'
      )}, ${this.getOmniScriptFieldKey('Language__c')}
                                      FROM ${this.getOmniScriptObjectName()}
                                      WHERE Id = '${packageOmniScriptId}' LIMIT 1`;

      const packageResult = await this.connection.query(packageOmniScriptQuery);
      if (!packageResult.records || packageResult.records.length === 0) {
        Logger.logVerbose(`Package OmniScript ${packageOmniScriptId} not found`);
        return null;
      }

      const packageOmniScript = packageResult.records[0];
      const originalType = packageOmniScript[this.getOmniScriptFieldKey('Type__c')] || '';
      const originalSubType = packageOmniScript[this.getOmniScriptFieldKey('SubType__c')] || '';
      const originalLanguage = packageOmniScript[this.getOmniScriptFieldKey('Language__c')] || 'English';

      // Build original name (Type_SubType_Language format)
      const originalName = `${originalType}_${originalSubType}_${originalLanguage}`;

      // Get cleaned name from NameMappingRegistry
      let cleanedType = originalType;
      let cleanedSubType = originalSubType;
      let cleanedLanguage = originalLanguage;

      if (this.nameRegistry.hasOmniScriptMapping(originalName)) {
        const cleanedName = this.nameRegistry.getCleanedName(originalName, 'OmniScript');
        const parts = cleanedName.split('_');
        if (parts.length >= 2) {
          cleanedType = parts[0];
          cleanedSubType = parts[1];
          if (parts.length >= 3) {
            cleanedLanguage = parts[2];
          }
        }
      } else {
        // Fallback: clean names directly
        cleanedType = this.cleanName(originalType);
        cleanedSubType = this.cleanName(originalSubType);
      }

      // Query Core OmniProcess by cleaned Type, SubType, Language
      const coreOmniProcessQuery = `SELECT Id FROM OmniProcess
                                    WHERE Type = '${cleanedType}'
                                    AND SubType = '${cleanedSubType}'
                                    AND Language = '${cleanedLanguage}'
                                    AND IsIntegrationProcedure = false
                                    LIMIT 1`;

      const coreResult = await this.connection.query(coreOmniProcessQuery);
      if (coreResult.records && coreResult.records.length > 0) {
        return coreResult.records[0].Id;
      }

      Logger.logVerbose(
        `Core OmniProcess not found for Package OmniScript ${packageOmniScriptId} (${originalName} -> ${cleanedType}_${cleanedSubType}_${cleanedLanguage})`
      );
      return null;
    } catch (error) {
      Logger.error(`Error getting Core OmniProcess ID for ${packageOmniScriptId}:`, error);
      return null;
    }
  }

  /**
   * Get OmniScript field key with namespace
   */
  private getOmniScriptFieldKey(fieldName: string): string {
    // For standard data model, use Core field names (Type, SubType, Language)
    // For custom data model, use package field names with namespace (Type__c, SubType__c, Language__c)
    if (this.IS_STANDARD_DATA_MODEL) {
      // Map package field names to Core field names
      const fieldMap: { [key: string]: string } = {
        Type__c: 'Type',
        SubType__c: 'SubType',
        Language__c: 'Language',
      };
      return fieldMap[fieldName] || fieldName;
    }
    return this.namespacePrefix + fieldName;
  }

  /**
   * Get OmniScript object name
   */
  private getOmniScriptObjectName(): string {
    return this.IS_STANDARD_DATA_MODEL ? 'OmniProcess' : this.namespacePrefix + 'OmniScript__c';
  }

  /**
   * Map Package instance to Core instance
   */
  private mapPackageInstanceToCore(
    packageInstance: AnyJson,
    coreOmniProcessId: string,
    packageInstanceId: string
  ): AnyJson {
    const mappedObject: AnyJson = {};

    // Map fields using OmniScriptInstanceMappings
    const recordFields = Object.keys(packageInstance);

    // Fields that are read-only or formula fields in Core (populated from OmniScript lookup)
    const readonlyFields = new Set([
      'OmniScriptId__c', // Skip - we set OmniScript lookup separately
      'OmniScriptType__c', // Read-only - populated from OmniScript lookup
      'OmniScriptSubType__c', // Read-only - populated from OmniScript lookup
      'OmniScriptLanguage__c', // Read-only - populated from OmniScript lookup
      'OmniScriptVersion__c', // Read-only - populated from OmniScript lookup
      'IsLwcEnabled__c', // Read-only - populated from OmniScript lookup
    ]);

    recordFields.forEach((recordField) => {
      const cleanFieldName = this.getCleanFieldName(recordField);
      // Skip read-only fields that are automatically populated from OmniScript lookup
      if (readonlyFields.has(cleanFieldName)) {
        return;
      }
      if (OmniScriptInstanceMappings.hasOwnProperty(cleanFieldName)) {
        const coreFieldName = OmniScriptInstanceMappings[cleanFieldName];
        mappedObject[coreFieldName] = packageInstance[recordField];
      }
    });

    // Set OmniScript lookup (Core uses lookup field, not text field)
    mappedObject['OmniScript'] = coreOmniProcessId;

    // Also set OmniScriptId text field if it exists (mapped from OmniScriptId__c)
    // This is the text representation of the OmniScript ID
    mappedObject['OmniScriptId'] = coreOmniProcessId;

    // Store original package instance ID for redirect handling
    // This field must exist on the Core OmniScriptSavedSession object
    mappedObject['PackageSavedSessionId__c'] = packageInstanceId;

    // Update Name field to include new instance ID (will be set after creation)
    // For now, preserve the pattern
    mappedObject['Name'] = packageInstance['Name'] || `Preview-Saved-OmniScript-${packageInstanceId}`;

    // BATCH framework requires attributes
    mappedObject['attributes'] = {
      type: OmniScriptInstanceMigrationTool.OMNISCRIPTSAVEDSESSION_NAME,
      referenceId: packageInstanceId,
    };

    return mappedObject;
  }

  /**
   * Update Core instance URLs with new instance ID
   */
  private async updateCoreInstanceUrls(
    coreInstanceId: string,
    packageInstance: AnyJson,
    coreOmniProcessId: string
  ): Promise<void> {
    // Build new Core URLs
    const resumeUrl = this.buildCoreResumeUrl(coreInstanceId, packageInstance, coreOmniProcessId);
    const relativeResumeUrl = this.buildCoreRelativeResumeUrl(coreInstanceId, packageInstance, coreOmniProcessId);

    // Update the Core instance with new URLs
    await NetUtils.request(
      this.connection,
      `sobjects/${OmniScriptInstanceMigrationTool.OMNISCRIPTSAVEDSESSION_NAME}/${coreInstanceId}`,
      {
        ResumeUrl: resumeUrl,
        RelativeResumeUrl: relativeResumeUrl,
      },
      RequestMethod.PATCH
    );
  }

  /**
   * Build Core ResumeUrl using mappings
   */
  private buildCoreResumeUrl(coreInstanceId: string, packageInstance: AnyJson, coreOmniProcessId: string): string {
    const type = this.getPackageFieldValue(packageInstance, 'OmniScriptType__c') || '';
    const subType = this.getPackageFieldValue(packageInstance, 'OmniScriptSubType__c') || '';
    const language = this.getPackageFieldValue(packageInstance, 'OmniScriptLanguage__c') || 'English';

    // Build Core builder preview URL
    const baseUrl = this.connection.instanceUrl;
    const urlPath = '/builder_omnistudio/omnistudioPreview.app';
    const params = new URLSearchParams({
      omniscriptId: coreOmniProcessId,
      language: language,
      type: type,
      subType: subType,
      id: coreOmniProcessId,
      sId: coreOmniProcessId,
      runMode: 'preview',
      theme: 'lightning',
      c__sfl: 'true',
      c__instanceId: coreInstanceId,
    });

    return `${baseUrl}${urlPath}?${params.toString()}`;
  }

  /**
   * Build Core RelativeResumeUrl (relative path without hostname) using mappings
   */
  private buildCoreRelativeResumeUrl(
    coreInstanceId: string,
    packageInstance: AnyJson,
    coreOmniProcessId: string
  ): string {
    const type = this.getPackageFieldValue(packageInstance, 'OmniScriptType__c') || '';
    const subType = this.getPackageFieldValue(packageInstance, 'OmniScriptSubType__c') || '';
    const language = this.getPackageFieldValue(packageInstance, 'OmniScriptLanguage__c') || 'English';

    // Build relative URL (without hostname)
    const urlPath = '/builder_omnistudio/omnistudioPreview.app';
    const params = new URLSearchParams({
      omniscriptId: coreOmniProcessId,
      language: language,
      type: type,
      subType: subType,
      id: coreOmniProcessId,
      sId: coreOmniProcessId,
      runMode: 'preview',
      theme: 'lightning',
      c__sfl: 'true',
      c__instanceId: coreInstanceId,
    });

    return `${urlPath}?${params.toString()}`;
  }

  /**
   * Migrate all attachments for an instance
   */
  private async migrateAttachments(
    packageAttachments: Map<string, any>,
    packageInstance: AnyJson,
    coreInstanceId: string,
    coreOmniProcessId: string,
    packageInstanceId: string
  ): Promise<void> {
    const isEncoded = this.getPackageFieldValue(packageInstance, 'IsContentEncoded__c') || false;

    // Migrate each attachment
    for (const [fileName, packageAttachment] of packageAttachments.entries()) {
      if (!packageAttachment || !packageAttachment.Id) {
        Logger.logVerbose(`Skipping ${fileName} - attachment not found`);
        continue;
      }

      try {
        // Fetch attachment body content
        const bodyContent = await this.fetchAttachmentBody(packageAttachment.Id);
        let jsonContent: any = {};

        // Parse JSON content
        try {
          let contentString = bodyContent.toString('utf-8');
          if (isEncoded) {
            try {
              contentString = Buffer.from(contentString, 'base64').toString('utf-8');
            } catch (e) {
              Logger.logVerbose(`Content not base64 encoded for ${packageAttachment.Id}`);
            }
          }
          jsonContent = JSON.parse(contentString);
        } catch (error) {
          Logger.error(`Error parsing ${fileName}:`, error);
          continue;
        }

        // Transform JSON content based on file type
        let transformedContent: any;
        switch (fileName) {
          case 'OmniScriptFullJSON.json':
            transformedContent = this.transformFullJSON(jsonContent, coreOmniProcessId, coreInstanceId);
            break;
          case 'OmniScriptDataJSON.json':
            transformedContent = this.transformDataJSON(jsonContent, coreOmniProcessId, coreInstanceId);
            break;
          case 'OmniScriptFilesMap.json':
            // Transform FilesMap: migrate file attachments and update IDs
            transformedContent = await this.transformFilesMap(jsonContent, packageInstanceId, coreInstanceId);
            break;
          default:
            transformedContent = jsonContent;
        }

        // Create Core attachment
        // Use compact JSON (no pretty-printing) to match original formatting and preserve BodyLength
        await this.createCoreAttachment(
          coreInstanceId,
          fileName,
          JSON.stringify(transformedContent),
          packageAttachment
        );
      } catch (error) {
        Logger.error(`Error migrating attachment ${fileName}:`, error);
        // Continue with other attachments
      }
    }
  }

  /**
   * Fetch attachment body content from Salesforce
   * Note: JSForce returns response as JSON object with 'data' property containing the body content
   */
  private async fetchAttachmentBody(attachmentId: string): Promise<Buffer> {
    const apiVersion = this.connection.getApiVersion();
    const url = `/services/data/v${apiVersion}/sobjects/Attachment/${attachmentId}/Body`;

    const response: any = await this.connection.request({
      method: 'GET',
      url: url,
    } as any);

    // Extract data from response - check multiple possible properties
    const data = response.data || response.body || response;

    if (!data) {
      throw new Error(`No data found in response for attachment ${attachmentId}`);
    }

    if (typeof data === 'string') {
      // String data - convert to Buffer
      return Buffer.from(data, 'utf-8');
    } else if (data instanceof Buffer) {
      // Already a Buffer
      return data;
    } else if (typeof data === 'object') {
      // Object data - stringify to JSON first, then convert to Buffer
      return Buffer.from(JSON.stringify(data), 'utf-8');
    } else {
      // Fallback: convert to string
      return Buffer.from(String(data), 'utf-8');
    }
  }

  /**
   * Create Core attachment
   */
  private async createCoreAttachment(
    coreInstanceId: string,
    fileName: string,
    content: string | Buffer,
    originalAttachment?: any
  ): Promise<string> {
    try {
      // Convert content to base64
      let bodyContent: string;
      if (content instanceof Buffer) {
        // Buffer - convert to base64
        bodyContent = content.toString('base64');
      } else if (typeof content === 'string') {
        // String - check if it's already base64-encoded
        // Base64 strings only contain A-Z, a-z, 0-9, +, /, and = (for padding)
        // They also have length that's a multiple of 4 (after removing whitespace)
        const trimmedContent = content.trim();
        const isBase64 = /^[A-Za-z0-9+/=]+$/.test(trimmedContent) && trimmedContent.length % 4 === 0;

        if (isBase64) {
          // Already base64 - use as-is
          bodyContent = trimmedContent;
        } else {
          // Not base64 - encode UTF-8 string to base64
          bodyContent = Buffer.from(content, 'utf-8').toString('base64');
        }
      } else {
        // Fallback: convert to string first, then encode to base64
        bodyContent = Buffer.from(String(content), 'utf-8').toString('base64');
      }

      const attachmentData: AnyJson = {
        attributes: {
          type: 'Attachment',
        },
        Name: fileName,
        Body: bodyContent,
        ContentType: originalAttachment?.ContentType || 'application/json',
        ParentId: coreInstanceId,
      };

      // Preserve Description if available
      if (originalAttachment?.Description) {
        attachmentData.Description = originalAttachment.Description;
      } else {
        attachmentData.Description = 'OmniScript reserved, please do not modify/delete.';
      }

      // Preserve OwnerId if same org (optional)
      if (originalAttachment?.OwnerId) {
        attachmentData.OwnerId = originalAttachment.OwnerId;
      }

      // Preserve IsPrivate setting
      if (originalAttachment?.IsPrivate !== undefined) {
        attachmentData.IsPrivate = originalAttachment.IsPrivate;
      }

      const result = await NetUtils.createOne(
        this.connection,
        'Attachment',
        `attachment_${coreInstanceId}_${fileName}`,
        attachmentData
      );

      if (result.success && result.id) {
        return result.id;
      } else {
        throw new Error(`Failed to create attachment ${fileName}: ${JSON.stringify(result.errors)}`);
      }
    } catch (error) {
      Logger.error(`Error creating attachment ${fileName}:`, error);
      throw error;
    }
  }

  /**
   * Transform FullJSON content
   */
  private transformFullJSON(fullJson: any, coreOmniProcessId: string, coreInstanceId: string): any {
    const transformed = JSON.parse(JSON.stringify(fullJson)); // Deep clone

    // Update root level IDs
    if (transformed.sOmniScriptId) {
      transformed.sOmniScriptId = coreOmniProcessId;
    }
    if (transformed.sInstanceId) {
      transformed.sInstanceId = coreInstanceId;
    }
    if (transformed.lwcId && typeof transformed.lwcId === 'string') {
      // Remove namespace prefix if present
      transformed.lwcId = transformed.lwcId.replace(/^[a-zA-Z0-9_]+__/, '');
    }

    // Update response object
    if (transformed.response) {
      if (transformed.response.omniscriptId) {
        transformed.response.omniscriptId = coreOmniProcessId;
      }
      if (transformed.response.sId) {
        transformed.response.sId = coreOmniProcessId;
      }
      if (transformed.response['Instance Id']) {
        transformed.response['Instance Id'] = coreInstanceId;
      }
      if (transformed.response.omniProcessId) {
        transformed.response.omniProcessId = coreOmniProcessId;
      }
    }

    // Update lwcVarMap
    if (transformed.lwcVarMap) {
      if (transformed.lwcVarMap.omniscriptId) {
        transformed.lwcVarMap.omniscriptId = coreOmniProcessId;
      }
      if (transformed.lwcVarMap.sId) {
        transformed.lwcVarMap.sId = coreOmniProcessId;
      }
      if (transformed.lwcVarMap.omniProcessId) {
        transformed.lwcVarMap.omniProcessId = coreOmniProcessId;
      }
    }

    // Update children array (recursively)
    if (transformed.children && Array.isArray(transformed.children)) {
      transformed.children = transformed.children.map((child: any) =>
        this.transformFullJSONChild(child, coreOmniProcessId)
      );
    }

    // Update persistentComponent
    if (transformed.propSetMap?.persistentComponent && Array.isArray(transformed.propSetMap.persistentComponent)) {
      transformed.propSetMap.persistentComponent = transformed.propSetMap.persistentComponent.map((pc: any) =>
        this.transformPersistentComponent(pc)
      );
    }

    // Transform customJavaScript - may contain component references
    if (transformed.customJavaScript && typeof transformed.customJavaScript === 'string') {
      // Use NameMappingRegistry to update any component references in custom JavaScript
      // This handles references to DataMappers, IPs, FlexCards, etc. in JavaScript code
      transformed.customJavaScript = this.nameRegistry.updateDependencyReferences(transformed.customJavaScript);
    }

    // Transform customHtmlTemplates - may contain component references
    if (transformed.customHtmlTemplates) {
      if (typeof transformed.customHtmlTemplates === 'string') {
        transformed.customHtmlTemplates = this.nameRegistry.updateDependencyReferences(transformed.customHtmlTemplates);
      } else if (typeof transformed.customHtmlTemplates === 'object') {
        // If it's an object, recursively update all string values
        transformed.customHtmlTemplates = this.nameRegistry.updateDependencyReferences(transformed.customHtmlTemplates);
      }
    }

    // Transform elementTypeComponentMapping - maps element types to component names
    if (transformed.elementTypeComponentMapping && typeof transformed.elementTypeComponentMapping === 'object') {
      // Update all component references in the mapping
      transformed.elementTypeComponentMapping = this.nameRegistry.updateDependencyReferences(
        transformed.elementTypeComponentMapping
      );
    }

    return transformed;
  }

  /**
   * Transform FullJSON child element
   * Uses NameMappingRegistry.updateDependencyReferences() to handle all component references
   * (DataMapper, Integration Procedure, FlexCard, OmniScript) automatically
   */
  private transformFullJSONChild(child: any, coreOmniProcessId: string): any {
    const transformed = JSON.parse(JSON.stringify(child)); // Deep clone

    // Update lwcId if present
    if (transformed.lwcId && typeof transformed.lwcId === 'string') {
      transformed.lwcId = transformed.lwcId.replace(/^[a-zA-Z0-9_]+__/, '');
    }

    // Update propSetMap using NameMappingRegistry to handle all dependencies
    // This automatically handles: DataMapper, Integration Procedure, FlexCard, OmniScript references
    if (transformed.propSetMap) {
      // Use NameMappingRegistry to update all dependency references recursively
      // This handles FlexCard, DataMapper, IP, and OS references automatically
      transformed.propSetMap = this.nameRegistry.updateDependencyReferences(transformed.propSetMap);

      // Handle OmniScript references (Type, Sub Type, Language) - needs special handling
      if (transformed.propSetMap.Type) {
        const osType = transformed.propSetMap.Type;
        const osSubType = transformed.propSetMap['Sub Type'] || '';
        const osLanguage = transformed.propSetMap.Language || 'English';
        const fullOmniScriptName = `${osType}_${osSubType}_${osLanguage}`;

        if (this.nameRegistry.isAngularOmniScript(fullOmniScriptName)) {
          // Keep original reference for Angular OmniScripts
        } else if (this.nameRegistry.hasOmniScriptMapping(fullOmniScriptName)) {
          const cleanedName = this.nameRegistry.getCleanedName(fullOmniScriptName, 'OmniScript');
          const parts = cleanedName.split('_');
          if (parts.length >= 2) {
            transformed.propSetMap.Type = parts[0];
            transformed.propSetMap['Sub Type'] = parts[1];
            if (parts.length >= 3) {
              transformed.propSetMap.Language = parts[2];
            }
          }
        } else {
          transformed.propSetMap.Type = this.cleanName(osType);
          transformed.propSetMap['Sub Type'] = this.cleanName(osSubType);
        }
      }

      // Handle Integration Procedure method references
      if (transformed.propSetMap.ipMethod) {
        const ipKey = transformed.propSetMap.ipMethod;
        if (this.nameRegistry.hasIntegrationProcedureMapping(ipKey)) {
          transformed.propSetMap.ipMethod = this.nameRegistry.getIntegrationProcedureCleanedName(ipKey);
        } else {
          // Clean each part of the IP key (Type_SubType_Language format)
          const parts = ipKey.split('_');
          transformed.propSetMap.ipMethod = parts.map((p) => this.cleanName(p, true)).join('_');
        }
      }

      // Handle preIP (pre-Integration Procedure)
      if (transformed.propSetMap.preIP) {
        const preIPKey = transformed.propSetMap.preIP;
        if (this.nameRegistry.hasIntegrationProcedureMapping(preIPKey)) {
          transformed.propSetMap.preIP = this.nameRegistry.getIntegrationProcedureCleanedName(preIPKey);
        } else {
          const parts = preIPKey.split('_');
          transformed.propSetMap.preIP = parts.map((p) => this.cleanName(p, true)).join('_');
        }
      }

      // Handle postIP (post-Integration Procedure)
      if (transformed.propSetMap.postIP) {
        const postIPKey = transformed.propSetMap.postIP;
        if (this.nameRegistry.hasIntegrationProcedureMapping(postIPKey)) {
          transformed.propSetMap.postIP = this.nameRegistry.getIntegrationProcedureCleanedName(postIPKey);
        } else {
          const parts = postIPKey.split('_');
          transformed.propSetMap.postIP = parts.map((p) => this.cleanName(p, true)).join('_');
        }
      }

      // Handle remoteOptions explicitly (verify it's handled by updateDependencyReferences)
      // updateDependencyReferences should handle remoteOptions, but we verify and handle explicitly if needed
      if (transformed.propSetMap.remoteOptions) {
        // Ensure remoteOptions is processed by updateDependencyReferences
        // If it wasn't processed, handle it explicitly
        if (transformed.propSetMap.remoteOptions.preTransformBundle) {
          const bundleName = transformed.propSetMap.remoteOptions.preTransformBundle;
          if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
            transformed.propSetMap.remoteOptions.preTransformBundle =
              this.nameRegistry.getDataMapperCleanedName(bundleName);
          } else {
            transformed.propSetMap.remoteOptions.preTransformBundle = this.cleanName(bundleName);
          }
        }
        if (transformed.propSetMap.remoteOptions.postTransformBundle) {
          const bundleName = transformed.propSetMap.remoteOptions.postTransformBundle;
          if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
            transformed.propSetMap.remoteOptions.postTransformBundle =
              this.nameRegistry.getDataMapperCleanedName(bundleName);
          } else {
            transformed.propSetMap.remoteOptions.postTransformBundle = this.cleanName(bundleName);
          }
        }
        // Handle remoteClass and remoteMethod in remoteOptions
        if (transformed.propSetMap.remoteOptions.remoteClass) {
          transformed.propSetMap.remoteOptions.remoteClass = this.cleanName(
            transformed.propSetMap.remoteOptions.remoteClass
          );
        }
        if (transformed.propSetMap.remoteOptions.remoteMethod) {
          transformed.propSetMap.remoteOptions.remoteMethod = this.cleanName(
            transformed.propSetMap.remoteOptions.remoteMethod
          );
        }
      }

      // Handle remoteClass and remoteMethod (Apex classes)
      if (transformed.propSetMap.remoteClass) {
        transformed.propSetMap.remoteClass = this.cleanName(transformed.propSetMap.remoteClass);
      }
      if (transformed.propSetMap.remoteMethod) {
        transformed.propSetMap.remoteMethod = this.cleanName(transformed.propSetMap.remoteMethod);
      }
    }

    // Recursively transform nested children
    if (transformed.children && Array.isArray(transformed.children)) {
      transformed.children = transformed.children.map((nestedChild: any) => {
        if (nestedChild.eleArray && Array.isArray(nestedChild.eleArray)) {
          nestedChild.eleArray = nestedChild.eleArray.map((element: any) => {
            if (element.lwcId && typeof element.lwcId === 'string') {
              element.lwcId = element.lwcId.replace(/^[a-zA-Z0-9_]+__/, '');
            }
            return element;
          });
        }
        return nestedChild;
      });
    }

    return transformed;
  }

  /**
   * Transform persistentComponent
   * Uses NameMappingRegistry to handle all component references automatically
   */
  private transformPersistentComponent(pc: any): any {
    // Use NameMappingRegistry to update all dependency references recursively
    // This handles FlexCard, DataMapper, IP, and OS references automatically
    const transformed = this.nameRegistry.updateDependencyReferences(JSON.parse(JSON.stringify(pc)));

    // Handle remoteClass and remoteMethod (Apex classes) - needs explicit cleaning
    if (transformed.remoteClass) {
      transformed.remoteClass = this.cleanName(transformed.remoteClass);
    }
    if (transformed.remoteMethod) {
      transformed.remoteMethod = this.cleanName(transformed.remoteMethod);
    }

    return transformed;
  }

  /**
   * Transform FilesMap content
   * Migrates file attachments referenced in FilesMap and updates IDs
   * @param filesMap - FilesMap JSON object with file keys and attachment IDs
   * @param packageInstanceId - Original package instance ID
   * @param coreInstanceId - New Core instance ID
   * @returns Transformed FilesMap with new Core attachment IDs
   */
  private async transformFilesMap(filesMap: any, packageInstanceId: string, coreInstanceId: string): Promise<any> {
    // Transform FilesMap by migrating file attachments and updating IDs
    return await this.migrateFileAttachments(filesMap, packageInstanceId, coreInstanceId);
  }

  /**
   * Migrate file attachments referenced in FilesMap
   * This handles user-uploaded files during the OmniScript session
   * @param filesMap - FilesMap JSON object with file keys and attachment IDs
   * @param packageInstanceId - Original package instance ID
   * @param coreInstanceId - New Core instance ID
   * @returns Updated FilesMap with new Core attachment IDs
   */
  private async migrateFileAttachments(filesMap: any, packageInstanceId: string, coreInstanceId: string): Promise<any> {
    if (!filesMap || typeof filesMap !== 'object') {
      Logger.logVerbose('FilesMap is empty or invalid, skipping file attachment migration');
      return filesMap || {};
    }

    const updatedMap: any = {};

    for (const [fileKey, fileAttachmentId] of Object.entries(filesMap)) {
      if (!fileAttachmentId || typeof fileAttachmentId !== 'string') {
        // Preserve non-string values (shouldn't happen, but handle gracefully)
        updatedMap[fileKey] = fileAttachmentId;
        continue;
      }

      try {
        // Query original file attachment from package instance
        const fileAttQuery = `SELECT Id, Name, Body, ContentType, Description, OwnerId, IsPrivate
                             FROM Attachment 
                             WHERE Id = '${fileAttachmentId}' 
                             AND ParentId = '${packageInstanceId}'
                             LIMIT 1`;

        const fileAttResult = await this.connection.query(fileAttQuery);

        if (fileAttResult.records && fileAttResult.records.length > 0) {
          const originalAtt = fileAttResult.records[0];

          // Fetch the actual file content
          const fileBody = await this.fetchAttachmentBody(originalAtt.Id);

          // Create new attachment for Core instance
          // Pass Buffer directly - createCoreAttachment handles it
          const newAttId = await this.createCoreAttachment(
            coreInstanceId,
            originalAtt.Name || `file_${fileKey}`,
            fileBody,
            originalAtt
          );

          updatedMap[fileKey] = newAttId;
          Logger.logVerbose(`Migrated file attachment ${fileKey}: ${originalAtt.Id} -> ${newAttId}`);
        } else {
          // File attachment not found - could be:
          // 1. Already deleted
          // 2. Different parent (shouldn't happen)
          // 3. Cross-org migration (attachment doesn't exist)
          Logger.logVerbose(
            `File attachment ${fileAttachmentId} not found for instance ${packageInstanceId}, preserving original ID`
          );
          // Preserve original ID - might still work if same org
          updatedMap[fileKey] = fileAttachmentId;
        }
      } catch (error) {
        Logger.error(`Error migrating file attachment ${fileAttachmentId} for key ${fileKey}:`, error);
        // Preserve original ID on error - better than losing the reference
        updatedMap[fileKey] = fileAttachmentId;
      }
    }

    return updatedMap;
  }

  /**
   * Transform DataJSON content
   */
  private transformDataJSON(dataJson: any, coreOmniProcessId: string, coreInstanceId: string): any {
    const transformed = JSON.parse(JSON.stringify(dataJson)); // Deep clone

    // Update ID fields
    if (transformed.omniscriptId) {
      transformed.omniscriptId = coreOmniProcessId;
    }
    if (transformed.sId) {
      transformed.sId = coreOmniProcessId;
    }
    if (transformed['Instance Id']) {
      transformed['Instance Id'] = coreInstanceId;
    }
    if (transformed.omniProcessId) {
      transformed.omniProcessId = coreOmniProcessId;
    }

    return transformed;
  }

  /**
   * Get field key with namespace prefix from mappings
   * Uses mappings object to get the source field name, then adds namespace if needed
   */
  private getFieldKey(fieldName: string): string {
    // If fieldName is already a key in mappings, use it directly
    if (OmniScriptInstanceMappings.hasOwnProperty(fieldName)) {
      return this.IS_STANDARD_DATA_MODEL ? OmniScriptInstanceMappings[fieldName] : this.namespacePrefix + fieldName;
    }
    // Otherwise, assume it's already the correct field name
    return this.IS_STANDARD_DATA_MODEL ? fieldName : this.namespacePrefix + fieldName;
  }

  /**
   * Get package field value using mappings
   */
  private getPackageFieldValue(packageInstance: AnyJson, mappingKey: string): any {
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
