import { cli } from '../../shell/cli';

export class sfProject {
  public static create(name: string, outputDir?: string): void {
    let cmd: string = 'sf project generate --name ' + name;
    if (outputDir) {
      cmd = cmd + ' --output-dir ' + outputDir;
    }
    cli.exec(cmd);
  }
  public static retrieve(metadataName: string, username: string): void {
    cli.exec(`sf project retrieve start --metadata ${metadataName} --target-org ${username}`);
  }
  public static deploy(metadataName: string, username: string): void {
    cli.exec(`sf project deploy start --metadata ${metadataName} --target-org ${username}`);
  }
}
