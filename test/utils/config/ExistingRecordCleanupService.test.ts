/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import sinon = require('sinon');
import { ExistingRecordCleanupService } from '../../../src/utils/config/ExistingRecordCleanupService';
import { Logger } from '../../../src/utils/logger';
import { NetUtils } from '../../../src/utils/net';

// ENTITY_CONFIGS order in ExistingRecordCleanupService:
//   0: OmniScriptConfig       → OmniProcess  (OmniScript)
//   1: OmniIntegrationProcConfig → OmniProcess (Integration Procedure)
//   2: OmniDataTransformConfig  → OmniDataTransform (DataMapper)
//   3: OmniUiCardConfig         → OmniUiCard  (FlexCard)

describe('ExistingRecordCleanupService', () => {
  let connection: Connection;
  let messages: Messages<string>;
  let ux: Ux;
  let sandbox: sinon.SinonSandbox;
  let loggerLogStub: sinon.SinonStub;
  let loggerErrorStub: sinon.SinonStub;
  let queryStub: sinon.SinonStub;
  let netUtilsRequestStub: sinon.SinonStub;
  let sobjectDeleteStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    sobjectDeleteStub = sandbox.stub().resolves();
    queryStub = sandbox.stub();
    connection = {
      query: queryStub,
      sobject: sandbox.stub().returns({ delete: sobjectDeleteStub }),
    } as unknown as Connection;

    messages = {
      getMessage: sandbox.stub().callsFake((key: string, args?: unknown[]) => `${key}:${args?.join(',') ?? ''}`),
    } as unknown as Messages<string>;

    ux = {} as Ux;

    loggerLogStub = sandbox.stub(Logger, 'log');
    loggerErrorStub = sandbox.stub(Logger, 'error');
    netUtilsRequestStub = sandbox.stub(NetUtils, 'request').resolves({});

    // Default: all config table queries return empty
    queryStub.resolves({ records: [] });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('constructor', () => {
    it('should initialize with connection and messages', () => {
      const service = new ExistingRecordCleanupService(connection, messages, ux);
      expect(service).to.be.instanceOf(ExistingRecordCleanupService);
    });
  });

  describe('cleanAll', () => {
    let service: ExistingRecordCleanupService;
    // Fake timers let sleep()'s real setTimeout fire instantly under test control,
    // so we exercise the real code path without waiting 5 seconds.
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      service = new ExistingRecordCleanupService(connection, messages, ux);
      clock = sandbox.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    it('should not delete anything and log cleanup complete when all config tables are empty', async () => {
      // Arrange: default stub returns empty for all config tables

      // Act
      await service.cleanAll();

      // Assert
      expect(sobjectDeleteStub.called).to.be.false;
      expect(netUtilsRequestStub.called).to.be.false;
      const logMessages = loggerLogStub.args.map((a) => a[0] as string);
      expect(logMessages.some((m) => m.includes('nullUniqueNameCleanupPhaseStart'))).to.be.true;
    });

    it('should find and delete orphan OmniScript records with UniqueName = null', async () => {
      // Arrange: OmniScriptConfig has a deployed developer name; OmniProcess has a matching orphan
      queryStub.callsFake((soql: string) => {
        if (soql.includes('OmniScriptConfig')) {
          return Promise.resolve({ records: [{ DeveloperName: 'TestType_Default_English_1' }] });
        }
        if (soql.includes('OmniProcess') && soql.includes('UniqueName = null')) {
          return Promise.resolve({ records: [{ Id: 'orphan-id', IsActive: false }] });
        }
        return Promise.resolve({ records: [] });
      });

      // Act — no active records, no sleep needed
      await service.cleanAll();

      // Assert
      expect(sobjectDeleteStub.calledOnce).to.be.true;
      expect(sobjectDeleteStub.firstCall.args[0]).to.equal('orphan-id');
      expect(netUtilsRequestStub.called).to.be.false; // record is inactive, no deactivation needed
    });

    it('should deactivate active orphan records before deleting them', async () => {
      // Arrange: DataMapper config has a developer name; orphan record is active
      queryStub.callsFake((soql: string) => {
        if (soql.includes('OmniDataTransformConfig')) {
          return Promise.resolve({ records: [{ DeveloperName: 'MapperName_1' }] });
        }
        if (soql.includes('OmniDataTransform') && soql.includes('UniqueName = null')) {
          return Promise.resolve({ records: [{ Id: 'active-orphan-id', IsActive: true }] });
        }
        return Promise.resolve({ records: [] });
      });

      // Act: start cleanAll, advance fake clock past the 5-second sleep, then await completion
      const pending = service.cleanAll();
      await clock.tickAsync(6000);
      await pending;

      // Assert: active record deactivated first, then deleted
      expect(netUtilsRequestStub.calledOnce).to.be.true;
      expect(netUtilsRequestStub.firstCall.args[1]).to.include('active-orphan-id');
      expect(sobjectDeleteStub.calledOnce).to.be.true;
    });

    it('should exclude a record from deletion when its deactivation fails', async () => {
      // Arrange: active orphan OmniScript record; deactivation call throws
      queryStub.callsFake((soql: string) => {
        if (soql.includes('OmniScriptConfig')) {
          return Promise.resolve({ records: [{ DeveloperName: 'TestType_Default_English_1' }] });
        }
        if (soql.includes('OmniProcess') && soql.includes('UniqueName = null')) {
          // selectFields now includes Type, SubType, Language, VersionNumber for human-readable labels
          return Promise.resolve({
            records: [
              {
                Id: 'fail-deactivate-id',
                IsActive: true,
                Type: 'TestType',
                SubType: 'Default',
                Language: 'English',
                VersionNumber: 1,
              },
            ],
          });
        }
        return Promise.resolve({ records: [] });
      });
      netUtilsRequestStub.rejects(new Error('UNKNOWN_ERROR'));

      // Act: sleep is still called (after the deactivation loop), so advance the clock
      const pending = service.cleanAll();
      await clock.tickAsync(6000);
      await pending;

      // Assert: error logged with UniqueName-style label (Type_SubType_Language_Version)
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.include(
        'Type: TestType, SubType: Default, Language: English, Version: 1'
      );
      expect(sobjectDeleteStub.called).to.be.false;
    });

    it('should log error per record but continue deleting remaining records when an individual delete fails', async () => {
      // Arrange: two orphan OmniScript records; first delete throws, second succeeds
      queryStub.callsFake((soql: string) => {
        if (soql.includes('OmniScriptConfig')) {
          return Promise.resolve({ records: [{ DeveloperName: 'TestType_Default_English_1' }] });
        }
        if (soql.includes('OmniProcess') && soql.includes('UniqueName = null')) {
          // selectFields now includes Type, SubType, Language, VersionNumber for human-readable labels
          return Promise.resolve({
            records: [
              {
                Id: 'fail-id',
                IsActive: false,
                Type: 'TestType',
                SubType: 'Default',
                Language: 'English',
                VersionNumber: 1,
              },
              {
                Id: 'success-id',
                IsActive: false,
                Type: 'TestType',
                SubType: 'Default',
                Language: 'English',
                VersionNumber: 2,
              },
            ],
          });
        }
        return Promise.resolve({ records: [] });
      });
      sobjectDeleteStub.onFirstCall().rejects(new Error('Delete failed'));
      sobjectDeleteStub.onSecondCall().resolves();

      // Act — no active records, no sleep needed
      await service.cleanAll();

      // Assert: both deletes attempted; error logged with UniqueName-style label (Type_SubType_Language_Version)
      expect(sobjectDeleteStub.callCount).to.equal(2);
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.include(
        'Type: TestType, SubType: Default, Language: English, Version: 1'
      );
    });

    it('should paginate through batches when config table has more records than the batch size', async () => {
      // Arrange: first OmniScriptConfig batch is full (50 records), second has 1
      const firstBatch = Array.from({ length: 50 }, (_, i) => ({
        DeveloperName: `TestType_Default_English_${i + 1}`,
      }));
      let omniScriptConfigCallCount = 0;

      queryStub.callsFake((soql: string) => {
        if (soql.includes('OmniScriptConfig')) {
          omniScriptConfigCallCount++;
          if (omniScriptConfigCallCount === 1) return Promise.resolve({ records: firstBatch });
          if (omniScriptConfigCallCount === 2)
            return Promise.resolve({ records: [{ DeveloperName: 'TestType_Default_English_51' }] });
          return Promise.resolve({ records: [] });
        }
        return Promise.resolve({ records: [] }); // no orphan records
      });

      // Act — no active records in any batch, no sleep needed
      await service.cleanAll();

      // Assert: config table queried twice to exhaust the batches
      expect(omniScriptConfigCallCount).to.equal(2);
    });

    it('should skip developer names that cannot be parsed and not query for orphan records', async () => {
      // Arrange: OmniScriptConfig returns malformed developer names (< 4 parts required)
      queryStub.callsFake((soql: string) => {
        if (soql.includes('OmniScriptConfig')) {
          return Promise.resolve({
            records: [
              { DeveloperName: 'TooShort_1' }, // only 2 parts — invalid
              { DeveloperName: 'AlsoInvalid' }, // only 1 part — invalid
            ],
          });
        }
        return Promise.resolve({ records: [] });
      });

      // Act
      await service.cleanAll();

      // Assert: no orphan-record queries issued, nothing deleted
      const orphanQueries = queryStub.args.filter((a) => (a[0] as string).includes('UniqueName = null'));
      expect(orphanQueries).to.have.length(0);
      expect(sobjectDeleteStub.called).to.be.false;
    });

    it('should process Integration Procedure orphan records using IntegrationProcedure config', async () => {
      // Arrange: IntegrationProcedure developer name format is same as OmniScript (Type_Sub_Lang_Version)
      queryStub.callsFake((soql: string) => {
        if (soql.includes('OmniIntegrationProcConfig')) {
          return Promise.resolve({ records: [{ DeveloperName: 'IPType_Default_English_1' }] });
        }
        if (soql.includes('IsIntegrationProcedure = true') && soql.includes('UniqueName = null')) {
          return Promise.resolve({ records: [{ Id: 'ip-orphan-id', IsActive: false }] });
        }
        return Promise.resolve({ records: [] });
      });

      // Act — inactive record, no sleep needed
      await service.cleanAll();

      // Assert
      expect(sobjectDeleteStub.calledOnce).to.be.true;
      expect(sobjectDeleteStub.firstCall.args[0]).to.equal('ip-orphan-id');
    });

    it('should log nullUniqueNameCleanupPhaseStart once before processing all entities', async () => {
      // Arrange: default — all config tables empty

      // Act
      await service.cleanAll();

      // Assert: phase header logged exactly once at the start
      const logMessages = loggerLogStub.args.map((a) => a[0] as string);
      expect(logMessages.filter((m) => m.includes('nullUniqueNameCleanupPhaseStart'))).to.have.length(1);
    });

    it('should log noNullUniqueNameRecords when config has developer names but no orphan records are found', async () => {
      // Arrange: config table has dev names but the main object query returns no UniqueName=null records
      queryStub.callsFake((soql: string) => {
        if (soql.includes('OmniDataTransformConfig')) {
          return Promise.resolve({ records: [{ DeveloperName: 'MapperName_1' }] });
        }
        // Main object query returns empty — no orphan records for this mapper
        return Promise.resolve({ records: [] });
      });

      // Act
      await service.cleanAll();

      // Assert: noNullUniqueNameRecords is logged since no orphan records matched
      const logMessages = loggerLogStub.args.map((a) => a[0] as string);
      expect(logMessages.some((m) => m.includes('noNullUniqueNameRecords'))).to.be.true;
      expect(sobjectDeleteStub.called).to.be.false;
    });

    it('should find and delete orphan FlexCard records using Name and AuthorName fields', async () => {
      // Arrange: OmniUiCardConfig has a dev name in Name_AuthorName_Version format
      queryStub.callsFake((soql: string) => {
        if (soql.includes('OmniUiCardConfig')) {
          return Promise.resolve({ records: [{ DeveloperName: 'MyCard_Admin_1' }] });
        }
        if (soql.includes('OmniUiCard') && soql.includes('UniqueName = null')) {
          return Promise.resolve({ records: [{ Id: 'flexcard-orphan-id', IsActive: false }] });
        }
        return Promise.resolve({ records: [] });
      });

      // Act — inactive record, no sleep needed
      await service.cleanAll();

      // Assert: FlexCard orphan deleted; SOQL uses both Name and AuthorName filters
      expect(sobjectDeleteStub.calledOnce).to.be.true;
      expect(sobjectDeleteStub.firstCall.args[0]).to.equal('flexcard-orphan-id');
      const flexcardSoql = (
        queryStub.args.find((a: string[]) => a[0].includes('OmniUiCard') && a[0].includes('UniqueName = null')) as
          | string[]
          | undefined
      )?.[0];
      expect(flexcardSoql).to.not.be.undefined;
      expect(flexcardSoql).to.include("Name = 'MyCard'");
      expect(flexcardSoql).to.include("AuthorName = 'Admin'");
    });

    it('should correctly parse DataMapper developer name with underscores in the name portion', async () => {
      // Arrange: DeveloperName has underscores in the name — last underscore splits name/version
      // e.g. 'Complex_Mapper_Name_2' → mapKey = 'Complex_Mapper_Name', version = 2
      queryStub.callsFake((soql: string) => {
        if (soql.includes('OmniDataTransformConfig')) {
          return Promise.resolve({ records: [{ DeveloperName: 'Complex_Mapper_Name_2' }] });
        }
        if (soql.includes('OmniDataTransform') && soql.includes('UniqueName = null')) {
          return Promise.resolve({ records: [{ Id: 'complex-dm-orphan', IsActive: false }] });
        }
        return Promise.resolve({ records: [] });
      });

      // Act — inactive record, no sleep needed
      await service.cleanAll();

      // Assert: SOQL uses the full name portion as the Name filter
      const dmSoql = (
        queryStub.args.find(
          (a: string[]) => a[0].includes('OmniDataTransform') && a[0].includes('UniqueName = null')
        ) as string[] | undefined
      )?.[0];
      expect(dmSoql).to.not.be.undefined;
      expect(dmSoql).to.include("Name = 'Complex_Mapper_Name'");
      expect(sobjectDeleteStub.calledOnce).to.be.true;
    });
  });

  describe('assess', () => {
    let service: ExistingRecordCleanupService;

    beforeEach(() => {
      service = new ExistingRecordCleanupService(connection, messages, ux);
    });

    it('should return empty arrays for all entities when config tables are empty', async () => {
      // Arrange: all config table queries return no developer names
      queryStub.resolves({ records: [] });

      // Act
      const result = await service.assess();

      // Assert: map contains all 4 entities with empty arrays
      expect(result.size).to.equal(4);
      for (const records of result.values()) {
        expect(records).to.have.length(0);
      }
      // No deactivation or deletion
      expect(netUtilsRequestStub.called).to.be.false;
      expect(sobjectDeleteStub.called).to.be.false;
    });

    it('should return orphan records without deactivating or deleting them', async () => {
      // Arrange: OmniScriptConfig has one developer name → orphan OmniScript record found
      queryStub.callsFake((soql: string) => {
        if (soql.includes('OmniScriptConfig')) {
          return Promise.resolve({ records: [{ DeveloperName: 'TestType_TestSub_English_1' }] });
        }
        if (soql.includes('OmniProcess') && soql.includes('UniqueName = null')) {
          return Promise.resolve({
            records: [
              {
                Id: 'orphan-os-id',
                IsActive: false,
                Type: 'TestType',
                SubType: 'TestSub',
                Language: 'English',
                VersionNumber: 1,
              },
            ],
          });
        }
        return Promise.resolve({ records: [] });
      });

      // Act
      const result = await service.assess();

      // Assert: OmniScript entry contains the orphan record; no mutations
      const osRecords = result.get('OmniScript') ?? [];
      expect(osRecords).to.have.length(1);
      expect(osRecords[0].Id).to.equal('orphan-os-id');
      expect(netUtilsRequestStub.called).to.be.false;
      expect(sobjectDeleteStub.called).to.be.false;
    });

    it('should accumulate orphan records across multiple batches per entity', async () => {
      // Arrange: OmniScriptConfig returns exactly BATCH_SIZE (50) names in the first page → triggers second page
      const firstBatch = Array.from({ length: 50 }, (_, i) => ({ DeveloperName: `Type_Sub_English_${i + 1}` }));
      const secondBatch: Array<{ DeveloperName: string }> = [];

      queryStub.callsFake((soql: string) => {
        if (soql.includes('OmniScriptConfig') && soql.includes('OFFSET 0')) {
          return Promise.resolve({ records: firstBatch });
        }
        if (soql.includes('OmniScriptConfig') && soql.includes('OFFSET 50')) {
          return Promise.resolve({ records: secondBatch });
        }
        if (soql.includes('OmniProcess') && soql.includes('UniqueName = null')) {
          return Promise.resolve({ records: [{ Id: 'batch-orphan', IsActive: false }] });
        }
        return Promise.resolve({ records: [] });
      });

      // Act
      const result = await service.assess();

      // Assert: records from the first batch's matching query are returned
      const osRecords = result.get('OmniScript') ?? [];
      expect(osRecords.length).to.be.greaterThan(0);
      expect(netUtilsRequestStub.called).to.be.false;
      expect(sobjectDeleteStub.called).to.be.false;
    });
  });
});
