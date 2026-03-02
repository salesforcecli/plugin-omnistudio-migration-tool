/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Connection, Messages } from '@salesforce/core';
import { Logger } from '../logger';
import { NetUtils, RequestMethod } from '../net';
import { Constants } from '../constants/stringContants';

const BATCH_SIZE = 50;

// DeveloperName formats per Config table:
//   OmniScriptConfig / OmniIntegrationProcConfig : Type_SubType_Language_Version  (4+ parts)
//   OmniDataTransformConfig                       : Name_Version                   (last _ splits name/version)
//   OmniUiCardConfig                              : Name_AuthorName_Version        (last = version, second-last = author, rest = name)

interface EntityConfig {
  configTable: string;
  entityName: string;
  objectName: string;
  // Parses one DeveloperName into a deduplication key + version number (null = skip)
  parseDeveloperName: (developerName: string) => { mapKey: string; version: number } | null;
  // Builds the SOQL WHERE clause from a mapKey and a comma-separated versions string
  buildSoqlWhere: (mapKey: string, versionsStr: string) => string;
}

interface RecordRef {
  Id: string;
  IsActive: boolean;
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function escapeSoql(value: string): string {
  return value.replace(/'/g, "\\'");
}

// Shared parser for OmniScript and IntegrationProcedure (same DeveloperName format)
function parseOmniProcessDeveloperName(developerName: string): { mapKey: string; version: number } | null {
  const parts = developerName.split('_');
  if (parts.length < 4) return null;
  const version = parseFloat(parts[3]);
  if (isNaN(version)) return null;
  return { mapKey: `${parts[0]}_${parts[1]}_${parts[2]}`, version };
}

function buildOmniProcessWhere(mapKey: string, versionsStr: string, isIP: boolean): string {
  const [type, subType, language] = mapKey.split('_');
  const languageFilter =
    language === 'multiLanguage' ? "Language = 'Multi-Language'" : `Language = '${escapeSoql(language)}'`;
  return (
    `IsIntegrationProcedure = ${isIP}` +
    ` AND Type = '${escapeSoql(type)}'` +
    ` AND SubType = '${escapeSoql(subType)}'` +
    ` AND ${languageFilter}` +
    ` AND VersionNumber IN (${versionsStr}) AND UniqueName = null`
  );
}

// ── Config-driven entity definitions (mirrors SpecialCharacterRecordRemover pattern) ─

const ENTITY_CONFIGS: EntityConfig[] = [
  {
    configTable: Constants.OmniScriptConfigTable,
    entityName: Constants.OmniScriptComponentName,
    objectName: Constants.OmniProcessObjectName,
    parseDeveloperName: parseOmniProcessDeveloperName,
    buildSoqlWhere: (mapKey, versionsStr): string => buildOmniProcessWhere(mapKey, versionsStr, false),
  },
  {
    configTable: Constants.OmniIntegrationProcConfigTable,
    entityName: Constants.IntegrationProcedureComponentName,
    objectName: Constants.OmniProcessObjectName,
    parseDeveloperName: parseOmniProcessDeveloperName,
    buildSoqlWhere: (mapKey, versionsStr): string => buildOmniProcessWhere(mapKey, versionsStr, true),
  },
  {
    configTable: Constants.OmniDataTransformConfigTable,
    entityName: Constants.DataMapperComponentName,
    objectName: Constants.OmniDataTransformObjectName,
    parseDeveloperName: (developerName): { mapKey: string; version: number } | null => {
      const lastUnderscore = developerName.lastIndexOf('_');
      if (lastUnderscore <= 0 || lastUnderscore >= developerName.length - 1) return null;
      const version = parseFloat(developerName.substring(lastUnderscore + 1));
      if (isNaN(version)) return null;
      return { mapKey: developerName.substring(0, lastUnderscore), version };
    },
    buildSoqlWhere: (mapKey, versionsStr): string =>
      `Name = '${escapeSoql(mapKey)}' AND VersionNumber IN (${versionsStr}) AND UniqueName = null`,
  },
  {
    configTable: Constants.OmniUiCardConfigTable,
    entityName: Constants.FlexCardComponentName,
    objectName: Constants.OmniUiCardObjectName,
    parseDeveloperName: (developerName): { mapKey: string; version: number } | null => {
      const parts = developerName.split('_');
      if (parts.length < 3) return null;
      const version = parseFloat(parts[parts.length - 1]);
      if (isNaN(version)) return null;
      const authorName = parts[parts.length - 2];
      const name = parts[0];
      return { mapKey: `${name}_${authorName}`, version };
    },
    buildSoqlWhere: (mapKey, versionsStr): string => {
      const [name, authorName] = mapKey.split('_');
      return (
        `Name = '${escapeSoql(name)}' AND AuthorName = '${escapeSoql(authorName)}'` +
        ` AND VersionNumber IN (${versionsStr}) AND UniqueName = null`
      );
    },
  },
];

// ── Class ─────────────────────────────────────────────────────────────────────

export class ExistingRecordCleanupService {
  private readonly connection: Connection;
  private readonly messages: Messages<string>;

  public constructor(connection: Connection, messages: Messages<string>) {
    this.connection = connection;
    this.messages = messages;
  }

  public async cleanAll(): Promise<void> {
    for (const config of ENTITY_CONFIGS) {
      await this.processEntity(config);
    }
    Logger.log(this.messages.getMessage('nullUniqueNameCleanupComplete'));
  }

  // ── Generic per-entity pipeline ──────────────────────────────────────────

  private async processEntity(config: EntityConfig): Promise<void> {
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const developerNames = await this.fetchConfigDeveloperNames(config.configTable, offset);
      if (developerNames.length === 0) break;

      const versionMap = this.buildVersionMap(developerNames, config.parseDeveloperName);
      if (versionMap.size > 0) {
        const records = await this.queryRecords(config.objectName, versionMap, config.buildSoqlWhere);
        await this.deactivateAndDeleteRecords(config.objectName, config.entityName, records);
      }

      offset += BATCH_SIZE;
      if (developerNames.length < BATCH_SIZE) hasMore = false;
    }
  }

  private async fetchConfigDeveloperNames(configTable: string, offset: number): Promise<string[]> {
    const result = await this.connection.query<{ DeveloperName: string }>(
      `SELECT DeveloperName FROM ${configTable} LIMIT ${BATCH_SIZE} OFFSET ${offset}`
    );
    return result.records.map((r) => r.DeveloperName);
  }

  // Groups devNames into a Map<mapKey, Set<version>> using the entity-specific parser
  private buildVersionMap(
    developerNames: string[],
    parseDeveloperName: EntityConfig['parseDeveloperName']
  ): Map<string, Set<number>> {
    const versionMap = new Map<string, Set<number>>();
    for (const developerName of developerNames) {
      const parsed = parseDeveloperName(developerName);
      if (parsed) {
        if (!versionMap.has(parsed.mapKey)) versionMap.set(parsed.mapKey, new Set());
        versionMap.get(parsed.mapKey)?.add(parsed.version);
      }
    }
    return versionMap;
  }

  // Queries the main object for records with UniqueName = null matching each key
  private async queryRecords(
    objectName: string,
    versionMap: Map<string, Set<number>>,
    buildSoqlWhere: EntityConfig['buildSoqlWhere']
  ): Promise<RecordRef[]> {
    const records: RecordRef[] = [];
    for (const [mapKey, versions] of versionMap) {
      const versionsStr = Array.from(versions).join(', ');
      const soql = `SELECT Id, IsActive FROM ${objectName} WHERE ${buildSoqlWhere(mapKey, versionsStr)} LIMIT 100`;
      const result = await this.connection.query<RecordRef>(soql);
      records.push(...result.records);
    }
    return records;
  }

  // ── Shared deactivate + delete ───────────────────────────────────────────

  private async deactivateAndDeleteRecords(
    objectName: string,
    entityName: string,
    records: RecordRef[]
  ): Promise<void> {
    if (records.length === 0) {
      Logger.log(this.messages.getMessage('noNullUniqueNameRecords', [entityName]));
      return;
    }

    Logger.log(this.messages.getMessage('foundNullUniqueNameRecords', [records.length, entityName]));

    const activeIds = records.filter((r) => r.IsActive).map((r) => r.Id);
    const failedDeactivateIds = new Set<string>();

    if (activeIds.length > 0) {
      Logger.log(this.messages.getMessage('deactivatingRecords', [activeIds.length, entityName]));
      // Deactivate one at a time to avoid UNKNOWN_ERROR (matches existing migration pattern)
      for (const id of activeIds) {
        try {
          await NetUtils.request(
            this.connection,
            `sobjects/${objectName}/${id}`,
            { IsActive: false },
            RequestMethod.PATCH
          );
        } catch {
          // If deactivation fails, exclude from deletion (matches Apex error handling)
          failedDeactivateIds.add(id);
        }
      }
      Logger.log(
        this.messages.getMessage('deactivatedRecords', [activeIds.length - failedDeactivateIds.size, entityName])
      );
      await this.sleep();
    }

    const idsToDelete = records.map((r) => r.Id).filter((id) => !failedDeactivateIds.has(id));

    Logger.log(this.messages.getMessage('deletingRecords', [idsToDelete.length, entityName]));
    for (const id of idsToDelete) {
      try {
        await this.connection.sobject(objectName).delete(id);
      } catch (error) {
        Logger.error(this.messages.getMessage('errorCleaningNullUniqueNameRecords', [entityName, String(error)]));
      }
    }
    Logger.log(this.messages.getMessage('deletedRecords', [idsToDelete.length, entityName]));
  }

  private sleep(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });
  }
}
