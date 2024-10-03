import fs from 'fs';
import open from 'open';
import {
  ApexAssessmentInfo,
  AssessmentInfo,
  LWCAssessmentInfo,
  OSAssessmentInfo,
  IPAssessmentInfo,
  OmniAssessmentInfo,
  FlexCardAssessmentInfo,
  DataRaptorAssessmentInfo,
} from '../interfaces';

export class AssessmentReporter {
  public static async generate(result: AssessmentInfo, instanceUrl: string): Promise<void> {
    let htmlBody = '';

    // htmlBody += '<br />' + this.generateLwcAssesment(result.lwcAssessmentInfos);
    htmlBody += '<br />' + this.generateApexAssesment(result.apexAssessmentInfos);
    htmlBody += '<br />' + this.generateOmniAssesment(result.omniAssessmentInfo);
    htmlBody += '<br />' + this.generateCardAssesment(result.flexCardAssessmentInfos);
    htmlBody += '<br />' + this.generateDRAssesment(result.DdataRaptorAssessmentInfos);


    const doc = this.generateDocument(htmlBody);
    const fileUrl = process.cwd() + '/assessmentresults.html';
    fs.writeFileSync(fileUrl, doc);

    await open('file://' + fileUrl);
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

  private static generateOmniAssesment(omniAssessmentInfo: OmniAssessmentInfo): string {
    let htmlBody = '';

    // htmlBody += '<br />' + this.generateLwcAssesment(result.lwcAssessmentInfos);
    htmlBody += '<br />' + this.generateOSAssesment(omniAssessmentInfo.osAssessmentInfos);
    htmlBody += '<br />' + this.generateIPAssesment(omniAssessmentInfo.ipAssessmentInfos);
    return htmlBody;
  }

  private static generateOSAssesment(osAssessmentInfos: OSAssessmentInfo[]): string {
    let tableBody = '';
    tableBody += '<div class="slds-text-heading_large">Omniscript Components Assessment</div>';

    for (const osAssessmentInfo of osAssessmentInfos) {
      const row = `
              <tr class="slds-hint_parent">
                  <td style="word-wrap: break-word; white-space: normal; max-width: 200px;">
                      <div class="slds-truncate" title="${osAssessmentInfo.name}">${osAssessmentInfo.name}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 100px;">
                      <div class="slds-truncate" title="${osAssessmentInfo.id}">${osAssessmentInfo.id}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 60%; overflow: hidden;">
                      <div title="${osAssessmentInfo.dependenciesOS}">${osAssessmentInfo.dependenciesOS}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 60%; overflow: hidden;">
                      <div title="${osAssessmentInfo.dependenciesIP}">${osAssessmentInfo.dependenciesIP}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 60%; overflow: hidden;">
                      <div title="${osAssessmentInfo.dependenciesDR}">${osAssessmentInfo.dependenciesDR}</div>
                  </td>
              </tr>`;
      tableBody += row;
    }

    return this.getOSAssessmentReport(tableBody);
  }

  private static generateIPAssesment(ipAssessmentInfos: IPAssessmentInfo[]): string {
    let tableBody = '';
    tableBody += '<div class="slds-text-heading_large">Integration Procedure Components Assessment</div>';

    for (const ipAssessmentInfo of ipAssessmentInfos) {
      const row = `
              <tr class="slds-hint_parent">
                  <td style="word-wrap: break-word; white-space: normal; max-width: 200px;">
                      <div class="slds-truncate" title="${ipAssessmentInfo.name}">${ipAssessmentInfo.name}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 100px;">
                      <div class="slds-truncate" title="${ipAssessmentInfo.id}">${ipAssessmentInfo.id}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 60%; overflow: hidden;">
                      <div title="${ipAssessmentInfo.dependenciesOS}">${ipAssessmentInfo.dependenciesOS}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 60%; overflow: hidden;">
                      <div title="${ipAssessmentInfo.dependenciesIP}">${ipAssessmentInfo.dependenciesIP}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 60%; overflow: hidden;">
                      <div title="${ipAssessmentInfo.dependenciesDR}">${ipAssessmentInfo.dependenciesDR}</div>
                  </td>
              </tr>`;
      tableBody += row;
    }

    return this.getIPAssessmentReport(tableBody);
  }

  private static generateCardAssesment(flexCardAssessmentInfos: FlexCardAssessmentInfo[]): string {
    let tableBody = '';
    tableBody += '<div class="slds-text-heading_large">Flexcard Components Assessment</div>';
    for (const card of flexCardAssessmentInfos) {
      const row = `
              <tr class="slds-hint_parent">
                  <td style="word-wrap: break-word; white-space: normal; max-width: 200px;">
                      <div class="slds-truncate" title="${card.name}">${card.name}</div>
                  </td>
                  <td style="word-wrap: break-word; white-space: normal; max-width: 100px;">
                      <div class="slds-truncate" title="${card.id}">${card.id}</div>
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

  private static generateDRAssesment(dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[]): string {
    let tableBody = '';
    tableBody += '<div class="slds-text-heading_large">Data Raptor Components Assessment</div>';
    for (const dr of dataRaptorAssessmentInfos) {
      const row = `
              <tr class="slds-hint_parent">
                  <td style="word-wrap: break-word; white-space: normal; max-width: 200px;">
                      <div class="slds-truncate" title="${dr.name}">${dr.name}</div>
                  </td>
              </tr>`;
      tableBody += row;
    }

    return this.getDRAssessmentReport(tableBody);
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

  private static getOSAssessmentReport(tableContent: string): string {
    const tableBody = `
      <div style="margin-block:15px">        
        <table style="width: 100%; table-layout: auto;" class="slds-table slds-table_cell-buffer slds-table_bordered slds-table_striped slds-table_col-bordered" aria-label="Results for OS updates">
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
                    <div title="Dependencies">Data Raptor pendencies</div>
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

  private static getIPAssessmentReport(tableContent: string): string {
    const tableBody = `
        <div style="margin-block:15px">        
            <table style="width: 100%; table-layout: auto;" class="slds-table slds-table_cell-buffer slds-table_bordered slds-table_striped slds-table_col-bordered" aria-label="Results for Integration Procedure updates">
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
                        <div title="Dependencies">Data Raptor pendencies</div>
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
                        <div title="Dependencies">Data Raptor pendencies</div>
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

  private static getDRAssessmentReport(tableContent: string): string {
    const tableBody = `
        <div style="margin-block:15px">        
            <table style="width: 100%; table-layout: auto;" class="slds-table slds-table_cell-buffer slds-table_bordered slds-table_striped slds-table_col-bordered" aria-label="Results for Data Raptor updates">
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
                        <div title="Dependencies">Data Raptor pendencies</div>
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
