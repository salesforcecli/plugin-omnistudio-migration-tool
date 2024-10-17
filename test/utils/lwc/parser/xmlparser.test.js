"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-unsafe-call */
var chai_1 = require("chai");
var XmlParser_1 = require("../../../../src/utils/lwcparser/xmlParser/XmlParser");
describe('XmlParser', function () {
    var filePath = 'test/utils/lwc/parser/input/test.xml';
    var xmlParser;
    beforeEach(function () {
        xmlParser = new XmlParser_1.XmlParser(filePath);
    });
    it('should parse XML string into a Document object', function () {
        var serializedXml = xmlParser.removeNode('runtimeNamespace');
        (0, chai_1.expect)(serializedXml).contains('<LightningComponentBundle');
        (0, chai_1.expect)(serializedXml).contains('<isExposed>');
    });
    it('should remove the runtimeNamespace element correctly', function () {
        var updatedXml = xmlParser.removeNode('runtimeNamespace');
        (0, chai_1.expect)(updatedXml).not.contains('<runtimeNamespace>');
    });
});
