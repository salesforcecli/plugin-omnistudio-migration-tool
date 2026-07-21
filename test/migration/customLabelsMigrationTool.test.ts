/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { expect } from 'chai';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import * as sinon from 'sinon';
import { CustomLabelsMigrationTool } from '../../src/migration/customLabels';
import { Logger } from '../../src/utils/logger';
import * as NetUtils from '../../src/utils/net';

/**
 * Custom Labels Migration Tool Tests
 *
 * This test suite covers the CustomLabelsMigrationTool class functionality including:
 * - Successful custom label migration via clone-custom-labels API
 * - Enhanced error handling for common API failures
 * - User-friendly error messages with actionable guidance
 */

describe('CustomLabelsMigrationTool - API Error Handling', () => {
  let mockConnection: Connection;
  let mockMessages: Messages<string>;
  let mockUx: Ux;
  let mockLogger: Logger;
  let netUtilsStub: sinon.SinonStub;
  let loggerErrorStub: sinon.SinonStub;

  beforeEach(() => {
    // Create mock connection
    mockConnection = {
      getApiVersion: sinon.stub().returns('60.0'),
    } as unknown as Connection;

    // Stub Logger static methods
    loggerErrorStub = sinon.stub(Logger, 'error');
    sinon.stub(Logger, 'log');
    sinon.stub(Logger, 'logVerbose');

    // Mock Messages object with all required messages
    mockMessages = {
      getMessage: sinon.stub().callsFake((key: string, params?: string[]) => {
        const messages: Record<string, string> = {
          startingCustomLabelMigration: 'Starting Custom Labels migration',
          customLabelMigrationCompleted: `Custom Labels migration completed. ${params?.[0]} labels processed out of ${params?.[1]} total`,
          errorDuringCustomLabelMigration: `Error during Custom Labels migration: ${params?.[0]}`,
          customLabelMigrationErrorMessage: "We couldn't complete the Custom Labels migration",
          callingCloneCustomLabelsAPI: `Calling clone-custom-labels API for namespace: ${params?.[0]}`,
          cloneCustomLabelsAPIResponse: `Clone custom labels API response summary: ${params?.[0]} results`,
          errorCallingCloneCustomLabelsAPI: `Error calling clone-custom-labels API: ${params?.[0]}`,
          callingCloneCustomLabelLocalizationsAPI: `Calling clone-custom-label-localizations API for namespace: ${params?.[0]}`,
          cloneCustomLabelLocalizationsAPIResponse: `Clone custom label localizations API response summary: ${params?.[0]} labels with localizations`,
          errorCallingCloneCustomLabelLocalizationsAPI: `Error calling clone-custom-label-localizations API: ${params?.[0]}`,
          skippingCustomLabelTruncation: 'Skipping truncation for Custom Labels',
          customLabelAPIFunctionalityNotEnabled: `The clone-custom-labels API is not enabled in the target org.\n\nPossible causes:\n1. The org does not have OmniStudio properly configured\n2. The required permissions are missing for the connected user\n3. The org version does not support this API endpoint\n\nPlease verify:\n- OmniStudio is installed and properly configured in the target org\n- The connected user has 'Manage OmniStudio' permission\n- The org API version is v60.0 or higher\n\nOriginal error: ${params?.[0]}`,
          customLabelAPIInvalidSession: `Session expired or invalid. Please re-authenticate to the org using 'sf org login web' and try again.\n\nOriginal error: ${params?.[0]}`,
          customLabelAPINotFound: `The clone-custom-labels API endpoint was not found. This may indicate that:\n- The org does not have OmniStudio installed\n- The API version is incompatible\n\nPlease verify OmniStudio installation and org configuration.\n\nOriginal error: ${params?.[0]}`,
          customLabelAPIInsufficientAccess: `Insufficient access to call the clone-custom-labels API. The connected user may be missing required permissions.\n\nPlease verify the user has:\n- 'Manage OmniStudio' permission\n- Appropriate profile or permission set assignments\n\nOriginal error: ${params?.[0]}`,
          customLabelAPIGenericError: `Failed to call clone-custom-labels API. ${params?.[0]}\n\nIf this error persists, please check:\n- Org connectivity and authentication\n- OmniStudio installation status\n- User permissions\n- Network connectivity`,
        };
        return messages[key] || `Mock message for ${key}`;
      }),
    } as unknown as Messages<string>;

    // Mock Ux
    mockUx = {} as Ux;

    // Mock Logger (not actually used since we stub static methods)
    mockLogger = {} as Logger;

    // Stub NetUtils.request
    netUtilsStub = sinon.stub(NetUtils.NetUtils, 'request');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Enhanced Error Messages', () => {
    it('should provide user-friendly error message for FUNCTIONALITY_NOT_ENABLED', async () => {
      const apiError = new Error('FUNCTIONALITY_NOT_ENABLED: This feature is not enabled');
      netUtilsStub.rejects(apiError);

      const tool = new CustomLabelsMigrationTool('testNS', mockConnection, mockLogger, mockMessages, mockUx);

      const result = await tool.migrate();

      expect(result).to.be.an('array').with.length(1);
      expect(result[0].errors).to.be.an('array').with.length(1);

      // Check that Logger.error was called with our enhanced message
      expect(loggerErrorStub.called).to.be.true;

      const errorArg = loggerErrorStub.firstCall.args[0];
      expect(errorArg).to.include('clone-custom-labels API is not enabled');
      expect(errorArg).to.include('OmniStudio properly configured');
      expect(errorArg).to.include('Manage OmniStudio');
      expect(errorArg).to.include('v60.0 or higher');
      expect(errorArg).to.include('FUNCTIONALITY_NOT_ENABLED');
    });

    it('should provide user-friendly error message for INVALID_SESSION_ID', async () => {
      const apiError = new Error('INVALID_SESSION_ID: Session expired or invalid');
      netUtilsStub.rejects(apiError);

      const tool = new CustomLabelsMigrationTool('testNS', mockConnection, mockLogger, mockMessages, mockUx);

      const result = await tool.migrate();

      expect(result).to.be.an('array').with.length(1);
      expect(result[0].errors).to.be.an('array').with.length(1);

      expect(loggerErrorStub.called).to.be.true;

      const errorArg = loggerErrorStub.firstCall.args[0];
      expect(errorArg).to.include('Session expired or invalid');
      expect(errorArg).to.include('re-authenticate');
      expect(errorArg).to.include('sf org login web');
      expect(errorArg).to.include('INVALID_SESSION_ID');
    });

    it('should provide user-friendly error message for NOT_FOUND (404)', async () => {
      const apiError = new Error('NOT_FOUND: Resource not found');
      netUtilsStub.rejects(apiError);

      const tool = new CustomLabelsMigrationTool('testNS', mockConnection, mockLogger, mockMessages, mockUx);

      const result = await tool.migrate();

      expect(result).to.be.an('array').with.length(1);
      expect(result[0].errors).to.be.an('array').with.length(1);

      expect(loggerErrorStub.called).to.be.true;

      const errorArg = loggerErrorStub.firstCall.args[0];
      expect(errorArg).to.include('API endpoint was not found');
      expect(errorArg).to.include('OmniStudio installed');
      expect(errorArg).to.include('API version is incompatible');
      expect(errorArg).to.include('NOT_FOUND');
    });

    it('should provide user-friendly error message for INSUFFICIENT_ACCESS', async () => {
      const apiError = new Error('INSUFFICIENT_ACCESS: Insufficient access rights');
      netUtilsStub.rejects(apiError);

      const tool = new CustomLabelsMigrationTool('testNS', mockConnection, mockLogger, mockMessages, mockUx);

      const result = await tool.migrate();

      expect(result).to.be.an('array').with.length(1);
      expect(result[0].errors).to.be.an('array').with.length(1);

      expect(loggerErrorStub.called).to.be.true;

      const errorArg = loggerErrorStub.firstCall.args[0];
      expect(errorArg).to.include('Insufficient access');
      expect(errorArg).to.include('Manage OmniStudio');
      expect(errorArg).to.include('permission set');
      expect(errorArg).to.include('INSUFFICIENT_ACCESS');
    });

    it('should provide enhanced generic error message for unknown errors', async () => {
      const apiError = new Error('UNKNOWN_ERROR: Something unexpected happened');
      netUtilsStub.rejects(apiError);

      const tool = new CustomLabelsMigrationTool('testNS', mockConnection, mockLogger, mockMessages, mockUx);

      const result = await tool.migrate();

      expect(result).to.be.an('array').with.length(1);
      expect(result[0].errors).to.be.an('array').with.length(1);

      expect(loggerErrorStub.called).to.be.true;

      const errorArg = loggerErrorStub.firstCall.args[0];
      expect(errorArg).to.include('Failed to call clone-custom-labels API');
      expect(errorArg).to.include('connectivity and authentication');
      expect(errorArg).to.include('OmniStudio installation status');
      expect(errorArg).to.include('User permissions');
      expect(errorArg).to.include('UNKNOWN_ERROR');
    });
  });

  describe('Successful Migration', () => {
    it('should successfully migrate custom labels when API call succeeds', async () => {
      const successResponse = {
        results: [
          {
            name: 'TestLabel1',
            status: 'created',
            message: 'Label created successfully',
            coreInfo: { id: 'core1', value: 'Core value 1' },
            packageInfo: { id: 'pkg1', value: 'Package value 1' },
          },
          {
            name: 'TestLabel2',
            status: 'created',
            message: 'Label created successfully',
            coreInfo: { id: 'core2', value: 'Core value 2' },
            packageInfo: { id: 'pkg2', value: 'Package value 2' },
          },
        ],
      };

      // First call for clone-custom-labels
      netUtilsStub.onFirstCall().resolves(successResponse);
      // Second call for clone-custom-label-localizations
      netUtilsStub.onSecondCall().resolves({ results: {} });

      const tool = new CustomLabelsMigrationTool('testNS', mockConnection, mockLogger, mockMessages, mockUx);
      const result = await tool.migrate();

      expect(result).to.be.an('array').with.length(1);
      expect(result[0].name).to.equal('Custom Labels');
      expect(result[0].totalCount).to.equal(2);
      expect(result[0].errors).to.be.empty;
    });

    it('should handle labels with error status', async () => {
      const mixedResponse = {
        results: [
          {
            name: 'SuccessLabel',
            status: 'created',
            message: 'Label created successfully',
            coreInfo: { id: 'core1', value: 'Value 1' },
            packageInfo: { id: 'pkg1', value: 'Value 1' },
          },
          {
            name: 'ErrorLabel',
            status: 'error',
            message: 'Failed to create label',
            coreInfo: { id: 'core2', value: '' },
            packageInfo: { id: 'pkg2', value: 'Value 2' },
          },
        ],
      };

      netUtilsStub.onFirstCall().resolves(mixedResponse);
      netUtilsStub.onSecondCall().resolves({ results: {} });

      const tool = new CustomLabelsMigrationTool('testNS', mockConnection, mockLogger, mockMessages, mockUx);
      const result = await tool.migrate();

      expect(result[0].totalCount).to.equal(2);
      expect(result[0].results.size).to.equal(1); // Only error label in results
    });
  });
});
