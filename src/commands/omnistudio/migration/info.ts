/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as os from 'os';
import { flags } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import '../../../utils/prototypes';
import OmniStudioBaseCommand from '../../basecommand';
import { CardMigrationTool } from '../../../migration/flexcard';
import { OmniScriptExportType, OmniScriptMigrationTool } from '../../../migration/omniscript';
import { DataRaptorMigrationTool } from '../../../migration/dataraptor';
import { AssessResult, MigrationTool } from '../../../migration/interfaces';
import { DebugTimer, OrgUtils } from '../../../utils';
import { ResultsBuilder } from '../../../utils/resultsbuilder';
import { Logger } from '../../../utils/logger';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'info');

export default class Info extends OmniStudioBaseCommand {
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
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async run(): Promise<any> {
    const namespace = (this.flags.namespace || 'vlocity_ins') as string;
    const apiVersion = (this.flags.apiversion || '55.0') as string;
    const assessOnly = (this.flags.only || '') as string;
    const allVersions = (this.flags.allversions as boolean) || false;

    Logger.initialiseLogger(this.ux, this.logger);
    this.logger = Logger.logger;

    const conn = this.org.getConnection();
    conn.setApiVersion(apiVersion);

    // Validate org before proceeding
    const orgs = await OrgUtils.getOrgDetails(conn, namespace);

    if (orgs.omniStudioOrgPermissionEnabled) {
      Logger.error(messages.getMessage('alreadyStandardModel', [orgs.orgDetails.Id]));
      return;
    } else if (!orgs.hasValidNamespace) {
      Logger.error(messages.getMessage('invalidNamespace', [namespace]));
      return;
    }

    DebugTimer.getInstance().start();

    // Register tools to assess based on --only flag
    const assessObjects: MigrationTool[] = [];
    if (!assessOnly) {
      assessObjects.push(
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
        new CardMigrationTool(namespace, conn, this.logger, messages, this.ux, allVersions)
      );
    } else {
      switch (assessOnly) {
        case 'os':
          assessObjects.push(
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
          assessObjects.push(
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
          assessObjects.push(new CardMigrationTool(namespace, conn, this.logger, messages, this.ux, allVersions));
          break;
        case 'dr':
          assessObjects.push(new DataRaptorMigrationTool(namespace, conn, this.logger, messages, this.ux));
          break;
        default:
          throw new Error(messages.getMessage('invalidOnlyFlag'));
      }
    }

    // Run assessment on each tool
    const allAssessResults: AssessResult[] = [];
    for (const tool of assessObjects) {
      Logger.ux.log('Assessing: ' + tool.getName());
      const results = await tool.assess();
      allAssessResults.push(...results);
    }

    // Log summary to console
    if (allAssessResults.length === 0) {
      Logger.ux.log(messages.getMessage('noIssuesFound'));
    } else {
      Logger.ux.log(messages.getMessage('assessSummary', [String(allAssessResults.length)]));
      for (const result of allAssessResults) {
        Logger.ux.log(`\n[${result.componentType}] ${result.name}`);
        for (const warning of result.warnings) {
          Logger.ux.log('  ' + warning);
        }
      }
    }

    // Generate HTML report (same UX as migrate mode)
    const migratedObjects = allAssessResults.map((r) => ({
      name: `[${r.componentType}] ${r.name}`,
      data: [
        {
          id: r.name,
          name: r.name,
          status: 'Warning',
          errors: r.warnings,
          migratedId: undefined,
          migratedName: '',
          warnings: [],
        },
      ],
    }));

    await ResultsBuilder.generate(migratedObjects, conn.instanceUrl);

    const timer = DebugTimer.getInstance().stop();
    this.logger.debug(timer);

    return { assessResults: allAssessResults };
  }
}
