import OmniScriptMappings from '../mappings/OmniScript';
import { OmnistudioOrgDetails } from './orgUtils';

export class DataModelService {
  private readonly orgs: OmnistudioOrgDetails;

  public constructor(orgs: OmnistudioOrgDetails) {
    this.orgs = orgs;
  }

  public checkIfIsStandardDataModel(): boolean {
    return this.orgs.omniStudioOrgPermissionEnabled;
  }

  public checkIfIsCustomDataModel(): boolean {
    return !this.orgs.omniStudioOrgPermissionEnabled;
  }

  public checkIfIsFoundationPackage(): boolean {
    return this.orgs.isFoundationPackage ?? false;
  }

  public checkIfIsOmnistudioMetadataAPIEnabled(): boolean {
    return this.orgs.isOmnistudioMetadataAPIEnabled ?? false;
  }

  public checkIfIsStandardDataModelWithMetadataAPIEnabled(): boolean {
    return this.checkIfIsStandardDataModel() && this.checkIfIsOmnistudioMetadataAPIEnabled();
  }

  public checkIfIsDRVersioningEnabled(): boolean {
    return this.orgs.isDRVersioningEnabled ?? false;
  }
}

let globalDataModelService: DataModelService | null = null;

// Initialize the global instance
export function initializeDataModelService(orgs: OmnistudioOrgDetails): void {
  globalDataModelService = new DataModelService(orgs);
}

// Get the global instance
export function getDataModelService(): DataModelService {
  if (!globalDataModelService) {
    throw new Error('DataModelService not initialized');
  }
  return globalDataModelService;
}

// Convenience function to check if data model is standard
export function isStandardDataModel(): boolean {
  return getDataModelService().checkIfIsStandardDataModel();
}

// Convenience function to check if data model is custom
export function isCustomDataModel(): boolean {
  return getDataModelService().checkIfIsCustomDataModel();
}

export function isFoundationPackage(): boolean {
  return getDataModelService().checkIfIsFoundationPackage();
}

export function isStandardDataModelWithMetadataAPIEnabled(): boolean {
  return getDataModelService().checkIfIsStandardDataModelWithMetadataAPIEnabled();
}

export function isOmnistudioMetadataAPIEnabled(): boolean {
  return getDataModelService().checkIfIsOmnistudioMetadataAPIEnabled();
}

export function isDRVersioningEnabled(): boolean {
  return getDataModelService().checkIfIsDRVersioningEnabled();
}

export function getFieldKeyForOmniscript(namespacePrefix: string, fieldName: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return isStandardDataModel() ? OmniScriptMappings[fieldName] : namespacePrefix + '__' + fieldName;
}
