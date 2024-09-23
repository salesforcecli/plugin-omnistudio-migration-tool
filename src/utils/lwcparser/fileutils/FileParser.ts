export interface FileParser {
  parse(filePath: string, namespace: string): Map<string, string>;
  saveToFile(filePath: string, content: string | undefined): void;
}
