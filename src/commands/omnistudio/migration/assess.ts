import path from 'path';
import * as os from 'os';
import { Messages, Connection, Org, Logger as CoreLogger } from '@salesforce/core';
import { SfCommand, Ux, Flags as flags } from '@salesforce/sf-plugins-core';
import { AssessmentInfo } from '../../../utils/interfaces';
import { AssessmentReporter } from '../../../utils/resultsbuilder/assessmentReporter';
import { OmniScriptExportType, OmniScriptMigrationTool } from '../../../migration/omniscript';
import { InvalidEntityTypeError } from '../../../migration/interfaces';
import { CardMigrationTool } from '../../../migration/flexcard';
import { DataRaptorMigrationTool } from '../../../migration/dataraptor';
import { GlobalAutoNumberMigrationTool } from '../../../migration/globalautonumber';
import { DebugTimer } from '../../../utils';
import { Logger } from '../../../utils/logger';
import OmnistudioRelatedObjectMigrationFacade from '../../../migration/related/OmnistudioRelatedObjectMigrationFacade';
import { OmnistudioOrgDetails, OrgUtils } from '../../../utils/orgUtils';
import { OrgPreferences } from '../../../utils/orgPreferences';
import { Constants } from '../../../utils/constants/stringContants';
import { ProjectPathUtil } from '../../../utils/projectPathUtil';
import { PreMigrate } from '../../../migration/premigrate';
import { PostMigrate } from '../../../migration/postMigrate';
import { CustomLabelsUtil } from '../../../utils/customLabels';
import {
  initializeDataModelService,
  isFoundationPackage,
  isOmnistudioMetadataAPIEnabled,
  isStandardDataModel,
  isStandardDataModelWithMetadataAPIEnabled,
} from '../../../utils/dataModelService';

import { ValidatorService } from '../../../utils/validatorService';
import { OmniStudioMetadataCleanupService } from '../../../utils/config/OmniStudioMetadataCleanupService';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'assess');

interface AssessFlags {
  'target-org'?: Org;
  only?: string;
  allversions?: boolean;
  relatedobjects?: string;
  verbose?: boolean;
}

export default class Assess extends SfCommand<AssessmentInfo> {
  public static description = messages.getMessage('commandDescription');

