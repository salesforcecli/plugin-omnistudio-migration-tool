/* eslint-disable prettier/prettier */
import JavaScriptParser from './javascriptparser';

const filePath =
  '/Users/spachbhai/os-migration/plugin-omnistudio-migration-tool/src/utils/lwcparser/input/TestInputJsFile.js';
const jsParser = new JavaScriptParser(filePath);

// Parse the file to generate the AST
jsParser.parseFile();

// Traverse the AST to find import declarations
jsParser.traverseAST();
