/*
 * Copyright (c) 2025, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { FlexCardAssessmentInfo, OSAssessmentInfo } from './interfaces';

/**
 * Represents a component with custom LWC dependencies
 */
export interface ComponentWithLWC {
  type: 'FlexCard' | 'OmniScript';
  name: string;
  customLWCs: string[];
}

/**
 * Singleton utility to detect cross-reference issues when FlexCards/OmniScripts
 * with custom LWC dependencies are used in FlexiPages or Experience Sites.
 *
 * Cross-reference issues occur because:
 * - Custom LWCs migrate to c/ namespace
 * - Auto-generated FlexCard/OmniScript wrappers retain vertical namespace (vlocity_ins__)
 * - At runtime, this creates a cross-namespace reference error
 *
 * Solution: Automatically wrap components in runtime_omnistudio:flexcard/omniscript
 */
export class CrossReferenceDetector {
  private static instance: CrossReferenceDetector;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): CrossReferenceDetector {
    if (!CrossReferenceDetector.instance) {
      CrossReferenceDetector.instance = new CrossReferenceDetector();
    }
    return CrossReferenceDetector.instance;
  }

  /**
   * Check if a FlexCard has custom LWC dependencies
   *
   * @param fcName FlexCard name (case-insensitive)
   * @param flexCardInfos Array of FlexCard assessment information
   * @returns true if FlexCard has custom LWC dependencies
   */
  public hasCustomLWCDependencies(fcName: string, flexCardInfos: FlexCardAssessmentInfo[]): boolean {
    if (!fcName || !flexCardInfos) return false;

    const fcInfo = flexCardInfos.find(
      (fc) => fc.name.toLowerCase() === fcName.toLowerCase() || fc.oldName.toLowerCase() === fcName.toLowerCase()
    );

    return fcInfo ? fcInfo.dependenciesLWC.length > 0 : false;
  }

  /**
   * Check if an OmniScript has custom LWC dependencies
   *
   * @param type OmniScript Type
   * @param subtype OmniScript SubType
   * @param language OmniScript Language
   * @param osInfos Array of OmniScript assessment information
   * @returns true if OmniScript has custom LWC dependencies
   */
  public hasOSCustomLWCDependencies(
    type: string,
    subtype: string,
    language: string,
    osInfos: OSAssessmentInfo[]
  ): boolean {
    if (!type || !subtype || !language || !osInfos) return false;

    const osKey = `${type}_${subtype}_${language}`.toLowerCase();
    const osInfo = osInfos.find((os) => {
      const nameWithoutVersion = os.name.toLowerCase().replace(/_\d+$/, '');
      const oldNameWithoutVersion = os.oldName.toLowerCase().replace(/_\d+$/, '');
      return nameWithoutVersion === osKey || oldNameWithoutVersion === osKey;
    });

    return osInfo ? osInfo.dependenciesLWC.length > 0 : false;
  }

  /**
   * Get custom LWC list for a FlexCard
   *
   * @param fcName FlexCard name
   * @param flexCardInfos Array of FlexCard assessment information
   * @returns Array of custom LWC names (empty if none found)
   */
  public getCustomLWCs(fcName: string, flexCardInfos: FlexCardAssessmentInfo[]): string[] {
    if (!fcName || !flexCardInfos) return [];

    const fcInfo = flexCardInfos.find(
      (fc) => fc.name.toLowerCase() === fcName.toLowerCase() || fc.oldName.toLowerCase() === fcName.toLowerCase()
    );

    return fcInfo ? [...fcInfo.dependenciesLWC] : [];
  }

  /**
   * Get custom LWC list for an OmniScript
   *
   * @param type OmniScript Type
   * @param subtype OmniScript SubType
   * @param language OmniScript Language
   * @param osInfos Array of OmniScript assessment information
   * @returns Array of custom LWC names (empty if none found)
   */
  public getOSCustomLWCs(type: string, subtype: string, language: string, osInfos: OSAssessmentInfo[]): string[] {
    if (!type || !subtype || !language || !osInfos) return [];

    const osKey = `${type}_${subtype}_${language}`.toLowerCase();
    const osInfo = osInfos.find((os) => {
      const nameWithoutVersion = os.name.toLowerCase().replace(/_\d+$/, '');
      const oldNameWithoutVersion = os.oldName.toLowerCase().replace(/_\d+$/, '');
      return nameWithoutVersion === osKey || oldNameWithoutVersion === osKey;
    });

    if (!osInfo) return [];

    // Extract just the LWC names from nameLocation array
    return osInfo.dependenciesLWC.map((dep) => dep.name);
  }

  /**
   * Format warning message for a page containing components with custom LWCs
   *
   * @param componentsWithLWCs List of components that have custom LWC dependencies
   * @param mode 'assess' or 'migrate'
   * @returns Formatted warning message
   */
  public formatPageWarning(componentsWithLWCs: ComponentWithLWC[], mode: 'assess' | 'migrate'): string {
    if (componentsWithLWCs.length === 0) return '';

    const componentLines = componentsWithLWCs.map((comp) => {
      const lwcList = comp.customLWCs.join(', ');

      if (mode === 'assess') {
        return `  • ${comp.type} '${comp.name}' with custom LWC: ${lwcList}`;
      } else {
        // Migration mode: show wrapper conversion
        const wrapperType = comp.type === 'FlexCard' ? 'flexcard' : 'omniscript';
        return `  • ${comp.type} '${comp.name}' → runtime_omnistudio:${wrapperType} (resolved: ${lwcList})`;
      }
    });

    if (mode === 'assess') {
      return (
        '⚠️ This page contains FlexCard/OmniScript components with custom LWC dependencies:\n\n' +
        componentLines.join('\n') +
        '\n\nTo avoid cross-namespace reference errors after migration, replace these components with vlocityLWCOmniWrapper in Lightning App Builder before running OMA migrate. OMA will then automatically convert the wrapper to runtime_omnistudio format.'
      );
    } else {
      return (
        '✓ Successfully applied wrapper conversion for components with custom LWCs:\n\n' +
        componentLines.join('\n') +
        '\n\nCross-namespace references have been resolved. No manual intervention required.'
      );
    }
  }
}
