/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-require-imports */
import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';
import { Connection, Messages, Org } from '@salesforce/core';
import sinon = require('sinon');

// Register ALL message bundles before the inline require below loads orgUtils/index.ts,
// which calls Messages.loadMessages(..., 'migrate') at module level.
Messages.importMessagesDirectory(path.resolve(__dirname, '../../../..'));

import { Logger } from '../../../../src/utils/logger';
import { OrgUtils, OmnistudioOrgDetails } from '../../../../src/utils/orgUtils';
import * as promptUtil from '../../../../src/utils/promptUtil';
import { SpecialCharacterRecordCleanupService } from '../../../../src/utils/config/SpecialCharacterRecordCleanupService';
import { ExistingRecordCleanupService } from '../../../../src/utils/config/ExistingRecordCleanupService';

// Use require (not import) so it runs AFTER Messages.importMessagesDirectory above
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Clean = require('../../../../src/commands/omnistudio/migration/clean').default;

// Org detail fixtures — control real isStandardDataModel() and
// isStandardDataModelWithMetadataAPIEnabled() via OrgUtils.getOrgDetails response
const BASE_ORG_DETAILS: OmnistudioOrgDetails = {
  packageDetails: { version: '1.0.0', namespace: 'omnistudio' },
  omniStudioOrgPermissionEnabled: true,
  orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
  dataModel: 'Standard',
  hasValidNamespace: true,
  isFoundationPackage: false,
  isOmnistudioMetadataAPIEnabled: false,
};

// Standard data model, Metadata API not yet enabled (happy path)
const STANDARD_ORG_DETAILS: OmnistudioOrgDetails = { ...BASE_ORG_DETAILS };

// Custom (Vlocity) data model — isStandardDataModel() returns false
const CUSTOM_ORG_DETAILS: OmnistudioOrgDetails = {
  ...BASE_ORG_DETAILS,
  omniStudioOrgPermissionEnabled: false,
  dataModel: 'Custom',
};

// Standard data model with Metadata API already enabled
const METADATA_API_ENABLED_ORG_DETAILS: OmnistudioOrgDetails = {
  ...BASE_ORG_DETAILS,
  isOmnistudioMetadataAPIEnabled: true,
};

