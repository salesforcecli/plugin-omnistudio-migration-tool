/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import * as fs from 'fs';
import * as parser from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types'; // Import all types from @babel/types

class JavaScriptParser {
  private fileContent: string;
  private ast: parser.ParseResult<t.File> | null; // Specify the generic type argument

  constructor(filePath: string) {
    this.fileContent = fs.readFileSync(filePath, 'utf-8');
    this.ast = null;
  }

  public parseFile(): void {
    this.ast = parser.parse(this.fileContent, {
      sourceType: 'module',
      plugins: ['decorators'],
    });
  }

  public traverseAST(): string[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const labels: string[] = [];
    if (!this.ast) {
      throw new Error('AST has not been generated. Call parseFile() first.');
    }

    traverse(this.ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        console.log('Import found:', path.node.source.value);
        labels.push(path.node.source.value);
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return labels;
  }
}

export default JavaScriptParser;
