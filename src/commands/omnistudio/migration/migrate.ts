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
import { flags } from '@salesforce/command';
import { Connection, Messages } from '@salesforce/core';
import OmniStudioBaseCommand from '../../basecommand';
import { DataRaptorMigrationTool } from '../../../migration/dataraptor';
import { DebugTimer, MigratedObject, MigratedRecordInfo } from '../../../utils';
import { MigrationResult, MigrationTool } from '../../../migration/interfaces';
import { ResultsBuilder } from '../../../utils/resultsbuilder';
import { CardMigrationTool } from '../../../migration/flexcard';
import { OmniScriptExportType, OmniScriptMigrationTool } from '../../../migration/omniscript';
import { GlobalAutoNumberMigrationTool } from '../../../migration/globalautonumber';
import { Logger } from '../../../utils/logger';
import OmnistudioRelatedObjectMigrationFacade from '../../../migration/related/OmnistudioRelatedObjectMigrationFacade';
import { generatePackageXml } from '../../../utils/generatePackageXml';
import { OmnistudioOrgDetails, OrgUtils } from '../../../utils/orgUtils';
import { Constants } from '../../../utils/constants/stringContants';
import { OrgPreferences } from '../../../utils/orgPreferences';
import { ProjectPathUtil } from '../../../utils/projectPathUtil';
import { PostMigrate } from '../../../migration/postMigrate';

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
    verbose: flags.builtin({
      type: 'builtin',
      description: 'Enable verbose output',
    }),
  };

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

    if (!orgs.hasValidNamespace && this.flags.namespace) {
      Logger.warn(messages.getMessage('invalidNamespace') + orgs.packageDetails.namespace);
    }

    if (!orgs.packageDetails) {
      Logger.error(messages.getMessage('noPackageInstalled'));
      return;
    }
    if (orgs.omniStudioOrgPermissionEnabled) {
      Logger.error(messages.getMessage('alreadyStandardModel'));
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
    const isExperienceBundleMetadataAPIProgramaticallyEnabled: { value: boolean } = { value: false };
    if (relatedObjects) {
      // To-Do: Add LWC to valid options when GA is released
      const validOptions = [Constants.Apex, Constants.ExpSites];
      objectsToProcess = relatedObjects.split(',').map((obj) => obj.trim());
      // Validate input
      for (const obj of objectsToProcess) {
        if (!validOptions.includes(obj)) {
          Logger.error(messages.getMessage('invalidRelatedObjectsOption', [obj]));
          process.exit(1);
        }
      }
      // Check for general consent to make modifications with OMT
      const generalConsent = await this.getGeneralConsent();
      if (generalConsent) {
        // Use ProjectPathUtil for APEX project folder selection (matches assess.ts logic)
        projectPath = await ProjectPathUtil.getProjectPath(messages, true);
        targetApexNamespace = await this.getTargetApexNamespace(objectsToProcess, targetApexNamespace);
        await this.handleExperienceSitePrerequisites(
          objectsToProcess,
          conn,
          isExperienceBundleMetadataAPIProgramaticallyEnabled
        );
        Logger.logVerbose(
          'The objects to process after handleExpSitePrerequisite are ' + JSON.stringify(objectsToProcess)
        );
      } // TODO - What if general consent is no
    }

    Logger.log(messages.getMessage('migrationInitialization', [String(namespace)]));
    Logger.log(messages.getMessage('apiVersionInfo', [apiVersion]));
    Logger.logVerbose(messages.getMessage('migrationTargets', [migrateOnly || 'all']));
    Logger.logVerbose(messages.getMessage('relatedObjectsInfo', [relatedObjects || 'none']));
    Logger.logVerbose(messages.getMessage('allVersionsFlagInfo', [String(allVersions)]));

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

    // POST MIGRATION
    let actionItems = [];
    const postMigrate: PostMigrate = new PostMigrate(
      this.org,
      namespace,
      conn,
      this.logger,
      messages,
      this.ux,
      objectsToProcess
    );

    actionItems = await postMigrate.setDesignersToUseStandardDataModel(namespace);
    await postMigrate.restoreExperienceAPIMetadataSettings(isExperienceBundleMetadataAPIProgramaticallyEnabled);
    const migrationActionItems = this.collectActionItems(objectMigrationResults);
    actionItems = [...actionItems, ...migrationActionItems];

    await ResultsBuilder.generateReport(
      objectMigrationResults,
      relatedObjectMigrationResult,
      conn.instanceUrl,
      orgs,
      messages,
      actionItems
    );

    // save timer to debug logger
    Logger.logVerbose(timer.toString());

    // Return results needed for --json flag
    return { objectMigrationResults };
  }

  private async handleExperienceSitePrerequisites(
    objectsToProcess: string[],
    conn: Connection,
    isExperienceBundleMetadataAPIProgramaticallyEnabled: { value: boolean }
  ): Promise<void> {
    if (objectsToProcess.includes(Constants.ExpSites)) {
      const expMetadataApiConsent = await this.getExpSiteMetadataEnableConsent();
      Logger.logVerbose(`The consent for exp site is  ${expMetadataApiConsent}`);

      if (expMetadataApiConsent === false) {
        Logger.warn('Consent for experience sites is not provided. Experience sites will not be processed');
        this.removeKeyFromRelatedObjectsToProcess(Constants.ExpSites, objectsToProcess);
        Logger.logVerbose(`Objects to process after removing expsite are ${JSON.stringify(objectsToProcess)}`);
        return;
      }

      const isMetadataAPIPreEnabled = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(conn);
      if (isMetadataAPIPreEnabled === true) {
        Logger.logVerbose('ExperienceBundle metadata api is already enabled');
        return;
      }

      Logger.logVerbose('ExperienceBundle metadata api needs to be programatically enabled');
      isExperienceBundleMetadataAPIProgramaticallyEnabled.value = await OrgPreferences.setExperienceBundleMetadataAPI(
        conn,
        true
      );
      if (isExperienceBundleMetadataAPIProgramaticallyEnabled.value === false) {
        this.removeKeyFromRelatedObjectsToProcess(Constants.ExpSites, objectsToProcess);
        Logger.warn('Since the api could not able enabled the experience sites would not be processed');
      }

      Logger.logVerbose(`Objects to process are ${JSON.stringify(objectsToProcess)}`);
    }
  }

  private collectActionItems(objectMigrationResults: MigratedObject[]): string[] {
    const actionItems: string[] = [];
    // Collect errors from migration results and add them to action items
    for (const result of objectMigrationResults) {
      if (result.errors && result.errors.length > 0) {
        actionItems.push(...result.errors);
      }
    }

    return actionItems;
  }

  private removeKeyFromRelatedObjectsToProcess(keyToRemove: string, relatedObjects: string[]): void {
    const index = relatedObjects.indexOf(Constants.ExpSites);
    if (index > -1) {
      relatedObjects.splice(index, 1);
    }
  }

  private async truncateObjects(migrationObjects: MigrationTool[], debugTimer: DebugTimer): Promise<MigratedObject[]> {
    const objectMigrationResults: MigratedObject[] = [];
    for (const cls of migrationObjects.reverse()) {
      try {
        Logger.log(messages.getMessage('cleaningComponent', [cls.getName()]));
        debugTimer.lap('Cleaning: ' + cls.getName());
        await cls.truncate();
        Logger.log(messages.getMessage('cleaningDone', [cls.getName()]));
      } catch (ex: any) {
        objectMigrationResults.push({
          name: cls.getName(),
          data: [],
          errors: [ex.message],
        });
        Logger.error(messages.getMessage('cleaningFailed', [cls.getName()]));
      }
    }
    return objectMigrationResults;
  }

  private async migrateObjects(migrationObjects: MigrationTool[], debugTimer: DebugTimer): Promise<MigratedObject[]> {
    let objectMigrationResults: MigratedObject[] = [];
    for (const cls of migrationObjects.reverse()) {
      try {
        Logger.log(messages.getMessage('migratingComponent', [cls.getName()]));
        debugTimer.lap('Migrating: ' + cls.getName());
        const results = await cls.migrate();
        Logger.log(messages.getMessage('migrationCompleted', [cls.getName()]));
        objectMigrationResults = objectMigrationResults.concat(
          results.map((r) => {
            return {
              name: r.name,
              data: this.mergeRecordAndUploadResults(r, cls),
              errors: r.errors,
            };
          })
        );
      } catch (ex: any) {
        Logger.error(JSON.stringify(ex));
        Logger.error(ex.stack);
        objectMigrationResults.push({
          name: cls.getName(),
          data: [],
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
        new GlobalAutoNumberMigrationTool(namespace, conn, this.logger, messages, this.ux),
      ];
    } else {
      switch (migrateOnly) {
        case Constants.Omniscript:
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
        case Constants.IntegrationProcedure:
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
        case Constants.Flexcard:
          migrationObjects.push(new CardMigrationTool(namespace, conn, this.logger, messages, this.ux, allVersions));
          break;
        case Constants.DataMapper:
          migrationObjects.push(new DataRaptorMigrationTool(namespace, conn, this.logger, messages, this.ux));
          break;
        case Constants.GlobalAutoNumber:
          migrationObjects.push(new GlobalAutoNumberMigrationTool(namespace, conn, this.logger, messages, this.ux));
          break;
        default:
          throw new Error(messages.getMessage('invalidOnlyFlag'));
      }
    }
    return migrationObjects;
  }

  private async getTargetApexNamespace(objectsToProcess: string[], targetApexNamespace: string): Promise<string> {
    if (objectsToProcess.includes(Constants.Apex)) {
      targetApexNamespace = await this.ux.prompt(messages.getMessage('enterTargetNamespace'));
      Logger.log(messages.getMessage('usingTargetNamespace', [targetApexNamespace]));
    }
    return targetApexNamespace;
  }

  private async getGeneralConsent(): Promise<boolean> {
    let consent: boolean | null = null;

    while (consent === null) {
      try {
        consent = await Logger.confirm(messages.getMessage('userConsentMessage'));
      } catch (error) {
        Logger.log(messages.getMessage('invalidYesNoResponse'));
        consent = null;
      }
    }

    return consent;
  }

  private async getExpSiteMetadataEnableConsent(): Promise<boolean> {
    let consent: boolean | null = null;

    while (consent === null) {
      try {
        consent = await Logger.confirm(
          'By proceeding further, you hereby consent to enable digital experience metadata api(y/n). If y sites will be processed, if n expsites will not be processed'
        );
      } catch (error) {
        Logger.log(messages.getMessage('invalidYesNoResponse'));
        consent = null;
      }
    }

    return consent;
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
