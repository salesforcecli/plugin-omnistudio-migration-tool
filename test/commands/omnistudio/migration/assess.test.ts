/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { expect } from 'chai';
import * as sinon from 'sinon';
import { OmniStudioMetadataCleanupService } from '../../../../src/utils/config/OmniStudioMetadataCleanupService';
import {
  initializeDataModelService,
  isStandardDataModel,
  isOmnistudioMetadataAPIEnabled,
} from '../../../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../../../src/utils/orgUtils';
import { QueryTools } from '../../../../src/utils/query';

/**
 * Test Suite: Assess Command - Metadata Cleanup Warning
 *
 * Tests the behavior when:
 * - Standard data model is enabled
 * - Metadata API is disabled
 * - Config tables have data that needs cleanup
 */
describe('Assess Command - Metadata Cleanup Warning', () => {
  let sandbox: sinon.SinonSandbox;
  let mockConnection: any;
  let mockMessages: any;
  let queryIdsStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Stub QueryTools.queryIds before creating services
    queryIdsStub = sandbox.stub(QueryTools, 'queryIds');

    // Setup mock connection
    mockConnection = {
      query: sandbox.stub().resolves({ records: [], done: true }),
    };

    // Setup mock messages
    mockMessages = {
      getMessage: sandbox.stub().callsFake((key: string, params?: string[]) => {
        const messages: Record<string, string> = {
          cleanupMetadataTablesRequired:
            'OmniStudio metadata tables contain data that needs to be cleaned up before migration.',
          errorCheckingMetadataTables: `Error checking metadata tables: ${params?.[0]}`,
        };
        return messages[key] || `Mock message for ${key}`;
      }),
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Standard Data Model with Metadata API Disabled', () => {
    beforeEach(() => {
      // Initialize data model service with Standard data model but Metadata API DISABLED
      const mockOrgDetails: OmnistudioOrgDetails = {
        packageDetails: { version: '1.0.0', namespace: 'omnistudio' },
        omniStudioOrgPermissionEnabled: true, // Standard data model
        orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
        dataModel: 'Standard',
        hasValidNamespace: true,
        isFoundationPackage: false,
        isOmnistudioMetadataAPIEnabled: false, // Metadata API disabled
        isDRVersioningEnabled: false,
      };
      initializeDataModelService(mockOrgDetails);
    });

    it('should return false when config tables have data', async () => {
      // Arrange
      const metadataCleanupService = new OmniStudioMetadataCleanupService(mockConnection, mockMessages);

      // Stub queryIds to return records (indicating tables have data)
      queryIdsStub.resolves(['id1', 'id2']); // Tables have records

      // Act
      const hasCleanTables = await metadataCleanupService.hasCleanOmniStudioMetadataTables();

      // Assert
      expect(hasCleanTables).to.be.false;
    });

    it('should return true when config tables are empty', async () => {
      // Arrange
      const metadataCleanupService = new OmniStudioMetadataCleanupService(mockConnection, mockMessages);

      // Stub queryIds to return empty array (indicating tables are clean)
      queryIdsStub.resolves([]); // Tables are empty

      // Act
      const hasCleanTables = await metadataCleanupService.hasCleanOmniStudioMetadataTables();

      // Assert
      expect(hasCleanTables).to.be.true;
    });

    it('should populate user action message when tables need cleanup', async () => {
      // Arrange
      const metadataCleanupService = new OmniStudioMetadataCleanupService(mockConnection, mockMessages);
      const userActionMessages: string[] = [];

      // Stub queryIds to return records (indicating tables have data)
      queryIdsStub.resolves(['id1', 'id2']); // Tables have records

      // Act - Simulate the assess.ts logic
      const hasCleanTables = await metadataCleanupService.hasCleanOmniStudioMetadataTables();
      if (!hasCleanTables) {
        userActionMessages.push(mockMessages.getMessage('cleanupMetadataTablesRequired'));
      }

      // Assert
      expect(userActionMessages).to.have.length(1);
      expect(userActionMessages[0]).to.equal(
        'OmniStudio metadata tables contain data that needs to be cleaned up before migration.'
      );
    });

    it('should not populate user action message when tables are clean', async () => {
      // Arrange
      const metadataCleanupService = new OmniStudioMetadataCleanupService(mockConnection, mockMessages);
      const userActionMessages: string[] = [];

      // Stub queryIds to return empty array (indicating tables are clean)
      queryIdsStub.resolves([]); // Tables are empty

      // Act - Simulate the assess.ts logic
      const hasCleanTables = await metadataCleanupService.hasCleanOmniStudioMetadataTables();
      if (!hasCleanTables) {
        userActionMessages.push(mockMessages.getMessage('cleanupMetadataTablesRequired'));
      }

      // Assert
      expect(userActionMessages).to.have.length(0);
    });
  });

  describe('Standard Data Model with Metadata API Enabled', () => {
    beforeEach(() => {
      // Initialize data model service with Standard data model AND Metadata API ENABLED
      const mockOrgDetails: OmnistudioOrgDetails = {
        packageDetails: { version: '1.0.0', namespace: 'omnistudio' },
        omniStudioOrgPermissionEnabled: true, // Standard data model
        orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
        dataModel: 'Standard',
        hasValidNamespace: true,
        isFoundationPackage: false,
        isOmnistudioMetadataAPIEnabled: true, // Metadata API enabled
        isDRVersioningEnabled: false,
      };
      initializeDataModelService(mockOrgDetails);
    });

    it('should skip cleanup check when Metadata API is enabled', () => {
      // When Metadata API is enabled, the cleanup check should be skipped
      // This simulates the condition: isStandardDataModel() && !isOmnistudioMetadataAPIEnabled()
      // which would be false when Metadata API is enabled

      // Assert
      expect(isStandardDataModel()).to.be.true;
      expect(isOmnistudioMetadataAPIEnabled()).to.be.true;

      // The condition for cleanup check would be false
      const shouldCheckCleanup = isStandardDataModel() && !isOmnistudioMetadataAPIEnabled();
      expect(shouldCheckCleanup).to.be.false;
    });
  });

  describe('Custom Data Model', () => {
    beforeEach(() => {
      // Initialize data model service with Custom data model
      const mockOrgDetails: OmnistudioOrgDetails = {
        packageDetails: { version: '1.0.0', namespace: 'vlocity_ins' },
        omniStudioOrgPermissionEnabled: false, // Custom data model
        orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
        dataModel: 'Custom',
        hasValidNamespace: true,
        isFoundationPackage: false,
        isOmnistudioMetadataAPIEnabled: false,
        isDRVersioningEnabled: false,
      };
      initializeDataModelService(mockOrgDetails);
    });

    it('should skip cleanup check for custom data model', () => {
      // When using Custom data model, the cleanup check should be skipped
      // This simulates the condition: isStandardDataModel() && !isOmnistudioMetadataAPIEnabled()
      // which would be false when using Custom data model

      // Assert
      expect(isStandardDataModel()).to.be.false;
      expect(isOmnistudioMetadataAPIEnabled()).to.be.false;

      // The condition for cleanup check would be false
      const shouldCheckCleanup = isStandardDataModel() && !isOmnistudioMetadataAPIEnabled();
      expect(shouldCheckCleanup).to.be.false;
    });
  });
});
