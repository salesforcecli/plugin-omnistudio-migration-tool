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
import { Constants } from '../../../utils/constants/stringContants';
import { OrgPreferences } from '../../../utils/orgPreferences';
import { MessageService } from '../../../utils/MessageService';

// Initialize Messages with the current plugin directory

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.

export default class Migrate extends OmniStudioBaseCommand {
  public static description = MessageService.getMessage('migrateCommandDescription');

  public static examples = MessageService.getMessage('migrateExamples').split(os.EOL);

  public static args = [{ name: 'file' }];

  protected static flagsConfig = {
    namespace: flags.string({
      char: 'n',
      description: MessageService.getMessage('namespaceFlagDescription'),
    }),
    only: flags.string({
      char: 'o',
      description: MessageService.getMessage('migrateOnlyFlagDescription'),
    }),
    allversions: flags.boolean({
      char: 'a',
      description: MessageService.getMessage('allVersionsDescription'),
      required: false,
    }),
    relatedobjects: flags.string({
      char: 'r',
      description: MessageService.getMessage('migrateApexLwc'),
    }),
    verbose: flags.builtin({
      type: 'builtin',
      description: 'Enable verbose output',
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public constructor(argv: string[], context: any) {
    super(argv, context);
    MessageService.init('migrate');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async run(): Promise<any> {
    Logger.initialiseLogger(this.ux, this.logger, 'migrate', this.flags.verbose);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return await this.runMigration();
    } catch (e) {
      const error = e as Error;
      Logger.error(`Error running migrate ${error.message}`);
      Logger.error(error);
      process.exit(1);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async runMigration(): Promise<any> {
    let apiVersion = this.flags.apiversion as string;
    const migrateOnly = (this.flags.only || '') as string;
    const allVersions = this.flags.allversions || (false as boolean);
    const relatedObjects = (this.flags.relatedobjects || '') as string;

    // this.org is guaranteed because requiresUsername=true, as opposed to supportsUsername
    const conn = this.org.getConnection();
    if (apiVersion) {
      conn.setApiVersion(apiVersion);
    } else {
      apiVersion = conn.getApiVersion();
    }

    const orgs: OmnistudioOrgDetails = await OrgUtils.getOrgDetails(conn, this.flags.namespace);

    if (!orgs.hasValidNamespace) {
      Logger.warn(MessageService.getMessage('invalidNamespace') + orgs.packageDetails.namespace);
    }

    if (!orgs.packageDetails) {
      Logger.error(MessageService.getMessage('noPackageInstalled'));
      return;
    }
    if (orgs.omniStudioOrgPermissionEnabled) {
      Logger.error(MessageService.getMessage('alreadyStandardModel'));
      return;
    }

    // Enable Omni preferences
    try {
      orgs.rollbackFlags = await OrgPreferences.checkRollbackFlags(conn);
      await OrgPreferences.enableOmniPreferences(conn);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.log(`Could not enable Omni preferences: ${errMsg}`);
    }

    const namespace = orgs.packageDetails.namespace;
    // Let's time every step
    DebugTimer.getInstance().start();
    let projectPath: string;
    let objectsToProcess: string[] = [];
    let targetApexNamespace: string;
    if (relatedObjects) {
      const validOptions = [Constants.Apex, Constants.LWC];
      objectsToProcess = relatedObjects.split(',').map((obj) => obj.trim());
      // Validate input
      for (const obj of objectsToProcess) {
        if (!validOptions.includes(obj)) {
          Logger.warn(MessageService.getMessage('invalidRelatedObjectsOption', [obj]));
        }
      }
      // Ask for user consent
      const consent = await Logger.confirm(MessageService.getMessage('userConsentMessage'));
      if (!consent) {
        Logger.error(MessageService.getMessage('userDeclinedConsent', [relatedObjects]));
      } else {
        Logger.info(MessageService.getMessage('userConsentedToProceed'));
        projectPath = await this.getProjectPath(relatedObjects, projectPath);
        targetApexNamespace = await this.getTargetApexNamespace(objectsToProcess, targetApexNamespace);
      }
    }

    Logger.log(MessageService.getMessage('migrationInitialization', [String(namespace)]));
    Logger.logVerbose(MessageService.getMessage('apiVersionInfo', [apiVersion]));
    Logger.logVerbose(MessageService.getMessage('migrationTargets', [migrateOnly || 'all']));
    Logger.logVerbose(MessageService.getMessage('relatedObjectsInfo', [relatedObjects || 'none']));
    Logger.logVerbose(MessageService.getMessage('allVersionsFlagInfo', [String(allVersions)]));

    // const includeLwc = this.flags.lwc ? await this.ux.confirm('Do you want to include LWC migration? (yes/no)') : false;
    // Register the migration objects
    let migrationObjects: MigrationTool[] = [];
    migrationObjects = this.getMigrationObjects(migrateOnly, migrationObjects, namespace, conn, allVersions);
    // Migrate individual objects
    const debugTimer = DebugTimer.getInstance();
    // We need to truncate the standard objects first
    let objectMigrationResults = await this.truncateObjects(migrationObjects, debugTimer);
    const allTruncateComplete = objectMigrationResults.length === 0;

    if (allTruncateComplete) {
      objectMigrationResults = await this.migrateObjects(migrationObjects, debugTimer);
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

    await ResultsBuilder.generateReport(objectMigrationResults, relatedObjectMigrationResult, conn.instanceUrl, orgs);

    // save timer to debug logger
    Logger.logVerbose(timer.toString());

    // Return results needed for --json flag
    return { objectMigrationResults };
  }

  private async truncateObjects(migrationObjects: MigrationTool[], debugTimer: DebugTimer): Promise<MigratedObject[]> {
    const objectMigrationResults: MigratedObject[] = [];
    for (const cls of migrationObjects.reverse()) {
      try {
        Logger.log(MessageService.getMessage('cleaningComponent', [cls.getName()]));
        debugTimer.lap('Cleaning: ' + cls.getName());
        await cls.truncate();
        Logger.log(MessageService.getMessage('cleaningDone', [cls.getName()]));
      } catch (ex: any) {
        objectMigrationResults.push({
          name: cls.getName(),
          errors: [ex.message],
        });
      }
    }
    return objectMigrationResults;
  }

  private async migrateObjects(migrationObjects: MigrationTool[], debugTimer: DebugTimer): Promise<MigratedObject[]> {
    let objectMigrationResults: MigratedObject[] = [];
    for (const cls of migrationObjects.reverse()) {
      try {
        Logger.log(MessageService.getMessage('migratingComponent', [cls.getName()]));
        debugTimer.lap('Migrating: ' + cls.getName());
        const results = await cls.migrate();
        Logger.log(MessageService.getMessage('migrationCompleted', [cls.getName()]));
        objectMigrationResults = objectMigrationResults.concat(
          results.map((r) => {
            return {
              name: r.name,
              data: this.mergeRecordAndUploadResults(r, cls),
            };
          })
        );
      } catch (ex: any) {
        Logger.error(JSON.stringify(ex));
        Logger.error(ex.stack);
        objectMigrationResults.push({
          name: cls.getName(),
          errors: [ex.message],
        });
      }
    }
    return objectMigrationResults;
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
        new DataRaptorMigrationTool(namespace, conn, this.logger, this.ux),
        new OmniScriptMigrationTool(OmniScriptExportType.All, namespace, conn, this.logger, this.ux, allVersions),
        new CardMigrationTool(namespace, conn, this.logger, this.ux, allVersions),
      ];
    } else {
      switch (migrateOnly) {
        case Constants.Omniscript:
          migrationObjects.push(
            new OmniScriptMigrationTool(OmniScriptExportType.OS, namespace, conn, this.logger, this.ux, allVersions)
          );
          break;
        case Constants.IntegrationProcedure:
          migrationObjects.push(
            new OmniScriptMigrationTool(OmniScriptExportType.IP, namespace, conn, this.logger, this.ux, allVersions)
          );
          break;
        case Constants.Flexcard:
          migrationObjects.push(new CardMigrationTool(namespace, conn, this.logger, this.ux, allVersions));
          break;
        case Constants.DataMapper:
          migrationObjects.push(new DataRaptorMigrationTool(namespace, conn, this.logger, this.ux));
          break;
        default:
          throw new Error(MessageService.getMessage('invalidOnlyFlag'));
      }
    }
    return migrationObjects;
  }

  private async getProjectPath(relatedObjects: string, projectPath: string): Promise<string> {
    const projectPathConfirmation = await Logger.confirm(
      MessageService.getMessage('projectPathConfirmation', [relatedObjects])
    );
    if (projectPathConfirmation) {
      Logger.info(MessageService.getMessage('userConsentedToProceed'));
      projectPath = await Logger.prompt(MessageService.getMessage('enterProjectPath', [relatedObjects]));
      const projectJsonFile = 'sfdx-project.json';
      if (!fs.existsSync(projectPath + '/' + projectJsonFile)) {
        throw new Error(MessageService.getMessage('projectJsonNotFound', [projectJsonFile, projectPath]));
      }
      Logger.log(MessageService.getMessage('usingProjectPath', [projectPath]));
    }
    return projectPath;
  }

  private async getTargetApexNamespace(objectsToProcess: string[], targetApexNamespace: string): Promise<string> {
    if (objectsToProcess.includes(Constants.Apex)) {
      targetApexNamespace = await this.ux.prompt(MessageService.getMessage('enterTargetNamespace'));
      Logger.log(MessageService.getMessage('usingTargetNamespace', [targetApexNamespace]));
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
        status: MessageService.getMessage('reportDashboardCardLabelSkipped'),
        errors: record['errors'],
        migratedId: undefined,
        warnings: [],
        migratedName: '',
      };

      if (migrationResults.results.has(record['Id'])) {
        const recordResults = migrationResults.results.get(record['Id']);

        let errors: any[] = obj.errors || [];
        errors = errors.concat(recordResults.errors || []);

        obj.status =
          !recordResults || recordResults.hasErrors
            ? MessageService.getMessage('reportDashboardCardLabelError')
            : MessageService.getMessage('reportDashboardCardLabelCompleted');
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
