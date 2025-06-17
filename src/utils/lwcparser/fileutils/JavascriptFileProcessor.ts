/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { FileProcessor } from '../../../utils';
import { File, FileUtil } from '../../file/fileUtil';
import { JavaScriptParser } from '../../lwcparser/jsParser/JavaScriptParser';
import { FileConstant } from '../fileutils/FileConstant';
import { FileDiffUtil } from './FileDiffUtil';

export class JavascriptFileProcessor implements FileProcessor {
  process(file: File, type: string, namespace: string): string {
    return this.processJavascriptFile(file, type, namespace);
  }

  processJavascriptFile(file: File, type: string, namespace: string): string {
    const jsParser = new JavaScriptParser();
    const fileDiffUtil = new FileDiffUtil();
    const filePath = file.location;
    const fileContent: Map<string, string> = jsParser.replaceImportSource(filePath, namespace);
    if (fileContent) {
      const diff = fileDiffUtil.getFileDiff(
        file.name + file.ext,
        fileContent.get(FileConstant.BASE_CONTENT),
        fileContent.get(FileConstant.MODIFIED_CONTENT)
      );
      if (type != null && type === 'migration') {
        FileUtil.saveToFile(filePath, fileContent.get(FileConstant.MODIFIED_CONTENT));
      }
      return JSON.stringify(diff);
    }
  }
}
