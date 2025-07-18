import { File } from '../utils/file/fileUtil';

export interface MigratedObject {
  name: string;
  data?: MigratedRecordInfo[];
  errors?: string[];
}

export interface MigratedRecordInfo {
  id: string;
  name: string;
  status: string;
  errors: string[];
  migratedId?: string;
  migratedName?: string;
  warnings: string[];
}

export interface DiffPair {
  old: string | null;
  new: string | null;
}

export interface LWCAssessmentInfo {
  name: string;
  changeInfos: FileChangeInfo[];
  errors: string[];
}

export interface OSAssessmentInfo {
  name: string;
  id: string;
  oldName: string;
  dependenciesIP: nameLocation[];
  missingIP: string[];
  dependenciesDR: nameLocation[];
  missingDR: string[];
  migrationStatus: string;
  dependenciesOS: nameLocation[];
  missingOS: string[];
  dependenciesRemoteAction: nameLocation[];
  dependenciesLWC: nameLocation[];
  type: string;
  infos: string[];
  warnings: string[];
  errors: string[];
}

export interface IPAssessmentInfo {
  name: string;
  id: string;
  oldName: string;
  dependenciesIP: nameLocation[];
  dependenciesDR: nameLocation[];
  dependenciesOS: nameLocation[];
  dependenciesRemoteAction: nameLocation[];
  infos: string[];
  warnings: string[];
  errors: string[];
  path: string;
}
export interface FileChangeInfo {
  path: string;
  name: string;
  diff: string;
}
export interface ApexAssessmentInfo extends FileChangeInfo {
  warnings: string[];
  infos: string[];
}

export interface FileParser {
  parse(filePath: string, namespace: string): Map<string, string>;
  saveToFile(filePath: string, content: string | undefined): void;
}

export interface FileProcessor {
  process(file: File, type: string, namespace: string): void;
}

export interface AssessmentInfo {
  apexAssessmentInfos: ApexAssessmentInfo[];
  lwcAssessmentInfos: LWCAssessmentInfo[];
  omniAssessmentInfo: OmniAssessmentInfo; // Corrected to an array
  flexCardAssessmentInfos: FlexCardAssessmentInfo[];
  dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[];
  globalAutoNumberAssessmentInfos: GlobalAutoNumberAssessmentInfo[];
}

export interface RelatedObjectAssesmentInfo {
  apexAssessmentInfos: ApexAssessmentInfo[];
  lwcAssessmentInfos: LWCAssessmentInfo[];
  experienceSiteAssessmentInfos: ExperienceSiteAssessmentInfo[];
}
export interface FlexCardAssessmentInfo {
  name: string;
  id: string;
  dependenciesIP: string[];
  dependenciesDR: string[];
  dependenciesOS: string[];
  dependenciesFC: string[];
  dependenciesLWC: string[];
  dependenciesApexRemoteAction: string[];
  infos: string[];
  warnings: string[];
}

export interface DataRaptorAssessmentInfo {
  oldName: string;
  name: string;
  id: string;
  formulaChanges: oldNew[];
  type: string;
  infos: string[];
  warnings: string[];
  apexDependencies: string[];
}

export interface GlobalAutoNumberAssessmentInfo {
  oldName: string;
  name: string;
  id: string;
  infos: string[];
  warnings: string[];
  errors: string[];
}

export interface OmniAssessmentInfo {
  osAssessmentInfos: OSAssessmentInfo[];
  ipAssessmentInfos: IPAssessmentInfo[];
}

export interface FileChangeInfo {
  path: string;
  name: string;
  diff: string;
}
export interface ApexAssessmentInfo extends FileChangeInfo {
  warnings: string[];
  infos: string[];
}

export interface FileParser {
  parse(filePath: string, namespace: string): Map<string, string>;
  // saveToFile(filePath: string, content: string | undefined): void;
}

export interface ExperienceSiteAssessmentInfo extends FileChangeInfo {
  warnings: string[];
  infos: string[];
  hasOmnistudioContent: boolean;
}

export interface FileProcessor {
  process(file: File, type: string, namespace: string): string;
}

export interface nameLocation {
  name: string;
  location: string;
}

export interface oldNew {
  old: string;
  new: string;
}

export interface OmniStudioSettingsMetadata {
  fullName: string;
  disableRollbackFlagsPref: boolean;
}

export interface MetadataInfo {
  fullName: string;
  disableRollbackFlagsPref?: boolean;
  enableOmniGlobalAutoNumberPref?: string;
  enableOaEventInternalWrites?: string;
  enableOaEventNotifications?: string;
  enableOaForCore?: string;
  enableOmniStudioContentTest?: string;
  enableOmniStudioDrVersion?: string;
  enableOmniStudioMetadata?: string;
  enableStandardOmniStudioRuntime?: string;
}

export interface ExperienceBundleSettingsMetadata {
  fullName: string;
  enableExperienceBundleMetadata: boolean;
}

export interface ExperienceBundleSettingsReadMetadata {
  fullName: string;
  enableExperienceBundleMetadata: string;
}

export interface QueryResult {
  DeveloperName: string;
  Value: string;
  totalSize: number;
  done: boolean;
  records: Array<{
    attributes: {
      type: string;
      url: string;
    };
    DeveloperName: string;
    Value: string;
  }>;
}
