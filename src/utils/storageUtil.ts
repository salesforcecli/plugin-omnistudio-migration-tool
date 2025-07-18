import { FlexcardStorage, MigrationStorage, OmniScriptStorage } from '../migration/interfaces';
import { Logger } from './logger';

export class StorageUtil {
  private static omnistudioMigrationStorage: MigrationStorage = {
    osStorage: new Map<string, OmniScriptStorage>(),
    fcStorage: new Map<string, FlexcardStorage>(),
  };

  private static omnistudioAssessmentStorage: MigrationStorage = {
    osStorage: new Map<string, OmniScriptStorage>(),
    fcStorage: new Map<string, FlexcardStorage>(),
  };

  public static getOmnistudioMigrationStorage(): MigrationStorage {
    if (this.omnistudioMigrationStorage === undefined) {
      this.omnistudioAssessmentStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map<string, FlexcardStorage>(),
      };
    }

    if (this.omnistudioMigrationStorage.osStorage === undefined) {
      this.omnistudioMigrationStorage.osStorage = new Map<string, OmniScriptStorage>();
    }

    if (this.omnistudioMigrationStorage.fcStorage === undefined) {
      this.omnistudioMigrationStorage.fcStorage = new Map<string, FlexcardStorage>();
    }

    return this.omnistudioMigrationStorage;
  }

  public static getOmnistudioAssessmentStorage(): MigrationStorage {
    return this.omnistudioAssessmentStorage;
  }

  public static printMigrationStorage(): void {
    this.printStorage(this.omnistudioMigrationStorage);
  }

  private static printStorage(storage: MigrationStorage): void {
    try {
      Logger.logVerbose('Printing the storage');
      Logger.logVerbose(
        JSON.stringify(storage, (key, value) => {
          if (value instanceof Map) {
            const safeEntries = [...value.entries()].map(([k, v]) => {
              // Replace undefined/null with a placeholder or skip
              // eslint-disable-next-line @typescript-eslint/no-unsafe-return
              return [k, v ?? { note: 'Value was undefined' }];
            });

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return Object.fromEntries(safeEntries);
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return value;
        })
      );
    } catch (Error) {
      Logger.logVerbose('Error occurred while printing storage');
    }
  }
}
