import { Ux } from '@salesforce/sf-plugins-core';
import { Connection, Messages } from '@salesforce/core';
import * as cliProgress from 'cli-progress';
import { DebugTimer, QueryTools } from '../utils';
import { NetUtils } from '../utils/net';
import { Stringutil } from '../utils/StringValue/stringutil';
import { Logger } from '../utils/logger';
import { LwcBundleRecord, TransformData, UploadRecordResult } from './interfaces';
import { NameMappingRegistry } from './NameMappingRegistry';

export type ComponentType =
  | 'Data Mappers'
  | 'Flexcards'
  | 'Omniscripts'
  | 'Integration Procedures'
  | 'Omni Global Auto Numbers';
export type RelatedObjectType = 'Flexipage' | 'ExperienceSites' | 'Lightning Web Components' | 'Apex Classes';

/**
 * Creates a progress bar for migration/assessment operations
 *
 * @param action - The action being performed (e.g., 'Migrating', 'Assessing')
 * @param type - The type of component being processed
 * @returns A configured cliProgress.SingleBar instance
 */
export const createProgressBar = (action: string, type: ComponentType | RelatedObjectType): cliProgress.SingleBar => {
  // Normalize type to string for comparison
  const typeStr = String(type);

  // Determine if space should be empty or tabs
  const noSpaceTypes = ['Omniscript', 'Integration Procedure', 'ExperienceSites'];
  const space = noSpaceTypes.includes(typeStr) ? '' : '\t\t\t\t';

  return new cliProgress.SingleBar({
    format: `${action} ${type} | ${space} {bar} | {percentage}% || {value}/{total} Tasks`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    stopOnComplete: true,
  });
};

export class BaseMigrationTool {
  protected static readonly NAME_LENGTH = 250;
  protected readonly namespace: string;
  protected readonly connection: Connection;
  protected readonly namespacePrefix: string;
  protected readonly logger: Logger;
  protected readonly messages: Messages<string>;
  protected readonly ux: Ux;
  protected readonly nameRegistry: NameMappingRegistry;

  public constructor(namespace: string, connection: Connection, logger: Logger, messages: Messages<string>, ux: Ux) {
    this.namespace = namespace;
    this.connection = connection;
    this.logger = logger;
    this.messages = messages;
    this.ux = ux;
    this.nameRegistry = NameMappingRegistry.getInstance();
    this.namespacePrefix = namespace ? namespace + '__' : '';
  }

  protected async uploadTransformedData(
    objectName: string,
    transformedData: TransformData
  ): Promise<Map<string, UploadRecordResult>> {
    return await NetUtils.create(this.connection, objectName, transformedData.mappedRecords);
  }

  protected async updateData(transformedData: TransformData): Promise<Map<string, UploadRecordResult>> {
    return await NetUtils.update(this.connection, transformedData.mappedRecords);
  }

  /**
   * If applicable, removes the namespace prefix from the name of an object property
   *
   * @param fieldName The property name to clean out. Might or might not have the namespace as prefix
   * @returns The property without prefix
   */
  protected getCleanFieldName(fieldName: string): string {
    const idx = fieldName.indexOf('__');
    if (idx > -1) {
      return fieldName.substring(idx + 2);
    }
    return fieldName;
  }

  protected validMetaDataName(name: string): boolean {
    const regex = new RegExp('^[a-zA-Z0-9]{1,}$');
    if (regex.test(name) && name !== '') {
      return true;
    }
    return false;
  }

  protected cleanName(name: string, allowUnderscores = false): string {
    return Stringutil.cleanName(name, allowUnderscores);
  }

  protected async truncate(objectName: string): Promise<void> {
    DebugTimer.getInstance().lap('Truncating ' + objectName);

    const ids: string[] = await QueryTools.queryIds(this.connection, objectName);
    if (ids.length === 0) return;

    const success: boolean = await NetUtils.delete(this.connection, ids);
    if (!success) {
      throw new Error(this.messages.getMessage('couldNotTruncate', [objectName]));
    }
  }

  /**
   * Stores any errors found while validating the source record in the record object
   *
   * @param record The custom object record
   * @param errors An array of errors related to the custom object record
   */
  protected setRecordErrors(record: unknown, ...errors: string[]): void {
    record['errors'] = errors;
  }

  /**
   * Queries Tooling API to classify unmanaged LWCs by naming pattern.
   * Used to detect cross-namespace LWC references that will break after migration.
   *
   * @returns Map of LWC name (lowercase) to classification
   * - 'generated-fc': FlexCard-generated LWC (pattern: cf*)
   * - 'generated-os': OmniScript-generated LWC (pattern: *_*_*)
   * - 'custom': User-defined custom LWC
   */
  protected async getLwcClassifications(): Promise<Map<string, string>> {
    const lwcMap = new Map<string, string>();
    try {
      const result = await (
        this.connection as unknown as {
          tooling: {
            query: (q: string) => Promise<{ records?: LwcBundleRecord[] }>;
          };
        }
      ).tooling.query('SELECT Id, DeveloperName, NamespacePrefix FROM LightningComponentBundle');

      for (const record of result.records || []) {
        const name: string = record.DeveloperName || '';
        const ns: string = record.NamespacePrefix || '';
        if (ns) continue; // Skip managed packages

        let kind: string;
        if (/^cf[a-z0-9]/i.test(name)) {
          kind = 'generated-fc';
        } else if (/^[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/i.test(name)) {
          kind = 'generated-os';
        } else {
          kind = 'custom';
        }
        lwcMap.set(name.toLowerCase(), kind);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      Logger.logVerbose(`Could not query LightningComponentBundle: ${error}`);
    }
    return lwcMap;
  }
}
