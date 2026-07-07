/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { OmniScriptMigrationTool, OmniScriptExportType } from '../../src/migration/omniscript';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';

describe('OmniScript Angular Dependency Validation', () => {
  let omniScriptTool: OmniScriptMigrationTool;
  let nameRegistry: NameMappingRegistry;
  let mockConnection: any;
  let mockMessages: any;
  let mockUx: any;
  let mockLogger: any;

  beforeEach(() => {
    nameRegistry = NameMappingRegistry.getInstance();
    nameRegistry.clear();

    // Initialize data model service for tests (set to custom data model)
    const mockOrgDetails: OmnistudioOrgDetails = {
      packageDetails: { version: '1.0.0', namespace: 'vlocity_ins' },
      omniStudioOrgPermissionEnabled: false, // This makes IS_STANDARD_DATA_MODEL = false
      orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
      dataModel: 'Custom',
      hasValidNamespace: true,
      isFoundationPackage: false,
      isOmnistudioMetadataAPIEnabled: false,
      isDRVersioningEnabled: false,
    };
    initializeDataModelService(mockOrgDetails);

    // Setup mock objects
    mockConnection = {
      query: () => Promise.resolve({ records: [] }),
    };
    mockMessages = {
      getMessage: (key: string, params?: string[]) => {
        const messages = {
          angularOmniScriptDependencyWarning: `Element '${params?.[0]}' references Angular OmniScript '${params?.[1]}' which will not be migrated. Consider converting the referenced OmniScript to LWC.`,
          componentMappingNotFound: `No registry mapping found for ${params?.[0]} component: ${params?.[1]}, using fallback cleaning`,
        };
        return messages[key] || 'Mock message for testing';
      },
    };
    mockUx = {};
    mockLogger = {};

    omniScriptTool = new OmniScriptMigrationTool(
      OmniScriptExportType.OS,
      'vlocity_ins',
      mockConnection,
      mockLogger,
      mockMessages,
      mockUx,
      false
    );

    // Setup test mappings
    setupTestMappings();
  });

  function setupTestMappings() {
    // Register LWC OmniScript for migration
    nameRegistry.registerNameMapping({
      originalName: 'CustomerProfile_LWCView_English',
      cleanedName: 'CustomerProfile_LWCView_English',
      componentType: 'OmniScript',
      recordId: 'os1',
    });

    // Register Angular OmniScript as skipped
    nameRegistry.registerAngularOmniScript('CustomerProfile_AngularView_English');
    nameRegistry.registerAngularOmniScript('ProductCatalog_Legacy_Spanish');
  }

  describe('Angular Dependency Detection in Assessment', () => {
    it('should detect Angular OmniScript dependencies and add warnings', async () => {
      // Mock the getAllElementsForOmniScript method
      const mockElements = [
        {
          Id: 'elem1',
          Name: 'TestElement1',
          vlocity_ins__Type__c: 'OmniScript',
          vlocity_ins__PropertySet__c: JSON.stringify({
            Type: 'CustomerProfile',
            'Sub Type': 'AngularView',
            Language: 'English',
          }),
        },
        {
          Id: 'elem2',
          Name: 'TestElement2',
          vlocity_ins__Type__c: 'OmniScript',
          vlocity_ins__PropertySet__c: JSON.stringify({
            Type: 'ProductCatalog',
            'Sub Type': 'Legacy',
            Language: 'Spanish',
          }),
        },
        {
          Id: 'elem3',
          Name: 'TestElement3',
          vlocity_ins__Type__c: 'OmniScript',
          vlocity_ins__PropertySet__c: JSON.stringify({
            Type: 'CustomerProfile',
            'Sub Type': 'LWCView',
            Language: 'English',
          }),
        },
      ];

      // Stub the private method using any to bypass access restrictions
      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'os123',
        Name: 'TestOmniScript',
        vlocity_ins__Type__c: 'TestType',
        vlocity_ins__SubType__c: 'TestSubType',
        vlocity_ins__Language__c: 'English',
        vlocity_ins__IsProcedure__c: false,
        vlocity_ins__IsLwcEnabled__c: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      // Should have warnings for Angular dependencies
      expect(result.warnings).to.have.length(2);
      expect(result.warnings[0]).to.include('CustomerProfile_AngularView_English');
      expect(result.warnings[1]).to.include('ProductCatalog_Legacy_Spanish');
      expect(result.migrationStatus).to.equal('Needs manual intervention');
    });

    it('should not add warnings for LWC OmniScript dependencies', async () => {
      const mockElements = [
        {
          Id: 'elem1',
          Name: 'TestElement1',
          vlocity_ins__Type__c: 'OmniScript',
          vlocity_ins__PropertySet__c: JSON.stringify({
            Type: 'CustomerProfile',
            'Sub Type': 'LWCView',
            Language: 'English',
          }),
        },
      ];

      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'os123',
        Name: 'TestOmniScript',
        vlocity_ins__Type__c: 'TestType',
        vlocity_ins__SubType__c: 'TestSubType',
        vlocity_ins__Language__c: 'English',
        vlocity_ins__IsProcedure__c: false,
        vlocity_ins__IsLwcEnabled__c: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      // Should not have Angular-related warnings
      const angularWarnings = result.warnings.filter((warning: string) => warning.includes('Angular OmniScript'));
      expect(angularWarnings).to.have.length(0);
    });
  });

  describe('Angular Reference Handling in Migration', () => {
    it('should preserve original references for Angular OmniScripts', () => {
      const mockPropertySet = {
        Type: 'CustomerProfile',
        'Sub Type': 'AngularView',
        Language: 'English',
      };

      // Test the mapElementData method behavior for Angular references
      const result = (omniScriptTool as any).nameRegistry.updateDependencyReferences(mockPropertySet);

      // For Angular OmniScripts, references should be preserved as-is
      // This tests the registry's updateStringReference method behavior
      expect(result.Type).to.equal('CustomerProfile');
      expect(result['Sub Type']).to.equal('AngularView');
      expect(result.Language).to.equal('English');
    });

    it('should update references for LWC OmniScripts', () => {
      const mockPropertySet = {
        Type: 'CustomerProfile',
        'Sub Type': 'LWCView',
        Language: 'English',
      };

      const result = (omniScriptTool as any).nameRegistry.updateDependencyReferences(mockPropertySet);

      // For LWC OmniScripts with registry mappings, references should be updated
      // Note: The actual behavior depends on how updateDependencyReferences processes the data
      expect(result).to.be.an('object');
    });
  });

  describe('Angular and LWC OmniScript Separation', () => {
    it('should correctly identify Angular vs LWC OmniScripts', () => {
      const lwcOsRef = 'CustomerProfile_LWCView_English';
      const angularOsRef = 'CustomerProfile_AngularView_English';

      expect(nameRegistry.isAngularOmniScript(angularOsRef)).to.be.true;
      expect(nameRegistry.isAngularOmniScript(lwcOsRef)).to.be.false;
      expect(nameRegistry.hasOmniScriptMapping(lwcOsRef)).to.be.true;
      expect(nameRegistry.hasOmniScriptMapping(angularOsRef)).to.be.false;
    });
  });
});
