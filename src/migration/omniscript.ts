/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';

import OmniScriptMappings from '../mappings/OmniScript';
import ElementMappings from '../mappings/Element';
import OmniScriptDefinitionMappings from '../mappings/OmniScriptDefinition';
import { DebugTimer, QueryTools, SortDirection } from '../utils';
import { BaseMigrationTool } from './base';
import { MigrationResult, MigrationTool, TransformData, UploadRecordResult } from './interfaces';
import { ObjectMapping } from './interfaces';
import { NetUtils, RequestMethod } from '../utils/net';
import { Connection, Logger, Messages } from '@salesforce/core';
import { UX } from '@salesforce/command';

export class OmniScriptMigrationTool extends BaseMigrationTool implements MigrationTool {

	private readonly exportType: OmniScriptExportType;

	// Source Custom Object Names
	static readonly OMNISCRIPT_NAME = 'OmniScript__c';
	static readonly ELEMENT_NAME = 'Element__c';
	static readonly OMNISCRIPTDEFINITION_NAME = 'OmniScriptDefinition__c';

	// Target Standard Objects Name 
	static readonly OMNIPROCESS_NAME = 'OmniProcess';
	static readonly OMNIPROCESSELEMENT_NAME = 'OmniProcessElement';
	static readonly OMNIPROCESSCOMPILATION_NAME = 'OmniProcessCompilation';

	constructor(exportType: OmniScriptExportType, namespace: string, connection: Connection, logger: Logger, messages: Messages, ux: UX) {
		super(namespace, connection, logger, messages, ux);
		this.exportType = exportType;
	}

	getName(): string {
		return "OmniScript / Integration Procedures";
	}

	getRecordName(record: string) {
		return record[this.namespacePrefix + 'Type__c']
			+ '_'
			+ record[this.namespacePrefix + 'SubType__c']
			+ (record[this.namespacePrefix + 'Language__c'] ? '_' + record[this.namespacePrefix + 'Language__c'] : '')
			+ '_'
			+ record[this.namespacePrefix + 'Version__c'];
	}

	getMappings(): ObjectMapping[] {
		return [{
			source: OmniScriptMigrationTool.OMNISCRIPT_NAME,
			target: OmniScriptMigrationTool.OMNIPROCESS_NAME
		}, {
			source: OmniScriptMigrationTool.ELEMENT_NAME,
			target: OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME
		}, {
			source: OmniScriptMigrationTool.OMNISCRIPTDEFINITION_NAME,
			target: OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME
		}];
	}

	async truncate(): Promise<void> {
		const objectName = OmniScriptMigrationTool.OMNIPROCESS_NAME;

		const allIds = await this.deactivateRecord(objectName);
		await this.truncateElements(objectName, allIds.os.parents);
		await this.truncateElements(objectName, allIds.os.childs);
		await this.truncateElements(objectName, allIds.ip.parents);
		await this.truncateElements(objectName, allIds.ip.childs);
	}

	async truncateElements(objectName: string, ids: string[]): Promise<void> {
		if (!ids || ids.length === 0) { return; }

		let success: boolean = await NetUtils.delete(this.connection, ids);
		if (!success) {
			throw new Error(this.messages.getMessage('couldNotTruncateOmnniProcess').formatUnicorn(objectName));
		}
	}

	async deactivateRecord(objectName: string): Promise<{ os: { parents: string[], childs: string[] }, ip: { parents: string[], childs: string[] } }> {
		DebugTimer.getInstance().lap('Truncating ' + objectName + ' (' + this.exportType + ')');

		const filters = new Map<string, any>();
		const sorting = [{ field: 'IsIntegrationProcedure', direction: SortDirection.ASC }, { field: 'IsOmniScriptEmbeddable', direction: SortDirection.ASC }];

		// Filter if only IP / OS
		if (this.exportType === OmniScriptExportType.IP) {
			filters.set('IsIntegrationProcedure', true);
		} else if (this.exportType === OmniScriptExportType.OS) {
			filters.set('IsIntegrationProcedure', false);
		}

		// const ids: string[] = await QueryTools.queryIds(this.connection, objectName, filters);
		const rows = await QueryTools.query(this.connection, objectName, ['Id', 'IsIntegrationProcedure', 'IsOmniScriptEmbeddable'], filters, sorting);
		if (rows.length === 0) {
			return { os: { parents: [], childs: [] }, ip: { parents: [], childs: [] } };
		}

		// We need to update one item at time. Otherwise, we'll have an UNKNOWN_ERROR
		for (let row of rows) {
			const id = row['Id'];

			await NetUtils.request(this.connection, `sobjects/${OmniScriptMigrationTool.OMNIPROCESS_NAME}/${id}`, {
				IsActive: false
			}, RequestMethod.PATCH);
		}

		// Sleep 5 seconds, let's wait for all row locks to be released. While this takes less than a second, there has been
		// times where it take a bit more.
		await this.sleep();

		return {
			os: {
				parents: rows.filter(row => row.IsIntegrationProcedure === false && row.IsOmniScriptEmbeddable === false).map(row => row.Id),
				childs: rows.filter(row => row.IsIntegrationProcedure === false && row.IsOmniScriptEmbeddable === true).map(row => row.Id),
			},
			ip: {
				parents: rows.filter(row => row.IsIntegrationProcedure === true && row.IsOmniScriptEmbeddable === false).map(row => row.Id),
				childs: rows.filter(row => row.IsIntegrationProcedure === true && row.IsOmniScriptEmbeddable === true).map(row => row.Id)
			}
		};
	}

