/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Logger } from '../logger';

export class LwcPackageUtilityRegistry {
  private static instance: LwcPackageUtilityRegistry;

  // Sourced from github.com/sf-industries/via_ins@master:lwcprojects/base.
  private static readonly SEED_UTILITY_COMPONENTS: readonly string[] = [
    'insAccordion',
    'insAccordionSection',
    'insAttribute',
    'insAttributeCategory',
    'insAttributeCategoryList',
    'insChart',
    'insConfirmModal',
    'insCoverage',
    'insCoverageList',
    'insCoverageSummary',
    'insDataTableActionCell',
    'insDataTableEditCell',
    'insDeleteModal',
    'insField',
    'insFileUpload',
    'insLabels',
    'insProductIcon',
    'insProductInstance',
    'insProductMatrix',
    'insProductMatrixRow',
    'insProductSummary',
    'insRecordEditor',
    'insRulesDebugger',
    'insUtility',
  ];

  private utilityComponents: Set<string> = new Set();
  private initialized = false;

  public static getInstance(): LwcPackageUtilityRegistry {
    if (!LwcPackageUtilityRegistry.instance) {
      LwcPackageUtilityRegistry.instance = new LwcPackageUtilityRegistry();
    }
    return LwcPackageUtilityRegistry.instance;
  }

  private static kebabToCamel(value: string): string {
    return value.replace(/-([a-z0-9])/gi, (_, ch: string) => ch.toUpperCase());
  }

  public initialize(): void {
    if (this.initialized) return;

    for (const name of LwcPackageUtilityRegistry.SEED_UTILITY_COMPONENTS) {
      this.utilityComponents.add(name.toLowerCase());
    }

    Logger.logVerbose(`LwcPackageUtilityRegistry: Loaded ${this.utilityComponents.size} utility components`);

    this.initialized = true;
  }

  public hasUtilityComponent(componentName: string): boolean {
    if (!componentName) return false;
    return this.utilityComponents.has(componentName.toLowerCase());
  }

  public hasUtilityComponentByTag(tagSuffix: string): boolean {
    if (!tagSuffix) return false;
    return this.hasUtilityComponent(LwcPackageUtilityRegistry.kebabToCamel(tagSuffix));
  }

  public clear(): void {
    this.utilityComponents.clear();
    this.initialized = false;
  }
}
