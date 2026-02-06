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
  MigrationStorage,
  FlexcardStorage,
} from './interfaces';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import { FlexCardAssessmentInfo } from '../../src/utils';
import { Logger } from '../utils/logger';
import { createProgressBar } from './base';
import { Constants } from '../utils/constants/stringContants';
import { StorageUtil } from '../utils/storageUtil';
import { getUpdatedAssessmentStatus } from '../utils/stringUtils';
import { isStandardDataModel, isStandardDataModelWithMetadataAPIEnabled } from '../utils/dataModelService';
import { prioritizeCleanNamesFirst } from '../utils/recordPrioritization';

export class CardMigrationTool extends BaseMigrationTool implements MigrationTool {
  static readonly VLOCITYCARD_NAME = 'VlocityCard__c';
  static readonly OMNIUICARD_NAME = 'OmniUiCard';
  static readonly VERSION_PROP = 'Version__c';
  private IS_STANDARD_DATA_MODEL: boolean = isStandardDataModel();

  private readonly allVersions: boolean;

  constructor(
    namespace: string,
    connection: Connection,
    logger: Logger,
    messages: Messages<string>,
    ux: Ux,
    allVersions: boolean
  ) {
    super(namespace, connection, logger, messages, ux);
    this.allVersions = allVersions;
  }

  getName(): string {
    return 'Flexcards';
  }

  getRecordName(record: string) {
    return this.allVersions
      ? `${record['Name']}_${record[this.getFieldKey(CardMigrationTool.VERSION_PROP)]}`
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
    if (this.IS_STANDARD_DATA_MODEL) {
      Logger.logVerbose(this.messages.getMessage('skippingTruncation'));
      return;
    }
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
    const allCards = await this.getAllCards();

    if (isStandardDataModelWithMetadataAPIEnabled()) {
      return this.handleMigrationForStdDataModelOrgsWithMetadataAPIEnabled(allCards);
    }

    Logger.log(this.messages.getMessage('foundFlexCardsToMigrate', [allCards.length]));

    // Filter out FlexCards with Angular OmniScript dependencies
    const cards: any[] = [];
    const skippedCards = new Map<string, any>();

    for (const card of allCards) {
      if (this.hasAngularOmniScriptDependencies(card)) {
        // Skip FlexCard with Angular dependencies
        Logger.logVerbose(
          `${this.messages.getMessage('skipFlexcardAngularOmniScriptDependencyWarning', [card['Name']])}`
        );
        skippedCards.set(card['Id'], {
          referenceId: card['Id'],
          id: '',
          success: false,
          hasErrors: false,
          errors: [],
          warnings: [this.messages.getMessage('flexCardWithAngularOmniScriptWarning')],
          newName: '',
          skipped: true,
        });
      } else {
        cards.push(card);
      }
    }

    if (this.IS_STANDARD_DATA_MODEL) {
      Logger.log(`${this.messages.getMessage('flexCardMigrationProcessingMessage', [cards.length])}`);
    } else {
      Logger.log(
        `${this.messages.getMessage('flexCardMigrationProcessingMessage', [cards.length])} ${this.messages.getMessage(
          'skippingAsAngularDependencies',
          [skippedCards.size]
        )}`
      );
    }

    const progressBar = createProgressBar('Migrating', 'Flexcards');
    // Save the Vlocity Cards in OmniUiCard
    const cardUploadResponse = await this.uploadAllCards(cards, progressBar);

    // Add skipped cards to the response
    for (const [cardId, skippedResult] of skippedCards.entries()) {
      cardUploadResponse.set(cardId, skippedResult);
    }

    const records = new Map<string, any>();
    for (let i = 0; i < allCards.length; i++) {
      records.set(allCards[i]['Id'], allCards[i]);
    }

    return [
      {
        name: 'Flexcards',
        records: records,
        results: cardUploadResponse,
      },
    ];
  }

