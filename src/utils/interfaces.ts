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

export interface AssessmentInfo {
  lwcAssessmentInfos: LWCAssessmentInfo[];
  apexAssessmentInfos: ApexAssessmentInfo[];
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
export interface ApexAssessmentInfo {
  name: string;
}

export interface FileParser {
  parse(filePath: string, namespace: string): Map<string, string>;
  saveToFile(filePath: string, content: string | undefined): void;
}

export interface FileProcessor {
  process(file: File, type: string, namespace: string): void;
}
