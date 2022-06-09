/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';

import DRBulkDataMappings from '../mappings/DRBulkData';
import { DebugTimer, QueryTools } from '../utils';
import { BaseMigrationTool } from './base';
import { MigrationResult, MigrationTool, ObjectMapping, TransformData } from './interfaces';


export class DRBulkDataMigrationTool extends BaseMigrationTool implements MigrationTool {

	static readonly DRBULKDATA_NAME = 'DRBulkData__c';

	static readonly OMNIPROCESSTRANSIENTDATA_NAME = 'OmniProcessTransientData';

	getName(): string {
		return "DataRaptor Bulk Data";
	}

	getRecordName(record: string) {
		return record['Name'];
	}

	getMappings(): ObjectMapping[] {
		return [{
			source: DRBulkDataMigrationTool.DRBULKDATA_NAME,
			target: DRBulkDataMigrationTool.OMNIPROCESSTRANSIENTDATA_NAME,
		}];
	}

	async truncate(): Promise<void> {
		return super.truncate(DRBulkDataMigrationTool.OMNIPROCESSTRANSIENTDATA_NAME);
	}

	async migrate(): Promise<MigrationResult[]> {

		const drBulkData = await this.prepareDRbulkData();

		// Save the data raptors
		const drBulkDataUploadResponse = await this.uploadTransformedData(DRBulkDataMigrationTool.OMNIPROCESSTRANSIENTDATA_NAME, drBulkData);

		return [{
			name: 'Data Rator Bulk Data',
			records: drBulkData.originalRecords,
			results: drBulkDataUploadResponse
		}];
	}

	private async prepareDRbulkData(): Promise<TransformData> {
		const mappedRecords = [],
			originalRecords = new Map<string, AnyJson>(),
			nsPrefix = this.namespace ? this.namespace + '__' : '';

		// Query all DRBulkData and the respective items
		const drbulkdata = await QueryTools.queryAll(this.connection, this.namespace, DRBulkDataMigrationTool.DRBULKDATA_NAME, this.getDRBulkDataFields());

		// Start transforming each DRBulkData
		for (let drbd of drbulkdata) {

			// Skip if Type is "Migration"
			// Ask Adam / Manas / Susan about this scenario
			if (drbd[nsPrefix + 'Type__c'] === 'Migration') continue;

			const recordId = drbd['Id'];

			// Perform the transformation
			mappedRecords.push(this.mapDRBulkDataRecord(drbd));

			// Create a map of the original records
			originalRecords.set(recordId, drbd);
		};

		return { originalRecords, mappedRecords };
	}

	/**
	 * Maps an indivitdual DRBundle__c record to an OmniDataTransform record.
	 * @param dataRaptorRecord 
	 * @returns 
	 */
	private mapDRBulkDataRecord(drBulkDataRecord: AnyJson): AnyJson {

		// Transformed object
		const mappedObject = {};

		// Get the fields of the record
		const recordFields = Object.keys(drBulkDataRecord);

		// Map individual fields
		recordFields.forEach(recordField => {
			const cleanFieldName = this.getCleanFieldName(recordField);

			if (DRBulkDataMappings.hasOwnProperty(cleanFieldName)) {
				mappedObject[DRBulkDataMappings[cleanFieldName]] = drBulkDataRecord[recordField];
			}
		});

		// BATCH framework requires that each record has an "attributes" property
		mappedObject['attributes'] = {
			type: DRBulkDataMigrationTool.OMNIPROCESSTRANSIENTDATA_NAME,
			referenceId: drBulkDataRecord['Id']
		};

		return mappedObject;
	}

	private getDRBulkDataFields(): string[] {
		return Object.keys(DRBulkDataMappings);
	}
}