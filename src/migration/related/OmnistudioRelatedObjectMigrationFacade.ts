/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Org, Messages } from '@salesforce/core';
import * as shell from 'shelljs';
import { ApexAssessmentInfo, DebugTimer, LWCAssessmentInfo, RelatedObjectAssesmentInfo } from '../../utils';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { Logger } from '../../utils/logger';
import { Constants } from '../../utils/constants/stringContants';
import { ApexMigration } from './ApexMigration';

Messages.importMessagesDirectory(__dirname);
const assessMessages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'assess');
const migrateMessages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'migrate');

// TODO: Uncomment code once MVP for migration is completed
// const LWCTYPE = 'LightningComponentBundle';
const APEXCLASS = 'Apexclass';

const defaultProjectName = 'omnistudio_migration';
export default class OmnistudioRelatedObjectMigrationFacade {
  // public static description = messages.getMessage('commandDescription');
  // public static examples = messages.getMessage('examples').split(os.EOL);
  public static args = [{ name: 'file' }];

  protected readonly namespace: string;
  protected readonly only: string;
  protected readonly allversions: boolean;
  protected readonly org: Org;
  protected readonly projectPath: string;
  protected readonly apexMigration: ApexMigration;
  // protected readonly lwcMigration: LwcMigration;

  public constructor(
    namespace: string,
    only: string,
    allversions: boolean,
    org: Org,
    projectPath?: string,
    targetApexNamespace?: string
  ) {
    this.namespace = namespace;
    this.only = only;
    this.allversions = allversions;
    this.org = org;
    this.projectPath = projectPath || this.createProject();

    // Initialize migration instances
    this.apexMigration = new ApexMigration(this.projectPath, this.namespace, this.org, targetApexNamespace);
    // TODO: Uncomment code once MVP for migration is completed
    // this.lwcMigration = new LwcMigration(this.projectPath, this.namespace, this.org);
  }

  private createProject(): string {
    sfProject.create(defaultProjectName);
    return process.cwd() + '/' + defaultProjectName;
  }

  private retrieveMetadata(relatedObjects: string[]): void {
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    // TODO: Uncomment code once MVP for migration is completed
    // if (relatedObjects.includes(Constants.LWC)) {
    //   // sfProject.retrieve(LWCTYPE, this.org.getUsername());
    // }
    if (relatedObjects.includes(Constants.Apex)) {
      sfProject.retrieve(APEXCLASS, this.org.getUsername());
    }
    shell.cd(pwd);
  }

  private processRelatedObjects(relatedObjects: string[], isMigration: boolean): RelatedObjectAssesmentInfo {
    // Start the debug timer
    DebugTimer.getInstance().start();
    Logger.logVerbose(
      assessMessages.getMessage('startingProcessRelatedObjects', [String(relatedObjects), this.projectPath])
    );

    // Retrieve metadata if needed
    if (isMigration) {
      Logger.logVerbose(migrateMessages.getMessage('retrievingMetadata', [String(relatedObjects), this.projectPath]));
      this.retrieveMetadata(relatedObjects);
    }

    const debugTimer = DebugTimer.getInstance();
    debugTimer.start();

    let apexAssessmentInfos: ApexAssessmentInfo[] = [];
    const lwcAssessmentInfos: LWCAssessmentInfo[] = [];

    // Proceed with processing logic
    try {
      if (relatedObjects.includes(Constants.Apex)) {
        apexAssessmentInfos = isMigration ? this.apexMigration.migrate() : this.apexMigration.assess();
      }
    } catch (error) {
      // Log the error
      Logger.error('Error processing related objects', error);
    }
    // TODO: Uncomment code once MVP for migration is completed
    // try {
    //   if (relatedObjects.includes(Constants.LWC)) {
    //     Logger.logVerbose(migrateMessages.getMessage('startingLwcMigration', [this.projectPath]));
    //     lwcAssessmentInfos = isMigration ? this.lwcMigration.migrate() : this.lwcMigration.assessment();
    //   }
    // } catch (Error) {
    //   Logger.error(Error.message);
    // }

    // Stop the debug timer
    const timer = debugTimer.stop();

    // Save timer to debug logger
    Logger.debug(timer.toString());

    // Return results needed for --json flag
    return { apexAssessmentInfos, lwcAssessmentInfos };
  }

  public migrateAll(relatedObjects: string[]): RelatedObjectAssesmentInfo {
    return this.processRelatedObjects(relatedObjects, true);
  }

  public assessAll(relatedObjects: string[]): RelatedObjectAssesmentInfo {
    return this.processRelatedObjects(relatedObjects, false);
  }
}
