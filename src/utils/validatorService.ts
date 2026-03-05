import { Connection, Messages } from '@salesforce/core';
import { Logger } from '../utils/logger';
import { OmnistudioOrgDetails } from './orgUtils';
import { isStandardDataModel } from './dataModelService';
import { OrgPreferences } from './orgPreferences';
import { Constants } from './constants/stringContants';

export class ValidatorService {
  private readonly messages: Messages<string>;
  private readonly orgs: OmnistudioOrgDetails;
  private readonly connection: Connection;
  public constructor(orgs: OmnistudioOrgDetails, messages: Messages<string>, connection: Connection) {
    this.orgs = orgs;
    this.messages = messages;
    this.connection = connection;
  }

  public async validate(isAssessment = false): Promise<boolean> {
    const basicValidation = this.validateNamespace() && this.validatePackageInstalled();
    if (!basicValidation) {
      return false;
    }

    const isDRVersioningDisabled = await this.validateDrVersioningDisabled();
    if (!isDRVersioningDisabled) {
      return false;
    }

    // If data model is standard no need to check for the licences
    const isStandard = isStandardDataModel();
    if (isStandard) {
      const isOmniInteractionConfigValid = await this.validateOmniInteractionConfig();
      if (!isOmniInteractionConfigValid) {
        Logger.error(this.messages.getMessage('omniInteractionConfigInvalid'));
        return false;
      }

      return true;
    }

    // For custom data model, validate if licenses are valid
    // Skip license check during assessment
    if (isAssessment) {
      Logger.logVerbose(this.messages.getMessage('skippingLicenseCheckForAssessment'));
      return true;
    }

    const isLicensesValid = await this.validateOmniStudioLicenses();
    return isLicensesValid;
  }

  public validatePackageInstalled(): boolean {
    const { packageDetails } = this.orgs;
    if (!packageDetails) {
      Logger.error(this.messages.getMessage('noPackageInstalled'));
      return false;
    }
    return true;
  }

  public validateNamespace(): boolean {
    const { hasValidNamespace } = this.orgs;
    if (!hasValidNamespace) {
      Logger.error(this.messages.getMessage('unknownNamespace'));
      return false;
    }
    return true;
  }

  public async validateOmniStudioLicenses(): Promise<boolean> {
    try {
      const query =
        "SELECT count(DeveloperName) total FROM PermissionSetLicense WHERE PermissionSetLicenseKey LIKE 'OmniStudio%' AND Status = 'Active'";
      const result = await this.connection.query<{ total: string }>(query);

      // Salesforce returns records as an array in result.records
      if (result?.records && result?.records?.length > 0) {
        // Since we only get one record with the total count, check if count > 0
        const totalCount = Number(result.records[0].total);
        if (totalCount > 0) {
          return true;
        }
      }

      Logger.error(this.messages.getMessage('noOmniStudioLicenses'));
      return false;
    } catch (error) {
      if (error instanceof Error && error.message) {
        Logger.error(`Error validating OmniStudio licenses: ${error.message}`);
      } else {
        Logger.error('Error validating OmniStudio licenses: Unknown error');
      }
      return false;
    }
  }

  public async validateDrVersioningDisabled(): Promise<boolean> {
    Logger.logVerbose(this.messages.getMessage('validatingDrVersioningDisabled'));
    try {
      const drVersion = await OrgPreferences.checkDRVersioning(this.connection);
      if (!drVersion) {
        Logger.logVerbose(this.messages.getMessage('drVersioningDisabled'));
        return true;
      }
      Logger.error(this.messages.getMessage('drVersioningEnabled'));
    } catch (error) {
      Logger.error(this.messages.getMessage('errorValidatingDrVersioning'));
    }
    return false;
  }

  public async validateOmniInteractionConfig(): Promise<boolean> {
    Logger.logVerbose(this.messages.getMessage('validatingOmniInteractionConfig'));

    try {
      const query = `SELECT DeveloperName, Value FROM OmniInteractionConfig
      WHERE DeveloperName IN ('TheFirstInstalledOmniPackage', 'InstalledIndustryPackage')`;

      const result = await this.connection.query(query);
      if (result?.totalSize === 1) {
        Logger.logVerbose(this.messages.getMessage('queryResultSize', [1]));
        const records = result.records as Array<{ DeveloperName: string; Value: string }>;
        if (
          records[0].DeveloperName === 'TheFirstInstalledOmniPackage' &&
          records[0].Value === Constants.FoundationPackageName
        ) {
          Logger.logVerbose(this.messages.getMessage('packageDetails'));
          return true;
        }
        return false;
      } else if (result?.totalSize === 2) {
        Logger.logVerbose(this.messages.getMessage('queryResultSize', [2]));
        const records = result.records as Array<{ DeveloperName: string; Value: string }>;

        if (
          records[0].Value === Constants.FoundationPackageName ||
          records[1].Value === Constants.FoundationPackageName
        ) {
          return false;
        }

        if (records[0].Value === records[1].Value) {
          Logger.logVerbose(this.messages.getMessage('packagesHaveSameValue'));
          return true;
        }
      }
      return false;
    } catch (error) {
      Logger.error(this.messages.getMessage('failedToCheckPackagesValue'));
    }
    return false;
  }
}