  public async assess(): Promise<FlexCardAssessmentInfo[]> {
    try {
      const flexCards = await this.getAllCards();

      if (isStandardDataModelWithMetadataAPIEnabled()) {
        return this.handleAssessmentForStdDataModelOrgsWithMetadataAPIEnabled(flexCards);
      }

      Logger.log(this.messages.getMessage('startingFlexCardAssessment'));
      Logger.log(this.messages.getMessage('foundFlexCardsToAssess', [flexCards.length]));

      const flexCardsAssessmentInfos = await this.processCardComponents(flexCards);
      this.prepareAssessmentStorageForFlexcards(flexCardsAssessmentInfos);
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
    const progressBar = createProgressBar('Assessing', 'Flexcards');
    progressBar.start(flexCards.length, progressCounter);
    const uniqueNames = new Set<string>();
    const dupFlexCardNames: Map<string, string> = new Map<string, string>();

    // Now process each OmniScript and its elements
    for (const flexCard of flexCards) {
      try {
        const flexCardAssessmentInfo = await this.processFlexCard(flexCard, uniqueNames, dupFlexCardNames);
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

  private async processFlexCard(
    flexCard: AnyJson,
    uniqueNames: Set<string>,
    dupFlexCardNames: Map<string, string>
  ): Promise<FlexCardAssessmentInfo> {
    const flexCardName = flexCard['Name'];
    Logger.info(this.messages.getMessage('processingFlexCard', [flexCardName]));
    const version = flexCard[this.getFieldKey(CardMigrationTool.VERSION_PROP)];
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
      migrationStatus: 'Ready for migration',
    };

    // Check for name changes due to API naming requirements
    const originalName: string = flexCardName;
    const cleanedName: string = this.cleanName(originalName);
    let assessmentStatus: 'Ready for migration' | 'Warnings' | 'Needs manual intervention' | 'Failed' =
      'Ready for migration';
    flexCardAssessmentInfo.name = this.allVersions ? `${cleanedName}_${version}` : cleanedName;
    if (cleanedName !== originalName) {
      flexCardAssessmentInfo.warnings.push(
        this.messages.getMessage('cardNameChangeMessage', [originalName, cleanedName])
      );
      assessmentStatus = getUpdatedAssessmentStatus(assessmentStatus, 'Warnings');
    }

    // Check for duplicate names (include version when allVersions is true)
    const uniqueCleanedName = this.allVersions ? `${cleanedName}_${version}` : cleanedName;

    // Check for exact duplicate (same name + same version)
    if (uniqueNames.has(uniqueCleanedName)) {
      flexCardAssessmentInfo.warnings.push(this.messages.getMessage('duplicateCardNameMessage', [uniqueCleanedName]));
      assessmentStatus = getUpdatedAssessmentStatus(assessmentStatus, 'Needs manual intervention');
    }
    // Check for naming conflict: different original names cleaning to same name
    else if (this.allVersions && dupFlexCardNames.has(cleanedName)) {
      const existingOriginalName = dupFlexCardNames.get(cleanedName);
      // Only flag if the original names are different (indicates a naming conflict)
      if (existingOriginalName !== originalName) {
        flexCardAssessmentInfo.warnings.push(
          this.messages.getMessage('lowerVersionDuplicateCardNameMessage', [uniqueCleanedName])
        );
        assessmentStatus = getUpdatedAssessmentStatus(assessmentStatus, 'Needs manual intervention');
      }
    }

    // Add to tracking structures
    uniqueNames.add(uniqueCleanedName);
    if (this.allVersions && !dupFlexCardNames.has(cleanedName)) {
      dupFlexCardNames.set(cleanedName, originalName);
    }

    // Check for author name changes
    const originalAuthor = flexCard[this.getFieldKey('Author__c')];
    if (originalAuthor) {
      const cleanedAuthor = this.cleanName(originalAuthor);
      if (cleanedAuthor !== originalAuthor) {
        flexCardAssessmentInfo.warnings.push(
          this.messages.getMessage('authordNameChangeMessage', [originalAuthor, cleanedAuthor])
        );
        assessmentStatus = getUpdatedAssessmentStatus(assessmentStatus, 'Warnings');
      }
    }

    flexCardAssessmentInfo.nameMapping = {
      oldName: flexCardName,
      newName: cleanedName,
    };

    flexCardAssessmentInfo.migrationStatus = assessmentStatus;
    this.updateDependencies(flexCard, flexCardAssessmentInfo);

    // Deduplicate all dependency arrays to ensure no duplicates
    flexCardAssessmentInfo.dependenciesIP = [...new Set(flexCardAssessmentInfo.dependenciesIP)];
    flexCardAssessmentInfo.dependenciesDR = [...new Set(flexCardAssessmentInfo.dependenciesDR)];
    flexCardAssessmentInfo.dependenciesFC = [...new Set(flexCardAssessmentInfo.dependenciesFC)];
    flexCardAssessmentInfo.dependenciesOS = [...new Set(flexCardAssessmentInfo.dependenciesOS)];
    flexCardAssessmentInfo.dependenciesLWC = [...new Set(flexCardAssessmentInfo.dependenciesLWC)];
    flexCardAssessmentInfo.dependenciesApexRemoteAction = [
      ...new Set(flexCardAssessmentInfo.dependenciesApexRemoteAction),
    ];

    return flexCardAssessmentInfo;
  }

  private updateDependencies(flexCard, flexCardAssessmentInfo): void {
    const dataSourceConfig = JSON.parse(flexCard[this.getFieldKey('Datasource__c')] || '{}');

    // Collect all data sources - any nested object with a 'type' property is a data source
    // This handles: dataSource, datasource, event-0_0, event-1_0, etc.
    const dataSources: any[] = Object.values(dataSourceConfig).filter(
      (value) => value && typeof value === 'object' && (value as any).type
    );

    for (const ds of dataSources) {
      // Check if it's a DataRaptor source
      if (ds.type === Constants.DataRaptorComponentName) {
        const originalBundle = ds.value?.bundle;
        if (originalBundle) {
          this.addDataRaptorDependency(originalBundle, flexCardAssessmentInfo);
        }
      } else if (ds.type === Constants.IntegrationProcedurePluralName) {
        const originalIpMethod = ds.value?.ipMethod;
        if (originalIpMethod) {
          this.addIntegrationProcedureDependency(originalIpMethod, flexCardAssessmentInfo);
        }
      } else if (ds.type === Constants.ApexRemoteComponentName) {
        const remoteClass = ds.value?.remoteClass;
        const remoteMethod = ds.value?.remoteMethod;
        if (
          remoteClass &&
          remoteMethod &&
          !flexCardAssessmentInfo.dependenciesApexRemoteAction.includes(`${remoteClass}.${remoteMethod}`)
        ) {
          flexCardAssessmentInfo.dependenciesApexRemoteAction.push(`${remoteClass}.${remoteMethod}`);
        }
      }
    }

    // Check for Omniscript dependencies in the card's definition
    try {
      const definition = JSON.parse(flexCard[this.getFieldKey('Definition__c')] || '{}');
      if (definition && definition.states) {
        for (const state of definition.states) {
          if (state.omniscripts && Array.isArray(state.omniscripts)) {
            for (const os of state.omniscripts) {
              if (os.type && os.subtype) {
                this.addOmniScriptDependencyFromParts(os.type, os.subtype, os.language, flexCardAssessmentInfo);
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
      // Add warnings for child card name changes
      for (const childCardName of childCards) {
        this.addFlexCardDependency(childCardName, flexCardAssessmentInfo);
      }

      // Check for dependencies in events[] array
      if (definition.events && Array.isArray(definition.events)) {
        this.checkEventsForDependencies(definition.events, flexCardAssessmentInfo);
      }
    } catch (err) {
      // Log the error but continue processing
      Logger.error(`Error parsing definition for card ${flexCard.Name}: ${err.message}`);
    }
  }

  /**
   * Check events array for dependencies (Assessment)
   * Handles: events[].actionList[].stateAction references
   */
  private checkEventsForDependencies(events: any[], flexCardAssessmentInfo: FlexCardAssessmentInfo): void {
    for (const event of events) {
      if (!event.actionList || !Array.isArray(event.actionList)) {
        continue;
      }

      for (const action of event.actionList) {
        if (!action.stateAction) {
          continue;
        }

        const stateAction = action.stateAction;

        // 1-2. Handle message.value.bundle (DataRaptor) and message.value.ipMethod (Integration Procedure)
        this.processStateActionMessageForDependencies(stateAction, flexCardAssessmentInfo);

        // 3. Handle cardName (FlexCard - Flyout childCard)
        if (stateAction.cardName) {
          this.addFlexCardDependency(stateAction.cardName, flexCardAssessmentInfo);
        }

        // 4. Handle flyoutLwc - FlexCard child cards
        if (this.hasFlexCardFlyoutDependency(stateAction)) {
          this.addFlexCardDependency(stateAction.flyoutLwc, flexCardAssessmentInfo);
        }
        // Handle flyoutLwc - CustomLwc with potential "cf" prefix for FlexCard reference
        else if (this.hasCustomLwcFlyoutDependency(stateAction)) {
          this.addCfPrefixedFlexCardDependency(stateAction.flyoutLwc, flexCardAssessmentInfo);
        }
        // 5. Handle osName
        else if (this.hasOmniscriptFlyoutDependency(stateAction)) {
          this.addOmniScriptDependency(stateAction.osName, flexCardAssessmentInfo);
        }

        // 6. Handle omniType.Name (OmniScript)
        if (stateAction.omniType && stateAction.omniType.Name) {
          this.addOmniScriptDependency(stateAction.omniType.Name, flexCardAssessmentInfo);
        }
      }
    }
  }

  /**
   * Shared helper to check if a "cf" prefixed LWC name references a FlexCard and add dependency (assessment phase)
   * @param cfPrefixedLwcName LWC name with "cf" prefix (e.g., "cfMyFlexCard")
   * @param flexCardAssessmentInfo Assessment info to add dependencies and warnings
   */
  private addCfPrefixedFlexCardDependency(
    cfPrefixedLwcName: string,
    flexCardAssessmentInfo: FlexCardAssessmentInfo
  ): void {
    if (cfPrefixedLwcName.startsWith('cf')) {
      // Remove "cf" prefix to get the original FlexCard name
      const originalFlexCardName = cfPrefixedLwcName.substring(2);

      // Check if the FlexCard name will change and add warning
      const cleanedFlexCardName = this.cleanName(originalFlexCardName);
      this.addFlexCardDependency(originalFlexCardName, flexCardAssessmentInfo);

      if (originalFlexCardName !== cleanedFlexCardName) {
        flexCardAssessmentInfo.warnings.push(
          this.messages.getMessage('cardLWCNameChangeMessage', [originalFlexCardName, cleanedFlexCardName])
        );
        flexCardAssessmentInfo.migrationStatus = getUpdatedAssessmentStatus(
          flexCardAssessmentInfo.migrationStatus as
            | 'Warnings'
            | 'Needs manual intervention'
            | 'Ready for migration'
            | 'Failed',
          'Warnings'
        );
      }
    }
  }

  /**
   * Shared helper to update a "cf" prefixed LWC name with registry (migration phase)
   * @param cfPrefixedLwcName LWC name with "cf" prefix (e.g., "cfMyFlexCard")
   * @returns Updated LWC name with "cf" prefix
   */
  private updateCfPrefixedFlexCardName(cfPrefixedLwcName: string): string {
    if (cfPrefixedLwcName.startsWith('cf')) {
      // Remove "cf" prefix to get the original FlexCard name
      const originalFlexCardName = cfPrefixedLwcName.substring(2);

      // Look up the cleaned name from registry
      let cleanedFlexCardName: string;
      if (this.nameRegistry.hasFlexCardMapping(originalFlexCardName)) {
        cleanedFlexCardName = this.nameRegistry.getFlexCardCleanedName(originalFlexCardName);
      } else {
        Logger.logVerbose(
          `\n${this.messages.getMessage('componentMappingNotFound', ['Flexcard', originalFlexCardName])}`
        );
        cleanedFlexCardName = this.cleanName(originalFlexCardName);
      }

      return `cf${cleanedFlexCardName}`;
    }

    return cfPrefixedLwcName;
  }

  /**
   * Shared helper to check Custom LWC component for FlexCard dependencies (assessment phase)
   * Handles customlwcname with "cf" prefix indicating FlexCard reference
   */
  private checkCustomLwcForDependencies(component: any, flexCardAssessmentInfo: FlexCardAssessmentInfo): void {
    if (component.element === Constants.CustomLwc && component.property) {
      if (component.property.customlwcname) {
        const customLwcName = component.property.customlwcname;
        Logger.info(`Custom LWC name: ${customLwcName}`);

        // Check if this is a FlexCard reference (starts with "cf" prefix)
        this.addCfPrefixedFlexCardDependency(customLwcName, flexCardAssessmentInfo);

        // Add to LWC dependencies for tracking (avoid duplicates)
        if (!flexCardAssessmentInfo.dependenciesLWC.includes(customLwcName)) {
          flexCardAssessmentInfo.dependenciesLWC.push(customLwcName);
        }
      }
    }
  }

  /**
   * Shared helper to update Custom LWC component with registry (migration phase)
   * Handles customlwcname with "cf" prefix indicating FlexCard reference
   */
  private updateCustomLwcWithRegistry(component: any): void {
    if (component.element === Constants.CustomLwc && component.property) {
      if (component.property.customlwcname) {
        const customLwcName = component.property.customlwcname;

        // Check if this is a FlexCard reference (starts with "cf" prefix) and update it
        if (customLwcName?.startsWith('cf')) {
          const updatedLwcName = this.updateCfPrefixedFlexCardName(customLwcName);
          component.property.customlwcname = updatedLwcName;

          if (customLwcName !== updatedLwcName) {
            const cleanedFlexCardName = updatedLwcName.substring(2);
            Logger.logVerbose(
              this.messages.getMessage('customLWCFlexCardReferenceUpdated', [customLwcName, cleanedFlexCardName])
            );
          }
        }
        // Note: Other custom LWC names (not starting with "cf") typically don't need cleaning
      }
    }
  }

  /**
   * Shared helper to update flyoutLwc value with registry (migration phase)
   * Handles FlexCard child cards references
   */
  private updateFlyoutLwcValue(stateAction: any): void {
    if (stateAction.flyoutLwc) {
      if (stateAction.flyoutType === Constants.ChildCard) {
        // flyoutLwc is a direct FlexCard name reference
        const lwcName = stateAction.flyoutLwc;
        if (this.nameRegistry.hasFlexCardMapping(lwcName)) {
          stateAction.flyoutLwc = this.nameRegistry.getFlexCardCleanedName(lwcName);
        } else {
          Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['Flexcard', lwcName])}`);
          stateAction.flyoutLwc = this.cleanName(lwcName);
        }
      } else if (stateAction.flyoutType === Constants.CustomLwc) {
        // flyoutType is customLwc - update if it's a FlexCard reference with "cf" prefix
        stateAction.flyoutLwc = this.updateCfPrefixedFlexCardName(stateAction.flyoutLwc);
        // Note: Non-"cf" prefixed names are returned unchanged by the helper
      }
    }
  }

  /**
   * Shared helper to process stateAction.message JSON for dependencies
   * Handles DataRaptor bundle and Integration Procedure ipMethod references
   */
  private processStateActionMessageForDependencies(
    stateAction: any,
    flexCardAssessmentInfo: FlexCardAssessmentInfo
  ): void {
    // Only parse message for DataAction or cardAction types
    if (
      stateAction.message &&
      typeof stateAction.message === 'string' &&
      stateAction.message.trim().length > 0 &&
      (stateAction.type === Constants.DataAction || stateAction.type === Constants.CardAction)
    ) {
      try {
        const messageObj = JSON.parse(stateAction.message);
        if (messageObj.value) {
          // DataRaptor bundle
          if (messageObj.value.bundle) {
            this.addDataRaptorDependency(messageObj.value.bundle, flexCardAssessmentInfo);
          }
          // Integration Procedure ipMethod
          if (messageObj.value.ipMethod) {
            this.addIntegrationProcedureDependency(messageObj.value.ipMethod, flexCardAssessmentInfo);
          }
        }
      } catch (e) {
        // message is not valid JSON, skip
        Logger.error(`Failed to parse stateAction.message as JSON: ${e.message}`);
      }
    }
  }

  /**
   * Shared helper to process stateAction.message JSON with registry updates
   * Handles DataRaptor bundle and Integration Procedure ipMethod references
   */
  private processStateActionMessageWithRegistry(stateAction: any, invalidIpNames?: Map<string, string>): void {
    // Only parse message for DataAction or cardAction types
    if (
      stateAction.message &&
      typeof stateAction.message === 'string' &&
      stateAction.message.trim().length > 0 &&
      (stateAction.type === Constants.DataAction || stateAction.type === Constants.CardAction)
    ) {
      try {
        const messageObj = JSON.parse(stateAction.message);
        let messageUpdated = false;

        if (messageObj.value) {
          // DataRaptor bundle
          if (messageObj.value.bundle) {
            const originalBundle = messageObj.value.bundle;
            if (this.nameRegistry.hasDataMapperMapping(originalBundle)) {
              messageObj.value.bundle = this.nameRegistry.getDataMapperCleanedName(originalBundle);
            } else {
              Logger.logVerbose(
                `\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', originalBundle])}`
              );
              messageObj.value.bundle = this.cleanName(originalBundle);
            }
            messageUpdated = true;
          }

          // Integration Procedure ipMethod
          if (messageObj.value.ipMethod) {
            const ipMethod = messageObj.value.ipMethod;
            if (this.nameRegistry.hasIntegrationProcedureMapping(ipMethod)) {
              messageObj.value.ipMethod = this.nameRegistry.getIntegrationProcedureCleanedName(ipMethod);
            } else {
              Logger.logVerbose(
                `\n${this.messages.getMessage('componentMappingNotFound', ['IntegrationProcedure', ipMethod])}`
              );
              const parts = ipMethod.split('_');
              messageObj.value.ipMethod = parts.map((p) => this.cleanName(p, true)).join('_');
              if (parts.length > 2 && invalidIpNames) {
                invalidIpNames.set(`event.actionList.stateAction.message`, ipMethod);
              }
            }
            messageUpdated = true;
          }
        }

        if (messageUpdated) {
          stateAction.message = JSON.stringify(messageObj);
        }
      } catch (e) {
        // message is not valid JSON, skip
        Logger.error(`Failed to parse stateAction.message as JSON: ${e.message}`);
      }
    }
  }

  private handleAssessmentForStdDataModelOrgsWithMetadataAPIEnabled(flexCards: AnyJson[]): FlexCardAssessmentInfo[] {
    Logger.logVerbose(this.messages.getMessage('preparingStorageForMetadataEnabledOrg', [Constants.Flexcard]));
    let storage: MigrationStorage = StorageUtil.getOmnistudioAssessmentStorage();
    this.prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(storage, flexCards);
    StorageUtil.printAssessmentStorage();
    return [];
  }

  private handleMigrationForStdDataModelOrgsWithMetadataAPIEnabled(flexcards: AnyJson[]): MigrationResult[] {
    Logger.logVerbose(this.messages.getMessage('preparingStorageForMetadataEnabledOrg', [Constants.Flexcard]));
    let storage: MigrationStorage = StorageUtil.getOmnistudioMigrationStorage();
    this.prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(storage, flexcards);
    StorageUtil.printAssessmentStorage();

    // Return empty result structure for report generation
    return [
      {
        name: this.getName(),
        results: new Map<string, UploadRecordResult>(),
        records: new Map<string, any>(),
      },
    ];
  }

  private readChildCardsFromDefinition(card: AnyJson): string[] {
    let childs = [];

    const definition = JSON.parse(card[this.getFieldKey('Definition__c')]);
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
          // Handle message field (contains DataRaptor/IP references as JSON string)
          this.processStateActionMessageForDependencies(action.stateAction, flexCardAssessmentInfo);

          // Case 1: Direct OmniScript reference
          if (action.stateAction.type === Constants.OmniScriptComponentName && action.stateAction.omniType) {
            const omniType = action.stateAction.omniType;
            if (omniType.Name && typeof omniType.Name === 'string') {
              this.addOmniScriptDependency(omniType.Name, flexCardAssessmentInfo);
            }
          }

          // MISSING PATTERN FIXED: Case 1b: Direct OmniScript reference without type check (for test compatibility)
          else if (action.stateAction.omniType && !action.stateAction.type) {
            const omniType = action.stateAction.omniType;
            // Handle both string omniType and object with Name property
            let omniTypeName: string;

            if (typeof omniType === 'string') {
              omniTypeName = omniType;
            } else if (omniType.Name && typeof omniType.Name === 'string') {
              omniTypeName = omniType.Name;
            } else {
              continue; // Skip if we can't extract the name
            }

            this.addOmniScriptDependency(omniTypeName, flexCardAssessmentInfo);
          }

          // Case 2: Flyout OmniScript reference
          else if (this.hasOmniscriptFlyoutDependency(action.stateAction)) {
            const osName = action.stateAction.osName;
            if (typeof osName === 'string') {
              this.addOmniScriptDependency(osName, flexCardAssessmentInfo);
            }
          }
          // Case 3: Flyout childCard reference - flyoutLwc is a direct FlexCard name
          else if (this.hasFlexCardFlyoutDependency(action.stateAction)) {
            this.addFlexCardDependency(action.stateAction.flyoutLwc, flexCardAssessmentInfo);
          }
          // Case 4: Flyout CustomLwc reference - check for FlexCard reference with "cf" prefix
          else if (this.hasCustomLwcFlyoutDependency(action.stateAction)) {
            this.addCfPrefixedFlexCardDependency(action.stateAction.flyoutLwc, flexCardAssessmentInfo);
          }
        }
      }
    }

    // Check for Custom LWC component
    this.checkCustomLwcForDependencies(component, flexCardAssessmentInfo);

    // Check standard component actions if they exist
    if (component.actions && Array.isArray(component.actions)) {
      for (const action of component.actions) {
        if (action.stateAction && action.stateAction.omniType) {
          const omniType = action.stateAction.omniType;
          if (omniType.Name && typeof omniType.Name === 'string') {
            this.addOmniScriptDependency(omniType.Name, flexCardAssessmentInfo);
          }
        }
      }
    }

    // MISSING PATTERN FIXED: Handle direct stateAction on component property
    if (component.property && component.property.stateAction) {
      // Case 1: Direct OmniScript reference on component property
      if (component.property.stateAction.omniType) {
        const omniType = component.property.stateAction.omniType;
        if (omniType.Name && typeof omniType.Name === 'string') {
          this.addOmniScriptDependency(omniType.Name, flexCardAssessmentInfo);
        }
      }

      // Case 2: Flyout OmniScript reference on component property
      if (this.hasOmniscriptFlyoutDependency(component.property.stateAction)) {
        const osName = component.property.stateAction.osName;
        if (typeof osName === 'string') {
          this.addOmniScriptDependency(osName, flexCardAssessmentInfo);
        }
      }

      // Case 3: Flyout childCard reference on component property - flyoutLwc is a direct FlexCard name
      if (this.hasFlexCardFlyoutDependency(component.property.stateAction)) {
        this.addFlexCardDependency(component.property.stateAction.flyoutLwc, flexCardAssessmentInfo);
      }

      // Case 4: Flyout CustomLwc reference on component property - check for FlexCard reference with "cf" prefix
      if (this.hasCustomLwcFlyoutDependency(component.property.stateAction)) {
        this.addCfPrefixedFlexCardDependency(component.property.stateAction.flyoutLwc, flexCardAssessmentInfo);
      }
    }

    // MISSING PATTERN FIXED: Handle omni-flyout elements (from tests)
    if (component.element === Constants.OmniFlyout && component.property && component.property.flyoutOmniScript) {
      if (component.property.flyoutOmniScript.osName) {
        const osName = component.property.flyoutOmniScript.osName;
        if (typeof osName === 'string') {
          this.addOmniScriptDependency(osName, flexCardAssessmentInfo);
        }
      }
    }

    // MISSING PATTERN FIXED: Handle childCardPreview elements with cardName property
    if (component.element === Constants.ChildCardPreview && component.property && component.property.cardName) {
      this.addFlexCardDependency(component.property.cardName, flexCardAssessmentInfo);
    }

    // Check child components recursively
    if (component.children && Array.isArray(component.children)) {
      for (const child of component.children) {
        this.checkComponentForDependencies(child, flexCardAssessmentInfo);
      }
    }
  }

