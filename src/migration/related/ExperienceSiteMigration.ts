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
  OmniScriptStorage,
  ExpSitePageJson,
  Storage,
  ExpSiteRegion,
  FlexcardStorage,
} from '../interfaces';
import { FileDiffUtil } from '../../utils/lwcparser/fileutils/FileDiffUtil';
import { ExperienceSiteAssessmentInfo } from '../../utils';
import { StorageUtil } from '../../utils/storageUtil';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

Messages.importMessagesDirectory(__dirname);

const TARGET_COMPONENT_NAME_OS = 'runtime_omnistudio_omniscript';
const TARGET_COMPONENT_NAME_FC = 'runtime_omnisctudio_flexcard';
const FLEXCARD_PREFIX = 'cf';

export class ExperienceSiteMigration extends BaseRelatedObjectMigration {
  private EXPERIENCE_SITES_PATH: string;

  public constructor(projectPath: string, namespace: string, org: Org) {
    super(projectPath, namespace, org);
  }

  public processObjectType(): string {
    return Constants.ExpSites;
  }

  public migrate(): ExperienceSiteAssessmentInfo[] {
    Logger.logVerbose('Starting experience sites migration');
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    this.EXPERIENCE_SITES_PATH = path.join(this.projectPath, 'force-app', 'main', 'default', 'experiences');

    Logger.logVerbose('Started processing the experience sites');
    const experienceSiteInfo = this.processExperienceSites(this.EXPERIENCE_SITES_PATH, 'migration');
    Logger.info('Successfully processed experience sites for migration');
    shell.cd(pwd);
    return experienceSiteInfo;
  }

  public processExperienceSites(dir: string, type = 'migration'): ExperienceSiteAssessmentInfo[] {
    Logger.logVerbose('Started reading the files');
    const directoryMap: Map<string, File[]> = FileUtil.getAllFilesInsideDirectory(dir);

    // TODO - IF directory is empty

    const experienceSitesAssessmentInfo: ExperienceSiteAssessmentInfo[] = [];
    for (const directory of directoryMap.keys()) {
      const fileArray = directoryMap.get(directory);
      for (const file of fileArray) {
        if (file.ext !== '.json') {
          Logger.logVerbose('Skipping non-JSON file - ' + file.name);
          continue;
        }
        try {
          const experienceSiteInfo = this.processExperienceSite(file, type);
          if (experienceSiteInfo?.hasOmnistudioContent === true) {
            Logger.logVerbose('Successfully processed experience site file having vlocity wrapper');
            experienceSitesAssessmentInfo.push(experienceSiteInfo);
          } else {
            Logger.logVerbose('File does not contain omnistudio wrapper');
          }
        } catch (err) {
          Logger.error('Error processing experience site file' + file.name);
          Logger.error(JSON.stringify(err));
        }
      }
    }
    return experienceSitesAssessmentInfo;
  }

  public processExperienceSite(file: File, type = 'migration'): ExperienceSiteAssessmentInfo {
    Logger.logVerbose('Processing for file ' + file.name);

    const experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo = {
      name: file.name,
      warnings: [],
      infos: [],
      path: file.location,
      diff: JSON.stringify([]),
      hasOmnistudioContent: false,
    };

    const lookupComponentName = `${this.namespace}:vlocityLWCOmniWrapper`;
    const fileContent = fs.readFileSync(file.location, 'utf8');
    // TODO - undefined check here
    const experienceSiteParsedJSON = JSON.parse(fileContent) as ExpSitePageJson;
    const normalizedOriginalFileContent = JSON.stringify(experienceSiteParsedJSON, null, 2);
    const regions: ExpSiteRegion[] = experienceSiteParsedJSON['regions'];

    // TODO - When will it be Flexcard

    if (regions === undefined) {
      experienceSiteAssessmentInfo.hasOmnistudioContent = false;
      return experienceSiteAssessmentInfo;
    }

    const storage: MigrationStorage = StorageUtil.getOmnistudioMigrationStorage();

    for (const region of regions) {
      Logger.logVerbose('The current region being processed is' + JSON.stringify(region));

      const regionComponents: ExpSiteComponent[] = region['components'];

      if (regionComponents === undefined) {
        continue;
      }

      if (Array.isArray(regionComponents)) {
        for (const component of regionComponents) {
          if (component === undefined || component === null) {
            continue;
          }

          Logger.logVerbose('The current component being processed is ' + JSON.stringify(component));

          if (component.componentName === lookupComponentName) {
            Logger.logVerbose('Omnistudio wrapper component found');
            experienceSiteAssessmentInfo.hasOmnistudioContent = true;

            this.updateComponentAndItsAttributes(
              component,
              component.componentAttributes,
              experienceSiteAssessmentInfo,
              storage
            );
          }
        }
      }
    }

    Logger.logVerbose('Now printing the updated object' + JSON.stringify(experienceSiteParsedJSON));

    const noarmalizeUpdatedFileContent = JSON.stringify(experienceSiteParsedJSON, null, 2); // Pretty-print with 2 spaces
    const difference = new FileDiffUtil().getFileDiff(
      file.name,
      normalizedOriginalFileContent,
      noarmalizeUpdatedFileContent
    );

    Logger.logVerbose('Printing the difference' + JSON.stringify(difference));

    if (normalizedOriginalFileContent !== noarmalizeUpdatedFileContent) {
      Logger.logVerbose('Updating the file content');
      fs.writeFileSync(file.location, noarmalizeUpdatedFileContent, 'utf8');
    }

    experienceSiteAssessmentInfo.diff = JSON.stringify(difference);
    return experienceSiteAssessmentInfo;
  }

