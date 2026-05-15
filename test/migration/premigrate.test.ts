/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { expect } from 'chai';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import sinon = require('sinon');
import { PreMigrate } from '../../src/migration/premigrate';
import { Logger } from '../../src/utils/logger';
import { PromptUtil } from '../../src/utils/promptUtil';
import { OmniStudioMetadataCleanupService } from '../../src/utils/config/OmniStudioMetadataCleanupService';
import * as dataModelService from '../../src/utils/dataModelService';

describe('PreMigrate - handleAllVersionsPrerequisites for Standard Data Model', () => {
  let preMigrate: PreMigrate;
  let connection: Connection;
  let logger: Logger;
  let messages: Messages<string>;
  let ux: Ux;
  let sandbox: sinon.SinonSandbox;
  let getMessageStub: sinon.SinonStub;
  let logErrorStub: sinon.SinonStub;
  let logVerboseStub: sinon.SinonStub;
  let processExitStub: sinon.SinonStub;
  let askWithTimeOutStub: sinon.SinonStub;

  const testNamespace = 'test_namespace';

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Mock connection
    connection = {
      query: sandbox.stub(),
    } as unknown as Connection;

    // Mock logger
    logger = {
      log: sandbox.stub(),
      logVerbose: sandbox.stub(),
      error: sandbox.stub(),
    } as unknown as Logger;

    // Mock messages
    messages = {
      getMessage: sandbox.stub(),
    } as unknown as Messages<string>;
    getMessageStub = messages.getMessage as sinon.SinonStub;

    // Mock Ux
    ux = {
      log: sandbox.stub(),
      error: sandbox.stub(),
    } as unknown as Ux;

    // Set up default message returns - using correct message keys from implementation
    getMessageStub
      .withArgs('omniStudioAllVersionsProcessingConsent')
      .returns(
        'All Versions of omnistudio components [Omniscript, Data Mapper, Integration Procedure, Flexcard] need to be migrated for metadata to be enabled as org is on Standard Data Model. Do you agree to migrate all versions? [y/n]'
      );
    getMessageStub
      .withArgs('omniStudioAllVersionsProcessingConsentNotGiven')
      .returns(
        "You've not consented to proceed with the all versions migration. We'll not be able to proceed with the migration."
      );
    getMessageStub
      .withArgs('omniStudioAllVersionsProcessingConsentGiven')
      .returns("You've consented to proceed with the all versions migration.");
    getMessageStub.withArgs('requestTimedOut').returns('Request timed out');
    getMessageStub.withArgs('invalidYesNoResponse').returns('Invalid response. Please answer y or n.');

    // Mock Logger static methods
    logErrorStub = sandbox.stub(Logger, 'error');
    logVerboseStub = sandbox.stub(Logger, 'logVerbose');

    // Mock process.exit to prevent actual exit
    processExitStub = sandbox.stub(process, 'exit');

    // Mock PromptUtil
    askWithTimeOutStub = sandbox.stub(PromptUtil, 'askWithTimeOut');

    preMigrate = new PreMigrate(testNamespace, connection, logger, messages, ux);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Standard Data Model - allVersions flag handling', () => {
    it('should prompt for consent and return true when allVersions flag is NOT passed (false) and user consents', async () => {
      // Arrange - Simulates: Standard Data Model + no -a flag
      const allVersionsFlagFromCLI = false;
      const mockAskFunction = sandbox.stub().resolves('y');
      askWithTimeOutStub.returns(mockAskFunction);

      // Act - This is what happens in migrate.ts line 135
      const result = await preMigrate.handleAllVersionsPrerequisites(allVersionsFlagFromCLI);

      // Assert
      expect(mockAskFunction.calledOnce).to.be.true; // User was prompted
      expect(result).to.equal(true); // allVersions is now true
      expect(logVerboseStub.calledWith("You've consented to proceed with the all versions migration.")).to.be.true;
      expect(logErrorStub.called).to.be.false;
      expect(processExitStub.called).to.be.false;
    });

    it('should NOT prompt and return true when allVersions flag IS passed (true)', async () => {
      // Arrange - Simulates: Standard Data Model + user provided -a flag
      const allVersionsFlagFromCLI = true;
      const mockAskFunction = sandbox.stub();
      askWithTimeOutStub.returns(mockAskFunction);

      // Act - This is what happens in migrate.ts line 135
      const result = await preMigrate.handleAllVersionsPrerequisites(allVersionsFlagFromCLI);

      // Assert
      expect(mockAskFunction.called).to.be.false; // User was NOT prompted
      expect(result).to.equal(true); // allVersions remains true
      expect(logVerboseStub.called).to.be.false; // No logging since flag was already set
      expect(logErrorStub.called).to.be.false;
      expect(processExitStub.called).to.be.false;
    });
  });

  describe('OmniStudio metadata prerequisites', () => {
    it('should log cleanup required and exit when config tables are not empty', async () => {
      // Arrange
      const expectedMessage = 'Omnistudio configuration tables contain records.';
      getMessageStub.withArgs('cleanupMetadataTablesRequired').returns(expectedMessage);
      getMessageStub
        .withArgs('cleanupMetadataTablesHelpUrl')
        .returns(
          'https://help.salesforce.com/s/articleView?id=xcloud.os_enable_omnistudio_metadata_api_support.htm&type=5'
        );
      getMessageStub
        .withArgs('cleanupMetadataTablesHelpLinkText')
        .returns('Learn more about cleaning up tables in Salesforce Help');
      sandbox.stub(dataModelService, 'isStandardDataModelWithMetadataAPIEnabled').returns(false);
      sandbox.stub(preMigrate, 'getOmniStudioMetadataEnableConsent').resolves(true);
      sandbox.stub(OmniStudioMetadataCleanupService.prototype, 'hasCleanOmniStudioMetadataTables').resolves(false);

      // Act
      await preMigrate.handleOmnistudioMetadataPrerequisites();

      // Assert - Logger.error is called with the message + ANSI clickable link appended
      expect(logErrorStub.calledOnce).to.be.true;
      expect((logErrorStub.firstCall.args[0] as string).startsWith(expectedMessage)).to.be.true;
      expect(processExitStub.calledWith(1)).to.be.true;
    });
  });
});
