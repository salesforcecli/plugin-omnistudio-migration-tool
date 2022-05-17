import { SfdxCommand } from '@salesforce/command';
import { AnyJson } from '@salesforce/ts-types';

export default abstract class OmniStudioBaseCommand extends SfdxCommand {
  protected static requiresUsername = true;
  protected static supportsDevhubUsername = false;
  protected static requiresProject = false;

  public run(): Promise<AnyJson> {
    return null;
  }
}
