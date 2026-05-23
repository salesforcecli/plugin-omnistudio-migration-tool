import * as fs from 'fs';
import * as path from 'path';
import * as shell from 'shelljs';
import { Org, Messages } from '@salesforce/core';
import { FileUtil, File } from '../../utils/file/fileUtil';
import { Logger } from '../../utils/logger';
import { Constants } from '../../utils/constants/stringContants';
import {
  ExpSiteComponent,
  ExpSiteComponentAttributes,
  MigrationStorage,
  OmniScriptStandardKey,
  OmniScriptStorage,
  ExpSitePageJson,
  Storage,
  ExpSiteRegion,
  FlexcardStorage,
} from '../interfaces';
import { FileDiffUtil } from '../../utils/lwcparser/fileutils/FileDiffUtil';
import {
  ExperienceSiteAssessmentInfo,
  ExperienceSiteAssessmentPageInfo,
  FlexCardAssessmentInfo,
  OSAssessmentInfo,
} from '../../utils';
import { StorageUtil } from '../../utils/storageUtil';
import { createProgressBar } from '../base';
import { isStandardDataModel } from '../../utils/dataModelService';
import { CrossReferenceDetector, ComponentWithLWC } from '../../utils/crossReferenceDetector';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

Messages.importMessagesDirectory(__dirname);

const TARGET_COMPONENT_NAME_OS = 'runtime_omnistudio:omniscript';
const TARGET_COMPONENT_NAME_FC = 'runtime_omnistudio:flexcard';
const TARGET_COMPONENT_NAME_OS_EXP = 'runtime_omnistudio:omniscriptExperienceCloud';
const FLEXCARD_PREFIX = 'cf';

export class ExperienceSiteMigration extends BaseRelatedObjectMigration {
  private EXPERIENCE_SITES_PATH: string;
  private MIGRATE = 'Migrate';
  private ASSESS = 'Assess';
  private messages: Messages<string>;
  private IS_STANDARD_DATA_MODEL: boolean = isStandardDataModel();
  private flexCardInfos: FlexCardAssessmentInfo[] = [];
  private osInfos: OSAssessmentInfo[] = [];

  public constructor(projectPath: string, namespace: string, org: Org, messages: Messages<string>) {
    super(projectPath, namespace, org);
    this.messages = messages;
  }

  public processObjectType(): string {
    return Constants.ExpSites;
  }

  public assess(
    flexCardInfos?: FlexCardAssessmentInfo[],
    osInfos?: OSAssessmentInfo[]
  ): ExperienceSiteAssessmentInfo[] {
    this.flexCardInfos = flexCardInfos || [];
    this.osInfos = osInfos || [];
    return this.process(this.ASSESS);
  }

  public migrate(
    flexCardInfos?: FlexCardAssessmentInfo[],
    osInfos?: OSAssessmentInfo[]
  ): ExperienceSiteAssessmentInfo[] {
    this.flexCardInfos = flexCardInfos || [];
    this.osInfos = osInfos || [];
    return this.process(this.MIGRATE);
  }

  public process(type: string): ExperienceSiteAssessmentInfo[] {
    Logger.logVerbose(this.messages.getMessage('processingExperienceSites', [type]));
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    this.EXPERIENCE_SITES_PATH = path.join(this.projectPath, 'force-app', 'main', 'default', 'experiences');

    Logger.logVerbose(this.messages.getMessage('experienceSitesProcessingStarted'));
    const experienceSiteInfo = this.processExperienceSites(this.EXPERIENCE_SITES_PATH, type);
    Logger.info(this.messages.getMessage('experienceSiteSuccessfullyProcessed', [type]));
    shell.cd(pwd);
    Logger.log(
      this.messages.getMessage('expSitesWithChanges', [
        experienceSiteInfo.flatMap((info) => info.experienceSiteAssessmentPageInfos).length,
      ])
    );
    return experienceSiteInfo;
  }

