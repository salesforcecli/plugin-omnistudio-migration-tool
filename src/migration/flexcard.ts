/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';
import CardMappings from '../mappings/VlocityCard';
import { DebugTimer, QueryTools, SortDirection } from '../utils';
import { NetUtils } from '../utils/net';
import { BaseMigrationTool } from './base';
import { MigrationResult, MigrationTool, ObjectMapping, UploadRecordResult } from './interfaces';
import { Connection, Logger, Messages } from '@salesforce/core';
import { UX } from '@salesforce/command';

export class CardMigrationTool extends BaseMigrationTool implements MigrationTool {
  static readonly VLOCITYCARD_NAME = 'VlocityCard__c';
  static readonly OMNIUICARD_NAME = 'OmniUiCard';
  private readonly allVersions: boolean;

  constructor(
    namespace: string,
    connection: Connection,
    logger: Logger,
    messages: Messages,
    ux: UX,
    allVersions: boolean
  ) {
    super(namespace, connection, logger, messages, ux);
    this.allVersions = allVersions;
  }

  getName(): string {
    return 'FlexCards';
  }

  getRecordName(record: string) {
    return record['Name'];
  }

  getMappings(): ObjectMapping[] {
    return [
      {
        source: CardMigrationTool.VLOCITYCARD_NAME,
        target: CardMigrationTool.OMNIUICARD_NAME,
      },
    ];
  }

