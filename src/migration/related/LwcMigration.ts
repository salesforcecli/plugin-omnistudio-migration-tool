/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import * as shell from 'shelljs';
import { Org } from '@salesforce/core';
import { fileutil, File } from '../../utils/file/fileutil';
import { MigrationResult } from '../interfaces';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { JavaScriptParser } from '../../utils/lwcparser/jsparser/JavaScriptParser';
import { HTMLParser } from '../../utils/lwcparser/htmlparser/HTMLParser';
import { XmlParser } from '../../utils/lwcparser/xmlparser/XmlParser';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

const LWC_DIR_PATH = '/force-app/main/default/lwc';
const LWCTYPE = 'LightningComponentBundle';
const XML_TAG_TO_REMOVE = 'runtimeNamespace';
const NAMESPACE = 'vlocity_ins';

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
    // files = fileutil.readFilesSync(dir);
    files = fileutil.readAllFiles(dir);
    // TODO: Add logging
    for (const file of files) {
      if (file.ext === '.js') {
        this.processJavascriptFile(file);
      } else if (file.ext === '.html') {
        this.processHtmlFile(file);
      } else if (file.ext === '.xml') {
        this.processXMLFile(file);
      }
    }
    return files;
  }

  processJavascriptFile(file: File): void {
    const jsParser = new JavaScriptParser();
    const filePath = file.location;
    const namespace = NAMESPACE;
    jsParser.replaceImportSource(filePath, namespace);
  }

  processHtmlFile(file: File): void {
    const filePath: string = file.location;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const parse = new HTMLParser(filePath);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    parse.replaceTags(NAMESPACE);
    parse.saveToFile(filePath);
  }

  processXMLFile(file: File): void {
    const filePath: string = file.location;
    const parser = new XmlParser(filePath);

    parser.removeNode(XML_TAG_TO_REMOVE);
    // eslint-disable-next-line no-console
    console.log(parser.getXmlString());
  }
}
