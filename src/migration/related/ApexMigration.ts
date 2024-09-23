import * as fs from 'fs';
import * as shell from 'shelljs';
import { Org } from '@salesforce/core';
import {
  ApexASTParser,
  InsertAfterTokenUpdate,
  InterfaceImplements,
  MethodCall,
  MethodParameter,
  ParameterType,
  RangeTokenUpdate,
  SingleTokenUpdate,
  TokenUpdater,
} from '../../utils/apex/parser/apexparser';
import { MigrationResult, RelatedObjectsMigrate } from '../interfaces';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { fileutil, File } from '../../utils/file/fileutil';
import { Logger } from '../../utils/logger';
import { ApexAssessmentInfo } from '../../utils';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

const APEXCLASS = 'Apexclass';
const APEX_CLASS_PATH = '/force-app/main/default/classes';
const CALLABLE = 'Callable';
const VLOCITY_OPEN_INTERFACE2 = 'VlocityOpenInterface2';
const VLOCITY_OPEN_INTERFACE = 'VlocityOpenInterface';

export class ApexMigration extends BaseRelatedObjectMigration implements RelatedObjectsMigrate {
  private readonly callableInterface: InterfaceImplements;
  private readonly vlocityOpenInterface2: InterfaceImplements;
  private readonly vlocityOpenInterface: InterfaceImplements;
  private updatedNamespace = this.namespace;
  public constructor(projectPath: string, namespace: string, org: Org) {
    super(projectPath, namespace, org);
    this.callableInterface = new InterfaceImplements(CALLABLE, this.namespace);
    this.vlocityOpenInterface2 = new InterfaceImplements(VLOCITY_OPEN_INTERFACE2, this.namespace);
    this.vlocityOpenInterface = new InterfaceImplements(VLOCITY_OPEN_INTERFACE, this.namespace);
  }
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

  public assess(): ApexAssessmentInfo[] {
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    const targetOrg: Org = this.org;
    sfProject.retrieve(APEXCLASS, targetOrg.getUsername());
    const apexAssessmentInfos = this.processApexFiles(this.projectPath);
    shell.cd(pwd);
    return apexAssessmentInfos;
  }
  public processApexFiles(dir: string): ApexAssessmentInfo[] {
    dir += APEX_CLASS_PATH;
    let files: File[] = [];
    files = fileutil.readFilesSync(dir);
    const fileAssessmentInfo: ApexAssessmentInfo[] = [];
    for (const file of files) {
      if (file.ext !== '.cls') continue;
      try {
        const apexAssementInfo = this.processApexFile(file);
        if (apexAssementInfo) fileAssessmentInfo.push(apexAssementInfo);
      } catch (err) {
        Logger.logger.error(`Error processing ${file.name}`);
        Logger.logger.error(err);
      }
    }
    return fileAssessmentInfo;
  }

  public processApexFile(file: File): ApexAssessmentInfo {
    const fileContent = fs.readFileSync(file.location, 'utf8');
    const interfaces: InterfaceImplements[] = [];
    interfaces.push(this.vlocityOpenInterface, this.vlocityOpenInterface2, this.callableInterface);
    const methodCalls = new Set<MethodCall>();
    const drNameParameter = new MethodParameter(2, ParameterType.DR_NAME);
    const ipNameParameter = new MethodParameter(1, ParameterType.IP_NAME);
    methodCalls.add(new MethodCall('DRGlobal', 'process', this.namespace, drNameParameter));
    methodCalls.add(new MethodCall('DRGlobal', 'processObjectsJSON', this.namespace, drNameParameter));
    methodCalls.add(new MethodCall('DRGlobal', 'processString', this.namespace, drNameParameter));
    methodCalls.add(new MethodCall('DRGlobal', 'processFromApex', this.namespace, drNameParameter));
    methodCalls.add(
      new MethodCall('IntegrationProcedureService', 'runIntegrationService', this.namespace, ipNameParameter)
    );
    const parser = new ApexASTParser(fileContent, interfaces, methodCalls, this.namespace);
    parser.parse();
    const tokenUpdates: TokenUpdater[] = [];
    const tokenUpdatesForRemoteCalls = this.processApexFileForRemotecalls(file, parser);
    const tokeUpdatesForMethodCalls = this.processApexFileForMethodCalls(file, parser);
    const updateMessages: string[] = [];

    if (tokenUpdatesForRemoteCalls && tokenUpdatesForRemoteCalls.length > 0) {
      tokenUpdates.push(...tokenUpdatesForRemoteCalls);
      updateMessages.push('File has been updated to allow remote calls from the Omnistudio components');
    }
    if (tokeUpdatesForMethodCalls && tokeUpdatesForMethodCalls.length > 0) {
      updateMessages.push('File has been updated to allow calls to Omnistudio components');
      tokenUpdates.push(...tokeUpdatesForMethodCalls);
    }
    if (tokenUpdates && tokenUpdates.length > 0) {
      fs.writeFileSync(file.location, parser.rewrite(tokenUpdates));
    }
    const warningMessage: string[] = this.processNonReplacableMethodCalls(file, parser);
    Logger.logger.warn(warningMessage);
    return {
      name: file.name,
      warnings: warningMessage,
      infos: updateMessages,
      path: file.location,
      diff: '',
    };
  }

  private processApexFileForRemotecalls(file: File, parser: ApexASTParser): TokenUpdater[] {
    const implementsInterface = parser.implementsInterfaces;
    const tokenUpdates: TokenUpdater[] = [];
    if (implementsInterface.has(this.callableInterface)) {
      Logger.logger.info('file ${file.name} already implements callable no changes will be applied');
    } else if (implementsInterface.has(this.vlocityOpenInterface2)) {
      const tokens = implementsInterface.get(this.vlocityOpenInterface2);
      tokenUpdates.push(new RangeTokenUpdate(CALLABLE, tokens[0], tokens[1]));
      tokenUpdates.push(new InsertAfterTokenUpdate(this.callMethodBody(), parser.classDeclaration));
    } else if (implementsInterface.has(this.vlocityOpenInterface)) {
      Logger.logger.error('file ${file.name} implements VlocityOpenInterface please implement Callable');
    }
    return tokenUpdates;
  }

  private processApexFileForMethodCalls(file: File, parser: ApexASTParser): TokenUpdater[] {
    const namespaceChanges = parser.namespaceChanges;
    const tokenUpdates: TokenUpdater[] = [];
    if (namespaceChanges && namespaceChanges.has(this.namespace)) {
      for (const tokenChange of namespaceChanges.get(this.namespace))
        tokenUpdates.push(new SingleTokenUpdate(this.updatedNamespace, tokenChange));
    }
    return tokenUpdates;
  }

  private processNonReplacableMethodCalls(file: File, parser: ApexASTParser): string[] {
    const methodCalls = parser.nonReplacableMethodParameters;
    const messages: string[] = [];
    if (methodCalls.length === 0) return messages;
    for (const methodCall of methodCalls) {
      messages.push(
        `${file.name} has method call ${methodCall.className} ${methodCall.methodName} for which bundleName could have been updated please check and replace with new value if updated.`
      );
    }
    return messages;
  }
  private callMethodBody(): string {
    return `
            public Object call(String action, Map<String,Object> args)
            {
                Map<String,Object> inputMap = (Map<String,Object>)args.get('input');
                Map<String,Object> outMap = (Map<String,Object>)args.get('output');
                Map<String,Object> options = (Map<String,Object>)args.get('options');

                return invokeMethod(action, inputMap, outMap, options);
            }
    `;
  }
}
