import * as fs from 'fs';
import * as path from 'path';
// import { RetrieveResult } from '@salesforce/source-deploy-retrieve';
// import { sfcclicommand } from '../../utils/sfcli/commands/sfclicommand';
import * as shell from 'shelljs';
import { ApexASTParser } from '../../utils/apex/parser/apexparser';
import { cli } from '../../utils/shell/cli';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

export class ApexMigration extends BaseRelatedObjectMigration {
  public migrate(): void {
    cli.exec(`sf project retrieve start --metadata Apexclass --target-org ${this.org.getUsername()}`);
    this.processApexFiles(this.projectPath);
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    cli.exec(`sf project deploy start --metadata Apexclass --target-org ${this.org.getUsername()}`);
    shell.cd(pwd);
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
