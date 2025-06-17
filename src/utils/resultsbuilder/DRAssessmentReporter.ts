import { DataRaptorAssessmentInfo } from '../interfaces';
import {
  Filter,
  HeaderColumn,
  ReportFrameworkParameters,
  ReportHeaderFormat,
  TableColumn,
} from '../reportGenerator/reportInterfaces';
import { generateHtmlTable } from '../reportGenerator/reportGenerator';
import { reportingHelper } from './reportingHelper';

export class DRAssessmentReporter {
  public static generateDRAssesment(
    dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[],
    instanceUrl: string,
    org: ReportHeaderFormat[]
  ): string {
    // Header Column
    const headerColumn: HeaderColumn[] = [
      {
        label: 'In Package',
        colspan: 2,
        styles: 'color: purple;',
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
        label: 'Type',
        key: 'type',
        rowspan: 2,
        subColumn: [],
      },
      {
        label: 'Summary',
        key: 'summary',
        rowspan: 2,
        subColumn: [],
      },
      {
        label: 'Custom Function Changes',
        key: 'customFunctionChanges',
        rowspan: 2,
        subColumn: [],
      },
      {
        label: 'Apex Dependencies',
        key: 'apexDependencies',
        rowspan: 2,
        subColumn: [],
      },
    ];

    // Define columns
    const columns: Array<TableColumn<DataRaptorAssessmentInfo>> = [
      {
        key: 'oldName',
        cell: (row: DataRaptorAssessmentInfo): string => row.oldName,
        filterValue: (row: DataRaptorAssessmentInfo): string => row.oldName,
        title: (row: DataRaptorAssessmentInfo): string => row.oldName,
      },
      {
        key: 'id',
        cell: (row: DataRaptorAssessmentInfo): string =>
          row.id ? `<a href="${instanceUrl}/${row.id}">${row.id}</a>` : '',
        filterValue: (row: DataRaptorAssessmentInfo): string => row.id,
        title: (row: DataRaptorAssessmentInfo): string => row.id,
      },
      {
        key: 'name',
        cell: (row: DataRaptorAssessmentInfo): string => row.name || '',
        filterValue: (row: DataRaptorAssessmentInfo): string => row.name,
        title: (row: DataRaptorAssessmentInfo): string => row.name,
      },
      {
        key: 'type',
        cell: (row: DataRaptorAssessmentInfo): string => row.type,
        filterValue: (row: DataRaptorAssessmentInfo): string => row.type,
        title: (row: DataRaptorAssessmentInfo): string => row.type,
      },
      {
        key: 'summary',
        cell: (row: DataRaptorAssessmentInfo): string => reportingHelper.convertToBuletedList(row.warnings || []),
        filterValue: (row: DataRaptorAssessmentInfo): string => (row.warnings ? row.warnings.join(', ') : ''),
        title: (row: DataRaptorAssessmentInfo): string => (row.warnings ? row.warnings.join(', ') : ''),
      },
      {
        key: 'customFunctionChanges',
        cell: (row: DataRaptorAssessmentInfo): string =>
          reportingHelper.decorateChanges(row.formulaChanges, 'Formula') || '',
        filterValue: (row: DataRaptorAssessmentInfo): typeof row.formulaChanges => row.formulaChanges,
      },
      {
        key: 'apexDependencies',
        cell: (row: DataRaptorAssessmentInfo): string =>
          reportingHelper.convertToBuletedList(row.apexDependencies || []),
        filterValue: (row: DataRaptorAssessmentInfo): string[] => row.apexDependencies,
      },
    ];

    const filters: Filter[] = [
      {
        label: 'Type',
        filterOptions: Array.from(new Set(dataRaptorAssessmentInfos.map((row: DataRaptorAssessmentInfo) => row.type))),
        key: 'type',
      },
    ];

    const reportFrameworkParameters: ReportFrameworkParameters<DRAssessmentReporter> = {
      headerColumns: headerColumn,
      columns,
      rows: dataRaptorAssessmentInfos,
      orgDetails: org,
      filters,
      ctaSummary: [],
      reportHeaderLabel: 'Data Mapper Assessment',
      showMigrationBanner: true,
    };
    // Render table
    const tableHtml = generateHtmlTable(reportFrameworkParameters);
    return `${tableHtml}`;
  }
}
