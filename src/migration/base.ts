import { Connection, Logger, Messages } from '@salesforce/core';
import { DebugTimer, QueryTools } from '../utils';

import { NetUtils } from '../utils/net';
import { TransformData, UploadRecordResult } from './interfaces';

export class BaseMigrationTool {
  protected static readonly NAME_LENGTH = 250;
  protected readonly namespace: string;
  protected readonly connection: Connection;
  protected readonly namespacePrefix: string;
  protected readonly logger: Logger;
  protected readonly messages: Messages;

  public constructor(namespace: string, connection: Connection, logger: Logger, messages: Messages) {
    this.namespace = namespace;
    this.connection = connection;
    this.logger = logger;
    this.messages = messages;
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

  protected async truncate(objectName: string): Promise<void> {
    DebugTimer.getInstance().lap('Truncating ' + objectName);

    const ids: string[] = await QueryTools.queryIds(this.connection, objectName);
    if (ids.length === 0) return;

    const success: boolean = await NetUtils.delete(this.connection, ids);
    if (!success) {
      throw new Error('Could not truncate ' + objectName);
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
}
