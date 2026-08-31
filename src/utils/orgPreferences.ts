import { Connection } from '@salesforce/core';
import { Logger } from './logger';

/**
 * Class to manage OmniStudio organization preferences
 *
 * @class OrgPreferences
 * @description Provides functionality to enable OmniStudio preferences and check rollback flags
 */
export class OrgPreferences {
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
    } catch (error) {
      // TODO: What should be the default behavior if the query fails?
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`Error checking standard designer for namespace ${namespaceToModify}: ${errMsg}`);
      return false;
    }
  }
}
