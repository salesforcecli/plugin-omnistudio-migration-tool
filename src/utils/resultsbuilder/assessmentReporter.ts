/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import fs from 'fs';
import open from 'open';
import { AssessmentInfo, nameLocation } from '../interfaces';
import { ReportHeaderFormat } from '../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../orgUtils';
import { Constants } from '../constants/stringContants';
import { pushAssestUtilites } from '../file/fileUtil';
import { OSAssessmentReporter } from './OSAssessmentReporter';
import { ApexAssessmentReporter } from './ApexAssessmentReporter';
import { IPAssessmentReporter } from './IPAssessmentReporter';
import { DRAssessmentReporter } from './DRAssessmentReporter';
import { FlexcardAssessmentReporter } from './FlexcardAssessmentReporter';

export class AssessmentReporter {
  public static async generate(
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    assessOnly: string,
    relatedObjects: string[]
  ): Promise<void> {
    const basePath = process.cwd() + '/assessment_reports';
    fs.mkdirSync(basePath, { recursive: true });
    const omniscriptAssessmentFilePath = basePath + '/omniscript_assessment.html';
    const flexcardAssessmentFilePath = basePath + '/flexcard_assessment.html';
    const integrationProcedureAssessmentFilePath = basePath + '/integration_procedure_assessment.html';
    const dataMapperAssessmentFilePath = basePath + '/datamapper_assessment.html';
    const apexAssessmentFilePath = basePath + '/apex_assessment.html';
    // TODO: Uncomment code once MVP for migration is completed
    // const lwcAssessmentFilePath = basePath + '/lwc_assessment.html';
    const orgDetails: ReportHeaderFormat[] = this.formattedOrgDetails(omnistudioOrgDetails);

    if (!assessOnly) {
      this.createDocument(
        omniscriptAssessmentFilePath,
        OSAssessmentReporter.generateOSAssesment(result.omniAssessmentInfo.osAssessmentInfos, instanceUrl, orgDetails, omnistudioOrgDetails.rollbackFlags)
      );

      this.createDocument(
        flexcardAssessmentFilePath,
        FlexcardAssessmentReporter.generateFlexcardAssesment(result.flexCardAssessmentInfos, instanceUrl, orgDetails)
      );
      this.createDocument(
        apexAssessmentFilePath,
        ApexAssessmentReporter.generateApexAssesment(result.apexAssessmentInfos, instanceUrl, orgDetails)
      );

      // this.createDocument(
      //   lwcAssessmentFilePath,
      //   LWCAssessmentReporter.generateLwcAssesment(result.lwcAssessmentInfos, instanceUrl, orgDetails)
      // );

      this.createDocument(
        integrationProcedureAssessmentFilePath,
        IPAssessmentReporter.generateIPAssesment(result.omniAssessmentInfo.ipAssessmentInfos, instanceUrl, orgDetails, omnistudioOrgDetails.rollbackFlags)
      );

      this.createDocument(
        dataMapperAssessmentFilePath,
        DRAssessmentReporter.generateDRAssesment(result.dataRaptorAssessmentInfos, instanceUrl, orgDetails, omnistudioOrgDetails.rollbackFlags)
      );
    } else {
      switch (assessOnly) {
        case Constants.Omniscript:
          this.createDocument(
            omniscriptAssessmentFilePath,
            OSAssessmentReporter.generateOSAssesment(
              result.omniAssessmentInfo.osAssessmentInfos,
              instanceUrl,
              orgDetails,
              omnistudioOrgDetails.rollbackFlags
            )
          );
          break;

        case Constants.Flexcard:
          this.createDocument(
            flexcardAssessmentFilePath,
            FlexcardAssessmentReporter.generateFlexcardAssesment(result.flexCardAssessmentInfos, instanceUrl, orgDetails)
          );
          break;

        case Constants.IntegrationProcedure:
          this.createDocument(
            integrationProcedureAssessmentFilePath,
            IPAssessmentReporter.generateIPAssesment(
              result.omniAssessmentInfo.ipAssessmentInfos,
              instanceUrl,
              orgDetails,
              omnistudioOrgDetails.rollbackFlags
            )
          );
          break;

        case Constants.DataMapper:
          this.createDocument(
            dataMapperAssessmentFilePath,
            DRAssessmentReporter.generateDRAssesment(result.dataRaptorAssessmentInfos, instanceUrl, orgDetails, omnistudioOrgDetails.rollbackFlags)
          );
          break;

        default:
      }
    }

    if (relatedObjects && relatedObjects.includes(Constants.Apex)) {
      this.createDocument(
        apexAssessmentFilePath,
        ApexAssessmentReporter.generateApexAssesment(result.apexAssessmentInfos, instanceUrl, orgDetails)
      );
    }
    // TODO: Uncomment code once MVP for migration is completed
    // if (relatedObjects && relatedObjects.includes(Constants.LWC)) {
    //   this.createDocument(
    //     lwcAssessmentFilePath,
    //     LWCAssessmentReporter.generateLwcAssesment(result.lwcAssessmentInfos, instanceUrl, orgDetails)
    //   );
    // }
    
    const nameUrls = [
      {
        name: 'omnscript assessment report',
        location: 'omniscript_assessment.html',
      },
      {
        name: 'flexcard assessment report',
        location: 'flexcard_assessment.html',
      },
      {
        name: 'Integration Procedure assessment report',
        location: 'integration_procedure_assessment.html',
      },
      {
        name: 'DataMapper assessment report',
        location: 'datamapper_assessment.html',
      },
      {
        name: 'Apex assessment report',
        location: 'apex_assessment.html',
      },
      // TODO: Uncomment code once MVP for migration is completed
      // {
      //   name: 'LWC assessment report',
      //   location: 'lwc_assessment.html',
      // },
    ];

    await this.createMasterDocument(nameUrls, basePath);
    pushAssestUtilites('javascripts', basePath);
    pushAssestUtilites('styles', basePath);
  }

