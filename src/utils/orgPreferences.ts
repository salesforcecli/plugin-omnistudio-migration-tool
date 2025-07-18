import { Connection } from '@salesforce/core';
import {
  OmniStudioSettingsMetadata,
  ExperienceBundleSettingsMetadata,
  QueryResult,
  ExperienceBundleSettingsReadMetadata,
} from './interfaces';
import { Logger } from './logger';

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
      await connection.metadata.update('OmniStudioSettings', [
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
    } catch (error) {
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
      Logger.logVerbose(`The api is returning ${JSON.stringify(result)}`);

      // Check if the result is valid and contains the expected property
      let settings: ExperienceBundleSettingsReadMetadata = {
        fullName: '',
        enableExperienceBundleMetadata: 'false',
      };
      if (result && Array.isArray(result) && result.length > 0) {
        settings = result[0] as ExperienceBundleSettingsReadMetadata;
      } else if (result && typeof result === 'object' && 'enableExperienceBundleMetadata' in result) {
        settings = result as ExperienceBundleSettingsReadMetadata;
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
      Logger.error('Unable to check ExperienceBundle Metadata API status');
      return false;
    }
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
      await connection.metadata.update('ExperienceBundleSettings', [
        {
          fullName: 'ExperienceBundle',
          enableExperienceBundleMetadata: enable,
        } as ExperienceBundleSettingsMetadata,
      ]);

      Logger.logVerbose(`Successfully set the experienceBundleMetadata API to ${enable}`);
      return true;
    } catch (error) {
      Logger.error(
        `Failed to enable ExperienceBundle Metadata API: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }
}
