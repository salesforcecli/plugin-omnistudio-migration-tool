/* eslint-disable */

import { Connection, Messages, Org } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import type { ExecuteAnonymousResult } from '@jsforce/jsforce-node/lib/api/tooling';
import { Logger } from '../utils/logger';
import { AnonymousApexRunner } from '../utils/apex/executor/AnonymousApexRunner';
import { Constants } from '../utils/constants/stringContants';
import { OmnistudioSettingsPrefManager } from '../utils/OmnistudioSettingsPrefManager';
import { OrgPreferences } from '../utils/orgPreferences';
import { BaseMigrationTool } from './base';
import { Deployer } from './deployer';
import { OmniscriptPackageDeploymentError } from '../error/deploymentErrors';
import * as fs from 'fs';
import * as path from 'path';
import { documentRegistry } from '../utils/constants/documentRegistry';
import { isStandardDataModel } from '../utils/dataModelService';
import { OmniStudioMetadataCleanupService } from '../utils/config/OmniStudioMetadataCleanupService';

export class PostMigrate extends BaseMigrationTool {
  private readonly org: Org;
  private readonly relatedObjectsToProcess: string[];
  private readonly projectPath: string;
  private readonly deploymentConfig: { autoDeploy: boolean; authKey: string | undefined };
  private settingsPrefManager: OmnistudioSettingsPrefManager;

  // Source Custom Object Names
  constructor(
    org: Org,
    namespace: string,
    connection: Connection,
    logger: Logger,
    messages: Messages<string>,
    ux: Ux,
    relatedObjectsToProcess: string[],
    deploymentConfig?: { autoDeploy: boolean; authKey: string | undefined },
    projectPath?: string
  ) {
    super(namespace, connection, logger, messages, ux);
    this.org = org;
    this.relatedObjectsToProcess = relatedObjectsToProcess;
    this.deploymentConfig = deploymentConfig;
    this.projectPath = projectPath;
    this.settingsPrefManager = new OmnistudioSettingsPrefManager(connection, messages);
  }

  /**
   * Execute post migration tasks with dependency handling.
   */
  public async executeTasks(namespaceToModify: string, userActionMessage: string[]): Promise<string[]> {
    const designerOk = await this.enableDesignersToUseStandardDataModelIfNeeded(namespaceToModify, userActionMessage);
    if (designerOk) {
      await this.enableStandardRuntimeIfNeeded(userActionMessage);
    }
    if (isStandardDataModel()) {
      await this.enableOmniStudioSettingsMetadataIfNeeded(userActionMessage);
    }
    return userActionMessage;
  }

  public async enableDesignersToUseStandardDataModelIfNeeded(
    namespaceToModify: string,
    userActionMessage: string[]
  ): Promise<boolean> {
    try {
      Logger.logVerbose(this.messages.getMessage('settingDesignersToStandardModel'));

      // First check if standard designer is already enabled for this package
      Logger.logVerbose(this.messages.getMessage('checkingStandardDesignerStatus', [namespaceToModify]));
      const isAlreadyEnabled = await OrgPreferences.isStandardDesignerEnabled(this.connection, namespaceToModify);

      if (isAlreadyEnabled) {
        Logger.logVerbose(this.messages.getMessage('standardDesignerAlreadyEnabled', [namespaceToModify]));
        return true;
      }

      const apexCode = `
          ${namespaceToModify}.OmniStudioPostInstallClass.useStandardDataModel();
        `;

      const result: ExecuteAnonymousResult = await AnonymousApexRunner.run(this.org, apexCode);

      if (result?.success === false) {
        const message = result?.exceptionStackTrace || result?.exceptionMessage || 'Unknown error';

        Logger.error(this.messages.getMessage('errorSettingDesignersToStandardModel', [message]));
        Logger.logVerbose(this.messages.getMessage('skipStandardRuntimeDueToFailure'));
        userActionMessage.push(this.messages.getMessage('manuallySwitchDesignerToStandardDataModel'));

        // Do NOT attempt to enable standard runtime when setup fails
        return false;
      } else if (result?.success === true) {
        Logger.logVerbose(this.messages.getMessage('designersSetToStandardModel'));
        return true;
      } else {
        // Handle unexpected result structure
        Logger.error('Received unexpected response from Apex execution - unable to determine success status');
        userActionMessage.push(this.messages.getMessage('manuallySwitchDesignerToStandardDataModel'));
        return false;
      }
    } catch (ex) {
      const errorDetails = ex instanceof Error ? ex.message : JSON.stringify(ex);
      Logger.error(this.messages.getMessage('exceptionSettingDesignersToStandardDataModel', [errorDetails]));
      Logger.logVerbose(this.messages.getMessage('skipStandardRuntimeDueToFailure'));
      userActionMessage.push(this.messages.getMessage('manuallySwitchDesignerToStandardDataModel'));
      return false;
    }
  }

