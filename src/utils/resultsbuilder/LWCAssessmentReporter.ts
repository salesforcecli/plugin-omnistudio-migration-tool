import { LWCAssessmentInfo } from '../interfaces';
import { FileDiffUtil } from '../lwcparser/fileutils/FileDiffUtil';
import { generateHtmlTable } from '../reportGenerator/reportGenerator';
import { Filter, HeaderColumn, ReportHeaderFormat, TableColumn } from '../reportGenerator/reportInterfaces';

type RowType = {
  name: string;
  filePath: string;
  fileName: string;
  diff: string;
  migrationStatus: string;
  errors: string;
};

export class LWCAssessmentReporter {
  public static generateLwcAssesment(
    lwcAssessmentInfos: LWCAssessmentInfo[],
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
        label: 'File Path',
        key: 'filePath',
        colspan: 1,
        rowspan: 1,
        subColumn: [],
      },
      {
        label: 'File Diff',
        key: 'diff',
        colspan: 1,
        rowspan: 1,
        subColumn: [],
      },
      {
        label: 'Migration Status',
        key: 'migrationStatus',
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
    const columns: Array<TableColumn<RowType>> = [
      {
        key: 'name',
        cell: (row: RowType): string => row.name,
        filterValue: (row: RowType): string => row.name,
        title: (row: RowType): string => row.name,
      },
      {
        key: 'filePath',
        cell: (row: RowType): string => `<span><a href="${row.filePath}">${row.fileName}</a></span>`,
        filterValue: (row: RowType): string => row.fileName,
        title: (row: RowType): string => row.fileName,
      },
      {
        key: 'diff',
        cell: (row: RowType): string => FileDiffUtil.getDiffHTML(row.diff, row.name),
        filterValue: (row: RowType): string => `Diff_${row.fileName}`,
        title: (row: RowType): string => `Diff_${row.fileName}`,
      },
      {
        key: 'migrationStatus',
        cell: (row: RowType): string => row.migrationStatus,
        filterValue: (row: RowType): string => row.migrationStatus,
        title: (row: RowType): string => row.migrationStatus,
      },
      {
        key: 'errors',
        cell: (row: RowType): string => row.errors,
        filterValue: (row: RowType): string => row.errors,
        title: (row: RowType): string => row.errors,
      },
    ];

    const rows = this.generateRows(lwcAssessmentInfos);

    const filters: Filter[] = [
      {
        label: 'Status',
        key: 'status',
        filterOptions: Array.from(new Set(rows.map((row: RowType) => row.migrationStatus))),
      },
      {
        label: 'Errors',
        key: 'errors',
        filterOptions: Array.from(new Set(rows.map((row: RowType) => row.errors))),
      },
    ];

    // Render table
    const tableHtml = generateHtmlTable(headerColumn, columns, rows, org, filters, undefined, 'LWC Assessment');
    return `${tableHtml}`;
  }

  private static generateRows(lwcAssessmentInfos: LWCAssessmentInfo[]): RowType[] {
    const rows: RowType[] = [];
    for (const lwcAssessmentInfo of lwcAssessmentInfos) {
      for (const fileChangeInfo of lwcAssessmentInfo.changeInfos) {
        rows.push({
          name: lwcAssessmentInfo.name,
          filePath: fileChangeInfo.path,
          fileName: fileChangeInfo.name,
          diff: fileChangeInfo.diff,
          migrationStatus: '',
          errors: lwcAssessmentInfo.errors.join(', '),
        });
      }
    }
    return rows;
  }
}
