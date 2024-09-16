/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import * as shell from 'shelljs';
import { Org } from '@salesforce/core';
import { fileutil, File } from '../../utils/file/fileutil';
import { MigrationResult } from '../interfaces';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { JavaScriptParser } from '../../utils/lwcparser/jsParser/JavaScriptParser';
import { HTMLParser } from '../../utils/lwcparser/htmlParser/HTMLParser';
import { XmlParser } from '../../utils/lwcparser/xmlParser/XmlParser';
import { Logger } from '../../utils/logger';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

const LWC_DIR_PATH = '/force-app/main/default/lwc';
const LWCTYPE = 'LightningComponentBundle';
const XML_TAG_TO_REMOVE = 'runtimeNamespace';

export class LwcMigration extends BaseRelatedObjectMigration {
  public identifyObjects(migrationResults: MigrationResult[]): Promise<JSON[]> {
    throw new Error('Method not implemented.');
  }
  public migrateRelatedObjects(migrationResults: MigrationResult[], migrationCandidates: JSON[]): void {
    this.migrate();
  }
  // eslint-disable-next-line @typescript-eslint/member-ordering

  public migrate(): void {
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    const targetOrg: Org = this.org;
    sfProject.retrieve(LWCTYPE, targetOrg.getUsername());
    this.processLwcFiles(this.projectPath);
    sfProject.deploy(LWCTYPE, targetOrg.getUsername());
    shell.cd(pwd);
  }

  public processLwcFiles(dir: string): File[] {
    dir += LWC_DIR_PATH;
    let files: File[] = [];
    try {
      files = fileutil.readAllFiles(dir);
      this.processFile(files);
    } catch (error) {
      Logger.logger.error('Error in reading files', error);
    }
    return files;
  }

  private processFile(files: File[]) {
    try {
      for (const file of files) {
        Logger.logger.info(file.location + ' files is Processing');
        if (file.ext === '.js') {
          this.processJavascriptFile(file);
        } else if (file.ext === '.html') {
          this.processHtmlFile(file);
        } else if (file.ext === '.xml') {
          this.processXMLFile(file);
        }
      }
    } catch (error) {
      Logger.logger.error(error.message);
    }
  }

  processJavascriptFile(file: File): void {
    const jsParser = new JavaScriptParser();
    const filePath = file.location;
    const output = jsParser.replaceImportSource(filePath, this.namespace);
    jsParser.saveToFile(filePath, output);
  }

  processHtmlFile(file: File): void {
    const filePath: string = file.location;
    const parse = new HTMLParser(filePath);
    parse.replaceTags(this.namespace);
    parse.saveToFile(filePath);
  }

  processXMLFile(file: File): void {
    const filePath: string = file.location;
    const parser = new XmlParser(filePath);
    const xmlString = parser.removeNode(XML_TAG_TO_REMOVE);
    parser.saveToFile(filePath, xmlString);
  }
}
