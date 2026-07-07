/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { CardMigrationTool } from '../../../src/migration/flexcard';
import { NameMappingRegistry } from '../../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../../src/utils/orgUtils';

describe('FlexCard Angular Dependency Validation', () => {
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
          flexCardWithAngularOmniScriptWarning:
            'FlexCard has dependencies on Angular OmniScript(s) which are not migrated. Please convert OmniScript(s) to LWC before migrating this FlexCard.',
          foundFlexCardsToMigrate: `Found ${params?.[0]} FlexCards to migrate`,
        };
        return messages[key] || 'Mock message for testing';
      },
    };
    mockUx = {};
    mockLogger = {};

    cardTool = new CardMigrationTool('vlocity_ins', mockConnection, mockLogger, mockMessages, mockUx, false);

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

    // Register Angular OmniScripts as skipped
    nameRegistry.registerAngularOmniScript('CustomerProfile_AngularView_English');
    nameRegistry.registerAngularOmniScript('ProductCatalog_Legacy_Spanish');
    nameRegistry.registerAngularOmniScript('ServiceRequest_OldFlow_French');
  }

  describe('Angular Dependency Detection in FlexCards', () => {
    it('should detect Angular OmniScript dependencies in direct state references', () => {
      const flexCardDefinition = {
        states: [
          {
            omniscripts: [
              {
                type: 'CustomerProfile',
                subtype: 'AngularView',
                language: 'English',
              },
              {
                type: 'ProductCatalog',
                subtype: 'Legacy',
                language: 'Spanish',
              },
            ],
          },
        ],
      };

      const mockCard = {
        Id: 'fc123',
        Name: 'TestFlexCard',
        vlocity_ins__Definition__c: JSON.stringify(flexCardDefinition),
      };

      const hasAngularDeps = (cardTool as any).hasAngularOmniScriptDependencies(mockCard);
      expect(hasAngularDeps).to.be.true;
    });

    it('should detect Angular OmniScript dependencies in component actions', () => {
      const flexCardDefinition = {
        states: [
          {
            components: {
              comp1: {
                element: 'action',
                property: {
                  actionList: [
                    {
                      stateAction: {
                        omniType: 'ServiceRequest/OldFlow/French',
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      };

      const mockCard = {
        Id: 'fc123',
        Name: 'TestFlexCard',
        vlocity_ins__Definition__c: JSON.stringify(flexCardDefinition),
      };

      const hasAngularDeps = (cardTool as any).hasAngularOmniScriptDependencies(mockCard);
      expect(hasAngularDeps).to.be.true;
    });

    it('should detect Angular OmniScript dependencies in flyout components', () => {
      const flexCardDefinition = {
        states: [
          {
            components: {
              comp1: {
                element: 'omni-flyout',
                property: {
                  flyoutOmniScript: {
                    osName: 'CustomerProfile/AngularView/English',
                  },
                },
              },
            },
          },
        ],
      };

      const mockCard = {
        Id: 'fc123',
        Name: 'TestFlexCard',
        vlocity_ins__Definition__c: JSON.stringify(flexCardDefinition),
      };

      const hasAngularDeps = (cardTool as any).hasAngularOmniScriptDependencies(mockCard);
      expect(hasAngularDeps).to.be.true;
    });

    it('should not detect dependencies for LWC OmniScripts', () => {
      const flexCardDefinition = {
        states: [
          {
            omniscripts: [
              {
                type: 'CustomerProfile',
                subtype: 'LWCView',
                language: 'English',
              },
            ],
          },
        ],
      };

      const mockCard = {
        Id: 'fc123',
        Name: 'TestFlexCard',
        vlocity_ins__Definition__c: JSON.stringify(flexCardDefinition),
      };

      const hasAngularDeps = (cardTool as any).hasAngularOmniScriptDependencies(mockCard);
      expect(hasAngularDeps).to.be.false;
    });

    it('should handle nested component hierarchies', () => {
      const flexCardDefinition = {
        states: [
          {
            components: {
              parent: {
                element: 'container',
                children: [
                  {
                    element: 'action',
                    property: {
                      actionList: [
                        {
                          stateAction: {
                            omniType: 'CustomerProfile/AngularView/English',
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
      };

      const mockCard = {
        Id: 'fc123',
        Name: 'TestFlexCard',
        vlocity_ins__Definition__c: JSON.stringify(flexCardDefinition),
      };

      const hasAngularDeps = (cardTool as any).hasAngularOmniScriptDependencies(mockCard);
      expect(hasAngularDeps).to.be.true;
    });
  });

  describe('FlexCard Migration with Angular Dependencies', () => {
    it('should skip FlexCards with Angular dependencies during migration', async () => {
      const mockFlexCardWithAngular = {
        Id: 'fc123',
        Name: 'AngularDependentCard',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              omniscripts: [
                {
                  type: 'CustomerProfile',
                  subtype: 'AngularView',
                  language: 'English',
                },
              ],
            },
          ],
        }),
      };

      const mockFlexCardWithLWC = {
        Id: 'fc456',
        Name: 'LWCDependentCard',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              omniscripts: [
                {
                  type: 'CustomerProfile',
                  subtype: 'LWCView',
                  language: 'English',
                },
              ],
            },
          ],
        }),
      };

      // Mock getAllCards method
      (cardTool as any).getAllCards = () => Promise.resolve([mockFlexCardWithAngular, mockFlexCardWithLWC]);

      // Mock uploadAllCards method to track which cards are processed
      const processedCards: any[] = [];
      (cardTool as any).uploadAllCards = (cards: any[]) => {
        processedCards.push(...cards);
        return Promise.resolve(new Map());
      };

      await cardTool.migrate();

      // Should only process the LWC-dependent card
      expect(processedCards).to.have.length(1);
      expect(processedCards[0].Id).to.equal('fc456');
    });

    it('should provide appropriate warning messages for skipped cards', async () => {
      const mockFlexCardWithAngular = {
        Id: 'fc123',
        Name: 'AngularDependentCard',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              omniscripts: [
                {
                  type: 'CustomerProfile',
                  subtype: 'AngularView',
                  language: 'English',
                },
              ],
            },
          ],
        }),
      };

      (cardTool as any).getAllCards = () => Promise.resolve([mockFlexCardWithAngular]);
      (cardTool as any).uploadAllCards = () => Promise.resolve(new Map());

      const result = await cardTool.migrate();

      // Should have one FlexCard in results with skipped status
      expect(result[0].results.size).to.equal(1);
      const skippedResult = result[0].results.get('fc123');
      expect(skippedResult.skipped).to.be.true;
      expect(skippedResult.warnings).to.include(
        'FlexCard has dependencies on Angular OmniScript(s) which are not migrated. Please convert OmniScript(s) to LWC before migrating this FlexCard.'
      );
    });
  });

  describe('Complex Angular Dependency Scenarios', () => {
    it('should handle FlexCards with mixed LWC and Angular dependencies', () => {
      const flexCardDefinition = {
        states: [
          {
            omniscripts: [
              {
                type: 'CustomerProfile',
                subtype: 'LWCView', // LWC - should not cause skip
                language: 'English',
              },
              {
                type: 'ProductCatalog',
                subtype: 'Legacy', // Angular - should cause skip
                language: 'Spanish',
              },
            ],
          },
        ],
      };

      const mockCard = {
        Id: 'fc123',
        Name: 'MixedDependencyCard',
        vlocity_ins__Definition__c: JSON.stringify(flexCardDefinition),
      };

      const hasAngularDeps = (cardTool as any).hasAngularOmniScriptDependencies(mockCard);
      expect(hasAngularDeps).to.be.true;
    });

    it('should handle malformed FlexCard definitions gracefully', () => {
      const mockCard = {
        Id: 'fc123',
        Name: 'MalformedCard',
        vlocity_ins__Definition__c: 'invalid json',
      };

      const hasAngularDeps = (cardTool as any).hasAngularOmniScriptDependencies(mockCard);
      expect(hasAngularDeps).to.be.false; // Should default to false on error
    });
  });
});