  public processExperienceSites(dir: string, type: string): ExperienceSiteAssessmentInfo[] {
    Logger.logVerbose(this.messages.getMessage('readingFile'));
    const count = { total: 0 };
    const directoryMap: Map<string, File[]> = FileUtil.getAllFilesInsideDirectory(dir, count, '.json');
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    Logger.logVerbose(this.messages.getMessage('totalFileCount', [count.total]));

    // TODO - IF directory is empty
    let progressCounter = 0;
    const progressBar = createProgressBar(type, 'ExperienceSites');
    progressBar.start(count.total, progressCounter);

    const experienceSitesAssessmentInfo: ExperienceSiteAssessmentInfo[] = [];
    Logger.logVerbose('The namespace for expsites processing is ' + this.namespace);
    for (const directory of directoryMap.keys()) {
      const experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo = {
        experienceBundleName: path.basename(path.dirname(directory)),
        experienceSiteAssessmentPageInfos: [],
      };
      const fileArray = directoryMap.get(directory);
      if (!fileArray) {
        continue;
      }
      for (const file of fileArray) {
        progressBar.update(++progressCounter);
        if (file.ext !== '.json') {
          Logger.logVerbose(this.messages.getMessage('skipNonJsonFile', [file.name]));
          continue;
        }
        try {
          const experienceSitePageInfo = this.processExperienceSite(file, type);
          if (experienceSitePageInfo?.hasOmnistudioContentWithChanges === true) {
            Logger.logVerbose(this.messages.getMessage('experienceSiteWithOmniWrapperSuccessfullyProcessed'));
            experienceSiteAssessmentInfo.experienceSiteAssessmentPageInfos.push(experienceSitePageInfo);
          } else {
            Logger.logVerbose(this.messages.getMessage('fileNotHavingWrapper'));
          }
        } catch (err) {
          this.populateExceptionInfo(file, experienceSiteAssessmentInfo.experienceSiteAssessmentPageInfos);
          Logger.error(this.messages.getMessage('errorProcessingExperienceSite', [file.name]));
          Logger.error(JSON.stringify(err));
        }
      }

      if (experienceSiteAssessmentInfo.experienceSiteAssessmentPageInfos.length > 0) {
        experienceSitesAssessmentInfo.push(experienceSiteAssessmentInfo);
      }
    }

    Logger.logVerbose(this.messages.getMessage('experienceSiteReportingDetails'));
    progressBar.stop();
    return experienceSitesAssessmentInfo;
  }

