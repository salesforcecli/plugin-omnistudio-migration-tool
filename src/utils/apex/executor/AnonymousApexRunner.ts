import { Org } from '@salesforce/core';
import { ExecuteAnonymousResult } from 'jsforce';

export class AnonymousApexRunner {
  public static async run(org: Org, anonymousApex: string): Promise<ExecuteAnonymousResult> {
    return org.getConnection().tooling.executeAnonymous(anonymousApex);
  }
}
