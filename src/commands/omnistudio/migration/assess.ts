import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { flags } from '@salesforce/command';
import { Messages, Connection } from '@salesforce/core';
import OmniStudioBaseCommand from '../../basecommand';
import { AssessmentInfo } from '../../../utils/interfaces';
import { AssessmentReporter } from '../../../utils/resultsbuilder/assessmentReporter';
import { OmniScriptExportType, OmniScriptMigrationTool } from '../../../migration/omniscript';
import { CardMigrationTool } from '../../../migration/flexcard';
import { DataRaptorMigrationTool } from '../../../migration/dataraptor';
import { DebugTimer } from '../../../utils';
import { Logger } from '../../../utils/logger';
import OmnistudioRelatedObjectMigrationFacade from '../../../migration/related/OmnistudioRelatedObjectMigrationFacade';
import { OmnistudioOrgDetails, OrgUtils } from '../../../utils/orgUtils';
import { OrgPreferences } from '../../../utils/orgPreferences';
import { Constants } from '../../../utils/constants/stringContants';
import { sfProject } from '../../../utils/sfcli/project/sfProject';
import { PromptUtil } from '../../../utils/promptUtil';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'assess');

const EXISTING_MODE = 'existing';
const EMPTY_MODE = 'empty';
const YES_SHORT = 'y';
const NO_SHORT = 'n';
const YES_LONG = 'yes';
const NO_LONG = 'no';

// Helper to create SFDX project if needed
function createSfdxProject(folderPath: string): void {
  const projectName = path.basename(folderPath);
  const parentDir = path.dirname(folderPath);
  sfProject.create(projectName, parentDir);
}

function isSfdxProject(folderPath: string): boolean {
  const sfdxProjectJson = path.join(folderPath, 'sfdx-project.json');
  return fs.existsSync(sfdxProjectJson);
}

