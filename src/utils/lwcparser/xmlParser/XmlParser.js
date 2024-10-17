"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XmlParser = void 0;
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
var fs = require("fs");
var xmldom_1 = require("@xmldom/xmldom");
var XmlParser = /** @class */ (function () {
    function XmlParser(filePath) {
        this.filePath = filePath;
        this.xmlDoc = null;
        this.fileContent = fs.readFileSync(this.filePath, 'utf-8');
        this.parseXml(this.fileContent);
    }
    XmlParser.prototype.parseXml = function (fileContent) {
        var parser = new xmldom_1.DOMParser();
        try {
            this.xmlDoc = parser.parseFromString(fileContent, 'text/xml');
        }
        catch (error) {
            throw new Error('Error in xml parsing');
        }
    };
    XmlParser.prototype.removeNode = function (tagName, index) {
        var _a;
        if (index === void 0) { index = 0; }
        if (!this.xmlDoc) {
            throw new Error('XML document has not been parsed.');
        }
        var nodes = this.xmlDoc.getElementsByTagName(tagName);
        if (nodes.length > index) {
            var nodeToRemove = nodes[index];
            (_a = nodeToRemove.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(nodeToRemove);
            var serializer = new xmldom_1.XMLSerializer();
            var xmlString = serializer.serializeToString(this.xmlDoc);
            return xmlString;
            // this.printResult(this.filePath, tagName, index);
        }
    };
    XmlParser.prototype.saveToFile = function (outputFilePath, xmlString) {
        try {
            fs.writeFileSync(outputFilePath, xmlString);
            // eslint-disable-next-line no-console
            console.log("Modified HTML saved to ".concat(outputFilePath));
        }
        catch (error) {
            // eslint-disable-next-line no-console, @typescript-eslint/restrict-template-expressions
            console.error("Error writing file to disk: ".concat(error));
            throw error;
        }
    };
    return XmlParser;
}());
exports.XmlParser = XmlParser;
