/*
 * Copyright (c) 2025, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'fs';
import * as path from 'path';
import { Messages, Org } from '@salesforce/core';
import { Logger } from '../../utils/logger';
import { Constants } from '../../utils/constants/stringContants';
import { FlexiPageAssessmentInfo } from '../../utils/interfaces';
import { createProgressBar } from '../base';
import { XMLUtil } from '../../utils/XMLUtil';
import { FileDiffUtil } from '../../utils/lwcparser/fileutils/FileDiffUtil';
import { transformFlexipageBundle } from '../../utils/flexipage/flexiPageTransformer';
import { Flexipage } from '../interfaces';
import {
  DuplicateKeyError,
  KeyNotFoundInStorageError,
  ProcessingError,
  TargetPropertyNotFoundError,
} from '../../error/errorInterfaces';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

/**
 * Represents an embedded FlexCard or OmniScript component in a FlexiPage
 */
interface EmbeddedComponent {
  type: 'FlexCard' | 'OmniScript';
  name: string;
  isAutoMigratable: boolean;
}

/**
 * FlexipageMigration handles the migration and assessment of FlexiPage components
 * in Salesforce OmniStudio migration operations.
 *
 * This class provides functionality to:
 * - Assess FlexiPage components for migration readiness
 * - Migrate FlexiPage components to the target format
 * - Process FlexiPage XML files and transform their content
 * - Generate assessment reports with detailed status information
 * - Handle errors and provide detailed error reporting
 *
 * The migration process involves:
 * - Retrieving FlexiPage metadata from the Salesforce org
 * - Parsing and analyzing FlexiPage XML files
 * - Transforming component structures and properties
 * - Generating diff information for visual comparison
 * - Writing transformed files back to the project structure
 */
export class FlexipageMigration extends BaseRelatedObjectMigration {
  /** Messages instance for internationalization */
  private messages: Messages<string>;
  private xmlUtil: XMLUtil;

  /**
   * Creates a new FlexipageMigration instance.
   *
   * @param projectPath - The path to the Salesforce project
   * @param namespace - The namespace for the migration operation
   * @param org - The Salesforce org connection
   * @param messages - Messages instance for internationalization
   */
  public constructor(projectPath: string, namespace: string, org: Org, messages: Messages<string>) {
    super(projectPath, namespace, org);
    this.messages = messages;
    this.xmlUtil = new XMLUtil(['flexiPageRegions', 'itemInstances', 'componentInstanceProperties']);
  }

  /**
   * Returns the object type constant for FlexiPage components.
   *
   * @returns The FlexiPage constant string
   */
  public processObjectType(): string {
    return Constants.FlexiPage;
  }

