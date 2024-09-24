/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { FileProcessor } from '../../../utils';
import { File, fileutil } from '../../file/fileutil';
import { XmlParser } from '../../lwcparser/xmlParser/XmlParser';
import { FileConstant } from '../fileutils/FileConstant';
import { FileDiffUtil } from './FileDiffUtil';

const XML_TAG_TO_REPLACE = 'runtimeNamespace';
export class XmlFileProcessor implements FileProcessor {
  process(file: File, type: string, namespace: string): string {
    return this.processXMLFile(file, type, namespace);
  }

  processXMLFile(file: File, type: string, namespace: string): string {
    const filePath: string = file.location;
    const parser = new XmlParser(filePath);
    const fileDiffUtil = new FileDiffUtil();
    const fileContent: Map<string, string> = parser.removeNode(XML_TAG_TO_REPLACE);
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
