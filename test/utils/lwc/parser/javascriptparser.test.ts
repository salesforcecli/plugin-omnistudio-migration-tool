/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { expect } from 'chai';
import { JavaScriptParser } from '../../../../src/utils/lwcparser/jsParser/JavaScriptParser';
import { LwcPackageUtilityRegistry } from '../../../../src/utils/lwcparser/LwcPackageUtilityRegistry';
import { FileConstant } from '../../../../src/utils/lwcparser/fileutils/FileConstant';

describe('JavaScriptParser', () => {
  let parser: JavaScriptParser;
  let tempDir: string;
  let tempFiles: string[];

  before(() => {
    // The skip-list branch consults LwcPackageUtilityRegistry, so the singleton
    // must be initialized for these tests to mirror real command-entry wiring.
    LwcPackageUtilityRegistry.getInstance().clear();
    LwcPackageUtilityRegistry.getInstance().initialize();
  });

  beforeEach(() => {
    parser = new JavaScriptParser();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-parser-test-'));
    tempFiles = [];
  });

  afterEach(() => {
    // Clean up temp files
    tempFiles.forEach((file) => {
      try {
        fs.unlinkSync(file);
      } catch {
        // Ignore errors
      }
    });
    try {
      fs.rmdirSync(tempDir);
    } catch {
      // Ignore errors
    }
  });

  // Helper to create a temp file with content
  const createTempFile = (filename: string, content: string): string => {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    tempFiles.push(filePath);
    return filePath;
  };

  describe('Basic functionality', () => {
    it('should return null when file contains "Generated class DO NOT MODIFY"', () => {
      const mockFileContent = '// Generated class DO NOT MODIFY\nimport something from "test/module";';
      const testFile = createTempFile('test1.js', mockFileContent);

      const result = parser.replaceImportSource(testFile, 'test');

      expect(result).to.be.null;
    });

    it('should return null when file does not contain the namespace', () => {
      const mockFileContent = 'import something from "other/module";';
      const testFile = createTempFile('test2.js', mockFileContent);

      const result = parser.replaceImportSource(testFile, 'vlocity_ins');

      expect(result).to.be.null;
    });
  });

  describe('PubSub module replacement', () => {
    it('should replace pubsub module with lightning/omnistudioPubsub', () => {
      const mockFileContent = `import pubsub from 'vlocity_ins/pubsub';
import OtherModule from 'vlocity_ins/otherModule';`;

      const testFile = createTempFile('test3.js', mockFileContent);

      const result = parser.replaceImportSource(testFile, 'vlocity_ins');

      expect(result).to.not.be.null;
      const modifiedContent = result.get('modified');

      expect(modifiedContent).to.include("import pubsub from 'lightning/omnistudioPubsub'");
      expect(modifiedContent).to.include("import OtherModule from 'c/otherModule'");
    });

    it('should handle multiple pubsub imports correctly', () => {
      const mockFileContent = `import pubsub from 'vlocity_cmt/pubsub';
import { something } from 'vlocity_cmt/utils';
import anotherPubsub from 'vlocity_cmt/pubsub';`;

      const testFile = createTempFile('test4.js', mockFileContent);

      const result = parser.replaceImportSource(testFile, 'vlocity_cmt');

      expect(result).to.not.be.null;
      const modifiedContent = result.get('modified');

      expect(modifiedContent).to.include("import pubsub from 'lightning/omnistudioPubsub'");
      expect(modifiedContent).to.include("import anotherPubsub from 'lightning/omnistudioPubsub'");
      expect(modifiedContent).to.include("import { something } from 'c/utils'");
    });

    it('should handle different quote styles in imports', () => {
      const mockFileContent = `import pubsub from "vlocity_ins/pubsub";
import OtherModule from 'vlocity_ins/otherModule';`;

      const testFile = createTempFile('test5.js', mockFileContent);

      const result = parser.replaceImportSource(testFile, 'vlocity_ins');

      expect(result).to.not.be.null;
      const modifiedContent = result.get('modified');

      expect(modifiedContent).to.include('lightning/omnistudioPubsub');
      expect(modifiedContent).to.include('c/otherModule');
    });
  });

  describe('Namespace replacement', () => {
    it('should replace namespace with "c" for non-pubsub modules', () => {
      const mockFileContent = `import { something } from 'vlocity_ins/utils';
import OtherModule from 'vlocity_ins/otherModule';`;

      const testFile = createTempFile('test6.js', mockFileContent);

      const result = parser.replaceImportSource(testFile, 'vlocity_ins');

      expect(result).to.not.be.null;
      const modifiedContent = result.get('modified');

      expect(modifiedContent).to.include("import { something } from 'c/utils'");
      expect(modifiedContent).to.include("import OtherModule from 'c/otherModule'");
    });

    it('should not modify imports that do not match the namespace', () => {
      const mockFileContent = `import pubsub from 'vlocity_ins/pubsub';
import OtherModule from 'different_namespace/module';`;

      const testFile = createTempFile('test7.js', mockFileContent);

      const result = parser.replaceImportSource(testFile, 'vlocity_ins');

      expect(result).to.not.be.null;
      const modifiedContent = result.get('modified');

      expect(modifiedContent).to.include("import pubsub from 'lightning/omnistudioPubsub'");
      expect(modifiedContent).to.include("import OtherModule from 'different_namespace/module'");
    });
  });

  describe('Utility-component skip list', () => {
    it('should leave imports targeting a registered utility component unchanged (vlocity_cmt/insUtility/labels)', () => {
      const mockFileContent = `import labels from 'vlocity_cmt/insUtility/labels';
import OtherModule from 'vlocity_cmt/otherModule';`;

      const testFile = createTempFile('skip-utility.js', mockFileContent);
      const result = parser.replaceImportSource(testFile, 'vlocity_cmt');

      expect(result).to.not.be.null;
      const modifiedContent = result.get(FileConstant.MODIFIED_CONTENT);

      // The skip-listed import must be byte-identical to the original.
      expect(modifiedContent).to.include("import labels from 'vlocity_cmt/insUtility/labels'");
      // A peer non-skip-listed import must still rewrite to the default 'c' namespace.
      expect(modifiedContent).to.include("import OtherModule from 'c/otherModule'");
    });

    it('should leave bare imports of a registered utility component unchanged (vlocity_cmt/insLabels)', () => {
      const mockFileContent = "import { LABELS } from 'vlocity_cmt/insLabels';";

      const testFile = createTempFile('skip-utility-bare.js', mockFileContent);
      const result = parser.replaceImportSource(testFile, 'vlocity_cmt');

      expect(result).to.not.be.null;
      const modifiedContent = result.get(FileConstant.MODIFIED_CONTENT);
      expect(modifiedContent).to.include("import { LABELS } from 'vlocity_cmt/insLabels'");
      expect(modifiedContent).to.not.include("'c/insLabels'");
    });

    it('should rewrite vlocity_cmt/NotAUtility to c/NotAUtility (non-skip-list behavior)', () => {
      const mockFileContent = "import x from 'vlocity_cmt/NotAUtility';";

      const testFile = createTempFile('non-skip.js', mockFileContent);
      const result = parser.replaceImportSource(testFile, 'vlocity_cmt');

      expect(result).to.not.be.null;
      const modifiedContent = result.get(FileConstant.MODIFIED_CONTENT);
      expect(modifiedContent).to.include("import x from 'c/NotAUtility'");
      expect(modifiedContent).to.not.include("'vlocity_cmt/NotAUtility'");
    });

    it('should always rewrite vlocity_cmt/pubsub to lightning/omnistudioPubsub, even if pubsub was somehow registered', () => {
      // Force a 'pubsub' entry into the registry to prove the pubsub branch wins.
      const registry = LwcPackageUtilityRegistry.getInstance();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const internalSet: Set<string> = (registry as any).utilityComponents;
      const had = internalSet.has('pubsub');
      internalSet.add('pubsub');

      try {
        const mockFileContent = "import pubsub from 'vlocity_cmt/pubsub';";
        const testFile = createTempFile('pubsub-vs-skip.js', mockFileContent);

        const result = parser.replaceImportSource(testFile, 'vlocity_cmt');

        expect(result).to.not.be.null;
        const modifiedContent = result.get(FileConstant.MODIFIED_CONTENT);
        expect(modifiedContent).to.include("import pubsub from 'lightning/omnistudioPubsub'");
        expect(modifiedContent).to.not.include("'vlocity_cmt/pubsub'");
      } finally {
        if (!had) internalSet.delete('pubsub');
      }
    });

    it('should leave the modified content byte-identical to the original when every import is on the skip list', () => {
      // If no replacement is recorded, the file body should be untouched (no diff entry produced).
      const mockFileContent = `import labels from 'vlocity_cmt/insUtility/labels';
import card from 'vlocity_cmt/insAccordion';`;

      const testFile = createTempFile('all-skipped.js', mockFileContent);
      const result = parser.replaceImportSource(testFile, 'vlocity_cmt');

      expect(result).to.not.be.null;
      const baseContent = result.get(FileConstant.BASE_CONTENT);
      const modifiedContent = result.get(FileConstant.MODIFIED_CONTENT);

      // No rewrites produced => modified content must equal the original.
      // (This is the public proxy for "the diff array does not contain an entry for the skipped import".)
      expect(modifiedContent).to.equal(baseContent);
      expect(modifiedContent).to.not.include("'c/insUtility'");
      expect(modifiedContent).to.not.include("'c/insAccordion'");
    });

    it('should preserve case when matching the registry (case-insensitive lookup)', () => {
      // 'INSUTILITY' should still hit the registry (registry lowercases on store + lookup).
      const mockFileContent = "import x from 'vlocity_cmt/INSUTILITY/labels';";
      const testFile = createTempFile('case-insensitive.js', mockFileContent);
      const result = parser.replaceImportSource(testFile, 'vlocity_cmt');

      expect(result).to.not.be.null;
      const modifiedContent = result.get(FileConstant.MODIFIED_CONTENT);
      expect(modifiedContent).to.include("'vlocity_cmt/INSUTILITY/labels'");
    });
  });

  describe('File saving', () => {
    it('should save modified content to file', () => {
      const testContent = 'test content';
      const testFile = createTempFile('test8.js', '');

      parser.saveToFile(testFile, testContent);

      const savedContent = fs.readFileSync(testFile, 'utf-8');
      expect(savedContent).to.equal(testContent);
    });

    it('should throw error when file write fails', () => {
      const testContent = 'test content';
      const invalidPath = '/invalid/path/that/does/not/exist/test.js';

      expect(() => parser.saveToFile(invalidPath, testContent)).to.throw();
    });
  });
});