  private async getAllCards(): Promise<AnyJson[]> {
    //DebugTimer.getInstance().lap('Query Vlocity Cards');
    const filters = new Map<string, any>();

    if (!this.IS_STANDARD_DATA_MODEL) {
      filters.set(this.namespacePrefix + 'CardType__c', 'flex');
    }

    let flexCards: AnyJson[];

    if (this.allVersions) {
      const sortFields = [
        { field: 'Name', direction: SortDirection.ASC },
        { field: this.getFieldKey('Version__c'), direction: SortDirection.ASC },
      ];
      flexCards = await QueryTools.queryWithFilterAndSort(
        this.connection,
        this.getQueryNamespace(),
        this.getCardObjectName(),
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
      filters.set(this.getFieldKey('Active__c'), true);
      flexCards = await QueryTools.queryWithFilter(
        this.connection,
        this.getQueryNamespace(),
        this.getCardObjectName(),
        this.getCardFields(),
        filters
      ).catch((err) => {
        if (err.errorCode === 'INVALID_TYPE') {
          throw new InvalidEntityTypeError(`${this.getCardObjectName()} type is not found under this namespace`);
        }
        throw err;
      });
    }

    // Apply prioritization only for standard data model
    if (this.IS_STANDARD_DATA_MODEL) {
      return this.prioritizeFlexCardsWithoutSpecialCharacters(flexCards);
    }

    return flexCards;
  }

  // Upload All the VlocityCard__c records to OmniUiCard for custom model and update references for standard
  private async uploadAllCards(
    cards: any[],
    progressBar: ReturnType<typeof createProgressBar>
  ): Promise<Map<string, UploadRecordResult>> {
    const cardsUploadInfo = new Map<string, UploadRecordResult>();
    const originalRecords = new Map<string, any>();
    const uniqueNames = new Set<string>();
    // Map to track cleanedName -> originalName for duplicate detection
    const dupFlexCardNames: Map<string, string> = new Map<string, string>();

    let progressCounter = 0;
    progressBar.start(cards.length, progressCounter);
    for (let card of cards) {
      await this.uploadCard(cards, card, cardsUploadInfo, originalRecords, uniqueNames, dupFlexCardNames);
      progressBar.update(++progressCounter);
    }

    this.prepareStorageForFlexcards(cardsUploadInfo, originalRecords);

    progressBar.stop();

    return cardsUploadInfo;
  }

  private async uploadCard(
    allCards: any[],
    card: AnyJson,
    cardsUploadInfo: Map<string, UploadRecordResult>,
    originalRecords: Map<string, any>,
    uniqueNames: Set<string>,
    dupFlexCardNames: Map<string, string>
  ) {
    const recordId = card['Id'];

    // If we already uploaded this card, skip
    if (cardsUploadInfo.has(recordId)) {
      return;
    }
    const isCardActive = card[this.getFieldKey('Active__c')];

    try {
      const childCards = this.getChildCards(card);
      if (childCards.length > 0) {
        for (let childCardName of childCards) {
          // Upload child cards
          const childCard = allCards.find((c) => c['Name'] === childCardName);
          if (childCard) {
            await this.uploadCard(allCards, childCard, cardsUploadInfo, originalRecords, uniqueNames, dupFlexCardNames);
          }
        }

        this.updateChildCards(card);
      }

      // Perform the transformation
      const invalidIpNames = new Map<string, string>();
      const transformedCard = this.mapVlocityCardRecord(card, cardsUploadInfo, invalidIpNames); // This only has the card structure, card definition is not there

      // Verify duplicated names
      let transformedCardName: string;
      if (this.allVersions) {
        transformedCardName = transformedCard['Name'] + '_' + transformedCard['VersionNumber'];
      } else {
        transformedCardName = transformedCard['Name'];
      }
      const transformedCardAuthorName = transformedCard['AuthorName'];

      // Check for duplicates using version-aware name when allVersions is true
      const uniqueCheckName = this.allVersions
        ? `${transformedCard['Name']}_${transformedCard['VersionNumber']}`
        : transformedCard['Name'];

      const originalCardName = card['Name'];
      const cleanedCardName = transformedCard['Name'];

      // Check for exact duplicate (same name + same version)
      if (uniqueNames.has(uniqueCheckName)) {
        this.setRecordErrors(card, this.messages.getMessage('duplicatedCardName', [uniqueCheckName]));
        originalRecords.set(recordId, card);
        return;
      }
      // Check for naming conflict: different original names cleaning to same name
      else if (this.allVersions && dupFlexCardNames.has(cleanedCardName)) {
        const existingOriginalName = dupFlexCardNames.get(cleanedCardName);
        // Only flag if the original names are different (indicates a naming conflict)
        if (existingOriginalName !== originalCardName) {
          this.setRecordErrors(card, this.messages.getMessage('lowerVersionDuplicateCardName', [uniqueCheckName]));
          originalRecords.set(recordId, card);
          return;
        }
      }

      // Add to tracking structures
      uniqueNames.add(uniqueCheckName);
      if (this.allVersions && !dupFlexCardNames.has(cleanedCardName)) {
        dupFlexCardNames.set(cleanedCardName, originalCardName);
      }

      // Create a map of the original records
      originalRecords.set(recordId, card);

      // Create card

      let uploadResult: UploadRecordResult;
      if (!this.IS_STANDARD_DATA_MODEL) {
        uploadResult = await NetUtils.createOne(
          this.connection,
          CardMigrationTool.OMNIUICARD_NAME,
          recordId,
          transformedCard
        );
      } else {
        const standardId = transformedCard['Id'];
        delete transformedCard['Id'];

        const deactivationResult = await NetUtils.updateOne(
          this.connection,
          CardMigrationTool.OMNIUICARD_NAME,
          standardId,
          standardId,
          {
            ['IsActive']: false,
          }
        );
        Logger.logVerbose(JSON.stringify(deactivationResult)); // TODO - Add checks here

        uploadResult = await NetUtils.updateOne(
          this.connection,
          CardMigrationTool.OMNIUICARD_NAME,
          recordId,
          recordId,
          transformedCard
        );
        uploadResult['id'] = standardId;
      }

      if (uploadResult) {
        // Fix errors
        uploadResult.errors = uploadResult.errors || [];
        if (!uploadResult.success) {
          uploadResult.errors = Array.isArray(uploadResult.errors) ? uploadResult.errors : [uploadResult.errors];
        }

        // If name has been changed, add a warning message
        uploadResult.warnings = uploadResult.warnings || [];
        if (transformedCardAuthorName !== card[this.getFieldKey('Author__c')]) {
          uploadResult.warnings.unshift(
            this.messages.getMessage('cardAuthorNameChangeMessage', [transformedCardAuthorName])
          );
        }

        uploadResult.newName = transformedCardName;
        uploadResult.actualName = transformedCard['Name']; // This is required as storage needs name without version, for replacement in other references
        if (transformedCard['Name'] !== card['Name']) {
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

  private prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(storage: MigrationStorage, flexcards: AnyJson[]): void {
    for (const flexcard of flexcards) {
      const originalName: string = flexcard[this.getFieldKey('Name')];

      let value: FlexcardStorage = {
        name: originalName,
        isDuplicate: false,
        originalName: originalName,
        migrationSuccess: true, // When metadata API is enabled, assume migration is successful
      };

      this.addKeyToStorage(originalName, value, storage);
    }
  }

  private prepareAssessmentStorageForFlexcards(flexcardAssessmentInfos: FlexCardAssessmentInfo[]) {
    let storage: MigrationStorage = StorageUtil.getOmnistudioAssessmentStorage();

    for (let flexCardAssessmentInfo of flexcardAssessmentInfos) {
      try {
        if (!flexCardAssessmentInfo?.nameMapping) {
          Logger.error(this.messages.getMessage('missingInfo'));
          return;
        }

        const originalName: string = flexCardAssessmentInfo.nameMapping.oldName;

        let value: FlexcardStorage = {
          name: flexCardAssessmentInfo.nameMapping.newName,
          isDuplicate: false,
          originalName: originalName,
        };

        if (flexCardAssessmentInfo.errors && flexCardAssessmentInfo.errors.length > 0) {
          value.error = flexCardAssessmentInfo.errors;
          value.migrationSuccess = false;
        } else if (flexCardAssessmentInfo.migrationStatus === 'Needs manual intervention') {
          // Duplicate name and other critical warnings
          value.error = flexCardAssessmentInfo.warnings;
          value.migrationSuccess = false;
        } else {
          value.migrationSuccess = true;
        }
        this.addKeyToStorage(originalName, value, storage);
      } catch (error) {
        Logger.logVerbose(this.messages.getMessage('errorWhileProcessingFlexcardStorage'));
        Logger.error(error);
      }
    }
    StorageUtil.printAssessmentStorage();
  }

  private addKeyToStorage(originalName: string, value: FlexcardStorage, storage: MigrationStorage) {
    let finalKey = `${originalName}`;
    finalKey = finalKey.toLowerCase();

    if (storage.fcStorage.has(finalKey)) {
      if (this.allVersions) {
        const storedValue = storage.fcStorage.get(finalKey);
        if (this.isDifferentFlexcard(storedValue, originalName)) {
          this.markDuplicateKeyInStorage(value, finalKey, storage);
        }
      } else {
        this.markDuplicateKeyInStorage(value, finalKey, storage);
      }
    } else {
      // Key doesn't exist - safe to set
      storage.fcStorage.set(finalKey, value);
    }
  }

  private markDuplicateKeyInStorage(value: FlexcardStorage, finalKey: string, storage: MigrationStorage) {
    // Key already exists - handle accordingly
    Logger.logVerbose(this.messages.getMessage('keyAlreadyInStorage', ['Flexcard', finalKey]));
    value.isDuplicate = true;
    storage.fcStorage.set(finalKey, value);
  }

  isDifferentFlexcard(storedValue: FlexcardStorage, originalName: string) {
    if (storedValue.originalName === originalName) {
      return false;
    }
    return true;
  }

  private prepareStorageForFlexcards(
    cardsUploadInfo: Map<string, UploadRecordResult>,
    originalRecords: Map<string, any>
  ) {
    Logger.logVerbose(this.messages.getMessage('flexcardStorageProcessingStarted'));
    let storage: MigrationStorage = StorageUtil.getOmnistudioMigrationStorage();

    for (let key of Array.from(originalRecords.keys())) {
      try {
        let oldrecord = originalRecords.get(key);
        let newrecord = cardsUploadInfo.get(key);

        const originalName: string = oldrecord['Name'];
        let value: FlexcardStorage = {
          name: newrecord?.actualName,
          isDuplicate: false,
          originalName: originalName,
        };

        if (newrecord === undefined) {
          // Card was not migrated - check if original record has error details
          if (oldrecord['errors'] && Array.isArray(oldrecord['errors'])) {
            value.error = oldrecord['errors'];
          } else {
            value.error = ['Migration Failed'];
          }
          value.migrationSuccess = false;
        } else {
          if (newrecord.hasErrors) {
            value.error = newrecord.errors;
            value.migrationSuccess = false;
          } else {
            value.migrationSuccess = true;
          }
        }

        this.addKeyToStorage(originalName, value, storage);
      } catch (error) {
        Logger.logVerbose(this.messages.getMessage('errorWhileProcessingFlexcardStorage'));
        Logger.error(error);
      }

      StorageUtil.printMigrationStorage();
    }
  }

  private getChildCards(card: AnyJson): string[] {
    let childs = [];
    const definition = JSON.parse(card[this.getFieldKey('Definition__c')]);
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
    const definition = JSON.parse(card[this.getFieldKey('Definition__c')]);
    if (!definition) return;

    for (let state of definition.states || []) {
      if (state.childCards && Array.isArray(state.childCards)) {
        const originalChildCards = [...state.childCards];
        state.childCards = state.childCards.map((c) => this.cleanName(c));

        // Check if any child card name was changed
        for (let i = 0; i < originalChildCards.length; i++) {
          if (originalChildCards[i] !== state.childCards[i]) {
          }
        }
      }
    }

    card[this.getFieldKey('Definition__c')] = JSON.stringify(definition);
  }

  // Maps an indivitdual VlocityCard__c record to an OmniUiCard record.
  private mapVlocityCardRecord(
    cardRecord: AnyJson,
    cardsUploadInfo: Map<string, UploadRecordResult>,
    invalidIpNames: Map<string, string>
  ): AnyJson {
    // Transformed object
    let mappedObject = {};

    if (!this.IS_STANDARD_DATA_MODEL) {
      // Get the fields of the record
      const recordFields = Object.keys(cardRecord);

      // Map individual fields
      recordFields.forEach((recordField) => {
        const cleanFieldName = this.getCleanFieldName(recordField);

        if (CardMappings.hasOwnProperty(cleanFieldName) && cleanFieldName !== 'IsChildCard__c') {
          mappedObject[CardMappings[cleanFieldName]] = cardRecord[recordField];

          // Transform ParentId__c to ClonedFromOmniUiCardKey field from uploaded response map
          if (cleanFieldName === 'ParentID__c' && cardsUploadInfo.has(cardRecord[this.getFieldKey('ParentID__c')])) {
            mappedObject[CardMappings[cleanFieldName]] = cardsUploadInfo.get(
              cardRecord[this.getFieldKey('ParentID__c')]
            ).id;
          }

          // CardType__c and OmniUiCardType have different picklist values
          if (cleanFieldName === 'CardType__c') {
            let ischildCard = cardRecord[this.getFieldKey('IsChildCard__c')];
            mappedObject['OmniUiCardType'] = ischildCard ? 'Child' : 'Parent';
          }

          // Child Cards don't have version, so assigning 1
          if (cleanFieldName === 'Version__c') {
            let versionNumber = cardRecord[this.getFieldKey('Version__c')];
            mappedObject['VersionNumber'] = versionNumber ? versionNumber : 1;
          }
        }
      });
    } else {
      mappedObject = { ...(cardRecord as object) };
    }

    // Clean the name
    mappedObject['Name'] = this.cleanName(mappedObject['Name']);

    mappedObject[CardMappings.Author__c] = this.cleanName(mappedObject[CardMappings.Author__c]);
    mappedObject[CardMappings.Active__c] = false;

    if (this.IS_STANDARD_DATA_MODEL) {
      if (mappedObject['OmniUiCardKey']) {
        mappedObject['OmniUiCardKey'] =
          mappedObject['Name'] +
          '/' +
          mappedObject[CardMappings.Author__c] +
          '/' +
          mappedObject[CardMappings.Version__c] +
          '.0';
      }
    }

    // Update the datasource - process any nested object with a 'type' property
    const datasource = JSON.parse(mappedObject[CardMappings.Datasource__c] || '{}');
    let updated = false;

    // Process all keys that have objects with type property
    for (const key of Object.keys(datasource)) {
      const ds = datasource[key];
      if (!ds || typeof ds !== 'object' || !ds.type) continue;
      if (ds.type === Constants.DataRaptorComponentName && ds.value?.bundle) {
        ds.value.bundle = this.nameRegistry.hasDataMapperMapping(ds.value.bundle)
          ? this.nameRegistry.getDataMapperCleanedName(ds.value.bundle)
          : this.cleanName(ds.value.bundle);
        updated = true;
      } else if (ds.type === Constants.IntegrationProcedurePluralName && ds.value?.ipMethod) {
        const ipMethod = ds.value.ipMethod;
        if (this.nameRegistry.hasIntegrationProcedureMapping(ipMethod)) {
          ds.value.ipMethod = this.nameRegistry.getIntegrationProcedureCleanedName(ipMethod);
        } else {
          const parts = ipMethod.split('_');
          ds.value.ipMethod = parts.map((p) => this.cleanName(p, true)).join('_');
          if (parts.length > 2) invalidIpNames.set(key, ipMethod);
        }
        updated = true;
      }
    }
    if (updated) mappedObject[CardMappings.Datasource__c] = JSON.stringify(datasource);

    const isCardActive: boolean = cardRecord[this.getFieldKey('Active__c')];
    this.ensureCommunityTargets(mappedObject, isCardActive);

    // Update all dependencies comprehensively
    this.updateAllDependenciesWithRegistry(mappedObject, invalidIpNames);

    mappedObject['attributes'] = {
      type: CardMigrationTool.OMNIUICARD_NAME,
      referenceId: cardRecord['Id'],
    };

    return mappedObject;
  }

  /**
   * Comprehensive dependency update using NameMappingRegistry - mirrors assessment logic
   */
  private updateAllDependenciesWithRegistry(mappedObject: any, invalidIpNames: Map<string, string>): void {
    // Handle propertySet (Definition) - update all dependency references
    const propertySet = JSON.parse(mappedObject[CardMappings.Definition__c] || '{}');
    if (propertySet) {
      // Handle dataSource in propertySet
      if (propertySet.dataSource) {
        this.updateDataSourceWithRegistry(propertySet.dataSource, invalidIpNames, 'PropertySet');
      }

      // Handle states comprehensively
      if (propertySet.states && Array.isArray(propertySet.states)) {
        for (let i = 0; i < propertySet.states.length; i++) {
          const state = propertySet.states[i];

          // Handle child cards using registry
          if (state.childCards && Array.isArray(state.childCards)) {
            state.childCards = state.childCards.map((c) => {
              if (c && this.nameRegistry.hasFlexCardMapping(c)) {
                return this.nameRegistry.getFlexCardCleanedName(c);
              } else {
                Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['Flexcard', c])}`);
                return this.cleanName(c);
              }
            });
          }

          // Handle omniscripts using registry
          if (state.omniscripts && Array.isArray(state.omniscripts)) {
            for (let osIdx = 0; osIdx < state.omniscripts.length; osIdx++) {
              this.updateOmniScriptReferenceWithRegistry(state.omniscripts[osIdx]);
            }
          }

          // Handle components comprehensively using registry
          if (state.components) {
            for (const componentKey in state.components) {
              if (state.components.hasOwnProperty(componentKey)) {
                const component = state.components[componentKey];
                this.updateComponentDependenciesWithRegistry(component);
              }
            }
          }
        }
      }

      // Handle events[] array references (Migration)
      if (propertySet.events && Array.isArray(propertySet.events)) {
        this.updateEventsWithRegistry(propertySet.events, invalidIpNames);
      }

      mappedObject[CardMappings.Definition__c] = JSON.stringify(propertySet);
    }
  }

  /**
   * Update events array references (Migration)
   * Handles: events[].actionList[].stateAction references
   */
  private updateEventsWithRegistry(events: any[], invalidIpNames: Map<string, string>): void {
    for (const event of events) {
      if (!event.actionList || !Array.isArray(event.actionList)) {
        continue;
      }

      for (const action of event.actionList) {
        if (!action.stateAction) {
          continue;
        }

        const stateAction = action.stateAction;

        // 1-2. Handle message.value.bundle (DataRaptor) and message.value.ipMethod (Integration Procedure)
        this.processStateActionMessageWithRegistry(stateAction, invalidIpNames);

        // 3. Handle cardName (FlexCard - Flyout childCard)
        if (stateAction.cardName) {
          const originalCardName = stateAction.cardName;
          if (this.nameRegistry.hasFlexCardMapping(originalCardName)) {
            stateAction.cardName = this.nameRegistry.getFlexCardCleanedName(originalCardName);
          } else {
            Logger.logVerbose(
              `\n${this.messages.getMessage('componentMappingNotFound', ['Flexcard', originalCardName])}`
            );
            stateAction.cardName = this.cleanName(originalCardName);
          }
        }

        // 4. Handle flyoutLwc (FlexCard child card and custom LWC references)
        this.updateFlyoutLwcValue(stateAction);

        if (this.hasOmniscriptFlyoutDependency(stateAction)) {
          this.updateOsNameWithRegistry(stateAction, 'osName');
        }

        // 6. Handle omniType.Name (OmniScript)
        if (stateAction.omniType && stateAction.omniType.Name) {
          this.updateOmniTypeNameWithRegistry(stateAction.omniType);
        }
      }
    }
  }

  /**
   * Update dataSource (DataRaptor, Integration Procedures, Apex Remote) using registry
   */
  private updateDataSourceWithRegistry(dataSource: any, invalidIpNames: Map<string, string>, context: string): void {
    const type = dataSource.type;

    if (type === Constants.DataRaptorComponentName) {
      // Handle DataRaptor using registry
      const originalBundle = dataSource.value?.bundle || '';
      if (originalBundle && this.nameRegistry.hasDataMapperMapping(originalBundle)) {
        dataSource.value.bundle = this.nameRegistry.getDataMapperCleanedName(originalBundle);
      } else {
        Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', originalBundle])}`);
        dataSource.value.bundle = this.cleanName(originalBundle);
      }
    } else if (type === Constants.IntegrationProcedurePluralName) {
      // Handle Integration Procedures using registry
      const ipMethod: string = dataSource.value?.ipMethod || '';
      const hasRegistryMapping = this.nameRegistry.hasIntegrationProcedureMapping(ipMethod);
      if (hasRegistryMapping) {
        const cleanedIpName = this.nameRegistry.getIntegrationProcedureCleanedName(ipMethod);
        dataSource.value.ipMethod = cleanedIpName;
      } else {
        Logger.logVerbose(
          `\n${this.messages.getMessage('componentMappingNotFound', ['IntegrationProcedure', ipMethod])}`
        );
        const parts = ipMethod.split('_');
        const newKey = parts.map((p) => this.cleanName(p, true)).join('_');
        dataSource.value.ipMethod = newKey;
        if (parts.length > 2) {
          invalidIpNames.set(context, ipMethod);
        }
      }
    }
  }

  /**
   * Update OmniScript reference using registry
   */
  private updateOmniScriptReferenceWithRegistry(omniscriptRef: any): void {
    const originalType = omniscriptRef.type;
    const originalSubtype = omniscriptRef.subtype;
    const language = omniscriptRef.language || 'English';

    // Construct full OmniScript name to check registry
    const fullOmniScriptName = `${originalType}_${originalSubtype}_${language}`;

    if (this.nameRegistry.hasOmniScriptMapping(fullOmniScriptName)) {
      // Registry has mapping for this OmniScript - extract cleaned parts
      const cleanedFullName = this.nameRegistry.getCleanedName(fullOmniScriptName, 'OmniScript');
      const parts = cleanedFullName.split('_');

      if (parts.length >= 2) {
        omniscriptRef.type = parts[0];
        omniscriptRef.subtype = parts[1];
        // Language doesn't typically change, but update if provided
        if (parts.length >= 3) {
          omniscriptRef.language = parts[2];
        }
      }
    } else {
      // No registry mapping - use original fallback approach
      Logger.logVerbose(
        `\n${this.messages.getMessage('componentMappingNotFound', ['Omniscript', fullOmniScriptName])}`
      );
      omniscriptRef.type = this.cleanName(originalType);
      omniscriptRef.subtype = this.cleanName(originalSubtype);
    }
  }

  /**
   * Update component dependencies comprehensively
   */
  private updateComponentDependenciesWithRegistry(component: any): void {
    // Handle action elements with actionList (like assessment)
    if (component.element === 'action' && component.property && component.property.actionList) {
      for (const action of component.property.actionList) {
        if (action.stateAction) {
          // Handle message field (contains DataRaptor/IP references as JSON string)
          this.processStateActionMessageWithRegistry(action.stateAction);

          // Case 1: Direct OmniScript reference
          if (action.stateAction.type === Constants.OmniScriptComponentName && action.stateAction.omniType) {
            this.updateOmniTypeNameWithRegistry(action.stateAction.omniType);
          }
          // Case 2: Flyout OmniScript reference
          else if (this.hasOmniscriptFlyoutDependency(action.stateAction)) {
            this.updateOsNameWithRegistry(action.stateAction, 'osName');
          }
          // Case 3: Flyout with flyoutLwc (ChildCard or CustomLwc)
          else if (this.hasFlyoutLwc(action.stateAction)) {
            this.updateFlyoutLwcValue(action.stateAction);
          }
        }
      }
    }

    // Handle Custom LWC components - special case for FlexCard references
    this.updateCustomLwcWithRegistry(component);

    // Handle standard component actions (like assessment)
    if (component.actions && Array.isArray(component.actions)) {
      for (const action of component.actions) {
        if (action.stateAction && action.stateAction.omniType) {
          this.updateOmniTypeNameWithRegistry(action.stateAction.omniType);
        }
      }
    }

    // Handle direct stateAction on component property (existing logic)
    if (component.property && component.property.stateAction) {
      if (component.property.stateAction.omniType) {
        this.updateOmniTypeNameWithRegistry(component.property.stateAction.omniType);
      }
      if (this.hasOmniscriptFlyoutDependency(component.property.stateAction)) {
        this.updateOsNameWithRegistry(component.property.stateAction, 'osName');
      }
      // Handle Flyout with flyoutLwc (ChildCard or CustomLwc)
      if (this.hasFlyoutLwc(component.property.stateAction)) {
        this.updateFlyoutLwcValue(component.property.stateAction);
      }
    }

    // Handle childCardPreview elements (from old fixChildren method)
    if (component.element === Constants.ChildCardPreview && component.property) {
      if (component.property.cardName) {
        const originalCardName = component.property.cardName;
        if (this.nameRegistry.hasFlexCardMapping(originalCardName)) {
          component.property.cardName = this.nameRegistry.getFlexCardCleanedName(originalCardName);
        } else {
          Logger.logVerbose(
            `\n${this.messages.getMessage('componentMappingNotFound', ['Flexcard', originalCardName])}`
          );
          component.property.cardName = this.cleanName(originalCardName);
        }
      }
    }

    // Handle omni-flyout elements (missing from migration logic)
    if (component.element === Constants.OmniFlyout && component.property && component.property.flyoutOmniScript) {
      if (component.property.flyoutOmniScript.osName) {
        const osName = component.property.flyoutOmniScript.osName;
        if (typeof osName === 'string') {
          const parts = osName.split('/');

          if (parts.length >= 2) {
            // Construct full OmniScript name: Type_SubType_Language
            const originalOsRef = parts.join('_');

            if (this.nameRegistry.hasOmniScriptMapping(originalOsRef)) {
              // Registry has mapping - extract cleaned parts and convert back to / format
              const cleanedFullName = this.nameRegistry.getCleanedName(originalOsRef, 'OmniScript');
              const cleanedParts = cleanedFullName.split('_');

              if (cleanedParts.length >= 2) {
                component.property.flyoutOmniScript.osName = cleanedParts.join('/');
              }
            } else {
              // No registry mapping - use original fallback approach
              Logger.logVerbose(
                `\n${this.messages.getMessage('componentMappingNotFound', ['Omniscript', originalOsRef])}`
              );
              component.property.flyoutOmniScript.osName =
                parts.length >= 3
                  ? `${this.cleanName(parts[0])}/${this.cleanName(parts[1])}/${parts[2]}`
                  : parts.map((p) => this.cleanName(p)).join('/');
            }
          }
        }
      }
    }

    // Check child components recursively
    if (component.children && Array.isArray(component.children)) {
      for (const child of component.children) {
        this.updateComponentDependenciesWithRegistry(child);
      }
    }
  }

  /**
   * Update omniType.Name using registry (handles Type/SubType/Language format)
   */
  private updateOmniTypeNameWithRegistry(omniType: any): void {
    const originalName = omniType.Name || '';
    const parts = originalName.split('/');

    if (parts.length >= 3) {
      // Construct full OmniScript name: Type_SubType_Language
      const fullOmniScriptName = `${parts[0]}_${parts[1]}_${parts[2]}`;

      if (this.nameRegistry.hasOmniScriptMapping(fullOmniScriptName)) {
        // Registry has mapping - extract cleaned parts and convert back to / format
        const cleanedFullName = this.nameRegistry.getCleanedName(fullOmniScriptName, 'OmniScript');
        const cleanedParts = cleanedFullName.split('_');

        if (cleanedParts.length >= 3) {
          omniType.Name = cleanedParts.join('/');
        }
      } else {
        // No registry mapping - use original fallback approach
        Logger.logVerbose(
          `\n${this.messages.getMessage('componentMappingNotFound', ['Omniscript', fullOmniScriptName])}`
        );
        omniType.Name =
          parts.length >= 3
            ? `${this.cleanName(parts[0])}/${this.cleanName(parts[1])}/${parts[2]}`
            : parts.map((p) => this.cleanName(p)).join('/');
      }
    } else {
      // Fallback for unexpected format
      omniType.Name = parts.map((p) => this.cleanName(p)).join('/');
    }
  }

  /**
   * Update osName using registry (handles Type/SubType/Language format)
   */
  private updateOsNameWithRegistry(stateAction: any, fieldName: string): void {
    const originalOsName = stateAction[fieldName];
    const parts = originalOsName.split('/');

    if (parts.length >= 3) {
      // Construct full OmniScript name: Type_SubType_Language
      const fullOmniScriptName = `${parts[0]}_${parts[1]}_${parts[2]}`;

      if (this.nameRegistry.hasOmniScriptMapping(fullOmniScriptName)) {
        // Registry has mapping - extract cleaned parts and convert back to / format
        const cleanedFullName = this.nameRegistry.getCleanedName(fullOmniScriptName, 'OmniScript');
        const cleanedParts = cleanedFullName.split('_');

        if (cleanedParts.length >= 3) {
          stateAction[fieldName] = cleanedParts.join('/');
        }
      } else {
        // No registry mapping - use original fallback approach
        Logger.logVerbose(this.messages.getMessage('componentMappingNotFound', ['Omniscript', fullOmniScriptName]));
        stateAction[fieldName] =
          parts.length >= 3
            ? `${this.cleanName(parts[0])}/${this.cleanName(parts[1])}/${parts[2]}`
            : parts.map((p) => this.cleanName(p)).join('/');
      }
    } else {
      // Fallback for unexpected format
      stateAction[fieldName] = parts.map((p) => this.cleanName(p)).join('/');
    }
  }

  // ==================== Assessment Helper Methods ====================

  /**
   * Helper method to add OmniScript dependency and warnings during assessment
   * Handles osName in format "Type/SubType/Language" or "Type/SubType"
   * @param osName - OmniScript name in format "Type/SubType" or "Type/SubType/Language"
   * @param flexCardAssessmentInfo - Assessment info to update
   */
  private addOmniScriptDependency(osName: string, flexCardAssessmentInfo: FlexCardAssessmentInfo): void {
    if (!osName || typeof osName !== 'string') {
      return;
    }

    const parts = osName.split('/');
    if (parts.length < 2) {
      return;
    }

    const originalOsRef = parts.join('_');

    // Skip if already processed
    if (flexCardAssessmentInfo.dependenciesOS.includes(originalOsRef)) {
      return;
    }

    // Clean parts - preserve language (3rd part) as-is
    const cleanedParts =
      parts.length >= 3
        ? [this.cleanName(parts[0]), this.cleanName(parts[1]), parts[2]]
        : parts.map((p) => this.cleanName(p));
    const cleanedOsRef = cleanedParts.join('_');

    // Add to dependencies
    flexCardAssessmentInfo.dependenciesOS.push(originalOsRef);

    // Add warning if name will change
    if (originalOsRef !== cleanedOsRef) {
      flexCardAssessmentInfo.warnings.push(
        this.messages.getMessage('omniScriptNameChangeMessage', [originalOsRef, cleanedOsRef])
      );
      flexCardAssessmentInfo.migrationStatus = getUpdatedAssessmentStatus(
        flexCardAssessmentInfo.migrationStatus as
          | 'Warnings'
          | 'Needs manual intervention'
          | 'Ready for migration'
          | 'Failed',
        'Warnings'
      );
    }
  }

  /**
   * Helper method to add OmniScript dependency from type/subtype/language fields
   * @param type - OmniScript type
   * @param subtype - OmniScript subtype
   * @param language - OmniScript language (defaults to 'English')
   * @param flexCardAssessmentInfo - Assessment info to update
   */
  private addOmniScriptDependencyFromParts(
    type: string,
    subtype: string,
    language: string | undefined,
    flexCardAssessmentInfo: FlexCardAssessmentInfo
  ): void {
    if (!type || !subtype) {
      return;
    }

    const lang = language || 'English';
    const originalOsRef = `${type}_${subtype}_${lang}`;

    // Skip if already processed
    if (flexCardAssessmentInfo.dependenciesOS.includes(originalOsRef)) {
      return;
    }

    const cleanedOsRef = `${this.cleanName(type)}_${this.cleanName(subtype)}_${lang}`;

    // Add to dependencies
    flexCardAssessmentInfo.dependenciesOS.push(originalOsRef);

    // Add warning if name will change
    if (originalOsRef !== cleanedOsRef) {
      flexCardAssessmentInfo.warnings.push(
        this.messages.getMessage('omniScriptNameChangeMessage', [originalOsRef, cleanedOsRef])
      );
      flexCardAssessmentInfo.migrationStatus = getUpdatedAssessmentStatus(
        flexCardAssessmentInfo.migrationStatus as
          | 'Warnings'
          | 'Needs manual intervention'
          | 'Ready for migration'
          | 'Failed',
        'Warnings'
      );
    }
  }

  /**
   * Helper method to add DataRaptor dependency and warnings during assessment
   * @param bundle - DataRaptor bundle name
   * @param flexCardAssessmentInfo - Assessment info to update
   */
  private addDataRaptorDependency(bundle: string, flexCardAssessmentInfo: FlexCardAssessmentInfo): void {
    if (!bundle || flexCardAssessmentInfo.dependenciesDR.includes(bundle)) {
      return;
    }

    const cleanedBundle = this.cleanName(bundle);
    flexCardAssessmentInfo.dependenciesDR.push(bundle);

    if (bundle !== cleanedBundle) {
      flexCardAssessmentInfo.warnings.push(
        this.messages.getMessage('dataRaptorNameChangeMessage', [bundle, cleanedBundle])
      );
      flexCardAssessmentInfo.migrationStatus = getUpdatedAssessmentStatus(
        flexCardAssessmentInfo.migrationStatus as
          | 'Warnings'
          | 'Needs manual intervention'
          | 'Ready for migration'
          | 'Failed',
        'Warnings'
      );
    }
  }

  /**
   * Helper method to add Integration Procedure dependency and warnings during assessment
   * @param ipMethod - Integration Procedure method name (Type_SubType format)
   * @param flexCardAssessmentInfo - Assessment info to update
   */
  private addIntegrationProcedureDependency(ipMethod: string, flexCardAssessmentInfo: FlexCardAssessmentInfo): void {
    if (!ipMethod || flexCardAssessmentInfo.dependenciesIP.includes(ipMethod)) {
      return;
    }

    const parts = ipMethod.split('_');
    const cleanedParts = parts.map((p) => this.cleanName(p, true));
    const cleanedIpMethod = cleanedParts.join('_');

    flexCardAssessmentInfo.dependenciesIP.push(ipMethod);

    if (ipMethod !== cleanedIpMethod) {
      flexCardAssessmentInfo.warnings.push(
        this.messages.getMessage('integrationProcedureNameChangeMessage', [ipMethod, cleanedIpMethod])
      );
      flexCardAssessmentInfo.migrationStatus = getUpdatedAssessmentStatus(
        flexCardAssessmentInfo.migrationStatus as
          | 'Warnings'
          | 'Needs manual intervention'
          | 'Ready for migration'
          | 'Failed',
        'Warnings'
      );
    }

    // Add manual intervention warning if IP has more than 2 parts
    if (parts.length > 2) {
      flexCardAssessmentInfo.warnings.push(
        this.messages.getMessage('integrationProcedureManualUpdateMessage', [ipMethod])
      );
      flexCardAssessmentInfo.migrationStatus = getUpdatedAssessmentStatus(
        flexCardAssessmentInfo.migrationStatus as
          | 'Warnings'
          | 'Needs manual intervention'
          | 'Ready for migration'
          | 'Failed',
        'Needs manual intervention'
      );
    }
  }

  /**
   * Helper method to add FlexCard dependency and warnings during assessment
   * @param cardName - FlexCard name
   * @param flexCardAssessmentInfo - Assessment info to update
   */
  private addFlexCardDependency(cardName: string, flexCardAssessmentInfo: FlexCardAssessmentInfo): void {
    if (!cardName || flexCardAssessmentInfo.dependenciesFC.includes(cardName)) {
      return;
    }

    const cleanedCardName = this.cleanName(cardName);
    flexCardAssessmentInfo.dependenciesFC.push(cardName);

    if (cardName !== cleanedCardName) {
      flexCardAssessmentInfo.warnings.push(
        this.messages.getMessage('cardNameChangeMessage', [cardName, cleanedCardName])
      );
      flexCardAssessmentInfo.migrationStatus = getUpdatedAssessmentStatus(
        flexCardAssessmentInfo.migrationStatus as
          | 'Warnings'
          | 'Needs manual intervention'
          | 'Ready for migration'
          | 'Failed',
        'Warnings'
      );
    }
  }

  // ==================== End Assessment Helper Methods ====================

  private getCardFields(): string[] {
    return this.IS_STANDARD_DATA_MODEL
      ? Object.values(CardMappings).filter((value) => value !== '')
      : Object.keys(CardMappings);
  }

  private getFieldKey(fieldName: string): string {
    return this.IS_STANDARD_DATA_MODEL ? CardMappings[fieldName] : this.namespacePrefix + fieldName;
  }

  private getQueryNamespace(): string {
    return this.IS_STANDARD_DATA_MODEL ? '' : this.namespace;
  }

  private getCardObjectName(): string {
    return this.IS_STANDARD_DATA_MODEL ? CardMigrationTool.OMNIUICARD_NAME : CardMigrationTool.VLOCITYCARD_NAME;
  }

  /**
   * Check if a FlexCard has dependencies on Angular OmniScripts
   */
  private hasAngularOmniScriptDependencies(card: AnyJson): boolean {
    try {
      const definition = JSON.parse(card[this.getFieldKey('Definition__c')] || '{}');
      if (definition && definition.states) {
        for (const state of definition.states) {
          // Check direct OmniScript references in states
          if (state.omniscripts && Array.isArray(state.omniscripts)) {
            for (const os of state.omniscripts) {
              if (os.type && os.subtype) {
                const osRef = `${os.type}_${os.subtype}_${os.language || 'English'}`;
                if (this.nameRegistry.isAngularOmniScript(osRef)) {
                  return true;
                }
              }
            }
          }

          // Check OmniScript references in component actions
          if (state.components) {
            for (const componentKey in state.components) {
              if (state.components.hasOwnProperty(componentKey)) {
                const component = state.components[componentKey];
                if (this.componentHasAngularOmniScriptDependency(component)) {
                  return true;
                }
              }
            }
          }
        }
      }

      // Check OmniScript references in events[] array
      if (definition && definition.events && Array.isArray(definition.events)) {
        if (this.eventsHaveAngularOmniScriptDependency(definition.events)) {
          return true;
        }
      }
    } catch (err) {
      Logger.error(`Error checking Angular dependencies for card ${card['Name']}: ${err.message}`);
    }

    return false;
  }

  /**
   * Check if events array has Angular OmniScript dependencies
   */
  private eventsHaveAngularOmniScriptDependency(events: any[]): boolean {
    for (const event of events) {
      if (!event.actionList || !Array.isArray(event.actionList)) {
        continue;
      }

      for (const action of event.actionList) {
        if (!action.stateAction) {
          continue;
        }

        const stateAction = action.stateAction;

        // Check omniType.Name
        if (stateAction.omniType) {
          if (this.checkOmniTypeForAngular(stateAction.omniType)) {
            return true;
          }
        }

        if (this.hasOmniscriptFlyoutDependency(stateAction)) {
          if (this.checkOsNameForAngular(stateAction.osName)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private hasOmniscriptFlyoutDependency(stateAction: any): boolean {
    return (
      stateAction.type === Constants.Flyout &&
      stateAction.flyoutType === Constants.OmniScriptPluralName &&
      stateAction.osName
    );
  }

  private hasFlexCardFlyoutDependency(stateAction: any): boolean {
    return (
      stateAction.type === Constants.Flyout && stateAction.flyoutType === Constants.ChildCard && stateAction.flyoutLwc
    );
  }

  private hasCustomLwcFlyoutDependency(stateAction: any): boolean {
    return (
      stateAction.type === Constants.Flyout && stateAction.flyoutType === Constants.CustomLwc && stateAction.flyoutLwc
    );
  }

  private hasFlyoutLwc(stateAction: any): boolean {
    return stateAction.type === Constants.Flyout && stateAction.flyoutLwc;
  }

  /**
   * Recursively check if a component has Angular Omniscript dependencies
   */
  private componentHasAngularOmniScriptDependency(component: any): boolean {
    // Pattern 1: Handle action elements with actionList (like migration logic)
    if (component.element === 'action' && component.property && component.property.actionList) {
      for (const action of component.property.actionList) {
        if (action.stateAction) {
          // Case 1: Direct OmniScript reference with type check
          if (action.stateAction.type === Constants.OmniScriptComponentName && action.stateAction.omniType) {
            if (this.checkOmniTypeForAngular(action.stateAction.omniType)) {
              return true;
            }
          }
          // Case 1b: Direct OmniScript reference without type check (for test compatibility)
          else if (action.stateAction.omniType && !action.stateAction.type) {
            if (this.checkOmniTypeForAngular(action.stateAction.omniType)) {
              return true;
            }
          }
          // Case 2: Flyout OmniScript reference
          else if (this.hasOmniscriptFlyoutDependency(action.stateAction)) {
            if (this.checkOsNameForAngular(action.stateAction.osName)) {
              return true;
            }
          }
        }
      }
    }

    // Pattern 2: Handle standard component actions (like migration logic)
    if (component.actions && Array.isArray(component.actions)) {
      for (const action of component.actions) {
        if (action.stateAction && action.stateAction.omniType) {
          if (this.checkOmniTypeForAngular(action.stateAction.omniType)) {
            return true;
          }
        }
      }
    }

    // Pattern 3: Handle direct stateAction on component property (like migration logic)
    if (component.property && component.property.stateAction) {
      if (component.property.stateAction.omniType) {
        if (this.checkOmniTypeForAngular(component.property.stateAction.omniType)) {
          return true;
        }
      }
      if (this.hasOmniscriptFlyoutDependency(component.property.stateAction)) {
        if (this.checkOsNameForAngular(component.property.stateAction.osName)) {
          return true;
        }
      }
    }

    // Pattern 4: Handle omni-flyout elements (for test compatibility)
    if (component.element === Constants.OmniFlyout && component.property && component.property.flyoutOmniScript) {
      if (component.property.flyoutOmniScript.osName) {
        if (this.checkOsNameForAngular(component.property.flyoutOmniScript.osName)) {
          return true;
        }
      }
    }

    // Recursively check child components
    if (component.children && Array.isArray(component.children)) {
      for (const child of component.children) {
        if (this.componentHasAngularOmniScriptDependency(child)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if an omniType references an Angular OmniScript
   * Handles both string format and object with Name property
   */
  private checkOmniTypeForAngular(omniType: any): boolean {
    if (!omniType) {
      return false;
    }

    // Check if IsWebCompEnabled is explicitly false (Angular OmniScript)
    if (typeof omniType === 'object' && omniType.IsWebCompEnabled === false) {
      return true;
    }

    let omniTypeName: string;

    // Handle both string omniType and object with Name property
    if (typeof omniType === 'string') {
      omniTypeName = omniType;
    } else if (omniType.Name && typeof omniType.Name === 'string') {
      omniTypeName = omniType.Name;
    } else {
      return false;
    }

    const parts = omniTypeName.split('/');

    if (parts.length >= 3) {
      // Construct full OmniScript name: Type_SubType_Language
      const fullOmniScriptName = `${parts[0]}_${parts[1]}_${parts[2]}`;
      return this.nameRegistry.isAngularOmniScript(fullOmniScriptName);
    }

    return false;
  }

  /**
   * Check if an osName string references an Angular OmniScript
   * Handles Type/SubType/Language format in string
   */
  private checkOsNameForAngular(osName: string): boolean {
    if (!osName || typeof osName !== 'string') {
      return false;
    }

    const parts = osName.split('/');

    if (parts.length >= 3) {
      // Construct full OmniScript name: Type_SubType_Language
      const fullOmniScriptName = `${parts[0]}_${parts[1]}_${parts[2]}`;
      return this.nameRegistry.isAngularOmniScript(fullOmniScriptName);
    }

    return false;
  }

  /**
   * Ensures that the FlexCard Definition includes required Lightning Community targets
   * Adds "lightningCommunity__Page" and "lightningCommunity__Default" if missing
   * This is needed as vlocity wrapper can have flexcard which is unpublished but omniwapper needs published card
   */
  private ensureCommunityTargets(mappedObject: any, isCardActive: boolean): void {
    if (!isCardActive) {
      return;
    }

    const definition = JSON.parse(mappedObject[CardMappings.Definition__c] || '{}');

    if (!definition || !definition.xmlObject) {
      return;
    }

    // Initialize targets structure if it doesn't exist
    if (!definition.xmlObject.targets) {
      definition.xmlObject.targets = { target: [] };
    }

    // Ensure target is an array
    if (!Array.isArray(definition.xmlObject.targets.target)) {
      definition.xmlObject.targets.target = [];
    }

    const requiredTargets = [
      'lightning__RecordPage',
      'lightning__AppPage',
      'lightning__HomePage',
      'lightningCommunity__Page',
      'lightningCommunity__Default',
    ];
    const currentTargets = definition.xmlObject.targets.target;

    // Add missing community targets
    for (const requiredTarget of requiredTargets) {
      if (!currentTargets.includes(requiredTarget)) {
        currentTargets.push(requiredTarget);
      }
    }

    Logger.logVerbose(`Targets processed`);

    // Save the updated definition back to the mappedObject
    mappedObject[CardMappings.Definition__c] = JSON.stringify(definition);
  }

  /**
   * Prioritizes FlexCards by name characteristics:
   * - Clean names (alphanumeric only) are processed first
   * - Names with special characters are processed after
   * This avoids naming conflicts during migration when special characters are cleaned
   */
  private prioritizeFlexCardsWithoutSpecialCharacters(flexCards: AnyJson[]): AnyJson[] {
    const nameField = this.getFieldKey('Name');
    return prioritizeCleanNamesFirst(flexCards, nameField);
  }
}
