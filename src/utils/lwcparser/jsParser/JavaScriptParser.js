"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JavaScriptParser = void 0;
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-console */
var fs = require("fs");
var parser = require("@babel/parser");
var traverse_1 = require("@babel/traverse");
var generator_1 = require("@babel/generator");
var t = require("@babel/types");
var DEFAULT_NAMESPACE = 'c';
var JavaScriptParser = /** @class */ (function () {
    function JavaScriptParser() {
    }
    // Function to replace strings in import declarations and write back to file
    JavaScriptParser.prototype.replaceImportSource = function (filePath, oldSource) {
        // Read the JavaScript file
        var code = fs.readFileSync(filePath, 'utf-8');
        // Parse the code into an AST (Abstract Syntax Tree)
        var ast = parser.parse(code, {
            sourceType: 'module', // Specify that we are parsing an ES module
            plugins: ['decorators'], // Include any relevant plugins if necessary (e.g., 'jsx', 'flow', etc.)
        });
        // Traverse the AST and modify import declarations
        (0, traverse_1.default)(ast, {
            ImportDeclaration: function (path) {
                var importSource = path.node.source.value;
                // Check if the import source contains the old substring
                if (importSource.includes(oldSource + '/')) {
                    // Replace the old substring with the new substring
                    var updatedSource = importSource.replace(oldSource, DEFAULT_NAMESPACE);
                    // Update the AST with the new source
                    path.node.source = t.stringLiteral(updatedSource);
                }
            },
        });
        return (0, generator_1.default)(ast, {}, code).code;
    };
    // Method to save modified HTML back to a file
    JavaScriptParser.prototype.saveToFile = function (filePath, output) {
        try {
            fs.writeFileSync(filePath, output, 'utf-8');
            console.log("Replaced import 'oldSource' with 'c' in file: ".concat(filePath));
        }
        catch (error) {
            console.error("Error writing file to disk: ".concat(error));
            throw error;
        }
    };
    return JavaScriptParser;
}());
exports.JavaScriptParser = JavaScriptParser;
