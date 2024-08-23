import fs from 'fs';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';

const filePath = '/Users/spachbhai/os-migration/plugin-omnistudio-migration-tool/src/utils/lwcparser/test11.js';
const fileContent = fs.readFileSync(filePath).toString();

const ast = parser.parse(fileContent, {
  sourceType: 'module',
  plugins: ['decorators'], // Add 'jsx' if you're parsing JSX
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
traverse(ast, {
  ImportDeclaration(path) {
    // eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-member-access
    console.log('Import found:', path.node.source.value);
  },
});