  public processExperienceSite(file: File, type: string): ExperienceSiteAssessmentPageInfo {
    Logger.logVerbose(this.messages.getMessage('processingFile', [file.name]));

    const experienceSiteAssessmentInfo: ExperienceSiteAssessmentPageInfo = {
      name: file.name,
      warnings: [],
      errors: [],
      infos: [],
      path: file.location,
      diff: JSON.stringify([]),
      hasOmnistudioContentWithChanges: false,
      status: type === this.ASSESS ? 'Ready for migration' : 'Successfully migrated',
    };

    const lookupComponentName = `${this.namespace}:vlocityLWCOmniWrapper`;
    const fileContent = fs.readFileSync(file.location, 'utf8');
    // TODO - undefined check here
    const experienceSiteParsedJSON = JSON.parse(fileContent) as ExpSitePageJson;
    const normalizedOriginalFileContent = JSON.stringify(experienceSiteParsedJSON, null, 2);
    const regions: ExpSiteRegion[] = experienceSiteParsedJSON.regions;

    // TODO - When will it be Flexcard

    if (regions === undefined) {
      experienceSiteAssessmentInfo.hasOmnistudioContentWithChanges = false;
      return experienceSiteAssessmentInfo;
    }

    let storage: MigrationStorage;

    if (type === this.MIGRATE) {
      storage = StorageUtil.getOmnistudioMigrationStorage();
    } else {
      storage = StorageUtil.getOmnistudioAssessmentStorage();
    }

    for (const region of regions) {
      this.processRegion(region, experienceSiteAssessmentInfo, storage, lookupComponentName, type);
    }

    // NEW: Check for cross-reference issues with custom LWCs
    const componentsWithLWCs = this.detectCustomLWCUsageInSite(experienceSiteParsedJSON);
    if (componentsWithLWCs.length > 0) {
      const warning = CrossReferenceDetector.getInstance().formatPageWarning(
        componentsWithLWCs,
        type === this.ASSESS ? 'assess' : 'migrate'
      );
      experienceSiteAssessmentInfo.warnings.push(warning);
      if (experienceSiteAssessmentInfo.status === 'Ready for migration') {
        experienceSiteAssessmentInfo.status = 'Warnings';
      }
      // Mark as having content so the page is included in the report
      experienceSiteAssessmentInfo.hasOmnistudioContentWithChanges = true;
    }

    Logger.logVerbose(this.messages.getMessage('printUpdatedObject', [JSON.stringify(experienceSiteParsedJSON)]));

    const noarmalizeUpdatedFileContent = JSON.stringify(experienceSiteParsedJSON, null, 2); // Pretty-print with 2 spaces
    const difference = new FileDiffUtil().getFileDiff(
      file.name,
      normalizedOriginalFileContent,
      noarmalizeUpdatedFileContent
    );

    Logger.logVerbose(this.messages.getMessage('printDifference', [JSON.stringify(difference)]));

    // If there are no differences and no warnings, mark as not having OmniStudio content to exclude from report
    // Only exclude if status is 'Ready for migration' or 'Successfully migrated' (no warnings/errors)
    if (
      difference.length === 0 &&
      experienceSiteAssessmentInfo.warnings.length === 0 &&
      (experienceSiteAssessmentInfo.status === 'Ready for migration' ||
        experienceSiteAssessmentInfo.status === 'Successfully migrated')
    ) {
      experienceSiteAssessmentInfo.hasOmnistudioContentWithChanges = false;
      return experienceSiteAssessmentInfo;
    }

    if (type === this.MIGRATE && normalizedOriginalFileContent !== noarmalizeUpdatedFileContent) {
      Logger.logVerbose(this.messages.getMessage('updatingFile'));
      fs.writeFileSync(file.location, noarmalizeUpdatedFileContent, 'utf8');
    }

    experienceSiteAssessmentInfo.diff = JSON.stringify(difference);

    return experienceSiteAssessmentInfo;
  }

  private populateExceptionInfo(file: File, experienceSiteAssessmentInfos: ExperienceSiteAssessmentPageInfo[]): void {
    try {
      const experienceSiteAssessmentInfo: ExperienceSiteAssessmentPageInfo = {
        name: file.name,
        warnings: ['Unknown error occurred'],
        errors: [''],
        infos: [],
        path: file.location,
        diff: JSON.stringify([]),
        hasOmnistudioContentWithChanges: false,
        status: 'Failed',
      };

      experienceSiteAssessmentInfos.push(experienceSiteAssessmentInfo);
    } catch {
      Logger.error(this.messages.getMessage('experienceSiteException'));
    }
  }

  private processRegion(
    region: ExpSiteRegion,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentPageInfo,
    storage: MigrationStorage,
    lookupComponentName: string,
    type: string
  ): void {
    Logger.logVerbose(this.messages.getMessage('currentRegionOfExperienceSite', [JSON.stringify(region)]));

    const regionComponents: ExpSiteComponent[] = region.components;

    if (regionComponents === undefined) {
      return;
    }

    if (Array.isArray(regionComponents)) {
      for (const component of regionComponents) {
        this.processComponent(component, experienceSiteAssessmentInfo, storage, lookupComponentName, type);
      }
    }
  }

