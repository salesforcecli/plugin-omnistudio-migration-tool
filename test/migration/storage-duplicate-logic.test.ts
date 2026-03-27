/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { expect } from 'chai';
import { StorageUtil } from '../../src/utils/storageUtil';
import { OmniScriptMigrationTool, OmniScriptExportType } from '../../src/migration/omniscript';
import { CardMigrationTool } from '../../src/migration/flexcard';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';

describe('Storage Duplicate Logic - Multiple Versions Handling', () => {
  let mockConnection: any;
  let mockMessages: any;
  let mockUx: any;
  let mockLogger: any;
  let nameRegistry: NameMappingRegistry;

  beforeEach(() => {
    nameRegistry = NameMappingRegistry.getInstance();
    nameRegistry.clear();

    // Initialize data model service
    const mockOrgDetails: OmnistudioOrgDetails = {
      packageDetails: { version: '1.0.0', namespace: 'vlocity_ins' },
      omniStudioOrgPermissionEnabled: false,
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
      getMessage: (key: string, params?: string[]): string => {
        const messages: Record<string, string> = {
          updatingStorageForOmniscipt: `Updating storage for ${params?.[0]}`,
          nameMappingUndefined: 'Name mapping is undefined',
          keyAlreadyInStorage: `Key already exists in storage for ${params?.[0]}: ${params?.[1]}`,
          missingInfo: 'Missing information',
          errorWhileProcessingFlexcardStorage: 'Error while processing FlexCard storage',
          flexcardStorageProcessingStarted: 'FlexCard storage processing started',
        };
        return messages[key] || 'Mock message for testing';
      },
    };
    mockUx = {};
    mockLogger = {};

    // Reset storage instances to ensure clean state between tests
    const migrationStorage = StorageUtil.getOmnistudioMigrationStorage();
    migrationStorage.osStorage.clear();
    migrationStorage.fcStorage.clear();

    const assessmentStorage = StorageUtil.getOmnistudioAssessmentStorage();
    assessmentStorage.osStorage.clear();
    assessmentStorage.fcStorage.clear();
  });

  describe('OmniScript Storage - Assessment Path', () => {
    it('should NOT set isDuplicate for same OmniScript with multiple versions', () => {
      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.OS,
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        true // allVersions = true
      );

      const osAssessmentInfos = [
        {
          name: 'CustomerProfile_AccountView_English_1',
          oldName: 'CustomerProfile_AccountView_English_1',
          id: 'op1',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'CustomerProfile',
            oldSubtype: 'AccountView',
            oldLanguage: 'English',
            newType: 'CustomerProfile',
            newSubType: 'AccountView',
            newLanguage: 'English',
          },
        },
        {
          name: 'CustomerProfile_AccountView_English_2',
          oldName: 'CustomerProfile_AccountView_English_2',
          id: 'op2',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'CustomerProfile',
            oldSubtype: 'AccountView',
            oldLanguage: 'English',
            newType: 'CustomerProfile',
            newSubType: 'AccountView',
            newLanguage: 'English',
          },
        },
      ];

      // Process assessment storage
      (omniScriptTool as any).updateStorageForOmniscriptAssessment(osAssessmentInfos);

      const storage = StorageUtil.getOmnistudioAssessmentStorage();
      const key = 'customerprofileaccountviewenglish'; // Lowercase cleaned key

      expect(storage.osStorage.has(key)).to.be.true;
      const storedValue = storage.osStorage.get(key);

      // Should NOT be marked as duplicate (same OmniScript, different versions)
      expect(storedValue.isDuplicate).to.be.false;
      expect(storedValue.originalType).to.equal('CustomerProfile');
      expect(storedValue.originalSubtype).to.equal('AccountView');
      expect(storedValue.originalLanguage).to.equal('English');
    });

    it('should set isDuplicate for DIFFERENT OmniScripts with same lowercased key', () => {
      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.OS,
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        true // allVersions = true
      );

      const osAssessmentInfos = [
        {
          name: 'Aa_Bb_English_1',
          oldName: 'Aa_Bb_English_1',
          id: 'op1',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'Aa', // Type="Aa", Subtype="Bb" -> key="aabbenglish"
            oldSubtype: 'Bb',
            oldLanguage: 'English',
            newType: 'Aa',
            newSubType: 'Bb',
            newLanguage: 'English',
          },
        },
        {
          name: 'AaB_b_English_1',
          oldName: 'AaB_b_English_1',
          id: 'op2',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'AaB', // Type="AaB", Subtype="b" -> key="aabbenglish" (SAME KEY!)
            oldSubtype: 'b',
            oldLanguage: 'English',
            newType: 'AaB',
            newSubType: 'b',
            newLanguage: 'English',
          },
        },
      ];

      // Process assessment storage
      (omniScriptTool as any).updateStorageForOmniscriptAssessment(osAssessmentInfos);

      const storage = StorageUtil.getOmnistudioAssessmentStorage();
      const key = 'aabbenglish'; // Lowercase key - SAME for both!

      expect(storage.osStorage.has(key)).to.be.true;
      const storedValue = storage.osStorage.get(key);

      // SHOULD be marked as duplicate (different OmniScripts produce same lowercased key)
      expect(storedValue.isDuplicate).to.be.true;
    });

    it('should NOT set isDuplicate when allVersions=false for same OmniScript', () => {
      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.OS,
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        false // allVersions = false (only active version)
      );

      const osAssessmentInfos = [
        {
          name: 'CustomerProfile_AccountView_English_1',
          oldName: 'CustomerProfile_AccountView_English_1',
          id: 'op1',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'CustomerProfile',
            oldSubtype: 'AccountView',
            oldLanguage: 'English',
            newType: 'CustomerProfile',
            newSubType: 'AccountView',
            newLanguage: 'English',
          },
        },
      ];

      // Process assessment storage
      (omniScriptTool as any).updateStorageForOmniscriptAssessment(osAssessmentInfos);

      const storage = StorageUtil.getOmnistudioAssessmentStorage();
      const key = 'customerprofileaccountviewenglish';

      expect(storage.osStorage.has(key)).to.be.true;
      const storedValue = storage.osStorage.get(key);

      // Should NOT be marked as duplicate (only one version)
      expect(storedValue.isDuplicate).to.be.false;
    });
  });

  describe('OmniScript Storage - Migration Path', () => {
    it('should NOT set isDuplicate for same OmniScript with multiple versions in migration', () => {
      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.OS,
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        true // allVersions = true
      );

      const originalOsRecords = new Map<string, any>();
      /* eslint-disable camelcase */
      originalOsRecords.set('op1', {
        Id: 'op1',
        vlocity_ins__Type__c: 'CustomerProfile',
        vlocity_ins__SubType__c: 'AccountView',
        vlocity_ins__Language__c: 'English',
        vlocity_ins__IsProcedure__c: false,
      });
      originalOsRecords.set('op2', {
        Id: 'op2',
        vlocity_ins__Type__c: 'CustomerProfile',
        vlocity_ins__SubType__c: 'AccountView',
        vlocity_ins__Language__c: 'English',
        vlocity_ins__IsProcedure__c: false,
      });
      /* eslint-enable camelcase */

      const osUploadInfo = new Map<string, any>();
      osUploadInfo.set('op1', {
        type: 'CustomerProfile',
        subtype: 'AccountView',
        language: 'English',
        hasErrors: false,
      });
      osUploadInfo.set('op2', {
        type: 'CustomerProfile',
        subtype: 'AccountView',
        language: 'English',
        hasErrors: false,
      });

      // Process migration storage
      (omniScriptTool as any).updateStorageForOmniscript(osUploadInfo, originalOsRecords);

      const storage = StorageUtil.getOmnistudioMigrationStorage();
      const key = 'customerprofileaccountviewenglish';

      expect(storage.osStorage.has(key)).to.be.true;
      const storedValue = storage.osStorage.get(key);

      // Should NOT be marked as duplicate (same OmniScript, different versions)
      expect(storedValue.isDuplicate).to.be.false;
      expect(storedValue.originalType).to.equal('CustomerProfile');
      expect(storedValue.originalSubtype).to.equal('AccountView');
      expect(storedValue.originalLanguage).to.equal('English');
    });

    it('should set isDuplicate for DIFFERENT OmniScripts with same cleaned key in migration', () => {
      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.OS,
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        true // allVersions = true
      );

      const originalOsRecords = new Map<string, any>();
      /* eslint-disable camelcase */
      originalOsRecords.set('op1', {
        Id: 'op1',
        vlocity_ins__Type__c: 'Aa', // Type="Aa", Subtype="Bb" -> key="aabbenglish"
        vlocity_ins__SubType__c: 'Bb',
        vlocity_ins__Language__c: 'English',
        vlocity_ins__IsProcedure__c: false,
      });
      originalOsRecords.set('op2', {
        Id: 'op2',
        vlocity_ins__Type__c: 'AaB', // Type="AaB", Subtype="b" -> key="aabbenglish" (SAME KEY!)
        vlocity_ins__SubType__c: 'b',
        vlocity_ins__Language__c: 'English',
        vlocity_ins__IsProcedure__c: false,
      });
      /* eslint-enable camelcase */

      const osUploadInfo = new Map<string, any>();
      osUploadInfo.set('op1', {
        type: 'Aa',
        subtype: 'Bb',
        language: 'English',
        hasErrors: false,
      });
      osUploadInfo.set('op2', {
        type: 'AaB',
        subtype: 'b',
        language: 'English',
        hasErrors: false,
      });

      // Process migration storage
      (omniScriptTool as any).updateStorageForOmniscript(osUploadInfo, originalOsRecords);

      const storage = StorageUtil.getOmnistudioMigrationStorage();
      const key = 'aabbenglish'; // Lowercase key - SAME for both!

      expect(storage.osStorage.has(key)).to.be.true;
      const storedValue = storage.osStorage.get(key);

      // SHOULD be marked as duplicate (different OmniScripts produce same lowercased key)
      expect(storedValue.isDuplicate).to.be.true;
    });
  });

  describe('FlexCard Storage - Assessment Path', () => {
    it('should NOT set isDuplicate for same FlexCard with multiple versions', () => {
      const cardTool = new CardMigrationTool(
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        true // allVersions = true
      );

      const flexcardAssessmentInfos = [
        {
          name: 'CustomerDashboard',
          oldName: 'CustomerDashboard',
          id: 'fc1',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesFC: [],
          dependenciesLWC: [],
          dependenciesApexRemoteAction: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldName: 'CustomerDashboard',
            newName: 'CustomerDashboard',
          },
        },
        {
          name: 'CustomerDashboard',
          oldName: 'CustomerDashboard',
          id: 'fc2',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesFC: [],
          dependenciesLWC: [],
          dependenciesApexRemoteAction: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldName: 'CustomerDashboard',
            newName: 'CustomerDashboard',
          },
        },
      ];

      // Process assessment storage
      (cardTool as any).prepareAssessmentStorageForFlexcards(flexcardAssessmentInfos);

      const storage = StorageUtil.getOmnistudioAssessmentStorage();
      const key = 'customerdashboard'; // Lowercase key

      expect(storage.fcStorage.has(key)).to.be.true;
      const storedValue = storage.fcStorage.get(key);

      // Should NOT be marked as duplicate (same FlexCard, different versions)
      expect(storedValue.isDuplicate).to.be.false;
      expect(storedValue.originalName).to.equal('CustomerDashboard');
    });

    it('should set isDuplicate for DIFFERENT FlexCards with same lowercased key', () => {
      const cardTool = new CardMigrationTool(
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        true // allVersions = true
      );

      const flexcardAssessmentInfos = [
        {
          name: 'ABc',
          oldName: 'ABc',
          id: 'fc1',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesFC: [],
          dependenciesLWC: [],
          dependenciesApexRemoteAction: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldName: 'ABc', // Name="ABc" -> key="abc"
            newName: 'ABc',
          },
        },
        {
          name: 'AbC',
          oldName: 'AbC',
          id: 'fc2',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesFC: [],
          dependenciesLWC: [],
          dependenciesApexRemoteAction: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldName: 'AbC', // Name="AbC" -> key="abc" (SAME KEY!)
            newName: 'AbC',
          },
        },
      ];

      // Process assessment storage
      (cardTool as any).prepareAssessmentStorageForFlexcards(flexcardAssessmentInfos);

      const storage = StorageUtil.getOmnistudioAssessmentStorage();
      const key = 'abc'; // Lowercase key - SAME for both!

      expect(storage.fcStorage.has(key)).to.be.true;
      const storedValue = storage.fcStorage.get(key);

      // SHOULD be marked as duplicate (different FlexCards produce same lowercased key)
      expect(storedValue.isDuplicate).to.be.true;
    });

    it('should NOT set isDuplicate when allVersions=false for same FlexCard', () => {
      const cardTool = new CardMigrationTool(
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        false // allVersions = false (only active version)
      );

      const flexcardAssessmentInfos = [
        {
          name: 'CustomerDashboard',
          oldName: 'CustomerDashboard',
          id: 'fc1',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesFC: [],
          dependenciesLWC: [],
          dependenciesApexRemoteAction: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldName: 'CustomerDashboard',
            newName: 'CustomerDashboard',
          },
        },
      ];

      // Process assessment storage
      (cardTool as any).prepareAssessmentStorageForFlexcards(flexcardAssessmentInfos);

      const storage = StorageUtil.getOmnistudioAssessmentStorage();
      const key = 'customerdashboard';

      expect(storage.fcStorage.has(key)).to.be.true;
      const storedValue = storage.fcStorage.get(key);

      // Should NOT be marked as duplicate (only one version)
      expect(storedValue.isDuplicate).to.be.false;
    });
  });

  describe('FlexCard Storage - Migration Path', () => {
    it('should NOT set isDuplicate for same FlexCard with multiple versions in migration', () => {
      const cardTool = new CardMigrationTool(
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        true // allVersions = true
      );

      const originalRecords = new Map<string, any>();
      originalRecords.set('fc1', {
        Id: 'fc1',
        Name: 'CustomerDashboard',
      });
      originalRecords.set('fc2', {
        Id: 'fc2',
        Name: 'CustomerDashboard',
      });

      const cardsUploadInfo = new Map<string, any>();
      cardsUploadInfo.set('fc1', {
        newName: 'CustomerDashboard',
        hasErrors: false,
      });
      cardsUploadInfo.set('fc2', {
        newName: 'CustomerDashboard',
        hasErrors: false,
      });

      // Process migration storage
      (cardTool as any).prepareStorageForFlexcards(cardsUploadInfo, originalRecords);

      const storage = StorageUtil.getOmnistudioMigrationStorage();
      const key = 'customerdashboard';

      expect(storage.fcStorage.has(key)).to.be.true;
      const storedValue = storage.fcStorage.get(key);

      // Should NOT be marked as duplicate (same FlexCard, different versions)
      expect(storedValue.isDuplicate).to.be.false;
      expect(storedValue.originalName).to.equal('CustomerDashboard');
    });

    it('should set isDuplicate for DIFFERENT FlexCards with same lowercased key in migration', () => {
      const cardTool = new CardMigrationTool(
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        true // allVersions = true
      );

      const originalRecords = new Map<string, any>();
      originalRecords.set('fc1', {
        Id: 'fc1',
        Name: 'ABc', // Name="ABc" -> key="abc"
      });
      originalRecords.set('fc2', {
        Id: 'fc2',
        Name: 'AbC', // Name="AbC" -> key="abc" (SAME KEY!)
      });

      const cardsUploadInfo = new Map<string, any>();
      cardsUploadInfo.set('fc1', {
        newName: 'ABc',
        hasErrors: false,
      });
      cardsUploadInfo.set('fc2', {
        newName: 'AbC',
        hasErrors: false,
      });

      // Process migration storage
      (cardTool as any).prepareStorageForFlexcards(cardsUploadInfo, originalRecords);

      const storage = StorageUtil.getOmnistudioMigrationStorage();
      const key = 'abc'; // Lowercase key - SAME for both!

      expect(storage.fcStorage.has(key)).to.be.true;
      const storedValue = storage.fcStorage.get(key);

      // SHOULD be marked as duplicate (different FlexCards produce same lowercased key)
      expect(storedValue.isDuplicate).to.be.true;
    });
  });

  describe('Edge Cases and Complex Scenarios', () => {
    it('should handle multiple versions followed by duplicate from different component', () => {
      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.OS,
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        true
      );

      const osAssessmentInfos = [
        // Version 1 of OmniScript A
        {
          name: 'TestType_TestSubType_English_1',
          oldName: 'TestType_TestSubType_English_1',
          id: 'op1',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'TestType',
            oldSubtype: 'TestSubType',
            oldLanguage: 'English',
            newType: 'TestType',
            newSubType: 'TestSubType',
            newLanguage: 'English',
          },
        },
        // Version 2 of OmniScript A (same original)
        {
          name: 'TestType_TestSubType_English_2',
          oldName: 'TestType_TestSubType_English_2',
          id: 'op2',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'TestType',
            oldSubtype: 'TestSubType',
            oldLanguage: 'English',
            newType: 'TestType',
            newSubType: 'TestSubType',
            newLanguage: 'English',
          },
        },
        // OmniScript B with different original that produces same lowercased key
        {
          name: 'TestTypeT_estSubType_English_1',
          oldName: 'TestTypeT_estSubType_English_1',
          id: 'op3',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'TestTypeT', // Type="TestTypeT", Subtype="estSubType" -> key="testtypetestsubtypeenglish" (SAME!)
            oldSubtype: 'estSubType',
            oldLanguage: 'English',
            newType: 'TestTypeT',
            newSubType: 'estSubType',
            newLanguage: 'English',
          },
        },
      ];

      (omniScriptTool as any).updateStorageForOmniscriptAssessment(osAssessmentInfos);

      const storage = StorageUtil.getOmnistudioAssessmentStorage();
      const key = 'testtypetestsubtypeenglish'; // Same key for "TestType"+"TestSubType" and "TestTypeT"+"estSubType"

      expect(storage.osStorage.has(key)).to.be.true;
      const storedValue = storage.osStorage.get(key);

      // Should be marked as duplicate because the third one is a DIFFERENT OmniScript with same key
      expect(storedValue.isDuplicate).to.be.true;
    });

    it('should handle language differences correctly for OmniScripts', () => {
      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.OS,
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        true
      );

      const osAssessmentInfos = [
        {
          name: 'TestType_TestSubType_English_1',
          oldName: 'TestType_TestSubType_English_1',
          id: 'op1',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'TestType',
            oldSubtype: 'TestSubType',
            oldLanguage: 'English',
            newType: 'TestType',
            newSubType: 'TestSubType',
            newLanguage: 'English',
          },
        },
        {
          name: 'TestType_TestSubType_French_1',
          oldName: 'TestType_TestSubType_French_1',
          id: 'op2',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'TestType',
            oldSubtype: 'TestSubType',
            oldLanguage: 'French',
            newType: 'TestType',
            newSubType: 'TestSubType',
            newLanguage: 'French',
          },
        },
      ];

      (omniScriptTool as any).updateStorageForOmniscriptAssessment(osAssessmentInfos);

      const storage = StorageUtil.getOmnistudioAssessmentStorage();

      // Different languages result in different keys
      const englishKey = 'testtypetestsubtypeenglish';
      const frenchKey = 'testtypetestsubtypefrench';

      expect(storage.osStorage.has(englishKey)).to.be.true;
      expect(storage.osStorage.has(frenchKey)).to.be.true;

      // Neither should be marked as duplicate (different languages = different OmniScripts)
      expect(storage.osStorage.get(englishKey).isDuplicate).to.be.false;
      expect(storage.osStorage.get(frenchKey).isDuplicate).to.be.false;
    });

    it('should handle multiple OmniScripts with multiple versions each', () => {
      // Enable Standard Data Model for this test to populate osStandardStorage
      const mockStandardOrgDetails: OmnistudioOrgDetails = {
        packageDetails: { version: '1.0.0', namespace: 'vlocity_ins' },
        omniStudioOrgPermissionEnabled: true, // Enable Standard Data Model
        orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
        dataModel: 'Standard',
        hasValidNamespace: true,
        isFoundationPackage: false,
        isOmnistudioMetadataAPIEnabled: false,
        isDRVersioningEnabled: false,
      };
      initializeDataModelService(mockStandardOrgDetails);

      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.OS,
        'vlocity_ins',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        true // allVersions = true
      );

      const osAssessmentInfos = [
        // Aa/Bb/English - Version 1
        {
          name: 'Aa_Bb_English_1',
          oldName: 'Aa_Bb_English_1',
          id: 'os1',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'Aa',
            oldSubtype: 'Bb',
            oldLanguage: 'English',
            newType: 'Aa',
            newSubType: 'Bb',
            newLanguage: 'English',
          },
        },
        // Aa/Bb/English - Version 2
        {
          name: 'Aa_Bb_English_2',
          oldName: 'Aa_Bb_English_2',
          id: 'os2',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'Aa',
            oldSubtype: 'Bb',
            oldLanguage: 'English',
            newType: 'Aa',
            newSubType: 'Bb',
            newLanguage: 'English',
          },
        },
        // Aa/Bb/English - Version 3
        {
          name: 'Aa_Bb_English_3',
          oldName: 'Aa_Bb_English_3',
          id: 'os3',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'Aa',
            oldSubtype: 'Bb',
            oldLanguage: 'English',
            newType: 'Aa',
            newSubType: 'Bb',
            newLanguage: 'English',
          },
        },
        // Aa$/Bb$/English - Version 1
        {
          name: 'Aa_Bb_English_1',
          oldName: 'Aa$_Bb$_English_1',
          id: 'os4',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: ['Type changed from Aa$ to Aa', 'SubType changed from Bb$ to Bb'],
          errors: [
            'Omniscript with duplicate name, type, subtype, or language found in this org. Modify your Omniscript and try again. Omniscript Aa_Bb_English_1',
          ],
          migrationStatus: 'Needs manual intervention' as const,
          nameMapping: {
            oldType: 'Aa$',
            oldSubtype: 'Bb$',
            oldLanguage: 'English',
            newType: 'Aa',
            newSubType: 'Bb',
            newLanguage: 'English',
          },
        },
        // Aa$/Bb$/English - Version 2
        {
          name: 'Aa_Bb_English_2',
          oldName: 'Aa$_Bb$_English_2',
          id: 'os5',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: ['Type changed from Aa$ to Aa', 'SubType changed from Bb$ to Bb'],
          errors: [
            'Omniscript with duplicate name, type, subtype, or language found in this org. Modify your Omniscript and try again. Omniscript Aa_Bb_English_2',
          ],
          migrationStatus: 'Needs manual intervention' as const,
          nameMapping: {
            oldType: 'Aa$',
            oldSubtype: 'Bb$',
            oldLanguage: 'English',
            newType: 'Aa',
            newSubType: 'Bb',
            newLanguage: 'English',
          },
        },
        // Aa$/Bb$/English - Version 3
        {
          name: 'Aa_Bb_English_3',
          oldName: 'Aa$_Bb$_English_3',
          id: 'os6',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: ['Type changed from Aa$ to Aa', 'SubType changed from Bb$ to Bb'],
          errors: [
            'Omniscript with duplicate name, type, subtype, or language found in this org. Modify your Omniscript and try again. Omniscript Aa_Bb_English_3',
          ],
          migrationStatus: 'Needs manual intervention' as const,
          nameMapping: {
            oldType: 'Aa$',
            oldSubtype: 'Bb$',
            oldLanguage: 'English',
            newType: 'Aa',
            newSubType: 'Bb',
            newLanguage: 'English',
          },
        },
        // AaB/b/English - Version 1
        {
          name: 'AaB_b_English_1',
          oldName: 'AaB_b_English_1',
          id: 'os7',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'AaB',
            oldSubtype: 'b',
            oldLanguage: 'English',
            newType: 'AaB',
            newSubType: 'b',
            newLanguage: 'English',
          },
        },
        // AaB/b/English - Version 2
        {
          name: 'AaB_b_English_2',
          oldName: 'AaB_b_English_2',
          id: 'os8',
          type: 'OmniScript',
          dependenciesIP: [],
          dependenciesDR: [],
          dependenciesOS: [],
          dependenciesRemoteAction: [],
          dependenciesLWC: [],
          missingIP: [],
          missingDR: [],
          missingOS: [],
          infos: [],
          warnings: [],
          errors: [],
          migrationStatus: 'Ready for migration' as const,
          nameMapping: {
            oldType: 'AaB',
            oldSubtype: 'b',
            oldLanguage: 'English',
            newType: 'AaB',
            newSubType: 'b',
            newLanguage: 'English',
          },
        },
      ];

      (omniScriptTool as any).updateStorageForOmniscriptAssessment(osAssessmentInfos);

      const storage = StorageUtil.getOmnistudioAssessmentStorage();

      // Keys for each OmniScript (lowercased concatenation)
      const keyAaBb = 'aabbenglish'; // Aa + Bb + English (also same as AaB + b + English)
      const keyAaDollarBbDollar = 'aa$bb$english'; // Aa$ + Bb$ + English

      // Verify osStorage (non-standard data model)
      // When allVersions=true: first version of each unique original Type/Subtype/Language is stored,
      // but if a DIFFERENT OmniScript collides on the same key, it replaces and marks as duplicate
      expect(storage.osStorage.has(keyAaBb)).to.be.true;
      expect(storage.osStorage.has(keyAaDollarBbDollar)).to.be.true;

      const storedAaBb = storage.osStorage.get(keyAaBb);
      const storedAaDollarBbDollar = storage.osStorage.get(keyAaDollarBbDollar);

      // Check key collision: AaB/b/English replaces Aa/Bb/English at key 'aabbenglish'
      // Last entry wins with isDuplicate=true
      expect(storedAaBb.originalType).to.equal('AaB');
      expect(storedAaBb.originalSubtype).to.equal('b');
      expect(storedAaBb.originalLanguage).to.equal('English');
      expect(storedAaBb.type).to.equal('AaB');
      expect(storedAaBb.subtype).to.equal('b');
      expect(storedAaBb.language).to.equal('English');
      expect(storedAaBb.isDuplicate).to.be.true; // Marked as duplicate due to collision
      expect(storedAaBb.migrationSuccess).to.be.true;

      // Check Aa$/Bb$/English (first version stored)
      expect(storedAaDollarBbDollar.originalType).to.equal('Aa$');
      expect(storedAaDollarBbDollar.originalSubtype).to.equal('Bb$');
      expect(storedAaDollarBbDollar.originalLanguage).to.equal('English');
      expect(storedAaDollarBbDollar.isDuplicate).to.be.false;
      expect(storedAaDollarBbDollar.migrationSuccess).to.be.false;
      expect(storedAaDollarBbDollar.error).to.be.an('array').that.is.not.empty;

      // Verify osStandardStorage (standard data model)
      // Should have all versions of each OmniScript
      const standardKeyAaBbV1 = JSON.stringify({ type: 'Aa', subtype: 'Bb', language: 'English' });
      const standardKeyAaDollarV1 = JSON.stringify({ type: 'Aa$', subtype: 'Bb$', language: 'English' });
      const standardKeyAaBbV2 = JSON.stringify({ type: 'AaB', subtype: 'b', language: 'English' });

      expect(storage.osStandardStorage.has(standardKeyAaBbV1)).to.be.true;
      expect(storage.osStandardStorage.has(standardKeyAaDollarV1)).to.be.true;
      expect(storage.osStandardStorage.has(standardKeyAaBbV2)).to.be.true;

      // Verify standard storage entries
      const standardAaBb = storage.osStandardStorage.get(standardKeyAaBbV1);
      expect(standardAaBb.originalType).to.equal('Aa');
      expect(standardAaBb.originalSubtype).to.equal('Bb');
      expect(standardAaBb.originalLanguage).to.equal('English');
      expect(standardAaBb.isDuplicate).to.be.false;
      expect(standardAaBb.migrationSuccess).to.be.true;

      const standardAaDollar = storage.osStandardStorage.get(standardKeyAaDollarV1);
      expect(standardAaDollar.originalType).to.equal('Aa$');
      expect(standardAaDollar.originalSubtype).to.equal('Bb$');
      expect(standardAaDollar.originalLanguage).to.equal('English');
      expect(standardAaDollar.isDuplicate).to.be.false;
      expect(standardAaDollar.migrationSuccess).to.be.false;

      const standardAaBb2 = storage.osStandardStorage.get(standardKeyAaBbV2);
      expect(standardAaBb2.originalType).to.equal('AaB');
      expect(standardAaBb2.originalSubtype).to.equal('b');
      expect(standardAaBb2.originalLanguage).to.equal('English');
      expect(standardAaBb2.isDuplicate).to.be.false;
      expect(standardAaBb2.migrationSuccess).to.be.true;
    });
  });
});
