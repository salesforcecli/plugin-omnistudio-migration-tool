import { FlexCardAssessmentInfo } from '../interfaces';
import { generateHtmlTable } from '../reportGenerator/reportGenerator';
import {
  HeaderColumn,
  ReportFrameworkParameters,
  ReportHeaderFormat,
  TableColumn,
} from '../reportGenerator/reportInterfaces';

export class FlexcardAssessmentReporter {
  public static generateFlexcardAssesment(
    flexcardAssessmentInfos: FlexCardAssessmentInfo[],
    instanceUrl: string,
    org: ReportHeaderFormat[]
  ): string {
    // Define multi-row headers
    const headerColumn: HeaderColumn[] = [
      {
        label: 'In Package',
        colspan: 2,
        subColumn: [
          {
            label: 'Name',
            key: 'oldName',
          },
          {
            label: 'Record ID',
            key: 'id',
          },
        ],
      },
      {
        label: 'In Core',
        colspan: 1,
        subColumn: [
          {
            label: 'Name',
            key: 'name',
          },
        ],
      },
      {
        label: 'Omniscript Dependencies',
        rowspan: 2,
        subColumn: [],
      },
      {
        label: 'Integration Procedures Dependencies',
        rowspan: 2,
        subColumn: [],
      },
      {
        label: 'Data Mapper dependencies',
        rowspan: 2,
        subColumn: [],
      },
    ];

    // Define columns
    const columns: Array<TableColumn<FlexCardAssessmentInfo>> = [
      {
        key: 'oldName',
        cell: (row: FlexCardAssessmentInfo): string => row.name || '',
        filterValue: (row: FlexCardAssessmentInfo): string => row.name,
        title: (row: FlexCardAssessmentInfo): string => row.name,
      },
      {
        key: 'id',
        cell: (row: FlexCardAssessmentInfo): string =>
          row.id ? `<a href="${instanceUrl}/${row.id}">${row.id}</a>` : '',
        filterValue: (row: FlexCardAssessmentInfo): string => row.id,
        title: (row: FlexCardAssessmentInfo): string => row.id,
      },
      {
        key: 'name',
        cell: (row: FlexCardAssessmentInfo): string => row.name || '',
        filterValue: (row: FlexCardAssessmentInfo): string => row.name,
        title: (row: FlexCardAssessmentInfo): string => row.name,
      },
      {
        key: 'dependenciesOS',
        cell: (row: FlexCardAssessmentInfo): string => (row.dependenciesOS ? row.dependenciesOS.join(', ') : ''),
        filterValue: (row: FlexCardAssessmentInfo): string => (row.dependenciesOS ? row.dependenciesOS.join(', ') : ''),
      },
      {
        key: 'dependenciesIP',
        cell: (row: FlexCardAssessmentInfo): string => (row.dependenciesIP ? row.dependenciesIP.join(', ') : ''),
        filterValue: (row: FlexCardAssessmentInfo): string => (row.dependenciesIP ? row.dependenciesIP.join(', ') : ''),
      },
      {
        key: 'dependenciesDR',
        cell: (row: FlexCardAssessmentInfo): string => (row.dependenciesDR ? row.dependenciesDR.join(', ') : ''),
        filterValue: (row: FlexCardAssessmentInfo): string => (row.dependenciesDR ? row.dependenciesDR.join(', ') : ''),
      },
    ];

    const reportFrameworkParameters: ReportFrameworkParameters<FlexCardAssessmentInfo> = {
      headerColumns: headerColumn,
      columns,
      rows: flexcardAssessmentInfos,
      orgDetails: org,
      filters: [],
      ctaSummary: [],
      reportHeaderLabel: 'Flexcard Components Assessment',
      showMigrationBanner: true,
    };

    // Render table
    const tableHtml = generateHtmlTable(reportFrameworkParameters);
    return `${tableHtml}`;
  }
}
