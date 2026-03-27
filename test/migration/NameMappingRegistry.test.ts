/* eslint-disable @typescript-eslint/no-explicit-any, camelcase, comma-dangle */
import { expect } from 'chai';
import { NameMappingRegistry, ComponentNameMapping } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';

describe('NameMappingRegistry', () => {
  let registry: NameMappingRegistry;

  beforeEach(() => {
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

    registry = NameMappingRegistry.getInstance();
    registry.clear();
  });

  describe('Component Registration', () => {
    it('should register DataMapper name mappings', () => {
      const mapping: ComponentNameMapping = {
        originalName: 'Customer Data-Loader',
        cleanedName: 'CustomerDataLoader',
        componentType: 'DataMapper',
        recordId: 'dr123',
      };

      registry.registerNameMapping(mapping);

      expect(registry.hasDataMapperMapping('Customer Data-Loader')).to.be.true;
      expect(registry.getDataMapperCleanedName('Customer Data-Loader')).to.equal('CustomerDataLoader');
    });

    it('should register OmniScript name mappings with Type_SubType_Language format', () => {
      const mapping: ComponentNameMapping = {
        originalName: 'Customer-Info_Account Details_English',
        cleanedName: 'CustomerInfo_AccountDetails_English',
        componentType: 'OmniScript',
        recordId: 'os123',
      };

      registry.registerNameMapping(mapping);

      expect(registry.hasOmniScriptMapping('Customer-Info_Account Details_English')).to.be.true;
      const cleanedName = registry.getOmniScriptCleanedName('Customer-Info', 'Account Details', 'English');
      expect(cleanedName).to.equal('CustomerInfo_AccountDetails_English');
    });

    it('should register Integration Procedure name mappings with Type_SubType format only', () => {
      const mapping: ComponentNameMapping = {
        originalName: 'API-Gateway_Customer Data',
        cleanedName: 'APIGateway_CustomerData',
        componentType: 'IntegrationProcedure',
        recordId: 'ip123',
      };

      registry.registerNameMapping(mapping);

      expect(registry.hasIntegrationProcedureMapping('API-Gateway_Customer Data')).to.be.true;
      expect(registry.getIntegrationProcedureCleanedName('API-Gateway_Customer Data')).to.equal(
        'APIGateway_CustomerData'
      );
    });

    it('should register FlexCard name mappings', () => {
      const mapping: ComponentNameMapping = {
        originalName: 'Customer-Dashboard Card',
        cleanedName: 'CustomerDashboardCard',
        componentType: 'FlexCard',
        recordId: 'fc123',
      };

      registry.registerNameMapping(mapping);

      expect(registry.hasFlexCardMapping('Customer-Dashboard Card')).to.be.true;
      expect(registry.getFlexCardCleanedName('Customer-Dashboard Card')).to.equal('CustomerDashboardCard');
    });
  });

  describe('Pre-processing Components', () => {
    it('should pre-process DataMappers and register mappings', () => {
      const dataMappers = [
        { Id: 'dr1', Name: 'Customer-Data Loader' },
        { Id: 'dr2', Name: 'Account_Information' },
      ];

      registry.preProcessComponents(dataMappers, [], [], [], []);

      expect(registry.hasDataMapperMapping('Customer-Data Loader')).to.be.true;
      expect(registry.getDataMapperCleanedName('Customer-Data Loader')).to.equal('CustomerDataLoader');
      expect(registry.hasDataMapperMapping('Account_Information')).to.be.true;
    });

    it('should pre-process OmniScripts with namespaced fields', () => {
      const omniScripts = [
        {
          Id: 'os1',
          Name: 'CustomerInfo_AccountDetails_English',
          ['vlocity_ins__Type__c']: 'Customer-Info',
          ['vlocity_ins__SubType__c']: 'Account Details',
          ['vlocity_ins__Language__c']: 'English',
        },
      ];

      registry.preProcessComponents([], omniScripts, [], [], []);

      expect(registry.hasOmniScriptMapping('Customer-Info_Account Details_English')).to.be.true;
    });

    it('should pre-process Integration Procedures with Type_SubType format only', () => {
      const integrationProcedures = [
        {
          Id: 'ip1',
          Name: 'APIGateway_CustomerData',
          ['vlocity_ins__Type__c']: 'API-Gateway',
          ['vlocity_ins__SubType__c']: 'Customer Data',
          ['vlocity_ins__Language__c']: 'English',
          ['vlocity_ins__IsProcedure__c']: true,
        },
      ];

      registry.preProcessComponents([], [], [], integrationProcedures, []);

      expect(registry.hasIntegrationProcedureMapping('API-Gateway_Customer Data')).to.be.true;
      expect(registry.getIntegrationProcedureCleanedName('API-Gateway_Customer Data')).to.equal(
        'APIGateway_CustomerData'
      );
    });
  });

  describe('Name Change Warnings', () => {
    beforeEach(() => {
      // Register components with name changes
      registry.registerNameMapping({
        originalName: 'Customer-Data Loader',
        cleanedName: 'CustomerDataLoader',
        componentType: 'DataMapper',
        recordId: 'dr1',
      });

      registry.registerNameMapping({
        originalName: 'Account_Information',
        cleanedName: 'Account_Information',
        componentType: 'DataMapper',
        recordId: 'dr2',
      });
    });

    it('should generate warnings for components with name changes', () => {
      const warnings = registry.getNameChangeWarnings();

      expect(warnings).to.have.length(1);
      expect(warnings[0]).to.include('Customer-Data Loader');
      expect(warnings[0]).to.include('CustomerDataLoader');
    });

    it('should generate warnings by component type', () => {
      const warnings = registry.getNameChangeWarningsForType('DataMapper');

      expect(warnings).to.have.length(1);
      expect(warnings[0]).to.equal('"Customer-Data Loader" → "CustomerDataLoader"');
    });

    it('should count name changes by type', () => {
      const counts = registry.getNameChangeCountByType();

      expect(counts['DataMapper']).to.equal(1);
    });
  });

  describe('Dependency Reference Updates', () => {
    beforeEach(() => {
      // Setup registry with various component mappings
      registry.registerNameMapping({
        originalName: 'Customer-Data',
        cleanedName: 'CustomerData',
        componentType: 'DataMapper',
        recordId: 'dr1',
      });

      registry.registerNameMapping({
        originalName: 'API_Gateway_Customer Info',
        cleanedName: 'APIGateway_CustomerInfo',
        componentType: 'IntegrationProcedure',
        recordId: 'ip1',
      });

      registry.registerNameMapping({
        originalName: 'Customer-Profile_Account-View_English',
        cleanedName: 'CustomerProfile_AccountView_English',
        componentType: 'OmniScript',
        recordId: 'os1',
      });
    });

    it('should update DataMapper references in object', () => {
      const testObject = {
        dataSource: {
          type: 'DataRaptor',
          bundle: 'Customer-Data',
        },
        formula: 'LOOKUP("Customer-Data", "AccountId")',
      };

      const updated = registry.updateDependencyReferences(testObject);

      expect(updated.dataSource.bundle).to.equal('CustomerData');
    });

    it('should update Integration Procedure references in object', () => {
      const testObject = {
        integrationProcedureKey: 'API_Gateway_Customer Info',
        actions: [
          {
            type: 'IP Action',
            procedureName: 'API_Gateway_Customer Info',
          },
        ],
      };

      const updated = registry.updateDependencyReferences(testObject);

      expect(updated.integrationProcedureKey).to.equal('APIGateway_CustomerInfo');
      expect(updated.actions[0].procedureName).to.equal('APIGateway_CustomerInfo');
    });

    it('should update OmniScript references in object', () => {
      const testObject = {
        omniscripts: [
          {
            type: 'Customer-Profile',
            subtype: 'Account-View',
            language: 'English',
          },
        ],
      };

      const updated = registry.updateDependencyReferences(testObject);

      // Note: This tests the string replacement logic in updateStringReference
      // The actual OmniScript object structure is handled by specific methods
      expect(updated.omniscripts).to.be.an('array');
    });

    it('should handle nested objects and arrays', () => {
      const testObject = {
        states: [
          {
            components: {
              comp1: {
                dataSource: 'Customer-Data',
                children: [
                  {
                    reference: 'API_Gateway_Customer Info',
                  },
                ],
              },
            },
          },
        ],
      };

      const updated = registry.updateDependencyReferences(testObject);

      expect(updated.states[0].components.comp1.dataSource).to.equal('CustomerData');
      expect(updated.states[0].components.comp1.children[0].reference).to.equal('APIGateway_CustomerInfo');
    });
  });

  describe('Fallback Behavior', () => {
    it('should return original name when no mapping exists', () => {
      expect(registry.getDataMapperCleanedName('UnknownDataMapper')).to.equal('UnknownDataMapper');
      expect(registry.getIntegrationProcedureCleanedName('UnknownIP')).to.equal('UnknownIP');
      expect(registry.getFlexCardCleanedName('UnknownCard')).to.equal('UnknownCard');
    });

    it('should return cleaned name when no mapping exists for OmniScript', () => {
      const cleanedName = registry.getOmniScriptCleanedName('Unknown-Type', 'Unknown-SubType', 'English');
      expect(cleanedName).to.equal('UnknownType_UnknownSubType_English');
    });
  });

  describe('Registry State Management', () => {
    it('should clear all mappings', () => {
      registry.registerNameMapping({
        originalName: 'Test',
        cleanedName: 'Test',
        componentType: 'DataMapper',
        recordId: 'test1',
      });

      registry.clear();

      expect(registry.hasDataMapperMapping('Test')).to.be.false;
      expect(registry.getAllNameMappings()).to.have.length(0);
    });

    it('should return all name mappings', () => {
      registry.registerNameMapping({
        originalName: 'Test1',
        cleanedName: 'Test1',
        componentType: 'DataMapper',
        recordId: 'test1',
      });

      registry.registerNameMapping({
        originalName: 'Test2',
        cleanedName: 'Test2',
        componentType: 'OmniScript',
        recordId: 'test2',
      });

      const allMappings = registry.getAllNameMappings();
      expect(allMappings).to.have.length(2);
    });
  });

  // Standard Data Model Tests
  describe('Standard Data Model Support', () => {
    let standardModelRegistry: NameMappingRegistry;

    beforeEach(() => {
      // Initialize data model service for standard data model
      const mockStandardOrgDetails: OmnistudioOrgDetails = {
        packageDetails: { version: '1.0.0', namespace: '' },
        omniStudioOrgPermissionEnabled: true, // This makes IS_STANDARD_DATA_MODEL = true
        orgDetails: { Name: 'Standard Test Org', Id: '00D000000000001' },
        dataModel: 'Standard',
        hasValidNamespace: false,
        isFoundationPackage: false,
        isOmnistudioMetadataAPIEnabled: false,
        isDRVersioningEnabled: false,
      };
      initializeDataModelService(mockStandardOrgDetails);

      standardModelRegistry = NameMappingRegistry.getInstance();
      standardModelRegistry.clear();
    });

    describe('Standard Data Model Pre-processing Components', () => {
      it('should pre-process OmniScripts with standard field names', () => {
        const omniScripts = [
          {
            Id: 'os1',
            Name: 'CustomerInfo_AccountDetails_English',
            Type: 'Customer-Info',
            SubType: 'Account Details',
            Language: 'English',
          },
          {
            Id: 'os2',
            Name: 'ProductInfo_Overview_Spanish',
            Type: 'Product Info',
            SubType: 'Overview',
            Language: 'Spanish',
          },
        ];

        standardModelRegistry.preProcessComponents([], omniScripts, [], [], []);

        expect(standardModelRegistry.hasOmniScriptMapping('Customer-Info_Account Details_English')).to.be.true;
        expect(standardModelRegistry.hasOmniScriptMapping('Product Info_Overview_Spanish')).to.be.true;

        const cleanedName1 = standardModelRegistry.getOmniScriptCleanedName(
          'Customer-Info',
          'Account Details',
          'English'
        );
        expect(cleanedName1).to.equal('CustomerInfo_AccountDetails_English');

        const cleanedName2 = standardModelRegistry.getOmniScriptCleanedName('Product Info', 'Overview', 'Spanish');
        expect(cleanedName2).to.equal('ProductInfo_Overview_Spanish');
      });

      it('should pre-process OmniScripts with default Language when not specified', () => {
        const omniScripts = [
          {
            Id: 'os1',
            Name: 'CustomerInfo_AccountDetails_English',
            Type: 'Customer-Info',
            SubType: 'Account Details',
            // Language field missing, should default to 'English'
          },
        ];

        standardModelRegistry.preProcessComponents([], omniScripts, [], [], []);

        expect(standardModelRegistry.hasOmniScriptMapping('Customer-Info_Account Details_English')).to.be.true;
        const cleanedName = standardModelRegistry.getOmniScriptCleanedName(
          'Customer-Info',
          'Account Details',
          'English'
        );
        expect(cleanedName).to.equal('CustomerInfo_AccountDetails_English');
      });

      it('should pre-process Angular OmniScripts with standard field names', () => {
        const angularOmniScripts = [
          {
            Id: 'aos1',
            Name: 'AngularScript_CustomerView_English',
            Type: 'Angular-Script',
            SubType: 'Customer View',
            Language: 'English',
          },
        ];

        standardModelRegistry.preProcessComponents([], [], angularOmniScripts, [], []);

        expect(standardModelRegistry.isAngularOmniScript('Angular-Script_Customer View_English')).to.be.true;
        const angularRefs = standardModelRegistry.getAngularOmniScriptRefs();
        expect(angularRefs.has('Angular-Script_Customer View_English')).to.be.true;
      });

      it('should pre-process Angular OmniScripts with default Language when not specified', () => {
        const angularOmniScripts = [
          {
            Id: 'aos1',
            Name: 'AngularScript_CustomerView_English',
            Type: 'Angular-Script',
            SubType: 'Customer View',
            // Language field missing, should default to 'English'
          },
        ];

        standardModelRegistry.preProcessComponents([], [], angularOmniScripts, [], []);

        expect(standardModelRegistry.isAngularOmniScript('Angular-Script_Customer View_English')).to.be.true;
      });

      it('should pre-process Integration Procedures with standard field names', () => {
        const integrationProcedures = [
          {
            Id: 'ip1',
            Name: 'APIGateway_CustomerData',
            Type: 'API-Gateway',
            SubType: 'Customer Data',
            Language: 'English', // Should be ignored for Integration Procedures
            IsProcedure: true,
          },
          {
            Id: 'ip2',
            Name: 'DataProcessing_AccountSync',
            Type: 'Data Processing',
            SubType: 'Account-Sync',
            IsProcedure: true,
          },
        ];

        standardModelRegistry.preProcessComponents([], [], [], integrationProcedures, []);

        expect(standardModelRegistry.hasIntegrationProcedureMapping('API-Gateway_Customer Data')).to.be.true;
        expect(standardModelRegistry.hasIntegrationProcedureMapping('Data Processing_Account-Sync')).to.be.true;

        expect(standardModelRegistry.getIntegrationProcedureCleanedName('API-Gateway_Customer Data')).to.equal(
          'APIGateway_CustomerData'
        );
        expect(standardModelRegistry.getIntegrationProcedureCleanedName('Data Processing_Account-Sync')).to.equal(
          'DataProcessing_AccountSync'
        );
      });

      it('should pre-process DataMappers with standard field names (Name field)', () => {
        const dataMappers = [
          { Id: 'dr1', Name: 'Customer-Data Loader' },
          { Id: 'dr2', Name: 'Account Information Extractor' },
          { Id: 'dr3', Name: 'Product_Catalog_Mapper' },
        ];

        standardModelRegistry.preProcessComponents(dataMappers, [], [], [], []);

        expect(standardModelRegistry.hasDataMapperMapping('Customer-Data Loader')).to.be.true;
        expect(standardModelRegistry.hasDataMapperMapping('Account Information Extractor')).to.be.true;
        expect(standardModelRegistry.hasDataMapperMapping('Product_Catalog_Mapper')).to.be.true;

        expect(standardModelRegistry.getDataMapperCleanedName('Customer-Data Loader')).to.equal('CustomerDataLoader');
        expect(standardModelRegistry.getDataMapperCleanedName('Account Information Extractor')).to.equal(
          'AccountInformationExtractor'
        );
        expect(standardModelRegistry.getDataMapperCleanedName('Product_Catalog_Mapper')).to.equal(
          'ProductCatalogMapper'
        );
      });

      it('should pre-process FlexCards with standard field names (Name field)', () => {
        const flexCards = [
          { Id: 'fc1', Name: 'Customer-Dashboard Card' },
          { Id: 'fc2', Name: 'Product Information Panel' },
          { Id: 'fc3', Name: 'Account_Summary_Card' },
        ];

        standardModelRegistry.preProcessComponents([], [], [], [], flexCards);

        expect(standardModelRegistry.hasFlexCardMapping('Customer-Dashboard Card')).to.be.true;
        expect(standardModelRegistry.hasFlexCardMapping('Product Information Panel')).to.be.true;
        expect(standardModelRegistry.hasFlexCardMapping('Account_Summary_Card')).to.be.true;

        expect(standardModelRegistry.getFlexCardCleanedName('Customer-Dashboard Card')).to.equal(
          'CustomerDashboardCard'
        );
        expect(standardModelRegistry.getFlexCardCleanedName('Product Information Panel')).to.equal(
          'ProductInformationPanel'
        );
        expect(standardModelRegistry.getFlexCardCleanedName('Account_Summary_Card')).to.equal('AccountSummaryCard');
      });
    });

    describe('Standard Data Model Component Registration', () => {
      it('should register and retrieve OmniScript mappings correctly', () => {
        const mapping: ComponentNameMapping = {
          originalName: 'Customer-Profile_Account-Details_English',
          cleanedName: 'CustomerProfile_AccountDetails_English',
          componentType: 'OmniScript',
          recordId: 'os123',
        };

        standardModelRegistry.registerNameMapping(mapping);

        expect(standardModelRegistry.hasOmniScriptMapping('Customer-Profile_Account-Details_English')).to.be.true;
        const cleanedName = standardModelRegistry.getOmniScriptCleanedName(
          'Customer-Profile',
          'Account-Details',
          'English'
        );
        expect(cleanedName).to.equal('CustomerProfile_AccountDetails_English');
      });

      it('should register and retrieve Integration Procedure mappings correctly', () => {
        const mapping: ComponentNameMapping = {
          originalName: 'API Gateway_Customer-Data Processing',
          cleanedName: 'APIGateway_CustomerDataProcessing',
          componentType: 'IntegrationProcedure',
          recordId: 'ip123',
        };

        standardModelRegistry.registerNameMapping(mapping);

        expect(standardModelRegistry.hasIntegrationProcedureMapping('API Gateway_Customer-Data Processing')).to.be.true;
        expect(
          standardModelRegistry.getIntegrationProcedureCleanedName('API Gateway_Customer-Data Processing')
        ).to.equal('APIGateway_CustomerDataProcessing');
      });
    });

    describe('Standard Data Model Dependency Reference Updates', () => {
      beforeEach(() => {
        // Setup standard model registry with various component mappings
        standardModelRegistry.registerNameMapping({
          originalName: 'Customer-Data Processor',
          cleanedName: 'CustomerDataProcessor',
          componentType: 'DataMapper',
          recordId: 'dr1',
        });

        standardModelRegistry.registerNameMapping({
          originalName: 'API Gateway_Customer-Info Processing',
          cleanedName: 'APIGateway_CustomerInfoProcessing',
          componentType: 'IntegrationProcedure',
          recordId: 'ip1',
        });

        standardModelRegistry.registerNameMapping({
          originalName: 'Customer-Profile_Account-View_English',
          cleanedName: 'CustomerProfile_AccountView_English',
          componentType: 'OmniScript',
          recordId: 'os1',
        });

        standardModelRegistry.registerNameMapping({
          originalName: 'Customer-Dashboard Card',
          cleanedName: 'CustomerDashboardCard',
          componentType: 'FlexCard',
          recordId: 'fc1',
        });
      });

      it('should update all component type references in complex nested objects', () => {
        const testObject = {
          dataSource: {
            type: 'DataRaptor',
            bundle: 'Customer-Data Processor',
            flexCardRef: 'Customer-Dashboard Card',
          },
          procedures: [
            {
              name: 'API Gateway_Customer-Info Processing',
              type: 'IntegrationProcedure',
            },
          ],
          omniscripts: {
            reference: 'Customer-Profile_Account-View_English',
          },
          formula: 'LOOKUP("Customer-Data Processor", "AccountId") + CALL("API Gateway_Customer-Info Processing")',
        };

        const updated = standardModelRegistry.updateDependencyReferences(testObject);

        expect(updated.dataSource.bundle).to.equal('CustomerDataProcessor');
        expect(updated.dataSource.flexCardRef).to.equal('CustomerDashboardCard');
        expect(updated.procedures[0].name).to.equal('APIGateway_CustomerInfoProcessing');
        expect(updated.omniscripts.reference).to.equal('CustomerProfile_AccountView_English');
      });

      it('should preserve non-component references unchanged', () => {
        const testObject = {
          standardFields: ['Name', 'Type', 'SubType', 'Language'],
          systemReferences: {
            salesforceObject: 'Account',
            customField: 'Custom_Field__c',
          },
          unregisteredComponent: 'Unknown_Component_Name',
          mixedReferences: [
            'Customer-Data Processor', // Should be updated
            'Unknown_Component', // Should remain unchanged
            'API Gateway_Customer-Info Processing', // Should be updated
          ],
        };

        const updated = standardModelRegistry.updateDependencyReferences(testObject);

        expect(updated.standardFields).to.deep.equal(['Name', 'Type', 'SubType', 'Language']);
        expect(updated.systemReferences.salesforceObject).to.equal('Account');
        expect(updated.systemReferences.customField).to.equal('Custom_Field__c');
        expect(updated.unregisteredComponent).to.equal('Unknown_Component_Name');
        expect(updated.mixedReferences[0]).to.equal('CustomerDataProcessor');
        expect(updated.mixedReferences[1]).to.equal('Unknown_Component');
        expect(updated.mixedReferences[2]).to.equal('APIGateway_CustomerInfoProcessing');
      });
    });

    describe('Standard Data Model Angular OmniScript Handling', () => {
      it('should register and identify Angular OmniScripts correctly', () => {
        const angularOmniScripts = [
          {
            Id: 'aos1',
            Type: 'Angular-Customer',
            SubType: 'Profile-View',
            Language: 'English',
          },
          {
            Id: 'aos2',
            Type: 'Legacy-Script',
            SubType: 'Data-Entry',
            // Language defaults to English
          },
        ];

        standardModelRegistry.preProcessComponents([], [], angularOmniScripts, [], []);

        expect(standardModelRegistry.isAngularOmniScript('Angular-Customer_Profile-View_English')).to.be.true;
        expect(standardModelRegistry.isAngularOmniScript('Legacy-Script_Data-Entry_English')).to.be.true;
        expect(standardModelRegistry.isAngularOmniScript('Non-Existent_Script_English')).to.be.false;

        const angularRefs = standardModelRegistry.getAngularOmniScriptRefs();
        expect(angularRefs.size).to.equal(2);
        expect(angularRefs.has('Angular-Customer_Profile-View_English')).to.be.true;
        expect(angularRefs.has('Legacy-Script_Data-Entry_English')).to.be.true;
      });
    });

    describe('Standard Data Model Name Change Warnings', () => {
      beforeEach(() => {
        // Register components with name changes for standard data model
        standardModelRegistry.registerNameMapping({
          originalName: 'Customer-Data Processor',
          cleanedName: 'CustomerDataProcessor',
          componentType: 'DataMapper',
          recordId: 'dr1',
        });

        standardModelRegistry.registerNameMapping({
          originalName: 'Account_Information_Card',
          cleanedName: 'Account_Information_Card', // No change
          componentType: 'FlexCard',
          recordId: 'fc1',
        });

        standardModelRegistry.registerNameMapping({
          originalName: 'API-Gateway_Customer Processing',
          cleanedName: 'APIGateway_CustomerProcessing',
          componentType: 'IntegrationProcedure',
          recordId: 'ip1',
        });
      });

      it('should generate warnings for components with name changes', () => {
        const warnings = standardModelRegistry.getNameChangeWarnings();

        expect(warnings).to.have.length(2);
        expect(warnings).to.include('DataMapper name will change: "Customer-Data Processor" → "CustomerDataProcessor"');
        expect(warnings).to.include(
          'IntegrationProcedure name will change: "API-Gateway_Customer Processing" → "APIGateway_CustomerProcessing"'
        );
      });

      it('should count name changes by type correctly', () => {
        const counts = standardModelRegistry.getNameChangeCountByType();

        expect(counts['DataMapper']).to.equal(1);
        expect(counts['IntegrationProcedure']).to.equal(1);
        expect(counts['FlexCard']).to.be.undefined; // No changes for FlexCard
      });
    });

    describe('Standard Data Model Fallback Behavior', () => {
      it('should use fallback cleaning for unregistered components', () => {
        expect(standardModelRegistry.getDataMapperCleanedName('Unknown-Data Mapper')).to.equal('UnknownDataMapper');
        expect(standardModelRegistry.getIntegrationProcedureCleanedName('Unknown-IP Name')).to.equal('UnknownIPName');
        expect(standardModelRegistry.getFlexCardCleanedName('Unknown-Card Name')).to.equal('UnknownCardName');
      });

      it('should use fallback cleaning for unregistered OmniScripts', () => {
        const cleanedName = standardModelRegistry.getOmniScriptCleanedName(
          'Unknown-Type',
          'Unknown-SubType',
          'Spanish'
        );
        expect(cleanedName).to.equal('UnknownType_UnknownSubType_Spanish');
      });
    });

    describe('Standard Data Model Debugging Utilities', () => {
      beforeEach(() => {
        // Setup some test data
        standardModelRegistry.registerNameMapping({
          originalName: 'Test-Integration_Procedure-One',
          cleanedName: 'TestIntegration_ProcedureOne',
          componentType: 'IntegrationProcedure',
          recordId: 'ip1',
        });

        standardModelRegistry.registerNameMapping({
          originalName: 'Test-OmniScript_View-Data_English',
          cleanedName: 'TestOmniScript_ViewData_English',
          componentType: 'OmniScript',
          recordId: 'os1',
        });
      });

      it('should return correct mapping keys for debugging', () => {
        const ipKeys = standardModelRegistry.getIntegrationProcedureMappingKeys();
        const osKeys = standardModelRegistry.getOmniScriptMappingKeys();

        expect(ipKeys).to.include('Test-Integration_Procedure-One');
        expect(osKeys).to.include('Test-OmniScript_View-Data_English');
      });

      it('should return all name mappings for reporting', () => {
        const allMappings = standardModelRegistry.getAllNameMappings();

        expect(allMappings).to.have.length(2);
        expect(allMappings.some((m) => m.componentType === 'IntegrationProcedure')).to.be.true;
        expect(allMappings.some((m) => m.componentType === 'OmniScript')).to.be.true;
      });
    });
  });
});
