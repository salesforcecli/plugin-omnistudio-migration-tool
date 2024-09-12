/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';
import DRBundleMappings from '../mappings/DRBundle';
import DRMapItemMappings from '../mappings/DRMapItem';
import { DebugTimer, QueryTools } from '../utils';
import { NetUtils } from '../utils/net';
import { BaseMigrationTool } from './base';
import { MigrationResult, MigrationTool, ObjectMapping, TransformData, UploadRecordResult } from './interfaces';
import getReplacedformulaString, { getAllFunctionMetadata } from '../utils/formula/FormulaUtil';

export class DataRaptorMigrationTool extends BaseMigrationTool implements MigrationTool {
  static readonly DRBUNDLE_NAME = 'DRBundle__c';
  static readonly DRMAPITEM_NAME = 'DRMapItem__c';

  static readonly OMNIDATATRANSFORM_NAME = 'OmniDataTransform';
  static readonly OMNIDATATRANSFORMITEM_NAME = 'OmniDataTransformItem';

  getName(): string {
    return 'DataRaptor';
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
    const functionDefinitionMetadata = await getAllFunctionMetadata(this.namespace, this.connection);

    // Start transforming each dataRaptor
    DebugTimer.getInstance().lap('Transform Data Raptor');
    let done = 0;
    const total = dataRaptors.length;

    if (functionDefinitionMetadata.length > 0 && dataRaptorItemsData.length > 0) {
      // do the formula updation in the DR items
      for (let drItem of dataRaptorItemsData) {
        if (drItem[this.namespacePrefix + 'Formula__c'] != null) {
          let formulaSyntax = drItem[this.namespacePrefix + 'Formula__c'];
          for (let functionDefMd of functionDefinitionMetadata) {
            const FormulaName = functionDefMd['DeveloperName'];
            const regExStr = new RegExp('\\b' + FormulaName + '\\b', 'g');
            const numberOfOccurances: number =
              formulaSyntax.match(regExStr) !== null ? formulaSyntax.match(regExStr).length : 0;
            if (numberOfOccurances > 0) {
              for (var count: number = 1; count <= numberOfOccurances; count++) {
                formulaSyntax = getReplacedformulaString(
                  formulaSyntax,
                  functionDefMd['DeveloperName'],
                  functionDefMd[this.namespacePrefix + 'ClassName__c'],
                  functionDefMd[this.namespacePrefix + 'MethodName__c']
                );
                //console.log(formulaSyntax);
              }

              if (formulaSyntax !== drItem[this.namespacePrefix + 'Formula__c']) {
                drItem[this.namespacePrefix + 'Formula__c'] = formulaSyntax;
              }
            }
          }
        }
      }
    }

    for (let dr of dataRaptors) {
      this.reportProgress(total, done);

      // Skip if Type is "Migration"
      if (dr[this.namespacePrefix + 'Type__c'] === 'Migration') continue;
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

      done++;
    }

    return {
      name: 'Data Raptor',
      results: drUploadInfo,
      records: originalDrRecords,
    };
  }

  // Get All DRBundle__c records
  private async getAllDataRaptors(): Promise<AnyJson[]> {
    DebugTimer.getInstance().lap('Query DRBundle');
    return await QueryTools.queryAll(
      this.connection,
      this.namespace,
      DataRaptorMigrationTool.DRBUNDLE_NAME,
      this.getDRBundleFields()
    );
  }

  // Get All Items
  private async getAllItems(): Promise<AnyJson[]> {
    //Query all Elements
    return await QueryTools.queryAll(
      this.connection,
      this.namespace,
      DataRaptorMigrationTool.DRMAPITEM_NAME,
      this.getDRMapItemFields()
    );
  }

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
