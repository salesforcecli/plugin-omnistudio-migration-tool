import { expect } from '@salesforce/command/lib/test';
import sinon = require('sinon');
import { StorageUtil } from '../../src/utils/storageUtil';
import { OmniScriptStorage, FlexcardStorage } from '../../src/migration/interfaces';
import { Logger } from '../../src/utils/logger';

describe('StorageUtil', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Reset storage instances to ensure clean state between tests
    // Since these are static properties, we need to reset them
    const migrationStorage = StorageUtil.getOmnistudioMigrationStorage();
    migrationStorage.osStorage.clear();
    migrationStorage.fcStorage.clear();

    const assessmentStorage = StorageUtil.getOmnistudioAssessmentStorage();
    assessmentStorage.osStorage.clear();
    assessmentStorage.fcStorage.clear();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getOmnistudioMigrationStorage', () => {
    it('should return migration storage with initialized Maps', () => {
      // Act
      const storage = StorageUtil.getOmnistudioMigrationStorage();

      // Assert
      expect(storage).to.be.an('object');
      expect(storage.osStorage).to.be.instanceOf(Map);
      expect(storage.fcStorage).to.be.instanceOf(Map);
      expect(storage.osStorage.size).to.equal(0);
      expect(storage.fcStorage.size).to.equal(0);
    });

    it('should return the same instance on multiple calls', () => {
      // Act
      const storage1 = StorageUtil.getOmnistudioMigrationStorage();
      const storage2 = StorageUtil.getOmnistudioMigrationStorage();

      // Assert
      expect(storage1).to.equal(storage2);
      expect(storage1.osStorage).to.equal(storage2.osStorage);
      expect(storage1.fcStorage).to.equal(storage2.fcStorage);
    });

    it('should handle undefined osStorage by initializing a new Map', () => {
      // Arrange
      const storage = StorageUtil.getOmnistudioMigrationStorage();
      // Simulate undefined osStorage
      (storage as unknown as { osStorage: undefined }).osStorage = undefined;

      // Act
      const result = StorageUtil.getOmnistudioMigrationStorage();

      // Assert
      expect(result.osStorage).to.be.instanceOf(Map);
      expect(result.osStorage.size).to.equal(0);
    });

    it('should handle undefined fcStorage by initializing a new Map', () => {
      // Arrange
      const storage = StorageUtil.getOmnistudioMigrationStorage();
      // Simulate undefined fcStorage
      (storage as unknown as { fcStorage: undefined }).fcStorage = undefined;

      // Act
      const result = StorageUtil.getOmnistudioMigrationStorage();

      // Assert
      expect(result.fcStorage).to.be.instanceOf(Map);
      expect(result.fcStorage.size).to.equal(0);
    });

    it('should preserve existing data when storage maps are not undefined', () => {
      // Arrange
      const storage = StorageUtil.getOmnistudioMigrationStorage();
      const osData: OmniScriptStorage = {
        type: 'TestType',
        subtype: 'TestSubtype',
        language: 'English',
        isDuplicate: false,
        migrationSuccess: true,
      };
      const fcData: FlexcardStorage = {
        name: 'TestFlexcard',
        isDuplicate: false,
        migrationSuccess: true,
      };

      storage.osStorage.set('test-os', osData);
      storage.fcStorage.set('test-fc', fcData);

      // Act
      const result = StorageUtil.getOmnistudioMigrationStorage();

      // Assert
      expect(result.osStorage.get('test-os')).to.deep.equal(osData);
      expect(result.fcStorage.get('test-fc')).to.deep.equal(fcData);
    });
  });

  describe('getOmnistudioAssessmentStorage', () => {
    it('should return assessment storage with initialized Maps', () => {
      // Act
      const storage = StorageUtil.getOmnistudioAssessmentStorage();

      // Assert
      expect(storage).to.be.an('object');
      expect(storage.osStorage).to.be.instanceOf(Map);
      expect(storage.fcStorage).to.be.instanceOf(Map);
    });

    it('should return the same instance on multiple calls', () => {
      // Act
      const storage1 = StorageUtil.getOmnistudioAssessmentStorage();
      const storage2 = StorageUtil.getOmnistudioAssessmentStorage();

      // Assert
      expect(storage1).to.equal(storage2);
      expect(storage1.osStorage).to.equal(storage2.osStorage);
      expect(storage1.fcStorage).to.equal(storage2.fcStorage);
    });

    it('should return different instance from migration storage', () => {
      // Act
      const migrationStorage = StorageUtil.getOmnistudioMigrationStorage();
      const assessmentStorage = StorageUtil.getOmnistudioAssessmentStorage();

      // Assert
      expect(migrationStorage).to.not.equal(assessmentStorage);
      expect(migrationStorage.osStorage).to.not.equal(assessmentStorage.osStorage);
      expect(migrationStorage.fcStorage).to.not.equal(assessmentStorage.fcStorage);
    });
  });

  describe('storage modification and retrieval', () => {
    it('should return updated values after modifying osStorage', () => {
      // Arrange
      const storage = StorageUtil.getOmnistudioMigrationStorage();
      const osData: OmniScriptStorage = {
        type: 'ModifiedType',
        subtype: 'ModifiedSubtype',
        language: 'Spanish',
        isDuplicate: true,
        migrationSuccess: false,
        error: ['Migration failed'],
      };

      // Act
      storage.osStorage.set('modified-os', osData);
      const retrievedStorage = StorageUtil.getOmnistudioMigrationStorage();

      // Assert
      expect(retrievedStorage.osStorage.get('modified-os')).to.deep.equal(osData);
      expect(retrievedStorage.osStorage.has('modified-os')).to.be.true;
    });

    it('should return updated values after modifying fcStorage', () => {
      // Arrange
      const storage = StorageUtil.getOmnistudioMigrationStorage();
      const fcData: FlexcardStorage = {
        name: 'ModifiedFlexcard',
        isDuplicate: true,
        migrationSuccess: false,
        error: ['Flexcard migration failed'],
      };

      // Act
      storage.fcStorage.set('modified-fc', fcData);
      const retrievedStorage = StorageUtil.getOmnistudioMigrationStorage();

      // Assert
      expect(retrievedStorage.fcStorage.get('modified-fc')).to.deep.equal(fcData);
      expect(retrievedStorage.fcStorage.has('modified-fc')).to.be.true;
    });

    it('should handle multiple entries in storage maps', () => {
      // Arrange
      const storage = StorageUtil.getOmnistudioMigrationStorage();
      const osData1: OmniScriptStorage = {
        type: 'Type1',
        subtype: 'Subtype1',
        language: 'English',
        isDuplicate: false,
      };
      const osData2: OmniScriptStorage = {
        type: 'Type2',
        subtype: 'Subtype2',
        language: 'French',
        isDuplicate: true,
      };
      const fcData1: FlexcardStorage = {
        name: 'Flexcard1',
        isDuplicate: false,
      };
      const fcData2: FlexcardStorage = {
        name: 'Flexcard2',
        isDuplicate: true,
      };

      // Act
      storage.osStorage.set('os1', osData1);
      storage.osStorage.set('os2', osData2);
      storage.fcStorage.set('fc1', fcData1);
      storage.fcStorage.set('fc2', fcData2);

      const retrievedStorage = StorageUtil.getOmnistudioMigrationStorage();

      // Assert
      expect(retrievedStorage.osStorage.size).to.equal(2);
      expect(retrievedStorage.fcStorage.size).to.equal(2);
      expect(retrievedStorage.osStorage.get('os1')).to.deep.equal(osData1);
      expect(retrievedStorage.osStorage.get('os2')).to.deep.equal(osData2);
      expect(retrievedStorage.fcStorage.get('fc1')).to.deep.equal(fcData1);
      expect(retrievedStorage.fcStorage.get('fc2')).to.deep.equal(fcData2);
    });

    it('should handle deletion of entries from storage', () => {
      // Arrange
      const storage = StorageUtil.getOmnistudioMigrationStorage();
      const osData: OmniScriptStorage = {
        type: 'DeleteType',
        subtype: 'DeleteSubtype',
        language: 'German',
        isDuplicate: false,
      };

      storage.osStorage.set('to-delete', osData);
      expect(storage.osStorage.has('to-delete')).to.be.true;

      // Act
      storage.osStorage.delete('to-delete');
      const retrievedStorage = StorageUtil.getOmnistudioMigrationStorage();

      // Assert
      expect(retrievedStorage.osStorage.has('to-delete')).to.be.false;
      expect(retrievedStorage.osStorage.get('to-delete')).to.be.undefined;
    });
  });

  describe('printMigrationStorage', () => {
    it('should call Logger.logVerbose when printing storage', () => {
      // Arrange
      const logVerboseStub = sandbox.stub(Logger, 'logVerbose');
      const storage = StorageUtil.getOmnistudioMigrationStorage();
      storage.osStorage.set('test', {
        type: 'TestType',
        subtype: 'TestSubtype',
        language: 'English',
        isDuplicate: false,
      });

      // Act
      StorageUtil.printMigrationStorage();

      // Assert
      expect(logVerboseStub.calledWith('Printing the storage')).to.be.true;
      expect(logVerboseStub.callCount).to.be.greaterThan(1);
    });

    it('should handle error when JSON.stringify fails and log error message', () => {
      // Arrange
      const logVerboseStub = sandbox.stub(Logger, 'logVerbose');
      const storage = StorageUtil.getOmnistudioMigrationStorage();

      // Create a circular reference to cause JSON.stringify to fail
      const circularRef: { isDuplicate: boolean; self?: unknown } = { isDuplicate: false };
      circularRef.self = circularRef;
      storage.osStorage.set('circular', circularRef as unknown as OmniScriptStorage);

      // Act
      StorageUtil.printMigrationStorage();

      // Assert
      expect(logVerboseStub.calledWith('Printing the storage')).to.be.true;
      expect(logVerboseStub.calledWith('Error occurred while printing storage')).to.be.true;
    });

    it('should handle storage with undefined values', () => {
      // Arrange
      const logVerboseStub = sandbox.stub(Logger, 'logVerbose');
      const storage = StorageUtil.getOmnistudioMigrationStorage();

      // Add entry with undefined value (simulating edge case)
      storage.osStorage.set('undefined-test', undefined as unknown as OmniScriptStorage);

      // Act
      StorageUtil.printMigrationStorage();

      // Assert
      expect(logVerboseStub.calledWith('Printing the storage')).to.be.true;
      // Should not throw an error and should call logVerbose at least twice
      expect(logVerboseStub.callCount).to.be.greaterThan(1);
    });

    it('should handle empty storage gracefully', () => {
      // Arrange
      const logVerboseStub = sandbox.stub(Logger, 'logVerbose');

      // Act (storage is already empty from beforeEach)
      StorageUtil.printMigrationStorage();

      // Assert
      expect(logVerboseStub.calledWith('Printing the storage')).to.be.true;
      expect(logVerboseStub.callCount).to.equal(2); // Initial message + JSON output
    });
  });
});
