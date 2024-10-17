/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import * as fs from 'fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export class XmlParser {
  private xmlDoc: Document | null = null;
  private fileContent: string;

  constructor(private filePath: string) {
    this.fileContent = fs.readFileSync(this.filePath, 'utf-8');
    this.parseXml(this.fileContent);
  }

  private parseXml(fileContent): void {
    const parser = new DOMParser();
    try {
      this.xmlDoc = parser.parseFromString(fileContent, 'text/xml');
    } catch (error) {
      throw new Error('Error in xml parsing');
    }
  }

  public removeNode(tagName: string, index = 0): string {
    if (!this.xmlDoc) {
      throw new Error('XML document has not been parsed.');
    }
    const nodes = this.xmlDoc.getElementsByTagName(tagName);

    if (nodes.length > index) {
      const nodeToRemove = nodes[index];
      nodeToRemove.parentNode?.removeChild(nodeToRemove);

      const serializer = new XMLSerializer();
      const xmlString: string = serializer.serializeToString(this.xmlDoc);
      return xmlString;
      // this.printResult(this.filePath, tagName, index);
    }
  }

  public saveToFile(outputFilePath: string, xmlString: string): void {
    try {
      fs.writeFileSync(outputFilePath, xmlString);
      // eslint-disable-next-line no-console
      console.log(`Modified HTML saved to ${outputFilePath}`);
    } catch (error) {
      // eslint-disable-next-line no-console, @typescript-eslint/restrict-template-expressions
      console.error(`Error writing file to disk: ${error}`);
      throw error;
    }
  }

  // protected printResult(fileName: string, xmlTag: string, lineNumber: number): void {
  //   console.log('FileName :' + fileName);
  //   console.log('Tag to remove :' + xmlTag);
  //   console.log('Line Number :', lineNumber);
  // }
}
