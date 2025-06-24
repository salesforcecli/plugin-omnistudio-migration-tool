import { Connection } from '@salesforce/core';
import { OmniStudioSettingsMetadata, QueryResult } from './interfaces';

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
}
