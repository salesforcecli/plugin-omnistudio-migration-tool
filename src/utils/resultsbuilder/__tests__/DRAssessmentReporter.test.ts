import { expect } from 'chai';
import { DRAssessmentReporter } from '../DRAssessmentReporter';
import { DataRaptorAssessmentInfo } from '../../interfaces';
import { ReportHeader } from '../../reportGenerator/reportInterfaces';

describe('DRAssessmentReporter', () => {
  const mockInstanceUrl = 'https://test.salesforce.com';
  const mockOrg: ReportHeader[] = [
    { key: 'orgId', value: 'test-org-id' },
    { key: 'orgName', value: 'Test Org' },
  ];

  const mockData: DataRaptorAssessmentInfo[] = [
    {
      oldName: 'TravelersInsuranceCreateQuotePolicyJson-OS',
      name: 'TravelersInsuranceCreateQuotePolicyJsonOS',
      id: 'a1dWs000001F1HxIAK',
      type: 'Transform',
      formulaChanges: [],
      infos: [],
      warnings: [
        'name will be changed from TravelersInsuranceCreateQuotePolicyJson-OS to TravelersInsuranceCreateQuotePolicyJsonOS',
      ],
      apexDependencies: [],
    },
    {
      oldName: 'OS-PolicyDetailsTransform',
      name: 'OSPolicyDetailsTransform',
      id: 'a1dWs000001F1HyIAK',
      type: 'Transform',
      formulaChanges: [],
      infos: [],
      warnings: ['name will be changed from OS-PolicyDetailsTransform to OSPolicyDetailsTransform'],
      apexDependencies: [],
    },
    {
      oldName: 'GetUserPermissionsSetGroupDetails',
      name: 'GetUserPermissionsSetGroupDetails',
      id: 'a1dWs000001F1HzIAK',
      type: 'Extract',
      formulaChanges: [],
      infos: [],
      warnings: [],
      apexDependencies: [],
    },
    {
      oldName: 'getCensusMemberIds',
      name: 'getCensusMemberIds',
      id: 'a1dWs000001F1I0IAK',
      type: 'Extract',
      formulaChanges: [],
      infos: [],
      warnings: [],
      apexDependencies: [],
    },
  ];

  describe('generateDRAssesment', () => {
    it('should generate report with correct title and structure', () => {
      const result = DRAssessmentReporter.generateDRAssesment(mockData, mockInstanceUrl, mockOrg);

      expect(result).to.include('Data Mapper Assessment Report');
      expect(result).to.include('<div class="slds-text-heading_large">');
      expect(result).to.include('<table');
      expect(result).to.include('<thead>');
      expect(result).to.include('<tbody id="filterable-table-body">');
    });

    it('should include all data raptor assessments with correct names', () => {
      const result = DRAssessmentReporter.generateDRAssesment(mockData, mockInstanceUrl, mockOrg);

      // Verify Transform type assessments
      expect(result).to.include('TravelersInsuranceCreateQuotePolicyJson-OS');
      expect(result).to.include('TravelersInsuranceCreateQuotePolicyJsonOS');
      expect(result).to.include('OS-PolicyDetailsTransform');
      expect(result).to.include('OSPolicyDetailsTransform');

      // Verify Extract type assessments
      expect(result).to.include('GetUserPermissionsSetGroupDetails');
      expect(result).to.include('getCensusMemberIds');
    });

    it('should include correct record IDs and links', () => {
      const result = DRAssessmentReporter.generateDRAssesment(mockData, mockInstanceUrl, mockOrg);

      const expectedLinks = ['a1dWs000001F1HxIAK', 'a1dWs000001F1HyIAK', 'a1dWs000001F1HzIAK', 'a1dWs000001F1I0IAK'];

      expectedLinks.forEach((id) => {
        expect(result).to.include(`<a href="${mockInstanceUrl}/${id}">${id}</a>`);
      });
    });

    it('should include correct type information', () => {
      const result = DRAssessmentReporter.generateDRAssesment(mockData, mockInstanceUrl, mockOrg);

      // Verify Transform type
      expect(result).to.include('Transform');

      // Verify Extract type
      expect(result).to.include('Extract');
    });

    it('should include name change warning messages', () => {
      const result = DRAssessmentReporter.generateDRAssesment(mockData, mockInstanceUrl, mockOrg);

      const expectedMessages = [
        'name will be changed from TravelersInsuranceCreateQuotePolicyJson-OS to TravelersInsuranceCreateQuotePolicyJsonOS',
        'name will be changed from OS-PolicyDetailsTransform to OSPolicyDetailsTransform',
      ];

      expectedMessages.forEach((message) => {
        expect(result).to.include(message);
      });
    });

    it('should handle empty data raptor assessments array', () => {
      const result = DRAssessmentReporter.generateDRAssesment([], mockInstanceUrl, mockOrg);

      expect(result).to.include('Data Mapper Assessment Report');
      expect(result).to.include('<table');
      expect(result).to.include('<tbody id="filterable-table-body">');
      expect(result).to.include('<tr id="no-rows-message"');
      expect(result).to.include('No matching records found');
    });

    describe('UI elements and accessibility', () => {
      it('should include row count display', () => {
        const result = DRAssessmentReporter.generateDRAssesment(mockData, mockInstanceUrl, mockOrg);
        expect(result).to.include('Showing 4 records');
      });

      it('should include migration banner', () => {
        const result = DRAssessmentReporter.generateDRAssesment(mockData, mockInstanceUrl, mockOrg);

        expect(result).to.include('class="migration-message"');
        expect(result).to.include(
          'High level description of what actions were taken as part of the migration will come here'
        );
      });

      it('should include header container with org details', () => {
        const result = DRAssessmentReporter.generateDRAssesment(mockData, mockInstanceUrl, mockOrg);

        expect(result).to.include('class="header-container"');
        expect(result).to.include('class="org-details-section"');
        expect(result).to.include('test-org-id');
        expect(result).to.include('Test Org');
      });

      it('should include required scripts and styles', () => {
        const result = DRAssessmentReporter.generateDRAssesment(mockData, mockInstanceUrl, mockOrg);

        expect(result).to.include('<script src="./reportGeneratorUtility.js" defer></script>');
        expect(result).to.include('<link rel="stylesheet" href="./reportGenerator.css">');
      });

      it('should have proper table accessibility attributes', () => {
        const result = DRAssessmentReporter.generateDRAssesment(mockData, mockInstanceUrl, mockOrg);

        expect(result).to.include('aria-label="Data Mapper Assessment"');
        expect(result).to.include(
          'class="slds-table slds-table_cell-buffer slds-table_bordered slds-table_striped slds-table_col-bordered"'
        );
      });
    });
  });
});
