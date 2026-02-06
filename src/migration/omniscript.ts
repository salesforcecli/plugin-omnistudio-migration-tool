/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';

import OmniScriptMappings from '../mappings/OmniScript';
import ElementMappings from '../mappings/Element';
import OmniScriptDefinitionMappings from '../mappings/OmniScriptDefinition';
import {
  DataRaptorAssessmentInfo,
  DebugTimer,
  FlexCardAssessmentInfo,
  nameLocation,
  OmniscriptNameMapping,
  QueryTools,
  SortDirection,
} from '../utils';
import { BaseMigrationTool, ComponentType } from './base';
import {
  InvalidEntityTypeError,
  MigrationResult,
  MigrationStorage,
  MigrationTool,
  OmniScriptStandardKey,
  OmniScriptStorage,
  TransformData,
  UploadRecordResult,
} from './interfaces';
import { ObjectMapping } from './interfaces';
import { NetUtils, RequestMethod } from '../utils/net';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import { OSAssessmentInfo, OmniAssessmentInfo, IPAssessmentInfo } from '../../src/utils';
import {
  getAllFunctionMetadata,
  getReplacedString,
  populateRegexForFunctionMetadata,
} from '../utils/formula/FormulaUtil';
import { StringVal } from '../utils/StringValue/stringval';
import { Logger } from '../utils/logger';
import { createProgressBar } from './base';
import { StorageUtil } from '../utils/storageUtil';
import { isStandardDataModel, isStandardDataModelWithMetadataAPIEnabled } from '../utils/dataModelService';
import { prioritizeCleanNamesFirst } from '../utils/recordPrioritization';
import { Constants } from '../utils/constants/stringContants';

export class OmniScriptMigrationTool extends BaseMigrationTool implements MigrationTool {
  private readonly exportType: OmniScriptExportType;
  private readonly allVersions: boolean;
  private IS_STANDARD_DATA_MODEL: boolean = isStandardDataModel();

  // Reserved keys that should not be used for storing output
  private readonly reservedKeys = new Set<string>(['Request', 'Response']);

  // Tags to validate in PropertySet for reserved key usage
  private readonly tagsToValidate = new Set<string>(['additionalOutput']);

  // constants
  private readonly OMNISCRIPT = 'OmniScript';

  // Source Custom Object Names
  static readonly OMNISCRIPT_NAME = 'OmniScript__c';

  static readonly ELEMENT_NAME = 'Element__c';
  static readonly OMNISCRIPTDEFINITION_NAME = 'OmniScriptDefinition__c';

  // Target Standard Objects Name
  static readonly OMNIPROCESS_NAME = 'OmniProcess';
  static readonly OMNIPROCESSELEMENT_NAME = 'OmniProcessElement';
  static readonly OMNIPROCESSCOMPILATION_NAME = 'OmniProcessCompilation';

  constructor(
    exportType: OmniScriptExportType,
    namespace: string,
    connection: Connection,
    logger: Logger,
    messages: Messages<string>,
    ux: Ux,
    allVersions: boolean
  ) {
    super(namespace, connection, logger, messages, ux);
    this.exportType = exportType;
    this.allVersions = allVersions;
  }

  getName(
    singular: boolean = false
  ): 'Integration Procedures' | 'Integration Procedure' | 'Omniscripts' | 'Omniscript' {
    if (this.exportType === OmniScriptExportType.IP) {
      return singular ? 'Integration Procedure' : 'Integration Procedures';
    } else if (this.exportType === OmniScriptExportType.OS) {
      return singular ? 'Omniscript' : 'Omniscripts';
    }
  }

  getRecordName(record: string) {
    return (
      record[this.getFieldKey('Type__c')] +
      '_' +
      record[this.getFieldKey('SubType__c')] +
      (record[this.getFieldKey('Language__c')] ? '_' + record[this.getFieldKey('Language__c')] : '') +
      '_' +
      record[this.getFieldKey('Version__c')]
    );
  }

  getMappings(): ObjectMapping[] {
    return [
      {
        source: OmniScriptMigrationTool.OMNISCRIPT_NAME,
        target: OmniScriptMigrationTool.OMNIPROCESS_NAME,
      },
      {
        source: OmniScriptMigrationTool.ELEMENT_NAME,
        target: OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME,
      },
      {
        source: OmniScriptMigrationTool.OMNISCRIPTDEFINITION_NAME,
        target: OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME,
      },
    ];
  }

  async truncate(): Promise<void> {
    // Truncation is needed when we migrate from custom to standard data model, when on custom data model, no truncation is required
    if (this.IS_STANDARD_DATA_MODEL) {
      Logger.logVerbose(this.messages.getMessage('skippingTruncation'));
      return;
    }

    const objectName = OmniScriptMigrationTool.OMNIPROCESS_NAME;
    const allIds = await this.deactivateRecord(objectName);
    await this.truncateElements(objectName, allIds.os.parents);
    await this.truncateElements(objectName, allIds.os.childs);
    await this.truncateElements(objectName, allIds.ip.parents);
    await this.truncateElements(objectName, allIds.ip.childs);
  }

  async truncateElements(objectName: string, ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) {
      return;
    }

