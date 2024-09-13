/* eslint-disable @typescript-eslint/no-unsafe-call */
import { expect } from 'chai';
import { XmlParser } from '../../../../src/utils/lwcparser/xmlParser/XmlParser';

describe('XmlParser', () => {
  const filePath = 'src/utils/lwcparser/input/test.xml';

  let xmlParser: XmlParser;

  beforeEach(() => {
    xmlParser = new XmlParser(filePath);
  });

  it('should parse XML string into a Document object', () => {
    const serializedXml = xmlParser.getXmlString();
    expect(serializedXml).contains('<LightningComponentBundle');
    expect(serializedXml).contains('<isExposed>');
  });

  it('should remove the runtimeNamespace element correctly', () => {
    xmlParser.removeNode('runtimeNamespace');
    const updatedXml = xmlParser.getXmlString();

    expect(updatedXml).not.contains('<runtimeNamespace>');
  });
});
