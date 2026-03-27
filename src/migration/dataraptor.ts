/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import DRBundleMappings from '../mappings/DRBundle';
import DRMapItemMappings from '../mappings/DRMapItem';
import { DebugTimer, oldNew, QueryTools, SortDirection } from '../utils';
import { NetUtils } from '../utils/net';
import { BaseMigrationTool } from './base';
import {
  InvalidEntityTypeError,
  MigrationResult,
  MigrationTool,
  ObjectMapping,
  TransformData,
  UploadRecordResult,
} from './interfaces';
import { DataRaptorAssessmentInfo } from '../../src/utils';

import {
  getAllFunctionMetadata,
  getReplacedString,
  populateRegexForFunctionMetadata,
} from '../utils/formula/FormulaUtil';
import { StringVal } from '../utils/StringValue/stringval';
import { Logger } from '../utils/logger';
import { createProgressBar } from './base';
import { Constants } from '../utils/constants/stringContants';
import {
  isDRVersioningEnabled,
  isStandardDataModel,
  isStandardDataModelWithMetadataAPIEnabled,
} from '../utils/dataModelService';
import { prioritizeCleanNamesFirst } from '../utils/recordPrioritization';

export class DataRaptorMigrationTool extends BaseMigrationTool implements MigrationTool {
  static readonly DRBUNDLE_NAME = 'DRBundle__c';
  static readonly DRMAPITEM_NAME = 'DRMapItem__c';

  static readonly OMNIDATATRANSFORM_NAME = 'OmniDataTransform';
  static readonly OMNIDATATRANSFORMITEM_NAME = 'OmniDataTransformItem';
  private IS_STANDARD_DATA_MODEL: boolean = isStandardDataModel();
  private readonly allVersions: boolean;

  public constructor(
    namespace: string,
    connection: Connection,
    logger: Logger,
    messages: Messages<string>,
    ux: Ux,
    allVersions: boolean = false
  ) {
    super(namespace, connection, logger, messages, ux);
    this.allVersions = allVersions;
  }

  // DR Versioning is a standard-data-model-only feature on the platform side
  // (PlatformObjectMappings.cls: bOmniStudio && OmniInteractionConfigPtc.isOmniStudioDrVersionOrgPrefSet()).
  // The custom-side `DRBundle__c` doesn't have IsActive__c / Version__c fields, so we must require
  // standard DM in addition to the org pref before activating any version-aware behavior.
  private isVersioningActive(): boolean {
    return this.IS_STANDARD_DATA_MODEL && isDRVersioningEnabled();
  }

  getName(): string {
    return 'Data Mappers';
  }

  getRecordName(record: string) {
    return record['Name'];
  }

  getMappings(): ObjectMapping[] {
    return [
      {
        source: DataRaptorMigrationTool.DRBUNDLE_NAME,
        target: DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME,
      },
      {
        source: DataRaptorMigrationTool.DRMAPITEM_NAME,
        target: DataRaptorMigrationTool.OMNIDATATRANSFORMITEM_NAME,
      },
    ];
  }

  async truncate(): Promise<void> {
    if (this.IS_STANDARD_DATA_MODEL) {
      Logger.logVerbose(this.messages.getMessage('skippingTruncation'));
      return;
    }
    await super.truncate(DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME);
  }

  async migrate(): Promise<MigrationResult[]> {
    if (isStandardDataModelWithMetadataAPIEnabled()) {
      // Return empty result structure for report generation
      return [
        {
          name: this.getName(),
          results: new Map<string, UploadRecordResult>(),
          records: new Map<string, any>(),
        },
      ];
    }
    return [await this.MigrateDataRaptorData()];
  }

