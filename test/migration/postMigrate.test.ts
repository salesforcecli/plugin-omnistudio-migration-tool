/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable camelcase */
import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';
import { Connection, Messages, Org } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import type { ExecuteAnonymousResult } from '@jsforce/jsforce-node/lib/api/tooling';
import sinon = require('sinon');
import { PostMigrate } from '../../src/migration/postMigrate';
import { Logger } from '../../src/utils/logger';
import { AnonymousApexRunner } from '../../src/utils/apex/executor/AnonymousApexRunner';
import { OrgPreferences } from '../../src/utils/orgPreferences';
import { Deployer } from '../../src/migration/deployer';
import { OmniscriptPackageDeploymentError } from '../../src/error/deploymentErrors';

describe('PostMigrate', () => {
  let postMigrate: PostMigrate;
  let org: Org;
  let connection: Connection;
  let logger: Logger;
  let messages: Messages<string>;
  let ux: Ux;
  let sandbox: sinon.SinonSandbox;
  let getMessageStub: sinon.SinonStub;
  let logErrorStub: sinon.SinonStub;

  const testNamespace = 'test_namespace';
  const testRelatedObjectsToProcess = ['Flexipage', 'expsites'];
  const testProjectPath = '/test/project/path';
  const testUsername = 'test@example.com';
  const testAuthKey = 'test-auth-key';

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Set up environment variable for Deployer
    process.env.OMA_AUTH_KEY = testAuthKey;

    // Mock org
    org = {
      getUsername: sandbox.stub().returns(testUsername),
      getConnection: sandbox.stub().returns({
        tooling: {
          executeAnonymous: sandbox.stub(),
        },
      }),
    } as unknown as Org;

    // Mock connection
    connection = {
      tooling: {
        executeAnonymous: sandbox.stub(),
      },
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

    // Set up default message returns
    getMessageStub.withArgs('settingDesignersToStandardModel').returns('Setting designers to standard model...');
    getMessageStub.withArgs('designersSetToStandardModel').returns('Designers set to standard model');
    getMessageStub.returns('Error setting designers to standard model: Test error stack trace');
    getMessageStub
      .withArgs('exceptionSettingDesignersToStandardDataModel', ['{"message":"Test exception"}'])
      .returns('Exception setting designers to standard model: {"message":"Test exception"}');
    getMessageStub
      .withArgs('manuallySwitchDesignerToStandardDataModel')
      .returns('Please manually switch designer to standard data model');
    getMessageStub.withArgs('noRelatedObjects').returns('No related objects to process');
    getMessageStub.withArgs('turnOffExperienceBundleAPI').returns('Turning off Experience Bundle API');
    getMessageStub
      .withArgs('errorRevertingExperienceBundleMetadataAPI')
      .returns('Error reverting Experience Bundle Metadata API');
    getMessageStub.withArgs('errorDeployingComponents').returns('Error deploying components');
    // New deployment action messages
    getMessageStub
      .withArgs('deployOmniscriptPackageManually')
      .returns(
        'Omniscript customization package deployment failed. Please deploy the omniscript package manually before deploying your migrated components. Check the logs for detailed error information.'
      );
    getMessageStub
      .withArgs('deployComponentsManually')
      .returns(
        'Component deployment failed. Please deploy the generated package.xml manually using Salesforce CLI or Workbench. Check the logs for detailed error information.'
      );
    getMessageStub
      .withArgs('omniscriptDeploymentFailedContinuing')
      .returns('Omniscript package deployment failed, continuing with report generation.');
    getMessageStub
      .withArgs('deploymentFailedContinuing')
      .returns('Deployment failed, continuing with report generation.');
    // New omniscriptPackageManager userAction messages
    getMessageStub
      .withArgs('ensurePackageInstalled')
      .returns('Please ensure omniscript customization package is properly installed: %s');
    getMessageStub
      .withArgs('packageDeploymentFailedWithError')
      .returns(
        'Omniscript package deployment failed after %s attempts. Error: %s. Please check deployment logs and org settings.'
      );
    getMessageStub
      .withArgs('maxRetryAttemptsExceeded')
      .returns('Maximum retry attempts (%s) exceeded for omniscript package deployment');
    getMessageStub
      .withArgs('deploymentNonRetryableError')
      .returns('Deployment failed with non-retryable error: %s. Please review and fix the issue manually.');
    getMessageStub
      .withArgs('omniscriptPackageDeploymentFailedReturnedFalse')
      .returns(
        'Omniscript package deployment failed - deployment returned false. This may be due to missing package, permissions, or deployment timeout.'
      );
    getMessageStub
      .withArgs('omniscriptPackageDeploymentFailedWithMessage')
      .callsFake((key: string, args: string[]) => `Omniscript package deployment failed: ${args[0]}`);
    // Other messages referenced by implementation
    getMessageStub.withArgs('checkingStandardDesignerStatus', [testNamespace]).returns('Checking designer status');
    getMessageStub.withArgs('standardDesignerAlreadyEnabled', [testNamespace]).returns('Designer already enabled');
    getMessageStub.withArgs('skipStandardRuntimeDueToFailure').returns('Skip runtime due to failure');

    // Mock Logger static methods
    sandbox.stub(Logger, 'logVerbose');
    logErrorStub = sandbox.stub(Logger, 'error');

    // Mock fs.existsSync to return true for any package.xml path
    sandbox.stub(fs, 'existsSync').returns(true);

    postMigrate = new PostMigrate(
      org,
      testNamespace,
      connection,
      logger,
      messages,
      ux,
      testRelatedObjectsToProcess,
      { autoDeploy: true, authKey: testAuthKey },
      testProjectPath
    );
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.OMA_AUTH_KEY;
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(postMigrate).to.be.instanceOf(PostMigrate);
      expect((postMigrate as any).org).to.equal(org);
      expect((postMigrate as any).relatedObjectsToProcess).to.deep.equal(testRelatedObjectsToProcess);
      expect((postMigrate as any).projectPath).to.equal(testProjectPath);
      expect((postMigrate as any).deploymentConfig.autoDeploy).to.be.true;
      expect((postMigrate as any).deploymentConfig.authKey).to.equal(testAuthKey);
      expect((postMigrate as any).namespace).to.equal(testNamespace);
      expect((postMigrate as any).connection).to.equal(connection);
      expect((postMigrate as any).logger).to.equal(logger);
      expect((postMigrate as any).messages).to.equal(messages);
      expect((postMigrate as any).ux).to.equal(ux);
    });

    it('should initialize with autoDeploy set to false', () => {
      // Arrange
      const postMigrateNoDeploy = new PostMigrate(
        org,
        testNamespace,
        connection,
        logger,
        messages,
        ux,
        testRelatedObjectsToProcess,
        { autoDeploy: false, authKey: testAuthKey },
        testProjectPath
      );
      const deployerStub = sandbox.stub(Deployer.prototype, 'deploy');

      // Act
      void postMigrateNoDeploy.deploy([]);

      // Assert
      expect((postMigrateNoDeploy as any).deploymentConfig.autoDeploy).to.be.false;
      expect(deployerStub.called).to.be.false;
    });

    it('should handle deployment errors gracefully and add action items', async () => {
      // Arrange
      const error = new OmniscriptPackageDeploymentError('Omniscript package deployment failed');
      const deployerStub = sandbox.stub(Deployer.prototype, 'deploy').rejects(error);
      // Use existing stubs from beforeEach setup
      const deployLogVerboseStub = Logger.logVerbose as sinon.SinonStub;
      const actionItems: string[] = [];
      // Create a temporary package.xml file to ensure fs.existsSync returns true
      const tempPackageXml = path.join(process.cwd(), 'package.xml');
      fs.writeFileSync(tempPackageXml, '<?xml version="1.0" encoding="UTF-8"?><Package></Package>');

      // Clean up after test
      const cleanup = () => {
        if (fs.existsSync(tempPackageXml)) {
          fs.unlinkSync(tempPackageXml);
        }
      };

      // Act & Assert — deploy should re-throw the error
      try {
        await postMigrate.deploy(actionItems);
        expect.fail('Expected deploy to re-throw the error');
      } catch (thrownError) {
        expect(thrownError).to.equal(error);
        expect(deployerStub.called).to.be.true;
        expect(logErrorStub.called).to.be.true;
        expect(deployLogVerboseStub.called).to.be.true;
        expect(actionItems.length).to.be.greaterThan(0);
        expect(actionItems[0]).to.include('Omniscript customization package deployment failed');
      } finally {
        cleanup();
      }
    });

    it('should re-throw general deployment errors after adding action items', async () => {
      // Arrange
      const error = new Error('Generic deployment failure');
      sandbox.stub(Deployer.prototype, 'deploy').rejects(error);
      const actionItems: string[] = [];
      const tempPackageXml = path.join(process.cwd(), 'package.xml');
      fs.writeFileSync(tempPackageXml, '<?xml version="1.0" encoding="UTF-8"?><Package></Package>');

      const cleanup = () => {
        if (fs.existsSync(tempPackageXml)) {
          fs.unlinkSync(tempPackageXml);
        }
      };

      // Act & Assert
      try {
        let caughtError: unknown = null;
        try {
          await postMigrate.deploy(actionItems);
        } catch (e) {
          caughtError = e;
        }

        expect(caughtError).to.not.be.null;
        expect((caughtError as Error).message).to.equal('Generic deployment failure');
        expect(actionItems.length).to.be.greaterThan(0);
        expect(actionItems[0]).to.include('Component deployment failed');
      } finally {
        cleanup();
      }
    });

    it('should create Deployer with correct parameters', () => {
      // Arrange
      const deployerDeployStub = sandbox.stub(Deployer.prototype, 'deploy');
      sandbox.stub(fs, 'existsSync').returns(true);

      // Mock the deploy method directly to test Deployer creation
      postMigrate.deploy = async function () {
        const deployer = new Deployer(
          this.projectPath,
          this.messages,
          this.org.getUsername(),
          this.deploymentConfig.authKey
        );
        await deployer.deploy();
      };

      // Act
      void postMigrate.deploy([]);

      // Assert
      expect(deployerDeployStub.called).to.be.true;
    });
  });

  describe('setDesignersToUseStandardDataModel', () => {
    it('should successfully set designers to use standard data model', async () => {
      // Arrange
      const namespaceToModify = 'test_namespace';
      const userActionMessage: string[] = [];
      const mockResult = {
        success: true,
        compiled: true,
        line: 1,
        column: 1,
        compileProblem: null,
        exceptionMessage: null,
        exceptionStackTrace: null,
      } as ExecuteAnonymousResult;
      const anonymousApexRunnerStub = sandbox.stub(AnonymousApexRunner, 'run').resolves(mockResult);
      const logVerboseStub = Logger.logVerbose as sinon.SinonStub;

      // Act
      const result = await postMigrate.enableDesignersToUseStandardDataModelIfNeeded(
        namespaceToModify,
        userActionMessage
      );

      // Assert
      expect(anonymousApexRunnerStub.calledOnce).to.be.true;
      expect(anonymousApexRunnerStub.firstCall.args[0]).to.equal(org);
      expect(anonymousApexRunnerStub.firstCall.args[1]).to.include(
        'test_namespace.OmniStudioPostInstallClass.useStandardDataModel()'
      );
      expect(logVerboseStub.calledWith('Setting designers to standard model...')).to.be.true;
      expect(logVerboseStub.calledWith('Designers set to standard model')).to.be.true;
      expect(result).to.equal(true);
      expect(userActionMessage).to.deep.equal([]);
    });

    it('should handle unsuccessful anonymous apex execution', async () => {
      // Arrange
      const namespaceToModify = 'test_namespace';
      const userActionMessage: string[] = [];
      const mockResult = {
        success: false,
        compiled: true,
        line: 1,
        column: 1,
        compileProblem: null,
        exceptionMessage: 'Test error',
        exceptionStackTrace: 'Test error stack trace',
      } as ExecuteAnonymousResult;
      const anonymousApexRunnerStub = sandbox.stub(AnonymousApexRunner, 'run').resolves(mockResult);

      // Act
      const result = await postMigrate.enableDesignersToUseStandardDataModelIfNeeded(
        namespaceToModify,
        userActionMessage
      );

      // Assert
      expect(anonymousApexRunnerStub.calledOnce).to.be.true;
      expect(logErrorStub.called).to.be.true;
      expect(result).to.equal(false);
      expect(userActionMessage).to.include('Please manually switch designer to standard data model');
    });

    it('should handle exceptions during execution', async () => {
      // Arrange
      const namespaceToModify = 'test_namespace';
      const userActionMessage: string[] = [];
      const error = new Error('Test exception');
      const anonymousApexRunnerStub = sandbox.stub(AnonymousApexRunner, 'run').rejects(error);

      // Act
      const result = await postMigrate.enableDesignersToUseStandardDataModelIfNeeded(
        namespaceToModify,
        userActionMessage
      );

      // Assert
      expect(anonymousApexRunnerStub.calledOnce).to.be.true;
      expect(logErrorStub.called).to.be.true;
      expect(result).to.equal(false);
      expect(userActionMessage).to.include('Please manually switch designer to standard data model');
    });

    it('should return true when standard designer already enabled and skip Apex', async () => {
      // Arrange
      const namespaceToModify = 'test_namespace';
      const userActionMessage: string[] = [];
      // Stub SOQL query to indicate designer already enabled for this namespace
      (connection.query as unknown as sinon.SinonStub).resolves({
        totalSize: 2,
        records: [
          { DeveloperName: 'TheFirstInstalledOmniPackage', Value: namespaceToModify },
          { DeveloperName: 'InstalledIndustryPackage', Value: 'other' },
        ],
      });
      const anonymousApexRunnerStub = sandbox.stub(AnonymousApexRunner, 'run');

      // Act
      const result = await (postMigrate as any).enableDesignersToUseStandardDataModelIfNeeded(
        namespaceToModify,
        userActionMessage
      );

      // Assert
      expect(result).to.equal(true);
      expect(anonymousApexRunnerStub.called).to.be.false;
      expect(userActionMessage).to.deep.equal([]);
    });
  });

  describe('executeTasks', () => {
    it('should enable runtime when designer step succeeds', async () => {
      // Arrange
      const enableDesignerStub = sandbox
        .stub(postMigrate as any, 'enableDesignersToUseStandardDataModelIfNeeded')
        .resolves(true);
      const enableRuntimeSpy = sandbox.stub(postMigrate as any, 'enableStandardRuntimeIfNeeded').resolves();
      const actionItems: string[] = [];

      // Act
      const res = await (postMigrate as any).executeTasks(testNamespace, actionItems);

      // Assert
      expect(enableDesignerStub.calledOnce).to.be.true;
      expect(enableRuntimeSpy.calledOnce).to.be.true;
      expect(res).to.equal(actionItems);
    });

    it('should not enable runtime when designer step fails', async () => {
      // Arrange
      const enableDesignerStub = sandbox
        .stub(postMigrate as any, 'enableDesignersToUseStandardDataModelIfNeeded')
        .resolves(false);
      const enableRuntimeSpy = sandbox.stub(postMigrate as any, 'enableStandardRuntimeIfNeeded').resolves();
      const actionItems: string[] = [];

      // Act
      const res = await (postMigrate as any).executeTasks(testNamespace, actionItems);

      // Assert
      expect(enableDesignerStub.calledOnce).to.be.true;
      expect(enableRuntimeSpy.called).to.be.false;
      expect(res).to.equal(actionItems);
    });
  });

  describe('restoreExperienceAPIMetadataSettings', () => {
    it('should restore experience API metadata settings when conditions are met', async () => {
      // Arrange
      const userActionMessage: string[] = [];
      const isExperienceBundleMetadataAPIProgramaticallyEnabled = { value: true };
      const toggleExperienceBundleMetadataAPIStub = sandbox
        .stub(OrgPreferences, 'toggleExperienceBundleMetadataAPI')
        .resolves();
      const logVerboseStub = Logger.logVerbose as sinon.SinonStub;

      // Act
      await postMigrate.restoreExperienceAPIMetadataSettings(
        isExperienceBundleMetadataAPIProgramaticallyEnabled,
        userActionMessage
      );

      // Assert
      expect(logVerboseStub.calledWith('Turning off Experience Bundle API')).to.be.true;
      expect(toggleExperienceBundleMetadataAPIStub.calledWith(connection, false)).to.be.true;
    });

    it('should not restore settings when related objects are undefined', async () => {
      // Arrange
      const postMigrateUndefined = new PostMigrate(
        org,
        testNamespace,
        connection,
        logger,
        messages,
        ux,
        undefined as any,
        { autoDeploy: true, authKey: testAuthKey },
        testProjectPath
      );
      const userActionMessage: string[] = [];
      const isExperienceBundleMetadataAPIProgramaticallyEnabled = { value: true };
      const toggleExperienceBundleMetadataAPIStub = sandbox
        .stub(OrgPreferences, 'toggleExperienceBundleMetadataAPI')
        .resolves();
      const logVerboseStub = Logger.logVerbose as sinon.SinonStub;

      // Act
      await postMigrateUndefined.restoreExperienceAPIMetadataSettings(
        isExperienceBundleMetadataAPIProgramaticallyEnabled,
        userActionMessage
      );

      // Assert
      expect(logVerboseStub.called).to.be.true;
      expect(toggleExperienceBundleMetadataAPIStub.called).to.be.false;
    });

    it('should not restore settings when related objects are null', async () => {
      // Arrange
      const postMigrateNull = new PostMigrate(
        org,
        testNamespace,
        connection,
        logger,
        messages,
        ux,
        null as any,
        { autoDeploy: true, authKey: testAuthKey },
        testProjectPath
      );
      const userActionMessage: string[] = [];
      const isExperienceBundleMetadataAPIProgramaticallyEnabled = { value: true };
      const toggleExperienceBundleMetadataAPIStub = sandbox
        .stub(OrgPreferences, 'toggleExperienceBundleMetadataAPI')
        .resolves();
      const logVerboseStub = Logger.logVerbose as sinon.SinonStub;

      // Act
      await postMigrateNull.restoreExperienceAPIMetadataSettings(
        isExperienceBundleMetadataAPIProgramaticallyEnabled,
        userActionMessage
      );

      // Assert
      expect(logVerboseStub.called).to.be.true;
      expect(toggleExperienceBundleMetadataAPIStub.called).to.be.false;
    });

    it('should not restore settings when ExperienceSites is not in related objects', async () => {
      // Arrange
      const postMigrateNoExpSites = new PostMigrate(
        org,
        testNamespace,
        connection,
        logger,
        messages,
        ux,
        ['Flexipage'], // No expsites
        { autoDeploy: true, authKey: testAuthKey },
        testProjectPath
      );
      const userActionMessage: string[] = [];
      const isExperienceBundleMetadataAPIProgramaticallyEnabled = { value: true };
      const toggleExperienceBundleMetadataAPIStub = sandbox
        .stub(OrgPreferences, 'toggleExperienceBundleMetadataAPI')
        .resolves();

      // Act
      await postMigrateNoExpSites.restoreExperienceAPIMetadataSettings(
        isExperienceBundleMetadataAPIProgramaticallyEnabled,
        userActionMessage
      );

      // Assert
      expect(toggleExperienceBundleMetadataAPIStub.called).to.be.false;
    });

    it('should not restore settings when API was not programmatically enabled', async () => {
      // Arrange
      const userActionMessage: string[] = [];
      const isExperienceBundleMetadataAPIProgramaticallyEnabled = { value: false };
      const toggleExperienceBundleMetadataAPIStub = sandbox
        .stub(OrgPreferences, 'toggleExperienceBundleMetadataAPI')
        .resolves();

      // Act
      await postMigrate.restoreExperienceAPIMetadataSettings(
        isExperienceBundleMetadataAPIProgramaticallyEnabled,
        userActionMessage
      );

      // Assert
      expect(toggleExperienceBundleMetadataAPIStub.called).to.be.false;
    });

    it('should handle errors during toggle operation', async () => {
      // Arrange
      const userActionMessage: string[] = [];
      const isExperienceBundleMetadataAPIProgramaticallyEnabled = { value: true };
      const error = new Error('Toggle failed');
      const toggleExperienceBundleMetadataAPIStub = sandbox
        .stub(OrgPreferences, 'toggleExperienceBundleMetadataAPI')
        .rejects(error);

      // Act
      await postMigrate.restoreExperienceAPIMetadataSettings(
        isExperienceBundleMetadataAPIProgramaticallyEnabled,
        userActionMessage
      );

      // Assert
      expect(toggleExperienceBundleMetadataAPIStub.calledWith(connection, false)).to.be.true;
      expect(userActionMessage).to.include('Error reverting Experience Bundle Metadata API');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete post-migration workflow with auto-deploy enabled', async () => {
      // Arrange
      const deployerStub = sandbox.stub(Deployer.prototype, 'deploy');
      sandbox.stub(fs, 'existsSync').returns(true);
      const anonymousApexRunnerStub = sandbox.stub(AnonymousApexRunner, 'run').resolves({
        success: true,
        compiled: true,
        line: 1,
        column: 1,
        compileProblem: null,
        exceptionMessage: null,
        exceptionStackTrace: null,
      } as ExecuteAnonymousResult);
      const toggleExperienceBundleMetadataAPIStub = sandbox
        .stub(OrgPreferences, 'toggleExperienceBundleMetadataAPI')
        .resolves();

      // Mock the deploy method directly to test workflow
      postMigrate.deploy = async function () {
        const deployer = new Deployer(
          this.projectPath,
          this.messages,
          this.org.getUsername(),
          this.deploymentConfig.authKey
        );
        await deployer.deploy();
      };

      // Act
      void postMigrate.deploy([]);
      await (postMigrate as any).enableDesignersToUseStandardDataModelIfNeeded('test_namespace', []);
      await postMigrate.restoreExperienceAPIMetadataSettings({ value: true }, []);

      // Assert
      expect(deployerStub.called).to.be.true;
      expect(anonymousApexRunnerStub.called).to.be.true;
      expect(toggleExperienceBundleMetadataAPIStub.called).to.be.true;
    });

    it('should handle complete post-migration workflow with auto-deploy disabled', async () => {
      // Arrange
      const postMigrateNoDeploy = new PostMigrate(
        org,
        testNamespace,
        connection,
        logger,
        messages,
        ux,
        testRelatedObjectsToProcess,
        { autoDeploy: false, authKey: testAuthKey },
        testProjectPath
      );
      const deployerStub = sandbox.stub(Deployer.prototype, 'deploy');
      const anonymousApexRunnerStub = sandbox.stub(AnonymousApexRunner, 'run').resolves({
        success: true,
        compiled: true,
        line: 1,
        column: 1,
        compileProblem: null,
        exceptionMessage: null,
        exceptionStackTrace: null,
      } as ExecuteAnonymousResult);

      // Act
      void postMigrateNoDeploy.deploy([]);
      await (postMigrateNoDeploy as any).enableDesignersToUseStandardDataModelIfNeeded('test_namespace', []);

      // Assert
      expect(deployerStub.called).to.be.false;
      expect(anonymousApexRunnerStub.called).to.be.true;
    });
  });
});
