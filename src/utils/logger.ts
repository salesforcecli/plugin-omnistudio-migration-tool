import { UX } from '@salesforce/command';
import { Logger as SfLogger } from '@salesforce/core';

export class Logger {
  private ux: UX;
  private logger: SfLogger;

  constructor(ux: UX, logger: SfLogger) {
    this.ux = ux;
    this.logger = logger;
  }

  public log(message: string): void {
    this.ux.log(message);
  }

  public error(message: string): void {
    this.logger.error(message);
  }

  public debug(message: string): void {
    this.logger.debug(message);
  }

  // You can add more logging methods as needed
}
