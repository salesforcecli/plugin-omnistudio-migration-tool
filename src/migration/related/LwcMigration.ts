/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Messages } from '@salesforce/core';
import * as shell from 'shelljs';
import { FileUtil, File } from '../../utils/file/fileUtil';
import { Logger } from '../../utils/logger';
import { FileProcessorFactory } from '../../utils/lwcparser/fileutils/FileProcessorFactory';
import { LwcPackageUtilityRegistry } from '../../utils/lwcparser/LwcPackageUtilityRegistry';
import { FileChangeInfo, LWCAssessmentInfo } from '../../utils';
import { Constants } from '../../utils/constants/stringContants';
import { ComponentType, createProgressBar } from '../base';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

Messages.importMessagesDirectory(__dirname);
const assessMessages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'assess');
const migrateMessages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'migrate');

const LWC_DIR_PATH = '/force-app/main/default/lwc';

export class LwcMigration extends BaseRelatedObjectMigration {
  public processObjectType(): string {
    return Constants.LWC;
  }
  // public identifyObjects(migrationResults: MigrationResult[]): Promise<JSON[]> {
  //   this.assessment();
  //   throw new Error('Method not implemented.');
  // }
  // public migrateRelatedObjects(migrationResults: MigrationResult[], migrationCandidates: JSON[]): string[] {
  //   return this.mapToName(this.migrate());
  // }
  public assessment(): LWCAssessmentInfo[] {
    Logger.logVerbose(assessMessages.getMessage('startingLwcAssessment', [this.projectPath]));
    LwcPackageUtilityRegistry.getInstance().initialize();
    const type = 'assessment';
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    Logger.info(assessMessages.getMessage('processingLwcsForAssessment'));
    const filesMap = this.processLwcFiles(this.projectPath);
    Logger.log(assessMessages.getMessage('successfullyProcessedLwcsForAssessment', [filesMap.size]));
    Logger.logVerbose(assessMessages.getMessage('lwcAssessmentResults', [JSON.stringify(filesMap, null, 2)]));
    shell.cd(pwd);
    return this.processFiles(filesMap, type);
  }

  public migrate(): LWCAssessmentInfo[] {
    Logger.logVerbose(migrateMessages.getMessage('startingLwcMigration', [this.projectPath]));
    LwcPackageUtilityRegistry.getInstance().initialize();
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    Logger.info(migrateMessages.getMessage('processingLwcsForMigration'));
    const filesMap = this.processLwcFiles(this.projectPath);
    const LWCAssessmentInfos = this.processFiles(filesMap, 'migration');
    Logger.log(migrateMessages.getMessage('successfullyProcessedLwcsForMigration', [LWCAssessmentInfos.length]));
    Logger.logVerbose(migrateMessages.getMessage('lwcMigrationResults', [JSON.stringify(LWCAssessmentInfos, null, 2)]));
    shell.cd(pwd);
    return LWCAssessmentInfos;
  }

  // This method is returning a Map of directory and list of file in directory
  private processLwcFiles(dir: string): Map<string, File[]> {
    dir += LWC_DIR_PATH;
    let filesMap: Map<string, File[]>;
    try {
      filesMap = FileUtil.readAndProcessFiles(dir, 'OmniScript Auto-generated');
    } catch (error) {
      Logger.error(assessMessages.getMessage('errorReadingFiles'), error);
    }
    return filesMap;
  }

  // This method to process the parsing and return the LWCAssessmentInfo[]
  private processFiles(fileMap: Map<string, File[]>, type: string): LWCAssessmentInfo[] {
    const progressBar =
      type.toLowerCase() === 'migration'
        ? createProgressBar('Migrating', Constants.LWCComponentName as ComponentType)
        : createProgressBar('Assessing', Constants.LWCComponentName as ComponentType);
    progressBar.start(fileMap.size, 0);
    let progressCounter = 0;
    const jsonData: LWCAssessmentInfo[] = [];
    const errors: Set<string> = new Set();
    fileMap.forEach((fileList, dir) => {
      try {
        const changeInfos: FileChangeInfo[] = [];
        if (
          dir !== Constants.LWC &&
          !dir.endsWith('MultiLanguage') &&
          !dir.endsWith('English') &&
          !dir.startsWith('cf') &&
          !dir.startsWith('Omniscript') &&
          !dir.includes('Util') &&
          !dir.includes('lodash')
        ) {
          for (const file of fileList) {
            if (this.isValideFile(file.name)) {
              const processor = FileProcessorFactory.getFileProcessor(file.ext);
              if (processor != null) {
                const path = file.location;
                const name = file.name + file.ext;
                const diff = processor.process(file, type, this.namespace);
                if (diff !== undefined && diff !== '[]') {
                  const fileInfo: FileChangeInfo = {
                    path,
                    name,
                    diff,
                  };
                  changeInfos.push(fileInfo);
                }
              }
            }
          }
          const name = dir;
          const errors: string[] = [];
          const assesmentInfo: LWCAssessmentInfo = {
            name,
            changeInfos,
            errors,
            warnings: [],
          };
          if (changeInfos && changeInfos.length > 0) {
            jsonData.push(assesmentInfo);
          }
        }
        progressBar.update(++progressCounter);
      } catch (error) {
        jsonData.push({
          name: dir,
          changeInfos: [],
          errors: [error instanceof Error ? error.message : String(error)],
          warnings: [],
        });
        errors.add(
          `${assessMessages.getMessage('errorProcessingFiles')} Error: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        progressBar.update(++progressCounter);
      }
    });
    progressBar.stop();
    return jsonData;
  }

  private isValideFile(filename: string): boolean {
    return !filename.includes('_def') && !filename.includes('styleDefinition') && !filename.includes('definition');
  }
}
