/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import fs from 'fs';
import open from 'open';
import {
  ApexAssessmentInfo,
  AssessmentInfo,
  LWCAssessmentInfo,
  OmniAssessmentInfo,
  FlexCardAssessmentInfo,
  nameLocation,
} from '../interfaces';
import { generateHtmlTable } from '../reportGenerator/reportGenerator';
import { OSAssesmentReporter } from './OSAssessmentReporter';
import { IPAssessmentReporter } from './IPAssessmentReporter';
import { DRAssessmentReporter } from './DRAssessmentReporter';

type RowType = {
  name: string;
  filePath: string;
  fileName: string;
  diff: string;
  status: string;
  errors: string;
};

export class AssessmentReporter {
  public static async generate(result: AssessmentInfo, instanceUrl: string): Promise<void> {
    const basePath = process.cwd() + '/assessment_reports';
    fs.mkdirSync(basePath, { recursive: true });
    const omniscriptAssessmentFilePath = basePath + '/omniscript_assessment.html';
    const flexcardAssessmentFilePath = basePath + '/flexcard_assessment.html';
    const integrationProcedureAssessmentFilePath = basePath + '/integration_procedure_assessment.html';
    const dataMapperAssessmentFilePath = basePath + '/datamapper_assessment.html';
    const apexAssessmentFilePath = basePath + '/apex_assessment.html';
    const lwcAssessmentFilePath = basePath + '/lwc_assessment.html';

    this.createDocument(
      omniscriptAssessmentFilePath,
      this.generateOmniAssesment(result.omniAssessmentInfo, instanceUrl)
    );
    this.createDocument(
      flexcardAssessmentFilePath,
      this.generateCardAssesment(result.flexCardAssessmentInfos, instanceUrl)
    );
    this.createDocument(
      integrationProcedureAssessmentFilePath,
      IPAssessmentReporter.generateIPAssesment(result.omniAssessmentInfo.ipAssessmentInfos, instanceUrl)
    );
    this.createDocument(
      dataMapperAssessmentFilePath,
      DRAssessmentReporter.generateDRAssesment(result.dataRaptorAssessmentInfos, instanceUrl)
    );
    this.createDocument(apexAssessmentFilePath, this.generateApexAssesment(result.apexAssessmentInfos));
    this.createDocument(lwcAssessmentFilePath, this.generateLwcAssesment(result.lwcAssessmentInfos));
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
      {
        name: 'LWC assessment report',
        location: 'lwc_assessment.html',
      },
    ];
    await this.createMasterDocument(nameUrls, basePath);
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

  private static getDiffContent(diff: string, lineLimit = -1): string {
    const diffArray: Array<[string | null, string | null]> = JSON.parse(diff) as Array<[string | null, string | null]>;
    let result = '';
    let originalLine = 1;
    let modifiedLine = 1;
    let linecount = 0;
    for (const [original, modified] of diffArray) {
      if (original === modified) {
        result += `<div style="color: black;">• Line ${modifiedLine}: ${original}</div>`;
        modifiedLine++;
        originalLine++;
        linecount++;
      } else if (original !== null && modified === null) {
        result += `<div style="color: red;">- Line ${originalLine}: ${original}</div>`;
        originalLine++;
        linecount++;
      } else if (original === null && modified !== null) {
        result += `<div style="color: green;">+ Line ${modifiedLine}: ${modified}</div>`;
        modifiedLine++;
        linecount++;
      }
      if (linecount >= lineLimit && lineLimit !== -1) {
        break;
      }
    }
    return result;
  }

  private static getDiffHTML(diff: string): string {
    const diffArray: Array<[string | null, string | null]> = JSON.parse(diff) as Array<[string | null, string | null]>;
    let result = '<div style="height: 200px;">';
    if (diffArray.length <= 5) {
      result += this.getDiffContent(diff);
      result += '</div>';
    } else {
      result += this.getDiffContent(diff, 5);
      result += '</div>';
      result +=
        '<button onclick="document.getElementById(\'myModal\').style.display=\'block\'" style="position: absolute; top: 5px; right: 5px;"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>';
      result += `<div id="myModal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.4);">
        <div style="background-color: #fff; margin: 15% auto; padding: 20px; border: 1px solid #888; width: 300px; box-shadow: 0 5px 15px rgba(0,0,0,.5);">
          <span onclick="document.getElementById('myModal').style.display='none'" style="color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
          <p>${this.getDiffContent(diff, -1)}</p>
        </div>
      </div>`;
    }
    return result;
  }

