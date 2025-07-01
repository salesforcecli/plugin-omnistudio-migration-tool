/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import fs from 'fs';
import path from 'path';
import open from 'open';
import { Messages } from '@salesforce/core';
import { AssessmentInfo } from '../interfaces';
import { DashboardParam } from '../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../orgUtils';
import { Constants } from '../constants/stringContants';
import { pushAssestUtilites } from '../file/fileUtil';
import { TemplateParser } from '../templateParser/generate';
import { getOrgDetailsForReport } from '../reportGenerator/reportUtil';
import { OSAssessmentReporter } from './OSAssessmentReporter';
import { ApexAssessmentReporter } from './ApexAssessmentReporter';
import { IPAssessmentReporter } from './IPAssessmentReporter';
import { DRAssessmentReporter } from './DRAssessmentReporter';
import { FlexcardAssessmentReporter } from './FlexcardAssessmentReporter';

export class AssessmentReporter {
  private static basePath = path.join(process.cwd(), 'assessment_reports');
  private static omniscriptAssessmentFileName = 'omniscript_assessment.html';
  private static flexcardAssessmentFileName = 'flexcard_assessment.html';
  private static integrationProcedureAssessmentFileName = 'integration_procedure_assessment.html';
  private static dataMapperAssessmentFileName = 'datamapper_assessment.html';
  private static apexAssessmentFileName = 'apex_assessment.html';
  private static dashboardFileName = 'dashboard.html';
  private static templateDir = 'templates';
  private static dashboardTemplateName = 'dashboard.template';
  private static reportTemplateName = 'assessmentReport.template';
  private static dashboardTemplate = path.join(__dirname, '..', '..', this.templateDir, this.dashboardTemplateName);
  // TODO: Uncomment code once MVP for migration is completed
  // private static lwcAssessmentFilePath = this.basePath + '/lwc_assessment.html';
  public static async generate(
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    assessOnly: string,
    relatedObjects: string[],
    messages: Messages
  ): Promise<void> {
    fs.mkdirSync(this.basePath, { recursive: true });

    const assessmentReportTemplate = fs.readFileSync(
      path.join(__dirname, '..', '..', this.templateDir, this.reportTemplateName),
      'utf8'
    );
    if (!assessOnly) {
      this.createDocument(
        path.join(this.basePath, this.omniscriptAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          OSAssessmentReporter.getOmniscriptAssessmentData(
            result.omniAssessmentInfo.osAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          ),
          messages
        )
      );

      this.createDocument(
        path.join(this.basePath, this.flexcardAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          FlexcardAssessmentReporter.getFlexcardAssessmentData(
            result.flexCardAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          ),
          messages
        )
      );
      this.createDocument(
        path.join(this.basePath, this.apexAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          ApexAssessmentReporter.getApexAssessmentData(result.apexAssessmentInfos, omnistudioOrgDetails),
          messages
        )
      );

      // this.createDocument(
      //   lwcAssessmentFilePath,
      //   LWCAssessmentReporter.generateLwcAssesment(result.lwcAssessmentInfos, instanceUrl, orgDetails)
      // );

      this.createDocument(
        path.join(this.basePath, this.integrationProcedureAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          IPAssessmentReporter.getIntegrationProcedureAssessmentData(
            result.omniAssessmentInfo.ipAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          ),
          messages
        )
      );

      this.createDocument(
        path.join(this.basePath, this.dataMapperAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          DRAssessmentReporter.getDatamapperAssessmentData(
            result.dataRaptorAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          ),
          messages
        )
      );
    } else {
      switch (assessOnly) {
        case Constants.Omniscript:
          this.createDocument(
            path.join(this.basePath, this.omniscriptAssessmentFileName),
            TemplateParser.generate(
              assessmentReportTemplate,
              OSAssessmentReporter.getOmniscriptAssessmentData(
                result.omniAssessmentInfo.osAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              ),
              messages
            )
          );
          break;

        case Constants.Flexcard:
          this.createDocument(
            path.join(this.basePath, this.flexcardAssessmentFileName),
            TemplateParser.generate(
              assessmentReportTemplate,
              FlexcardAssessmentReporter.getFlexcardAssessmentData(
                result.flexCardAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              ),
              messages
            )
          );
          break;

        case Constants.IntegrationProcedure:
          this.createDocument(
            path.join(this.basePath, this.integrationProcedureAssessmentFileName),
            TemplateParser.generate(
              assessmentReportTemplate,
              IPAssessmentReporter.getIntegrationProcedureAssessmentData(
                result.omniAssessmentInfo.ipAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              ),
              messages
            )
          );
          break;

        case Constants.DataMapper:
          this.createDocument(
            path.join(this.basePath, this.dataMapperAssessmentFileName),
            TemplateParser.generate(
              assessmentReportTemplate,
              DRAssessmentReporter.getDatamapperAssessmentData(
                result.dataRaptorAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              ),
              messages
            )
          );
          break;

        default:
      }
    }

    if (relatedObjects && relatedObjects.includes(Constants.Apex)) {
      this.createDocument(
        path.join(this.basePath, this.apexAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          ApexAssessmentReporter.getApexAssessmentData(result.apexAssessmentInfos, omnistudioOrgDetails),
          messages
        )
      );
    }
    // TODO: Uncomment code once MVP for migration is completed
    // if (relatedObjects && relatedObjects.includes(Constants.LWC)) {
    //   this.createDocument(
    //     lwcAssessmentFilePath,
    //     LWCAssessmentReporter.generateLwcAssesment(result.lwcAssessmentInfos, instanceUrl, orgDetails)
    //   );
    // }

    // await this.createMasterDocument(nameUrls, basePath);
    this.createDashboard(this.basePath, result, omnistudioOrgDetails, messages);
    pushAssestUtilites('javascripts', this.basePath);
    pushAssestUtilites('styles', this.basePath);
    await open(path.join(this.basePath, this.dashboardFileName));
  }
  private static createDashboard(
    basePath: string,
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages
  ): void {
    const dashboardTemplate = fs.readFileSync(this.dashboardTemplate, 'utf8');
    this.createDocument(
      path.join(basePath, this.dashboardFileName),
      TemplateParser.generate(dashboardTemplate, this.createDashboardParam(result, omnistudioOrgDetails), messages)
    );
  }
  private static createDashboardParam(
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): DashboardParam {
    return {
      title: 'Assessment Reports',
      heading: 'Assessment Reports',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toISOString(),
      summaryItems: [
        {
          name: 'DataMapper',
          total: result.dataRaptorAssessmentInfos.length,
          data: DRAssessmentReporter.getSummaryData(result.dataRaptorAssessmentInfos),
          file: this.dataMapperAssessmentFileName,
        },
        {
          name: 'Integration Procedure',
          total: result.omniAssessmentInfo.ipAssessmentInfos.length,
          data: IPAssessmentReporter.getSummaryData(result.omniAssessmentInfo.ipAssessmentInfos),
          file: this.integrationProcedureAssessmentFileName,
        },
        {
          name: 'OmniScript',
          total: result.omniAssessmentInfo.osAssessmentInfos.length,
          data: OSAssessmentReporter.getSummaryData(result.omniAssessmentInfo.osAssessmentInfos),
          file: this.omniscriptAssessmentFileName,
        },
        {
          name: 'Flexcard',
          total: result.flexCardAssessmentInfos.length,
          data: FlexcardAssessmentReporter.getSummaryData(result.flexCardAssessmentInfos),
          file: this.flexcardAssessmentFileName,
        },
        {
          name: 'Apex',
          total: result.apexAssessmentInfos.length,
          data: ApexAssessmentReporter.getSummaryData(result.apexAssessmentInfos),
          file: this.apexAssessmentFileName,
        },
      ],
    };
  }

  private static createDocument(filePath: string, htmlBody: string): void {
    fs.writeFileSync(filePath, htmlBody);
  }
}