	async migrate(): Promise<MigrationResult[]> {

		// Get All Records from OmniScript__c (IP & OS Parent Records)
		const omniscripts = await this.getAllOmniScripts();

		// Variables to be returned After Migration
		let done = 0;
		let originalOsRecords = new Map<string, any>();
		let osUploadInfo = new Map<string, UploadRecordResult>();
		const total = omniscripts.length;

		for (let omniscript of omniscripts) {
			const mappedRecords = [],
				originalRecords = new Map<string, AnyJson>();

			this.reportProgress(total, done);

			// Record is Active, Elements can't be Added, Modified or Deleted for that OS/IP
			omniscript[`${this.namespacePrefix}IsActive__c`] = false;

			// Create a map of the original OmniScript__c records
			originalRecords.set(omniscript['Id'], omniscript);

			if (!this.isValidRecord(omniscript)) {
				this.setRecordErrors(omniscript, this.messages.getMessage('invalidNameTypeSubtypeOrLanguage'));
				originalOsRecords = new Map([...Array.from(originalOsRecords.entries()), ...Array.from(originalRecords.entries())]);
				continue;
			}

			// Get All elements for each OmniScript__c record(i.e IP/OS)
			const elements = await this.getAllElementsForOmniScript(originalRecords);

			if (!this.areValidElements(elements)) {
				this.setRecordErrors(omniscript, this.messages.getMessage('invalidOrRepeatingOmniscriptElementNames'));
				originalOsRecords = new Map([...Array.from(originalOsRecords.entries()), ...Array.from(originalRecords.entries())]);
				continue;
			}

			// Perform the transformation for OS/IP Parent Record from OmniScript__c
			mappedRecords.push(this.mapOmniScriptRecord(omniscript));

			// Save the OmniScript__c records to Standard BPO i.e OmniProcess
			var osUploadResponse: Map<string, UploadRecordResult> = await this.uploadTransformedData(OmniScriptMigrationTool.OMNIPROCESS_NAME, { mappedRecords, originalRecords });

			// Upload All elements for each OmniScript__c record(i.e IP/OS)
			await this.uploadAllElements(originalRecords, osUploadResponse, elements);

			// Get OmniScript Compiled Definitions for OmniScript Record
			const omniscriptsCompiledDefinitions = await this.getOmniScriptCompiledDefinition(originalRecords);

			// Upload OmniScript Compiled Definition to OmniProcessCompilation
			await this.uploadAllOmniScriptDefinitions(originalRecords, osUploadResponse, omniscriptsCompiledDefinitions);

			// Update the inserted OS record as it was Active and made InActive to insert.
			mappedRecords[0].IsActive = true;
			mappedRecords[0].Id = osUploadResponse.entries().next().value[1].id;

			if (mappedRecords[0].IsIntegrationProcedure) {
				mappedRecords[0].Language = 'Procedure';
			}

			await this.updateData({ mappedRecords, originalRecords });

			// Create the return records and response which have been processed
			originalOsRecords = new Map([...Array.from(originalOsRecords.entries()), ...Array.from(originalRecords.entries())]);
			osUploadInfo = new Map([...Array.from(osUploadInfo.entries()), ...Array.from(osUploadResponse.entries())]);

			done++;
		};

		const objectMigrationResults: MigrationResult[] = [];

		if (this.exportType === OmniScriptExportType.All || this.exportType === OmniScriptExportType.IP) {
			objectMigrationResults.push(this.getMigratedRecordsByType('Integration Procedures', osUploadInfo, originalOsRecords));
		}
		if (this.exportType === OmniScriptExportType.All || this.exportType === OmniScriptExportType.OS) {
			objectMigrationResults.push(this.getMigratedRecordsByType('OmniScripts', osUploadInfo, originalOsRecords));
		}

		return objectMigrationResults;
	}

