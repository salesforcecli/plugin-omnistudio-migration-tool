import fs from 'fs';
import open from 'open';
import { MigratedObject } from '../interfaces';

export class ResultsBuilder {
  public static async generate(results: MigratedObject[], instanceUrl: string): Promise<void> {
    let htmlBody = '';

    for (const result of results) {
      htmlBody += '<br />' + this.generateResult(result, instanceUrl);
    }

    const doc = this.generateDocument(htmlBody);
    const fileUrl = process.cwd() + '/migrationresults.html';
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

  private static generateResult(migrationResult: MigratedObject, instanceUrl: string): string {
    let errorsBody = '';
    let tableBody = '';

    if (migrationResult.errors) {
      errorsBody = migrationResult.errors
        .map((e) => `<li class="slds-item slds-text-color_destructive">${e}</li>`)
        .join('');
      errorsBody = `
              <div style="margin-block: 15px">
                <ul class="slds-list_dotted">${errorsBody}</ul>
              </div>`;
    }

    if (migrationResult.data) {
      if (migrationResult.data.length === 0) {
        tableBody += '<tr><td colspan="5" style="padding:10px; text-align:center; ">No records found</td>';
      } else {
        for (const record of migrationResult.data) {
          const errors = record.errors ? (Array.isArray(record.errors) ? record.errors : [record.errors]) : [];

          const errorMessage = errors.join('<br>');
          const newId = record.migratedId
            ? `<a href="${instanceUrl}/${record.migratedId}">${record.migratedId}</a>`
            : '';

          // Create the row
          const row = `<tr class="slds-hint_parent">
                            <td><div class="slds-truncate" title="${record.id}"><a href="${instanceUrl}/${record.id}">${record.id}</a></div></td>
                            <td><div class="slds-truncate" title="${record.name}">${record.name}</div></td>
                            <td><div class="slds-truncate" title="${record.id} status">${record.status}</div></td>
                            <td><div class="slds-truncate" title="">${newId}</div></td>
                            <td><div class="slds-truncate" title="${record.id} errors">${errorMessage}</div></td>
                        </tr>`;

          // Append to the table
          tableBody += row;
        }
      }

      tableBody = `
          <div style="margin-block:15px">        
            <table class="slds-table slds-table_cell-buffer slds-table_bordered slds-table_striped slds-table_col-bordered" aria-label="Results for ${migrationResult.name}">
            <thead>
                <tr class="slds-line-height_reset">
                    <th class="" scope="col">
                        <div class="slds-truncate" title="Record ID">Record ID</div>
                    </th>
                    <th class="" scope="col">
                        <div class="slds-truncate" title="Name">Name</div>
                    </th>
                    <th class="" scope="col">
                        <div class="slds-truncate" title="Status">Status</div>
                    </th>
                    <th class="" scope="col">
                        <div class="slds-truncate" title="New Record ID">New Record ID</div>
                    </th>
                    <th class="" scope="col">
                        <div class="slds-truncate" title="Errors">Errors</div>
                    </th>
                </tr>
            </thead>
            <tbody>
            ${tableBody}
            </tbody>
            </table>
          </div>`;
    }

    const table = `
      <div class="slds-box" style="background-color: white">
        <div class="slds-text-heading_medium">${migrationResult.name}</div>
        ${errorsBody}
        ${tableBody}
      </div>`;

    return table;
  }
}
