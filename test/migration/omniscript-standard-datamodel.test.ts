/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { OmniScriptMigrationTool, OmniScriptExportType } from '../../src/migration/omniscript';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';
import { NetUtils } from '../../src/utils/net';

describe('OmniScript Standard Data Model (Metadata API Disabled) - Assessment and Migration', () => {
  let omniScriptTool: OmniScriptMigrationTool;
  let nameRegistry: NameMappingRegistry;
  let mockConnection: any;
  let mockMessages: any;
  let mockUx: any;
  let mockLogger: any;

  beforeEach(() => {
    nameRegistry = NameMappingRegistry.getInstance();
    nameRegistry.clear();

    // Initialize data model service for tests (set to STANDARD data model)
    const mockOrgDetails: OmnistudioOrgDetails = {
      packageDetails: { version: '1.0.0', namespace: 'omnistudio' },
      omniStudioOrgPermissionEnabled: true, // This makes IS_STANDARD_DATA_MODEL = true
      orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
      dataModel: 'Standard',
      hasValidNamespace: true,
      isFoundationPackage: false,
      isOmnistudioMetadataAPIEnabled: false,
    };
    initializeDataModelService(mockOrgDetails);

    // Setup mock objects
    mockConnection = {
      query: () => Promise.resolve({ records: [] }),
    };
    mockMessages = {
      getMessage: (key: string, params?: string[]) => {
        const messages = {
          startingOmniScriptAssessment: `Starting ${params?.[0]} assessment...`,
          foundOmniScriptsToAssess: `Found ${params?.[0]} ${params?.[1]} to assess`,
          processingOmniScript: `Processing OmniScript: ${params?.[0]}`,
          foundOmniScriptsToMigrate: `Found ${params?.[0]} ${params?.[1]} to migrate`,
          missingMandatoryField: `Missing mandatory field '${params?.[0]}' for ${params?.[1]}`,
          changeMessage: `The ${params?.[0]} ${params?.[1]} will be changed from ${params?.[2]} to ${params?.[3]}`,
          integrationProcedureTypeEmptyAfterCleaning: `Integration Procedure Type becomes empty after cleaning: '${params?.[0]}'`,
          integrationProcedureSubtypeEmptyAfterCleaning: `Integration Procedure SubType becomes empty after cleaning: '${params?.[0]}'`,
          duplicatedName: 'Duplicated name found',
          invalidOrRepeatingOmniscriptElementNames: `Invalid or repeating element names: ${params?.[0]}`,
          reservedKeysFoundInPropertySet: `Reserved keys found in PropertySet: ${params?.[0]}`,
          angularOSWarning: 'Angular OmniScript detected - migration not supported',
          angularOmniScriptDependencyWarning: `Element '${params?.[0]}' references Angular OmniScript '${params?.[1]}' which will not be migrated`,
          componentMappingNotFound: `No registry mapping found for ${params?.[0]} component: ${params?.[1]}, using fallback cleaning`,
          unexpectedError: 'An unexpected error occurred',
        };
        return messages[key] || 'Mock message for testing';
      },
    };
    mockUx = {};
    mockLogger = {};

    omniScriptTool = new OmniScriptMigrationTool(
      OmniScriptExportType.All,
      '', // No namespace for standard data model
      mockConnection,
      mockLogger,
      mockMessages,
      mockUx,
      false
    );

    // Setup test mappings for Standard Data Model
    setupTestMappingsForStandardDataModel();
  });

  function setupTestMappingsForStandardDataModel() {
    // DataMapper mappings with special characters
    nameRegistry.registerNameMapping({
      originalName: 'Customer-Data@Loader!',
      cleanedName: 'CustomerDataLoader',
      componentType: 'DataMapper',
      recordId: 'odt1',
    });

    nameRegistry.registerNameMapping({
      originalName: 'Product#Info$Extractor',
      cleanedName: 'ProductInfoExtractor',
      componentType: 'DataMapper',
      recordId: 'odt2',
    });

    // Integration Procedure mappings (Type_SubType format) with special characters
    nameRegistry.registerNameMapping({
      originalName: 'API-Gateway_Customer@Info!',
      cleanedName: 'APIGateway_CustomerInfo',
      componentType: 'IntegrationProcedure',
      recordId: 'op1',
    });

    nameRegistry.registerNameMapping({
      originalName: 'Data#Validation$Service',
      cleanedName: 'DataValidation_Service',
      componentType: 'IntegrationProcedure',
      recordId: 'op2',
    });

    // OmniScript mappings (Type_SubType_Language format) with special characters
    nameRegistry.registerNameMapping({
      originalName: 'Customer-Profile_Account@View!_English',
      cleanedName: 'CustomerProfile_AccountView_English',
      componentType: 'OmniScript',
      recordId: 'op3',
    });

    nameRegistry.registerNameMapping({
      originalName: 'Product#Catalog$_Detail&View_Spanish',
      cleanedName: 'ProductCatalog_DetailView_Spanish',
      componentType: 'OmniScript',
      recordId: 'op4',
    });
  }

  describe('Standard Data Model Assessment - OmniProcess with Special Characters', () => {
    it('should assess OmniProcess (OmniScript) with special characters in Type and clean them', async () => {
      const mockElements = [
        {
          Id: 'ope1',
          Name: 'TestElement1',
          Type: 'Text', // Standard Data Model uses 'Type' not 'Type__c'
          PropertySetConfig: JSON.stringify({}), // Standard Data Model uses 'PropertySetConfig' not 'PropertySet__c'
          Level: 0, // Standard Data Model uses 'Level' not 'Level__c'
          ParentElementId: null,
        },
      ];

      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'op123',
        Name: 'TestOmniProcess',
        Type: 'Customer-Profile@', // Special characters - Standard Data Model uses 'Type' not 'Type__c'
        SubType: 'Account!View', // Special characters - Standard Data Model uses 'SubType' not 'SubType__c'
        Language: 'English', // Standard Data Model uses 'Language' not 'Language__c'
        VersionNumber: '1', // Standard Data Model uses 'VersionNumber' not 'Version__c'
        IsIntegrationProcedure: false, // Standard Data Model uses 'IsIntegrationProcedure' not 'IsProcedure'
        IsWebCompEnabled: true, // Standard Data Model uses 'IsWebCompEnabled' not 'IsLwcEnabled'
        IsActive: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      // Should clean special characters and show warnings
      expect(result.name).to.equal('CustomerProfile_AccountView_English_1');
      expect(result.oldName).to.equal('Customer-Profile@_Account!View_English_1');
      expect(result.warnings).to.include.members([
        'The OmniScript type will be changed from Customer-Profile@ to CustomerProfile',
        'The OmniScript sub type will be changed from Account!View to AccountView',
      ]);
      expect(result.migrationStatus).to.equal('Warnings');
    });

    it('should assess OmniProcess with IP and DM dependencies having special characters', async () => {
      const mockElements = [
        {
          Id: 'ope1',
          Name: 'IPAction',
          Type: 'Integration Procedure Action',
          PropertySetConfig: JSON.stringify({
            integrationProcedureKey: 'API-Gateway_Customer@Info!',
          }),
          Level: 0,
        },
        {
          Id: 'ope2',
          Name: 'DRAction',
          Type: 'DataRaptor Extract Action',
          PropertySetConfig: JSON.stringify({
            bundle: 'Customer-Data@Loader!',
          }),
          Level: 0,
        },
      ];

      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'op125',
        Name: 'TestOmniScript',
        Type: 'TestType',
        SubType: 'TestSubType',
        Language: 'English',
        VersionNumber: '1',
        IsIntegrationProcedure: false,
        IsWebCompEnabled: true,
        IsActive: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      // Should detect dependencies correctly
      expect(result.dependenciesIP).to.have.lengthOf(1);
      expect(result.dependenciesIP[0].name).to.equal('API-Gateway_Customer@Info!');
      expect(result.dependenciesIP[0].location).to.equal('IPAction');

      expect(result.dependenciesDR).to.have.lengthOf(1);
      expect(result.dependenciesDR[0].name).to.equal('Customer-Data@Loader!');
      expect(result.dependenciesDR[0].location).to.equal('DRAction');
    });
  });

  describe('Standard Data Model Assessment - Reserved Keys Detection', () => {
    it('should detect reserved keys in PropertySet and add warnings', async () => {
      const mockElements = [
        {
          Id: 'ope1',
          Name: 'TestElement',
          Type: 'Text',
          PropertySetConfig: JSON.stringify({
            additionalOutput: {
              Request: 'some value', // Reserved key
              Response: 'other value', // Reserved key
              normalKey: 'normal value',
            },
          }),
          Level: 0,
        },
      ];

      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'op126',
        Name: 'TestOmniScript',
        Type: 'TestType',
        SubType: 'TestSubType',
        IsIntegrationProcedure: true, // Integration Procedure
        IsActive: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      expect(result.warnings).to.include('Reserved keys found in PropertySet: Request, Response');
      expect(result.migrationStatus).to.equal('Needs manual intervention');
    });
  });

  describe('Standard Data Model Migration - OmniProcess Element Mapping with Dependencies', () => {
    it('should map OmniProcessElement with IP dependency having special characters', () => {
      const mockElementRecord = {
        Id: 'ope1',
        Name: 'TestIPElement',
        Type: 'Integration Procedure Action',
        PropertySetConfig: JSON.stringify({
          integrationProcedureKey: 'API-Gateway_Customer@Info!',
          timeout: 30,
        }),
        Level: 0,
        ParentElementId: null,
        OmniProcessId: 'op123',
      };

      const result = (omniScriptTool as any).mapElementData(mockElementRecord, 'op123', new Map(), new Map());

      const propertySet = JSON.parse(result.PropertySetConfig);

      // Should use registry mapping to clean the IP name
      expect(propertySet.integrationProcedureKey).to.equal('APIGateway_CustomerInfo');
      expect(propertySet.timeout).to.equal(30);
      expect(result.OmniProcessId).to.equal('op123');
    });

    it('should map OmniProcessElement with DM dependency having special characters', () => {
      const mockElementRecord = {
        Id: 'ope2',
        Name: 'TestDRElement',
        Type: 'DataRaptor Extract Action',
        PropertySetConfig: JSON.stringify({
          bundle: 'Customer-Data@Loader!',
          inputType: 'JSON',
        }),
        Level: 0,
        OmniProcessId: 'op123',
      };

      const result = (omniScriptTool as any).mapElementData(mockElementRecord, 'op123', new Map(), new Map());

      const propertySet = JSON.parse(result.PropertySetConfig);

      // Should use registry mapping to clean the DM name (special chars removed)
      expect(propertySet.bundle).to.equal('CustomerDataLoader');
      expect(propertySet.inputType).to.equal('JSON');
    });

    it('should handle IP dependency without registry mapping (fallback cleaning)', () => {
      const mockElementRecord = {
        Id: 'ope3',
        Name: 'TestIPElement',
        Type: 'Integration Procedure Action',
        PropertySetConfig: JSON.stringify({
          integrationProcedureKey: 'Unknown-IP@With#Special$Chars',
        }),
        Level: 0,
        OmniProcessId: 'op123',
      };

      const invalidIpReferences = new Map();
      const result = (omniScriptTool as any).mapElementData(mockElementRecord, 'op123', new Map(), invalidIpReferences);

      const propertySet = JSON.parse(result.PropertySetConfig);

      // Should fallback to cleaning (special chars removed)
      expect(propertySet.integrationProcedureKey).to.equal('UnknownIPWithSpecialChars');
      // Note: Invalid IP reference tracking may need implementation review
    });
  });

  describe('Standard Data Model Migration - OmniProcessCompilation Content Processing', () => {
    it('should update nested content dependencies with special characters', () => {
      const mockDefinition = {
        Id: 'opc1',
        Name: 'TestDefinition',
        Content: JSON.stringify({
          // Standard Data Model uses 'Content' not 'Content__c'
          sOmniScriptId: 'oldId',
          children: [
            {
              type: 'Integration Procedure Action',
              propSetMap: {
                integrationProcedureKey: 'API-Gateway_Customer@Info!',
                remoteOptions: {
                  preTransformBundle: 'Customer-Data@Loader!',
                  postTransformBundle: 'Product#Info$Extractor',
                },
              },
            },
            {
              type: 'DataRaptor Extract Action',
              propSetMap: {
                bundle: 'Customer-Data@Loader!',
              },
            },
            {
              type: 'Step',
              children: [
                {
                  eleArray: [
                    {
                      type: 'OmniScript',
                      propSetMap: {
                        Type: 'Customer-Profile',
                        'Sub Type': 'Account@View!',
                        Language: 'English',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        }),
        OmniProcessId: 'op123',
      };

      const result = (omniScriptTool as any).mapOsDefinitionsData(mockDefinition, 'newOpId');
      const content = JSON.parse(result.Content); // Standard Data Model returns 'Content' not 'Content__c'

      // Check sOmniScriptId update
      expect(content.sOmniScriptId).to.equal('newOpId');

      // Check Integration Procedure Action updates
      const ipAction = content.children[0];
      expect(ipAction.propSetMap.integrationProcedureKey).to.equal('APIGateway_CustomerInfo');
      expect(ipAction.propSetMap.remoteOptions.preTransformBundle).to.equal('CustomerDataLoader');
      expect(ipAction.propSetMap.remoteOptions.postTransformBundle).to.equal('ProductInfoExtractor');

      // Check DataRaptor Action updates
      const drAction = content.children[1];
      expect(drAction.propSetMap.bundle).to.equal('CustomerDataLoader');

      // Check nested OmniScript updates
      const nestedOmniScript = content.children[2].children[0].eleArray[0];
      expect(nestedOmniScript.propSetMap.Type).to.equal('CustomerProfile');
      expect(nestedOmniScript.propSetMap['Sub Type']).to.equal('AccountView');
    });

    it('should handle content with missing dependencies gracefully', () => {
      const mockDefinition = {
        Id: 'opc2',
        Name: 'TestDefinition',
        Content: JSON.stringify({
          // Standard Data Model uses 'Content' not 'Content__c'
          children: [
            {
              type: 'Integration Procedure Action',
              propSetMap: {
                integrationProcedureKey: 'Unknown-IP@With#Special$Chars',
              },
            },
          ],
        }),
        OmniProcessId: 'op123',
      };

      const result = (omniScriptTool as any).mapOsDefinitionsData(mockDefinition, 'newOpId');
      const content = JSON.parse(result.Content);

      // Should fallback to cleaning for unknown dependencies (special chars removed)
      const ipAction = content.children[0];
      expect(ipAction.propSetMap.integrationProcedureKey).to.equal('UnknownIPWithSpecialChars');
    });
  });

  describe('Standard Data Model Migration - Field Mapping Validation', () => {
    it('should handle standard data model field mappings correctly', () => {
      const mockOmniScriptRecord = {
        Id: 'op123',
        Name: 'Test@OmniScript!',
        Type: 'Customer-Profile@', // Standard Data Model field name
        SubType: 'Account!View', // Standard Data Model field name
        Language: 'English', // Standard Data Model field name
        VersionNumber: '1', // Standard Data Model field name
        IsActive: true,
        IsIntegrationProcedure: false,
        IsWebCompEnabled: true, // Standard Data Model field name
      };

      const result = (omniScriptTool as any).mapOmniScriptRecord(mockOmniScriptRecord);

      // In standard data model, should copy the object as-is but clean the Name
      expect(result.Id).to.equal('op123');
      expect(result.Name).to.equal('TestOmniScript'); // Cleaned
      expect(result.Type).to.equal('Customer-Profile@'); // Original preserved (Standard Data Model field)
      expect(result.SubType).to.equal('Account!View'); // Original preserved (Standard Data Model field)
      expect(result.IsActive).to.equal(true);
      expect(result.attributes.type).to.equal('OmniProcess');
      expect(result.attributes.referenceId).to.equal('op123');
    });

    it('should handle OmniProcessElement field mappings for standard data model', () => {
      const mockElementRecord = {
        Id: 'ope1',
        Name: 'Test@Element!',
        Type: 'Text', // Standard Data Model field name
        PropertySetConfig: JSON.stringify({ label: 'Test Label' }), // Standard Data Model field name
        Level: 0, // Standard Data Model field name
        ParentElementId: null,
        OmniProcessId: 'op123',
      };

      const result = (omniScriptTool as any).mapElementData(mockElementRecord, 'op123', new Map(), new Map());

      // In standard data model, should copy the object as-is
      expect(result.Id).to.equal('ope1');
      expect(result.Name).to.equal('Test@Element!'); // Original preserved in elements
      expect(result.Type).to.equal('Text'); // Standard Data Model field name
      expect(result.Level).to.equal(0); // Standard Data Model field name
      expect(result.OmniProcessId).to.equal('op123');
      expect(result.attributes.type).to.equal('OmniProcessElement');
    });
  });

  describe('Standard Data Model - Complex Scenarios with Multiple Dependencies', () => {
    it('should handle OmniProcess with mixed dependency types and special characters', async () => {
      const mockElements = [
        {
          Id: 'ope1',
          Name: 'IPAction@',
          Type: 'Integration Procedure Action',
          PropertySetConfig: JSON.stringify({
            integrationProcedureKey: 'API-Gateway_Customer@Info!',
            preTransformBundle: 'Customer-Data@Loader!',
            postTransformBundle: 'Product#Info$Extractor',
          }),
          Level: 0,
        },
        {
          Id: 'ope2',
          Name: 'DRAction#',
          Type: 'DataRaptor Transform Action',
          PropertySetConfig: JSON.stringify({
            bundle: 'Customer-Data@Loader!',
          }),
          Level: 0,
        },
        {
          Id: 'ope3',
          Name: 'OSAction$',
          Type: 'OmniScript',
          PropertySetConfig: JSON.stringify({
            Type: 'Customer-Profile',
            'Sub Type': 'Account@View!',
            Language: 'English',
          }),
          Level: 0,
        },
      ];

      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'op127',
        Name: 'ComplexOmniScript@',
        Type: 'Complex-Type!', // Standard Data Model field name
        SubType: 'Test@SubType', // Standard Data Model field name
        Language: 'English', // Standard Data Model field name
        VersionNumber: '1', // Standard Data Model field name
        IsIntegrationProcedure: false, // Standard Data Model field name
        IsWebCompEnabled: true, // Standard Data Model field name
        IsActive: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      // Should detect all dependency types
      expect(result.dependenciesIP).to.have.lengthOf(1);
      expect(result.dependenciesIP[0].name).to.equal('API-Gateway_Customer@Info!');

      // DataRaptor dependencies include: bundle from DRAction + preTransformBundle & postTransformBundle from IPAction
      // Note: 'Customer-Data@Loader!' appears in both DRAction and IPAction.preTransformBundle, but is deduplicated
      expect(result.dependenciesDR).to.have.lengthOf(2);
      expect(result.dependenciesDR.map((d) => d.name)).to.include.members([
        'Customer-Data@Loader!',
        'Product#Info$Extractor',
      ]);

      expect(result.dependenciesOS).to.have.lengthOf(1);
      expect(result.dependenciesOS[0].name).to.equal('Customer-Profile_Account@View!_English');

      // Should have warnings for special character cleaning
      expect(result.warnings).to.include.members([
        'The OmniScript type will be changed from Complex-Type! to ComplexType',
        'The OmniScript sub type will be changed from Test@SubType to TestSubType',
        'The OmniScript name will be changed from ComplexOmniScript@ to ComplexOmniScript',
      ]);
    });

    it('should handle OmniProcess migration with update operations for standard data model', async () => {
      const mockOmniscript = {
        Id: 'op128',
        Name: 'Test@OmniScript',
        Type: 'Test-Type@', // Standard Data Model field name
        SubType: 'Test!SubType', // Standard Data Model field name
        Language: 'English', // Standard Data Model field name
        VersionNumber: '1', // Standard Data Model field name
        IsActive: false,
      };

      // Mock the update path for standard data model
      const mappedRecord = (omniScriptTool as any).mapOmniScriptRecord(mockOmniscript);

      expect(mappedRecord.Name).to.equal('TestOmniScript');
      expect(mappedRecord.Type).to.equal('Test-Type@'); // Original preserved (Standard Data Model field)
      expect(mappedRecord.SubType).to.equal('Test!SubType'); // Original preserved (Standard Data Model field)
    });
  });

  describe('Standard Data Model - Multi-Level Element Hierarchy Processing', () => {
    it('should properly handle hierarchical elements with parent-child relationships in standard data model', async () => {
      // This test specifically catches the Map[property] vs Map.set() bug in uploadAllElements
      const mockElements = [
        // Level 0: Root Step element
        {
          Id: 'step001',
          Name: 'CustomerInfoStep',
          Type: 'Step',
          PropertySetConfig: JSON.stringify({
            label: 'Customer Information',
          }),
          Level: 0,
          ParentElementId: null,
          OmniProcessId: 'op123',
        },
        // Level 1: Integration Procedure child of Step
        {
          Id: 'ip001',
          Name: 'GetCustomerData',
          Type: 'Integration Procedure Action',
          PropertySetConfig: JSON.stringify({
            integrationProcedureKey: 'API-Gateway_Customer@Info!',
            timeout: 30,
          }),
          Level: 1,
          ParentElementId: 'step001',
          OmniProcessId: 'op123',
        },
        // Level 1: DataRaptor child of Step
        {
          Id: 'dr001',
          Name: 'TransformCustomerData',
          Type: 'DataRaptor Transform Action',
          PropertySetConfig: JSON.stringify({
            bundle: 'Customer-Data@Loader!',
            inputType: 'JSON',
          }),
          Level: 1,
          ParentElementId: 'step001',
          OmniProcessId: 'op123',
        },
        // Level 0: Another root element (Text)
        {
          Id: 'text001',
          Name: 'CustomerNameInput',
          Type: 'Text',
          PropertySetConfig: JSON.stringify({
            label: 'Customer Name',
            required: true,
          }),
          Level: 0,
          ParentElementId: null,
          OmniProcessId: 'op123',
        },
        // Level 1: Child of Text element
        {
          Id: 'validate001',
          Name: 'ValidateCustomerName',
          Type: 'Formula',
          PropertySetConfig: JSON.stringify({
            formula: 'LENGTH({CustomerName}) > 2',
          }),
          Level: 1,
          ParentElementId: 'text001',
          OmniProcessId: 'op123',
        },
        // Level 2: Grandchild element (child of Integration Procedure)
        {
          Id: 'nested001',
          Name: 'NestedValidation',
          Type: 'Messaging Framework',
          PropertySetConfig: JSON.stringify({
            message: 'Validating customer data...',
          }),
          Level: 2,
          ParentElementId: 'ip001',
          OmniProcessId: 'op123',
        },
      ];

      const mockUploadResult = {
        id: 'op123',
        success: true,
        referenceId: 'originalId',
        hasErrors: false,
        errors: [],
        warnings: [],
        newName: 'TestOmniProcess',
        skipped: false,
      };

      // Mock NetUtils.updateOne to simulate successful updates for standard data model
      const mockUpdateResponses = new Map([
        [
          'step001',
          { id: 'step001', success: true, referenceId: 'step001', hasErrors: false, errors: [], warnings: [] },
        ],
        ['ip001', { id: 'ip001', success: true, referenceId: 'ip001', hasErrors: false, errors: [], warnings: [] }],
        ['dr001', { id: 'dr001', success: true, referenceId: 'dr001', hasErrors: false, errors: [], warnings: [] }],
        [
          'text001',
          { id: 'text001', success: true, referenceId: 'text001', hasErrors: false, errors: [], warnings: [] },
        ],
        [
          'validate001',
          { id: 'validate001', success: true, referenceId: 'validate001', hasErrors: false, errors: [], warnings: [] },
        ],
        [
          'nested001',
          { id: 'nested001', success: true, referenceId: 'nested001', hasErrors: false, errors: [], warnings: [] },
        ],
      ]);

      // Mock NetUtils.updateOne method
      const originalUpdateOne = NetUtils.updateOne.bind(NetUtils);
      NetUtils.updateOne = async (connection, objectName, referenceId, recordId) => {
        return (
          mockUpdateResponses.get(recordId) || {
            success: false,
            errors: ['Mock update failed'],
            referenceId,
            hasErrors: true,
            warnings: [],
          }
        );
      };

      try {
        // Call uploadAllElements directly to test the hierarchical processing
        const result = await (omniScriptTool as any).uploadAllElements(mockUploadResult, mockElements);

        // Verify that ALL elements were processed and stored correctly
        expect(result).to.be.instanceOf(Map);
        expect(result.size).to.equal(6, 'Should have processed all 6 elements');

        // Verify each element was processed at the correct level
        // Level 0 elements should be processed first
        expect(result.has('step001')).to.be.true;
        expect(result.has('text001')).to.be.true;

        // Level 1 elements should be processed after their parents
        expect(result.has('ip001')).to.be.true;
        expect(result.has('dr001')).to.be.true;
        expect(result.has('validate001')).to.be.true;

        // Level 2 elements should be processed last
        expect(result.has('nested001')).to.be.true;

        // Verify the responses are correct UploadRecordResult objects
        const stepResult = result.get('step001');
        expect(stepResult.success).to.be.true;
        expect(stepResult.id).to.equal('step001');

        const ipResult = result.get('ip001');
        expect(ipResult.success).to.be.true;
        expect(ipResult.id).to.equal('ip001');

        const nestedResult = result.get('nested001');
        expect(nestedResult.success).to.be.true;
        expect(nestedResult.id).to.equal('nested001');

        // This test would FAIL with the original bug because:
        // elementsUploadResponse[standardElementId] = response would add properties to the Map object
        // but Array.from(elementsUploadResponse.entries()) would return empty array
        // so elementsUploadInfo would only contain elements from previous levels, not current level
      } finally {
        // Restore original method
        NetUtils.updateOne = originalUpdateOne;
      }
    });

    it('should handle dependency mapping in hierarchical elements for standard data model', () => {
      const mockElements = [
        // Parent Step with nested dependencies
        {
          Id: 'step002',
          Name: 'ProcessingStep',
          Type: 'Step',
          PropertySetConfig: JSON.stringify({
            label: 'Data Processing Step',
          }),
          Level: 0,
          ParentElementId: null,
          OmniProcessId: 'op124',
        },
        // Child IP Action with special character dependencies
        {
          Id: 'ip002',
          Name: 'CustomerProcessing',
          Type: 'Integration Procedure Action',
          PropertySetConfig: JSON.stringify({
            integrationProcedureKey: 'API-Gateway_Customer@Info!',
            preTransformBundle: 'Customer-Data@Loader!',
            postTransformBundle: 'Product#Info$Extractor',
            remoteOptions: {
              preTransformBundle: 'Customer-Data@Loader!',
              postTransformBundle: 'Product#Info$Extractor',
            },
          }),
          Level: 1,
          ParentElementId: 'step002',
          OmniProcessId: 'op124',
        },
        // Child DR Action
        {
          Id: 'dr002',
          Name: 'DataExtraction',
          Type: 'DataRaptor Extract Action',
          PropertySetConfig: JSON.stringify({
            bundle: 'Customer-Data@Loader!',
          }),
          Level: 1,
          ParentElementId: 'step002',
          OmniProcessId: 'op124',
        },
      ];

      // Test element mapping with dependencies
      const ipResult = (omniScriptTool as any).mapElementData(mockElements[1], 'op124', new Map(), new Map());
      const drResult = (omniScriptTool as any).mapElementData(mockElements[2], 'op124', new Map(), new Map());

      // Verify IP Action dependency mapping
      const ipPropertySet = JSON.parse(ipResult.PropertySetConfig);
      expect(ipPropertySet.integrationProcedureKey).to.equal('APIGateway_CustomerInfo');
      expect(ipPropertySet.preTransformBundle).to.equal('CustomerDataLoader');
      expect(ipPropertySet.postTransformBundle).to.equal('ProductInfoExtractor');
      expect(ipPropertySet.remoteOptions.preTransformBundle).to.equal('CustomerDataLoader');
      expect(ipPropertySet.remoteOptions.postTransformBundle).to.equal('ProductInfoExtractor');

      // Verify DR Action dependency mapping
      const drPropertySet = JSON.parse(drResult.PropertySetConfig);
      expect(drPropertySet.bundle).to.equal('CustomerDataLoader');

      // Verify OmniProcessId is set correctly for standard data model
      expect(ipResult.OmniProcessId).to.equal('op124');
      expect(drResult.OmniProcessId).to.equal('op124');
    });
  });

  describe('Standard Data Model - Error Scenarios and Edge Cases', () => {
    it('should handle empty or null dependency references', () => {
      const mockElementRecord = {
        Id: 'ope1',
        Name: 'TestElement',
        Type: 'Integration Procedure Action',
        PropertySetConfig: JSON.stringify({
          integrationProcedureKey: '',
          preTransformBundle: null,
        }),
        Level: 0,
        OmniProcessId: 'op123',
      };

      const result = (omniScriptTool as any).mapElementData(mockElementRecord, 'op123', new Map(), new Map());

      const propertySet = JSON.parse(result.PropertySetConfig);
      expect(propertySet.integrationProcedureKey).to.equal('');
      expect(propertySet.preTransformBundle).to.equal(null);
    });

    it('should handle element processing failure in hierarchical structure', async () => {
      const mockElements = [
        {
          Id: 'step003',
          Name: 'FailingStep',
          Type: 'Step',
          PropertySetConfig: JSON.stringify({}),
          Level: 0,
          ParentElementId: null,
          OmniProcessId: 'op125',
        },
      ];

      const mockUploadResult = {
        id: 'op125',
        success: true,
        referenceId: 'originalId',
        hasErrors: false,
        errors: [],
        warnings: [],
        newName: 'TestFailingProcess',
        skipped: false,
      };

      // Mock NetUtils.updateOne to simulate failure
      const originalUpdateOne = NetUtils.updateOne.bind(NetUtils);
      NetUtils.updateOne = async (connection, objectName, referenceId) => ({
        success: false,
        errors: ['Simulated update failure'],
        hasErrors: true,
        referenceId,
        warnings: [],
      });

      try {
        const result = await (omniScriptTool as any).uploadAllElements(mockUploadResult, mockElements);

        // Should still return a Map even if updates fail
        expect(result).to.be.instanceOf(Map);
        expect(result.size).to.equal(1);

        const failedResult = result.get('step003');
        expect(failedResult.success).to.be.false;
        expect(failedResult.errors).to.include('Simulated update failure');
      } finally {
        // Restore original method
        NetUtils.updateOne = originalUpdateOne;
      }
    });
  });

  describe('Standard Data Model - Transform Bundle Dependency Collection', () => {
    it('should collect preTransformBundle and postTransformBundle dependencies', async () => {
      const mockElements = [
        {
          Id: 'ope_http',
          Name: 'HTTPAction',
          Type: 'HTTP Action',
          PropertySetConfig: JSON.stringify({
            preTransformBundle: 'PreTransform-Bundle@Test!',
            postTransformBundle: 'PostTransform-Bundle@Test!',
          }),
          Level: 0,
        },
      ];

      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'op_transform',
        Name: 'TransformTestScript',
        Type: 'TransformTest',
        SubType: 'TestSubType',
        Language: 'English',
        VersionNumber: '1',
        IsIntegrationProcedure: false,
        IsWebCompEnabled: true,
        IsActive: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      expect(result.dependenciesDR).to.have.lengthOf(2);
      expect(result.dependenciesDR.map((d) => d.name)).to.include.members([
        'PreTransform-Bundle@Test!',
        'PostTransform-Bundle@Test!',
      ]);
    });

    it('should collect xmlPreTransformBundle and xmlPostTransformBundle dependencies', async () => {
      const mockElements = [
        {
          Id: 'ope_xml',
          Name: 'XMLAction',
          Type: 'Remote Action',
          PropertySetConfig: JSON.stringify({
            xmlPreTransformBundle: 'XMLPre-Bundle@Test!',
            xmlPostTransformBundle: 'XMLPost-Bundle@Test!',
          }),
          Level: 0,
        },
      ];

      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'op_xml_transform',
        Name: 'XMLTransformScript',
        Type: 'XMLTransformTest',
        SubType: 'TestSubType',
        Language: 'English',
        VersionNumber: '1',
        IsIntegrationProcedure: false,
        IsWebCompEnabled: true,
        IsActive: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      expect(result.dependenciesDR).to.have.lengthOf(2);
      expect(result.dependenciesDR.map((d) => d.name)).to.include.members([
        'XMLPre-Bundle@Test!',
        'XMLPost-Bundle@Test!',
      ]);
    });

    it('should collect remoteOptions transform bundle dependencies', async () => {
      const mockElements = [
        {
          Id: 'ope_remote',
          Name: 'RemoteOptionsAction',
          Type: 'Integration Procedure Action',
          PropertySetConfig: JSON.stringify({
            integrationProcedureKey: 'TestIP_TestSubType',
            remoteOptions: {
              preTransformBundle: 'RemotePre-Bundle@Test!',
              postTransformBundle: 'RemotePost-Bundle@Test!',
            },
          }),
          Level: 0,
        },
      ];

      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'op_remote_transform',
        Name: 'RemoteTransformScript',
        Type: 'RemoteTransformTest',
        SubType: 'TestSubType',
        Language: 'English',
        VersionNumber: '1',
        IsIntegrationProcedure: false,
        IsWebCompEnabled: true,
        IsActive: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      // Should collect IP dependency + remoteOptions transform bundles
      expect(result.dependenciesIP).to.have.lengthOf(1);
      expect(result.dependenciesDR.map((d) => d.name)).to.include.members([
        'RemotePre-Bundle@Test!',
        'RemotePost-Bundle@Test!',
      ]);
    });
  });

  describe('Standard Data Model - DocuSign Action Dependencies', () => {
    it('should collect DocuSign Envelope Action transform bundle dependencies', async () => {
      const mockElements = [
        {
          Id: 'ope_docusign_env',
          Name: 'DocuSignEnvelopeAction',
          Type: 'DocuSign Envelope Action',
          PropertySetConfig: JSON.stringify({
            docuSignTemplatesGroup: [
              { transformBundle: 'DocuSignTemplate-Bundle1@!' },
              { transformBundle: 'DocuSignTemplate-Bundle2@!' },
            ],
          }),
          Level: 0,
        },
      ];

      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'op_docusign',
        Name: 'DocuSignScript',
        Type: 'DocuSignTest',
        SubType: 'TestSubType',
        Language: 'English',
        VersionNumber: '1',
        IsIntegrationProcedure: false,
        IsWebCompEnabled: true,
        IsActive: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      expect(result.dependenciesDR).to.have.lengthOf(2);
      expect(result.dependenciesDR.map((d) => d.name)).to.include.members([
        'DocuSignTemplate-Bundle1@!',
        'DocuSignTemplate-Bundle2@!',
      ]);
    });

    it('should collect DocuSign Signature Action transform bundle dependencies', async () => {
      const mockElements = [
        {
          Id: 'ope_docusign_sig',
          Name: 'DocuSignSignatureAction',
          Type: 'DocuSign Signature Action',
          PropertySetConfig: JSON.stringify({
            docuSignTemplatesGroupSig: [
              { transformBundle: 'DocuSignSig-Bundle1@!' },
              { transformBundle: 'DocuSignSig-Bundle2@!' },
            ],
          }),
          Level: 0,
        },
      ];

      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'op_docusign_sig',
        Name: 'DocuSignSigScript',
        Type: 'DocuSignSigTest',
        SubType: 'TestSubType',
        Language: 'English',
        VersionNumber: '1',
        IsIntegrationProcedure: false,
        IsWebCompEnabled: true,
        IsActive: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      expect(result.dependenciesDR).to.have.lengthOf(2);
      expect(result.dependenciesDR.map((d) => d.name)).to.include.members([
        'DocuSignSig-Bundle1@!',
        'DocuSignSig-Bundle2@!',
      ]);
    });
  });

  describe('Standard Data Model - OmniScript Action Dependencies', () => {
    it('should collect OmniScript Action dependencies with Type, SubType, Language', async () => {
      const mockElements = [
        {
          Id: 'ope_os_action',
          Name: 'OmniScriptAction',
          Type: 'OmniScript',
          PropertySetConfig: JSON.stringify({
            Type: 'Child-OS@Type!',
            'Sub Type': 'Child-OS@SubType!',
            Language: 'English',
          }),
          Level: 0,
        },
      ];

      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'op_os_action',
        Name: 'ParentOmniScript',
        Type: 'ParentType',
        SubType: 'ParentSubType',
        Language: 'English',
        VersionNumber: '1',
        IsIntegrationProcedure: false,
        IsWebCompEnabled: true,
        IsActive: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      expect(result.dependenciesOS).to.have.lengthOf(1);
      expect(result.dependenciesOS[0].name).to.equal('Child-OS@Type!_Child-OS@SubType!_English');
    });
  });

  describe('Standard Data Model - Reserved Keys Detection', () => {
    it('should detect reserved keys in additionalOutput and add warnings', async () => {
      const mockElements = [
        {
          Id: 'ope_reserved',
          Name: 'ReservedKeyElement',
          Type: 'Set Values',
          PropertySetConfig: JSON.stringify({
            additionalOutput: {
              Request: 'someValue',
              Response: 'anotherValue',
            },
          }),
          Level: 0,
        },
      ];

      (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(mockElements);

      const mockOmniscript = {
        Id: 'op_reserved',
        Name: 'ReservedKeyScript',
        Type: 'ReservedTest',
        SubType: 'TestSubType',
        Language: 'English',
        VersionNumber: '1',
        IsIntegrationProcedure: false,
        IsWebCompEnabled: true,
        IsActive: true,
      };

      const result = await (omniScriptTool as any).processOmniScript(
        mockOmniscript,
        new Set<string>(),
        new Set<string>(),
        new Set<string>()
      );

      // Should add warnings for reserved keys
      expect(result.warnings).to.have.length.greaterThan(0);
      expect(result.migrationStatus).to.be.oneOf(['Warnings', 'Needs manual intervention']);
    });
  });

  describe('Standard Data Model - Migration Element Processing', () => {
    it('should process Integration Procedure Action and update references using registry', () => {
      nameRegistry.registerNameMapping({
        originalName: 'MigIPType_MigIPSubType',
        cleanedName: 'MigIPTypeClean_MigIPSubTypeClean',
        componentType: 'IntegrationProcedure',
        recordId: 'ip_mig1',
      });

      nameRegistry.registerNameMapping({
        originalName: 'MigPreBundle',
        cleanedName: 'MigPreBundleClean',
        componentType: 'DataMapper',
        recordId: 'dm_mig1',
      });

      nameRegistry.registerNameMapping({
        originalName: 'MigPostBundle',
        cleanedName: 'MigPostBundleClean',
        componentType: 'DataMapper',
        recordId: 'dm_mig2',
      });

      const mockElementRecord = {
        Id: 'ope_ip_mig',
        Name: 'IPMigrationAction',
        Type: 'Integration Procedure Action',
        PropertySetConfig: JSON.stringify({
          integrationProcedureKey: 'MigIPType_MigIPSubType',
          preTransformBundle: 'MigPreBundle',
          postTransformBundle: 'MigPostBundle',
        }),
        Level: 0,
        OmniProcessId: 'op_mig1',
      };

      const result = (omniScriptTool as any).mapElementData(mockElementRecord, 'op_mig1', new Map(), new Map());

      const propertySet = JSON.parse(result.PropertySetConfig);
      expect(propertySet.integrationProcedureKey).to.equal('MigIPTypeClean_MigIPSubTypeClean');
      expect(propertySet.preTransformBundle).to.equal('MigPreBundleClean');
      expect(propertySet.postTransformBundle).to.equal('MigPostBundleClean');
    });

    it('should process DataRaptor Transform Action and update bundle using registry', () => {
      nameRegistry.registerNameMapping({
        originalName: 'MigDRBundle',
        cleanedName: 'MigDRBundleClean',
        componentType: 'DataMapper',
        recordId: 'dm_dr_mig',
      });

      const mockElementRecord = {
        Id: 'ope_dr_mig',
        Name: 'DRMigrationAction',
        Type: 'DataRaptor Transform Action',
        PropertySetConfig: JSON.stringify({
          bundle: 'MigDRBundle',
        }),
        Level: 0,
        OmniProcessId: 'op_mig2',
      };

      const result = (omniScriptTool as any).mapElementData(mockElementRecord, 'op_mig2', new Map(), new Map());

      const propertySet = JSON.parse(result.PropertySetConfig);
      expect(propertySet.bundle).to.equal('MigDRBundleClean');
    });

    it('should process OmniScript Action and update Type, SubType using registry', () => {
      nameRegistry.registerNameMapping({
        originalName: 'MigOSType_MigOSSubType_English',
        cleanedName: 'MigOSTypeClean_MigOSSubTypeClean_English',
        componentType: 'OmniScript',
        recordId: 'os_mig1',
      });

      const mockElementRecord = {
        Id: 'ope_os_mig',
        Name: 'OSMigrationAction',
        Type: 'OmniScript',
        PropertySetConfig: JSON.stringify({
          Type: 'MigOSType',
          'Sub Type': 'MigOSSubType',
          Language: 'English',
        }),
        Level: 0,
        OmniProcessId: 'op_mig3',
      };

      const result = (omniScriptTool as any).mapElementData(mockElementRecord, 'op_mig3', new Map(), new Map());

      const propertySet = JSON.parse(result.PropertySetConfig);
      expect(propertySet.Type).to.equal('MigOSTypeClean');
      expect(propertySet['Sub Type']).to.equal('MigOSSubTypeClean');
    });
  });
});
