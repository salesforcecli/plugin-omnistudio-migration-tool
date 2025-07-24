import * as fs from 'fs';
import * as shell from 'shelljs';
import { Org, Messages } from '@salesforce/core';
import { Token } from 'antlr4ts';
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
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { FileUtil, File } from '../../utils/file/fileUtil';
import { Logger } from '../../utils/logger';
import { ApexAssessmentInfo } from '../../utils';
import { FileDiffUtil } from '../../utils/lwcparser/fileutils/FileDiffUtil';
import { Stringutil } from '../../utils/StringValue/stringutil';
import { Constants } from '../../utils/constants/stringContants';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

Messages.importMessagesDirectory(__dirname);
const assessMessages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'assess');
const migrateMessages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'migrate');

const APEXCLASS = 'Apexclass';
const APEX_CLASS_PATH = '/force-app/main/default/classes';
const CALLABLE = 'System.Callable';
const VLOCITY_OPEN_INTERFACE2 = 'VlocityOpenInterface2';
const VLOCITY_OPEN_INTERFACE = 'VlocityOpenInterface';

export class ApexMigration extends BaseRelatedObjectMigration {
  private readonly callableInterface: InterfaceImplements;
  private readonly vlocityOpenInterface2: InterfaceImplements;
  private readonly vlocityOpenInterface: InterfaceImplements;
  private updatedNamespace;
  public constructor(projectPath: string, namespace: string, org: Org, targetApexNameSpace?: string) {
    super(projectPath, namespace, org);
    this.updatedNamespace = targetApexNameSpace ? targetApexNameSpace : namespace;
    this.callableInterface = new InterfaceImplements('Callable', 'System');
    this.vlocityOpenInterface2 = new InterfaceImplements(VLOCITY_OPEN_INTERFACE2, this.namespace);
    this.vlocityOpenInterface = new InterfaceImplements(VLOCITY_OPEN_INTERFACE, this.namespace);
  }
  public processObjectType(): string {
    return Constants.Apex;
  }
  // public identifyObjects(migrationResults: MigrationResult[]): Promise<JSON[]> {
  //   throw new Error('Method not implemented.');
  // }
  // public migrateRelatedObjects(migrationResults: MigrationResult[], migrationCandidates: JSON[]): ApexAssessmentInfo[] {
  //   return this.migrate();
  // }
  public migrate(): ApexAssessmentInfo[] {
    Logger.logVerbose(migrateMessages.getMessage('startingApexMigration', [this.projectPath]));
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    // const targetOrg: Org = this.org;
    // sfProject.retrieve(APEXCLASS, targetOrg.getUsername());
    Logger.info(migrateMessages.getMessage('processingApexFilesForMigration'));
    const apexAssessmentInfos = this.processApexFiles(this.projectPath, 'migration');
    Logger.info(migrateMessages.getMessage('successfullyProcessedApexFilesForMigration', [apexAssessmentInfos.length]));
    Logger.logVerbose(
      migrateMessages.getMessage('apexMigrationResults', [JSON.stringify(apexAssessmentInfos, null, 2)])
    );
    // sfProject.deploy(APEXCLASS, targetOrg.getUsername());
    shell.cd(pwd);
    return apexAssessmentInfos;
  }

