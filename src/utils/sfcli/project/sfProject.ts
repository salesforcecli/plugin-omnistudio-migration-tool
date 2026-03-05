import * as fs from 'fs';
import * as shell from 'shelljs';
import { Messages } from '@salesforce/core';
import { Logger } from '../../logger';
import { cli } from '../../shell/cli';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'migrate');

export interface DeploymentStatus {
  id: string;
  status: 'InProgress' | 'Succeeded' | 'Failed' | 'Canceled' | 'Canceling';
  completedComponentsCount: number;
  totalComponentsCount: number;
  completionPercentage: number;
  errorCount: number;
  warningCount: number;
  elapsedTime: number;
  estimatedTimeRemaining?: number;
  errorMessage?: string;
  isRetryable: boolean;
  retryReason?: string;
}

export interface DeploymentError {
  type: 'TIMEOUT' | 'METADATA_LIMIT' | 'VALIDATION' | 'PERMISSIONS' | 'UNKNOWN';
  message: string;
  isRetryable: boolean;
}

export class sfProject {
  public static create(name: string, outputDir?: string): void {
    Logger.log(messages.getMessage('creatingProject', [name]));
    const cmd = `sf project generate --name ${name}${outputDir ? ` --output-dir ${outputDir}` : ''}`;
    sfProject.executeCommand(cmd);
    Logger.log(messages.getMessage('projectCreated', [name]));
  }

  public static retrieve(metadataName: string, username: string): void {
    Logger.log(messages.getMessage('retrievingMetadata', [metadataName, username]));
    const cmd = `sf project retrieve start --metadata ${metadataName} --target-org ${username}`;
    sfProject.executeCommand(cmd);
    Logger.log(messages.getMessage('metadataRetrieved', [metadataName, username]));
  }

  public static deploy(metadataName: string, username: string): void {
    Logger.log(messages.getMessage('deployingMetadata', [metadataName, username]));
    const cmd = `sf project deploy start --metadata ${metadataName} --target-org ${username}`;
    sfProject.executeCommand(cmd);
    Logger.log(messages.getMessage('metadataDeployed', [metadataName, username]));
  }

  public static installDependency(dependency?: string): void {
    Logger.logVerbose(messages.getMessage('installingDependency', [dependency]));
    const cmd = `npm install ${dependency || ''}`;
    sfProject.executeCommand(cmd);
    Logger.logVerbose(messages.getMessage('dependencyInstalled', [dependency]));
  }

  public static deployFromManifest(manifestPath: string, username: string): void {
    Logger.log(messages.getMessage('deployingFromManifest'));
    const cmd = `sf project deploy start --manifest "${manifestPath}" --target-org "${username}" --async`;
    Logger.log(cmd);
    const cmdOutput = sfProject.executeCommand(cmd, true);
    Logger.logVerbose(`Deploy output: ${cmdOutput}`);
    const deploymentId = sfProject.processOutput(cmdOutput);
    Logger.logVerbose(messages.getMessage('deploymentTriggeredSuccessfully', [deploymentId]));
  }

  public static deployPackageAsync(packageSourcePath: string, username: string): string {
    Logger.logVerbose(messages.getMessage('asyncDeploymentStart', [packageSourcePath]));
    const cmd = `sf project deploy start --source-dir "${packageSourcePath}" --target-org "${username}"  --async`;
    Logger.logVerbose(`Executing: ${cmd}`);
    const cmdOutput = sfProject.executeCommand(cmd, true);
    Logger.logVerbose(`Async deploy output: ${cmdOutput}`);

    const deploymentId = sfProject.extractDeploymentId(cmdOutput);
    Logger.log(messages.getMessage('omniscriptPackageDeploymentStarted', [deploymentId]));
    return deploymentId;
  }

  public static checkDeploymentStatus(deploymentId: string, username: string): DeploymentStatus {
    Logger.logVerbose(messages.getMessage('asyncDeploymentStatusCheck', [deploymentId]));
    const cmd = `sf project deploy report --job-id "${deploymentId}" --target-org "${username}"`;
    const cmdOutput = sfProject.executeCommand(cmd, true);

    return sfProject.parseDeploymentStatus(cmdOutput, deploymentId);
  }

