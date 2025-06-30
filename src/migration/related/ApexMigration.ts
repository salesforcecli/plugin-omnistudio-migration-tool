import * as fs from 'fs';
import * as shell from 'shelljs';
import { Org } from '@salesforce/core';
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
import { MessageService } from '../../utils/MessageService';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

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
    Logger.logVerbose(MessageService.getMessage('startingApexMigration', [this.projectPath]));
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    // const targetOrg: Org = this.org;
    // sfProject.retrieve(APEXCLASS, targetOrg.getUsername());
    Logger.info(MessageService.getMessage('processingApexFilesForMigration'));
    const apexAssessmentInfos = this.processApexFiles(this.projectPath, 'migration');
    Logger.info(MessageService.getMessage('successfullyProcessedApexFilesForMigration', [apexAssessmentInfos.length]));
    Logger.logVerbose(
      MessageService.getMessage('apexMigrationResults', [JSON.stringify(apexAssessmentInfos, null, 2)])
    );
    // sfProject.deploy(APEXCLASS, targetOrg.getUsername());
    shell.cd(pwd);
    return apexAssessmentInfos;
  }

  public assess(): ApexAssessmentInfo[] {
    Logger.logVerbose(MessageService.getMessage('startingApexAssessment', [this.projectPath]));
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    sfProject.retrieve(APEXCLASS, this.org.getUsername());
    Logger.info(MessageService.getMessage('processingApexFilesForAssessment'));
    const apexAssessmentInfos = this.processApexFiles(this.projectPath, 'assessment');
    Logger.info(MessageService.getMessage('successfullyProcessedApexFilesForAssessment', [apexAssessmentInfos.length]));
    Logger.logVerbose(
      MessageService.getMessage('apexAssessmentResults', [JSON.stringify(apexAssessmentInfos, null, 2)])
    );
    shell.cd(pwd);
    return apexAssessmentInfos;
  }
  public processApexFiles(dir: string, type = 'migration'): ApexAssessmentInfo[] {
    dir += APEX_CLASS_PATH;
    let files: File[] = [];
    files = FileUtil.readFilesSync(dir);
    Logger.logVerbose(MessageService.getMessage('foundApexFilesInDirectory', [files.length, dir]));
    const fileAssessmentInfo: ApexAssessmentInfo[] = [];
    for (const file of files) {
      if (file.ext !== '.cls') {
        Logger.logVerbose(MessageService.getMessage('skippingNonApexFile', [file.name]));
        continue;
      }
      try {
        Logger.logVerbose(MessageService.getMessage('processingApexFile', [file.name]));
        const apexAssementInfo = this.processApexFile(file, type);
        if (apexAssementInfo && apexAssementInfo.diff.length < 3) {
          Logger.logVerbose(MessageService.getMessage('skippingApexFileFewChanges', [file.name]));
          continue;
        }
        fileAssessmentInfo.push(apexAssementInfo);
        Logger.logVerbose(MessageService.getMessage('successfullyProcessedApexFile', [file.name]));
      } catch (err) {
        Logger.error(MessageService.getMessage('errorProcessingApexFile', [file.name]));
        Logger.error(JSON.stringify(err));
        if (err instanceof Error) {
          Logger.error(err.stack);
        }
      }
      Logger.logVerbose(MessageService.getMessage('successfullyProcessedApexFile', [file.name]));
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
      updateMessages.push(MessageService.getMessage('fileUpdatedToAllowRemoteCalls'));
    }
    if (tokeUpdatesForMethodCalls && tokeUpdatesForMethodCalls.length > 0) {
      updateMessages.push(MessageService.getMessage('fileUpdatedToAllowCalls'));
      tokenUpdates.push(...tokeUpdatesForMethodCalls);
    }
    let difference = [];
    if (tokenUpdates && tokenUpdates.length > 0) {
      const updatedContent = parser.rewrite(tokenUpdates);
      // Only write file changes if we're in migration mode, not assessment mode
      if (type === 'migration') {
        fs.writeFileSync(file.location, updatedContent);
        Logger.logger.info(MessageService.getMessage('apexFileChangesApplied', [file.name]));
      } else {
        Logger.logger.info(MessageService.getMessage('apexFileChangesIdentifiedNotApplied', [file.name]));
      }
      difference = new FileDiffUtil().getFileDiff(file.name, fileContent, updatedContent);
    }
    if (updateMessages.length === 0) {
      Logger.info(MessageService.getMessage('fileNoOmnistudioCalls', [file.name]));
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
      Logger.info(MessageService.getMessage('fileAlreadyImplementsCallable', [file.name]));
      return tokenUpdates;
    }

    // Case 2: Already implements multiple interfaces including Callable - keep only System.Callable
    if (implementsInterface.has(this.callableInterface) && implementsInterface.size > 1) {
      Logger.logger.info(MessageService.getMessage('apexFileHasMultipleInterfaces', [file.name]));
      // We need to identify the entire implements clause and replace it
      return this.replaceAllInterfaces(implementsInterface, tokenUpdates, parser, file.name);
    }

    // Case 3: Implements VlocityOpenInterface2 - replace with System.Callable
    if (implementsInterface.has(this.vlocityOpenInterface2)) {
      Logger.logger.info(MessageService.getMessage('apexFileImplementsVlocityOpenInterface2', [file.name]));
      const tokens = implementsInterface.get(this.vlocityOpenInterface2);
      tokenUpdates.push(new RangeTokenUpdate(CALLABLE, tokens[0], tokens[1]));
      tokenUpdates.push(new InsertAfterTokenUpdate(this.callMethodBody(), parser.classDeclaration));
    } else if (implementsInterface.has(this.vlocityOpenInterface)) {
      Logger.error(MessageService.getMessage('fileImplementsVlocityOpenInterface', [file.name]));
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
        Logger.logger.info(MessageService.getMessage('apexFileAlreadyHasCallMethod', [fileName]));
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
        Logger.info(MessageService.getMessage('inApexDrNameWillBeUpdated', [file.name, token.text, newName]));
        Logger.log(MessageService.getMessage('inApexDrNameWillBeUpdated', [file.name, token.text, newName]));
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
        MessageService.getMessage('methodCallBundleNameUpdated', [
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