  private processComponent(
    component: ExpSiteComponent,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentPageInfo,
    storage: MigrationStorage,
    lookupComponentName: string,
    type: string
  ): void {
    if (component === undefined || component === null) {
      return;
    }

    // Check for legacy wrapper component
    if (component.componentName === lookupComponentName) {
      Logger.logVerbose(this.messages.getMessage('omniWrapperFound'));
      experienceSiteAssessmentInfo.hasOmnistudioContentWithChanges = true;

      this.updateComponentAndItsAttributes(
        component,
        component.componentAttributes,
        experienceSiteAssessmentInfo,
        storage,
        type
      );

      return;
    }

    if (this.IS_STANDARD_DATA_MODEL) {
      // Check for new LWC components that need reference updates
      if (this.isOmnistudioStandardWrapper(component.componentName)) {
        Logger.logVerbose(`Found Omnistudio component: ${component.componentName}`);
        experienceSiteAssessmentInfo.hasOmnistudioContentWithChanges = true;

        this.updateOmnistudioComponentReferences(component, experienceSiteAssessmentInfo, storage, type);

        return;
      }
    }

    const regionsInsideComponent: ExpSiteRegion[] = component.regions;

    if (Array.isArray(regionsInsideComponent)) {
      for (const region of regionsInsideComponent) {
        this.processRegion(region, experienceSiteAssessmentInfo, storage, lookupComponentName, type);
      }
    }
  }

  private updateComponentAndItsAttributes(
    component: ExpSiteComponent,
    currentAttribute: ExpSiteComponentAttributes,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentPageInfo,
    storage: MigrationStorage,
    type: string
  ): void {
    if (component === undefined || currentAttribute === undefined) {
      return;
    }

    if (currentAttribute.target === undefined || currentAttribute.target === '') {
      experienceSiteAssessmentInfo.warnings.push(this.messages.getMessage('emptyTargetData'));
      experienceSiteAssessmentInfo.status = type === this.ASSESS ? 'Needs manual intervention' : 'Skipped';
      return;
    }

    const targetName = currentAttribute.target.substring(currentAttribute.target.indexOf(':') + 1); // c:ABCD -> ABCD

    if (targetName.startsWith(FLEXCARD_PREFIX)) {
      this.processFCComponent(targetName, component, currentAttribute, experienceSiteAssessmentInfo, storage, type);
    } else {
      this.processOSComponent(targetName, component, currentAttribute, experienceSiteAssessmentInfo, storage, type);
    }
    Logger.logVerbose('updatedComponentAttribute = ' + JSON.stringify(currentAttribute));
  }

  private processFCComponent(
    targetName: string,
    component: ExpSiteComponent,
    currentAttribute: ExpSiteComponentAttributes,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentPageInfo,
    storage: MigrationStorage,
    type: string
  ): void {
    Logger.logVerbose(this.messages.getMessage('processingFlexcardComponent', [JSON.stringify(component)]));
    const flexcardName = targetName.substring(2); // cfCardName -> CardName
    const targetDataFromStorageFC: FlexcardStorage = storage.fcStorage.get(flexcardName.toLowerCase());

    Logger.logVerbose(this.messages.getMessage('targetData', [JSON.stringify(targetDataFromStorageFC)]));

    // Remove later
    if (this.shouldAddWarning(targetDataFromStorageFC)) {
      const warningMsg: string = this.getWarningMessage(flexcardName, targetDataFromStorageFC);
      experienceSiteAssessmentInfo.warnings.push(warningMsg);
      experienceSiteAssessmentInfo.status = type === this.ASSESS ? 'Needs manual intervention' : 'Skipped';
    } else {
      component.componentName = TARGET_COMPONENT_NAME_FC;

      const keysToDelete = ['target', 'layout', 'params', 'standalone'];

      keysToDelete.forEach((key) => delete currentAttribute[key]);

      currentAttribute['flexcardName'] = targetDataFromStorageFC.name;
      currentAttribute['objectApiName'] = '{!objectApiName}';
      currentAttribute['recordId'] = '{!recordId}';
    }
  }

