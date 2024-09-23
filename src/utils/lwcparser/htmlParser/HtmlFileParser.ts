/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { FileParser } from '../../../utils';
import { HTMLParser } from '../htmlparser/HTMLParser';

export class HtmlFileParser implements FileParser {
  parse(filePath: string, namespace: string): Map<string, string> {
    const htmlParser = new HTMLParser(filePath);
    return htmlParser.replaceTags(namespace);
  }

  saveToFile(filePath: string, content: string | undefined): void {
    const htmlParser = new HTMLParser(filePath);
    htmlParser.saveToFile(filePath);
  }
}
