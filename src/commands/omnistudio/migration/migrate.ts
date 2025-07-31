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
import { Messages } from '@salesforce/core';
import { ExecuteAnonymousResult } from 'jsforce';
import OmniStudioBaseCommand from '../../basecommand';
import { DataRaptorMigrationTool } from '../../../migration/dataraptor';
import { DebugTimer, MigratedObject, MigratedRecordInfo } from '../../../utils';
import { InvalidEntityTypeError, MigrationResult, MigrationTool } from '../../../migration/interfaces';
import { ResultsBuilder } from '../../../utils/resultsbuilder';
import { CardMigrationTool } from '../../../migration/flexcard';
import { OmniScriptExportType, OmniScriptMigrationTool } from '../../../migration/omniscript';
import { Logger } from '../../../utils/logger';
import OmnistudioRelatedObjectMigrationFacade from '../../../migration/related/OmnistudioRelatedObjectMigrationFacade';
import { generatePackageXml } from '../../../utils/generatePackageXml';
import { OmnistudioOrgDetails, OrgUtils } from '../../../utils/orgUtils';
import { Constants } from '../../../utils/constants/stringContants';
import { OrgPreferences } from '../../../utils/orgPreferences';
import { AnonymousApexRunner } from '../../../utils/apex/executor/AnonymousApexRunner';
import { ProjectPathUtil } from '../../../utils/projectPathUtil';
import { PromptUtil } from '../../../utils/promptUtil';
import { YES_SHORT, YES_LONG, NO_SHORT, NO_LONG } from '../../../utils/projectPathUtil';

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
      Logger.error(messages.getMessage('errorRunningMigrate'), error);
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

    // check for confirmation over assessed action items
    const migrationConsent = await this.getMigrationConsent();
    if (!migrationConsent) {
      Logger.log(messages.getMessage('migrationConsentNotGiven'));
      return;
    }

    const namespace = orgs.packageDetails.namespace;
    // Let's time every step
    DebugTimer.getInstance().start();
    let projectPath: string;
    let objectsToProcess: string[] = [];
    let targetApexNamespace: string;
    if (relatedObjects) {
      // To-Do: Add LWC to valid options when GA is released
      const validOptions = [Constants.Apex];
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
      }
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

    let actionItems = [];
    if (!migrateOnly) {
      actionItems = await this.setDesignersToUseStandardDataModel(namespace);
    }

    await ResultsBuilder.generateReport(
      objectMigrationResults,
      relatedObjectMigrationResult,
      conn.instanceUrl,
      orgs,
      messages,
      actionItems,
      objectsToProcess
    );

    // Return results needed for --json flag
    return { objectMigrationResults };
  }

  private async getMigrationConsent(): Promise<boolean> {
    const askWithTimeOut = PromptUtil.askWithTimeOut(messages);
    let validResponse = false;
    let consent = false;

    while (!validResponse) {
      try {
        const resp = await askWithTimeOut(Logger.prompt.bind(Logger), messages.getMessage('migrationConsentMessage'));
        const response = typeof resp === 'string' ? resp.trim().toLowerCase() : '';

        if (response === YES_SHORT || response === YES_LONG) {
          consent = true;
          validResponse = true;
        } else if (response === NO_SHORT || response === NO_LONG) {
          consent = false;
          validResponse = true;
        } else {
          Logger.error(messages.getMessage('invalidYesNoResponse'));
        }
      } catch (err) {
        Logger.error(messages.getMessage('requestTimedOut'));
        process.exit(1);
      }
    }

    return consent;
  }

  private async setDesignersToUseStandardDataModel(namespace: string): Promise<string[]> {
    const userActionMessage: string[] = [];
    try {
      Logger.logVerbose('Setting designers to use the standard data model');
      const apexCode = `
          ${namespace}.OmniStudioPostInstallClass.useStandardDataModel();
        `;

      const result: ExecuteAnonymousResult = await AnonymousApexRunner.run(this.org, apexCode);
      if (result?.success === false) {
        const message = result?.exceptionStackTrace;
        Logger.error(`Error occurred while setting designers to use the standard data model ${message}`);
        userActionMessage.push(messages.getMessage('manuallySwitchDesignerToStandardDataModel'));
      } else if (result?.success === true) {
        Logger.logVerbose('Successfully executed setDesignersToUseStandardDataModel');
      }
    } catch (ex) {
      Logger.error(`Exception occurred while setting designers to use the standard data model ${JSON.stringify(ex)}`);
      userActionMessage.push(messages.getMessage('manuallySwitchDesignerToStandardDataModel'));
    }
    return userActionMessage;
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
        Logger.log(messages.getMessage('migratingComponent', [cls.getName()]));
        debugTimer.lap('Migrating: ' + cls.getName());
        const results = await cls.migrate();
        Logger.log(messages.getMessage('migrationCompleted', [cls.getName()]));
        objectMigrationResults = objectMigrationResults.concat(
          results.map((r) => {
            return {
              name: r.name,
              data: this.mergeRecordAndUploadResults(r, cls),
            };
          })
        );
      } catch (ex: any) {
        if (ex instanceof InvalidEntityTypeError) {
          Logger.error(ex.message);
          process.exit(1);
        }
        Logger.error('Error migrating object', ex);
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

  private mergeRecordAndUploadResults(
    migrationResults: MigrationResult,
    migrationTool: MigrationTool
  ): MigratedRecordInfo[] {
    const mergedResults: MigratedRecordInfo[] = [];

    for (const record of Array.from(migrationResults.records.values())) {
      const obj = {
        id: record['Id'],
        name: migrationTool.getRecordName(record),
        status: messages.getMessage('labelStatusSkipped'),
        errors: record['errors'],
        migratedId: undefined,
        warnings: [],
        migratedName: '',
      };

      if (migrationResults.results.has(record['Id'])) {
        const recordResults = migrationResults.results.get(record['Id']);

        let errors: any[] = obj.errors || [];
        errors = errors.concat(recordResults.errors || []);

        obj.status = recordResults?.skipped
          ? messages.getMessage('labelStatusSkipped')
          : !recordResults || recordResults.hasErrors
          ? messages.getMessage('labelStatusFailed')
          : messages.getMessage('labelStatusComplete');
        obj.errors = errors;
        obj.migratedId = recordResults.id;
        obj.warnings = recordResults.warnings || [];
        const entityGroup = migrationResults.name;
        if (
          recordResults.newName !== obj.name &&
          (entityGroup === 'Integration Procedures' || entityGroup === 'OmniScripts')
        ) {
          const entity = entityGroup === 'Integration Procedures' ? 'Integration Procedure' : 'Omniscript';
          obj.warnings.unshift(messages.getMessage('nameConversionMessage', [entity, recordResults.newName]));
        }
        obj.migratedName = recordResults.newName;
      }

      mergedResults.push(obj);
    }

    return mergedResults;
  }
}