  private processOSComponent(
    targetName: string,
    component: ExpSiteComponent,
    currentAttribute: ExpSiteComponentAttributes,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentPageInfo,
    storage: MigrationStorage,
    type: string
  ): void {
    Logger.logVerbose(this.messages.getMessage('processingOmniscriptComponent', [JSON.stringify(component)]));
    // Use storage to find the updated properties
    const targetDataFromStorage: OmniScriptStorage = storage.osStorage.get(targetName.toLowerCase());
    Logger.logVerbose(this.messages.getMessage('targetData', [JSON.stringify(targetDataFromStorage)]));

    if (this.shouldAddWarning(targetDataFromStorage)) {
      const warningMsg: string = this.getWarningMessage(targetName, targetDataFromStorage);
      experienceSiteAssessmentInfo.warnings.push(warningMsg);
      experienceSiteAssessmentInfo.status = type === this.ASSESS ? 'Needs manual intervention' : 'Skipped';
    } else {
      component.componentName = TARGET_COMPONENT_NAME_OS;

      // Preserve the layout value before clearing
      const originalLayout = currentAttribute['layout'];

      // Clear existing properties more safely - preserve any properties we don't want to delete
      const keysToDelete = ['layout', 'params', 'standAlone', 'target'];
      keysToDelete.forEach((key) => delete currentAttribute[key]);

      currentAttribute['direction'] = 'ltr';
      currentAttribute['display'] = 'Display OmniScript on page';
      currentAttribute['inlineVariant'] = 'brand';
      currentAttribute['language'] =
        targetDataFromStorage.language === undefined ? 'English' : targetDataFromStorage.language;
      currentAttribute['subType'] = targetDataFromStorage.subtype;
      currentAttribute['theme'] = originalLayout;
      currentAttribute['type'] = targetDataFromStorage.type;
    }
  }

  private shouldAddWarning(targetData: Storage): boolean {
    return targetData === undefined || !targetData.migrationSuccess || targetData.isDuplicate === true;
  }

  /**
   * Check if component is an Omnistudio LWC component
   */
  private isOmnistudioStandardWrapper(componentName: string): boolean {
    return (
      componentName === TARGET_COMPONENT_NAME_OS ||
      componentName === TARGET_COMPONENT_NAME_FC ||
      componentName === TARGET_COMPONENT_NAME_OS_EXP
    );
  }

  /**
   * Update references in Omnistudio LWC components
   */
  private updateOmnistudioComponentReferences(
    component: ExpSiteComponent,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentPageInfo,
    storage: MigrationStorage,
    type: string
  ): void {
    if (component === undefined || component.componentAttributes === undefined) {
      return;
    }
    const componentName = component.componentName;
    const attributes = component.componentAttributes;

    if (componentName === TARGET_COMPONENT_NAME_OS || componentName === TARGET_COMPONENT_NAME_OS_EXP) {
      this.updateOmniScriptComponentReferences(attributes, experienceSiteAssessmentInfo, storage, type);
    } else if (componentName === TARGET_COMPONENT_NAME_FC) {
      this.updateFlexCardComponentReferences(attributes, experienceSiteAssessmentInfo, storage, type);
    }
  }

  /**
   * Update OmniScript component references (for runtime_omnistudio:omniscript and runtime_omnistudio:omniscriptExperienceCloud)
   */
  private updateOmniScriptComponentReferences(
    attributes: ExpSiteComponentAttributes,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentPageInfo,
    storage: MigrationStorage,
    type: string
  ): void {
    const currentType = attributes['type'] as string;
    const currentSubType = attributes['subType'] as string;
    const currentLanguage = attributes['language'] as string;

    if (!currentType || !currentSubType || !currentLanguage) {
      const warningMsg = this.messages.getMessage('manualInterventionForExperienceSiteConfiguration', [
        experienceSiteAssessmentInfo.name,
      ]);
      experienceSiteAssessmentInfo.warnings.push(warningMsg);
      experienceSiteAssessmentInfo.status = type === this.ASSESS ? 'Needs manual intervention' : 'Skipped';
      return;
    }

    // Create the OmniScriptStandardKey object for lookup in osStandardStorage
    const lookupKey: OmniScriptStandardKey = {
      type: currentType,
      subtype: currentSubType,
      language: currentLanguage,
    };
    // Look up in osStandardStorage using the object key
    const targetDataFromStorage: OmniScriptStorage = StorageUtil.getStandardOmniScript(storage, lookupKey);

    if (targetDataFromStorage === undefined || !targetDataFromStorage.migrationSuccess) {
      // For the standard wrapper we only need to check the storage empty and migrationSuccess status
      const originalKey = `${currentType}_${currentSubType}_${currentLanguage}`;
      const warningMsg: string = this.getWarningMessage(originalKey, targetDataFromStorage);
      experienceSiteAssessmentInfo.warnings.push(warningMsg);
      experienceSiteAssessmentInfo.status = type === this.ASSESS ? 'Needs manual intervention' : 'Skipped';
    } else {
      // Update the attributes with the new values from storage
      attributes['type'] = targetDataFromStorage.type;
      attributes['subType'] = targetDataFromStorage.subtype;
      attributes['language'] = targetDataFromStorage.language;
    }
  }