describe('Clean command', () => {
  let sandbox: sinon.SinonSandbox;
  let loggerWarnStub: sinon.SinonStub;
  let loggerLogStub: sinon.SinonStub;
  let loggerErrorStub: sinon.SinonStub;
  let getOrgDetailsStub: sinon.SinonStub;
  let askConfirmationStub: sinon.SinonStub;
  let deactivateAndDeleteStub: sinon.SinonStub;
  let cleanAllStub: sinon.SinonStub;
  let assessSpecialCharStub: sinon.SinonStub;
  let assessExistingStub: sinon.SinonStub;
  let parsedFlags: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    const mockConnection = {} as Connection;
    const mockOrg = { getConnection: () => mockConnection } as unknown as Org;
    parsedFlags = { 'target-org': mockOrg, verbose: false, assess: false };

    loggerWarnStub = sandbox.stub(Logger, 'warn');
    loggerLogStub = sandbox.stub(Logger, 'log');
    loggerErrorStub = sandbox.stub(Logger, 'error');

    // OrgUtils.getOrgDetails is the ONLY API call in runClean — stub it; all
    // downstream logic (initializeDataModelService, isStandardDataModel, etc.) runs as real code.
    getOrgDetailsStub = sandbox.stub(OrgUtils, 'getOrgDetails').resolves(STANDARD_ORG_DETAILS);

    askConfirmationStub = sandbox.stub(promptUtil, 'askConfirmation').resolves(true);

    // Service methods are separately unit-tested — stub them at the command level
    deactivateAndDeleteStub = sandbox
      .stub(SpecialCharacterRecordCleanupService.prototype, 'deactivateAndDelete')
      .resolves();
    cleanAllStub = sandbox.stub(ExistingRecordCleanupService.prototype, 'cleanAll').resolves();

    assessSpecialCharStub = sandbox.stub(SpecialCharacterRecordCleanupService.prototype, 'assess').resolves(new Map());
    assessExistingStub = sandbox.stub(ExistingRecordCleanupService.prototype, 'assess').resolves(new Map());
  });

  afterEach(() => {
    sandbox.restore();
  });

  // Creates a Clean instance without triggering SfCommand's constructor
  function createCleanInstance(): any {
    return Object.create(Clean.prototype);
  }

  describe('runClean', () => {
    it('should return failure and log warning when org is not on standard data model', async () => {
      // Arrange: real isStandardDataModel() returns false because omniStudioOrgPermissionEnabled = false
      getOrgDetailsStub.resolves(CUSTOM_ORG_DETAILS);
      const instance = createCleanInstance();

      // Act
      const result = await instance.runClean(parsedFlags);

      // Assert
      expect(result).to.deep.equal({ success: false });
      expect(loggerWarnStub.calledOnce).to.be.true;
      expect(askConfirmationStub.called).to.be.false;
      expect(deactivateAndDeleteStub.called).to.be.false;
      expect(cleanAllStub.called).to.be.false;
    });

    it('should return failure and log message when Omnistudio Metadata API is already enabled', async () => {
      // Arrange: real isStandardDataModelWithMetadataAPIEnabled() returns true
      getOrgDetailsStub.resolves(METADATA_API_ENABLED_ORG_DETAILS);
      const instance = createCleanInstance();

      // Act
      const result = await instance.runClean(parsedFlags);

      // Assert
      expect(result).to.deep.equal({ success: false });
      expect(loggerLogStub.calledOnce).to.be.true;
      expect(askConfirmationStub.called).to.be.false;
      expect(deactivateAndDeleteStub.called).to.be.false;
    });

    it('should display sandbox warning before asking for user confirmation', async () => {
      // Arrange
      const instance = createCleanInstance();
      const callOrder: string[] = [];
      loggerWarnStub.callsFake(() => callOrder.push('warn'));
      askConfirmationStub.callsFake(() => {
        callOrder.push('confirm');
        return Promise.resolve(true);
      });

      // Act
      await instance.runClean(parsedFlags);

      // Assert: sandbox warning is emitted before the confirmation prompt
      expect(callOrder[0]).to.equal('warn');
      expect(callOrder[1]).to.equal('confirm');
    });

    it('should return failure and log cancellation when user declines confirmation', async () => {
      // Arrange
      askConfirmationStub.resolves(false);
      const instance = createCleanInstance();

      // Act
      const result = await instance.runClean(parsedFlags);

      // Assert
      expect(result).to.deep.equal({ success: false });
      expect(loggerLogStub.calledOnce).to.be.true; // operationCancelled
      expect(deactivateAndDeleteStub.called).to.be.false;
      expect(cleanAllStub.called).to.be.false;
    });

    it('should run both cleanup services and return success when user confirms', async () => {
      // Arrange
      const instance = createCleanInstance();

      // Act
      const result = await instance.runClean(parsedFlags);

      // Assert
      expect(result).to.deep.equal({ success: true });
      expect(deactivateAndDeleteStub.calledOnce).to.be.true;
      expect(cleanAllStub.calledOnce).to.be.true;
      expect(loggerErrorStub.called).to.be.false;
    });

    it('should run SpecialCharacterRecordCleanupService before ExistingRecordCleanupService', async () => {
      // Arrange
      const instance = createCleanInstance();
      const callOrder: string[] = [];
      deactivateAndDeleteStub.callsFake(() => {
        callOrder.push('specialChar');
        return Promise.resolve();
      });
      cleanAllStub.callsFake(() => {
        callOrder.push('existingRecord');
        return Promise.resolve();
      });

      // Act
      await instance.runClean(parsedFlags);

      // Assert: special char cleanup runs before existing record cleanup
      expect(callOrder[0]).to.equal('specialChar');
      expect(callOrder[1]).to.equal('existingRecord');
    });

    it('should log deletionComplete after both cleanup services finish', async () => {
      // Arrange
      const instance = createCleanInstance();

      // Act
      await instance.runClean(parsedFlags);

      // Assert: deletionComplete is logged once both services are done
      expect(loggerLogStub.calledOnce).to.be.true;
    });
  });

  describe('--assess flag', () => {
    let mkdirSyncStub: sinon.SinonStub;
    let writeFileSyncStub: sinon.SinonStub;

    beforeEach(() => {
      parsedFlags = { ...parsedFlags, assess: true };
      // Stub the underlying require('fs') so the stubs work across the esModuleInterop
      // __importStar wrapper boundaries used by clean.ts and this test file.
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const nodeFs = require('fs') as typeof fs;
      mkdirSyncStub = sandbox.stub(nodeFs, 'mkdirSync');
      writeFileSyncStub = sandbox.stub(nodeFs, 'writeFileSync');
    });

    it('should not ask for confirmation when --assess is set', async () => {
      // Arrange
      const instance = createCleanInstance();

      // Act
      await instance.runClean(parsedFlags);

      // Assert
      expect(askConfirmationStub.called).to.be.false;
      expect(deactivateAndDeleteStub.called).to.be.false;
      expect(cleanAllStub.called).to.be.false;
    });

    it('should call assess() on both services and return success', async () => {
      // Arrange
      const instance = createCleanInstance();

      // Act
      const result = await instance.runClean(parsedFlags);

      // Assert
      expect(result).to.deep.equal({ success: true });
      expect(assessSpecialCharStub.calledOnce).to.be.true;
      expect(assessExistingStub.calledOnce).to.be.true;
    });

    it('should log the assessment start header and no-records message when both services return empty maps', async () => {
      // Arrange
      const instance = createCleanInstance();

      // Act
      await instance.runClean(parsedFlags);

      // Assert: "Starting assessment" header logged, and the clean-org message logged
      const loggedMessages = loggerLogStub.args.map((args: any[]) => args[0] as string);
      expect(loggedMessages.some((m) => m.includes('Starting assessment'))).to.be.true;
      expect(loggedMessages.some((m) => m.includes('No records require removal'))).to.be.true;
    });

    it('should write one JSON file per component when records are found', async () => {
      // Arrange
      assessSpecialCharStub.resolves(
        new Map([['OmniScript', [{ Id: 'a01', Type: 'Test', SubType: 'Sub', Language: 'English', VersionNumber: 1 }]]])
      );
      assessExistingStub.resolves(new Map([['OmniScript', []]]));
      const instance = createCleanInstance();

      // Act
      await instance.runClean(parsedFlags);

      // Assert: mkdirSync and writeFileSync called for the OmniScript component
      expect(mkdirSyncStub.calledOnce).to.be.true;
      expect(writeFileSyncStub.calledOnce).to.be.true;
      const [filePath, content] = writeFileSyncStub.firstCall.args as [string, string];
      expect(filePath).to.include('OmniScript.json');
      const parsed = JSON.parse(content);
      expect(parsed.component).to.equal('OmniScript');
      expect(parsed.specialCharacterRecords).to.have.length(1);
      expect(parsed.orphanRecords).to.have.length(0);
      expect(parsed.totalToDelete).to.equal(1);
    });

    it('should merge records from both phases into the same component file', async () => {
      // Arrange
      assessSpecialCharStub.resolves(
        new Map([['FlexCard', [{ Id: 'b01', Name: 'Card#1', AuthorName: 'Author', VersionNumber: 2 }]]])
      );
      assessExistingStub.resolves(
        new Map([['FlexCard', [{ Id: 'b02', Name: 'Card2', AuthorName: 'Author', VersionNumber: 1 }]]])
      );
      const instance = createCleanInstance();

      // Act
      await instance.runClean(parsedFlags);

      // Assert
      expect(writeFileSyncStub.calledOnce).to.be.true;
      const [filePath, content] = writeFileSyncStub.firstCall.args as [string, string];
      expect(filePath).to.include('FlexCard.json');
      const parsed = JSON.parse(content);
      expect(parsed.totalToDelete).to.equal(2);
      expect(parsed.specialCharacterRecords).to.have.length(1);
      expect(parsed.orphanRecords).to.have.length(1);
    });

    it('should write separate files for each component when multiple components have records', async () => {
      // Arrange
      assessSpecialCharStub.resolves(
        new Map([
          ['OmniScript', [{ Id: 'a01' }]],
          ['DataMapper', [{ Id: 'c01' }]],
        ])
      );
      assessExistingStub.resolves(new Map());
      const instance = createCleanInstance();

      // Act
      await instance.runClean(parsedFlags);

      // Assert: one file written per component
      expect(writeFileSyncStub.callCount).to.equal(2);
      const filePaths = writeFileSyncStub.args.map((args: any[]) => args[0] as string);
      expect(filePaths.some((p) => p.includes('OmniScript.json'))).to.be.true;
      expect(filePaths.some((p) => p.includes('DataMapper.json'))).to.be.true;
    });
  });
});