  /**
   * Enables Standard OmniStudio Runtime if it's currently disabled.
   */
  private async enableStandardRuntimeIfNeeded(userActionMessage: string[]): Promise<void> {
    try {
      Logger.logVerbose(this.messages.getMessage('checkingStandardRuntimeStatus'));

      let result = await this.settingsPrefManager.enableStandardRuntimeIfDisabled();
      // Metadata API returns an array of results, even for single updates
      result = Array.isArray(result) && result.length > 0 ? result[0] : result;
      if (result === null) {
        Logger.logVerbose(this.messages.getMessage('standardRuntimeAlreadyEnabled'));
      } else if (result?.success === true) {
        Logger.logVerbose(this.messages.getMessage('standardRuntimeEnabled'));
      } else {
        const errors = result?.errors?.join(', ') || 'Unknown error';
        Logger.error(this.messages.getMessage('errorEnablingStandardRuntime', [errors]));
        userActionMessage.push(this.messages.getMessage('manuallyEnableStandardRuntime'));
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.error(this.messages.getMessage('exceptionEnablingStandardRuntime', [errMsg]));
      userActionMessage.push(this.messages.getMessage('manuallyEnableStandardRuntime'));
    }
  }

  private async enableOmniStudioSettingsMetadataIfNeeded(userActionMessage: string[]): Promise<void> {
    try {
      let result = await this.settingsPrefManager.enableOmniStudioSettingsMetadata();
      // Metadata API returns an array of results, even for single updates
      result = Array.isArray(result) && result.length > 0 ? result[0] : result;
      if (result === null) {
        Logger.logVerbose(this.messages.getMessage('omniStudioSettingsMetadataAlreadyEnabled'));
      } else if (result?.success === true) {
        Logger.log(this.messages.getMessage('enablingOmniStudioSettingsMetadataStatus'));
        /* The API call returns true if the metadata enabling call was successful.
        But it takes time for the checks to run and the metadata to be enabled or reverted back.
        We need to wait and check if the config tables are populated or not.
        That will ensure that the metadata is enabled.
        */
        const maxAttempts = 6;
        let attempts = 0;
        const metadataService = new OmniStudioMetadataCleanupService(this.connection, this.messages);
        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 20000));
          const isConfigTablesEmpty = await metadataService.hasCleanOmniStudioMetadataTables(); //Check is the config tables are populated or not.
          if (!isConfigTablesEmpty) {
            // If the config tables are populated, means the metadata is enabled.
            Logger.log(this.messages.getMessage('omniStudioSettingsMetadataEnabled'));
            break;
          }
          attempts++;
        }
        if (attempts === maxAttempts) {
          // TODO: We need to figure out and show the user that what is the actual issue which is causing the metadata to not be enabled.
          Logger.error(this.messages.getMessage('timeoutEnablingOmniStudioSettingsMetadata', [maxAttempts * 20]));
          userActionMessage.push(this.messages.getMessage('manuallyEnableOmniStudioSettingsMetadata'));
        }
      } else {
        const errors = result?.errors?.join(', ') || 'Unknown error';
        Logger.error(this.messages.getMessage('errorEnablingOmniStudioSettingsMetadata', [errors]));
        userActionMessage.push(this.messages.getMessage('manuallyEnableOmniStudioSettingsMetadata'));
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.error(this.messages.getMessage('errorEnablingOmniStudioSettingsMetadata', [errMsg]));
      userActionMessage.push(this.messages.getMessage('manuallyEnableOmniStudioSettingsMetadata'));
    }
  }

  // If we processed exp sites and switched metadata api from off->on then only we revert it
  public async restoreExperienceAPIMetadataSettings(
    isExperienceBundleMetadataAPIProgramaticallyEnabled: {
      value: boolean;
    },
    userActionMessage: string[]
  ): Promise<void> {
    if (this.relatedObjectsToProcess === undefined || this.relatedObjectsToProcess === null) {
      Logger.logVerbose(this.messages.getMessage('noRelatedObjects'));
      return;
    }
    if (
      this.relatedObjectsToProcess.includes(Constants.ExpSites) &&
      isExperienceBundleMetadataAPIProgramaticallyEnabled.value === true
    ) {
      Logger.logVerbose(this.messages.getMessage('turnOffExperienceBundleAPI'));
      try {
        await OrgPreferences.toggleExperienceBundleMetadataAPI(this.connection, false);
      } catch (error) {
        userActionMessage.push(this.messages.getMessage('errorRevertingExperienceBundleMetadataAPI'));
      }
    }
  }

  public async deploy(userActionMessage: string[]): Promise<void> {
    if (!this.deploymentConfig.autoDeploy || !fs.existsSync(path.join(process.cwd(), 'package.xml'))) {
      Logger.logVerbose(this.messages.getMessage('deploymentSkipped'));
      return;
    }

    try {
      const deployer = new Deployer(
        this.projectPath,
        this.messages,
        this.org.getUsername(),
        this.deploymentConfig.authKey
      );

      await deployer.deploy();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(this.messages.getMessage('errorDeployingComponents'), error);

      // Handle specific omniscript package deployment failures by error type (not message)
      if (error instanceof OmniscriptPackageDeploymentError) {
        userActionMessage.push(
          this.messages.getMessage('deployOmniscriptPackageManually', [documentRegistry.manualDeploymentSteps])
        );
        Logger.logVerbose(this.messages.getMessage('omniscriptDeploymentFailedContinuing'));
      } else {
        // Handle general deployment failures
        userActionMessage.push(this.messages.getMessage('deployComponentsManually'));
        Logger.logVerbose(this.messages.getMessage('deploymentFailedContinuing'));
      }

      // Log the specific error details for troubleshooting
      Logger.logVerbose(`Deployment error details: ${errorMessage}`);

      // Re-throw so callers (migrate.ts) can track deploymentFailed state
      throw error;
    }
  }
}