  private static formattedOrgDetails(orgDetails: OmnistudioOrgDetails): ReportHeaderFormat[] {
    return [
      {
        key: 'Org Name',
        value: orgDetails.orgDetails.Name,
      },
      {
        key: 'Org Id',
        value: orgDetails.orgDetails.Id,
      },
      {
        key: 'Package Name',
        value: orgDetails.packageDetails.namespace,
      },
      {
        key: 'Data Model',
        value: orgDetails.dataModel,
      },
      {
        key: 'Assessment Date and Time',
        value: new Date() as unknown as string,
      },
    ];
  }

  private static async createMasterDocument(reports: nameLocation[], basePath: string): Promise<void> {
    let listBody = '';
    for (const report of reports) {
      listBody += ` <li class="slds-list__item" >
                <a href="${report.location}" class="slds-text-link" > ${report.name} </a>
                    </li>`;
    }
    const body = `
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/design-system/2.17.5/styles/salesforce-lightning-design-system.min.css">
                            <title>SLDS Bulleted List</title>
                        </head>
                        <body>
                            <div class="slds-p-around_medium">
                                <h1 class="slds-text-heading_medium">Assessment Reports</h1>                                
                                <ul class="slds-list_vertical slds-has-dividers_left-space">
                                    ${listBody}
                                </ul>
                            </div>
                        </body>
                        </html>
                    `;
    const fileUrl = basePath + '/assessmentresults.html';

    fs.writeFileSync(fileUrl, body);
    await open('file://' + fileUrl);
  }

  private static createDocument(filePath: string, htmlBody: string): void {
    const doc = this.generateDocument(htmlBody);
    fs.writeFileSync(filePath, doc);
  }

  private static generateDocument(resultsAsHtml: string): string {
    const document = `
        <html>
            <head>
                <title>OmniStudio Migration Assessment</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/design-system/2.17.5/styles/salesforce-lightning-design-system.min.css" />
            </head>
            <body>
            <div style="margin: 20px;">
                    ${resultsAsHtml}
                </div>
            </div>
            </body>
        </html>
        `;
    return document;
  }

}
