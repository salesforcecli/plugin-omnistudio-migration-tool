/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';
import CardMappings from '../mappings/VlocityCard';
import { DebugTimer, QueryTools, SortDirection } from '../utils';
import { NetUtils } from '../utils/net';
import { BaseMigrationTool } from './base';
import {
  InvalidEntityTypeError,
  MigrationResult,
  MigrationTool,
  ObjectMapping,
  UploadRecordResult,
} from './interfaces';
import { Connection, Messages } from '@salesforce/core';
import { UX } from '@salesforce/command';
import { FlexCardAssessmentInfo } from '../../src/utils';
import { Logger } from '../utils/logger';
import { createProgressBar } from './base';
import { Constants } from '../utils/constants/stringContants';

export class CardMigrationTool extends BaseMigrationTool implements MigrationTool {
  static readonly VLOCITYCARD_NAME = 'VlocityCard__c';
  static readonly OMNIUICARD_NAME = 'OmniUiCard';
  static readonly VERSION_PROP = 'Version__c';
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
    return this.allVersions
      ? `${record['Name']}_${record[this.namespacePrefix + CardMigrationTool.VERSION_PROP]}`
      : record['Name'];
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
      throw new Error(this.messages.getMessage('couldNotTruncate', [objectName]));
    }
  }

  // Perform Records Migration from VlocityCard__c to OmniUiCard
  async migrate(): Promise<MigrationResult[]> {
    // Get All the Active VlocityCard__c records
    const cards = await this.getAllActiveCards();
    Logger.log(this.messages.getMessage('foundFlexCardsToMigrate', [cards.length]));

    const progressBar = createProgressBar('Migrating', 'Flexcard');
    // Save the Vlocity Cards in OmniUiCard
    const cardUploadResponse = await this.uploadAllCards(cards, progressBar);

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

  public async assess(): Promise<FlexCardAssessmentInfo[]> {
    try {
      Logger.log(this.messages.getMessage('startingFlexCardAssessment'));
      const flexCards = await this.getAllActiveCards();
      Logger.log(this.messages.getMessage('foundFlexCardsToAssess', [flexCards.length]));

      const flexCardsAssessmentInfos = this.processCardComponents(flexCards);
      return flexCardsAssessmentInfos;
    } catch (err) {
      if (err instanceof InvalidEntityTypeError) {
        throw err;
      }
      Logger.error(this.messages.getMessage('errorDuringFlexCardAssessment'), err);
    }
  }

  public async processCardComponents(flexCards: AnyJson[]): Promise<FlexCardAssessmentInfo[]> {
    const flexCardAssessmentInfos: FlexCardAssessmentInfo[] = [];
    let progressCounter = 0;
    const progressBar = createProgressBar('Assessing', 'Flexcard');
    progressBar.start(flexCards.length, progressCounter);
    const uniqueNames = new Set<string>();

    // Now process each OmniScript and its elements
    for (const flexCard of flexCards) {
      try {
        const flexCardAssessmentInfo = await this.processFlexCard(flexCard, uniqueNames);
        flexCardAssessmentInfos.push(flexCardAssessmentInfo);
      } catch (e) {
        flexCardAssessmentInfos.push({
          name: flexCard['Name'],
          oldName: flexCard['Name'],
          id: flexCard['Id'],
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesFC: [],
          dependenciesOS: [],
          dependenciesLWC: [],
          dependenciesApexRemoteAction: [],
          infos: [],
          warnings: [],
          errors: [this.messages.getMessage('unexpectedError')],
          migrationStatus: 'Failed',
        });
        const error = e as Error;
        Logger.error('Error processing flex card', error);
      }
      progressBar.update(++progressCounter);
    }
    progressBar.stop();
    return flexCardAssessmentInfos;
  }

  private async processFlexCard(flexCard: AnyJson, uniqueNames: Set<string>): Promise<FlexCardAssessmentInfo> {
    const flexCardName = flexCard['Name'];
    Logger.info(this.messages.getMessage('processingFlexCard', [flexCardName]));
    const version = flexCard[this.namespacePrefix + CardMigrationTool.VERSION_PROP];
    const flexCardAssessmentInfo: FlexCardAssessmentInfo = {
      name: this.allVersions ? `${flexCardName}_${version}` : flexCardName,
      oldName: this.allVersions ? `${flexCardName}_${version}` : flexCardName,
      id: flexCard['Id'],
      dependenciesIP: [],
      dependenciesDR: [],
      dependenciesOS: [],
      dependenciesFC: [],
      dependenciesLWC: [],
      dependenciesApexRemoteAction: [],
      infos: [],
      warnings: [],
      errors: [],
      migrationStatus: '',
    };

    // Check for name changes due to API naming requirements
    const originalName: string = flexCardName;
    const cleanedName: string = this.cleanName(originalName);
    let assessmentStatus = 'Can be Automated';
    flexCardAssessmentInfo.name = this.allVersions ? `${cleanedName}_${version}` : cleanedName;
    if (cleanedName !== originalName) {
      flexCardAssessmentInfo.warnings.push(
        this.messages.getMessage('cardNameChangeMessage', [originalName, cleanedName])
      );
      assessmentStatus = 'Has Warnings';
    }

    // Check for duplicate names
    if (uniqueNames.has(cleanedName)) {
      flexCardAssessmentInfo.warnings.push(this.messages.getMessage('duplicateCardNameMessage', [cleanedName]));
      assessmentStatus = 'Need Manual Intervention';
    }
    uniqueNames.add(cleanedName);

    // Check for author name changes
    const originalAuthor = flexCard[this.namespacePrefix + 'Author__c'];
    if (originalAuthor) {
      const cleanedAuthor = this.cleanName(originalAuthor);
      if (cleanedAuthor !== originalAuthor) {
        flexCardAssessmentInfo.warnings.push(
          this.messages.getMessage('authordNameChangeMessage', [originalAuthor, cleanedAuthor])
        );
        assessmentStatus = 'Has Warnings';
      }
    }

    flexCardAssessmentInfo.migrationStatus = assessmentStatus;
    this.updateDependencies(flexCard, flexCardAssessmentInfo);

    return flexCardAssessmentInfo;
  }

  private updateDependencies(flexCard, flexCardAssessmentInfo): void {
    let dataSource = JSON.parse(flexCard[this.namespacePrefix + 'Datasource__c'] || '{}');
    // Handle both camelCase and lowercase variants
    if (dataSource?.dataSource) {
      dataSource = dataSource.dataSource;
    } else if (dataSource?.datasource) {
      dataSource = dataSource.datasource;
    }

    // Check if it's a DataRaptor source
    if (dataSource.type === Constants.DataRaptorComponentName) {
      const originalBundle = dataSource.value?.bundle;
      if (originalBundle) {
        const cleanedBundle: string = this.cleanName(originalBundle);
        flexCardAssessmentInfo.dependenciesDR.push(cleanedBundle);

        // Add warning if DataRaptor name will change
        if (originalBundle !== cleanedBundle) {
          flexCardAssessmentInfo.warnings.push(
            this.messages.getMessage('dataRaptorNameChangeMessage', [originalBundle, cleanedBundle])
          );
          flexCardAssessmentInfo.migrationStatus = 'Has Warnings';
        }
      }
    } else if (dataSource.type === Constants.IntegrationProcedurePluralName) {
      const originalIpMethod = dataSource.value?.ipMethod;
      if (originalIpMethod) {
        const parts = originalIpMethod.split('_');
        const cleanedParts = parts.map((p) => this.cleanName(p, true));
        const cleanedIpMethod = cleanedParts.join('_');

        flexCardAssessmentInfo.dependenciesIP.push(cleanedIpMethod);

        // Add warning if IP name will change
        if (originalIpMethod !== cleanedIpMethod) {
          flexCardAssessmentInfo.warnings.push(
            this.messages.getMessage('integrationProcedureNameChangeMessage', [originalIpMethod, cleanedIpMethod])
          );
          flexCardAssessmentInfo.migrationStatus = 'Has Warnings';
        }

        // Add warning for IP references with more than 2 parts (which potentially need manual updates)
        if (parts.length > 2) {
          flexCardAssessmentInfo.warnings.push(
            this.messages.getMessage('integrationProcedureManualUpdateMessage', [originalIpMethod])
          );
          flexCardAssessmentInfo.migrationStatus = 'Need Manual Intervention';
        }
      }
    } else if (dataSource.type === Constants.ApexRemoteComponentName) {
      const remoteClass = dataSource.value?.remoteClass;
      const remoteMethod = dataSource.value?.remoteMethod;
      Logger.info(`Remote Action name: ${remoteClass}.${remoteMethod}`);

      // Avoid duplicates
      if (!flexCardAssessmentInfo.dependenciesApexRemoteAction.includes(`${remoteClass}.${remoteMethod}`)) {
        flexCardAssessmentInfo.dependenciesApexRemoteAction.push(`${remoteClass}.${remoteMethod}`);
      }
    }

    // Check for OmniScript dependencies in the card's definition
    try {
      const definition = JSON.parse(flexCard[this.namespacePrefix + 'Definition__c'] || '{}');
      if (definition && definition.states) {
        for (const state of definition.states) {
          if (state.omniscripts && Array.isArray(state.omniscripts)) {
            for (const os of state.omniscripts) {
              if (os.type && os.subtype) {
                const osRef = `${os.type}_${os.subtype}_${os.language || 'English'}`;
                flexCardAssessmentInfo.dependenciesOS.push(osRef);
              }
            }
          }

          // Also check for omniscripts referenced in component actions
          if (state.components) {
            for (const componentKey in state.components) {
              if (state.components.hasOwnProperty(componentKey)) {
                const component = state.components[componentKey];
                this.checkComponentForDependencies(component, flexCardAssessmentInfo);
              }
            }
          }
        }
      }

      let childCards = this.readChildCardsFromDefinition(flexCard);
      flexCardAssessmentInfo.dependenciesFC.push(...childCards);
    } catch (err) {
      // Log the error but continue processing
      Logger.error(`Error parsing definition for card ${flexCard.Name}: ${err.message}`);
    }
  }

  private readChildCardsFromDefinition(card: AnyJson): string[] {
    let childs = [];

    const definition = JSON.parse(card[this.namespacePrefix + 'Definition__c']);
    if (!definition) return childs;

    for (let state of definition.states || []) {
      if (state.childCards && Array.isArray(state.childCards)) {
        childs = childs.concat(state.childCards);
      }
    }
    return childs;
  }

  private checkComponentForDependencies(component: any, flexCardAssessmentInfo: FlexCardAssessmentInfo): void {
    // Check if this component is an action element
    if (component.element === 'action' && component.property && component.property.actionList) {
      // Process each action in the actionList
      for (const action of component.property.actionList) {
        if (action.stateAction) {
          // Case 1: Direct OmniScript reference
          if (action.stateAction.type === Constants.OmniScriptComponentName && action.stateAction.omniType) {
            const omniType = action.stateAction.omniType;
            if (omniType.Name && typeof omniType.Name === 'string') {
              const originalName = omniType.Name;
              const parts = originalName.split('/');

              if (parts.length >= 2) {
                // Check for name changes in each part
                const cleanedParts = parts.map((p) => this.cleanName(p));
                const cleanedName = cleanedParts.join('_');
                flexCardAssessmentInfo.dependenciesOS.push(cleanedName);

                // Add warning if any part of the name will change
                for (let i = 0; i < parts.length; i++) {
                  if (parts[i] !== cleanedParts[i]) {
                    flexCardAssessmentInfo.warnings.push(
                      this.messages.getMessage('omniScriptNameChangeMessage', [parts[i], cleanedParts[i]])
                    );
                    flexCardAssessmentInfo.migrationStatus = 'Has Warnings';
                  }
                }
              }
            }
          }

          // Case 2: Flyout OmniScript reference
          else if (
            action.stateAction.type === 'Flyout' &&
            action.stateAction.flyoutType === Constants.OmniScriptPluralName &&
            action.stateAction.osName
          ) {
            const osName = action.stateAction.osName;
            if (typeof osName === 'string') {
              // osName is typically in format "Omniscript/Testing/English"
              const originalName = osName;
              const parts = originalName.split('/');

              if (parts.length >= 2) {
                // Check for name changes in each part
                const cleanedParts = parts.map((p) => this.cleanName(p));
                const cleanedName = cleanedParts.join('_');
                flexCardAssessmentInfo.dependenciesOS.push(cleanedName);

                // Add warning if any part of the name will change
                for (let i = 0; i < parts.length; i++) {
                  if (parts[i] !== cleanedParts[i]) {
                    flexCardAssessmentInfo.warnings.push(
                      this.messages.getMessage('omniScriptNameChangeMessage', [parts[i], cleanedParts[i]])
                    );
                    flexCardAssessmentInfo.migrationStatus = 'Has Warnings';
                  }
                }
              }
            }
          }
        }
      }
    }

    // Check for Custom LWC component
    if (component.element === 'customLwc' && component.property) {
      // Check customlwcname property first
      if (component.property.customlwcname) {
        const customLwcName = component.property.customlwcname;
        Logger.info(`Custom LWC name: ${customLwcName}`);

        // Avoid duplicates
        if (!flexCardAssessmentInfo.dependenciesLWC.includes(customLwcName)) {
          flexCardAssessmentInfo.dependenciesLWC.push(customLwcName);
        }
      }
    }

    // Check standard component actions if they exist
    if (component.actions && Array.isArray(component.actions)) {
      for (const action of component.actions) {
        if (action.stateAction && action.stateAction.omniType) {
          const omniType = action.stateAction.omniType;
          if (omniType.Name && typeof omniType.Name === 'string') {
            const parts = omniType.Name.split('/');
            if (parts.length >= 2) {
              const osRef = parts.join('_');
              flexCardAssessmentInfo.dependenciesOS.push(osRef);
            }
          }
        }
      }
    }

    // Check child components recursively
    if (component.children && Array.isArray(component.children)) {
      for (const child of component.children) {
        this.checkComponentForDependencies(child, flexCardAssessmentInfo);
      }
    }
  }

  // Query all cards that are active
  private async getAllActiveCards(): Promise<AnyJson[]> {
    //DebugTimer.getInstance().lap('Query Vlocity Cards');
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
      ).catch((err) => {
        if (err.errorCode === 'INVALID_TYPE') {
          throw new InvalidEntityTypeError(
            `${CardMigrationTool.VLOCITYCARD_NAME} type is not found under this namespace`
          );
        }
        throw err;
      });
    } else {
      filters.set(this.namespacePrefix + 'Active__c', true);
      return await QueryTools.queryWithFilter(
        this.connection,
        this.namespace,
        CardMigrationTool.VLOCITYCARD_NAME,
        this.getCardFields(),
        filters
      ).catch((err) => {
        if (err.errorCode === 'INVALID_TYPE') {
          throw new InvalidEntityTypeError(
            `${CardMigrationTool.VLOCITYCARD_NAME} type is not found under this namespace`
          );
        }
        throw err;
      });
    }
  }

  // Upload All the VlocityCard__c records to OmniUiCard
  private async uploadAllCards(
    cards: any[],
    progressBar: ReturnType<typeof createProgressBar>
  ): Promise<Map<string, UploadRecordResult>> {
    const cardsUploadInfo = new Map<string, UploadRecordResult>();
    const originalRecords = new Map<string, any>();
    const uniqueNames = new Set<string>();

    let progressCounter = 0;
    progressBar.start(cards.length, progressCounter);
    for (let card of cards) {
      await this.uploadCard(cards, card, cardsUploadInfo, originalRecords, uniqueNames);
      progressBar.update(++progressCounter);
    }
    progressBar.stop();

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

      if (uniqueNames.has(transformedCard['Name'])) {
        this.setRecordErrors(card, this.messages.getMessage('duplicatedCardName'));
        originalRecords.set(recordId, card);
        return;
      }

      // Save the name for duplicated names check
      uniqueNames.add(transformedCard['Name']);

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
            this.messages.getMessage('cardAuthorNameChangeMessage', [transformedCardAuthorName])
          );
        }
        if (transformedCard['Name'] !== card['Name']) {
          uploadResult.newName = transformedCardName;
          uploadResult.warnings.unshift(this.messages.getMessage('cardNameChangeMessage', [transformedCardName]));
        }

        if (uploadResult.id && invalidIpNames.size > 0) {
          const val = Array.from(invalidIpNames.entries())
            .map((e) => e[0])
            .join(', ');
          uploadResult.errors.push(this.messages.getMessage('integrationProcedureManualUpdateMessage', [val]));
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
      if (type === Constants.DataRaptorComponentName) {
        datasource.dataSource.value.bundle = this.cleanName(datasource.dataSource.value.bundle);
      } else if (type === Constants.IntegrationProcedurePluralName) {
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
