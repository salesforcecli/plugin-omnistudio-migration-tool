/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/no-unused-vars */
// import * as fs from 'fs';
// import { parse, type ParseResult } from '@babel/parser'; // Import all types from @babel/types

class JavaScriptParser {
  // private fileContent: string;
  private ast: File | null = null; // Specify the generic type argument

  constructor(filePath: string) {
    // this.fileContent = fs.readFileSync(filePath, 'utf-8');
    this.ast = null;
  }

  // public parseCode(): void {
  //   const parseResult: File = parse(this.fileContent, {
  //     sourceType: 'module', // Use 'script' if you're parsing non-module code
  //     plugins: ['jsx', 'typescript'], // Add plugins as needed
  //   });

  //   if (parseResult.type === 'File') {
  //     this.ast = parseResult;
  //   } else {
  //     throw new Error("Parsing did not return a 'File' node as expected.");
  //   }
  // }

  // Method to get the AST as a string
  getAST(): string | null {
    if (!this.ast) {
      console.error('AST is not available. Please parse the code first.');
      return null;
    }
    return JSON.stringify(this.ast, null, 2);
  }

  // Main method to process the file
  processFile(): void {
    // this.parseCode(); // Parse the JavaScript code
    const astString = this.getAST(); // Get the AST as a string
    if (astString) {
      console.log(astString); // Output the AST
    }
  }
}

export default JavaScriptParser;
