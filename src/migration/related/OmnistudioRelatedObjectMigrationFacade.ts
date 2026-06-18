/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Org, Messages } from '@salesforce/core';
import * as shell from 'shelljs';
import {
  ApexAssessmentInfo,
  DebugTimer,
  LWCAssessmentInfo,
  RelatedObjectAssesmentInfo,
  ExperienceSiteAssessmentInfo,
  FlexiPageAssessmentInfo,
  FlexCardAssessmentInfo,
  OSAssessmentInfo,
} from '../../utils';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { Logger } from '../../utils/logger';
import { Constants } from '../../utils/constants/stringContants';
import { ApexMigration } from './ApexMigration';
import { ExperienceSiteMigration } from './ExperienceSiteMigration';
import { LwcMigration } from './LwcMigration';
import { FlexipageMigration } from './FlexipageMigration';

Messages.importMessagesDirectory(__dirname);
const assessMessages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'assess');
const migrateMessages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'migrate');

const LWCTYPE = 'LightningComponentBundle';
const APEXCLASS = 'Apexclass';
const EXPERIENCEBUNDLE = 'EXPERIENCEBUNDLE';

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
  protected readonly experienceSiteMigration: ExperienceSiteMigration;
  protected readonly flexipageMigration: FlexipageMigration;

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
    this.flexipageMigration = new FlexipageMigration(this.projectPath, this.namespace, this.org, assessMessages);
    this.lwcMigration = new LwcMigration(this.projectPath, this.namespace, this.org);

    this.experienceSiteMigration = new ExperienceSiteMigration(
      this.projectPath,
      this.namespace,
      this.org,
      migrateMessages
    );
  }

  private createProject(): string {
    sfProject.create(defaultProjectName);
    return process.cwd() + '/' + defaultProjectName;
  }

  private retrieveMetadata(relatedObjects: string[]): void {
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    if (relatedObjects.includes(Constants.LWC)) {
      sfProject.retrieve(LWCTYPE, this.org.getUsername());
    }
    if (relatedObjects.includes(Constants.Apex)) {
      sfProject.retrieve(APEXCLASS, this.org.getUsername());
    }

    if (relatedObjects.includes(Constants.FlexiPage)) {
      sfProject.retrieve(Constants.FlexiPage, this.org.getUsername());
    }

    if (relatedObjects.includes(Constants.ExpSites)) {
      Logger.logVerbose(EXPERIENCEBUNDLE);
      sfProject.retrieve(EXPERIENCEBUNDLE, this.org.getUsername());
    }

    shell.cd(pwd);
  }

  private processRelatedObjects(
    relatedObjects: string[],
    isMigration: boolean,
    flexCardInfos?: FlexCardAssessmentInfo[],
    osInfos?: OSAssessmentInfo[]
  ): RelatedObjectAssesmentInfo {
    // Start the debug timer
    DebugTimer.getInstance().start();
    Logger.logVerbose(
      assessMessages.getMessage('startingProcessRelatedObjects', [String(relatedObjects), this.projectPath])
    );

    Logger.logVerbose(migrateMessages.getMessage('retrievingMetadata', [String(relatedObjects), this.projectPath]));
    try {
      this.retrieveMetadata(relatedObjects);
    } catch (error) {
      Logger.error('Error retrieving metadata', error);
      return {
        apexAssessmentInfos: [],
        lwcAssessmentInfos: [],
        experienceSiteAssessmentInfos: [],
        flexipageAssessmentInfos: [],
      };
    }

    const debugTimer = DebugTimer.getInstance();
    debugTimer.start();

    let apexAssessmentInfos: ApexAssessmentInfo[] = [];
    let lwcAssessmentInfos: LWCAssessmentInfo[] = [];
    let experienceSiteAssessmentInfos: ExperienceSiteAssessmentInfo[] = [];
    let flexipageAssessmentInfos: FlexiPageAssessmentInfo[] = [];

    // Proceed with processing logic
    try {
      if (relatedObjects.includes(Constants.Apex)) {
        apexAssessmentInfos = isMigration ? this.apexMigration.migrate() : this.apexMigration.assess();
      }

      if (relatedObjects.includes(Constants.ExpSites)) {
        experienceSiteAssessmentInfos = isMigration
          ? this.experienceSiteMigration.migrate(flexCardInfos, osInfos)
          : this.experienceSiteMigration.assess(flexCardInfos, osInfos);
      }
      if (relatedObjects.includes(Constants.FlexiPage)) {
        flexipageAssessmentInfos = isMigration
          ? this.flexipageMigration.migrate(flexCardInfos, osInfos)
          : this.flexipageMigration.assess(flexCardInfos, osInfos);
      }
      if (relatedObjects.includes(Constants.LWC)) {
        lwcAssessmentInfos = isMigration ? this.lwcMigration.migrate() : this.lwcMigration.assessment();
      }
    } catch (error) {
      // Log the error
      Logger.error('Error processing related objects', error);
    }

    // Stop the debug timer
    const timer = debugTimer.stop();

    // Save timer to debug logger
    Logger.debug(timer.toString());

    // Return results needed for --json flag
    return { apexAssessmentInfos, lwcAssessmentInfos, experienceSiteAssessmentInfos, flexipageAssessmentInfos };
  }

  public migrateAll(
    relatedObjects: string[],
    flexCardInfos?: FlexCardAssessmentInfo[],
    osInfos?: OSAssessmentInfo[]
  ): RelatedObjectAssesmentInfo {
    return this.processRelatedObjects(relatedObjects, true, flexCardInfos, osInfos);
  }

  public assessAll(
    relatedObjects: string[],
    flexCardInfos?: FlexCardAssessmentInfo[],
    osInfos?: OSAssessmentInfo[]
  ): RelatedObjectAssesmentInfo {
    return this.processRelatedObjects(relatedObjects, false, flexCardInfos, osInfos);
  }
}