  public static examples = messages.getMessage('examples').split(os.EOL);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static args: any = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static readonly flags: any = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    'target-org': flags.optionalOrg({
      summary: 'Target org username or alias',
      char: 'u',
      required: true,
      aliases: ['targetusername'],
      deprecateAliases: true,
      makeDefault: false, // Prevent auto-resolution during command-reference generation
    }),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    only: flags.string({
      char: 'o',
      description: messages.getMessage('onlyFlagDescription'),
    }),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    allversions: flags.boolean({
      char: 'a',
      description: messages.getMessage('allVersionsDescription'),
      required: false,
    }),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    relatedobjects: flags.string({
      char: 'r',
      description: messages.getMessage('relatedObjectGA'),
    }),
    verbose: flags.boolean({
      description: messages.getMessage('enableVerboseOutput'),
    }),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    loglevel: flags.string({
      description: 'Logging level (deprecated, use --verbose instead)',
      deprecated: {
        message: messages.getMessage('loglevelFlagDeprecated'),
      },
    }),
  };

  public async run(): Promise<AssessmentInfo> {
    const { flags: parsedFlags } = await this.parse(Assess);
    const ux = new Ux();
    const logger = await CoreLogger.child(this.constructor.name);
    Logger.initialiseLogger(ux, logger, 'assess', parsedFlags.verbose);
    try {
      return await this.runAssess(parsedFlags as AssessFlags, ux, logger);
    } catch (e) {
      const error = e as Error;
      Logger.error(messages.getMessage('errorRunningAssess', [error.message]), error);
      process.exit(1);
    }
  }

  public async runAssess(parsedFlags: AssessFlags, ux: Ux, logger: CoreLogger): Promise<AssessmentInfo> {
    DebugTimer.getInstance().start();
    let allVersions = parsedFlags.allversions || false;
    const assessOnly = parsedFlags.only || '';
    const relatedObjects = parsedFlags.relatedobjects || '';
    const isExperienceBundleMetadataAPIProgramaticallyEnabled: { value: boolean } = { value: false };

    // target-org is required by flag definition, so it will always be present
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const org = parsedFlags['target-org']!;
    const conn = org.getConnection();
    let objectsToProcess: string[];
    // To-Do: Add LWC to valid options when GA is released
    const validOptions = [Constants.Apex, Constants.ExpSites, Constants.FlexiPage, Constants.LWC];
    const apiVersion = conn.getApiVersion();

    // Validate that --only and --relatedobjects flags are not used together
    if (assessOnly && relatedObjects) {
      Logger.error(messages.getMessage('relatedFlagsNotSupportedWithOnly'));
      process.exit(1);
    }

    const orgs: OmnistudioOrgDetails = await OrgUtils.getOrgDetails(conn);

    // Initialize global data model service
    initializeDataModelService(orgs);

    // Perform comprehensive validation using ValidatorService
    const validator = new ValidatorService(orgs, messages, conn);
    // Pass true to skip OmniStudio license check for assessment
    const isValidationPassed = await validator.validate(true);

    if (!isValidationPassed) {
      return;
    }

    const namespace = orgs.packageDetails.namespace;
    let projectPath = '';
    const preMigrate: PreMigrate = new PreMigrate(namespace, conn, logger, messages, ux);
    const userActionMessages: string[] = [];

    // Handle all versions prerequisite for standard data model
    if (isStandardDataModel() && !isOmnistudioMetadataAPIEnabled()) {
      // Check if OmniStudio metadata tables need cleanup, if yes, then populate userActions
      const metadataCleanupService = new OmniStudioMetadataCleanupService(conn, messages);
      const hasCleanTables = await metadataCleanupService.hasCleanOmniStudioMetadataTables();
      if (!hasCleanTables) {
        userActionMessages.push(messages.getMessage('cleanupMetadataTablesRequired'));
      }
      allVersions = await preMigrate.handleAllVersionsPrerequisites(allVersions);
    }
    if (relatedObjects) {
      objectsToProcess = relatedObjects.split(',').map((obj) => obj.trim());
      projectPath = await ProjectPathUtil.getProjectPath(messages, true);

      await preMigrate.handleExperienceSitePrerequisites(
        objectsToProcess,
        conn,
        isExperienceBundleMetadataAPIProgramaticallyEnabled
      );
    }

    const assesmentInfo: AssessmentInfo = {
      lwcAssessmentInfos: [],
      apexAssessmentInfos: [],
      dataRaptorAssessmentInfos: [],
      flexCardAssessmentInfos: [],
      globalAutoNumberAssessmentInfos: [],
      omniAssessmentInfo: {
        osAssessmentInfos: [],
        ipAssessmentInfos: [],
      },
      flexipageAssessmentInfos: [],
      experienceSiteAssessmentInfos: [],
      customLabelAssessmentInfos: [],
      customLabelStatistics: {
        totalLabels: 0,
        readyForMigration: 0,
        needManualIntervention: 0,
        warnings: 0,
        failed: 0,
      },
    };

    Logger.log(messages.getMessage('assessmentInitialization', [String(namespace)]));
    Logger.log(messages.getMessage('apiVersionInfo', [String(apiVersion)]));
    Logger.logVerbose(messages.getMessage('assessmentTargets', [String(parsedFlags.only || 'all')]));
    Logger.logVerbose(messages.getMessage('relatedObjectsInfo', [relatedObjects || 'none']));
    Logger.logVerbose(messages.getMessage('allVersionsFlagInfo', [String(allVersions)]));

    try {
      // Assess OmniStudio components
      await this.assessOmniStudioComponents(assesmentInfo, assessOnly, namespace, conn, allVersions, ux);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (ex: any) {
      if (ex instanceof InvalidEntityTypeError) {
        Logger.error(messages.getMessage('invalidTypeAssessErrorMessage', [namespace]));
        process.exit(1);
      }

      if (ex instanceof Error) {
        Logger.error(messages.getMessage('errorRunningAssess', [ex.message]));
        process.exit(1);
      }
    }

    // Assess related objects if specified
    if (relatedObjects) {
      objectsToProcess = relatedObjects.split(',').map((obj) => obj.trim());

      // Validate input
      for (const obj of objectsToProcess) {
        if (!validOptions.includes(obj)) {
          Logger.error(messages.getMessage('invalidRelatedObjectsOption', [String(obj)]));
          process.exit(1);
        }
      }

      const omnistudioRelatedObjectsMigration = new OmnistudioRelatedObjectMigrationFacade(
        namespace,
        assessOnly,
        allVersions,
        org,
        projectPath
      );
      const relatedObjectAssessmentResult = omnistudioRelatedObjectsMigration.assessAll(objectsToProcess);
      assesmentInfo.lwcAssessmentInfos = relatedObjectAssessmentResult.lwcAssessmentInfos;
      assesmentInfo.apexAssessmentInfos = relatedObjectAssessmentResult.apexAssessmentInfos;
      assesmentInfo.flexipageAssessmentInfos = relatedObjectAssessmentResult.flexipageAssessmentInfos;
      assesmentInfo.experienceSiteAssessmentInfos = relatedObjectAssessmentResult.experienceSiteAssessmentInfos;
    }
    try {
      orgs.rollbackFlags = await OrgPreferences.checkRollbackFlags(conn);
    } catch (error) {
      Logger.log((error as Error).message);
      Logger.log((error as Error).stack);
    }

    // Post Assessment tasks
    const postMigrate: PostMigrate = new PostMigrate(org, namespace, conn, logger, messages, ux, objectsToProcess);

    await postMigrate.restoreExperienceAPIMetadataSettings(
      isExperienceBundleMetadataAPIProgramaticallyEnabled,
      userActionMessages
    );

    await AssessmentReporter.generate(
      assesmentInfo,
      conn.instanceUrl,
      orgs,
      assessOnly,
      objectsToProcess,
      messages,
      userActionMessages
    );
    Logger.log(
      messages.getMessage('assessmentSuccessfulMessage', [
        orgs.orgDetails?.Id,
        path.join(process.cwd(), Constants.AssessmentReportsFolderName),
      ])
    );

    return assesmentInfo;
  }

  private async assessOmniStudioComponents(
    assesmentInfo: AssessmentInfo,
    assessOnly: string,
    namespace: string,
    conn: Connection,
    allVersions: boolean,
    ux: Ux
  ): Promise<void> {
    if (!assessOnly) {
      // If no specific component is specified, assess all components
      await this.assessDataRaptors(assesmentInfo, namespace, conn, ux);
      await this.assessFlexCards(assesmentInfo, namespace, conn, allVersions, ux);
      await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.OS, ux);
      await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.IP, ux);
      if (!isFoundationPackage()) {
        await this.assessGlobalAutoNumbers(assesmentInfo, namespace, conn, ux);
      }
      await this.assessCustomLabels(assesmentInfo, namespace, conn);
      return;
    }

    switch (assessOnly) {
      case Constants.DataMapper:
        await this.assessDataRaptors(assesmentInfo, namespace, conn, ux);
        break;
      case Constants.Flexcard:
        await this.assessFlexCards(assesmentInfo, namespace, conn, allVersions, ux);
        break;
      case Constants.Omniscript:
        await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.OS, ux);
        break;
      case Constants.IntegrationProcedure:
        await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.IP, ux);
        break;
      case Constants.GlobalAutoNumber:
        if (!isFoundationPackage()) {
          await this.assessGlobalAutoNumbers(assesmentInfo, namespace, conn, ux);
        } else {
          Logger.warn(messages.getMessage('globalAutoNumberUnSupportedInOmnistudioPackage'));
        }
        break;
      case Constants.CustomLabel:
        await this.assessCustomLabels(assesmentInfo, namespace, conn);
        break;
      default:
        throw new Error(messages.getMessage('invalidOnlyFlag'));
    }
  }

  private async assessDataRaptors(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection,
    ux: Ux
  ): Promise<void> {
    const drMigrator = new DataRaptorMigrationTool(namespace, conn, Logger, messages, ux);
    assesmentInfo.dataRaptorAssessmentInfos = await drMigrator.assess();
    this.logAssessmentCompletionIfNeeded(
      'assessedDataRaptorsCount',
      'dataRaptorAssessmentCompleted',
      assesmentInfo.dataRaptorAssessmentInfos.length
    );
  }

  private async assessFlexCards(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection,
    allVersions: boolean,
    ux: Ux
  ): Promise<void> {
    const flexMigrator = new CardMigrationTool(namespace, conn, Logger, messages, ux, allVersions);
    assesmentInfo.flexCardAssessmentInfos = await flexMigrator.assess();
    this.logAssessmentCompletionIfNeeded(
      'assessedFlexCardsCount',
      'flexCardAssessmentCompleted',
      assesmentInfo.flexCardAssessmentInfos.length
    );
  }

  private async assessOmniScripts(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection,
    allVersions: boolean,
    exportType: OmniScriptExportType,
    ux: Ux
  ): Promise<void> {
    const exportComponentType = exportType === OmniScriptExportType.IP ? 'Integration Procedures' : 'Omniscripts';
    const osMigrator = new OmniScriptMigrationTool(exportType, namespace, conn, Logger, messages, ux, allVersions);
    const newOmniAssessmentInfo = await osMigrator.assess(
      assesmentInfo.dataRaptorAssessmentInfos,
      assesmentInfo.flexCardAssessmentInfos
    );

    // Initialize omniAssessmentInfo if it doesn't exist
    if (!assesmentInfo.omniAssessmentInfo) {
      assesmentInfo.omniAssessmentInfo = {
        osAssessmentInfos: [],
        ipAssessmentInfos: [],
      };
    }

    // Merge results instead of overwriting
    if (exportType === OmniScriptExportType.OS) {
      // For OmniScript assessment, update osAssessmentInfos
      assesmentInfo.omniAssessmentInfo.osAssessmentInfos = newOmniAssessmentInfo.osAssessmentInfos;
    } else {
      // For Integration Procedure assessment, update ipAssessmentInfos
      assesmentInfo.omniAssessmentInfo.ipAssessmentInfos = newOmniAssessmentInfo.ipAssessmentInfos;
    }

    if (exportType === OmniScriptExportType.OS) {
      this.logAssessmentCompletionIfNeeded(
        'assessedOmniScriptsCount',
        'omniScriptAssessmentCompleted',
        assesmentInfo.omniAssessmentInfo.osAssessmentInfos.length,
        [exportComponentType]
      );
    } else {
      this.logAssessmentCompletionIfNeeded(
        'assessedIntegrationProceduresCount',
        'omniScriptAssessmentCompleted',
        assesmentInfo.omniAssessmentInfo.ipAssessmentInfos.length,
        [exportComponentType]
      );
    }
  }

  private async assessGlobalAutoNumbers(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection,
    ux: Ux
  ): Promise<void> {
    if (isFoundationPackage()) {
      return;
    }
    Logger.logVerbose(messages.getMessage('startingGlobalAutoNumberAssessment'));
    const globalAutoNumberMigrationTool = new GlobalAutoNumberMigrationTool(namespace, conn, Logger, messages, ux);
    assesmentInfo.globalAutoNumberAssessmentInfos = await globalAutoNumberMigrationTool.assess();
    Logger.logVerbose(
      messages.getMessage('assessedGlobalAutoNumbersCount', [assesmentInfo.globalAutoNumberAssessmentInfos.length])
    );
    Logger.log(messages.getMessage('globalAutoNumberAssessmentCompleted'));
  }

  private async assessCustomLabels(assesmentInfo: AssessmentInfo, namespace: string, conn: Connection): Promise<void> {
    try {
      Logger.log(messages.getMessage('startingCustomLabelAssessment'));
      const customLabelResult = await CustomLabelsUtil.fetchCustomLabels(conn, namespace, messages);
      assesmentInfo.customLabelAssessmentInfos = customLabelResult.labels;
      assesmentInfo.customLabelStatistics = customLabelResult.statistics;
      Logger.log(messages.getMessage('customLabelAssessmentCompleted'));
    } catch (error) {
      Logger.error(messages.getMessage('errorDuringCustomLabelAssessment', [(error as Error).message]));
      assesmentInfo.customLabelAssessmentInfos = [];
      assesmentInfo.customLabelStatistics = {
        totalLabels: 0,
        readyForMigration: 0,
        needManualIntervention: 0,
        warnings: 0,
        failed: 0,
      };
    }
  }

  /**
   * Logs assessment completion with count and completion message if needed
   * Skips logging when standard data model with metadata API is enabled
   */
  private logAssessmentCompletionIfNeeded(
    countMessageKey: string,
    completionMessageKey: string,
    count: number,
    completionParams?: string[]
  ): void {
    if (isStandardDataModelWithMetadataAPIEnabled()) {
      return;
    }
    Logger.logVerbose(messages.getMessage(countMessageKey, [count]));
    Logger.log(messages.getMessage(completionMessageKey, completionParams || []));
  }
}
