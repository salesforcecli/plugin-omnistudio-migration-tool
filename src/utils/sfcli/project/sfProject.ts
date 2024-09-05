import { cli } from '../../shell/cli';

export class sfProject {
  public static create(name: string, outputDir?: string): void {
    let cmd: string = 'sf project generate --name ' + name;
    if (outputDir) {
      cmd = cmd + ' --output-dir ' + outputDir;
    }
    cli.exec(cmd);
  }
}
