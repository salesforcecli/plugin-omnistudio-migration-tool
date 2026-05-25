/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { CardMigrationTool } from '../../../src/migration/flexcard';
import { NameMappingRegistry } from '../../../src/migration/NameMappingRegistry';
import CardMappings from '../../../src/mappings/VlocityCard';
import { initializeDataModelService } from '../../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../../src/utils/orgUtils';

describe('FlexCard Community Targets Functionality', () => {
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
  });

  describe('ensureCommunityTargets', () => {
    it('should add community targets when xmlObject.targets does not exist', () => {
      const mappedObject = {
        [CardMappings.Definition__c]: JSON.stringify({
          xmlObject: {
            // No targets property
          },
        }),
      };

      // Call the private method via type assertion with isCardActive = true
      (cardTool as any).ensureCommunityTargets(mappedObject, true);

      const updatedDefinition = JSON.parse(mappedObject[CardMappings.Definition__c]);
      expect(updatedDefinition.xmlObject.targets).to.exist;
      expect(updatedDefinition.xmlObject.targets.target).to.be.an('array');
      expect(updatedDefinition.xmlObject.targets.target).to.have.length(5);
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__RecordPage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__AppPage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__HomePage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Page');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Default');
    });

    it('should add community targets when targets exist but are empty', () => {
      const mappedObject = {
        [CardMappings.Definition__c]: JSON.stringify({
          xmlObject: {
            targets: {
              target: [],
            },
          },
        }),
      };

      (cardTool as any).ensureCommunityTargets(mappedObject, true);

      const updatedDefinition = JSON.parse(mappedObject[CardMappings.Definition__c]);
      expect(updatedDefinition.xmlObject.targets.target).to.have.length(5);
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__RecordPage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__AppPage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__HomePage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Page');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Default');
    });

    it('should add missing community targets when some targets already exist', () => {
      const mappedObject = {
        [CardMappings.Definition__c]: JSON.stringify({
          xmlObject: {
            targets: {
              target: ['lightning__AppPage', 'lightningCommunity__Page'],
            },
          },
        }),
      };

      (cardTool as any).ensureCommunityTargets(mappedObject, true);

      const updatedDefinition = JSON.parse(mappedObject[CardMappings.Definition__c]);
      expect(updatedDefinition.xmlObject.targets.target).to.have.length(5);
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__RecordPage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__AppPage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__HomePage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Page');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Default');
    });

    it('should not add duplicate targets when they already exist', () => {
      const mappedObject = {
        [CardMappings.Definition__c]: JSON.stringify({
          xmlObject: {
            targets: {
              target: [
                'lightning__RecordPage',
                'lightning__AppPage',
                'lightning__HomePage',
                'lightningCommunity__Page',
                'lightningCommunity__Default',
              ],
            },
          },
        }),
      };

      (cardTool as any).ensureCommunityTargets(mappedObject, true);

      const updatedDefinition = JSON.parse(mappedObject[CardMappings.Definition__c]);
      expect(updatedDefinition.xmlObject.targets.target).to.have.length(5);
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__RecordPage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__AppPage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__HomePage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Page');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Default');
    });

    it('should convert non-array target to empty array and add all required targets', () => {
      const mappedObject = {
        [CardMappings.Definition__c]: JSON.stringify({
          xmlObject: {
            targets: {
              target: 'lightning__AppPage', // Single string instead of array
            },
          },
        }),
      };

      (cardTool as any).ensureCommunityTargets(mappedObject, true);

      const updatedDefinition = JSON.parse(mappedObject[CardMappings.Definition__c]);
      expect(updatedDefinition.xmlObject.targets.target).to.be.an('array');
      expect(updatedDefinition.xmlObject.targets.target).to.have.length(5);
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__RecordPage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__AppPage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__HomePage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Page');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Default');
    });

    it('should handle empty definition gracefully', () => {
      const mappedObject = {
        [CardMappings.Definition__c]: '{}',
      };

      // Should not throw an error
      expect(() => {
        (cardTool as any).ensureCommunityTargets(mappedObject, true);
      }).to.not.throw();

      const updatedDefinition = JSON.parse(mappedObject[CardMappings.Definition__c]);
      expect(updatedDefinition).to.deep.equal({});
    });

    it('should handle missing definition gracefully', () => {
      const mappedObject = {};

      // Should not throw an error
      expect(() => {
        (cardTool as any).ensureCommunityTargets(mappedObject, true);
      }).to.not.throw();
    });

    it('should handle definition without xmlObject gracefully', () => {
      const mappedObject = {
        [CardMappings.Definition__c]: JSON.stringify({
          someOtherProperty: 'value',
          // No xmlObject
        }),
      };

      // Should not throw an error
      expect(() => {
        (cardTool as any).ensureCommunityTargets(mappedObject, true);
      }).to.not.throw();

      const updatedDefinition = JSON.parse(mappedObject[CardMappings.Definition__c]);
      expect(updatedDefinition.someOtherProperty).to.equal('value');
      expect(updatedDefinition.xmlObject).to.be.undefined;
    });

    it('should handle null xmlObject gracefully', () => {
      const mappedObject = {
        [CardMappings.Definition__c]: JSON.stringify({
          xmlObject: null,
        }),
      };

      // Should not throw an error
      expect(() => {
        (cardTool as any).ensureCommunityTargets(mappedObject, true);
      }).to.not.throw();

      const updatedDefinition = JSON.parse(mappedObject[CardMappings.Definition__c]);
      expect(updatedDefinition.xmlObject).to.be.null;
    });

    it('should preserve existing properties while adding community targets', () => {
      const mappedObject = {
        [CardMappings.Definition__c]: JSON.stringify({
          xmlObject: {
            apiVersion: '55.0',
            isExposed: true,
            targets: {
              target: ['lightning__AppPage'],
            },
            masterLabel: 'Test Card',
          },
          otherProperty: 'preserved',
        }),
      };

      (cardTool as any).ensureCommunityTargets(mappedObject, true);

      const updatedDefinition = JSON.parse(mappedObject[CardMappings.Definition__c]);
      expect(updatedDefinition.xmlObject.apiVersion).to.equal('55.0');
      expect(updatedDefinition.xmlObject.isExposed).to.be.true;
      expect(updatedDefinition.xmlObject.masterLabel).to.equal('Test Card');
      expect(updatedDefinition.otherProperty).to.equal('preserved');
      expect(updatedDefinition.xmlObject.targets.target).to.have.length(5);
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__RecordPage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__AppPage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightning__HomePage');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Page');
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Default');
    });

    it('should handle malformed JSON gracefully', () => {
      const mappedObject = {
        [CardMappings.Definition__c]: 'invalid json {',
      };

      // Should throw an error due to JSON.parse, but not crash the application
      expect(() => {
        (cardTool as any).ensureCommunityTargets(mappedObject, true);
      }).to.throw();
    });

    it('should verify all required targets are added', () => {
      const mappedObject = {
        [CardMappings.Definition__c]: JSON.stringify({
          xmlObject: {
            targets: {
              target: [],
            },
          },
        }),
      };

      (cardTool as any).ensureCommunityTargets(mappedObject, true);

      const updatedDefinition = JSON.parse(mappedObject[CardMappings.Definition__c]);
      const requiredTargets = [
        'lightning__RecordPage',
        'lightning__AppPage',
        'lightning__HomePage',
        'lightningCommunity__Page',
        'lightningCommunity__Default',
      ];

      requiredTargets.forEach((target) => {
        expect(updatedDefinition.xmlObject.targets.target).to.include(target);
      });

      expect(updatedDefinition.xmlObject.targets.target).to.have.length(5);
    });

    it('should handle complex existing target arrays', () => {
      const existingTargets = [
        'lightning__AppPage',
        'lightning__HomePage',
        'lightning__RecordPage',
        'lightningCommunity__Page', // Already exists
        'someCustomTarget',
      ];

      const mappedObject = {
        [CardMappings.Definition__c]: JSON.stringify({
          xmlObject: {
            targets: {
              target: [...existingTargets],
            },
          },
        }),
      };

      (cardTool as any).ensureCommunityTargets(mappedObject, true);

      const updatedDefinition = JSON.parse(mappedObject[CardMappings.Definition__c]);

      // Should have all original targets plus the missing community target
      expect(updatedDefinition.xmlObject.targets.target).to.have.length(6);
      existingTargets.forEach((target) => {
        expect(updatedDefinition.xmlObject.targets.target).to.include(target);
      });
      expect(updatedDefinition.xmlObject.targets.target).to.include('lightningCommunity__Default');
    });

    it('should return early and not modify definition when card is inactive', () => {
      const mappedObject = {
        [CardMappings.Definition__c]: JSON.stringify({
          xmlObject: {
            targets: {
              target: [],
            },
          },
        }),
      };

      // Call with isCardActive = false
      (cardTool as any).ensureCommunityTargets(mappedObject, false);

      const updatedDefinition = JSON.parse(mappedObject[CardMappings.Definition__c]);

      // The definition should remain unchanged
      expect(updatedDefinition.xmlObject.targets.target).to.be.an('array');
      expect(updatedDefinition.xmlObject.targets.target).to.have.length(0);
      expect(updatedDefinition.xmlObject.targets.target).to.not.include('lightning__RecordPage');
      expect(updatedDefinition.xmlObject.targets.target).to.not.include('lightning__AppPage');
      expect(updatedDefinition.xmlObject.targets.target).to.not.include('lightning__HomePage');
      expect(updatedDefinition.xmlObject.targets.target).to.not.include('lightningCommunity__Page');
      expect(updatedDefinition.xmlObject.targets.target).to.not.include('lightningCommunity__Default');
    });
  });

  describe('Integration with mapVlocityCardRecord', () => {
    it('should ensure all required targets are added during card mapping for active cards', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Active__c: true, // Active card
        vlocity_ins__Definition__c: JSON.stringify({
          xmlObject: {
            targets: {
              target: ['lightning__AppPage'],
            },
          },
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.xmlObject.targets.target).to.have.length(5);
      expect(definition.xmlObject.targets.target).to.include('lightning__RecordPage');
      expect(definition.xmlObject.targets.target).to.include('lightning__AppPage');
      expect(definition.xmlObject.targets.target).to.include('lightning__HomePage');
      expect(definition.xmlObject.targets.target).to.include('lightningCommunity__Page');
      expect(definition.xmlObject.targets.target).to.include('lightningCommunity__Default');
    });

    it('should not add targets for inactive cards during card mapping', () => {
      const testCard: any = {
        Id: 'card2',
        Name: 'Inactive Card',
        vlocity_ins__Active__c: false, // Inactive card
        vlocity_ins__Definition__c: JSON.stringify({
          xmlObject: {
            targets: {
              target: ['lightning__AppPage'],
            },
          },
        }),
      };

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      // Should remain unchanged for inactive cards
      expect(definition.xmlObject.targets.target).to.have.length(1);
      expect(definition.xmlObject.targets.target).to.include('lightning__AppPage');
      expect(definition.xmlObject.targets.target).to.not.include('lightning__RecordPage');
      expect(definition.xmlObject.targets.target).to.not.include('lightning__HomePage');
      expect(definition.xmlObject.targets.target).to.not.include('lightningCommunity__Page');
      expect(definition.xmlObject.targets.target).to.not.include('lightningCommunity__Default');
    });

    it('should handle cards without xmlObject during mapping', () => {
      const testCard: any = {
        Id: 'card1',
        Name: 'Test Card',
        vlocity_ins__Active__c: true,
        vlocity_ins__Definition__c: JSON.stringify({
          someProperty: 'value',
        }),
      };

      // Should not throw an error
      expect(() => {
        (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      }).to.not.throw();

      const result = (cardTool as any).mapVlocityCardRecord(testCard, new Map(), new Map());
      const definition = JSON.parse(result['PropertySetConfig']);

      expect(definition.someProperty).to.equal('value');
    });
  });

  describe('Custom LWC with cf prefix handling', () => {
    it('should update customlwcname with cf prefix when FlexCard name changes', () => {
      // Add a FlexCard mapping to the registry
      nameRegistry.registerNameMapping({
        originalName: 'Test_childchard',
        cleanedName: 'TestChildCard',
        componentType: 'FlexCard',
        recordId: 'test-record-id',
      });

      const testCard = {
        Id: 'test-id',
        Name: 'Parent_test_Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'customLwc',
                      property: {
                        customlwcname: 'cfTest_childchard',
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

      // Verify that the customlwcname was updated with the cleaned FlexCard name
      expect(definition.states[0].components['layer-0'].children[0].property.customlwcname).to.equal('cfTestChildCard');
    });

    it('should not modify customlwcname without cf prefix', () => {
      const testCard = {
        Id: 'test-id',
        Name: 'Parent_test_Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'customLwc',
                      property: {
                        customlwcname: 'regularCustomLwc',
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

      // Verify that the customlwcname was not modified
      expect(definition.states[0].components['layer-0'].children[0].property.customlwcname).to.equal(
        'regularCustomLwc'
      );
    });

    it('should handle cf prefix with fallback cleaning when no registry mapping exists', () => {
      const testCard = {
        Id: 'test-id',
        Name: 'Parent_test_Card',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'customLwc',
                      property: {
                        customlwcname: 'cfTest-Child-Card',
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

      // Verify that the customlwcname was updated with fallback cleaning
      expect(definition.states[0].components['layer-0'].children[0].property.customlwcname).to.equal('cfTestChildCard');
    });
  });

  describe('Custom LWC reserved "action" property key handling', () => {
    const RESERVED_ACTION_MESSAGE_KEY = 'customLwcReservedActionKey';

    function buildAssessmentInfo(): any {
      return {
        name: 'Test',
        oldName: 'Test',
        id: 'test-id',
        dependenciesIP: [],
        dependenciesDR: [],
        dependenciesOS: [],
        dependenciesFC: [],
        dependenciesLWC: [],
        dependenciesApexRemoteAction: [],
        infos: [],
        warnings: [],
        errors: [],
        migrationStatus: 'Ready for migration',
      };
    }

    function withMessageMock(): void {
      // Replace getMessage with a smarter mock that echoes the key + params
      // so we can assert which message key was emitted.
      (cardTool as any).messages = {
        getMessage: (key: string, params: any[] = []) => `${key}::${(params || []).join(',')}`,
      };
    }

    it('flags a Custom LWC component that defines property.action with errors + warnings + manual intervention', () => {
      withMessageMock();
      const component = {
        element: 'customLwc',
        elementLabel: 'Custom LWC-0',
        property: {
          action: 'abcd',
          customlwcname: 'alert',
          customLwcData: { NamespacePrefix: 'devopsimpkg15' },
        },
      };
      const info = buildAssessmentInfo();

      (cardTool as any).checkCustomLwcForDependencies(component, info);

      expect(info.errors).to.have.length(1);
      expect(info.warnings).to.have.length(1);
      expect(info.errors[0]).to.equal(`${RESERVED_ACTION_MESSAGE_KEY}::alert`);
      expect(info.warnings[0]).to.equal(`${RESERVED_ACTION_MESSAGE_KEY}::alert`);
      expect(info.errors[0]).to.equal(info.warnings[0]);
      expect(info.migrationStatus).to.equal('Needs manual intervention');
      // Existing tracking still applies
      expect(info.dependenciesLWC).to.deep.equal(['alert']);
      expect(info.dependenciesFC).to.deep.equal([]);
    });

    it('triggers regardless of the value of property.action (empty string still counts)', () => {
      withMessageMock();
      const component = {
        element: 'customLwc',
        property: {
          action: '',
          customlwcname: 'alert',
        },
      };
      const info = buildAssessmentInfo();

      (cardTool as any).checkCustomLwcForDependencies(component, info);

      expect(info.errors).to.have.length(1);
      expect(info.warnings).to.have.length(1);
      expect(info.migrationStatus).to.equal('Needs manual intervention');
    });

    it('triggers when property.action is null', () => {
      withMessageMock();
      const component = {
        element: 'customLwc',
        property: {
          action: null,
          customlwcname: 'alert',
        },
      };
      const info = buildAssessmentInfo();

      (cardTool as any).checkCustomLwcForDependencies(component, info);

      expect(info.errors).to.have.length(1);
      expect(info.warnings).to.have.length(1);
      expect(info.migrationStatus).to.equal('Needs manual intervention');
    });

    it('does not flag when property has no "action" key', () => {
      withMessageMock();
      const component = {
        element: 'customLwc',
        property: {
          customlwcname: 'alert',
        },
      };
      const info = buildAssessmentInfo();

      (cardTool as any).checkCustomLwcForDependencies(component, info);

      expect(info.errors).to.be.empty;
      expect(info.warnings).to.be.empty;
      expect(info.migrationStatus).to.equal('Ready for migration');
      expect(info.dependenciesLWC).to.deep.equal(['alert']);
    });

    it('does not flag non-customLwc components even if they have property.action', () => {
      withMessageMock();
      const component = {
        element: 'someOtherElement',
        property: {
          action: 'abcd',
          customlwcname: 'alert',
        },
      };
      const info = buildAssessmentInfo();

      (cardTool as any).checkCustomLwcForDependencies(component, info);

      expect(info.errors).to.be.empty;
      expect(info.warnings).to.be.empty;
      expect(info.migrationStatus).to.equal('Ready for migration');
    });

    it('flags Custom LWC with "action" even when customlwcname starts with cf', () => {
      withMessageMock();
      // Independent of cf-prefix behavior, the reserved-key check must still fire
      const component = {
        element: 'customLwc',
        property: {
          action: 'doSomething',
          customlwcname: 'cfMyFlex',
        },
      };
      const info = buildAssessmentInfo();

      (cardTool as any).checkCustomLwcForDependencies(component, info);

      expect(info.errors[0]).to.equal(`${RESERVED_ACTION_MESSAGE_KEY}::cfMyFlex`);
      expect(info.warnings[0]).to.equal(`${RESERVED_ACTION_MESSAGE_KEY}::cfMyFlex`);
      expect(info.migrationStatus).to.equal('Needs manual intervention');
    });

    it('falls back to elementLabel when customlwcname is absent', () => {
      withMessageMock();
      const component = {
        element: 'customLwc',
        elementLabel: 'Custom LWC-0',
        property: {
          action: 'x',
        },
      };
      const info = buildAssessmentInfo();

      (cardTool as any).checkCustomLwcForDependencies(component, info);

      expect(info.errors[0]).to.equal(`${RESERVED_ACTION_MESSAGE_KEY}::Custom LWC-0`);
    });

    it('falls back to "customLwc" when customlwcname and elementLabel are absent', () => {
      withMessageMock();
      const component = {
        element: 'customLwc',
        property: {
          action: 'x',
        },
      };
      const info = buildAssessmentInfo();

      (cardTool as any).checkCustomLwcForDependencies(component, info);

      expect(info.errors[0]).to.equal(`${RESERVED_ACTION_MESSAGE_KEY}::customLwc`);
    });

    it('keeps "Needs manual intervention" status when processing the example payload via processFlexCard', async () => {
      withMessageMock();
      const flexCard = {
        Id: 'card-1',
        Name: 'testAction',
        vlocity_ins__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'customLwc',
                      elementLabel: 'Custom LWC-0',
                      property: {
                        action: 'abcd',
                        customlwcname: 'alert',
                        customLwcData: { NamespacePrefix: 'devopsimpkg15' },
                      },
                    },
                  ],
                },
              },
            },
          ],
        }),
      };

      const info = await (cardTool as any).processFlexCard(flexCard, new Set(), new Map());

      expect(info.migrationStatus).to.equal('Needs manual intervention');
      expect(info.errors.some((e: string) => e.startsWith(RESERVED_ACTION_MESSAGE_KEY))).to.be.true;
      expect(info.warnings.some((w: string) => w.startsWith(RESERVED_ACTION_MESSAGE_KEY))).to.be.true;
      expect(info.dependenciesLWC).to.include('alert');
    });
  });
});
