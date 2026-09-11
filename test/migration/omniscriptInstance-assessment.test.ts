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
      request: sandbox.stub(),
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
      it('should mark instance as Ready when matching OmniProcess exists and filter out empty records', async () => {
        const mockInstances = [
          {
            Id: 'a0D000000000001',
            Name: 'Session-001',
            vlocity_ins__Status__c: 'In Progress',
            vlocity_ins__OmniScriptId__c: 'a0E000000000001',
            vlocity_ins__OmniScriptType__c: 'ValidType',
            vlocity_ins__OmniScriptSubType__c: 'ValidSub',
            vlocity_ins__OmniScriptLanguage__c: 'en',
            vlocity_ins__LastSaved__c: '2024-01-15',
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
        expect(result[0].migrationStatus).to.equal('Ready for migration');
        expect(result[0].omniScriptMigrationStatus).to.equal('Complete');
        expect(result[0].id).to.equal('a0D000000000001');
        expect(result[0].omniScriptName).to.equal('ValidType_ValidSub_en');
        expect(result[0].errors).to.be.empty;
        expect(result[0].dependenciesOS).to.be.empty;
      });
    });

    describe('Type+SubType+Language Matching - OmniScript in Package (Needs Migration)', () => {
      it('should mark instance as Ready when matching Omniscript__c exists with valid nameMapping', async () => {
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

      it('should mark as manual intervention when nameMapping has empty fields', async () => {
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
        expect(result[0].migrationStatus).to.equal('Needs manual intervention');
        expect(result[0].omniScriptMigrationStatus).to.equal('Needs manual intervention');
      });
    });

    describe('Type+SubType+Language Matching - No Match (Needs Manual Intervention)', () => {
      it('should mark as Needs Manual Intervention when Type+SubType+Language not found or empty', async () => {
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
        queryCustomStub.resolves([]); // No OmniProcess

        const result = await migrationTool.assess({ osAssessmentInfos: [] });

        expect(result).to.have.length(2);
        // First instance: type not found
        expect(result[0].migrationStatus).to.equal('Needs manual intervention');
        expect(result[0].omniScriptMigrationStatus).to.equal('Needs manual intervention');
        expect(result[0].errors[0]).to.include('Unable to find active OmniScript');
        // Second instance: empty type
        expect(result[1].migrationStatus).to.equal('Needs manual intervention');
        expect(result[1].errors[0]).to.include('No OmniScript found for instance');
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

      it('should not run assessment when standard field, ManagedPkgSessKey does not exist in Omniscript Saved Session', async () => {
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
        queryCustomStub.rejects(new Error("No such column 'ManagedPkgSessKey' on entity 'OmniScriptSavedSession'."));
        const result = await migrationTool.assess();
        expect(result).to.have.length(0);
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

    it('should handle edge cases in osAssessmentInfos (empty, non-array, null elements)', async () => {
      const mockInstances = [
        {
          Id: 'a0D300',
          Name: 'Session-300',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E300',
          vlocity_ins__OmniScriptType__c: 'TypeA',
          vlocity_ins__OmniScriptSubType__c: 'SubA',
          vlocity_ins__OmniScriptLanguage__c: 'en',
          vlocity_ins__LastSaved__c: '2024-12-15',
        },
      ];
      sandbox.stub(QueryTools, 'queryWithFilter').resolves(mockInstances);
      sandbox.stub(QueryTools, 'queryCustom').resolves([]);

      // Test 1: empty array
      let result = await migrationTool.assess({ osAssessmentInfos: [] });
      expect(result).to.have.length(1);
      expect(result[0].migrationStatus).to.equal('Needs manual intervention');

      // Test 2: non-array (null)
      result = await migrationTool.assess({ osAssessmentInfos: null as any });
      expect(result).to.have.length(1);
      expect(result[0].migrationStatus).to.equal('Needs manual intervention');

      // Test 3: array with null/undefined elements and valid element
      const omniAssessmentInfos = {
        osAssessmentInfos: [
          null as any,
          {
            id: 'a0E300',
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
      result = await migrationTool.assess(omniAssessmentInfos);
      expect(result).to.have.length(1);
      expect(result[0].migrationStatus).to.equal('Ready for migration');
    });
  });

  describe('queryOmniProcessesWithType', () => {
    it('should construct correct SOQL query with Type IN clause and handle empty types', async () => {
      const queryWithFilterStub = sandbox.stub(QueryTools, 'queryWithFilter');
      const queryCustomStub = sandbox.stub(QueryTools, 'queryCustom');

      // Test 1: Multiple types
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

      // Use parameter matching to differentiate between OmniProcess and OmniScript__c queries
      queryCustomStub
        .withArgs(sinon.match.any, sinon.match(/FROM OmniProcess/))
        .resolves([
          { Name: 'FormA_SubA_en', Type: 'FormA', SubType: 'SubA', Language: 'en' } as any,
          { Name: 'FormB_SubB_en', Type: 'FormB', SubType: 'SubB', Language: 'en' } as any,
        ]);

      queryCustomStub.withArgs(sinon.match.any, sinon.match(/FROM.*OmniScript__c/)).resolves([]);

      // Default fallback for unexpected queries
      queryCustomStub.resolves([]);

      let result = await migrationTool.assess();

      // Check the last call (queryOmniProcessesWithType)
      let lastCallIndex = queryCustomStub.callCount - 1;
      let query = queryCustomStub.getCall(lastCallIndex).args[1];

      expect(query).to.include('Type IN');
      expect(query).to.include("'FormA'");
      expect(query).to.include("'FormB'");
      expect(query).to.include('IsActive = true');
      expect(result).to.have.length(2);

      // Test 2: Empty type - query should not have Type IN clause
      queryWithFilterStub.resolves([
        {
          Id: 'a0D500',
          Name: 'Session-500',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E500',
          vlocity_ins__OmniScriptType__c: '',
          vlocity_ins__OmniScriptSubType__c: '',
          vlocity_ins__OmniScriptLanguage__c: '',
          vlocity_ins__LastSaved__c: '2025-02-01',
        },
      ]);
      // Reset stub for new test
      queryCustomStub.reset();
      queryCustomStub.withArgs(sinon.match.any, sinon.match(/FROM OmniProcess/)).resolves([]);
      queryCustomStub.withArgs(sinon.match.any, sinon.match(/FROM.*OmniScript__c/)).resolves([]);
      queryCustomStub.resolves([]);

      result = await migrationTool.assess();

      lastCallIndex = queryCustomStub.callCount - 1;
      query = queryCustomStub.getCall(lastCallIndex).args[1];

      expect(query).to.include('IsActive = true');
      expect(query).to.not.include('Type IN');
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
  });

  describe('getRecordName', () => {
    it('should return Name when present or Id when Name is missing/empty', () => {
      expect(migrationTool.getRecordName({ Name: 'Session-001', Id: 'a0D123' })).to.equal('Session-001');
      expect(migrationTool.getRecordName({ Id: 'a0D456' })).to.equal('a0D456');
      expect(migrationTool.getRecordName({ Name: '', Id: 'a0D789' })).to.equal('a0D789');
    });
  });

  describe('queryAttachments', () => {
    let queryCustomStub: sinon.SinonStub;

    beforeEach(() => {
      queryCustomStub = sandbox.stub(QueryTools, 'queryCustom');
    });

    it('should construct correct SOQL query for attachments', async () => {
      queryCustomStub.resolves([
        {
          Id: '00P001',
          Name: 'OmniscriptFullJSON.json',
          Body: '/services/data/v67.0/sobjects/Attachment/00P001/Body',
          ContentType: 'application/json',
        },
      ]);

      const result = await (migrationTool as any).queryAttachments('a0D001');

      expect(queryCustomStub.calledOnce).to.be.true;
      const query = queryCustomStub.getCall(0).args[1];
      expect(query).to.include('SELECT Id,Name,Body,ContentType');
      expect(query).to.include('FROM Attachment');
      expect(query).to.include("WHERE ParentId = 'a0D001'");
      expect(result).to.have.length(1);
      expect(result[0].Id).to.equal('00P001');
    });

    it('should return empty array when query fails', async () => {
      queryCustomStub.rejects(new Error('Query failed'));

      const result = await (migrationTool as any).queryAttachments('a0D002');

      expect(result).to.be.an('array').that.is.empty;
      expect((Logger.error as sinon.SinonStub).called).to.be.true;
    });
  });

  describe('hasStandardFieldPackageSavedSessionId', () => {
    let queryCustomStub: sinon.SinonStub;

    beforeEach(() => {
      queryCustomStub = sandbox.stub(QueryTools, 'queryCustom');
    });

    it('should return true when custom field exists', async () => {
      queryCustomStub.resolves([{ Name: 'TestSession', ManagedPkgSessKey: 'a0D123' }]);

      const result = await (migrationTool as any).hasStandardFieldPackageSavedSessionId();

      expect(result).to.be.true;
      expect(queryCustomStub.calledOnce).to.be.true;
      const query = queryCustomStub.getCall(0).args[1];
      expect(query).to.include('ManagedPkgSessKey');
      expect(query).to.include('FROM OmniScriptSavedSession');
      expect(query).to.include('LIMIT 1');
    });

    it('should return false when custom field does not exist', async () => {
      queryCustomStub.rejects(new Error('Invalid field: ManagedPkgSessKey'));

      const result = await (migrationTool as any).hasStandardFieldPackageSavedSessionId();

      expect(result).to.be.false;
    });
  });

  describe('downloadAttachments', () => {
    let connectionRequestStub: sinon.SinonStub;

    beforeEach(() => {
      connectionRequestStub = connection.request as sinon.SinonStub;
    });

    it('should download attachments successfully with string response', async () => {
      connectionRequestStub.resolves('base64encodedcontent');

      const attachments = [
        {
          Id: '00P001',
          Name: 'OmniscriptFullJSON.json',
          Body: '/services/data/v67.0/sobjects/Attachment/00P001/Body',
          ContentType: 'application/json',
        },
      ];

      const result = await (migrationTool as any).downloadAttachments(attachments);

      expect(result).to.have.length(1);
      expect(result[0].id).to.equal('00P001');
      expect(result[0].name).to.equal('OmniscriptFullJSON.json');
      expect(result[0].body).to.equal(Buffer.from('base64encodedcontent', 'utf8').toString('base64'));
      expect(result[0].contentType).to.equal('application/json');
      expect(result[0].errors).to.be.empty;
      expect(connectionRequestStub.calledOnce).to.be.true;
    });

    it('should preserve arbitrary bytes from a Buffer response', async () => {
      const source = Buffer.from([0x00, 0xff, 0x80, 0xc3, 0x28]);
      connectionRequestStub.resolves(source);

      const attachments = [
        { Id: '00P002', Name: 'file.json', Body: '/services/data/v67.0/sobjects/Attachment/00P002/Body' },
      ];

      const result = await (migrationTool as any).downloadAttachments(attachments);

      expect(result).to.have.length(1);
      expect(result[0].id).to.equal('00P002');
      expect(Buffer.from(result[0].body, 'base64')).to.deep.equal(source);
    });

    it('should handle download errors gracefully', async () => {
      connectionRequestStub.rejects(new Error('Network timeout'));
      getMessageStub.withArgs('ossAttachmentDownloadFailed').returns('Failed to download attachment: %s - %s');

      const attachments = [
        { Id: '00P003', Name: 'failed.json', Body: '/services/data/v67.0/sobjects/Attachment/00P003/Body' },
      ];

      const result = await (migrationTool as any).downloadAttachments(attachments);

      expect(result).to.have.length(1);
      expect(result[0].id).to.equal('00P003');
      expect(result[0].body).to.equal('');
      expect(result[0].errors).to.have.length(1);
      expect(result[0].errors[0]).to.include('Failed to download attachment');
      expect((Logger.error as sinon.SinonStub).called).to.be.true;
    });

    it('should handle attachments with missing fields', async () => {
      connectionRequestStub.resolves('content');

      const attachments = [
        { Id: '00P006', Name: '', Body: '' }, // Missing Name and Body
        { Id: '', Name: 'test.json', Body: '/path/to/body' }, // Missing Id
      ];

      const result = await (migrationTool as any).downloadAttachments(attachments);

      expect(result).to.have.length(2);
      expect(result[0].id).to.equal('00P006');
      expect(result[0].name).to.equal('');
      expect(result[1].id).to.equal('');
      expect(result[1].name).to.equal('test.json');
    });

    it('should download multiple attachments with correct URLs', async () => {
      // Use parameter matching instead of call order for robustness
      // Match the request object structure: { method: 'GET', url: path }
      connectionRequestStub
        .withArgs(sinon.match({ url: '/services/data/v67.0/sobjects/Attachment/00P004/Body' }))
        .resolves('content1');
      connectionRequestStub
        .withArgs(sinon.match({ url: '/services/data/v67.0/sobjects/Attachment/00P005/Body' }))
        .resolves('content2');

      const attachments = [
        { Id: '00P004', Name: 'file1.json', Body: '/services/data/v67.0/sobjects/Attachment/00P004/Body' },
        { Id: '00P005', Name: 'file2.json', Body: '/services/data/v67.0/sobjects/Attachment/00P005/Body' },
      ];

      const result = await (migrationTool as any).downloadAttachments(attachments);

      expect(result).to.have.length(2);
      // Verify by ID instead of assuming order
      const file1 = result.find((r: any) => r.id === '00P004');
      const file2 = result.find((r: any) => r.id === '00P005');

      expect(file1.body).to.equal(Buffer.from('content1', 'utf8').toString('base64'));
      expect(file2.body).to.equal(Buffer.from('content2', 'utf8').toString('base64'));
      expect(connectionRequestStub.calledTwice).to.be.true;
    });
  });

  describe('queryPackageOmniscriptsWithType', () => {
    let queryCustomStub: sinon.SinonStub;

    beforeEach(() => {
      queryCustomStub = sandbox.stub(QueryTools, 'queryCustom');
    });

    it('should construct correct SOQL query with Type IN clause and handle empty types', async () => {
      queryCustomStub.resolves([
        { vlocity_ins__Type__c: 'TypeA', vlocity_ins__SubType__c: 'SubA', vlocity_ins__Language__c: 'en' },
      ]);

      // Test with types
      const types = new Set(['TypeA', 'TypeB']);
      const result = await (migrationTool as any).queryPackageOmniscriptsWithType(types);

      expect(queryCustomStub.calledOnce).to.be.true;
      let query = queryCustomStub.getCall(0).args[1];
      expect(query).to.include('SELECT vlocity_ins__Type__c,vlocity_ins__SubType__c,vlocity_ins__Language__c');
      expect(query).to.include('FROM vlocity_ins__OmniScript__c');
      expect(query).to.include("vlocity_ins__Type__c IN ('TypeA','TypeB')");
      expect(query).to.include('vlocity_ins__IsActive__c = true');
      expect(result).to.have.length(1);

      // Test with empty types set
      queryCustomStub.resolves([]);
      const emptyTypes = new Set<string>();
      await (migrationTool as any).queryPackageOmniscriptsWithType(emptyTypes);

      query = queryCustomStub.getCall(1).args[1];
      expect(query).to.include('vlocity_ins__IsActive__c = true');
      expect(query).to.not.include('IN');
    });

    it('should handle query failures gracefully', async () => {
      queryCustomStub.rejects(new Error('Query failed'));

      const types = new Set(['TypeC']);
      await (migrationTool as any).queryPackageOmniscriptsWithType(types);

      expect((Logger.error as sinon.SinonStub).called).to.be.true;
    });
  });

  describe('Helper Methods', () => {
    describe('isAbsoluteUrl', () => {
      it('should return true for absolute URLs and false for relative URLs', () => {
        expect((migrationTool as any).isAbsoluteUrl('https://example.com/path')).to.be.true;
        expect((migrationTool as any).isAbsoluteUrl('http://test.com')).to.be.true;
        expect((migrationTool as any).isAbsoluteUrl('/relative/path')).to.be.false;
        expect((migrationTool as any).isAbsoluteUrl('relative/path')).to.be.false;
        expect((migrationTool as any).isAbsoluteUrl('../relative')).to.be.false;
      });
    });

    describe('replaceResumeSessionUrl', () => {
      it('should update URL parameters for absolute URLs', () => {
        const url = 'https://example.com/page?existing=param';
        const result = (migrationTool as any).replaceResumeSessionUrl(url, 'TypeA', 'SubA', 'en', 'sessionId123');

        expect(result).to.include('c__InstanceId=sessionId123');
        expect(result).to.include('omniscript__type=TypeA');
        expect(result).to.include('omniscript__subType=SubA');
        expect(result).to.include('omniscript__language=en');
        expect(result).to.not.include('c__target');
      });

      it('should update URL parameters for relative URLs', () => {
        const url = '/relative/path?existing=param';
        const result = (migrationTool as any).replaceResumeSessionUrl(url, 'TypeB', 'SubB', 'es', 'sessionId456');

        expect(result).to.include('c__InstanceId=sessionId456');
        expect(result).to.include('omniscript__type=TypeB');
        expect(result).to.include('omniscript__subType=SubB');
        expect(result).to.include('omniscript__language=es');
        expect(result).to.not.include('https://');
      });

      it('should replace vlocityLWCOmniWrapper with standard path', () => {
        const url = 'https://example.com/vlocityLWCOmniWrapper?c__target=test';
        const result = (migrationTool as any).replaceResumeSessionUrl(url, 'TypeC', 'SubC', 'fr', 'sessionId789');

        expect(result).to.include('/lightning/page/omnistudio/omniscript');
        expect(result).to.not.include('vlocityLWCOmniWrapper');
        expect(result).to.not.include('c__target');
      });

      it('should handle URL with c__target parameter and remove it', () => {
        const url = '/path?c__target=remove&other=keep';
        const result = (migrationTool as any).replaceResumeSessionUrl(url, 'TypeD', 'SubD', 'de', 'sessionIdABC');

        expect(result).to.not.include('c__target');
        expect(result).to.include('other=keep');
      });
    });

    describe('getOmniscriptInstanceFieldKey', () => {
      it('should return namespaced field key for package fields', () => {
        const result = (migrationTool as any).getOmniscriptInstanceFieldKey('Status__c', false);
        expect(result).to.equal('vlocity_ins__Status__c');
      });

      it('should return standard field key when useStandardDataModel is true', () => {
        const result = (migrationTool as any).getOmniscriptInstanceFieldKey('Status__c', true);
        expect(result).to.not.include('vlocity_ins');
      });

      it('should return field as-is if not in mappings', () => {
        const result = (migrationTool as any).getOmniscriptInstanceFieldKey('CustomField__c', false);
        expect(result).to.equal('CustomField__c');
      });
    });

    describe('getQueryFields', () => {
      it('should return field keys for package data model', () => {
        const mockMap = { Field1__c: 'StandardField1', Field2__c: 'StandardField2' };
        const result = (migrationTool as any).getQueryFields(mockMap, false);
        expect(result).to.deep.equal(['Field1__c', 'Field2__c']);
      });

      it('should return mapped values for standard data model', () => {
        const mockMap = { Field1__c: 'StandardField1', Field2__c: 'StandardField2' };
        const result = (migrationTool as any).getQueryFields(mockMap, true);
        expect(result).to.deep.equal(['StandardField1', 'StandardField2']);
      });
    });

    describe('getQueryNamespace', () => {
      it('should return namespace for package data model', () => {
        const result = (migrationTool as any).getQueryNamespace(false);
        expect(result).to.equal('vlocity_ins');
      });

      it('should return empty string for standard data model', () => {
        const result = (migrationTool as any).getQueryNamespace(true);
        expect(result).to.equal('');
      });
    });
  });
});
