import * as os from 'os';
import { flags } from '@salesforce/command';
import { Connection } from '@salesforce/core';
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
import { MessageService } from '../../../utils/MessageService';


export default class Assess extends OmniStudioBaseCommand {
  public static description = MessageService.getMessage('assessCommandDescription');

  public static examples = MessageService.getMessage('assessExamples').split(os.EOL);

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
    MessageService.init('assess');
  }

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

    const namespace = orgs.packageDetails.namespace;

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

    Logger.log(MessageService.getMessage('assessmentInitialization', [String(namespace)]));
    Logger.logVerbose(MessageService.getMessage('apiVersionInfo', [String(apiVersion)]));
    Logger.logVerbose(MessageService.getMessage('assessmentTargets', [String(this.flags.only || 'all')]));
    Logger.logVerbose(MessageService.getMessage('relatedObjectsInfo', [relatedObjects || 'none']));
    Logger.logVerbose(MessageService.getMessage('allVersionsFlagInfo', [String(allVersions)]));
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
          Logger.warn(MessageService.getMessage('invalidRelatedObjectsOption', [String(obj)]));
        }
      }

      const omnistudioRelatedObjectsMigration = new OmnistudioRelatedObjectMigrationFacade(
        namespace,
        assessOnly,
        allVersions,
        this.org
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
    await AssessmentReporter.generate(assesmentInfo, conn.instanceUrl, orgs, assessOnly, objectsToProcess);
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
        throw new Error(MessageService.getMessage('invalidOnlyFlag'));
    }
  }

  private async assessDataRaptors(assesmentInfo: AssessmentInfo, namespace: string, conn: Connection): Promise<void> {
    const drMigrator = new DataRaptorMigrationTool(namespace, conn, Logger, this.ux);
    assesmentInfo.dataRaptorAssessmentInfos = await drMigrator.assess();
    Logger.logVerbose(
      MessageService.getMessage('assessedDataRaptorsCount', [assesmentInfo.dataRaptorAssessmentInfos.length])
    );
    Logger.log(MessageService.getMessage('dataRaptorAssessmentCompleted'));
  }

  private async assessFlexCards(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection,
    allVersions: boolean
  ): Promise<void> {
    const flexMigrator = new CardMigrationTool(namespace, conn, Logger, this.ux, allVersions);
    Logger.logVerbose(MessageService.getMessage('flexCardAssessment'));
    assesmentInfo.flexCardAssessmentInfos = await flexMigrator.assess();
    Logger.logVerbose(
      MessageService.getMessage('assessedFlexCardsCount', [assesmentInfo.flexCardAssessmentInfos.length])
    );
    Logger.log(MessageService.getMessage('flexCardAssessmentCompleted'));
  }

  private async assessOmniScripts(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection,
    allVersions: boolean,
    exportType: OmniScriptExportType
  ): Promise<void> {
    Logger.logVerbose(MessageService.getMessage('omniScriptAssessment'));
    const osMigrator = new OmniScriptMigrationTool(exportType, namespace, conn, Logger, this.ux, allVersions);
    assesmentInfo.omniAssessmentInfo = await osMigrator.assess(
      assesmentInfo.dataRaptorAssessmentInfos,
      assesmentInfo.flexCardAssessmentInfos
    );
    Logger.logVerbose(
      MessageService.getMessage('assessedOmniScriptsCount', [assesmentInfo.omniAssessmentInfo.osAssessmentInfos.length])
    );
    Logger.logVerbose(
      MessageService.getMessage('assessedIntegrationProceduresCount', [
        assesmentInfo.omniAssessmentInfo.ipAssessmentInfos.length,
      ])
    );
    Logger.log(MessageService.getMessage('omniScriptAssessmentCompleted'));
  }
}