  private async MigrateDataRaptorData(): Promise<MigrationResult> {
    let originalDrRecords = new Map<string, any>();
    let drUploadInfo = new Map<string, UploadRecordResult>();
    const duplicatedNames = new Set<string>();

    // Query all dataraptors and the respective items
    DebugTimer.getInstance().lap('Query data raptors');
    const dataRaptors = await this.getAllDataRaptors();

    const dataRaptorItemsData = await this.getAllItems();

    // Query all the functionMetadata with all required fields
    const functionDefinitionMetadata = await getAllFunctionMetadata(this.namespace, this.connection);
    populateRegexForFunctionMetadata(functionDefinitionMetadata);
    // Start transforming each dataRaptor
    DebugTimer.getInstance().lap('Transform Data Raptor');

    if (functionDefinitionMetadata.length > 0 && dataRaptorItemsData.length > 0) {
      // do the formula updation in the DR items
      for (let drItem of dataRaptorItemsData) {
        if (drItem[this.getItemFieldKey('Formula__c')] != null) {
          try {
            var originalString = getReplacedString(
              this.namespacePrefix,
              drItem[this.getItemFieldKey('Formula__c')],
              functionDefinitionMetadata
            );

            drItem[this.getItemFieldKey('Formula__c')] = originalString;
          } catch (ex) {
            Logger.error('Error updating formula for data mapper', ex);
            Logger.logVerbose(
              this.messages.getMessage('formulaSyntaxError', [drItem[this.getItemFieldKey('Formula__c')]])
            );
          }
        }
      }
    }
    let progressCounter = 0;
    let nonMigrationDataRaptors = dataRaptors.filter(
      (dr) => dr[this.getBundleFieldKey('Type__c')] !== 'Migration'
    ).length;
    Logger.log(this.messages.getMessage('foundDataRaptorsToMigrate', [nonMigrationDataRaptors]));
    const progressBar = createProgressBar('Migrating', 'Data Mappers');
    progressBar.start(nonMigrationDataRaptors, progressCounter);
    for (let dr of dataRaptors) {
      // Skip if Type is "Migration"
      if (dr[this.getBundleFieldKey('Type__c')] === 'Migration') continue;
      progressBar.update(++progressCounter);
      const recordId = dr['Id'];
      const name = dr['Name'];

      const typeKey = dr[this.getBundleFieldKey('Type__c')];
      const outputTypeKey = dr[this.getBundleFieldKey('OutputType__c')];
      const targetOutputDocumentIdentifier = dr[this.getBundleFieldKey('TargetOutDocuSignTemplateId__c')];
      const targetOutputFileName = dr[this.getBundleFieldKey('TargetOutPdfDocName__c')];

      if (typeKey === null) {
        dr[this.getBundleFieldKey('Type__c')] = 'Extract';
      }

      // Fix up Input/Output types for older DR's
      switch (typeKey) {
        case 'Transform':
          dr[this.getBundleFieldKey('Type__c')] = 'Transform';
          dr[this.getBundleFieldKey('InputType__c')] = 'JSON';
          if (targetOutputDocumentIdentifier !== null) {
            dr[this.getBundleFieldKey('OutputType__c')] = 'DocuSign';
          } else if (
            targetOutputFileName !== null &&
            (outputTypeKey !== 'PDF' || outputTypeKey !== 'Document Template')
          ) {
            dr[this.getBundleFieldKey('OutputType__c')] = 'PDF';
          } else {
            dr[this.getBundleFieldKey('OutputType__c')] = 'JSON';
          }
          break;
        case 'Extract (JSON)':
          dr[this.getBundleFieldKey('Type__c')] = 'Extract';
          dr[this.getBundleFieldKey('InputType__c')] = 'JSON';
          dr[this.getBundleFieldKey('OutputType__c')] = 'JSON';
          break;
        case 'Load (JSON)':
          dr[this.getBundleFieldKey('Type__c')] = 'Load';
          dr[this.getBundleFieldKey('InputType__c')] = 'JSON';
          dr[this.getBundleFieldKey('OutputType__c')] = 'SObject';
          break;
        case 'Load (Object)':
          dr[this.getBundleFieldKey('Type__c')] = 'Load';
          dr[this.getBundleFieldKey('InputType__c')] = 'SObject';
          dr[this.getBundleFieldKey('OutputType__c')] = 'SObject';
          break;
        default: // no-op;
      }

      // Transform the data raptor
      const transformedDataRaptor = this.mapDataRaptorRecord(dr);

      // When migrating all versions of a versioned org, multiple bundles legitimately share the same
      // Name; dedup by Name+Version so different versions don't collide with each other.
      const dupKey =
        this.isVersioningActive() && this.allVersions
          ? `${transformedDataRaptor['Name'].toLowerCase()}|${transformedDataRaptor['VersionNumber'] ?? ''}`
          : transformedDataRaptor['Name'].toLowerCase();

      // Verify duplicated names before trying to submitt
      if (duplicatedNames.has(dupKey)) {
        this.setRecordErrors(dr, this.messages.getMessage('duplicatedDrName', [transformedDataRaptor['Name']]));
        originalDrRecords.set(recordId, dr);
        continue;
      }

      if (transformedDataRaptor['Name'] && /^[0-9]/.test(transformedDataRaptor['Name'])) {
        this.setRecordErrors(
          dr,
          this.messages.getMessage('dataMapperNameStartsWithNumber', [
            transformedDataRaptor['Name'],
            'DM' + transformedDataRaptor['Name'],
          ])
        );
        originalDrRecords.set(recordId, dr);
        continue;
      }

      // Create a map of the original records
      originalDrRecords.set(recordId, dr);

      // Save the data raptors
      // const drUploadResponse = await this.uploadTransformedData(DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME, { mappedRecords, originalRecords });
      let drUploadResponse;
      if (!this.IS_STANDARD_DATA_MODEL) {
        drUploadResponse = await NetUtils.createOne(
          this.connection,
          DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME,
          recordId,
          transformedDataRaptor
        );
      } else {
        const standardId = transformedDataRaptor['Id'];
        delete transformedDataRaptor['Id'];
        drUploadResponse = await NetUtils.updateOne(
          this.connection,
          DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME,
          recordId,
          recordId,
          transformedDataRaptor
        );
        drUploadResponse['id'] = standardId;
        transformedDataRaptor['Id'] = standardId;
      }

      // Always add the response to track success/failure
      if (drUploadResponse && drUploadResponse.success === true) {
        // Append the processed DM name into duplicateNames Map
        const dataMapperName = transformedDataRaptor[DRBundleMappings.Name];
        duplicatedNames.add(dupKey);

        const items = await this.getItemsForDataRaptor(dataRaptorItemsData, name, drUploadResponse.id, recordId);
        drUploadResponse.newName = dataMapperName;

        // Move the items
        if (!this.IS_STANDARD_DATA_MODEL) {
          await this.uploadTransformedData(DataRaptorMigrationTool.OMNIDATATRANSFORMITEM_NAME, items);
        } else {
          // Handle all the items one by one
          for (let item of items.mappedRecords) {
            let standardItemId = item['Id'];
            delete item['Id'];
            // Remove OmniDataTransformationId as it's a read-only relationship field
            const omniDataTransformationId = item['OmniDataTransformationId'];
            delete item['OmniDataTransformationId'];

            await NetUtils.updateOne(
              this.connection,
              DataRaptorMigrationTool.OMNIDATATRANSFORMITEM_NAME,
              standardItemId,
              standardItemId,
              item
            );
            item['Id'] = standardItemId;
            item['OmniDataTransformationId'] = omniDataTransformationId;
          }
        }
      } else {
        // Handle failed migration - add error information
        if (!drUploadResponse?.success) {
          Logger.logVerbose(
            `\n${this.messages.getMessage('dataMapperMigrationFailed', [name]) + drUploadResponse.errors}`
          );

          drUploadResponse = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: true,
            errors: [this.messages.getMessage('dataMapperMigrationFailed', [name]) + drUploadResponse.errors],
            warnings: [],
            newName: '',
          };
        }
      }

      drUploadInfo.set(recordId, drUploadResponse);
    }
    progressBar.stop();

