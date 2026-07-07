import { expect } from 'chai';
import { Messages, Org } from '@salesforce/core';
import sinon = require('sinon');
import { ExperienceSiteMigration } from '../../../src/migration/related/ExperienceSiteMigration';
import { FileUtil, File } from '../../../src/utils/file/fileUtil';
import { Logger } from '../../../src/utils/logger';
import { StorageUtil } from '../../../src/utils/storageUtil';
import { FileDiffUtil } from '../../../src/utils/lwcparser/fileutils/FileDiffUtil';
import { initializeDataModelService } from '../../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../../src/utils/orgUtils';
import {
  OmniScriptStorage,
  MigrationStorage,
  ExpSitePageJson,
  ExpSiteComponent,
} from '../../../src/migration/interfaces';

const Migrate = 'Migrate';
const Assess = 'Assess';

describe('ExperienceSiteMigration', () => {
  let org: Org;
  let mockMessages: Messages<string>;
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
    // Initialize data model service for tests (set to CUSTOM data model by default)
    const mockOrgDetails: OmnistudioOrgDetails = {
      packageDetails: { version: '1.0.0', namespace: 'omnistudio' },
      omniStudioOrgPermissionEnabled: false, // This makes IS_STANDARD_DATA_MODEL = false
      orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
      dataModel: 'Custom',
      hasValidNamespace: true,
      isFoundationPackage: false,
      isOmnistudioMetadataAPIEnabled: false,
      isDRVersioningEnabled: false,
    };
    initializeDataModelService(mockOrgDetails);

    org = {} as unknown as Org;

    // Mock Messages
    const getMessageStub = sinon.stub();
    getMessageStub
      .withArgs('manualInterventionForExperienceSite', sinon.match.any)
      .callsFake((key: string, args: string[]) => {
        return `${args[0]} Needs manual intervention`;
      });
    getMessageStub
      .withArgs('manualInterventionForExperienceSiteAsFailure', sinon.match.any)
      .callsFake((key: string, args: string[]) => {
        return `${args[0]} Needs manual intervention as migration failed`;
      });
    getMessageStub
      .withArgs('manualInterventionForExperienceSiteAsDuplicateKey', sinon.match.any)
      .callsFake((key: string, args: string[]) => {
        return `${args[0]} Needs manual intervention as duplicated key found`;
      });
    getMessageStub
      .withArgs('emptyTargetData')
      .returns('The Target Name is empty. Check your Experience Cloud site configuration');
    getMessageStub
      .withArgs('manualInterventionForExperienceSiteConfiguration', sinon.match.any)
      .callsFake((key: string, args: string[]) => {
        return `${args[0]} needs manual intervention for configuration`;
      });
    getMessageStub.returns('Mock message'); // fallback for any other message keys

    mockMessages = {
      getMessage: getMessageStub,
    } as unknown as Messages<string>;

    experienceSiteMigration = new ExperienceSiteMigration(testProjectPath, testNamespace, org, mockMessages);

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

  describe('assess', () => {
    it('should call process with assess mode', () => {
      // Arrange
      const processStub = sinon.stub(experienceSiteMigration, 'process').returns([]);

      // Act
      experienceSiteMigration.assess();

      // Assert
      expect(processStub.calledOnce).to.be.true;
      expect(processStub.calledWith('Assess')).to.be.true;
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
        hasOmnistudioContentWithChanges: true,
        warnings: [],
        infos: [],
        path: '/test/path/site1.json',
        diff: '[]',
        errors: [],
        status: 'Ready for migration',
      });
      processFileStub.onCall(1).returns({
        name: 'site3.json',
        hasOmnistudioContentWithChanges: false,
        warnings: [],
        infos: [],
        path: '/test/path/site3.json',
        diff: '[]',
        errors: [],
        status: 'Ready for migration',
      });

      // Act
      const result = experienceSiteMigration.processExperienceSites('/test/project', Migrate);

      // Assert
      expect(fileUtilStub.calledOnce).to.be.true;
      expect(processFileStub.calledTwice).to.be.true; // Only called for JSON files
      expect(result).to.have.length(1); // Only files with hasOmnistudioContentWithChanges: true
      expect(result[0].experienceSiteAssessmentPageInfos[0].name).to.equal('site1.json');
    });

    it('should handle errors when processing individual files', () => {
      // Arrange
      const mockFiles: File[] = [{ name: 'error.json', location: '/test/path/error.json', ext: '.json' }];
      const mockDirectoryMap = new Map<string, File[]>();
      mockDirectoryMap.set('/test/directory', mockFiles);

      sinon.stub(FileUtil, 'getAllFilesInsideDirectory').returns(mockDirectoryMap);
      sinon.stub(experienceSiteMigration, 'processExperienceSite').throws(new Error('Processing failed'));

      // Act
      const result = experienceSiteMigration.processExperienceSites('/test/project', Migrate);

      // Assert
      expect(result).to.be.an('array').that.has.length(1);
      expect(result[0].experienceSiteAssessmentPageInfos[0].name).to.equal('error.json');
      expect(result[0].experienceSiteAssessmentPageInfos[0].status).to.equal('Failed');
      expect(result[0].experienceSiteAssessmentPageInfos[0].warnings).to.include('Unknown error occurred');
      expect(result[0].experienceSiteAssessmentPageInfos[0].hasOmnistudioContentWithChanges).to.be.false;
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
      // Mock FileDiffUtil to return a non-empty diff (indicating changes were made)
      sinon.stub(FileDiffUtil.prototype, 'getFileDiff').returns([
        { old: 'line1', new: 'line1' },
        { old: 'oldline', new: 'newline' },
      ]);
    });

    it('should replace vlocityLWCOmniWrapper component with runtime_omnistudio_omniscript', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const mockOSStorage: OmniScriptStorage = {
        type: 'TestType',
        originalType: 'TestType',
        subtype: 'TestSubtype',
        originalSubtype: 'TestSubtype',
        language: 'English',
        originalLanguage: 'English',
        isDuplicate: false,
        migrationSuccess: true,
      };

      mockStorage.osStorage.set('testsubtype:english', mockOSStorage);
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Migrate);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(fsWriteStub.calledOnce).to.be.true;

      // Verify the file content was updated
      const writtenContent = fsWriteStub.firstCall.args[1];
      const parsedContent = JSON.parse(writtenContent) as ExpSitePageJson;
      const component = parsedContent.regions[1].components[0];

      expect(component.componentName).to.equal('runtime_omnistudio:omniscript');
      expect(component.componentAttributes.type).to.equal('TestType');
      expect(component.componentAttributes.subType).to.equal('TestSubtype');
      expect(component.componentAttributes.language).to.equal('English');
      expect(component.componentAttributes.direction).to.equal('ltr');
      expect(component.componentAttributes.display).to.equal('Display OmniScript on page');
      expect(component.componentAttributes.theme).to.equal('lightning'); // Preserved from original layout
    });

    it('should return hasOmnistudioContentWithChanges false when no vlocityLWCOmniWrapper found', () => {
      // Arrange
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJsonWithoutWrapper));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Migrate);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.false;
      expect(fsWriteStub.called).to.be.false; // No changes made
    });

    it('should return hasOmnistudioContentWithChanges false when regions are undefined', () => {
      // Arrange
      const siteWithoutRegions = { ...sampleExperienceSiteJson, regions: undefined };
      fsReadStub.returns(JSON.stringify(siteWithoutRegions));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Migrate);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.false;
      expect(fsWriteStub.called).to.be.false;
    });

    it('should add warning when target data is not found in storage', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Migrate);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('TestSubtype:English Needs manual intervention');
    });

    it('should add warning when migration failed in storage', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const failedOSStorage: OmniScriptStorage = {
        type: 'TestType',
        originalType: 'TestType',
        subtype: 'TestSubtype',
        originalSubtype: 'TestSubtype',
        language: 'English',
        originalLanguage: 'English',
        isDuplicate: false,
        migrationSuccess: false,
      };

      mockStorage.osStorage.set('testsubtype:english', failedOSStorage);
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Migrate);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(result.warnings).to.have.length(1);
    });

    it('should add warning when duplicate key found in storage', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const duplicateOSStorage: OmniScriptStorage = {
        type: 'TestType',
        originalType: 'TestType',
        subtype: 'TestSubtype',
        originalSubtype: 'TestSubtype',
        language: 'English',
        originalLanguage: 'English',
        isDuplicate: true,
        migrationSuccess: true,
      };

      mockStorage.osStorage.set('testsubtype:english', duplicateOSStorage);
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Migrate);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('Needs manual intervention as duplicated key found');
    });

    it('should add warning when target attribute is empty', () => {
      // Arrange
      const siteWithEmptyTarget = JSON.parse(JSON.stringify(sampleExperienceSiteJson)) as ExpSitePageJson;
      siteWithEmptyTarget.regions[1].components[0].componentAttributes.target = '';

      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(siteWithEmptyTarget));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Migrate);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('The Target Name is empty. Check your Experience Cloud site configuration');
    });

    it('should handle components array with undefined components gracefully', () => {
      // Arrange
      const siteWithUndefinedComponent = JSON.parse(JSON.stringify(sampleExperienceSiteJson)) as ExpSitePageJson;
      // Note: JSON.stringify converts undefined to null, so we need to manually set it to null to test that case
      siteWithUndefinedComponent.regions[1].components.push(null as ExpSiteComponent);

      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(siteWithUndefinedComponent));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Migrate);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      // Should not throw an error and continue processing
    });

    it('should preserve original layout value as theme in updated attributes', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const mockOSStorage: OmniScriptStorage = {
        type: 'TestType',
        originalType: 'TestType',
        subtype: 'TestSubtype',
        originalSubtype: 'TestSubtype',
        language: 'English',
        originalLanguage: 'English',
        isDuplicate: false,
        migrationSuccess: true,
      };

      mockStorage.osStorage.set('testsubtype:english', mockOSStorage);
      storageUtilStub.returns(mockStorage);

      const siteWithCustomLayout = JSON.parse(JSON.stringify(sampleExperienceSiteJson)) as ExpSitePageJson;
      siteWithCustomLayout.regions[1].components[0].componentAttributes.layout = 'customLayout';
      fsReadStub.returns(JSON.stringify(siteWithCustomLayout));

      // Act
      experienceSiteMigration.processExperienceSite(mockFile, 'Migrate');

      // Assert
      const writtenContent = fsWriteStub.firstCall.args[1];
      const parsedContent = JSON.parse(writtenContent) as ExpSitePageJson;
      const component = parsedContent.regions[1].components[0];

      expect(component.componentAttributes.theme).to.equal('customLayout');
    });

    it('should pass through prefill attribute when present in source component', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const mockOSStorage: OmniScriptStorage = {
        type: 'TestType',
        originalType: 'TestType',
        subtype: 'TestSubtype',
        originalSubtype: 'TestSubtype',
        language: 'English',
        originalLanguage: 'English',
        isDuplicate: false,
        migrationSuccess: true,
      };

      mockStorage.osStorage.set('testsubtype:english', mockOSStorage);
      storageUtilStub.returns(mockStorage);

      const siteWithPrefill = JSON.parse(JSON.stringify(sampleExperienceSiteJson)) as ExpSitePageJson;
      siteWithPrefill.regions[1].components[0].componentAttributes.prefill = '{"AccountId":"{!recordId}"}';
      fsReadStub.returns(JSON.stringify(siteWithPrefill));

      // Act
      experienceSiteMigration.processExperienceSite(mockFile, 'Migrate');

      // Assert
      const writtenContent = fsWriteStub.firstCall.args[1];
      const parsedContent = JSON.parse(writtenContent) as ExpSitePageJson;
      const component = parsedContent.regions[1].components[0];

      expect(component.componentName).to.equal('runtime_omnistudio:omniscript');
      expect(component.componentAttributes.prefill).to.equal('{"AccountId":"{!recordId}"}');
      expect(component.componentAttributes.type).to.equal('TestType');
      expect(component.componentAttributes.subType).to.equal('TestSubtype');
      expect(component.componentAttributes.language).to.equal('English');
    });

    it('should not include prefill attribute when not present in source component', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const mockOSStorage: OmniScriptStorage = {
        type: 'TestType',
        originalType: 'TestType',
        subtype: 'TestSubtype',
        originalSubtype: 'TestSubtype',
        language: 'English',
        originalLanguage: 'English',
        isDuplicate: false,
        migrationSuccess: true,
      };

      mockStorage.osStorage.set('testsubtype:english', mockOSStorage);
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      experienceSiteMigration.processExperienceSite(mockFile, 'Migrate');

      // Assert
      const writtenContent = fsWriteStub.firstCall.args[1];
      const parsedContent = JSON.parse(writtenContent) as ExpSitePageJson;
      const component = parsedContent.regions[1].components[0];

      expect(component.componentName).to.equal('runtime_omnistudio:omniscript');
      expect(component.componentAttributes.prefill).to.be.undefined;
    });

    it('should migrate FlexCard to runtime_omnistudio:flexcard with recordId and objectApiName', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      mockStorage.fcStorage.set('testcard', {
        name: 'TestCard',
        originalName: 'TestCard',
        isDuplicate: false,
        migrationSuccess: true,
      });
      storageUtilStub.returns(mockStorage);

      const siteWithFlexCard = JSON.parse(JSON.stringify(sampleExperienceSiteJson)) as ExpSitePageJson;
      siteWithFlexCard.regions[1].components[0].componentAttributes.target = 'c:cfTestCard';
      fsReadStub.returns(JSON.stringify(siteWithFlexCard));

      // Act
      experienceSiteMigration.processExperienceSite(mockFile, 'Migrate');

      // Assert
      const writtenContent = fsWriteStub.firstCall.args[1];
      const parsedContent = JSON.parse(writtenContent) as ExpSitePageJson;
      const component = parsedContent.regions[1].components[0];

      expect(component.componentName).to.equal('runtime_omnistudio:flexcard');
      expect(component.componentAttributes.flexcardName).to.equal('TestCard');
      expect(component.componentAttributes.recordId).to.equal('{!recordId}');
      expect(component.componentAttributes.objectApiName).to.equal('{!objectApiName}');
      // Old attributes should be removed
      expect(component.componentAttributes.target).to.be.undefined;
      expect(component.componentAttributes.layout).to.be.undefined;
    });
  });

  describe('Assess Mode Tests', () => {
    let mockFile: File;
    let fsReadStub: sinon.SinonStub;
    let fsWriteStub: sinon.SinonStub;
    let storageUtilStub: sinon.SinonStub;

    beforeEach(() => {
      mockFile = {
        name: 'assess-test.json',
        location: '/test/path/assess-test.json',
        ext: '.json',
      };

      // Stub fs methods
      fsReadStub = sinon.stub();
      fsWriteStub = sinon.stub();
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      sinon.stub(require('fs'), 'readFileSync').value(fsReadStub);
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      sinon.stub(require('fs'), 'writeFileSync').value(fsWriteStub);

      storageUtilStub = sinon.stub(StorageUtil, 'getOmnistudioAssessmentStorage');
      // Mock FileDiffUtil to return a non-empty diff (indicating changes were made)
      sinon.stub(FileDiffUtil.prototype, 'getFileDiff').returns([
        { old: 'line1', new: 'line1' },
        { old: 'oldline', new: 'newline' },
      ]);
    });

    it('should use assessment storage instead of migration storage in assess mode', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const mockOSStorage: OmniScriptStorage = {
        type: 'TestType',
        originalType: 'TestType',
        subtype: 'TestSubtype',
        originalSubtype: 'TestSubtype',
        language: 'English',
        originalLanguage: 'English',
        isDuplicate: false,
        migrationSuccess: true,
      };

      mockStorage.osStorage.set('testsubtype:english', mockOSStorage);
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Assess);

      // Assert
      expect(storageUtilStub.calledOnce).to.be.true;
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(result.warnings).to.have.length(0);
    });

    it('should generate warnings when assessment storage has missing data', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };
      // Empty storage - no data for the target
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Assess);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('TestSubtype:English Needs manual intervention');
    });

    it('should generate warnings when assessment storage has migration failure', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const failedOSStorage: OmniScriptStorage = {
        type: 'FailedType',
        originalType: 'FailedType',
        subtype: 'FailedSubtype',
        originalSubtype: 'FailedSubtype',
        language: 'English',
        originalLanguage: 'English',
        isDuplicate: false,
        migrationSuccess: false,
      };

      mockStorage.osStorage.set('testsubtype:english', failedOSStorage);
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Assess);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('Needs manual intervention as migration failed');
    });

    it('should generate warnings when assessment storage has duplicate keys', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const duplicateOSStorage: OmniScriptStorage = {
        type: 'DuplicateType',
        originalType: 'DuplicateType',
        subtype: 'DuplicateSubtype',
        originalSubtype: 'DuplicateSubtype',
        language: 'English',
        originalLanguage: 'English',
        isDuplicate: true,
        migrationSuccess: true,
      };

      mockStorage.osStorage.set('testsubtype:english', duplicateOSStorage);
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Assess);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('Needs manual intervention as duplicated key found');
    });

    it('should return false for hasOmnistudioContentWithChanges when no wrapper component found in assess mode', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJsonWithoutWrapper));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Assess);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.false;
      expect(result.warnings).to.have.length(0);
      expect(fsWriteStub.called).to.be.false;
    });

    it('should handle multiple components with different storage results in assess mode', () => {
      // Arrange
      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      // One successful, one duplicate
      const successfulStorage: OmniScriptStorage = {
        type: 'SuccessType',
        originalType: 'SuccessType',
        subtype: 'SuccessSubtype',
        originalSubtype: 'SuccessSubtype',
        language: 'English',
        originalLanguage: 'English',
        isDuplicate: false,
        migrationSuccess: true,
      };

      const duplicateStorage: OmniScriptStorage = {
        type: 'DuplicateType',
        originalType: 'DuplicateType',
        subtype: 'DuplicateSubtype',
        originalSubtype: 'DuplicateSubtype',
        language: 'English',
        originalLanguage: 'English',
        isDuplicate: true,
        migrationSuccess: true,
      };

      mockStorage.osStorage.set('successsubtype:english', successfulStorage);
      mockStorage.osStorage.set('duplicatesubtype:english', duplicateStorage);
      storageUtilStub.returns(mockStorage);

      // Create a site with multiple wrapper components
      const multiComponentSite = JSON.parse(JSON.stringify(sampleExperienceSiteJson)) as ExpSitePageJson;
      multiComponentSite.regions[1].components.push({
        componentAttributes: {
          layout: 'lightning',
          params: '',
          standAlone: false,
          target: 'DuplicateType:DuplicateSubtype:English',
        },
        componentName: 'vlocity_ins:vlocityLWCOmniWrapper',
        id: 'second-component-id',
        renderPriority: 'NEUTRAL',
        renditionMap: {},
        type: 'component',
      });

      // Update first component target to match successful storage
      multiComponentSite.regions[1].components[0].componentAttributes.target = 'SuccessType:SuccessSubtype:English';

      fsReadStub.returns(JSON.stringify(multiComponentSite));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Assess);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(result.warnings).to.have.length(1); // Only the duplicate should generate a warning
      expect(result.warnings[0]).to.include('DuplicateSubtype:English');
      expect(result.warnings[0]).to.include('duplicated key found');
    });

    it('should handle assessment storage gracefully when empty', () => {
      // Arrange
      const emptyStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };
      storageUtilStub.returns(emptyStorage);
      fsReadStub.returns(JSON.stringify(sampleExperienceSiteJson));

      // Act
      const result = experienceSiteMigration.processExperienceSite(mockFile, Assess);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('Needs manual intervention');
      expect(result.status).to.equal('Needs manual intervention');
    });
  });

  describe('Standard Data Model Tests', () => {
    let mockFile: File;
    let fsReadStub: sinon.SinonStub;
    let fsWriteStub: sinon.SinonStub;
    let storageUtilStub: sinon.SinonStub;
    let standardDataModelExperienceSiteMigration: ExperienceSiteMigration;

    beforeEach(() => {
      // Initialize data model service for standard data model tests
      const mockOrgDetails: OmnistudioOrgDetails = {
        packageDetails: { version: '1.0.0', namespace: 'omnistudio' },
        omniStudioOrgPermissionEnabled: true, // This makes IS_STANDARD_DATA_MODEL = true
        orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
        dataModel: 'Standard',
        hasValidNamespace: true,
        isFoundationPackage: false,
        isOmnistudioMetadataAPIEnabled: false,
        isDRVersioningEnabled: false,
      };
      initializeDataModelService(mockOrgDetails);

      // Create a new instance after initializing the data model service
      standardDataModelExperienceSiteMigration = new ExperienceSiteMigration(
        testProjectPath,
        testNamespace,
        org,
        mockMessages
      );

      mockFile = {
        name: 'standard-test.json',
        location: '/test/path/standard-test.json',
        ext: '.json',
      };

      // Stub fs methods
      fsReadStub = sinon.stub();
      fsWriteStub = sinon.stub();
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      sinon.stub(require('fs'), 'readFileSync').value(fsReadStub);
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      sinon.stub(require('fs'), 'writeFileSync').value(fsWriteStub);

      storageUtilStub = sinon.stub(StorageUtil, 'getOmnistudioMigrationStorage');
      // Mock FileDiffUtil to return a non-empty diff (indicating changes were made)
      sinon.stub(FileDiffUtil.prototype, 'getFileDiff').returns([
        { old: 'line1', new: 'line1' },
        { old: 'oldline', new: 'newline' },
      ]);
    });

    it('should process standard data model OmniScript component successfully', () => {
      // Arrange
      const standardOmniScriptJson = {
        appPageId: '6cf4d1f4-c8b0-4643-be55-0f94edf517ea',
        componentName: 'siteforce:sldsOneColLayout',
        regions: [
          {
            components: [
              {
                componentAttributes: {
                  type: 'TestType',
                  subType: 'TestSubtype',
                  language: 'English',
                },
                componentName: 'runtime_omnistudio:omniscript',
                id: '00eea22e-5961-4bbb-af5f-2fa27b8d555f',
                type: 'component',
              },
            ],
            regionName: 'content',
            type: 'region',
          },
        ],
      };

      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const mockOSStandardStorage: OmniScriptStorage = {
        type: 'UpdatedType',
        originalType: 'UpdatedType',
        subtype: 'UpdatedSubtype',
        originalSubtype: 'UpdatedSubtype',
        language: 'Spanish',
        originalLanguage: 'Spanish',
        isDuplicate: false,
        migrationSuccess: true,
      };

      mockStorage.osStandardStorage.set(
        JSON.stringify({ type: 'TestType', subtype: 'TestSubtype', language: 'English' }),
        mockOSStandardStorage
      );
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(standardOmniScriptJson));

      // Act
      const result = standardDataModelExperienceSiteMigration.processExperienceSite(mockFile, Migrate);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(fsWriteStub.calledOnce).to.be.true;

      // Verify the file content was updated
      const writtenContent = fsWriteStub.firstCall.args[1];
      const parsedContent = JSON.parse(writtenContent) as ExpSitePageJson;
      const component = parsedContent.regions[0].components[0];

      expect(component.componentName).to.equal('runtime_omnistudio:omniscript');
      expect(component.componentAttributes.type).to.equal('UpdatedType');
      expect(component.componentAttributes.subType).to.equal('UpdatedSubtype');
      expect(component.componentAttributes.language).to.equal('Spanish');
    });

    it('should add warning when standard data model OmniScript has missing type attribute', () => {
      // Arrange
      const siteWithMissingType = {
        appPageId: '6cf4d1f4-c8b0-4643-be55-0f94edf517ea',
        componentName: 'siteforce:sldsOneColLayout',
        regions: [
          {
            components: [
              {
                componentAttributes: {
                  subType: 'TestSubtype',
                  language: 'English',
                  // Missing 'type' attribute
                },
                componentName: 'runtime_omnistudio:omniscript',
                id: '00eea22e-5961-4bbb-af5f-2fa27b8d555f',
                type: 'component',
              },
            ],
            regionName: 'content',
            type: 'region',
          },
        ],
      };

      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(siteWithMissingType));

      // Act
      const result = standardDataModelExperienceSiteMigration.processExperienceSite(mockFile, Migrate);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('standard-test.json needs manual intervention for configuration');
      expect(result.status).to.equal('Skipped');
    });

    it('should process standard data model FlexCard component successfully', () => {
      // Arrange
      const standardFlexCardJson = {
        appPageId: '6cf4d1f4-c8b0-4643-be55-0f94edf517ea',
        componentName: 'siteforce:sldsOneColLayout',
        regions: [
          {
            components: [
              {
                componentAttributes: {
                  flexcardName: 'TestFlexCard',
                },
                componentName: 'runtime_omnistudio:flexcard',
                id: '00eea22e-5961-4bbb-af5f-2fa27b8d555f',
                type: 'component',
              },
            ],
            regionName: 'content',
            type: 'region',
          },
        ],
      };

      const mockStorage: MigrationStorage = {
        osStorage: new Map<string, OmniScriptStorage>(),
        osStandardStorage: new Map<string, OmniScriptStorage>(),
        fcStorage: new Map(),
      };

      const mockFlexCardStorage = {
        name: 'UpdatedFlexCard',
        originalName: 'TestFlexCard',
        isDuplicate: false,
        migrationSuccess: true,
      };

      mockStorage.fcStorage.set('testflexcard', mockFlexCardStorage);
      storageUtilStub.returns(mockStorage);
      fsReadStub.returns(JSON.stringify(standardFlexCardJson));

      // Act
      const result = standardDataModelExperienceSiteMigration.processExperienceSite(mockFile, Migrate);

      // Assert
      expect(result.hasOmnistudioContentWithChanges).to.be.true;
      expect(fsWriteStub.calledOnce).to.be.true;

      // Verify the file content was updated
      const writtenContent = fsWriteStub.firstCall.args[1];
      const parsedContent = JSON.parse(writtenContent) as ExpSitePageJson;
      const component = parsedContent.regions[0].components[0];

      expect(component.componentName).to.equal('runtime_omnistudio:flexcard');
      expect(component.componentAttributes.flexcardName).to.equal('UpdatedFlexCard');
    });
  });
});
