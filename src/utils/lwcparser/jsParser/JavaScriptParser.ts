/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-console */
import * as fs from 'fs';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { FileConstant } from '../fileutils/FileConstant';
import { Logger } from '../../logger';

const DEFAULT_NAMESPACE = 'c';

export class JavaScriptParser {
  // Function to replace strings in import declarations and write back to file
  public replaceImportSource(filePath: string, oldSource: string): Map<string, string> | null {
    const jsContentMap = new Map<string, string>();

    // Read the JavaScript file
    const code = fs.readFileSync(filePath, 'utf-8');

    // Skip processing if the file has specific markers or doesn't include the oldSource
    if (code.includes('Generated class DO NOT MODIFY') || !code.includes(oldSource + '/')) {
      return null;
    }

    // Store the original file content
    jsContentMap.set(FileConstant.BASE_CONTENT, code);

    // Parse the code into an AST
    const ast = parse(code, {
      sourceType: 'module', // Specify that we are parsing an ES module
      plugins: ['decorators'], // Include any relevant plugins if necessary
    });

    // Array to store replacement operations
    const replacements: Array<{ original: string; updated: string }> = [];

    // Traverse the AST and identify import declarations
    traverse(ast, {
      ImportDeclaration(path) {
        const importSource = path.node.source.value;

        // Check if the import source contains the old substring
        if (importSource.includes(oldSource + '/')) {
          // Replace the old substring with the new substring
          const updatedSource = importSource.replace(oldSource, DEFAULT_NAMESPACE);
          replacements.push({ original: importSource, updated: updatedSource });
        }
      },
    });

    // Apply replacements directly to the original code
    let modifiedCode = code;
    replacements.forEach(({ original, updated }) => {
      const importRegex = new RegExp(`(["'])${original}(["'])`, 'g'); // Match the import string with quotes
      modifiedCode = modifiedCode.replace(importRegex, `$1${updated}$2`);
    });

    // Store the modified content
    jsContentMap.set(FileConstant.MODIFIED_CONTENT, modifiedCode);
    return jsContentMap;
  }

  // Method to save modified HTML back to a file
  public saveToFile(filePath: string, output: string): void {
    try {
      fs.writeFileSync(filePath, output, 'utf-8');
      Logger.info(`Replaced import in file: ${filePath}`);
    } catch (error) {
      Logger.error('Error writing file to disk', error);
      throw error;
    }
  }
}
