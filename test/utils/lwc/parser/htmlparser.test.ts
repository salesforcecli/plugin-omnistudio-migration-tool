/* eslint-disable @typescript-eslint/no-unsafe-call */
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
import { expect } from '@salesforce/command/lib/test';
import { HTMLParser } from '../../../../src/utils/lwcparser/htmlParser/HTMLParser';
import { FileDiffUtil } from '../../../../src/utils/lwcparser/fileutils/FileDiffUtil';

describe('HTMLParser test class', () => {
  const mockFilePath = 'test/utils/lwc/parser/input/test.html';
  it('should read file content correctly', () => {
    const htmlParser = new HTMLParser(mockFilePath);
    const html: Map<string, string> = htmlParser.replaceTags('omnistudio');
    new FileDiffUtil().getFileDiff(html.get('original'), html.get('modified'));
    htmlParser.saveToFile('test/utils/lwc/parser/output/test.html');
    expect(htmlParser.getModifiedHTML()).contains('c-input');
  });
});
