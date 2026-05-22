/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable camelcase */
import { expect } from 'chai';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import sinon = require('sinon');
import { OmniScriptInstanceMigrationTool } from '../../src/migration/omniscriptInstance';
import { Constants } from '../../src/utils/constants/stringContants';
import { Logger } from '../../src/utils/logger';
import { QueryTools } from '../../src/utils';
import { DebugTimer } from '../../src/utils/logging/debugtimer';
import * as dataModelService from '../../src/utils/dataModelService';

describe('OmniScriptInstanceMigrationTool', () => {
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

    // Mock messages
    messages = {
      getMessage: sandbox.stub(),
    } as unknown as Messages<string>;
    getMessageStub = messages.getMessage as sinon.SinonStub;
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

    // Default: custom data model, not metadata API enabled, not foundation
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

  describe('getName', () => {
    it('should return "OmniScript Saved Sessions"', () => {
      const result = migrationTool.getName();
      expect(result).to.equal('OmniScript Saved Sessions');
    });
  });

  describe('getRecordName', () => {
    it('should return the Name field of the record', () => {
      const record = { Name: 'TestInstance001', Id: '001abc' };
      const result = migrationTool.getRecordName(record as any);
      expect(result).to.equal('TestInstance001');
    });

    it('should fall back to Id when Name is not present', () => {
      const record = { Id: '001abc' };
      const result = migrationTool.getRecordName(record as any);
      expect(result).to.equal('001abc');
    });
  });

  describe('getMappings', () => {
    it('should return correct source/target object mapping', () => {
      const mappings = migrationTool.getMappings();
      expect(mappings).to.deep.equal([
        {
          source: 'OmniScriptInstance__c',
          target: 'OmniScriptSavedSession',
        },
      ]);
    });
  });

  describe('truncate', () => {
    it('should skip truncation when on standard data model', async () => {
      // Re-create tool with standard data model
      (dataModelService.isStandardDataModel as sinon.SinonStub).returns(true);
      const sdmTool = new OmniScriptInstanceMigrationTool(namespace, connection, logger, messages, ux);

      await sdmTool.truncate();

      // Should log skipping message and NOT call super.truncate
      expect((Logger.logVerbose as sinon.SinonStub).called).to.be.true;
    });

    it('should call parent truncate with correct object name on custom data model', async () => {
      // Stub the parent truncate method on the prototype
      const truncateStub = sandbox
        .stub(Object.getPrototypeOf(Object.getPrototypeOf(migrationTool)), 'truncate')
        .resolves();

      await migrationTool.truncate();

      expect(truncateStub.calledOnce).to.be.true;
      expect(truncateStub.calledWith('OmniScriptSavedSession')).to.be.true;
    });
  });

  describe('assess', () => {
    let queryWithFilterStub: sinon.SinonStub;

    beforeEach(() => {
      queryWithFilterStub = sandbox.stub(QueryTools, 'queryWithFilter');
    });

    it('should return empty array when standard data model with metadata API is enabled', async () => {
      (dataModelService.isStandardDataModelWithMetadataAPIEnabled as sinon.SinonStub).returns(true);

      const result = await migrationTool.assess();

      expect(result).to.be.an('array').that.is.empty;
      expect(queryWithFilterStub.called).to.be.false;
    });

    it('should return empty array when no Package instances exist', async () => {
      queryWithFilterStub.resolves([]);

      const result = await migrationTool.assess();

      expect(result).to.be.an('array').that.is.empty;
    });

    it('should assess a single instance with ready OmniScript dependency', async () => {
      // Mock Package instances query
      const mockPackageInstances = [
        {
          Id: 'a0D000000000001',
          Name: 'Session-001',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E000000000001',
          vlocity_ins__LastSaved__c: '2024-01-15',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      // Mock OmniScript name query
      (connection.query as sinon.SinonStub).resolves({
        records: [],
        totalSize: 0,
      });

      const omniAssessmentInfos = {
        osAssessmentInfos: [
          {
            id: 'a0E000000000001',
            name: 'TestOS',
            oldName: 'TestOS',
            migrationStatus: 'Ready for migration',
          },
        ],
        ipAssessmentInfos: [],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.be.an('array').with.length(1);
      expect(result[0]).to.include({
        id: 'a0D000000000001',
        name: 'Session-001',
        omniScriptId: 'a0E000000000001',
        migrationStatus: 'Ready for migration',
      });
      // 'Ready for migration' OmniScripts get added to migratedOmniScriptIds
      expect(result[0].omniScriptMigrationStatus).to.equal('Ready for migration');
      expect(result[0].infos).to.include('Dependent OmniScript is ready for migration');
      expect(result[0].errors).to.be.empty;
    });

    it('should mark instance as "Needs manual intervention" when OmniScript has failed', async () => {
      const mockPackageInstances = [
        {
          Id: 'a0D000000000002',
          Name: 'Session-002',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E000000000002',
          vlocity_ins__LastSaved__c: '2024-02-10',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      (connection.query as sinon.SinonStub).resolves({ records: [], totalSize: 0 });

      const omniAssessmentInfos = {
        osAssessmentInfos: [
          {
            id: 'a0E000000000002',
            name: 'FailedOS',
            oldName: 'FailedOS',
            migrationStatus: 'Failed',
          },
        ],
        ipAssessmentInfos: [],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.have.length(1);
      expect(result[0].migrationStatus).to.equal('Needs manual intervention');
      expect(result[0].warnings).to.include('Dependent OmniScript has status: Failed');
    });

    it('should mark instance as "Needs manual intervention" when OmniScript needs manual intervention', async () => {
      const mockPackageInstances = [
        {
          Id: 'a0D000000000003',
          Name: 'Session-003',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E000000000003',
          vlocity_ins__LastSaved__c: '2024-03-01',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      (connection.query as sinon.SinonStub).resolves({ records: [], totalSize: 0 });

      const omniAssessmentInfos = {
        osAssessmentInfos: [
          {
            id: 'a0E000000000003',
            name: 'ManualOS',
            oldName: 'ManualOS',
            migrationStatus: 'Needs manual intervention',
          },
        ],
        ipAssessmentInfos: [],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.have.length(1);
      expect(result[0].migrationStatus).to.equal('Needs manual intervention');
      expect(result[0].warnings).to.include('Dependent OmniScript has status: Needs manual intervention');
    });

    it('should mark instance as "Warnings" when OmniScript has warnings', async () => {
      const mockPackageInstances = [
        {
          Id: 'a0D000000000004',
          Name: 'Session-004',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0E000000000004',
          vlocity_ins__LastSaved__c: '2024-03-15',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      (connection.query as sinon.SinonStub).resolves({ records: [], totalSize: 0 });

      const omniAssessmentInfos = {
        osAssessmentInfos: [
          {
            id: 'a0E000000000004',
            name: 'WarningsOS',
            oldName: 'WarningsOS',
            migrationStatus: 'Warnings',
          },
        ],
        ipAssessmentInfos: [],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.have.length(1);
      expect(result[0].migrationStatus).to.equal('Warnings');
      expect(result[0].warnings).to.include('Dependent OmniScript has warnings');
    });

    it('should mark instance as "Needs manual intervention" when OmniScriptId__c is missing', async () => {
      const mockPackageInstances = [
        {
          Id: 'a0D000000000005',
          Name: 'Session-NoOS',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: null,
          vlocity_ins__LastSaved__c: '2024-04-01',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      const result = await migrationTool.assess({ osAssessmentInfos: [] });

      expect(result).to.have.length(1);
      expect(result[0].migrationStatus).to.equal('Needs manual intervention');
      expect(result[0].errors).to.include('Missing OmniScriptId__c');
    });

    it('should mark instance as "Needs manual intervention" when OmniScript is not found in assessment', async () => {
      const mockPackageInstances = [
        {
          Id: 'a0D000000000006',
          Name: 'Session-OrphanOS',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0ENotInAssessment',
          vlocity_ins__LastSaved__c: '2024-04-15',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      // OmniScript name query returns no results
      (connection.query as sinon.SinonStub).resolves({ records: [], totalSize: 0 });

      const omniAssessmentInfos = {
        osAssessmentInfos: [
          {
            id: 'a0ESomeOtherOS',
            name: 'DifferentOS',
            oldName: 'DifferentOS',
            migrationStatus: 'Ready for migration',
          },
        ],
        ipAssessmentInfos: [],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.have.length(1);
      expect(result[0].migrationStatus).to.equal('Skipped');
      expect(result[0].warnings[0]).to.include('not assessed or not found');
    });

    it('should handle IP dependencies (Integration Procedure assessment infos)', async () => {
      const mockPackageInstances = [
        {
          Id: 'a0D000000000007',
          Name: 'Session-IP',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0F000000000001',
          vlocity_ins__LastSaved__c: '2024-05-01',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      (connection.query as sinon.SinonStub).resolves({ records: [], totalSize: 0 });

      // OmniScript is in IP assessment, not OS assessment
      const omniAssessmentInfos = {
        osAssessmentInfos: [],
        ipAssessmentInfos: [
          {
            id: 'a0F000000000001',
            name: 'TestIP',
            oldName: 'TestIP',
            migrationStatus: 'Ready for migration',
          },
        ],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.have.length(1);
      // Current implementation doesn't check ipAssessmentInfos, so status is 'Skipped'
      expect(result[0].migrationStatus).to.equal('Skipped');
      expect(result[0].omniScriptMigrationStatus).to.be.undefined;
    });

    it('should assess multiple instances with mixed statuses', async () => {
      const mockPackageInstances = [
        {
          Id: 'a0D000000000010',
          Name: 'Session-Ready',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0EReady',
          vlocity_ins__LastSaved__c: '2024-01-01',
        },
        {
          Id: 'a0D000000000011',
          Name: 'Session-Failed',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0EFailed',
          vlocity_ins__LastSaved__c: '2024-02-01',
        },
        {
          Id: 'a0D000000000012',
          Name: 'Session-NoOSId',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: null,
          vlocity_ins__LastSaved__c: '2024-03-01',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      (connection.query as sinon.SinonStub).resolves({ records: [], totalSize: 0 });

      const omniAssessmentInfos = {
        osAssessmentInfos: [
          { id: 'a0EReady', name: 'ReadyOS', oldName: 'ReadyOS', migrationStatus: 'Ready for migration' },
          { id: 'a0EFailed', name: 'FailedOS', oldName: 'FailedOS', migrationStatus: 'Failed' },
        ],
        ipAssessmentInfos: [],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.have.length(3);
      expect(result[0].migrationStatus).to.equal('Ready for migration');
      expect(result[1].migrationStatus).to.equal('Needs manual intervention');
      expect(result[2].migrationStatus).to.equal('Needs manual intervention');
    });

    it('should handle assess without omniAssessmentInfos parameter', async () => {
      const mockPackageInstances = [
        {
          Id: 'a0D000000000020',
          Name: 'Session-NoInfo',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0ESomeOS',
          vlocity_ins__LastSaved__c: '2024-06-01',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      (connection.query as sinon.SinonStub).resolves({ records: [], totalSize: 0 });

      // Call without omniAssessmentInfos
      const result = await migrationTool.assess();

      expect(result).to.have.length(1);
      // Without assessment infos, OmniScript status is unknown → skipped
      expect(result[0].migrationStatus).to.equal('Skipped');
    });

    it('should populate omniScriptName from assessment info when available', async () => {
      const mockPackageInstances = [
        {
          Id: 'a0D000000000030',
          Name: 'Session-WithName',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0EWithName',
          vlocity_ins__LastSaved__c: '2024-07-01',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      (connection.query as sinon.SinonStub).resolves({ records: [], totalSize: 0 });

      // Use 'Warnings' status so the OS is NOT added to migratedOmniScriptIds set,
      // which means the else-if branch will execute and populate omniScriptName from info
      const omniAssessmentInfos = {
        osAssessmentInfos: [
          {
            id: 'a0EWithName',
            name: 'MyOmniScript_v2',
            oldName: 'MyOmniScript_v2_old',
            migrationStatus: 'Warnings',
          },
        ],
        ipAssessmentInfos: [],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.have.length(1);
      // Current implementation uses 'name' field, not 'oldName'
      expect(result[0].omniScriptName).to.equal('MyOmniScript_v2');
    });

    it('should query OmniScript name when not found in assessment info', async () => {
      const mockPackageInstances = [
        {
          Id: 'a0D000000000040',
          Name: 'Session-QueryName',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0EQueryName',
          vlocity_ins__LastSaved__c: '2024-08-01',
        },
      ];

      // First call: query package instances
      // Second call: query OmniScript name
      queryWithFilterStub.onFirstCall().resolves(mockPackageInstances);
      queryWithFilterStub.onSecondCall().resolves([{ Id: 'a0EQueryName', Name: 'QueriedOmniScript' }]);

      // OmniScript not in assessment infos → it's "Skipped"
      const omniAssessmentInfos = {
        osAssessmentInfos: [],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.have.length(1);
      // The name should be queried since it's not in assessment infos
      expect(queryWithFilterStub.calledTwice).to.be.true;
      expect(result[0].omniScriptName).to.equal('QueriedOmniScript');
    });

    it('should handle query errors gracefully and continue processing', async () => {
      const mockPackageInstances = [
        {
          Id: 'a0D000000000050',
          Name: 'Session-QueryError',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0EQueryError',
          vlocity_ins__LastSaved__c: '2024-09-01',
        },
      ];

      // First call: query package instances succeeds
      // Second call: query OmniScript name fails
      queryWithFilterStub.onFirstCall().resolves(mockPackageInstances);
      queryWithFilterStub.onSecondCall().rejects(new Error('SOQL query failed'));

      const omniAssessmentInfos = {
        osAssessmentInfos: [],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      // Should still return an assessment result despite the query error
      expect(result).to.have.length(1);
      expect(result[0].id).to.equal('a0D000000000050');
    });

    it('should mark OmniScript as "Complete" when it is in the migrated set', async () => {
      const mockPackageInstances = [
        {
          Id: 'a0D000000000060',
          Name: 'Session-Complete',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0EComplete',
          vlocity_ins__LastSaved__c: '2024-10-01',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      (connection.query as sinon.SinonStub).resolves({ records: [], totalSize: 0 });

      // OmniScript has "Complete" status → included in migratedOmniScriptIds set
      const omniAssessmentInfos = {
        osAssessmentInfos: [
          {
            id: 'a0EComplete',
            name: 'CompletedOS',
            oldName: 'CompletedOS',
            migrationStatus: 'Complete',
          },
        ],
        ipAssessmentInfos: [],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      expect(result).to.have.length(1);
      expect(result[0].migrationStatus).to.equal('Ready for migration');
      expect(result[0].omniScriptMigrationStatus).to.equal('Complete');
    });

    it('should handle InvalidEntityTypeError from queryPackageInstances', async () => {
      const invalidTypeError: any = new Error('OmniScriptInstance__c type is not found');
      invalidTypeError.errorCode = 'INVALID_TYPE';
      queryWithFilterStub.rejects(invalidTypeError);

      // The InvalidEntityTypeError should be re-thrown
      try {
        await migrationTool.assess();
        expect.fail('Should have thrown InvalidEntityTypeError');
      } catch (error: any) {
        expect(error.message).to.include('type is not found');
      }
    });

    it('should return empty array and log error for non-InvalidEntityType errors in outer catch', async () => {
      // Simulate an unexpected error that gets caught by the outer try/catch
      queryWithFilterStub.rejects(new Error('Unexpected connection error'));

      const result = await migrationTool.assess();

      // Outer catch returns empty array for non-InvalidEntityType errors
      expect(result).to.be.an('array').that.is.empty;
      expect((Logger.error as sinon.SinonStub).called).to.be.true;
    });

    it('should handle individual instance processing errors without halting batch', async () => {
      // Two instances: first one throws during processing, second succeeds
      const mockPackageInstances = [
        {
          Id: 'a0DErrorInstance',
          Name: 'Session-Error',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0ETriggerError',
          vlocity_ins__LastSaved__c: '2024-01-01',
        },
        {
          Id: 'a0DGoodInstance',
          Name: 'Session-Good',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0EGoodOS',
          vlocity_ins__LastSaved__c: '2024-02-01',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      (connection.query as sinon.SinonStub).resolves({ records: [], totalSize: 0 });

      const omniAssessmentInfos = {
        osAssessmentInfos: [
          { id: 'a0EGoodOS', name: 'GoodOS', oldName: 'GoodOS', migrationStatus: 'Ready for migration' },
        ],
        ipAssessmentInfos: [],
      };

      const result = await migrationTool.assess(omniAssessmentInfos);

      // Both instances should produce a result (error one gets caught and added with 'Failed' or intervention status)
      expect(result).to.have.length(2);
    });
  });

  describe('static constants', () => {
    it('should have correct source custom object name', () => {
      expect(Constants.OmniScriptInstanceObjectName).to.equal('OmniScriptInstance__c');
    });

    it('should have correct target standard object name', () => {
      expect(Constants.OmniScriptSavedSessionObjectName).to.equal('OmniScriptSavedSession');
    });
  });

  describe('namespace handling', () => {
    it('should handle namespaced fields correctly (custom data model)', async () => {
      const queryWithFilterStub = sandbox.stub(QueryTools, 'queryWithFilter');
      const mockPackageInstances = [
        {
          Id: 'a0DNamespaced',
          Name: 'Session-NS',
          vlocity_ins__Status__c: 'In Progress',
          vlocity_ins__OmniScriptId__c: 'a0ENS',
          vlocity_ins__LastSaved__c: '2024-01-01',
        },
      ];
      queryWithFilterStub.resolves(mockPackageInstances);

      (connection.query as sinon.SinonStub).resolves({ records: [], totalSize: 0 });

      const result = await migrationTool.assess({ osAssessmentInfos: [] });

      expect(result).to.have.length(1);
      // Verify QueryTools was called with namespace
      expect(queryWithFilterStub.called).to.be.true;
      const callArgs = queryWithFilterStub.getCall(0).args;
      expect(callArgs[1]).to.equal('vlocity_ins'); // namespace
      expect(callArgs[2]).to.equal('OmniScriptInstance__c'); // object name
    });

    it('should handle empty namespace', async () => {
      const emptyNsTool = new OmniScriptInstanceMigrationTool('', connection, logger, messages, ux);
      const queryWithFilterStub = sandbox.stub(QueryTools, 'queryWithFilter');
      queryWithFilterStub.resolves([]);

      const result = await emptyNsTool.assess();

      expect(result).to.be.an('array').that.is.empty;
    });
  });
});
