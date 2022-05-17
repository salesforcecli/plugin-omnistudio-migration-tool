/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';

import CardMappings from '../mappings/VlocityCard';
import { DebugTimer, QueryTools } from '../utils';
import { NetUtils } from '../utils/net';
import { BaseMigrationTool } from './base';
import { MigrationResult, MigrationTool, ObjectMapping, TransformData, UploadRecordResult } from './interfaces';


export class CardMigrationTool extends BaseMigrationTool implements MigrationTool {

	static readonly VLOCITYCARD_NAME = 'VlocityCard__c';
	static readonly OMNIUICARD_NAME = 'OmniUiCard';

	getName(): string {
		return "FlexCards";
	}

	getRecordName(record: string) {
		return record['Name'];
	}

	getMappings(): ObjectMapping[] {
		return [{
			source: CardMigrationTool.VLOCITYCARD_NAME,
			target: CardMigrationTool.OMNIUICARD_NAME
		}];
	}

	// Perform Delete of OmniUiCard Records to start migration from scratch
	async truncate(): Promise<void> {
		const objectName = CardMigrationTool.OMNIUICARD_NAME;
		DebugTimer.getInstance().lap('Truncating ' + objectName);

		const ids: string[] = await QueryTools.queryIds(this.connection, objectName);
		if (ids.length === 0) return;

		const recordsToUpdate = ids.map(id => {
			return {
				attributes: { type: CardMigrationTool.OMNIUICARD_NAME },
				Id: id,
				IsActive: false
			}
		});

		// Mark the OmniUiCards as inactive
		await NetUtils.update(this.connection, recordsToUpdate);

		const success: boolean = await NetUtils.delete(this.connection, ids);
		if (!success) {
			throw new Error('Could not truncate ' + objectName);
		}
	}

	// Perform Records Migration from VlocityCard__c to OmniUiCard
	async migrate(): Promise<MigrationResult[]> {

		// Get All the Active VlocityCard__c records
		const cards = await this.getAllActiveCards();

		// Save the Vlocity Cards in OmniUiCard
		const cardUploadResponse = await this.uploadAllCards(cards);

		return [{
			name: 'FlexCards',
			records: (await this.prepareCardData(cards, new Map<string, UploadRecordResult>())).originalRecords,
			results: cardUploadResponse
		}];
	}

	// Query all cards that are active
	private async getAllActiveCards(): Promise<AnyJson[]> {
		DebugTimer.getInstance().lap('Query Vlocity Cards');
		// const filterStr: string = ` Where ${this.namespacePrefix}Active__c = true`
		const filters = new Map<string, any>();
		filters.set(this.namespacePrefix + 'Active__c', true);

		return await QueryTools.queryWithFilter(this.connection, this.namespace, CardMigrationTool.VLOCITYCARD_NAME, this.getCardFields(), filters);
	}

	// Upload All the VlocityCard__c records to OmniUiCard
	private async uploadAllCards(cards: any): Promise<Map<string, UploadRecordResult>> {

		var cardsUploadInfo = new Map<string, UploadRecordResult>();
		let exit = false;
		// Start transforming each Card and upload in different levels
		// to manage parent-children
		do {
			let tempCards = [];
			for (let card of cards) {
				let cardId = card['Id'];
				let cardParentId = card[`${this.namespacePrefix}ParentID__c`];
				if (!cardsUploadInfo.has(cardId) && (!cardParentId || (cardParentId && cardsUploadInfo.has(cardParentId)))) {
					tempCards.push(card);
				}
			}

			// Exit when last child has been uploaded and no more heierarchy left
			if (tempCards.length === 0) {
				exit = true;
			} else {
				let cardsTransformedData = await this.prepareCardData(tempCards, cardsUploadInfo);
				let cardsUploadResponse = await this.uploadTransformedData(CardMigrationTool.OMNIUICARD_NAME, cardsTransformedData);
				cardsUploadInfo = new Map([...Array.from(cardsUploadInfo.entries()), ...Array.from(cardsUploadResponse.entries())]);
			}
		} while (exit === false);

		return cardsUploadInfo;
	}

	private async prepareCardData(cards: AnyJson[], cardsUploadInfo: Map<string, UploadRecordResult>): Promise<TransformData> {
		const mappedRecords = [],
			originalRecords = new Map<string, AnyJson>();

		// Start transforming each Card
		DebugTimer.getInstance().lap('Transform cards');
		for (let card of cards) {
			const recordId = card['Id'];
			// Perform the transformation
			mappedRecords.push(this.mapVlocityCardRecord(card, cardsUploadInfo));
			// Create a map of the original records
			originalRecords.set(recordId, card);
		};
		return { originalRecords, mappedRecords };
	}

	// Maps an indivitdual VlocityCard__c record to an OmniUiCard record.
	private mapVlocityCardRecord(cardRecord: AnyJson, cardsUploadInfo: Map<string, UploadRecordResult>): AnyJson {

		// Transformed object
		const mappedObject = {};

		// Get the fields of the record
		const recordFields = Object.keys(cardRecord);

		// Map individual fields
		recordFields.forEach(recordField => {
			const cleanFieldName = this.getCleanFieldName(recordField);

			if (CardMappings.hasOwnProperty(cleanFieldName) && cleanFieldName !== 'IsChildCard__c') {
				mappedObject[CardMappings[cleanFieldName]] = cardRecord[recordField];
				
				// Transform ParentId__c to ClonedFromOmniUiCardKey field from uploaded response map
				if (cleanFieldName === "ParentID__c" && cardsUploadInfo.has(cardRecord[`${this.namespacePrefix}ParentID__c`])) {
					mappedObject[CardMappings[cleanFieldName]] = cardsUploadInfo.get(cardRecord[`${this.namespacePrefix}ParentID__c`]).id;
				}

				// CardType__c and OmniUiCardType have different picklist values
				if (cleanFieldName === "CardType__c") {
					let ischildCard = cardRecord[`${this.namespacePrefix}IsChildCard__c`];
					mappedObject["OmniUiCardType"] = ischildCard ? 'Child' : 'Parent';
				}

				// Child Cards don't have version, so assigning 1
				if (cleanFieldName === "Version__c") {
					let versionNumber = cardRecord[`${this.namespacePrefix}Version__c`];
					mappedObject["VersionNumber"] = versionNumber ? versionNumber : 1;
				}
			}
		});

		mappedObject['attributes'] = {
			type: CardMigrationTool.OMNIUICARD_NAME,
			referenceId: cardRecord['Id']
		};

		return mappedObject;
	}

	private getCardFields(): string[] {
		return Object.keys(CardMappings);
	}
}