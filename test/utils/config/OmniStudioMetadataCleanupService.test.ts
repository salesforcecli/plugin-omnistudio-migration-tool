import { expect } from 'chai';
import { Connection, Messages } from '@salesforce/core';
import sinon = require('sinon');
import { OmniStudioMetadataCleanupService } from '../../../src/utils/config/OmniStudioMetadataCleanupService';
import { Logger } from '../../../src/utils/logger';
import { QueryTools } from '../../../src/utils/query';
import { NetUtils } from '../../../src/utils/net';
import { initializeDataModelService } from '../../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../../src/utils/orgUtils';

describe('OmniStudioMetadataCleanupService', () => {
  let connection: Connection;
  let messages: Messages<string>;
  let sandbox: sinon.SinonSandbox;
  let loggerLogStub: sinon.SinonStub;
  let loggerErrorStub: sinon.SinonStub;
  let queryIdsStub: sinon.SinonStub;
  let deleteStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    initializeDataModelService({
      hasValidNamespace: true,
      isFoundationPackage: true,
      packageDetails: { namespace: 'omnistudio', version: '1.0' },
      omniStudioOrgPermissionEnabled: true,
      isOmnistudioMetadataAPIEnabled: false,
    } as OmnistudioOrgDetails);

    // Mock Connection
    connection = {
      query: sandbox.stub(),
    } as unknown as Connection;

    // Mock Messages
    messages = {
      getMessage: sandbox.stub(),
    } as unknown as Messages<string>;

    // Mock Logger
    loggerLogStub = sandbox.stub(Logger, 'log');
    loggerErrorStub = sandbox.stub(Logger, 'error');

    // Mock QueryTools.queryIds
    queryIdsStub = sandbox.stub(QueryTools, 'queryIds');

    // Mock NetUtils.deleteWithFieldIntegrityException
    deleteStub = sandbox.stub(NetUtils, 'deleteWithFieldIntegrityException');

    // Setup default message responses
    (messages.getMessage as sinon.SinonStub)
      .withArgs('startingMetadataCleanup')
      .returns('Initiated cleanup process for Omnistudio metadata tables.');

    // Setup default message responses for formatted messages
    (messages.getMessage as sinon.SinonStub)
      .withArgs('metadataCleanupCompleted', sinon.match.any)
      .callsFake((key: string, args: string[]) => {
        if (key === 'metadataCleanupCompleted' && args && args.length > 0) {
          return `The Omnistudio metadata table cleanup process is complete. Total records cleaned: ${args[0]}`;
        }
        return undefined;
      });

    (messages.getMessage as sinon.SinonStub)
      .withArgs('failedToCleanTables', sinon.match.any)
      .callsFake((key: string, args: string[]) => {
        if (key === 'failedToCleanTables' && args && args.length > 0) {
          return `Table cleanup failed: ${args[0]}`;
        }
        return undefined;
      });

    (messages.getMessage as sinon.SinonStub)
      .withArgs('errorCheckingMetadataTables', sinon.match.any)
      .callsFake((key: string, args: string[]) => {
        if (key === 'errorCheckingMetadataTables' && args && args.length > 0) {
          return `Error checking Omnistudio metadata tables: ${args[0]}`;
        }
        return undefined;
      });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('constructor', () => {
    it('should initialize with connection and messages', () => {
      // Act
      const service = new OmniStudioMetadataCleanupService(connection, messages);

      // Assert
      expect(service).to.be.instanceOf(OmniStudioMetadataCleanupService);
    });
  });

  describe('hasCleanOmniStudioMetadataTables', () => {
    it('should return true when all tables are empty', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub.resolves([]); // All tables return empty arrays

      // Act
      const result = await service.hasCleanOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.true;
      expect(queryIdsStub.callCount).to.equal(4); // Called for each config table
      expect(loggerErrorStub.called).to.be.false;
    });

    it('should return false when any table has records', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub
        .onFirstCall()
        .resolves([]) // OmniUiCardConfig empty
        .onSecondCall()
        .resolves([]) // OmniScriptConfig empty
        .onCall(2)
        .resolves(['id1', 'id2']) // OmniIntegrationProcConfig has records
        .onCall(3)
        .resolves([]); // OmniDataTransformConfig empty

      // Act
      const result = await service.hasCleanOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.false;
      expect(queryIdsStub.callCount).to.equal(3); // Should stop after finding records
      expect(loggerErrorStub.called).to.be.false;
    });

    it('should return false when first table has records', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub.onFirstCall().resolves(['id1']); // OmniUiCardConfig has records

      // Act
      const result = await service.hasCleanOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.false;
      expect(queryIdsStub.callCount).to.equal(1); // Should stop after first table
      expect(loggerErrorStub.called).to.be.false;
    });

    it('should return false and log error when query fails', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      const error = new Error('Database connection failed');
      queryIdsStub.rejects(error);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('errorCheckingMetadataTables', ['Error: Database connection failed'])
        .returns('Error checking Omnistudio metadata tables: Error: Database connection failed');

      // Act
      const result = await service.hasCleanOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal(
        'Error checking Omnistudio metadata tables: Error: Database connection failed'
      );
    });

    it('should return false and log error when query throws non-Error object', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub.rejects('String error message');
      (messages.getMessage as sinon.SinonStub)
        .withArgs('errorCheckingMetadataTables', ['String error message'])
        .returns('Error checking Omnistudio metadata tables: String error message');

      // Act
      const result = await service.hasCleanOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal(
        'Error checking Omnistudio metadata tables: String error message'
      );
    });
  });

  describe('cleanupOmniStudioMetadataTables', () => {
    it('should successfully clean all tables when they have records', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub
        .onFirstCall()
        .resolves(['id1', 'id2']) // OmniUiCardConfig
        .onSecondCall()
        .resolves(['id3']) // OmniScriptConfig
        .onCall(2)
        .resolves([]) // OmniIntegrationProcConfig
        .onCall(3)
        .resolves(['id4', 'id5', 'id6']); // OmniDataTransformConfig
      deleteStub.resolves({ success: true }); // All deletions successful
      (messages.getMessage as sinon.SinonStub)
        .withArgs('metadataCleanupCompleted', ['6'])
        .returns('The Omnistudio metadata table cleanup process is complete. Total records cleaned: 6');

      // Act
      const result = await service.cleanupOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.true;
      expect(queryIdsStub.callCount).to.equal(4);
      expect(deleteStub.callCount).to.equal(3); // Only called for tables with records
      expect(loggerLogStub.calledTwice).to.be.true;
      expect(loggerLogStub.firstCall.args[0]).to.equal('Initiated cleanup process for Omnistudio metadata tables.');
      expect(loggerLogStub.secondCall.args[0]).to.equal(
        'The Omnistudio metadata table cleanup process is complete. Total records cleaned: 6'
      );
      expect(loggerErrorStub.called).to.be.false;
    });

    it('should return true when all tables are already empty', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub.resolves([]); // All tables empty
      deleteStub.resolves({ success: true });
      (messages.getMessage as sinon.SinonStub)
        .withArgs('metadataCleanupCompleted', ['0'])
        .returns('The Omnistudio metadata table cleanup process is complete. Total records cleaned: 0');

      // Act
      const result = await service.cleanupOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.true;
      expect(queryIdsStub.callCount).to.equal(4);
      expect(deleteStub.called).to.be.false; // No deletions needed
      expect(loggerLogStub.calledTwice).to.be.true;
      expect(loggerLogStub.secondCall.args[0]).to.equal(
        'The Omnistudio metadata table cleanup process is complete. Total records cleaned: 0'
      );
    });

    it('should return false when deletion fails for any table', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub
        .onFirstCall()
        .resolves(['id1']) // OmniUiCardConfig
        .onSecondCall()
        .resolves(['id2']) // OmniScriptConfig
        .onCall(2)
        .resolves([]) // OmniIntegrationProcConfig
        .onCall(3)
        .resolves(['id3']); // OmniDataTransformConfig
      deleteStub
        .onFirstCall()
        .resolves({ success: true }) // First deletion successful
        .onSecondCall()
        .resolves({ success: false, statusCode: 'SOME_ERROR' }) // Second deletion fails
        .onThirdCall()
        .resolves({ success: true }); // Third deletion successful
      (messages.getMessage as sinon.SinonStub)
        .withArgs('failedToCleanTables', ['OmniScriptConfig'])
        .returns('Table cleanup failed: OmniScriptConfig');

      // Act
      const result = await service.cleanupOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.false;
      expect(queryIdsStub.callCount).to.equal(4);
      expect(deleteStub.callCount).to.equal(3);
      expect(loggerErrorStub.callCount).to.equal(1);
      expect(loggerErrorStub.firstCall.args[0]).to.equal('Table cleanup failed: OmniScriptConfig');
    });

    it('should return false when multiple table deletions fail', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub
        .onFirstCall()
        .resolves(['id1']) // OmniUiCardConfig
        .onSecondCall()
        .resolves(['id2']) // OmniScriptConfig
        .onCall(2)
        .resolves(['id3']) // OmniIntegrationProcConfig
        .onCall(3)
        .resolves(['id4']); // OmniDataTransformConfig
      deleteStub
        .onFirstCall()
        .resolves({ success: false, statusCode: 'SOME_ERROR' }) // First deletion fails
        .onSecondCall()
        .resolves({ success: true }) // Second deletion successful
        .onCall(2)
        .resolves({ success: false, statusCode: 'SOME_ERROR' }) // Third deletion fails
        .onCall(3)
        .resolves({ success: true }); // Fourth deletion successful
      (messages.getMessage as sinon.SinonStub)
        .withArgs('failedToCleanTables', ['OmniUiCardConfig, OmniIntegrationProcConfig'])
        .returns('Table cleanup failed: OmniUiCardConfig, OmniIntegrationProcConfig');

      // Act
      const result = await service.cleanupOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.false;
      expect(queryIdsStub.callCount).to.equal(4);
      expect(deleteStub.callCount).to.equal(4);
      expect(loggerErrorStub.callCount).to.equal(1);
      expect(loggerErrorStub.firstCall.args[0]).to.equal(
        'Table cleanup failed: OmniUiCardConfig, OmniIntegrationProcConfig'
      );
    });

    it('should return false and log error when query fails', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      const error = new Error('Database connection failed');
      queryIdsStub.rejects(error);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('errorCheckingMetadataTables', ['Error: Database connection failed'])
        .returns('Error checking Omnistudio metadata tables: Error: Database connection failed');

      // Act
      const result = await service.cleanupOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal(
        'Error checking Omnistudio metadata tables: Error: Database connection failed'
      );
    });

    it('should handle partial failures correctly', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub
        .onFirstCall()
        .resolves(['id1', 'id2']) // OmniUiCardConfig - 2 records
        .onSecondCall()
        .resolves([]) // OmniScriptConfig - empty
        .onThirdCall()
        .resolves(['id3']) // OmniIntegrationProcConfig - 1 record
        .onCall(3)
        .resolves(['id4', 'id5']); // OmniDataTransformConfig - 2 records
      deleteStub
        .onFirstCall()
        .resolves({ success: true }) // OmniUiCardConfig deletion successful
        .onSecondCall()
        .resolves({ success: false, statusCode: 'SOME_ERROR' }) // OmniIntegrationProcConfig deletion fails
        .onThirdCall()
        .resolves({ success: true }); // OmniDataTransformConfig deletion successful
      (messages.getMessage as sinon.SinonStub)
        .withArgs('failedToCleanTables', ['OmniIntegrationProcConfig'])
        .returns('Table cleanup failed: OmniIntegrationProcConfig');

      // Act
      const result = await service.cleanupOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.false;
      expect(queryIdsStub.callCount).to.equal(4);
      expect(deleteStub.callCount).to.equal(3); // Only called for tables with records
      expect(loggerErrorStub.callCount).to.equal(1);
      expect(loggerErrorStub.firstCall.args[0]).to.equal('Table cleanup failed: OmniIntegrationProcConfig');
    });
  });

  describe('cleanupOmniStudioMetadataTable (private method tested indirectly)', () => {
    it('should handle empty table correctly', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub.resolves([]); // Empty table
      deleteStub.resolves({ success: true });

      // Act
      const result = await service.cleanupOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.true;
      expect(deleteStub.called).to.be.false; // Delete should not be called for empty table
    });

    it('should handle table with records correctly', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub.onFirstCall().resolves(['id1', 'id2', 'id3']); // First table has 3 records
      queryIdsStub.onCall(1).resolves([]); // Other tables empty
      queryIdsStub.onCall(2).resolves([]);
      queryIdsStub.onCall(3).resolves([]);
      deleteStub.resolves({ success: true });

      // Act
      const result = await service.cleanupOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.true;
      expect(deleteStub.calledOnce).to.be.true;
      expect(deleteStub.firstCall.args[0]).to.equal(connection);
      expect(deleteStub.firstCall.args[1]).to.deep.equal(['id1', 'id2', 'id3']);
    });

    it('should handle deletion failure correctly', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub.onFirstCall().resolves(['id1', 'id2']); // First table has 2 records
      queryIdsStub.onCall(1).resolves([]); // Other tables empty
      queryIdsStub.onCall(2).resolves([]);
      queryIdsStub.onCall(3).resolves([]);
      deleteStub.resolves({ success: false, statusCode: 'SOME_ERROR' }); // Deletion fails

      // Act
      const result = await service.cleanupOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.false;
      expect(deleteStub.calledOnce).to.be.true;
      expect(loggerErrorStub.callCount).to.equal(1);
      expect(loggerErrorStub.firstCall.args[0]).to.equal('Table cleanup failed: OmniUiCardConfig');
    });
  });

  describe('CONFIG_TABLES constant', () => {
    it('should check all expected config tables', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub.resolves([]); // All tables empty

      // Act
      await service.hasCleanOmniStudioMetadataTables();

      // Assert
      expect(queryIdsStub.callCount).to.equal(4);
      expect(queryIdsStub.getCall(0).args[1]).to.equal('OmniUiCardConfig');
      expect(queryIdsStub.getCall(1).args[1]).to.equal('OmniScriptConfig');
      expect(queryIdsStub.getCall(2).args[1]).to.equal('OmniIntegrationProcConfig');
      expect(queryIdsStub.getCall(3).args[1]).to.equal('OmniDataTransformConfig');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle null query results gracefully', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub.resolves(null);

      // Act
      const result = await service.hasCleanOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
    });

    it('should handle undefined query results gracefully', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub.resolves(undefined);

      // Act
      const result = await service.hasCleanOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
    });

    it('should handle very large record sets', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      const largeRecordSet = Array.from({ length: 1000 }, (_, i) => `id${i}`);
      queryIdsStub.onFirstCall().resolves(largeRecordSet);
      queryIdsStub.onCall(1).resolves([]);
      queryIdsStub.onCall(2).resolves([]);
      queryIdsStub.onCall(3).resolves([]);
      deleteStub.resolves({ success: true });
      (messages.getMessage as sinon.SinonStub)
        .withArgs('metadataCleanupCompleted', ['1000'])
        .returns('The Omnistudio metadata table cleanup process is complete. Total records cleaned: 1000');

      // Act
      const result = await service.cleanupOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.true;
      expect(deleteStub.calledOnce).to.be.true;
      expect(deleteStub.firstCall.args[1]).to.have.length(1000);
      expect(loggerLogStub.secondCall.args[0]).to.equal(
        'The Omnistudio metadata table cleanup process is complete. Total records cleaned: 1000'
      );
    });

    it('should handle mixed success and failure scenarios', async () => {
      // Arrange
      const service = new OmniStudioMetadataCleanupService(connection, messages);
      queryIdsStub
        .onFirstCall()
        .resolves(['id1']) // OmniUiCardConfig - 1 record
        .onSecondCall()
        .resolves(['id2', 'id3']) // OmniScriptConfig - 2 records
        .onCall(2)
        .resolves([]) // OmniIntegrationProcConfig - empty
        .onCall(3)
        .resolves(['id4', 'id5', 'id6']); // OmniDataTransformConfig - 3 records
      deleteStub
        .onFirstCall()
        .resolves({ success: true }) // OmniUiCardConfig deletion successful
        .onSecondCall()
        .resolves({ success: true }) // OmniScriptConfig deletion successful
        .onCall(2)
        .resolves({ success: false, statusCode: 'SOME_ERROR' }) // OmniDataTransformConfig deletion fails
        .onCall(3)
        .resolves({ success: true }); // This shouldn't be called
      (messages.getMessage as sinon.SinonStub)
        .withArgs('failedToCleanTables', ['OmniDataTransformConfig'])
        .returns('Table cleanup failed: OmniDataTransformConfig');

      // Act
      const result = await service.cleanupOmniStudioMetadataTables();

      // Assert
      expect(result).to.be.false;
      expect(queryIdsStub.callCount).to.equal(4);
      expect(deleteStub.callCount).to.equal(3); // Only called for tables with records
      expect(loggerErrorStub.callCount).to.equal(1);
      expect(loggerErrorStub.firstCall.args[0]).to.equal('Table cleanup failed: OmniDataTransformConfig');
    });
  });
});
