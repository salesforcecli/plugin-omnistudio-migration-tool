/* eslint-disable no-console */
import { JavaScriptParser } from './JavaScriptParser';

const parser = new JavaScriptParser();
const filePath = '/Users/spachbhai/os-migration/plugin-omnistudio-migration-tool/src/utils/lwcparser/input/test.js'; // Path to the JavaScript file
const oldSource = 'omnistudio';
parser.replaceImportSource(filePath, oldSource);
