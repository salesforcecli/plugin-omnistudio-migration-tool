/* eslint-disable */
import { Connection, Logger, Messages } from '@salesforce/core';
import { DebugTimer, QueryTools } from '../utils';
import { BaseMigrationTool } from './base';
import { NameTransformData, OriginalRecordName } from './interfaces';

export class MetaDataObjNameCheck extends BaseMigrationTool {
    constructor(namespace: string, connection: Connection, logger: Logger, messages: Messages) {
        super(namespace, connection, logger, messages);
    }

    async checkName(objName: string): Promise<any> {
        const result = await this.metaDataObjUniqueNameCheck(objName);

        return { result };
    }

    private async metaDataObjUniqueNameCheck(objName: string): Promise<NameTransformData> {
        const dupNameSet = new Set<string>(),
            validNameSet = new Set<string>(),
            longNameSet = new Set<string>(),
            originalNameSet = new Set<string>(),
            nameWithSepcialCharactorSet = new Set<string>(),
            originalRecords = new Map<string, OriginalRecordName>();
        let lookupStr = Array<string>();
        switch (objName) {
            case 'DRBundle__c':
                lookupStr = ['Name'];
                break;
            case 'VlocityCard__c':
                lookupStr = ['Name', 'Author__c'];
                break;
            case 'OmniScript__c':
                lookupStr = ['Type__c', 'SubType__c', 'Language__c'];
                break;
            default: // no-op;
        }
        const mdObjs = await QueryTools.queryAll(this.connection, this.namespace, objName, lookupStr);

        // Start transforming each dataRaptor
        DebugTimer.getInstance().lap('Name of Each Object: ');
        for (let obj of mdObjs) {
            // Skip if Type is "Migration"
            if (obj[this.namespacePrefix + 'Type__c'] === 'Migration') continue;
            const recordId = obj['Id'];
            let uniqueName: string;
            switch (objName) {
                case 'DRBundle__c':
                    uniqueName = obj['Name'];;
                    break;
                case 'VlocityCard__c':
                    uniqueName = obj['Name'] + '_' + obj[this.namespacePrefix + 'Author__c'];
                    break;
                case 'OmniScript__c':
                    uniqueName = obj[this.namespacePrefix + 'Type__c'] + '_' + obj[this.namespacePrefix + 'SubType__c'] + '_' + obj[this.namespacePrefix + 'Language__c'];
                    break;
                default: // no-op;
            }
            originalNameSet.add(uniqueName);
            let origName: string;
            origName = uniqueName;
            if (this.validMetaDataName(uniqueName) && uniqueName.length < BaseMigrationTool.NAME_LENGTH) {
                validNameSet.add(uniqueName);
                continue;
            }
            // Name length validation, 250 only
            if (uniqueName.length > BaseMigrationTool.NAME_LENGTH) {
                longNameSet.add(uniqueName);
                continue;
            }
            nameWithSepcialCharactorSet.add(uniqueName);
            uniqueName = uniqueName.replace(/[^a-zA-Z0-9]/g, '');
            if (validNameSet.has(uniqueName)) {
                dupNameSet.add(uniqueName);
            }
            // Create a map of the original records
            originalRecords.set(recordId, {
                record: obj,
                Name: origName
            });
        };
        return { originalRecords, validNameSet, originalNameSet, longNameSet, dupNameSet, nameWithSepcialCharactorSet };
    }
}