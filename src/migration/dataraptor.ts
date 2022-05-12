/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';
import DRBundleMappings from '../mappings/DRBundle';
import DRMapItemMappings from '../mappings/DRMapItem';
import { DebugTimer, QueryTools } from '../utils';
import { BaseMigrationTool } from './base';
import { MigrationResult, MigrationTool, ObjectMapping, TransformData, UploadRecordResult } from './interfaces';


export class DataRaptorMigrationTool extends BaseMigrationTool implements MigrationTool {

	static readonly DRBUNDLE_NAME = 'DRBundle__c';
	static readonly DRMAPITEM_NAME = 'DRMapItem__c';

	static readonly OMNIDATATRANSFORM_NAME = 'OmniDataTransform';
	static readonly OMNIDATATRANSFORMITEM_NAME = 'OmniDataTransformItem';

	getName(): string {
		return "DataRaptor";
	}

	getRecordName(record: string) {
		return record['Name'];
	}

	getMappings(): ObjectMapping[] {
		return [{
			source: DataRaptorMigrationTool.DRBUNDLE_NAME,
			target: DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME
		}, {
			source: DataRaptorMigrationTool.DRMAPITEM_NAME,
			target: DataRaptorMigrationTool.OMNIDATATRANSFORMITEM_NAME
		}];
	}

	async truncate(): Promise<void> {
		await super.truncate(DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME)
		await super.truncate(DataRaptorMigrationTool.OMNIDATATRANSFORMITEM_NAME);
	}

	async migrate(): Promise<MigrationResult[]> {
		return [await this.MigrateDataRaptorData()];
	}

	private async MigrateDataRaptorData(): Promise<MigrationResult> {
        let originalDrRecords = new Map<string, any>();
		let drUploadInfo = new Map<string, UploadRecordResult>();

		// Query all dataraptors and the respective items
		DebugTimer.getInstance().lap('Query data raptors');
		const dataRaptors = await this.getAllDataRaptors();


        const dataRaptorItemsData = await this.getAllItems();
		// Start transforming each dataRaptor
		DebugTimer.getInstance().lap('Transform Data Raptor');
		for (let dr of dataRaptors) {
            const mappedRecords = [],
			originalRecords = new Map<string, AnyJson>();

			// Skip if Type is "Migration"
			if (dr[this.namespacePrefix + 'Type__c'] === 'Migration') continue;
			const recordId = dr['Id'];
			const name = dr['Name'];

			if (!this.validMetaDataName(name)) {
				this.setRecordErrors(dr, this.messages.getMessage('invalidDataRaptorName'));
				originalRecords.set(recordId, dr);
				continue;
			}
			const typeKey = dr[this.namespacePrefix + 'Type__c'];
			const inputTypeKey = dr[this.namespacePrefix + 'InputType__c'];
			const outputTypeKey = dr[this.namespacePrefix + 'OutputType__c'];
			const targetOutputDocumentIdentifier = dr[this.namespacePrefix + 'TargetOutDocuSignTemplateId__c'];
			const targetOutputFileName = dr[this.namespacePrefix + 'TargetOutPdfDocName__c'];

			if (typeKey === null) {
				dr[this.namespacePrefix + 'Type__c'] = 'Extract';
			}
			// Fix up Input/Output types for older DR's
			if (inputTypeKey === null || outputTypeKey === null ) {
				switch (typeKey) {
					case 'Transform': dr[this.namespacePrefix + 'Type__c'] = 'Transform';
						dr[this.namespacePrefix + 'InputType__c'] = 'JSON';
						if (targetOutputDocumentIdentifier !== null) {
							dr[this.namespacePrefix + 'OutputType__c'] = 'DocuSign';
						} else if (targetOutputFileName !== null &&
									(outputTypeKey !== 'PDF' || outputTypeKey !== 'Document Template')) {
										dr[this.namespacePrefix + 'OutputType__c'] = 'PDF';
						} else {
							dr[this.namespacePrefix + 'OutputType__c']  = 'JSON';
						}
						break;
					case 'Extract (JSON)': dr[this.namespacePrefix + 'Type__c'] = 'Extract';
						dr[this.namespacePrefix + 'InputType__c'] = 'JSON';
						dr[this.namespacePrefix + 'OutputType__c'] = 'JSON';
						break;
					case 'Load (JSON)': dr[this.namespacePrefix + 'Type__c']  = 'Load';
						dr[this.namespacePrefix + 'InputType__c'] = 'JSON';
						dr[this.namespacePrefix + 'OutputType__c'] = 'SObject';
						break;
					case 'Load (Object)': dr[this.namespacePrefix + 'Type__c']  = 'Load';
						dr[this.namespacePrefix + 'InputType__c'] = 'SObject';
						dr[this.namespacePrefix + 'OutputType__c'] = 'SObject';
						break;
					default: // no-op;
				}
			}
			mappedRecords.push(this.mapDataRaptorRecord(dr));
			// Create a map of the original records
			originalRecords.set(recordId, dr);

            // Save the data raptors
		 const drUploadResponse = await this.uploadTransformedData(DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME, { mappedRecords, originalRecords });
		 if (drUploadResponse && drUploadResponse.get(recordId)){
         	const items = await this.getItemsForDataRaptor(dataRaptorItemsData, name, drUploadResponse.get(recordId).id);
         	await this.uploadTransformedData(DataRaptorMigrationTool.OMNIDATATRANSFORMITEM_NAME, items);
		 	originalDrRecords = new Map([...Array.from(originalDrRecords.entries()), ...Array.from(originalRecords.entries())]);
		 	drUploadInfo = new Map([...Array.from(drUploadInfo.entries()), ...Array.from(drUploadResponse.entries())]);
		 }

		};

		return {
			name: 'Data Raptor',
			results: drUploadInfo,
			records: originalDrRecords
		};
	}


