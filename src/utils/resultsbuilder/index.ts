import fs from 'fs';
import open from 'open';
import {
  ApexAssessmentInfo,
  LWCAssessmentInfo,
  MigratedObject,
  MigratedRecordInfo,
  RelatedObjectAssesmentInfo,
} from '../interfaces';
import { generateHtmlTable } from '../reportGenerator/reportGenerator';
import { Filter, HeaderColumn, ReportHeaderFormat, TableColumn } from '../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../orgUtils';

export class ResultsBuilder {
  public static generateReport(
    results: MigratedObject[],
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): void {
    let htmlBody = '<div class="slds-text-heading_large">OmniStudio Migration Results</div>';
    const reportHeader = this.formattedOrgDetails(orgDetails);
    const pageHeader = `
    <div class="header-container">
      ${reportHeader
        .map(
          (header) => `
        <div class="org-details-section">
          <div class="label-key">${header.key}</div>
          <div class="label-value">${header.value}</div>
        </div>
      `
        )
        .join('')}
    </div>
  `;

    htmlBody += pageHeader;
    // this.ux.log('Generating report fro results...');
    for (const result of results) {
      htmlBody += '<br />' + this.generateReportForResult(result, instanceUrl);
    }
    // this.ux.log('Generating report for related objects...');
    htmlBody += this.generateReportForRelatedObject(relatedObjectMigrationResult, instanceUrl);

    const doc = this.generateDocumentqwe(htmlBody);
    const basePath = process.cwd() + '/migration_report';
    fs.mkdirSync(basePath, { recursive: true });
    fs.writeFileSync(basePath + '/migration_report.html', doc);
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

  private static generateDocumentqwe(resultsAsHtml: string): string {
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

  private static generateReportForResult(result: MigratedObject, instanceUrl: string): string {
    // this.ux.log('Generating report for result: ' + result.name);
    let tablebody = '';
    const headerColumns: HeaderColumn[] = [
      {
        label: 'In Package',
        colspan: 2,
        subColumn: [
          {
            label: 'Record ID',
            key: 'id',
          },
          {
            label: 'Record Name',
            key: 'name',
          },
        ],
      },
      {
        label: 'In Core',
        colspan: 2,
        subColumn: [
          {
            label: 'Record ID',
            key: 'migratedId',
          },
          {
            label: 'Record Name',
            key: 'migratedName',
          },
        ],
      },
      {
        label: 'Migration Status',
        key: 'status',
        rowspan: 2,
      },
      {
        label: 'Errors',
        key: 'errors',
        rowspan: 2,
      },
      {
        label: 'Warnings',
        key: 'warnings',
        rowspan: 2,
      },
    ];

    const columns: Array<TableColumn<MigratedRecordInfo>> = [
      {
        key: 'id',
        cell: (record: MigratedRecordInfo): string =>
          record.id ? `<a href="${instanceUrl}/${record.id}">${record.id}</a>` : '',
        filterValue: (record: MigratedRecordInfo): string => record.id,
        title: (record: MigratedRecordInfo): string => record.id,
      },
      {
        key: 'name',
        cell: (record: MigratedRecordInfo): string => record.name,
        filterValue: (record: MigratedRecordInfo): string => record.name,
        title: (record: MigratedRecordInfo): string => record.name,
      },
      {
        key: 'migratedId',
        cell: (record: MigratedRecordInfo): string =>
          record.migratedId ? `<a href="${instanceUrl}/${record.migratedId}">${record.migratedId}</a>` : '',
        filterValue: (record: MigratedRecordInfo): string => record.migratedId || '',
        title: (record: MigratedRecordInfo): string => record.migratedId || '',
      },
      {
        key: 'migratedName',
        cell: (record: MigratedRecordInfo): string => record.migratedName,
        filterValue: (record: MigratedRecordInfo): string => record.migratedName || '',
        title: (record: MigratedRecordInfo): string => record.migratedName || '',
      },
      {
        key: 'status',
        cell: (record: MigratedRecordInfo): string => record.status,
        filterValue: (record: MigratedRecordInfo): string => record.status,
        title: (record: MigratedRecordInfo): string => record.status,
      },
      {
        key: 'errors',
        cell: (record: MigratedRecordInfo): string => record.errors.join(', '),
        filterValue: (record: MigratedRecordInfo): string =>
          record.errors && record.errors.length > 0 ? 'Has Errors' : 'Has No Errors',
        title: (record: MigratedRecordInfo): string => record.errors.join(', '),
      },
      {
        key: 'warnings',
        cell: (record: MigratedRecordInfo): string => record.warnings.join(', '),
        filterValue: (record: MigratedRecordInfo): string =>
          record.warnings && record.warnings.length > 0 ? 'Has Warnings' : 'Has No Warnings',
        title: (record: MigratedRecordInfo): string => record.warnings.join(', '),
      },
    ];

    const filters: Filter[] = [
      {
        label: 'Migration Status',
        key: 'status',
        filterOptions: ['Complete', 'Error', 'Warning'],
      },
    ];

    // this.ux.log('Generating table body for result: ' + result.name);
    tablebody = generateHtmlTable(headerColumns, columns, result.data, [], filters, undefined, '', undefined, false);
    // this.ux.log('Table body generated for result: ' + result.name);
    return (
      this.getCard(`<div class="slds-text-heading_medium">${result.name}</div>`, ['collapsible']) +
      this.getCard(tablebody, ['collapsible-content'])
    );
  }

  private static generateReportForRelatedObject(result: RelatedObjectAssesmentInfo, instanceUrl: string): string {
    return `${this.generateReportForApexResult(result.apexAssessmentInfos, instanceUrl)}
      ${this.generateReportForLwcResult(result.lwcAssessmentInfos, instanceUrl)}`;
  }

  private static generateReportForApexResult(result: ApexAssessmentInfo[], instanceUrl: string): string {
    const headerColumns: HeaderColumn[] = [
      {
        label: 'Class Name',
        key: 'name',
      },
      {
        label: 'File Reference',
        key: 'path',
      },
      {
        label: 'Diff',
        key: 'diff',
      },
      {
        label: 'Comments',
        key: 'infos',
      },
      {
        label: 'Errors',
        key: 'warnings',
      },
    ];

    const columns: Array<TableColumn<ApexAssessmentInfo>> = [
      {
        key: 'name',
        cell: (record: ApexAssessmentInfo): string => record.name,
        filterValue: (record: ApexAssessmentInfo): string => record.name,
        title: (record: ApexAssessmentInfo): string => record.name,
      },
      {
        key: 'path',
        cell: (record: ApexAssessmentInfo): string =>
          record.path ? `<a href="${instanceUrl}/${record.path}">${record.name}</a>` : '',
        filterValue: (record: ApexAssessmentInfo): string => record.path,
        title: (record: ApexAssessmentInfo): string => record.path,
      },
      {
        key: 'diff',
        cell: (record: ApexAssessmentInfo): string => record.diff,
        filterValue: (record: ApexAssessmentInfo): string => record.diff,
        title: (record: ApexAssessmentInfo): string => record.diff,
      },
      {
        key: 'infos',
        cell: (record: ApexAssessmentInfo): string => record.infos.join(', '),
        filterValue: (record: ApexAssessmentInfo): string => record.infos.join(', '),
        title: (record: ApexAssessmentInfo): string => record.infos.join(', '),
      },
      {
        key: 'warnings',
        cell: (record: ApexAssessmentInfo): string => record.warnings.join(', '),
        filterValue: (record: ApexAssessmentInfo): string =>
          record.warnings.length > 0 ? 'Has Errors' : 'Has No Errors',
        title: (record: ApexAssessmentInfo): string => record.warnings.join(', '),
      },
    ];

    const filters: Filter[] = [
      {
        label: 'Errors',
        key: 'warnings',
        filterOptions: ['Has Errors', 'Has No Errors'],
      },
    ];

    return (
      this.getCard('<div class="slds-text-heading_medium">Apex Updates</div>', ['collapsible']) +
      this.getCard(generateHtmlTable(headerColumns, columns, result, [], filters, undefined, '', undefined, false), [
        'collapsible-content',
      ])
    );
  }

  private static generateReportForLwcResult(result: LWCAssessmentInfo[], instanceUrl: string): string {
    const headerColumns: HeaderColumn[] = [
      {
        label: 'Component Name',
        key: 'name',
      },
      {
        label: 'File Reference',
        key: 'path',
      },
      {
        label: 'Diff',
        key: 'diff',
      },
      {
        label: 'Errors',
        key: 'errors',
      },
    ];

    const columns: Array<TableColumn<LWCAssessmentInfo>> = [
      {
        key: 'name',
        cell: (record: LWCAssessmentInfo, _index: number): string => record.name,
        filterValue: (record: LWCAssessmentInfo, _index: number): string => record.name,
        title: (record: LWCAssessmentInfo, _index: number): string => record.name,
        skip: (record: LWCAssessmentInfo, index: number): boolean =>
          !(record.changeInfos && record.changeInfos.length > 0 && index === 0),
        rowspan: (record: LWCAssessmentInfo, index: number): number =>
          record.changeInfos && record.changeInfos.length > 0 ? record.changeInfos.length : 1,
      },
      {
        key: 'path',
        filterValue: (record: LWCAssessmentInfo, index: number): string => record.changeInfos[index].path,
        title: (record: LWCAssessmentInfo, index: number): string => record.changeInfos[index].path,
        cell: (record: LWCAssessmentInfo, index: number): string =>
          record.changeInfos[index].path
            ? `<a href="${instanceUrl}/${record.changeInfos[index].path}">${record.changeInfos[index].name}</a>`
            : '',
      },
      {
        key: 'diff',
        cell: (record: LWCAssessmentInfo, index: number): string => record.changeInfos[index].diff,
        filterValue: (record: LWCAssessmentInfo, index: number): string => record.changeInfos[index].diff,
      },
      {
        key: 'errors',
        cell: (record: LWCAssessmentInfo, _index): string => (record.errors ? record.errors.join(', ') : ''),
        filterValue: (record: LWCAssessmentInfo, _index): string =>
          record.errors && record.errors.length > 0 ? 'Has Errors' : 'Has No Errors',
        rowspan: (record: LWCAssessmentInfo, _index): number =>
          record.changeInfos && record.changeInfos.length > 0 ? record.changeInfos.length : 1,
        skip: (record: LWCAssessmentInfo, index: number): boolean =>
          !(record.changeInfos && record.changeInfos.length > 0 && index === 0),
      },
    ];

    const filters: Filter[] = [
      {
        label: 'Errors',
        key: 'errors',
        filterOptions: ['Has Errors', 'Has No Errors'],
      },
    ];

    return (
      this.getCard('<div class="slds-text-heading_medium">LWC Updates</div>', ['collapsible']) +
      this.getCard(
        generateHtmlTable(headerColumns, columns, result, [], filters, undefined, '', 'changeInfos', false),
        ['collapsible-content']
      )
    );
  }

  private static getCard(body: string, classNames: string[] = []): string {
    return `<div class="header-container slds-box ${classNames.join(' ')}">${body}</div>`;
  }
}
