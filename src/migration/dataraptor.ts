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

export class DataRaptorMigrationTool extends BaseMigrationTool implements MigrationTool {
  static readonly DRBUNDLE_NAME = 'DRBundle__c';
  static readonly DRMAPITEM_NAME = 'DRMapItem__c';

  static readonly OMNIDATATRANSFORM_NAME = 'OmniDataTransform';
  static readonly OMNIDATATRANSFORMITEM_NAME = 'OmniDataTransformItem';

  getName(): string {
    return 'DataMappers';
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
    await super.truncate(DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME);
  }

  async migrate(): Promise<MigrationResult[]> {
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
        if (drItem[this.namespacePrefix + 'Formula__c'] != null) {
          try {
            var originalString = getReplacedString(
              this.namespacePrefix,
              drItem[this.namespacePrefix + 'Formula__c'],
              functionDefinitionMetadata
            );
            drItem[this.namespacePrefix + 'Formula__c'] = originalString;
          } catch (ex) {
            Logger.error('Error updating formula for data mapper', ex);
            Logger.logVerbose(
              this.messages.getMessage('formulaSyntaxError', [drItem[this.namespacePrefix + 'Formula__c']])
            );
          }
        }
      }
    }
    let progressCounter = 0;
    let nonMigrationDataRaptors = dataRaptors.filter(
      (dr) => dr[this.namespacePrefix + 'Type__c'] !== 'Migration'
    ).length;
    Logger.log(this.messages.getMessage('foundDataRaptorsToMigrate', [nonMigrationDataRaptors]));
    const progressBar = createProgressBar('Migrating', 'Data Mapper');
    progressBar.start(nonMigrationDataRaptors, progressCounter);
    for (let dr of dataRaptors) {
      // Skip if Type is "Migration"
      if (dr[this.namespacePrefix + 'Type__c'] === 'Migration') continue;
      progressBar.update(++progressCounter);
      const recordId = dr['Id'];
      const name = dr['Name'];

      const typeKey = dr[this.namespacePrefix + 'Type__c'];
      const outputTypeKey = dr[this.namespacePrefix + 'OutputType__c'];
      const targetOutputDocumentIdentifier = dr[this.namespacePrefix + 'TargetOutDocuSignTemplateId__c'];
      const targetOutputFileName = dr[this.namespacePrefix + 'TargetOutPdfDocName__c'];

      if (typeKey === null) {
        dr[this.namespacePrefix + 'Type__c'] = 'Extract';
      }

      // Fix up Input/Output types for older DR's
      switch (typeKey) {
        case 'Transform':
          dr[this.namespacePrefix + 'Type__c'] = 'Transform';
          dr[this.namespacePrefix + 'InputType__c'] = 'JSON';
          if (targetOutputDocumentIdentifier !== null) {
            dr[this.namespacePrefix + 'OutputType__c'] = 'DocuSign';
          } else if (
            targetOutputFileName !== null &&
            (outputTypeKey !== 'PDF' || outputTypeKey !== 'Document Template')
          ) {
            dr[this.namespacePrefix + 'OutputType__c'] = 'PDF';
          } else {
            dr[this.namespacePrefix + 'OutputType__c'] = 'JSON';
          }
          break;
        case 'Extract (JSON)':
          dr[this.namespacePrefix + 'Type__c'] = 'Extract';
          dr[this.namespacePrefix + 'InputType__c'] = 'JSON';
          dr[this.namespacePrefix + 'OutputType__c'] = 'JSON';
          break;
        case 'Load (JSON)':
          dr[this.namespacePrefix + 'Type__c'] = 'Load';
          dr[this.namespacePrefix + 'InputType__c'] = 'JSON';
          dr[this.namespacePrefix + 'OutputType__c'] = 'SObject';
          break;
        case 'Load (Object)':
          dr[this.namespacePrefix + 'Type__c'] = 'Load';
          dr[this.namespacePrefix + 'InputType__c'] = 'SObject';
          dr[this.namespacePrefix + 'OutputType__c'] = 'SObject';
          break;
        default: // no-op;
      }

      // Transform the data raptor
      const transformedDataRaptor = this.mapDataRaptorRecord(dr);

      // Verify duplicated names before trying to submitt
      if (duplicatedNames.has(transformedDataRaptor['Name'])) {
        this.setRecordErrors(dr, this.messages.getMessage('duplicatedDrName'));
        originalDrRecords.set(recordId, dr);
        continue;
      }
      duplicatedNames.add(transformedDataRaptor['Name']);

      // Create a map of the original records
      originalDrRecords.set(recordId, dr);

      // Save the data raptors
      // const drUploadResponse = await this.uploadTransformedData(DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME, { mappedRecords, originalRecords });
      const drUploadResponse = await NetUtils.createOne(
        this.connection,
        DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME,
        recordId,
        transformedDataRaptor
      );

      if (drUploadResponse && drUploadResponse.success === true) {
        const items = await this.getItemsForDataRaptor(dataRaptorItemsData, name, drUploadResponse.id);

        // Check for name changes
        if (transformedDataRaptor[DRBundleMappings.Name] !== dr['Name']) {
          drUploadResponse.newName = transformedDataRaptor[DRBundleMappings.Name];
        }

        // Move the items
        await this.uploadTransformedData(DataRaptorMigrationTool.OMNIDATATRANSFORMITEM_NAME, items);

        drUploadInfo.set(recordId, drUploadResponse);
      }
    }
    progressBar.stop();

    return {
      name: 'Data Mapper',
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

    const progressBar = createProgressBar('Assessing', 'Data Mapper');
    let progressCounter = 0;
    let nonMigrationDataRaptors = dataRaptors.filter(
      (dr) => dr[this.namespacePrefix + 'Type__c'] !== 'Migration'
    ).length;
    Logger.log(this.messages.getMessage('foundDataRaptorsToAssess', [nonMigrationDataRaptors]));
    progressBar.start(nonMigrationDataRaptors, progressCounter);
    // Now process each OmniScript and its elements
    for (const dataRaptor of dataRaptors) {
      if (dataRaptor[this.namespacePrefix + 'Type__c'] === 'Migration') continue;
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
          type: dataRaptor[this.namespacePrefix + 'Type__c'] || '',
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
    let assessmentStatus = 'Can be Automated';

    if (!existingDRNameVal.isNameCleaned()) {
      warnings.push(
        this.messages.getMessage('changeMessage', [
          existingDRNameVal.type,
          existingDRNameVal.val,
          existingDRNameVal.cleanName(),
        ])
      );
      assessmentStatus = 'Has Warnings';
    }
    if (existingDataRaptorNames.has(existingDRNameVal.cleanName())) {
      warnings.push(this.messages.getMessage('duplicatedName') + '  ' + existingDRNameVal.cleanName());
      assessmentStatus = 'Need Manual Intervention';
    } else {
      existingDataRaptorNames.add(existingDRNameVal.cleanName());
    }
    const apexDependencies = [];
    if (dataRaptor[this.namespacePrefix + 'CustomInputClass__c']) {
      apexDependencies.push(dataRaptor[this.namespacePrefix + 'CustomInputClass__c']);
    }
    if (dataRaptor[this.namespacePrefix + 'CustomOutputClass__c']) {
      apexDependencies.push(dataRaptor[this.namespacePrefix + 'CustomOutputClass__c']);
    }

    const formulaChanges: oldNew[] = [];
    const drItems = dataRaptorItemsMap.get(drName);
    if (drItems) {
      for (const drItem of drItems) {
        // Logger.log(dataRaptor[this.namespacePrefix + 'Formula__c']);
        const formula = drItem[this.namespacePrefix + 'Formula__c'];
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
      type: dataRaptor[this.namespacePrefix + 'Type__c'] || '',
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
    return await QueryTools.queryAll(
      this.connection,
      this.namespace,
      DataRaptorMigrationTool.DRBUNDLE_NAME,
      this.getDRBundleFields()
    ).catch((err) => {
      if (err.errorCode === 'INVALID_TYPE') {
        throw new InvalidEntityTypeError(
          `${DataRaptorMigrationTool.DRBUNDLE_NAME} type is not found under this namespace`
        );
      }
      throw err;
    });
  }

  // Get All Items
  private async getAllItems(): Promise<AnyJson[]> {
    //Query all Elements
    return await QueryTools.queryAll(
      this.connection,
      this.namespace,
      DataRaptorMigrationTool.DRMAPITEM_NAME,
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
    const mappedRecords = [],
      originalRecords = new Map<string, AnyJson>();

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
    const mappedObject = {};

    // Get the fields of the record
    const recordFields = Object.keys(dataRaptorRecord);

    // Map individual fields
    recordFields.forEach((recordField) => {
      const cleanFieldName = this.getCleanFieldName(recordField);

      if (DRBundleMappings.hasOwnProperty(cleanFieldName)) {
        mappedObject[DRBundleMappings[cleanFieldName]] = dataRaptorRecord[recordField];
      }
    });

    mappedObject['Name'] = this.cleanName(mappedObject['Name']);
    mappedObject['IsActive'] = true;

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
    const mappedObject = {};

    // Get the fields of the record
    const recordFields = Object.keys(dataRaptorItemRecord);

    // Map individual fields
    recordFields.forEach((recordField) => {
      const cleanFieldName = this.getCleanFieldName(recordField);

      if (DRMapItemMappings.hasOwnProperty(cleanFieldName)) {
        mappedObject[DRMapItemMappings[cleanFieldName]] = dataRaptorItemRecord[recordField];
      }
    });

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
    return Object.keys(DRBundleMappings);
  }

  private getDRMapItemFields(): string[] {
    return Object.keys(DRMapItemMappings);
  }
}
