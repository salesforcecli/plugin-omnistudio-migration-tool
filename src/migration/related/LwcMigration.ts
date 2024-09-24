/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as shell from 'shelljs';
import { Org } from '@salesforce/core';
import { fileutil, File } from '../../utils/file/fileutil';
import { MigrationResult } from '../interfaces';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { Logger } from '../../utils/logger';
import { FileProcessorFactory } from '../../utils/lwcparser/fileutils/FileProcessorFactory';
import { FileChangeInfo, LWCAssessmentInfo } from '../../utils';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

const LWC_DIR_PATH = '/force-app/main/default/lwc';
const LWCTYPE = 'LightningComponentBundle';

export class LwcMigration extends BaseRelatedObjectMigration {
  public identifyObjects(migrationResults: MigrationResult[]): Promise<JSON[]> {
    this.assessment();
    throw new Error('Method not implemented.');
  }
  public migrateRelatedObjects(migrationResults: MigrationResult[], migrationCandidates: JSON[]): void {
    this.migrate();
    this.processLwcFiles(this.projectPath);
  }
  public assessment(): LWCAssessmentInfo[] {
    const type = 'assessment';
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    sfProject.retrieve(LWCTYPE, this.org.getUsername());
    const filesMap = this.processLwcFiles(this.projectPath);
    shell.cd(pwd);
    return this.processFiles(filesMap, type);
  }

  public migrate(): void {
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    const targetOrg: Org = this.org;
    sfProject.retrieve(LWCTYPE, targetOrg.getUsername());
    this.processLwcFiles(this.projectPath);
    // sfProject.deploy(LWCTYPE, targetOrg.getUsername());
    shell.cd(pwd);
  }

  // This method is returning a Map of directory and list of file in directory
  private processLwcFiles(dir: string): Map<string, File[]> {
    dir += LWC_DIR_PATH;
    let filesMap: Map<string, File[]>;
    try {
      filesMap = fileutil.readAllFiles(dir);
    } catch (error) {
      Logger.logger.error('Error in reading files', error);
    }
    return filesMap;
  }

  // This method to process the parsing and return the LWCAssessmentInfo[]
  private processFiles(fileMap: Map<string, File[]>, type: string): LWCAssessmentInfo[] {
    try {
      const jsonData: LWCAssessmentInfo[] = [];
      fileMap.forEach((fileList, dir) => {
        const changeInfos: FileChangeInfo[] = [];
        if (dir !== 'lwc') {
          for (const file of fileList) {
            const processor = FileProcessorFactory.getFileProcessor(file.ext);
            if (processor != null) {
              const path = file.location;
              const name = file.name;
              const diff = processor.process(file, type, this.namespace);
              const fileInfo: FileChangeInfo = {
                path,
                name,
                diff,
              };
              changeInfos.push(fileInfo);
            }
          }
          const name = dir;
          const errors: string[] = [];
          const assesmentInfo: LWCAssessmentInfo = {
            name,
            changeInfos,
            errors,
          };
          jsonData.push(assesmentInfo);
        }
      });
      return jsonData;
    } catch (error) {
      Logger.logger.error(error.message);
    }
  }
}
