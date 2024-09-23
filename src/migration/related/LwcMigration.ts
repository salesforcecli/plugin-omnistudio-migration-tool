/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/member-ordering */
import * as shell from 'shelljs';
import { Org } from '@salesforce/core';
import { fileutil, File } from '../../utils/file/fileutil';
import { MigrationResult } from '../interfaces';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { Logger } from '../../utils/logger';
import { FileProcessorFactory } from '../../utils/lwcparser/fileutils/FileProcessorFactory';
import { LWCAssessmentInfo } from '../../utils';
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
    const type = 'assessment';
    this.processLwcFiles(this.projectPath, type);
  }
  public assessment(): LWCAssessmentInfo[] {
    const type = 'assessment';
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    this.processLwcFiles(this.projectPath, type);
    shell.cd(pwd);
    return this.getJsonObject();
  }

  public migrate(): void {
    const type = 'migrate';
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    const targetOrg: Org = this.org;
    sfProject.retrieve(LWCTYPE, targetOrg.getUsername());
    this.processLwcFiles(this.projectPath, type);
    // sfProject.deploy(LWCTYPE, targetOrg.getUsername());
    shell.cd(pwd);
  }

  private processLwcFiles(dir: string, type: string): File[] {
    dir += LWC_DIR_PATH;
    let files: File[] = [];
    try {
      files = fileutil.readAllFiles(dir);
      this.processFiles(files, type);
    } catch (error) {
      Logger.logger.error('Error in reading files', error);
    }
    return files;
  }

  public processFiles(files: File[], type: string): void {
    try {
      for (const file of files) {
        const processor = FileProcessorFactory.getFileProcessor(file.ext);
        if (processor) {
          processor.process(file, type, this.namespace);
        } else {
          Logger.logger.error('Unsupported file type: ' + file.ext);
        }
      }
    } catch (error) {
      Logger.logger.error(error.message);
    }
  }

  getJsonObject(): LWCAssessmentInfo[] {
    try {
      // Mock data (replace with actual fetch or database call)
      const assessmentInfo: LWCAssessmentInfo = {
        name: '',
        changeInfos: [],
        errors: [],
      };

      // Combine all the info into a JSON array
      const jsonData: LWCAssessmentInfo[] = [];
      jsonData.push(assessmentInfo);
      return jsonData;
    } catch (error) {
      Logger.logger.error('Error fetching or processing assessment data:', error);
      throw error;
    }
  }
}
