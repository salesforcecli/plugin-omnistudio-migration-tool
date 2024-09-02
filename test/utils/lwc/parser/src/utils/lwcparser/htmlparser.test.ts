import { expect } from '@salesforce/command/lib/test';
import HTMLParser from '../../../../../../../src/utils/lwcparser/htmlparser/HTMLParser'; // Adjust the path as needed

describe('HTMLParser test class', () => {
  const mockFilePath = 'src/utils/lwcparser/input/test.html';
  it('should read file content correctly', () => {
    const htmlParser = new HTMLParser(mockFilePath);
    // parser.getTagLocation('omnistudio-input');
    htmlParser.replaceCustomTag('omnistudio-input', 'c-input');
    expect(htmlParser.getModifiedHTML()).contains('c-input');
  });
});
