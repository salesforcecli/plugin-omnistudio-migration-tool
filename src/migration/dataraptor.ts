/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';
import DRBundleMappings from '../mappings/DRBundle';
import DRMapItemMappings from '../mappings/DRMapItem';
import { DebugTimer, oldNew, QueryTools } from '../utils';
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
import { isStandardDataModel, isStandardDataModelWithMetadataAPIEnabled } from '../utils/dataModelService';
import { prioritizeCleanNamesFirst } from '../utils/recordPrioritization';

export class DataRaptorMigrationTool extends BaseMigrationTool implements MigrationTool {
  static readonly DRBUNDLE_NAME = 'DRBundle__c';
  static readonly DRMAPITEM_NAME = 'DRMapItem__c';

  static readonly OMNIDATATRANSFORM_NAME = 'OmniDataTransform';
  static readonly OMNIDATATRANSFORMITEM_NAME = 'OmniDataTransformItem';
  private IS_STANDARD_DATA_MODEL: boolean = isStandardDataModel();

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

      // Verify duplicated names before trying to submitt
      if (duplicatedNames.has(transformedDataRaptor['Name'].toLowerCase())) {
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
        duplicatedNames.add(dataMapperName.toLowerCase());

        const items = await this.getItemsForDataRaptor(dataRaptorItemsData, name, drUploadResponse.id);
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
    const drToItemsMap = new Map<string, AnyJson[]>();
    const drItems = await this.getAllItems();
    for (const drItem of drItems) {
      const drName = drItem['Name'];
      if (drToItemsMap.has(drName)) {
        drToItemsMap.get(drName).push(drItem);
      } else {
        drToItemsMap.set(drName, [drItem]);
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

    if (existingDataRaptorNames.has(existingDRNameVal.cleanName().toLowerCase())) {
      warnings.push(this.messages.getMessage('duplicatedName') + '  ' + existingDRNameVal.cleanName());
      assessmentStatus = 'Needs manual intervention';
    } else {
      existingDataRaptorNames.add(existingDRNameVal.cleanName().toLowerCase());
    }
    const apexDependencies = [];
    if (dataRaptor[this.getBundleFieldKey('CustomInputClass__c')]) {
      apexDependencies.push(dataRaptor[this.getBundleFieldKey('CustomInputClass__c')]);
    }
    if (dataRaptor[this.getBundleFieldKey('CustomOutputClass__c')]) {
      apexDependencies.push(dataRaptor[this.getBundleFieldKey('CustomOutputClass__c')]);
    }

    const formulaChanges: oldNew[] = [];
    const drItems = dataRaptorItemsMap.get(drName);
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
    return dataRaptorAssessmentInfo;
  }

  // Get All DRBundle__c records
  private async getAllDataRaptors(): Promise<AnyJson[]> {
    //DebugTimer.getInstance().lap('Query DRBundle');
    const dataRaptors = await QueryTools.queryAll(
      this.connection,
      this.getQueryNamespace(),
      this.getBundleObjectName(),
      this.getDRBundleFields()
    ).catch((err) => {
      if (err.errorCode === 'INVALID_TYPE') {
        throw new InvalidEntityTypeError(`${this.getBundleObjectName()} type is not found under this namespace`);
      }
      throw err;
    });

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
    drId: string
  ): Promise<TransformData> {
    //Query all Elements
    const mappedRecords = [];
    const originalRecords = new Map<string, AnyJson>();

    dataRaptorItems.forEach((drItem) => {
      const recordId = drItem['Id'];
      // const itemParentId = drItem[nsPrefix + 'OmniDataTransformationId__c']
      if (drItem['Name'] === drName) {
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
    mappedObject['IsActive'] = true;
    // IsMigrated field only exists in core 264+ (API v68.0).
    // Skip on older orgs to avoid "No such column" errors.
    const apiVersion = parseFloat((this.connection as any).getApiVersion?.() ?? '0');
    if (apiVersion >= 68.0) {
      mappedObject['IsMigrated'] = true;
    }
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

    // The managed-package (Package Designer) runtime accepts a colon separator in the Data Mapper
    // JSON paths (Extract Object path "Acc:test" in OutputFieldName and its mapping reference
    // "Acc:test:id" in InputFieldName), but the standard (Core Designer) runtime expects a dot. Node
    // definitions convert every colon ("Acc:test" -> "Acc.test"); references keep the trailing
    // field-accessor colon ("Acc:test:id" -> "Acc.test:id"). Convert so the node definition and every
    // reference to it stay in sync on the standard runtime.
    this.convertObjectPathSeparators(mappedObject);

    // BATCH framework requires that each record has an "attributes" property
    mappedObject['attributes'] = {
      type: DataRaptorMigrationTool.OMNIDATATRANSFORMITEM_NAME,
      referenceId: dataRaptorItemRecord['Id'],
    };

    return mappedObject;
  }

  /**
   * Object/node-path fields whose value is a *definition* of a node or object path. Here every colon is
   * a hierarchy separator, so all of them convert to dots (":" -> ".").
   *
   * For a DataRaptor Extract the "Extract Object path" node is stored in OutputFieldName
   * (DomainObjectFieldAPIName__c), e.g. "Acc:info" -> "Acc.info". The input/output *object* fields
   * (InputObjectName/OutputObjectName) normally hold plain SObject names (e.g. "Case") and are
   * colon-free, but are included so any path variant is covered. FormulaResultPath is the JSON output
   * location of a formula result and follows the same node-path convention.
   */
  private static readonly OBJECT_PATH_FIELDS: string[] = [
    DRMapItemMappings.InterfaceObjectName__c, // InputObjectName   (input/extraction object, e.g. SObject "Case")
    DRMapItemMappings.DomainObjectAPIName__c, // OutputObjectName  (Load/Transform output object)
    DRMapItemMappings.DomainObjectFieldAPIName__c, // OutputFieldName  (Extract Object path / output node, e.g. "Acc:info")
    DRMapItemMappings.FormulaResultPath__c, // FormulaResultPath (JSON output path where a formula result is written)
  ];

  /**
   * Reference fields whose value points at a *field on a node*, in the form "nodePath:field"
   * (e.g. the mapping source "Acc:test:id" or a lookup key). Only the node-path portion uses the
   * hierarchy separator; the final colon is the field accessor and must be preserved on the standard
   * runtime. So "Acc:test:id" -> "Acc.test:id" (node "Acc.test", field "id"), and a value with a single
   * colon such as "Acc:id" is left untouched (bare node "Acc", field "id").
   */
  private static readonly REFERENCE_PATH_FIELDS: string[] = [
    DRMapItemMappings.InterfaceFieldAPIName__c, // InputFieldName          (mapping source path, e.g. "Acc:test:id")
    DRMapItemMappings.LookupDomainObjectName__c, // LookupObjectName
    DRMapItemMappings.LookupDomainObjectFieldName__c, // LookupByFieldName
    DRMapItemMappings.LookupDomainObjectRequestedFieldName__c, // LookupReturnedFieldName
  ];

  /**
   * Converts the colon separator in a Data Mapper item's object/field JSON paths to a dot separator.
   *
   * The managed-package runtime historically accepted a colon (e.g. "Acc:info"), while the standard
   * runtime requires a dot ("Acc.info"). Object/node-path fields convert every colon; reference fields
   * (mapping source, lookups) convert only the node-path portion and keep the trailing field-accessor
   * colon so a reference like "Acc:test:id" becomes "Acc.test:id". This mutates the mapped record in
   * place and is a no-op when no colon is present, so records already using dot notation and plain
   * SObject/field API names are left unchanged.
   *
   * @param mappedObject The already-mapped OmniDataTransformItem record.
   */
  private convertObjectPathSeparators(mappedObject: AnyJson): void {
    // 1) Object/node-path fields: a colon is always a hierarchy separator here, so convert every one.
    for (const fieldKey of DataRaptorMigrationTool.OBJECT_PATH_FIELDS) {
      const value = mappedObject[fieldKey];

      if (typeof value === 'string' && value.includes(':')) {
        const convertedValue = value.replace(/:/g, '.');
        mappedObject[fieldKey] = convertedValue;
        Logger.logVerbose(this.messages.getMessage('extractObjectPathSeparatorConverted', [value, convertedValue]));
      }
    }

    // 2) Reference fields ("nodePath:field"): convert the node-path portion but keep the final
    //    field-accessor colon, so "Acc:test:id" -> "Acc.test:id" (not "Acc.test.id").
    for (const fieldKey of DataRaptorMigrationTool.REFERENCE_PATH_FIELDS) {
      const value = mappedObject[fieldKey];

      if (typeof value === 'string' && value.includes(':')) {
        const convertedValue = this.convertNodePathKeepingFieldAccessor(value);
        if (convertedValue !== value) {
          mappedObject[fieldKey] = convertedValue;
          Logger.logVerbose(this.messages.getMessage('extractObjectPathSeparatorConverted', [value, convertedValue]));
        }
      }
    }

    // 3) Formula expression: convert only alias:node[:field] references (e.g. "Acc:test:id"), leaving
    //    quoted string literals and time-like values untouched so we don't corrupt the formula.
    const formulaKey = DRMapItemMappings.Formula__c; // 'FormulaExpression'
    const formula = mappedObject[formulaKey];
    if (typeof formula === 'string' && formula.includes(':')) {
      const convertedFormula = this.convertColonPathsInExpression(formula);
      if (convertedFormula !== formula) {
        mappedObject[formulaKey] = convertedFormula;
        Logger.logVerbose(
          this.messages.getMessage('extractObjectPathSeparatorConverted', [formula, convertedFormula])
        );
      }
    }
  }

  /**
   * Converts a "nodePath:field" reference to standard notation by dotting the node-path portion while
   * preserving the final field-accessor colon.
   *
   * The last colon separates the node path from the field being read/looked up, and the standard
   * runtime keeps that as a colon; only the hierarchy separators within the node path become dots.
   * Examples: "Acc:test:id" -> "Acc.test:id", "Acc:a:b:id" -> "Acc.a.b:id", "Acc:id" -> "Acc:id"
   * (single colon = bare node + field, nothing to convert), "Acc" -> "Acc" (no colon).
   *
   * @param value The reference value to convert.
   * @returns The reference with the node-path portion rewritten to dot notation.
   */
  private convertNodePathKeepingFieldAccessor(value: string): string {
    const lastColon = value.lastIndexOf(':');
    if (lastColon === -1) {
      return value;
    }
    // Dot out the node path before the final colon; keep the final ":field" verbatim.
    return value.substring(0, lastColon).replace(/:/g, '.') + value.substring(lastColon);
  }

  /**
   * Rewrites colon-separated node-path references (e.g. "Acc:test:id" -> "Acc.test:id") inside a Data
   * Mapper formula expression, while preserving anything that is not a path.
   *
   * A formula reference reads a field on a node, so it follows the same "nodePath:field" convention as
   * the reference fields: only the node-path portion is dotted and the final field-accessor colon is
   * kept (see convertNodePathKeepingFieldAccessor). Quoted string literals ('...' or "...") are left
   * verbatim, so a colon that is genuine text (e.g. "Time: 12:30") survives. In the unquoted parts,
   * only a sequence of identifiers joined by colons is converted; a path must start with a letter or
   * underscore, so numeric/time-like tokens such as "12:30" are never matched. Merge-field wrappers
   * (e.g. "%Acc:test:id%") are handled too because the surrounding "%" are non-identifier characters
   * that bound the path token.
   *
   * Known limitation: escaped quotes inside string literals are not tracked; such formulas are rare
   * in Data Mappers and would only mean an embedded literal is treated as unquoted.
   *
   * @param expression The formula expression to convert.
   * @returns The expression with colon-separated node paths rewritten to dot notation.
   */
  private convertColonPathsInExpression(expression: string): string {
    const pathReference = /[A-Za-z_]\w*(?::[A-Za-z_]\w*)+/g;
    return expression
      .split(/('[^']*'|"[^"]*")/)
      .map((segment) =>
        segment.startsWith("'") || segment.startsWith('"')
          ? segment
          : segment.replace(pathReference, (match) => this.convertNodePathKeepingFieldAccessor(match))
      )
      .join('');
  }

  private getDRBundleFields(): string[] {
    return this.IS_STANDARD_DATA_MODEL ? Object.values(DRBundleMappings) : Object.keys(DRBundleMappings);
  }

  private getDRMapItemFields(): string[] {
    return this.IS_STANDARD_DATA_MODEL
      ? [...new Set(Object.values(DRMapItemMappings))]
      : Object.keys(DRMapItemMappings);
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
