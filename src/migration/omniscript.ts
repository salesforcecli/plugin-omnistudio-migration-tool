/* eslint-disable */
import { AnyJson } from '@salesforce/ts-types';

import OmniScriptMappings from '../mappings/OmniScript';
import ElementMappings from '../mappings/Element';
import OmniScriptDefinitionMappings from '../mappings/OmniScriptDefinition';
import { DataRaptorAssessmentInfo, DebugTimer, FlexCardAssessmentInfo, QueryTools, SortDirection } from '../utils';
import { BaseMigrationTool } from './base';
import { MigrationResult, MigrationTool, TransformData, UploadRecordResult } from './interfaces';
import { ObjectMapping } from './interfaces';
import { NetUtils, RequestMethod } from '../utils/net';
import { Connection, Messages } from '@salesforce/core';
import { UX } from '@salesforce/command';
import { OSAssessmentInfo, OmniAssessmentInfo, IPAssessmentInfo } from '../../src/utils';
import { Logger } from '../utils/logger';

export class OmniScriptMigrationTool extends BaseMigrationTool implements MigrationTool {
  private readonly exportType: OmniScriptExportType;
  private readonly allVersions: boolean;

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
    messages: Messages,
    ux: UX,
    allVersions: boolean
  ) {
    super(namespace, connection, logger, messages, ux);
    this.exportType = exportType;
    this.allVersions = allVersions;
  }

  getName(): string {
    return 'OmniScript / Integration Procedures';
  }

  getRecordName(record: string) {
    return (
      record[this.namespacePrefix + 'Type__c'] +
      '_' +
      record[this.namespacePrefix + 'SubType__c'] +
      (record[this.namespacePrefix + 'Language__c'] ? '_' + record[this.namespacePrefix + 'Language__c'] : '') +
      '_' +
      record[this.namespacePrefix + 'Version__c']
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
      throw new Error(this.messages.getMessage('couldNotTruncateOmnniProcess').formatUnicorn(objectName));
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

  public async assess(dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[], flexCardAssessmentInfos: FlexCardAssessmentInfo[]): Promise<OmniAssessmentInfo> {
    try {
      const omniscripts = await this.getAllOmniScripts();
      const omniAssessmentInfos = this.processOmniComponents(omniscripts);
      return omniAssessmentInfos;
    } catch (err) {
      //Logger.logger.error(`Error processing ${file.name}`);
      Logger.logger.error(err);
      this.ux.log(err);
      this.ux.log(err.getMessage());
    }
    
    
    //const osAssessmentInfos: OSAssessmentInfo[] = [];
    //return osAssessmentInfos;
  }

  public async processOmniComponents(omniscripts: AnyJson[]): Promise<OmniAssessmentInfo> {
      const osAssessmentInfos: OSAssessmentInfo[] = [];
      const ipAssessmentInfos: IPAssessmentInfo[] = [];

      const limitedOmniscripts = omniscripts.slice(0, 200);

      // Create a set to store existing OmniScript names
      const existingOmniscriptNames = new Set<string>();

      // First, collect all OmniScript names from the omniscripts array
      for (const omniscript of limitedOmniscripts) {
          const omniScriptName = `${omniscript[this.namespacePrefix + 'Name']}`;
          existingOmniscriptNames.add(omniScriptName);
      }

      // Now process each OmniScript and its elements
      for (const omniscript of limitedOmniscripts) {
          // Await here since processOSComponents is now async
          const elements = await this.getAllElementsForOmniScript(omniscript['Id']);

          const dependencyIP: string[] = [];
          const missingIP: string[] = [];
          const dependencyDR: string[] = [];
          const missingDR: string[] = [];
          const dependencyOS: string[] = [];
          const missingOS: string[] = [];

          for (const elem of elements) {
              const type = elem[this.namespacePrefix + 'Type__c'];

              // Check for OmniScript
              if (type === "OmniScript") {
                  const nameVal = `${elem['Name']}_OmniScript`;
                  missingOS.push(nameVal);
                  // Only add if the name does not exist in existingOmniscriptNames
                  if (!existingOmniscriptNames.has(nameVal)) {
                      dependencyOS.push(nameVal);
                      existingOmniscriptNames.add(nameVal); // Add to the set
                  }
              }

              // Check for Integration Procedure Action
              if (type === "Integration Procedure Action") {
                  const nameVal = `${elem['Name']}_Integration Procedure Action`;
                  dependencyIP.push(nameVal);
                  // Only add if the name does not exist in existingOmniscriptNames
                  if (!existingOmniscriptNames.has(nameVal)) {
                      missingIP.push(nameVal);
                      existingOmniscriptNames.add(nameVal); // Add to the set
                  }
              }

              // Check for DataRaptor types
              if (
                  type === "DataRaptor Extract Action" || 
                  type === "DataRaptor Turbo Action" || 
                  type === "DataRaptor Post Action"
              ) {
                  const nameVal = `${elem['Name']}_${type}`;

                  // Only add if the name does not exist in existingOmniscriptNames
                  if (!existingOmniscriptNames.has(nameVal)) {
                      dependencyDR.push(nameVal);
                      existingOmniscriptNames.add(nameVal); // Add to the set
                  }
              }
          }

          const recordName = `${omniscript[this.namespacePrefix + 'Type__c']}_` +
                            `${omniscript[this.namespacePrefix + 'SubType__c']}` +
                            (omniscript[this.namespacePrefix + 'Language__c'] ? `_${omniscript[this.namespacePrefix + 'Language__c']}` : '') +
                            `_${omniscript[this.namespacePrefix + 'Version__c']}`;

          const omniProcessType = omniscript[this.namespacePrefix + 'IsProcedure__c'] ? 'Integration Procedure' : 'OmniScript';

          if (omniProcessType == 'OmniScript') {
              const osAssessmentInfo: OSAssessmentInfo = {
                  name: recordName,
                  id: omniscript['Id'],
                  dependenciesIP: [],
                  missingIP: dependencyIP,
                  dependenciesDR: [],
                  missingDR: dependencyDR,
                  dependenciesOS: [],
                  missingOS: dependencyOS,
                  infos: [],
                  warnings: [],
                  errors: [],
                  path: '',
              };
              osAssessmentInfos.push(osAssessmentInfo);
          } else {
              const ipAssessmentInfo: IPAssessmentInfo = {
                  name: recordName,
                  id: omniscript['Id'],
                  dependenciesIP: dependencyIP,
                  dependenciesDR: dependencyDR,
                  dependenciesOS: dependencyOS,
                  infos: [],
                  warnings: [],
                  errors: [],
                  path: '',
              };
              ipAssessmentInfos.push(ipAssessmentInfo);
          }
      }

      const omniAssessmentInfo: OmniAssessmentInfo = {
          osAssessmentInfos: osAssessmentInfos,
          ipAssessmentInfos: ipAssessmentInfos
      }

      return omniAssessmentInfo;
  }


  async migrate(): Promise<MigrationResult[]> {
    // Get All Records from OmniScript__c (IP & OS Parent Records)
    const omniscripts = await this.getAllOmniScripts();
    const duplicatedNames = new Set<string>();

    // Variables to be returned After Migration
    let done = 0;
    let originalOsRecords = new Map<string, any>();
    let osUploadInfo = new Map<string, UploadRecordResult>();
    const total = omniscripts.length;

    for (let omniscript of omniscripts) {
      const mappedRecords = [];
      // const originalRecords = new Map<string, AnyJson>();
      const recordId = omniscript['Id'];
      const isOsActive = omniscript[`${this.namespacePrefix}IsActive__c`];

      this.reportProgress(total, done);

      // Create a map of the original OmniScript__c records
      originalOsRecords.set(recordId, omniscript);

      // Record is Active, Elements can't be Added, Modified or Deleted for that OS/IP
      omniscript[`${this.namespacePrefix}IsActive__c`] = false;

      // Get All elements for each OmniScript__c record(i.e IP/OS)
      const elements = await this.getAllElementsForOmniScript(recordId);

      // Perform the transformation for OS/IP Parent Record from OmniScript__c
      const mappedOmniScript = this.mapOmniScriptRecord(omniscript);

      // Clean type, subtype
      mappedOmniScript[OmniScriptMappings.Type__c] = this.cleanName(mappedOmniScript[OmniScriptMappings.Type__c]);
      mappedOmniScript[OmniScriptMappings.SubType__c] = this.cleanName(mappedOmniScript[OmniScriptMappings.SubType__c]);

      // Check duplicated name
      let mappedOsName;
      if (this.allVersions) {
        mappedOmniScript[OmniScriptMappings.Version__c] = omniscript[`${this.namespacePrefix}Version__c`];
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

      if (duplicatedNames.has(mappedOsName)) {
        this.setRecordErrors(omniscript, this.messages.getMessage('duplicatedOSName'));
        originalOsRecords.set(recordId, omniscript);
        continue;
      }

      // Save the mapped record
      duplicatedNames.add(mappedOsName);
      mappedRecords.push(mappedOmniScript);

      // Save the OmniScript__c records to Standard BPO i.e OmniProcess
      const osUploadResponse = await NetUtils.createOne(
        this.connection,
        OmniScriptMigrationTool.OMNIPROCESS_NAME,
        recordId,
        mappedOmniScript
      );

      if (osUploadResponse.success) {
        // Fix errors
        if (!osUploadResponse.success) {
          osUploadResponse.errors = Array.isArray(osUploadResponse.errors)
            ? osUploadResponse.errors
            : [osUploadResponse.errors];
        }

        osUploadResponse.warnings = osUploadResponse.warnings || [];

        const originalOsName =
          omniscript[this.namespacePrefix + 'Type__c'] +
          '_' +
          omniscript[this.namespacePrefix + 'SubType__c'] +
          '_' +
          omniscript[this.namespacePrefix + 'Language__c'];
        if (originalOsName !== mappedOsName) {
          osUploadResponse.newName = mappedOsName;
          osUploadResponse.warnings.unshift(
            'WARNING: OmniScript name has been modified to fit naming rules: ' + mappedOsName
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

              osUploadResponse.errors.push(this.messages.getMessage('errorWhileActivatingOs') + updateResult.errors);
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

          osUploadResponse.errors.push(this.messages.getMessage('errorWhileCreatingElements') + error);
        } finally {
          // Create the return records and response which have been processed
          osUploadInfo.set(recordId, osUploadResponse);
        }
      }

      originalOsRecords.set(recordId, omniscript);

      done++;
    }

    const objectMigrationResults: MigrationResult[] = [];

    if (this.exportType === OmniScriptExportType.All || this.exportType === OmniScriptExportType.IP) {
      objectMigrationResults.push(
        this.getMigratedRecordsByType('Integration Procedures', osUploadInfo, originalOsRecords)
      );
    }
    if (this.exportType === OmniScriptExportType.All || this.exportType === OmniScriptExportType.OS) {
      objectMigrationResults.push(this.getMigratedRecordsByType('OmniScripts', osUploadInfo, originalOsRecords));
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
        (type === 'Integration Procedures' && record[`${this.namespacePrefix}IsProcedure__c`]) ||
        (type === 'OmniScripts' && !record[`${this.namespacePrefix}IsProcedure__c`])
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

  // Get All OmniScript__c records i.e All IP & OS 
  private async getAllOmniScripts(): Promise<AnyJson[]> {
    //DebugTimer.getInstance().lap('Query OmniScripts');
    this.logger.info('allVersions : ' + this.allVersions);
    const filters = new Map<string, any>();

    if (this.exportType === OmniScriptExportType.IP) {
      filters.set(this.namespacePrefix + 'IsProcedure__c', true);
    } else if (this.exportType === OmniScriptExportType.OS) {
      filters.set(this.namespacePrefix + 'IsProcedure__c', false);
    }

    if (this.allVersions) {
      const sortFields = [
        { field: this.namespacePrefix + 'Type__c', direction: SortDirection.ASC },
        { field: this.namespacePrefix + 'SubType__c', direction: SortDirection.ASC },
        { field: this.namespacePrefix + 'Version__c', direction: SortDirection.ASC },
      ];
      return await QueryTools.queryWithFilterAndSort(
        this.connection,
        this.namespace,
        OmniScriptMigrationTool.OMNISCRIPT_NAME,
        this.getOmniScriptFields(),
        filters,
        sortFields
      );
    } else {
      filters.set(this.namespacePrefix + 'IsActive__c', true);
      return await QueryTools.queryWithFilter(
        this.connection,
        this.namespace,
        OmniScriptMigrationTool.OMNISCRIPT_NAME,
        this.getOmniScriptFields(),
        filters
      );
    }
  }

  // Get All Elements w.r.t OmniScript__c i.e Elements tagged to passed in IP/OS
  private async getAllElementsForOmniScript(recordId: string): Promise<AnyJson[]> {
    // Query all Elements for an OmniScript
    const filters = new Map<string, any>();
    filters.set(this.namespacePrefix + 'OmniScriptId__c', recordId);

    // const queryFilterStr = ` Where ${this.namespacePrefix}OmniScriptId__c = '${omniScriptData.keys().next().value}'`;
    return await QueryTools.queryWithFilter(
      this.connection,
      this.namespace,
      OmniScriptMigrationTool.ELEMENT_NAME,
      this.getElementFields(),
      filters
    );
  }

  // Get All Compiled Definitions w.r.t OmniScript__c i.e Definitions tagged to passed in IP/OS
  private async getOmniScriptCompiledDefinition(recordId: string): Promise<AnyJson[]> {
    // Query all Definitions for an OmniScript
    const filters = new Map<string, any>();
    filters.set(this.namespacePrefix + 'OmniScriptId__c', recordId);

    // const queryFilterStr = ` Where ${this.namespacePrefix}OmniScriptId__c = '${omniScriptData.keys().next().value}'`;
    return await QueryTools.queryWithFilter(
      this.connection,
      this.namespace,
      OmniScriptMigrationTool.OMNISCRIPTDEFINITION_NAME,
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
        if (element[`${this.namespacePrefix}Level__c`] === levelCount) {
          let elementId = element['Id'];
          let elementParentId = element[`${this.namespacePrefix}ParentElementId__c`];
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
        // Upload the transformed Element__c
        let elementsUploadResponse = await this.uploadTransformedData(
          OmniScriptMigrationTool.OMNIPROCESSELEMENT_NAME,
          elementsTransformedData
        );
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
    return await this.uploadTransformedData(OmniScriptMigrationTool.OMNIPROCESSCOMPILATION_NAME, osDefinitionsData);
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
    const mappedObject = {};

    // Get the fields of the record
    const recordFields = Object.keys(omniScriptRecord);

    // Map individual fields
    recordFields.forEach((recordField) => {
      const cleanFieldName = this.getCleanFieldName(recordField);

      if (OmniScriptMappings.hasOwnProperty(cleanFieldName)) {
        mappedObject[OmniScriptMappings[cleanFieldName]] = omniScriptRecord[recordField];
      }
    });

    mappedObject['Name'] = this.cleanName(mappedObject['Name']);

    // BATCH framework requires that each record has an "attributes" property
    mappedObject['attributes'] = {
      type: OmniScriptMigrationTool.OMNIPROCESS_NAME,
      referenceId: omniScriptRecord['Id'],
    };

    return mappedObject;
  }

  // Maps an individual Element into an OmniProcessElement record
  private mapElementData(
    elementRecord: AnyJson,
    omniProcessId: string,
    parentElementUploadResponse: Map<String, UploadRecordResult>,
    invalidIpReferences: Map<String, String>
  ) {
    // Transformed object
    const mappedObject = {};

    // Get the fields of the record
    const recordFields = Object.keys(elementRecord);

    // Map individual fields
    recordFields.forEach((recordField) => {
      const cleanFieldName = this.getCleanFieldName(recordField);

      if (ElementMappings.hasOwnProperty(cleanFieldName)) {
        mappedObject[ElementMappings[cleanFieldName]] = elementRecord[recordField];

        if (
          cleanFieldName === 'ParentElementId__c' &&
          parentElementUploadResponse.has(elementRecord[`${this.namespacePrefix}ParentElementId__c`])
        ) {
          mappedObject[ElementMappings[cleanFieldName]] = parentElementUploadResponse.get(
            elementRecord[`${this.namespacePrefix}ParentElementId__c`]
          ).id;
        }
      }
    });

    // Set the parent/child relationship
    mappedObject['OmniProcessId'] = omniProcessId;

    // We need to fix the child references
    const elementType = mappedObject[ElementMappings.Type__c];
    const propertySet = JSON.parse(mappedObject[ElementMappings.PropertySet__c] || '{}');
    switch (elementType) {
      case 'OmniScript':
        propertySet['Type'] = this.cleanName(propertySet['Type']);
        propertySet['Sub Type'] = this.cleanName(propertySet['Sub Type']);
        break;
      case 'Integration Procedure Action':
        const remoteOptions = propertySet['remoteOptions'] || {};
        remoteOptions['preTransformBundle'] = this.cleanName(remoteOptions['preTransformBundle']);
        remoteOptions['postTransformBundle'] = this.cleanName(remoteOptions['postTransformBundle']);
        propertySet['remoteOptions'] = remoteOptions;

        propertySet['preTransformBundle'] = this.cleanName(propertySet['preTransformBundle']);
        propertySet['postTransformBundle'] = this.cleanName(propertySet['postTransformBundle']);

        // We can't update the IP references, we need to let the user know
        const key: String = propertySet['integrationProcedureKey'] || '';
        if (key) {
          const parts = key.split('_');
          const newKey = parts.map((p) => this.cleanName(p, true)).join('_');
          if (parts.length > 2) {
            invalidIpReferences.set(mappedObject[ElementMappings.Name], key);
          }
          propertySet['integrationProcedureKey'] = newKey;
        }
        break;
      case 'DataRaptor Turbo Action':
      case 'DataRaptor Transform Action':
      case 'DataRaptor Post Action':
      case 'DataRaptor Extract Action':
        propertySet['bundle'] = this.cleanName(propertySet['bundle']);
        break;
    }

    mappedObject[ElementMappings.PropertySet__c] = JSON.stringify(propertySet);
    mappedObject['Name'] = this.cleanName(mappedObject['Name']);

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
    const mappedObject = {};

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
      referenceId: osDefinition['Id'],
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
