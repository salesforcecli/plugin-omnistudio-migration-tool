import { expect } from '@salesforce/command/lib/test';
import { Org } from '@salesforce/core';
import sinon = require('sinon');
import { ExperienceSiteMigration } from '../../../src/migration/related/ExperienceSiteMigration';
import { FileUtil, File } from '../../../src/utils/file/fileUtil';
import { Logger } from '../../../src/utils/logger';
import { StorageUtil } from '../../../src/utils/storageUtil';
import { FileDiffUtil } from '../../../src/utils/lwcparser/fileutils/FileDiffUtil';
import {
  OmniScriptStorage,
  MigrationStorage,
  ExpSitePageJson,
  ExpSiteComponent,
} from '../../../src/migration/interfaces';

describe('ExperienceSiteMigration', () => {
  let org: Org;
  let experienceSiteMigration: ExperienceSiteMigration;
  const testProjectPath = '/test/project/path';
  const testNamespace = 'vlocity_ins';

  // Sample experience site JSON with vlocityLWCOmniWrapper component
  const sampleExperienceSiteJson = {
    appPageId: '6cf4d1f4-c8b0-4643-be55-0f94edf517ea',
    componentName: 'siteforce:sldsOneColLayout',
    dataProviders: [],
    id: 'b29b5cd3-f3c4-4207-8952-1252954dda46',
    label: 'lwcos',
    regions: [
      {
        id: '2d46bba8-5b79-4ce3-9677-2663e1207a31',
        regionName: 'header',
        type: 'region',
      },
      {
        components: [
          {
            componentAttributes: {
              layout: 'lightning',
              params: '',
              standAlone: false,
              target: 'TestType:TestSubtype:English',
            },
            componentName: 'vlocity_ins:vlocityLWCOmniWrapper',
            id: '00eea22e-5961-4bbb-af5f-2fa27b8d555f',
            renderPriority: 'NEUTRAL',
            renditionMap: {},
            type: 'component',
          },
        ],
        id: '0981711a-8ecc-4135-9ed6-b55bc57730db',
        regionName: 'content',
        type: 'region',
      },
    ],
    themeLayoutType: 'Inner',
    type: 'view',
    viewType: 'custom-lwcos',
  };

  // Sample experience site JSON without vlocityLWCOmniWrapper component
  const sampleExperienceSiteJsonWithoutWrapper = {
    appPageId: '6cf4d1f4-c8b0-4643-be55-0f94edf517ea',
    componentName: 'siteforce:sldsOneColLayout',
    regions: [
      {
        components: [
          {
            componentName: 'forceCommunity:seoAssistant',
            id: 'c5231713-5029-4cbe-908a-730ea96a30e1',
            type: 'component',
          },
        ],
        regionName: 'content',
        type: 'region',
      },
    ],
  };

  beforeEach(() => {
    org = {} as unknown as Org;
    experienceSiteMigration = new ExperienceSiteMigration(testProjectPath, testNamespace, org);

    // Mock Logger
    sinon.stub(Logger, 'logVerbose');
    sinon.stub(Logger, 'info');
    sinon.stub(Logger, 'error');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('processObjectType', () => {
    it('should return the correct object type', () => {
      // Act
      const result = experienceSiteMigration.processObjectType();

      // Assert
      expect(result).to.equal('expsites');
    });
  });

  // Note: migrate method test removed due to shell stubbing complexity

  describe('processExperienceSites', () => {
    it('should process all JSON files in the experience sites directory', () => {
      // Arrange
      const mockFiles: File[] = [
        { name: 'site1.json', location: '/test/path/site1.json', ext: '.json' },
        { name: 'site2.xml', location: '/test/path/site2.xml', ext: '.xml' },
        { name: 'site3.json', location: '/test/path/site3.json', ext: '.json' },
      ];
      const mockDirectoryMap = new Map<string, File[]>();
      mockDirectoryMap.set('/test/directory', mockFiles);

      const fileUtilStub = sinon.stub(FileUtil, 'getAllFilesInsideDirectory').returns(mockDirectoryMap);
      const processFileStub = sinon.stub(experienceSiteMigration, 'processExperienceSite');

      processFileStub.onCall(0).returns({
        name: 'site1.json',
        hasOmnistudioContent: true,
        warnings: [],
        infos: [],
        path: '/test/path/site1.json',
        diff: '[]',
      });
      processFileStub.onCall(1).returns({
        name: 'site3.json',
        hasOmnistudioContent: false,
        warnings: [],
        infos: [],
        path: '/test/path/site3.json',
        diff: '[]',
      });

      // Act
      const result = experienceSiteMigration.processExperienceSites('/test/project');

      // Assert
      expect(fileUtilStub.calledOnce).to.be.true;
      expect(processFileStub.calledTwice).to.be.true; // Only called for JSON files
      expect(result).to.have.length(1); // Only files with hasOmnistudioContent: true
      expect(result[0].name).to.equal('site1.json');
    });

    it('should handle errors when processing individual files', () => {
      // Arrange
      const mockFiles: File[] = [{ name: 'error.json', location: '/test/path/error.json', ext: '.json' }];
      const mockDirectoryMap = new Map<string, File[]>();
      mockDirectoryMap.set('/test/directory', mockFiles);

      sinon.stub(FileUtil, 'getAllFilesInsideDirectory').returns(mockDirectoryMap);
      sinon.stub(experienceSiteMigration, 'processExperienceSite').throws(new Error('Processing failed'));

      // Act
      const result = experienceSiteMigration.processExperienceSites('/test/project');

      // Assert
      expect(result).to.be.an('array').that.is.empty;
      expect((Logger.error as sinon.SinonStub).called).to.be.true;
    });
  });

  describe('processExperienceSite', () => {
    let mockFile: File;
    let fsReadStub: sinon.SinonStub;
    let fsWriteStub: sinon.SinonStub;
    let storageUtilStub: sinon.SinonStub;

    beforeEach(() => {
      mockFile = {
        name: 'test.json',
        location: '/test/path/test.json',
        ext: '.json',
      };

      // Stub fs methods using require approach (needed for proper stubbing)
      fsReadStub = sinon.stub();
      fsWriteStub = sinon.stub();
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      sinon.stub(require('fs'), 'readFileSync').value(fsReadStub);
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      sinon.stub(require('fs'), 'writeFileSync').value(fsWriteStub);

      storageUtilStub = sinon.stub(StorageUtil, 'getOmnistudioMigrationStorage');
      sinon.stub(FileDiffUtil.prototype, 'getFileDiff').returns([]);
    });

    it('should replace vlocityLWCOmniWrapper component with runtime_omnistudio_omniscript', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const mockOSStorage: OmniScriptStorage = {
        type: 'TestType',
        subtype: 'TestSubtype',
        language: 'English',
        isDuplicate: false,
        migrationSuccess: true,
      };

      mockStorage.osStorage.set('TestSubtype:English', mockOSStorage);
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile);

      // Assert
      expect(result.hasOmnistudioContent).to.be.true;
      expect(fsWriteStub.calledOnce).to.be.true;

      // Verify the file content was updated
      const writtenContent = fsWriteStub.firstCall.args[1];
      const parsedContent = JSON.parse(writtenContent) as ExpSitePageJson;
      const component = parsedContent.regions[1].components[0];

      expect(component.componentName).to.equal('runtime_omnistudio_omniscript');
      expect(component.componentAttributes.type).to.equal('TestType');
      expect(component.componentAttributes.subType).to.equal('TestSubtype');
      expect(component.componentAttributes.language).to.equal('English');
      expect(component.componentAttributes.direction).to.equal('ltr');
      expect(component.componentAttributes.display).to.equal('Display button to open Omniscript');
      expect(component.componentAttributes.theme).to.equal('lightning'); // Preserved from original layout
    });

    it('should return hasOmnistudioContent false when no vlocityLWCOmniWrapper found', () => {
      // Arrange
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJsonWithoutWrapper));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile);

      // Assert
      expect(result.hasOmnistudioContent).to.be.false;
      expect(fsWriteStub.called).to.be.false; // No changes made
    });

    it('should return hasOmnistudioContent false when regions are undefined', () => {
      // Arrange
      const siteWithoutRegions = { ...sampleExperienceSiteJson, regions: undefined };
      fsReadStub.returns(JSON.stringify(siteWithoutRegions));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile);

      // Assert
      expect(result.hasOmnistudioContent).to.be.false;
      expect(fsWriteStub.called).to.be.false;
    });

    it('should add warning when target data is not found in storage', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile);

      // Assert
      expect(result.hasOmnistudioContent).to.be.true;
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('TestSubtype:English needs manual intervention');
    });

    it('should add warning when migration failed in storage', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const failedOSStorage: OmniScriptStorage = {
        type: 'TestType',
        subtype: 'TestSubtype',
        language: 'English',
        isDuplicate: false,
        migrationSuccess: false,
      };

      mockStorage.osStorage.set('TestSubtype:English', failedOSStorage);
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile);

      // Assert
      expect(result.hasOmnistudioContent).to.be.true;
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('needs manual intervention as migration failed');
    });

    it('should add warning when duplicate key found in storage', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const duplicateOSStorage: OmniScriptStorage = {
        type: 'TestType',
        subtype: 'TestSubtype',
        language: 'English',
        isDuplicate: true,
        migrationSuccess: true,
      };

      mockStorage.osStorage.set('TestSubtype:English', duplicateOSStorage);
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile);

      // Assert
      expect(result.hasOmnistudioContent).to.be.true;
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('needs manual intervention as duplicated key found');
    });

    it('should add warning when target attribute is empty', () => {
      // Arrange
      const siteWithEmptyTarget = JSON.parse(JSON.stringify(sampleExperienceSiteJson)) as ExpSitePageJson;
      siteWithEmptyTarget.regions[1].components[0].componentAttributes.target = '';

      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(siteWithEmptyTarget));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile);

      // Assert
      expect(result.hasOmnistudioContent).to.be.true;
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('Target exists as empty string');
    });

    it('should handle components array with undefined components gracefully', () => {
      // Arrange
      const siteWithUndefinedComponent = JSON.parse(JSON.stringify(sampleExperienceSiteJson)) as ExpSitePageJson;
      // Note: JSON.stringify converts undefined to null, so we need to manually set it to null to test that case
      siteWithUndefinedComponent.regions[1].components.push(null as ExpSiteComponent);

      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(siteWithUndefinedComponent));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile);

      // Assert
      expect(result.hasOmnistudioContent).to.be.true;
      // Should not throw an error and continue processing
    });

    it('should preserve original layout value as theme in updated attributes', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const mockOSStorage: OmniScriptStorage = {
        type: 'TestType',
        subtype: 'TestSubtype',
        language: 'English',
        isDuplicate: false,
        migrationSuccess: true,
      };

      mockStorage.osStorage.set('TestSubtype:English', mockOSStorage);
      storageUtilStub.returns(mockStorage);

      const siteWithCustomLayout = JSON.parse(JSON.stringify(sampleExperienceSiteJson)) as ExpSitePageJson;
      siteWithCustomLayout.regions[1].components[0].componentAttributes.layout = 'customLayout';
      fsReadStub.returns(JSON.stringify(siteWithCustomLayout));

      // Act
      experienceSiteMigration.processExperienceSite(mockFile);

      // Assert
      const writtenContent = fsWriteStub.firstCall.args[1];
      const parsedContent = JSON.parse(writtenContent) as ExpSitePageJson;
      const component = parsedContent.regions[1].components[0];

      expect(component.componentAttributes.theme).to.equal('customLayout');
    });
  });
});
