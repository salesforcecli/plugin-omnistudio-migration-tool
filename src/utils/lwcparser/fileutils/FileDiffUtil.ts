/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { createPatch } from 'diff';
import { Logger } from '../../../utils/logger';
import { PairArray } from '../../interfaces';

export class FileDiffUtil {
  public static getDiffHTML(diff: string): string {
    const diffArray: PairArray[] = JSON.parse(diff) as PairArray[];
    let result = '<div style="height: 120px; text-align: left; overflow-x: auto;">';
    if (diffArray.length <= 6) {
      result += this.getDiffContent(diff) + '</div>';
    } else {
      result +=
        this.getDiffContent(diff, 6) +
        '</div><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">' +
        '<button onclick="document.getElementById(\'myModal\').style.display=\'flex\'" style="position: absolute; top: 5px; right: 5px; width: 30px; height: 30px; opacity: 0.7;"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>';
      result += `<div id="myModal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.4); align-items: center; justify-content: center;">
              <div style="background-color: #fff; margin: auto; padding: 20px; width: 60%; height: 60%; box-shadow: 0 5px 15px rgba(0,0,0,.5); border-radius: 4px; text-align: left; position: relative;">
                <span onclick="document.getElementById('myModal').style.display='none'" style="color: #222121; height: 30px; width: 30px; position: absolute; background-color: #fff; top: -35px; right: 0; font-size: 25px; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 3px;">&times;</span>
                <h2 style="margin-top: 0; border-bottom: 1px solid #ddd; padding-bottom: 10px; text-align: center; font-size: 18px;">Summary</h2>
                <p style="margin-top: 20px;">${this.getDiffContent(diff, -1)}</p>
        </div>
      </div>`;
    }
    return result;
  }

  private static getDiffContent(diff: string, lineLimit = -1): string {
    const diffArray: PairArray[] = JSON.parse(diff) as PairArray[];
    let result = '';
    let originalLine = 1;
    let modifiedLine = 1;
    let linecount = 0;
    for (const { old: original, new: modified } of diffArray) {
      if (original === modified) {
        result += `<div style="color: black;">• Line ${modifiedLine}: ${original}</div>`;
        modifiedLine++;
        originalLine++;
        linecount++;
      } else if (original !== null && modified === null) {
        result += `<div style="color: red;">- Line ${originalLine}: ${original}</div>`;
        originalLine++;
        linecount++;
      } else if (original === null && modified !== null) {
        result += `<div style="color: green;">+ Line ${modifiedLine}: ${modified}</div>`;
        modifiedLine++;
        linecount++;
      }
      if (linecount >= lineLimit && lineLimit !== -1) {
        result += '<div style="color: black;">..........</div>';
        break;
      }
    }
    return result;
  }

  public getFileDiff(filename: string, originalFileContent: string, modifiedFileContent: string): PairArray[] {
    const patch: string = createPatch('', originalFileContent, modifiedFileContent);
    try {
      // Split the patch into lines
      const patchLines = patch.split('\n');

      // Initialize variables to track line numbers
      let oldLineNumber = 1;
      let newLineNumber = 1;
      let firstPlusAlreadySkipped = false;
      let firstMinusAlreadySkipped = false;
      const diff: PairArray[] = [];
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
          diff.push({ old: line.slice(1), new: null });
          oldLineNumber++;
        } else if (line.startsWith('+')) {
          // Skip the first line difference
          if (newLineNumber === 1 && !firstPlusAlreadySkipped) {
            firstPlusAlreadySkipped = true;
            newLineNumber++;
            return;
          }
          diff.push({ old: null, new: line.slice(1) });
          newLineNumber++;
        } else if (line.startsWith(' ')) {
          diff.push({ old: line.slice(1), new: line.slice(1) });
          // Unchanged line, skip it
          oldLineNumber++;
          newLineNumber++;
        }
      });
      // Return the diff array
      return diff;
    } catch (error) {
      Logger.logger.error('Error in FileDiffUtil', error.message);
    }
  }

  escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
}
