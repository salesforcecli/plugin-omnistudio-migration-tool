/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'fs';
import { createPatch } from 'diff';
import { Logger } from '../../../utils/logger';

export class FileDiffUtil {
  public getFileDiff(
    filename: string,
    originalFileContent: string,
    modifiedFileContent: string
  ): Array<[string | null, string | null]> {
    const patch: string = createPatch('', originalFileContent, modifiedFileContent);
    try {
      // Split the patch into lines
      const patchLines = patch.split('\n');

      // Initialize variables to track line numbers
      let oldLineNumber = 1;
      let newLineNumber = 1;
      let firstPlusAlreadySkipped = false;
      let firstMinusAlreadySkipped = false;
      const diff: Array<[string | null, string | null]> = [];
      // Initialize result as HTML string

      patchLines.forEach((line) => {
        // Parse the hunk header (e.g., @@ -2,3 +2,3 @@)
        const hunkHeader = /^@@ -(\d+),\d+ \+(\d+),\d+ @@/;
        const match = hunkHeader.exec(line);

        if (match) {
          oldLineNumber = parseInt(match[1], 10);
          newLineNumber = parseInt(match[2], 10);
        } else if (line.startsWith('-')) {
          // Skip the first line difference
          if (oldLineNumber === 1 && !firstMinusAlreadySkipped) {
            firstMinusAlreadySkipped = true;
            // Skip the first line difference
            oldLineNumber++;
            return;
          }
          diff.push([line.slice(1), null]);
          oldLineNumber++;
        } else if (line.startsWith('+')) {
          // Skip the first line difference
          if (newLineNumber === 1 && !firstPlusAlreadySkipped) {
            firstPlusAlreadySkipped = true;
            newLineNumber++;
            return;
          }
          diff.push([null, line.slice(1)]);
          newLineNumber++;
        } else if (line.startsWith(' ')) {
          diff.push([line.slice(1), line.slice(1)]);
          // Unchanged line, skip it
          oldLineNumber++;
          newLineNumber++;
        }
      });
      const diffJson = {
        fileName: filename,
        diff,
      };
      this.appendToJsonFile('new_assessment_reports/lwc_reports/assess.json', diffJson);
      // Return the result string, or an empty string if no differences
      return diff;
    } catch (error) {
      Logger.logger.error('Error in FileDiffUtil', error.message);
    }
  }

  escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  private appendToJsonFile(filePath: string, newData: Record<string, unknown>): void {
    try {
      const fileData = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '[]';
      const jsonData = JSON.parse(fileData);
      jsonData.push(newData);
      fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
    } catch (error) {
      Logger.logger.error('Error appending to JSON file', error.message);
    }
  }
}
