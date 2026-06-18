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
import { FlexiPageAssessmentInfo, FlexCardAssessmentInfo, OSAssessmentInfo } from '../../utils/interfaces';
import { createProgressBar } from '../base';
import { XMLUtil } from '../../utils/XMLUtil';
import { FileDiffUtil } from '../../utils/lwcparser/fileutils/FileDiffUtil';
import { transformFlexipageBundle } from '../../utils/flexipage/flexiPageTransformer';
import { Flexipage, FlexiComponentInstance } from '../interfaces';
import {
  DuplicateKeyError,
  KeyNotFoundInStorageError,
  ProcessingError,
  TargetPropertyNotFoundError,
} from '../../error/errorInterfaces';
import { CrossReferenceDetector, ComponentWithLWC } from '../../utils/crossReferenceDetector';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

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
  private flexCardInfos: FlexCardAssessmentInfo[] = [];
  private osInfos: OSAssessmentInfo[] = [];

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
   * Performs assessment of FlexiPage components to determine migration readiness.
   *
   * @param flexCardInfos - Optional array of FlexCard assessment information for cross-reference detection
   * @param osInfos - Optional array of OmniScript assessment information for cross-reference detection
   * @returns Array of FlexiPage assessment information
   */
  public assess(flexCardInfos?: FlexCardAssessmentInfo[], osInfos?: OSAssessmentInfo[]): FlexiPageAssessmentInfo[] {
    this.flexCardInfos = flexCardInfos || [];
    this.osInfos = osInfos || [];
    Logger.log(this.messages.getMessage('assessingFlexiPages'));
    return this.process('assess');
  }

  /**
   * Performs migration of FlexiPage components to the target format.
   *
   * @param flexCardInfos - Optional array of FlexCard assessment information for cross-reference detection
   * @param osInfos - Optional array of OmniScript assessment information for cross-reference detection
   * @returns Array of FlexiPage assessment information after migration
   */
  public migrate(flexCardInfos?: FlexCardAssessmentInfo[], osInfos?: OSAssessmentInfo[]): FlexiPageAssessmentInfo[] {
    this.flexCardInfos = flexCardInfos || [];
    this.osInfos = osInfos || [];
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
    const masterLabel = (json.masterLabel as string) || '';

    // Check for cross-reference issues with custom LWCs before transformation (which may throw)
    const componentsWithLWCs = this.detectCustomLWCUsage(json);
    const warnings: string[] = [];
    if (componentsWithLWCs.length > 0) {
      warnings.push(CrossReferenceDetector.getInstance().formatPageWarning(componentsWithLWCs, mode));
    }

    let transformedFlexiPage: Flexipage | boolean;
    try {
      transformedFlexiPage = transformFlexipageBundle(json, this.namespace, mode);
    } catch (transformError) {
      // Transformation failed — if we have cross-ref warnings, report them despite the error
      if (warnings.length > 0) {
        return {
          path: filePath,
          name: fileName,
          masterLabel,
          diff: '',
          errors: [transformError instanceof Error ? transformError.message : JSON.stringify(transformError)],
          warnings,
          status: mode === 'assess' ? 'Warnings' : 'Skipped',
        };
      }
      throw transformError;
    }

    // If no transformation needed and no warnings, skip this page
    if (transformedFlexiPage === false && warnings.length === 0) {
      Logger.logVerbose(`No transformation needed on ${fileName}`);
      return null;
    }

    // If no transformation but we have warnings, use original JSON
    const finalFlexiPage = transformedFlexiPage !== false ? transformedFlexiPage : json;
    const modifiedContent = this.xmlUtil.build(finalFlexiPage, 'FlexiPage');

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

    let status: 'Ready for migration' | 'Warnings' | 'Successfully migrated' =
      mode === 'assess' ? 'Ready for migration' : 'Successfully migrated';

    // Update status if we have warnings
    if (warnings.length > 0 && status === 'Ready for migration') {
      status = 'Warnings';
    }

    // Check if there are any actual changes (where old !== new)
    const hasActualChanges = diff.some((d) => d.old !== d.new);

    // Only exclude if there are no changes AND no warnings
    if (
      !hasActualChanges &&
      warnings.length === 0 &&
      (status === 'Ready for migration' || status === 'Successfully migrated')
    ) {
      return null;
    }

    return {
      path: filePath,
      name: fileName,
      masterLabel,
      diff: JSON.stringify(diff),
      errors: [],
      warnings: warnings.length > 0 ? warnings : undefined,
      status,
    };
  }

  /**
   * Detects FlexCard/OmniScript components with custom LWC dependencies in a FlexiPage.
   *
   * @param flexipage - The FlexiPage structure to scan
   * @returns Array of components that have custom LWC dependencies
   */
  // eslint-disable-next-line complexity
  private detectCustomLWCUsage(flexipage: Flexipage): ComponentWithLWC[] {
    const componentsWithLWCs: ComponentWithLWC[] = [];
    const detector = CrossReferenceDetector.getInstance();

    if (!flexipage.flexiPageRegions) return componentsWithLWCs;

    for (const region of flexipage.flexiPageRegions) {
      if (!region.itemInstances) continue;

      for (const item of region.itemInstances) {
        const component = item.componentInstance;
        if (!component) continue;

        const componentName = component.componentName;
        if (!componentName) continue;

        // Check for runtime_omnistudio:flexcard
        if (componentName.includes('runtime_omnistudio:flexcard')) {
          const fcName = this.extractFlexCardName(component);
          if (fcName && detector.hasCustomLWCDependencies(fcName, this.flexCardInfos)) {
            const customLWCs = detector.getCustomLWCs(fcName, this.flexCardInfos);
            componentsWithLWCs.push({
              type: 'FlexCard',
              name: fcName,
              customLWCs,
            });
          }
        }

        // Check for runtime_omnistudio:omniscript
        if (componentName.includes('runtime_omnistudio:omniscript')) {
          const { type, subtype, language } = this.extractOmniScriptInfo(component);
          if (
            type &&
            subtype &&
            language &&
            detector.hasOSCustomLWCDependencies(type, subtype, language, this.osInfos)
          ) {
            const customLWCs = detector.getOSCustomLWCs(type, subtype, language, this.osInfos);
            componentsWithLWCs.push({
              type: 'OmniScript',
              name: `${type}_${subtype}_${language}`,
              customLWCs,
            });
          }
        }

        // Check for directly embedded FlexCard LWC wrapper (cf{FlexCardName})
        // Auto-generated FlexCard wrapper LWCs appear as plain 'cf{name}' in FlexiPages
        if (!componentName.includes(':') && componentName.startsWith('cf') && componentName.length > 2) {
          const potentialFcName = componentName.substring(2);
          if (detector.hasCustomLWCDependencies(potentialFcName, this.flexCardInfos)) {
            const customLWCs = detector.getCustomLWCs(potentialFcName, this.flexCardInfos);
            componentsWithLWCs.push({
              type: 'FlexCard',
              name: potentialFcName,
              customLWCs,
            });
          }
        }

        // Check for directly embedded OmniScript LWC wrapper ({type}{SubType}{Language})
        // Auto-generated OS wrapper LWCs use camelCase concat of type_subtype_language
        if (!componentName.includes(':') && !componentName.startsWith('cf')) {
          const compLower = componentName.toLowerCase();
          const osMatch = this.osInfos.find(
            (os) => os.name.toLowerCase().replace(/_\d+$/, '').replace(/_/g, '') === compLower
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
        if (componentName.includes(`${this.namespace}:vlocityLWCOmniWrapper`)) {
          const target = this.extractTargetProperty(component);
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
            // FlexCard: bare name (no c:cf prefix, e.g. target='irfantest')
            else if (!target.includes(':') && !target.startsWith('c:')) {
              if (detector.hasCustomLWCDependencies(target, this.flexCardInfos)) {
                const customLWCs = detector.getCustomLWCs(target, this.flexCardInfos);
                componentsWithLWCs.push({
                  type: 'FlexCard',
                  name: target,
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
      }
    }

    return componentsWithLWCs;
  }

  /**
   * Extract FlexCard name from component instance properties
   */
  private extractFlexCardName(component: FlexiComponentInstance): string | null {
    if (!component.componentInstanceProperties) return null;

    const flexcardNameProp = component.componentInstanceProperties.find((prop) => prop.name === 'flexcardName');
    return flexcardNameProp?.value || null;
  }

  /**
   * Extract OmniScript type, subtype, and language from component instance properties
   */
  private extractOmniScriptInfo(component: FlexiComponentInstance): {
    type: string;
    subtype: string;
    language: string;
  } {
    if (!component.componentInstanceProperties) {
      return { type: '', subtype: '', language: '' };
    }

    const typeProp = component.componentInstanceProperties.find((prop) => prop.name === 'type');
    const subtypeProp = component.componentInstanceProperties.find((prop) => prop.name === 'subType');
    const languageProp = component.componentInstanceProperties.find((prop) => prop.name === 'language');

    return {
      type: typeProp?.value || '',
      subtype: subtypeProp?.value || '',
      language: languageProp?.value || '',
    };
  }

  /**
   * Extract target property from legacy vlocityLWCOmniWrapper component
   */
  private extractTargetProperty(component: FlexiComponentInstance): string | null {
    if (!component.componentInstanceProperties) return null;

    const targetProp = component.componentInstanceProperties.find((prop) => prop.name === 'target');
    return targetProp?.value || null;
  }
}
