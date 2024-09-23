/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { FileProcessor } from '../../../utils';
import { File } from '../../file/fileutil';
import { Logger } from '../../../utils/logger';
import { XmlParser } from '../../lwcparser/xmlParser/XmlParser';
import { FileConstant } from '../fileutils/FileConstant';
import { FileDiffUtil } from './FileDiffUtil';

export class XmlFileProcessor implements FileProcessor {
  process(file: File, type: string, namespace: string): string {
    Logger.logger.info(file.location + ' XML file is Processing');
    // Logic to process XML file
    return this.processXMLFile(file, type, namespace);
  }

  processXMLFile(file: File, type: string, namespace: string): string {
    const filePath: string = file.location;
    const parser = new XmlParser(filePath);
    const fileDiffUtil = new FileDiffUtil();
    const fileContent: Map<string, string> = parser.removeNode(namespace);
    if (fileContent) {
      if (type != null && type === 'migration') {
        parser.saveToFile(filePath, fileContent.get(FileConstant.MODIFIED_CONTENT));
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
