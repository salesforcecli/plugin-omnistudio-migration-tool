/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { createPatch } from 'diff';
import chalk from 'chalk';

export class FileDiffUtil {
  public getFileDiff(originalFileContent: string, modifiedFileContent: string): string {
    const patch: string = createPatch('file.txt', originalFileContent, modifiedFileContent);

    // Split the patch into lines
    const patchLines = patch.split('\n');

    // Initialize arrays to store the added and removed lines
    const changes: Array<{ type: string; lineNumber: number; content: string }> = [];

    // Initialize variables to track line numbers
    let oldLineNumber = 0;
    let newLineNumber = 0;

    patchLines.forEach((line) => {
      // Parse the hunk header (e.g., @@ -2,3 +2,3 @@)
      const hunkHeader = /^@@ -(\d+),\d+ \+(\d+),\d+ @@/;
      const match = hunkHeader.exec(line);

      if (match) {
        oldLineNumber = parseInt(match[1], 10);
        newLineNumber = parseInt(match[2], 10);
      } else if (line.startsWith('-')) {
        // Line was removed from the original text, store it with red color
        changes.push({
          type: 'removed',
          lineNumber: oldLineNumber,
          content: chalk.red(`- Line ${oldLineNumber}: ${line.slice(1)}`),
        });
        oldLineNumber++;
      } else if (line.startsWith('+')) {
        // Line was added to the new text, store it with green color
        changes.push({
          type: 'added',
          lineNumber: newLineNumber,
          content: chalk.green(`+ Line ${newLineNumber}: ${line.slice(1)}`),
        });
        newLineNumber++;
      } else if (line.startsWith(' ')) {
        // Unchanged line, just increment both line counters
        oldLineNumber++;
        newLineNumber++;
      }
    });

    // Sort changes by line number
    changes.sort((a, b) => a.lineNumber - b.lineNumber);

    // Concatenate the sorted changes into a string
    let result = '';
    changes.forEach((change) => {
      result += change.content + '\n';
    });

    // Return the result string with color codes
    return result;
  }
}
