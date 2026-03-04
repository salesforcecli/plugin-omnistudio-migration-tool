/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import { Logger } from '../logger';
import { NetUtils, RequestMethod } from '../net';
import { Constants } from '../constants/stringContants';
import { createProgressBar } from '../../migration/base';

const BATCH_SIZE = 50;

// DeveloperName formats per Config table:
//   OmniScriptConfig / OmniIntegrationProcConfig : Type_SubType_Language_Version  (4+ parts)
//   OmniDataTransformConfig                       : Name_Version                   (last _ splits name/version)
//   OmniUiCardConfig                              : Name_AuthorName_Version        (last = version, second-last = author, rest = name)

interface EntityConfig {
  configTable: string;
  entityName: string;
  objectName: string;
  // Additional SELECT fields beyond Id and IsActive (used to build a human-readable error label)
  selectFields: string;
  // Parses one DeveloperName into a deduplication key + version number (null = skip)
  parseDeveloperName: (developerName: string) => { mapKey: string; version: number } | null;
  // Builds the SOQL WHERE clause from a mapKey and a comma-separated versions string
  buildSoqlWhere: (mapKey: string, versionsStr: string) => string;
  // Builds a human-readable identifier for a record (used in error messages)
  buildLabel: (record: RecordRef) => string;
}

interface RecordRef {
  Id: string;
  IsActive: boolean;
  // Identifying fields populated from selectFields — entity-specific, may be absent on other entities
  Type?: string;
  SubType?: string;
  Language?: string;
  Name?: string;
  AuthorName?: string;
  VersionNumber?: number;
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
    selectFields: 'Type, SubType, Language, VersionNumber',
    parseDeveloperName: parseOmniProcessDeveloperName,
    buildSoqlWhere: (mapKey, versionsStr): string => buildOmniProcessWhere(mapKey, versionsStr, false),
    buildLabel: (r): string =>
      `Type: ${r.Type ?? ''}, SubType: ${r.SubType ?? ''}, Language: ${r.Language ?? ''}, Version: ${
        r.VersionNumber ?? ''
      }`,
  },
  {
    configTable: Constants.OmniIntegrationProcConfigTable,
    entityName: Constants.IntegrationProcedureComponentName,
    objectName: Constants.OmniProcessObjectName,
    selectFields: 'Type, SubType, Language, VersionNumber',
    parseDeveloperName: parseOmniProcessDeveloperName,
    buildSoqlWhere: (mapKey, versionsStr): string => buildOmniProcessWhere(mapKey, versionsStr, true),
    buildLabel: (r): string =>
      `Type: ${r.Type ?? ''}, SubType: ${r.SubType ?? ''}, Language: ${r.Language ?? ''}, Version: ${
        r.VersionNumber ?? ''
      }`,
  },
  {
    configTable: Constants.OmniDataTransformConfigTable,
    entityName: Constants.DataMapperComponentName,
    objectName: Constants.OmniDataTransformObjectName,
    selectFields: 'Name, VersionNumber',
    parseDeveloperName: (developerName): { mapKey: string; version: number } | null => {
      const lastUnderscore = developerName.lastIndexOf('_');
      if (lastUnderscore <= 0 || lastUnderscore >= developerName.length - 1) return null;
      const version = parseFloat(developerName.substring(lastUnderscore + 1));
      if (isNaN(version)) return null;
      return { mapKey: developerName.substring(0, lastUnderscore), version };
    },
    buildSoqlWhere: (mapKey, versionsStr): string =>
      `Name = '${escapeSoql(mapKey)}' AND VersionNumber IN (${versionsStr}) AND UniqueName = null`,
    buildLabel: (r): string => `Name: ${r.Name ?? ''}, Version: ${r.VersionNumber ?? ''}`,
  },
  {
    configTable: Constants.OmniUiCardConfigTable,
    entityName: Constants.FlexCardComponentName,
    objectName: Constants.OmniUiCardObjectName,
    selectFields: 'Name, AuthorName, VersionNumber',
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
    buildLabel: (r): string =>
      `Name: ${r.Name ?? ''}, AuthorName: ${r.AuthorName ?? ''}, Version: ${r.VersionNumber ?? ''}`,
  },
];

// ── Class ─────────────────────────────────────────────────────────────────────

export class ExistingRecordCleanupService {
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
   * Keys are entity names (e.g. "OmniScript"). Values are the matching RecordRef objects.
   */
  public async assess(): Promise<Map<string, RecordRef[]>> {
    Logger.log(this.messages.getMessage('assessNullUniqueNamePhaseStart'));
    const result = new Map<string, RecordRef[]>();
    for (const config of ENTITY_CONFIGS) {
      Logger.log(this.messages.getMessage('assessScanningEntity', [config.entityName]));
      try {
        const records = await this.fetchMatchingRecords(config);
        if (records.length > 0) {
          Logger.log(this.messages.getMessage('assessEntityFound', [records.length, config.entityName]));
        } else {
          Logger.log(this.messages.getMessage('assessEntityNone', [config.entityName]));
        }
        result.set(config.entityName, records);
      } catch (error) {
        Logger.error(
          this.messages.getMessage('errorAssessingNullUniqueNameRecords', [config.entityName, String(error)])
        );
        result.set(config.entityName, []);
      }
    }
    return result;
  }

