/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import sinon = require('sinon');
import { SpecialCharacterRecordCleanupService } from '../../../src/utils/config/SpecialCharacterRecordCleanupService';
import { Logger } from '../../../src/utils/logger';
import { QueryTools } from '../../../src/utils/query';
import { NetUtils } from '../../../src/utils/net';

describe('SpecialCharacterRecordCleanupService', () => {
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
    connection = {
      sobject: sandbox.stub().returns({ delete: sobjectDeleteStub }),
    } as unknown as Connection;

    messages = {
      getMessage: sandbox.stub().callsFake((key: string, args?: unknown[]) => `${key}:${args?.join(',') ?? ''}`),
    } as unknown as Messages<string>;

    ux = {} as Ux;

    loggerLogStub = sandbox.stub(Logger, 'log');
    loggerErrorStub = sandbox.stub(Logger, 'error');
    queryStub = sandbox.stub(QueryTools, 'query');
    netUtilsRequestStub = sandbox.stub(NetUtils, 'request').resolves({});
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('constructor', () => {
    it('should initialize with connection and messages', () => {
      const service = new SpecialCharacterRecordCleanupService(connection, messages, ux);
      expect(service).to.be.instanceOf(SpecialCharacterRecordCleanupService);
    });
  });

  describe('deactivateAndDelete', () => {
    let service: SpecialCharacterRecordCleanupService;
    // Fake timers let sleep()'s real setTimeout fire instantly under test control,
    // so we exercise the real code path without waiting 5 seconds.
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      service = new SpecialCharacterRecordCleanupService(connection, messages, ux);
      clock = sandbox.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    it('should log section start and no-records message for each entity when no special character records are found', async () => {
      // Arrange
      queryStub.resolves([]);

      // Act
      await service.deactivateAndDelete();

      // Assert
      expect(queryStub.callCount).to.equal(4); // one query per entity config
      expect(netUtilsRequestStub.called).to.be.false;
      expect(sobjectDeleteStub.called).to.be.false;
      // 1 phaseStart + each of 4 entities logs: sectionStart + noSpecialCharRecords = 9 total
      expect(loggerLogStub.callCount).to.equal(9);
      expect(loggerErrorStub.called).to.be.false;
    });

    it('should only delete records that have special characters and ignore clean records', async () => {
      // Arrange: OmniScript entity has one clean and one special-char record
      queryStub.onFirstCall().resolves([
        { Id: 'clean-id', IsActive: false, Type: 'CleanType', SubType: 'CleanSub' },
        { Id: 'bad-id', IsActive: false, Type: 'Type@Special', SubType: 'Clean' },
      ]);
      queryStub.resolves([]);

      // Act
      await service.deactivateAndDelete();

      // Assert: only the special-char record is deleted
      expect(sobjectDeleteStub.calledOnce).to.be.true;
      expect(sobjectDeleteStub.firstCall.args[0]).to.equal('bad-id');
      expect(netUtilsRequestStub.called).to.be.false; // record is inactive
    });

    it('should deactivate active records one at a time before deleting all records', async () => {
      // Arrange: FlexCard entity (index 2) has 1 active + 1 inactive record with special chars
      queryStub.onCall(2).resolves([
        { Id: 'active-id', IsActive: true, Name: 'Card@Special', AuthorName: 'Author' },
        { Id: 'inactive-id', IsActive: false, Name: 'Card#Bad', AuthorName: 'Author' },
      ]);
      queryStub.resolves([]);

      // Act: start method, advance fake clock past the 5-second sleep, then await completion
      const pending = service.deactivateAndDelete();
      await clock.tickAsync(6000);
      await pending;

      // Assert: only the active record is deactivated; both are deleted
      expect(netUtilsRequestStub.calledOnce).to.be.true;
      expect(netUtilsRequestStub.firstCall.args[1]).to.include('active-id');
      expect(sobjectDeleteStub.callCount).to.equal(2);
    });

    it('should skip deactivation and delete directly when all special-char records are inactive', async () => {
      // Arrange: 2 inactive records with special chars in OmniScript entity
      queryStub.onFirstCall().resolves([
        { Id: 'id1', IsActive: false, Type: 'Bad@Type', SubType: 'Sub' },
        { Id: 'id2', IsActive: false, Type: 'Another#Bad', SubType: 'Sub' },
      ]);
      queryStub.resolves([]);

      // Act
      await service.deactivateAndDelete();

      // Assert: no deactivation (and thus no sleep), direct deletion of both records
      expect(netUtilsRequestStub.called).to.be.false;
      expect(sobjectDeleteStub.callCount).to.equal(2);
    });

    it('should catch and log error when an entity query fails, and continue processing remaining entities', async () => {
      // Arrange: first entity throws; rest succeed with no records
      queryStub.onFirstCall().rejects(new Error('Query failed'));
      queryStub.resolves([]);

      // Act
      await service.deactivateAndDelete();

      // Assert: error logged, all 4 entities still attempted
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(queryStub.callCount).to.equal(4);
    });

    it('should query all 4 entity types: OmniScript, Integration Procedure, FlexCard, DataMapper', async () => {
      // Arrange
      queryStub.resolves([]);

      // Act
      await service.deactivateAndDelete();

      // Assert: OmniProcess queried twice (OmniScript + IP share same object)
      const queriedObjects = queryStub.args.map((a) => a[1] as string);
      expect(queriedObjects.filter((o) => o === 'OmniProcess')).to.have.length(2);
      expect(queriedObjects.filter((o) => o === 'OmniUiCard')).to.have.length(1);
      expect(queriedObjects.filter((o) => o === 'OmniDataTransform')).to.have.length(1);
    });

    it('should detect special characters in SubType field for OmniScript records', async () => {
      // Arrange: special character in SubType (not Type)
      queryStub
        .onFirstCall()
        .resolves([{ Id: 'subtype-bad-id', IsActive: false, Type: 'CleanType', SubType: 'Sub@Type' }]);
      queryStub.resolves([]);

      // Act
      await service.deactivateAndDelete();

      // Assert: record with special char in SubType is deleted
      expect(sobjectDeleteStub.calledOnce).to.be.true;
      expect(sobjectDeleteStub.firstCall.args[0]).to.equal('subtype-bad-id');
    });

    it('should detect special characters in the Name field for DataMapper records', async () => {
      // Arrange: DataMapper (index 3) has special char in Name field
      queryStub.onCall(3).resolves([{ Id: 'dm-bad-id', IsActive: false, Name: 'DataMapper@Name' }]);
      queryStub.resolves([]);

      // Act
      await service.deactivateAndDelete();

      // Assert: DataMapper record with special char in Name is deleted
      expect(sobjectDeleteStub.calledOnce).to.be.true;
      expect(sobjectDeleteStub.firstCall.args[0]).to.equal('dm-bad-id');
    });

    it('should detect special characters in Name or AuthorName fields for FlexCard records', async () => {
      // Arrange: FlexCard (index 2) has special char in AuthorName
      queryStub
        .onCall(2)
        .resolves([{ Id: 'fc-bad-id', IsActive: false, Name: 'CleanCard', AuthorName: 'Author@Name' }]);
      queryStub.resolves([]);

      // Act
      await service.deactivateAndDelete();

      // Assert: FlexCard record with special char in AuthorName is deleted
      expect(sobjectDeleteStub.calledOnce).to.be.true;
      expect(sobjectDeleteStub.firstCall.args[0]).to.equal('fc-bad-id');
    });

    it('should delete multiple records across different entities when each has special characters', async () => {
      // Arrange: OmniScript (index 0) and DataMapper (index 3) both have special-char records
      queryStub.onCall(0).resolves([{ Id: 'os-id', IsActive: false, Type: 'Type@1', SubType: 'Sub' }]);
      queryStub.onCall(3).resolves([{ Id: 'dm-id', IsActive: false, Name: 'Name#Bad' }]);
      queryStub.resolves([]);

      // Act
      await service.deactivateAndDelete();

      // Assert: records from both entities deleted
      expect(sobjectDeleteStub.callCount).to.equal(2);
      const deletedIds = [sobjectDeleteStub.firstCall.args[0], sobjectDeleteStub.secondCall.args[0]];
      expect(deletedIds).to.include('os-id');
      expect(deletedIds).to.include('dm-id');
    });

    it('should log error with record name when deactivation of a single record fails, and exclude it from deletion', async () => {
      // Arrange: OmniScript has 1 active record with Language; deactivation throws
      queryStub.onFirstCall().resolves([
        {
          Id: 'fail-active-id',
          IsActive: true,
          Type: 'Type@Bad',
          SubType: 'Sub',
          Language: 'English',
          VersionNumber: 1,
        },
      ]);
      queryStub.resolves([]);
      netUtilsRequestStub.rejects(new Error('UNKNOWN_ERROR'));

      // Act: sleep is still called after the deactivation loop, so advance the clock
      const pending = service.deactivateAndDelete();
      await clock.tickAsync(6000);
      await pending;

      // Assert: error logged with UniqueName-style label (Type_SubType_Language_Version), not raw ID
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.include(
        'Type: Type@Bad, SubType: Sub, Language: English, Version: 1'
      );
      expect(sobjectDeleteStub.called).to.be.false;
    });

    it('should log error with record name when deletion of a single record fails, and continue with remaining', async () => {
      // Arrange: two inactive OmniScript records with Language; first delete throws, second succeeds
      queryStub.onFirstCall().resolves([
        {
          Id: 'fail-delete-id',
          IsActive: false,
          Type: 'Type@1',
          SubType: 'Sub',
          Language: 'English',
          VersionNumber: 2,
        },
        { Id: 'ok-delete-id', IsActive: false, Type: 'Type#2', SubType: 'Sub', Language: 'English', VersionNumber: 3 },
      ]);
      queryStub.resolves([]);
      sobjectDeleteStub.onFirstCall().rejects(new Error('Delete failed'));
      sobjectDeleteStub.onSecondCall().resolves();

      // Act
      await service.deactivateAndDelete();

      // Assert: both deletes attempted; error logged with UniqueName-style label (Type_SubType_Language_Version)
      expect(sobjectDeleteStub.callCount).to.equal(2);
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.include('Type: Type@1, SubType: Sub, Language: English, Version: 2');
    });
  });

  describe('assess', () => {
    let service: SpecialCharacterRecordCleanupService;

    beforeEach(() => {
      service = new SpecialCharacterRecordCleanupService(connection, messages, ux);
    });

    it('should return an empty map per entity when no special character records exist', async () => {
      // Arrange: all four entity queries return empty arrays
      queryStub.resolves([]);

      // Act
      const result = await service.assess();

      // Assert: map has entries for all entities, each with an empty array
      expect(result.size).to.equal(4);
      for (const records of result.values()) {
        expect(records).to.have.length(0);
      }
      // No deactivation or deletion should have happened
      expect(netUtilsRequestStub.called).to.be.false;
      expect(sobjectDeleteStub.called).to.be.false;
    });

    it('should return records with special characters for each entity without modifying them', async () => {
      // Arrange: OmniScript entity returns one record with special char in Type
      const specialCharRecord = {
        Id: 'a01',
        IsActive: true,
        Type: 'Test#1',
        SubType: 'Sub',
        Language: 'English',
        VersionNumber: 1,
      };
      queryStub.onFirstCall().resolves([specialCharRecord]); // OmniScript
      queryStub.onSecondCall().resolves([]); // IntegrationProcedure
      queryStub.onThirdCall().resolves([]); // FlexCard
      queryStub.resolves([]); // DataMapper

      // Act
      const result = await service.assess();

      // Assert: OmniScript entry has one record; no API calls made
      expect(result.get('OmniScript')).to.have.length(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result.get('OmniScript')![0]).to.deep.include({ Id: 'a01' });
      expect(netUtilsRequestStub.called).to.be.false;
      expect(sobjectDeleteStub.called).to.be.false;
    });

    it('should return empty array for an entity when its query throws', async () => {
      // Arrange: first query (OmniScript) throws
      queryStub.onFirstCall().rejects(new Error('Query failed'));
      queryStub.resolves([]);

      // Act
      const result = await service.assess();

      // Assert: OmniScript returns empty array; error logged; other entities still processed
      expect(result.get('OmniScript')).to.deep.equal([]);
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(result.size).to.equal(4);
    });
  });
});
