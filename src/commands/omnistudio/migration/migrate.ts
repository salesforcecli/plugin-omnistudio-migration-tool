/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as os from 'os';
import * as fs from 'fs';
import { flags } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import OmniStudioBaseCommand from '../../basecommand';
import { DataRaptorMigrationTool } from '../../../migration/dataraptor';
import { DebugTimer, MigratedObject, MigratedRecordInfo } from '../../../utils';
import { MigrationResult, MigrationTool } from '../../../migration/interfaces';
import { ResultsBuilder } from '../../../utils/resultsbuilder';
import { CardMigrationTool } from '../../../migration/flexcard';
import { OmniScriptExportType, OmniScriptMigrationTool } from '../../../migration/omniscript';
import { Logger } from '../../../utils/logger';
import OmnistudioRelatedObjectMigrationFacade from '../../../migration/related/OmnistudioRelatedObjectMigrationFacade';
import { generatePackageXml } from '../../../utils/generatePackageXml';
import { OmnistudioOrgDetails, OrgUtils } from '../../../utils/orgUtils';

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
      description: messages.getMessage('onlyFlagDescription'),
    }),
    allversions: flags.boolean({
      char: 'a',
      description: messages.getMessage('allVersionsDescription'),
      required: false,
    }),
    relatedobjects: flags.string({
      char: 'r',
      description: messages.getMessage('apexLwc'),
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async run(): Promise<any> {
    const namespace = (this.flags.namespace || 'vlocity_ins') as string;
    const apiVersion = (this.flags.apiversion || '55.0') as string;
    const migrateOnly = (this.flags.only || '') as string;
    const allVersions = this.flags.allversions || false;
    const relatedObjects = (this.flags.relatedobjects || '') as string;

    Logger.initialiseLogger(this.ux, this.logger);
    this.logger = Logger.logger;
    // this.org is guaranteed because requiresUsername=true, as opposed to supportsUsername
    const conn = this.org.getConnection();
    conn.setApiVersion(apiVersion);

    const orgs: OmnistudioOrgDetails = await OrgUtils.getOrgDetails(conn, namespace);

    if (orgs.packageDetails.length === 0) {
      this.ux.log('No package installed on given org.');
      return;
    }

    if (orgs.omniStudioOrgPermissionEnabled) {
      this.ux.log('The org is already on standard data model.');
      return;
    }

    // Let's time every step
    DebugTimer.getInstance().start();
    let projectPath: string;
    let objectsToProcess: string[] = [];
    let targetApexNamespace: string;
    if (relatedObjects) {
      const validOptions = ['apex', 'lwc'];
      objectsToProcess = relatedObjects.split(',').map((obj) => obj.trim());
      // Validate input
      for (const obj of objectsToProcess) {
        if (!validOptions.includes(obj)) {
          Logger.logger.warn(`Invalid option provided for -r: ${obj}. Valid options are apex, lwc.`);
        }
      }
      // Ask for user consent
      const consent = await this.ux.confirm(
        'By proceeding further, you hereby consent to the use, accept changes to your custom code, and the accompanying terms and conditions associated with the use of the OmniStudio Migration Tool. Do you want to proceed? [y/n]'
      );
      if (!consent) {
        this.ux.error(`User declined consent, will not process ${relatedObjects} .`);
      } else {
        projectPath = await this.getProjectPath(relatedObjects, projectPath);
        targetApexNamespace = await this.getTargetApexNamespace(objectsToProcess, targetApexNamespace);
      }
    }

    // const includeLwc = this.flags.lwc ? await this.ux.confirm('Do you want to include LWC migration? (yes/no)') : false;
    // Register the migration objects
    let migrationObjects: MigrationTool[] = [];
    migrationObjects = this.getMigrationObjects(migrateOnly, migrationObjects, namespace, conn, allVersions);
    // Migrate individual objects
    const debugTimer = DebugTimer.getInstance();
    let objectMigrationResults: MigratedObject[] = [];
    // We need to truncate the standard objects first
    let allTruncateComplete = true;
    for (const cls of migrationObjects.reverse()) {
      try {
        Logger.ux.log('Cleaning: ' + cls.getName());
        debugTimer.lap('Cleaning: ' + cls.getName());
        await cls.truncate();
        Logger.ux.log('Cleaning Done: ' + cls.getName());
      } catch (ex: any) {
        allTruncateComplete = false;
        objectMigrationResults.push({
          name: cls.getName(),
          errors: [ex.message],
        });
      }
    }

    if (allTruncateComplete) {
      for (const cls of migrationObjects.reverse()) {
        try {
          this.ux.log('Migrating: ' + cls.getName());
          debugTimer.lap('Migrating: ' + cls.getName());
          const results = await cls.migrate();
          this.ux.log('Migration completed: ' + cls.getName());
          objectMigrationResults = objectMigrationResults.concat(
            results.map((r) => {
              return {
                name: r.name,
                data: this.mergeRecordAndUploadResults(r, cls),
              };
            })
          );
        } catch (ex: any) {
          this.logger.error(JSON.stringify(ex));
          objectMigrationResults.push({
            name: cls.getName(),
            errors: [ex.message],
          });
        }
      }
    }

    // Stop the debug timer
    const timer = DebugTimer.getInstance().stop();

    const omnistudioRelatedObjectsMigration = new OmnistudioRelatedObjectMigrationFacade(
      namespace,
      migrateOnly,
      allVersions,
      this.org,
      projectPath,
      targetApexNamespace
    );
    const relatedObjectMigrationResult = omnistudioRelatedObjectsMigration.migrateAll(objectsToProcess);
    generatePackageXml.createChangeList(
      relatedObjectMigrationResult.apexAssessmentInfos,
      relatedObjectMigrationResult.lwcAssessmentInfos
    );
    await ResultsBuilder.generate(objectMigrationResults, relatedObjectMigrationResult, conn.instanceUrl);

    // save timer to debug logger
    this.logger.debug(timer);

    // Return results needed for --json flag
    return { objectMigrationResults };
  }

  private getMigrationObjects(
    migrateOnly: string,
    migrationObjects: MigrationTool[],
    namespace: string,
    conn,
    allVersions: any
  ): MigrationTool[] {
    if (!migrateOnly) {
      migrationObjects = [
        new DataRaptorMigrationTool(namespace, conn, this.logger, messages, this.ux),
        new OmniScriptMigrationTool(
          OmniScriptExportType.All,
          namespace,
          conn,
          this.logger,
          messages,
          this.ux,
          allVersions
        ),
        new CardMigrationTool(namespace, conn, this.logger, messages, this.ux, allVersions),
      ];
    } else {
      switch (migrateOnly) {
        case 'os':
          migrationObjects.push(
            new OmniScriptMigrationTool(
              OmniScriptExportType.OS,
              namespace,
              conn,
              this.logger,
              messages,
              this.ux,
              allVersions
            )
          );
          break;
        case 'ip':
          migrationObjects.push(
            new OmniScriptMigrationTool(
              OmniScriptExportType.IP,
              namespace,
              conn,
              this.logger,
              messages,
              this.ux,
              allVersions
            )
          );
          break;
        case 'fc':
          migrationObjects.push(new CardMigrationTool(namespace, conn, this.logger, messages, this.ux, allVersions));
          break;
        case 'dr':
          migrationObjects.push(new DataRaptorMigrationTool(namespace, conn, this.logger, messages, this.ux));
          break;
        default:
          throw new Error(messages.getMessage('invalidOnlyFlag'));
      }
    }
    return migrationObjects;
  }

  private async getProjectPath(relatedObjects: string, projectPath: string): Promise<string> {
    const projectPathConfirmation = await this.ux
      .confirm(`Do you have a sfdc project where ${relatedObjects} files are already retrieved from org - y
          or you want tool to create a project omnistudio_migration in current directory for processing - n ? [y/n]`);
    if (projectPathConfirmation) {
      projectPath = await this.ux.prompt(`Enter the project path for processing ${relatedObjects} :`);
      const projectJsonFile = 'sfdx-project.json';
      if (!fs.existsSync(projectPath + '/' + projectJsonFile)) {
        throw new Error(`Could not find any ${projectJsonFile} in  ${projectPath}.`);
      }
      this.ux.log(`Using project path: ${projectPath}`);
    }
    return projectPath;
  }

  private async getTargetApexNamespace(objectsToProcess: string[], targetApexNamespace: string): Promise<string> {
    if (objectsToProcess.includes('apex')) {
      targetApexNamespace = await this.ux.prompt(
        'Enter the target namespace to be used for calling package Apex classes'
      );
      this.ux.log(`Using target namespace: ${targetApexNamespace} for calling package Apex classes`);
    }
    return targetApexNamespace;
  }

  private mergeRecordAndUploadResults(
    migrationResults: MigrationResult,
    migrationTool: MigrationTool
  ): MigratedRecordInfo[] {
    const mergedResults: MigratedRecordInfo[] = [];

    for (const record of Array.from(migrationResults.records.values())) {
      const obj = {
        id: record['Id'],
        name: migrationTool.getRecordName(record),
        status: 'Skipped',
        errors: record['errors'],
        migratedId: undefined,
        warnings: [],
        migratedName: '',
      };

      if (migrationResults.results.has(record['Id'])) {
        const recordResults = migrationResults.results.get(record['Id']);

        let errors: any[] = obj.errors || [];
        errors = errors.concat(recordResults.errors || []);

        obj.status = !recordResults || recordResults.hasErrors ? 'Error' : 'Complete';
        obj.errors = errors;
        obj.migratedId = recordResults.id;
        obj.warnings = recordResults.warnings;
        obj.migratedName = recordResults.newName;
      }

      mergedResults.push(obj);
    }

    return mergedResults;
  }
}
