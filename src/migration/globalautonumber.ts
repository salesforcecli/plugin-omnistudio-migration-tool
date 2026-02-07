/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';
import { Connection } from '@salesforce/core';
import { Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import GlobalAutoNumberMappings from '../mappings/GlobalAutoNumber';
import { DebugTimer, QueryTools } from '../utils';
import { NetUtils } from '../utils/net';
import { BaseMigrationTool } from './base';
import { MigrationResult, MigrationTool, ObjectMapping, UploadRecordResult } from './interfaces';
import { GlobalAutoNumberAssessmentInfo } from '../utils/interfaces';
import { Logger } from '../utils/logger';
import { createProgressBar } from './base';
import { OrgPreferences } from '../utils/orgPreferences';
import { OmnistudioSettingsPrefManager } from '../utils/OmnistudioSettingsPrefManager';
import { Constants } from '../utils/constants/stringContants';
import { isFoundationPackage } from '../utils/dataModelService';

export class GlobalAutoNumberMigrationTool extends BaseMigrationTool implements MigrationTool {
  private prefManager: OmnistudioSettingsPrefManager;
  private globalAutoNumberSettings: AnyJson[] | null = null;

  constructor(namespace: string, connection: Connection, logger: Logger, messages: Messages<string>, ux: Ux) {
    super(namespace, connection, logger, messages, ux);
    this.prefManager = new OmnistudioSettingsPrefManager(this.connection, this.messages);
  }

  static readonly GLOBAL_AUTO_NUMBER_SETTING_NAME = 'GlobalAutoNumberSetting__c';
  static readonly OMNI_GLOBAL_AUTO_NUMBER_NAME = 'OmniGlobalAutoNumber';
  static readonly ROLLBACK_FLAGS: string[] = ['RollbackIPChanges', 'RollbackDRChanges'];

  public getName(): string {
    return Constants.GlobalAutoNumberComponentName;
  }

  public getRecordName(record: string) {
    return record['Name'];
  }

  public getMappings(): ObjectMapping[] {
    return [
      {
        source: GlobalAutoNumberMigrationTool.GLOBAL_AUTO_NUMBER_SETTING_NAME,
        target: GlobalAutoNumberMigrationTool.OMNI_GLOBAL_AUTO_NUMBER_NAME,
      },
    ];
  }

  public async truncate(): Promise<void> {
    if (isFoundationPackage()) {
      return;
    }

    try {
      // Perform pre-migration checks before truncation
      await this.performPreMigrationChecks();
    } catch (error) {
      Logger.logVerbose(error);
      return;
    }
    this.globalAutoNumberSettings = await this.getAllGlobalAutoNumberSettings();
    if (this.globalAutoNumberSettings.length > 0) {
      await super.truncate(GlobalAutoNumberMigrationTool.OMNI_GLOBAL_AUTO_NUMBER_NAME);
    }
  }

  public async migrate(): Promise<MigrationResult[]> {
    if (isFoundationPackage()) {
      // Return a result with empty data so the dashboard can show a tile
      return [
        {
          name: this.getName(),
          results: new Map<string, UploadRecordResult>(),
          records: new Map<string, any>(),
        },
      ];
    }

    // Perform pre-migration checks before migration
    await this.performPreMigrationChecks();

    // Migrate Omni Global Auto Number data
    const migrationResult = await this.migrateGlobalAutoNumberData();

    // Validate migration success
    const validationError = await this.validateMigrationSuccess(migrationResult);

    const errors = [];
    if (validationError) {
      errors.push(validationError);
      return [{ ...migrationResult, errors: errors }];
    }

    // Perform post-migration cleanup
    const cleanupError = await this.postMigrationCleanup();

    if (cleanupError) {
      errors.push(cleanupError);
    }

    return [{ ...migrationResult, errors: errors }];
  }

  /**
   * Performs post-migration cleanup operations after successful Omni Global Auto Number migration.
   *
   * Handles the final steps of the migration process:
   * 1. Deletes source GlobalAutoNumberSetting__c records from the managed package
   * 2. Enables the Omni Global Auto Number preference in the target org
   *
   * Performs cleanup operations in sequence using truncate and metadata update APIs.
   * Ensures data integrity by removing old records and activating new functionality.
   *
   * @returns {Promise<string>} Empty string on success, error message on failure
   *
   */
  private async postMigrationCleanup(): Promise<string> {
    try {
      Logger.logVerbose(this.messages.getMessage('startingPostMigrationCleanup'));
      // Delete source GlobalAutoNumberSetting__c records using the same truncate pattern
      await super.truncate(this.namespacePrefix + GlobalAutoNumberMigrationTool.GLOBAL_AUTO_NUMBER_SETTING_NAME);
      Logger.logVerbose(this.messages.getMessage('postMigrationCleanupCompleted'));
      // Enable the org preference after successful cleanup
      let result = await this.prefManager.enableGlobalAutoNumber();
      // Metadata API returns an array of results, even for single updates
      result = Array.isArray(result) && result.length > 0 ? result[0] : result;
      if (result?.success) {
        Logger.logVerbose(this.messages.getMessage('omniGlobalAutoNumberPrefEnabled'));
        return '';
      } else {
        const errorMessage = this.messages.getMessage('errorEnablingOmniGlobalAutoNumberPref');
        Logger.error(errorMessage);
        Logger.error(result?.errors?.message || JSON.stringify(result?.errors));
        return errorMessage;
      }
    } catch (error) {
      Logger.logVerbose(error);
      const initialCount = this.globalAutoNumberSettings.length;
      const finalLength = (await this.getAllGlobalAutoNumberSettings()).length;
      const message =
        initialCount !== finalLength ? 'errorEnablingOmniGlobalAutoNumberPref' : 'errorDuringPostMigrationCleanup';
      const errorMessage = this.messages.getMessage(message);
      Logger.error(errorMessage);
      return errorMessage;
    }
  }

  /**
   * Validate that all Omni Global Auto Number objects are successfully migrated
   * before proceeding with source object truncation
   */
  private async validateMigrationSuccess(migrationResults: MigrationResult): Promise<string> {
    const { results, records } = migrationResults;
    const resultsList: any[] = results instanceof Map ? Array.from(results.values()) : Object.values(results || {});
    const recordsList: any[] = records instanceof Map ? Array.from(records.values()) : Object.values(records || {});

    const failedRecords = resultsList.filter((result) => !result.success);
    const successfulRecords = resultsList.filter((result) => result.success);

    // 3. COUNT VALIDATION
    const sourceCount = this.globalAutoNumberSettings.length;
    const targetCount = successfulRecords.length;

    if (sourceCount !== targetCount || failedRecords.length > 0) {
      const uniqueErrors = [
        ...new Set([...resultsList, ...recordsList].filter((r) => r?.errors?.length).map((r) => r.errors[0])),
      ];
      let errorMessage = this.messages.getMessage('incompleteMigrationDetected');
      if (uniqueErrors.length > 0) {
        const errors = uniqueErrors.length === 1 ? uniqueErrors[0] : uniqueErrors.join(', ');
        errorMessage += ` because of ${errors}`;
      }
      Logger.error(errorMessage);
      Logger.error(this.messages.getMessage('migrationValidationFailed'));
      return errorMessage;
    }

    return '';
  }

  /**
   * Performs pre-migration validation checks to ensure the environment is ready for Omni Global Auto Number migration.
   *
   * Validates two critical conditions before allowing migration to proceed:
   * 1. Omni Global Auto Number preference must not be already enabled in the target org
   * 2. Rollback flags must not be enabled, as they can interfere with the migration process
   *
   * Queries the org's metadata to check preference status and rollback flag settings.
   * Prevents migration conflicts and ensures a clean migration environment.
   *
   * @throws {Error} When Omni Global Auto Number preference is already enabled
   * @throws {Error} When rollback flags are enabled (RollbackIPChanges, RollbackDRChanges, or both)
   *
   */
  private async performPreMigrationChecks(): Promise<void> {
    // Check if Omni Global Auto Number preference is already enabled
    const isEnabled = await this.prefManager.isGlobalAutoNumberEnabled();
    if (isEnabled) {
      const errorMessage = this.messages.getMessage('globalAutoNumberPrefEnabledError');
      throw new Error(errorMessage);
    }
    // Check rollback flags using existing utility
    const rollbackFlags = await OrgPreferences.checkRollbackFlags(this.connection);
    const enabledFlags = rollbackFlags.filter((flag) => GlobalAutoNumberMigrationTool.ROLLBACK_FLAGS.includes(flag));
    if (enabledFlags.length === 0) {
      return; // Success - proceed with migration
    } else if (enabledFlags.length > 0) {
      let errorMessage: string;
      if (enabledFlags.includes('RollbackIPChanges') && enabledFlags.includes('RollbackDRChanges')) {
        errorMessage = this.messages.getMessage('bothRollbackFlagsEnabledError');
      } else if (enabledFlags.includes('RollbackIPChanges')) {
        errorMessage = this.messages.getMessage('rollbackIPFlagEnabledError');
      } else if (enabledFlags.includes('RollbackDRChanges')) {
        errorMessage = this.messages.getMessage('rollbackDRFlagEnabledError');
      }
      throw new Error(errorMessage);
    }
  }

  private async migrateGlobalAutoNumberData(): Promise<MigrationResult> {
    let originalGlobalAutoNumberRecords = new Map<string, any>();
    let globalAutoNumberUploadInfo = new Map<string, UploadRecordResult>();
    const uniqueNames = new Set<string>();

    let progressCounter = 0;
    Logger.logVerbose(
      this.messages.getMessage('foundGlobalAutoNumbersToMigrate', [this.globalAutoNumberSettings.length])
    );

    const progressBar = createProgressBar('Migrating', 'Omni Global Auto Numbers');
    progressBar.start(this.globalAutoNumberSettings.length, progressCounter);

    for (let autonumber of this.globalAutoNumberSettings) {
      progressBar.update(++progressCounter);
      const recordId = autonumber['Id'];

      // Create a map of the original records
      originalGlobalAutoNumberRecords.set(recordId, autonumber);

      try {
        // Transform the GlobalAutoNumber setting
        const transformedGlobalAutoNumber = this.mapGlobalAutoNumberRecord(autonumber);
        const transformedName = transformedGlobalAutoNumber['Name'];

        // Verify duplicated names before trying to submit
        if (uniqueNames.has(transformedName)) {
          this.setRecordErrors(autonumber, this.messages.getMessage('duplicatedGlobalAutoNumberName'));
          originalGlobalAutoNumberRecords.set(recordId, autonumber);
          continue;
        }
        uniqueNames.add(transformedName);

        // Create Omni Global Auto Number record
        const uploadResult = await NetUtils.createOne(
          this.connection,
          GlobalAutoNumberMigrationTool.OMNI_GLOBAL_AUTO_NUMBER_NAME,
          recordId,
          transformedGlobalAutoNumber
        );

        if (uploadResult) {
          uploadResult.errors = uploadResult.errors || [];
          if (!uploadResult.success) {
            uploadResult.errors = Array.isArray(uploadResult.errors) ? uploadResult.errors : [uploadResult.errors];
          }
          uploadResult.warnings = uploadResult.warnings || [];
          uploadResult.newName = transformedName;
          globalAutoNumberUploadInfo.set(recordId, uploadResult);
        }
      } catch (err) {
        this.setRecordErrors(autonumber, this.messages.getMessage('errorWhileUploadingGlobalAutoNumber') + err);
        originalGlobalAutoNumberRecords.set(recordId, autonumber);

        globalAutoNumberUploadInfo.set(recordId, {
          referenceId: recordId,
          hasErrors: true,
          success: false,
          errors: [err],
          warnings: [],
        });
        Logger.logVerbose(err.stack);
      }
    }

    progressBar.stop();

    return {
      name: Constants.GlobalAutoNumberComponentName,
      results: globalAutoNumberUploadInfo,
      records: originalGlobalAutoNumberRecords,
      errors: [],
    };
  }

  public async assess(): Promise<GlobalAutoNumberAssessmentInfo[]> {
    if (isFoundationPackage()) {
      return [];
    }

    try {
      DebugTimer.getInstance().lap('Query GlobalAutoNumber settings');
      Logger.logVerbose(this.messages.getMessage('startingGlobalAutoNumberAssessment'));
      const globalAutoNumbers = await this.getAllGlobalAutoNumberSettings();
      Logger.logVerbose(this.messages.getMessage('foundGlobalAutoNumbersToAssess', [globalAutoNumbers.length]));

      const globalAutoNumberAssessmentInfos = await this.processGlobalAutoNumberComponents(globalAutoNumbers);
      return globalAutoNumberAssessmentInfos;
    } catch (err) {
      Logger.logVerbose(err.stack);
      return [];
    }
  }

  private async processGlobalAutoNumberComponents(
    globalAutoNumbers: AnyJson[]
  ): Promise<GlobalAutoNumberAssessmentInfo[]> {
    const globalAutoNumberAssessmentInfos: GlobalAutoNumberAssessmentInfo[] = [];
    let progressCounter = 0;
    const progressBar = createProgressBar('Assessing', 'Omni Global Auto Numbers');
    progressBar.start(globalAutoNumbers.length, progressCounter);
    const uniqueNames = new Set<string>();

    for (const globalAutoNumber of globalAutoNumbers) {
      try {
        const globalAutoNumberAssessmentInfo = this.processGlobalAutoNumber(globalAutoNumber, uniqueNames);
        globalAutoNumberAssessmentInfos.push(globalAutoNumberAssessmentInfo);
      } catch (e) {
        globalAutoNumberAssessmentInfos.push({
          name: globalAutoNumber['Name'],
          oldName: globalAutoNumber['Name'],
          id: globalAutoNumber['Id'],
          infos: [],
          warnings: [],
          errors: [this.messages.getMessage('unexpectedError')],
        });
        Logger.error(e.message);
        Logger.logVerbose(e.stack);
      }
      progressBar.update(++progressCounter);
    }
    progressBar.stop();
    return Promise.resolve(globalAutoNumberAssessmentInfos);
  }

  private processGlobalAutoNumber(globalAutoNumber: AnyJson, uniqueNames: Set<string>): GlobalAutoNumberAssessmentInfo {
    const globalAutoNumberName = globalAutoNumber['Name'];

    const globalAutoNumberAssessmentInfo: GlobalAutoNumberAssessmentInfo = {
      oldName: globalAutoNumberName,
      name: globalAutoNumberName,
      id: globalAutoNumber['Id'],
      infos: [],
      warnings: [],
      errors: [],
    };

    // Check for duplicate names
    if (uniqueNames.has(globalAutoNumberName)) {
      globalAutoNumberAssessmentInfo.errors.push(
        this.messages.getMessage('duplicateGlobalAutoNumberNameMessage', [globalAutoNumberName])
      );
    }
    uniqueNames.add(globalAutoNumberName);
    return globalAutoNumberAssessmentInfo;
  }

  private async getAllGlobalAutoNumberSettings(): Promise<AnyJson[]> {
    return await QueryTools.queryAll(
      this.connection,
      this.namespace,
      GlobalAutoNumberMigrationTool.GLOBAL_AUTO_NUMBER_SETTING_NAME,
      Object.keys(GlobalAutoNumberMappings)
    );
  }

  private mapGlobalAutoNumberRecord(globalAutoNumberRecord: AnyJson): AnyJson {
    // Transformed object
    const mappedObject = {};

    // Get the fields of the record
    const recordFields = Object.keys(globalAutoNumberRecord);

    // Map individual fields (following same pattern as OS, DR, FC)
    recordFields.forEach((recordField) => {
      const cleanFieldName = this.getCleanFieldName(recordField);

      if (GlobalAutoNumberMappings.hasOwnProperty(cleanFieldName)) {
        mappedObject[GlobalAutoNumberMappings[cleanFieldName]] = globalAutoNumberRecord[recordField];
      }
    });

    // BATCH framework requires that each record has an "attributes" property
    mappedObject['attributes'] = {
      type: GlobalAutoNumberMigrationTool.OMNI_GLOBAL_AUTO_NUMBER_NAME,
      referenceId: globalAutoNumberRecord['Id'],
    };

    return mappedObject;
  }
}
