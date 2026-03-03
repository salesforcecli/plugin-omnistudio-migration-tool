/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as os from 'os';
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

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'clean');

export type CleanResult = {
  success: boolean;
};

interface CleanFlags {
  'target-org'?: Org;
  verbose?: boolean;
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
  };

  public async run(): Promise<CleanResult> {
    const { flags: parsedFlags } = await this.parse(Clean);
    const ux = new Ux();
    const logger = await CoreLogger.child(this.constructor.name);
    Logger.initialiseLogger(ux, logger, 'clean', parsedFlags.verbose);
    try {
      return await this.runClean(parsedFlags as CleanFlags);
    } catch (e) {
      const error = e as Error;
      Logger.error(messages.getMessage('errorRunningClean', [error.message]));
      process.exit(1);
    }
  }

  private async runClean(parsedFlags: CleanFlags): Promise<CleanResult> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const org = parsedFlags['target-org']!;
    const conn: Connection = org.getConnection();

    const orgs: OmnistudioOrgDetails = await OrgUtils.getOrgDetails(conn);
    initializeDataModelService(orgs);

    if (!isStandardDataModel()) {
      Logger.error(messages.getMessage('standardDataModelRequired'));
      return { success: false };
    }

    if (isStandardDataModelWithMetadataAPIEnabled()) {
      Logger.error(messages.getMessage('metadataApiAlreadyEnabled'));
      return { success: false };
    }

    Logger.warn(messages.getMessage('sandboxWarning'));
    const confirmed = await askConfirmation(messages.getMessage('confirmDeletion'));
    if (!confirmed) {
      Logger.log(messages.getMessage('operationCancelled'));
      return { success: false };
    }

    const specialCharService = new SpecialCharacterRecordCleanupService(conn, messages);
    await specialCharService.deactivateAndDelete();

    const existingRecordCleanupService = new ExistingRecordCleanupService(conn, messages);
    await existingRecordCleanupService.cleanAll();

    Logger.log(messages.getMessage('deletionComplete'));
    return { success: true };
  }
}
