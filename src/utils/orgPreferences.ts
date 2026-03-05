import { Connection, Messages } from '@salesforce/core';
import {
  OmniStudioSettingsMetadata,
  ExperienceBundleSettingsMetadata,
  QueryResult,
  ExperienceBundleSettingsReadMetadata,
  MetadataInfo,
} from './interfaces';
import { Logger } from './logger';
import { Constants } from './constants/stringContants';

// Load messages
Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'migrate');

/**
 * Class to manage OmniStudio organization preferences
 *
 * @class OrgPreferences
 * @description Provides functionality to enable OmniStudio preferences and check rollback flags
 */
export class OrgPreferences {
  /**
   * List of rollback flags to check in OmniInteractionConfig
   *
   * @private
   * @static
   * @readonly
   * @type {string[]}
   */
  private static readonly ROLLBACK_FLAGS: string[] = ['RollbackIPChanges', 'RollbackDRChanges', 'RollbackOSChanges'];

  /**
   * Enables the disableRollbackFlagsPref setting in OmniStudio
   *
   * @public
   * @static
   * @async
   * @param {Connection} connection - Salesforce connection instance
   * @throws {Error} If enabling the preference fails
   * @returns {Promise<void>}
   */
  public static async enableOmniPreferences(connection: Connection): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      await (connection.metadata.update as any)('OmniStudioSettings', [
        {
          fullName: 'OmniStudio',
          disableRollbackFlagsPref: true,
        } as OmniStudioSettingsMetadata,
      ]);
    } catch (error) {
      throw new Error(
        `Failed to enable disableRollbackFlagsPref: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  public static async checkDRVersioning(connection: Connection): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
      const result = await (connection.metadata.read as any)('OmniStudioSettings', [
        'OmniStudioDrVersionOrgPreference',
      ]);
      Logger.captureVerboseData('DR version response', result);
      const metadata = (Array.isArray(result) ? result[0] : result) as MetadataInfo;
      return metadata?.enableOmniStudioDrVersion === 'true';
    } catch (error) {
      throw new Error(`Failed to read DR version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Checks which rollback flags are enabled in OmniInteractionConfig
   *
   * @public
   * @static
   * @async
   * @param {Connection} connection - Salesforce connection instance
   * @throws {Error} If checking rollback flags fails
   * @returns {Promise<string[]>} Array of enabled rollback flag names
   */
  public static async checkRollbackFlags(connection: Connection): Promise<string[]> {
    try {
      const result = await connection.query<QueryResult>(
        `SELECT DeveloperName, Value FROM OmniInteractionConfig WHERE DeveloperName IN ('${this.ROLLBACK_FLAGS.join(
          "','"
        )}')`
      );
      const enabledFlags: string[] = [];
      for (const record of result.records) {
        if (record.Value === 'true') {
          enabledFlags.push(record.DeveloperName);
        }
      }
      return enabledFlags;
    } catch (error: unknown) {
      // Check if error is INVALID_TYPE for OmniInteractionConfig (indicating no OmniStudio permissions)
      if (this.isOmniInteractionConfigInvalidTypeError(error)) {
        Logger.warn(messages.getMessage('omniStudioPermissionsNotEnabled'));
        return []; // Return empty array instead of throwing
      }

      // Generic error handling for other errors
      throw new Error(`Failed to check rollback flags: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Checks if the ExperienceBundle Metadata API is already enabled
   *
   * @public
   * @static
   * @async
   * @param {Connection} connection - Salesforce connection instance
   * @throws {Error} If checking the setting fails
   * @returns {Promise<boolean>} True if the ExperienceBundle Metadata API is enabled, false otherwise
   */
  public static async isExperienceBundleMetadataAPIEnabled(connection: Connection): Promise<boolean> {
    try {
      const result = await connection.metadata.read('ExperienceBundleSettings', ['ExperienceBundle']);
      Logger.logVerbose(`ExperienceBundle metadata API response: ${JSON.stringify(result)}`);

      // Check if the result is valid and contains the expected property
      let settings: ExperienceBundleSettingsReadMetadata = {
        fullName: '',
        enableExperienceBundleMetadata: 'false',
      };
      if (result && Array.isArray(result) && result.length > 0) {
        settings = result[0] as unknown as ExperienceBundleSettingsReadMetadata;
      } else if (result && typeof result === 'object' && 'enableExperienceBundleMetadata' in result) {
        settings = result as unknown as ExperienceBundleSettingsReadMetadata;
      } else {
        return false;
      }

      // Handle both boolean true and string "true"
      const value = settings.enableExperienceBundleMetadata;
      if (value === 'true') {
        return true;
      }

      // If no settings found or property is undefined, assume it's disabled
      return false;
    } catch (error) {
      // If the metadata type doesn't exist or there's an error, assume it's disabled
      Logger.error('We couldn’t check the ExperienceBundle metadata API status.');
      return false;
    }
  }

  public static async toggleExperienceBundleMetadataAPI(connection: Connection, enable: boolean): Promise<void> {
    await connection.metadata.update('ExperienceBundleSettings', [
      {
        fullName: 'ExperienceBundle',
        enableExperienceBundleMetadata: enable,
      } as ExperienceBundleSettingsMetadata,
    ]);
  }

  /**
   * Sets the ExperienceBundle Metadata API setting in Digital Experience Settings
   *
   * @public
   * @static
   * @async
   * @param {Connection} connection - Salesforce connection instance
   * @throws {Error} If enabling the setting fails
   * @returns {Promise<boolean>} True if successfully set, false otherwise
   */
  public static async setExperienceBundleMetadataAPI(connection: Connection, enable: boolean): Promise<boolean> {
    try {
      // Enable the setting
      await OrgPreferences.toggleExperienceBundleMetadataAPI(connection, enable);

      Logger.logVerbose(`Successfully set the experienceBundleMetadata API to ${enable}`);
      return true;
    } catch (error) {
      Logger.error(
        `Failed to enable ExperienceBundle Metadata API: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Checks if OmniStudio designers are already using the standard data model for the specific package.
   *
   * @public
   * @static
   * @async
   * @param {Connection} connection - Salesforce connection instance
   * @param {string} namespaceToModify - The namespace to check for standard designer
   * @throws {Error} If checking the standard designer status fails
   * @returns {Promise<boolean>} True if standard designer is enabled, false otherwise
   */
  public static async isStandardDesignerEnabled(connection: Connection, namespaceToModify: string): Promise<boolean> {
    try {
      const query = `SELECT DeveloperName, Value FROM OmniInteractionConfig
      WHERE DeveloperName IN ('TheFirstInstalledOmniPackage', 'InstalledIndustryPackage')`;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await connection.query(query);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (result?.totalSize > 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const records = result.records as Array<{ DeveloperName: string; Value: string }>;

        for (const record of records) {
          if (record.Value === namespaceToModify) {
            return true;
          }
        }
        return false;
      } else {
        return false;
      }
    } catch (error: unknown) {
      // Check if error is INVALID_TYPE for OmniInteractionConfig (indicating no OmniStudio permissions)
      if (this.isOmniInteractionConfigInvalidTypeError(error)) {
        Logger.warn(messages.getMessage('omniStudioPermissionsNotEnabled'));
        return false; // Fall back to use case 1 since the org doesn't have OmniStudio permissions enabled
      }

      // Generic error handling for other errors
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`Error checking standard designer for namespace ${namespaceToModify}: ${errMsg}`);
      return false;
    }
  }

  public static async isFoundationPackage(connection: Connection): Promise<boolean> {
    try {
      const query = `SELECT DeveloperName, Value FROM OmniInteractionConfig
      WHERE DeveloperName = 'TheFirstInstalledOmniPackage'`;

      const result = await connection.query(query);
      if (result?.totalSize === 1) {
        const records = result.records as Array<{ DeveloperName: string; Value: string }>;

        if (records[0].Value === Constants.FoundationPackageName) {
          return true;
        }
      }

      return false;
    } catch (error: unknown) {
      // Check if error is INVALID_TYPE for OmniInteractionConfig (indicating no OmniStudio permissions)
      if (this.isOmniInteractionConfigInvalidTypeError(error)) {
        Logger.warn(messages.getMessage('omniStudioPermissionsNotEnabled'));
        return false; // Fall back to use case 1 since the org doesn't have OmniStudio permissions enabled
      }

      // Generic error handling for other errors
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`Error checking foundation package : ${errMsg}`);
      return false;
    }
  }

  /**
   * Checks if an error is an INVALID_TYPE error for OmniInteractionConfig
   * This indicates that the org doesn't have OmniStudio permissions enabled
   *
   * @private
   * @static
   * @param {unknown} error - The error to check
   * @returns {boolean} True if the error is an INVALID_TYPE error for OmniInteractionConfig
   */
  private static isOmniInteractionConfigInvalidTypeError(error: unknown): boolean {
    return (
      error !== null &&
      error !== undefined &&
      typeof error === 'object' &&
      'errorCode' in error &&
      (error as { errorCode: unknown }).errorCode === 'INVALID_TYPE' &&
      'message' in error &&
      String((error as { message: unknown }).message).includes('OmniInteractionConfig')
    );
  }
}
