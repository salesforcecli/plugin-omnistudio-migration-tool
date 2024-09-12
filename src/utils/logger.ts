import { UX } from '@salesforce/command';
import { Logger as SfLogger } from '@salesforce/core';

export class Logger {
  private static sfUX: UX;
  private static sfLogger: SfLogger;

  public static initialiseLogger(ux: UX, logger: SfLogger): Logger {
    Logger.sfUX = ux;
    Logger.sfLogger = logger;
    return Logger;
  }

  public static get logger(): SfLogger {
    return Logger.sfLogger;
  }
  public static get ux(): UX {
    return Logger.sfUX;
  }
}
