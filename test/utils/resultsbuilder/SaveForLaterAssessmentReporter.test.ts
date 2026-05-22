/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { expect } from 'chai';
import sinon = require('sinon');
import { SaveForLaterAssessmentReporter } from '../../../src/utils/resultsbuilder/SaveForLaterAssessmentReporter';
import { SaveForLaterAssessmentInfo } from '../../../src/utils/interfaces';
import { OmnistudioOrgDetails } from '../../../src/utils/orgUtils';
import * as dataModelService from '../../../src/utils/dataModelService';

describe('SaveForLaterAssessmentReporter', () => {
  let sandbox: sinon.SinonSandbox;

  const mockOrgDetails: OmnistudioOrgDetails = {
    packageDetails: {
      version: '240.0.0',
      namespace: 'vlocity_ins',
    },
    omniStudioOrgPermissionEnabled: true,
    orgDetails: {
      Name: 'Test Org',
      Id: '00D000000000001',
    },
    dataModel: 'Custom',
    hasValidNamespace: true,
    isFoundationPackage: false,
    isOmnistudioMetadataAPIEnabled: false,
  };

  const mockInstanceUrl = 'https://test.salesforce.com';

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Stub dataModelService (used by reportUtil's getAssessmentReportNameHeaders)
    sandbox.stub(dataModelService, 'isStandardDataModel').returns(false);

    // Stub Logger static methods used by the reporter
    const loggerModule = require('../../../src/utils/logger');
    if (!loggerModule.Logger.captureVerboseData.restore) {
      sandbox.stub(loggerModule.Logger, 'captureVerboseData');
    }
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getSaveForLaterAssessmentData', () => {
    it('should return correct report structure with all required fields', () => {
      // Arrange
      const mockInfos: SaveForLaterAssessmentInfo[] = [
        {
          id: 'a0D000000000001',
          name: 'Session-001',
          oldName: 'Session-001',
          omniScriptId: 'a0E000000000001',
          omniScriptName: 'TestOmniScript',
          status: 'In Progress',
          lastSaved: '2024-01-15',
          migrationStatus: 'Ready for migration',
          infos: ['Dependent OmniScript is ready for migration'],
          warnings: [],
          errors: [],
          omniScriptMigrationStatus: 'Ready for migration',
        },
      ];

      // Act
      const result = SaveForLaterAssessmentReporter.getSaveForLaterAssessmentData(
        mockInfos,
        mockInstanceUrl,
        mockOrgDetails
      );

      // Assert
      expect(result).to.have.property('title', 'OmniScript Saved Sessions Assessment Report');
      expect(result).to.have.property('heading', 'OmniScript Saved Sessions Assessment Report');
      expect(result).to.have.property('total', 1);
      expect(result).to.have.property('assessmentDate');
      expect(result).to.have.property('org');
      expect(result).to.have.property('filterGroups');
      expect(result).to.have.property('headerGroups');
      expect(result).to.have.property('rows');
      expect(result.rows).to.have.length(1);
    });

    it('should handle multiple instances with different statuses', () => {
      // Arrange
      const mockInfos: SaveForLaterAssessmentInfo[] = [
        {
          id: 'a0D001',
          name: 'Session-Ready',
          oldName: 'Session-Ready',
          omniScriptId: 'a0E001',
          omniScriptName: 'ReadyOS',
          status: 'In Progress',
          lastSaved: '2024-01-01',
          migrationStatus: 'Ready for migration',
          infos: ['Dependent OmniScript is ready for migration'],
          warnings: [],
          errors: [],
        },
        {
          id: 'a0D002',
          name: 'Session-Warning',
          oldName: 'Session-Warning',
          omniScriptId: 'a0E002',
          omniScriptName: 'WarningOS',
          status: 'In Progress',
          lastSaved: '2024-02-01',
          migrationStatus: 'Warnings',
          infos: [],
          warnings: ['Dependent OmniScript has warnings'],
          errors: [],
        },
        {
          id: 'a0D003',
          name: 'Session-NMI',
          oldName: 'Session-NMI',
          omniScriptId: 'a0E003',
          omniScriptName: 'FailedOS',
          status: 'In Progress',
          lastSaved: '2024-03-01',
          migrationStatus: 'Needs manual intervention',
          infos: [],
          warnings: ['Dependent OmniScript has status: Failed'],
          errors: [],
        },
        {
          id: 'a0D004',
          name: 'Session-Failed',
          oldName: 'Session-Failed',
          omniScriptId: '',
          omniScriptName: '',
          status: 'In Progress',
          lastSaved: '2024-04-01',
          migrationStatus: 'Failed',
          infos: [],
          warnings: [],
          errors: ['Missing OmniScriptId__c'],
        },
      ];

      // Act
      const result = SaveForLaterAssessmentReporter.getSaveForLaterAssessmentData(
        mockInfos,
        mockInstanceUrl,
        mockOrgDetails
      );

      // Assert
      expect(result.total).to.equal(4);
      expect(result.rows).to.have.length(4);
      expect(result.filterGroups).to.be.an('array');
    });

    it('should handle empty assessment infos', () => {
      // Act
      const result = SaveForLaterAssessmentReporter.getSaveForLaterAssessmentData([], mockInstanceUrl, mockOrgDetails);

      // Assert
      expect(result.total).to.equal(0);
      expect(result.rows).to.have.length(0);
      expect(result.filterGroups).to.be.an('array').that.is.empty;
    });

    it('should throw when assessment infos is undefined (not null-safe)', () => {
      // The reporter does not guard against undefined input in getRowsForReport
      // This test documents the current behavior
      expect(() => {
        SaveForLaterAssessmentReporter.getSaveForLaterAssessmentData(undefined as any, mockInstanceUrl, mockOrgDetails);
      }).to.throw(TypeError);
    });

    it('should include correct header groups', () => {
      // Act
      const result = SaveForLaterAssessmentReporter.getSaveForLaterAssessmentData([], mockInstanceUrl, mockOrgDetails);

      // Assert
      expect(result.headerGroups).to.have.length(2);

      // First row headers include standard name/id headers + custom columns
      const firstRowHeaders = result.headerGroups[0].header;
      const headerNames = firstRowHeaders.map((h) => h.name);
      expect(headerNames).to.include('OmniScript');
      expect(headerNames).to.include('OmniScript Status');
      expect(headerNames).to.include('Status');
      expect(headerNames).to.include('Last Saved');
      expect(headerNames).to.include('Assessment Status');
      expect(headerNames).to.include('Summary');
      expect(headerNames).to.include('Errors');
    });

    it('should create filter groups from distinct migration statuses', () => {
      // Arrange
      const mockInfos: SaveForLaterAssessmentInfo[] = [
        {
          id: 'a0D001',
          name: 'Session-1',
          oldName: 'Session-1',
          omniScriptId: 'a0E001',
          omniScriptName: 'OS1',
          status: 'In Progress',
          lastSaved: '2024-01-01',
          migrationStatus: 'Ready for migration',
          infos: [],
          warnings: [],
          errors: [],
        },
        {
          id: 'a0D002',
          name: 'Session-2',
          oldName: 'Session-2',
          omniScriptId: 'a0E002',
          omniScriptName: 'OS2',
          status: 'In Progress',
          lastSaved: '2024-02-01',
          migrationStatus: 'Needs manual intervention',
          infos: [],
          warnings: [],
          errors: [],
        },
      ];

      // Act
      const result = SaveForLaterAssessmentReporter.getSaveForLaterAssessmentData(
        mockInfos,
        mockInstanceUrl,
        mockOrgDetails
      );

      // Assert
      expect(result.filterGroups).to.have.length(1);
      expect(result.filterGroups[0].key).to.equal('migrationStatus');
      expect(result.filterGroups[0].filters).to.have.length(2);
    });

    it('should generate row data with correct CSS classes for migration statuses', () => {
      // Arrange
      const mockInfos: SaveForLaterAssessmentInfo[] = [
        {
          id: 'a0D001',
          name: 'Session-Ready',
          oldName: 'Session-Ready',
          omniScriptId: 'a0E001',
          omniScriptName: 'ReadyOS',
          status: 'In Progress',
          lastSaved: '2024-01-01',
          migrationStatus: 'Ready for migration',
          infos: ['Info message'],
          warnings: [],
          errors: [],
          omniScriptMigrationStatus: 'Ready for migration',
        },
      ];

      // Act
      const result = SaveForLaterAssessmentReporter.getSaveForLaterAssessmentData(
        mockInfos,
        mockInstanceUrl,
        mockOrgDetails
      );

      // Assert
      const row = result.rows[0];
      expect(row.data).to.be.an('array');

      // Find the migration status data element
      const migrationStatusData = row.data.find((d) => d.key === 'migrationStatus');
      expect(migrationStatusData).to.exist;
      expect(migrationStatusData.value).to.equal('Ready for migration');
      expect(migrationStatusData.customClass).to.equal('text-success');
    });

    it('should create hyperlink for instance ID', () => {
      // Arrange
      const mockInfos: SaveForLaterAssessmentInfo[] = [
        {
          id: 'a0D000000000099',
          name: 'Session-Link',
          oldName: 'Session-Link',
          omniScriptId: 'a0E001',
          omniScriptName: 'OS1',
          status: 'In Progress',
          lastSaved: '2024-01-01',
          migrationStatus: 'Ready for migration',
          infos: [],
          warnings: [],
          errors: [],
        },
      ];

      // Act
      const result = SaveForLaterAssessmentReporter.getSaveForLaterAssessmentData(
        mockInfos,
        mockInstanceUrl,
        mockOrgDetails
      );

      // Assert
      const row = result.rows[0];
      const idData = row.data.find((d) => d.key === 'id');
      expect(idData).to.exist;
      expect(idData.isHref).to.be.true;
      expect(idData.uri).to.equal(`${mockInstanceUrl}/a0D000000000099`);
    });

    it('should show "N/A" for missing OmniScript name or status', () => {
      // Arrange
      const mockInfos: SaveForLaterAssessmentInfo[] = [
        {
          id: 'a0D001',
          name: 'Session-NoOS',
          oldName: 'Session-NoOS',
          omniScriptId: '',
          omniScriptName: '',
          status: 'In Progress',
          lastSaved: '',
          migrationStatus: 'Needs manual intervention',
          infos: [],
          warnings: [],
          errors: ['Missing OmniScriptId__c'],
        },
      ];

      // Act
      const result = SaveForLaterAssessmentReporter.getSaveForLaterAssessmentData(
        mockInfos,
        mockInstanceUrl,
        mockOrgDetails
      );

      // Assert
      const row = result.rows[0];
      const omniScriptNameData = row.data.find((d) => d.key === 'omniScriptName');
      expect(omniScriptNameData).to.exist;
      expect(omniScriptNameData.value).to.equal('N/A');

      const omniScriptStatusData = row.data.find((d) => d.key === 'omniScriptStatus');
      expect(omniScriptStatusData).to.exist;
      expect(omniScriptStatusData.value).to.equal('N/A');

      const lastSavedData = row.data.find((d) => d.key === 'lastSaved');
      expect(lastSavedData).to.exist;
      expect(lastSavedData.value).to.equal('N/A');
    });

    it('should add invalid-icon class for failed/needs manual intervention rows', () => {
      // Arrange
      const mockInfos: SaveForLaterAssessmentInfo[] = [
        {
          id: 'a0D001',
          name: 'Session-NMI',
          oldName: 'Session-NMI',
          omniScriptId: 'a0E001',
          omniScriptName: 'FailedOS',
          status: 'In Progress',
          lastSaved: '2024-01-01',
          migrationStatus: 'Needs manual intervention',
          infos: [],
          warnings: ['Dependent OmniScript has status: Failed'],
          errors: [],
        },
      ];

      // Act
      const result = SaveForLaterAssessmentReporter.getSaveForLaterAssessmentData(
        mockInfos,
        mockInstanceUrl,
        mockOrgDetails
      );

      // Assert
      const row = result.rows[0];
      const nameData = row.data.find((d) => d.key === 'name');
      expect(nameData).to.exist;
      expect(nameData.customClass).to.equal('invalid-icon');
    });
  });

  describe('getSummaryData', () => {
    it('should return correct summary counts for all statuses', () => {
      // Arrange
      const mockInfos: SaveForLaterAssessmentInfo[] = [
        createMockInfo('Ready for migration'),
        createMockInfo('Ready for migration'),
        createMockInfo('Warnings'),
        createMockInfo('Needs manual intervention'),
        createMockInfo('Needs manual intervention'),
        createMockInfo('Needs manual intervention'),
        createMockInfo('Failed'),
      ];

      // Act
      const result = SaveForLaterAssessmentReporter.getSummaryData(mockInfos);

      // Assert
      expect(result).to.have.length(4);

      const readyItem = result.find((r) => r.name === 'Ready for migration');
      expect(readyItem).to.exist;
      expect(readyItem.count).to.equal(2);
      expect(readyItem.cssClass).to.equal('text-success');

      const warningsItem = result.find((r) => r.name === 'Warnings');
      expect(warningsItem).to.exist;
      expect(warningsItem.count).to.equal(1);
      expect(warningsItem.cssClass).to.equal('text-warning');

      const nmiItem = result.find((r) => r.name === 'Needs manual intervention');
      expect(nmiItem).to.exist;
      expect(nmiItem.count).to.equal(3);
      expect(nmiItem.cssClass).to.equal('text-error');

      const failedItem = result.find((r) => r.name === 'Failed');
      expect(failedItem).to.exist;
      expect(failedItem.count).to.equal(1);
      expect(failedItem.cssClass).to.equal('text-error');
    });

    it('should return zero counts when all instances are ready', () => {
      // Arrange
      const mockInfos: SaveForLaterAssessmentInfo[] = [
        createMockInfo('Ready for migration'),
        createMockInfo('Ready for migration'),
      ];

      // Act
      const result = SaveForLaterAssessmentReporter.getSummaryData(mockInfos);

      // Assert
      expect(result).to.have.length(4);

      const readyItem = result.find((r) => r.name === 'Ready for migration');
      expect(readyItem.count).to.equal(2);

      const warningsItem = result.find((r) => r.name === 'Warnings');
      expect(warningsItem.count).to.equal(0);

      const nmiItem = result.find((r) => r.name === 'Needs manual intervention');
      expect(nmiItem.count).to.equal(0);

      const failedItem = result.find((r) => r.name === 'Failed');
      expect(failedItem.count).to.equal(0);
    });

    it('should return all zero counts for empty array', () => {
      // Act
      const result = SaveForLaterAssessmentReporter.getSummaryData([]);

      // Assert
      expect(result).to.have.length(4);
      result.forEach((item) => {
        expect(item.count).to.equal(0);
      });
    });
  });
});

/**
 * Helper to create a mock SaveForLaterAssessmentInfo with a specific migration status
 */
function createMockInfo(
  migrationStatus: 'Ready for migration' | 'Failed' | 'Skipped' | 'Needs manual intervention' | 'Warnings'
): SaveForLaterAssessmentInfo {
  return {
    id: `a0D${Math.random().toString(36).substring(2, 10)}`,
    name: `Session-${migrationStatus}`,
    oldName: `Session-${migrationStatus}`,
    omniScriptId: 'a0E000000000001',
    omniScriptName: 'TestOS',
    status: 'In Progress',
    lastSaved: '2024-01-01',
    migrationStatus,
    infos: [],
    warnings: [],
    errors: [],
  };
}
