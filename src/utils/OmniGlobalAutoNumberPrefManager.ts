import { Connection } from '@salesforce/core';
import { MetadataInfo } from './interfaces';
import { Logger } from './logger';

/**
 * Manager class for handling OmniGlobalAutoNumberPref org preference operations.
 *
 * Provides functionality to check and enable the Global Auto Number preference in Salesforce orgs.
 * Uses metadata API to read and update OmniStudioSettings metadata.
 * Controls whether the new Global Auto Number functionality is available in the org.
 *
 */
export class OmniGlobalAutoNumberPrefManager {
  private connection: Connection;

  public constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Checks if the Global Auto Number preference is enabled in the current org.
   *
   * Queries the OmniStudioSettings metadata to determine the current state of the preference.
   * Reads the enableOmniGlobalAutoNumberPref setting from metadata API.
   * Determines whether the Global Auto Number functionality is already active.
   *
   * @returns {Promise<boolean>} True if the preference is enabled, false otherwise
   *
   * @throws {Error} When metadata read operation fails (logged and returns false)
   *
   */
  public async isEnabled(): Promise<boolean> {
    try {
      const result = (await this.connection.metadata.read('OmniStudioSettings', ['OmniStudio'])) as MetadataInfo;
      return result?.enableOmniGlobalAutoNumberPref === 'true' || false;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`Error checking OmniGlobalAutoNumberPref status: ${errMsg}`);
      return false;
    }
  }

  /**
   * Enables the Global Auto Number preference in the current org.
   *
   * Updates the OmniStudioSettings metadata to enable the Global Auto Number functionality.
   * Uses metadata API to set enableOmniGlobalAutoNumberPref to 'true'.
   * Activates the new Global Auto Number functionality after migration is complete.
   *
   * @returns {Promise<any>} Metadata update result containing success status and any errors
   *
   * @throws {Error} When metadata update operation fails
   *
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async enable(): Promise<any> {
    const result = await this.connection.metadata.update('OmniStudioSettings', [
      {
        fullName: 'OmniStudio',
        enableOmniGlobalAutoNumberPref: 'true',
      } as MetadataInfo,
    ]);
    return result;
  }
}