  private static generateLwcAssesment(lwcAssessmentInfos: LWCAssessmentInfo[]): string {
    fs.writeFileSync('assess.json', JSON.stringify(lwcAssessmentInfos));
    // Example header rows with 'key' property added
    const headerRows = [
      [
        { key: 'name', label: 'Name', colspan: 1, rowspan: 1, width: '100px' },
        { key: 'filePath', label: 'File Path', colspan: 1, rowspan: 1, width: '150px' },
        { key: 'diff', label: 'File Diff', colspan: 1, rowspan: 1, width: '350px' },
        { key: 'status', label: 'Migration Status', colspan: 1, rowspan: 1, width: '150px' },
        { key: 'errors', label: 'Errors', colspan: 1, rowspan: 1, width: '150px' },
      ],
    ];

    // Example columns
    const columns = [
      {
        key: 'name',
        title: (row: RowType): string => `Name: ${row.name}`,
        filterValue: (row: RowType): string => row.name,
        cell: (row: RowType): string => `<span>${row.name}</span>`,
      },
      {
        key: 'filePath',
        title: (row: RowType): string => `File Path: ${row.fileName}`,
        filterValue: (row: RowType): string => row.fileName,
        cell: (row: RowType): string => `<span><a href="${row.filePath}">${row.fileName}</a></span>`,
      },
      {
        key: 'diff',
        title: (row: RowType): string => 'File Diff: diff',
        filterValue: (row: RowType): string => 'diff',
        cell: (row: RowType): string => `<span>${row.diff}</span>`,
      },
      {
        key: 'errors',
        title: (row: RowType): string => `Errors: ${row.errors}`,
        filterValue: (row: RowType): string => row.errors,
        cell: (row: RowType): string => `<span>${row.errors}</span>`,
      },
      {
        key: 'status',
        title: (row: RowType): string => `Status: ${row.status}`,
        filterValue: (row: RowType): string => row.status,
        cell: (row: RowType): string => `<span>${row.status}</span>`,
      },
    ];

    // const stdDiff = `diff
    //   <button onclick="document.getElementById('myModal').style.display='block'">Open Modal</button>

    //   <!-- Modal inside the TD -->
    //   <div id="myModal" style="
    //       display: none;
    //       position: fixed;
    //       z-index: 1000;
    //       left: 0;
    //       top: 0;
    //       width: 100%;
    //       height: 100%;
    //       overflow: auto;
    //       background-color: rgba(0,0,0,0.4);
    //     ">
    //     <div style="
    //         background-color: #fff;
    //         margin: 15% auto;
    //         padding: 20px;
    //         border: 1px solid #888;
    //         width: 300px;
    //         box-shadow: 0 5px 15px rgba(0,0,0,.5);
    //       ">
    //       <span onclick="document.getElementById('myModal').style.display='none'" style="
    //           color: #aaa;
    //           float: right;
    //           font-size: 28px;
    //           font-weight: bold;
    //           cursor: pointer;
    //         ">&times;</span>
    //       <p>This is some modal content inside a TD!</p>
    //     </div>
    //   </div>`;

    const rows = [];

    for (const lwcAssessmentInfo of lwcAssessmentInfos) {
      for (const changeInfo of lwcAssessmentInfo.changeInfos) {
        if (changeInfo.diff.length > 2) {
          rows.push({
            name: lwcAssessmentInfo.name,
            filePath: changeInfo.path,
            fileName: changeInfo.name,
            diff: this.getDiffHTML(changeInfo.diff),
            status: 'Pending',
            errors: lwcAssessmentInfo.errors.join(', '),
          } as RowType);
        }
      }
    }

    const reportHeader = [
      { key: 'Report Title', value: 'User Information' },
      { key: 'Date', value: '2023-10-01' },
    ];

    const filters = [
      {
        label: 'Status',
        key: 'status',
        filterOptions: Array.from(new Set(rows.map((row: RowType) => row.status))),
      },
      {
        label: 'Errors',
        key: 'errors',
        filterOptions: Array.from(new Set(rows.map((row: RowType) => row.errors))),
      },
    ];

    const htmlTable = generateHtmlTable(headerRows, columns, rows, reportHeader, filters);
    return htmlTable;
    let tableBody = '';
    tableBody += `
    <html>
            <head>
                <title>OmniStudio Migration Assessment</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/design-system/2.17.5/styles/salesforce-lightning-design-system.min.css" />
            </head>
            <body>
            <div style="margin: 20px;">
                <div class="slds-text-heading_large">OmniStudio Migration Assessment</div>`;
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

  private static generateOmniAssesment(omniAssessmentInfo: OmniAssessmentInfo, instanceUrl: string): string {
    let htmlBody = '';
    htmlBody += '<br />' + OSAssesmentReporter.generateOSAssesment(omniAssessmentInfo.osAssessmentInfos, instanceUrl);
    return htmlBody;
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
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
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
