/* eslint-disable no-console */
import JavaScriptParser from '../../../../../src/utils/lwcparser/jsParser/JavaScriptParser'; // Adjust the path as needed
// eslint-disable-next-line import/order
import { expect } from 'chai';

describe('JavaScriptParser file', () => {
  const mockFilePath = 'src/utils/lwcparser/input/test.js';

  it('should parse file content to AST correctly', () => {
    const jsParser = new JavaScriptParser(mockFilePath);
    jsParser.parseFile();
    // eslint-disable-next-line no-unused-expressions
    expect(jsParser['ast']).not.null;
    expect(jsParser['ast']?.type).to.be.equal('File'); // Check if the AST root node is of type 'File'
  });

  it('should traverse AST and find import declarations', () => {
    const jsParser = new JavaScriptParser(mockFilePath);
    jsParser.parseFile();
    expect(jsParser.traverseAST()[0]).to.have.to.be.contains('lwc');
  });

  it('should throw an error if traverseAST is called before parseFile', () => {
    const jsParser = new JavaScriptParser(mockFilePath);
    expect(() => {
      jsParser.traverseAST();
    }).to.Throw('AST has not been generated. Call parseFile() first.');
  });
});
