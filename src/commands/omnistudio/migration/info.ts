/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as os from 'os';
import { flags, SfdxCommand } from '@salesforce/command';
import { SfdxError } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { Logger } from '../../../utils/logger';
import { MessageService } from '../../../utils/MessageService';

// Initialize Messages with the current plugin directory

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.

export default class Org extends SfdxCommand {
  public static description = MessageService.getMessage('infoCommandDescription');

  public static examples = MessageService.getMessage('infoExamples').split(os.EOL);

  public static args = [{ name: 'file' }];

  protected static flagsConfig = {
    name: flags.string({
      char: 'n',
      description: MessageService.getMessage('nameFlagDescription'),
    }),
    allversions: flags.boolean({
      char: 'a',
      description: MessageService.getMessage('allVersionsDescription'),
      required: false,
    }),
    verbose: flags.builtin({
      type: 'builtin',
      description: 'Enable verbose output',
    }),
  };

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  // Comment this out if your command does not support a hub org username
  protected static supportsDevhubUsername = true;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  protected static requiresProject = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public constructor(argv: string[], context: any) {
    super(argv, context);
    MessageService.init('info');
  }

  public async run(): Promise<AnyJson> {
    try {
      return await this.runInfo();
    } catch (error) {
      Logger.error('Error running info', error);
      process.exit(1);
    }
  }

  public async runInfo(): Promise<AnyJson> {
    const name = (this.flags.name || 'world') as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const allVersions = this.flags.allversions || false;

    // this.org is guaranteed because requiresUsername=true, as opposed to supportsUsername
    const conn = this.org.getConnection();
    const query = 'Select Name, TrialExpirationDate from Organization';

    // The type we are querying for
    interface Organization {
      Name: string;
      TrialExpirationDate: string;
    }

    // Query the org
    const result = await conn.query<Organization>(query);

    // Organization will always return one result, but this is an example of throwing an error
    // The output and --json will automatically be handled for you.
    if (!result.records || result.records.length <= 0) {
      throw new SfdxError(MessageService.getMessage('errorNoOrgResults', [this.org.getOrgId()]));
    }

    // Organization always only returns one result
    const orgName = result.records[0].Name;
    const trialExpirationDate = result.records[0].TrialExpirationDate;

    let outputString = '';
    if (trialExpirationDate) {
      const date = new Date(trialExpirationDate).toDateString();
      outputString = MessageService.getMessage('greetingOrgInfoWithDate', [name, orgName, date]);
    } else {
      outputString = MessageService.getMessage('greetingOrgInfo', [name, orgName]);
    }
    Logger.log(outputString);

    // this.hubOrg is NOT guaranteed because supportsHubOrgUsername=true, as opposed to requiresHubOrgUsername.
    if (this.hubOrg) {
      const hubOrgId = this.hubOrg.getOrgId();
      Logger.log(MessageService.getMessage('hubOrgId', [hubOrgId]));
    }

    if (allVersions) {
      outputString = outputString + MessageService.getMessage('allVersionsAppended');
    }

    // Return an object to be displayed with --json
    return { orgId: this.org.getOrgId(), outputString };
  }
}