  /**
   * Detects ALL FlexCards/OmniScripts embedded in this FlexiPage.
   * Returns list of embedded components with auto-migration capability.
   *
   * @param json - The parsed FlexiPage JSON structure
   * @returns Array of embedded components found in the FlexiPage
   */
  // eslint-disable-next-line complexity
  private detectEmbeddedComponents(json: Flexipage): EmbeddedComponent[] {
    const embeddedComponents: EmbeddedComponent[] = [];

    Logger.logVerbose(`[DEBUG] detectEmbeddedComponents - json keys: ${Object.keys(json).join(', ')}`);
    Logger.logVerbose(
      `[DEBUG] detectEmbeddedComponents - flexiPageRegions type: ${typeof json.flexiPageRegions}, isArray: ${Array.isArray(
        json.flexiPageRegions
      )}, length: ${Array.isArray(json.flexiPageRegions) ? json.flexiPageRegions.length : 'N/A'}`
    );

    if (!json.flexiPageRegions) {
      Logger.logVerbose('[DEBUG] detectEmbeddedComponents - No flexiPageRegions found');
      return embeddedComponents;
    }

    for (const region of json.flexiPageRegions) {
      if (!region.itemInstances) continue;

      for (const item of region.itemInstances) {
        const componentName = item?.componentInstance?.componentName;
        Logger.logVerbose(`[DEBUG] detectEmbeddedComponents - Found componentName: ${componentName}`);

        // Case 1: Legacy wrapper (namespace:vlocityLWCOmniWrapper)
        // This is AUTO-MIGRATABLE via standard wrapper transformation
        if (componentName?.includes('vlocityLWCOmniWrapper')) {
          const target = item.componentInstance?.componentInstanceProperties?.find(
            (prop) => prop.name === 'target'
          )?.value;

          if (target) {
            const parts = target.split(':');
            if (parts[0] === 'OmniScript' && parts.length === 4) {
              embeddedComponents.push({
                type: 'OmniScript',
                name: `${parts[1]}_${parts[2]}_${parts[3]}`,
                isAutoMigratable: true, // Legacy wrapper can be transformed
              });
            } else if (parts[0] === 'FlexCard') {
              embeddedComponents.push({
                type: 'FlexCard',
                name: parts[1],
                isAutoMigratable: true,
              });
            } else if (parts.length === 1) {
              // No prefix - assume FlexCard
              embeddedComponents.push({
                type: 'FlexCard',
                name: target,
                isAutoMigratable: true,
              });
            }
          }
        }

        // Case 2: Standard runtime_omnistudio:omniscript
        // Already using standard wrapper - AUTO-MIGRATABLE
        else if (componentName === 'runtime_omnistudio:omniscript') {
          const type = item.componentInstance?.componentInstanceProperties?.find((prop) => prop.name === 'type')?.value;
          const subType = item.componentInstance?.componentInstanceProperties?.find(
            (prop) => prop.name === 'subType'
          )?.value;
          const language = item.componentInstance?.componentInstanceProperties?.find(
            (prop) => prop.name === 'language'
          )?.value;

          if (type && subType && language) {
            embeddedComponents.push({
              type: 'OmniScript',
              name: `${type}_${subType}_${language}`,
              isAutoMigratable: true,
            });
          }
        }

        // Case 3: Standard runtime_omnistudio:flexcard
        // Already using standard wrapper - AUTO-MIGRATABLE
        else if (componentName === 'runtime_omnistudio:flexcard') {
          const fcName = item.componentInstance?.componentInstanceProperties?.find(
            (prop) => prop.name === 'flexcardName'
          )?.value;

          if (fcName) {
            embeddedComponents.push({
              type: 'FlexCard',
              name: fcName,
              isAutoMigratable: true,
            });
          }
        }

        // Case 4: Direct generated FlexCard LWC (e.g., cfFlexCardName, cfFlex_vlocityaction)
        // NOT auto-migratable - requires manual update to use standard wrapper
        else if (componentName && componentName.startsWith('cf')) {
          embeddedComponents.push({
            type: 'FlexCard',
            name: componentName,
            isAutoMigratable: false, // Direct LWC reference - needs manual wrapper update
          });
          Logger.logVerbose(`[DEBUG] Detected direct FlexCard LWC: ${componentName}`);
        }

        // Case 5: Direct generated OmniScript LWC (e.g., insEnrollmentStdNewDatamodelEnglish)
        // Pattern: lowercase start, ends with common language names
        // NOT auto-migratable - requires manual update to use standard wrapper
        else if (componentName && this.isGeneratedOmniScriptLWC(componentName)) {
          embeddedComponents.push({
            type: 'OmniScript',
            name: componentName,
            isAutoMigratable: false, // Direct LWC reference - needs manual wrapper update
          });
          Logger.logVerbose(`[DEBUG] Detected direct OmniScript LWC: ${componentName}`);
        }
      }
    }

    return embeddedComponents;
  }

