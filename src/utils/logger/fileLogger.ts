import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../logger';

export class FileLogger {
  private static logDir = path.resolve(process.cwd(), 'logs');
  private static currentLogFile: string | null = null;
  private static isInitialized = false;

  public static initialize(command = 'default'): void {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create logs directory if it doesn't exist
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Create log file with timestamp and command name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.currentLogFile = path.join(this.logDir, `${timestamp}_${command}.log`);

      // Create an empty log file to ensure it exists
      fs.writeFileSync(this.currentLogFile, '');

      this.isInitialized = true;
      Logger.logVerbose(`Log file initialized at: ${this.currentLogFile}`);
    } catch (error: unknown) {
      const err = error as Error;
      Logger.error(`Error initializing FileLogger: ${err.message}\n${err.stack}`);
      // Fallback to console logging if file system operations fail
      this.currentLogFile = null;
    }
  }

  public static writeLog(level: string, message: string): void {
    // Initialize with default command if not already initialized
    if (!this.isInitialized) {
      this.initialize();
    }

    if (!this.currentLogFile) {
      // Fallback to console logging if file logging is not available
      Logger.log(`[${level}] ${message}`);
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;

    try {
      fs.appendFileSync(this.currentLogFile, logEntry);
    } catch (error: unknown) {
      const err = error as Error;
      Logger.error(`Error writing to log file: ${err.message}\n${err.stack}`);
      // Fallback to console logging
      Logger.log(`[${level}] ${message}`);
    }
  }
}
