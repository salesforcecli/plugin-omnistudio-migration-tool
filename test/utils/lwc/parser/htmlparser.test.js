"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-unsafe-call */
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
var test_1 = require("@salesforce/command/lib/test");
var HTMLParser_1 = require("../../../../src/utils/lwcparser/htmlParser/HTMLParser");
describe('HTMLParser test class', function () {
    var mockFilePath = 'test/utils/lwc/parser/input/test.html';
    it('should read file content correctly', function () {
        var htmlParser = new HTMLParser_1.HTMLParser(mockFilePath);
        htmlParser.replaceTags('omnistudio');
        (0, test_1.expect)(htmlParser.getModifiedHTML()).contains('c-input');
    });
});
