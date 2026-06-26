/* eslint-disable @typescript-eslint/no-unsafe-call */
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';
import { HTMLParser } from '../../../../src/utils/lwcparser/htmlParser/HTMLParser';
import { FileConstant } from '../../../../src/utils/lwcparser/fileutils/FileConstant';
import { LwcPackageUtilityRegistry } from '../../../../src/utils/lwcparser/LwcPackageUtilityRegistry';

describe('HTMLParser', () => {
  const testInputDir = 'test/utils/lwc/parser/input';
  const testOutputDir = 'test/utils/lwc/parser/output';

  before(() => {
    // HTMLParser consults the registry for per-tag skip decisions; mirror the
    // canonical caller wiring done once at command entry.
    LwcPackageUtilityRegistry.getInstance().clear();
    LwcPackageUtilityRegistry.getInstance().initialize();
  });

  beforeEach(() => {
    // Ensure output directory exists
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up any test output files
    if (fs.existsSync(testOutputDir)) {
      const files = fs.readdirSync(testOutputDir);
      files.forEach((file) => {
        if (file.startsWith('test-output-')) {
          fs.unlinkSync(path.join(testOutputDir, file));
        }
      });
    }
  });

  describe('Constructor and File Loading', () => {
    it('should load HTML file correctly', () => {
      const mockFilePath = path.join(testInputDir, 'test.html');
      const htmlParser = new HTMLParser(mockFilePath);
      expect(htmlParser.html).to.not.be.empty;
      expect(htmlParser.html).to.contain('<omnistudio-input>');
    });

    it('should throw error for non-existent file', () => {
      const invalidFilePath = path.join(testInputDir, 'non-existent.html');
      expect(() => new HTMLParser(invalidFilePath)).to.throw();
    });
  });

  describe('Basic Tag Replacement', () => {
    it('should replace single namespace tags correctly', () => {
      const mockFilePath = path.join(testInputDir, 'test.html');
      const htmlParser = new HTMLParser(mockFilePath);
      const resultMap = htmlParser.replaceTags('omnistudio');

      expect(htmlParser.getModifiedHTML()).to.contain('c-input');
      expect(htmlParser.getModifiedHTML()).to.not.contain('omnistudio-input');
      expect(resultMap.get(FileConstant.BASE_CONTENT)).to.contain('omnistudio-input');
      expect(resultMap.get(FileConstant.MODIFIED_CONTENT)).to.contain('c-input');
    });

    it('should handle empty namespace gracefully', () => {
      const mockFilePath = path.join(testInputDir, 'test.html');
      const htmlParser = new HTMLParser(mockFilePath);
      const originalContent = htmlParser.html;
      htmlParser.replaceTags('');

      // Content should remain unchanged for empty namespace
      expect(htmlParser.getModifiedHTML()).to.equal(originalContent);
    });
  });

  describe('Multiple Occurrences Replacement (Bug Fix Verification)', () => {
    it('should replace ALL occurrences of namespace tags, not just the first one', () => {
      const mockFilePath = path.join(testInputDir, 'multiple-namespace-tags.html');
      const htmlParser = new HTMLParser(mockFilePath);
      const resultMap = htmlParser.replaceTags('vlocity_ins');

      const modifiedContent = htmlParser.getModifiedHTML();
      const baseContent = resultMap.get(FileConstant.BASE_CONTENT) || '';

      // Count original occurrences
      const originalOpenTags = (baseContent.match(/<vlocity_ins/g) || []).length;
      const originalCloseTags = (baseContent.match(/<\/vlocity_ins/g) || []).length;

      // Count converted occurrences
      const convertedOpenTags = (modifiedContent.match(/<c/g) || []).length;
      const convertedCloseTags = (modifiedContent.match(/<\/c/g) || []).length;

      // Verify all tags were converted
      expect(originalOpenTags).to.be.greaterThan(1); // Ensure we have multiple tags to test
      expect(originalCloseTags).to.be.greaterThan(1);
      expect(convertedOpenTags).to.equal(originalOpenTags);
      expect(convertedCloseTags).to.equal(originalCloseTags);

      // Ensure no original namespace tags remain
      expect(modifiedContent).to.not.contain('vlocity_ins');
    });

    it('should replace multiple different namespace occurrences correctly', () => {
      const mockFilePath = path.join(testInputDir, 'mixed-namespaces.html');
      const htmlParser = new HTMLParser(mockFilePath);

      // Test omnistudio namespace replacement
      htmlParser.replaceTags('omnistudio');
      expect(htmlParser.getModifiedHTML()).to.contain('c-input');
      expect(htmlParser.getModifiedHTML()).to.contain('c-card');
      expect(htmlParser.getModifiedHTML()).to.not.contain('omnistudio-');

      // Original vlocity_ins tags should remain unchanged
      expect(htmlParser.getModifiedHTML()).to.contain('vlocity_ins-button');
      expect(htmlParser.getModifiedHTML()).to.contain('vlocity_ins-icon');
    });
  });

  describe('Special Characters in Namespace', () => {
    it('should handle namespaces with special regex characters', () => {
      const mockFilePath = path.join(testInputDir, 'special-characters.html');
      const htmlParser = new HTMLParser(mockFilePath);

      // Test namespace with dot (special regex character)
      htmlParser.replaceTags('special.ns');
      expect(htmlParser.getModifiedHTML()).to.contain('c-component');
      expect(htmlParser.getModifiedHTML()).to.not.contain('special.ns-component');
    });

    it('should handle namespaces with underscores and hyphens', () => {
      const mockFilePath = path.join(testInputDir, 'special-characters.html');
      const htmlParser = new HTMLParser(mockFilePath);

      // Test namespace with underscore
      htmlParser.replaceTags('special_ns');
      expect(htmlParser.getModifiedHTML()).to.contain('c-input');
      expect(htmlParser.getModifiedHTML()).to.not.contain('special_ns-input');
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with no target namespace tags', () => {
      const mockFilePath = path.join(testInputDir, 'no-target-tags.html');
      const htmlParser = new HTMLParser(mockFilePath);
      const originalContent = htmlParser.html;

      const resultMap = htmlParser.replaceTags('nonexistent');

      // Content should remain unchanged
      expect(htmlParser.getModifiedHTML()).to.equal(originalContent);
      expect(resultMap.get(FileConstant.BASE_CONTENT)).to.equal(originalContent);
      expect(resultMap.get(FileConstant.MODIFIED_CONTENT)).to.equal(originalContent);
    });

    it('should handle empty HTML files', () => {
      const mockFilePath = path.join(testInputDir, 'empty.html');
      const htmlParser = new HTMLParser(mockFilePath);

      const resultMap = htmlParser.replaceTags('omnistudio');

      expect(htmlParser.getModifiedHTML()).to.be.empty;
      expect(resultMap.get(FileConstant.BASE_CONTENT)).to.be.empty;
      expect(resultMap.get(FileConstant.MODIFIED_CONTENT)).to.be.empty;
    });

    it('should preserve HTML structure and attributes', () => {
      const mockFilePath = path.join(testInputDir, 'multiple-namespace-tags.html');
      const htmlParser = new HTMLParser(mockFilePath);

      htmlParser.replaceTags('vlocity_ins');
      const modifiedContent = htmlParser.getModifiedHTML();

      // Check that attributes are preserved
      expect(modifiedContent).to.contain('label="First Input"');
      expect(modifiedContent).to.contain('onclick="handleClick"');
      expect(modifiedContent).to.contain('icon-name="utility:info"');

      // Check that HTML structure is preserved
      expect(modifiedContent).to.contain('<template>');
      expect(modifiedContent).to.contain('<div class="container">');
      expect(modifiedContent).to.contain('<section>');
    });
  });

  describe('Utility-component skip list', () => {
    const skipFixture = path.join(testInputDir, 'utility-skip-list.html');

    it('should leave a registered utility tag unchanged (vlocity_cmt-ins-utility)', () => {
      const htmlParser = new HTMLParser(skipFixture);
      htmlParser.replaceTags('vlocity_cmt');
      const modified = htmlParser.getModifiedHTML();

      // Skip-listed open + close tags survive verbatim with attributes intact.
      expect(modified).to.contain('<vlocity_cmt-ins-utility data-id="util-1" title="Skip me">');
      expect(modified).to.contain('</vlocity_cmt-ins-utility>');
    });

    it('should leave a registered multi-hyphen utility tag unchanged (vlocity_cmt-ins-accordion-section)', () => {
      const htmlParser = new HTMLParser(skipFixture);
      htmlParser.replaceTags('vlocity_cmt');
      const modified = htmlParser.getModifiedHTML();

      expect(modified).to.contain('<vlocity_cmt-ins-accordion-section>');
      expect(modified).to.contain('</vlocity_cmt-ins-accordion-section>');
    });

    it('should rewrite vlocity_cmt-not-a-utility to c-not-a-utility (non-skip-list)', () => {
      const htmlParser = new HTMLParser(skipFixture);
      htmlParser.replaceTags('vlocity_cmt');
      const modified = htmlParser.getModifiedHTML();

      // Opening tag with attributes is rewritten; attributes are preserved.
      expect(modified).to.contain('<c-not-a-utility label="Rewrite me">');
      expect(modified).to.contain('</c-not-a-utility>');
      // The original namespace form for this tag must be gone.
      expect(modified).to.not.contain('<vlocity_cmt-not-a-utility');
      expect(modified).to.not.contain('</vlocity_cmt-not-a-utility');
    });

    it('should rewrite only non-skip-list tags in a mixed document and keep matched open/close pairs', () => {
      const htmlParser = new HTMLParser(skipFixture);
      const resultMap = htmlParser.replaceTags('vlocity_cmt');
      const modified = htmlParser.getModifiedHTML();
      const base = resultMap.get(FileConstant.BASE_CONTENT) || '';

      // 1. Every skip-list tag (open + close) must survive in BOTH base and modified.
      const skipOpenCountBase = (base.match(/<vlocity_cmt-ins-utility[\s>]/g) || []).length;
      const skipCloseCountBase = (base.match(/<\/vlocity_cmt-ins-utility>/g) || []).length;
      const skipOpenCountMod = (modified.match(/<vlocity_cmt-ins-utility[\s>]/g) || []).length;
      const skipCloseCountMod = (modified.match(/<\/vlocity_cmt-ins-utility>/g) || []).length;
      expect(skipOpenCountMod).to.equal(skipOpenCountBase);
      expect(skipCloseCountMod).to.equal(skipCloseCountBase);

      // 2. Every non-skip vlocity_cmt-* tag must have moved to c-* with the same open/close count.
      const nonSkipOpenBase = (base.match(/<vlocity_cmt-not-a-utility[\s>]/g) || []).length;
      const nonSkipCloseBase = (base.match(/<\/vlocity_cmt-not-a-utility>/g) || []).length;
      const nonSkipOpenMod = (modified.match(/<c-not-a-utility[\s>]/g) || []).length;
      const nonSkipCloseMod = (modified.match(/<\/c-not-a-utility>/g) || []).length;
      expect(nonSkipOpenMod).to.equal(nonSkipOpenBase);
      expect(nonSkipCloseMod).to.equal(nonSkipCloseBase);

      // 3. The "another-component" tag (also non-utility) must be rewritten too.
      expect(modified).to.contain('<c-another-component');
      expect(modified).to.contain('</c-another-component>');
      expect(modified).to.not.contain('<vlocity_cmt-another-component');
    });

    it('should not rewrite a tag whose suffix matches a utility regardless of attribute content', () => {
      const htmlParser = new HTMLParser(skipFixture);
      htmlParser.replaceTags('vlocity_cmt');
      const modified = htmlParser.getModifiedHTML();

      // ins-labels nested inside ins-utility — confirm both open and close are preserved.
      expect(modified).to.contain('<vlocity_cmt-ins-labels>');
      expect(modified).to.contain('</vlocity_cmt-ins-labels>');
    });
  });

  describe('File I/O Operations', () => {
    it('should save modified HTML to file correctly', () => {
      const mockFilePath = path.join(testInputDir, 'test.html');
      const outputFilePath = path.join(testOutputDir, 'test-output-save.html');
      const htmlParser = new HTMLParser(mockFilePath);

      htmlParser.replaceTags('omnistudio');
      const modifiedContent = htmlParser.getModifiedHTML();

      // Save to file
      htmlParser.saveToFile(outputFilePath, modifiedContent);

      // Verify file was created and has correct content
      expect(fs.existsSync(outputFilePath)).to.be.true;
      const savedContent = fs.readFileSync(outputFilePath, 'utf8');
      expect(savedContent).to.equal(modifiedContent);
      expect(savedContent).to.contain('c-input');
    });

    it('should throw error when saving to invalid path', () => {
      const mockFilePath = path.join(testInputDir, 'test.html');
      const invalidOutputPath = '/invalid/path/output.html';
      const htmlParser = new HTMLParser(mockFilePath);

      htmlParser.replaceTags('omnistudio');
      const modifiedContent = htmlParser.getModifiedHTML();

      expect(() => htmlParser.saveToFile(invalidOutputPath, modifiedContent)).to.throw();
    });
  });

  describe('Return Values and State Management', () => {
    it('should return correct content map with base and modified content', () => {
      const mockFilePath = path.join(testInputDir, 'test.html');
      const htmlParser = new HTMLParser(mockFilePath);
      const originalContent = htmlParser.html;

      const resultMap = htmlParser.replaceTags('omnistudio');

      expect(resultMap.size).to.equal(2);
      expect(resultMap.has(FileConstant.BASE_CONTENT)).to.be.true;
      expect(resultMap.has(FileConstant.MODIFIED_CONTENT)).to.be.true;
      expect(resultMap.get(FileConstant.BASE_CONTENT)).to.equal(originalContent);
      expect(resultMap.get(FileConstant.MODIFIED_CONTENT)).to.equal(htmlParser.getModifiedHTML());
    });

    it('should maintain state correctly after multiple operations', () => {
      const mockFilePath = path.join(testInputDir, 'mixed-namespaces.html');
      const htmlParser = new HTMLParser(mockFilePath);

      // First replacement
      htmlParser.replaceTags('omnistudio');
      const afterFirstReplace = htmlParser.getModifiedHTML();

      // Second replacement on already modified content
      htmlParser.replaceTags('vlocity_ins');
      const afterSecondReplace = htmlParser.getModifiedHTML();

      // Verify both transformations occurred
      expect(afterFirstReplace).to.contain('c-input');
      expect(afterFirstReplace).to.contain('vlocity_ins-button');

      expect(afterSecondReplace).to.contain('c-input'); // from first
      expect(afterSecondReplace).to.contain('c-button'); // from second
      expect(afterSecondReplace).to.not.contain('omnistudio-');
      expect(afterSecondReplace).to.not.contain('vlocity_ins-');
    });
  });
});
