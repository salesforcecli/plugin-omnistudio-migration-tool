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
	private async uploadAllCards(cards: any[]): Promise<Map<string, UploadRecordResult>> {

		const cardsUploadInfo = new Map<string, UploadRecordResult>();
		const originalRecords = new Map<string, any>();
		const uniqueNames = new Set<string>();

		for (let card of cards) {
			await this.uploadCard(cards, card, cardsUploadInfo, originalRecords, uniqueNames);
		}

		return cardsUploadInfo;
	}

	private async uploadCard(allCards: any[], card: AnyJson, cardsUploadInfo: Map<string, UploadRecordResult>, originalRecords: Map<string, any>, uniqueNames: Set<string>) {

		const recordId = card['Id'];

		// If we already uploaded this card, skip
		if (cardsUploadInfo.has(recordId)) {
			return;
		}

		const childCards = this.getChildCards(card);
		if (childCards.length > 0) {
			for (let childCardName of childCards) {
				// Upload child cards
				const childCard = allCards.find(c => c['Name'] === childCardName);
				if (childCard) {
					await this.uploadCard(allCards, childCard, cardsUploadInfo, originalRecords, uniqueNames);
				}
			}

			this.updateChildCards(card);
		}

		// Perform the transformation
		const transformedCard = this.mapVlocityCardRecord(card, cardsUploadInfo);

		// Verify duplicated names
		const transformedCardName = transformedCard['Name'];
		const transformedCardAuthorName = transformedCard['AuthorName'];
		if (uniqueNames.has(transformedCardName)) {
			this.setRecordErrors(card, this.messages.getMessage('duplicatedCardName'));
			originalRecords.set(recordId, card);
			return;
		}

		// Save the name for duplicated names check
		uniqueNames.add(transformedCardName);

		// Create a map of the original records
		originalRecords.set(recordId, card);

		// Create card
		const uploadResult = await NetUtils.createOne(this.connection, CardMigrationTool.OMNIUICARD_NAME, recordId, transformedCard);

		if (uploadResult) {

			// Fix errors
			if (!uploadResult.success) {
				uploadResult.errors = Array.isArray(uploadResult.errors) ? uploadResult.errors : [uploadResult.errors];
			}

			// If name has been changed, add a warning message
			if (transformedCardName !== card[this.namespacePrefix + 'Name']) {
				uploadResult.errors.unshift('WARNING: Card name has been modified to fit naming rules: ' + transformedCardName);
			}
			if (transformedCardAuthorName !== card[this.namespacePrefix + 'Author__c']) {
				uploadResult.errors.unshift('WARNING: Card author name has been modified to fit naming rules: ' + transformedCardAuthorName);
			}

			cardsUploadInfo.set(recordId, uploadResult);
		}
	}

	private getChildCards(card: AnyJson): string[] {
		let childs = [];
		const definition = JSON.parse(card[this.namespacePrefix + 'Definition__c']);

		for (let state of (definition.states || [])) {
			if (state.childCards && Array.isArray(state.childCards)) {
				childs = childs.concat(state.childCards);

				// Modify the name of the child cards
				state.childCards = state.childCards.map(c => this.cleanName(c));
			}
		}

		return childs;
	}

	private updateChildCards(card: AnyJson): void {
		const definition = JSON.parse(card[this.namespacePrefix + 'Definition__c']);

		for (let state of (definition.states || [])) {
			if (state.childCards && Array.isArray(state.childCards)) {
				state.childCards = state.childCards.map(c => this.cleanName(c));
			}
		}

		card[this.namespacePrefix + 'Definition__c'] = JSON.stringify(definition);
	}

	private async prepareCardData(cards: AnyJson[], cardsUploadInfo: Map<string, UploadRecordResult>): Promise<TransformData> {
		const mappedRecords = [],
			originalRecords = new Map<string, AnyJson>();

		// Start transforming each Card
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

		// Clean the name
		mappedObject['Name'] = this.cleanName(mappedObject['Name']);
		mappedObject['AuthorName'] = this.cleanName(mappedObject['AuthorName']);

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