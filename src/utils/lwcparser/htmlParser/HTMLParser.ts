/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable no-console */
import * as fs from 'fs';
import { FileConstant } from '../fileutils/FileConstant';
import { Logger } from '../../logger';
import { LwcPackageUtilityRegistry } from '../LwcPackageUtilityRegistry';

const DEFAULT_NAMESPACE = 'c';

export class HTMLParser {
  html: string;
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  constructor(htmlFilePath: string) {
    // Load the HTML file and initialize cheerio
    this.html = this.loadHTMLFromFile(htmlFilePath);
  }

  // Method to load HTML from a file
  private loadHTMLFromFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error(`Error reading file from disk: ${error}`);
      throw error;
    }
  }

  // Method to replace custom tags
  public replaceTags(namespaceTag: string): Map<string, string> {
    const htmlContentMap = new Map<string, string>();
    htmlContentMap.set(FileConstant.BASE_CONTENT, this.html);

    // Handle empty namespace - no changes should be made
    if (!namespaceTag || namespaceTag.trim() === '') {
      htmlContentMap.set(FileConstant.MODIFIED_CONTENT, this.html);
      return htmlContentMap;
    }

    // Escape special regex characters in the namespace tag
    const escapedNamespaceTag = namespaceTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const registry = LwcPackageUtilityRegistry.getInstance();
    const skipDecisions = new Map<string, boolean>();
    const shouldSkip = (suffix: string): boolean => {
      let decision = skipDecisions.get(suffix);
      if (decision === undefined) {
        decision = registry.hasUtilityComponentByTag(suffix);
        skipDecisions.set(suffix, decision);
      }
      return decision;
    };

    const tagRegex = new RegExp('(</?)' + escapedNamespaceTag + '-([a-zA-Z0-9-]+)', 'g');

    this.html = this.html.replace(tagRegex, (match: string, opener: string, suffix: string) =>
      shouldSkip(suffix) ? match : opener + DEFAULT_NAMESPACE + '-' + suffix
    );

    htmlContentMap.set(FileConstant.MODIFIED_CONTENT, this.html);
    return htmlContentMap;
  }

  // Method to save modified HTML back to a file
  public saveToFile(outputFilePath: string, modifiedHtml: string): void {
    try {
      fs.writeFileSync(outputFilePath, modifiedHtml);
      Logger.info(`Modified HTML saved to ${outputFilePath}`);
    } catch (error) {
      Logger.error(`Error writing file to disk: ${error}`);
      throw error;
    }
  }

  // Optional: Method to get the modified HTML as a string
  public getModifiedHTML(): string {
    return this.html;
  }
}
