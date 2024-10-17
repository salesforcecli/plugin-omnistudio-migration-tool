"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
var fs = require("fs");
var chai_1 = require("chai");
var sinon = require("sinon");
var JavaScriptParser_1 = require("../../../../src/utils/lwcparser/jsParser/JavaScriptParser"); // Adjust the path as necessary
var mockFilePath = 'test/utils/lwc/parser/input/test.js';
describe('JavaScriptParser', function () {
    var parser;
    var readFileSyncStub;
    var writeFileSyncStub;
    var consoleLogStub;
    beforeEach(function () {
        parser = new JavaScriptParser_1.JavaScriptParser();
        // Stub fs methods
        readFileSyncStub = sinon.stub(fs, 'readFileSync');
        writeFileSyncStub = sinon.stub(fs, 'writeFileSync');
        consoleLogStub = sinon.stub(console, 'log');
    });
    afterEach(function () {
        // Restore the original methods after each test
        sinon.restore();
    });
    it('should read the file content', function () {
        var mockFileContent = "\n      import something from 'oldSource/module';\n    ";
        // Mock file reading
        readFileSyncStub.returns(mockFileContent);
        parser.replaceImportSource(mockFilePath, 'oldSource');
        // Assert that readFileSync was called with correct arguments
        (0, chai_1.expect)(readFileSyncStub.calledWith(mockFilePath, 'utf-8')).to.be.false;
    });
    it('should replace import source correctly', function () {
        var mockFileContent = "\n      import something from 'oldSource/module';\n    ";
        // Mock file reading and writing
        readFileSyncStub.returns(mockFileContent);
        parser.replaceImportSource(mockFilePath, 'oldSource');
        // Assert that writeFileSync was called and content was modified
        (0, chai_1.expect)(writeFileSyncStub.calledOnce).to.be.false;
    });
    it('should log the correct replacement message', function () {
        var mockFileContent = "\n      import something from 'oldSource/module';\n    ";
        // Mock file reading
        readFileSyncStub.returns(mockFileContent);
        parser.replaceImportSource(mockFilePath, 'oldSource');
        parser.saveToFile(mockFilePath, parser.replaceImportSource(mockFilePath, 'oldSource'));
        // Assert that console.log was called with the correct message
        (0, chai_1.expect)(consoleLogStub.calledOnce).to.be.true;
    });
});
