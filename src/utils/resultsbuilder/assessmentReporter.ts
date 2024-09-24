import fs from 'fs';
import open from 'open';
import { AssessmentInfo, LWCAssessmentInfo } from '../interfaces';

export class AssessmentReporter {
  public static async generate(result: AssessmentInfo, instanceUrl: string): Promise<void> {
    let htmlBody = '';

    htmlBody += '<br />' + this.generateLwcAssesment(result.lwcAssessmentInfos);

    const doc = this.generateDocument(htmlBody);
    const fileUrl = process.cwd() + '/assessmentresults.html';
    fs.writeFileSync(fileUrl, doc);

    await open('file://' + fileUrl);
  }

  private static generateDocument(resultsAsHtml: string): string {
    const document = `
        <html>
            <head>
                <title>OmniStudio Migration Results</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/design-system/2.17.5/styles/salesforce-lightning-design-system.min.css" />
            </head>
            <body>
            <div style="margin: 20px;">
                <div class="slds-text-heading_large">OmniStudio Migration Results</div>
                    ${resultsAsHtml}
                </div>
            </div>
            </body>
        </html>
        `;
    return document;
  }

  private static generateLwcAssesment(lwcAssessmentInfos: LWCAssessmentInfo[]): string {
    let tableBody = '';
    tableBody += `
    <html>
            <head>
                <title>OmniStudio Migration Results</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/design-system/2.17.5/styles/salesforce-lightning-design-system.min.css" />
            </head>
            <body>
            <div style="margin: 20px;">
                <div class="slds-text-heading_large">OmniStudio Migration Results</div>`;
    tableBody += '<div class="slds-text-heading_large">LWC Assessment</div>';
    for (const lwcAssessmentInfo of lwcAssessmentInfos) {
      let changeInfoRows = '';

      for (const changeInfo of lwcAssessmentInfo.changeInfos) {
        changeInfoRows += `<tr class ="slds-hint_parent">
                                <td><div class="slds-truncate" title="${changeInfo.name}"><a href="${changeInfo.path}">${changeInfo.name}</div></td>
                                <td><div class="slds-scrollable" style="height:8rem;width:36rem"><pre>${changeInfo.diff}<pre></div></td>
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
    tableBody += `
    </div>
            </div>
            </body>
        </html>
        `;
    return this.getLWCAssesmentReport(tableBody);
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
                    <div class="slds-truncate" title="Changes">File Path & Diff</div>
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
