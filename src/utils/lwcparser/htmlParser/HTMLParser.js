"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTMLParser = void 0;
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable no-console */
var fs = require("fs");
var cheerio = require("cheerio");
var DEFAULT_NAMESPACE = 'c';
var TAG = 'tag';
var HTMLParser = /** @class */ (function () {
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    function HTMLParser(htmlFilePath) {
        // Load the HTML file and initialize cheerio
        var html = this.loadHTMLFromFile(htmlFilePath);
        this.parser = cheerio.load(html);
    }
    // Method to load HTML from a file
    HTMLParser.prototype.loadHTMLFromFile = function (filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8');
        }
        catch (error) {
            console.error("Error reading file from disk: ".concat(error));
            throw error;
        }
    };
    // Method to replace custom tags
    HTMLParser.prototype.replaceTags = function (namespaceTag) {
        // Load the HTML into cheerio
        var $ = this.parser;
        // Find all tags that contain the substring "omnistudio" in their tag name
        $('*').each(function (i, element) {
            if (element.type === TAG && element.name && element.name.includes(namespaceTag + '-')) {
                // Create a new tag with the same content and attributes as the old tag
                var newTag = DEFAULT_NAMESPACE + element.name.substring(element.name.indexOf('-'));
                var newElement_1 = $("<".concat(newTag, ">")).html($(element).html());
                // Copy all attributes from the old element to the new one
                Object.keys(element.attribs).forEach(function (attr) {
                    newElement_1.attr(attr, $(element).attr(attr));
                });
                // Replace the old element with the new one
                $(element).replaceWith(newElement_1);
            }
        });
        return $.html();
    };
    // Method to save modified HTML back to a file
    HTMLParser.prototype.saveToFile = function (outputFilePath) {
        try {
            var modifiedHtml = this.parser.html();
            fs.writeFileSync(outputFilePath, modifiedHtml);
            console.log("Modified HTML saved to ".concat(outputFilePath));
        }
        catch (error) {
            console.error("Error writing file to disk: ".concat(error));
            throw error;
        }
    };
    // Optional: Method to get the modified HTML as a string
    HTMLParser.prototype.getModifiedHTML = function () {
        return this.parser.html();
    };
    return HTMLParser;
}());
exports.HTMLParser = HTMLParser;
