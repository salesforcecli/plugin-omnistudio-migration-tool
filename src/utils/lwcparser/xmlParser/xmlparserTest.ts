import { XmlParser } from './XmlParser';
const filePath = '/Users/spachbhai/os-migration/plugin-omnistudio-migration-tool/src/utils/lwcparser/input/test.xml';

const parser = new XmlParser(filePath);
parser.removeNode('runtimeNamespace');
// eslint-disable-next-line no-console
console.log(parser.getXmlString());
