/* eslint-disable @typescript-eslint/no-unsafe-call */
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
import { expect } from '@salesforce/command/lib/test';
import { HTMLParser } from '../../../../src/utils/lwcparser/htmlParser/HTMLParser';

describe('HTMLParser test class', () => {
  const mockFilePath = 'src/utils/lwcparser/input/test.html';
  it('should read file content correctly', () => {
    const htmlParser = new HTMLParser(mockFilePath);
    htmlParser.replaceTags('omnistudio');
    expect(htmlParser.getModifiedHTML()).contains('c-input');
  });
});
