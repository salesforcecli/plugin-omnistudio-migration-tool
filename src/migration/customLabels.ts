/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Ux } from '@salesforce/sf-plugins-core';
import { Connection, Messages } from '@salesforce/core';
import { NetUtils, RequestMethod } from '../utils/net';
import { Logger } from '../utils/logger';
import { Constants } from '../utils/constants/stringContants';
import { BaseMigrationTool } from './base';
import { MigrationTool, MigrationResult, ObjectMapping } from './interfaces';

export interface CustomLabelMigrationResult {
  coreInfo: {
    id: string;
    value: string;
  };
  message: string;
  name: string;
  packageInfo: {
    id: string;
    value: string;
  };
  status: string;
}

export interface CustomLabelLocalizationResult {
  [labelName: string]: {
    [languageCode: string]: string;
  };
}

export interface CustomLabelMigrationResponse {
  results: CustomLabelMigrationResult[];
}

export interface CustomLabelLocalizationResponse {
  results: CustomLabelLocalizationResult;
}

export interface CustomLabelRecord {
  labelName?: string;
  Name?: string;
  Id?: string;
  name?: string;
  status?: string;
  cloneStatus?: string;
  message?: string;
  coreInfo?: {
    id: string;
    value: string;
  };
  packageInfo?: {
    id: string;
    value: string;
  };
  errors?: string[];
  warnings?: string[];
}

export class CustomLabelsMigrationTool extends BaseMigrationTool implements MigrationTool {
  public constructor(namespace: string, connection: Connection, logger: Logger, messages: Messages<string>, ux: Ux) {
    super(namespace, connection, logger, messages, ux);
  }

  public getName(): string {
    return 'Custom Labels';
  }

  public getRecordName(record: CustomLabelRecord): string {
    return record.labelName || record.Name || 'Unknown';
  }

  public getMappings(): ObjectMapping[] {
    return [
      {
        source: 'Custom Labels',
        target: 'Custom Labels',
      },
    ];
  }

  public async truncate(): Promise<void> {
    // Custom labels don't need truncation as they are created via API
    Logger.log(this.messages.getMessage('skippingCustomLabelTruncation'));
    await Promise.resolve();
  }

  public async migrate(): Promise<MigrationResult[]> {
    try {
      Logger.log(this.messages.getMessage('startingCustomLabelMigration'));

      const migrationData = new Map<string, any>();
      const allMigrationData = new Map<string, any>();
      const errors: string[] = [];

      // Call clone-custom-labels API only
      const cloneLabelsResponse = await this.callCloneCustomLabelsAPI();

      // Call localizations API but ignore response (as per requirements)
      await this.callCloneCustomLabelLocalizationsAPI();

      // Get total count from API response
      const totalLabels = cloneLabelsResponse.results ? cloneLabelsResponse.results.length : 0;

      // Process results
      if (cloneLabelsResponse.results) {
        cloneLabelsResponse.results.forEach((labelResult) => {
          const key = labelResult.name;
          const { mappedStatus, hasErrors } = this.mapCloneStatusToMigrationStatus(labelResult.status);

          // Store all records for CSV export
          allMigrationData.set(key, {
            labelName: labelResult.name,
            cloneStatus: labelResult.status,
            message: labelResult.message,
            coreInfo: labelResult.coreInfo,
            packageInfo: labelResult.packageInfo,
          });

          // Only include error and duplicate (where message is not "same value") in report table
          if (
            Constants.CustomLabelInvalidStatuses.includes(labelResult.status) &&
            !(labelResult.status === 'duplicate' && labelResult.message === Constants.CustomLabelSameValueMessage)
          ) {
            // Store consolidated data that can be used for both dashboard and detailed reporting
            const recordData = {
              // Properties needed for dashboard status calculation
              id: labelResult.name,
              name: labelResult.name,
              status: mappedStatus,
              errors: labelResult.status === Constants.CustomLabelErrorStatus ? [labelResult.message] : [],
              warnings: labelResult.status === Constants.CustomLabelDuplicateStatus ? [labelResult.message] : [],
              migratedId: labelResult.name,
              migratedName: labelResult.name,

              // Additional properties needed for detailed reporting
              labelName: labelResult.name,
              cloneStatus: labelResult.status,
              message: labelResult.message,
              coreInfo: labelResult.coreInfo,
              packageInfo: labelResult.packageInfo,

              // Legacy properties for compatibility
              referenceId: key,
              newName: labelResult.name,
              hasErrors,
              success: false, // We only process error and duplicate, so success is always false
              skipped: labelResult.status === Constants.CustomLabelDuplicateStatus,
              type: Constants.CustomLabelComponentName,
            };

            migrationData.set(key, recordData);
          }
        });
      }

      const processedLabels = migrationData.size;
      Logger.log(this.messages.getMessage('customLabelMigrationCompleted', [processedLabels, totalLabels]));

      return [
        {
          name: this.getName(),
          results: migrationData, // Use single consolidated map
          records: migrationData, // Both point to the same data
          errors,
          totalCount: totalLabels, // Use totalCount instead of statistics
          allRecords: allMigrationData, // All records for CSV export
        },
      ];
    } catch (error) {
      Logger.error(this.messages.getMessage('errorDuringCustomLabelMigration', [(error as Error).message]));
      const emptyMap = new Map();
      return [
        {
          name: this.getName(),
          results: emptyMap,
          records: emptyMap, // Both point to the same empty map
          errors: [this.messages.getMessage('customLabelMigrationErrorMessage')],
          allRecords: emptyMap,
        },
      ];
    }
  }