    return {
      name: 'Data Mappers',
      results: drUploadInfo,
      records: originalDrRecords,
    };
  }

  private async getAllDRToItemsMap(): Promise<Map<string, AnyJson[]>> {
    // When DR Versioning is on (standard DM only), multiple bundles share the same Name, so key
    // items by parent ID instead of Name to avoid attaching items to the wrong version.
    const useParentId = this.isVersioningActive();
    const parentIdField = useParentId ? this.getItemFieldKey('OmniDataTransformationId__c') : '';
    const drToItemsMap = new Map<string, AnyJson[]>();
    const drItems = await this.getAllItems();
    for (const drItem of drItems) {
      const key = useParentId ? (drItem[parentIdField] as string) : (drItem['Name'] as string);
      if (!key) continue;
      if (drToItemsMap.has(key)) {
        drToItemsMap.get(key).push(drItem);
      } else {
        drToItemsMap.set(key, [drItem]);
      }
    }
    return drToItemsMap;
  }

  public async assess(): Promise<DataRaptorAssessmentInfo[]> {
    try {
      if (isStandardDataModelWithMetadataAPIEnabled()) {
        return [];
      }
      DebugTimer.getInstance().lap('Query data raptors');
      Logger.log(this.messages.getMessage('startingDataRaptorAssessment'));
      const dataRaptors = await this.getAllDataRaptors();

      const dataRaptorAssessmentInfos = this.processDRComponents(dataRaptors);
      return dataRaptorAssessmentInfos;
    } catch (err) {
      if (err instanceof InvalidEntityTypeError) {
        throw err;
      }
      Logger.error('Error assessing data mapper', err);
    }
  }

  public async processDRComponents(dataRaptors: AnyJson[]): Promise<DataRaptorAssessmentInfo[]> {
    const dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[] = [];
    // Query all the functionMetadata with all required fields

    const functionDefinitionMetadata = await getAllFunctionMetadata(this.namespace, this.connection);
    populateRegexForFunctionMetadata(functionDefinitionMetadata);

    const existingDataRaptorNames = new Set<string>();
    const dataRaptorItemsMap = await this.getAllDRToItemsMap();

    const progressBar = createProgressBar('Assessing', 'Data Mappers');
    let progressCounter = 0;
    let nonMigrationDataRaptors = dataRaptors.filter(
      (dr) => dr[this.getBundleFieldKey('Type__c')] !== 'Migration'
    ).length;
    Logger.log(this.messages.getMessage('foundDataRaptorsToAssess', [nonMigrationDataRaptors]));
    progressBar.start(nonMigrationDataRaptors, progressCounter);
    // Now process each OmniScript and its elements
    for (const dataRaptor of dataRaptors) {
      if (dataRaptor[this.getBundleFieldKey('Type__c')] === 'Migration') continue;
      try {
        const dataRaptorAssessmentInfo = await this.processDataMappers(
          dataRaptor,
          existingDataRaptorNames,
          dataRaptorItemsMap,
          functionDefinitionMetadata
        );
        dataRaptorAssessmentInfos.push(dataRaptorAssessmentInfo);
      } catch (e) {
        dataRaptorAssessmentInfos.push({
          oldName: dataRaptor['Name'],
          name: '',
          id: dataRaptor['Id'],
          type: dataRaptor[this.getBundleFieldKey('Type__c')] || '',
          formulaChanges: [],
          infos: [],
          warnings: [],
          errors: [this.messages.getMessage('unexpectedError')],
          apexDependencies: [],
          migrationStatus: 'Failed',
        });
        const error = e as Error;
        Logger.error('Error processing data mapper', error);
      }
      progressBar.update(++progressCounter);
    }
    progressBar.stop();
    return dataRaptorAssessmentInfos;
  }

  private async processDataMappers(
    dataRaptor: AnyJson,
    existingDataRaptorNames: Set<string>,
    dataRaptorItemsMap: Map<string, AnyJson[]>,
    functionDefinitionMetadata: AnyJson[]
  ): Promise<DataRaptorAssessmentInfo> {
    const drName = dataRaptor['Name'];
    const versioningOn = this.isVersioningActive();
    const drVersion = versioningOn ? (dataRaptor[this.getBundleFieldKey('Version__c')] as number) : undefined;
    const drIsActive = versioningOn ? Boolean(dataRaptor[this.getBundleFieldKey('IsActive__c')]) : undefined;
    // Await here since processOSComponents is now async
    Logger.info(this.messages.getMessage('processingDataRaptor', [drName]));
    const warnings: string[] = [];
    const existingDRNameVal = new StringVal(drName, 'name');
    let assessmentStatus: 'Ready for migration' | 'Warnings' | 'Needs manual intervention' = 'Ready for migration';

    if (!existingDRNameVal.isNameCleaned()) {
      warnings.push(
        this.messages.getMessage('changeMessage', [
          Constants.DataMapperComponentName,
          existingDRNameVal.type,
          existingDRNameVal.val,
          existingDRNameVal.cleanName(),
        ])
      );
      assessmentStatus = 'Warnings';
    }
    // Check if name starts with a number (which can cause migration issues)
    if (drName && /^[0-9]/.test(drName)) {
      const proposedName = 'DM' + this.cleanName(drName);
      warnings.push(this.messages.getMessage('dataMapperNameStartsWithNumber', [drName, proposedName]));
      assessmentStatus = 'Needs manual intervention';
    }

    // When migrating all versions, dedup by Name+Version so the same DR's other versions don't trip
    // the duplicate-name warning. Otherwise dedup by Name as before.
    const dedupKey =
      versioningOn && this.allVersions
        ? `${existingDRNameVal.cleanName().toLowerCase()}|${drVersion ?? ''}`
        : existingDRNameVal.cleanName().toLowerCase();
    if (existingDataRaptorNames.has(dedupKey)) {
      warnings.push(this.messages.getMessage('duplicatedName') + '  ' + existingDRNameVal.cleanName());
      assessmentStatus = 'Needs manual intervention';
    } else {
      existingDataRaptorNames.add(dedupKey);
    }
    const apexDependencies = [];
    if (dataRaptor[this.getBundleFieldKey('CustomInputClass__c')]) {
      apexDependencies.push(dataRaptor[this.getBundleFieldKey('CustomInputClass__c')]);
    }
    if (dataRaptor[this.getBundleFieldKey('CustomOutputClass__c')]) {
      apexDependencies.push(dataRaptor[this.getBundleFieldKey('CustomOutputClass__c')]);
    }

    const formulaChanges: oldNew[] = [];
    const itemsKey = versioningOn ? (dataRaptor['Id'] as string) : drName;
    const drItems = dataRaptorItemsMap.get(itemsKey);
    if (drItems) {
      for (const drItem of drItems) {
        const formula = drItem[this.getItemFieldKey('Formula__c')];
        if (formula) {
          try {
            const newFormula = getReplacedString(this.namespacePrefix, formula, functionDefinitionMetadata);
            if (newFormula !== formula) {
              formulaChanges.push({
                old: formula,
                new: newFormula,
              });
            }
          } catch (ex) {
            Logger.error('Error processing formula for data mapper', ex);
            Logger.logVerbose(this.messages.getMessage('formulaSyntaxError', [formula]));
          }
        }
      }
    }
    const dataRaptorAssessmentInfo: DataRaptorAssessmentInfo = {
      oldName: existingDRNameVal.val,
      name: existingDRNameVal.cleanName(),
      id: dataRaptor['Id'],
      type: dataRaptor[this.getBundleFieldKey('Type__c')] || '',
      formulaChanges: formulaChanges,
      infos: [],
      apexDependencies: apexDependencies,
      warnings: warnings,
      errors: [],
      migrationStatus: assessmentStatus,
    };
    if (versioningOn) {
      dataRaptorAssessmentInfo.version = drVersion;
      dataRaptorAssessmentInfo.isActive = drIsActive;
    }
    return dataRaptorAssessmentInfo;
  }

  // Get All DRBundle__c records
  private async getAllDataRaptors(): Promise<AnyJson[]> {
    const onInvalidType = (err: any) => {
      if (err.errorCode === 'INVALID_TYPE') {
        throw new InvalidEntityTypeError(`${this.getBundleObjectName()} type is not found under this namespace`);
      }
      throw err;
    };

    let dataRaptors: AnyJson[];
    if (!this.isVersioningActive()) {
      // Versioning not active (custom DM, or org pref off) — single row per Name; legacy unchanged.
      dataRaptors = await QueryTools.queryAll(
        this.connection,
        this.getQueryNamespace(),
        this.getBundleObjectName(),
        this.getDRBundleFields()
      ).catch(onInvalidType);
    } else if (this.allVersions) {
      // Org pref on + --allversions — migrate all versions.
      Logger.info(this.messages.getMessage('allVersionsInfo', [this.allVersions]));
      const sortFields = [
        { field: this.getBundleFieldKey('Name'), direction: SortDirection.ASC },
        { field: this.getBundleFieldKey('Version__c'), direction: SortDirection.ASC },
      ];
      dataRaptors = await QueryTools.queryWithFilterAndSort(
        this.connection,
        this.getQueryNamespace(),
        this.getBundleObjectName(),
        this.getDRBundleFields(),
        new Map(),
        sortFields
      ).catch(onInvalidType);
    } else {
      // Org pref on + no --allversions — active version only (parity with OS/IP).
      const filters = new Map<string, any>();
      filters.set(this.getBundleFieldKey('IsActive__c'), true);
      dataRaptors = await QueryTools.queryWithFilter(
        this.connection,
        this.getQueryNamespace(),
        this.getBundleObjectName(),
        this.getDRBundleFields(),
        filters
      ).catch(onInvalidType);
    }

    // Apply prioritization only for standard data model
    if (this.IS_STANDARD_DATA_MODEL) {
      return this.prioritizeDataRaptorsWithoutSpecialCharacters(dataRaptors);
    }

    return dataRaptors;
  }

  // Get All Items
  private async getAllItems(): Promise<AnyJson[]> {
    //Query all Elements
    return await QueryTools.queryAll(
      this.connection,
      this.getQueryNamespace(),
      this.getItemObjectName(),
      this.getDRMapItemFields()
    ).catch((err) => {
      Logger.error('Error querying data raptor items', err);
      return [];
    });
  }

  /*
  private async getAllItemsForDataRaptorByName(drName: string): Promise<AnyJson[]> {
    const filters = new Map<string, any>();
    //Query all Elements
    return await QueryTools.queryWithFilter(
      this.connection,
      this.namespace,
      DataRaptorMigrationTool.DRMAPITEM_NAME,
      this.getDRMapItemFields(),
      filters.set('Name', drName)
    );
  }
    */

  // Get All Items for one DataRaptor
  private async getItemsForDataRaptor(
    dataRaptorItems: AnyJson[],
    drName: string,
    drId: string,
    sourceParentId?: string
  ): Promise<TransformData> {
    //Query all Elements
    const mappedRecords = [];
    const originalRecords = new Map<string, AnyJson>();

    // When DR Versioning is active (standard DM only), multiple bundles share the same Name, so
    // match items by source parent ID to avoid attaching items to the wrong version.
    const useParentId = this.isVersioningActive() && !!sourceParentId;
    const parentIdField = useParentId ? this.getItemFieldKey('OmniDataTransformationId__c') : '';

    dataRaptorItems.forEach((drItem) => {
      const recordId = drItem['Id'];
      const matched = useParentId ? drItem[parentIdField] === sourceParentId : drItem['Name'] === drName;
      if (matched) {
        mappedRecords.push(this.mapDataRaptorItemData(drItem, drId));
      }

      // Create a map of the original records
      originalRecords.set(recordId, drItem);
    });

    return { originalRecords, mappedRecords };
  }

  /**
   * Maps an indivitdual DRBundle__c record to an OmniDataTransform record.
   * @param dataRaptorRecord
   * @returns
   */
  private mapDataRaptorRecord(dataRaptorRecord: AnyJson): AnyJson {
    // Transformed object
    let mappedObject = {};

    if (!this.IS_STANDARD_DATA_MODEL) {
      // Get the fields of the record
      const recordFields = Object.keys(dataRaptorRecord);

      // Map individual fields
      recordFields.forEach((recordField) => {
        const cleanFieldName = this.getCleanFieldName(recordField);

        if (DRBundleMappings.hasOwnProperty(cleanFieldName)) {
          mappedObject[DRBundleMappings[cleanFieldName]] = dataRaptorRecord[recordField];
        }
      });
    } else {
      mappedObject = { ...(dataRaptorRecord as object) };
    }

    mappedObject['Name'] = this.cleanName(mappedObject['Name']);
    // When DR Versioning is active (standard DM + org pref), mirror source IsActive so only the
    // truly active version stays active in the target. Otherwise keep the legacy default of true
    // (custom-side DRBundle__c may not populate IsActive).
    mappedObject['IsActive'] = this.isVersioningActive()
      ? Boolean(dataRaptorRecord[this.getBundleFieldKey('IsActive__c')])
      : true;

    // BATCH framework requires that each record has an "attributes" property
    mappedObject['attributes'] = {
      type: DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME,
      referenceId: dataRaptorRecord['Id'],
    };

    return mappedObject;
  }

  /**
   * Maps an individual DRMapItem__c into an OmniDataTransformId record
   * @param dataRaptorItemRecord
   * @returns
   */
  private mapDataRaptorItemData(dataRaptorItemRecord: AnyJson, omniDataTransformationId: string) {
    // Transformed object
    let mappedObject = {};

    if (!this.IS_STANDARD_DATA_MODEL) {
      // Get the fields of the record
      const recordFields = Object.keys(dataRaptorItemRecord);

      // Map individual fields
      recordFields.forEach((recordField) => {
        const cleanFieldName = this.getCleanFieldName(recordField);

        if (DRMapItemMappings.hasOwnProperty(cleanFieldName)) {
          mappedObject[DRMapItemMappings[cleanFieldName]] = dataRaptorItemRecord[recordField];
        }
      });
    } else {
      mappedObject = { ...(dataRaptorItemRecord as object) };
    }

    // Set the parent/child relationship
    mappedObject['OmniDataTransformationId'] = omniDataTransformationId;
    mappedObject['Name'] = this.cleanName(mappedObject['Name']);

    // BATCH framework requires that each record has an "attributes" property
    mappedObject['attributes'] = {
      type: DataRaptorMigrationTool.OMNIDATATRANSFORMITEM_NAME,
      referenceId: dataRaptorItemRecord['Id'],
    };

    return mappedObject;
  }

  private getDRBundleFields(): string[] {
    if (this.IS_STANDARD_DATA_MODEL) {
      return Object.values(DRBundleMappings);
    }
    // On custom data model, exclude versioning fields (Version__c, IsActive__c) — they don't exist
    // on vlocity_cmt__DRBundle__c.
    return Object.keys(DRBundleMappings).filter((k) => k !== 'Version__c' && k !== 'IsActive__c');
  }

  private getDRMapItemFields(): string[] {
    if (this.IS_STANDARD_DATA_MODEL) {
      return [...new Set(Object.values(DRMapItemMappings))];
    }
    // On custom data model, exclude OmniDataTransformationId__c — it doesn't exist on
    // vlocity_cmt__DRMapItem__c (parent linkage there is by Name).
    return Object.keys(DRMapItemMappings).filter((k) => k !== 'OmniDataTransformationId__c');
  }

  private getBundleFieldKey(fieldName: string): string {
    return this.IS_STANDARD_DATA_MODEL ? DRBundleMappings[fieldName] : this.namespacePrefix + fieldName;
  }

  private getItemFieldKey(fieldName: string): string {
    return this.IS_STANDARD_DATA_MODEL ? DRMapItemMappings[fieldName] : this.namespacePrefix + fieldName;
  }

  private getQueryNamespace(): string {
    return this.IS_STANDARD_DATA_MODEL ? '' : this.namespace;
  }

  private getBundleObjectName(): string {
    return this.IS_STANDARD_DATA_MODEL
      ? DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME
      : DataRaptorMigrationTool.DRBUNDLE_NAME;
  }

  private getItemObjectName(): string {
    return this.IS_STANDARD_DATA_MODEL
      ? DataRaptorMigrationTool.OMNIDATATRANSFORMITEM_NAME
      : DataRaptorMigrationTool.DRMAPITEM_NAME;
  }

  /**
   * Prioritizes DataRaptors by name characteristics:
   * - Clean names (alphanumeric only) are processed first
   * - Names with special characters are processed after
   * This avoids naming conflicts during migration when special characters are cleaned
   */
  private prioritizeDataRaptorsWithoutSpecialCharacters(dataRaptors: AnyJson[]): AnyJson[] {
    const nameField = this.getBundleFieldKey('Name');
    return prioritizeCleanNamesFirst(dataRaptors, nameField);
  }
}