  public static extractDeploymentId(cmdOutput: string): string {
    Logger.logVerbose(messages.getMessage('extractingDeploymentId'));
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const jsonOutput = JSON.parse(cmdOutput);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const deploymentId = jsonOutput.result?.id;
      if (!deploymentId) {
        throw new Error(messages.getMessage('deploymentIdNotFound'));
      }
      return deploymentId as string;
    } catch (error) {
      Logger.error(messages.getMessage('deploymentIdNotFound'));
      throw new Error(messages.getMessage('deploymentIdNotFound'));
    }
  }

  public static isNpmInstalled(): boolean {
    return !!shell.which('npm');
  }

  public static createNPMConfigFile(authKey: string): void {
    Logger.logVerbose(messages.getMessage('creatingNPMConfigFile'));
    fs.writeFileSync(
      '.npmrc',
      `always-auth=true\nregistry=https://repo.vlocity.com/repository/npm-public/\n//repo.vlocity.com/repository/npm-public/:_auth="${authKey}"`
    );
    Logger.logVerbose(messages.getMessage('npmConfigFileCreated'));
  }

  private static parseDeploymentStatus(cmdOutput: string, deploymentId: string): DeploymentStatus {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const jsonOutput = JSON.parse(cmdOutput);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const result = jsonOutput.result;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const status = result?.status || 'InProgress';
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const completedCount = result?.numberComponentsDeployed || 0;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const totalCount = result?.numberComponentsTotal || 1;
      const completionPercentage = Math.round((completedCount / totalCount) * 100);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const errorCount = result?.numberComponentErrors || 0;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const warningCount = result?.numberComponentWarnings || 0;

      // Calculate elapsed time (mock for now, would need start time tracking)
      const elapsedTime = 0;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const errorMessage =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        result?.details?.componentFailures?.[0]?.problem ||
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        result?.details?.componentFailures?.[0]?.problemType;

      const deploymentError = errorMessage ? sfProject.classifyDeploymentError(errorMessage as string) : null;

      return {
        id: deploymentId,
        status: status as DeploymentStatus['status'],
        completedComponentsCount: completedCount as number,
        totalComponentsCount: totalCount as number,
        completionPercentage,
        errorCount: errorCount as number,
        warningCount: warningCount as number,
        elapsedTime,
        errorMessage: errorMessage as string | undefined,
        isRetryable: deploymentError?.isRetryable || false,
        retryReason: deploymentError?.message,
      };
    } catch (error) {
      Logger.error(messages.getMessage('deploymentStatusCheckFailed', [String(error)]));
      return {
        id: deploymentId,
        status: 'Failed',
        completedComponentsCount: 0,
        totalComponentsCount: 1,
        completionPercentage: 0,
        errorCount: 1,
        warningCount: 0,
        elapsedTime: 0,
        errorMessage: String(error),
        isRetryable: false,
      };
    }
  }

  private static classifyDeploymentError(errorMessage: string): DeploymentError {
    const message = errorMessage.toLowerCase();

    // Check for metadata limit errors
    if (
      message.includes('Maximum size of request') ||
      message.includes('too many components') ||
      message.includes('limit exceeded')
    ) {
      return {
        type: 'METADATA_LIMIT',
        message: 'Deployment exceeded API limits',
        isRetryable: false,
      };
    }

    // Check for timeout errors
    if (message.includes('timeout') || message.includes('request timed out')) {
      return {
        type: 'TIMEOUT',
        message: 'Deployment timed out',
        isRetryable: true,
      };
    }

    // Check for validation errors
    if (message.includes('validation') || message.includes('invalid') || message.includes('required field')) {
      return {
        type: 'VALIDATION',
        message: 'Deployment validation failed',
        isRetryable: false,
      };
    }

    // Check for permission errors
    if (
      message.includes('insufficient access') ||
      message.includes('permission') ||
      message.includes('not authorized')
    ) {
      return {
        type: 'PERMISSIONS',
        message: 'Insufficient permissions for deployment',
        isRetryable: false,
      };
    }

    // Default to unknown error
    return {
      type: 'UNKNOWN',
      message: 'Unknown deployment error',
      isRetryable: false,
    };
  }

  private static processOutput(cmdOutput: string): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const jsonOutput = JSON.parse(cmdOutput);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const deploymentId = jsonOutput.result?.id;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      Logger.log(messages.getMessage('manifestDeployementStarted', [deploymentId]));

      if (!deploymentId) {
        throw new Error(messages.getMessage('deploymentIdNotFound'));
      }
      return deploymentId as string;
    } catch (error) {
      Logger.error(messages.getMessage('manifestDeployFailed'));
    }
  }

  private static executeCommand(cmd: string, jsonOutput = false): string {
    try {
      if (jsonOutput) {
        return cli.exec(`${cmd} --json`);
      } else {
        return cli.exec(`${cmd}`);
      }
    } catch (error) {
      Logger.error(messages.getMessage('sfProjectCommandError', [String(error)]));
      throw error;
    }
  }
}
