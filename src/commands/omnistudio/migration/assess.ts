import * as os from 'os';
import { flags } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import OmniStudioBaseCommand from '../../basecommand';
import { AssessmentInfo } from '../../../utils/interfaces';
import { AssessmentReporter } from '../../../utils/resultsbuilder/assessmentReporter';
import { LwcMigration } from '../../../migration/related/LwcMigration';
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
    const conn = this.org.getConnection();
    const projectDirectory = OmnistudioRelatedObjectMigrationFacade.intializeProject();
    conn.setApiVersion(apiVersion);
    const lwcparser = new LwcMigration(projectDirectory, namespace, this.org);
    this.logger.info(namespace);
    this.ux.log('Using Namespace: ${namespace}');
    const assesmentInfo: AssessmentInfo = {
      lwcAssessmentInfos: lwcparser.assessment(),
      apexAssessmentInfos: [],
    };
    await AssessmentReporter.generate(assesmentInfo, conn.instanceUrl);
    return assesmentInfo;
  }
}