  public assess(): ApexAssessmentInfo[] {
    Logger.logVerbose(assessMessages.getMessage('startingApexAssessment', [this.projectPath]));
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    sfProject.retrieve(APEXCLASS, this.org.getUsername());
    Logger.info(assessMessages.getMessage('processingApexFilesForAssessment'));
    const apexAssessmentInfos = this.processApexFiles(this.projectPath, 'assessment');
    Logger.info(assessMessages.getMessage('successfullyProcessedApexFilesForAssessment', [apexAssessmentInfos.length]));
    Logger.logVerbose(
      assessMessages.getMessage('apexAssessmentResults', [JSON.stringify(apexAssessmentInfos, null, 2)])
    );
    shell.cd(pwd);
    return apexAssessmentInfos;
  }
  public processApexFiles(dir: string, type = 'migration'): ApexAssessmentInfo[] {
    dir += APEX_CLASS_PATH;
    let files: File[] = [];
    files = FileUtil.readFilesSync(dir);
    Logger.logVerbose(assessMessages.getMessage('foundApexFilesInDirectory', [files.length, dir]));
    const fileAssessmentInfo: ApexAssessmentInfo[] = [];
    for (const file of files) {
      if (file.ext !== '.cls') {
        Logger.logVerbose(assessMessages.getMessage('skippingNonApexFile', [file.name]));
        continue;
      }
      try {
        Logger.logVerbose(assessMessages.getMessage('processingApexFile', [file.name]));
        const apexAssementInfo = this.processApexFile(file, type);
        if (apexAssementInfo && apexAssementInfo.diff.length < 3) {
          Logger.logVerbose(assessMessages.getMessage('skippingApexFileFewChanges', [file.name]));
          continue;
        }
        fileAssessmentInfo.push(apexAssementInfo);
        Logger.logVerbose(assessMessages.getMessage('successfullyProcessedApexFile', [file.name]));
      } catch (err) {
        Logger.error(assessMessages.getMessage('errorProcessingApexFile', [file.name]), err);
      }
      Logger.logVerbose(assessMessages.getMessage('successfullyProcessedApexFile', [file.name]));
    }
    return fileAssessmentInfo;
  }

