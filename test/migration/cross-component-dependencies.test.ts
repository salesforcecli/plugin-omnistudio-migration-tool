/* eslint-disable no-console, @typescript-eslint/no-explicit-any, camelcase */
import { expect } from 'chai';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';
import { initializeDataModelService } from '../../src/utils/dataModelService';

/**
 * Integration tests for cross-component dependency updates across all OmniStudio components
 * Tests the NameMappingRegistry functionality and cross-component reference resolution
 */
describe('Cross-Component Dependency Updates Integration Tests', () => {
  let nameRegistry: NameMappingRegistry;

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

    setupCompleteNameMappings();
  });

  function setupCompleteNameMappings() {
    // DataMapper mappings with various name formats
    nameRegistry.registerNameMapping({
      originalName: 'Customer-Data Loader',
      cleanedName: 'CustomerDataLoader',
      componentType: 'DataMapper',
      recordId: 'dr1',
    });

    nameRegistry.registerNameMapping({
      originalName: 'Account Information-DR',
      cleanedName: 'AccountInformationDR',
      componentType: 'DataMapper',
      recordId: 'dr2',
    });

    // Integration Procedure mappings (Type_SubType format only)
    nameRegistry.registerNameMapping({
      originalName: 'API_Gateway_Customer Info',
      cleanedName: 'APIGateway_CustomerInfo',
      componentType: 'IntegrationProcedure',
      recordId: 'ip1',
    });

    nameRegistry.registerNameMapping({
      originalName: 'Data-Validation_Service Provider',
      cleanedName: 'DataValidation_ServiceProvider',
      componentType: 'IntegrationProcedure',
      recordId: 'ip2',
    });

    // OmniScript mappings (Type_SubType_Language format)
    nameRegistry.registerNameMapping({
      originalName: 'Customer-Profile_Account-View_English',
      cleanedName: 'CustomerProfile_AccountView_English',
      componentType: 'OmniScript',
      recordId: 'os1',
    });

    nameRegistry.registerNameMapping({
      originalName: 'Quote-Builder_Product Config_English',
      cleanedName: 'QuoteBuilder_ProductConfig_English',
      componentType: 'OmniScript',
      recordId: 'os2',
    });

    // FlexCard mappings
    nameRegistry.registerNameMapping({
      originalName: 'Customer-Dashboard Card',
      cleanedName: 'CustomerDashboardCard',
      componentType: 'FlexCard',
      recordId: 'fc1',
    });

    nameRegistry.registerNameMapping({
      originalName: 'Product-Selection Widget',
      cleanedName: 'ProductSelectionWidget',
      componentType: 'FlexCard',
      recordId: 'fc2',
    });
  }

  describe('Component Registration and Retrieval', () => {
    it('should verify all component types are registered correctly', () => {
      // DataMapper checks
      expect(nameRegistry.hasDataMapperMapping('Customer-Data Loader')).to.be.true;
      expect(nameRegistry.getDataMapperCleanedName('Customer-Data Loader')).to.equal('CustomerDataLoader');

      // Integration Procedure checks
      expect(nameRegistry.hasIntegrationProcedureMapping('API_Gateway_Customer Info')).to.be.true;
      expect(nameRegistry.getIntegrationProcedureCleanedName('API_Gateway_Customer Info')).to.equal(
        'APIGateway_CustomerInfo'
      );

      // OmniScript checks
      expect(nameRegistry.hasOmniScriptMapping('Customer-Profile_Account-View_English')).to.be.true;
      const osCleanedName = nameRegistry.getOmniScriptCleanedName('Customer-Profile', 'Account-View', 'English');
      expect(osCleanedName).to.equal('CustomerProfile_AccountView_English');

      // FlexCard checks
      expect(nameRegistry.hasFlexCardMapping('Customer-Dashboard Card')).to.be.true;
      expect(nameRegistry.getFlexCardCleanedName('Customer-Dashboard Card')).to.equal('CustomerDashboardCard');
    });

    it('should provide meaningful name change warnings', () => {
      const allWarnings = nameRegistry.getNameChangeWarnings();
      expect(allWarnings.length).to.be.greaterThan(0);

      const dataMapperWarnings = nameRegistry.getNameChangeWarningsForType('DataMapper');
      expect(dataMapperWarnings.length).to.equal(2);
      expect(dataMapperWarnings[0]).to.include('Customer-Data Loader');
      expect(dataMapperWarnings[1]).to.include('Account Information-DR');

      const counts = nameRegistry.getNameChangeCountByType();
      expect(counts.DataMapper).to.equal(2);
      expect(counts.IntegrationProcedure).to.equal(2);
      expect(counts.OmniScript).to.equal(2);
      expect(counts.FlexCard).to.equal(2);
    });
  });

  describe('Cross-Component Reference Updates', () => {
    it('should update OmniScript with all dependency types', () => {
      const omniscriptDefinition = {
        name: 'Main Customer OmniScript',
        elements: [
          {
            type: 'Step',
            name: 'DataLoadingStep',
            elements: [
              // DataRaptor dependency
              {
                type: 'DataRaptor Extract Action',
                name: 'LoadCustomerData',
                propertySet: {
                  bundle: 'Customer-Data Loader',
                  operation: 'extract',
                },
              },
              // Integration Procedure dependency
              {
                type: 'Integration Procedure Action',
                name: 'ValidateCustomer',
                propertySet: {
                  integrationProcedureKey: 'API_Gateway_Customer Info',
                  timeout: 30,
                },
              },
              // Another OmniScript dependency
              {
                type: 'OmniScript Action',
                name: 'BuildQuote',
                propertySet: {
                  omniscriptType: 'Quote-Builder',
                  omniscriptSubType: 'Product Config',
                  omniscriptLang: 'English',
                },
              },
            ],
          },
        ],
      };

      const updated = nameRegistry.updateDependencyReferences(omniscriptDefinition);

      // Verify DataRaptor reference updated
      const dataAction = updated.elements[0].elements[0];
      expect(dataAction.propertySet.bundle).to.equal('CustomerDataLoader');
      expect(dataAction.propertySet.operation).to.equal('extract');

      // Verify Integration Procedure reference updated
      const ipAction = updated.elements[0].elements[1];
      expect(ipAction.propertySet.integrationProcedureKey).to.equal('APIGateway_CustomerInfo');
      expect(ipAction.propertySet.timeout).to.equal(30);

      // Verify other properties preserved
      expect(updated.name).to.equal('Main Customer OmniScript');
      expect(dataAction.name).to.equal('LoadCustomerData');
      expect(ipAction.name).to.equal('ValidateCustomer');
    });

    it('should update FlexCard with all dependency types', () => {
      const flexCardDefinition = {
        dataSource: {
          type: 'DataRaptor',
          value: {
            bundle: 'Account Information-DR',
          },
        },
        states: [
          {
            name: 'MainState',
            childCards: ['Product-Selection Widget'],
            omniscripts: [
              {
                type: 'Customer-Profile',
                subtype: 'Account-View',
                language: 'English',
              },
            ],
            components: {
              actionComponent: {
                element: 'action',
                property: {
                  actionList: [
                    {
                      stateAction: {
                        type: 'OmniScript',
                        omniType: {
                          Name: 'Quote-Builder/Product Config/English',
                        },
                      },
                    },
                    {
                      stateAction: {
                        type: 'Flyout',
                        flyoutType: 'OmniScripts',
                        osName: 'Customer-Profile/Account-View/English',
                      },
                    },
                  ],
                },
              },
              previewComponent: {
                element: 'childCardPreview',
                property: {
                  cardName: 'Customer-Dashboard Card',
                },
              },
            },
          },
          {
            name: 'DataState',
            components: {
              dataComponent: {
                dataSource: {
                  type: 'IntegrationProcedures',
                  value: {
                    ipMethod: 'Data-Validation_Service Provider',
                  },
                },
              },
            },
          },
        ],
      };

      const updated = nameRegistry.updateDependencyReferences(flexCardDefinition);

      // Verify DataRaptor reference updated
      expect(updated.dataSource.value.bundle).to.equal('AccountInformationDR');

      // Verify child card reference updated
      expect(updated.states[0].childCards[0]).to.equal('ProductSelectionWidget');

      // Verify omniscripts array updated
      const omniscript = updated.states[0].omniscripts[0];
      const cleanedName = nameRegistry.getOmniScriptCleanedName(
        omniscript.type,
        omniscript.subtype,
        omniscript.language
      );
      const parts = cleanedName.split('_');
      expect(parts[0]).to.equal('CustomerProfile');
      expect(parts[1]).to.equal('AccountView');
      expect(parts[2]).to.equal('English');

      // Verify action component references updated
      const actionComponent = updated.states[0].components.actionComponent;
      const firstAction = actionComponent.property.actionList[0];

      const scriptParts = firstAction.stateAction.omniType.Name.split('/');
      const cleanName = nameRegistry.getOmniScriptCleanedName(scriptParts[0], scriptParts[1], scriptParts[2]);
      const cleanParts = cleanName.split('_');
      expect(`${cleanParts[0]}/${cleanParts[1]}/${cleanParts[2]}`).to.equal('QuoteBuilder/ProductConfig/English');

      // Verify preview component reference updated
      const previewComponent = updated.states[0].components.previewComponent;
      expect(previewComponent.property.cardName).to.equal('CustomerDashboardCard');

      // Verify Integration Procedure reference updated
      const dataComponent = updated.states[1].components.dataComponent;
      expect(dataComponent.dataSource.value.ipMethod).to.equal('DataValidation_ServiceProvider');
    });
  });

  describe('Registry vs Fallback Behavior', () => {
    it('should prioritize registry mappings over fallback cleaning', () => {
      // Create a special case where registry name differs from what cleaning would produce
      nameRegistry.registerNameMapping({
        originalName: 'Edge_Case_Component',
        cleanedName: 'SpecialCustomName',
        componentType: 'DataMapper',
        recordId: 'edge1',
      });

      const testObject = {
        knownComponent: 'Customer-Data Loader',
        edgeCaseComponent: 'Edge_Case_Component',
        unknownComponent: 'Unknown-Component Name',
      };

      const updated = nameRegistry.updateDependencyReferences(testObject);
      // Registry mapping should be used
      expect(updated.knownComponent).to.equal('CustomerDataLoader');
      expect(updated.edgeCaseComponent).to.equal('SpecialCustomName');
    });

    it('should handle mixed scenarios with some registry hits and some misses', () => {
      const complexObject = {
        knownDataMapper: 'Customer-Data Loader',
        unknownDataMapper: 'Unknown-DR Bundle',
        knownIP: 'API_Gateway_Customer Info',
        unknownIP: 'Unknown_Integration_Proc',
        knownOmniScript: 'Customer-Profile_Account-View_English',
        unknownOmniScript: 'Unknown-OmniScript_Reference',
        knownFlexCard: 'Customer-Dashboard Card',
        unknownFlexCard: 'Unknown-FlexCard Name',
      };

      const updated = nameRegistry.updateDependencyReferences(complexObject);

      // Registry hits
      expect(updated.knownDataMapper).to.equal('CustomerDataLoader');
      expect(updated.knownIP).to.equal('APIGateway_CustomerInfo');
      expect(updated.knownOmniScript).to.equal('CustomerProfile_AccountView_English');
      expect(updated.knownFlexCard).to.equal('CustomerDashboardCard');

      // Fallback cleaning
      expect(nameRegistry.hasDataMapperMapping(updated.unknownDataMapper)).to.be.false;
      expect(nameRegistry.hasIntegrationProcedureMapping(updated.unknownIP)).to.be.false;
      expect(nameRegistry.hasOmniScriptMapping(updated.unknownOmniScript)).to.be.false;
      expect(nameRegistry.hasFlexCardMapping(updated.unknownFlexCard)).to.be.false;
    });
  });

  describe('Nested and Complex Structure Updates', () => {
    it('should handle deeply nested component references', () => {
      const deeplyNestedStructure = {
        level1: {
          level2: {
            level3: {
              components: [
                {
                  dataMapper: 'Customer-Data Loader',
                  integrationProcedure: 'API_Gateway_Customer Info',
                  childStructure: {
                    omniscript: 'Customer-Profile_Account-View_English',
                    flexcard: 'Customer-Dashboard Card',
                  },
                },
              ],
            },
          },
        },
      };

      const updated = nameRegistry.updateDependencyReferences(deeplyNestedStructure);

      const component = updated.level1.level2.level3.components[0];
      expect(component.dataMapper).to.equal('CustomerDataLoader');
      expect(component.integrationProcedure).to.equal('APIGateway_CustomerInfo');
      expect(component.childStructure.omniscript).to.equal('CustomerProfile_AccountView_English');
      expect(component.childStructure.flexcard).to.equal('CustomerDashboardCard');
    });

    it('should preserve non-dependency data during updates', () => {
      const objectWithMixedContent = {
        metadata: {
          version: '2.0',
          created: '2024-01-01',
          author: 'Test User',
        },
        dependencies: {
          dataMappers: ['Customer-Data Loader'],
          integrationProcedures: ['API_Gateway_Customer Info'],
        },
        configuration: {
          timeout: 60,
          retries: 3,
          debug: true,
        },
        businessLogic: {
          rules: ['rule1', 'rule2'],
          conditions: {
            enabled: true,
            threshold: 100,
          },
        },
      };

      const updated = nameRegistry.updateDependencyReferences(objectWithMixedContent);

      // Dependencies should be updated
      expect(updated.dependencies.dataMappers[0]).to.equal('CustomerDataLoader');
      expect(updated.dependencies.integrationProcedures[0]).to.equal('APIGateway_CustomerInfo');

      // Other data should be preserved exactly
      expect(updated.metadata.version).to.equal('2.0');
      expect(updated.metadata.created).to.equal('2024-01-01');
      expect(updated.metadata.author).to.equal('Test User');
      expect(updated.configuration.timeout).to.equal(60);
      expect(updated.configuration.retries).to.equal(3);
      expect(updated.configuration.debug).to.equal(true);
      expect(updated.businessLogic.rules).to.deep.equal(['rule1', 'rule2']);
      expect(updated.businessLogic.conditions.enabled).to.equal(true);
      expect(updated.businessLogic.conditions.threshold).to.equal(100);
    });
  });

  describe('Migration Order and Dependencies', () => {
    it('should demonstrate the correct migration order benefits', () => {
      // This test demonstrates why migration order matters:
      // DataMapper -> Integration Procedure -> OmniScript -> FlexCard

      const integrationProcedureDefinition = {
        elements: [
          {
            type: 'DataRaptor Extract',
            bundle: 'Customer-Data Loader',
          },
        ],
      };

      const omniscriptDefinition = {
        elements: [
          {
            type: 'Integration Procedure Action',
            propertySet: {
              integrationProcedureKey: 'API_Gateway_Customer Info',
            },
          },
          {
            type: 'DataRaptor Extract Action',
            propertySet: {
              bundle: 'Account Information-DR',
            },
          },
        ],
      };

      const flexcardDefinition = {
        dataSource: {
          type: 'IntegrationProcedures',
          value: {
            ipMethod: 'Data-Validation_Service Provider',
          },
        },
        states: [
          {
            omniscripts: [
              {
                type: 'Quote-Builder',
                subtype: 'Product Config',
                language: 'English',
              },
            ],
            childCards: ['Product-Selection Widget'],
          },
        ],
      };

      // Update all components using the registry
      const updatedIP = nameRegistry.updateDependencyReferences(integrationProcedureDefinition);
      const updatedOS = nameRegistry.updateDependencyReferences(omniscriptDefinition);
      const updatedFC = nameRegistry.updateDependencyReferences(flexcardDefinition);

      // Verify all cross-references are resolved correctly
      expect(updatedIP.elements[0].bundle).to.equal('CustomerDataLoader');

      expect(updatedOS.elements[0].propertySet.integrationProcedureKey).to.equal('APIGateway_CustomerInfo');
      expect(updatedOS.elements[1].propertySet.bundle).to.equal('AccountInformationDR');

      expect(updatedFC.dataSource.value.ipMethod).to.equal('DataValidation_ServiceProvider');
      expect(updatedFC.states[0].omniscripts[0].type).to.equal('Quote-Builder');
      expect(updatedFC.states[0].omniscripts[0].subtype).to.equal('Product Config');
      expect(updatedFC.states[0].childCards[0]).to.equal('ProductSelectionWidget');
    });
  });
});
