/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Org } from '@salesforce/core';
import '../../../utils/prototypes';
import { DebugTimer, MigratedObject } from '../../../utils';
import { RelatedObjectsMigrate } from '../../../migration/interfaces';
import { sfProject } from '../../../utils/sfcli/project/sfProject';
import { Logger } from '../../../utils/logger';
import { ApexMigration } from '../../../migration/related/ApexMigration';
import { LwcMigration } from '../../../migration/related/LwcMigration';

// Initialize Messages with the current plugin directory
// Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
// const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-related-object-migration-tool', 'migrate');

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
      sfProject.create(defaultProjectName, projectPath);
      return projectPath + '/' + defaultProjectName;
    } else {
      sfProject.create(defaultProjectName);
      return process.cwd() + '/' + defaultProjectName;
    }
  }
  public migrateAll(migrationResult: MigratedObject[], relatedObjects: string[]): any {
    // Start the debug timer
    DebugTimer.getInstance().start();

    // Declare an array of MigrationTool
    const migrationTools: RelatedObjectsMigrate[] = [];
    const projectDirectory: string = OmnistudioRelatedObjectMigrationFacade.intializeProject();
    const debugTimer = DebugTimer.getInstance();
    debugTimer.start();
    // Initialize migration tools based on the relatedObjects parameter
    if (relatedObjects.includes('lwc')) {
      migrationTools.push(this.createLWCComponentMigrationTool(this.namespace, projectDirectory));
    }
    if (relatedObjects.includes('labels')) {
      migrationTools.push(this.createCustomLabelMigrationTool(this.namespace, this.org));
    }
    if (relatedObjects.includes('apex')) {
      migrationTools.push(this.createApexClassMigrationTool(projectDirectory));
    }

    // Proceed with migration logic
    for (const migrationTool of migrationTools.reverse()) {
      try {
        migrationTool.migrateRelatedObjects(null, null);
      } catch (Error) {
        // Log the error
        Logger.logger.error(Error.message);
        return { migrationResult };
      }
    }
    // Truncate existing objects if necessary
    // Stop the debug timer
    const timer = debugTimer.stop();

    // Save timer to debug logger
    Logger.logger.debug(timer);

    // Return results needed for --json flag
    return { migrationResult };
  }

  // Factory methods to create instances of specific tools
  private createLWCComponentMigrationTool(namespace: string, projectPath: string): LwcMigration {
    // Return an instance of LWCComponentMigrationTool when implemented
    return new LwcMigration(projectPath, this.namespace, this.org);
  }

  private createCustomLabelMigrationTool(namespace: string, org: Org): RelatedObjectsMigrate {
    // Return an instance of CustomLabelMigrationTool when implemented
    throw new Error('CustomLabelMigrationTool implementation is not provided yet.');
  }

  private createApexClassMigrationTool(projectPath: string): ApexMigration {
    // Return an instance of ApexClassMigrationTool when implemented
    return new ApexMigration(projectPath, this.namespace, this.org);
  }
}
