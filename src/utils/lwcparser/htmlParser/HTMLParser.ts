/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable no-console */
import * as fs from 'fs';
import * as cheerio from 'cheerio';

class HTMLParser {
  private $: cheerio.CheerioAPI;

  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  constructor(htmlFilePath: string) {
    // Load the HTML file and initialize cheerio
    const html = this.loadHTMLFromFile(htmlFilePath);
    this.$ = cheerio.load(html);
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
  // eslint-disable-next-line @typescript-eslint/member-ordering
  public replaceCustomTag(oldTag: string, newTag: string): void {
    this.$(oldTag).each((_, element) => {
      const newElement = this.$(`<${newTag}></${newTag}>`).html(this.$(element).html());
      this.$(element).replaceWith(newElement);
    });
  }

  // Method to save modified HTML back to a file
  // eslint-disable-next-line @typescript-eslint/member-ordering
  public saveToFile(outputFilePath: string): void {
    try {
      const modifiedHtml = this.$.html();
      fs.writeFileSync(outputFilePath, modifiedHtml);
      console.log(`Modified HTML saved to ${outputFilePath}`);
    } catch (error) {
      console.error(`Error writing file to disk: ${error}`);
      throw error;
    }
  }

  // Optional: Method to get the modified HTML as a string
  public getModifiedHTML(): string {
    return this.$.html();
  }
}

export default HTMLParser;
