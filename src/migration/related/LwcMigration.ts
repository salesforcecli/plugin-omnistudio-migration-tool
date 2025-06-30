/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as shell from 'shelljs';
import { FileUtil, File } from '../../utils/file/fileUtil';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { Logger } from '../../utils/logger';
import { FileProcessorFactory } from '../../utils/lwcparser/fileutils/FileProcessorFactory';
import { FileChangeInfo, LWCAssessmentInfo } from '../../utils';
import { Constants } from '../../utils/constants/stringContants';
import { MessageService } from '../../utils/MessageService';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

const LWC_DIR_PATH = '/force-app/main/default/lwc';
const LWCTYPE = 'LightningComponentBundle';

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
    Logger.logVerbose(MessageService.getMessage('startingLwcAssessment', [this.projectPath]));
    const type = 'assessment';
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    sfProject.retrieve(LWCTYPE, this.org.getUsername());
    Logger.info(MessageService.getMessage('processingLwcsForAssessment'));
    const filesMap = this.processLwcFiles(this.projectPath);
    Logger.info(MessageService.getMessage('successfullyProcessedLwcsForAssessment', [filesMap.size]));
    Logger.logVerbose(MessageService.getMessage('lwcAssessmentResults', [JSON.stringify(filesMap, null, 2)]));
    shell.cd(pwd);
    return this.processFiles(filesMap, type);
  }

  public migrate(): LWCAssessmentInfo[] {
    Logger.logVerbose(MessageService.getMessage('startingLwcMigration', [this.projectPath]));
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    // const targetOrg: Org = this.org;
    // sfProject.retrieve(LWCTYPE, targetOrg.getUsername());
    Logger.info(MessageService.getMessage('processingLwcsForMigration'));
    const filesMap = this.processLwcFiles(this.projectPath);
    const LWCAssessmentInfos = this.processFiles(filesMap, 'migration');
    Logger.info(MessageService.getMessage('successfullyProcessedLwcsForMigration', [LWCAssessmentInfos.length]));
    Logger.logVerbose(MessageService.getMessage('lwcMigrationResults', [JSON.stringify(LWCAssessmentInfos, null, 2)]));
    // sfProject.deploy(LWCTYPE, targetOrg.getUsername());
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
      Logger.error(MessageService.getMessage('errorReadingFiles'), error);
    }
    return filesMap;
  }

  // This method to process the parsing and return the LWCAssessmentInfo[]
  private processFiles(fileMap: Map<string, File[]>, type: string): LWCAssessmentInfo[] {
    try {
      const jsonData: LWCAssessmentInfo[] = [];
      fileMap.forEach((fileList, dir) => {
        const changeInfos: FileChangeInfo[] = [];
        if (
          dir !== Constants.LWC &&
          !dir.endsWith('MultiLanguage') &&
          !dir.endsWith('English') &&
          !dir.includes('_') &&
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
          };
          if (changeInfos && changeInfos.length > 0) {
            jsonData.push(assesmentInfo);
          }
        }
      });
      return jsonData;
    } catch (error) {
      Logger.error(MessageService.getMessage('errorProcessingFiles'), error);
    }
  }

  private isValideFile(filename: string): boolean {
    return !filename.includes('_def') && !filename.includes('styleDefinition') && !filename.includes('definition');
  }
}