  public processApexFile(file: File, type = 'migration'): ApexAssessmentInfo {
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
      updateMessages.push(assessMessages.getMessage('fileUpdatedToAllowRemoteCalls'));
    }
    if (tokeUpdatesForMethodCalls && tokeUpdatesForMethodCalls.length > 0) {
      updateMessages.push(assessMessages.getMessage('fileUpdatedToAllowCalls'));
      tokenUpdates.push(...tokeUpdatesForMethodCalls);
    }
    let difference = [];
    if (tokenUpdates && tokenUpdates.length > 0) {
      const updatedContent = parser.rewrite(tokenUpdates);
      // Only write file changes if we're in migration mode, not assessment mode
      if (type === 'migration') {
        fs.writeFileSync(file.location, updatedContent);
        Logger.logger.info(migrateMessages.getMessage('apexFileChangesApplied', [file.name]));
      } else {
        Logger.logger.info(assessMessages.getMessage('apexFileChangesIdentifiedNotApplied', [file.name]));
      }
      difference = new FileDiffUtil().getFileDiff(file.name, fileContent, updatedContent);
    }
    if (updateMessages.length === 0) {
      Logger.info(assessMessages.getMessage('fileNoOmnistudioCalls', [file.name]));
    }
    const warningMessage: string[] = this.processNonReplacableMethodCalls(file, parser);
    return {
      name: file.name,
      warnings: warningMessage,
      infos: updateMessages,
      path: file.location,
      diff: JSON.stringify(difference),
    };
  }

  private processApexFileForRemotecalls(file: File, parser: ApexASTParser): TokenUpdater[] {
    const implementsInterface = parser.implementsInterfaces;
    const tokenUpdates: TokenUpdater[] = [];

    // Case 1: Already implements just System.Callable - no changes needed
    if (implementsInterface.has(this.callableInterface) && implementsInterface.size === 1) {
      Logger.info(assessMessages.getMessage('fileAlreadyImplementsCallable', [file.name]));
      return tokenUpdates;
    }

    // Case 2: Already implements multiple interfaces including Callable - keep only System.Callable
    if (implementsInterface.has(this.callableInterface) && implementsInterface.size > 1) {
      Logger.logger.info(assessMessages.getMessage('apexFileHasMultipleInterfaces', [file.name]));
      // We need to identify the entire implements clause and replace it
      return this.replaceAllInterfaces(implementsInterface, tokenUpdates, parser, file.name);
    }

    // Case 3: Implements VlocityOpenInterface2 - replace with System.Callable
    if (implementsInterface.has(this.vlocityOpenInterface2)) {
      Logger.logger.info(assessMessages.getMessage('apexFileImplementsVlocityOpenInterface2', [file.name]));
      const tokens = implementsInterface.get(this.vlocityOpenInterface2);
      tokenUpdates.push(new RangeTokenUpdate(CALLABLE, tokens[0], tokens[1]));
      tokenUpdates.push(new InsertAfterTokenUpdate(this.callMethodBody(), parser.classDeclaration));
    } else if (implementsInterface.has(this.vlocityOpenInterface)) {
      Logger.error(assessMessages.getMessage('fileImplementsVlocityOpenInterface', [file.name]));
    }
    return tokenUpdates;
  }

  /**
   * Replaces all interfaces with just System.Callable
   * This handles complex scenarios with multiple interfaces
   */
  private replaceAllInterfaces(
    implementsInterface: Map<InterfaceImplements, Token[]>,
    tokenUpdates: TokenUpdater[],
    parser: ApexASTParser,
    fileName: string
  ): TokenUpdater[] {
    let leftmostToken: Token | null = null;
    let rightmostToken: Token | null = null;

    for (const [, tokens] of implementsInterface.entries()) {
      if (tokens && tokens.length > 0) {
        const firstToken = tokens[0];
        const lastToken = tokens[tokens.length - 1];

        // Safe access using optional chaining
        const firstIndex = firstToken?.startIndex ?? Number.MAX_SAFE_INTEGER;
        const leftIndex = leftmostToken?.startIndex ?? Number.MAX_SAFE_INTEGER;

        if (!leftmostToken || firstIndex < leftIndex) {
          leftmostToken = firstToken;
        }

        const lastStopIndex = lastToken?.stopIndex ?? 0;
        const rightStopIndex = rightmostToken?.stopIndex ?? 0;

        if (!rightmostToken || lastStopIndex > rightStopIndex) {
          rightmostToken = lastToken;
        }
      }
    }

    if (leftmostToken && rightmostToken) {
      tokenUpdates.push(new RangeTokenUpdate(CALLABLE, leftmostToken, rightmostToken));

      if (!parser.hasCallMethodImplemented) {
        tokenUpdates.push(new InsertAfterTokenUpdate(this.callMethodBody(), parser.classDeclaration));
      } else {
        Logger.logger.info(assessMessages.getMessage('apexFileAlreadyHasCallMethod', [fileName]));
      }
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

    const methodParameters = parser.methodParameters;
    if (methodParameters.size === 0) return tokenUpdates;
    const drParameters = methodParameters.get(ParameterType.DR_NAME);
    if (drParameters) {
      for (const token of drParameters) {
        const newName = `'${Stringutil.cleanName(token.text)}'`;
        if (token.text === newName) continue;
        Logger.info(assessMessages.getMessage('inApexDrNameWillBeUpdated', [file.name, token.text, newName]));
        Logger.log(assessMessages.getMessage('inApexDrNameWillBeUpdated', [file.name, token.text, newName]));
        tokenUpdates.push(new SingleTokenUpdate(newName, token));
      }
    }
    return tokenUpdates;
  }

  private processNonReplacableMethodCalls(file: File, parser: ApexASTParser): string[] {
    const methodCalls = parser.nonReplacableMethodParameters;
    const messages: string[] = [];
    if (methodCalls.length === 0) return messages;
    for (const methodCall of methodCalls) {
      messages.push(
        assessMessages.getMessage('methodCallBundleNameUpdated', [
          file.name,
          methodCall.className,
          methodCall.methodName,
        ])
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
  /*
    private mapTOName(apexAssessmentInfos: ApexAssessmentInfo[]): string[] {
      return apexAssessmentInfos.map((apexAssessmentInfo) => {
        return apexAssessmentInfo.name;
      });
    } */
}
