import { ApexAssessmentInfo } from '../interfaces';
import { FileDiffUtil } from '../lwcparser/fileutils/FileDiffUtil';
import { generateHtmlTable } from '../reportGenerator/reportGenerator';
import {
  Filter,
  HeaderColumn,
  ReportFrameworkParameters,
  ReportHeaderFormat,
  TableColumn,
} from '../reportGenerator/reportInterfaces';

export class ApexAssessmentReporter {
  public static generateApexAssesment(
    apexAssessmentInfos: ApexAssessmentInfo[],
    instanceUrl: string,
    org: ReportHeaderFormat[]
  ): string {
    // Header Columns
    const headerColumn: HeaderColumn[] = [
      {
        label: 'Name',
        key: 'name',
        colspan: 1,
        rowspan: 1,
        subColumn: [],
      },
      {
        label: 'File Reference',
        key: 'fileReference',
        colspan: 1,
        rowspan: 1,
        subColumn: [],
      },
      {
        label: 'Diff',
        key: 'diff',
        colspan: 1,
        rowspan: 1,
        subColumn: [],
      },
      {
        label: 'Comments',
        key: 'comments',
        colspan: 1,
        rowspan: 1,
        subColumn: [],
      },
      {
        label: 'Errors',
        key: 'errors',
        colspan: 1,
        rowspan: 1,
        subColumn: [],
      },
    ];

    // Define columns
    const columns: Array<TableColumn<ApexAssessmentInfo>> = [
      {
        key: 'name',
        cell: (row: ApexAssessmentInfo): string => row.name,
        filterValue: (row: ApexAssessmentInfo): string => row.name,
        title: (row: ApexAssessmentInfo): string => row.name,
      },
      {
        key: 'fileReference',
        cell: (row: ApexAssessmentInfo): string => `<span><a href="${row.path}">${row.name}</a></span>`,
        filterValue: (row: ApexAssessmentInfo): string => row.name,
        title: (row: ApexAssessmentInfo): string => row.name,
      },
      {
        key: 'diff',
        cell: (row: ApexAssessmentInfo): string => FileDiffUtil.getDiffHTML(row.diff, row.name),
        filterValue: (row: ApexAssessmentInfo): string => `Diff_${row.name}`,
        title: (row: ApexAssessmentInfo): string => `Diff_${row.name}`,
      },
      {
        key: 'comments',
        cell: (row: ApexAssessmentInfo): string => this.generateMessages(row.infos),
        filterValue: (row: ApexAssessmentInfo): string => row.name,
        title: (row: ApexAssessmentInfo): string => row.name,
      },
      {
        key: 'errors',
        cell: (row: ApexAssessmentInfo): string => this.generateMessages(row.warnings),
        filterValue: (row: ApexAssessmentInfo): string => row.name,
        title: (row: ApexAssessmentInfo): string => row.name,
      },
    ];

    const filters: Filter[] = [
      {
        label: 'Comments',
        key: 'comments',
        filterOptions: Array.from(new Set(apexAssessmentInfos.map((row: ApexAssessmentInfo) => row.infos.join(', ')))),
      },
      {
        label: 'Errors',
        key: 'errors',
        filterOptions: Array.from(
          new Set(apexAssessmentInfos.map((row: ApexAssessmentInfo) => row.warnings.join(', ')))
        ),
      },
    ];

    const reportFrameworkParameters: ReportFrameworkParameters<ApexAssessmentInfo> = {
      headerColumns: headerColumn,
      columns,
      rows: apexAssessmentInfos,
      orgDetails: org,
      filters,
      ctaSummary: [],
      reportHeaderLabel: 'Apex Assessment',
      showMigrationBanner: true,
    };
    // Render table
    const tableHtml = generateHtmlTable(reportFrameworkParameters);
    return `${tableHtml}`;
  }

  private static generateMessages(messages: string[]): string {
    let messageBody = '';
    for (const message of messages) {
      messageBody += `<li class="slds-item slds-text-color_destructive">${message}</li>`;
    }
    return messageBody;
  }
}