  /**
   * Checks if a component name matches the pattern of a generated OmniScript LWC
   * Generated OmniScripts follow pattern: {type}{subType}{language} in camelCase
   * Common languages: English, Spanish, French, German, Italian, Portuguese, Japanese, Chinese, Korean, etc.
   *
   * @param componentName - The component name to check
   * @returns True if it matches generated OmniScript LWC pattern
   */
  private isGeneratedOmniScriptLWC(componentName: string): boolean {
    if (!componentName) return false;

    // Common language suffixes in generated OmniScript LWCs
    const languageSuffixes = [
      'English',
      'Spanish',
      'French',
      'German',
      'Italian',
      'Portuguese',
      'Japanese',
      'Chinese',
      'Korean',
      'Dutch',
      'Russian',
      'Arabic',
      'Hindi',
      'MultiLanguage',
      'Multi-Language',
    ];

    // Check if component name ends with any language suffix
    const endsWithLanguage = languageSuffixes.some((lang) => componentName.endsWith(lang.replace('-', '')));

    // Additional heuristics:
    // - Starts with lowercase letter (OmniScript convention)
    // - Contains no special characters except underscore
    // - Longer than typical component names (type+subtype+language)
    const startsWithLowercase = /^[a-z]/.test(componentName);
    const noSpecialChars = /^[a-zA-Z0-9_]+$/.test(componentName);
    const reasonableLength = componentName.length > 10 && componentName.length < 100;

    return endsWithLanguage && startsWithLowercase && noSpecialChars && reasonableLength;
  }

  /**
   * Generates page-level warning for embedded components.
   *
   * @param pageName - The name of the FlexiPage
   * @param embeddedComponents - Array of embedded components found
   * @param mode - Processing mode ('assess' or 'migrate')
   * @returns Object containing warnings array and status string
   */
  private generatePageLevelWarning(
    pageName: string,
    embeddedComponents: EmbeddedComponent[],
    mode: 'assess' | 'migrate'
  ): {
    warnings: string[];
    status: 'Ready for migration' | 'Failed' | 'Successfully migrated' | 'Needs manual intervention' | 'Skipped' | '';
  } {
    if (embeddedComponents.length === 0) {
      return { warnings: [], status: '' };
    }

    const flexCards = embeddedComponents.filter((c) => c.type === 'FlexCard');
    const omniScripts = embeddedComponents.filter((c) => c.type === 'OmniScript');
    const allAutoMigratable = embeddedComponents.every((c) => c.isAutoMigratable);

    const componentList: string[] = [];
    if (flexCards.length > 0) {
      componentList.push(`FlexCards: ${flexCards.map((c) => c.name).join(', ')}`);
    }
    if (omniScripts.length > 0) {
      componentList.push(`OmniScripts: ${omniScripts.map((c) => c.name).join(', ')}`);
    }

    let messageKey: string;
    if (mode === 'assess') {
      messageKey = allAutoMigratable ? 'flexipageCrossNamespaceWarning' : 'flexipageCrossNamespaceManualIntervention';
    } else {
      messageKey = allAutoMigratable ? 'flexipageCrossNamespaceMigrated' : 'flexipageCrossNamespaceSkipped';
    }

    const warningMessage = this.messages.getMessage(messageKey, [pageName, componentList.join('; ')]);

    const status: 'Ready for migration' | 'Failed' | 'Successfully migrated' | 'Needs manual intervention' | 'Skipped' =
      mode === 'assess'
        ? allAutoMigratable
          ? 'Ready for migration'
          : 'Needs manual intervention'
        : allAutoMigratable
        ? 'Successfully migrated'
        : 'Skipped';

    return {
      warnings: [warningMessage],
      status,
    };
  }

  /**
   * Performs assessment of FlexiPage components to determine migration readiness.
   *
   * @returns Array of FlexiPage assessment information
   */
  public assess(): FlexiPageAssessmentInfo[] {
    Logger.log(this.messages.getMessage('assessingFlexiPages'));
    return this.process('assess');
  }

