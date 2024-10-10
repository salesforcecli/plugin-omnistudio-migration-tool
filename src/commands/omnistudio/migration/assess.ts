import * as os from 'os';
import { flags } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import OmniStudioBaseCommand from '../../basecommand';
import { AssessmentInfo } from '../../../utils/interfaces';
import { AssessmentReporter } from '../../../utils/resultsbuilder/assessmentReporter';
import { LwcMigration } from '../../../migration/related/LwcMigration';
import { ApexMigration } from '../../../migration/related/ApexMigration';
import { OmniScriptExportType, OmniScriptMigrationTool } from '../../../migration/omniscript';
import { CardMigrationTool } from '../../../migration/flexcard';
import { DataRaptorMigrationTool } from '../../../migration/dataraptor';
import { DataRaptorAssessmentInfo , FlexCardAssessmentInfo } from '../../../utils';

import { Logger } from '../../../utils/logger';
import OmnistudioRelatedObjectMigrationFacade from './OmnistudioRelatedObjectMigrationFacade';

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
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async run(): Promise<any> {
    const namespace = (this.flags.namespace || 'vlocity_ins') as string;
    const apiVersion = (this.flags.apiversion || '55.0') as string;
    const allVersions = true;
    const conn = this.org.getConnection();
    Logger.initialiseLogger(this.ux, this.logger);
    const projectDirectory = OmnistudioRelatedObjectMigrationFacade.intializeProject();
    conn.setApiVersion(apiVersion);
    const lwcparser = new LwcMigration(projectDirectory, namespace, this.org);
    const apexMigrator = new ApexMigration(projectDirectory, namespace, this.org);
    const osMigrator = new OmniScriptMigrationTool(
      OmniScriptExportType.All,
      namespace,
      conn,
      this.logger,
      messages,
      this.ux,
      allVersions
    );
    const flexMigrator = new CardMigrationTool(namespace, conn, this.logger, messages, this.ux, allVersions);
    const drMigrator = new DataRaptorMigrationTool(namespace, conn, this.logger, messages, this.ux);
    this.logger.info(namespace);
    this.ux.log(`Using Namespace: ${namespace}`);

    const dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[] = await drMigrator.assess();
    this.ux.log('dataRaptorAssessmentInfos');
    this.ux.log(dataRaptorAssessmentInfos.toString());
    const flexCardAssessmentInfos: FlexCardAssessmentInfo[] = await flexMigrator.assess();  
    const omniAssessmentInfo = await osMigrator.assess(dataRaptorAssessmentInfos, flexCardAssessmentInfos);

    const assesmentInfo: AssessmentInfo = {
      // lwcAssessmentInfos: lwcparser.assessment(),
      apexAssessmentInfos: apexMigrator.assess(),
      dataRaptorAssessmentInfos,
      flexCardAssessmentInfos,
      omniAssessmentInfo,
    };
    await AssessmentReporter.generate(assesmentInfo, conn.instanceUrl);
    return assesmentInfo;
  }
}