    let success: boolean = await NetUtils.delete(this.connection, ids);
    if (!success) {
      throw new Error(this.messages.getMessage('couldNotTruncateOmnniProcess', [this.getName(), this.getName()]));
    }
  }

  async deactivateRecord(
    objectName: string
  ): Promise<{ os: { parents: string[]; childs: string[] }; ip: { parents: string[]; childs: string[] } }> {
    DebugTimer.getInstance().lap('Truncating ' + objectName + ' (' + this.exportType + ')');

    const filters = new Map<string, any>();
    const sorting = [
      { field: 'IsIntegrationProcedure', direction: SortDirection.ASC },
      { field: 'IsOmniScriptEmbeddable', direction: SortDirection.ASC },
    ];

    // Filter if only IP / OS
    if (this.exportType === OmniScriptExportType.IP) {
      filters.set('IsIntegrationProcedure', true);
    } else if (this.exportType === OmniScriptExportType.OS) {
      filters.set('IsIntegrationProcedure', false);
    }

    // const ids: string[] = await QueryTools.queryIds(this.connection, objectName, filters);
    const rows = await QueryTools.query(
      this.connection,
      objectName,
      ['Id', 'IsIntegrationProcedure', 'IsOmniScriptEmbeddable'],
      filters,
      sorting
    );
    if (rows.length === 0) {
      return { os: { parents: [], childs: [] }, ip: { parents: [], childs: [] } };
    }

    // We need to update one item at time. Otherwise, we'll have an UNKNOWN_ERROR
    for (let row of rows) {
      const id = row['Id'];

      await NetUtils.request(
        this.connection,
        `sobjects/${OmniScriptMigrationTool.OMNIPROCESS_NAME}/${id}`,
        {
          IsActive: false,
        },
        RequestMethod.PATCH
      );
    }

    // Sleep 5 seconds, let's wait for all row locks to be released. While this takes less than a second, there has been
    // times where it take a bit more.
    await this.sleep();

    return {
      os: {
        parents: rows
          .filter((row) => row.IsIntegrationProcedure === false && row.IsOmniScriptEmbeddable === false)
          .map((row) => row.Id),
        childs: rows
          .filter((row) => row.IsIntegrationProcedure === false && row.IsOmniScriptEmbeddable === true)
          .map((row) => row.Id),
      },
      ip: {
        parents: rows
          .filter((row) => row.IsIntegrationProcedure === true && row.IsOmniScriptEmbeddable === false)
          .map((row) => row.Id),
        childs: rows
          .filter((row) => row.IsIntegrationProcedure === true && row.IsOmniScriptEmbeddable === true)
          .map((row) => row.Id),
      },
    };
  }

  public async assess(
    dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[],
    flexCardAssessmentInfos: FlexCardAssessmentInfo[]
  ): Promise<OmniAssessmentInfo> {
    try {
      const exportComponentType = this.getName() as ComponentType;
      const omniscripts = await this.getAllOmniScripts();

      if (isStandardDataModelWithMetadataAPIEnabled()) {
        // For the Standard Data Model Orgs, we only need to prepare the storage
        return this.handleAssessmentForStdDataModelOrgsWithMetadataAPIEnabled(omniscripts);
      }

      Logger.log(this.messages.getMessage('startingOmniScriptAssessment', [exportComponentType]));
      Logger.log(this.messages.getMessage('foundOmniScriptsToAssess', [omniscripts.length, exportComponentType]));

      const omniAssessmentInfos = await this.processOmniComponents(
        omniscripts,
        dataRaptorAssessmentInfos,
        flexCardAssessmentInfos
      );

      await this.updateStorageForOmniscriptAssessment(omniAssessmentInfos?.osAssessmentInfos);

      return omniAssessmentInfos;
    } catch (err) {
      if (err instanceof InvalidEntityTypeError) {
        throw err;
      }
      Logger.error(this.messages.getMessage('errorDuringOmniScriptAssessment'), err);
    }
  }

  private handleAssessmentForStdDataModelOrgsWithMetadataAPIEnabled(omniscripts: AnyJson[]): OmniAssessmentInfo {
    const assessmentInfos: OmniAssessmentInfo = {
      osAssessmentInfos: [],
      ipAssessmentInfos: [],
    };

    if (this.exportType === OmniScriptExportType.IP) {
      return assessmentInfos;
    }

    Logger.logVerbose(this.messages.getMessage('preparingStorageForMetadataEnabledOrg', [Constants.Omniscript]));
    let storage: MigrationStorage = StorageUtil.getOmnistudioAssessmentStorage();
    Logger.logVerbose(this.messages.getMessage('updatingStorageForOmniscipt', ['Assessment']));

    this.prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(storage, omniscripts);
    StorageUtil.printAssessmentStorage();
    return assessmentInfos;
  }

  public async processOmniComponents(
    omniscripts: AnyJson[],
    dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[],
    flexCardAssessmentInfos: FlexCardAssessmentInfo[]
  ): Promise<OmniAssessmentInfo> {
    const osAssessmentInfos: OSAssessmentInfo[] = [];
    const ipAssessmentInfos: IPAssessmentInfo[] = [];

    // Create a set to store existing OmniScript names and also extract DataRaptor and FlexCard names
    // Map to track cleanedName (without version) -> originalName (without version) for duplicate detection
    const duplicateOmniscriptNames: Map<string, string> = new Map<string, string>();
    const existingOmniscriptNames = new Set<string>();
    const existingDataRaptorNames = new Set(dataRaptorAssessmentInfos.map((info) => info.name));
    const existingFlexCardNames = new Set(flexCardAssessmentInfos.map((info) => info.name));

    const progressBarType: ComponentType = this.getName() as ComponentType;
    const progressBar = createProgressBar('Assessing', progressBarType);
    let progressCounter = 0;
    progressBar.start(omniscripts.length, progressCounter);
    // First, collect all OmniScript names from the omniscripts array
    // Now process each OmniScript and its elements
    for (const omniscript of omniscripts) {
      Logger.info(this.messages.getMessage('processingOmniScript', [omniscript['Name']]));
      let omniAssessmentInfo: OSAssessmentInfo;
      try {
        omniAssessmentInfo = await this.processOmniScript(
          omniscript,
          existingOmniscriptNames,
          existingDataRaptorNames,
          existingFlexCardNames,
          duplicateOmniscriptNames
        );
      } catch (e) {
        const omniProcessType = omniscript[this.getFieldKey('IsProcedure__c')] ? 'Integration Procedure' : 'OmniScript';
        if (omniProcessType === 'OmniScript') {
          osAssessmentInfos.push({
            name: omniscript['Name'],
            id: omniscript['Id'],
            oldName: omniscript['Name'],
            dependenciesIP: [],
            dependenciesDR: [],
            dependenciesOS: [],
            dependenciesRemoteAction: [],
            dependenciesLWC: [],
            infos: [],
            warnings: [],
            errors: [this.messages.getMessage('unexpectedError')],
            migrationStatus: 'Failed',
            type: 'OmniScript',
            missingIP: [],
            missingDR: [],
            missingOS: [],
          });
        } else {
          ipAssessmentInfos.push({
            name: omniscript['Name'],
            id: omniscript['Id'],
            oldName: omniscript['Name'],
            dependenciesIP: [],
            dependenciesDR: [],
            dependenciesOS: [],
            dependenciesRemoteAction: [],
            infos: [],
            warnings: [],
            errors: [this.messages.getMessage('unexpectedError')],
            path: '',
            migrationStatus: 'Failed',
          });
        }
        const error = e as Error;
        Logger.error('Error processing omniscripts', error);
        continue;
      }
      if (omniAssessmentInfo.type === 'OmniScript') {
        const type = omniscript[this.getFieldKey('IsLwcEnabled__c')] ? 'LWC' : 'Angular';
        const osAssessmentInfo: OSAssessmentInfo = {
          name: omniAssessmentInfo.name,
          type: type,
          oldName: omniAssessmentInfo.oldName,
          id: omniscript['Id'],
          dependenciesIP: omniAssessmentInfo.dependenciesIP,
          missingIP: [],
          dependenciesDR: omniAssessmentInfo.dependenciesDR,
          missingDR: [],
          dependenciesOS: omniAssessmentInfo.dependenciesOS,
          missingOS: omniAssessmentInfo.missingOS,
          dependenciesRemoteAction: omniAssessmentInfo.dependenciesRemoteAction,
          dependenciesLWC: omniAssessmentInfo.dependenciesLWC,
          infos: [],
          warnings: omniAssessmentInfo.warnings,
          errors: [],
          migrationStatus: omniAssessmentInfo.migrationStatus,
          nameMapping: omniAssessmentInfo.nameMapping,
        };
        osAssessmentInfos.push(osAssessmentInfo);
      } else {
        const ipAssessmentInfo: IPAssessmentInfo = {
          name: omniAssessmentInfo.name,
          id: omniscript['Id'],
          oldName: omniAssessmentInfo.oldName,
          dependenciesIP: omniAssessmentInfo.dependenciesIP,
          dependenciesDR: omniAssessmentInfo.dependenciesDR,
          dependenciesOS: omniAssessmentInfo.dependenciesOS,
          dependenciesRemoteAction: omniAssessmentInfo.dependenciesRemoteAction,
          infos: [],
          warnings: omniAssessmentInfo.warnings,
          migrationStatus: omniAssessmentInfo.migrationStatus,
          errors: [],
          path: '',
        };
        ipAssessmentInfos.push(ipAssessmentInfo);
      }
      progressBar.update(++progressCounter);
    }
    progressBar.stop();

    const omniAssessmentInfo: OmniAssessmentInfo = {
      osAssessmentInfos: osAssessmentInfos,
      ipAssessmentInfos: ipAssessmentInfos,
    };

    return omniAssessmentInfo;
  }

  private async processOmniScript(
    omniscript: AnyJson,
    existingOmniscriptNames: Set<string>,
    existingDataRaptorNames: Set<string>,
    existingFlexCardNames: Set<string>,
    duplicateOmniscriptNames: Map<string, string>
  ): Promise<OSAssessmentInfo> {
    const elements = await this.getAllElementsForOmniScript(omniscript['Id']);

    const dependencyIP: nameLocation[] = [];
    const missingIP: string[] = [];
    const dependencyDR: nameLocation[] = [];
    const missingDR: string[] = [];
    const dependencyOS: nameLocation[] = [];
    const missingOS: string[] = [];
    const dependenciesRA: nameLocation[] = [];
    const dependenciesLWC: nameLocation[] = [];

    //const missingRA: string[] = [];

    // Check for duplicate element names within the same OmniScript
    const elementNames = new Set<string>();
    const duplicateElementNames = new Set<string>();

    // Track reserved keys found in PropertySet
    const foundReservedKeys = new Set<string>();

    for (const elem of elements) {
      const elemName = elem['Name'];
      if (elementNames.has(elemName)) {
        duplicateElementNames.add(elemName);
      } else {
        elementNames.add(elemName);
      }
    }

    for (const elem of elements) {
      const type = elem[this.getFieldKey('Type__c')];
      const elemName = `${elem['Name']}`;
      const propertySet = JSON.parse(elem[this.getFieldKey('PropertySet__c')] || '{}');

      // Collect reserved keys from PropertySet
      this.collectReservedKeys(propertySet, foundReservedKeys);

      // Check for OmniScript dependencies
      if (type === 'OmniScript') {
        const nameVal = `${elemName}`;
        const type = propertySet['Type'];
        const subtype = propertySet['Sub Type'];
        const language = propertySet['Language'];
        const osName = type + '_' + subtype + '_' + language;
        dependencyOS.push({
          name: osName,
          location: nameVal,
        });
        if (!existingOmniscriptNames.has(nameVal)) {
          missingOS.push(nameVal);
        }
      }

      // Check for Integration Procedure Action dependencies
      if (type === Constants.IntegrationProcedureAction) {
        const nameVal = `${elemName}`;
        dependencyIP.push({ name: propertySet['integrationProcedureKey'], location: nameVal });
        if (!existingOmniscriptNames.has(nameVal) && !existingFlexCardNames.has(nameVal)) {
          missingIP.push(nameVal);
        }
      }

      // Check for DataRaptor dependencies
      if (
        [
          Constants.DataRaptorExtractAction,
          Constants.DataRaptorTurboAction,
          Constants.DataRaptorTransformAction,
          Constants.DataRaptorPostAction,
        ].includes(type)
      ) {
        const nameVal = `${elemName}`;
        dependencyDR.push({ name: propertySet['bundle'], location: nameVal });
        if (!existingOmniscriptNames.has(nameVal) && !existingDataRaptorNames.has(nameVal)) {
          missingDR.push(nameVal);
        }
      }

      // Check for DataRaptor transform bundle dependencies in various action types
      // These bundles are used for pre/post transformation in HTTP, Remote, Decision Matrix, Expression Set, PDF, and Step actions
      this.collectTransformBundleDependencies(propertySet, elemName, dependencyDR, existingDataRaptorNames, missingDR);

      // Check for DocuSign Envelope Action transform bundle dependencies
      if (type === Constants.DocuSignEnvelopeAction) {
        this.collectDocuSignBundleDependencies(propertySet, elemName, dependencyDR, existingDataRaptorNames, missingDR);
      }

      // Check for DocuSign Signature Action transform bundle dependencies
      if (type === Constants.DocuSignSignatureAction) {
        this.collectDocuSignSignatureBundleDependencies(
          propertySet,
          elemName,
          dependencyDR,
          existingDataRaptorNames,
          missingDR
        );
      }

      if (type === Constants.RemoteAction) {
        const nameVal = `${elemName}`;
        const className = propertySet['remoteClass'];
        const methodName = propertySet['remoteMethod'];
        if (className && methodName) dependenciesRA.push({ name: className + '.' + methodName, location: nameVal });
      }
      // To handle radio , multiselect
      if (propertySet['optionSource'] && propertySet['optionSource']['type'] === 'Custom') {
        const nameVal = `${elemName}`;
        dependenciesRA.push({ name: propertySet['optionSource']['source'], location: nameVal });
      }

      if (type === Constants.CustomLightningWebComponent) {
        const nameVal = `${elemName}`;
        const lwcName = propertySet['lwcName'];
        dependenciesLWC.push({ name: lwcName, location: nameVal });
      }
      // To fetch custom overrides
      if (propertySet['lwcComponentOverride']) {
        const nameVal = `${elemName}`;
        const lwcName = propertySet['lwcComponentOverride'];
        dependenciesLWC.push({ name: lwcName, location: nameVal });
      }
    }

    // Collect persistent component bundle dependencies from OmniProcess PropertySetConfig
    this.collectPersistentComponentBundleDependencies(omniscript, dependencyDR, existingDataRaptorNames, missingDR);

    const omniProcessType = omniscript[this.getFieldKey('IsProcedure__c')] ? 'Integration Procedure' : 'OmniScript';

    const existingType = omniscript[this.getFieldKey('Type__c')];
    const existingTypeVal = new StringVal(existingType, 'type');
    const existingSubType = omniscript[this.getFieldKey('SubType__c')];
    const existingSubTypeVal = new StringVal(existingSubType, 'sub type');
    const omniScriptName = omniscript[this.getFieldKey('Name')];
    const existingOmniScriptNameVal = new StringVal(omniScriptName, 'name');
    let assessmentStatus: 'Ready for migration' | 'Warnings' | 'Needs manual intervention' = 'Ready for migration';

    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for missing mandatory fields for Integration Procedures
    if (omniProcessType === 'Integration Procedure') {
      if (!existingType || existingType.trim() === '') {
        errors.push(this.messages.getMessage('missingMandatoryField', ['Type', 'Integration Procedure']));
        assessmentStatus = 'Needs manual intervention';
      }
      if (!existingSubType || existingSubType.trim() === '') {
        errors.push(this.messages.getMessage('missingMandatoryField', ['SubType', 'Integration Procedure']));
        assessmentStatus = 'Needs manual intervention';
      }
    }

    // Check for Angular OmniScript dependencies
    for (const osDep of dependencyOS) {
      if (this.nameRegistry.isAngularOmniScript(osDep.name)) {
        warnings.push(this.messages.getMessage('angularOmniScriptDependencyWarning', [osDep.location, osDep.name]));
        assessmentStatus = 'Needs manual intervention';
      }
    }

    // This we need broken down, better create an object and propagate it
    // Here break it and then combine it
    const newType = existingTypeVal.cleanName();
    const newSubType = existingSubTypeVal.cleanName();
    const newLanguage = omniscript[this.getFieldKey('Language__c')]
      ? `${omniscript[this.getFieldKey('Language__c')]}`
      : '';

    const recordNameWithoutVersion =
      `${newType}_` +
      `${newSubType}` +
      (omniscript[this.getFieldKey('Language__c')] ? `_${omniscript[this.getFieldKey('Language__c')]}` : '');

    const recordName =
      `${newType}_` +
      `${newSubType}` +
      (omniscript[this.getFieldKey('Language__c')] ? `_${omniscript[this.getFieldKey('Language__c')]}` : '') +
      `_${omniscript[this.getFieldKey('Version__c')]}`;

    const oldName =
      `${existingTypeVal.val}_` +
      `${existingSubTypeVal.val}` +
      (omniscript[this.getFieldKey('Language__c')] ? `_${omniscript[this.getFieldKey('Language__c')]}` : '') +
      `_${omniscript[this.getFieldKey('Version__c')]}`;

    if (!existingTypeVal.isNameCleaned()) {
      if (omniProcessType === 'Integration Procedure' && (!newType || newType.trim() === '')) {
        warnings.push(this.messages.getMessage('integrationProcedureTypeEmptyAfterCleaning', [existingTypeVal.val]));
        assessmentStatus = 'Needs manual intervention';
      } else {
        warnings.push(
          this.messages.getMessage('changeMessage', [
            omniProcessType,
            existingTypeVal.type,
            existingTypeVal.val,
            existingTypeVal.cleanName(),
          ])
        );
        assessmentStatus = 'Warnings';
      }
    }
    if (!existingSubTypeVal.isNameCleaned()) {
      if (omniProcessType === 'Integration Procedure' && (!newSubType || newSubType.trim() === '')) {
        warnings.push(
          this.messages.getMessage('integrationProcedureSubtypeEmptyAfterCleaning', [existingSubTypeVal.val])
        );
        assessmentStatus = 'Needs manual intervention';
      } else {
        warnings.push(
          this.messages.getMessage('changeMessage', [
            omniProcessType,
            existingSubTypeVal.type,
            existingSubTypeVal.val,
            existingSubTypeVal.cleanName(),
          ])
        );
        assessmentStatus = 'Warnings';
      }
    }

    if (!existingOmniScriptNameVal.isNameCleaned()) {
      warnings.push(
        this.messages.getMessage('changeMessage', [
          omniProcessType,
          existingOmniScriptNameVal.type,
          existingOmniScriptNameVal.val,
          existingOmniScriptNameVal.cleanName(),
        ])
      );
      assessmentStatus = 'Warnings';
    }
    // Duplicate check logic using Map to track originalName -> cleanedName
    // This allows us to detect both exact duplicates and name cleaning conflicts
    const nameToCheck = this.allVersions ? recordName : recordNameWithoutVersion;

    // Get the original name parts (before cleaning)
    const originalType = omniscript[this.getFieldKey('Type__c')];
    const originalSubType = omniscript[this.getFieldKey('SubType__c')];
    const originalLanguage = omniscript[this.getFieldKey('Language__c')] || '';
    const originalNameWithoutVersion = originalLanguage
      ? `${originalType}_${originalSubType}_${originalLanguage}`
      : `${originalType}_${originalSubType}`;

    // Check for exact duplicate (same name + version)
    if (existingOmniscriptNames.has(nameToCheck)) {
      warnings.push(this.messages.getMessage('duplicatedName', [recordName]));
      assessmentStatus = 'Needs manual intervention';
    }
    // Check for naming conflict: different original names cleaning to same name
    else if (this.allVersions && duplicateOmniscriptNames.has(recordNameWithoutVersion)) {
      const existingOriginalName = duplicateOmniscriptNames.get(recordNameWithoutVersion);
      // Only flag if the original names are different (indicates a naming conflict)
      if (existingOriginalName !== originalNameWithoutVersion) {
        warnings.push(
          this.messages.getMessage('lowerVersionDuplicateOmniscriptName', [
            this.getName(true),
            recordName,
            this.getName(true),
          ])
        );
        assessmentStatus = 'Needs manual intervention';
      }
    }

    // Add to tracking structures
    existingOmniscriptNames.add(nameToCheck);
    if (this.allVersions && !duplicateOmniscriptNames.has(recordNameWithoutVersion)) {
      duplicateOmniscriptNames.set(recordNameWithoutVersion, originalNameWithoutVersion);
    }

    // Add warning for duplicate element names within the same OmniScript
    if (duplicateElementNames.size > 0) {
      const duplicateNamesList = Array.from(duplicateElementNames).join(', ');
      warnings.unshift(this.messages.getMessage('invalidOrRepeatingOmniscriptElementNames', [duplicateNamesList]));
      assessmentStatus = 'Needs manual intervention';
    }

    // Add warning for reserved keys found in PropertySet
    if (foundReservedKeys.size > 0) {
      const reservedKeysList = Array.from(foundReservedKeys).join(', ');
      warnings.unshift(this.messages.getMessage('reservedKeysFoundInPropertySet', [reservedKeysList]));
      assessmentStatus = 'Needs manual intervention';
    }

    if (omniProcessType === this.OMNISCRIPT) {
      const type = omniscript[this.getFieldKey('IsLwcEnabled__c')] ? 'LWC' : 'Angular';
      if (type === 'Angular') {
        warnings.unshift(this.messages.getMessage('angularOSWarning'));
        assessmentStatus = 'Needs manual intervention';
      }
    }

    // Deduplicate all dependency arrays to ensure no duplicates
    // For Remote Actions and LWCs, deduplicate by name property
    const uniqueRA = Array.from(new Map(dependenciesRA.map((item) => [item.name, item])).values());
    const uniqueLWC = Array.from(new Map(dependenciesLWC.map((item) => [item.name, item])).values());
    const uniqueIP = Array.from(new Map(dependencyIP.map((item) => [item.name, item])).values());
    const uniqueDR = Array.from(new Map(dependencyDR.map((item) => [item.name, item])).values());
    const uniqueOS = Array.from(new Map(dependencyOS.map((item) => [item.name, item])).values());

    // Deduplicate missing dependency arrays (simple string arrays)
    const uniqueMissingDR = [...new Set(missingDR)];
    const uniqueMissingIP = [...new Set(missingIP)];
    const uniqueMissingOS = [...new Set(missingOS)];

    const result: OSAssessmentInfo = {
      name: recordName,
      id: omniscript['Id'],
      oldName: oldName,
      dependenciesIP: uniqueIP,
      dependenciesDR: uniqueDR,
      dependenciesOS: uniqueOS,
      dependenciesRemoteAction: uniqueRA,
      dependenciesLWC: uniqueLWC,
      infos: [],
      warnings: warnings,
      errors: [],
      migrationStatus: assessmentStatus,
      type: omniProcessType,
      missingDR: uniqueMissingDR,
      missingIP: uniqueMissingIP,
      missingOS: uniqueMissingOS,
    };

    if (omniProcessType === this.OMNISCRIPT) {
      const nameMapping: OmniscriptNameMapping = {
        oldType: existingType,
        oldSubtype: existingSubType,
        oldLanguage: omniscript[this.getFieldKey('Language__c')],
        newType: newType,
        newSubType: newSubType,
        newLanguage: newLanguage,
      };
      result.nameMapping = nameMapping;
    }

    return result;
  }

  private prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(
    storage: MigrationStorage,
    omniscripts: AnyJson[]
  ): void {
    for (const omniscript of omniscripts) {
      if (!omniscript[this.getFieldKey('IsProcedure__c')]) {
        const originalType = omniscript[this.getFieldKey('Type__c')];
        const originalSubtype = omniscript[this.getFieldKey('SubType__c')];
        const originalLanguage = omniscript[this.getFieldKey('Language__c')];

        let value: OmniScriptStorage = {
          type: originalType,
          subtype: originalSubtype,
          language: originalLanguage,
          isDuplicate: false,
          originalType: originalType,
          originalSubtype: originalSubtype,
          originalLanguage: originalLanguage,
          migrationSuccess: true, // When metadata API is enabled, assume migration is successful
        };

        this.addKeyToStorage(originalType, originalSubtype, originalLanguage, storage, value);
      }
    }
  }

  private updateStorageForOmniscriptAssessment(osAssessmentInfo: OSAssessmentInfo[]): void {
    if (osAssessmentInfo === undefined || osAssessmentInfo === null) {
      Logger.error(this.messages.getMessage('missingInfo'));
      return;
    }

    let storage: MigrationStorage = StorageUtil.getOmnistudioAssessmentStorage();
    Logger.logVerbose(this.messages.getMessage('updatingStorageForOmniscipt', ['Assessment']));

    for (let currentOsRecordInfo of osAssessmentInfo) {
      try {
        let nameMapping = currentOsRecordInfo.nameMapping as OmniscriptNameMapping;

        if (nameMapping === undefined) {
          Logger.logVerbose(this.messages.getMessage('nameMappingUndefined'));
          continue;
        }

        const originalType: string = nameMapping.oldType;
        const originalSubtype: string = nameMapping.oldSubtype;
        const originalLanguage: string = nameMapping.oldLanguage;

        let value: OmniScriptStorage = {
          type: nameMapping.newType,
          subtype: nameMapping.newSubType,
          language: nameMapping.newLanguage,
          isDuplicate: false,
          originalType: originalType,
          originalSubtype: originalSubtype,
          originalLanguage: originalLanguage,
        };

        if (
          (currentOsRecordInfo.errors && currentOsRecordInfo.errors.length > 0) ||
          currentOsRecordInfo.migrationStatus === 'Needs manual intervention'
        ) {
          value.error = [...(currentOsRecordInfo.errors || []), ...(currentOsRecordInfo.warnings || [])];
          value.migrationSuccess = false;
        } else {
          value.migrationSuccess = true;
        }

        this.addKeyToStorage(originalType, originalSubtype, originalLanguage, storage, value);
      } catch (error) {
        Logger.error(error);
      }
    }

    StorageUtil.printAssessmentStorage();
  }

  private addKeyToStorage(
    originalType: string,
    originalSubtype: string,
    originalLanguage: string,
    storage: MigrationStorage,
    value: OmniScriptStorage
  ): void {
    if (this.IS_STANDARD_DATA_MODEL) {
      // Create object key for new storage format
      const keyObject: OmniScriptStandardKey = {
        type: originalType,
        subtype: originalSubtype,
        language: originalLanguage,
      };
      StorageUtil.addStandardOmniScriptToStorage(storage, keyObject, value);
    }

    let finalKey = `${originalType}${originalSubtype}${this.cleanLanguageName(originalLanguage)}`; // For vlocity wrapper Multi-Language is specified as MultiLanguage
    finalKey = finalKey.toLowerCase();
    if (storage.osStorage.has(finalKey)) {
      if (this.allVersions) {
        const storedValue = storage.osStorage.get(finalKey);
        if (this.isDifferentOmniscript(storedValue, originalType, originalSubtype, originalLanguage)) {
          this.markDuplicateKeyInStorage(value, finalKey, storage);
        }
      } else {
        this.markDuplicateKeyInStorage(value, finalKey, storage);
      }
    } else {
      // Key doesn't exist - safe to set
      storage.osStorage.set(finalKey, value);
    }
  }

  private markDuplicateKeyInStorage(value: OmniScriptStorage, finalKey: string, storage: MigrationStorage) {
    Logger.logVerbose(this.messages.getMessage('keyAlreadyInStorage', ['Omniscript', finalKey]));
    value.isDuplicate = true;
    storage.osStorage.set(finalKey, value);
  }

  private isDifferentOmniscript(storedValue, type, subtype, language) {
    if (
      storedValue.originalType === type &&
      storedValue.originalSubtype === subtype &&
      storedValue.originalLanguage === language
    ) {
      return false;
    }
    return true;
  }

  private cleanLanguageName(language: string): string {
    // replace -, ( and ) and space with ''
    return language.replace(/[-() ]/g, '');
  }

  async migrate(): Promise<MigrationResult[]> {
    // Get All Records from OmniScript__c (IP & OS Parent Records)
    const omniscripts = await this.getAllOmniScripts();

    if (isStandardDataModelWithMetadataAPIEnabled()) {
      return this.handleMigrationForStdDataModelOrgsWithMetadataAPIEnabled(omniscripts);
    }

    const functionDefinitionMetadata = await getAllFunctionMetadata(this.namespace, this.connection);
    populateRegexForFunctionMetadata(functionDefinitionMetadata);

    const duplicatedNames = new Set<string>();
    // Map to track cleanedName (without version) -> originalName (without version) for duplicate detection
    const duplicateOmniscriptNames: Map<string, string> = new Map<string, string>();

    // Variables to be returned After Migration
    let originalOsRecords = new Map<string, any>();
    let osUploadInfo = new Map<string, UploadRecordResult>();
    const exportComponentType = this.getName() as ComponentType;
    Logger.log(this.messages.getMessage('foundOmniScriptsToMigrate', [omniscripts.length, exportComponentType]));
    const progressBarType = exportComponentType;
    const progressBar = createProgressBar('Migrating', progressBarType);
    let progressCounter = 0;
    progressBar.start(omniscripts.length, progressCounter);

    let foundAngularBasedOmniScripts = false;
    const angularWarningMessage = this.messages.getMessage('angularOmniscriptWarningMessage');
    for (let omniscript of omniscripts) {
      const mappedRecords = [];
      // const originalRecords = new Map<string, AnyJson>();
      const recordId = omniscript['Id'];
      const isOsActive = omniscript[this.getFieldKey('IsActive__c')];

      progressBar.update(++progressCounter);

      // Create a map of the original OmniScript__c records
      originalOsRecords.set(recordId, omniscript);

      // Check if this is an Angular OmniScript that should be skipped
      const omniProcessType = omniscript[this.getFieldKey('IsProcedure__c')] ? 'Integration Procedure' : 'OmniScript';
      if (omniProcessType === 'OmniScript') {
        const type = omniscript[this.getFieldKey('IsLwcEnabled__c')] ? 'LWC' : 'Angular';
        if (type === 'Angular') {
          // Skip Angular OmniScripts and add a warning record

          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: false,
            errors: [],
            warnings: [angularWarningMessage],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          foundAngularBasedOmniScripts = true;
          continue;
        }
      }

      // Record is Active, Elements can't be Added, Modified or Deleted for that OS/IP
      omniscript[this.getFieldKey('IsActive__c')] = false;

      // Get All elements for each OmniScript__c record(i.e IP/OS)
      const elements = await this.getAllElementsForOmniScript(recordId);

      // Check for duplicate element names within the same OmniScript
      const elementNames = new Set<string>();
      const duplicateElementNames = new Set<string>();

      for (const elem of elements) {
        const elemName = elem['Name'];
        if (elementNames.has(elemName)) {
          duplicateElementNames.add(elemName);
        } else {
          elementNames.add(elemName);
        }
      }

      // If duplicate element names found, skip this OmniScript
      if (duplicateElementNames.size > 0) {
        const duplicateNamesList = Array.from(duplicateElementNames).join(', ');
        const skippedResponse: UploadRecordResult = {
          referenceId: recordId,
          id: '',
          success: false,
          hasErrors: false,
          errors: [],
          warnings: [this.messages.getMessage('invalidOrRepeatingOmniscriptElementNames', [duplicateNamesList])],
          newName: '',
          skipped: true,
        };
        osUploadInfo.set(recordId, skippedResponse);
        originalOsRecords.set(recordId, omniscript);
        continue;
      }

      if (omniscript[this.getFieldKey('IsProcedure__c')] === true) {
        // Check for missing mandatory fields for Integration Procedures
        const existingType = omniscript[this.getFieldKey('Type__c')];
        const existingSubType = omniscript[this.getFieldKey('SubType__c')];

        if (!existingType || existingType.trim() === '') {
          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: true,
            errors: [this.messages.getMessage('missingMandatoryField', ['Type', 'Integration Procedure'])],
            warnings: [],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          originalOsRecords.set(recordId, omniscript);
          continue;
        }

        if (!existingSubType || existingSubType.trim() === '') {
          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: true,
            errors: [this.messages.getMessage('missingMandatoryField', ['SubType', 'Integration Procedure'])],
            warnings: [],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          originalOsRecords.set(recordId, omniscript);
          continue;
        }

        // Check for reserved keys in PropertySet for Integration Procedures
        const foundReservedKeys = new Set<string>();

        // do the formula replacement from custom to standard notation
        if (functionDefinitionMetadata.length > 0 && elements.length > 0) {
          for (let ipElement of elements) {
            if (ipElement[this.getFieldKey('PropertySet__c')] != null) {
              // Check for reserved keys while processing the PropertySet
              const propertySet = JSON.parse(ipElement[this.getFieldKey('PropertySet__c')] || '{}');
              this.collectReservedKeys(propertySet, foundReservedKeys);

              // Process formulas in elementValueMap instead of entire PropertySet
              if (propertySet.elementValueMap) {
                let elementValueMap: any = null;

                try {
                  // Handle both string and object formats for elementValueMap
                  if (typeof propertySet.elementValueMap === 'object' && propertySet.elementValueMap !== null) {
                    // elementValueMap is already an object, use directly
                    elementValueMap = propertySet.elementValueMap;
                    Logger.logVerbose(
                      `ElementValueMap accessed as object for element: ${ipElement['Name'] || 'Unknown'}`
                    );
                  } else {
                    Logger.warn(
                      this.messages.getMessage('elementValueMapUnexpectedType', [
                        typeof propertySet.elementValueMap,
                        ipElement['Name'] || 'Unknown',
                      ])
                    );
                  }

                  if (elementValueMap) {
                    let formulasUpdated = false;

                    // Process each key-value pair in elementValueMap
                    for (const [key, value] of Object.entries(elementValueMap)) {
                      if (typeof value === 'string' && value.startsWith('=')) {
                        // This is a formula that needs processing
                        try {
                          const updatedFormula = getReplacedString(
                            this.namespacePrefix,
                            value,
                            functionDefinitionMetadata
                          );
                          if (updatedFormula !== value) {
                            elementValueMap[key] = updatedFormula;
                            formulasUpdated = true;
                            Logger.logVerbose(`Updated formula in ${key}: ${value} -> ${updatedFormula}`);
                          }
                        } catch (formulaEx) {
                          Logger.error(
                            this.messages.getMessage('errorProcessingFormulaInElement', [
                              key,
                              ipElement['Name'] || 'Unknown',
                              formulaEx.message || formulaEx,
                            ])
                          );
                          Logger.logVerbose(this.messages.getMessage('formulaSyntaxError', [value]));
                        }
                      }
                    }

                    // Update PropertySet with modified elementValueMap if any formulas were updated
                    if (formulasUpdated) {
                      // Keep as object format
                      propertySet.elementValueMap = elementValueMap;
                    }
                    ipElement[this.getFieldKey('PropertySet__c')] = JSON.stringify(propertySet);
                    Logger.logVerbose(`Updated PropertySet for element: ${ipElement['Name'] || 'Unknown'}`);
                  }
                } catch (elementValueMapEx) {
                  Logger.error(
                    this.messages.getMessage('errorProcessingElementValueMap', [
                      ipElement['Name'] || 'Unknown',
                      elementValueMapEx.message || elementValueMapEx,
                    ])
                  );
                  Logger.logVerbose(`ElementValueMap content: ${JSON.stringify(propertySet.elementValueMap)}`);
                }
              }
            }
          }
        }

        // If reserved keys found, skip this IP
        if (foundReservedKeys.size > 0) {
          const reservedKeysList = Array.from(foundReservedKeys).join(', ');
          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: false,
            errors: [],
            warnings: [this.messages.getMessage('reservedKeysFoundInPropertySet', [reservedKeysList])],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          originalOsRecords.set(recordId, omniscript);
          continue;
        }
      }

      let mappedOmniScript: AnyJson = {};
      // Perform the transformation for OS/IP Parent Record from OmniScript__c
      mappedOmniScript = this.mapOmniScriptRecord(omniscript);

      // Clean type, subtype
      mappedOmniScript[OmniScriptMappings.Type__c] = this.cleanName(mappedOmniScript[OmniScriptMappings.Type__c]);
      mappedOmniScript[OmniScriptMappings.SubType__c] = this.cleanName(mappedOmniScript[OmniScriptMappings.SubType__c]);

      // Check if Type or SubType becomes empty after cleaning for Integration Procedures
      if (omniscript[this.getFieldKey('IsProcedure__c')]) {
        const originalType = omniscript[this.getFieldKey('Type__c')];
        const originalSubType = omniscript[this.getFieldKey('SubType__c')];

        if (
          !mappedOmniScript[OmniScriptMappings.Type__c] ||
          mappedOmniScript[OmniScriptMappings.Type__c].trim() === ''
        ) {
          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: true,
            errors: [this.messages.getMessage('integrationProcedureTypeEmptyAfterCleaning', [originalType])],
            warnings: [],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          originalOsRecords.set(recordId, omniscript);
          continue;
        }

        if (
          !mappedOmniScript[OmniScriptMappings.SubType__c] ||
          mappedOmniScript[OmniScriptMappings.SubType__c].trim() === ''
        ) {
          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: true,
            errors: [this.messages.getMessage('integrationProcedureSubtypeEmptyAfterCleaning', [originalSubType])],
            warnings: [],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          originalOsRecords.set(recordId, omniscript);
          continue;
        }
      }

      // Check duplicated name
      let mappedOsName: string;
      const mappedOsNameWithoutVersion =
        mappedOmniScript[OmniScriptMappings.Type__c] +
        '_' +
        mappedOmniScript[OmniScriptMappings.SubType__c] +
        (mappedOmniScript[OmniScriptMappings.Language__c]
          ? '_' + mappedOmniScript[OmniScriptMappings.Language__c]
          : '');

      if (this.allVersions) {
        mappedOmniScript[OmniScriptMappings.Version__c] = omniscript[this.getFieldKey('Version__c')];
        mappedOsName =
          mappedOmniScript[OmniScriptMappings.Type__c] +
          '_' +
          mappedOmniScript[OmniScriptMappings.SubType__c] +
          (mappedOmniScript[OmniScriptMappings.Language__c]
            ? '_' + mappedOmniScript[OmniScriptMappings.Language__c]
            : '') +
          '_' +
          mappedOmniScript[OmniScriptMappings.Version__c];
      } else {
        mappedOsName =
          mappedOmniScript[OmniScriptMappings.Type__c] +
          '_' +
          mappedOmniScript[OmniScriptMappings.SubType__c] +
          (mappedOmniScript[OmniScriptMappings.Language__c]
            ? '_' + mappedOmniScript[OmniScriptMappings.Language__c]
            : '') +
          '_1';
      }

      // Get original name parts for tracking
      const originalType = omniscript[this.getFieldKey('Type__c')];
      const originalSubType = omniscript[this.getFieldKey('SubType__c')];
      const originalLanguage = omniscript[this.getFieldKey('Language__c')] || '';
      const originalNameWithoutVersion = originalLanguage
        ? `${originalType}_${originalSubType}_${originalLanguage}`
        : `${originalType}_${originalSubType}`;

      // Check for exact duplicate (same name + same version)
      if (duplicatedNames.has(mappedOsName)) {
        const warningMessage = this.messages.getMessage('duplicatedOSName', [this.getName(true), mappedOsName]);
        const skippedResponse: UploadRecordResult = {
          referenceId: recordId,
          id: '',
          success: false,
          hasErrors: false,
          errors: [],
          warnings: [warningMessage],
          newName: '',
          skipped: true,
        };
        osUploadInfo.set(recordId, skippedResponse);
        originalOsRecords.set(recordId, omniscript);
        continue;
      }
      // Check for naming conflict: different original names cleaning to same name
      else if (this.allVersions && duplicateOmniscriptNames.has(mappedOsNameWithoutVersion)) {
        const existingOriginalName = duplicateOmniscriptNames.get(mappedOsNameWithoutVersion);
        // Only flag if the original names are different (indicates a naming conflict)
        if (existingOriginalName !== originalNameWithoutVersion) {
          const warningMessage = this.messages.getMessage('lowerVersionDuplicateOSName', [
            this.getName(true),
            mappedOsName,
            this.getName(true),
            this.getName(true),
          ]);
          const skippedResponse: UploadRecordResult = {
            referenceId: recordId,
            id: '',
            success: false,
            hasErrors: false,
            errors: [],
            warnings: [warningMessage],
            newName: '',
            skipped: true,
          };
          osUploadInfo.set(recordId, skippedResponse);
          originalOsRecords.set(recordId, omniscript);
          continue;
        }
      }

      // Save the mapped record
      mappedRecords.push(mappedOmniScript);

      // Save the OmniScript__c records to Standard BPO i.e OmniProcess
      let osUploadResponse;
      if (!this.IS_STANDARD_DATA_MODEL) {
        osUploadResponse = await NetUtils.createOne(
          this.connection,
          OmniScriptMigrationTool.OMNIPROCESS_NAME,
          recordId,
          mappedOmniScript
        );
      } else {
        let standardRecordId = mappedOmniScript['Id'];
        delete mappedOmniScript['Id'];
        osUploadResponse = await NetUtils.updateOne(
          this.connection,
          OmniScriptMigrationTool.OMNIPROCESS_NAME,
          recordId,
          recordId,
          mappedOmniScript
        );
        osUploadResponse['id'] = standardRecordId;
      }

      if (!osUploadResponse?.success) {
        osUploadResponse.errors = Array.isArray(osUploadResponse.errors)
          ? osUploadResponse.errors
          : [osUploadResponse.errors];

        osUploadInfo.set(recordId, osUploadResponse);
        continue;
      }

      if (osUploadResponse?.success) {
        // Fix errors

        osUploadResponse.warnings = osUploadResponse.warnings || [];
        osUploadResponse.type = mappedOmniScript[OmniScriptMappings.Type__c];
        osUploadResponse.subtype = mappedOmniScript[OmniScriptMappings.SubType__c];
        osUploadResponse.language = mappedOmniScript[OmniScriptMappings.Language__c];

        let originalOsName: string;
        if (this.allVersions) {
          originalOsName =
            omniscript[this.getFieldKey('Type__c')] +
            '_' +
            omniscript[this.getFieldKey('SubType__c')] +
            '_' +
            omniscript[this.getFieldKey('Language__c')] +
            '_' +
            (omniscript[this.getFieldKey('Version__c')] || '1');
        } else {
          originalOsName =
            omniscript[this.getFieldKey('Type__c')] +
            '_' +
            omniscript[this.getFieldKey('SubType__c')] +
            '_' +
            omniscript[this.getFieldKey('Language__c')] +
            '_1';
        }
        // Always set the new name to show the migrated name
        // Add the processed new name to the duplicated set
        duplicatedNames.add(mappedOsName);

        // Add to map for tracking naming conflicts (only when allVersions=true)
        if (this.allVersions && !duplicateOmniscriptNames.has(mappedOsNameWithoutVersion)) {
          duplicateOmniscriptNames.set(mappedOsNameWithoutVersion, originalNameWithoutVersion);
        }

        osUploadResponse.newName = mappedOsName;

        // Only add warning if the name was actually modified
        if (originalOsName !== mappedOsName) {
          osUploadResponse.warnings.unshift(
            `${this.getName(true)} name has been modified to fit naming rules: ${mappedOsName}`
          );
        }

        try {
          // Upload All elements for each OmniScript__c record(i.e IP/OS)
          await this.uploadAllElements(osUploadResponse, elements);

          // Get OmniScript Compiled Definitions for OmniScript Record
          const omniscriptsCompiledDefinitions = await this.getOmniScriptCompiledDefinition(recordId);

          // Upload OmniScript Compiled Definition to OmniProcessCompilation
          await this.uploadAllOmniScriptDefinitions(osUploadResponse, omniscriptsCompiledDefinitions);

          if (isOsActive) {
            // Update the inserted OS record as it was Active and made InActive to insert.
            mappedRecords[0].IsActive = true;
            mappedRecords[0].Id = osUploadResponse.id;

            if (mappedRecords[0].IsIntegrationProcedure) {
              mappedRecords[0].Language = 'Procedure';
            }

            const updateResult = await NetUtils.updateOne(
              this.connection,
              OmniScriptMigrationTool.OMNIPROCESS_NAME,
              recordId,
              osUploadResponse.id,
              {
                [OmniScriptMappings.IsActive__c]: true,
              }
            );

            if (!updateResult.success) {
              osUploadResponse.hasErrors = true;
              osUploadResponse.errors = osUploadResponse.errors || [];

              osUploadResponse.errors.push(
                this.messages.getMessage('errorWhileActivatingOs', [this.getName(true)]) + updateResult.errors
              );
            }
          }
        } catch (e) {
          osUploadResponse.hasErrors = true;
          osUploadResponse.errors = osUploadResponse.errors || [];

          let error = 'UNKNOWN';
          if (typeof e === 'object') {
            try {
              const obj = JSON.parse(e.message || '{}');
              if (obj.hasErrors && obj.results && Array.isArray(obj.results)) {
                error = obj.results
                  .map((r) => {
                    return Array.isArray(r.errors) ? r.errors.map((e) => e.message).join('. ') : r.errors;
                  })
                  .join('. ');
              }
            } catch {
              error = e.toString();
            }
          }

          Logger.logVerbose(e.stack);
          osUploadResponse.errors.push(
            this.messages.getMessage('errorWhileCreatingElements', [this.getName(true)]) + error
          );
        } finally {
          // Create the return records and response which have been processed
          osUploadInfo.set(recordId, osUploadResponse);
        }
      }

      originalOsRecords.set(recordId, omniscript);
    }
    progressBar.stop();

    if (foundAngularBasedOmniScripts) {
      Logger.warn(angularWarningMessage);
    }
    this.updateStorageForOmniscript(osUploadInfo, originalOsRecords);

    const objectMigrationResults: MigrationResult[] = [];

    if (this.exportType === OmniScriptExportType.All || this.exportType === OmniScriptExportType.IP) {
      objectMigrationResults.push(
        this.getMigratedRecordsByType('Integration Procedures', osUploadInfo, originalOsRecords)
      );
    }
    if (this.exportType === OmniScriptExportType.All || this.exportType === OmniScriptExportType.OS) {
      objectMigrationResults.push(this.getMigratedRecordsByType('Omniscripts', osUploadInfo, originalOsRecords));
    }

    return objectMigrationResults;
  }

  // Using this small method, As IP & OS lives in same object -> So returning the IP and OS in the end, after the migration is done
  // and the results are generated. Other way can be creating a separate IP class and migrating IP & OS separately
  // using common functions
  private getMigratedRecordsByType(
    type: string,
    results: Map<string, UploadRecordResult>,
    records: Map<string, any>
  ): MigrationResult {
    let recordMap: Map<string, any> = new Map<string, any>();
    let resultMap: Map<string, any> = new Map<string, any>();
    for (let record of Array.from(records.values())) {
      if (
        (type === 'Integration Procedures' && record[this.getFieldKey('IsProcedure__c')]) ||
        (type === 'Omniscripts' && !record[this.getFieldKey('IsProcedure__c')])
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
      results: resultMap,
    };
  }

  private handleMigrationForStdDataModelOrgsWithMetadataAPIEnabled(omniscripts: AnyJson[]) {
    const result = [
      {
        name: this.getName(),
        results: new Map<string, UploadRecordResult>(),
        records: new Map<string, any>(),
      },
    ];

    if (this.exportType === OmniScriptExportType.IP) {
      return result;
    }

    Logger.logVerbose(this.messages.getMessage('preparingStorageForMetadataEnabledOrg', [Constants.Omniscript]));
    let storage: MigrationStorage = StorageUtil.getOmnistudioMigrationStorage();
    Logger.logVerbose(this.messages.getMessage('updatingStorageForOmniscipt', ['Migration']));

    this.prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(storage, omniscripts);
    StorageUtil.printMigrationStorage();

    // Return empty result structure for report generation
    return result;
  }

  private updateStorageForOmniscript(
    osUploadInfo: Map<string, UploadRecordResult>,
    originalOsRecords: Map<string, any>
  ) {
    let storage: MigrationStorage = StorageUtil.getOmnistudioMigrationStorage();
    Logger.logVerbose(this.messages.getMessage('updatingStorageForOmniscipt', ['Migration']));
    for (let key of Array.from(originalOsRecords.keys())) {
      try {
        let oldrecord = originalOsRecords.get(key);
        let newrecord = osUploadInfo.get(key);

        if (!oldrecord[this.getFieldKey('IsProcedure__c')]) {
          let value: OmniScriptStorage = {
            type: newrecord['type'],
            subtype: newrecord['subtype'],
            language: newrecord['language'],
            isDuplicate: false,
            originalType: oldrecord[this.getFieldKey('Type__c')],
            originalSubtype: oldrecord[this.getFieldKey('SubType__c')],
            originalLanguage: oldrecord[this.getFieldKey('Language__c')],
          };

          // New record can be undefined
          if (newrecord === undefined) {
            value.migrationSuccess = false;
          } else {
            if (newrecord.hasErrors || newrecord.success === false) {
              value.error = [...(newrecord.errors || []), ...(newrecord.warnings || [])];
              value.migrationSuccess = false;
            } else {
              value.migrationSuccess = true;
            }
          }

          this.addKeyToStorage(
            oldrecord[this.getFieldKey('Type__c')],
            oldrecord[this.getFieldKey('SubType__c')],
            oldrecord[this.getFieldKey('Language__c')],
            storage,
            value
          );
        }
      } catch (error) {
        Logger.error(error);
      }
    }
    StorageUtil.printMigrationStorage();
  }

  // Get All OmniScript__c records i.e All IP & OS
  private async getAllOmniScripts(): Promise<AnyJson[]> {
    //DebugTimer.getInstance().lap('Query OmniScripts');
    Logger.info(this.messages.getMessage('allVersionsInfo', [this.allVersions]));
    const filters = new Map<string, any>();

    if (this.exportType === OmniScriptExportType.IP) {
      filters.set(this.getFieldKey('IsProcedure__c'), true);
    } else if (this.exportType === OmniScriptExportType.OS) {
      filters.set(this.getFieldKey('IsProcedure__c'), false);
    }

    let omniscripts: AnyJson[];

    if (this.allVersions) {
      const sortFields = [
        { field: this.getFieldKey('Type__c'), direction: SortDirection.ASC },
        { field: this.getFieldKey('SubType__c'), direction: SortDirection.ASC },
        { field: this.getFieldKey('Version__c'), direction: SortDirection.ASC },
      ];
      omniscripts = await QueryTools.queryWithFilterAndSort(
        this.connection,
        this.getQueryNamespace(),
        this.getOmniscriptObjectName(),
        this.getOmniScriptFields(),
        filters,
        sortFields
      ).catch((err) => {
        if (err.errorCode === 'INVALID_TYPE') {
          throw new InvalidEntityTypeError(
            `${OmniScriptMigrationTool.OMNISCRIPT_NAME} type is not found under this namespace`
          );
        }
        throw err;
      });
    } else {
      filters.set(this.getFieldKey('IsActive__c'), true);
      omniscripts = await QueryTools.queryWithFilter(
        this.connection,
        this.getQueryNamespace(),
        this.getOmniscriptObjectName(),
        this.getOmniScriptFields(),
        filters
      ).catch((err) => {
        if (err.errorCode === 'INVALID_TYPE') {
          throw new InvalidEntityTypeError(`${this.getOmniscriptObjectName()} type is not found under this namespace`);
        }
        throw err;
      });
    }

    // Apply prioritization only for standard data model
    if (this.IS_STANDARD_DATA_MODEL) {
      return this.prioritizeOmniscriptsWithoutSpecialCharacters(omniscripts);
    }

    return omniscripts;
  }

  // Get All Elements w.r.t OmniScript__c i.e Elements tagged to passed in IP/OS
  private async getAllElementsForOmniScript(recordId: string): Promise<AnyJson[]> {
    // Query all Elements for an OmniScript
    const filters = new Map<string, any>();
    this.IS_STANDARD_DATA_MODEL
      ? filters.set('OmniProcessId', recordId)
      : filters.set(this.namespacePrefix + 'OmniScriptId__c', recordId);

    return await QueryTools.queryWithFilter(
      this.connection,
      this.getQueryNamespace(),
      this.getElementObjectName(),
      this.getElementFields(),
      filters
    );
  }

  // Get All Compiled Definitions w.r.t OmniScript__c i.e Definitions tagged to passed in IP/OS
  private async getOmniScriptCompiledDefinition(recordId: string): Promise<AnyJson[]> {
    // Query all Definitions for an OmniScript
    const filters = new Map<string, any>();
    this.IS_STANDARD_DATA_MODEL
      ? filters.set('OmniProcessId', recordId)
      : filters.set(this.namespacePrefix + 'OmniScriptId__c', recordId);

    return await QueryTools.queryWithFilter(
      this.connection,
      this.getQueryNamespace(),
      this.getOmniScriptCompiledDefinitionObjectName(),
      this.getOmniScriptDefinitionFields(),
      filters
    );
  }

  // Upload All the Elements tagged to a OmniScript__c record, after the parent record has been inserted
  private async uploadAllElements(
    omniScriptUploadResults: UploadRecordResult,
    elements: AnyJson[]
  ): Promise<Map<string, UploadRecordResult>> {
    let levelCount = 0; // To define and insert different levels(Parent-Child relationship) at a time
    let exit = false; // Counter variable to exit after all parent-child elements inserted
    var elementsUploadInfo = new Map<string, UploadRecordResult>(); // Info for Uploaded Elements to be returned

    do {
      let tempElements = []; // Stores Elements at a same level starting with levelCount = 0 level (parent elements)
      for (let element of elements) {
        if (element[this.getElementFieldKey('Level__c')] === levelCount) {
          let elementId = element['Id'];
          let elementParentId = element[this.getElementFieldKey('ParentElementId__c')];
          if (
            !elementsUploadInfo.has(elementId) &&
            (!elementParentId || (elementParentId && elementsUploadInfo.has(elementParentId)))
          ) {
            tempElements.push(element);
          }
        }
      }

      // If no elements exist after a certain level, Then everything is alraedy processed, otherwise upload
      if (tempElements.length === 0) {
        exit = true;
      } else {
        // Get Transformed Element__c to OmniProcessElement with updated OmniScriptId & ParentElementId
        let elementsTransformedData = await this.prepareElementsData(
          omniScriptUploadResults,
          tempElements,
          elementsUploadInfo
        );
        let elementsUploadResponse = new Map<string, UploadRecordResult>();

        if (!this.IS_STANDARD_DATA_MODEL) {
          // Upload the transformed Element__c
          elementsUploadResponse = await this.uploadTransformedData(
            OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME,
            elementsTransformedData
          );
        } else {
          for (let elementRecord of elementsTransformedData.mappedRecords) {
            let standardElementId = elementRecord['Id'];
            let standardOmniProcessId = elementRecord['OmniProcessId'];

            delete elementRecord['Id'];
            delete elementRecord['OmniProcessId'];
            let response: UploadRecordResult = await NetUtils.updateOne(
              this.connection,
              OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME,
              standardElementId,
              standardElementId,
              elementRecord
            );

            elementRecord['Id'] = standardElementId;
            elementRecord['OmniProcessId'] = standardOmniProcessId;
            elementsUploadResponse.set(standardElementId, response);
          }
        }
        // Keep appending upload Info for Elements at each level
        elementsUploadInfo = new Map([
          ...Array.from(elementsUploadInfo.entries()),
          ...Array.from(elementsUploadResponse.entries()),
        ]);
      }

      levelCount++;
    } while (exit === false);

    return elementsUploadInfo;
  }

  // Upload All the Definitions tagged to a OmniScript__c record, after the parent record has been inserted
  private async uploadAllOmniScriptDefinitions(
    omniScriptUploadResults: UploadRecordResult,
    osDefinitions: AnyJson[]
  ): Promise<Map<string, UploadRecordResult>> {
    let osDefinitionsData = await this.prepareOsDefinitionsData(omniScriptUploadResults, osDefinitions);
    if (!this.IS_STANDARD_DATA_MODEL) {
      return await this.uploadTransformedData(OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME, osDefinitionsData);
    } else {
      for (let osDefinitionRecord of osDefinitionsData.mappedRecords) {
        let standardOsDefintionId = osDefinitionRecord['Id'];
        let standardOmniProcessId = osDefinitionRecord['OmniProcessId'];
        delete osDefinitionRecord['Id'];
        delete osDefinitionRecord['OmniProcessId'];

        let osUploadResponse = await NetUtils.updateOne(
          this.connection,
          OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME,
          standardOsDefintionId,
          standardOsDefintionId,
          osDefinitionRecord
        );

        osUploadResponse['Id'] = standardOsDefintionId;
        osUploadResponse['OmniProcessId'] = standardOmniProcessId;
      }
    }
  }

  // Prepare Elements Data and Do the neccessary updates, transformation, validations etc.
  private async prepareElementsData(
    osUploadResult: UploadRecordResult,
    elements: AnyJson[],
    parentElementUploadResponse: Map<string, UploadRecordResult>
  ): Promise<TransformData> {
    const mappedRecords = [],
      originalRecords = new Map<string, AnyJson>(),
      invalidIpNames = new Map<String, String>();

    elements.forEach((element) => {
      // Perform the transformation. We need parent record & must have been migrated before
      if (osUploadResult.id) {
        mappedRecords.push(
          this.mapElementData(element, osUploadResult.id, parentElementUploadResponse, invalidIpNames)
        );
      }

      // Create a map of the original records
      originalRecords.set(element['Id'], element);
    });

    if (osUploadResult.id && invalidIpNames.size > 0) {
      const val = Array.from(invalidIpNames.entries())
        .map((e) => e[0])
        .join(', ');
      osUploadResult.errors.push('Integration Procedure Actions will need manual updates, please verify: ' + val);
    }

    return { originalRecords, mappedRecords };
  }

  // Prepare OmniScript Definitions to be uploaded
  private async prepareOsDefinitionsData(
    osUploadResult: UploadRecordResult,
    osDefinitions: AnyJson[]
  ): Promise<TransformData> {
    const mappedRecords = [],
      originalRecords = new Map<string, AnyJson>();

    osDefinitions.forEach((osDefinition) => {
      // Perform the transformation. We need parent record & must have been migrated before
      if (osUploadResult.id) {
        mappedRecords.push(this.mapOsDefinitionsData(osDefinition, osUploadResult.id));
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
    let mappedObject = {};

    if (!this.IS_STANDARD_DATA_MODEL) {
      // Get the fields of the record
      const recordFields = Object.keys(omniScriptRecord);

      // Map individual fields
      recordFields.forEach((recordField) => {
        const cleanFieldName = this.getCleanFieldName(recordField);

        if (OmniScriptMappings.hasOwnProperty(cleanFieldName)) {
          mappedObject[OmniScriptMappings[cleanFieldName]] = omniScriptRecord[recordField];
        }
      });
    } else {
      mappedObject = { ...(omniScriptRecord as Object) };
    }

    mappedObject['Name'] = this.cleanName(mappedObject['Name']);

    // Process PropertySetConfig to update persistentComponent transform bundle references
    const propertySetConfig = mappedObject[OmniScriptMappings.PropertySet__c];
    if (propertySetConfig) {
      try {
        const parsedConfig = JSON.parse(propertySetConfig);
        this.processPersistentComponents(parsedConfig);
        mappedObject[OmniScriptMappings.PropertySet__c] = JSON.stringify(parsedConfig);
      } catch (ex) {
        Logger.error(`Failed to parse PropertySetConfig for OmniScript: ${mappedObject['Name']}`);
      }
    }

    // BATCH framework requires that each record has an "attributes" property
    mappedObject['attributes'] = {
      type: OmniScriptMigrationTool.OMNIPROCESS_NAME,
      referenceId: omniScriptRecord['Id'],
    };

    return mappedObject;
  }

  /**
   * Processes persistentComponent array in OmniProcess PropertySetConfig to update transform bundle references
   * Handles: persistentComponent[].remoteOptions.preTransformBundle, persistentComponent[].remoteOptions.postTransformBundle,
   *          persistentComponent[].preTransformBundle, persistentComponent[].postTransformBundle
   * @param propertySetConfig The parsed PropertySetConfig object
   */
  private processPersistentComponents(propertySetConfig: any): void {
    if (!propertySetConfig || !Array.isArray(propertySetConfig.persistentComponent)) {
      return;
    }

    propertySetConfig.persistentComponent.forEach((component: any) => {
      if (!component) {
        return;
      }

      // Handle remoteOptions pre/post transform bundles
      if (component.remoteOptions) {
        if (component.remoteOptions.preTransformBundle) {
          component.remoteOptions.preTransformBundle = this.cleanBundleName(component.remoteOptions.preTransformBundle);
        }
        if (component.remoteOptions.postTransformBundle) {
          component.remoteOptions.postTransformBundle = this.cleanBundleName(
            component.remoteOptions.postTransformBundle
          );
        }
      }

      // Handle direct pre/post transform bundles
      if (component.preTransformBundle) {
        component.preTransformBundle = this.cleanBundleName(component.preTransformBundle);
      }
      if (component.postTransformBundle) {
        component.postTransformBundle = this.cleanBundleName(component.postTransformBundle);
      }
    });
  }

  // Maps an individual Element into an OmniProcessElement record
  private mapElementData(
    elementRecord: AnyJson,
    omniProcessId: string,
    parentElementUploadResponse: Map<String, UploadRecordResult>,
    invalidIpReferences: Map<String, String>
  ) {
    // Transformed object
    let mappedObject = {};

    if (!this.IS_STANDARD_DATA_MODEL) {
      // Get the fields of the record
      const recordFields = Object.keys(elementRecord);

      // Map individual fields
      recordFields.forEach((recordField) => {
        const cleanFieldName = this.getCleanFieldName(recordField);

        if (ElementMappings.hasOwnProperty(cleanFieldName)) {
          mappedObject[ElementMappings[cleanFieldName]] = elementRecord[recordField];

          if (
            cleanFieldName === 'ParentElementId__c' &&
            parentElementUploadResponse.has(elementRecord[this.getElementFieldKey('ParentElementId__c')])
          ) {
            mappedObject[ElementMappings[cleanFieldName]] = parentElementUploadResponse.get(
              elementRecord[this.getElementFieldKey('ParentElementId__c')]
            ).id;
          }
        }
      });

      // Set the parent/child relationship
      mappedObject['OmniProcessId'] = omniProcessId;
    } else {
      mappedObject = { ...(elementRecord as Object) };
    }

    // We need to fix the child references
    const elementType = mappedObject[ElementMappings.Type__c];
    const propertySet = JSON.parse(mappedObject[ElementMappings.PropertySet__c] || '{}');

    // Use shared method to process element types
    this.processElementByType(elementType, propertySet, invalidIpReferences, mappedObject[ElementMappings.Name]);

    mappedObject[ElementMappings.PropertySet__c] = JSON.stringify(propertySet);

    // BATCH framework requires that each record has an "attributes" property
    mappedObject['attributes'] = {
      type: OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME,
      referenceId: elementRecord['Id'],
    };

    return mappedObject;
  }

  // Maps an individual Definition into an OmniProcessCompilation record
  private mapOsDefinitionsData(osDefinition: AnyJson, omniProcessId: string) {
    // Transformed object
    let mappedObject = {};

    if (!this.IS_STANDARD_DATA_MODEL) {
      // Get the fields of the record
      const recordFields = Object.keys(osDefinition);

      // Map individual fields
      recordFields.forEach((recordField) => {
        const cleanFieldName = this.getCleanFieldName(recordField);

        if (OmniScriptDefinitionMappings.hasOwnProperty(cleanFieldName)) {
          mappedObject[OmniScriptDefinitionMappings[cleanFieldName]] = osDefinition[recordField];
        }
      });

      // Set the parent/child relationship
      mappedObject[OmniScriptDefinitionMappings.Name] = omniProcessId;
      mappedObject[OmniScriptDefinitionMappings.OmniScriptId__c] = omniProcessId;
    } else {
      mappedObject = { ...(osDefinition as Object) };
    }

    let content = mappedObject[OmniScriptDefinitionMappings.Content__c];
    if (content) {
      try {
        content = JSON.parse(content);
        if (content && content['sOmniScriptId']) {
          content['sOmniScriptId'] = omniProcessId;
        }

        // Process the nested JSON structure to update bundle/reference names
        if (content && content['children']) {
          this.processContentChildren(content['children']);
        }

        // Process persistentComponent array in OmniProcessCompilation Content (inside propSetMap)
        if (content && content['propSetMap']) {
          this.processPersistentComponents(content['propSetMap']);
        }

        mappedObject[OmniScriptDefinitionMappings.Content__c] = JSON.stringify(content);
      } catch (ex) {
        // Log
      }
    }

    // BATCH framework requires that each record has an "attributes" property
    mappedObject['attributes'] = {
      type: OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME,
      referenceId: osDefinition['Id'],
    };

    return mappedObject;
  }

  /**
   * Shared helper method to process element types and update references
   * Handles the switch statement logic for different element types
   * @param elementType Type of the element
   * @param propSet Property set map from the element
   * @param invalidIpReferences Optional map to track invalid IP references
   * @param elementName Optional element name for logging
   */
  private processElementByType(
    elementType: string,
    propSet: any,
    invalidIpReferences?: Map<String, String>,
    elementName?: string
  ): void {
    switch (elementType) {
      case Constants.OmniScriptComponentName:
        this.processOmniScriptAction(propSet);
        break;
      case Constants.IntegrationProcedureAction:
        this.processIntegrationProcedureAction(propSet, invalidIpReferences, elementName);
        break;
      case Constants.DataRaptorTurboAction:
      case Constants.DataRaptorTransformAction:
      case Constants.DataRaptorPostAction:
      case Constants.DataRaptorExtractAction:
        this.processDataRaptorAction(propSet);
        break;
      case Constants.StepElement:
        this.processStepAction(propSet);
        break;
      case Constants.DocuSignEnvelopeAction:
        this.processDocuSignEnvelopeAction(propSet);
        break;
      case Constants.DocuSignSignatureAction:
        this.processDocuSignSignatureAction(propSet);
        break;
      case Constants.DecisionMatrixAction:
        this.processDecisionMatrixAction(propSet);
        break;
      case Constants.ExpressionSetAction:
        this.processExpressionSetAction(propSet);
        break;
      case Constants.HTTPAction:
        this.processHttpAction(propSet);
        break;
      case Constants.PDFAction:
        this.processPdfAction(propSet);
        break;
      case Constants.RemoteAction:
        this.processRemoteAction(propSet);
        break;
      default:
        // Handle other element types if needed
        break;
    }

    // Process lwcComponentOverride for all element types (FlexCard reference)
    this.processLwcComponentOverride(propSet);
  }

  /**
   * Recursively processes children elements in the content JSON to update bundle/reference names
   * @param children Array of child elements from the content JSON
   */
  private processContentChildren(children: any[]): void {
    if (!Array.isArray(children)) {
      return;
    }

    children.forEach((child) => {
      if (child && child.type && child.propSetMap) {
        this.processContentElement(child);
      }

      // Process nested children in Step elements
      if (child && child.children && Array.isArray(child.children)) {
        child.children.forEach((nestedChild) => {
          if (nestedChild && nestedChild.eleArray && Array.isArray(nestedChild.eleArray)) {
            nestedChild.eleArray.forEach((element) => {
              if (element && element.type && element.propSetMap) {
                this.processContentElement(element);
              }
            });
          }
        });
      }
    });
  }

  /**
   * Processes individual content element to update bundle/reference names based on type
   * @param element Individual element from the content JSON
   */
  private processContentElement(element: any): void {
    const elementType = element.type;
    const propSetMap = element.propSetMap;

    if (!elementType || !propSetMap) {
      return;
    }

    // Use shared method to process element types
    this.processElementByType(elementType, propSetMap);
  }

  /**
   * Processes DocuSign Envelope Action elements to update transformBundle references
   * @param propSetMap Property set map from the element
   */
  private processDocuSignEnvelopeAction(propSetMap: any): void {
    // Handle docuSignTemplatesGroup[].transformBundle
    if (Array.isArray(propSetMap.docuSignTemplatesGroup)) {
      propSetMap.docuSignTemplatesGroup.forEach((template: any) => {
        if (template && template.transformBundle) {
          const bundleName = template.transformBundle;
          if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
            template.transformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
          } else {
            Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', bundleName])}`);
            template.transformBundle = this.cleanName(bundleName);
          }
        }
      });
    }
  }

  /**
   * Processes DocuSign Signature Action elements to update transformBundle references
   * @param propSetMap Property set map from the element
   */
  private processDocuSignSignatureAction(propSetMap: any): void {
    // Handle docuSignTemplatesGroupSig[].transformBundle
    if (Array.isArray(propSetMap.docuSignTemplatesGroupSig)) {
      propSetMap.docuSignTemplatesGroupSig.forEach((template: any) => {
        if (template && template.transformBundle) {
          const bundleName = template.transformBundle;
          if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
            template.transformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
          } else {
            Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', bundleName])}`);
            template.transformBundle = this.cleanName(bundleName);
          }
        }
      });
    }
  }

  /**
   * Processes Integration Procedure Action elements to update reference names
   * @param propSetMap Property set map from the element
   * @param invalidIpReferences Optional map to track invalid IP references for reporting
   * @param elementName Optional element name for tracking invalid references
   */
  private processIntegrationProcedureAction(
    propSetMap: any,
    invalidIpReferences?: Map<String, String>,
    elementName?: string
  ): void {
    // Handle remoteOptions pre/post transform bundles
    if (propSetMap.remoteOptions) {
      if (propSetMap.remoteOptions.preTransformBundle) {
        const bundleName = propSetMap.remoteOptions.preTransformBundle;
        if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
          propSetMap.remoteOptions.preTransformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
        } else {
          Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', bundleName])}`);
          propSetMap.remoteOptions.preTransformBundle = this.cleanName(bundleName);
        }
      }

      if (propSetMap.remoteOptions.postTransformBundle) {
        const bundleName = propSetMap.remoteOptions.postTransformBundle;
        if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
          propSetMap.remoteOptions.postTransformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
        } else {
          Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', bundleName])}`);
          propSetMap.remoteOptions.postTransformBundle = this.cleanName(bundleName);
        }
      }
    }

    // Handle direct pre/post transform bundles
    if (propSetMap.preTransformBundle) {
      const bundleName = propSetMap.preTransformBundle;
      if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
        propSetMap.preTransformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
      } else {
        Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', bundleName])}`);
        propSetMap.preTransformBundle = this.cleanName(bundleName);
      }
    }

    if (propSetMap.postTransformBundle) {
      const bundleName = propSetMap.postTransformBundle;
      if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
        propSetMap.postTransformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
      } else {
        Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', bundleName])}`);
        propSetMap.postTransformBundle = this.cleanName(bundleName);
      }
    }

    // Handle integrationProcedureKey
    if (propSetMap.integrationProcedureKey) {
      const key = propSetMap.integrationProcedureKey;
      if (this.nameRegistry.hasIntegrationProcedureMapping(key)) {
        propSetMap.integrationProcedureKey = this.nameRegistry.getIntegrationProcedureCleanedName(key);
      } else {
        Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['IntegrationProcedure', key])}`);
        const parts = key.split('_');
        const newKey = parts.map((p) => this.cleanName(p, true)).join('_');
        // Integration Procedures should have Type_SubType format (2 parts)
        if (parts.length > 2) {
          if (invalidIpReferences && elementName) {
            invalidIpReferences.set(elementName, key);
          } else {
            Logger.logVerbose(this.messages.getMessage('integrationProcedureInvalidUnderscoreFormat', [key]));
          }
        }
        propSetMap.integrationProcedureKey = newKey;
      }
    }
  }

  /**
   * Processes DataRaptor Action elements to update bundle names
   * @param propSetMap Property set map from the element
   */
  private processDataRaptorAction(propSetMap: any): void {
    if (propSetMap.bundle) {
      const bundleName = propSetMap.bundle;
      if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
        propSetMap.bundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
      } else {
        Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', bundleName])}`);
        propSetMap.bundle = this.cleanName(bundleName);
      }
    }
    // Handle postTransformBundle for DataRaptor Post Action
    this.processTransformBundles(propSetMap);
  }

  /**
   * Processes OmniScript Action elements to update reference names
   * @param propSetMap Property set map from the element
   */
  private processOmniScriptAction(propSetMap: any): void {
    const osType = propSetMap['Type'] || '';
    const osSubType = propSetMap['Sub Type'] || '';
    const osLanguage = propSetMap['Language'] || 'English';

    // Construct full OmniScript name to check registry
    const fullOmniScriptName = `${osType}_${osSubType}_${osLanguage}`;

    if (this.nameRegistry.isAngularOmniScript(fullOmniScriptName)) {
      // Referenced OmniScript is Angular - add warning and keep original reference
      Logger.logVerbose(
        `\n${this.messages.getMessage('angularOmniScriptDependencyWarning', [
          'OmniScript element',
          fullOmniScriptName,
        ])}`
      );
      // Keep original reference as-is since Angular OmniScript won't be migrated
      return;
    } else if (this.nameRegistry.hasOmniScriptMapping(fullOmniScriptName)) {
      // Registry has mapping for this LWC OmniScript - extract cleaned parts
      const cleanedFullName = this.nameRegistry.getCleanedName(fullOmniScriptName, 'OmniScript');
      const parts = cleanedFullName.split('_');

      if (parts.length >= 2) {
        propSetMap['Type'] = parts[0];
        propSetMap['Sub Type'] = parts[1];
        // Language doesn't typically change, but update if provided
        if (parts.length >= 3) {
          propSetMap['Language'] = parts[2];
        }
      }
    } else {
      // No registry mapping - use original fallback approach
      Logger.logVerbose(
        `\n${this.messages.getMessage('componentMappingNotFound', ['OmniScript', fullOmniScriptName])}`
      );
      propSetMap['Type'] = this.cleanName(osType);
      propSetMap['Sub Type'] = this.cleanName(osSubType);
    }
  }

  /**
   * Processes Step elements to update reference names
   * @param propSetMap Property set map from the element
   */
  private processStepAction(propSetMap: any): void {
    // Handle remoteOptions pre/post transform bundles if they exist in Step elements
    // Note: remoteClass and remoteMethod cleaning is not required for omniscript content step dependencies
    if (propSetMap.remoteOptions) {
      if (propSetMap.remoteOptions.preTransformBundle) {
        const bundleName = propSetMap.remoteOptions.preTransformBundle;
        if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
          propSetMap.remoteOptions.preTransformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
        } else {
          Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', bundleName])}`);
          propSetMap.remoteOptions.preTransformBundle = this.cleanName(bundleName);
        }
      }

      if (propSetMap.remoteOptions.postTransformBundle) {
        const bundleName = propSetMap.remoteOptions.postTransformBundle;
        if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
          propSetMap.remoteOptions.postTransformBundle = this.nameRegistry.getDataMapperCleanedName(bundleName);
        } else {
          Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', bundleName])}`);
          propSetMap.remoteOptions.postTransformBundle = this.cleanName(bundleName);
        }
      }
    }
  }

  /**
   * Generic helper to process common transform bundle properties
   * Handles: preTransformBundle, postTransformBundle, remoteOptions.preTransformBundle, remoteOptions.postTransformBundle
   * @param propSetMap Property set map from the element
   */
  private processTransformBundles(propSetMap: any): void {
    // Handle remoteOptions pre/post transform bundles
    if (propSetMap.remoteOptions) {
      if (propSetMap.remoteOptions.preTransformBundle) {
        propSetMap.remoteOptions.preTransformBundle = this.cleanBundleName(propSetMap.remoteOptions.preTransformBundle);
      }
      if (propSetMap.remoteOptions.postTransformBundle) {
        propSetMap.remoteOptions.postTransformBundle = this.cleanBundleName(
          propSetMap.remoteOptions.postTransformBundle
        );
      }
    }

    // Handle direct pre/post transform bundles
    if (propSetMap.preTransformBundle) {
      propSetMap.preTransformBundle = this.cleanBundleName(propSetMap.preTransformBundle);
    }
    if (propSetMap.postTransformBundle) {
      propSetMap.postTransformBundle = this.cleanBundleName(propSetMap.postTransformBundle);
    }
  }

  /**
   * Helper to clean a single bundle name using registry or fallback
   * @param bundleName The bundle name to clean
   * @returns The cleaned bundle name
   */
  private cleanBundleName(bundleName: string): string {
    if (!bundleName) {
      return bundleName;
    }
    if (this.nameRegistry.hasDataMapperMapping(bundleName)) {
      return this.nameRegistry.getDataMapperCleanedName(bundleName);
    } else {
      Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['DataMapper', bundleName])}`);
      return this.cleanName(bundleName);
    }
  }

  /**
   * Processes Decision Matrix Action elements to update transform bundle references
   * @param propSetMap Property set map from the element
   */
  private processDecisionMatrixAction(propSetMap: any): void {
    this.processTransformBundles(propSetMap);
  }

  /**
   * Processes Expression Set Action elements to update transform bundle references
   * @param propSetMap Property set map from the element
   */
  private processExpressionSetAction(propSetMap: any): void {
    this.processTransformBundles(propSetMap);
  }

  /**
   * Processes HTTP Action elements to update transform bundle references
   * Handles: preTransformBundle, postTransformBundle, xmlPreTransformBundle, xmlPostTransformBundle
   * @param propSetMap Property set map from the element
   */
  private processHttpAction(propSetMap: any): void {
    this.processTransformBundles(propSetMap);

    // Handle XML-specific transform bundles
    if (propSetMap.xmlPreTransformBundle) {
      propSetMap.xmlPreTransformBundle = this.cleanBundleName(propSetMap.xmlPreTransformBundle);
    }
    if (propSetMap.xmlPostTransformBundle) {
      propSetMap.xmlPostTransformBundle = this.cleanBundleName(propSetMap.xmlPostTransformBundle);
    }
  }

  /**
   * Processes PDF Action elements to update transform bundle references
   * @param propSetMap Property set map from the element
   */
  private processPdfAction(propSetMap: any): void {
    if (propSetMap.preTransformBundle) {
      propSetMap.preTransformBundle = this.cleanBundleName(propSetMap.preTransformBundle);
    }
  }

  /**
   * Processes Remote Action elements to update transform bundle references
   * @param propSetMap Property set map from the element
   */
  private processRemoteAction(propSetMap: any): void {
    this.processTransformBundles(propSetMap);
  }

  /**
   * Processes lwcComponentOverride property to update FlexCard reference names
   * @param propSetMap Property set map from the element
   */
  private processLwcComponentOverride(propSetMap: any): void {
    if (propSetMap.lwcComponentOverride) {
      const lwcOverride = propSetMap.lwcComponentOverride;
      // lwcComponentOverride has 'cf' prefix (e.g., 'cfEventManagementBudgetCard')
      // Registry stores FlexCard names without prefix (e.g., 'EventManagementBudgetCard')
      if (lwcOverride.startsWith('cf')) {
        const flexCardName = lwcOverride.substring(2); // Remove 'cf' prefix
        if (this.nameRegistry.hasFlexCardMapping(flexCardName)) {
          const cleanedName = this.nameRegistry.getFlexCardCleanedName(flexCardName);
          propSetMap.lwcComponentOverride = 'cf' + cleanedName;
        } else {
          Logger.logVerbose(`\n${this.messages.getMessage('componentMappingNotFound', ['FlexCard', flexCardName])}`);
          propSetMap.lwcComponentOverride = 'cf' + this.cleanName(flexCardName);
        }
      }
    }
  }

  private getOmniScriptFields(): string[] {
    return this.IS_STANDARD_DATA_MODEL ? Object.values(OmniScriptMappings) : Object.keys(OmniScriptMappings);
  }

  private getElementFields(): string[] {
    return this.IS_STANDARD_DATA_MODEL ? Object.values(ElementMappings) : Object.keys(ElementMappings);
  }

  private getOmniScriptCompiledDefinitionObjectName(): string {
    return this.IS_STANDARD_DATA_MODEL
      ? OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME
      : OmniScriptMigrationTool.OMNISCRIPTDEFINITION_NAME;
  }

  private getOmniScriptDefinitionFields(): string[] {
    return this.IS_STANDARD_DATA_MODEL
      ? Object.values(OmniScriptDefinitionMappings)
      : Object.keys(OmniScriptDefinitionMappings);
  }

  /**
   * Prioritizes OmniScripts by name characteristics:
   * - Clean names (alphanumeric only) are processed first
   * - Names with special characters are processed after
   * This avoids naming conflicts during migration when special characters are cleaned
   */
  private prioritizeOmniscriptsWithoutSpecialCharacters(omniscripts: AnyJson[]): AnyJson[] {
    // Check both Type__c and SubType__c fields
    const typeField = this.getFieldKey('Type__c');
    const subTypeField = this.getFieldKey('SubType__c');
    return prioritizeCleanNamesFirst(omniscripts, [typeField, subTypeField]);
  }

  /**
   * Collects reserved keys found in PropertySet tagsToValidate
   * @param propertySet - The PropertySet JSON object to validate
   * @param foundReservedKeys - Set to collect found reserved keys
   */
  private collectReservedKeys(propertySet: any, foundReservedKeys: Set<string>): void {
    // Iterate through each tag that needs validation
    for (const tagToValidate of this.tagsToValidate) {
      const tagValue = propertySet[tagToValidate];

      if (tagValue) {
        if (typeof tagValue === 'object' && tagValue !== null) {
          // If it's an object, check all its keys
          const keys = Object.keys(tagValue);
          for (const key of keys) {
            if (this.reservedKeys.has(key)) {
              foundReservedKeys.add(key);
            }
          }
        } else if (typeof tagValue === 'string') {
          // If it's a string, check if the value itself is a reserved key
          if (this.reservedKeys.has(tagValue)) {
            foundReservedKeys.add(tagValue);
          }
        }
      }
    }
  }

  /**
   * Collects DataRaptor transform bundle dependencies from PropertySet
   * Handles: preTransformBundle, postTransformBundle, xmlPreTransformBundle, xmlPostTransformBundle,
   * and remoteOptions.preTransformBundle, remoteOptions.postTransformBundle
   * Used by: HTTP Action, Remote Action, Decision Matrix Action, Expression Set Action, PDF Action, Step
   * @param propertySet - The PropertySet JSON object
   * @param elemName - Element name for location tracking
   * @param dependencyDR - Array to collect DataRaptor dependencies
   * @param existingDataRaptorNames - Set of existing DataRaptor names
   * @param missingDR - Array to collect missing DataRaptor names
   */
  private collectTransformBundleDependencies(
    propertySet: any,
    elemName: string,
    dependencyDR: nameLocation[],
    existingDataRaptorNames: Set<string>,
    missingDR: string[]
  ): void {
    const bundleFields = [
      'preTransformBundle',
      'postTransformBundle',
      'xmlPreTransformBundle',
      'xmlPostTransformBundle',
    ];

    // Check direct transform bundle fields
    for (const field of bundleFields) {
      if (propertySet[field]) {
        const bundleName = propertySet[field];
        dependencyDR.push({ name: bundleName, location: `${elemName} (${field})` });
        if (!existingDataRaptorNames.has(bundleName)) {
          missingDR.push(bundleName);
        }
      }
    }

    // Check remoteOptions transform bundle fields
    if (propertySet.remoteOptions) {
      if (propertySet.remoteOptions.preTransformBundle) {
        const bundleName = propertySet.remoteOptions.preTransformBundle;
        dependencyDR.push({ name: bundleName, location: `${elemName} (remoteOptions.preTransformBundle)` });
        if (!existingDataRaptorNames.has(bundleName)) {
          missingDR.push(bundleName);
        }
      }
      if (propertySet.remoteOptions.postTransformBundle) {
        const bundleName = propertySet.remoteOptions.postTransformBundle;
        dependencyDR.push({ name: bundleName, location: `${elemName} (remoteOptions.postTransformBundle)` });
        if (!existingDataRaptorNames.has(bundleName)) {
          missingDR.push(bundleName);
        }
      }
    }
  }

  /**
   * Collects DataRaptor transform bundle dependencies from DocuSign Envelope Action
   * Handles: docuSignTemplatesGroup[].transformBundle
   * @param propertySet - The PropertySet JSON object
   * @param elemName - Element name for location tracking
   * @param dependencyDR - Array to collect DataRaptor dependencies
   * @param existingDataRaptorNames - Set of existing DataRaptor names
   * @param missingDR - Array to collect missing DataRaptor names
   */
  private collectDocuSignBundleDependencies(
    propertySet: any,
    elemName: string,
    dependencyDR: nameLocation[],
    existingDataRaptorNames: Set<string>,
    missingDR: string[]
  ): void {
    if (Array.isArray(propertySet.docuSignTemplatesGroup)) {
      propertySet.docuSignTemplatesGroup.forEach((template: any, index: number) => {
        if (template && template.transformBundle) {
          const bundleName = template.transformBundle;
          dependencyDR.push({
            name: bundleName,
            location: `${elemName} (docuSignTemplatesGroup[${index}].transformBundle)`,
          });
          if (!existingDataRaptorNames.has(bundleName)) {
            missingDR.push(bundleName);
          }
        }
      });
    }
  }

  /**
   * Collects DataRaptor transform bundle dependencies from DocuSign Signature Action
   * Handles: docuSignTemplatesGroupSig[].transformBundle
   * @param propertySet - The PropertySet JSON object
   * @param elemName - Element name for location tracking
   * @param dependencyDR - Array to collect DataRaptor dependencies
   * @param existingDataRaptorNames - Set of existing DataRaptor names
   * @param missingDR - Array to collect missing DataRaptor names
   */
  private collectDocuSignSignatureBundleDependencies(
    propertySet: any,
    elemName: string,
    dependencyDR: nameLocation[],
    existingDataRaptorNames: Set<string>,
    missingDR: string[]
  ): void {
    if (Array.isArray(propertySet.docuSignTemplatesGroupSig)) {
      propertySet.docuSignTemplatesGroupSig.forEach((template: any, index: number) => {
        if (template && template.transformBundle) {
          const bundleName = template.transformBundle;
          dependencyDR.push({
            name: bundleName,
            location: `${elemName} (docuSignTemplatesGroupSig[${index}].transformBundle)`,
          });
          if (!existingDataRaptorNames.has(bundleName)) {
            missingDR.push(bundleName);
          }
        }
      });
    }
  }

  /**
   * Collects DataRaptor transform bundle dependencies from OmniProcess PropertySetConfig persistentComponent array
   * Handles: persistentComponent[].remoteOptions.preTransformBundle, persistentComponent[].remoteOptions.postTransformBundle,
   *          persistentComponent[].preTransformBundle, persistentComponent[].postTransformBundle
   * @param omniscript - The OmniScript/Integration Procedure record
   * @param dependencyDR - Array to collect DataRaptor dependencies
   * @param existingDataRaptorNames - Set of existing DataRaptor names
   * @param missingDR - Array to collect missing DataRaptor names
   */
  private collectPersistentComponentBundleDependencies(
    omniscript: AnyJson,
    dependencyDR: nameLocation[],
    existingDataRaptorNames: Set<string>,
    missingDR: string[]
  ): void {
    const propertySetConfigStr = omniscript[this.getFieldKey('PropertySet__c')];
    if (!propertySetConfigStr) {
      return;
    }

    let propertySetConfig: any;
    try {
      propertySetConfig = JSON.parse(propertySetConfigStr);
    } catch (ex) {
      Logger.error(`Failed to parse PropertySetConfig for assessment: ${omniscript['Name']}`);
      return;
    }

    if (!propertySetConfig || !Array.isArray(propertySetConfig.persistentComponent)) {
      return;
    }

    const bundleFields = ['preTransformBundle', 'postTransformBundle'];

    propertySetConfig.persistentComponent.forEach((component: any, index: number) => {
      if (!component) {
        return;
      }

      // Check remoteOptions transform bundle fields
      if (component.remoteOptions) {
        bundleFields.forEach((field) => {
          if (component.remoteOptions[field]) {
            const bundleName = component.remoteOptions[field];
            dependencyDR.push({
              name: bundleName,
              location: `persistentComponent[${index}].remoteOptions.${field}`,
            });
            if (!existingDataRaptorNames.has(bundleName)) {
              missingDR.push(bundleName);
            }
          }
        });
      }

      // Check direct transform bundle fields
      bundleFields.forEach((field) => {
        if (component[field]) {
          const bundleName = component[field];
          dependencyDR.push({
            name: bundleName,
            location: `persistentComponent[${index}].${field}`,
          });
          if (!existingDataRaptorNames.has(bundleName)) {
            missingDR.push(bundleName);
          }
        }
      });
    });
  }

  private getElementFieldKey(fieldName: string): string {
    return this.IS_STANDARD_DATA_MODEL ? ElementMappings[fieldName] : this.namespacePrefix + fieldName;
  }

  private getFieldKey(fieldName: string): string {
    return this.IS_STANDARD_DATA_MODEL ? OmniScriptMappings[fieldName] : this.namespacePrefix + fieldName;
  }

  private getQueryNamespace(): string {
    return this.IS_STANDARD_DATA_MODEL ? '' : this.namespace;
  }

  getOmniscriptObjectName(): string {
    return this.IS_STANDARD_DATA_MODEL
      ? OmniScriptMigrationTool.OMNIPROCESS_NAME
      : OmniScriptMigrationTool.OMNISCRIPT_NAME;
  }

  private getElementObjectName(): string {
    return this.IS_STANDARD_DATA_MODEL
      ? OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME
      : OmniScriptMigrationTool.ELEMENT_NAME;
  }

  private sleep() {
    return new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });
  }
}

export enum OmniScriptExportType {
  All,
  OS,
  IP,
}
