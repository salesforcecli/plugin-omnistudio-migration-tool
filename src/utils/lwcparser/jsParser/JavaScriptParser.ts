/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-console */
import * as fs from 'fs';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { FileConstant } from '../fileutils/FileConstant';

const DEFAULT_NAMESPACE = 'c';

export class JavaScriptParser {
  // Function to replace strings in import declarations and write back to file
  public replaceImportSource(filePath: string, oldSource: string): Map<string, string> {
    const jsContentMap = new Map<string, string>();
    // Read the JavaScript file
    const code = fs.readFileSync(filePath, 'utf-8');
    jsContentMap.set(FileConstant.BASE_CONTENT, code);
    // Parse the code into an AST (Abstract Syntax Tree)
    const ast = parser.parse(code, {
      sourceType: 'module', // Specify that we are parsing an ES module
      plugins: ['decorators'], // Include any relevant plugins if necessary (e.g., 'jsx', 'flow', etc.)
    });

    // Traverse the AST and modify import declarations
    traverse(ast, {
      ImportDeclaration(path) {
        const importSource = path.node.source.value;

        // Check if the import source contains the old substring
        if (importSource.includes(oldSource + '/')) {
          // Replace the old substring with the new substring
          const updatedSource = importSource.replace(oldSource, DEFAULT_NAMESPACE);
          // Update the AST with the new source
          path.node.source = t.stringLiteral(updatedSource);
        }
      },
    });
    jsContentMap.set(FileConstant.MODIFIED_CONTENT, generate(ast, {}, code).code);
    // return generate(ast, {}, code).code;
    return jsContentMap;
  }

  // Method to save modified HTML back to a file
  public saveToFile(filePath: string, output: string): void {
    try {
      fs.writeFileSync(filePath, output, 'utf-8');
      console.log(`Replaced import in file: ${filePath}`);
    } catch (error) {
      console.error(`Error writing file to disk: ${error}`);
      throw error;
    }
  }
}