  // Perform Delete of OmniUiCard Records to start migration from scratch
  async truncate(): Promise<void> {
    const objectName = CardMigrationTool.OMNIUICARD_NAME;
    DebugTimer.getInstance().lap('Truncating ' + objectName);

    const ids: string[] = await QueryTools.queryIds(this.connection, objectName);
    if (ids.length === 0) return;

    const recordsToUpdate = ids.map((id) => {
      return {
        attributes: { type: CardMigrationTool.OMNIUICARD_NAME },
        Id: id,
        IsActive: false,
      };
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

    const records = new Map<string, any>();
    for (let i = 0; i < cards.length; i++) {
      records.set(cards[i]['Id'], cards[i]);
    }

    return [
      {
        name: 'FlexCards',
        records: records,
        results: cardUploadResponse,
      },
    ];
  }

  // Query all cards that are active
  private async getAllActiveCards(): Promise<AnyJson[]> {
    DebugTimer.getInstance().lap('Query Vlocity Cards');
    const filters = new Map<string, any>();
    filters.set(this.namespacePrefix + 'CardType__c', 'flex');

    if (this.allVersions) {
      const sortFields = [
        { field: 'Name', direction: SortDirection.ASC },
        { field: this.namespacePrefix + 'Version__c', direction: SortDirection.ASC },
      ];
      return await QueryTools.queryWithFilterAndSort(
        this.connection,
        this.namespace,
        CardMigrationTool.VLOCITYCARD_NAME,
        this.getCardFields(),
        filters,
        sortFields
      );
    } else {
      filters.set(this.namespacePrefix + 'Active__c', true);
      return await QueryTools.queryWithFilter(
        this.connection,
        this.namespace,
        CardMigrationTool.VLOCITYCARD_NAME,
        this.getCardFields(),
        filters
      );
    }
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

  private async uploadCard(
    allCards: any[],
    card: AnyJson,
    cardsUploadInfo: Map<string, UploadRecordResult>,
    originalRecords: Map<string, any>,
    uniqueNames: Set<string>
  ) {
    const recordId = card['Id'];

    // If we already uploaded this card, skip
    if (cardsUploadInfo.has(recordId)) {
      return;
    }
    const isCardActive = card[`${this.namespacePrefix}Active__c`];

    try {
      const childCards = this.getChildCards(card);
      if (childCards.length > 0) {
        for (let childCardName of childCards) {
          // Upload child cards
          const childCard = allCards.find((c) => c['Name'] === childCardName);
          if (childCard) {
            await this.uploadCard(allCards, childCard, cardsUploadInfo, originalRecords, uniqueNames);
          }
        }

        this.updateChildCards(card);
      }

      this.reportProgress(allCards.length, originalRecords.size);

      // Perform the transformation
      const invalidIpNames = new Map<string, string>();
      const transformedCard = this.mapVlocityCardRecord(card, cardsUploadInfo, invalidIpNames);

      // Verify duplicated names
      let transformedCardName: string;
      if (this.allVersions) {
        transformedCardName = transformedCard['Name'] + '_' + transformedCard['VersionNumber'];
      } else {
        transformedCardName = transformedCard['Name'];
      }
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
      const uploadResult = await NetUtils.createOne(
        this.connection,
        CardMigrationTool.OMNIUICARD_NAME,
        recordId,
        transformedCard
      );

      if (uploadResult) {
        // Fix errors
        uploadResult.errors = uploadResult.errors || [];
        if (!uploadResult.success) {
          uploadResult.errors = Array.isArray(uploadResult.errors) ? uploadResult.errors : [uploadResult.errors];
        }

        // If name has been changed, add a warning message
        uploadResult.warnings = uploadResult.warnings || [];
        if (transformedCardAuthorName !== card[this.namespacePrefix + 'Author__c']) {
          uploadResult.warnings.unshift(
            'WARNING: Card author name has been modified to fit naming rules: ' + transformedCardAuthorName
          );
        }
        if (transformedCardName !== card['Name']) {
          uploadResult.newName = transformedCardName;
          uploadResult.warnings.unshift(
            'WARNING: Card name has been modified to fit naming rules: ' + transformedCardName
          );
        }

        if (uploadResult.id && invalidIpNames.size > 0) {
          const val = Array.from(invalidIpNames.entries())
            .map((e) => e[0])
            .join(', ');
          uploadResult.errors.push('Integration Procedure Actions will need manual updates, please verify: ' + val);
        }

        cardsUploadInfo.set(recordId, uploadResult);

        const updateResult = await NetUtils.updateOne(
          this.connection,
          CardMigrationTool.OMNIUICARD_NAME,
          recordId,
          uploadResult.id,
          {
            [CardMappings.Active__c]: isCardActive,
          }
        );

        if (!updateResult.success) {
          uploadResult.hasErrors = true;
          uploadResult.errors = uploadResult.errors || [];

          uploadResult.errors.push(this.messages.getMessage('errorWhileActivatingCard') + updateResult.errors);
        }
      }
    } catch (err) {
      this.setRecordErrors(card, this.messages.getMessage('errorWhileUploadingCard') + err);
      originalRecords.set(recordId, card);

      cardsUploadInfo.set(recordId, {
        referenceId: recordId,
        hasErrors: true,
        success: false,
        errors: err,
        warnings: [],
      });
    }
  }

  private getChildCards(card: AnyJson): string[] {
    let childs = [];
    const definition = JSON.parse(card[this.namespacePrefix + 'Definition__c']);
    if (!definition) return childs;

    for (let state of definition.states || []) {
      if (state.childCards && Array.isArray(state.childCards)) {
        childs = childs.concat(state.childCards);

        // Modify the name of the child cards
        state.childCards = state.childCards.map((c) => this.cleanName(c));
      }
    }

    return childs;
  }

  private updateChildCards(card: AnyJson): void {
    const definition = JSON.parse(card[this.namespacePrefix + 'Definition__c']);
    if (!definition) return;

    for (let state of definition.states || []) {
      if (state.childCards && Array.isArray(state.childCards)) {
        state.childCards = state.childCards.map((c) => this.cleanName(c));
      }
    }

    card[this.namespacePrefix + 'Definition__c'] = JSON.stringify(definition);
  }

  // Maps an indivitdual VlocityCard__c record to an OmniUiCard record.
  private mapVlocityCardRecord(
    cardRecord: AnyJson,
    cardsUploadInfo: Map<string, UploadRecordResult>,
    invalidIpNames: Map<string, string>
  ): AnyJson {
    // Transformed object
    const mappedObject = {};

    // Get the fields of the record
    const recordFields = Object.keys(cardRecord);

    // Map individual fields
    recordFields.forEach((recordField) => {
      const cleanFieldName = this.getCleanFieldName(recordField);

      if (CardMappings.hasOwnProperty(cleanFieldName) && cleanFieldName !== 'IsChildCard__c') {
        mappedObject[CardMappings[cleanFieldName]] = cardRecord[recordField];

        // Transform ParentId__c to ClonedFromOmniUiCardKey field from uploaded response map
        if (cleanFieldName === 'ParentID__c' && cardsUploadInfo.has(cardRecord[`${this.namespacePrefix}ParentID__c`])) {
          mappedObject[CardMappings[cleanFieldName]] = cardsUploadInfo.get(
            cardRecord[`${this.namespacePrefix}ParentID__c`]
          ).id;
        }

        // CardType__c and OmniUiCardType have different picklist values
        if (cleanFieldName === 'CardType__c') {
          let ischildCard = cardRecord[`${this.namespacePrefix}IsChildCard__c`];
          mappedObject['OmniUiCardType'] = ischildCard ? 'Child' : 'Parent';
        }

        // Child Cards don't have version, so assigning 1
        if (cleanFieldName === 'Version__c') {
          let versionNumber = cardRecord[`${this.namespacePrefix}Version__c`];
          mappedObject['VersionNumber'] = versionNumber ? versionNumber : 1;
        }
      }
    });

    // Clean the name
    mappedObject['Name'] = this.cleanName(mappedObject['Name']);
    mappedObject[CardMappings.Author__c] = this.cleanName(mappedObject[CardMappings.Author__c]);
    mappedObject[CardMappings.Active__c] = false;

    // Update the datasource
    const datasource = JSON.parse(mappedObject[CardMappings.Datasource__c] || '{}');
    if (datasource.dataSource) {
      const type = datasource.dataSource.type;
      if (type === 'DataRaptor') {
        datasource.dataSource.value.bundle = this.cleanName(datasource.dataSource.value.bundle);
      } else if (type === 'IntegrationProcedures') {
        const ipMethod: string = datasource.dataSource.value.ipMethod || '';

        const parts = ipMethod.split('_');
        const newKey = parts.map((p) => this.cleanName(p, true)).join('_');

        datasource.dataSource.value.ipMethod = newKey;

        if (parts.length > 2) {
          invalidIpNames.set('DataSource', ipMethod);
        }
      }
      mappedObject[CardMappings.Datasource__c] = JSON.stringify(datasource);
    }

    // Update the propertyset datasource
    const propertySet = JSON.parse(mappedObject[CardMappings.Definition__c] || '{}');
    if (propertySet) {
      if (propertySet.dataSource) {
        const type = propertySet.dataSource.type;
        if (type === 'DataRaptor') {
          propertySet.dataSource.value.bundle = this.cleanName(propertySet.dataSource.value.bundle);
        } else if (type === 'IntegrationProcedures') {
          const ipMethod: string = propertySet.dataSource.value.ipMethod || '';

          const parts = ipMethod.split('_');
          const newKey = parts.map((p) => this.cleanName(p, true)).join('_');
          propertySet.dataSource.value.ipMethod = newKey;

          if (parts.length > 2) {
            invalidIpNames.set('DataSource', ipMethod);
          }
        }
      }

      // update the states for child cards
      for (let i = 0; i < (propertySet.states || []).length; i++) {
        const state = propertySet.states[i];

        // Clean childCards property
        if (state.childCards && Array.isArray(state.childCards)) {
          state.childCards = state.childCards.map((c) => this.cleanName(c));
        }

        // Fix the "components" for child cards
        for (let componentKey in state.components) {
          if (state.components.hasOwnProperty(componentKey)) {
            const component = state.components[componentKey];

            if (component.children && Array.isArray(component.children)) {
              this.fixChildren(component.children);
            }
          }
        }

        if (state.omniscripts && Array.isArray(state.omniscripts)) {
          for (let osIdx = 0; osIdx < state.omniscripts.length; osIdx++) {
            state.omniscripts[osIdx].type = this.cleanName(state.omniscripts[osIdx].type);
            state.omniscripts[osIdx].subtype = this.cleanName(state.omniscripts[osIdx].subtype);
          }
        }
      }

      mappedObject[CardMappings.Definition__c] = JSON.stringify(propertySet);
    }

    mappedObject['attributes'] = {
      type: CardMigrationTool.OMNIUICARD_NAME,
      referenceId: cardRecord['Id'],
    };

    return mappedObject;
  }

  private fixChildren(children: any[]) {
    for (let j = 0; j < children.length; j++) {
      const child = children[j];

      if (child.element === 'childCardPreview') {
        child.property.cardName = this.cleanName(child.property.cardName);
      } else if (child.element === 'action') {
        if (child.property && child.property.stateAction && child.property.stateAction.omniType) {
          const parts = (child.property.stateAction.omniType.Name || '').split('/');
          child.property.stateAction.omniType.Name = parts.map((p) => this.cleanName(p)).join('/');
        }
      }

      if (child.children && Array.isArray(child.children)) {
        this.fixChildren(child.children);
      }
    }
  }

  private getCardFields(): string[] {
    return Object.keys(CardMappings);
  }
}
