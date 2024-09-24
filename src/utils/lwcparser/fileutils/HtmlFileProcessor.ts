/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { FileProcessor } from '../../../utils';
import { File, fileutil } from '../../file/fileutil';
import { HTMLParser } from '../../lwcparser/htmlParser/HTMLParser';
import { FileConstant } from '../fileutils/FileConstant';
import { FileDiffUtil } from './FileDiffUtil';

export class HtmlFileProcessor implements FileProcessor {
  process(file: File, type: string, namespace: string): string {
    return this.processHtmlFile(file, type, namespace);
  }

  processHtmlFile(file: File, type: string, namespace: string): string {
    const filePath: string = file.location;
    const parse = new HTMLParser(filePath);
    const fileDiffUtil = new FileDiffUtil();
    const fileContent: Map<string, string> = parse.replaceTags(namespace);
    if (fileContent) {
      if (type != null && type === 'migration') {
        fileutil.saveToFile(filePath, fileContent.get(FileConstant.MODIFIED_CONTENT));
      } else {
        const diff = fileDiffUtil.getFileDiff(
          file.name + file.ext,
          fileContent.get(FileConstant.BASE_CONTENT),
          fileContent.get(FileConstant.MODIFIED_CONTENT)
        );
        return diff;
      }
    }
  }
}
