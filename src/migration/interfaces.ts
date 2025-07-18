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
  newName?: string;
  errors: string[];
  warnings: string[];
  hasErrors: boolean;
  success?: boolean;
  type?: string;
  subtype?: string;
  language?: string;
}

export interface MigrationResult {
  name: string;
  results: Map<string, UploadRecordResult>;
  records: Map<string, any>;
  errors?: string[];
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

export type LWCComponentMigrationTool = MigrationTool;

export type CustomLabelMigrationTool = MigrationTool;

export interface RelatedObjectMigrationResult {
  apexClasses: string[];
  lwcComponents: string[];
}

export interface ExpSitePageJson {
  // Index signature to allow any additional properties
  [key: string]: any;
  appPageId: string;
  componentName: string;
  dataProviders: unknown[]; // Replace 'any' with a specific type if known
  id: string;
  label: string;
  regions: ExpSiteRegion[];
  themeLayoutType: string;
  type: string;
  viewType: string;
}

export interface ExpSiteRegion {
  // Index signature to allow any additional properties
  [key: string]: any;
  id: string;
  regionName: string;
  type: string;
  components?: ExpSiteComponent[]; // Optional, as some regions don't have components
}

export interface ExpSiteComponent {
  // Index signature to allow any additional properties
  [key: string]: any;
  componentAttributes: ExpSiteComponentAttributes;
  componentName: string;
  id: string;
  renderPriority?: string;
  renditionMap: unknown; // Replace with better type if known
  type: string;
  subtype?: string;
  language?: string;
}

export interface ExpSiteComponentAttributes {
  // Index signature to allow any additional string properties
  [key: string]: any;
  // This is a union of possible structures. You can separate them if needed.
  layout?: string;
  params?: string;
  standAlone?: boolean;
  target?: string;
  customHeadTags?: string;
  description?: string;
  title?: string;
  richTextValue?: string;
}

export interface MigrationStorage {
  osStorage: Map<string, OmniScriptStorage>;
  fcStorage: Map<string, FlexcardStorage>;
}

export interface Storage {
  migrationSuccess?: boolean;
  error?: string[];
  isDuplicate: boolean;
}

export interface OmniScriptStorage extends Storage {
  type: string;
  subtype: string;
  language: string;
}

export interface FlexcardStorage extends Storage {
  name: string;
}
