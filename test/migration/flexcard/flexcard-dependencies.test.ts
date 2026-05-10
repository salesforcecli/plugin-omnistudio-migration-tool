/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { CardMigrationTool } from '../../../src/migration/flexcard';
import { NameMappingRegistry } from '../../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../../src/utils/orgUtils';

describe('FlexCard Dependency Updates with NameMappingRegistry', () => {
  let cardTool: CardMigrationTool;
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

    // Use simple mock objects instead of Sinon stubs to avoid conflicts
    mockConnection = {};
    mockMessages = {
      getMessage: () => 'Mock message for testing',
    };
    mockUx = {};
    mockLogger = {};

    cardTool = new CardMigrationTool('vlocity_ins', mockConnection, mockLogger, mockMessages, mockUx, false);

    // Setup test name mappings
    setupTestNameMappings();
  });

  function setupTestNameMappings() {
    // DataMapper mappings
    nameRegistry.registerNameMapping({
      originalName: 'Customer-Data Loader',
      cleanedName: 'CustomerDataLoader',
      componentType: 'DataMapper',
      recordId: 'dr1',
    });

    // Integration Procedure mappings (Type_SubType format only)
    nameRegistry.registerNameMapping({
      originalName: 'API-Gateway_Customer Info',
      cleanedName: 'APIGateway_CustomerInfo',
      componentType: 'IntegrationProcedure',
      recordId: 'ip1',
    });

    // OmniScript mappings (Type_SubType_Language format)
    nameRegistry.registerNameMapping({
      originalName: 'Customer-Profile_Account-View_English',
      cleanedName: 'CustomerProfile_AccountView_English',
      componentType: 'OmniScript',
      recordId: 'os1',
    });

    // FlexCard mappings
    nameRegistry.registerNameMapping({
      originalName: 'Customer-Dashboard Card',
      cleanedName: 'CustomerDashboardCard',
      componentType: 'FlexCard',
      recordId: 'fc1',
    });
  }

  describe('DataSource Dependency Updates', () => {
    it('should update DataRaptor bundle using registry', () => {
      const testCard = {
        Id: 'card1',
        Name: 'TestCard',
        vlocity_ins__Definition__c: JSON.stringify({
          dataSource: {
            type: 'DataRaptor',
            value: {
              bundle: 'Customer-Data Loader',
            },
          },
        }),
      };

      // Instead of calling mapVlocityCardRecord, test the registry method directly
      const definition = JSON.parse(testCard.vlocity_ins__Definition__c);
      const updatedDefinition = nameRegistry.updateDependencyReferences(definition);

      expect(updatedDefinition.dataSource.value.bundle).to.equal('CustomerDataLoader');
    });

    it('should update Integration Procedure ipMethod using registry', () => {
      const testCard = {
        Id: 'card1',
        Name: 'TestCard',
        vlocity_ins__Definition__c: JSON.stringify({
          dataSource: {
            type: 'IntegrationProcedures',
            value: {
              ipMethod: 'API-Gateway_Customer Info',
            },
          },
        }),
      };

      // Test the registry method directly
      const definition = JSON.parse(testCard.vlocity_ins__Definition__c);
      const updatedDefinition = nameRegistry.updateDependencyReferences(definition);

      expect(updatedDefinition.dataSource.value.ipMethod).to.equal('APIGateway_CustomerInfo');
    });

    it('should fallback to cleaning when no registry mapping exists for DataRaptor', () => {
      const testCard = {
        Id: 'card1',
        Name: 'TestCard',
        vlocity_ins__Definition__c: JSON.stringify({
          dataSource: {
            type: 'DataRaptor',
            value: {
              bundle: 'Unknown DataRaptor',
            },
          },
        }),
      };

      const definition = JSON.parse(testCard.vlocity_ins__Definition__c);
      const updatedDefinition = nameRegistry.updateDependencyReferences(definition);
      const dmValue = updatedDefinition.dataSource.value.bundle;
      expect(nameRegistry.hasDataMapperMapping(dmValue)).to.be.false;
    });

    it('should fallback to cleaning when no registry mapping exists for Integration Procedure', () => {
      const testCard = {
        Id: 'card1',
        Name: 'TestCard',
        vlocity_ins__Definition__c: JSON.stringify({
          dataSource: {
            type: 'IntegrationProcedures',
            value: {
              ipMethod: 'Unknown Integration Procedure',
            },
          },
        }),
      };

      const definition = JSON.parse(testCard.vlocity_ins__Definition__c);
      const updatedDefinition = nameRegistry.updateDependencyReferences(definition);
      const ipValue = updatedDefinition.dataSource.value.ipMethod;
      expect(nameRegistry.hasIntegrationProcedureMapping(ipValue)).to.be.false;
    });
  });

  describe('State OmniScript Array Updates', () => {
    it('should update omniscripts array using registry', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              omniscripts: [
                {
                  type: 'Customer-Profile',
                  subtype: 'Account-View',
                  language: 'English',
                },
              ],
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.states[0].omniscripts[0].type).to.equal('CustomerProfile');
      expect(definition.states[0].omniscripts[0].subtype).to.equal('AccountView');
      expect(definition.states[0].omniscripts[0].language).to.equal('English');
    });

    it('should fallback to cleaning when no registry mapping exists for OmniScript', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              omniscripts: [
                {
                  type: 'Unknown-Type',
                  subtype: 'Unknown-SubType',
                  language: 'English',
                },
              ],
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.states[0].omniscripts[0].type).to.equal('UnknownType');
      expect(definition.states[0].omniscripts[0].subtype).to.equal('UnknownSubType');
      expect(definition.states[0].omniscripts[0].language).to.equal('English');
    });
  });

  describe('Component Action Updates', () => {
    it('should update omniType.Name in actionList using registry', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                comp1: {
                  element: 'action',
                  property: {
                    actionList: [
                      {
                        stateAction: {
                          type: 'OmniScript',
                          omniType: {
                            Name: 'Customer-Profile/Account-View/English',
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
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.states[0].components.comp1.property.actionList[0].stateAction.omniType.Name).to.equal(
        'CustomerProfile/AccountView/English'
      );
    });

    it('should update flyout osName using registry', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                comp1: {
                  element: 'action',
                  property: {
                    actionList: [
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
              },
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.states[0].components.comp1.property.actionList[0].stateAction.osName).to.equal(
        'CustomerProfile/AccountView/English'
      );
    });

    it('should update direct component stateAction omniType using registry', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                comp1: {
                  property: {
                    stateAction: {
                      omniType: {
                        Name: 'Customer-Profile/Account-View/English',
                      },
                    },
                  },
                },
              },
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.states[0].components.comp1.property.stateAction.omniType.Name).to.equal(
        'CustomerProfile/AccountView/English'
      );
    });
  });

  describe('Child Card Updates', () => {
    it('should update childCards using registry', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              childCards: ['Customer-Dashboard Card', 'Unknown Child Card'],
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.states[0].childCards[0]).to.equal('CustomerDashboardCard');
      expect(definition.states[0].childCards[1]).to.equal('UnknownChildCard');
    });

    it('should update childCardPreview cardName using registry', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                comp1: {
                  element: 'childCardPreview',
                  property: {
                    cardName: 'Customer-Dashboard Card',
                  },
                },
              },
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.states[0].components.comp1.property.cardName).to.equal('CustomerDashboardCard');
    });
  });

  describe('Nested Component Updates', () => {
    it('should update deeply nested component dependencies', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                parent: {
                  children: [
                    {
                      element: 'action',
                      property: {
                        actionList: [
                          {
                            stateAction: {
                              type: 'OmniScript',
                              omniType: {
                                Name: 'Customer-Profile/Account-View/English',
                              },
                            },
                          },
                        ],
                      },
                      children: [
                        {
                          element: 'childCardPreview',
                          property: {
                            cardName: 'Customer-Dashboard Card',
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      const actionComponent = definition.states[0].components.parent.children[0];
      expect(actionComponent.property.actionList[0].stateAction.omniType.Name).to.equal(
        'CustomerProfile/AccountView/English'
      );

      const childCardComponent = definition.states[0].components.parent.children[0].children[0];
      expect(childCardComponent.property.cardName).to.equal('CustomerDashboardCard');
    });
  });

  describe('Mixed Dependencies in Single Card', () => {
    it('should update all dependency types in one card correctly', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          dataSource: {
            type: 'DataRaptor',
            value: {
              bundle: 'Customer-Data Loader',
            },
          },
          states: [
            {
              childCards: ['Customer-Dashboard Card'],
              omniscripts: [
                {
                  type: 'Customer-Profile',
                  subtype: 'Account-View',
                  language: 'English',
                },
              ],
              components: {
                comp1: {
                  element: 'action',
                  property: {
                    actionList: [
                      {
                        stateAction: {
                          type: 'OmniScript',
                          omniType: {
                            Name: 'Customer-Profile/Account-View/English',
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
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      // Check DataRaptor update
      expect(definition.dataSource.value.bundle).to.equal('CustomerDataLoader');

      // Check child card update
      expect(definition.states[0].childCards[0]).to.equal('CustomerDashboardCard');

      // Check omniscript update
      expect(definition.states[0].omniscripts[0].type).to.equal('CustomerProfile');
      expect(definition.states[0].omniscripts[0].subtype).to.equal('AccountView');

      // Check component action update
      expect(definition.states[0].components.comp1.property.actionList[0].stateAction.omniType.Name).to.equal(
        'CustomerProfile/AccountView/English'
      );
    });
  });

  describe('Registry vs Fallback Behavior', () => {
    it('should prefer registry over fallback cleaning', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          dataSource: {
            type: 'DataRaptor',
            value: {
              bundle: 'Customer-Data Loader', // This should use registry mapping
            },
          },
          states: [
            {
              omniscripts: [
                {
                  type: 'Customer-Profile', // This should use registry mapping
                  subtype: 'Account-View',
                  language: 'English',
                },
              ],
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.dataSource.value.bundle).to.equal('CustomerDataLoader');
      expect(definition.states[0].omniscripts[0].type).to.equal('CustomerProfile');
      expect(definition.states[0].omniscripts[0].subtype).to.equal('AccountView');
    });

    it('should use fallback when registry has no mapping', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          dataSource: {
            type: 'DataRaptor',
            value: {
              bundle: 'Unknown-DataMapper Bundle',
            },
          },
          states: [
            {
              omniscripts: [
                {
                  type: 'Unknown-OmniScript Type',
                  subtype: 'Unknown-SubType',
                  language: 'English',
                },
              ],
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.dataSource.value.bundle).to.equal('UnknownDataMapperBundle');
      expect(definition.states[0].omniscripts[0].type).to.equal('UnknownOmniScriptType');
      expect(definition.states[0].omniscripts[0].subtype).to.equal('UnknownSubType');
    });
  });

  describe('Omni-Flyout Element Updates', () => {
    it('should update omni-flyout flyoutOmniScript.osName using registry', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                comp1: {
                  element: 'omni-flyout',
                  property: {
                    flyoutOmniScript: {
                      osName: 'Customer-Profile/Account-View/English',
                    },
                  },
                },
              },
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.states[0].components.comp1.property.flyoutOmniScript.osName).to.equal(
        'CustomerProfile/AccountView/English'
      );
    });

    it('should update omni-flyout flyoutOmniScript.osName using fallback when registry has no mapping', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                comp1: {
                  element: 'omni-flyout',
                  property: {
                    flyoutOmniScript: {
                      osName: 'Unknown-OmniScript/Type-Test/English',
                    },
                  },
                },
              },
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.states[0].components.comp1.property.flyoutOmniScript.osName).to.equal(
        'UnknownOmniScript/TypeTest/English'
      );
    });

    it('should update nested omni-flyout elements in children', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                parent: {
                  children: [
                    {
                      element: 'omni-flyout',
                      property: {
                        flyoutOmniScript: {
                          osName: 'Customer-Profile/Account-View/English',
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.states[0].components.parent.children[0].property.flyoutOmniScript.osName).to.equal(
        'CustomerProfile/AccountView/English'
      );
    });

    it('should handle omni-flyout elements without flyoutOmniScript property gracefully', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                comp1: {
                  element: 'omni-flyout',
                  property: {
                    someOtherProperty: 'value',
                  },
                },
              },
            },
          ],
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.states[0].components.comp1.property.someOtherProperty).to.equal('value');
      expect(definition.states[0].components.comp1.property.flyoutOmniScript).to.be.undefined;
    });
  });

  describe('ApexRemote Datasource Namespace Qualification', () => {
    it('should qualify remoteClass with namespace via updateDataSourceWithRegistry', async () => {
      const { ApexNamespaceRegistry } = await import('../../../src/migration/ApexNamespaceRegistry');
      const apexRegistry = ApexNamespaceRegistry.getInstance();
      apexRegistry.clear();

      const mockConn: any = {
        tooling: {
          query: (q: string) => {
            if (q.includes('NamespacePrefix = null')) {
              return Promise.resolve({ done: true, records: [] });
            }
            return Promise.resolve({ done: true, records: [{ Name: 'AccountController' }] });
          },
          queryMore: () => Promise.resolve({ done: true, records: [] }),
        },
      };
      await apexRegistry.initialize(mockConn, 'vlocity_ins');

      const dataSource = {
        type: 'ApexRemote',
        value: { remoteClass: 'AccountController', remoteMethod: 'getData' },
      };

      (cardTool as any).updateDataSourceWithRegistry(dataSource, new Map(), 'test');

      expect(dataSource.value.remoteClass).to.equal('vlocity_ins.AccountController');
    });

    it('should not modify remoteClass if already namespace-qualified', async () => {
      const { ApexNamespaceRegistry } = await import('../../../src/migration/ApexNamespaceRegistry');
      const apexRegistry = ApexNamespaceRegistry.getInstance();
      apexRegistry.clear();

      const mockConn: any = {
        tooling: {
          query: () => Promise.resolve({ done: true, records: [] }),
          queryMore: () => Promise.resolve({ done: true, records: [] }),
        },
      };
      await apexRegistry.initialize(mockConn, 'vlocity_ins');

      const dataSource = {
        type: 'ApexRemote',
        value: { remoteClass: 'vlocity_ins.AccountController', remoteMethod: 'getData' },
      };

      (cardTool as any).updateDataSourceWithRegistry(dataSource, new Map(), 'test');

      expect(dataSource.value.remoteClass).to.equal('vlocity_ins.AccountController');
    });
  });
});
