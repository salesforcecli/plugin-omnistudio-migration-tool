import * as fs from 'fs';
import * as path from 'path';
import { test } from '@salesforce/command/lib/test';
import { stubMethod } from '@salesforce/ts-sinon';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { DataRaptorMigrationTool } from '../../../../migration/dataraptor';
import { CardMigrationTool } from '../../../../migration/flexcard';
import { OmniScriptMigrationTool } from '../../../../migration/omniscript';
import OmnistudioRelatedObjectMigrationFacade from '../../../../migration/related/OmnistudioRelatedObjectMigrationFacade';
import { OrgUtils } from '../../../../utils/orgUtils';
import { OmnistudioOrgDetails } from '../../../../utils/orgUtils';
import { Constants } from '../../../../utils/constants/stringContants';

// Helper function to normalize paths for comparison

describe('omnistudio:migration:assess', () => {
  let sandbox: sinon.SinonSandbox;
  const assessmentReportsDir = path.join(process.cwd(), 'assessment_reports');

  // Mock org details
  const mockOrgDetailsStandardModel: OmnistudioOrgDetails = {
    packageDetails: {
      version: '1.0.0',
      namespace: 'vlocity_ins',
    },
    omniStudioOrgPermissionEnabled: false,
    orgDetails: {
      Name: 'Test Org',
      Id: '00D000000000001',
    },
    dataModel: 'Standard',
    hasValidNamespace: true,
  };

  // Sample data for DataRaptor assessment
  const sampleDataRaptorAssessment = [
    {
      oldName: 'DR_Test_Extract',
      name: 'DR_Test_Extract',
      id: 'a0B1x0000000001',
      type: 'Extract',
      formulaChanges: [
        {
          old: 'vlocity_ins:DRGlobal.process',
          new: 'omnistudio:DRGlobal.process',
        },
      ],
      infos: ['Using standard objects'],
      warnings: ['Consider using standard objects instead of custom objects'],
      apexDependencies: ['TestApexClass'],
    },
    {
      oldName: 'DR_Test_Transform',
      name: 'DR_Test_Transform',
      id: 'a0B1x0000000002',
      type: 'Transform',
      formulaChanges: [
        {
          old: 'vlocity_ins:DRGlobal.processObjectsJSON',
          new: 'omnistudio:DRGlobal.processObjectsJSON',
        },
      ],
      infos: ['Using new API methods'],
      warnings: ['Uses deprecated functions'],
      apexDependencies: [],
    },
  ];

  // Sample data for FlexCard assessment
  const sampleFlexCardAssessment = [
    {
      name: 'FC_Test_Card',
      id: 'a0B1x0000000003',
      dependenciesIP: ['IP_Test_Procedure'],
      dependenciesDR: ['DR_Test_Extract'],
      dependenciesOS: ['OS_Test_Script'],
      infos: ['Using Lightning Web Components'],
      warnings: ['Consider using Lightning Web Components'],
    },
    {
      name: 'FC_Test_Form',
      id: 'a0B1x0000000004',
      dependenciesIP: [],
      dependenciesDR: [],
      dependenciesOS: [],
      infos: ['Using new Lightning components'],
      warnings: ['Uses deprecated components'],
    },
  ];

  // Sample data for OmniScript assessment
  const sampleOmniScriptAssessment = {
    osAssessmentInfos: [
      {
        name: 'OS_Test_Script',
        id: 'a0B1x0000000005',
        oldName: 'Old_OS_Test_Script',
        type: 'LWC',
        dependenciesIP: [{ name: 'IP_Test_Procedure', location: '/path/to/ip' }],
        missingIP: [],
        dependenciesDR: [{ name: 'DR_Test_Extract', location: '/path/to/dr' }],
        missingDR: [],
        dependenciesOS: [],
        missingOS: [],
        dependenciesRemoteAction: [],
        dependenciesLWC: [],
        infos: ['Using Lightning Web Components'],
        warnings: ['Consider using Lightning Web Components'],
        errors: [],
        migrationStatus: 'Can be Automated',
      },
    ],
    ipAssessmentInfos: [
      {
        name: 'IP_Test_Procedure',
        id: 'a0B1x0000000006',
        oldName: 'Old_IP_Test_Procedure',
        dependenciesIP: [],
        dependenciesDR: [{ name: 'DR_Test_Transform', location: '/path/to/dr' }],
        dependenciesOS: [{ name: 'OS_Test_Script', location: '/path/to/os' }],
        dependenciesRemoteAction: [],
        infos: ['Using new API methods'],
        warnings: ['Uses deprecated methods'],
        errors: [],
        path: '/path/to/ip',
      },
    ],
  };

  // Sample data for Apex assessment
  const sampleApexAssessment = [
    {
      name: 'TestApexClass',
      path: '/path/to/TestApexClass.cls',
      diff: 'Updated to use new API methods',
      warnings: ['Consider using Lightning Web Components'],
      infos: ['File has been updated to allow calls to Omnistudio components'],
    },
    {
      name: 'AnotherApexClass',
      path: '/path/to/AnotherApexClass.cls',
      diff: 'Updated namespace references',
      warnings: ['Uses deprecated methods'],
      infos: ['Updated to use new namespace'],
    },
  ];

  // Sample data for LWC assessment
  const sampleLwcAssessment = [
    {
      name: 'testLwcComponent',
      changeInfos: [
        {
          name: 'testLwcComponent.js',
          path: '/path/to/testLwcComponent.js',
          diff: 'Updated import statements',
        },
        {
          name: 'testLwcComponent.html',
          path: '/path/to/testLwcComponent.html',
          diff: 'Updated template syntax',
        },
      ],
      errors: ['Uses deprecated methods'],
    },
    {
      name: 'anotherLwcComponent',
      changeInfos: [
        {
          name: 'anotherLwcComponent.js',
          path: '/path/to/anotherLwcComponent.js',
          diff: 'Updated namespace references',
        },
      ],
      errors: [],
    },
  ];

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Mock the assessment tools with sample data
    stubMethod(sandbox, DataRaptorMigrationTool.prototype, 'assess').resolves(sampleDataRaptorAssessment);
    stubMethod(sandbox, CardMigrationTool.prototype, 'assess').resolves(sampleFlexCardAssessment);
    stubMethod(sandbox, OmniScriptMigrationTool.prototype, 'assess').resolves(sampleOmniScriptAssessment);
    // Mock the facade to use our stubbed methods
    stubMethod(sandbox, OmnistudioRelatedObjectMigrationFacade.prototype, 'assessAll').callsFake(
      (relatedObjects: string[]) => {
        const result = {
          apexAssessmentInfos: relatedObjects.includes(Constants.Apex) ? sampleApexAssessment : [],
          lwcAssessmentInfos: relatedObjects.includes(Constants.LWC) ? sampleLwcAssessment : [],
        };
        return result;
      }
    );

    // Mock OrgUtils.getOrgDetails
    stubMethod(sandbox, OrgUtils, 'getOrgDetails').resolves(mockOrgDetailsStandardModel);
  });

  afterEach(() => {
    if (sandbox) {
      sandbox.restore();
    }
    // Clean up assessment reports directory if it exists
    if (fs.existsSync(assessmentReportsDir)) {
      fs.rmSync(assessmentReportsDir, { recursive: true, force: true });
    }
  });

  test
    .withOrg({ username: 'test@org.com' }, true)
    .stdout()
    .stderr()
    .command(['omnistudio:migration:assess'])
    .it('generates all assessment files with content for all components', () => {
      // File content assertions (for both Linux and Windows)
      const dataRaptorContent = fs.readFileSync(
        path.join(process.cwd(), 'assessment_reports/datamapper_assessment.html'),
        'utf8'
      );
      expect(dataRaptorContent).to.include('DR_Test_Extract');
      expect(dataRaptorContent).to.include('DR_Test_Transform');

      const flexCardContent = fs.readFileSync(
        path.join(process.cwd(), 'assessment_reports/flexcard_assessment.html'),
        'utf8'
      );
      expect(flexCardContent).to.include('FC_Test_Card');
      expect(flexCardContent).to.include('FC_Test_Form');

      const omniScriptContent = fs.readFileSync(
        path.join(process.cwd(), 'assessment_reports/omniscript_assessment.html'),
        'utf8'
      );
      expect(omniScriptContent).to.include('OS_Test_Script');

      const ipContent = fs.readFileSync(
        path.join(process.cwd(), 'assessment_reports/integration_procedure_assessment.html'),
        'utf8'
      );
      expect(ipContent).to.include('IP_Test_Procedure');
    });

  test
    .withOrg({ username: 'test@org.com' }, true)
    .stdout()
    .stderr()
    .command(['omnistudio:migration:assess', '-o', Constants.DataMapper])
    .it('generates assessment files with content only for DataRaptor components', () => {
      const dataRaptorContent = fs.readFileSync(
        path.join(process.cwd(), 'assessment_reports/datamapper_assessment.html'),
        'utf8'
      );
      expect(dataRaptorContent).to.include('DR_Test_Extract');
      expect(dataRaptorContent).to.include('DR_Test_Transform');

      void expect(fs.existsSync(path.join(process.cwd(), 'assessment_reports/flexcard_assessment.html'))).to.be.false;
      void expect(fs.existsSync(path.join(process.cwd(), 'assessment_reports/omniscript_assessment.html'))).to.be.false;
      void expect(fs.existsSync(path.join(process.cwd(), 'assessment_reports/integration_procedure_assessment.html')))
        .to.be.false;
    });

  test
    .withOrg({ username: 'test@org.com' }, true)
    .stdout()
    .stderr()
    .command(['omnistudio:migration:assess', '-o', Constants.Flexcard])
    .it('generates assessment files with content only for FlexCard components', () => {
      void expect(fs.existsSync(path.join(process.cwd(), 'assessment_reports/datamapper_assessment.html'))).to.be.false;

      const flexCardContent = fs.readFileSync(
        path.join(process.cwd(), 'assessment_reports/flexcard_assessment.html'),
        'utf8'
      );

      expect(flexCardContent).to.include('FC_Test_Card');
      expect(flexCardContent).to.include('FC_Test_Form');
      void expect(fs.existsSync(path.join(process.cwd(), 'assessment_reports/omniscript_assessment.html'))).to.be.false;
      void expect(fs.existsSync(path.join(process.cwd(), 'assessment_reports/integration_procedure_assessment.html')))
        .to.be.false;
    });

  test
    .withOrg({ username: 'test@org.com' }, true)
    .stdout()
    .stderr()
    .command(['omnistudio:migration:assess', '-o', Constants.Omniscript])
    .it('generates assessment files with content only for OmniScript components', () => {
      void expect(fs.existsSync(path.join(process.cwd(), 'assessment_reports/datamapper_assessment.html'))).to.be.false;
      void expect(fs.existsSync(path.join(process.cwd(), 'assessment_reports/flexcard_assessment.html'))).to.be.false;
      void expect(fs.existsSync(path.join(process.cwd(), 'assessment_reports/integration_procedure_assessment.html')))
        .to.be.false;

      const omniScriptContent = fs.readFileSync(
        path.join(process.cwd(), 'assessment_reports/omniscript_assessment.html'),
        'utf8'
      );
      expect(omniScriptContent).to.include('OS_Test_Script');
    });

  test
    .withOrg({ username: 'test@org.com' }, true)
    .stdout()
    .stderr()
    .command(['omnistudio:migration:assess', '-o', Constants.IntegrationProcedure])
    .it('generates assessment files with content only for Integration Procedure components', () => {
      void expect(fs.existsSync(path.join(process.cwd(), 'assessment_reports/datamapper_assessment.html'))).to.be.false;
      void expect(fs.existsSync(path.join(process.cwd(), 'assessment_reports/flexcard_assessment.html'))).to.be.false;
      void expect(fs.existsSync(path.join(process.cwd(), 'assessment_reports/omniscript_assessment.html'))).to.be.false;

      const ipContent = fs.readFileSync(
        path.join(process.cwd(), 'assessment_reports/integration_procedure_assessment.html'),
        'utf8'
      );
      expect(ipContent).to.include('IP_Test_Procedure');
    });

  test
    .withOrg({ username: 'test@org.com' }, true)
    .stdout()
    .stderr()
    .command(['omnistudio:migration:assess', '-o', 'ro'])
    .it('does not generate any assessment files when ro option is passed', () => {
      // Optionally, you can check that the files do not exist
      const files = [
        'datamapper_assessment.html',
        'flexcard_assessment.html',
        'omniscript_assessment.html',
        'integration_procedure_assessment.html',
      ];
      files.forEach((file) => {
        const filePath = path.join(process.cwd(), 'assessment_reports', file);
        void expect(fs.existsSync(filePath)).to.be.false;
      });
    });

  // test
  //   .withOrg({ username: 'test@org.com' }, true)
  //   .stdout()
  //   .stderr()
  //   .command(['omnistudio:migration:assess', '-r', ''])
  //   .it('generates assessment files with content only for Apex components', () => {
  //     const apexContent = fs.readFileSync(path.join(process.cwd(), 'assessment_reports/apex_assessment.html'), 'utf8');
  //     void expect(apexContent).to.include('TestApexClass');

  //     // LWC assessment file should not exist since LWC functionality is disabled
  //     const lwcFilePath = path.join(process.cwd(), 'assessment_reports/lwc_assessment.html');
  //     void expect(fs.existsSync(lwcFilePath)).to.be.false;

  //     const dataRaptorContent = fs.readFileSync(
  //       path.join(process.cwd(), 'assessment_reports/datamapper_assessment.html'),
  //       'utf8'
  //     );
  //     void expect(dataRaptorContent).to.include('DR_Test_Extract');
  //     void expect(dataRaptorContent).to.include('DR_Test_Transform');

  //     const flexCardContent = fs.readFileSync(
  //       path.join(process.cwd(), 'assessment_reports/flexcard_assessment.html'),
  //       'utf8'
  //     );
  //     void expect(flexCardContent).to.include('FC_Test_Card');
  //     void expect(flexCardContent).to.include('FC_Test_Form');

  //     const omniScriptContent = fs.readFileSync(
  //       path.join(process.cwd(), 'assessment_reports/omniscript_assessment.html'),
  //       'utf8'
  //     );
  //     void expect(omniScriptContent).to.include('OS_Test_Script');

  //     const ipContent = fs.readFileSync(
  //       path.join(process.cwd(), 'assessment_reports/integration_procedure_assessment.html'),
  //       'utf8'
  //     );
  //     void expect(ipContent).to.include('IP_Test_Procedure');
  //   });

  test
    .withOrg({ username: 'test@org.com' }, true)
    .stdout()
    .stderr()
    .command(['omnistudio:migration:assess', '-r', Constants.LWC])
    .it('does not generate LWC assessment file when lwc option is passed since functionality is disabled', () => {
      // LWC assessment file should not exist since LWC functionality is disabled
      const lwcFilePath = path.join(process.cwd(), 'assessment_reports/lwc_assessment.html');
      void expect(fs.existsSync(lwcFilePath)).to.be.false;

      const apexContent = fs.readFileSync(path.join(process.cwd(), 'assessment_reports/apex_assessment.html'), 'utf8');
      void expect(apexContent).to.not.include('TestApexClass');

      const dataRaptorContent = fs.readFileSync(
        path.join(process.cwd(), 'assessment_reports/datamapper_assessment.html'),
        'utf8'
      );
      void expect(dataRaptorContent).to.include('DR_Test_Extract');
      void expect(dataRaptorContent).to.include('DR_Test_Transform');

      const flexCardContent = fs.readFileSync(
        path.join(process.cwd(), 'assessment_reports/flexcard_assessment.html'),
        'utf8'
      );
      void expect(flexCardContent).to.include('FC_Test_Card');
      void expect(flexCardContent).to.include('FC_Test_Form');

      const omniScriptContent = fs.readFileSync(
        path.join(process.cwd(), 'assessment_reports/omniscript_assessment.html'),
        'utf8'
      );
      void expect(omniScriptContent).to.include('OS_Test_Script');

      const ipContent = fs.readFileSync(
        path.join(process.cwd(), 'assessment_reports/integration_procedure_assessment.html'),
        'utf8'
      );
      void expect(ipContent).to.include('IP_Test_Procedure');
    });

  // test
  //   .withOrg({ username: 'test@org.com' }, true)
  //   .stdout()
  //   .stderr()
  //   .command(['omnistudio:migration:assess', '-r', 'apex,lwc'])
  //   .it('generates assessment files with content only for Apex components when both apex and lwc are specified', () => {
  //     const apexContent = fs.readFileSync(path.join(process.cwd(), 'assessment_reports/apex_assessment.html'), 'utf8');
  //     void expect(apexContent).to.include('TestApexClass');

  //     // LWC assessment file should not exist since LWC functionality is disabled
  //     const lwcFilePath = path.join(process.cwd(), 'assessment_reports/lwc_assessment.html');
  //     void expect(fs.existsSync(lwcFilePath)).to.be.false;

  //     const dataRaptorContent = fs.readFileSync(
  //       path.join(process.cwd(), 'assessment_reports/datamapper_assessment.html'),
  //       'utf8'
  //     );
  //     void expect(dataRaptorContent).to.include('DR_Test_Extract');
  //     void expect(dataRaptorContent).to.include('DR_Test_Transform');

  //     const flexCardContent = fs.readFileSync(
  //       path.join(process.cwd(), 'assessment_reports/flexcard_assessment.html'),
  //       'utf8'
  //     );
  //     void expect(flexCardContent).to.include('FC_Test_Card');
  //     void expect(flexCardContent).to.include('FC_Test_Form');

  //     const omniScriptContent = fs.readFileSync(
  //       path.join(process.cwd(), 'assessment_reports/omniscript_assessment.html'),
  //       'utf8'
  //     );
  //     void expect(omniScriptContent).to.include('OS_Test_Script');

  //     const ipContent = fs.readFileSync(
  //       path.join(process.cwd(), 'assessment_reports/integration_procedure_assessment.html'),
  //       'utf8'
  //     );
  //     void expect(ipContent).to.include('IP_Test_Procedure');
  //   });
});
