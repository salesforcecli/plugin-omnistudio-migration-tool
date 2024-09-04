/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as os from 'os';
import { Messages } from '@salesforce/core';
import '../../../utils/prototypes';
import { IConfig } from '@oclif/config';
import OmniStudioBaseCommand from '../../basecommand';
import { DebugTimer, MigratedObject, MigratedRecordInfo } from '../../../utils';
import { MigrationResult, MigrationTool } from '../../../migration/interfaces';
import { ResultsBuilder } from '../../../utils/resultsbuilder';
import {
  LWCComponentMigrationTool,
  CustomLabelMigrationTool,
  ApexClassMigrationTool,
} from '../../../migration/interfaces';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-related-object-migration-tool', 'migrate');

export default class OmnistudioRelatedObjectMigrationFacade extends OmniStudioBaseCommand {
  public static description = messages.getMessage('commandDescription');
  public static examples = messages.getMessage('examples').split(os.EOL);
  public static args = [{ name: 'file' }];

  protected readonly namespace: string;
  protected readonly only: string;
  protected readonly allversions: boolean;

  public constructor(argv: string[], config: IConfig) {
    super(argv, config);
    const { flags } = this.parse(OmnistudioRelatedObjectMigrationFacade);
    this.namespace = flags.namespace;
    this.only = flags.only;
    this.allversions = flags.allversions;
  }
  public async migrateAll(migrationResult: MigrationResult, namespace: string, relatedObjects: string[]): Promise<any> {
    const apiVersion = '55.0'; // Define the API version or make it configurable
    const conn = this.org.getConnection();
    conn.setApiVersion(apiVersion);

    // Start the debug timer
    DebugTimer.getInstance().start();

    // Declare an array of MigrationTool
    const migrationTools: MigrationTool[] = [];

    // Initialize migration tools based on the relatedObjects parameter
    if (relatedObjects.includes('lwc')) {
      migrationTools.push(this.createLWCComponentMigrationTool(namespace, conn));
    }
    if (relatedObjects.includes('labels')) {
      migrationTools.push(this.createCustomLabelMigrationTool(namespace, conn));
    }
    if (relatedObjects.includes('apex')) {
      migrationTools.push(this.createApexClassMigrationTool(namespace, conn));
    }

    if (migrationTools.length === 0) {
      throw new Error(messages.getMessage('noMigrationToolsSelected'));
    }

    // Proceed with migration logic
    const debugTimer = DebugTimer.getInstance();
    let objectMigrationResults: MigratedObject[] = [];

    // Truncate existing objects if necessary
    let allTruncateComplete = true;
    for (const tool of migrationTools.reverse()) {
      try {
        this.ux.log('Cleaning: ' + tool.getName());
        debugTimer.lap('Cleaning: ' + tool.getName());
        await tool.truncate();
      } catch (ex: any) {
        allTruncateComplete = false;
        objectMigrationResults.push({
          name: tool.getName(),
          errors: [ex.message],
        });
      }
    }

    if (allTruncateComplete) {
      for (const tool of migrationTools.reverse()) {
        try {
          this.ux.log('Migrating: ' + tool.getName());
          debugTimer.lap('Migrating: ' + tool.getName());
          const results = await tool.migrate();

          objectMigrationResults = objectMigrationResults.concat(
            results.map((r) => ({
              name: r.name,
              data: this.mergeRecordAndUploadResults(r, tool),
            }))
          );
        } catch (ex: any) {
          this.logger.error(JSON.stringify(ex));
          objectMigrationResults.push({
            name: tool.getName(),
            errors: [ex.message],
          });
        }
      }
    }

    // Stop the debug timer
    const timer = DebugTimer.getInstance().stop();

    await ResultsBuilder.generate(objectMigrationResults, conn.instanceUrl);

    // Save timer to debug logger
    this.logger.debug(timer);

    // Return results needed for --json flag
    return { objectMigrationResults };
  }

  // Factory methods to create instances of specific tools
  private createLWCComponentMigrationTool(namespace: string, conn: any): LWCComponentMigrationTool {
    // Return an instance of LWCComponentMigrationTool when implemented
    throw new Error('LWCComponentMigrationTool implementation is not provided yet.');
  }

  private createCustomLabelMigrationTool(namespace: string, conn: any): CustomLabelMigrationTool {
    // Return an instance of CustomLabelMigrationTool when implemented
    throw new Error('CustomLabelMigrationTool implementation is not provided yet.');
  }

  private createApexClassMigrationTool(namespace: string, conn: any): ApexClassMigrationTool {
    // Return an instance of ApexClassMigrationTool when implemented
    throw new Error('ApexClassMigrationTool implementation is not provided yet.');
  }

  private mergeRecordAndUploadResults(
    migrationResults: MigrationResult,
    migrationTool: MigrationTool
  ): MigratedRecordInfo[] {
    const mergedResults: MigratedRecordInfo[] = [];

    for (const record of Array.from(migrationResults.records.values())) {
      const obj = {
        id: record['Id'],
        name: migrationTool.getRecordName(record),
        status: 'Skipped',
        errors: record['errors'],
        migratedId: undefined,
        warnings: [],
        migratedName: '',
      };

      if (migrationResults.results.has(record['Id'])) {
        const recordResults = migrationResults.results.get(record['Id']);

        let errors: any[] = obj.errors || [];
        errors = errors.concat(recordResults.errors || []);

        obj.status = !recordResults || recordResults.hasErrors ? 'Error' : 'Complete';
        obj.errors = errors;
        obj.migratedId = recordResults.id;
        obj.warnings = recordResults.warnings;
        obj.migratedName = recordResults.newName;
      }

      mergedResults.push(obj);
    }

    return mergedResults;
  }
}
