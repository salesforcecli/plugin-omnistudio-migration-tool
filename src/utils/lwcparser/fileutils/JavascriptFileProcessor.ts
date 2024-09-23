/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { FileProcessor } from '../../../utils';
import { File } from '../../file/fileutil';
import { Logger } from '../../../utils/logger';
import { JavaScriptParser } from '../../lwcparser/jsparser/JavaScriptParser';
import { FileConstant } from '../fileutils/FileConstant';
import { FileDiffUtil } from './FileDiffUtil';

export class JavascriptFileProcessor implements FileProcessor {
  process(file: File, type: string, namespace: string): string {
    Logger.logger.info(file.location + ' Javascript file is Processing');
    // Logic to process JS file
    return this.processJavascriptFile(file, type, namespace);
  }

  processJavascriptFile(file: File, type: string, namespace: string): string {
    const jsParser = new JavaScriptParser();
    const fileDiffUtil = new FileDiffUtil();
    const filePath = file.location;
    const fileContent: Map<string, string> = jsParser.replaceImportSource(filePath, namespace);
    if (fileContent) {
      if (type != null && type === 'migration') {
        jsParser.saveToFile(filePath, fileContent.get(FileConstant.MODIFIED_CONTENT));
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
