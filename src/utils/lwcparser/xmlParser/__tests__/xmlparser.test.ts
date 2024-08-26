/* eslint-disable @typescript-eslint/no-unsafe-call */
import { expect } from 'chai';
import { XmlParser } from '../XmlParser'; // Adjust the path accordingly

describe('XmlParser', () => {
  const xmlString = `
  <?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata" fqn="omniscript">
    <apiVersion>56.0</apiVersion>
    <isExposed>true</isExposed>
    <runtimeNamespace>omnistudio</runtimeNamespace>
    <masterLabel>OmniExample - Custom Component Action Example</masterLabel>
</LightningComponentBundle>
  `;

  let xmlParser: XmlParser;

  beforeEach(() => {
    xmlParser = new XmlParser(xmlString);
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

  it('should throw an error when trying to remove a non-existent node', () => {
    expect(() => xmlParser.removeNode('magazine')).to.Throw('No node found with tag name "magazine" at index 0.');
  });

  it('should throw an error if trying to get XML string before parsing', () => {
    // Mock a new XmlParser instance with an empty string
    const parser = new XmlParser('');
    expect(() => parser.getXmlString()).to.Throw('XML document has not been parsed.');
  });

  it('should throw an error when trying to remove a node at an invalid index', () => {
    expect(() => xmlParser.removeNode('runtimeNamespace', 10)).to.Throw(
      'No node found with tag name "runtimeNamespace" at index 10.'
    );
  });
});
