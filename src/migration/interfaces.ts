/* eslint-disable @typescript-eslint/no-explicit-any */
import { AnyJson } from '@salesforce/ts-types';

export interface MigrationTool {
  /**
   * Performs the migration of custom object data into standard object data
   */
  migrate(): Promise<MigrationResult[]>;

  /**
   * Gets the list of source-target objects that the tool will migrate
   */
  getMappings(): ObjectMapping[];

  /**
   * Returns a customer friendly name of the individual migration tool
   */
  getName(): string;

  /**
   * Returns the customer friendly name of a record
   *
   * @param record The record object
   */
  getRecordName(record: any): string;

  /**
   * Truncates the standard objects.
   */
  truncate(): Promise<void>;
}

export interface ObjectMapping {
  source: string;
  target: string;
}

export interface UploadRecordResult {
  referenceId: string;
  id?: string;
  errors: string[];
  hasErrors: boolean;
  success?: boolean;
}

export interface MigrationResult {
  name: string;
  results: Map<string, UploadRecordResult>;
  records: Map<string, any>;
}

export interface OriginalRecordItem {
  record: any;
  status: OriginalRecordStatusItem;
}

export interface OriginalRecordStatusItem {
  id: string;
  // attributes: { type: string },            // Do not remove. Might be used later.
  standardObjectMigrationStatus: string;
  standardObjectMigrationId: string;
  standardObjectMigrationErrors: string;
}

export interface TransformData {
  mappedRecords: any[];
  originalRecords: Map<string, AnyJson>;
}

export interface OriginalRecordName {
  record: any;
  Name: string;
}

export interface NameTransformData {
  originalRecords: Map<string, OriginalRecordName>;
  validNameSet: Set<string>;
  originalNameSet: Set<string>;
  longNameSet: Set<string>;
  dupNameSet: Set<string>;
  nameWithSepcialCharactorSet: Set<string>;
}
