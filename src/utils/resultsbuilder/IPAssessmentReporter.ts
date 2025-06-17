import { IPAssessmentInfo } from '../interfaces';
import { generateHtmlTable } from '../reportGenerator/reportGenerator';
import {
  HeaderColumn,
  ReportFrameworkParameters,
  ReportHeaderFormat,
  TableColumn,
} from '../reportGenerator/reportInterfaces';
import { reportingHelper } from './reportingHelper';

export class IPAssessmentReporter {
  public static generateIPAssesment(
    ipAssessmentInfos: IPAssessmentInfo[],
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
          },
          {
            label: 'Record ID',
          },
        ],
      },
      {
        label: 'In Core',
        colspan: 1,
        subColumn: [
          {
            label: 'Name',
          },
        ],
      },
      {
        label: 'Summary',
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
      {
        label: 'Remote Action Dependencies',
        rowspan: 2,
        subColumn: [],
      },
    ];

    // Define columns
    const columns: Array<TableColumn<IPAssessmentInfo>> = [
      {
        key: 'oldName',
        cell: (row: IPAssessmentInfo): string => row.oldName,
        filterValue: (row: IPAssessmentInfo): string => row.oldName,
        title: (row: IPAssessmentInfo): string => row.oldName,
      },
      {
        key: 'id',
        cell: (row: IPAssessmentInfo): string => (row.id ? `<a href="${instanceUrl}/${row.id}">${row.id}</a>` : ''),
        filterValue: (row: IPAssessmentInfo): string => row.id,
        title: (row: IPAssessmentInfo): string => row.id,
      },
      {
        key: 'name',
        cell: (row: IPAssessmentInfo): string => row.name || '',
        filterValue: (row: IPAssessmentInfo): string => row.name,
        title: (row: IPAssessmentInfo): string => row.name,
      },
      {
        key: 'Summary',
        cell: (row: IPAssessmentInfo): string => reportingHelper.convertToBuletedList(row.warnings || []),
        filterValue: (row: IPAssessmentInfo): string => (row.warnings ? row.warnings.join(', ') : ''),
        title: (row: IPAssessmentInfo): string => (row.warnings ? row.warnings.join(', ') : ''),
      },
      {
        key: 'dependenciesIP',
        cell: (row: IPAssessmentInfo): string => reportingHelper.decorate(row.dependenciesIP) || '',
        filterValue: (row: IPAssessmentInfo): string => (row.dependenciesIP ? row.dependenciesIP.join(', ') : ''),
      },
      {
        key: 'dependenciesDR',
        cell: (row: IPAssessmentInfo): string => reportingHelper.decorate(row.dependenciesDR) || '',
        filterValue: (row: IPAssessmentInfo): string => (row.dependenciesDR ? row.dependenciesDR.join(', ') : ''),
      },
      {
        key: 'dependenciesRemoteAction',
        cell: (row: IPAssessmentInfo): string => reportingHelper.decorate(row.dependenciesRemoteAction) || '',
        filterValue: (row: IPAssessmentInfo): string =>
          row.dependenciesRemoteAction ? row.dependenciesRemoteAction.join(', ') : '',
      },
    ];

    const reportFrameworkParameters: ReportFrameworkParameters<IPAssessmentInfo> = {
      headerColumns: headerColumn,
      columns,
      rows: ipAssessmentInfos,
      orgDetails: org,
      filters: [],
      ctaSummary: [],
      reportHeaderLabel: 'Integration Procedure Assessment',
      showMigrationBanner: true,
    };
    // Render table
    const tableHtml = generateHtmlTable(reportFrameworkParameters);
    return `${tableHtml}`;
  }
}
