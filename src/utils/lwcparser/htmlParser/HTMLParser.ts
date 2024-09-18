/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable no-console */
import * as fs from 'fs';
import * as cheerio from 'cheerio';

class HTMLParser {
  private parser: cheerio.CheerioAPI;

  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  constructor(htmlFilePath: string) {
    // Load the HTML file and initialize cheerio
    const html = this.loadHTMLFromFile(htmlFilePath);
    this.parser = cheerio.load(html);
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
  public replaceCustomTag(oldTag: string, newTag: string): void {
    this.parser(oldTag).each((_, element) => {
      const newElement = this.parser(`<${newTag}></${newTag}>`).html(this.parser(element).html());
      this.parser(element).replaceWith(newElement);
    });
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
}

export default HTMLParser;
