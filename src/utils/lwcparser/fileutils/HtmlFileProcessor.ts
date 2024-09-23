/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { FileProcessor } from '../../../utils';
import { File } from '../../file/fileutil';
import { Logger } from '../../../utils/logger';
import { HTMLParser } from '../../lwcparser/htmlparser/HTMLParser';
import { FileConstant } from '../fileutils/FileConstant';
import { FileDiffUtil } from './FileDiffUtil';

export class HtmlFileProcessor implements FileProcessor {
  process(file: File, type: string, namespace: string): string {
    Logger.logger.info(file.location + ' HTML file is Processing');
    // Logic to process HTML file
    return this.processHtmlFile(file, type, namespace);
  }

  processHtmlFile(file: File, type: string, namespace: string): string {
    const filePath: string = file.location;
    const parse = new HTMLParser(filePath);
    const fileDiffUtil = new FileDiffUtil();
    const fileContent: Map<string, string> = parse.replaceTags(namespace);
    if (fileContent) {
      if (type != null && type === 'migration') {
        parse.saveToFile(filePath);
      } else {
        const diff = fileDiffUtil.getFileDiff(
          fileContent.get(FileConstant.BASE_CONTENT),
          fileContent.get(FileConstant.MODIFIED_CONTENT)
        );
        return diff;
      }
    }
  }
}