	// Using this small method, As IP & OS lives in same object -> So returning the IP and OS in the end, after the migration is done
	// and the results are generated. Other way can be creating a separate IP class and migrating IP & OS separately
	// using common functions
	private getMigratedRecordsByType(type: string, results: Map<string, UploadRecordResult>, records: Map<string, any>): MigrationResult {
		let recordMap: Map<string, any> = new Map<string, any>();
		let resultMap: Map<string, any> = new Map<string, any>();
		for (let record of Array.from(records.values())) {
			if (type === 'Integration Procedures' && record[`${this.namespacePrefix}IsProcedure__c`] ||
				type === 'OmniScripts' && !record[`${this.namespacePrefix}IsProcedure__c`]
			) {
				recordMap.set(record['Id'], records.get(record['Id']));
				if (results.get(record['Id'])) {
					resultMap.set(record['Id'], results.get(record['Id']));
				}
			}
		}
		return {
			name: type,
			records: recordMap,
			results: resultMap
		}
	}

	// Get All OmniScript__c records i.e All IP & OS
	private async getAllOmniScripts(): Promise<AnyJson[]> {
		DebugTimer.getInstance().lap('Query OmniScripts');

		const filters = new Map<string, any>();
		filters.set(this.namespacePrefix + 'IsActive__c', true);

		if (this.exportType === OmniScriptExportType.IP) {
			filters.set(this.namespacePrefix + 'IsProcedure__c', true);
		} else if (this.exportType === OmniScriptExportType.OS) {
			filters.set(this.namespacePrefix + 'IsProcedure__c', false);
		}

		return await QueryTools.queryWithFilter(this.connection, this.namespace, OmniScriptMigrationTool.OMNISCRIPT_NAME, this.getOmniScriptFields(), filters);
	}

	// Get All Elements w.r.t OmniScript__c i.e Elements tagged to passed in IP/OS
	private async getAllElementsForOmniScript(omniScriptData: Map<string, AnyJson>): Promise<AnyJson[]> {
		// Query all Elements for an OmniScript
		const filters = new Map<string, any>();
		filters.set(this.namespacePrefix + 'OmniScriptId__c', omniScriptData.keys().next().value);

		// const queryFilterStr = ` Where ${this.namespacePrefix}OmniScriptId__c = '${omniScriptData.keys().next().value}'`;
		return await QueryTools.queryWithFilter(this.connection, this.namespace, OmniScriptMigrationTool.ELEMENT_NAME, this.getElementFields(), filters);
	}

	// Get All Compiled Definitions w.r.t OmniScript__c i.e Definitions tagged to passed in IP/OS
	private async getOmniScriptCompiledDefinition(omniScriptData: Map<string, AnyJson>): Promise<AnyJson[]> {
		// Query all Definitions for an OmniScript
		const filters = new Map<string, any>();
		filters.set(this.namespacePrefix + 'OmniScriptId__c', omniScriptData.keys().next().value);

		// const queryFilterStr = ` Where ${this.namespacePrefix}OmniScriptId__c = '${omniScriptData.keys().next().value}'`;
		return await QueryTools.queryWithFilter(this.connection, this.namespace, OmniScriptMigrationTool.OMNISCRIPTDEFINITION_NAME, this.getOmniScriptDefinitionFields(), filters);
	}

