import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import { Logger } from '../utils/logger';
import { Constants } from '../utils/constants/stringContants';
import { OrgPreferences } from '../utils/orgPreferences';
import { askStringWithTimeout, PromptUtil } from '../utils/promptUtil';
import { YES_SHORT, YES_LONG, NO_SHORT, NO_LONG } from '../utils/projectPathUtil';
import { documentRegistry } from '../utils/constants/documentRegistry';
import { OmniStudioMetadataCleanupService } from '../utils/config/OmniStudioMetadataCleanupService';
import { isStandardDataModelWithMetadataAPIEnabled } from '../utils/dataModelService';
import { sfProject } from '../utils/sfcli/project/sfProject';
import { BaseMigrationTool } from './base';

const authEnvKey = 'OMA_AUTH_KEY';

export class PreMigrate extends BaseMigrationTool {
  // Source Custom Object Names
  public constructor(namespace: string, connection: Connection, logger: Logger, messages: Messages<string>, ux: Ux) {
    super(namespace, connection, logger, messages, ux);
  }

  /**
   * Ensures all versions are processed when on standard data model.
   * If the -a flag was not provided, prompts user for consent.
   *
   * @param allVersionsFlagFromCLI - The allVersions flag value from CLI (-a flag)
   * @returns true if all versions should be processed, false otherwise
   */
  public async handleAllVersionsPrerequisites(allVersionsFlagFromCLI: boolean): Promise<boolean> {
    if (allVersionsFlagFromCLI === false) {
      // Get user consent to process allversions of OmniStudio components for standard data model migration
      const omniStudioProcessAllVersionsConsent = await this.getOmnistudioProcessAllVersionsConsent();
      if (!omniStudioProcessAllVersionsConsent) {
        Logger.error(this.messages.getMessage('omniStudioAllVersionsProcessingConsentNotGiven'));
        process.exit(1);
      }

      Logger.logVerbose(this.messages.getMessage('omniStudioAllVersionsProcessingConsentGiven'));
      return true;
    }
    return allVersionsFlagFromCLI;
  }

  public async handleOmnistudioMetadataPrerequisites(): Promise<void> {
    if (isStandardDataModelWithMetadataAPIEnabled()) {
      return;
    }
    // Get user consent to enable OmniStudio Metadata for standard data model migration
    const omniStudioMetadataEnableConsent = await this.getOmniStudioMetadataEnableConsent();
    if (!omniStudioMetadataEnableConsent) {
      Logger.error(this.messages.getMessage('omniStudioMetadataEnableConsentNotGiven'));
      process.exit(1);
    }

    // Handle config tables cleanup for standard data model migration
    const isMetadataTablesValid = await this.validateOmniStudioMetadataTables();
    if (!isMetadataTablesValid) {
      process.exit(1);
    }
  }

  public async handleExperienceSitePrerequisites(
    objectsToProcess: string[],
    conn: Connection,
    isExperienceBundleMetadataAPIProgramaticallyEnabled: { value: boolean }
  ): Promise<void> {
    if (objectsToProcess.includes(Constants.ExpSites)) {
      const expMetadataApiConsent = await this.getExpSiteMetadataEnableConsent();
      Logger.logVerbose(this.messages.getMessage('experienceSiteMetadataConsent', [expMetadataApiConsent]));

      if (expMetadataApiConsent === false) {
        Logger.warn(this.messages.getMessage('experienceSiteConsentNotProvidedWarning'));
        this.removeKeyFromRelatedObjectsToProcess(Constants.ExpSites, objectsToProcess);
        Logger.logVerbose(
          this.messages.getMessage('relatedObjectsToProcessAfterExpSitesRemoval', [JSON.stringify(objectsToProcess)])
        );
        return;
      }

      const isMetadataAPIPreEnabled = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(conn);
      if (isMetadataAPIPreEnabled === true) {
        Logger.logVerbose(this.messages.getMessage('experienceBundleMetadataAPIAlreadyEnabled'));
        return;
      }

      Logger.logVerbose(this.messages.getMessage('enableExperienceBundleMetadataAPIProgramatically'));
      isExperienceBundleMetadataAPIProgramaticallyEnabled.value = await OrgPreferences.setExperienceBundleMetadataAPI(
        conn,
        true
      );
      if (isExperienceBundleMetadataAPIProgramaticallyEnabled.value === false) {
        this.removeKeyFromRelatedObjectsToProcess(Constants.ExpSites, objectsToProcess);
        Logger.warn(this.messages.getMessage('unableToEnableExperienceBundleMetadataAPI'));
      }

      Logger.logVerbose(this.messages.getMessage('relatedObjectsToProcess', [JSON.stringify(objectsToProcess)]));
    }
  }

