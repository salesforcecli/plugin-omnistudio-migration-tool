import * as os from 'os';
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
      description: messages.getMessage('apexLwc'),
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async run(): Promise<any> {
    DebugTimer.getInstance().start();
    const namespace = (this.flags.namespace || 'vlocity_ins') as string;
    const apiVersion = (this.flags.apiversion || '55.0') as string;
    const allVersions = (this.flags.allversions || false) as boolean;
    const assessOnly = (this.flags.only || '') as string;
    const relatedObjects = (this.flags.relatedobjects || '') as string;
    const conn = this.org.getConnection();
    const orgs: OmnistudioOrgDetails = await OrgUtils.getOrgDetails(conn, namespace);

    if (orgs.packageDetails.length === 0) {
      this.ux.log('No package installed on given org.');
      return;
    }

    if (orgs.omniStudioOrgPermissionEnabled) {
      this.ux.log('The org is already on standard data model.');
      return;
    }

    Logger.initialiseLogger(this.ux, this.logger);
    conn.setApiVersion(apiVersion);

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

    // Assess OmniStudio components
    await this.assessOmniStudioComponents(assesmentInfo, assessOnly, namespace, conn, allVersions);

    // Assess related objects if specified
    if (relatedObjects) {
      const validOptions = ['apex', 'lwc'];
      const objectsToProcess = relatedObjects.split(',').map((obj) => obj.trim());

      // Validate input
      for (const obj of objectsToProcess) {
        if (!validOptions.includes(obj)) {
          Logger.logger.warn(`Invalid option provided for -r: ${obj}. Valid options are apex, lwc.`);
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

    await AssessmentReporter.generate(assesmentInfo, conn.instanceUrl, orgs);
    return assesmentInfo;
  }

  private async assessOmniStudioComponents(
    assesmentInfo: AssessmentInfo,
    assessOnly: string,
    namespace: string,
    conn: Connection,
    allVersions: boolean
  ): Promise<void> {
    this.logger.info(namespace);
    this.ux.log(`Using Namespace: ${namespace}`);
    if (!assessOnly) {
      // If no specific component is specified, assess all components
      await this.assessDataRaptors(assesmentInfo, namespace, conn);
      await this.assessFlexCards(assesmentInfo, namespace, conn, allVersions);
      await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.All);
      return;
    }

    switch (assessOnly) {
      case 'dr':
        await this.assessDataRaptors(assesmentInfo, namespace, conn);
        break;
      case 'fc':
        await this.assessFlexCards(assesmentInfo, namespace, conn, allVersions);
        break;
      case 'os':
        await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.OS);
        break;
      case 'ip':
        await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.IP);
        break;
      default:
        throw new Error(messages.getMessage('invalidOnlyFlag'));
    }
  }

  private async assessDataRaptors(assesmentInfo: AssessmentInfo, namespace: string, conn: Connection): Promise<void> {
    const drMigrator = new DataRaptorMigrationTool(namespace, conn, this.logger, messages, this.ux);
    assesmentInfo.dataRaptorAssessmentInfos = await drMigrator.assess();
    if (assesmentInfo.dataRaptorAssessmentInfos) {
      this.ux.log('dataRaptorAssessmentInfos');
      this.ux.log(assesmentInfo.dataRaptorAssessmentInfos.toString());
    }
  }

  private async assessFlexCards(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection,
    allVersions: boolean
  ): Promise<void> {
    const flexMigrator = new CardMigrationTool(namespace, conn, this.logger, messages, this.ux, allVersions);
    assesmentInfo.flexCardAssessmentInfos = await flexMigrator.assess();
  }

  private async assessOmniScripts(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection,
    allVersions: boolean,
    exportType: OmniScriptExportType
  ): Promise<void> {
    const osMigrator = new OmniScriptMigrationTool(
      exportType,
      namespace,
      conn,
      this.logger,
      messages,
      this.ux,
      allVersions
    );
    assesmentInfo.omniAssessmentInfo = await osMigrator.assess(
      assesmentInfo.dataRaptorAssessmentInfos,
      assesmentInfo.flexCardAssessmentInfos
    );
  }
}
