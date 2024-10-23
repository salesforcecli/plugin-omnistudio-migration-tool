import { File } from '../utils/file/fileutil';

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

export interface LWCAssessmentInfo {
  name: string;
  changeInfos: FileChangeInfo[];
  errors: string[];
}

export interface OSAssessmentInfo {
  name: string;
  id: string;
  dependenciesIP: AnyJson[];
  missingIP: AnyJson[];
  dependenciesDR: AnyJson[];
  missingDR: AnyJson[];
  dependenciesOS: AnyJson[];
  missingOS: AnyJson[];
  dependenciesRemoteAction: AnyJson[];
  //missingRemoteAction: AnyJson[];
  infos: string[];
  warnings: string[];
  errors: string[];
  path: string;
}

export interface IPAssessmentInfo {
  name: string;
  id: string;
  dependenciesIP: AnyJson[];
  dependenciesDR: AnyJson[];
  dependenciesOS: AnyJson[];
  dependenciesRemoteAction: AnyJson[];
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
  omniAssessmentInfo: OmniAssessmentInfo; // Corrected to an array
  flexCardAssessmentInfos: FlexCardAssessmentInfo[];
  dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[];
}

export interface FlexCardAssessmentInfo {
  name: string;
  id: string;
  dependenciesIP: AnyJson[];
  dependenciesDR: AnyJson[];
  dependenciesOS: AnyJson[];
  infos: string[];
  warnings: string[];
}

export interface DataRaptorAssessmentInfo {
  name: string;
  customFunction: string;
  id: string;
  infos: string[];
  warnings: string[];
}

export interface OmniAssessmentInfo {
  osAssessmentInfos: OSAssessmentInfo[];
  ipAssessmentInfos: IPAssessmentInfo[];
}

export interface LWCAssessmentInfo {
  name: string;
  changeInfos: FileChangeInfo[];
  errors: string[];
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

export interface FileProcessor {
  process(file: File, type: string, namespace: string): string;
}