  private async callCloneCustomLabelsAPI(): Promise<CustomLabelMigrationResponse> {
    try {
      const url = 'connect/omni-runtime/omniscript/clone-custom-labels';
      const body = {
        namespace: this.namespace,
      };

      Logger.logVerbose(this.messages.getMessage('callingCloneCustomLabelsAPI', [this.namespace]));

      const response = await NetUtils.request(this.connection, url, body, RequestMethod.POST);

      const typedResponse = response as CustomLabelMigrationResponse;
      Logger.logVerbose(
        this.messages.getMessage('cloneCustomLabelsAPIResponse', [
          typedResponse.results ? typedResponse.results.length : 0,
        ])
      );

      return response as CustomLabelMigrationResponse;
    } catch (error) {
      Logger.error(this.messages.getMessage('errorCallingCloneCustomLabelsAPI', [String(error)]));
      throw error;
    }
  }

  private async callCloneCustomLabelLocalizationsAPI(): Promise<CustomLabelLocalizationResponse> {
    try {
      const url = 'connect/omni-runtime/omniscript/clone-custom-label-localizations';
      const body = {
        namespace: this.namespace,
      };

      Logger.logVerbose(this.messages.getMessage('callingCloneCustomLabelLocalizationsAPI', [this.namespace]));

      const response = await NetUtils.request(this.connection, url, body, RequestMethod.POST);

      const typedResponse = response as CustomLabelLocalizationResponse;
      Logger.logVerbose(
        this.messages.getMessage('cloneCustomLabelLocalizationsAPIResponse', [
          typedResponse.results ? Object.keys(typedResponse.results).length : 0,
        ])
      );

      return response as CustomLabelLocalizationResponse;
    } catch (error) {
      Logger.error(this.messages.getMessage('errorCallingCloneCustomLabelLocalizationsAPI', [String(error)]));
      throw error;
    }
  }

  /**
   * Maps Custom Labels API clone status to migration status format
   *
   * New mapping:
   * Successfully migrated = total - error
   * Failed = error
   * Skipped = duplicate
   *
   * @param cloneStatus - The status returned by the clone API
   * @returns Object containing mapped status and error flag
   */
  private mapCloneStatusToMigrationStatus(cloneStatus: string): { mappedStatus: string; hasErrors: boolean } {
    switch (cloneStatus) {
      case 'created':
        return { mappedStatus: 'Successfully migrated', hasErrors: false };
      case 'error':
        return { mappedStatus: 'Failed', hasErrors: true };
      case 'duplicate':
        return { mappedStatus: 'Skipped', hasErrors: false };
      default:
        return { mappedStatus: 'Skipped', hasErrors: false };
    }
  }
}
