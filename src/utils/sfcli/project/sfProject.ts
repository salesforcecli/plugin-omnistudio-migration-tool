import { Logger } from '../../logger';
import { MessageService } from '../../MessageService';
import { cli } from '../../shell/cli';

export class sfProject {
  public static create(name: string, outputDir?: string): void {
    Logger.log(MessageService.getMessage('creatingProject', [name]));
    const cmd = `sf project generate --name ${name}${outputDir ? ` --output-dir ${outputDir}` : ''}`;
    sfProject.executeCommand(cmd);
    Logger.log(MessageService.getMessage('projectCreated', [name]));
  }

  public static retrieve(metadataName: string, username: string): void {
    Logger.log(MessageService.getMessage('retrievingMetadata', [metadataName, username]));
    const cmd = `sf project retrieve start --metadata ${metadataName} --target-org ${username}`;
    sfProject.executeCommand(cmd);
    Logger.log(MessageService.getMessage('metadataRetrieved', [metadataName, username]));
  }

  public static deploy(metadataName: string, username: string): void {
    Logger.log(MessageService.getMessage('deployingMetadata', [metadataName, username]));
    const cmd = `sf project deploy start --metadata ${metadataName} --target-org ${username}`;
    sfProject.executeCommand(cmd);
    Logger.log(MessageService.getMessage('metadataDeployed', [metadataName, username]));
  }

  private static executeCommand(cmd: string): void {
    try {
      cli.exec(`${cmd} --json > /dev/null 2>&1`);
    } catch (error) {
      Logger.error(MessageService.getMessage('sfProjectCommandError', [String(error)]));
      throw error;
    }
  }
}