  public async cleanAll(): Promise<void> {
    Logger.log(this.messages.getMessage('nullUniqueNameCleanupPhaseStart'));
    for (const config of ENTITY_CONFIGS) {
      Logger.log(this.messages.getMessage('nullUniqueNameCleanupSectionStart', [config.entityName]));
      try {
        const records = await this.fetchMatchingRecords(config);
        await this.deactivateAndDeleteRecords(config, records);
      } catch (error) {
        Logger.error(
          this.messages.getMessage('errorCleaningNullUniqueNameRecords', [config.entityName, String(error)])
        );
      }
    }
  }

  // ── Generic per-entity pipeline ──────────────────────────────────────────

  private async fetchMatchingRecords(config: EntityConfig): Promise<RecordRef[]> {
    const records: RecordRef[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const developerNames = await this.fetchConfigDeveloperNames(config.configTable, offset);
      if (developerNames.length === 0) break;

      const versionMap = this.buildVersionMap(developerNames, config.parseDeveloperName);
      if (versionMap.size > 0) {
        const batch = await this.queryRecords(config, versionMap);
        records.push(...batch);
      }

      offset += BATCH_SIZE;
      if (developerNames.length < BATCH_SIZE) hasMore = false;
    }
    return records;
  }

  private async fetchConfigDeveloperNames(configTable: string, offset: number): Promise<string[]> {
    const result = await this.connection.query<{ DeveloperName: string }>(
      `SELECT DeveloperName FROM ${configTable} LIMIT ${BATCH_SIZE} OFFSET ${offset}`
    );
    if (!result?.records) return [];
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

  // Queries the main object for records with UniqueName = null matching all keys in a single
  // batched query (OR conditions) instead of one query per key, to avoid hitting API governor limits.
  // Each call receives at most BATCH_SIZE (50) keys so the OR clause stays well within SOQL limits.
  private async queryRecords(config: EntityConfig, versionMap: Map<string, Set<number>>): Promise<RecordRef[]> {
    if (versionMap.size === 0) return [];

    const conditions = Array.from(versionMap.entries()).map(([mapKey, versions]) => {
      const versionsStr = Array.from(versions).join(', ');
      return `(${config.buildSoqlWhere(mapKey, versionsStr)})`;
    });

    const soql =
      `SELECT Id, IsActive, ${config.selectFields} FROM ${config.objectName}` + ` WHERE ${conditions.join(' OR ')}`;

    let result = await this.connection.query<RecordRef>(soql);
    if (!result?.records) return [];
    const records = [...result.records];

    while (result.nextRecordsUrl) {
      result = await this.connection.queryMore<RecordRef>(result.nextRecordsUrl);
      if (!result?.records) break;
      records.push(...result.records);
    }
    return records;
  }

  // ── Shared deactivate + delete ───────────────────────────────────────────

  private async deactivateAndDeleteRecords(config: EntityConfig, records: RecordRef[]): Promise<void> {
    if (records.length === 0) {
      Logger.log(this.messages.getMessage('noNullUniqueNameRecords', [config.entityName]));
      return;
    }

    Logger.log(this.messages.getMessage('foundNullUniqueNameRecords', [records.length, config.entityName]));

    // Build label map once so both deactivation and deletion can report human-readable identifiers
    const idToLabel = new Map(records.map((r) => [r.Id, config.buildLabel(r)]));

    const activeIds = records.filter((r) => r.IsActive).map((r) => r.Id);
    const failedDeactivateIds = new Set<string>();

    if (activeIds.length > 0) {
      Logger.log(this.messages.getMessage('deactivatingRecords', [activeIds.length, config.entityName]));

      const deactivateBar = createProgressBar('Deactivating', config.entityName as any);
      deactivateBar.start(activeIds.length, 0);

      // Deactivate one at a time to avoid UNKNOWN_ERROR (matches existing migration pattern)
      for (const id of activeIds) {
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
          failedDeactivateIds.add(id);
        }
        deactivateBar.increment();
      }
      deactivateBar.stop();

      Logger.log(
        this.messages.getMessage('deactivatedRecords', [activeIds.length - failedDeactivateIds.size, config.entityName])
      );
      await this.sleep();
    }

    const idsToDelete = records.map((r) => r.Id).filter((id) => !failedDeactivateIds.has(id));

    Logger.log(this.messages.getMessage('deletingRecords', [idsToDelete.length, config.entityName]));

    const deleteBar = createProgressBar('Deleting', config.entityName as any);
    deleteBar.start(idsToDelete.length, 0);

    for (const id of idsToDelete) {
      try {
        await this.connection.sobject(config.objectName).delete(id);
      } catch (error) {
        const label = idToLabel.get(id) ?? id;
        Logger.error(this.messages.getMessage('deletionFailed', [config.entityName, label, String(error)]));
      }
      deleteBar.increment();
    }
    deleteBar.stop();

    Logger.log(this.messages.getMessage('deletedRecords', [idsToDelete.length, config.entityName]));
  }

  private sleep(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });
  }
}
