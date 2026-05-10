/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { OmniScriptMigrationTool, OmniScriptExportType } from '../../src/migration/omniscript';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';

describe('OmniScript Content Processing - Comprehensive Tests', () => {
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
    };
    initializeDataModelService(mockOrgDetails);

    // Setup mock objects
    mockConnection = {
      query: () => Promise.resolve({ records: [] }),
    };
    mockMessages = {
      getMessage: (key: string, params?: string[]) => {
        const messages = {
          angularOmniScriptDependencyWarning: `Element '${params?.[0]}' references Angular OmniScript '${params?.[1]}' which will not be migrated.`,
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

    setupTestNameMappings();
  });

  function setupTestNameMappings() {
    // DataMapper mappings
    nameRegistry.registerNameMapping({
      originalName: 'CustomerDataLoader',
      cleanedName: 'CustomerDataLoaderCleaned',
      componentType: 'DataMapper',
      recordId: 'dr1',
    });

    nameRegistry.registerNameMapping({
      originalName: 'Account-Details Extract',
      cleanedName: 'AccountDetailsExtract',
      componentType: 'DataMapper',
      recordId: 'dr2',
    });

    // Integration Procedure mappings
    nameRegistry.registerNameMapping({
      originalName: 'CustomerAPI_DataProcessor',
      cleanedName: 'CustomerAPI_DataProcessorCleaned',
      componentType: 'IntegrationProcedure',
      recordId: 'ip1',
    });

    nameRegistry.registerNameMapping({
      originalName: 'Payment-Gateway_Service',
      cleanedName: 'PaymentGateway_Service',
      componentType: 'IntegrationProcedure',
      recordId: 'ip2',
    });

    // OmniScript mappings
    nameRegistry.registerNameMapping({
      originalName: 'Customer_Profile_English',
      cleanedName: 'Customer_ProfileCleaned_English',
      componentType: 'OmniScript',
      recordId: 'os1',
    });

    // Register Angular OmniScript
    nameRegistry.registerAngularOmniScript('Legacy_Angular_English');
  }

  describe('Integration Procedure Action Processing', () => {
    it('should update integrationProcedureKey with registry mapping', () => {
      const propSetMap = {
        integrationProcedureKey: 'CustomerAPI_DataProcessor',
        label: 'Test IP Action',
        timeout: 30000,
      };

      (omniScriptTool as any).processIntegrationProcedureAction(propSetMap);

      expect(propSetMap.integrationProcedureKey).to.equal('CustomerAPI_DataProcessorCleaned');
      expect(propSetMap.label).to.equal('Test IP Action');
      expect(propSetMap.timeout).to.equal(30000);
    });

    it('should update integrationProcedureKey with fallback cleaning', () => {
      const propSetMap = {
        integrationProcedureKey: 'Unknown_Integration-Procedure Key',
      };

      (omniScriptTool as any).processIntegrationProcedureAction(propSetMap);

      expect(propSetMap.integrationProcedureKey).to.equal('Unknown_IntegrationProcedureKey');
    });

    it('should update remoteOptions pre/post transform bundles with registry mapping', () => {
      const propSetMap = {
        integrationProcedureKey: 'Payment-Gateway_Service',
        remoteOptions: {
          preTransformBundle: 'CustomerDataLoader',
          postTransformBundle: 'Account-Details Extract',
          useFuture: false,
          chainable: true,
        },
      };

      (omniScriptTool as any).processIntegrationProcedureAction(propSetMap);

      expect(propSetMap.integrationProcedureKey).to.equal('PaymentGateway_Service');
      expect(propSetMap.remoteOptions.preTransformBundle).to.equal('CustomerDataLoaderCleaned');
      expect(propSetMap.remoteOptions.postTransformBundle).to.equal('AccountDetailsExtract');
      expect(propSetMap.remoteOptions.useFuture).to.equal(false);
      expect(propSetMap.remoteOptions.chainable).to.equal(true);
    });

    it('should update direct pre/post transform bundles with fallback cleaning', () => {
      const propSetMap = {
        preTransformBundle: 'Unknown-DataMapper Bundle',
        postTransformBundle: 'Another_Unknown Bundle',
      };

      (omniScriptTool as any).processIntegrationProcedureAction(propSetMap);

      expect(propSetMap.preTransformBundle).to.equal('UnknownDataMapperBundle');
      expect(propSetMap.postTransformBundle).to.equal('AnotherUnknownBundle');
    });

    it('should handle empty transform bundles gracefully', () => {
      const propSetMap = {
        integrationProcedureKey: 'CustomerAPI_DataProcessor',
        remoteOptions: {
          preTransformBundle: '',
          postTransformBundle: null,
        },
        preTransformBundle: undefined,
        postTransformBundle: '',
      };

      expect(() => {
        (omniScriptTool as any).processIntegrationProcedureAction(propSetMap);
      }).to.not.throw();

      expect(propSetMap.integrationProcedureKey).to.equal('CustomerAPI_DataProcessorCleaned');
    });

    it('should skip processing when integrationProcedureKey contains underscores (more than 2 parts)', () => {
      const propSetMap = {
        integrationProcedureKey: 'Complex_Integration_Procedure_With_Underscores',
        label: 'Test IP Action',
        timeout: 30000,
      };

      const originalKey = propSetMap.integrationProcedureKey;
      const originalLabel = propSetMap.label;
      const originalTimeout = propSetMap.timeout;

      // Should skip processing and leave values unchanged
      (omniScriptTool as any).processIntegrationProcedureAction(propSetMap);

      expect(propSetMap.integrationProcedureKey).to.equal(originalKey);
      expect(propSetMap.label).to.equal(originalLabel);
      expect(propSetMap.timeout).to.equal(originalTimeout);
    });
  });

  describe('DataRaptor Action Processing', () => {
    it('should update bundle with registry mapping', () => {
      const propSetMap = {
        bundle: 'CustomerDataLoader',
        ignoreCache: false,
        remoteTimeout: 30000,
      };

      (omniScriptTool as any).processDataRaptorAction(propSetMap);

      expect(propSetMap.bundle).to.equal('CustomerDataLoaderCleaned');
      expect(propSetMap.ignoreCache).to.equal(false);
      expect(propSetMap.remoteTimeout).to.equal(30000);
    });

    it('should update bundle with fallback cleaning', () => {
      const propSetMap = {
        bundle: 'Unknown-DataMapper_Bundle Name',
      };

      (omniScriptTool as any).processDataRaptorAction(propSetMap);

      expect(propSetMap.bundle).to.equal('UnknownDataMapperBundleName');
    });

    it('should handle missing bundle gracefully', () => {
      const propSetMap = {
        ignoreCache: true,
        responseJSONPath: '',
      };

      expect(() => {
        (omniScriptTool as any).processDataRaptorAction(propSetMap);
      }).to.not.throw();

      expect(propSetMap.ignoreCache).to.equal(true);
    });

    it('should handle empty bundle gracefully', () => {
      const propSetMap = {
        bundle: '',
        ignoreCache: false,
      };

      expect(() => {
        (omniScriptTool as any).processDataRaptorAction(propSetMap);
      }).to.not.throw();

      expect(propSetMap.bundle).to.equal('');
    });
  });

  describe('OmniScript Action Processing', () => {
    it('should update OmniScript references with registry mapping', () => {
      const propSetMap = {
        Type: 'Customer',
        'Sub Type': 'Profile',
        Language: 'English',
        otherProperty: 'preserved',
      };

      (omniScriptTool as any).processOmniScriptAction(propSetMap);

      expect(propSetMap.Type).to.equal('Customer');
      expect(propSetMap['Sub Type']).to.equal('ProfileCleaned');
      expect(propSetMap.Language).to.equal('English');
      expect(propSetMap.otherProperty).to.equal('preserved');
    });

    it('should preserve Angular OmniScript references unchanged', () => {
      const propSetMap = {
        Type: 'Legacy',
        'Sub Type': 'Angular',
        Language: 'English',
      };

      (omniScriptTool as any).processOmniScriptAction(propSetMap);

      expect(propSetMap.Type).to.equal('Legacy');
      expect(propSetMap['Sub Type']).to.equal('Angular');
      expect(propSetMap.Language).to.equal('English');
    });

    it('should use fallback cleaning for unknown OmniScript references', () => {
      const propSetMap = {
        Type: 'Unknown-OmniScript Type',
        'Sub Type': 'Unknown_SubType Name',
        Language: 'Spanish',
      };

      (omniScriptTool as any).processOmniScriptAction(propSetMap);

      expect(propSetMap.Type).to.equal('UnknownOmniScriptType');
      expect(propSetMap['Sub Type']).to.equal('UnknownSubTypeName');
      expect(propSetMap.Language).to.equal('Spanish');
    });

    it('should handle missing Type/SubType gracefully', () => {
      const propSetMap = {
        Language: 'English',
        someOtherProp: 'value',
      };

      expect(() => {
        (omniScriptTool as any).processOmniScriptAction(propSetMap);
      }).to.not.throw();

      expect(propSetMap.Language).to.equal('English');
      expect(propSetMap.someOtherProp).to.equal('value');
    });
  });

  describe('Step Action Processing', () => {
    it('should handle remoteOptions transform bundles with registry mapping', () => {
      const propSetMap = {
        remoteOptions: {
          preTransformBundle: 'CustomerDataLoader',
          postTransformBundle: 'Account-Details Extract',
        },
      };

      (omniScriptTool as any).processStepAction(propSetMap);

      expect(propSetMap.remoteOptions.preTransformBundle).to.equal('CustomerDataLoaderCleaned');
      expect(propSetMap.remoteOptions.postTransformBundle).to.equal('AccountDetailsExtract');
    });

    it('should handle remoteOptions transform bundles with fallback cleaning', () => {
      const propSetMap = {
        remoteOptions: {
          preTransformBundle: 'Unknown_DataMapper Bundle',
          postTransformBundle: 'Another-Unknown Bundle',
        },
      };

      (omniScriptTool as any).processStepAction(propSetMap);

      expect(propSetMap.remoteOptions.preTransformBundle).to.equal('UnknownDataMapperBundle');
      expect(propSetMap.remoteOptions.postTransformBundle).to.equal('AnotherUnknownBundle');
    });

    it('should handle empty/null remote properties gracefully', () => {
      const propSetMap = {
        label: 'Test Step',
        remoteClass: '',
        remoteMethod: null,
        remoteOptions: {},
      };

      expect(() => {
        (omniScriptTool as any).processStepAction(propSetMap);
      }).to.not.throw();

      expect(propSetMap.label).to.equal('Test Step');
      // remoteClass and remoteMethod should remain unchanged (no cleaning)
      expect(propSetMap.remoteClass).to.equal('');
      expect(propSetMap.remoteMethod).to.equal(null);
    });
  });

  describe('processContentChildren - Comprehensive Flow', () => {
    it('should process mixed element types in top-level children', () => {
      const children = [
        {
          type: 'Integration Procedure Action',
          propSetMap: {
            integrationProcedureKey: 'CustomerAPI_DataProcessor',
            remoteOptions: {
              preTransformBundle: 'CustomerDataLoader',
            },
          },
        },
        {
          type: 'DataRaptor Extract Action',
          propSetMap: {
            bundle: 'Account-Details Extract',
            ignoreCache: false,
          },
        },
        {
          type: 'OmniScript',
          propSetMap: {
            Type: 'Customer',
            'Sub Type': 'Profile',
            Language: 'English',
          },
        },
        {
          type: 'Step',
          propSetMap: {
            label: 'Processing Step',
            remoteClass: 'Data-Processor Class',
          },
        },
      ];

      (omniScriptTool as any).processContentChildren(children);

      // Verify Integration Procedure Action
      expect(children[0].propSetMap.integrationProcedureKey).to.equal('CustomerAPI_DataProcessorCleaned');
      expect(children[0].propSetMap.remoteOptions.preTransformBundle).to.equal('CustomerDataLoaderCleaned');

      // Verify DataRaptor Extract Action
      expect(children[1].propSetMap.bundle).to.equal('AccountDetailsExtract');
      expect(children[1].propSetMap.ignoreCache).to.equal(false);

      // Verify OmniScript Action
      expect(children[2].propSetMap.Type).to.equal('Customer');
      expect(children[2].propSetMap['Sub Type']).to.equal('ProfileCleaned');

      // Verify Step Action
      expect(children[3].propSetMap.remoteClass).to.equal('Data-Processor Class');
      expect(children[3].propSetMap.label).to.equal('Processing Step');
    });

    it('should process nested Step children with eleArray structure', () => {
      const children = [
        {
          type: 'Step',
          propSetMap: {
            label: 'Main Step',
            remoteClass: 'Step-Handler Class',
          },
          children: [
            {
              eleArray: [
                {
                  type: 'DataRaptor Transform Action',
                  propSetMap: {
                    bundle: 'CustomerDataLoader',
                    label: 'Transform Data',
                  },
                },
                {
                  type: 'Integration Procedure Action',
                  propSetMap: {
                    integrationProcedureKey: 'Payment-Gateway_Service',
                    preTransformBundle: 'Account-Details Extract',
                  },
                },
              ],
            },
            {
              eleArray: [
                {
                  type: 'OmniScript',
                  propSetMap: {
                    Type: 'Legacy',
                    'Sub Type': 'Angular',
                    Language: 'English',
                  },
                },
              ],
            },
          ],
        },
      ];

      (omniScriptTool as any).processContentChildren(children);

      // Verify Step processing
      expect(children[0].propSetMap.remoteClass).to.equal('Step-Handler Class');

      // Verify first nested eleArray
      const firstEleArray = children[0].children[0].eleArray;
      expect((firstEleArray[0].propSetMap as any).bundle).to.equal('CustomerDataLoaderCleaned');
      expect((firstEleArray[0].propSetMap as any).label).to.equal('Transform Data');
      expect((firstEleArray[1].propSetMap as any).integrationProcedureKey).to.equal('PaymentGateway_Service');
      expect((firstEleArray[1].propSetMap as any).preTransformBundle).to.equal('AccountDetailsExtract');

      // Verify second nested eleArray (Angular OmniScript should be preserved)
      const secondEleArray = children[0].children[1].eleArray;
      expect((secondEleArray[0].propSetMap as any).Type).to.equal('Legacy');
      expect((secondEleArray[0].propSetMap as any)['Sub Type']).to.equal('Angular');
    });

    it('should handle deeply nested Step structures', () => {
      const children = [
        {
          type: 'Step',
          propSetMap: { label: 'Outer Step' },
          children: [
            {
              eleArray: [
                {
                  type: 'Step',
                  propSetMap: {
                    label: 'Inner Step',
                    remoteClass: 'Inner-Step Handler',
                  },
                  // Note: Current implementation processes Step in eleArray but doesn't recurse further
                  // This is expected behavior based on the JSON structure
                },
              ],
            },
          ],
        },
      ];

      expect(() => {
        (omniScriptTool as any).processContentChildren(children);
      }).to.not.throw();

      expect(children[0].children[0].eleArray[0].propSetMap.remoteClass).to.equal('Inner-Step Handler');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle null/undefined children arrays', () => {
      const testCases = [null, undefined, []];

      testCases.forEach((testCase, index) => {
        expect(() => {
          (omniScriptTool as any).processContentChildren(testCase);
        }, `Test case ${index} should not throw`).to.not.throw();
      });
    });

    it('should handle malformed child elements', () => {
      const children = [
        null,
        undefined,
        {},
        { type: 'Integration Procedure Action' }, // Missing propSetMap
        { propSetMap: {} }, // Missing type
        {
          type: 'DataRaptor Extract Action',
          propSetMap: {
            bundle: 'ValidBundle',
          },
        }, // Valid element should still be processed
      ];

      expect(() => {
        (omniScriptTool as any).processContentChildren(children);
      }).to.not.throw();

      // Valid element should be processed
      expect(children[5].propSetMap.bundle).to.equal('ValidBundle');
    });

    it('should handle malformed nested Step children', () => {
      const children = [
        {
          type: 'Step',
          propSetMap: { label: 'Test Step' },
          children: [
            null,
            {},
            { eleArray: null },
            { eleArray: undefined },
            { eleArray: [] },
            {
              eleArray: [
                null,
                { type: 'DataRaptor Extract Action' }, // Missing propSetMap
                {
                  type: 'DataRaptor Post Action',
                  propSetMap: { bundle: 'ValidBundle' },
                },
              ],
            },
          ],
        },
      ];

      expect(() => {
        (omniScriptTool as any).processContentChildren(children);
      }).to.not.throw();

      // Valid nested element should be processed
      const validElement = children[0].children[5].eleArray[2];
      expect((validElement.propSetMap as any).bundle).to.equal('ValidBundle');
    });

    it('should handle unknown element types gracefully', () => {
      const children = [
        {
          type: 'Unknown Element Type',
          propSetMap: {
            someProperty: 'Should remain unchanged',
          },
        },
        {
          type: 'DataRaptor Extract Action',
          propSetMap: {
            bundle: 'CustomerDataLoader',
          },
        },
      ];

      expect(() => {
        (omniScriptTool as any).processContentChildren(children);
      }).to.not.throw();

      // Unknown element should remain unchanged
      expect(children[0].propSetMap.someProperty).to.equal('Should remain unchanged');
      // Known element should be processed
      expect(children[1].propSetMap.bundle).to.equal('CustomerDataLoaderCleaned');
    });

    it('should handle mixed valid and invalid property types', () => {
      const propSetMap = {
        integrationProcedureKey: 'CustomerAPI_DataProcessor',
        nullValue: null,
        undefinedValue: undefined,
        emptyString: '',
        numberValue: 123,
        booleanValue: true,
        objectValue: { nested: 'value' },
        arrayValue: ['item1', 'item2'],
      };

      expect(() => {
        (omniScriptTool as any).processIntegrationProcedureAction(propSetMap);
      }).to.not.throw();

      // Only the IP key should be updated
      expect(propSetMap.integrationProcedureKey).to.equal('CustomerAPI_DataProcessorCleaned');
      // Other values should remain unchanged
      expect(propSetMap.nullValue).to.equal(null);
      expect(propSetMap.undefinedValue).to.equal(undefined);
      expect(propSetMap.emptyString).to.equal('');
      expect(propSetMap.numberValue).to.equal(123);
      expect(propSetMap.booleanValue).to.equal(true);
      expect(propSetMap.objectValue).to.deep.equal({ nested: 'value' });
      expect(propSetMap.arrayValue).to.deep.equal(['item1', 'item2']);
    });
  });

  describe('Full Integration - mapOsDefinitionsData', () => {
    it('should process complete content JSON with all element types', () => {
      const contentJSON = {
        bpLang: 'English',
        bpSubType: 'Usecase',
        sOmniScriptId: 'old-script-id',
        children: [
          {
            name: 'IPAction',
            type: 'Integration Procedure Action',
            propSetMap: {
              integrationProcedureKey: 'CustomerAPI_DataProcessor',
              remoteOptions: {
                preTransformBundle: 'CustomerDataLoader',
              },
            },
          },
          {
            name: 'DRAction',
            type: 'DataRaptor Extract Action',
            propSetMap: {
              bundle: 'Account-Details Extract',
            },
          },
          {
            name: 'MainStep',
            type: 'Step',
            propSetMap: {
              label: 'Processing Step',
              remoteClass: 'Step-Handler',
            },
            children: [
              {
                eleArray: [
                  {
                    name: 'NestedDR',
                    type: 'DataRaptor Turbo Action',
                    propSetMap: {
                      bundle: 'CustomerDataLoader',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const mockOsDefinition = {
        Id: 'test123',
        vlocity_ins__Content__c: JSON.stringify(contentJSON),
      };

      const result = (omniScriptTool as any).mapOsDefinitionsData(mockOsDefinition, 'new-script-id');
      const processedContent = JSON.parse(result.Content);

      // Verify sOmniScriptId was updated
      expect(processedContent.sOmniScriptId).to.equal('new-script-id');

      // Verify metadata preserved
      expect(processedContent.bpLang).to.equal('English');
      expect(processedContent.bpSubType).to.equal('Usecase');

      // Verify top-level elements processed
      expect(processedContent.children[0].propSetMap.integrationProcedureKey).to.equal(
        'CustomerAPI_DataProcessorCleaned'
      );
      expect(processedContent.children[0].propSetMap.remoteOptions.preTransformBundle).to.equal(
        'CustomerDataLoaderCleaned'
      );
      expect(processedContent.children[1].propSetMap.bundle).to.equal('AccountDetailsExtract');
      expect(processedContent.children[2].propSetMap.remoteClass).to.equal('Step-Handler');

      // Verify nested elements processed
      const nestedElement = processedContent.children[2].children[0].eleArray[0];
      expect(nestedElement.propSetMap.bundle).to.equal('CustomerDataLoaderCleaned');

      // Verify element names preserved
      expect(processedContent.children[0].name).to.equal('IPAction');
      expect(processedContent.children[1].name).to.equal('DRAction');
      expect(processedContent.children[2].name).to.equal('MainStep');
      expect(nestedElement.name).to.equal('NestedDR');
    });

    it('should handle content without children array', () => {
      const contentJSON = {
        bpLang: 'English',
        sOmniScriptId: 'old-id',
        // No children array
      };

      const mockOsDefinition = {
        Id: 'test123',
        vlocity_ins__Content__c: JSON.stringify(contentJSON),
      };

      expect(() => {
        const result = (omniScriptTool as any).mapOsDefinitionsData(mockOsDefinition, 'new-id');
        const processedContent = JSON.parse(result.Content);
        expect(processedContent.sOmniScriptId).to.equal('new-id');
      }).to.not.throw();
    });

    it('should handle malformed JSON content gracefully', () => {
      const mockOsDefinition = {
        Id: 'test123',
        vlocity_ins__Content__c: 'invalid-json-content',
      };

      expect(() => {
        (omniScriptTool as any).mapOsDefinitionsData(mockOsDefinition, 'new-id');
      }).to.not.throw();
    });

    it('should handle missing content field', () => {
      const mockOsDefinition = {
        Id: 'test123',
        // No content field
      };

      expect(() => {
        (omniScriptTool as any).mapOsDefinitionsData(mockOsDefinition, 'new-id');
      }).to.not.throw();
    });
  });

  describe('Remote Action Namespace Qualification', () => {
    it('should qualify remoteClass with namespace during migration', async () => {
      const { ApexNamespaceRegistry } = await import('../../src/migration/ApexNamespaceRegistry');
      const apexRegistry = ApexNamespaceRegistry.getInstance();
      apexRegistry.clear();

      const mockConn: any = {
        tooling: {
          query: (q: string) => {
            if (q.includes('NamespacePrefix = null')) {
              return Promise.resolve({ done: true, records: [] });
            }
            return Promise.resolve({ done: true, records: [{ Name: 'LookupController' }] });
          },
          queryMore: () => Promise.resolve({ done: true, records: [] }),
        },
      };
      await apexRegistry.initialize(mockConn, 'vlocity_ins');

      const propSetMap = {
        remoteClass: 'LookupController',
        remoteMethod: 'getSearchResults',
        preTransformBundle: 'CustomerDataLoader',
      };

      (omniScriptTool as any).processRemoteAction(propSetMap);

      expect(propSetMap.remoteClass).to.equal('vlocity_ins.LookupController');
      expect(propSetMap.preTransformBundle).to.equal('CustomerDataLoaderCleaned');
    });

    it('should not modify remoteClass if already namespace-qualified', async () => {
      const { ApexNamespaceRegistry } = await import('../../src/migration/ApexNamespaceRegistry');
      const apexRegistry = ApexNamespaceRegistry.getInstance();
      apexRegistry.clear();

      const mockConn: any = {
        tooling: {
          query: () => Promise.resolve({ done: true, records: [] }),
          queryMore: () => Promise.resolve({ done: true, records: [] }),
        },
      };
      await apexRegistry.initialize(mockConn, 'vlocity_ins');

      const propSetMap = {
        remoteClass: 'vlocity_ins.LookupController',
        remoteMethod: 'getSearchResults',
      };

      (omniScriptTool as any).processRemoteAction(propSetMap);

      expect(propSetMap.remoteClass).to.equal('vlocity_ins.LookupController');
    });

    it('should not modify remoteClass if class is local', async () => {
      const { ApexNamespaceRegistry } = await import('../../src/migration/ApexNamespaceRegistry');
      const apexRegistry = ApexNamespaceRegistry.getInstance();
      apexRegistry.clear();

      const mockConn: any = {
        tooling: {
          query: (q: string) => {
            if (q.includes('NamespacePrefix = null')) {
              return Promise.resolve({ done: true, records: [{ Name: 'LocalHelper' }] });
            }
            return Promise.resolve({ done: true, records: [] });
          },
          queryMore: () => Promise.resolve({ done: true, records: [] }),
        },
      };
      await apexRegistry.initialize(mockConn, 'vlocity_ins');

      const propSetMap = {
        remoteClass: 'LocalHelper',
        remoteMethod: 'doWork',
      };

      (omniScriptTool as any).processRemoteAction(propSetMap);

      expect(propSetMap.remoteClass).to.equal('LocalHelper');
    });
  });
});