  public async getAutoDeployConsent(
    includeLwc: boolean,
    actionItems: string[]
  ): Promise<{ autoDeploy: boolean; authKey: string | undefined }> {
    const askWithTimeOut = PromptUtil.askWithTimeOut(this.messages);
    let validResponse = false;
    let consent = false;

    while (!validResponse) {
      try {
        const resp = await askWithTimeOut(
          Logger.prompt.bind(Logger),
          this.messages.getMessage('autoDeployConsentMessage')
        );
        const response = typeof resp === 'string' ? resp.trim().toLowerCase() : '';

        if (response === YES_SHORT || response === YES_LONG) {
          consent = true;
          validResponse = true;
        } else if (response === NO_SHORT || response === NO_LONG) {
          consent = false;
          validResponse = true;
        } else {
          Logger.error(this.messages.getMessage('invalidYesNoResponse'));
        }
      } catch (err) {
        Logger.error(this.messages.getMessage('requestTimedOut'));
        process.exit(1);
      }
    }

    const deploymentConfig = {
      autoDeploy: consent,
      authKey: undefined,
    };
    if (consent && includeLwc) {
      const lwcPrereqResult = await this.checkLwcDeployPrerequisites(actionItems);
      deploymentConfig.authKey = lwcPrereqResult.authKey;
      deploymentConfig.autoDeploy = lwcPrereqResult.autoDeploy;
    }

    if (!consent) {
      Logger.warn(this.messages.getMessage('deploymentConsentNotGiven'));
      actionItems.push(
        `${this.messages.getMessage('deploymentConsentNotGiven')}\n${this.messages.getMessage('manualDeploymentSteps', [
          documentRegistry.manualDeploymentSteps,
        ])}`
      );
    }

    return deploymentConfig;
  }

  /**
   * Gets user consent for OmniStudio metadata cleanup
   *
   * @returns Promise<boolean> - true if user consents, false otherwise
   */
  public async getOmniStudioMetadataEnableConsent(): Promise<boolean> {
    const askWithTimeOut = PromptUtil.askWithTimeOut(this.messages);
    let validResponse = false;
    let consent = false;

    while (!validResponse) {
      try {
        const resp = await askWithTimeOut(
          Logger.prompt.bind(Logger),
          this.messages.getMessage('omniStudioMetadataEnableConsentMessage')
        );
        const response = typeof resp === 'string' ? resp.trim().toLowerCase() : '';

        if (response === YES_SHORT || response === YES_LONG) {
          consent = true;
          validResponse = true;
        } else if (response === NO_SHORT || response === NO_LONG) {
          consent = false;
          validResponse = true;
        } else {
          Logger.error(this.messages.getMessage('invalidYesNoResponse'));
        }
      } catch (err) {
        Logger.error(this.messages.getMessage('requestTimedOut'));
        process.exit(1);
      }
    }
    return consent;
  }

  /**
   * Validates that OmniStudio metadata tables are clean before migration can proceed.
   *
   * @returns Promise<boolean> - true if tables are clean and migration can proceed, false otherwise
   */
  public async validateOmniStudioMetadataTables(): Promise<boolean> {
    if (isStandardDataModelWithMetadataAPIEnabled()) {
      return true;
    }
    const omniStudioMetadataCleanupService = new OmniStudioMetadataCleanupService(this.connection, this.messages);

    if (await omniStudioMetadataCleanupService.hasCleanOmniStudioMetadataTables()) {
      Logger.logVerbose(this.messages.getMessage('metadataTablesAlreadyClean'));
      return true;
    }
    const helpUrl = this.messages.getMessage('cleanupMetadataTablesHelpUrl');
    const helpLinkText = this.messages.getMessage('cleanupMetadataTablesHelpLinkText');
    const clickableLink = `\x1b]8;;${helpUrl}\x1b\\${helpLinkText}\x1b]8;;\x1b\\`;
    Logger.error(`${this.messages.getMessage('cleanupMetadataTablesRequired')} ${clickableLink}`);
    return false;
  }

  private async checkLwcDeployPrerequisites(
    actionItems: string[]
  ): Promise<{ autoDeploy: boolean; authKey: string | undefined }> {
    const missingPrerequisites: string[] = [];

    const isNpmAvailable = sfProject.isNpmInstalled();
    if (!isNpmAvailable) {
      missingPrerequisites.push(this.messages.getMessage('npmNotInstalled'));
    }

    const authKey = process.env[authEnvKey];
    if (!authKey) {
      missingPrerequisites.push(this.messages.getMessage('authKeyEnvVarNotSet'));
    }

    if (missingPrerequisites.length === 0) {
      return { autoDeploy: true, authKey };
    }

    Logger.warn(this.messages.getMessage('lwcDeployPrerequisitesMissing', [missingPrerequisites.join(' ')]));

    const proceedWithManual = await this.getManualLwcDeploymentConsent();

    if (proceedWithManual) {
      Logger.log(this.messages.getMessage('manualLwcDeploymentProceeding'));
      actionItems.push(
        `${missingPrerequisites.join(' ')}\n${this.messages.getMessage('manualDeploymentSteps', [
          documentRegistry.manualDeploymentSteps,
        ])}`
      );
      return { autoDeploy: true, authKey: undefined };
    }

    Logger.error(this.messages.getMessage('npmAndAuthKeyRequired'));
    process.exit(1);
  }

