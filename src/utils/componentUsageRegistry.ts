/*
 * Copyright (c) 2025, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Represents a location where a FlexCard or OmniScript is being used
 */
export interface ComponentUsageLocation {
  componentType: 'FlexiPage' | 'ExperienceSite' | 'LWC';
  componentName: string; // Name of the container (e.g., "Account_Record_Page")
  filePath: string; // Full file path
  subLocation?: string; // For Experience Sites: "page 'Home'"
}

/**
 * Singleton registry to track where FlexCards and OmniScripts are being used.
 * This enables enriching cross-namespace warnings with usage location context.
 *
 * Usage flow:
 * 1. Clear registry at start of assessment/migration
 * 2. Related object scanners (FlexiPage, ExperienceSite, LWC) record usage via recordFlexCardUsage/recordOmniScriptUsage
 * 3. Warning generators lookup usage via getFlexCardUsage/getOmniScriptUsage
 * 4. Format usage locations with formatUsageLocations()
 */
export class ComponentUsageRegistry {
  private static instance: ComponentUsageRegistry;

  // Maps: lowercase component name → usage locations
  private flexCardUsages: Map<string, ComponentUsageLocation[]>;
  private omniScriptUsages: Map<string, ComponentUsageLocation[]>;

  private constructor() {
    this.flexCardUsages = new Map<string, ComponentUsageLocation[]>();
    this.omniScriptUsages = new Map<string, ComponentUsageLocation[]>();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): ComponentUsageRegistry {
    if (!ComponentUsageRegistry.instance) {
      ComponentUsageRegistry.instance = new ComponentUsageRegistry();
    }
    return ComponentUsageRegistry.instance;
  }

  /**
   * Record a FlexCard usage location
   *
   * @param fcName FlexCard name (case-insensitive)
   * @param location Where the FlexCard is used
   */
  public recordFlexCardUsage(fcName: string, location: ComponentUsageLocation): void {
    if (!fcName) return;

    const key = fcName.toLowerCase();
    if (!this.flexCardUsages.has(key)) {
      this.flexCardUsages.set(key, []);
    }

    const locations = this.flexCardUsages.get(key) ?? [];

    // De-duplicate: check if this exact location already exists
    const isDuplicate = locations.some(
      (loc) =>
        loc.componentType === location.componentType &&
        loc.componentName === location.componentName &&
        loc.filePath === location.filePath &&
        loc.subLocation === location.subLocation
    );

    if (!isDuplicate) {
      locations.push(location);
    }
  }

  /**
   * Record an OmniScript usage location
   *
   * @param osKey OmniScript key (format: "OmniScript:Type:SubType:Language", case-insensitive)
   * @param location Where the OmniScript is used
   */
  public recordOmniScriptUsage(osKey: string, location: ComponentUsageLocation): void {
    if (!osKey) return;

    const key = osKey.toLowerCase();
    if (!this.omniScriptUsages.has(key)) {
      this.omniScriptUsages.set(key, []);
    }

    const locations = this.omniScriptUsages.get(key) ?? [];

    // De-duplicate
    const isDuplicate = locations.some(
      (loc) =>
        loc.componentType === location.componentType &&
        loc.componentName === location.componentName &&
        loc.filePath === location.filePath &&
        loc.subLocation === location.subLocation
    );

    if (!isDuplicate) {
      locations.push(location);
    }
  }

  /**
   * Get all usage locations for a FlexCard
   *
   * @param fcName FlexCard name (case-insensitive)
   * @returns Array of usage locations (empty if none found)
   */
  public getFlexCardUsage(fcName: string): ComponentUsageLocation[] {
    if (!fcName) return [];
    const key = fcName.toLowerCase();
    return this.flexCardUsages.get(key) || [];
  }

  /**
   * Get all usage locations for an OmniScript
   *
   * @param type OmniScript Type
   * @param subtype OmniScript SubType
   * @param language OmniScript Language
   * @returns Array of usage locations (empty if none found)
   */
  public getOmniScriptUsage(type: string, subtype: string, language: string): ComponentUsageLocation[] {
    if (!type || !subtype || !language) return [];
    const key = `omniscript:${type}:${subtype}:${language}`.toLowerCase();
    return this.omniScriptUsages.get(key) || [];
  }

  /**
   * Clear all usage data (call at start of assessment/migration)
   */
  public clear(): void {
    this.flexCardUsages.clear();
    this.omniScriptUsages.clear();
  }

  /**
   * Format usage locations for appending to warning messages
   *
   * @param locations Array of usage locations
   * @returns Formatted string like "Used in: FlexiPage 'X' (path), ExperienceSite 'Y' page 'Z' (path)"
   */
  public formatUsageLocations(locations: ComponentUsageLocation[]): string {
    if (locations.length === 0) return '';

    const formatted = locations.map((loc) => {
      let result = `${loc.componentType} '${loc.componentName}'`;
      if (loc.subLocation) {
        result += ` ${loc.subLocation}`;
      }
      result += ` (${loc.filePath})`;
      return result;
    });

    return `Used in: ${formatted.join(', ')}`;
  }
}
