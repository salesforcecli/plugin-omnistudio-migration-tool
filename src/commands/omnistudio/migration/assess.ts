import * as os from 'os';
import { flags } from '@salesforce/command';
import { Messages, Connection } from '@salesforce/core';
import OmniStudioBaseCommand from '../../basecommand';
import { AssessmentInfo } from '../../../utils/interfaces';
import { AssessmentReporter } from '../../../utils/resultsbuilder/assessmentReporter';
import { OmniScriptExportType, OmniScriptMigrationTool } from '../../../migration/omniscript';
import { CardMigrationTool } from '../../../migration/flexcard';
import { DataRaptorMigrationTool } from '../../../migration/dataraptor';
import { GlobalAutoNumberMigrationTool } from '../../../migration/globalautonumber';
import { DebugTimer } from '../../../utils';
import { Logger } from '../../../utils/logger';
import OmnistudioRelatedObjectMigrationFacade from '../../../migration/related/OmnistudioRelatedObjectMigrationFacade';
import { OmnistudioOrgDetails, OrgUtils } from '../../../utils/orgUtils';
import { OrgPreferences } from '../../../utils/orgPreferences';
import { Constants } from '../../../utils/constants/stringContants';
import { ProjectPathUtil } from '../../../utils/projectPathUtil';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'assess');

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
      description: messages.getMessage('relatedObjectGA'),
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
      Logger.error(messages.getMessage('errorRunningAssess'), error);
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

    const namespace = orgs.packageDetails.namespace;
    let projectPath = '';
    if (relatedObjects) {
      projectPath = await ProjectPathUtil.getProjectPath(messages, true);
    }

    const assesmentInfo: AssessmentInfo = {
      lwcAssessmentInfos: [],
      apexAssessmentInfos: [],
      dataRaptorAssessmentInfos: [],
      flexCardAssessmentInfos: [],
      globalAutoNumberAssessmentInfos: [],
      omniAssessmentInfo: {
        osAssessmentInfos: [],
        ipAssessmentInfos: [],
      },
      flexipageAssessmentInfos: [],
    };

    Logger.log(messages.getMessage('assessmentInitialization', [String(namespace)]));
    Logger.log(messages.getMessage('apiVersionInfo', [String(apiVersion)]));
    Logger.logVerbose(messages.getMessage('assessmentTargets', [String(this.flags.only || 'all')]));
    Logger.logVerbose(messages.getMessage('relatedObjectsInfo', [relatedObjects || 'none']));
    Logger.logVerbose(messages.getMessage('allVersionsFlagInfo', [String(allVersions)]));
    // Assess OmniStudio components
    await this.assessOmniStudioComponents(assesmentInfo, assessOnly, namespace, conn, allVersions);

    let objectsToProcess: string[];
    // Assess related objects if specified
    if (relatedObjects) {
      // To-Do: Add LWC to valid options when GA is released
      const validOptions = [Constants.Apex, Constants.FlexiPage];
      objectsToProcess = relatedObjects.split(',').map((obj) => obj.trim());

      // Validate input
      for (const obj of objectsToProcess) {
        if (!validOptions.includes(obj)) {
          Logger.error(messages.getMessage('invalidRelatedObjectsOption', [String(obj)]));
          process.exit(1);
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
      assesmentInfo.flexipageAssessmentInfos = relatedObjectAssessmentResult.flexipageAssessmentInfos;
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
      await this.assessGlobalAutoNumbers(assesmentInfo, namespace, conn);
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
      case Constants.GlobalAutoNumber:
        await this.assessGlobalAutoNumbers(assesmentInfo, namespace, conn);
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

  private async assessGlobalAutoNumbers(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection
  ): Promise<void> {
    Logger.logVerbose(messages.getMessage('startingGlobalAutoNumberAssessment'));
    const globalAutoNumberMigrationTool = new GlobalAutoNumberMigrationTool(namespace, conn, Logger, messages, this.ux);
    assesmentInfo.globalAutoNumberAssessmentInfos = await globalAutoNumberMigrationTool.assess();
    Logger.logVerbose(
      messages.getMessage('assessedGlobalAutoNumbersCount', [assesmentInfo.globalAutoNumberAssessmentInfos.length])
    );
    Logger.log(messages.getMessage('globalAutoNumberAssessmentCompleted'));
  }
}
