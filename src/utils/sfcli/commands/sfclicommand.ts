import { ComponentSet, DeployResult, RetrieveResult } from '@salesforce/source-deploy-retrieve';
import { Org } from '@salesforce/core';
export class sfcclicommand {
  public static async fetchApexClasses(org: Org, outputPath: string): Promise<RetrieveResult> {
    const result = await new ComponentSet([{ fullName: '*', type: 'ApexClass' }]).retrieve({
      usernameOrConnection: org.getUsername(),
      output: outputPath,
      merge: true,
    });
    const response = await result.pollStatus();
    return response;
  }

  public static async deployApexClasses(org: Org, inputPath: string): Promise<DeployResult> {
    const result = await ComponentSet.fromSource(inputPath).deploy({ usernameOrConnection: org.getUsername() });
    // result.start();
    const response = await result.pollStatus();
    return response;
  }
}
