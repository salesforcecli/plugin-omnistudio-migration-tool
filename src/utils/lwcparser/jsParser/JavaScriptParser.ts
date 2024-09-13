/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-console */
import * as fs from 'fs';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import t from '@babel/types';

const NAMESPACE = 'c';

export class JavaScriptParser {
  // Function to replace strings in import declarations and write back to file
  public replaceImportSource(filePath: string, oldSource: string): void {
    // Read the JavaScript file
    const code = fs.readFileSync(filePath, 'utf-8');

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
          const updatedSource = importSource.replace(oldSource, NAMESPACE);
          // Update the AST with the new source
          path.node.source = t.stringLiteral(updatedSource);
        }
      },
    });

    // Generate the updated code from the modified AST
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const output = generate(ast, {}, code);

    // Write the modified code back to the file
    fs.writeFileSync(filePath, output.code, 'utf-8');

    console.log(`Replaced import '${oldSource}' with '${NAMESPACE}' in file: ${filePath}`);
  }
}
