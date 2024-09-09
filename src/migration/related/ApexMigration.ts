import * as fs from 'fs';
// import { RetrieveResult } from '@salesforce/source-deploy-retrieve';
// import { sfcclicommand } from '../../utils/sfcli/commands/sfclicommand';
import * as shell from 'shelljs';
import { Org } from '@salesforce/core';
import { ApexASTParser, MethodCall } from '../../utils/apex/parser/apexparser';
import { MigrationResult, RelatedObjectsMigrate } from '../interfaces';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { fileutil, File } from '../../utils/file/fileutil';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';
const APEXCLASS = 'Apexclass';
const APEX_CLASS_PATH = '/force-app/main/default/classes';
export class ApexMigration extends BaseRelatedObjectMigration implements RelatedObjectsMigrate {
  public identifyObjects(migrationResults: MigrationResult[]): Promise<JSON[]> {
    throw new Error('Method not implemented.');
  }
  public migrateRelatedObjects(migrationResults: MigrationResult[], migrationCandidates: JSON[]): void {
    this.migrate();
  }
  public migrate(): void {
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    const targetOrg: Org = this.org;
    sfProject.retrieve(APEXCLASS, targetOrg.getUsername());
    this.processApexFiles(this.projectPath);
    sfProject.deploy(APEXCLASS, targetOrg.getUsername());
    shell.cd(pwd);
  }
  public processApexFiles(dir: string): File[] {
    dir += APEX_CLASS_PATH;
    let files: File[] = [];
    files = fileutil.readFilesSync(dir);
    for (const file of files) {
      if (file.ext !== '.cls') continue;
      this.processApexFile(file);
    }
    return files;
  }

  public processApexFile(file: File): void {
    const fileContent = fs.readFileSync(file.location, 'utf8');
    const interfaces = new Set<string>(['VlocityOpenInterface', 'VlocityOpenInterface2', 'Callable']);
    const methodCalls = new Set<MethodCall>();
    methodCalls.add(new MethodCall('process', 'DRGlobal', this.namespace));
    methodCalls.add(new MethodCall('processObjectsJSON', 'DRGlobal', this.namespace));
    const parser = new ApexASTParser(fileContent, interfaces, methodCalls, this.namespace);
    parser.parse();
    this.processApexFileforDRCalls(file, fileContent);
  }
  public processApexFileforDRCalls(file: File, fileContent: string): void {
    // fileContent = fileContent.replace(this.namespace + '.', 'omnistudio.');
    fs.writeFileSync(file.location, fileContent, 'utf-8');
  }
}