  /**
   * Update FlexCard component references (for runtime_omnistudio:flexcard)
   */
  private updateFlexCardComponentReferences(
    attributes: ExpSiteComponentAttributes,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentPageInfo,
    storage: MigrationStorage,
    type: string
  ): void {
    const currentFlexCardName = attributes['flexcardName'] as string;

    if (!currentFlexCardName) {
      return;
    }

    // Look up in storage to see if this FlexCard was migrated
    const targetDataFromStorageFC: FlexcardStorage = storage.fcStorage.get(currentFlexCardName.toLowerCase());

    if (this.shouldAddWarning(targetDataFromStorageFC)) {
      const warningMsg: string = this.getWarningMessage(currentFlexCardName, targetDataFromStorageFC);
      experienceSiteAssessmentInfo.warnings.push(warningMsg);
      experienceSiteAssessmentInfo.status = type === this.ASSESS ? 'Needs manual intervention' : 'Skipped';
    } else {
      // Update the flexcardName with the new value from storage
      attributes['flexcardName'] = targetDataFromStorageFC.name;
    }
  }

  private getWarningMessage(oldTypeSubtypeLanguage: string, targetDataFromStorage: Storage): string {
    if (targetDataFromStorage === undefined) {
      // Add log verbose
      return this.messages.getMessage('manualInterventionForExperienceSite', [oldTypeSubtypeLanguage]);
    } else if (!targetDataFromStorage.migrationSuccess) {
      return this.messages.getMessage('manualInterventionForExperienceSiteAsFailure', [oldTypeSubtypeLanguage]);
    } else {
      return this.messages.getMessage('manualInterventionForExperienceSiteAsDuplicateKey', [oldTypeSubtypeLanguage]);
    }
  }

