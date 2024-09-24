/* eslint-disable @typescript-eslint/no-unsafe-call */
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
import { expect } from 'chai';
import { HTMLParser } from '../../../../src/utils/lwcparser/htmlParser/HTMLParser';
import { FileDiffUtil } from '../../../../src/utils/lwcparser/fileutils/FileDiffUtil';

describe('HTMLParser test class', () => {
  const mockFilePath = 'test/utils/lwc/parser/input/test.html';
  it('should read file content correctly', () => {
    const htmlParser = new HTMLParser(mockFilePath);
    const html: Map<string, string> = htmlParser.replaceTags('omnistudio');
    // eslint-disable-next-line no-console
    console.log(new FileDiffUtil().getFileDiff('file.txt', html.get('original'), html.get('modified')));
    htmlParser.saveToFile('test/utils/lwc/parser/output/test.html', html.get('modified'));
    expect(htmlParser.getModifiedHTML()).contains('c-input');
  });
});
