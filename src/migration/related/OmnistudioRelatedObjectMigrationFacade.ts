/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import * as path from 'path';
import { Org, Messages } from '@salesforce/core';
import * as shell from 'shelljs';
import {
  ApexAssessmentInfo,
  DebugTimer,
  LWCAssessmentInfo,
  RelatedObjectAssesmentInfo,
  ExperienceSiteAssessmentInfo,
  FlexiPageAssessmentInfo,
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
      assessMessages
    );
  }

  private createProject(): string {
    sfProject.create(defaultProjectName);
    return process.cwd() + '/' + defaultProjectName;
  }

  private retrieveMetadata(relatedObjects: string[]): void {
    const pwd = shell.pwd();
    shell.cd(this.projectPath);

    // Create temporary manifest for metadata retrieval
    // This bypasses source tracking and works on any org type
    const manifestPath = this.createTemporaryManifest(relatedObjects);

    try {
      sfProject.retrieveWithManifest(manifestPath, this.org.getUsername());
      Logger.logVerbose('Successfully retrieved metadata using manifest approach');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.warn(
        `Failed to retrieve metadata from org. Will proceed with local files if available. Error: ${errorMessage}`
      );
    } finally {
      // Clean up temporary manifest
      if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
      }
    }

    shell.cd(pwd);
  }

  /**
   * Creates a temporary package.xml manifest for the specified metadata types
   */
  private createTemporaryManifest(relatedObjects: string[]): string {
    const metadataTypes: string[] = [];

    if (relatedObjects.includes(Constants.LWC)) {
      metadataTypes.push(LWCTYPE);
    }
    if (relatedObjects.includes(Constants.Apex)) {
      metadataTypes.push(APEXCLASS);
    }
    if (relatedObjects.includes(Constants.FlexiPage)) {
      metadataTypes.push(Constants.FlexiPage);
    }
    if (relatedObjects.includes(Constants.ExpSites)) {
      metadataTypes.push(EXPERIENCEBUNDLE);
    }

    const manifestContent = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${metadataTypes
  .map(
    (type) => `    <types>
        <members>*</members>
        <name>${type}</name>
    </types>`
  )
  .join('\n')}
    <version>62.0</version>
</Package>`;

    const manifestPath = path.join(this.projectPath, 'temp-retrieve-manifest.xml');
    fs.writeFileSync(manifestPath, manifestContent);

    return manifestPath;
  }

  private processRelatedObjects(relatedObjects: string[], isMigration: boolean): RelatedObjectAssesmentInfo {
    // Start the debug timer
    DebugTimer.getInstance().start();
    Logger.logVerbose(
      assessMessages.getMessage('startingProcessRelatedObjects', [String(relatedObjects), this.projectPath])
    );

    Logger.logVerbose(migrateMessages.getMessage('retrievingMetadata', [String(relatedObjects), this.projectPath]));
    try {
      this.retrieveMetadata(relatedObjects);
    } catch (error) {
      Logger.error('Critical error retrieving metadata - cannot proceed', error);
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
          ? this.experienceSiteMigration.migrate()
          : this.experienceSiteMigration.assess();
      }
      if (relatedObjects.includes(Constants.FlexiPage)) {
        flexipageAssessmentInfos = isMigration ? this.flexipageMigration.migrate() : this.flexipageMigration.assess();
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

  public migrateAll(relatedObjects: string[]): RelatedObjectAssesmentInfo {
    return this.processRelatedObjects(relatedObjects, true);
  }

  public assessAll(relatedObjects: string[]): RelatedObjectAssesmentInfo {
    return this.processRelatedObjects(relatedObjects, false);
  }
}
