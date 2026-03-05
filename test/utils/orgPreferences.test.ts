import { expect } from 'chai';
import { Connection } from '@salesforce/core';
import sinon = require('sinon');
import { OrgPreferences } from '../../src/utils/orgPreferences';

describe('OrgPreferences', () => {
  let connection: Connection;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    connection = {
      metadata: {
        update: sandbox.stub(),
        read: sandbox.stub(),
      },
      query: sandbox.stub(),
    } as unknown as Connection;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('enableOmniPreferences', () => {
    it('should successfully enable OmniStudio preferences', async () => {
      // Arrange
      const metadataUpdateStub = sandbox.stub().resolves();
      connection.metadata.update = metadataUpdateStub;

      // Act
      await OrgPreferences.enableOmniPreferences(connection);

      // Assert
      expect(metadataUpdateStub.calledOnce).to.be.true;
      expect(metadataUpdateStub.firstCall.args[0]).to.equal('OmniStudioSettings');
      expect(metadataUpdateStub.firstCall.args[1]).to.deep.equal([
        {
          fullName: 'OmniStudio',
          disableRollbackFlagsPref: true,
        },
      ]);
    });

    it('should throw error when enabling preferences fails', async () => {
      // Arrange
      const error = new Error('Failed to update metadata');
      connection.metadata.update = sandbox.stub().rejects(error);

      // Act & Assert
      try {
        await OrgPreferences.enableOmniPreferences(connection);
        expect.fail('Expected an error to be thrown');
      } catch (err: unknown) {
        if (err instanceof Error) {
          expect(err.message).to.equal('Failed to enable disableRollbackFlagsPref: Failed to update metadata');
        } else {
          expect.fail('Expected an Error object');
        }
      }
    });
  });

  describe('readDrVersion', () => {
    it('should return true when DR versioning is enabled', async () => {
      // Arrange
      const metadataReadResult = {
        enableOmniStudioDrVersion: 'true',
      };
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.checkDRVersioning(connection);

      // Assert
      expect(result).to.be.true;
      expect(metadataReadStub.calledOnce).to.be.true;
      expect(metadataReadStub.firstCall.args[0]).to.equal('OmniStudioSettings');
      expect(metadataReadStub.firstCall.args[1]).to.deep.equal(['OmniStudioDrVersionOrgPreference']);
    });

    it('should return false when DR versioning is disabled', async () => {
      // Arrange
      const metadataReadResult = {
        enableOmniStudioDrVersion: 'false',
      };
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.checkDRVersioning(connection);

      // Assert
      expect(result).to.be.false;
      expect(metadataReadStub.calledOnce).to.be.true;
    });

    it('should return false when enableOmniStudioDrVersion is not "true"', async () => {
      // Arrange
      const metadataReadResult = {
        enableOmniStudioDrVersion: 'maybe',
      };
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.checkDRVersioning(connection);

      // Assert
      expect(result).to.be.false;
      expect(metadataReadStub.calledOnce).to.be.true;
    });

    it('should return false when enableOmniStudioDrVersion is undefined', async () => {
      // Arrange
      const metadataReadResult = {};
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.checkDRVersioning(connection);

      // Assert
      expect(result).to.be.false;
      expect(metadataReadStub.calledOnce).to.be.true;
    });

    it('should return false when enableOmniStudioDrVersion is null', async () => {
      // Arrange
      const metadataReadResult = {
        enableOmniStudioDrVersion: null,
      };
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.checkDRVersioning(connection);

      // Assert
      expect(result).to.be.false;
      expect(metadataReadStub.calledOnce).to.be.true;
    });

    it('should throw error when metadata read fails', async () => {
      // Arrange
      const error = new Error('Metadata read failed');
      const metadataReadStub = sandbox.stub().rejects(error);
      connection.metadata.read = metadataReadStub;

      // Act & Assert
      try {
        await OrgPreferences.checkDRVersioning(connection);
        expect.fail('Expected an error to be thrown');
      } catch (err: unknown) {
        if (err instanceof Error) {
          expect(err.message).to.equal('Failed to read DR version: Metadata read failed');
        } else {
          expect.fail('Expected an Error object');
        }
      }
    });

    it('should throw error when metadata read fails with non-Error object', async () => {
      // Arrange
      const error = 'String error message';
      const metadataReadStub = sandbox.stub().rejects(error);
      connection.metadata.read = metadataReadStub;

      // Act & Assert
      try {
        await OrgPreferences.checkDRVersioning(connection);
        expect.fail('Expected an error to be thrown');
      } catch (err: unknown) {
        if (err instanceof Error) {
          expect(err.message).to.equal('Failed to read DR version: ');
        } else {
          expect.fail('Expected an Error object');
        }
      }
    });

    it('should handle boolean true value correctly', async () => {
      // Arrange
      const metadataReadResult = {
        enableOmniStudioDrVersion: true,
      };
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.checkDRVersioning(connection);

      // Assert
      expect(result).to.be.false; // Should be false because it's not the string 'true'
      expect(metadataReadStub.calledOnce).to.be.true;
    });

    it('should handle boolean false value correctly', async () => {
      // Arrange
      const metadataReadResult = {
        enableOmniStudioDrVersion: false,
      };
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.checkDRVersioning(connection);

      // Assert
      expect(result).to.be.false;
      expect(metadataReadStub.calledOnce).to.be.true;
    });
  });

  describe('checkRollbackFlags', () => {
    it('should return empty array when no flags are enabled', async () => {
      // Arrange
      const queryResult = {
        records: [
          { DeveloperName: 'RollbackIPChanges', Value: 'false' },
          { DeveloperName: 'RollbackDRChanges', Value: 'false' },
          { DeveloperName: 'RollbackOSChanges', Value: 'false' },
        ],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.checkRollbackFlags(connection);

      // Assert
      expect(result).to.be.an('array').that.is.empty;
      expect(queryStub.calledOnce).to.be.true;
      expect(queryStub.firstCall.args[0]).to.include('SELECT DeveloperName, Value FROM OmniInteractionConfig');
    });

    it('should return array of enabled flags', async () => {
      // Arrange
      const queryResult = {
        records: [
          { DeveloperName: 'RollbackIPChanges', Value: 'true' },
          { DeveloperName: 'RollbackDRChanges', Value: 'false' },
          { DeveloperName: 'RollbackOSChanges', Value: 'true' },
        ],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.checkRollbackFlags(connection);

      // Assert
      expect(result).to.deep.equal(['RollbackIPChanges', 'RollbackOSChanges']);
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should throw error when checking flags fails', async () => {
      // Arrange
      const error = new Error('Failed to query');
      connection.query = sandbox.stub().rejects(error);

      // Act & Assert
      try {
        await OrgPreferences.checkRollbackFlags(connection);
        expect.fail('Expected an error to be thrown');
      } catch (err: unknown) {
        if (err instanceof Error) {
          expect(err.message).to.equal('Failed to check rollback flags: Failed to query');
        } else {
          expect.fail('Expected an Error object');
        }
      }
    });

    it('should return empty array and warn when INVALID_TYPE error occurs for OmniInteractionConfig', async () => {
      // Arrange
      const error = {
        errorCode: 'INVALID_TYPE',
        message: "sObject type 'OmniInteractionConfig' is not supported",
      };
      const queryStub = sandbox.stub().rejects(error);
      connection.query = queryStub;
      const loggerWarnStub = sandbox.stub();

      // Mock Logger.warn
      const LoggerModule = await import('../../src/utils/logger');
      sandbox.stub(LoggerModule.Logger, 'warn').callsFake(loggerWarnStub);

      // Act
      const result = await OrgPreferences.checkRollbackFlags(connection);

      // Assert
      expect(result).to.be.an('array').that.is.empty;
      expect(loggerWarnStub.calledOnce).to.be.true;
      expect(loggerWarnStub.firstCall.args[0]).to.include('Omnistudio permissions');
    });
  });

  describe('isExperienceBundleMetadataAPIEnabled', () => {
    it('should return true when result is an array with enableExperienceBundleMetadata set to true', async () => {
      // Arrange
      const metadataReadResult = [
        {
          fullName: 'ExperienceBundle',
          enableExperienceBundleMetadata: 'true',
        },
      ];
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(connection);

      // Assert
      expect(result).to.be.true;
      expect(metadataReadStub.calledOnce).to.be.true;
      expect(metadataReadStub.firstCall.args[0]).to.equal('ExperienceBundleSettings');
      expect(metadataReadStub.firstCall.args[1]).to.deep.equal(['ExperienceBundle']);
    });

    it('should return false when result is an array with enableExperienceBundleMetadata set to false', async () => {
      // Arrange
      const metadataReadResult = [
        {
          fullName: 'ExperienceBundle',
          enableExperienceBundleMetadata: 'false',
        },
      ];
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(connection);

      // Assert
      expect(result).to.be.false;
    });

    it('should return true when result is an object with enableExperienceBundleMetadata set to true', async () => {
      // Arrange
      const metadataReadResult = {
        fullName: 'ExperienceBundle',
        enableExperienceBundleMetadata: 'true',
      };
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(connection);

      // Assert
      expect(result).to.be.true;
    });

    it('should return false when result is an object with enableExperienceBundleMetadata set to false', async () => {
      // Arrange
      const metadataReadResult = {
        fullName: 'ExperienceBundle',
        enableExperienceBundleMetadata: 'false',
      };
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(connection);

      // Assert
      expect(result).to.be.false;
    });

    it('should return false when result is an empty array', async () => {
      // Arrange
      const metadataReadResult: unknown[] = [];
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(connection);

      // Assert
      expect(result).to.be.false;
    });

    it('should return false when result is null', async () => {
      // Arrange
      const metadataReadResult = null;
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(connection);

      // Assert
      expect(result).to.be.false;
    });

    it('should return false when result is undefined', async () => {
      // Arrange
      const metadataReadResult = undefined;
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(connection);

      // Assert
      expect(result).to.be.false;
    });

    it('should return false when result is an object without enableExperienceBundleMetadata property', async () => {
      // Arrange
      const metadataReadResult = {
        fullName: 'ExperienceBundle',
        someOtherProperty: 'value',
      };
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(connection);

      // Assert
      expect(result).to.be.false;
    });

    it('should return false when metadata read throws an error', async () => {
      // Arrange
      const error = new Error('Metadata read failed');
      const metadataReadStub = sandbox.stub().rejects(error);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(connection);

      // Assert
      expect(result).to.be.false;
    });

    it('should return false when result is an array with enableExperienceBundleMetadata set to non-boolean string', async () => {
      // Arrange
      const metadataReadResult = [
        {
          fullName: 'ExperienceBundle',
          enableExperienceBundleMetadata: 'maybe',
        },
      ];
      const metadataReadStub = sandbox.stub().resolves(metadataReadResult);
      connection.metadata.read = metadataReadStub;

      // Act
      const result = await OrgPreferences.isExperienceBundleMetadataAPIEnabled(connection);

      // Assert
      expect(result).to.be.false;
    });
  });

  describe('setExperienceBundleMetadataAPI', () => {
    it('should successfully enable ExperienceBundle Metadata API and return true', async () => {
      // Arrange
      const metadataUpdateStub = sandbox.stub().resolves();
      connection.metadata.update = metadataUpdateStub;

      // Act
      const result = await OrgPreferences.setExperienceBundleMetadataAPI(connection, true);

      // Assert
      expect(result).to.be.true;
      expect(metadataUpdateStub.calledOnce).to.be.true;
      expect(metadataUpdateStub.firstCall.args[0]).to.equal('ExperienceBundleSettings');
      expect(metadataUpdateStub.firstCall.args[1]).to.deep.equal([
        {
          fullName: 'ExperienceBundle',
          enableExperienceBundleMetadata: true,
        },
      ]);
    });

    it('should successfully disable ExperienceBundle Metadata API and return true', async () => {
      // Arrange
      const metadataUpdateStub = sandbox.stub().resolves();
      connection.metadata.update = metadataUpdateStub;

      // Act
      const result = await OrgPreferences.setExperienceBundleMetadataAPI(connection, false);

      // Assert
      expect(result).to.be.true;
      expect(metadataUpdateStub.calledOnce).to.be.true;
      expect(metadataUpdateStub.firstCall.args[0]).to.equal('ExperienceBundleSettings');
      expect(metadataUpdateStub.firstCall.args[1]).to.deep.equal([
        {
          fullName: 'ExperienceBundle',
          enableExperienceBundleMetadata: false,
        },
      ]);
    });

    it('should return false when metadata update fails', async () => {
      // Arrange
      const error = new Error('Metadata update failed');
      const metadataUpdateStub = sandbox.stub().rejects(error);
      connection.metadata.update = metadataUpdateStub;

      // Act
      const result = await OrgPreferences.setExperienceBundleMetadataAPI(connection, true);

      // Assert
      expect(result).to.be.false;
      expect(metadataUpdateStub.calledOnce).to.be.true;
    });

    it('should return false when metadata update fails with non-Error object', async () => {
      // Arrange
      const error = 'String error message';
      const metadataUpdateStub = sandbox.stub().rejects(error);
      connection.metadata.update = metadataUpdateStub;

      // Act
      const result = await OrgPreferences.setExperienceBundleMetadataAPI(connection, false);

      // Assert
      expect(result).to.be.false;
      expect(metadataUpdateStub.calledOnce).to.be.true;
    });

    it('should handle undefined error gracefully and return false', async () => {
      // Arrange
      const metadataUpdateStub = sandbox.stub().rejects(undefined);
      connection.metadata.update = metadataUpdateStub;

      // Act
      const result = await OrgPreferences.setExperienceBundleMetadataAPI(connection, true);

      // Assert
      expect(result).to.be.false;
      expect(metadataUpdateStub.calledOnce).to.be.true;
    });
  });

  describe('isStandardDesignerEnabled', () => {
    it('should return true when namespace matches TheFirstInstalledOmniPackage value', async () => {
      // Arrange
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
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'vlocity_ins');

      // Assert
      expect(result).to.be.true;
      expect(queryStub.calledOnce).to.be.true;
      expect(queryStub.firstCall.args[0]).to.include('SELECT DeveloperName, Value FROM OmniInteractionConfig');
      expect(queryStub.firstCall.args[0]).to.include('TheFirstInstalledOmniPackage');
      expect(queryStub.firstCall.args[0]).to.include('InstalledIndustryPackage');
    });

    it('should return true when namespace matches InstalledIndustryPackage value', async () => {
      // Arrange
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
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'vlocity_cmt');

      // Assert
      expect(result).to.be.true;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when namespace does not match any value', async () => {
      // Arrange
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
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'omnistudio');

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when totalSize is 0', async () => {
      // Arrange
      const queryResult = {
        totalSize: 0,
        records: [],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'vlocity_ins');

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when totalSize is null', async () => {
      // Arrange
      const queryResult = {
        totalSize: null,
        records: [],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'vlocity_ins');

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when totalSize is undefined', async () => {
      // Arrange
      const queryResult = {
        records: [],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'vlocity_ins');

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when records array is empty', async () => {
      // Arrange
      const queryResult = {
        totalSize: 0,
        records: [],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'vlocity_ins');

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should handle case-sensitive namespace comparison', async () => {
      // Arrange
      const queryResult = {
        totalSize: 1,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: 'vlocity_ins',
          },
        ],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'Vlocity_ins'); // Wrong case

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when query result is undefined', async () => {
      // Arrange
      const queryStub = sandbox.stub().resolves(undefined);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'vlocity_ins');

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when query result is null', async () => {
      // Arrange
      const queryStub = sandbox.stub().resolves(null);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'vlocity_ins');

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false and warn when INVALID_TYPE error occurs for OmniInteractionConfig', async () => {
      // Arrange
      const error = {
        errorCode: 'INVALID_TYPE',
        message: "sObject type 'OmniInteractionConfig' is not supported",
      };
      const queryStub = sandbox.stub().rejects(error);
      connection.query = queryStub;
      const loggerWarnStub = sandbox.stub();

      // Mock Logger.warn
      const LoggerModule = await import('../../src/utils/logger');
      sandbox.stub(LoggerModule.Logger, 'warn').callsFake(loggerWarnStub);

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'vlocity_ins');

      // Assert
      expect(result).to.be.false;
      expect(loggerWarnStub.calledOnce).to.be.true;
      expect(loggerWarnStub.firstCall.args[0]).to.include('Omnistudio permissions');
    });

    it('should return false when query fails with generic Error object', async () => {
      // Arrange
      const error = new Error('Query failed');
      const queryStub = sandbox.stub().rejects(error);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'vlocity_ins');

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when query fails with non-Error object', async () => {
      // Arrange
      const error = 'String error message';
      const queryStub = sandbox.stub().rejects(error);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isStandardDesignerEnabled(connection, 'vlocity_ins');

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });
  });

  describe('isFoundationPackage', () => {
    it('should return true when foundation package (omnistudio) is the first installed package', async () => {
      // Arrange
      const queryResult = {
        totalSize: 1,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: 'omnistudio',
          },
        ],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.true;
      expect(queryStub.calledOnce).to.be.true;
      expect(queryStub.firstCall.args[0]).to.include('SELECT DeveloperName, Value FROM OmniInteractionConfig');
      expect(queryStub.firstCall.args[0]).to.include("WHERE DeveloperName = 'TheFirstInstalledOmniPackage'");
    });

    it('should return false when a different package is the first installed package', async () => {
      // Arrange
      const queryResult = {
        totalSize: 1,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: 'vlocity_ins',
          },
        ],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when no records are found', async () => {
      // Arrange
      const queryResult = {
        totalSize: 0,
        records: [],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when totalSize is null', async () => {
      // Arrange
      const queryResult = {
        totalSize: null,
        records: [],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when totalSize is undefined', async () => {
      // Arrange
      const queryResult = {
        records: [],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when Value is empty string', async () => {
      // Arrange
      const queryResult = {
        totalSize: 1,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: '',
          },
        ],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when Value is null', async () => {
      // Arrange
      const queryResult = {
        totalSize: 1,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: null,
          },
        ],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when query fails with Error object', async () => {
      // Arrange
      const error = new Error('Query failed');
      const queryStub = sandbox.stub().rejects(error);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when query fails with non-Error object', async () => {
      // Arrange
      const error = 'String error message';
      const queryStub = sandbox.stub().rejects(error);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when query result is undefined', async () => {
      // Arrange
      const queryStub = sandbox.stub().resolves(undefined);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false when query result is null', async () => {
      // Arrange
      const queryStub = sandbox.stub().resolves(null);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should handle case-sensitive package name correctly', async () => {
      // Arrange
      const queryResult = {
        totalSize: 1,
        records: [
          {
            DeveloperName: 'TheFirstInstalledOmniPackage',
            Value: 'OmniStudio', // Wrong case
          },
        ],
      };
      const queryStub = sandbox.stub().resolves(queryResult);
      connection.query = queryStub;

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.false;
      expect(queryStub.calledOnce).to.be.true;
    });

    it('should return false and warn when INVALID_TYPE error occurs for OmniInteractionConfig', async () => {
      // Arrange
      const error = {
        errorCode: 'INVALID_TYPE',
        message: "sObject type 'OmniInteractionConfig' is not supported",
      };
      const queryStub = sandbox.stub().rejects(error);
      connection.query = queryStub;
      const loggerWarnStub = sandbox.stub();

      // Mock Logger.warn
      const LoggerModule = await import('../../src/utils/logger');
      sandbox.stub(LoggerModule.Logger, 'warn').callsFake(loggerWarnStub);

      // Act
      const result = await OrgPreferences.isFoundationPackage(connection);

      // Assert
      expect(result).to.be.false;
      expect(loggerWarnStub.calledOnce).to.be.true;
      expect(loggerWarnStub.firstCall.args[0]).to.include('Omnistudio permissions');
    });
  });
});
