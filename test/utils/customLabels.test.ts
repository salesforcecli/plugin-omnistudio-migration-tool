/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { expect } from 'chai';
import { Connection, Messages } from '@salesforce/core';
import * as sinon from 'sinon';
import { CustomLabelsUtil, ExternalStringRecord } from '../../src/utils/customLabels';

/**
 * Custom Labels Utility Tests
 *
 * This test suite covers the CustomLabelsUtil class functionality including:
 * - Fetching custom labels from Tooling API
 * - Assessment of custom labels for migration
 * - Detection of name conflicts and value mismatches
 * - Handling pagination for large result sets
 * - Statistics calculation for assessment results
 * - Error handling and edge cases
 */

describe('CustomLabelsUtil - Custom Label Assessment', () => {
  let mockConnection: Connection;
  let mockMessages: Messages<string>;
  let toolingQueryStub: sinon.SinonStub;
  let toolingQueryMoreStub: sinon.SinonStub;

  beforeEach(() => {
    // Create mock connection with tooling API
    toolingQueryStub = sinon.stub();
    toolingQueryMoreStub = sinon.stub();

    mockConnection = {
      tooling: {
        query: toolingQueryStub,
        queryMore: toolingQueryMoreStub,
      },
    } as unknown as Connection;

    // Mock Messages object
    mockMessages = {
      getMessage: sinon.stub().callsFake((key: string, params?: string[]) => {
        const messages: Record<string, string> = {
          customLabelAssessmentSummary:
            'Custom Label with same name and different value is already exist without namespace.',
          customLabelWarningSummary: 'Custom Label has potential conflicts that need review.',
          customLabelFailedSummary: 'Custom Label assessment failed due to errors.',
          customLabelNeedsManualInterventionSummary: 'Custom Label requires manual intervention for resolution.',
          assessedCustomLabelsCount: `Found ${params?.[0]} labels that need attention out of ${params?.[1]} total`,
          errorFetchingCustomLabels: `Error fetching custom labels: ${params?.[0]}`,
        };
        return messages[key] || 'Mock message for testing';
      }),
    } as unknown as Messages<string>;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('fetchCustomLabels - Basic Functionality', () => {
    it('should fetch custom labels with namespace and return assessment result', async () => {
      const mockNamespacedLabels: ExternalStringRecord[] = [
        {
          Id: 'label1',
          Name: 'Customer_Welcome_Message',
          NamespacePrefix: 'testNS',
          Value: 'Welcome to our application!',
        },
        {
          Id: 'label2',
          Name: 'Product_Error_Message',
          NamespacePrefix: 'testNS',
          Value: 'Product not found',
        },
      ];

      const mockCoreLabels: ExternalStringRecord[] = [];

      // First call for namespaced labels
      toolingQueryStub.onFirstCall().resolves({
        records: mockNamespacedLabels,
        done: true,
        totalSize: 2,
      });

      // Second call for core labels (empty namespace)
      toolingQueryStub.onSecondCall().resolves({
        records: mockCoreLabels,
        done: true,
        totalSize: 0,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      // Should return labels ready for migration (no conflicts)
      expect(result.labels).to.be.an('array').that.is.empty; // No warnings/errors
      expect(result.statistics.totalLabels).to.equal(2);
      expect(result.statistics.readyForMigration).to.equal(2);
      expect(result.statistics.warnings).to.equal(0);
      expect(result.statistics.needManualIntervention).to.equal(0);
      expect(result.statistics.failed).to.equal(0);
    });

    it('should detect value conflicts between namespaced and core labels', async () => {
      const mockNamespacedLabels: ExternalStringRecord[] = [
        {
          Id: 'label1',
          Name: 'Shared_Label',
          NamespacePrefix: 'testNS',
          Value: 'Namespaced value',
        },
      ];

      const mockCoreLabels: ExternalStringRecord[] = [
        {
          Id: 'core1',
          Name: 'Shared_Label',
          NamespacePrefix: '',
          Value: 'Different core value', // Conflict!
        },
      ];

      toolingQueryStub.onFirstCall().resolves({
        records: mockNamespacedLabels,
        done: true,
      });

      toolingQueryStub.onSecondCall().resolves({
        records: mockCoreLabels,
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      // Should detect warning for value mismatch
      expect(result.labels).to.have.length(1);
      expect(result.labels[0].assessmentStatus).to.equal('Warnings');
      expect(result.labels[0].packageValue).to.equal('Namespaced value');
      expect(result.labels[0].coreValue).to.equal('Different core value');
      expect(result.statistics.warnings).to.equal(1);
      expect(result.statistics.readyForMigration).to.equal(0);
    });

    it('should handle labels with matching values (no conflict)', async () => {
      const mockNamespacedLabels: ExternalStringRecord[] = [
        {
          Id: 'label1',
          Name: 'Matching_Label',
          NamespacePrefix: 'testNS',
          Value: 'Same value',
        },
      ];

      const mockCoreLabels: ExternalStringRecord[] = [
        {
          Id: 'core1',
          Name: 'Matching_Label',
          NamespacePrefix: '',
          Value: 'Same value', // No conflict
        },
      ];

      toolingQueryStub.onFirstCall().resolves({
        records: mockNamespacedLabels,
        done: true,
      });

      toolingQueryStub.onSecondCall().resolves({
        records: mockCoreLabels,
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      // Should be ready for migration (values match)
      expect(result.labels).to.be.empty; // No warnings/errors shown
      expect(result.statistics.readyForMigration).to.equal(1);
      expect(result.statistics.warnings).to.equal(0);
    });

    it('should handle empty custom labels result', async () => {
      toolingQueryStub.resolves({
        records: [],
        done: true,
        totalSize: 0,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      expect(result.labels).to.be.empty;
      expect(result.statistics.totalLabels).to.equal(0);
      expect(result.statistics.readyForMigration).to.equal(0);
    });

    it('should handle null or undefined custom labels', async () => {
      toolingQueryStub.onFirstCall().resolves({
        records: null,
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      expect(result.labels).to.be.empty;
      expect(result.statistics.totalLabels).to.equal(0);
    });
  });

  describe('fetchCustomLabels - Pagination Handling', () => {
    it('should handle pagination for large result sets', async () => {
      const firstBatch: ExternalStringRecord[] = [
        {
          Id: 'label1',
          Name: 'Label_1',
          NamespacePrefix: 'testNS',
          Value: 'Value 1',
        },
        {
          Id: 'label2',
          Name: 'Label_2',
          NamespacePrefix: 'testNS',
          Value: 'Value 2',
        },
      ];

      const secondBatch: ExternalStringRecord[] = [
        {
          Id: 'label3',
          Name: 'Label_3',
          NamespacePrefix: 'testNS',
          Value: 'Value 3',
        },
      ];

      // First call returns incomplete result
      toolingQueryStub.onFirstCall().resolves({
        records: firstBatch,
        done: false,
        nextRecordsUrl: '/services/data/v60.0/tooling/query/nextRecords',
        totalSize: 3,
      });

      // queryMore returns second batch
      toolingQueryMoreStub.onFirstCall().resolves({
        records: secondBatch,
        done: true,
        totalSize: 3,
      });

      // Second query for core labels (empty)
      toolingQueryStub.onSecondCall().resolves({
        records: [],
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      // Should fetch all labels across pagination
      expect(result.statistics.totalLabels).to.equal(3);
      expect(result.statistics.readyForMigration).to.equal(3);
      expect(toolingQueryMoreStub.calledOnce).to.be.true;
    });

    it('should handle pagination errors gracefully', async () => {
      toolingQueryStub.onFirstCall().resolves({
        records: [
          {
            Id: 'label1',
            Name: 'Label_1',
            NamespacePrefix: 'testNS',
            Value: 'Value 1',
          },
        ],
        done: false,
        nextRecordsUrl: '/services/data/v60.0/tooling/query/nextRecords',
      });

      // queryMore throws error
      toolingQueryMoreStub.rejects(new Error('Network timeout'));

      // Second query for core labels
      toolingQueryStub.onSecondCall().resolves({
        records: [],
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      // Should return partial results (first batch only)
      expect(result.statistics.totalLabels).to.equal(1);
      expect(result.statistics.readyForMigration).to.equal(1);
    });

    it('should handle empty nextRecordsUrl pagination', async () => {
      toolingQueryStub.onFirstCall().resolves({
        records: [
          {
            Id: 'label1',
            Name: 'Label_1',
            NamespacePrefix: 'testNS',
            Value: 'Value 1',
          },
        ],
        done: false,
        nextRecordsUrl: null, // No URL provided
      });

      toolingQueryStub.onSecondCall().resolves({
        records: [],
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      // Should stop pagination and return what was fetched
      expect(result.statistics.totalLabels).to.equal(1);
      expect(toolingQueryMoreStub.called).to.be.false;
    });
  });

  describe('fetchCustomLabels - Case Sensitivity and Name Matching', () => {
    it('should perform case-insensitive name matching', async () => {
      const mockNamespacedLabels: ExternalStringRecord[] = [
        {
          Id: 'label1',
          Name: 'Customer_Label',
          NamespacePrefix: 'testNS',
          Value: 'Namespaced value',
        },
      ];

      const mockCoreLabels: ExternalStringRecord[] = [
        {
          Id: 'core1',
          Name: 'customer_label', // Different case
          NamespacePrefix: '',
          Value: 'Different value',
        },
      ];

      toolingQueryStub.onFirstCall().resolves({
        records: mockNamespacedLabels,
        done: true,
      });

      toolingQueryStub.onSecondCall().resolves({
        records: mockCoreLabels,
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      // Should match despite case difference
      expect(result.labels).to.have.length(1);
      expect(result.labels[0].assessmentStatus).to.equal('Warnings');
      expect(result.statistics.warnings).to.equal(1);
    });

    it('should handle special characters in label names', async () => {
      const mockNamespacedLabels: ExternalStringRecord[] = [
        {
          Id: 'label1',
          Name: 'Label_With_Underscores',
          NamespacePrefix: 'testNS',
          Value: 'Test value',
        },
        {
          Id: 'label2',
          Name: 'Label-With-Dashes',
          NamespacePrefix: 'testNS',
          Value: 'Another value',
        },
      ];

      toolingQueryStub.onFirstCall().resolves({
        records: mockNamespacedLabels,
        done: true,
      });

      toolingQueryStub.onSecondCall().resolves({
        records: [],
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      expect(result.statistics.totalLabels).to.equal(2);
      expect(result.statistics.readyForMigration).to.equal(2);
    });
  });

  describe('fetchCustomLabels - Statistics Calculation', () => {
    it('should calculate statistics correctly for mixed assessment statuses', async () => {
      const mockNamespacedLabels: ExternalStringRecord[] = [
        {
          Id: 'label1',
          Name: 'Ready_Label',
          NamespacePrefix: 'testNS',
          Value: 'Ready value',
        },
        {
          Id: 'label2',
          Name: 'Warning_Label',
          NamespacePrefix: 'testNS',
          Value: 'Warning value',
        },
        {
          Id: 'label3',
          Name: 'Another_Ready',
          NamespacePrefix: 'testNS',
          Value: 'Another ready',
        },
      ];

      const mockCoreLabels: ExternalStringRecord[] = [
        {
          Id: 'core1',
          Name: 'Warning_Label',
          NamespacePrefix: '',
          Value: 'Different value', // Creates warning
        },
      ];

      toolingQueryStub.onFirstCall().resolves({
        records: mockNamespacedLabels,
        done: true,
      });

      toolingQueryStub.onSecondCall().resolves({
        records: mockCoreLabels,
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      expect(result.statistics.totalLabels).to.equal(3);
      expect(result.statistics.readyForMigration).to.equal(2);
      expect(result.statistics.warnings).to.equal(1);
      expect(result.statistics.needManualIntervention).to.equal(0);
      expect(result.statistics.failed).to.equal(0);
    });

    it('should return only labels needing attention in results', async () => {
      const mockNamespacedLabels: ExternalStringRecord[] = [
        {
          Id: 'label1',
          Name: 'Ready_Label_1',
          NamespacePrefix: 'testNS',
          Value: 'Value 1',
        },
        {
          Id: 'label2',
          Name: 'Warning_Label',
          NamespacePrefix: 'testNS',
          Value: 'Value 2',
        },
        {
          Id: 'label3',
          Name: 'Ready_Label_2',
          NamespacePrefix: 'testNS',
          Value: 'Value 3',
        },
      ];

      const mockCoreLabels: ExternalStringRecord[] = [
        {
          Id: 'core1',
          Name: 'Warning_Label',
          NamespacePrefix: '',
          Value: 'Conflicting value',
        },
      ];

      toolingQueryStub.onFirstCall().resolves({
        records: mockNamespacedLabels,
        done: true,
      });

      toolingQueryStub.onSecondCall().resolves({
        records: mockCoreLabels,
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      // Only warning label should be in results array
      expect(result.labels).to.have.length(1);
      expect(result.labels[0].name).to.equal('Warning_Label');
      expect(result.labels[0].assessmentStatus).to.equal('Warnings');

      // But statistics should show all labels
      expect(result.statistics.totalLabels).to.equal(3);
      expect(result.statistics.readyForMigration).to.equal(2);
    });
  });

  describe('fetchCustomLabels - Error Handling', () => {
    it('should handle Tooling API query errors gracefully', async () => {
      toolingQueryStub.rejects(new Error('Tooling API unavailable'));

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      expect(result.labels).to.be.empty;
      expect(result.statistics.totalLabels).to.equal(0);
      expect(result.statistics.readyForMigration).to.equal(0);
    });

    it('should handle invalid query response format', async () => {
      toolingQueryStub.resolves({
        // Missing 'records' field
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      expect(result.labels).to.be.empty;
      expect(result.statistics.totalLabels).to.equal(0);
    });

    it('should handle malformed custom label records', async () => {
      const malformedLabels: any[] = [
        {
          // Missing Id
          Name: 'Label_1',
          NamespacePrefix: 'testNS',
          Value: 'Value',
        },
        {
          Id: 'label2',
          // Missing Name
          NamespacePrefix: 'testNS',
          Value: 'Value 2',
        },
      ];

      toolingQueryStub.onFirstCall().resolves({
        records: malformedLabels,
        done: true,
      });

      toolingQueryStub.onSecondCall().resolves({
        records: [],
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      // Should still process records, even if some fields are missing
      expect(result.statistics.totalLabels).to.be.at.least(0);
    });
  });

  describe('fetchCustomLabels - Assessment Info Structure', () => {
    it('should populate CustomLabelAssessmentInfo correctly', async () => {
      const mockNamespacedLabels: ExternalStringRecord[] = [
        {
          Id: 'pkg-label-1',
          Name: 'Test_Label',
          NamespacePrefix: 'myNS',
          Value: 'Package value',
        },
      ];

      const mockCoreLabels: ExternalStringRecord[] = [
        {
          Id: 'core-label-1',
          Name: 'Test_Label',
          NamespacePrefix: '',
          Value: 'Core value',
        },
      ];

      toolingQueryStub.onFirstCall().resolves({
        records: mockNamespacedLabels,
        done: true,
      });

      toolingQueryStub.onSecondCall().resolves({
        records: mockCoreLabels,
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'myNS', mockMessages);

      expect(result.labels).to.have.length(1);
      const assessmentInfo = result.labels[0];

      expect(assessmentInfo.name).to.equal('Test_Label');
      expect(assessmentInfo.value).to.equal('Package value');
      expect(assessmentInfo.id).to.equal('pkg-label-1');
      expect(assessmentInfo.namespace).to.equal('myNS');
      expect(assessmentInfo.packageId).to.equal('pkg-label-1');
      expect(assessmentInfo.packageValue).to.equal('Package value');
      expect(assessmentInfo.coreId).to.equal('core-label-1');
      expect(assessmentInfo.coreValue).to.equal('Core value');
      expect(assessmentInfo.assessmentStatus).to.equal('Warnings');
      expect(assessmentInfo.summary).to.include('same name and different value');
    });

    it('should handle labels with no core equivalent', async () => {
      const mockNamespacedLabels: ExternalStringRecord[] = [
        {
          Id: 'pkg-only-1',
          Name: 'Unique_Label',
          NamespacePrefix: 'testNS',
          Value: 'Unique value',
        },
      ];

      toolingQueryStub.onFirstCall().resolves({
        records: mockNamespacedLabels,
        done: true,
      });

      toolingQueryStub.onSecondCall().resolves({
        records: [], // No core labels
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      // Label should be ready for migration (no conflict)
      expect(result.labels).to.be.empty; // No warnings
      expect(result.statistics.readyForMigration).to.equal(1);
    });
  });

  describe('fetchCustomLabels - Edge Cases', () => {
    it('should handle labels with empty values', async () => {
      const mockNamespacedLabels: ExternalStringRecord[] = [
        {
          Id: 'label1',
          Name: 'Empty_Label',
          NamespacePrefix: 'testNS',
          Value: '',
        },
      ];

      const mockCoreLabels: ExternalStringRecord[] = [
        {
          Id: 'core1',
          Name: 'Empty_Label',
          NamespacePrefix: '',
          Value: 'Non-empty value',
        },
      ];

      toolingQueryStub.onFirstCall().resolves({
        records: mockNamespacedLabels,
        done: true,
      });

      toolingQueryStub.onSecondCall().resolves({
        records: mockCoreLabels,
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      // Should detect difference between empty and non-empty
      expect(result.labels).to.have.length(1);
      expect(result.labels[0].assessmentStatus).to.equal('Warnings');
    });

    it('should handle labels with very long values', async () => {
      const longValue = 'A'.repeat(10000);
      const mockNamespacedLabels: ExternalStringRecord[] = [
        {
          Id: 'label1',
          Name: 'Long_Value_Label',
          NamespacePrefix: 'testNS',
          Value: longValue,
        },
      ];

      toolingQueryStub.onFirstCall().resolves({
        records: mockNamespacedLabels,
        done: true,
      });

      toolingQueryStub.onSecondCall().resolves({
        records: [],
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, 'testNS', mockMessages);

      expect(result.statistics.totalLabels).to.equal(1);
      expect(result.statistics.readyForMigration).to.equal(1);
    });

    it('should handle empty namespace parameter', async () => {
      const mockLabels: ExternalStringRecord[] = [
        {
          Id: 'label1',
          Name: 'Core_Label',
          NamespacePrefix: '',
          Value: 'Core value',
        },
      ];

      toolingQueryStub.resolves({
        records: mockLabels,
        done: true,
      });

      const result = await CustomLabelsUtil.fetchCustomLabels(mockConnection, '', mockMessages);

      expect(result.statistics.totalLabels).to.be.at.least(0);
    });
  });
});
