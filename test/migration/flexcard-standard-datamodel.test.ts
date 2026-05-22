/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { CardMigrationTool } from '../../src/migration/flexcard';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';

describe('FlexCard Standard Data Model (Metadata API Disabled) - Assessment and Migration', () => {
  let cardTool: CardMigrationTool;
  let nameRegistry: NameMappingRegistry;
  let mockConnection: any;
  let mockMessages: any;
  let mockUx: any;
  let mockLogger: any;

  beforeEach(() => {
    nameRegistry = NameMappingRegistry.getInstance();
    nameRegistry.clear();

    // Initialize data model service for Standard Data Model
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

    mockConnection = {};
    mockMessages = {
      getMessage: (key: string, args?: string[]) => {
        if (key === 'cardNameChangeMessage') {
          return `The card name '${args?.[0]}' will be changed to '${args?.[1]}'`;
        }
        if (key === 'childCardNameHasSpecialChars') {
          return 'Child card name contains special characters and cannot be auto-migrated';
        }
        return 'Mock message for testing';
      },
    };
    mockUx = {};
    mockLogger = {};

    cardTool = new CardMigrationTool('', mockConnection, mockLogger, mockMessages, mockUx, false);

    // Setup test mappings for Standard Data Model
    setupTestMappingsForStandardDataModel();
  });

  function setupTestMappingsForStandardDataModel() {
    // DataMapper mappings with special characters
    nameRegistry.registerNameMapping({
      originalName: 'Customer-Data@Loader!',
      cleanedName: 'CustomerDataLoader',
      componentType: 'DataMapper',
      recordId: 'dm1',
    });

    nameRegistry.registerNameMapping({
      originalName: 'Product#Info$Extractor',
      cleanedName: 'ProductInfoExtractor',
      componentType: 'DataMapper',
      recordId: 'dm2',
    });

    // Integration Procedure mappings (Type_SubType format)
    nameRegistry.registerNameMapping({
      originalName: 'API@Gateway_Customer$Info',
      cleanedName: 'APIGateway_CustomerInfo',
      componentType: 'IntegrationProcedure',
      recordId: 'ip1',
    });

    nameRegistry.registerNameMapping({
      originalName: 'Payment#Processor_Credit&Card',
      cleanedName: 'PaymentProcessor_CreditCard',
      componentType: 'IntegrationProcedure',
      recordId: 'ip2',
    });

    // FlexCard mappings
    nameRegistry.registerNameMapping({
      originalName: 'Customer-Dashboard@Card!',
      cleanedName: 'CustomerDashboardCard',
      componentType: 'FlexCard',
      recordId: 'fc1',
    });
  }

  describe('Standard Data Model Assessment - OmniUiCard with Special Characters', () => {
    it('should assess OmniUiCard (FlexCard) with special characters and add warning about manual intervention', async () => {
      const mockFlexCard = {
        Id: 'fc1',
        Name: 'Customer-Profile@Card!', // Contains special characters
        DataSourceConfig: JSON.stringify({
          dataSource: {
            type: 'DataRaptor',
            value: {
              bundle: 'Customer-Data@Loader!',
            },
          },
        }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          enablePagination: true,
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(mockFlexCard, new Set<string>());

      // FlexCard name should be cleaned (FlexCards DO get cleaned in Standard Data Model)
      expect(result.name).to.equal('CustomerProfileCard');
      expect(result.oldName).to.equal('Customer-Profile@Card!');

      // Should add warning about name change (name updates are now allowed, so status is Warnings not Manual Intervention)
      expect(result.warnings).to.have.length.greaterThan(0);
      expect(result.warnings[0]).to.include("will be changed to 'CustomerProfileCard'");
      expect(result.migrationStatus).to.equal('Warnings');

      // Dependencies should still be detected for assessment
      expect(result.dependenciesDR).to.have.length.greaterThan(0);
    });

    it('should assess OmniUiCard with clean name and allow migration', async () => {
      const mockFlexCard = {
        Id: 'fc2',
        Name: 'CustomerDashboardCard', // Clean name, no special characters
        DataSourceConfig: JSON.stringify({
          dataSource: {
            type: 'IntegrationProcedures',
            value: {
              ipMethod: 'CleanIPMethod_CleanSubType', // Use clean dependency to avoid warnings
            },
          },
        }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          enablePagination: false,
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(mockFlexCard, new Set<string>());

      // FlexCard name should remain unchanged (already clean)
      expect(result.name).to.equal('CustomerDashboardCard');
      expect(result.migrationStatus).to.equal('Ready for migration');

      // No warnings should be generated for clean names
      expect(result.warnings).to.be.empty;

      // Dependencies should be detected
      expect(result.dependenciesIP).to.have.length.greaterThan(0);
    });

    it('should detect various dependency types in FlexCard assessment', async () => {
      const mockFlexCard = {
        Id: 'fc3',
        Name: 'MultiDependencyCard',
        DataSourceConfig: JSON.stringify({
          dataSource: {
            type: 'DataRaptor',
            value: {
              bundle: 'CleanDataRaptor',
            },
          },
        }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          flexCardReference: 'CleanFlexCard',
          omniscriptReference: 'CleanOmniScript_CleanSubType_English',
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(mockFlexCard, new Set<string>());

      // Should detect multiple dependency types
      const totalDependencies: number =
        Number(result.dependenciesDR?.length || 0) +
        Number(result.dependenciesFC?.length || 0) +
        Number(result.dependenciesOS?.length || 0);
      expect(totalDependencies).to.be.greaterThan(0);
      expect(result.migrationStatus).to.equal('Ready for migration');
    });
  });

  describe('Standard Data Model Migration - OmniUiCard Field Mapping and Data Source Updates', () => {
    it('should map OmniUiCard fields correctly for Standard Data Model', () => {
      const mockCardRecord = {
        Id: 'fc1',
        Name: 'TestCard!@#',
        DataSourceConfig: JSON.stringify({
          type: 'DataRaptor',
          value: { bundle: 'TestBundle' },
        }),
        PropertySetConfig: JSON.stringify({ layout: 'Card' }),
        IsActive: true,
        AuthorName: 'TestAuthor',
        Description: 'Test FlexCard',
        VersionNumber: 2,
        OmniUiCardType: 'Parent',
        OmniUiCardKey: 'test-card-key',
      };

      // Test field access for Standard Data Model
      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map());

      // Standard Data Model should preserve original field names but clean the name
      expect(result.Name).to.equal('TestCard'); // Names still get cleaned
      expect(result.DataSourceConfig).to.be.a('string');
      expect(result.PropertySetConfig).to.be.a('string');
      expect(result.IsActive).to.be.false; // Always set to false during migration
      expect(result.AuthorName).to.equal('TestAuthor');
      expect(result.VersionNumber).to.equal(2);
      expect(result.OmniUiCardType).to.equal('Parent');
      expect(result.OmniUiCardKey).to.equal('TestCard/TestAuthor/2.0');
    });

    it('should process DataRaptor data source and preserve registry mapping functionality', () => {
      const mockCardRecord = {
        Id: 'fc1',
        Name: 'TestCard',
        DataSourceConfig: JSON.stringify({
          type: 'DataRaptor',
          value: {
            bundle: 'Customer-Data@Loader!',
          },
        }),
        PropertySetConfig: JSON.stringify({ layout: 'Card' }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map());

      // Verify the structure is preserved and can be processed
      expect(result.DataSourceConfig).to.be.a('string');
      const dataSourceConfig = JSON.parse(result.DataSourceConfig);
      expect(dataSourceConfig.type).to.equal('DataRaptor');
      expect(dataSourceConfig.value).to.have.property('bundle');
    });

    it('should process Integration Procedure data source and preserve structure', () => {
      const mockCardRecord = {
        Id: 'fc1',
        Name: 'TestCard',
        DataSourceConfig: JSON.stringify({
          type: 'IntegrationProcedures',
          value: {
            ipMethod: 'API@Gateway_Customer$Info',
          },
        }),
        PropertySetConfig: JSON.stringify({ layout: 'Card' }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map());

      // Verify the structure is preserved and can be processed
      expect(result.DataSourceConfig).to.be.a('string');
      const dataSourceConfig = JSON.parse(result.DataSourceConfig);
      expect(dataSourceConfig.type).to.equal('IntegrationProcedures');
      expect(dataSourceConfig.value).to.have.property('ipMethod');
    });

    it('should handle data source dependency and preserve structure for processing', () => {
      const mockCardRecord = {
        Id: 'fc1',
        Name: 'TestCard',
        DataSourceConfig: JSON.stringify({
          type: 'DataRaptor',
          value: {
            bundle: 'Unknown@DataRaptor#Bundle!',
          },
        }),
        PropertySetConfig: JSON.stringify({ layout: 'Card' }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map());

      // Verify structure is maintained for further processing
      expect(result.DataSourceConfig).to.be.a('string');
      const dataSourceConfig = JSON.parse(result.DataSourceConfig);
      expect(dataSourceConfig.type).to.equal('DataRaptor');
      expect(dataSourceConfig.value).to.have.property('bundle');
    });
  });

  describe('Standard Data Model Migration - PropertySet Configuration Updates', () => {
    it('should update nested dependency references in PropertySetConfig', () => {
      const mockCardRecord = {
        Id: 'fc1',
        Name: 'TestCard',
        DataSourceConfig: JSON.stringify({
          dataSource: {
            type: 'DataRaptor',
            value: {
              bundle: 'Product#Info$Extractor',
            },
          },
        }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [
            {
              childCards: ['Customer-Dashboard@Card!'],
              components: {},
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map());

      const dataSourceConfig = JSON.parse(result.DataSourceConfig);
      const propertySetConfig = JSON.parse(result.PropertySetConfig);

      // Should update DataRaptor bundle using registry mappings
      expect(dataSourceConfig.dataSource.value.bundle).to.equal('ProductInfoExtractor');
      // Should update childCards using registry mappings
      expect(propertySetConfig.states[0].childCards[0]).to.equal('CustomerDashboardCard');
    });

    it('should handle missing dependencies gracefully in PropertySetConfig', () => {
      const mockCardRecord = {
        Id: 'fc1',
        Name: 'TestCard',
        DataSourceConfig: JSON.stringify({
          type: 'Static',
          value: {},
        }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map());

      // Should not throw errors and preserve non-dependency properties
      expect(result.PropertySetConfig).to.be.a('string');
      const propertySetConfig = JSON.parse(result.PropertySetConfig);
      expect(propertySetConfig.layout).to.equal('Card');
      expect(propertySetConfig.states).to.be.an('array');
    });
  });

  describe('Standard Data Model - Child Card Scenarios', () => {
    it('should handle child cards with special characters in names (no name update)', () => {
      const mockChildCard = {
        Id: 'fc_child1',
        Name: 'Child-Card@Special!',
        DataSourceConfig: JSON.stringify({
          type: 'DataRaptor',
          value: {
            bundle: 'Customer-Data@Loader!',
          },
        }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          isChild: true,
        }),
        IsActive: true,
        OmniUiCardType: 'Child',
        ClonedFromOmniUiCardKey: 'parent-card-key',
        VersionNumber: 1,
      };

      const result = (cardTool as any).mapVlocityCardRecord(mockChildCard, new Map(), new Map());

      // Child card name should be cleaned even in Standard Data Model
      expect(result.Name).to.equal('ChildCardSpecial');

      // Data source structure should be preserved for processing
      expect(result.DataSourceConfig).to.be.a('string');
      const dataSourceConfig = JSON.parse(result.DataSourceConfig);
      expect(dataSourceConfig.value).to.have.property('bundle');
    });

    it('should handle child cards with clean names (no name changes needed)', () => {
      const mockChildCard = {
        Id: 'fc_child2',
        Name: 'CleanChildCard',
        DataSourceConfig: JSON.stringify({
          type: 'IntegrationProcedures',
          value: {
            ipMethod: 'Payment#Processor_Credit&Card',
          },
        }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          isChild: true,
        }),
        IsActive: true,
        OmniUiCardType: 'Child',
        ClonedFromOmniUiCardKey: 'parent-card-key',
        VersionNumber: 1,
      };

      const result = (cardTool as any).mapVlocityCardRecord(mockChildCard, new Map(), new Map());

      // Clean child card name should remain unchanged
      expect(result.Name).to.equal('CleanChildCard');

      // Data source structure should be preserved for processing
      expect(result.DataSourceConfig).to.be.a('string');
      const dataSourceConfig = JSON.parse(result.DataSourceConfig);
      expect(dataSourceConfig.value).to.have.property('ipMethod');
    });
  });

  describe('Standard Data Model - Complex Scenarios with Multiple Dependencies', () => {
    it('should handle FlexCard with mixed dependency types and special characters', async () => {
      const mockFlexCard = {
        Id: 'fc_complex',
        Name: 'ComplexFlexCard',
        DataSourceConfig: JSON.stringify({
          type: 'DataRaptor',
          value: {
            bundle: 'CleanDataRaptor',
          },
        }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          actions: [
            {
              type: 'DataRaptor',
              bundle: 'CleanDataRaptor2',
            },
            {
              type: 'Integration Procedure',
              ipMethod: 'CleanIP_CleanSubType',
            },
          ],
          references: {
            flexCardReference: 'CleanFlexCard',
            omniscriptReference: 'CleanOS_CleanSubType_English',
          },
          customSettings: {
            enableCache: true,
            timeout: 30,
          },
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      // Test both assessment and migration
      const assessmentResult = await (cardTool as any).processFlexCard(mockFlexCard, new Set<string>());
      const migrationResult = (cardTool as any).mapVlocityCardRecord(mockFlexCard, new Map(), new Map());

      // Assessment should show ready for migration (clean name and dependencies)
      expect(assessmentResult.migrationStatus).to.equal('Ready for migration');
      expect(assessmentResult.warnings).to.be.empty;

      // Migration should preserve structure and non-dependency properties
      const dataSourceConfig = JSON.parse(migrationResult.DataSourceConfig);
      const propertySetConfig = JSON.parse(migrationResult.PropertySetConfig);

      expect(dataSourceConfig.type).to.equal('DataRaptor');
      expect(dataSourceConfig.value).to.have.property('bundle');
      expect(propertySetConfig.actions).to.be.an('array');
      expect(propertySetConfig.references).to.be.an('object');

      // Should preserve non-dependency properties
      expect(propertySetConfig.customSettings.enableCache).to.be.true;
      expect(propertySetConfig.customSettings.timeout).to.equal(30);
    });

    it('should handle FlexCard migration with update operations for Standard Data Model', () => {
      const mockFlexCards = [
        {
          Id: 'fc1',
          Name: 'ParentCard',
          DataSourceConfig: JSON.stringify({
            type: 'DataRaptor',
            value: { bundle: 'CleanDataRaptor' },
          }),
          PropertySetConfig: JSON.stringify({ layout: 'Card' }),
          IsActive: true,
          OmniUiCardType: 'Parent',
          VersionNumber: 1,
        },
        {
          Id: 'fc2',
          Name: 'ChildCard',
          DataSourceConfig: JSON.stringify({
            type: 'IntegrationProcedures',
            value: { ipMethod: 'CleanIP_CleanSubType' },
          }),
          PropertySetConfig: JSON.stringify({ layout: 'Card', isChild: true }),
          IsActive: true,
          OmniUiCardType: 'Child',
          ClonedFromOmniUiCardKey: 'fc1',
          VersionNumber: 1,
        },
      ];

      const results = mockFlexCards.map((card) => (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map()));

      // All cards should preserve structure and have names cleaned
      results.forEach((result, index) => {
        expect(result.Name).to.equal(mockFlexCards[index].Name);
        const dataSourceConfig = JSON.parse(result.DataSourceConfig);

        if (index === 0) {
          expect(dataSourceConfig.type).to.equal('DataRaptor');
          expect(dataSourceConfig.value).to.have.property('bundle');
        } else {
          expect(dataSourceConfig.type).to.equal('IntegrationProcedures');
          expect(dataSourceConfig.value).to.have.property('ipMethod');
        }
      });
    });
  });

  describe('Standard Data Model - Error Scenarios and Edge Cases', () => {
    it('should handle empty or null dependency references', () => {
      const mockCardRecord = {
        Id: 'fc1',
        Name: 'TestCard',
        DataSourceConfig: JSON.stringify({
          type: 'DataRaptor',
          value: {
            bundle: '',
          },
        }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          actions: [],
          references: {
            emptyReference: '',
            nullReference: null,
            undefinedReference: undefined,
          },
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map());

      // Should handle empty/null references gracefully
      expect(result).to.be.an('object');
      expect(result.Name).to.equal('TestCard');

      const dataSourceConfig = JSON.parse(result.DataSourceConfig);
      const propertySetConfig = JSON.parse(result.PropertySetConfig);

      expect(dataSourceConfig.value.bundle).to.equal('');
      expect(propertySetConfig.references.emptyReference).to.equal('');
      expect(propertySetConfig.references.nullReference).to.be.null;
    });

    it('should preserve FlexCard field mappings correctly for Standard Data Model', () => {
      const mockCardRecord = {
        Id: 'fc1',
        Name: 'TestCard',
        AuthorName: 'TestAuthor',
        ClonedFromOmniUiCardKey: 'parent-key',
        DataSourceConfig: '{}',
        Description: 'Test Description',
        IsActive: true,
        PropertySetConfig: '{}',
        SampleDataSourceResponse: 'sample-data',
        StylingConfiguration: 'style-config',
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
        OmniUiCardKey: 'card-key',
      };

      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map());

      // All Standard Data Model fields should be preserved correctly (except IsActive which is set to false)
      expect(result.Name).to.equal('TestCard');
      expect(result.AuthorName).to.equal('TestAuthor');
      expect(result.ClonedFromOmniUiCardKey).to.equal('parent-key');
      expect(result.DataSourceConfig).to.equal('{}');
      expect(result.Description).to.equal('Test Description');
      expect(result.IsActive).to.be.false; // Always set to false during migration
      expect(result.PropertySetConfig).to.equal('{}');
      expect(result.SampleDataSourceResponse).to.equal('sample-data');
      expect(result.StylingConfiguration).to.equal('style-config');
      expect(result.OmniUiCardType).to.equal('Parent');
      expect(result.VersionNumber).to.equal(1);
      expect(result.OmniUiCardKey).to.equal('TestCard/TestAuthor/1.0');
    });
  });

  describe('Standard Data Model - FlexCard Prioritization with Migration Status', () => {
    it('should set correct migration status for clean names vs special character names', async () => {
      // Test FlexCards with clean names (should have Success status)
      const cleanNameCards = [
        {
          Id: 'fc001',
          Name: 'Flexcard001', // Clean name
          DataSourceConfig: JSON.stringify({ type: 'None' }),
          PropertySetConfig: JSON.stringify({ layout: 'Card' }),
          IsActive: true,
          OmniUiCardType: 'Parent',
          VersionNumber: 1,
        },
        {
          Id: 'fc002',
          Name: 'Flexcard002', // Clean name
          DataSourceConfig: JSON.stringify({ type: 'None' }),
          PropertySetConfig: JSON.stringify({ layout: 'Card' }),
          IsActive: true,
          OmniUiCardType: 'Parent',
          VersionNumber: 1,
        },
        {
          Id: 'fc003',
          Name: 'Flexcard003', // Clean name
          DataSourceConfig: JSON.stringify({ type: 'None' }),
          PropertySetConfig: JSON.stringify({ layout: 'Card' }),
          IsActive: true,
          OmniUiCardType: 'Parent',
          VersionNumber: 1,
        },
      ];

      // Test FlexCards with special characters (should have Warnings status)
      const specialCharCards = [
        {
          Id: 'fc004',
          Name: 'Flexcard_001', // Special character (underscore)
          DataSourceConfig: JSON.stringify({ type: 'None' }),
          PropertySetConfig: JSON.stringify({ layout: 'Card' }),
          IsActive: true,
          OmniUiCardType: 'Parent',
          VersionNumber: 1,
        },
        {
          Id: 'fc005',
          Name: 'Flexcard_002', // Special character (underscore)
          DataSourceConfig: JSON.stringify({ type: 'None' }),
          PropertySetConfig: JSON.stringify({ layout: 'Card' }),
          IsActive: true,
          OmniUiCardType: 'Parent',
          VersionNumber: 1,
        },
        {
          Id: 'fc006',
          Name: 'Flexcard_003', // Special character (underscore)
          DataSourceConfig: JSON.stringify({ type: 'None' }),
          PropertySetConfig: JSON.stringify({ layout: 'Card' }),
          IsActive: true,
          OmniUiCardType: 'Parent',
          VersionNumber: 1,
        },
      ];

      const duplicateSet = new Set<string>();

      // Process clean name cards
      for (const card of cleanNameCards) {
        const result = await (cardTool as any).processFlexCard(card, duplicateSet);

        // Verify clean names have "Ready for migration" status with no warnings
        expect(result.name).to.equal(card.Name);
        expect(result.oldName).to.equal(card.Name);
        expect(result.migrationStatus).to.equal('Ready for migration');
        expect(result.warnings).to.have.length(0);
      }

      // Process special character cards
      for (const card of specialCharCards) {
        const result = await (cardTool as any).processFlexCard(card, duplicateSet);

        // Verify special character names have appropriate migration status
        expect(result.oldName).to.equal(card.Name);
        expect(result.name).to.not.equal(card.Name); // Name should be cleaned
        // FlexCards with special characters may have different statuses based on complexity
        expect(result.migrationStatus).to.be.oneOf(['Warnings', 'Needs manual intervention']);
        expect(result.warnings).to.have.length.greaterThan(0);
      }
    });
  });

  describe('Events Array Reference Handling - Assessment', () => {
    it('should detect DataRaptor dependencies in events[].actionList[].stateAction.message', async () => {
      const mockFlexCard = {
        Id: 'fc_events_dr',
        Name: 'EventsDRCard',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [],
          events: [
            {
              actionList: [
                {
                  stateAction: {
                    type: 'DataAction',
                    message: JSON.stringify({
                      value: {
                        bundle: 'Event-DataRaptor@Bundle!',
                      },
                    }),
                  },
                },
              ],
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(mockFlexCard, new Set<string>());

      expect(result.dependenciesDR).to.include('Event-DataRaptor@Bundle!');
      expect(result.warnings).to.have.length.greaterThan(0);
      expect(result.migrationStatus).to.equal('Warnings');
    });

    it('should detect Integration Procedure dependencies in events[].actionList[].stateAction.message', async () => {
      const mockFlexCard = {
        Id: 'fc_events_ip',
        Name: 'EventsIPCard',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [],
          events: [
            {
              actionList: [
                {
                  stateAction: {
                    type: 'DataAction',
                    message: JSON.stringify({
                      value: {
                        ipMethod: 'Event-IP@Type_Event-IP@SubType',
                      },
                    }),
                  },
                },
              ],
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(mockFlexCard, new Set<string>());

      expect(result.dependenciesIP).to.include('Event-IP@Type_Event-IP@SubType');
      expect(result.warnings).to.have.length.greaterThan(0);
    });

    it('should detect FlexCard dependencies in events[].actionList[].stateAction.cardName', async () => {
      const mockFlexCard = {
        Id: 'fc_events_card',
        Name: 'EventsCardRefCard',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [],
          events: [
            {
              actionList: [
                {
                  stateAction: {
                    cardName: 'Flyout-Child@Card!',
                  },
                },
              ],
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(mockFlexCard, new Set<string>());

      expect(result.dependenciesFC).to.include('Flyout-Child@Card!');
      expect(result.warnings).to.have.length.greaterThan(0);
    });

    it('should detect OmniScript dependencies in events[].actionList[].stateAction.omniType.Name', async () => {
      const mockFlexCard = {
        Id: 'fc_events_os',
        Name: 'EventsOSCard',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [],
          events: [
            {
              actionList: [
                {
                  stateAction: {
                    omniType: {
                      Name: 'Event-OS@Type/Event-OS@SubType/English',
                    },
                  },
                },
              ],
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(mockFlexCard, new Set<string>());

      expect(result.dependenciesOS).to.have.length.greaterThan(0);
      expect(result.warnings).to.have.length.greaterThan(0);
    });

    it('should detect OmniScript dependencies in events[].actionList[].stateAction.osName', async () => {
      const mockFlexCard = {
        Id: 'fc_events_osname',
        Name: 'EventsOSNameCard',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [],
          events: [
            {
              actionList: [
                {
                  stateAction: {
                    type: 'Flyout',
                    flyoutType: 'OmniScripts',
                    osName: 'Flyout-OS@Type/Flyout-OS@SubType/English',
                  },
                },
              ],
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(mockFlexCard, new Set<string>());

      expect(result.dependenciesOS).to.have.length.greaterThan(0);
      expect(result.warnings).to.have.length.greaterThan(0);
    });
  });

  describe('Events Array Reference Handling - Migration', () => {
    it('should update DataRaptor bundle in events using registry', () => {
      nameRegistry.registerNameMapping({
        originalName: 'EventDRBundle',
        cleanedName: 'EventDRBundleClean',
        componentType: 'DataMapper',
        recordId: 'dm_event1',
      });

      const mockCardRecord = {
        Id: 'fc_mig_events_dr',
        Name: 'MigEventsDRCard',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [],
          events: [
            {
              actionList: [
                {
                  stateAction: {
                    type: 'DataAction',
                    message: JSON.stringify({
                      value: {
                        bundle: 'EventDRBundle',
                      },
                    }),
                  },
                },
              ],
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map());
      const propertySetConfig = JSON.parse(result.PropertySetConfig);
      const messageObj = JSON.parse(propertySetConfig.events[0].actionList[0].stateAction.message);

      expect(messageObj.value.bundle).to.equal('EventDRBundleClean');
    });

    it('should update Integration Procedure ipMethod in events using registry', () => {
      nameRegistry.registerNameMapping({
        originalName: 'EventIPType_EventIPSubType',
        cleanedName: 'EventIPTypeClean_EventIPSubTypeClean',
        componentType: 'IntegrationProcedure',
        recordId: 'ip_event1',
      });

      const mockCardRecord = {
        Id: 'fc_mig_events_ip',
        Name: 'MigEventsIPCard',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [],
          events: [
            {
              actionList: [
                {
                  stateAction: {
                    type: 'DataAction',
                    message: JSON.stringify({
                      value: {
                        ipMethod: 'EventIPType_EventIPSubType',
                      },
                    }),
                  },
                },
              ],
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map());
      const propertySetConfig = JSON.parse(result.PropertySetConfig);
      const messageObj = JSON.parse(propertySetConfig.events[0].actionList[0].stateAction.message);

      expect(messageObj.value.ipMethod).to.equal('EventIPTypeClean_EventIPSubTypeClean');
    });

    it('should update cardName in events using registry', () => {
      nameRegistry.registerNameMapping({
        originalName: 'EventChildCard',
        cleanedName: 'EventChildCardClean',
        componentType: 'FlexCard',
        recordId: 'fc_event_child1',
      });

      const mockCardRecord = {
        Id: 'fc_mig_events_card',
        Name: 'MigEventsCardCard',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [],
          events: [
            {
              actionList: [
                {
                  stateAction: {
                    cardName: 'EventChildCard',
                  },
                },
              ],
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map());
      const propertySetConfig = JSON.parse(result.PropertySetConfig);

      expect(propertySetConfig.events[0].actionList[0].stateAction.cardName).to.equal('EventChildCardClean');
    });

    it('should NOT rewrite OmniScript Universal Page URL on Standard Data Model', () => {
      const originalUrl =
        'https://migration01--devopsimpkg15.test1.vf.pc-rnd.force.com/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}&OmniScriptType=OS&OmniScriptSubType=Navigate&OmniScriptLang=English&PrefillDataRaptorBundle=&scriptMode=vertical&layout=lightning&ContextId={0}';
      const mockCardRecord = {
        Id: 'fc_mig_events_os_url_abs',
        Name: 'MigEventsOmniUrlAbsolute',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'action',
                      property: {
                        actionList: [
                          {
                            stateAction: {
                              type: 'Custom',
                              targetType: 'Web Page',
                              'Web Page': {
                                targetName: originalUrl,
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
          events: [],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map(), updates);
      const propertySetConfig = JSON.parse(result.PropertySetConfig);
      const targetName =
        propertySetConfig.states[0].components['layer-0'].children[0].property.actionList[0].stateAction['Web Page']
          .targetName;

      expect(targetName).to.equal(originalUrl);
      expect(updates.size).to.equal(0);
    });
  });

  describe('OmniScript Navigate URL - Assessment', () => {
    it('should NOT add warning for Custom Web Page OmniScript URL on Standard Data Model', async () => {
      const mockFlexCard = {
        Id: 'fc_assess_os_url_custom',
        Name: 'AssessOmniScriptUrlCustom',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          states: [
            {
              components: {
                comp1: {
                  element: 'action',
                  property: {
                    actionList: [
                      {
                        stateAction: {
                          type: 'Custom',
                          targetType: 'Web Page',
                          'Web Page': {
                            targetName:
                              '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}&OmniScriptType=OS&OmniScriptSubType=Navigate&OmniScriptLang=English&layout=lightning&ContextId={0}',
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(
        mockFlexCard,
        new Set<string>(),
        new Map<string, string>()
      );

      const omniScriptWarnings = (result.warnings as string[]).filter((w) => w.includes('OmniScriptUniversalPage'));
      expect(omniScriptWarnings.length).to.equal(0);
      expect(result.migrationStatus).to.not.equal('Warnings');
    });
  });

  describe('Events Array - Angular OmniScript Dependency Detection', () => {
    it('should detect Angular OmniScript dependencies in events via omniType.Name', () => {
      const mockFlexCard = {
        Id: 'fc_angular_events_omnitype',
        Name: 'AngularEventsOmniTypeCard',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [],
          events: [
            {
              actionList: [
                {
                  stateAction: {
                    omniType: {
                      Name: 'AngularOS/SubType/English',
                      IsWebCompEnabled: false,
                    },
                  },
                },
              ],
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const hasAngularDep = (cardTool as any).hasAngularOmniScriptDependencies(mockFlexCard);
      expect(hasAngularDep).to.be.true;
    });

    it('should detect Angular OmniScript dependencies in events via osName', () => {
      // Register the OmniScript as Angular using the registry's Angular tracking
      nameRegistry.registerAngularOmniScript('AngularFlyoutType_AngularFlyoutSubType_English');

      const mockFlexCard = {
        Id: 'fc_angular_events_osname',
        Name: 'AngularEventsOsNameCard',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [],
          events: [
            {
              actionList: [
                {
                  stateAction: {
                    type: 'Flyout',
                    flyoutType: 'OmniScripts',
                    osName: 'AngularFlyoutType/AngularFlyoutSubType/English',
                  },
                },
              ],
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const hasAngularDep = (cardTool as any).hasAngularOmniScriptDependencies(mockFlexCard);
      expect(hasAngularDep).to.be.true;
    });

    it('should not detect Angular dependencies when OmniScript is LWC-enabled in events', () => {
      const mockFlexCard = {
        Id: 'fc_lwc_events',
        Name: 'LWCEventsCard',
        DataSourceConfig: JSON.stringify({ type: 'None' }),
        PropertySetConfig: JSON.stringify({
          layout: 'Card',
          states: [],
          events: [
            {
              actionList: [
                {
                  stateAction: {
                    omniType: {
                      Name: 'LWCOmniScript/SubType/English',
                      IsWebCompEnabled: true,
                    },
                  },
                },
              ],
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const hasAngularDep = (cardTool as any).hasAngularOmniScriptDependencies(mockFlexCard);
      expect(hasAngularDep).to.be.false;
    });
  });

  describe('DataSource Nested Key Handling', () => {
    it('should handle DataSourceConfig with dataSource key', async () => {
      const mockFlexCard = {
        Id: 'fc_datasource_key',
        Name: 'DataSourceKeyCard',
        DataSourceConfig: JSON.stringify({
          dataSource: {
            type: 'DataRaptor',
            value: {
              bundle: 'DataSource-Bundle@Test!',
            },
          },
        }),
        PropertySetConfig: JSON.stringify({ layout: 'Card' }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(mockFlexCard, new Set<string>());

      expect(result.dependenciesDR).to.include('DataSource-Bundle@Test!');
      expect(result.warnings).to.have.length.greaterThan(0);
    });

    it('should handle DataSourceConfig with datasource key (lowercase)', async () => {
      const mockFlexCard = {
        Id: 'fc_lowercase_key',
        Name: 'LowercaseKeyCard',
        DataSourceConfig: JSON.stringify({
          datasource: {
            type: 'IntegrationProcedures',
            value: {
              ipMethod: 'Lowercase-IP@Type_Lowercase-IP@SubType',
            },
          },
        }),
        PropertySetConfig: JSON.stringify({ layout: 'Card' }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(mockFlexCard, new Set<string>());

      expect(result.dependenciesIP).to.include('Lowercase-IP@Type_Lowercase-IP@SubType');
    });

    it('should handle DataSourceConfig with event keys (event-0_0, event-1_0)', async () => {
      const mockFlexCard = {
        Id: 'fc_event_keys',
        Name: 'EventKeysCard',
        DataSourceConfig: JSON.stringify({
          dataSource: {
            type: 'DataRaptor',
            value: {
              bundle: 'Main-Bundle@Test!',
            },
          },
          'event-0_0': {
            type: 'IntegrationProcedures',
            value: {
              ipMethod: 'Event-IP@Type_Event-IP@SubType',
            },
          },
        }),
        PropertySetConfig: JSON.stringify({ layout: 'Card' }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(mockFlexCard, new Set<string>());

      expect(result.dependenciesDR).to.include('Main-Bundle@Test!');
      expect(result.dependenciesIP).to.include('Event-IP@Type_Event-IP@SubType');
    });
  });
});
