/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Connection, Messages, Org, Logger as CoreLogger } from '@salesforce/core';
import { SfCommand, Ux, Flags as flags } from '@salesforce/sf-plugins-core';
import { Logger } from '../../../utils/logger';
import { OmnistudioOrgDetails, OrgUtils } from '../../../utils/orgUtils';
import {
  initializeDataModelService,
  isStandardDataModel,
  isStandardDataModelWithMetadataAPIEnabled,
} from '../../../utils/dataModelService';
import { SpecialCharacterRecordCleanupService } from '../../../utils/config/SpecialCharacterRecordCleanupService';
import { ExistingRecordCleanupService } from '../../../utils/config/ExistingRecordCleanupService';
import { askConfirmation } from '../../../utils/promptUtil';

const ASSESS_OUTPUT_FOLDER = 'clean_assessment';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'clean');

export type CleanResult = {
  success: boolean;
};

interface CleanFlags {
  'target-org'?: Org;
  verbose?: boolean;
  assess?: boolean;
}

export default class Clean extends SfCommand<CleanResult> {
  public static description = messages.getMessage('commandDescription');

  public static examples = messages.getMessage('examples').split(os.EOL);

  public static args: any = [];

  public static readonly flags: any = {
    'target-org': flags.optionalOrg({
      summary: 'Target org username or alias',
      char: 'u',
      required: true,
      aliases: ['targetusername'],
      deprecateAliases: true,
      makeDefault: false,
    }),
    verbose: flags.boolean({
      description: messages.getMessage('enableVerboseOutput'),
    }),
    assess: flags.boolean({
      description: messages.getMessage('assessFlagDescription'),
      default: false,
    }),
  };

  public async run(): Promise<CleanResult> {
    const { flags: parsedFlags } = await this.parse(Clean);
    const ux = new Ux();
    const logger = await CoreLogger.child(this.constructor.name);
    Logger.initialiseLogger(ux, logger, 'clean', parsedFlags.verbose);
    try {
      return await this.runClean(parsedFlags as CleanFlags, ux);
    } catch (e) {
      const error = e as Error;
      Logger.error(messages.getMessage('errorRunningClean', [error.message]));
      process.exit(1);
    }
  }

  private async runClean(parsedFlags: CleanFlags, ux: Ux): Promise<CleanResult> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const org = parsedFlags['target-org']!;
    const conn: Connection = org.getConnection();

    const orgs: OmnistudioOrgDetails = await OrgUtils.getOrgDetails(conn);
    initializeDataModelService(orgs);

    if (!isStandardDataModel()) {
      Logger.warn(messages.getMessage('standardDataModelRequired'));
      return { success: false };
    }

    if (isStandardDataModelWithMetadataAPIEnabled()) {
      Logger.log(messages.getMessage('metadataApiAlreadyEnabled'));
      return { success: false };
    }

    if (parsedFlags.assess) {
      return this.runAssess(conn, ux);
    }

    Logger.warn(messages.getMessage('sandboxWarning'));
    const confirmed = await askConfirmation(messages.getMessage('confirmDeletion'));
    if (!confirmed) {
      Logger.log(messages.getMessage('operationCancelled'));
      return { success: false };
    }

    const specialCharService = new SpecialCharacterRecordCleanupService(conn, messages, ux);
    await specialCharService.deactivateAndDelete();

    const existingRecordCleanupService = new ExistingRecordCleanupService(conn, messages, ux);
    await existingRecordCleanupService.cleanAll();

    Logger.log(messages.getMessage('deletionComplete'));
    return { success: true };
  }

  private async runAssess(conn: Connection, ux: Ux): Promise<CleanResult> {
    Logger.log(messages.getMessage('assessPhaseStart'));

    const specialCharService = new SpecialCharacterRecordCleanupService(conn, messages, ux);
    const existingRecordService = new ExistingRecordCleanupService(conn, messages, ux);

    // Run phases sequentially so their log output does not interleave
    const specialCharMap = await specialCharService.assess();
    const nullUniqueNameMap = await existingRecordService.assess();

    // Collect all entity names from both phases
    const allEntities = new Set([...specialCharMap.keys(), ...nullUniqueNameMap.keys()]);

    let totalRecords = 0;
    const outputDir = path.join(process.cwd(), ASSESS_OUTPUT_FOLDER);
    fs.mkdirSync(outputDir, { recursive: true });

    for (const entityName of allEntities) {
      const specialCharRecords = specialCharMap.get(entityName) ?? [];
      const nullUniqueNameRecords = nullUniqueNameMap.get(entityName) ?? [];
      const entityTotal = specialCharRecords.length + nullUniqueNameRecords.length;
      totalRecords += entityTotal;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const strip = (records: Array<Record<string, unknown>>): Array<Record<string, unknown>> =>
        records.map(({ attributes: _attrs, ...rest }) => rest);

      const assessment = {
        component: entityName,
        specialCharacterRecords: strip(specialCharRecords),
        orphanRecords: strip(nullUniqueNameRecords as unknown as Array<Record<string, unknown>>),
        totalToDelete: entityTotal,
      };

      // Use a filesystem-safe filename (remove spaces)
      const fileName = `${entityName.replace(/ /g, '')}.json`;
      const filePath = path.join(outputDir, fileName);
      fs.writeFileSync(filePath, JSON.stringify(assessment, null, 2));
      Logger.log(messages.getMessage('assessmentFileWritten', [filePath]));
    }

    if (totalRecords === 0) {
      Logger.log(messages.getMessage('assessmentNoRecords'));
    } else {
      Logger.log(messages.getMessage('assessmentComplete', [outputDir]));
    }

    return { success: true };
  }
}
