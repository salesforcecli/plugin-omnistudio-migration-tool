import fs from 'fs';
import open from 'open';
import { ApexAssessmentInfo, AssessmentInfo, LWCAssessmentInfo } from '../interfaces';

export class AssessmentReporter {
  public static async generate(result: AssessmentInfo, instanceUrl: string): Promise<void> {
    let htmlBody = '';

    htmlBody += '<br />' + this.generateLwcAssesment(result.lwcAssessmentInfos);
    htmlBody += '<br />' + this.generateApexAssesment(result.apexAssessmentInfos);
    const doc = this.generateDocument(htmlBody);
    const fileUrl = process.cwd() + '/assessmentresults.html';
    fs.writeFileSync(fileUrl, doc);

    await open('file://' + fileUrl);
  }

  private static generateLwcAssesment(lwcAssessmentInfos: LWCAssessmentInfo[]): string {
    let tableBody = '';
    tableBody += '<div class="slds-text-heading_large">LWC Assessment</div>';
    for (const lwcAssessmentInfo of lwcAssessmentInfos) {
      let changeInfoRows = '';

      for (const changeInfo of lwcAssessmentInfo.changeInfos) {
        changeInfoRows += `<tr class ="slds-hint_parent">
                                <td><div class="slds-truncate" title="${changeInfo.name}"><a href="${changeInfo.path}">${changeInfo.name}</div></td>
                                <td><div class="slds-truncate">${changeInfo.diff}</div></td>
                            </tr>`;
      }
      const changeInfoTable = `<table>
                                    ${changeInfoRows}
                                </table>`;
      const row = `<tr class="slds-hint_parent">
                            <td><div class="slds-truncate" title="${lwcAssessmentInfo.name}">${lwcAssessmentInfo.name}</div></td>
                            <td>${changeInfoTable}</td>
                        </tr>`;
      tableBody += row;
    }
    return this.getLWCAssesmentReport(tableBody);
  }

  private static generateApexAssesment(apexAssessmentInfos: ApexAssessmentInfo[]): string {
    let tableBody = '';
    tableBody += '<div class="slds-text-heading_large">Apex Assessment</div>';
    for (const apexAssessmentInfo of apexAssessmentInfos) {
      const message = this.generateMessages(apexAssessmentInfo.infos);
      const errors = this.generateMessages(apexAssessmentInfo.warnings);
      const row = `<tr class="slds-hint_parent">
      <td><div class="slds-truncate" title="${apexAssessmentInfo.name}">${apexAssessmentInfo.name}</div></td>
      <td><div class="slds-truncate" title="${apexAssessmentInfo.name}"><a href="${apexAssessmentInfo.path}">${apexAssessmentInfo.name}</div></td>
      <td><div class="slds-truncate">${apexAssessmentInfo.diff}</div></td>
      <td><div class="slds-truncate"></div>${message}</td>
      <td><div class="slds-truncate"></div>${errors}</td>
     </tr>`;
      tableBody += row;
    }
    return this.getApexAssessmentReport(tableBody);
  }

  private static generateMessages(messages: string[]): string {
    let messageBody = '';
    for (const message of messages) {
      messageBody += `<li class="slds-item slds-text-color_destructive">${message}</li>`;
    }
    return messageBody;
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
                <div class="slds-text-heading_large">OmniStudio Migration Assessment </div>
                    ${resultsAsHtml}
                </div>
            </div>
            </body>
        </html>
        `;
    return document;
  }

  private static getApexAssessmentReport(tableContent: string): string {
    const tableBody = `
      <div style="margin-block:15px">        
        <table class="slds-table slds-table_cell-buffer slds-table_bordered slds-table_striped slds-table_col-bordered" aria-label="Results for Apex updates">
        <thead>
            <tr class="slds-line-height_reset">
                <th class="" scope="col" style="width: 25%">
                    <div class="slds-truncate" title="Name">Name</div>
                </th>
                <th class="" scope="col" style="width: 10%">
                    <div class="slds-truncate" title="File">File reference</div>
                </th>
                <th class="" scope="col" style="width: 10%">
                    <div class="slds-truncate" title="Diff">Diff</div>
                </th>
                <th class="" scope="col" style="width: 10%">
                    <div class="slds-truncate" title="Infos">Comments</div>
                </th>
                <th class="" scope="col" style="width: 10%">
                    <div class="slds-truncate" title="Warnings">Errors</div>
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

  private static getLWCAssesmentReport(tableContent: string): string {
    const tableBody = `
      <div style="margin-block:15px">        
        <table class="slds-table slds-table_cell-buffer slds-table_bordered slds-table_striped slds-table_col-bordered" aria-label="Results for LWC updates">
        <thead>
            <tr class="slds-line-height_reset">
                <th class="" scope="col" style="width: 25%">
                    <div class="slds-truncate" title="Name">Name</div>
                </th>
                <th class="" scope="col" style="width: 10%">
                    <div class="slds-truncate" title="Changes">Status</div>
                </th>
                <th class="" scope="col">
                    <div class="slds-truncate" title="Errors">Errors</div>
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
