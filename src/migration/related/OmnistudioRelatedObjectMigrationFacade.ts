/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Org } from '@salesforce/core';
import '../../utils/prototypes';
import * as shell from 'shelljs';
import {
  ApexAssessmentInfo,
  DebugTimer,
  LWCAssessmentInfo,
  MigratedObject,
  RelatedObjectAssesmentInfo,
} from '../../utils';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { Logger } from '../../utils/logger';
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

  public constructor(namespace: string, only: string, allversions: boolean, org: Org) {
    this.namespace = namespace;
    this.only = only;
    this.allversions = allversions;
    this.org = org;
  }
  public static intializeProject(projectPath?: string): string {
    if (projectPath) {
      // sfProject.create(defaultProjectName, projectPath);
      return projectPath;
    } else {
      sfProject.create(defaultProjectName);
      return process.cwd() + '/' + defaultProjectName;
    }
  }
  public intializeProjectWithRetrieve(relatedObjects: string[], projectPath?: string): string {
    if (projectPath) {
      // sfProject.create(defaultProjectName, projectPath);
      return projectPath;
    } else {
      sfProject.create(defaultProjectName);
      projectPath = process.cwd() + '/' + defaultProjectName;
      const pwd = shell.pwd();
      shell.cd(projectPath);
      // TODO: Uncomment code once MVP for migration is completed
      // if (relatedObjects.includes('lwc')) {
      //   sfProject.retrieve(LWCTYPE, this.org.getUsername());
      // }
      if (relatedObjects.includes('apex')) {
        sfProject.retrieve(APEXCLASS, this.org.getUsername());
      }
      shell.cd(pwd);
    }
    return projectPath;
  }

  public migrateAll(
    migrationResult: MigratedObject[],
    relatedObjects: string[],
    projectPath?: string,
    targetApexNamespace?: string
  ): RelatedObjectAssesmentInfo {
    // Start the debug timer
    DebugTimer.getInstance().start();

    // Declare an array of MigrationTool
    const projectDirectory: string = this.intializeProjectWithRetrieve(relatedObjects, projectPath);
    const debugTimer = DebugTimer.getInstance();
    debugTimer.start();
    // Initialize migration tools based on the relatedObjects parameter
    const apexMigrator = this.createApexClassMigrationTool(projectDirectory, targetApexNamespace);
    // TODO: Uncomment code once MVP for migration is completed
    // const lwcMigrator = this.createLWCComponentMigrationTool(this.namespace, projectDirectory);
    let apexAssessmentInfos: ApexAssessmentInfo[] = [];
    const lwcAssessmentInfos: LWCAssessmentInfo[] = [];
    // Proceed with migration logic
    try {
      if (relatedObjects.includes('apex')) {
        apexAssessmentInfos = apexMigrator.migrate();
      }
    } catch (Error) {
      // Log the error
      Logger.logger.error(Error.message);
    }
    // TODO: Uncomment code once MVP for migration is completed
    /* try {
       if (relatedObjects.includes('lwc')) {
         lwcAssessmentInfos = lwcMigrator.migrate();
       }
     } catch (Error) {
       // Log the error
       Logger.logger.error(Error.message);
     } */

    // Truncate existing objects if necessary
    // Stop the debug timer
    const timer = debugTimer.stop();

    // Save timer to debug logger
    Logger.logger.debug(timer);

    // Return results needed for --json flag
    return { apexAssessmentInfos, lwcAssessmentInfos };
  }

  // Factory methods to create instances of specific tools
  // @ts-expect-error - LWC functionality temporarily disabled
  private createLWCComponentMigrationTool(namespace: string, projectPath: string): LwcMigration {
    // Return an instance of LWCComponentMigrationTool when implemented
    return new LwcMigration(projectPath, this.namespace, this.org);
  }

  private createApexClassMigrationTool(projectPath: string, targetApexNamespace?: string): ApexMigration {
    // Return an instance of ApexClassMigrationTool when implemented
    return new ApexMigration(projectPath, this.namespace, this.org, targetApexNamespace);
  }
}
