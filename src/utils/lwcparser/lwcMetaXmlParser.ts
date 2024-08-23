/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { DOMParser } from 'xmldom';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
const parser = new DOMParser();
const xmlString = `
  <?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata" fqn="omniscript">
    <apiVersion>56.0</apiVersion>
    <isExposed>true</isExposed>
    <runtimeNamespace>omnistudio</runtimeNamespace>
    <masterLabel>OmniExample - Custom Component Action Example</masterLabel>
</LightningComponentBundle>
`;

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const doc = parser.parseFromString(xmlString, 'text/xml');
// @typescript-eslint/no-unsafe-call
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const bundle = doc.getElementsByTagName('LightningComponentBundle');

// eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
console.log(bundle[0].getElementsByTagName('runtimeNamespace')[0].textContent);
