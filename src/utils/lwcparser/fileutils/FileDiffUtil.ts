/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { createPatch } from 'diff';

export class FileDiffUtil {
  public getFileDiff(filename: string, originalFileContent: string, modifiedFileContent: string): string {
    const patch: string = createPatch(filename, originalFileContent, modifiedFileContent);

    // Split the patch into lines
    const patchLines = patch.split('\n');

    // Initialize variables to track line numbers
    let oldLineNumber = 1;
    let newLineNumber = 1;

    // Initialize result as HTML string
    let result = '';

    patchLines.forEach((line) => {
      // Parse the hunk header (e.g., @@ -2,3 +2,3 @@)
      const hunkHeader = /^@@ -(\d+),\d+ \+(\d+),\d+ @@/;
      const match = hunkHeader.exec(line);

      if (match) {
        oldLineNumber = parseInt(match[1], 10);
        newLineNumber = parseInt(match[2], 10);
        result += `<div>${this.escapeHtml(line)}</div>`;
      } else if (line.startsWith('-')) {
        result += `<div style="color: red;">- Line ${oldLineNumber}: ${this.escapeHtml(line.slice(1))}</div>`;
        oldLineNumber++;
      } else if (line.startsWith('+')) {
        result += `<div style="color: green;">+ Line ${newLineNumber}: ${this.escapeHtml(line.slice(1))}</div>`;
        newLineNumber++;
      } else if (line.startsWith(' ')) {
        // Unchanged line, just increment both line counters
        result += `<div>${this.escapeHtml(line)}</div>`;
        oldLineNumber++;
        newLineNumber++;
      }
    });
    // Return the result string with color codes
    return result;
  }

  escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
}
