/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Connection, Messages } from '@salesforce/core';
import { QueryTools } from '../query';
import { hasOnlyAlphanumericCharacters } from '../recordPrioritization';
import { Logger } from '../logger';
import { NetUtils, RequestMethod } from '../net';
import { Constants } from '../constants/stringContants';

interface EntityConfig {
  objectName: string;
  entityName: string;
  nameFieldsToCheck: string[];
  filters?: Map<string, any>;
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
    filters: new Map([['IsIntegrationProcedure', false]]),
  },
  {
    objectName: Constants.OmniProcessObjectName,
    entityName: Constants.IntegrationProcedureComponentName,
    nameFieldsToCheck: ['Type', 'SubType'],
    filters: new Map([['IsIntegrationProcedure', true]]),
  },
  {
    objectName: Constants.OmniUiCardObjectName,
    entityName: Constants.FlexCardComponentName,
    nameFieldsToCheck: ['Name', 'AuthorName'],
  },
  {
    objectName: Constants.OmniDataTransformObjectName,
    entityName: Constants.DataMapperComponentName,
    nameFieldsToCheck: ['Name'],
  },
];

export class SpecialCharacterRecordCleanupService {
  private readonly connection: Connection;
  private readonly messages: Messages<string>;

  public constructor(connection: Connection, messages: Messages<string>) {
    this.connection = connection;
    this.messages = messages;
  }

  public async deactivateAndDelete(): Promise<void> {
    for (const config of ENTITY_CONFIGS) {
      try {
        const records = await this.getRecordsWithSpecialCharacters(config);
        if (records.length === 0) {
          Logger.log(this.messages.getMessage('noSpecialCharRecords', [config.entityName]));
          continue;
        }

        Logger.log(this.messages.getMessage('foundSpecialCharRecordsToRemove', [records.length, config.entityName]));

        const ids: string[] = records.map((r) => r.Id as string);
        const activeIds: string[] = records.filter((r) => r.IsActive === true).map((r) => r.Id as string);

        if (activeIds.length > 0) {
          await this.deactivateRecords(config, activeIds);
          await this.sleep();
        }

        await this.deleteRecords(config, ids);
      } catch (error) {
        Logger.error(this.messages.getMessage('errorRemovingSpecialCharRecords', [config.entityName, String(error)]));
      }
    }
  }

  private async getRecordsWithSpecialCharacters(config: EntityConfig): Promise<Array<Record<string, unknown>>> {
    const queryFields = ['Id', 'IsActive', ...config.nameFieldsToCheck];
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

  private async deactivateRecords(config: EntityConfig, ids: string[]): Promise<void> {
    Logger.log(this.messages.getMessage('deactivatingRecords', [ids.length, config.entityName]));

    // Deactivate one at a time to avoid UNKNOWN_ERROR on OmniProcess (matches existing migration pattern)
    for (const id of ids) {
      await NetUtils.request(
        this.connection,
        `sobjects/${config.objectName}/${id}`,
        { IsActive: false },
        RequestMethod.PATCH
      );
    }

    Logger.log(this.messages.getMessage('deactivatedRecords', [ids.length, config.entityName]));
  }

  private async deleteRecords(config: EntityConfig, ids: string[]): Promise<void> {
    Logger.log(this.messages.getMessage('deletingRecords', [ids.length, config.entityName]));

    // Delete one at a time using jsforce sobject delete to avoid ECONNRESET on composite/sobjects endpoint
    for (const id of ids) {
      await this.connection.sobject(config.objectName).delete(id);
    }

    Logger.log(this.messages.getMessage('deletedRecords', [ids.length, config.entityName]));
  }

  private sleep(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });
  }
}
