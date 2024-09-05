import { RetrieveResult } from '@salesforce/source-deploy-retrieve';
import { sfcclicommand } from '../../utils/sfcli/commands/sfclicommand';
import { Logger } from '../../utils/logger';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';
import * as fs from 'fs';
import * as path from 'path';
import { ApexASTParser } from '../../utils/apex/parser/apexparser';


export class ApexMigration extends BaseRelatedObjectMigration {
  public async migrate(): Promise<void> {
    const retrieveResult: Promise<RetrieveResult> = sfcclicommand.fetchApexClasses(this.org, this.projectPath);
    const res = await retrieveResult;
    if (!res.components || res.components.size === 0) {
      Logger.ux.log('No Apex found in the org');
      return;
    }
    Logger.ux.log(`${res.components.size} Apex classes found in the org`);
    this.processApexFiles(this.projectPath);
    await sfcclicommand.deployApexClasses(this.org, this.projectPath);
  }
  public processApexFiles(dir: string): File[] {
    let files: File[] = [];
    files = this.readFilesSync(dir);
    for (const file of files) {
      if (file.ext !== '.cls') continue;
      this.processApexFile(file);
    }
    return files;
  }

  public processApexFile(file: File): void {
    const fileContent = fs.readFileSync(file.location, 'utf8');
    const interfaces = new Set<string>(['VlocityOpenInterface', 'VlocityOpenInterface2', 'Callable']);
    const parser = new ApexASTParser(fileContent, interfaces, 'DRGlobal.process');
    parser.parse();
    // this.processApexFileforInterfaces(parser.implementsInterfaces, file, fileContent);
  }
  /*
  processApexFileforInterfaces(
    implementsInterfaces: Map<string, import('antlr4ts').Token>,
    file: File,
    fileContent: string
  ) {
    if (implementsInterfaces.has('Callable')) return;
  }
*/

  public readFilesSync(dir: string): File[] {
    let files: File[];

    fs.readdirSync(dir).forEach((filename) => {
      const name = path.parse(filename).name;
      const ext = path.parse(filename).ext;
      const filepath = path.resolve(dir, filename);
      const stat = fs.statSync(filepath);
      const isFile = stat.isFile();

      if (isFile) files.push(new File(name, filepath, ext));
    });
    return files;
  }
}

export class File {
  public name: string;
  public location: string;
  public ext: string;
  public constructor(name: string, location: string, ext: string) {
    this.name = name;
    this.location = location;
    this.ext = ext;
  }
}
