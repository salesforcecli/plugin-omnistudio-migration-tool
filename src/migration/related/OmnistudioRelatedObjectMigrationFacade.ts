/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Org } from '@salesforce/core';
import * as shell from 'shelljs';
import { ApexAssessmentInfo, DebugTimer, LWCAssessmentInfo, RelatedObjectAssesmentInfo } from '../../utils';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { Logger } from '../../utils/logger';
import { Constants } from '../../utils/constants/stringContants';
import { ApexMigration } from './ApexMigration';
import { LwcMigration } from './LwcMigration';

// Initialize Messages with the current plugin directory
// Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
// const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-related-object-migration-tool', 'migrate');
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
  protected readonly lwcMigration: LwcMigration;

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
    //   sfProject.retrieve(LWCTYPE, this.org.getUsername());
    // }
    if (relatedObjects.includes(Constants.Apex)) {
      sfProject.retrieve(APEXCLASS, this.org.getUsername());
    }
    shell.cd(pwd);
  }

  private processRelatedObjects(relatedObjects: string[], isMigration: boolean): RelatedObjectAssesmentInfo {
    // Start the debug timer
    DebugTimer.getInstance().start();

    // Retrieve metadata if needed
    if (isMigration) {
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
    } catch (Error) {
      // Log the error
      Logger.logger.error(Error.message);
    }
    // TODO: Uncomment code once MVP for migration is completed
    // try {
    //   if (relatedObjects.includes(Constants.LWC)) {
    //     lwcAssessmentInfos = isMigration ? this.lwcMigration.migrate() : this.lwcMigration.assessment();
    //   }
    // } catch (Error) {
    //   // Log the error
    //   Logger.logger.error(Error.message);
    // }

    // Stop the debug timer
    const timer = debugTimer.stop();

    // Save timer to debug logger
    Logger.logger.debug(timer);

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
