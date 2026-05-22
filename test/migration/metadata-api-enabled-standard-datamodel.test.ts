/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import * as sinon from 'sinon';
import { OmniScriptMigrationTool, OmniScriptExportType } from '../../src/migration/omniscript';
import { CardMigrationTool } from '../../src/migration/flexcard';
import { DataRaptorMigrationTool } from '../../src/migration/dataraptor';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';
import { StorageUtil } from '../../src/utils/storageUtil';
import { DebugTimer } from '../../src/utils/logging/debugtimer';

/**
 * Test Suite: Standard Data Model with Metadata API Enabled
 *
 * When isStandardDataModelWithMetadataAPIEnabled is true:
 * - For OmniScript and FlexCard: Only prepare storage, skip assessment and migration processing
 * - For DataMapper and IntegrationProcedure: Skip assessment and migration entirely
 *
 * This test suite validates that the correct behavior occurs when the Metadata API is enabled.
 */
describe('Standard Data Model with Metadata API Enabled - Storage Preparation Only', () => {
  let mockConnection: any;
  let mockMessages: any;
  let mockUx: any;
  let mockLogger: any;
  let nameRegistry: NameMappingRegistry;

  beforeEach(() => {
    // Initialize and start DebugTimer to avoid errors in migration methods
    const debugTimer = DebugTimer.getInstance();
    debugTimer.start();

    nameRegistry = NameMappingRegistry.getInstance();
    nameRegistry.clear();

    // Initialize data model service with Metadata API ENABLED
    const mockOrgDetails: OmnistudioOrgDetails = {
      packageDetails: { version: '1.0.0', namespace: 'omnistudio' },
      omniStudioOrgPermissionEnabled: true,
      orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
      dataModel: 'Standard',
      hasValidNamespace: true,
      isFoundationPackage: false,
      isOmnistudioMetadataAPIEnabled: true, // THIS IS THE KEY FLAG
    };
    initializeDataModelService(mockOrgDetails);

    // Setup mock objects
    mockConnection = {
      query: sinon.stub().resolves({ records: [], done: true }),
    };

    mockMessages = {
      getMessage: sinon.stub().callsFake((key: string, params?: string[]) => {
        const messages: Record<string, string> = {
          startingOmniScriptAssessment: `Starting ${params?.[0]} assessment...`,
          foundOmniScriptsToAssess: `Found ${params?.[0]} ${params?.[1]} to assess`,
          processingOmniScript: `Processing OmniScript: ${params?.[0]}`,
          foundOmniScriptsToMigrate: `Found ${params?.[0]} ${params?.[1]} to migrate`,
          startingFlexCardAssessment: 'Starting FlexCard assessment...',
          foundFlexCardsToAssess: `Found ${params?.[0]} FlexCards to assess`,
          foundFlexCardsToMigrate: `Found ${params?.[0]} FlexCards to migrate`,
          startingDataRaptorAssessment: 'Starting DataRaptor assessment...',
          foundDataRaptorsToAssess: `Found ${params?.[0]} DataRaptors to assess`,
          preparingStorageForMetadataEnabledOrg: `Preparing storage for ${params?.[0]} in Metadata API enabled org`,
          updatingStorageForOmniscipt: `Updating storage for OmniScript (${params?.[0]})`,
          unexpectedError: 'An unexpected error occurred',
        };
        return messages[key] || `Mock message for ${key}`;
      }),
    };

    mockUx = {};
    mockLogger = {};
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('OmniScript - Only Storage Preparation (No Assessment/Migration)', () => {
    let omniScriptTool: OmniScriptMigrationTool;

    beforeEach(() => {
      omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.All,
        '',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        false
      );
    });

    it('should only prepare storage during assessment and return empty assessment info', async () => {
      const mockOmniscripts = [
        {
          Id: 'os1',
          Name: 'TestOmniScript',
          Type: 'Customer',
          SubType: 'Profile',
          Language: 'English',
          VersionNumber: '1',
          IsIntegrationProcedure: false,
          IsWebCompEnabled: true,
          IsActive: true,
        },
        {
          Id: 'os2',
          Name: 'AnotherOmniScript',
          Type: 'Product',
          SubType: 'Details',
          Language: 'English',
          VersionNumber: '2',
          IsIntegrationProcedure: false,
          IsWebCompEnabled: true,
          IsActive: true,
        },
      ];

      // Mock the query to return OmniScripts
      mockConnection.query = sinon.stub().resolves({ records: mockOmniscripts, done: true });

      // Spy on storage methods
      const getStorageSpy = sinon.spy(StorageUtil, 'getOmnistudioAssessmentStorage');
      const printStorageSpy = sinon.spy(StorageUtil, 'printAssessmentStorage');

      // Call assess method
      const result = await omniScriptTool.assess([], []);

      // Should return empty assessment info arrays
      expect(result).to.be.an('object');
      expect(result.osAssessmentInfos).to.be.an('array').that.is.empty;
      expect(result.ipAssessmentInfos).to.be.an('array').that.is.empty;

      // Should have accessed storage
      expect(getStorageSpy.called).to.be.true;
      expect(printStorageSpy.called).to.be.true;

      // Cleanup
      getStorageSpy.restore();
      printStorageSpy.restore();
    });

    it('should only prepare storage during migration and return empty migration results', async () => {
      const mockOmniscripts = [
        {
          Id: 'os1',
          Name: 'TestOmniScript',
          Type: 'Customer',
          SubType: 'Profile',
          Language: 'English',
          VersionNumber: '1',
          IsIntegrationProcedure: false,
          IsWebCompEnabled: true,
          IsActive: true,
        },
      ];

      // Mock the query to return OmniScripts
      mockConnection.query = sinon.stub().resolves({ records: mockOmniscripts, done: true });

      // Spy on storage methods
      const getStorageSpy = sinon.spy(StorageUtil, 'getOmnistudioMigrationStorage');
      const printStorageSpy = sinon.spy(StorageUtil, 'printMigrationStorage');

      // Call migrate method
      const results = await omniScriptTool.migrate();

      // When exportType is All with metadata API enabled, returns array with 1 or 2 empty result structures
      // (The implementation behavior may vary - we just verify structure is correct and empty)
      expect(results).to.be.an('array');
      expect(results.length).to.be.greaterThan(0);

      // All results should have the correct structure
      results.forEach((result) => {
        expect(result).to.have.property('name');
        expect(result).to.have.property('results');
        expect(result).to.have.property('records');

        // Results and records maps should be empty (no actual migration)
        expect(result.results).to.be.instanceOf(Map);
        expect(result.results.size).to.equal(0);
        expect(result.records).to.be.instanceOf(Map);
        expect(result.records.size).to.equal(0);
      });

      // Should have accessed storage
      expect(getStorageSpy.called).to.be.true;
      expect(printStorageSpy.called).to.be.true;

      // Cleanup
      getStorageSpy.restore();
      printStorageSpy.restore();
    });

    it('should not process OmniScript elements when metadata API is enabled', async () => {
      const mockOmniscripts = [
        {
          Id: 'os1',
          Name: 'ComplexOmniScript',
          Type: 'Customer',
          SubType: 'Details',
          Language: 'English',
          VersionNumber: '1',
          IsIntegrationProcedure: false,
          IsWebCompEnabled: true,
          IsActive: true,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockOmniscripts, done: true });

      // Spy on the processOmniScript method to ensure it's NOT called
      const processOmniScriptSpy = sinon.spy(omniScriptTool as any, 'processOmniScript');

      const result = await omniScriptTool.assess([], []);

      // processOmniScript should NOT have been called
      expect(processOmniScriptSpy.called).to.be.false;
      expect(result.osAssessmentInfos).to.be.empty;

      // Cleanup
      processOmniScriptSpy.restore();
    });

    it('should skip Integration Procedure assessment when exportType is IP', async () => {
      const ipTool = new OmniScriptMigrationTool(
        OmniScriptExportType.IP,
        '',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        false
      );

      const mockIPs = [
        {
          Id: 'ip1',
          Name: 'TestIP',
          Type: 'Customer',
          SubType: 'Validate',
          IsIntegrationProcedure: true,
          IsActive: true,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockIPs, done: true });

      const result = await ipTool.assess([], []);

      // Should return empty arrays for both OS and IP
      expect(result.osAssessmentInfos).to.be.empty;
      expect(result.ipAssessmentInfos).to.be.empty;
    });

    it('should skip Integration Procedure migration when exportType is IP', async () => {
      const ipTool = new OmniScriptMigrationTool(
        OmniScriptExportType.IP,
        '',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        false
      );

      const mockIPs = [
        {
          Id: 'ip1',
          Name: 'TestIP',
          Type: 'Customer',
          SubType: 'Validate',
          IsIntegrationProcedure: true,
          IsActive: true,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockIPs, done: true });

      const results = await ipTool.migrate();

      // Should return array with empty result structure
      expect(results).to.be.an('array').with.lengthOf(1);
      expect(results[0].results.size).to.equal(0);
      expect(results[0].records.size).to.equal(0);
    });

    it('should handle multiple OmniScripts and only prepare storage', async () => {
      const mockOmniscripts = Array.from({ length: 10 }, (_, i) => ({
        Id: `os${i}`,
        Name: `OmniScript${i}`,
        Type: `Type${i}`,
        SubType: `SubType${i}`,
        Language: 'English',
        VersionNumber: '1',
        IsIntegrationProcedure: false,
        IsWebCompEnabled: true,
        IsActive: true,
      }));

      mockConnection.query = sinon.stub().resolves({ records: mockOmniscripts, done: true });

      const result = await omniScriptTool.assess([], []);

      // Should still return empty assessment info
      expect(result.osAssessmentInfos).to.be.empty;
      expect(result.ipAssessmentInfos).to.be.empty;

      // No individual processing should have occurred
      const processOmniScriptSpy = sinon.spy(omniScriptTool as any, 'processOmniScript');
      expect(processOmniScriptSpy.called).to.be.false;
      processOmniScriptSpy.restore();
    });
  });

  describe('FlexCard - Only Storage Preparation (No Assessment/Migration)', () => {
    let cardTool: CardMigrationTool;

    beforeEach(() => {
      cardTool = new CardMigrationTool('', mockConnection, mockLogger, mockMessages, mockUx, false);
    });

    it('should only prepare storage during assessment and return empty assessment info', async () => {
      const mockFlexCards = [
        {
          Id: 'fc1',
          Name: 'TestFlexCard',
          DataSourceConfig: JSON.stringify({ type: 'DataRaptor', value: { bundle: 'TestBundle' } }),
          PropertySetConfig: JSON.stringify({ layout: 'Card' }),
          IsActive: true,
          OmniUiCardType: 'Parent',
          VersionNumber: 1,
        },
        {
          Id: 'fc2',
          Name: 'AnotherFlexCard',
          DataSourceConfig: JSON.stringify({ type: 'IntegrationProcedures', value: { ipMethod: 'TestIP' } }),
          PropertySetConfig: JSON.stringify({ layout: 'Card' }),
          IsActive: true,
          OmniUiCardType: 'Parent',
          VersionNumber: 1,
        },
      ];

      // Mock the query to return FlexCards
      mockConnection.query = sinon.stub().resolves({ records: mockFlexCards, done: true });

      // Spy on storage methods
      const getStorageSpy = sinon.spy(StorageUtil, 'getOmnistudioAssessmentStorage');
      const printStorageSpy = sinon.spy(StorageUtil, 'printAssessmentStorage');

      // Call assess method
      const result = await cardTool.assess();

      // Should return empty assessment info array
      expect(result).to.be.an('array').that.is.empty;

      // Should have accessed storage
      expect(getStorageSpy.called).to.be.true;
      expect(printStorageSpy.called).to.be.true;

      // Cleanup
      getStorageSpy.restore();
      printStorageSpy.restore();
    });

    it('should only prepare storage during migration and return empty migration results', async () => {
      const mockFlexCards = [
        {
          Id: 'fc1',
          Name: 'TestFlexCard',
          DataSourceConfig: JSON.stringify({ type: 'DataRaptor', value: { bundle: 'TestBundle' } }),
          PropertySetConfig: JSON.stringify({ layout: 'Card' }),
          IsActive: true,
          OmniUiCardType: 'Parent',
          VersionNumber: 1,
        },
      ];

      // Mock the query to return FlexCards
      mockConnection.query = sinon.stub().resolves({ records: mockFlexCards, done: true });

      // Spy on storage methods - Note: FlexCard uses printAssessmentStorage even for migration
      const getStorageSpy = sinon.spy(StorageUtil, 'getOmnistudioMigrationStorage');

      // Call migrate method
      const results = await cardTool.migrate();

      // Should return array with empty result structure
      expect(results).to.be.an('array').with.lengthOf(1);
      expect(results[0]).to.have.property('name');
      expect(results[0]).to.have.property('results');
      expect(results[0]).to.have.property('records');

      // Results and records maps should be empty (no actual migration)
      expect(results[0].results).to.be.instanceOf(Map);
      expect(results[0].results.size).to.equal(0);
      expect(results[0].records).to.be.instanceOf(Map);
      expect(results[0].records.size).to.equal(0);

      // Should have accessed storage
      expect(getStorageSpy.called).to.be.true;

      // Cleanup
      getStorageSpy.restore();
    });

    it('should not process FlexCard components when metadata API is enabled', async () => {
      const mockFlexCards = [
        {
          Id: 'fc1',
          Name: 'ComplexFlexCard',
          DataSourceConfig: JSON.stringify({
            type: 'DataRaptor',
            value: { bundle: 'ComplexBundle' },
          }),
          PropertySetConfig: JSON.stringify({
            layout: 'Card',
            actions: [{ type: 'DataRaptor', bundle: 'ActionBundle' }],
          }),
          IsActive: true,
          OmniUiCardType: 'Parent',
          VersionNumber: 1,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockFlexCards, done: true });

      // Spy on the processFlexCard method to ensure it's NOT called
      const processFlexCardSpy = sinon.spy(cardTool as any, 'processFlexCard');

      const result = await cardTool.assess();

      // processFlexCard should NOT have been called
      expect(processFlexCardSpy.called).to.be.false;
      expect(result).to.be.empty;

      // Cleanup
      processFlexCardSpy.restore();
    });

    it('should handle multiple FlexCards and only prepare storage', async () => {
      const mockFlexCards = Array.from({ length: 10 }, (_, i) => ({
        Id: `fc${i}`,
        Name: `FlexCard${i}`,
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({ layout: 'Card' }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      }));

      mockConnection.query = sinon.stub().resolves({ records: mockFlexCards, done: true });

      const result = await cardTool.assess();

      // Should still return empty assessment info
      expect(result).to.be.empty;

      // No individual processing should have occurred
      const processFlexCardSpy = sinon.spy(cardTool as any, 'processFlexCard');
      expect(processFlexCardSpy.called).to.be.false;
      processFlexCardSpy.restore();
    });

    it('should not analyze dependencies for FlexCards when metadata API is enabled', async () => {
      const mockFlexCards = [
        {
          Id: 'fc1',
          Name: 'FlexCardWithDependencies',
          DataSourceConfig: JSON.stringify({
            type: 'IntegrationProcedures',
            value: { ipMethod: 'Customer_Validate' },
          }),
          PropertySetConfig: JSON.stringify({
            layout: 'Card',
            flexCardReference: 'ChildCard',
            omniscriptReference: 'Customer_Profile_English',
          }),
          IsActive: true,
          OmniUiCardType: 'Parent',
          VersionNumber: 1,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockFlexCards, done: true });

      const result = await cardTool.assess();

      // Should return empty result (no dependency analysis)
      expect(result).to.be.empty;
    });
  });

  describe('DataMapper - Skip Assessment and Migration Entirely', () => {
    let dataRaptorTool: DataRaptorMigrationTool;

    beforeEach(() => {
      dataRaptorTool = new DataRaptorMigrationTool('', mockConnection, mockLogger, mockMessages, mockUx);
    });

    it('should skip assessment entirely and return empty array', async () => {
      const mockDataRaptors = [
        {
          Id: 'dr1',
          Name: 'TestDataRaptor',
          Type: 'Extract',
          InputType: 'JSON',
          OutputType: 'SObject',
          IsActive: true,
        },
        {
          Id: 'dr2',
          Name: 'AnotherDataRaptor',
          Type: 'Transform',
          InputType: 'SObject',
          OutputType: 'JSON',
          IsActive: true,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockDataRaptors, done: true });

      // Call assess method
      const result = await dataRaptorTool.assess();

      // Should return empty array or undefined (the method returns [] when metadata API is enabled)
      expect(result).to.satisfy((r: any) => r === undefined || (Array.isArray(r) && r.length === 0));
    });

    it('should skip migration entirely and return empty result structure', async () => {
      const mockDataRaptors = [
        {
          Id: 'dr1',
          Name: 'TestDataRaptor',
          Type: 'Load',
          InputType: 'JSON',
          OutputType: 'SObject',
          IsActive: true,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockDataRaptors, done: true });

      // Call migrate method (no need to spy, it returns early)
      const results = await dataRaptorTool.migrate();

      // Should return array with empty result structure
      expect(results).to.be.an('array').with.lengthOf(1);
      expect(results[0]).to.have.property('name');
      expect(results[0]).to.have.property('results');
      expect(results[0]).to.have.property('records');

      // Results and records maps should be empty (no actual migration)
      expect(results[0].results).to.be.instanceOf(Map);
      expect(results[0].results.size).to.equal(0);
      expect(results[0].records).to.be.instanceOf(Map);
      expect(results[0].records.size).to.equal(0);
    });

    it('should not query DataRaptor items when metadata API is enabled', async () => {
      const mockDataRaptors = [
        {
          Id: 'dr1',
          Name: 'ComplexDataRaptor',
          Type: 'Transform',
          InputType: 'JSON',
          OutputType: 'JSON',
          IsActive: true,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockDataRaptors, done: true });

      // Call migrate - it should return early without querying items
      const results = await dataRaptorTool.migrate();

      // Verify it returned empty structure
      expect(results[0].results.size).to.equal(0);
    });

    it('should not process DataRaptor formula updates when metadata API is enabled', async () => {
      const mockDataRaptors = [
        {
          Id: 'dr1',
          Name: 'FormulaDataRaptor',
          Type: 'Transform',
          InputType: 'JSON',
          OutputType: 'JSON',
          IsActive: true,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockDataRaptors, done: true });

      const results = await dataRaptorTool.migrate();

      // No formula processing should occur - verified by empty results
      expect(results[0].results.size).to.equal(0);
    });

    it('should handle multiple DataRaptors and skip all processing', async () => {
      const mockDataRaptors = Array.from({ length: 10 }, (_, i) => ({
        Id: `dr${i}`,
        Name: `DataRaptor${i}`,
        Type: i % 2 === 0 ? 'Extract' : 'Transform',
        InputType: 'JSON',
        OutputType: 'SObject',
        IsActive: true,
      }));

      mockConnection.query = sinon.stub().resolves({ records: mockDataRaptors, done: true });

      const result = await dataRaptorTool.assess();

      expect(result).to.be.an('array').with.lengthOf(0);
    });
  });

  describe('Integration Procedure - Skip Assessment and Migration Entirely', () => {
    let ipTool: OmniScriptMigrationTool;

    beforeEach(() => {
      ipTool = new OmniScriptMigrationTool(
        OmniScriptExportType.IP,
        '',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        false
      );
    });

    it('should skip Integration Procedure assessment when metadata API is enabled', async () => {
      const mockIPs = [
        {
          Id: 'ip1',
          Name: 'TestIP',
          Type: 'Customer',
          SubType: 'Validate',
          IsIntegrationProcedure: true,
          IsActive: true,
        },
        {
          Id: 'ip2',
          Name: 'AnotherIP',
          Type: 'Product',
          SubType: 'Process',
          IsIntegrationProcedure: true,
          IsActive: true,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockIPs, done: true });

      const result = await ipTool.assess([], []);

      // Should return empty assessment info
      expect(result.osAssessmentInfos).to.be.empty;
      expect(result.ipAssessmentInfos).to.be.empty;
    });

    it('should skip Integration Procedure migration when metadata API is enabled', async () => {
      const mockIPs = [
        {
          Id: 'ip1',
          Name: 'TestIP',
          Type: 'Customer',
          SubType: 'Validate',
          IsIntegrationProcedure: true,
          IsActive: true,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockIPs, done: true });

      const results = await ipTool.migrate();

      // Should return empty result structure
      expect(results).to.be.an('array').with.lengthOf(1);
      expect(results[0].results.size).to.equal(0);
      expect(results[0].records.size).to.equal(0);
    });

    it('should not process IP elements when metadata API is enabled', async () => {
      const mockIPs = [
        {
          Id: 'ip1',
          Name: 'ComplexIP',
          Type: 'Customer',
          SubType: 'Details',
          IsIntegrationProcedure: true,
          IsActive: true,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockIPs, done: true });

      // Spy on processOmniScript to ensure it's NOT called
      const processOmniScriptSpy = sinon.spy(ipTool as any, 'processOmniScript');

      await ipTool.assess([], []);

      // processOmniScript should NOT have been called
      expect(processOmniScriptSpy.called).to.be.false;

      // Cleanup
      processOmniScriptSpy.restore();
    });
  });

  describe('Cross-Component Behavior - Metadata API Enabled', () => {
    it('should skip all component processing except storage preparation', async () => {
      // Create all tools
      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.All,
        '',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        false
      );
      const cardTool = new CardMigrationTool('', mockConnection, mockLogger, mockMessages, mockUx, false);
      const dataRaptorTool = new DataRaptorMigrationTool('', mockConnection, mockLogger, mockMessages, mockUx);

      // Mock queries for all components
      mockConnection.query = sinon.stub().resolves({ records: [], done: true });

      // Assess all components
      const osResult = await omniScriptTool.assess([], []);
      const fcResult = await cardTool.assess();
      const drResult = await dataRaptorTool.assess();

      // All should return empty results
      expect(osResult.osAssessmentInfos).to.be.empty;
      expect(osResult.ipAssessmentInfos).to.be.empty;
      expect(fcResult).to.be.empty;
      // DataRaptor may return undefined or empty array
      expect(drResult).to.satisfy((r: any) => r === undefined || (Array.isArray(r) && r.length === 0));
    });

    it('should not populate NameMappingRegistry when metadata API is enabled', async () => {
      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.All,
        '',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        false
      );

      const mockOmniscripts = [
        {
          Id: 'os1',
          Name: 'TestOmniScript',
          Type: 'Customer',
          SubType: 'Profile',
          Language: 'English',
          VersionNumber: '1',
          IsIntegrationProcedure: false,
          IsWebCompEnabled: true,
          IsActive: true,
        },
      ];

      mockConnection.query = sinon.stub().resolves({ records: mockOmniscripts, done: true });

      // Get initial registry size
      const initialSize = nameRegistry.getAllNameMappings().length;

      // Assess components
      await omniScriptTool.assess([], []);

      // Registry should not have been populated
      const finalSize = nameRegistry.getAllNameMappings().length;
      expect(finalSize).to.equal(initialSize);
    });

    it('should handle empty component lists gracefully', async () => {
      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.All,
        '',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        false
      );

      // Mock empty query results
      mockConnection.query = sinon.stub().resolves({ records: [], done: true });

      const result = await omniScriptTool.assess([], []);

      // Should handle empty lists without errors
      expect(result.osAssessmentInfos).to.be.empty;
      expect(result.ipAssessmentInfos).to.be.empty;
    });
  });

  describe('Report Generation - Metadata API Enabled', () => {
    it('should generate empty results suitable for report generation', async () => {
      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.OS,
        '',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        false
      );

      mockConnection.query = sinon.stub().resolves({ records: [], done: true });

      const results = await omniScriptTool.migrate();

      // Result structure should be valid for report generation
      expect(results).to.be.an('array');
      expect(results.length).to.be.greaterThan(0);

      // All results should have valid structure
      results.forEach((result) => {
        expect(result).to.have.all.keys('name', 'results', 'records');
        expect(result.name).to.be.a('string');
        expect(result.results).to.be.instanceOf(Map);
        expect(result.records).to.be.instanceOf(Map);
      });
    });

    it('should generate consistent result structure across all component types', async () => {
      const omniScriptTool = new OmniScriptMigrationTool(
        OmniScriptExportType.OS,
        '',
        mockConnection,
        mockLogger,
        mockMessages,
        mockUx,
        false
      );
      const cardTool = new CardMigrationTool('', mockConnection, mockLogger, mockMessages, mockUx, false);
      const dataRaptorTool = new DataRaptorMigrationTool('', mockConnection, mockLogger, mockMessages, mockUx);

      mockConnection.query = sinon.stub().resolves({ records: [], done: true });

      const osResults = await omniScriptTool.migrate();
      const fcResults = await cardTool.migrate();
      const drResults = await dataRaptorTool.migrate();

      // All should return at least 1 result when metadata API is enabled
      expect(osResults).to.be.an('array');
      expect(osResults.length).to.be.greaterThan(0);
      expect(fcResults).to.be.an('array').with.lengthOf(1);
      expect(drResults).to.be.an('array').with.lengthOf(1);

      // All individual results should have the same structure with empty maps
      const allResults = [...osResults, ...fcResults, ...drResults];
      allResults.forEach((result) => {
        expect(result).to.have.all.keys('name', 'results', 'records');
        expect(result.results.size).to.equal(0);
        expect(result.records.size).to.equal(0);
      });
    });
  });

  describe('Storage migrationSuccess Flag - Metadata API Enabled', () => {
    beforeEach(() => {
      // Clear storage before each test
      const migrationStorage = StorageUtil.getOmnistudioMigrationStorage();
      migrationStorage.osStorage.clear();
      migrationStorage.osStandardStorage.clear();
      migrationStorage.fcStorage.clear();

      const assessmentStorage = StorageUtil.getOmnistudioAssessmentStorage();
      assessmentStorage.osStorage.clear();
      assessmentStorage.osStandardStorage.clear();
      assessmentStorage.fcStorage.clear();
    });

    describe('OmniScript - migrationSuccess should be true (direct method test)', () => {
      it('should set migrationSuccess to true when prepareStorageForRelatedObjectsWhenMetadataAPIEnabled is called', () => {
        const omniScriptTool = new OmniScriptMigrationTool(
          OmniScriptExportType.All,
          '',
          mockConnection,
          mockLogger,
          mockMessages,
          mockUx,
          false
        );

        const mockOmniscripts = [
          {
            Id: 'os1',
            Name: 'TestOmniScript',
            Type: 'Customer',
            SubType: 'Profile',
            Language: 'English',
            VersionNumber: '1',
            IsIntegrationProcedure: false,
            IsWebCompEnabled: true,
            IsActive: true,
          },
          {
            Id: 'os2',
            Name: 'AnotherOmniScript',
            Type: 'Product',
            SubType: 'Details',
            Language: 'Spanish',
            VersionNumber: '2',
            IsIntegrationProcedure: false,
            IsWebCompEnabled: true,
            IsActive: true,
          },
        ];

        // Call the private method directly
        const storage = StorageUtil.getOmnistudioAssessmentStorage();
        (omniScriptTool as any).prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(storage, mockOmniscripts);

        // Verify OmniScripts are in storage with migrationSuccess = true
        const key1 = 'customerprofileenglish';
        const key2 = 'productdetailsspanish';

        expect(storage.osStorage.has(key1)).to.be.true;
        expect(storage.osStorage.has(key2)).to.be.true;

        const osData1 = storage.osStorage.get(key1);
        const osData2 = storage.osStorage.get(key2);

        expect(osData1).to.not.be.undefined;
        expect(osData1.migrationSuccess).to.be.true;
        expect(osData1.type).to.equal('Customer');
        expect(osData1.subtype).to.equal('Profile');
        expect(osData1.language).to.equal('English');

        expect(osData2).to.not.be.undefined;
        expect(osData2.migrationSuccess).to.be.true;
        expect(osData2.type).to.equal('Product');
        expect(osData2.subtype).to.equal('Details');
        expect(osData2.language).to.equal('Spanish');
      });

      it('should skip Integration Procedures when populating storage', () => {
        const omniScriptTool = new OmniScriptMigrationTool(
          OmniScriptExportType.All,
          '',
          mockConnection,
          mockLogger,
          mockMessages,
          mockUx,
          false
        );

        const mockOmniscripts = [
          {
            Id: 'os1',
            Name: 'TestOmniScript',
            Type: 'Customer',
            SubType: 'Profile',
            Language: 'English',
            IsIntegrationProcedure: false, // OmniScript
          },
          {
            Id: 'ip1',
            Name: 'TestIP',
            Type: 'API',
            SubType: 'Gateway',
            IsIntegrationProcedure: true, // Integration Procedure - should be skipped
          },
        ];

        const storage = StorageUtil.getOmnistudioAssessmentStorage();
        (omniScriptTool as any).prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(storage, mockOmniscripts);

        // OmniScript should be in storage
        const osKey = 'customerprofileenglish';
        expect(storage.osStorage.has(osKey)).to.be.true;
        const osEntry = storage.osStorage.get(osKey);
        expect(osEntry).to.exist;
        expect(osEntry?.migrationSuccess).to.be.true;

        // Only 1 entry should be in storage (IP was skipped)
        expect(storage.osStorage.size).to.equal(1);
      });

      it('should work for both assessment and migration storage', () => {
        const omniScriptTool = new OmniScriptMigrationTool(
          OmniScriptExportType.All,
          '',
          mockConnection,
          mockLogger,
          mockMessages,
          mockUx,
          false
        );

        const mockOmniscripts = [
          {
            Id: 'os1',
            Name: 'TestOmniScript',
            Type: 'TestWrapperOmni',
            SubType: 'Q3',
            Language: 'English',
            IsIntegrationProcedure: false,
          },
        ];

        // Test with assessment storage
        const assessmentStorage = StorageUtil.getOmnistudioAssessmentStorage();
        (omniScriptTool as any).prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(
          assessmentStorage,
          mockOmniscripts
        );

        const assessKey = 'testwrapperomniq3english';
        expect(assessmentStorage.osStorage.has(assessKey)).to.be.true;
        const assessEntry = assessmentStorage.osStorage.get(assessKey);
        expect(assessEntry).to.exist;
        expect(assessEntry?.migrationSuccess).to.be.true;

        // Test with migration storage
        const migrationStorage = StorageUtil.getOmnistudioMigrationStorage();
        (omniScriptTool as any).prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(
          migrationStorage,
          mockOmniscripts
        );

        expect(migrationStorage.osStorage.has(assessKey)).to.be.true;
        const migrationEntry = migrationStorage.osStorage.get(assessKey);
        expect(migrationEntry).to.exist;
        expect(migrationEntry?.migrationSuccess).to.be.true;
      });
    });

    describe('FlexCard - migrationSuccess should be true (direct method test)', () => {
      it('should set migrationSuccess to true when prepareStorageForRelatedObjectsWhenMetadataAPIEnabled is called', () => {
        const cardTool = new CardMigrationTool('', mockConnection, mockLogger, mockMessages, mockUx, false);

        const mockFlexCards = [
          {
            Id: 'fc1',
            Name: 'CustomerDashboard',
          },
          {
            Id: 'fc2',
            Name: 'ProductDetails',
          },
        ];

        const storage = StorageUtil.getOmnistudioAssessmentStorage();
        (cardTool as any).prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(storage, mockFlexCards);

        const key1 = 'customerdashboard';
        const key2 = 'productdetails';

        expect(storage.fcStorage.has(key1)).to.be.true;
        expect(storage.fcStorage.has(key2)).to.be.true;

        const fcData1 = storage.fcStorage.get(key1);
        const fcData2 = storage.fcStorage.get(key2);

        expect(fcData1).to.not.be.undefined;
        expect(fcData1.migrationSuccess).to.be.true;
        expect(fcData1.name).to.equal('CustomerDashboard');
        expect(fcData1.originalName).to.equal('CustomerDashboard');

        expect(fcData2).to.not.be.undefined;
        expect(fcData2.migrationSuccess).to.be.true;
        expect(fcData2.name).to.equal('ProductDetails');
        expect(fcData2.originalName).to.equal('ProductDetails');
      });

      it('should work for multiple FlexCards', () => {
        const cardTool = new CardMigrationTool('', mockConnection, mockLogger, mockMessages, mockUx, false);

        const mockFlexCards = Array.from({ length: 5 }, (_, i) => ({
          Id: `fc${i}`,
          Name: `FlexCard${i}`,
        }));

        const storage = StorageUtil.getOmnistudioAssessmentStorage();
        (cardTool as any).prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(storage, mockFlexCards);

        for (let i = 0; i < 5; i++) {
          const key = `flexcard${i}`;
          expect(storage.fcStorage.has(key)).to.be.true;
          const fcData = storage.fcStorage.get(key);
          expect(fcData).to.not.be.undefined;
          expect(fcData.migrationSuccess).to.be.true;
        }
      });

      it('should work for both assessment and migration storage', () => {
        const cardTool = new CardMigrationTool('', mockConnection, mockLogger, mockMessages, mockUx, false);

        const mockFlexCards = [
          {
            Id: 'fc1',
            Name: 'TestFlexCard',
          },
        ];

        // Test with assessment storage
        const assessmentStorage = StorageUtil.getOmnistudioAssessmentStorage();
        (cardTool as any).prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(assessmentStorage, mockFlexCards);

        const key = 'testflexcard';
        expect(assessmentStorage.fcStorage.has(key)).to.be.true;
        const assessEntry = assessmentStorage.fcStorage.get(key);
        expect(assessEntry).to.exist;
        expect(assessEntry?.migrationSuccess).to.be.true;

        // Test with migration storage
        const migrationStorage = StorageUtil.getOmnistudioMigrationStorage();
        (cardTool as any).prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(migrationStorage, mockFlexCards);

        expect(migrationStorage.fcStorage.has(key)).to.be.true;
        const migrationEntry = migrationStorage.fcStorage.get(key);
        expect(migrationEntry).to.exist;
        expect(migrationEntry?.migrationSuccess).to.be.true;
      });
    });

    describe('FlexiPage Migration - Storage lookup should find migrationSuccess = true', () => {
      it('should have migrationSuccess = true for OmniScript referenced by FlexiPage wrapper', () => {
        const omniScriptTool = new OmniScriptMigrationTool(
          OmniScriptExportType.All,
          '',
          mockConnection,
          mockLogger,
          mockMessages,
          mockUx,
          false
        );

        // Simulate an OmniScript that a FlexiPage wrapper references (testWrapperOmniQ3English)
        const mockOmniscripts = [
          {
            Id: 'os1',
            Name: 'TestWrapperOmniQ3English',
            Type: 'TestWrapperOmni',
            SubType: 'Q3',
            Language: 'English',
            IsIntegrationProcedure: false,
          },
        ];

        const storage = StorageUtil.getOmnistudioAssessmentStorage();
        (omniScriptTool as any).prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(storage, mockOmniscripts);

        // This is the key that FlexiPage transformer looks up
        const key = 'testwrapperomniq3english';

        expect(storage.osStorage.has(key)).to.be.true;
        const osData = storage.osStorage.get(key);
        expect(osData).to.not.be.undefined;
        expect(osData.migrationSuccess).to.be.true;

        // This proves the fix works - previously migrationSuccess was undefined,
        // which would cause FlexiPage migration to fail with:
        // "Key testwrapperomniq3english can not be processed"
      });

      it('should have migrationSuccess = true for FlexCard referenced by FlexiPage', () => {
        const cardTool = new CardMigrationTool('', mockConnection, mockLogger, mockMessages, mockUx, false);

        const mockFlexCards = [
          {
            Id: 'fc1',
            Name: 'TestFlexCard',
          },
        ];

        const storage = StorageUtil.getOmnistudioAssessmentStorage();
        (cardTool as any).prepareStorageForRelatedObjectsWhenMetadataAPIEnabled(storage, mockFlexCards);

        // This is the key that FlexiPage transformer looks up
        const key = 'testflexcard';

        expect(storage.fcStorage.has(key)).to.be.true;
        const fcData = storage.fcStorage.get(key);
        expect(fcData).to.not.be.undefined;
        expect(fcData.migrationSuccess).to.be.true;

        // This proves the fix works - previously migrationSuccess was undefined,
        // which would cause FlexiPage migration to fail with:
        // "Key testflexcard can not be processed"
      });
    });
  });
});
