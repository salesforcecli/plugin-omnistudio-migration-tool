import { File } from '../../file/fileutil';

export interface FileProcessor {
  process(file: File, type: string, namespace: string): void;
}
