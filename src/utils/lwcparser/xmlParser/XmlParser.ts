/* eslint-disable @typescript-eslint/no-inferrable-types */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { DOMParser, XMLSerializer } from 'xmldom';

export class XmlParser {
  private xmlDoc: Document | null = null;

  constructor(private xmlString: string) {
    this.parseXml();
  }

  private parseXml(): void {
    const parser = new DOMParser();
    this.xmlDoc = parser.parseFromString(this.xmlString, 'text/xml');
  }

  public removeNode(tagName: string, index: number = 0): void {
    if (!this.xmlDoc) {
      throw new Error('XML document has not been parsed.');
    }

    const nodes = this.xmlDoc.getElementsByTagName(tagName);

    if (nodes.length > index) {
      const nodeToRemove = nodes[index];
      nodeToRemove.parentNode?.removeChild(nodeToRemove);
    } else {
      throw new Error(`No node found with tag name "${tagName}" at index ${index}.`);
    }
  }

  public getXmlString(): string {
    if (!this.xmlDoc) {
      throw new Error('XML document has not been parsed.');
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(this.xmlDoc);
  }
}
