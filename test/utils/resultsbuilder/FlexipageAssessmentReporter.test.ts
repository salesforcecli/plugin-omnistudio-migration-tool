/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { expect } from 'chai';
import sinon = require('sinon');
import { FlexipageAssessmentReporter } from '../../../src/utils/resultsbuilder/FlexipageAssessmentReporter';
import { FlexiPageAssessmentInfo } from '../../../src/utils/interfaces';
import { OmnistudioOrgDetails } from '../../../src/utils/orgUtils';

describe('FlexipageAssessmentReporter', () => {
  let sandbox: sinon.SinonSandbox;
  let fileDiffUtilStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Stub the FileDiffUtil static method
    fileDiffUtilStub = sandbox.stub().returns('<div>mock-diff-html</div>');
    sandbox.stub(require('../../../src/utils/lwcparser/fileutils/FileDiffUtil'), 'FileDiffUtil').value({
      getDiffHTML: fileDiffUtilStub,
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getFlexipageAssessmentData', () => {
    it('should return correct report structure with all required fields', () => {
      // Arrange
      const mockAssessmentInfos: FlexiPageAssessmentInfo[] = [
        {
          name: 'TestPage1.flexipage-meta.xml',
          path: '/test/path1',
          diff: 'mock-diff-1',
          errors: [],
          status: 'Ready for migration',
        },
        {
          name: 'TestPage2.flexipage-meta.xml',
          path: '/test/path2',
          diff: 'mock-diff-2',
          errors: ['Error 1', 'Error 2'],
          status: 'Needs manual intervention',
        },
      ];

      const mockOrgDetails: OmnistudioOrgDetails = {
        packageDetails: {
          version: '1.0.0',
          namespace: 'test',
        },
        omniStudioOrgPermissionEnabled: true,
        orgDetails: {
          Name: 'Test Org',
          Id: 'test-org-id',
        },
        dataModel: 'Standard',
        hasValidNamespace: true,
        isFoundationPackage: false,
        isOmnistudioMetadataAPIEnabled: false,
        isDRVersioningEnabled: false,
      };

      // Act
      const result = FlexipageAssessmentReporter.getFlexipageAssessmentData(mockAssessmentInfos, mockOrgDetails);

      // Assert
      expect(result).to.have.property('title', 'FlexiPages Assessment Report');
      expect(result).to.have.property('heading', 'FlexiPages Assessment Report');
      expect(result).to.have.property('total', 2);
      expect(result).to.have.property('assessmentDate');
      expect(result).to.have.property('org');
      expect(result).to.have.property('filterGroups');
      expect(result).to.have.property('headerGroups');
      expect(result).to.have.property('rows');
      expect(result.rows).to.have.length(2);
    });

    it('should handle empty assessment infos', () => {
      // Arrange
      const mockOrgDetails: OmnistudioOrgDetails = {
        packageDetails: {
          version: '1.0.0',
          namespace: 'test',
        },
        omniStudioOrgPermissionEnabled: true,
        orgDetails: {
          Name: 'Test Org',
          Id: 'test-org-id',
        },
        dataModel: 'Standard',
        hasValidNamespace: true,
        isFoundationPackage: false,
        isOmnistudioMetadataAPIEnabled: false,
        isDRVersioningEnabled: false,
      };

      // Act
      const result = FlexipageAssessmentReporter.getFlexipageAssessmentData([], mockOrgDetails);

      // Assert
      expect(result.total).to.equal(0);
      expect(result.rows).to.have.length(0);
    });

    it('should handle undefined assessment infos', () => {
      // Arrange
      const mockOrgDetails: OmnistudioOrgDetails = {
        packageDetails: {
          version: '1.0.0',
          namespace: 'test',
        },
        omniStudioOrgPermissionEnabled: true,
        orgDetails: {
          Name: 'Test Org',
          Id: 'test-org-id',
        },
        dataModel: 'Standard',
        hasValidNamespace: true,
        isFoundationPackage: false,
        isOmnistudioMetadataAPIEnabled: false,
        isDRVersioningEnabled: false,
      };

      // Act
      const result = FlexipageAssessmentReporter.getFlexipageAssessmentData(undefined as any, mockOrgDetails);

      // Assert
      expect(result.total).to.equal(0);
      expect(result.rows).to.have.length(0);
    });
  });

  describe('getSummaryData', () => {
    it('should return correct summary counts for different statuses', () => {
      // Arrange
      const mockAssessmentInfos: FlexiPageAssessmentInfo[] = [
        { name: 'Page1', path: '/path1', diff: '', errors: [], status: 'Warnings' },
        { name: 'Page2', path: '/path2', diff: '', errors: [], status: 'Ready for migration' },
        { name: 'Page3', path: '/path3', diff: '', errors: ['Error'], status: 'Needs manual intervention' },
        { name: 'Page4', path: '/path4', diff: '', errors: [], status: 'Warnings' },
        { name: 'Page5', path: '/path5', diff: '', errors: [], status: 'Ready for migration' },
      ];

      // Act
      const result = FlexipageAssessmentReporter.getSummaryData(mockAssessmentInfos);

      // Assert
      expect(result).to.have.length(4);

      const readyForMigration = result.find((item) => item.name === 'Ready for migration');
      expect(readyForMigration).to.exist;
      expect(readyForMigration.count).to.equal(2);
      expect(readyForMigration.cssClass).to.equal('text-success');

      const warnings = result.find((item) => item.name === 'Warnings');
      expect(warnings).to.exist;
      expect(warnings.count).to.equal(2);
      expect(warnings.cssClass).to.equal('text-warning');

      const needManualIntervention = result.find((item) => item.name === 'Needs manual intervention');
      expect(needManualIntervention).to.exist;
      expect(needManualIntervention.count).to.equal(1);
      expect(needManualIntervention.cssClass).to.equal('text-error');

      const failed = result.find((item) => item.name === 'Failed');
      expect(failed).to.exist;
      expect(failed.count).to.equal(0);
      expect(failed.cssClass).to.equal('text-error');
    });

    it('should handle empty assessment infos', () => {
      // Act
      const result = FlexipageAssessmentReporter.getSummaryData([]);

      // Assert
      expect(result).to.have.length(4);
      result.forEach((item) => {
        expect(item.count).to.equal(0);
      });
    });
  });

  describe('getRowsForReport', () => {
    it('should create correct row data with proper formatting', () => {
      // Arrange
      const mockAssessmentInfos: FlexiPageAssessmentInfo[] = [
        {
          name: 'TestPage1.flexipage-meta.xml',
          path: '/test/path1',
          diff: 'mock-diff-1',
          errors: [],
          summary: ['OmniScript component will migrate from vlocityLWCOmniWrapper to runtime_omnistudio:omniscript'],
          status: 'Ready for migration',
        },
        {
          name: 'TestPage2.flexipage-meta.xml',
          path: '/test/path2',
          diff: 'mock-diff-2',
          errors: ['Error 1', 'Error 2'],
          status: 'Needs manual intervention',
        },
      ];

      // Act
      const result = (FlexipageAssessmentReporter as any).getRowsForReport(mockAssessmentInfos);

      // Assert
      expect(result).to.have.length(2);

      // Check first row - has summary, no errors
      expect(result[0].rowId).to.match(/^flexipage-row-data-\d+$/);
      expect(result[0].data).to.have.length(5);
      expect(result[0].data[0].value).to.equal('TestPage1');
      expect(result[0].data[1].value).to.equal('TestPage1.flexipage-meta.xml');
      expect(result[0].data[2].value).to.equal('Ready for migration');
      expect(result[0].data[2].customClass).to.equal('text-success');
      expect(result[0].data[3].value).to.equal('');
      // Summary column: no "Errors" label, but title contains the summary text
      expect(result[0].data[4].value).to.equal('');
      expect(result[0].data[4].title).to.deep.equal([
        'OmniScript component will migrate from vlocityLWCOmniWrapper to runtime_omnistudio:omniscript',
      ]);

      // Check second row - has errors, no summary
      expect(result[1].data[0].value).to.equal('TestPage2');
      expect(result[1].data[1].value).to.equal('TestPage2.flexipage-meta.xml');
      expect(result[1].data[2].value).to.equal('Needs manual intervention');
      expect(result[1].data[2].customClass).to.equal('text-error');
      expect(result[1].data[4].value).to.equal('Errors');
      expect(result[1].data[4].title).to.deep.equal(['Error 1', 'Error 2']);
    });

    it('should handle empty assessment infos', () => {
      // Act
      const result = (FlexipageAssessmentReporter as any).getRowsForReport([]);

      // Assert
      expect(result).to.have.length(0);
    });

    it('should handle undefined assessment infos', () => {
      // Act
      const result = (FlexipageAssessmentReporter as any).getRowsForReport(undefined);

      // Assert
      expect(result).to.have.length(0);
    });

    it('should call FileDiffUtil.getDiffHTML for each assessment info', () => {
      // Arrange
      const mockAssessmentInfos: FlexiPageAssessmentInfo[] = [
        {
          name: 'TestPage1.flexipage-meta.xml',
          path: '/test/path1',
          diff: 'mock-diff-1',
          errors: [],
          status: 'Ready for migration',
        },
        {
          name: 'TestPage2.flexipage-meta.xml',
          path: '/test/path2',
          diff: 'mock-diff-2',
          errors: ['Error 1'],
          status: 'Needs manual intervention',
        },
      ];

      // Act
      (FlexipageAssessmentReporter as any).getRowsForReport(mockAssessmentInfos);

      // Assert
      expect(fileDiffUtilStub.calledTwice).to.be.true;
      expect(fileDiffUtilStub.firstCall.args).to.deep.equal(['mock-diff-1', 'TestPage1.flexipage-meta.xml']);
      expect(fileDiffUtilStub.secondCall.args).to.deep.equal(['mock-diff-2', 'TestPage2.flexipage-meta.xml']);
    });
  });

  describe('getHeaderGroupsForReport', () => {
    it('should return correct header structure', () => {
      // Act
      const result = (FlexipageAssessmentReporter as any).getHeaderGroupsForReport();

      // Assert
      expect(result).to.have.length(1);
      expect(result[0].header).to.have.length(5);

      const headers = result[0].header;
      expect(headers[0].name).to.equal('FlexiPage Name');
      expect(headers[1].name).to.equal('File Reference');
      expect(headers[2].name).to.equal('Assessment Status');
      expect(headers[3].name).to.equal('Differences');
      expect(headers[4].name).to.equal('Summary');

      headers.forEach((header) => {
        expect(header.colspan).to.equal(1);
        expect(header.rowspan).to.equal(1);
      });
    });
  });

  describe('getFilterGroupsForReport', () => {
    it('should return correct filter options', () => {
      // Arrange
      const mockAssessmentInfos: FlexiPageAssessmentInfo[] = [
        { name: 'Page1', path: '/path1', diff: '', errors: [], status: 'Ready for migration' },
        { name: 'Page2', path: '/path2', diff: '', errors: [], status: 'Warnings' },
        { name: 'Page3', path: '/path3', diff: '', errors: ['Error'], status: 'Needs manual intervention' },
      ];

      // Act
      const result = (FlexipageAssessmentReporter as any).getFilterGroupsForReport(mockAssessmentInfos);

      // Assert
      expect(result).to.have.length(1);

      const statusFilter = result.find((filter) => filter.label === 'Filter By Assessment Status');
      expect(statusFilter).to.exist;
      expect(statusFilter.key).to.equal('status');
      expect(statusFilter.filters).to.have.length(3);
      expect(statusFilter.filters[0].label).to.equal('Ready for migration');
      expect(statusFilter.filters[1].label).to.equal('Warnings');
      expect(statusFilter.filters[2].label).to.equal('Needs manual intervention');
    });
  });

  describe('row ID generation', () => {
    it('should generate unique row IDs', () => {
      // Arrange
      const mockAssessmentInfos: FlexiPageAssessmentInfo[] = [
        { name: 'Page1', path: '/path1', diff: '', errors: [], status: 'Warnings' },
        { name: 'Page2', path: '/path2', diff: '', errors: [], status: 'Ready for migration' },
        { name: 'Page3', path: '/path3', diff: '', errors: [], status: 'Needs manual intervention' },
      ];

      // Act
      const result = (FlexipageAssessmentReporter as any).getRowsForReport(mockAssessmentInfos);

      // Assert
      expect(result).to.have.length(3);
      const rowIds = result.map((row) => row.rowId);
      expect(rowIds[0]).to.match(/^flexipage-row-data-\d+$/);
      expect(rowIds[1]).to.match(/^flexipage-row-data-\d+$/);
      expect(rowIds[2]).to.match(/^flexipage-row-data-\d+$/);

      // Row IDs should be unique
      const uniqueRowIds = new Set(rowIds);
      expect(uniqueRowIds.size).to.equal(3);
    });
  });
});