	// Upload All the Elements tagged to a OmniScript__c record, after the parent record has been inserted
	private async uploadAllElements(omniScriptData: Map<string, AnyJson>, omniScriptUploadResults: Map<string, UploadRecordResult>, elements: AnyJson[]): Promise<Map<string, UploadRecordResult>> {
		let levelCount = 0; // To define and insert different levels(Parent-Child relationship) at a time
		let exit = false;   // Counter variable to exit after all parent-child elements inserted 
		var elementsUploadInfo = new Map<string, UploadRecordResult>(); // Info for Uploaded Elements to be returned

		do {
			let tempElements = []; // Stores Elements at a same level starting with levelCount = 0 level (parent elements)
			for (let element of elements) {
				if (element[`${this.namespacePrefix}Level__c`] === levelCount) {
					let elementId = element['Id'];
					let elementParentId = element[`${this.namespacePrefix}ParentElementId__c`];
					if (!elementsUploadInfo.has(elementId) && (!elementParentId || (elementParentId && elementsUploadInfo.has(elementParentId)))) {
						tempElements.push(element);
					}
				}
			}

			// If no elements exist after a certain level, Then everything is alraedy processed, otherwise upload
			if (tempElements.length === 0) {
				exit = true;
			} else {
				// Get Transformed Element__c to OmniProcessElement with updated OmniScriptId & ParentElementId
				let elementsTransformedData = await this.prepareElementsData(omniScriptData, omniScriptUploadResults, tempElements, elementsUploadInfo);
				// Upload the transformed Element__c
				let elementsUploadResponse = await this.uploadTransformedData(OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME, elementsTransformedData);
				// Keep appending upload Info for Elements at each level
				elementsUploadInfo = new Map([...Array.from(elementsUploadInfo.entries()), ...Array.from(elementsUploadResponse.entries())]);
			}

			levelCount++;

		} while (exit === false)

		return elementsUploadInfo;
	}

	// Upload All the Definitions tagged to a OmniScript__c record, after the parent record has been inserted
	private async uploadAllOmniScriptDefinitions(omniScriptData: Map<string, AnyJson>, omniScriptUploadResults: Map<string, UploadRecordResult>, osDefinitions: AnyJson[]): Promise<Map<string, UploadRecordResult>> {
		let osDefinitionsData = await this.prepareOsDefinitionsData(omniScriptData, omniScriptUploadResults, osDefinitions);
		return await this.uploadTransformedData(OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME, osDefinitionsData);
	}

	// Prepare Elements Data and Do the neccessary updates, transformation, validations etc.
	private async prepareElementsData(omniScriptData: Map<string, AnyJson>, omniScriptUploadResults: Map<string, UploadRecordResult>, elements: AnyJson[], parentElementUploadResponse: Map<string, UploadRecordResult>): Promise<TransformData> {

		const mappedRecords = [],
			originalRecords = new Map<string, AnyJson>();

		elements.forEach(element => {
			// Extract the parent OmniScript__c for the elements		
			const osRecord = omniScriptData.values().next().value;

			// Perform the transformation. We need parent record & must have been migrated before
			if (osRecord && omniScriptUploadResults.has(osRecord['Id'])) {
				const osUploadResult = omniScriptUploadResults.get(osRecord['Id']);

				if (osUploadResult.id) {
					mappedRecords.push(this.mapElementData(element, osUploadResult.id, parentElementUploadResponse));
				}
			}
			// Create a map of the original records
			originalRecords.set(element['Id'], element);
		});

		return { originalRecords, mappedRecords };
	}

	// Prepare OmniScript Definitions to be uploaded
	private async prepareOsDefinitionsData(omniScriptData: Map<string, AnyJson>, omniScriptUploadResults: Map<string, UploadRecordResult>, osDefinitions: AnyJson[]): Promise<TransformData> {
		const mappedRecords = [],
			originalRecords = new Map<string, AnyJson>();

		osDefinitions.forEach(osDefinition => {
			// Extract the parent OmniScript__c for the osDefinitions		
			const osRecord = omniScriptData.values().next().value;

			// Perform the transformation. We need parent record & must have been migrated before
			if (osRecord && omniScriptUploadResults.has(osRecord['Id'])) {
				const osUploadResult = omniScriptUploadResults.get(osRecord['Id']);

				if (osUploadResult.id) {
					mappedRecords.push(this.mapOsDefinitionsData(osDefinition, osUploadResult.id));
				}
			}
			// Create a map of the original records
			originalRecords.set(osDefinition['Id'], osDefinition);
		});

		return { originalRecords, mappedRecords };
	}

	/**
	 * Maps an omniscript__c record to OmniProcess Record.
	 * @param omniScriptRecord 
	 * @returns 
	 */
	private mapOmniScriptRecord(omniScriptRecord: AnyJson): AnyJson {

		// Transformed object
		const mappedObject = {};

		// Get the fields of the record
		const recordFields = Object.keys(omniScriptRecord);

		// Map individual fields
		recordFields.forEach(recordField => {
			const cleanFieldName = this.getCleanFieldName(recordField);

			if (OmniScriptMappings.hasOwnProperty(cleanFieldName)) {
				mappedObject[OmniScriptMappings[cleanFieldName]] = omniScriptRecord[recordField];
			}
		});

		// BATCH framework requires that each record has an "attributes" property
		mappedObject['attributes'] = {
			type: OmniScriptMigrationTool.OMNIPROCESS_NAME,
			referenceId: omniScriptRecord['Id']
		};

		return mappedObject;
	}

