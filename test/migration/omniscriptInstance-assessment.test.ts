/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable camelcase */
import { expect } from 'chai';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import sinon = require('sinon');
import { OmniScriptInstanceMigrationTool } from '../../src/migration/omniscriptInstance';
import { Logger } from '../../src/utils/logger';
import { QueryTools } from '../../src/utils';
import { DebugTimer } from '../../src/utils/logging/debugtimer';
import * as dataModelService from '../../src/utils/dataModelService';

describe('OmniScriptInstanceMigrationTool - Assessment', () => {
  let migrationTool: OmniScriptInstanceMigrationTool;
  let connection: Connection;
  let logger: Logger;
  let messages: Messages<string>;
  let ux: Ux;
  let sandbox: sinon.SinonSandbox;
  let namespace: string;
  let getMessageStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    namespace = 'vlocity_ins';

    // Mock connection
    connection = {
      metadata: {
        read: sandbox.stub(),
        update: sandbox.stub(),
      },
      query: sandbox.stub(),
      instanceUrl: 'https://test.salesforce.com',
    } as unknown as Connection;

    // Mock logger
    logger = {
      log: sandbox.stub(),
      captureVerboseData: sandbox.stub(),
    } as unknown as Logger;

    // Mock messages with realistic message returns
    messages = {
      getMessage: sandbox.stub(),
    } as unknown as Messages<string>;
    getMessageStub = messages.getMessage as sinon.SinonStub;
    getMessageStub.withArgs('startingOmniScriptAssessment').returns('Starting assessment for %s');
    getMessageStub.withArgs('foundOmniScriptsToAssess').returns('Found %s instances to assess');
    getMessageStub.withArgs('assessedOmniScriptsCount').returns('Assessed %s instances');
    getMessageStub.withArgs('omniscriptNeedsToBeMigrated').returns('OmniScript %s needs to be migrated');
    getMessageStub.withArgs('unableToFindActiveOmniscript').returns('Unable to find active OmniScript %s');
    getMessageStub
      .withArgs('omniscriptDoesNotExistOrActivate')
      .returns('Please ensure OmniScript exists and is activated');
    getMessageStub.withArgs('noOmniscriptFoundForOsInstance').returns('No OmniScript found for instance %s');
    getMessageStub.withArgs('errorOmniProcessWithTypeQuery').returns('Error querying OmniProcess');
    getMessageStub.returns('mock message');

    // Mock Ux
    ux = {
      log: sandbox.stub(),
      error: sandbox.stub(),
    } as unknown as Ux;

    // Mock DebugTimer
    const debugTimerStub = {
      lap: sandbox.stub(),
      start: sandbox.stub(),
      stop: sandbox.stub(),
    };
    sandbox.stub(DebugTimer, 'getInstance').returns(debugTimerStub as any);

    // Default: custom data model, not metadata API enabled
    sandbox.stub(dataModelService, 'isStandardDataModel').returns(false);
    sandbox.stub(dataModelService, 'isStandardDataModelWithMetadataAPIEnabled').returns(false);

    // Stub Logger static methods used directly in source
    sandbox.stub(Logger, 'log');
    sandbox.stub(Logger, 'logVerbose');
    sandbox.stub(Logger, 'error');
    sandbox.stub(Logger, 'warn');

    migrationTool = new OmniScriptInstanceMigrationTool(namespace, connection, logger, messages, ux);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Basic Properties', () => {
    it('should return correct component name', () => {
      expect(migrationTool.getName()).to.equal('OmniScript Saved Sessions');
    });

    it('should return correct source to target object mappings', () => {
      const mappings = migrationTool.getMappings();
      expect(mappings).to.deep.equal([
        {
          source: 'OmniScriptInstance__c',
          target: 'OmniScriptSavedSession',
        },
      ]);
    });
  });

  describe('Truncate', () => {
    it('should skip truncation when on standard data model', async () => {
      (dataModelService.isStandardDataModel as sinon.SinonStub).returns(true);
      const sdmTool = new OmniScriptInstanceMigrationTool(namespace, connection, logger, messages, ux);

      await sdmTool.truncate();

      expect((Logger.logVerbose as sinon.SinonStub).called).to.be.true;
    });

    it('should call parent truncate with target object on custom data model', async () => {
      const truncateStub = sandbox
        .stub(Object.getPrototypeOf(Object.getPrototypeOf(migrationTool)), 'truncate')
        .resolves();

      await migrationTool.truncate();

      expect(truncateStub.calledOnce).to.be.true;
      expect(truncateStub.calledWith('OmniScriptSavedSession')).to.be.true;
    });
  });

  describe('Assessment Logic', () => {
    let queryWithFilterStub: sinon.SinonStub;
    let queryCustomStub: sinon.SinonStub;

    beforeEach(() => {
      queryWithFilterStub = sandbox.stub(QueryTools, 'queryWithFilter');
      queryCustomStub = sandbox.stub(QueryTools, 'queryCustom');
    });

    describe('Early Exit Conditions', () => {
      it('should return empty array when standard data model with metadata API is enabled', async () => {
        (dataModelService.isStandardDataModelWithMetadataAPIEnabled as sinon.SinonStub).returns(true);

        const result = await migrationTool.assess();

        expect(result).to.be.an('array').that.is.empty;
        expect(queryWithFilterStub.called).to.be.false;
      });

      it('should return empty array when no OmniScriptInstances exist', async () => {
        queryWithFilterStub.resolves([]);

        const result = await migrationTool.assess();

        expect(result).to.be.an('array').that.is.empty;
        expect((Logger.log as sinon.SinonStub).called).to.be.true;
      });
    });

    describe('Type+SubType+Language Matching - OmniProcess Already Migrated', () => {
      it('should mark instance as Ready when matching OmniProcess exists (already migrated to core)', async () => {
        const mockInstances = [
          {
            Id: 'a0D000000000001',
            Name: 'Session-001',
            vlocity_ins__Status__c: 'In Progress',
            vlocity_ins__OmniScriptId__c: 'a0E000000000001',
            vlocity_ins__OmniScriptType__c: 'TestType',
            vlocity_ins__OmniScriptSubType__c: 'TestSubType',
            vlocity_ins__OmniScriptLanguage__c: 'English',
            vlocity_ins__LastSaved__c: '2024-01-15',
          },
        ];
        queryWithFilterStub.resolves(mockInstances);

        // Mock OmniProcess query - matching Type found in core
        queryCustomStub.resolves([
          {
            Name: 'TestType_TestSubType_English',
            Type: 'TestType',
            SubType: 'TestSubType',
            Language: 'English',
          },
        ]);

        const result = await migrationTool.assess();

        expect(result).to.have.length(1);
        expect(result[0].migrationStatus).to.equal('Ready for migration');
        expect(result[0].omniScriptMigrationStatus).to.equal('Complete');
        expect(result[0].id).to.equal('a0D000000000001');
        expect(result[0].omniScriptName).to.equal('TestType_TestSubType_English');
        expect(result[0].errors).to.be.empty;
        expect(result[0].dependenciesOS).to.be.empty;
      });

      it('should filter out OmniProcess with empty Type/SubType/Language during reduce', async () => {
        const mockInstances = [
          {
            Id: 'a0D000000000001b',
            Name: 'Session-001b',
            vlocity_ins__Status__c: 'In Progress',
            vlocity_ins__OmniScriptId__c: 'a0E000000000001b',
            vlocity_ins__OmniScriptType__c: 'ValidType',
            vlocity_ins__OmniScriptSubType__c: 'ValidSub',
            vlocity_ins__OmniScriptLanguage__c: 'en',
            vlocity_ins__LastSaved__c: '2024-01-16',
          },
        ];
        queryWithFilterStub.resolves(mockInstances);

        // Mock OmniProcess query returns mix of valid and invalid (empty) records
        queryCustomStub.resolves([
          {
            Name: 'ValidType_ValidSub_en',
            Type: 'ValidType',
            SubType: 'ValidSub',
            Language: 'en',
          },
          {
            Name: 'EmptyRecord',
            Type: '',
            SubType: '',
            Language: '',
          },
          {
            Name: 'PartiallyEmpty',
            Type: 'Test',
            SubType: null,
            Language: undefined,
          },
        ]);

        const result = await migrationTool.assess();

        expect(result).to.have.length(1);
        // Should match ValidType_ValidSub_en and ignore empty records
        expect(result[0].migrationStatus).to.equal('Ready for migration');
        expect(result[0].omniScriptMigrationStatus).to.equal('Complete');
      });
    });

    describe('Type+SubType+Language Matching - OmniScript in Package (Needs Migration)', () => {
      it('should mark instance as Ready when matching Omniscript__c exists with nameMapping', async () => {
        const mockInstances = [
          {
            Id: 'a0D000000000002',
            Name: 'Session-002',
            vlocity_ins__Status__c: 'In Progress',
            vlocity_ins__OmniScriptId__c: 'a0E000000000002',
            vlocity_ins__OmniScriptType__c: 'Form',
            vlocity_ins__OmniScriptSubType__c: 'Contact',
            vlocity_ins__OmniScriptLanguage__c: 'en_US',
            vlocity_ins__LastSaved__c: '2024-02-15',
          },
        ];
        queryWithFilterStub.resolves(mockInstances);
        queryCustomStub.resolves([]); // No OmniProcess exists

        const omniAssessmentInfos = {
          osAssessmentInfos: [
            {
              id: 'a0E000000000002',
              name: 'Form_Contact_en_US',
              oldName: 'Form_Contact_en_US',
              migrationStatus: 'Ready for migration' as const,
              nameMapping: {
                oldType: 'Form',
                oldSubtype: 'Contact',
                newType: 'Form',
                newSubType: 'Contact',
                oldLanguage: 'en_US',
                newLanguage: 'en_US',
              },
              dependenciesIP: [],
              missingIP: [],
              dependenciesDR: [],
              missingDR: [],
              dependenciesOS: [],
              missingOS: [],
              dependenciesRemoteAction: [],
              dependenciesLWC: [],
              type: 'OmniScript',
              infos: [],
              warnings: [],
              errors: [],
            },
          ],
        };

        const result = await migrationTool.assess(omniAssessmentInfos);

        expect(result).to.have.length(1);
        expect(result[0].migrationStatus).to.equal('Ready for migration');
        expect(result[0].omniScriptMigrationStatus).to.equal('Ready for migration');
        expect(result[0].errors).to.have.length(1);
        expect(result[0].errors[0]).to.include('needs to be migrated');
        expect(result[0].dependenciesOS).to.deep.equal(['Form_Contact_en_US']);
      });

      it('should handle assessment without nameMapping field (undefined)', async () => {
        const mockInstances = [
          {
            Id: 'a0D000000000003',
            Name: 'Session-003',
            vlocity_ins__Status__c: 'In Progress',
            vlocity_ins__OmniScriptId__c: 'a0E000000000003',
            vlocity_ins__OmniScriptType__c: 'Survey',
            vlocity_ins__OmniScriptSubType__c: 'Feedback',
            vlocity_ins__OmniScriptLanguage__c: 'en_US',
            vlocity_ins__LastSaved__c: '2024-03-15',
          },
        ];
        queryWithFilterStub.resolves(mockInstances);
        queryCustomStub.resolves([]);

        const omniAssessmentInfos = {
          osAssessmentInfos: [
            {
              id: 'a0E000000000003',
              name: 'Survey_Feedback_en_US',
              oldName: 'Survey_Feedback_en_US',
              migrationStatus: 'Ready for migration' as const,
              // nameMapping is undefined
              dependenciesIP: [],
              missingIP: [],
              dependenciesDR: [],
              missingDR: [],
              dependenciesOS: [],
              missingOS: [],
              dependenciesRemoteAction: [],
              dependenciesLWC: [],
              type: 'OmniScript',
              infos: [],
              warnings: [],
              errors: [],
            },
          ],
        };

        const result = await migrationTool.assess(omniAssessmentInfos);

        expect(result).to.have.length(1);
        // Without nameMapping, omniscriptSet will be empty, so no match found
        expect(result[0].migrationStatus).to.equal('Needs manual intervention');
        expect(result[0].omniScriptMigrationStatus).to.equal('Needs manual intervention');
        expect(result[0].errors[0]).to.include('Unable to find active OmniScript');
      });

      it('should handle nameMapping with all empty string values', async () => {
        const mockInstances = [
          {
            Id: 'a0D000000000003b',
            Name: 'Session-003b',
            vlocity_ins__Status__c: 'In Progress',
            vlocity_ins__OmniScriptId__c: 'a0E000000000003b',
            vlocity_ins__OmniScriptType__c: 'Test',
            vlocity_ins__OmniScriptSubType__c: 'Sub',
            vlocity_ins__OmniScriptLanguage__c: 'en',
            vlocity_ins__LastSaved__c: '2024-03-16',
          },
        ];
        queryWithFilterStub.resolves(mockInstances);
        queryCustomStub.resolves([]);

        const omniAssessmentInfos = {
          osAssessmentInfos: [
            {
              id: 'a0E000000000003b',
              name: 'EmptyMapping',
              oldName: 'EmptyMapping',
              migrationStatus: 'Ready for migration' as const,
              nameMapping: {
                oldType: '',
                oldSubtype: '',
                newType: '',
                newSubType: '',
                oldLanguage: '',
                newLanguage: '',
              },
              dependenciesIP: [],
              missingIP: [],
              dependenciesDR: [],
              missingDR: [],
              dependenciesOS: [],
              missingOS: [],
              dependenciesRemoteAction: [],
              dependenciesLWC: [],
              type: 'OmniScript',
              infos: [],
              warnings: [],
              errors: [],
            },
          ],
        };

        const result = await migrationTool.assess(omniAssessmentInfos);

        expect(result).to.have.length(1);
        // nameMapping with empty strings results in empty concatenation, not added to omniscriptSet
        expect(result[0].migrationStatus).to.equal('Needs manual intervention');
        expect(result[0].omniScriptMigrationStatus).to.equal('Needs manual intervention');
      });
    });

    describe('Type+SubType+Language Matching - No Match (Needs Manual Intervention)', () => {
      it('should mark as Needs Manual Intervention when Type+SubType+Language not found anywhere', async () => {
        const mockInstances = [
          {
            Id: 'a0D000000000004',
            Name: 'Session-004',
            vlocity_ins__Status__c: 'In Progress',
            vlocity_ins__OmniScriptId__c: 'a0E000000000004',
            vlocity_ins__OmniScriptType__c: 'Deleted',
            vlocity_ins__OmniScriptSubType__c: 'Gone',
            vlocity_ins__OmniScriptLanguage__c: 'en_US',
            vlocity_ins__LastSaved__c: '2024-04-15',
          },
        ];
        queryWithFilterStub.resolves(mockInstances);
        queryCustomStub.resolves([]); // No OmniProcess

        const omniAssessmentInfos = {
          osAssessmentInfos: [], // No matching Omniscript__c
        };

        const result = await migrationTool.assess(omniAssessmentInfos);

        expect(result).to.have.length(1);
        expect(result[0].migrationStatus).to.equal('Needs manual intervention');
        expect(result[0].omniScriptMigrationStatus).to.equal('Needs manual intervention');
        expect(result[0].errors[0]).to.include('Unable to find active OmniScript');
        expect(result[0].errors[1]).to.include('ensure OmniScript exists and is activated');
      });

      it('should handle missing OmniScriptType__c field (empty string)', async () => {
        const mockInstances = [
          {
            Id: 'a0D000000000005',
            Name: 'Session-NoType',
            vlocity_ins__Status__c: 'In Progress',
            vlocity_ins__OmniScriptId__c: 'a0E000000000005',
            vlocity_ins__OmniScriptType__c: '', // Empty type
            vlocity_ins__OmniScriptSubType__c: '',
            vlocity_ins__OmniScriptLanguage__c: '',
            vlocity_ins__LastSaved__c: '2024-05-15',
          },
        ];
        queryWithFilterStub.resolves(mockInstances);
        queryCustomStub.resolves([]);

        const result = await migrationTool.assess();

        expect(result).to.have.length(1);
        expect(result[0].migrationStatus).to.equal('Needs manual intervention');
        expect(result[0].errors[0]).to.include('No OmniScript found for instance');
      });
    });

    describe('Multiple Instances with Mixed Scenarios', () => {
      it('should correctly assess multiple instances with different statuses', async () => {
        const mockInstances = [
          {
            Id: 'a0D001',
            Name: 'Session-Migrated',
            vlocity_ins__Status__c: 'In Progress',
            vlocity_ins__OmniScriptId__c: 'a0E001',
            vlocity_ins__OmniScriptType__c: 'TypeA',
            vlocity_ins__OmniScriptSubType__c: 'SubA',
            vlocity_ins__OmniScriptLanguage__c: 'en',
            vlocity_ins__LastSaved__c: '2024-01-01',
          },
          {
            Id: 'a0D002',
            Name: 'Session-NeedsMigration',
            vlocity_ins__Status__c: 'In Progress',
            vlocity_ins__OmniScriptId__c: 'a0E002',
            vlocity_ins__OmniScriptType__c: 'TypeB',
            vlocity_ins__OmniScriptSubType__c: 'SubB',
            vlocity_ins__OmniScriptLanguage__c: 'en',
            vlocity_ins__LastSaved__c: '2024-02-01',
          },
          {
            Id: 'a0D003',
            Name: 'Session-NotFound',
            vlocity_ins__Status__c: 'In Progress',
            vlocity_ins__OmniScriptId__c: 'a0E003',
            vlocity_ins__OmniScriptType__c: 'TypeC',
            vlocity_ins__OmniScriptSubType__c: 'SubC',
            vlocity_ins__OmniScriptLanguage__c: 'en',
            vlocity_ins__LastSaved__c: '2024-03-01',
          },
        ];
        queryWithFilterStub.resolves(mockInstances);

        // Only TypeA exists in OmniProcess (migrated)
        queryCustomStub.resolves([{ Name: 'TypeA_SubA_en', Type: 'TypeA', SubType: 'SubA', Language: 'en' }]);

        const omniAssessmentInfos = {
          osAssessmentInfos: [
            {
              id: 'a0E002',
              name: 'TypeB_SubB_en',
              oldName: 'TypeB_SubB_en',
              migrationStatus: 'Ready for migration' as const,
              nameMapping: {
                oldType: 'TypeB',
                oldSubtype: 'SubB',
                newType: 'TypeB',
                newSubType: 'SubB',
                oldLanguage: 'en',
                newLanguage: 'en',
              },
              dependenciesIP: [],
              missingIP: [],
              dependenciesDR: [],
              missingDR: [],
              dependenciesOS: [],
              missingOS: [],
              dependenciesRemoteAction: [],
              dependenciesLWC: [],
              type: 'OmniScript',
              infos: [],
              warnings: [],
              errors: [],
            },
          ],
        };

        const result = await migrationTool.assess(omniAssessmentInfos);

        expect(result).to.have.length(3);
        // Instance 1: TypeA found in OmniProcess
        expect(result[0].id).to.equal('a0D001');
        expect(result[0].migrationStatus).to.equal('Ready for migration');
        expect(result[0].omniScriptMigrationStatus).to.equal('Complete');

        // Instance 2: TypeB found in package (nameMapping)
        expect(result[1].id).to.equal('a0D002');
        expect(result[1].migrationStatus).to.equal('Ready for migration');
        expect(result[1].omniScriptMigrationStatus).to.equal('Ready for migration');
        expect(result[1].dependenciesOS).to.include('TypeB_SubB_en');

        // Instance 3: TypeC not found anywhere
        expect(result[2].id).to.equal('a0D003');
        expect(result[2].migrationStatus).to.equal('Needs manual intervention');
        expect(result[2].omniScriptMigrationStatus).to.equal('Needs manual intervention');
      });
    });

    describe('Error Handling', () => {
      it('should re-throw InvalidEntityTypeError when object does not exist', async () => {
        const invalidTypeError: any = new Error('OmniScriptInstance__c type is not found');
        invalidTypeError.errorCode = 'INVALID_TYPE';
        queryWithFilterStub.rejects(invalidTypeError);

        try {
          await migrationTool.assess();
          expect.fail('Should have thrown InvalidEntityTypeError');
        } catch (error: any) {
          expect(error.message).to.include('type is not found');
        }
      });

      it('should return empty array for unexpected errors', async () => {
        queryWithFilterStub.rejects(new Error('Connection timeout'));

        const result = await migrationTool.assess();

        expect(result).to.be.an('array').that.is.empty;
      });

      it('should handle OmniProcess query errors gracefully', async () => {
        const mockInstances = [
          {
            Id: 'a0D000000000010',
            Name: 'Session-010',
            vlocity_ins__Status__c: 'In Progress',
            vlocity_ins__OmniScriptId__c: 'a0E000000000010',
            vlocity_ins__OmniScriptType__c: 'Test',
            vlocity_ins__OmniScriptSubType__c: 'Sub',
            vlocity_ins__OmniScriptLanguage__c: 'en',
            vlocity_ins__LastSaved__c: '2024-10-01',
          },
        ];
        queryWithFilterStub.resolves(mockInstances);
        queryCustomStub.rejects(new Error('SOQL query failed'));

        const result = await migrationTool.assess();

        // Should still process instances, treating OmniProcess query failure as empty result
        expect(result).to.have.length(1);
        expect((Logger.error as sinon.SinonStub).calledWith(sinon.match(/Error querying OmniProcess/))).to.be.true;
      });
    });
  });

  describe('extractUniqueNamesFromOmniscriptAssessment (via assessPrepare)', () => {
    it('should extract Type+SubType+Language from nameMapping when present', async () => {
      const mockInstances = [
        {
          Id: 'a0D100',
          Name: 'Session-100',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E100',
          vlocity_ins__OmniScriptType__c: 'Form',
          vlocity_ins__OmniScriptSubType__c: 'Application',
          vlocity_ins__OmniScriptLanguage__c: 'en_US',
          vlocity_ins__LastSaved__c: '2024-11-01',
        },
      ];
      sandbox.stub(QueryTools, 'queryWithFilter').resolves(mockInstances);
      sandbox.stub(QueryTools, 'queryCustom').resolves([]);

      const omniAssessmentInfos = {
        osAssessmentInfos: [
          {
            id: 'a0E100',
            name: 'Form_Application_en_US',
            oldName: 'Form_Application_en_US',
            migrationStatus: 'Ready for migration' as const,
            nameMapping: {
              oldType: 'FormOld',
              oldSubtype: 'ApplicationOld',
              newType: 'Form',
              newSubType: 'Application',
              oldLanguage: 'en_US',
              newLanguage: 'en_US',
            },
            dependenciesIP: [],
            missingIP: [],
            dependenciesDR: [],
            missingDR: [],
            dependenciesOS: [],
            missingOS: [],
            dependenciesRemoteAction: [],
            dependenciesLWC: [],
            type: 'OmniScript',
            infos: [],
            warnings: [],
            errors: [],
          },
        ],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.have.length(1);
      // The nameMapping new values should match the instance Type+SubType+Language
      expect(result[0].migrationStatus).to.equal('Ready for migration');
      expect(result[0].omniScriptMigrationStatus).to.equal('Ready for migration');
    });

    it('should handle multiple assessment infos with some having nameMapping and some not', async () => {
      const mockInstances = [
        {
          Id: 'a0D200',
          Name: 'Session-200',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E200',
          vlocity_ins__OmniScriptType__c: 'TypeX',
          vlocity_ins__OmniScriptSubType__c: 'SubX',
          vlocity_ins__OmniScriptLanguage__c: 'en',
          vlocity_ins__LastSaved__c: '2024-12-01',
        },
      ];
      sandbox.stub(QueryTools, 'queryWithFilter').resolves(mockInstances);
      sandbox.stub(QueryTools, 'queryCustom').resolves([]);

      const omniAssessmentInfos = {
        osAssessmentInfos: [
          {
            id: 'a0E200',
            name: 'TypeX_SubX_en',
            oldName: 'TypeX_SubX_en',
            migrationStatus: 'Ready for migration' as const,
            nameMapping: {
              oldType: 'TypeX',
              oldSubtype: 'SubX',
              newType: 'TypeX',
              newSubType: 'SubX',
              oldLanguage: 'en',
              newLanguage: 'en',
            },
            dependenciesIP: [],
            missingIP: [],
            dependenciesDR: [],
            missingDR: [],
            dependenciesOS: [],
            missingOS: [],
            dependenciesRemoteAction: [],
            dependenciesLWC: [],
            type: 'OmniScript',
            infos: [],
            warnings: [],
            errors: [],
          },
          {
            id: 'a0E201',
            name: 'TypeY_SubY_en',
            oldName: 'TypeY_SubY_en',
            migrationStatus: 'Ready for migration' as const,
            // No nameMapping
            dependenciesIP: [],
            missingIP: [],
            dependenciesDR: [],
            missingDR: [],
            dependenciesOS: [],
            missingOS: [],
            dependenciesRemoteAction: [],
            dependenciesLWC: [],
            type: 'OmniScript',
            infos: [],
            warnings: [],
            errors: [],
          },
        ],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.have.length(1);
      // TypeX should be found via nameMapping, TypeY not found (no nameMapping)
      expect(result[0].migrationStatus).to.equal('Ready for migration');
    });

    it('should return empty set when osAssessmentInfos is empty array', async () => {
      const mockInstances = [
        {
          Id: 'a0D300',
          Name: 'Session-300',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E300',
          vlocity_ins__OmniScriptType__c: 'Lone',
          vlocity_ins__OmniScriptSubType__c: 'Wolf',
          vlocity_ins__OmniScriptLanguage__c: 'en',
          vlocity_ins__LastSaved__c: '2024-12-15',
        },
      ];
      sandbox.stub(QueryTools, 'queryWithFilter').resolves(mockInstances);
      sandbox.stub(QueryTools, 'queryCustom').resolves([]);

      const result = await migrationTool.assess({ osAssessmentInfos: [] });

      expect(result).to.have.length(1);
      // No osAssessmentInfos means empty omniscriptSet
      expect(result[0].migrationStatus).to.equal('Needs manual intervention');
    });

    it('should handle non-array osAssessmentInfos gracefully', async () => {
      const mockInstances = [
        {
          Id: 'a0D301',
          Name: 'Session-301',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E301',
          vlocity_ins__OmniScriptType__c: 'Test',
          vlocity_ins__OmniScriptSubType__c: 'Sub',
          vlocity_ins__OmniScriptLanguage__c: 'en',
          vlocity_ins__LastSaved__c: '2024-12-16',
        },
      ];
      sandbox.stub(QueryTools, 'queryWithFilter').resolves(mockInstances);
      sandbox.stub(QueryTools, 'queryCustom').resolves([]);

      // Pass non-array value (will fail Array.isArray check)
      const result = await migrationTool.assess({ osAssessmentInfos: null as any });

      expect(result).to.have.length(1);
      // Non-array treated as empty, omniscriptSet will be empty
      expect(result[0].migrationStatus).to.equal('Needs manual intervention');
    });

    it('should handle null/undefined elements inside osAssessmentInfos array', async () => {
      const mockInstances = [
        {
          Id: 'a0D302',
          Name: 'Session-302',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E302',
          vlocity_ins__OmniScriptType__c: 'TypeA',
          vlocity_ins__OmniScriptSubType__c: 'SubA',
          vlocity_ins__OmniScriptLanguage__c: 'en',
          vlocity_ins__LastSaved__c: '2024-12-17',
        },
      ];
      sandbox.stub(QueryTools, 'queryWithFilter').resolves(mockInstances);
      sandbox.stub(QueryTools, 'queryCustom').resolves([]);

      const omniAssessmentInfos = {
        osAssessmentInfos: [
          null as any,
          {
            id: 'a0E302',
            name: 'TypeA_SubA_en',
            oldName: 'TypeA_SubA_en',
            migrationStatus: 'Ready for migration' as const,
            nameMapping: {
              oldType: 'TypeA',
              oldSubtype: 'SubA',
              newType: 'TypeA',
              newSubType: 'SubA',
              oldLanguage: 'en',
              newLanguage: 'en',
            },
            dependenciesIP: [],
            missingIP: [],
            dependenciesDR: [],
            missingDR: [],
            dependenciesOS: [],
            missingOS: [],
            dependenciesRemoteAction: [],
            dependenciesLWC: [],
            type: 'OmniScript',
            infos: [],
            warnings: [],
            errors: [],
          },
          undefined as any,
        ],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.have.length(1);
      // Should skip null/undefined elements and process valid one
      expect(result[0].migrationStatus).to.equal('Ready for migration');
      expect(result[0].omniScriptMigrationStatus).to.equal('Ready for migration');
    });
  });

  describe('queryOmniProcessesWithType', () => {
    it('should construct correct SOQL query with Type IN clause', async () => {
      const queryWithFilterStub = sandbox.stub(QueryTools, 'queryWithFilter');
      const queryCustomStub = sandbox.stub(QueryTools, 'queryCustom');

      const mockInstances = [
        {
          Id: 'a0D400',
          Name: 'Session-400',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E400',
          vlocity_ins__OmniScriptType__c: 'FormA',
          vlocity_ins__OmniScriptSubType__c: 'SubA',
          vlocity_ins__OmniScriptLanguage__c: 'en',
          vlocity_ins__LastSaved__c: '2025-01-01',
        },
        {
          Id: 'a0D401',
          Name: 'Session-401',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E401',
          vlocity_ins__OmniScriptType__c: 'FormB',
          vlocity_ins__OmniScriptSubType__c: 'SubB',
          vlocity_ins__OmniScriptLanguage__c: 'en',
          vlocity_ins__LastSaved__c: '2025-01-02',
        },
      ];
      queryWithFilterStub.resolves(mockInstances);
      queryCustomStub.resolves([
        { Name: 'FormA_SubA_en', Type: 'FormA', SubType: 'SubA', Language: 'en' } as any,
        { Name: 'FormB_SubB_en', Type: 'FormB', SubType: 'SubB', Language: 'en' } as any,
      ]);

      const result = await migrationTool.assess();

      expect(queryCustomStub.calledOnce).to.be.true;
      const query = queryCustomStub.getCall(0).args[1];
      // Query should include both FormA and FormB types
      expect(query).to.include('Type IN');
      expect(query).to.include("'FormA'");
      expect(query).to.include("'FormB'");
      expect(query).to.include('IsActive = true');
      expect(result).to.have.length(2);
    });

    it('should handle empty omniscriptTypes set', async () => {
      const queryWithFilterStub = sandbox.stub(QueryTools, 'queryWithFilter');
      const queryCustomStub = sandbox.stub(QueryTools, 'queryCustom');

      const mockInstances = [
        {
          Id: 'a0D500',
          Name: 'Session-500',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E500',
          vlocity_ins__OmniScriptType__c: '', // Empty type
          vlocity_ins__OmniScriptSubType__c: '',
          vlocity_ins__OmniScriptLanguage__c: '',
          vlocity_ins__LastSaved__c: '2025-02-01',
        },
      ];
      queryWithFilterStub.resolves(mockInstances);
      queryCustomStub.resolves([]);

      await migrationTool.assess();

      expect(queryCustomStub.calledOnce).to.be.true;
      const query = queryCustomStub.getCall(0).args[1];
      // When no types, query should only have IsActive filter
      expect(query).to.include('IsActive = true');
      expect(query).to.not.include('Type IN');
    });

    it('should return empty array when OmniProcess query fails', async () => {
      const mockInstances = [
        {
          Id: 'a0D600',
          Name: 'Session-600',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E600',
          vlocity_ins__OmniScriptType__c: 'TestType',
          vlocity_ins__OmniScriptSubType__c: 'TestSub',
          vlocity_ins__OmniScriptLanguage__c: 'en',
          vlocity_ins__LastSaved__c: '2025-03-01',
        },
      ];
      sandbox.stub(QueryTools, 'queryWithFilter').resolves(mockInstances);
      sandbox.stub(QueryTools, 'queryCustom').rejects(new Error('Query failed'));

      const result = await migrationTool.assess();

      // Should still return assessment results with intervention status
      expect(result).to.have.length(1);
      expect(result[0].migrationStatus).to.equal('Needs manual intervention');
    });
  });

  describe('Namespace Field Handling', () => {
    it('should use namespaced fields for custom data model queries', async () => {
      const queryWithFilterStub = sandbox.stub(QueryTools, 'queryWithFilter');
      queryWithFilterStub.resolves([
        {
          Id: 'a0D700',
          Name: 'Session-NS',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0ENS',
          vlocity_ins__OmniScriptType__c: 'NSType',
          vlocity_ins__OmniScriptSubType__c: 'NSSub',
          vlocity_ins__OmniScriptLanguage__c: 'en',
          vlocity_ins__LastSaved__c: '2025-04-01',
        },
      ]);
      sandbox.stub(QueryTools, 'queryCustom').resolves([]);

      await migrationTool.assess();

      expect(queryWithFilterStub.calledOnce).to.be.true;
      const callArgs = queryWithFilterStub.getCall(0).args;
      expect(callArgs[1]).to.equal('vlocity_ins'); // namespace
      expect(callArgs[2]).to.equal('OmniScriptInstance__c'); // object name
    });

    it('should work with empty namespace', async () => {
      const emptyNsTool = new OmniScriptInstanceMigrationTool('', connection, logger, messages, ux);
      const queryWithFilterStub = sandbox.stub(QueryTools, 'queryWithFilter');
      queryWithFilterStub.resolves([]);

      const result = await emptyNsTool.assess();

      expect(result).to.be.an('array').that.is.empty;
      expect(queryWithFilterStub.calledOnce).to.be.true;
      expect(queryWithFilterStub.getCall(0).args[1]).to.equal(''); // empty namespace
    });
  });
});
