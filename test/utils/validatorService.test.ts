import { expect } from 'chai';
import { Connection, Messages } from '@salesforce/core';
import sinon = require('sinon');
import { ValidatorService } from '../../src/utils/validatorService';
import { Logger } from '../../src/utils/logger';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';
import * as dataModelService from '../../src/utils/dataModelService';
import { OrgPreferences } from '../../src/utils/orgPreferences';

describe('ValidatorService', () => {
  let connection: Connection;
  let messages: Messages<string>;
  let sandbox: sinon.SinonSandbox;
  let loggerWarnStub: sinon.SinonStub;
  let loggerErrorStub: sinon.SinonStub;
  let isStandardDataModelStub: sinon.SinonStub;
  let loggerLogVerboseStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Mock Connection
    connection = {
      query: sandbox.stub(),
    } as unknown as Connection;

    // Mock Messages
    messages = {
      getMessage: sandbox.stub(),
    } as unknown as Messages<string>;

    // Mock Logger
    loggerWarnStub = sandbox.stub(Logger, 'warn');
    loggerErrorStub = sandbox.stub(Logger, 'error');
    loggerLogVerboseStub = sandbox.stub(Logger, 'logVerbose');

    // Mock dataModelService
    isStandardDataModelStub = sandbox.stub(dataModelService, 'isStandardDataModel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('validateNamespace', () => {
    it('should return true and not log warning when namespace is valid', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'ValidNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = validator.validateNamespace();

      // Assert
      expect(result).to.be.true;
      expect(loggerWarnStub.called).to.be.false;
    });

    it('should return false and log error when namespace is invalid', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: false,
        packageDetails: { namespace: 'InvalidNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub)
        .withArgs('unknownNamespace')
        .returns("Org doesn't have Omnistudio namespace(s) configured");
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = validator.validateNamespace();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal("Org doesn't have Omnistudio namespace(s) configured");
    });

    it('should handle missing packageDetails gracefully', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: false,
        packageDetails: null,
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as unknown as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub)
        .withArgs('unknownNamespace')
        .returns("Org doesn't have Omnistudio namespace(s) configured");
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = validator.validateNamespace();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal("Org doesn't have Omnistudio namespace(s) configured");
    });
  });

  describe('validatePackageInstalled', () => {
    it('should return true when package is installed', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = validator.validatePackageInstalled();

      // Assert
      expect(result).to.be.true;
      expect(loggerErrorStub.called).to.be.false;
    });

    it('should return false and log error when package is not installed (null)', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: null,
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as unknown as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub).withArgs('noPackageInstalled').returns('No package installed');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = validator.validatePackageInstalled();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('No package installed');
    });

    it('should return false and log error when package is not installed (undefined)', () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: undefined,
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as unknown as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub).withArgs('noPackageInstalled').returns('No package installed');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = validator.validatePackageInstalled();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('No package installed');
    });
  });

  describe('validateOmniStudioLicenses', () => {
    it('should return true when licenses exist with count > 0', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.true;
      expect(loggerErrorStub.called).to.be.false;
      expect((connection.query as sinon.SinonStub).calledOnce).to.be.true;
      expect((connection.query as sinon.SinonStub).firstCall.args[0]).to.include(
        "SELECT count(DeveloperName) total FROM PermissionSetLicense WHERE PermissionSetLicenseKey LIKE 'OmniStudio%' AND Status = 'Active'"
      );
    });

    it('should return true when count is exactly 1', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '1' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.true;
      expect(loggerErrorStub.called).to.be.false;
    });

    it('should return false and log error when no licenses exist (empty records)', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub).withArgs('noOmniStudioLicenses').returns('No licenses found');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('No licenses found');
    });

    it('should return false and log error when license count is 0', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '0' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub).withArgs('noOmniStudioLicenses').returns('No licenses found');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('No licenses found');
    });

    it('should return false when query result is null', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      (connection.query as sinon.SinonStub).resolves(null);
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
    });

    it('should return false when query result has no records property', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {};
      (connection.query as sinon.SinonStub).resolves(queryResult);
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
    });

    it('should return false and log error when query throws Error', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const error = new Error('Database connection failed');
      (connection.query as sinon.SinonStub).rejects(error);
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal(
        'Error validating OmniStudio licenses: Database connection failed'
      );
    });

    it('should return false and log generic error when query throws non-Error object', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const error = 'String error message';
      (connection.query as sinon.SinonStub).rejects(error);
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('Error validating OmniStudio licenses: Unknown error');
    });

    it('should handle string counts correctly', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '10' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.true;
    });

    it('should handle non-numeric string counts as 0', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: 'invalid' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub).withArgs('noOmniStudioLicenses').returns('No licenses found');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniStudioLicenses();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
    });
  });

  describe('validateDrVersioningDisabled', () => {
    it('should return true when DR versioning is disabled', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningDisabled').returns('DR versioning is disabled');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.true;
      expect(loggerLogVerboseStub.calledWith('Validating DR versioning disabled')).to.be.true;
      expect(loggerLogVerboseStub.calledWith('DR versioning is disabled')).to.be.true;
    });

    it('should return false when DR versioning is enabled', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(true);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningEnabled').returns('DR versioning is enabled');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating DR versioning disabled')).to.be.true;
      expect(loggerErrorStub.calledWith('DR versioning is enabled')).to.be.true;
    });

    it('should return false when DR versioning check throws error', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').rejects(new Error('Connection failed'));
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub)
        .withArgs('errorValidatingDrVersioning')
        .returns('Error validating DR versioning');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating DR versioning disabled')).to.be.true;
      expect(loggerErrorStub.calledWith('Error validating DR versioning')).to.be.true;
    });
  });

  describe('validateOmniInteractionConfig', () => {
    it('should return true when totalSize is 1 and DeveloperName is TheFirstInstalledOmniPackage with foundation package', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: true,
      } as OmnistudioOrgDetails;
      const queryResult = {
        totalSize: 1,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: 'omnistudio',
          },
        ],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      (messages.getMessage as sinon.SinonStub).withArgs('queryResultSize', [1]).returns('Query returned 1 result');
      (messages.getMessage as sinon.SinonStub).withArgs('packageDetails').returns('Package details found');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.true;
      expect((connection.query as sinon.SinonStub).calledOnce).to.be.true;
      expect((connection.query as sinon.SinonStub).firstCall.args[0]).to.include(
        'SELECT DeveloperName, Value FROM OmniInteractionConfig'
      );
      expect((connection.query as sinon.SinonStub).firstCall.args[0]).to.include(
        "WHERE DeveloperName IN ('TheFirstInstalledOmniPackage', 'InstalledIndustryPackage')"
      );
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
      expect(loggerLogVerboseStub.calledWith('Query returned 1 result')).to.be.true;
      expect(loggerLogVerboseStub.calledWith('Package details found')).to.be.true;
    });

    it('should return false when totalSize is 1 but DeveloperName is not TheFirstInstalledOmniPackage', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        totalSize: 1,
        records: [
          {
            DeveloperName: 'InstalledIndustryPackage',
            Value: 'omnistudio',
          },
        ],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      (messages.getMessage as sinon.SinonStub).withArgs('queryResultSize', [1]).returns('Query returned 1 result');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
      expect(loggerLogVerboseStub.calledWith('Query returned 1 result')).to.be.true;
    });

    it('should return false when totalSize is 1 but Value is not foundation package', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        totalSize: 1,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: 'vlocity_ins',
          },
        ],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      (messages.getMessage as sinon.SinonStub).withArgs('queryResultSize', [1]).returns('Query returned 1 result');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
    });

    it('should return false when totalSize is 2 and first record has foundation package value', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        totalSize: 2,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: 'omnistudio',
          },
          {
            DeveloperName: 'InstalledIndustryPackage',
            Value: 'vlocity_ins',
          },
        ],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      (messages.getMessage as sinon.SinonStub).withArgs('queryResultSize', [2]).returns('Query returned 2 results');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
      expect(loggerLogVerboseStub.calledWith('Query returned 2 results')).to.be.true;
    });

    it('should return false when totalSize is 2 and second record has foundation package value', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        totalSize: 2,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: 'vlocity_ins',
          },
          {
            DeveloperName: 'InstalledIndustryPackage',
            Value: 'omnistudio',
          },
        ],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      (messages.getMessage as sinon.SinonStub).withArgs('queryResultSize', [2]).returns('Query returned 2 results');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
      expect(loggerLogVerboseStub.calledWith('Query returned 2 results')).to.be.true;
    });

    it('should return true when totalSize is 2 and both records have the same non-foundation package value', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        totalSize: 2,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: 'vlocity_ins',
          },
          {
            DeveloperName: 'InstalledIndustryPackage',
            Value: 'vlocity_ins',
          },
        ],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      (messages.getMessage as sinon.SinonStub).withArgs('queryResultSize', [2]).returns('Query returned 2 results');
      (messages.getMessage as sinon.SinonStub)
        .withArgs('packagesHaveSameValue')
        .returns('Both packages have the same value');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.true;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
      expect(loggerLogVerboseStub.calledWith('Query returned 2 results')).to.be.true;
      expect(loggerLogVerboseStub.calledWith('Both packages have the same value')).to.be.true;
    });

    it('should return false when totalSize is 2 and records have different non-foundation package values', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        totalSize: 2,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: 'vlocity_ins',
          },
          {
            DeveloperName: 'InstalledIndustryPackage',
            Value: 'vlocity_cmt',
          },
        ],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      (messages.getMessage as sinon.SinonStub).withArgs('queryResultSize', [2]).returns('Query returned 2 results');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
      expect(loggerLogVerboseStub.calledWith('Query returned 2 results')).to.be.true;
    });

    it('should return false when totalSize is 0', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        totalSize: 0,
        records: [],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
    });

    it('should return false when totalSize is greater than 2', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        totalSize: 3,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: 'vlocity_ins',
          },
          {
            DeveloperName: 'InstalledIndustryPackage',
            Value: 'vlocity_ins',
          },
          {
            DeveloperName: 'SomeOtherPackage',
            Value: 'vlocity_cmt',
          },
        ],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
    });

    it('should return false when query result is null', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      (connection.query as sinon.SinonStub).resolves(null);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
    });

    it('should return false when query result is undefined', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      (connection.query as sinon.SinonStub).resolves(undefined);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
    });

    it('should return false when query throws an Error', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const error = new Error('Query failed');
      (connection.query as sinon.SinonStub).rejects(error);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      (messages.getMessage as sinon.SinonStub)
        .withArgs('failedToCheckPackagesValue')
        .returns('Failed to check packages value');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
      expect(loggerErrorStub.calledWith('Failed to check packages value')).to.be.true;
    });

    it('should return false when query throws a non-Error object', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const error = 'String error message';
      (connection.query as sinon.SinonStub).rejects(error);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      (messages.getMessage as sinon.SinonStub)
        .withArgs('failedToCheckPackagesValue')
        .returns('Failed to check packages value');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
      expect(loggerErrorStub.calledWith('Failed to check packages value')).to.be.true;
    });

    it('should handle case-sensitive package name correctly', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        totalSize: 1,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: 'OmniStudio', // Wrong case
          },
        ],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      (messages.getMessage as sinon.SinonStub).withArgs('queryResultSize', [1]).returns('Query returned 1 result');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
    });

    it('should handle empty string values in records', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        totalSize: 1,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: '',
          },
        ],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingOmniInteractionConfig')
        .returns('Validating OmniInteractionConfig');
      (messages.getMessage as sinon.SinonStub).withArgs('queryResultSize', [1]).returns('Query returned 1 result');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validateOmniInteractionConfig();

      // Assert
      expect(result).to.be.false;
      expect(loggerLogVerboseStub.calledWith('Validating OmniInteractionConfig')).to.be.true;
    });
  });

  describe('validate', () => {
    it('should return true when all validations pass for custom data model', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningDisabled').returns('DR versioning is disabled');
      isStandardDataModelStub.returns(false); // Custom data model
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.true;
    });

    it('should return true for standard data model when metadata is not enabled', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      isStandardDataModelStub.returns(true); // Standard data model
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);

      // Mock the OmniInteractionConfig query that's called by validateOmniInteractionConfig
      (connection.query as sinon.SinonStub).resolves({
        totalSize: 1,
        records: [{ DeveloperName: 'TheFirstInstalledOmniPackage', Value: 'omnistudio' }],
      });

      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.true;
      expect((connection.query as sinon.SinonStub).calledOnce).to.be.true; // OmniInteractionConfig query is called
    });

    it('should return false when package validation fails', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: null,
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as unknown as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub).withArgs('noPackageInstalled').returns('No package');
      isStandardDataModelStub.returns(false);
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
    });

    it('should return false when license validation fails for custom data model', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub).withArgs('noOmniStudioLicenses').returns('No licenses');
      isStandardDataModelStub.returns(false); // Custom data model
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
    });

    it('should return false when license query throws error for custom data model', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const error = new Error('Connection error');
      (connection.query as sinon.SinonStub).rejects(error);
      isStandardDataModelStub.returns(false); // Custom data model
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
    });

    it('should return false when namespace validation fails even if other validations pass', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: false,
        packageDetails: { namespace: 'InvalidNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('unknownNamespace')
        .returns("Org doesn't have Omnistudio namespace(s) configured");
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningDisabled').returns('DR versioning is disabled');
      isStandardDataModelStub.returns(false);
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false; // Should fail because namespace validation now returns false
      expect(loggerErrorStub.calledOnce).to.be.true; // Error should be logged
    });

    it('should return false when DR versioning validation fails', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(true);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningEnabled').returns('DR versioning is enabled');
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate();

      // Assert
      expect(result).to.be.false;
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('DR versioning is enabled');
    });
  });

  describe('validate with isAssessment parameter', () => {
    it('should skip license check when isAssessment is true for custom data model', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningDisabled').returns('DR versioning is disabled');
      (messages.getMessage as sinon.SinonStub)
        .withArgs('skippingLicenseCheckForAssessment')
        .returns('Skipping OmniStudio license check for assessment');
      isStandardDataModelStub.returns(false); // Custom data model
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate(true); // isAssessment = true

      // Assert
      expect(result).to.be.true;
      expect((connection.query as sinon.SinonStub).called).to.be.false; // License query should NOT be called
      expect(loggerLogVerboseStub.called).to.be.true; // Should log verbose messages
    });

    it('should run license check when isAssessment is false for custom data model', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningDisabled').returns('DR versioning is disabled');
      isStandardDataModelStub.returns(false); // Custom data model
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate(false); // isAssessment = false

      // Assert
      expect(result).to.be.true;
      expect((connection.query as sinon.SinonStub).calledOnce).to.be.true; // License query SHOULD be called
      expect(loggerLogVerboseStub.calledWith('Skipping OmniStudio license check for assessment')).to.be.false;
    });

    it('should run license check when isAssessment is not provided (defaults to false) for custom data model', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [{ total: '5' }],
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningDisabled').returns('DR versioning is disabled');
      isStandardDataModelStub.returns(false); // Custom data model
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate(); // No parameter, should default to false

      // Assert
      expect(result).to.be.true;
      expect((connection.query as sinon.SinonStub).calledOnce).to.be.true; // License query SHOULD be called
      expect(loggerLogVerboseStub.calledWith('Skipping OmniStudio license check for assessment')).to.be.false;
    });

    it('should not skip license check for standard data model even when isAssessment is true', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: true,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      isStandardDataModelStub.returns(true); // Standard data model
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);

      // Mock the OmniInteractionConfig query that's called by validateOmniInteractionConfig
      (connection.query as sinon.SinonStub).resolves({
        totalSize: 1,
        records: [{ DeveloperName: 'TheFirstInstalledOmniPackage', Value: 'omnistudio' }],
      });

      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate(true); // isAssessment = true

      // Assert
      expect(result).to.be.true;
      expect((connection.query as sinon.SinonStub).calledOnce).to.be.true; // OmniInteractionConfig query IS called
      expect(loggerLogVerboseStub.calledWith('Skipping OmniStudio license check for assessment')).to.be.false;
    });

    it('should return true for assessment mode even when licenses are not available (custom data model)', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [], // No licenses
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningDisabled').returns('DR versioning is disabled');
      (messages.getMessage as sinon.SinonStub)
        .withArgs('skippingLicenseCheckForAssessment')
        .returns('Skipping OmniStudio license check for assessment');
      isStandardDataModelStub.returns(false); // Custom data model
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate(true); // isAssessment = true

      // Assert
      expect(result).to.be.true; // Should pass even without licenses
      expect((connection.query as sinon.SinonStub).called).to.be.false; // License query should NOT be called
      expect(loggerLogVerboseStub.called).to.be.true; // Should log verbose messages
    });

    it('should return false for migration mode when licenses are not available (custom data model)', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      const queryResult = {
        records: [], // No licenses
      };
      (connection.query as sinon.SinonStub).resolves(queryResult);
      (messages.getMessage as sinon.SinonStub).withArgs('noOmniStudioLicenses').returns('No licenses found');
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(false);
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningDisabled').returns('DR versioning is disabled');
      isStandardDataModelStub.returns(false); // Custom data model
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate(false); // isAssessment = false (migration mode)

      // Assert
      expect(result).to.be.false; // Should fail without licenses
      expect((connection.query as sinon.SinonStub).calledOnce).to.be.true; // License query SHOULD be called
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('No licenses found');
    });

    it('should still perform basic validations in assessment mode', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: false, // Invalid namespace
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      (messages.getMessage as sinon.SinonStub)
        .withArgs('unknownNamespace')
        .returns("Org doesn't have Omnistudio namespace(s) configured");
      isStandardDataModelStub.returns(false); // Custom data model
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate(true); // isAssessment = true

      // Assert
      expect(result).to.be.false; // Should still fail basic validation
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal("Org doesn't have Omnistudio namespace(s) configured");
    });

    it('should still check DR versioning in assessment mode', async () => {
      // Arrange
      const orgs: OmnistudioOrgDetails = {
        hasValidNamespace: true,
        packageDetails: { namespace: 'TestNamespace' },
        omniStudioOrgPermissionEnabled: false,
        isFoundationPackage: false,
      } as OmnistudioOrgDetails;
      sandbox.stub(OrgPreferences, 'checkDRVersioning').resolves(true); // DR versioning enabled
      (messages.getMessage as sinon.SinonStub)
        .withArgs('validatingDrVersioningDisabled')
        .returns('Validating DR versioning disabled');
      (messages.getMessage as sinon.SinonStub).withArgs('drVersioningEnabled').returns('DR versioning is enabled');
      isStandardDataModelStub.returns(false); // Custom data model
      const validator = new ValidatorService(orgs, messages, connection);

      // Act
      const result = await validator.validate(true); // isAssessment = true

      // Assert
      expect(result).to.be.false; // Should fail DR versioning check
      expect(loggerErrorStub.calledOnce).to.be.true;
      expect(loggerErrorStub.firstCall.args[0]).to.equal('DR versioning is enabled');
    });
  });
});