  /**
   * Performs migration of FlexiPage components to the target format.
   *
   * @returns Array of FlexiPage assessment information after migration
   */
  public migrate(): FlexiPageAssessmentInfo[] {
    Logger.log(this.messages.getMessage('migratingFlexiPages'));
    return this.process('migrate');
  }

  /**
   * Processes FlexiPages in either assessment or migration mode.
   *
   * This method:
   * - Retrieves FlexiPage metadata from the Salesforce org
   * - Reads and processes each FlexiPage XML file
   * - Transforms the content based on the specified mode
   * - Handles errors and provides detailed logging
   * - Generates progress indicators for long-running operations
   *
   * @param mode - The processing mode: 'assess' for analysis only, 'migrate' for actual transformation
   * @returns Array of FlexiPage assessment information
   */
  private process(mode: 'assess' | 'migrate'): FlexiPageAssessmentInfo[] {
    const flexiPageDir = path.join(this.projectPath, 'force-app', 'main', 'default', 'flexipages');
    const files = fs.readdirSync(flexiPageDir).filter((file) => file.endsWith('.xml'));
    Logger.logVerbose(this.messages.getMessage('foundFlexiPages', [files.length]));
    const progressBar = createProgressBar(mode === 'assess' ? 'Assessing' : 'Migrating', 'Flexipage');
    progressBar.start(files.length, 0);
    const flexPageAssessmentInfos: FlexiPageAssessmentInfo[] = [];

    const errors: Set<string> = new Set();

    for (const file of files) {
      Logger.logVerbose(this.messages.getMessage('processingFlexiPage', [file]));
      const filePath = path.join(flexiPageDir, file);
      try {
        const flexPageAssessmentInfo: FlexiPageAssessmentInfo = this.processFlexiPage(file, filePath, mode);
        if (!flexPageAssessmentInfo) {
          progressBar.increment();
          continue;
        }
        flexPageAssessmentInfos.push(flexPageAssessmentInfo);
        Logger.logVerbose(
          this.messages.getMessage('completedProcessingFlexiPage', [
            file,
            JSON.stringify(flexPageAssessmentInfo.errors),
          ])
        );
      } catch (error) {
        let status: 'Failed' | 'Needs manual intervention' | 'Skipped' = 'Failed';
        if (error instanceof KeyNotFoundInStorageError) {
          errors.add(`${error.componentType} ${error.key} can't be migrated`);
          status = mode === 'assess' ? 'Needs manual intervention' : 'Skipped';
        } else if (error instanceof TargetPropertyNotFoundError || error instanceof ProcessingError) {
          errors.add(error.message);
          status = mode === 'assess' ? 'Needs manual intervention' : 'Skipped';
        } else if (error instanceof DuplicateKeyError) {
          errors.add(
            this.messages.getMessage('manualInterventionForFlexiPageAsDuplicateKey', [error.componentType, error.key])
          );
          status = mode === 'assess' ? 'Needs manual intervention' : 'Skipped';
        } else {
          errors.add(this.messages.getMessage('errorProcessingFlexiPage', [file, error]));
          status = 'Failed';
        }
        flexPageAssessmentInfos.push({
          name: file,
          errors: [error instanceof Error ? error.message : JSON.stringify(error)],
          path: filePath,
          diff: '',
          status,
        });
      }
      progressBar.increment();
    }
    progressBar.stop();
    if (errors.size > 0) {
      errors.forEach((error) => Logger.error(error));
    }
    Logger.logVerbose(this.messages.getMessage('completedProcessingAllFlexiPages', [flexPageAssessmentInfos.length]));
    Logger.log(this.messages.getMessage('flexipagesWithChanges', [flexPageAssessmentInfos.length]));
    return flexPageAssessmentInfos;
  }