    // Get All DRBundle__c records 
	private async getAllDataRaptors(): Promise<AnyJson[]> {
		DebugTimer.getInstance().lap('Query DRBundle');
        return await QueryTools.queryAll(this.connection, this.namespace, DataRaptorMigrationTool.DRBUNDLE_NAME, this.getDRBundleFields());
	}


    // Get All Items
	private async getAllItems(): Promise<AnyJson[]> {
		//Query all Elements
		return await QueryTools.queryAll(this.connection, this.namespace, DataRaptorMigrationTool.DRMAPITEM_NAME, this.getDRMapItemFields());
	}


    // Get All Items for one DataRaptor
	private async getItemsForDataRaptor(dataRaptorItems: AnyJson[], drName: string, drId: string): Promise<TransformData> {
		//Query all Elements
		const mappedRecords = [],
			originalRecords = new Map<string, AnyJson>();
		// Start transforming each dataRaptor
		DebugTimer.getInstance().lap('Transform items');
		dataRaptorItems.forEach(drItem => {

			const recordId = drItem['Id'];
           // const itemParentId = drItem[nsPrefix + 'OmniDataTransformationId__c']
            if (drItem['Name'] === drName){
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
		recordFields.forEach(recordField => {
			const cleanFieldName = this.getCleanFieldName(recordField);

			if (DRBundleMappings.hasOwnProperty(cleanFieldName)) {
				mappedObject[DRBundleMappings[cleanFieldName]] = dataRaptorRecord[recordField];
			}
		});

		// BATCH framework requires that each record has an "attributes" property
		mappedObject['attributes'] = {
			type: DataRaptorMigrationTool.OMNIDATATRANSFORM_NAME,
			referenceId: dataRaptorRecord['Id']
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
		recordFields.forEach(recordField => {
			const cleanFieldName = this.getCleanFieldName(recordField);

			if (DRMapItemMappings.hasOwnProperty(cleanFieldName)) {
				mappedObject[DRMapItemMappings[cleanFieldName]] = dataRaptorItemRecord[recordField];
			}
		});

		// Set the parent/child relationship
		mappedObject['OmniDataTransformationId'] = omniDataTransformationId;

		// BATCH framework requires that each record has an "attributes" property
		mappedObject['attributes'] = {
			type: DataRaptorMigrationTool.OMNIDATATRANSFORMITEM_NAME,
			referenceId: dataRaptorItemRecord['Id']
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