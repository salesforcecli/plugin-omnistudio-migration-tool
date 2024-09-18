/* eslint-disable */
import OmniProcessMappings from '../mappings/OmniProcess';
import ElementImports from '../mappings/Element';
import { OmniScriptMigrationTool, OmniScriptExportType } from './omniscript';
import { Logger } from '@salesforce/core';
export class RemoteActionMigration {
  static readonly OMNIPROCESS_NAME = 'OmniProcess__c';
  static readonly OMNIREMOTEACTION_NAME = 'OmniRemoteAction';
  private omniScriptMigrationTool: OmniScriptMigrationTool;

  getName(): string {
    return 'OmniProcessMigrationTool';
  }

  getRecordName(record: string) {
    return record['Name'];
  }

  constructor(
    private namespace: string,
    private conn: any,
    private logger: Logger,
    private messages: any,
    private ux: any,
    private allVersions: boolean
  ) {
    // Initialize OmniScriptMigrationTool
    this.omniScriptMigrationTool = new OmniScriptMigrationTool(
      OmniScriptExportType.OS,
      this.namespace,
      this.conn,
      this.logger,
      this.messages,
      this.ux,
      this.allVersions
    );
  }
  /**
   *
   * @returns
   */
  public async migrateApexClasses() {
    try {
      const allOS = await this.omniScriptMigrationTool.getAllOmniScripts();
      if (allOS.length === 0) {
        this.logger.info('No OmniScripts found.');
        return;
      }

      // Filter OmniScripts of type 'os' or 'ip'
      const relevantOS = allOS.filter((osRecord) => {
        let typeConst = this.namespace + '__' + OmniProcessMappings.OmniProcessType;
        return osRecord[typeConst] === 'OmniScript' || osRecord[typeConst] === 'Integration Procedure';
      });

      if (relevantOS.length === 0) {
        this.logger.info('No relevant OmniScripts found.');
        return;
      }

      // Fetch elements for all relevant OmniScripts concurrently using Promise.all
      const fetchElementsPromises = relevantOS.map(async (osRecord) => {
        const omniScriptId = osRecord['Id'];
        let processNameField = OmniProcessMappings.Name;
        const processName = osRecord[processNameField];
        try {
          const elements = await this.omniScriptMigrationTool.getAllElementsForOmniScript(omniScriptId);
          return {
            omniScriptId,
            processName,
            typeConst: osRecord[this.namespace + '__' + OmniProcessMappings.OmniProcessType],
            elements,
          };
        } catch (error) {
          this.logger.error(`Error fetching elements for OmniScript ID: ${omniScriptId}`, error);
          return null;
        }
      });

      const fetchedData = await Promise.all(fetchElementsPromises);
      // Process the fetched elements
      fetchedData.forEach((osData) => {
        if (!osData || osData.elements.length === 0) {
          this.logger.info(`No elements found for OmniScript ID: ${osData?.omniScriptId}`);
          return;
        }

        osData.elements.forEach((element) => {
          const elementTypeConst = this.namespace + '__' + ElementImports.Type__c + '__c';
          const propertyTypeConst = this.namespace + '__' + ElementImports.PropertySet + '__c';
          if (element[elementTypeConst] === 'Remote Action') {
            try {
              let propertySet = JSON.parse(element[propertyTypeConst]);
              let extractedData = [];

              if (propertySet.remoteClass && propertySet.remoteMethod) {
                // Construct the object with the required fields
                let extractedItem = {
                  type: osData.typeConst,
                  omniProcessId: osData.omniScriptId,
                  name: osData.processName,
                  remoteClass: propertySet.remoteClass,
                  remoteMethod: propertySet.remoteMethod,
                };
                extractedData.push(extractedItem);
                console.log('extracted data ::::', extractedData);
                // You can handle the extracted data here (e.g., log it, store it, etc.)
              }
            } catch (error) {
              this.logger.error(`Error parsing property set JSON for element: ${osData.omniScriptId}`, error);
            }
          }
        });
      });
    } catch (error) {
      this.logger.error('Error during migration:', error);
    }
  }
}