  /**
   * Detects FlexCard/OmniScript components with custom LWC dependencies in an Experience Site.
   * Recursively scans all regions and nested components.
   *
   * @param pageJson - The Experience Site page JSON structure
   * @returns Array of components that have custom LWC dependencies
   */
  private detectCustomLWCUsageInSite(pageJson: ExpSitePageJson): ComponentWithLWC[] {
    const componentsWithLWCs: ComponentWithLWC[] = [];
    const detector = CrossReferenceDetector.getInstance();

    if (!pageJson.regions) return componentsWithLWCs;

    // Recursively scan regions
    // eslint-disable-next-line complexity, @typescript-eslint/explicit-function-return-type
    const scanRegion = (region: ExpSiteRegion) => {
      // Check components in this region
      if (region.components) {
        for (const component of region.components) {
          const componentName = component.componentName;
          if (!componentName) continue;

          // Check for runtime_omnistudio:flexcard
          if (componentName === TARGET_COMPONENT_NAME_FC) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const fcName: string = component.componentAttributes?.flexcardName as string;
            if (fcName && detector.hasCustomLWCDependencies(fcName, this.flexCardInfos)) {
              const customLWCs = detector.getCustomLWCs(fcName, this.flexCardInfos);
              componentsWithLWCs.push({
                type: 'FlexCard',
                name: fcName,
                customLWCs,
              });
            }
          }

          // Check for runtime_omnistudio:omniscript or runtime_omnistudio:omniscriptExperienceCloud
          if (componentName === TARGET_COMPONENT_NAME_OS || componentName === TARGET_COMPONENT_NAME_OS_EXP) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const attrs = component.componentAttributes;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const type = attrs?.type;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const subType = attrs?.subType;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const language = attrs?.language;

            if (
              type &&
              subType &&
              language &&
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              detector.hasOSCustomLWCDependencies(type, subType, language, this.osInfos)
            ) {
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              const customLWCs = detector.getOSCustomLWCs(type, subType, language, this.osInfos);
              componentsWithLWCs.push({
                type: 'OmniScript',
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                name: `${type}_${subType}_${language}`,
                customLWCs,
              });
            }
          }

          // Check for directly embedded FlexCard LWC wrapper (c:cf{FlexCardName})
          // In Experience Sites, auto-generated wrappers appear as 'c:cf{name}'
          if (componentName.startsWith('c:cf') && componentName.length > 4) {
            const potentialFcName = componentName.substring(4); // Remove 'c:cf' prefix
            if (detector.hasCustomLWCDependencies(potentialFcName, this.flexCardInfos)) {
              const customLWCs = detector.getCustomLWCs(potentialFcName, this.flexCardInfos);
              componentsWithLWCs.push({
                type: 'FlexCard',
                name: potentialFcName,
                customLWCs,
              });
            }
          }

          // Check for directly embedded OmniScript LWC wrapper (c:{type}{SubType}{Language})
          // Auto-generated OS wrappers appear as 'c:{type}{subtype}{language}' in Experience Sites
          if (componentName.startsWith('c:') && !componentName.startsWith('c:cf')) {
            const strippedName = componentName.substring(2); // Remove 'c:' prefix
            const nameLower = strippedName.toLowerCase();
            const osMatch = this.osInfos.find(
              (os) => os.name.toLowerCase().replace(/_\d+$/, '').replace(/_/g, '') === nameLower
            );
            if (osMatch) {
              const nameWithoutVersion = osMatch.name.replace(/_\d+$/, '');
              const parts = nameWithoutVersion.split('_');
              if (parts.length >= 3) {
                const [type, subtype, ...langParts] = parts;
                const language = langParts.join('_');
                if (detector.hasOSCustomLWCDependencies(type, subtype, language, this.osInfos)) {
                  const customLWCs = detector.getOSCustomLWCs(type, subtype, language, this.osInfos);
                  componentsWithLWCs.push({
                    type: 'OmniScript',
                    name: nameWithoutVersion,
                    customLWCs,
                  });
                }
              }
            }
          }

          // Check for legacy wrapper (vlocity_ins:vlocityLWCOmniWrapper)
          if (componentName === `${this.namespace}:vlocityLWCOmniWrapper`) {
            const target = component.componentAttributes?.target;
            if (target) {
              // FlexCard: target starts with c:cf
              if (target.startsWith('c:cf')) {
                const fcName = target.substring(3); // Remove 'c:cf' prefix
                if (detector.hasCustomLWCDependencies(fcName, this.flexCardInfos)) {
                  const customLWCs = detector.getCustomLWCs(fcName, this.flexCardInfos);
                  componentsWithLWCs.push({
                    type: 'FlexCard',
                    name: fcName,
                    customLWCs,
                  });
                }
              }
              // OmniScript: target is c:OmniScriptName (format: Type_SubType_Language)
              else if (target.startsWith('c:')) {
                const osName = target.substring(2); // Remove 'c:' prefix
                const parts = osName.split('_');
                if (parts.length >= 3) {
                  const type = parts[0];
                  const subtype = parts[1];
                  const language = parts.slice(2).join('_');
                  if (detector.hasOSCustomLWCDependencies(type, subtype, language, this.osInfos)) {
                    const customLWCs = detector.getOSCustomLWCs(type, subtype, language, this.osInfos);
                    componentsWithLWCs.push({
                      type: 'OmniScript',
                      name: osName,
                      customLWCs,
                    });
                  }
                }
              }
            }
          }

          // Check nested regions within components
          if (component.regions) {
            for (const nestedRegion of component.regions) {
              scanRegion(nestedRegion);
            }
          }
        }
      }

      // Check nested regions
      if (region.regions) {
        for (const nestedRegion of region.regions) {
          scanRegion(nestedRegion);
        }
      }
    };

    // Scan all top-level regions
    for (const region of pageJson.regions) {
      scanRegion(region);
    }

    return componentsWithLWCs;
  }
}
