/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import fs from 'fs';
import open from 'open';
import { AssessmentInfo, FlexCardAssessmentInfo, nameLocation } from '../interfaces';
import { ReportHeaderFormat } from '../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../orgUtils';
import { pushAssestUtilites } from '../file/fileUtil';
import { OSAssessmentReporter } from './OSAssessmentReporter';
import { ApexAssessmentReporter } from './ApexAssessmentReporter';
import { IPAssessmentReporter } from './IPAssessmentReporter';
import { DRAssessmentReporter } from './DRAssessmentReporter';

export class AssessmentReporter {
  public static async generate(
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails
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

    this.createDocument(
      omniscriptAssessmentFilePath,
      OSAssessmentReporter.generateOSAssesment(result.omniAssessmentInfo.osAssessmentInfos, instanceUrl, orgDetails)
    );
    this.createDocument(
      flexcardAssessmentFilePath,
      this.generateCardAssesment(result.flexCardAssessmentInfos, instanceUrl)
    );
    this.createDocument(
      integrationProcedureAssessmentFilePath,
      IPAssessmentReporter.generateIPAssesment(result.omniAssessmentInfo.ipAssessmentInfos, instanceUrl, orgDetails)
    );
    this.createDocument(
      dataMapperAssessmentFilePath,
      DRAssessmentReporter.generateDRAssesment(result.dataRaptorAssessmentInfos, instanceUrl, orgDetails)
    );

    this.createDocument(
      apexAssessmentFilePath,
      ApexAssessmentReporter.generateApexAssesment(result.apexAssessmentInfos, instanceUrl, orgDetails)
    );
    // this.createDocument(
    //   lwcAssessmentFilePath,
    //   LWCAssessmentReporter.generateLwcAssesment(result.lwcAssessmentInfos, instanceUrl, orgDetails)
    // );

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
        value: orgDetails.packageDetails[0].namespace,
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

  private static generateCardAssesment(flexCardAssessmentInfos: FlexCardAssessmentInfo[], instanceUrl: string): string {
    let tableBody = '';
    tableBody += '<div class="slds-text-heading_large">Flexcard Components Assessment</div>';
    for (const card of flexCardAssessmentInfos) {
      const row = `
              <tr class="slds-hint_parent">
                  <td style="word-wrap: break-word; white-space: normal; max-width: 200px;">
                      <div class="slds-truncate" title="${card.name}">${card.name}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 100px;">
                      <div class="slds-truncate" title="${card.id}"><a href="${instanceUrl}/${card.id}">${card.id}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 60%; overflow: hidden;">
                      <div title="${card.dependenciesOS}">${card.dependenciesOS}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 60%; overflow: hidden;">
                      <div title="${card.dependenciesIP}">${card.dependenciesIP}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 60%; overflow: hidden;">
                      <div title="${card.dependenciesDR}">${card.dependenciesDR}</div>
                  </td>
              </tr>`;
      tableBody += row;
    }

    return this.getCardAssessmentReport(tableBody);
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

  private static getCardAssessmentReport(tableContent: string): string {
    const tableBody = `
        <div style="margin-block:15px">        
            <table style="width: 100%; table-layout: auto;" class="slds-table slds-table_cell-buffer slds-table_bordered slds-table_striped slds-table_col-bordered" aria-label="Results for Flexcards updates">
            <thead>
                <tr class="slds-line-height_reset">
                    <th class="" scope="col" style="width: 20%; word-wrap: break-word; white-space: normal; text-align: left;">
                        <div class="slds-truncate" title="Name">Name</div>
                    </th>
                    <th class="" scope="col" style="width: 10%; word-wrap: break-word; white-space: normal; text-align: left;">
                        <div class="slds-truncate" title="ID">ID</div>
                    </th>
                    <th class="" scope="col" style="width: 20%; word-wrap: break-word; white-space: normal; text-align: left;">
                        <div title="Dependencies">Omniscript Dependencies</div>
                    </th>
                    <th class="" scope="col" style="width: 20%; word-wrap: break-word; white-space: normal; text-align: left;">
                        <div title="Dependencies">Integration Procedures Dependencies</div>
                    </th>
                    <th class="" scope="col" style="width: 20%; word-wrap: break-word; white-space: normal; text-align: left;">
                        <div title="Dependencies">Data Mapper Dependencies</div>
                    </th>
                </tr>
            </thead>
            <tbody>
            ${tableContent}
            </tbody>
            </table>
        </div>`;
    return tableBody;
  }
}
