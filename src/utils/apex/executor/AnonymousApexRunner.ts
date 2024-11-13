import { Org } from '@salesforce/core';

export class AnonymousApexRunner {
  public static async run(org: Org, anonymousApex: string): Promise<AnonymousApexRunner> {
    const connection = org.getConnection();
    return connection.tooling.executeAnonymous(anonymousApex);
  }
}