  /**
   * Processes a single FlexiPage for assessment or migration.
   *
   * This method:
   * - Reads the FlexiPage XML file content
   * - Parses the XML structure into a JavaScript object
   * - Transforms the FlexiPage bundle using the flexipage transformer
   * - Generates diff information for visual comparison
   * - Writes transformed content back to file in migration mode
   * - Handles errors and provides detailed error information
   *
   * @param fileName - The name of the FlexiPage
   * @param filePath - The full path to the FlexiPage
   * @param mode - The processing mode: 'assess' or 'migrate'
   * @returns FlexiPage assessment information with status and error details
   */
  private processFlexiPage(fileName: string, filePath: string, mode: 'assess' | 'migrate'): FlexiPageAssessmentInfo {
    Logger.logVerbose(this.messages.getMessage('startingFlexiPageProcessing', [fileName]));
    const fileContent = fs.readFileSync(filePath, 'utf8');
    Logger.logVerbose(this.messages.getMessage('readFlexiPageContent', [fileContent.length]));

    const json = this.xmlUtil.parse(fileContent) as Flexipage;

    // NEW: Detect embedded components
    const embeddedComponents = this.detectEmbeddedComponents(json);
    Logger.logVerbose(`[DEBUG] ${fileName} - Detected ${embeddedComponents.length} embedded components`);

    // Generate page-level warnings for embedded components
    const { warnings, status: componentWarningStatus } = this.generatePageLevelWarning(
      fileName,
      embeddedComponents,
      mode
    );
    Logger.logVerbose(`[DEBUG] ${fileName} - Generated ${warnings.length} warnings, status: ${componentWarningStatus}`);

    // Proceed with existing transformation logic
    const transformedFlexiPage = transformFlexipageBundle(json, this.namespace, mode);

    // If no transformation needed, check if we have warnings to report
    if (transformedFlexiPage === false) {
      Logger.logVerbose(`[DEBUG] ${fileName} - No transformation needed. Warnings: ${warnings.length}`);
      // If there are embedded component warnings, still return them
      if (warnings.length > 0) {
        Logger.logVerbose(`[DEBUG] ${fileName} - Returning with warnings only`);
        return {
          path: filePath,
          name: fileName,
          diff: '',
          errors: warnings,
          status: componentWarningStatus as
            | 'Ready for migration'
            | 'Failed'
            | 'Warnings'
            | 'Successfully migrated'
            | 'Needs manual intervention'
            | 'Skipped',
        };
      }
      // No warnings and no transformation - nothing to report
      return null;
    }
    const modifiedContent = this.xmlUtil.build(transformedFlexiPage, 'FlexiPage');

    if (mode === 'migrate') {
      fs.writeFileSync(filePath, modifiedContent);
      Logger.logVerbose(this.messages.getMessage('updatedModifiedContent', [filePath]));
    }

    // Normalize trailing newlines to avoid false positives in diff
    // Both original and modified content are normalized to remove trailing newlines
    const normalizedOriginal = fileContent.replace(/\n+$/, '');
    const normalizedModified = modifiedContent.replace(/\n+$/, '');
    const diff = new FileDiffUtil().getXMLDiff(normalizedOriginal, normalizedModified);
    Logger.logVerbose(this.messages.getMessage('generatedDiffForFile', [fileName]));

    const transformationStatus = mode === 'assess' ? 'Ready for migration' : 'Successfully migrated';

    // Check if there are any actual changes (where old !== new)
    const hasActualChanges = diff.some((d) => d.old !== d.new);

    // Combine transformation status with component warning status
    // Priority: component warnings > transformation changes
    let finalStatus: typeof transformationStatus = transformationStatus;
    if (warnings.length > 0 && componentWarningStatus !== '') {
      finalStatus = componentWarningStatus as typeof transformationStatus;
    }

    // Include results if there are warnings OR actual changes
    if (warnings.length === 0 && !hasActualChanges) {
      return null;
    }

    return {
      path: filePath,
      name: fileName,
      diff: JSON.stringify(diff),
      errors: warnings,
      status: finalStatus,
    };
  }
}
