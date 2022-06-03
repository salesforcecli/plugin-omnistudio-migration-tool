/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable */

import * as os from 'os';
import { flags } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import '../../../utils/prototypes';
import OmniStudioBaseCommand from '../../basecommand';
import { MetaDataObjNameCheck } from '../../../migration/metadataobjnamecheck';
import { DataRaptorMigrationTool } from '../../../migration/dataraptor';
import { DebugTimer, MigratedObject, MigratedRecordInfo } from '../../../utils';
import { MigrationResult, MigrationTool } from '../../../migration/interfaces';
import { ResultsBuilder } from '../../../utils/resultsbuilder';
import { CardMigrationTool } from '../../../migration/flexcard';
import { OmniScriptExportType, OmniScriptMigrationTool } from '../../../migration/omniscript';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'migrate');

export default class Migrate extends OmniStudioBaseCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = messages.getMessage('examples').split(os.EOL);

  public static args = [{ name: 'file' }];

  protected static flagsConfig = {
    namespace: flags.string({
      char: 'n',
      description: messages.getMessage('namespaceFlagDescription'),
    }),
    only: flags.string({
      char: 'o',
      description: messages.getMessage('onlyFlagDescription')
    })
  };


  public async run(): Promise<any> {
    const namespace = (this.flags.namespace || 'vlocity_ins') as string;
    const apiVersion = (this.flags.apiversion || "55.0") as string;
    const migrateOnly = (this.flags.only || "") as string;

    // this.org is guaranteed because requiresUsername=true, as opposed to supportsUsername
    const conn = this.org.getConnection();
    conn.setApiVersion(apiVersion);

    // Let's time every step
    DebugTimer.getInstance().start();


    const namecheck = new MetaDataObjNameCheck(namespace, conn, this.logger, messages);

    // Register the migration objects
    let migrationObjects: MigrationTool[] = [];
    if (!migrateOnly) {

      await namecheck.checkName('DRBundle__c');
      await namecheck.checkName('VlocityCard__c');
      await namecheck.checkName('OmniScript__c');

      migrationObjects = [
        new CardMigrationTool(namespace, conn, this.logger, messages),
        new OmniScriptMigrationTool(OmniScriptExportType.All, namespace, conn, this.logger, messages),
        new DataRaptorMigrationTool(namespace, conn, this.logger, messages)]
    } else {
      switch (migrateOnly) {
        case 'os':
          await namecheck.checkName('OmniScript__c');
          migrationObjects.push(new OmniScriptMigrationTool(OmniScriptExportType.OS, namespace, conn, this.logger, messages));
          break;
        case 'ip':
          await namecheck.checkName('OmniScript__c');
          migrationObjects.push(new OmniScriptMigrationTool(OmniScriptExportType.IP, namespace, conn, this.logger, messages));
          break;
        case 'fc':
          await namecheck.checkName('VlocityCard__c');
          migrationObjects.push(new CardMigrationTool(namespace, conn, this.logger, messages));
          break;
        case 'dr':
          await namecheck.checkName('DRBundle__c');
          migrationObjects.push(new DataRaptorMigrationTool(namespace, conn, this.logger, messages));
          break;
        default:
          throw new Error(messages.getMessage('invalidOnlyFlag'));
      }
    }

    // Migrate individual objects
    const debugTimer = DebugTimer.getInstance();
    let objectMigrationResults: MigratedObject[] = [];

    // We need to truncate the standard objects first
    let allTruncateComplete = true;
    for (let cls of migrationObjects) {
      try {
        debugTimer.lap('Truncating: ' + cls.getName());
        await cls.truncate();
      } catch (ex: any) {
        allTruncateComplete = false;
        objectMigrationResults.push({
          name: cls.getName(),
          errors: [ex.message]
        });
      }
    }

    if (allTruncateComplete) {
      for (let cls of migrationObjects) {
        try {
          debugTimer.lap('Migrating: ' + cls.getName());
          const results = await cls.migrate();

          objectMigrationResults = objectMigrationResults.concat(results.map(r => {
            return {
              name: r.name,
              data: this.mergeRecordAndUploadResults(r, cls),
            }
          }));
        } catch (ex: any) {
          console.log(JSON.stringify(ex));
          objectMigrationResults.push({
            name: cls.getName(),
            errors: [ex.message]
          });
        }
      }
    }

    // Stop the debug timer
    const timer = DebugTimer.getInstance().stop();

    await ResultsBuilder.generate(objectMigrationResults, conn.instanceUrl);

    // save timer to debug logger
    this.logger.debug(timer);

    // Return results needed for --json flag
    return { objectMigrationResults, timer };
  }

  private mergeRecordAndUploadResults(migrationResults: MigrationResult, migrationTool: MigrationTool): MigratedRecordInfo[] {

    let mergedResults = [];

    for (let record of Array.from(migrationResults.records.values())) {

      const obj = {
        id: record['Id'],
        name: migrationTool.getRecordName(record),
        status: 'Skipped',
        errors: record['errors'],
        migratedId: undefined
      }

      if (migrationResults.results.has(record['Id'])) {
        let recordResults = migrationResults.results.get(record['Id']);
        obj.status = !recordResults || recordResults.hasErrors ? 'Error' : 'Complete';
        obj.errors = obj.errors || recordResults.errors;
        obj.migratedId = recordResults.id;
      }

      mergedResults.push(obj);
    }

    return mergedResults;
  }
}
