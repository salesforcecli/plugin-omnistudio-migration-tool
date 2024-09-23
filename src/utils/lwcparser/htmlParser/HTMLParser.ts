/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable no-console */
import * as fs from 'fs';
import * as cheerio from 'cheerio';
import { FileConstant } from '../fileutils/FileConstant';

const DEFAULT_NAMESPACE = 'c';
const TAG = 'tag';

// const { window } = new JSDOM();
// const { document } = window;

export class HTMLParser {
  private parser: cheerio.CheerioAPI;
  html: string;
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  constructor(htmlFilePath: string) {
    // Load the HTML file and initialize cheerio
    this.html = this.loadHTMLFromFile(htmlFilePath);
    this.parser = cheerio.load(this.html, { xmlMode: true });
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
    // Load the HTML into cheerio
    const $ = this.parser;
    htmlContentMap.set(FileConstant.BASE_CONTENT, this.html);
    // Find all tags that contain the substring "omnistudio" in their tag name
    $('*').each((i, element) => {
      if (element.type === TAG && element.name && element.name.includes(namespaceTag + '-')) {
        // Create a new tag with the same content and attributes as the old tag
        const newTag = DEFAULT_NAMESPACE + element.name.substring(element.name.indexOf('-'));
        const newElement = $(`<${newTag}>`).html($(element).html());

        // Copy all attributes from the old element to the new one
        Object.keys(element.attribs).forEach((attr) => {
          newElement.attr(attr, $(element).attr(attr));
        });

        // Replace the old element with the new one
        $(element).replaceWith(newElement);
      }
    });
    $.html().replace(/\n\s*/g, '');
    htmlContentMap.set(FileConstant.MODIFIED_CONTENT, $.html());
    this.printDiff();
    return htmlContentMap;
  }

  // Method to save modified HTML back to a file
  public saveToFile(outputFilePath: string): void {
    try {
      const modifiedHtml = this.parser.html();
      fs.writeFileSync(outputFilePath, modifiedHtml);
      console.log(`Modified HTML saved to ${outputFilePath}`);
    } catch (error) {
      console.error(`Error writing file to disk: ${error}`);
      throw error;
    }
  }

  // Optional: Method to get the modified HTML as a string
  public getModifiedHTML(): string {
    return this.parser.html();
  }

  private printDiff(): void {
    // const diff = diffLines(this.html, this.getModifiedHTML(), { ignoreWhitespace: false });
    // const original = diff.map((part) => (!part.added ? part.value : '')).join('');
    // const modified = diff.map((part) => (!part.removed ? part.value : '')).join('');
    // const patch = createPatch('string_diff', original, modified);
    // console.log(patch);
  }
}