	// Maps an individual Element into an OmniProcessElement record
	private mapElementData(elementRecord: AnyJson, omniProcessId: string, parentElementUploadResponse: Map<String, UploadRecordResult>) {

		// Transformed object
		const mappedObject = {};

		// Get the fields of the record
		const recordFields = Object.keys(elementRecord);

		// Map individual fields
		recordFields.forEach(recordField => {
			const cleanFieldName = this.getCleanFieldName(recordField);

			if (ElementMappings.hasOwnProperty(cleanFieldName)) {
				mappedObject[ElementMappings[cleanFieldName]] = elementRecord[recordField];

				if (cleanFieldName === "ParentElementId__c" && parentElementUploadResponse.has(elementRecord[`${this.namespacePrefix}ParentElementId__c`])) {
					mappedObject[ElementMappings[cleanFieldName]] = parentElementUploadResponse.get(elementRecord[`${this.namespacePrefix}ParentElementId__c`]).id;
				}
			}
		});

		// Set the parent/child relationship
		mappedObject['OmniProcessId'] = omniProcessId;

		// BATCH framework requires that each record has an "attributes" property
		mappedObject['attributes'] = {
			type: OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME,
			referenceId: elementRecord['Id']
		};

		return mappedObject;
	}

	// Maps an individual Definition into an OmniProcessCompilation record
	private mapOsDefinitionsData(osDefinition: AnyJson, omniProcessId: string) {
		// Transformed object
		const mappedObject = {};

		// Get the fields of the record
		const recordFields = Object.keys(osDefinition);

		// Map individual fields
		recordFields.forEach(recordField => {
			const cleanFieldName = this.getCleanFieldName(recordField);

			if (OmniScriptDefinitionMappings.hasOwnProperty(cleanFieldName)) {
				mappedObject[OmniScriptDefinitionMappings[cleanFieldName]] = osDefinition[recordField];
			}
		});

		// Set the parent/child relationship
		mappedObject[OmniScriptDefinitionMappings.Name] = omniProcessId;
		mappedObject[OmniScriptDefinitionMappings.OmniScriptId__c] = omniProcessId;

		let content = mappedObject[OmniScriptDefinitionMappings.Content__c];
		if (content) {
			try {
				content = JSON.parse(content);
				if (content && content['sOmniScriptId']) {
					content['sOmniScriptId'] = omniProcessId;
					mappedObject[OmniScriptDefinitionMappings.Content__c] = JSON.stringify(content);
				}
			} catch (ex) {
				// Log
			}
		}

		// BATCH framework requires that each record has an "attributes" property
		mappedObject['attributes'] = {
			type: OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME,
			referenceId: osDefinition['Id']
		};

		return mappedObject;
	}

	private getOmniScriptFields(): string[] {
		return Object.keys(OmniScriptMappings);
	}

	private getElementFields(): string[] {
		return Object.keys(ElementMappings);
	}

	private getOmniScriptDefinitionFields(): string[] {
		return Object.keys(OmniScriptDefinitionMappings);
	}

	// Return true/false, if the record is valid/invalid
	private isValidRecord(omniscript: AnyJson): boolean {
		const nsPrefix = this.namespacePrefix;

		return this.validMetaDataName(omniscript[`${nsPrefix}Type__c`]) &&
			this.validMetaDataName(omniscript[`${nsPrefix}SubType__c`]) &&
			this.validMetaDataName(omniscript[`${nsPrefix}Version__c`]) &&
			(
				omniscript[`${nsPrefix}Procedure__c`] || (
					!omniscript[`${nsPrefix}Procedure__c`] &&
					this.validMetaDataName(omniscript[`${nsPrefix}Language__c`])
				)
			);
	}

	private areValidElements(elements: AnyJson[]): boolean {
		let elementNames = [];
		for (let element of elements) {
			let elementName: string = element['Name'];
			if (!elementName) {
				return false;
			}

			if (!this.validMetaDataName(elementName.replace(/\s/g, '')) || elementNames.includes(elementName)) {
				return false;
			} else {
				elementNames.push(elementName);
			}
		}
		return true;
	}

	private sleep() {
		return new Promise(resolve => {
			setTimeout(resolve, 5000);
		})
	};
}

export enum OmniScriptExportType {
	All,
	OS,
	IP
}