/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import { QueryTools } from '../query';
import { hasOnlyAlphanumericCharacters } from '../recordPrioritization';
import { Logger } from '../logger';
import { NetUtils, RequestMethod } from '../net';
import { Constants } from '../constants/stringContants';
import { createProgressBar } from '../../migration/base';

interface EntityConfig {
  objectName: string;
  entityName: string;
  nameFieldsToCheck: string[];
  filters?: Map<string, any>;
  // Extra fields to SELECT for label building that are not part of nameFieldsToCheck (e.g. Language)
  additionalLabelFields?: string[];
  // Builds a human-readable identifier matching the UniqueName format (used in error messages)
  buildLabel: (record: Record<string, unknown>) => string;
}

// Fields checked per entity are aligned with the UniqueName (Config DeveloperName) derivation:
//   OmniProcess:       UniqueName = Type_SubType_Language_Version      → check Type, SubType
//   OmniUiCard:        UniqueName = Name_AuthorName_Version            → check Name, AuthorName
//   OmniDataTransform: UniqueName = Name_Version                       → check Name
const ENTITY_CONFIGS: EntityConfig[] = [
  {
    objectName: Constants.OmniProcessObjectName,
    entityName: Constants.OmniScriptComponentName,
    nameFieldsToCheck: ['Type', 'SubType'],
    additionalLabelFields: ['Language'],
    filters: new Map([['IsIntegrationProcedure', false]]),
    buildLabel: (r): string =>
      `Type: ${String(r['Type'] ?? '')}, SubType: ${String(r['SubType'] ?? '')}, Language: ${String(
        r['Language'] ?? ''
      )}, Version: ${String(r['VersionNumber'] ?? '')}`,
  },
  {
    objectName: Constants.OmniProcessObjectName,
    entityName: Constants.IntegrationProcedureComponentName,
    nameFieldsToCheck: ['Type', 'SubType'],
    additionalLabelFields: ['Language'],
    filters: new Map([['IsIntegrationProcedure', true]]),
    buildLabel: (r): string =>
      `Type: ${String(r['Type'] ?? '')}, SubType: ${String(r['SubType'] ?? '')}, Language: ${String(
        r['Language'] ?? ''
      )}, Version: ${String(r['VersionNumber'] ?? '')}`,
  },
  {
    objectName: Constants.OmniUiCardObjectName,
    entityName: Constants.FlexCardComponentName,
    nameFieldsToCheck: ['Name', 'AuthorName'],
    buildLabel: (r): string =>
      `Name: ${String(r['Name'] ?? '')}, AuthorName: ${String(r['AuthorName'] ?? '')}, Version: ${String(
        r['VersionNumber'] ?? ''
      )}`,
  },
  {
    objectName: Constants.OmniDataTransformObjectName,
    entityName: Constants.DataMapperComponentName,
    nameFieldsToCheck: ['Name'],
    buildLabel: (r): string => `Name: ${String(r['Name'] ?? '')}, Version: ${String(r['VersionNumber'] ?? '')}`,
  },
];

export class SpecialCharacterRecordCleanupService {
  private readonly connection: Connection;
  private readonly messages: Messages<string>;