export default class Assess extends OmniStudioBaseCommand {
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
      description: messages.getMessage('enableVerboseOutput'),
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async run(): Promise<any> {
    Logger.initialiseLogger(this.ux, this.logger, 'assess', this.flags.verbose);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return await this.runAssess();
    } catch (error) {
      Logger.error('Error running assess');
      Logger.error(error);
      process.exit(1);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async runAssess(): Promise<any> {
    DebugTimer.getInstance().start();
    let apiVersion = this.flags.apiversion as string;
    const allVersions = (this.flags.allversions || false) as boolean;
    const assessOnly = (this.flags.only || '') as string;
    const relatedObjects = (this.flags.relatedobjects || '') as string;
    const conn = this.org.getConnection();

    if (apiVersion) {
      conn.setApiVersion(apiVersion);
    } else {
      apiVersion = conn.getApiVersion();
    }
    const orgs: OmnistudioOrgDetails = await OrgUtils.getOrgDetails(conn, this.flags.namespace);

    if (!orgs.hasValidNamespace) {
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

    const namespace = orgs.packageDetails.namespace;
    let projectPath = '';
    if (relatedObjects) {
      projectPath = await this.getProjectPath();
    }

    const assesmentInfo: AssessmentInfo = {
      lwcAssessmentInfos: [],
      apexAssessmentInfos: [],
      dataRaptorAssessmentInfos: [],
      flexCardAssessmentInfos: [],
      omniAssessmentInfo: {
        osAssessmentInfos: [],
        ipAssessmentInfos: [],
      },
    };

    Logger.log(messages.getMessage('assessmentInitialization', [String(namespace)]));
    Logger.logVerbose(messages.getMessage('apiVersionInfo', [String(apiVersion)]));
    Logger.logVerbose(messages.getMessage('assessmentTargets', [String(this.flags.only || 'all')]));
    Logger.logVerbose(messages.getMessage('relatedObjectsInfo', [relatedObjects || 'none']));
    Logger.logVerbose(messages.getMessage('allVersionsFlagInfo', [String(allVersions)]));
    // Assess OmniStudio components
    await this.assessOmniStudioComponents(assesmentInfo, assessOnly, namespace, conn, allVersions);

    let objectsToProcess: string[];
    // Assess related objects if specified
    if (relatedObjects) {
      const validOptions = [Constants.Apex, Constants.LWC];
      objectsToProcess = relatedObjects.split(',').map((obj) => obj.trim());

      // Validate input
      for (const obj of objectsToProcess) {
        if (!validOptions.includes(obj)) {
          Logger.warn(messages.getMessage('invalidRelatedObjectsOption', [String(obj)]));
        }
      }

      const omnistudioRelatedObjectsMigration = new OmnistudioRelatedObjectMigrationFacade(
        namespace,
        assessOnly,
        allVersions,
        this.org,
        projectPath
      );
      const relatedObjectAssessmentResult = omnistudioRelatedObjectsMigration.assessAll(objectsToProcess);
      assesmentInfo.lwcAssessmentInfos = relatedObjectAssessmentResult.lwcAssessmentInfos;
      assesmentInfo.apexAssessmentInfos = relatedObjectAssessmentResult.apexAssessmentInfos;
    }
    try {
      orgs.rollbackFlags = await OrgPreferences.checkRollbackFlags(conn);
    } catch (error) {
      Logger.log((error as Error).message);
      Logger.log((error as Error).stack);
    }
    await AssessmentReporter.generate(assesmentInfo, conn.instanceUrl, orgs, assessOnly, objectsToProcess, messages);
    return assesmentInfo;
  }

  private async assessOmniStudioComponents(
    assesmentInfo: AssessmentInfo,
    assessOnly: string,
    namespace: string,
    conn: Connection,
    allVersions: boolean
  ): Promise<void> {
    if (!assessOnly) {
      // If no specific component is specified, assess all components
      await this.assessDataRaptors(assesmentInfo, namespace, conn);
      await this.assessFlexCards(assesmentInfo, namespace, conn, allVersions);
      await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.All);
      return;
    }

    switch (assessOnly) {
      case Constants.DataMapper:
        await this.assessDataRaptors(assesmentInfo, namespace, conn);
        break;
      case Constants.Flexcard:
        await this.assessFlexCards(assesmentInfo, namespace, conn, allVersions);
        break;
      case Constants.Omniscript:
        await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.OS);
        break;
      case Constants.IntegrationProcedure:
        await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.IP);
        break;
      default:
        throw new Error(messages.getMessage('invalidOnlyFlag'));
    }
  }

  private async assessDataRaptors(assesmentInfo: AssessmentInfo, namespace: string, conn: Connection): Promise<void> {
    const drMigrator = new DataRaptorMigrationTool(namespace, conn, Logger, messages, this.ux);
    assesmentInfo.dataRaptorAssessmentInfos = await drMigrator.assess();
    Logger.logVerbose(
      messages.getMessage('assessedDataRaptorsCount', [assesmentInfo.dataRaptorAssessmentInfos.length])
    );
    Logger.log(messages.getMessage('dataRaptorAssessmentCompleted'));
  }

  private async assessFlexCards(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection,
    allVersions: boolean
  ): Promise<void> {
    const flexMigrator = new CardMigrationTool(namespace, conn, Logger, messages, this.ux, allVersions);
    Logger.logVerbose(messages.getMessage('flexCardAssessment'));
    assesmentInfo.flexCardAssessmentInfos = await flexMigrator.assess();
    Logger.logVerbose(messages.getMessage('assessedFlexCardsCount', [assesmentInfo.flexCardAssessmentInfos.length]));
    Logger.log(messages.getMessage('flexCardAssessmentCompleted'));
  }

  private async assessOmniScripts(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection,
    allVersions: boolean,
    exportType: OmniScriptExportType
  ): Promise<void> {
    Logger.logVerbose(messages.getMessage('omniScriptAssessment'));
    const osMigrator = new OmniScriptMigrationTool(exportType, namespace, conn, Logger, messages, this.ux, allVersions);
    assesmentInfo.omniAssessmentInfo = await osMigrator.assess(
      assesmentInfo.dataRaptorAssessmentInfos,
      assesmentInfo.flexCardAssessmentInfos
    );
    Logger.logVerbose(
      messages.getMessage('assessedOmniScriptsCount', [assesmentInfo.omniAssessmentInfo.osAssessmentInfos.length])
    );
    Logger.logVerbose(
      messages.getMessage('assessedIntegrationProceduresCount', [
        assesmentInfo.omniAssessmentInfo.ipAssessmentInfos.length,
      ])
    );
    Logger.log(messages.getMessage('omniScriptAssessmentCompleted'));
  }

  private async getProjectPath(): Promise<string> {
    let projectPath = '';
    let mode: string = EXISTING_MODE;

    // Prompt for project type
    const askWithTimeout = PromptUtil.askWithTimeOut(messages);
    // Prompt: Existing project?
    let response = '';
    let validResponse = false;

    while (!validResponse) {
      try {
        const resp = await askWithTimeout(Logger.prompt.bind(Logger), messages.getMessage('existingApexPrompt'));
        response = typeof resp === 'string' ? resp.trim().toLowerCase() : '';
      } catch (err) {
        Logger.error(messages.getMessage('requestTimedOut'));
        process.exit(1);
      }

      if (response === YES_SHORT || response === YES_LONG) {
        mode = EXISTING_MODE;
        validResponse = true;
      } else if (response === NO_SHORT || response === NO_LONG) {
        mode = EMPTY_MODE;
        validResponse = true;
      } else {
        Logger.error(messages.getMessage('invalidYesNoResponse'));
      }
    }

    // Prompt for project path
    let gotValidPath = false;
    while (!gotValidPath) {
      let folderPath = '';
      try {
        const resp = await askWithTimeout(
          Logger.prompt.bind(Logger),
          mode === EXISTING_MODE
            ? messages.getMessage('enterExistingProjectPath')
            : messages.getMessage('enterEmptyProjectPath')
        );
        folderPath = typeof resp === 'string' ? resp.trim() : '';
      } catch (err) {
        Logger.error(messages.getMessage('requestTimedOut'));
        process.exit(1);
      }
      folderPath = path.resolve(folderPath);

      if (!fs.existsSync(folderPath) || !fs.lstatSync(folderPath).isDirectory()) {
        Logger.error(messages.getMessage('invalidProjectFolderPath'));
        continue;
      }
      if (mode === EMPTY_MODE && fs.readdirSync(folderPath).length > 0) {
        Logger.error(messages.getMessage('notEmptyProjectFolderPath'));
        continue;
      }
      // If empty, create SFDX project
      if (mode === EMPTY_MODE) {
        createSfdxProject(folderPath);
      } else if (!isSfdxProject(folderPath)) {
        Logger.error(messages.getMessage('notSfdxProjectFolderPath'));
        continue;
      }
      projectPath = folderPath;
      gotValidPath = true;
    }

    return projectPath;
  }
}
