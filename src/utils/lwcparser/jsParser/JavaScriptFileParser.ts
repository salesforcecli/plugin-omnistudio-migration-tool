/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { FileParser } from '../../../utils';
import { JavaScriptParser } from '../jsParser/JavaScriptParser';

export class JavaScriptFileParser implements FileParser {
  parse(filePath: string, namespace: string): Map<string, string> {
    const jsParser = new JavaScriptParser();
    return jsParser.replaceImportSource(filePath, namespace);
  }
}