  // ux is accepted for API consistency with the rest of the codebase but not used directly —
  // createProgressBar renders to stdout independently of the Ux wrapper.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public constructor(connection: Connection, messages: Messages<string>, _ux: Ux) {
    this.connection = connection;
    this.messages = messages;
  }

  /**
   * Returns all records that would be deactivated and deleted per entity, without making any changes.
   * Keys are entity names (e.g. "OmniScript"). Values are the raw records including all label fields.
   */
  public async assess(): Promise<Map<string, Array<Record<string, unknown>>>> {
    Logger.log(this.messages.getMessage('assessSpecialCharPhaseStart'));
    const result = new Map<string, Array<Record<string, unknown>>>();
    for (const config of ENTITY_CONFIGS) {
      Logger.log(this.messages.getMessage('assessScanningEntity', [config.entityName]));
      try {
        const records = await this.getRecordsWithSpecialCharacters(config);
        if (records.length > 0) {
          Logger.log(this.messages.getMessage('assessEntityFound', [records.length, config.entityName]));
        } else {
          Logger.log(this.messages.getMessage('assessEntityNone', [config.entityName]));
        }
        result.set(config.entityName, records);
      } catch (error) {
        Logger.error(this.messages.getMessage('errorAssessingSpecialCharRecords', [config.entityName, String(error)]));
        result.set(config.entityName, []);
      }
    }
    return result;
  }

  public async deactivateAndDelete(): Promise<void> {
    Logger.log(this.messages.getMessage('specialCharCleanupPhaseStart'));
    for (const config of ENTITY_CONFIGS) {
      try {
        Logger.log(this.messages.getMessage('specialCharCleanupSectionStart', [config.entityName]));

        const records = await this.getRecordsWithSpecialCharacters(config);
        if (records.length === 0) {
          Logger.log(this.messages.getMessage('noSpecialCharRecords', [config.entityName]));
          continue;
        }

        Logger.log(this.messages.getMessage('foundSpecialCharRecordsToRemove', [records.length, config.entityName]));

        // Build a label map once so deactivation and deletion can both report human-readable identifiers
        const idToLabel = new Map(records.map((r) => [r.Id as string, config.buildLabel(r)]));
        const ids = Array.from(idToLabel.keys());
        const activeIds = records.filter((r) => r.IsActive === true).map((r) => r.Id as string);

        let failedDeactivateIds = new Set<string>();
        if (activeIds.length > 0) {
          failedDeactivateIds = await this.deactivateRecords(config, activeIds, idToLabel);
          await this.sleep();
        }

        // Skip records that failed deactivation to avoid attempting to delete still-active records
        const idsToDelete = ids.filter((id) => !failedDeactivateIds.has(id));
        await this.deleteRecords(config, idsToDelete, idToLabel);
      } catch (error) {
        Logger.error(this.messages.getMessage('errorRemovingSpecialCharRecords', [config.entityName, String(error)]));
      }
    }
  }

  private async getRecordsWithSpecialCharacters(config: EntityConfig): Promise<Array<Record<string, unknown>>> {
    // VersionNumber and additionalLabelFields are included so buildLabel can produce a complete identifier
    const queryFields = [
      'Id',
      'IsActive',
      'VersionNumber',
      ...config.nameFieldsToCheck,
      ...(config.additionalLabelFields ?? []),
    ];
    const allRecords = await QueryTools.query(this.connection, config.objectName, queryFields, config.filters);

    const results: Array<Record<string, unknown>> = [];
    for (const record of allRecords) {
      const hasSpecialChars = config.nameFieldsToCheck.some((field) => {
        const value = String(record[field] || '');
        return value && !hasOnlyAlphanumericCharacters(value);
      });
      if (hasSpecialChars) {
        results.push(record as Record<string, unknown>);
      }
    }
    return results;
  }

  private async deactivateRecords(
    config: EntityConfig,
    ids: string[],
    idToLabel: Map<string, string>
  ): Promise<Set<string>> {
    Logger.log(this.messages.getMessage('deactivatingRecords', [ids.length, config.entityName]));

    const bar = createProgressBar('Deactivating', config.entityName as any);
    bar.start(ids.length, 0);

    const failedIds = new Set<string>();
    // Deactivate one at a time to avoid UNKNOWN_ERROR on OmniProcess (matches existing migration pattern)
    for (const id of ids) {
      try {
        await NetUtils.request(
          this.connection,
          `sobjects/${config.objectName}/${id}`,
          { IsActive: false },
          RequestMethod.PATCH
        );
      } catch (error) {
        const label = idToLabel.get(id) ?? id;
        Logger.error(this.messages.getMessage('deactivationFailed', [config.entityName, label, String(error)]));
        failedIds.add(id);
      }
      bar.increment();
    }
    bar.stop();

    Logger.log(this.messages.getMessage('deactivatedRecords', [ids.length - failedIds.size, config.entityName]));
    return failedIds;
  }

  private async deleteRecords(config: EntityConfig, ids: string[], idToLabel: Map<string, string>): Promise<void> {
    Logger.log(this.messages.getMessage('deletingRecords', [ids.length, config.entityName]));

    const bar = createProgressBar('Deleting', config.entityName as any);
    bar.start(ids.length, 0);

    // Delete one at a time using jsforce sobject delete to avoid ECONNRESET on composite/sobjects endpoint
    for (const id of ids) {
      try {
        await this.connection.sobject(config.objectName).delete(id);
      } catch (error) {
        const label = idToLabel.get(id) ?? id;
        Logger.error(this.messages.getMessage('deletionFailed', [config.entityName, label, String(error)]));
      }
      bar.increment();
    }

    Logger.log(this.messages.getMessage('deletedRecords', [ids.length, config.entityName]));
  }

  private sleep(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });
  }
}
