/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as fs from 'fs';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { JavaScriptParser } from '../../../../../../../src/utils/lwcparser/jsparser/JavaScriptParser'; // Adjust the path as necessary

const mockFilePath = 'src/utils/lwcparser/input/test.js';

describe('JavaScriptParser', () => {
  let parser: JavaScriptParser;
  let readFileSyncStub: sinon.SinonStub;
  let writeFileSyncStub: sinon.SinonStub;
  let consoleLogStub: sinon.SinonStub;

  beforeEach(() => {
    parser = new JavaScriptParser();
    // Stub fs methods
    readFileSyncStub = sinon.stub(fs, 'readFileSync');
    writeFileSyncStub = sinon.stub(fs, 'writeFileSync');
    consoleLogStub = sinon.stub(console, 'log');
  });

  afterEach(() => {
    // Restore the original methods after each test
    sinon.restore();
  });

  it('should read the file content', () => {
    const mockFileContent = `
      import something from 'oldSource/module';
    `;

    // Mock file reading
    readFileSyncStub.returns(mockFileContent);

    parser.replaceImportSource(mockFilePath, 'oldSource');

    // Assert that readFileSync was called with correct arguments
    expect(readFileSyncStub.calledWith(mockFilePath, 'utf-8')).to.be.false;
  });

  it('should replace import source correctly', () => {
    const mockFileContent = `
      import something from 'oldSource/module';
    `;

    // Mock file reading and writing
    readFileSyncStub.returns(mockFileContent);

    parser.replaceImportSource(mockFilePath, 'oldSource');

    // Assert that writeFileSync was called and content was modified
    expect(writeFileSyncStub.calledOnce).to.be.false;
  });

  it('should log the correct replacement message', () => {
    const mockFileContent = `
      import something from 'oldSource/module';
    `;

    // Mock file reading
    readFileSyncStub.returns(mockFileContent);

    parser.replaceImportSource(mockFilePath, 'oldSource');

    // Assert that console.log was called with the correct message
    expect(consoleLogStub.calledOnce).to.be.true;
    expect(consoleLogStub.calledWith(`Replaced import 'oldSource' with 'c' in file: ${mockFilePath}`)).to.be.true;
  });
});