  private async getManualLwcDeploymentConsent(): Promise<boolean> {
    const askWithTimeOut = PromptUtil.askWithTimeOut(this.messages);
    const validResponse = false;

    while (!validResponse) {
      try {
        const resp = await askWithTimeOut(
          Logger.prompt.bind(Logger),
          this.messages.getMessage('manualLwcDeploymentPrompt')
        );
        const response = typeof resp === 'string' ? resp.trim().toLowerCase() : '';

        if (response === YES_SHORT || response === YES_LONG) {
          return true;
        } else if (response === NO_SHORT || response === NO_LONG) {
          return false;
        } else {
          Logger.error(this.messages.getMessage('invalidYesNoResponse'));
        }
      } catch (err) {
        Logger.error(this.messages.getMessage('requestTimedOut'));
        process.exit(1);
      }
    }
    return false;
  }

  // This needs to be behind timeout
  private async getExpSiteMetadataEnableConsent(): Promise<boolean> {
    const question = this.messages.getMessage('consentForExperienceSites');
    const validResponse = false;

    while (!validResponse) {
      try {
        // Get string input from user with timeout
        const userInput = await askStringWithTimeout(
          Logger.prompt.bind(Logger),
          question,
          this.messages.getMessage('requestTimedOut')
        );

        // Validate and convert the input
        const normalizedInput = userInput.trim().toLowerCase();

        if (normalizedInput === YES_SHORT || normalizedInput === YES_LONG) {
          return true;
        } else if (normalizedInput === NO_SHORT || normalizedInput === NO_LONG) {
          return false;
        } else {
          // Invalid input - show error and continue loop to re-prompt
          Logger.error(this.messages.getMessage('invalidYesNoResponse'));
        }
      } catch (error) {
        // Handle timeout or other errors
        Logger.error(this.messages.getMessage('requestTimedOut'));
        process.exit(1);
      }
    }
  }

  private removeKeyFromRelatedObjectsToProcess(keyToRemove: string, relatedObjects: string[]): void {
    const index = relatedObjects.indexOf(Constants.ExpSites);
    if (index > -1) {
      relatedObjects.splice(index, 1);
    }
  }

  /**
   * Gets user consent for OmniStudio metadata tables cleanup
   *
   * @returns Promise<boolean> - true if user consents, false otherwise
   */
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore TS6133: kept intentionally for future metadata cleanup flow.
  private async getMetadataCleanupConsent(): Promise<boolean> {
    const askWithTimeOut = PromptUtil.askWithTimeOut(this.messages);
    let validResponse = false;
    let consent = false;

    while (!validResponse) {
      try {
        const resp = await askWithTimeOut(
          Logger.prompt.bind(Logger),
          this.messages.getMessage('metadataCleanupConsentMessage')
        );
        const response = typeof resp === 'string' ? resp.trim().toLowerCase() : '';

        if (response === YES_SHORT || response === YES_LONG) {
          consent = true;
          validResponse = true;
        } else if (response === NO_SHORT || response === NO_LONG) {
          consent = false;
          validResponse = true;
        } else {
          Logger.error(this.messages.getMessage('invalidYesNoResponse'));
        }
      } catch (err) {
        Logger.error(this.messages.getMessage('requestTimedOut'));
        process.exit(1);
      }
    }
    return consent;
  }

  /**
   * Gets user consent for OmniStudio migrating all versions of Omnistudio Components
   *
   * @returns Promise<boolean> - true if user consents, false otherwise
   */
  private async getOmnistudioProcessAllVersionsConsent(): Promise<boolean> {
    const askWithTimeOut = PromptUtil.askWithTimeOut(this.messages);
    let validResponse = false;
    let consent = false;

    while (!validResponse) {
      try {
        const resp = await askWithTimeOut(
          Logger.prompt.bind(Logger),
          this.messages.getMessage('omniStudioAllVersionsProcessingConsent')
        );
        const response = typeof resp === 'string' ? resp.trim().toLowerCase() : '';

        if (response === YES_SHORT || response === YES_LONG) {
          consent = true;
          validResponse = true;
        } else if (response === NO_SHORT || response === NO_LONG) {
          consent = false;
          validResponse = true;
        } else {
          Logger.error(this.messages.getMessage('invalidYesNoResponse'));
        }
      } catch (err) {
        Logger.error(this.messages.getMessage('requestTimedOut'));
        process.exit(1);
      }
    }
    return consent;
  }
}
