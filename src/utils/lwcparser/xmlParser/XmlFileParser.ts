/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { FileParser } from '../../../utils';
import { XmlParser } from '../xmlParser/XmlParser';

export class XmlFileParser implements FileParser {
  parse(filePath: string, namespace: string): Map<string, string> {
    const xmlParser = new XmlParser(filePath);
    return xmlParser.removeNode(namespace);
  }

  // saveToFile(filePath: string, content: string | undefined): void {
  //   const xmlParser = new XmlParser(filePath);
  //   xmlParser.saveToFile(filePath, content);
  // }
}
