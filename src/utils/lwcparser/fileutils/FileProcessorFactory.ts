/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { Logger } from '../../../utils/logger';
import { FileProcessor } from '../../../utils/';
import { HtmlFileProcessor } from '../fileutils/HtmlFileProcessor';
import { JavascriptFileProcessor } from '../fileutils/JavascriptFileProcessor';
import { XmlFileProcessor } from '../fileutils/XmlFileProcessor';

export class FileProcessorFactory {
  static getFileProcessor(extension: string): FileProcessor | null {
    switch (extension) {
      case '.js':
        return new JavascriptFileProcessor();
      case '.html':
        return new HtmlFileProcessor();
      case '.xml':
        return new XmlFileProcessor();
      default:
        Logger.logger.error('No processor found for file extension: ' + extension);
        return null;
    }
  }
}