  private updateComponentAndItsAttributes(
    component: ExpSiteComponent,
    currentAttribute: ExpSiteComponentAttributes,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo,
    storage: MigrationStorage
  ): void {
    if (component === undefined || currentAttribute === undefined) {
      return;
    }

    if (currentAttribute.target === undefined || currentAttribute.target === '') {
      experienceSiteAssessmentInfo.warnings.push(
        'Target exists as empty string. Please check experience site configuration'
      );
      return;
    }

    const targetName = currentAttribute.target.substring(currentAttribute.target.indexOf(':') + 1); // c:ABCD -> ABCD

    if (targetName.startsWith(FLEXCARD_PREFIX)) {
      this.processFCComponent(targetName, component, currentAttribute, experienceSiteAssessmentInfo, storage);
    } else {
      this.processOSComponent(targetName, component, currentAttribute, experienceSiteAssessmentInfo, storage);
    }
    Logger.logVerbose('updatedComponentAttribute = ' + JSON.stringify(currentAttribute));
  }

  private processFCComponent(
    targetName: string,
    component: ExpSiteComponent,
    currentAttribute: ExpSiteComponentAttributes,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo,
    storage: MigrationStorage
  ): void {
    Logger.logVerbose(`Started processing FC component + ${JSON.stringify(component)} `);
    const flexcardName = targetName.substring(2); // cfCardName -> CardName
    const targetDataFromStorageFC: FlexcardStorage = storage.fcStorage.get(flexcardName);

    Logger.logVerbose('The target data is ' + JSON.stringify(targetDataFromStorageFC));

    // Remove later
    if (this.shouldAddWarning(targetDataFromStorageFC)) {
      const warningMsg: string = this.getWarningMessage(flexcardName, targetDataFromStorageFC);
      experienceSiteAssessmentInfo.warnings.push(warningMsg);
    } else {
      component.componentName = TARGET_COMPONENT_NAME_FC;
      currentAttribute['flexcardName'] = targetDataFromStorageFC.name;
      currentAttribute['objectApiName'] = '{!objectApiName}';
      currentAttribute['recordId'] = '{!recordId}';
    }
  }

  private processOSComponent(
    targetName: string,
    component: ExpSiteComponent,
    currentAttribute: ExpSiteComponentAttributes,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo,
    storage: MigrationStorage
  ): void {
    Logger.logVerbose(`Started processing OS component + ${JSON.stringify(component)} `);
    // Use storage to find the updated properties
    const targetDataFromStorage: OmniScriptStorage = storage.osStorage.get(targetName);
    Logger.logVerbose('The target data is ' + JSON.stringify(targetDataFromStorage));

    if (this.shouldAddWarning(targetDataFromStorage)) {
      const warningMsg: string = this.getWarningMessage(targetName, targetDataFromStorage);
      experienceSiteAssessmentInfo.warnings.push(warningMsg);
    } else {
      component.componentName = TARGET_COMPONENT_NAME_OS;

      // Preserve the layout value before clearing
      const originalLayout = currentAttribute['layout'];

      // define an array and delete those keys
      // Clear existing properties and set new ones
      Object.keys(currentAttribute).forEach((key) => delete currentAttribute[key]);

      currentAttribute['direction'] = 'ltr';
      currentAttribute['display'] = 'Display button to open Omniscript';
      currentAttribute['inlineVariant'] = 'brand';
      currentAttribute['language'] =
        targetDataFromStorage.language === undefined ? 'English' : targetDataFromStorage.language;
      currentAttribute['subType'] = targetDataFromStorage.subtype;
      currentAttribute['theme'] = originalLayout;
      currentAttribute['type'] = targetDataFromStorage.type;
    }
  }

  private shouldAddWarning(targetData: Storage): boolean {
    return targetData === undefined || targetData.migrationSuccess === false || targetData.isDuplicate === true;
  }

  private getWarningMessage(oldTypeSubtypeLanguage: string, targetDataFromStorage: Storage): string {
    if (targetDataFromStorage === undefined) {
      return `${oldTypeSubtypeLanguage} needs manual intervention as the migrated key does not exist`;
    } else if (targetDataFromStorage.migrationSuccess === false) {
      return `${oldTypeSubtypeLanguage} needs manual intervention as migration failed`;
    } else {
      return `${oldTypeSubtypeLanguage} needs manual intervention as duplicated key found in storage`;
    }
  }
}
