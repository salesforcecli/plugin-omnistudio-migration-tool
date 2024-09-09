/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as shell from 'shelljs';

export class cli {
  public static exec(cmd: string): string {
    const exec = shell.exec(cmd);
    let stdout: string;
    if (exec.code !== 0) {
      stdout = exec.stderr;
    } else {
      stdout = exec.stdout;
    }

    return stdout;
  }
}
