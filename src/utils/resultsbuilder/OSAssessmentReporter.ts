import { OSAssessmentInfo } from '../interfaces';
import { generateHtmlTable } from '../reportGenerator/reportGenerator';
import {
  CTASummary,
  Filter,
  HeaderColumn,
  ReportFrameworkParameters,
  ReportHeaderFormat,
  TableColumn,
} from '../reportGenerator/reportInterfaces';
import { reportingHelper } from './reportingHelper';

export class OSAssessmentReporter {
  public static generateOSAssesment(
    osAssessmentInfos: OSAssessmentInfo[],
    instanceUrl: string,
    orgDetails: ReportHeaderFormat[],
    rollbackFlags: string[]
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
        label: 'Assessment Status',
        key: 'assessmentStatus',
        rowspan: 2,
        subColumn: [],
      },
      {
        label: 'Summary',
        rowspan: 2,
        subColumn: [],
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
        label: 'Data Mapper Dependencies',
        rowspan: 2,
        subColumn: [],
      },
      {
        label: 'Remote Action Dependencies',
        rowspan: 2,
        subColumn: [],
      },
      {
        label: 'Custom LWCs Dependencies',
        rowspan: 2,
        subColumn: [],
      },
    ];

    // Define columns
    const columns: Array<TableColumn<OSAssessmentInfo>> = [
      {
        key: 'oldName',
        cell: (row: OSAssessmentInfo): string => row.oldName,
        filterValue: (row: OSAssessmentInfo): string => row.oldName,
        title: (row: OSAssessmentInfo): string => row.oldName,
        icon: (row: OSAssessmentInfo): string => this.getIconOnRow(row.migrationStatus),
      },
      {
        key: 'id',
        cell: (row: OSAssessmentInfo): string => (row.id ? `<a href="${instanceUrl}/${row.id}">${row.id}</a>` : ''),
        filterValue: (row: OSAssessmentInfo): string => row.id,
        title: (row: OSAssessmentInfo): string => row.id,
      },
      {
        key: 'name',
        cell: (row: OSAssessmentInfo): string => row.name || '',
        filterValue: (row: OSAssessmentInfo): string => row.name,
        title: (row: OSAssessmentInfo): string => row.name,
      },
      {
        key: 'type',
        cell: (row: OSAssessmentInfo): string => row.type,
        filterValue: (row: OSAssessmentInfo): string => row.type,
        title: (row: OSAssessmentInfo): string => row.type,
      },
      {
        key: 'assessmentStatus',
        cell: (row: OSAssessmentInfo): string => row.migrationStatus,
        filterValue: (row: OSAssessmentInfo): string => row.migrationStatus,
        styles: (row: OSAssessmentInfo): string => this.getMigrationStatusStyles(row.migrationStatus),
      },
      {
        key: 'Summary',
        cell: (row: OSAssessmentInfo): string => reportingHelper.convertToBuletedList(row.warnings || []),
        filterValue: (row: OSAssessmentInfo): string => (row.warnings ? row.warnings.join(', ') : ''),
        title: (row: OSAssessmentInfo): string => (row.warnings ? row.warnings.join(', ') : ''),
      },
      {
        key: 'dependenciesOS',
        cell: (row: OSAssessmentInfo): string => reportingHelper.decorate(row.dependenciesOS) || '',
        filterValue: (row: OSAssessmentInfo): string => (row.dependenciesOS ? row.dependenciesOS.join(', ') : ''),
      },
      {
        key: 'dependenciesIP',
        cell: (row: OSAssessmentInfo): string => reportingHelper.decorate(row.dependenciesIP) || '',
        filterValue: (row: OSAssessmentInfo): string => (row.dependenciesIP ? row.dependenciesIP.join(', ') : ''),
      },
      {
        key: 'dependenciesDR',
        cell: (row: OSAssessmentInfo): string => reportingHelper.decorate(row.dependenciesDR) || '',
        filterValue: (row: OSAssessmentInfo): string => (row.dependenciesDR ? row.dependenciesDR.join(', ') : ''),
      },
      {
        key: 'dependenciesRemoteAction',
        cell: (row: OSAssessmentInfo): string => reportingHelper.decorate(row.dependenciesRemoteAction) || '',
        filterValue: (row: OSAssessmentInfo): string =>
          row.dependenciesRemoteAction ? row.dependenciesRemoteAction.join(', ') : '',
      },
      {
        key: 'dependenciesLWC',
        cell: (row: OSAssessmentInfo): string => reportingHelper.decorate(row.dependenciesLWC) || '',
        filterValue: (row: OSAssessmentInfo): string => (row.dependenciesLWC ? row.dependenciesLWC.join(', ') : ''),
      },
    ];

    const filters: Filter[] = [
      {
        label: 'Type',
        filterOptions: Array.from(new Set(osAssessmentInfos.map((row: OSAssessmentInfo) => row.type))),
        key: 'type',
      },
      {
        label: 'Assessment Status',
        filterOptions: Array.from(new Set(osAssessmentInfos.map((row: OSAssessmentInfo) => row.migrationStatus))),
        key: 'assessmentStatus',
      },
    ];

    const ctaSummary: CTASummary[] = [
      {
        name: 'Angular Omniscripts',
        message: 'converts to LWC omniscripts',
        link: 'https://google.com',
      },
      {
        name: 'Duplicate Name',
        message: 'rename the OS prior to running migration',
        link: 'https://google.com',
      },
    ];

    const reportFrameworkParameters: ReportFrameworkParameters<OSAssessmentInfo> = {
      headerColumns: headerColumn,
      columns,
      rows: osAssessmentInfos,
      orgDetails,
      filters,
      ctaSummary,
      reportHeaderLabel: 'Omniscript Assessment',
      showMigrationBanner: true,
      rollbackFlags,
      rollbackFlagName: 'RollbackOSChanges',
      commandType: 'assess',
    };

    // Render table
    const tableHtml = generateHtmlTable(reportFrameworkParameters);
    return `${tableHtml}`;
  }

  private static getMigrationStatusStyles(assessmentStatus: string): string {
    return assessmentStatus === 'Can be Automated' ? 'color:green; font-weight:500;' : 'color:red; font-weight:500;';
  }

  private static getIconOnRow(assessmentStatus: string): string {
    return assessmentStatus === 'Need Manual Intervention'
      ? `<span class='row-'><svg width='16' height='16' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'>
      <circle cx='50' cy='50' r='45' stroke='red' stroke-width='10' fill='none'/>
      <line x1='25' y1='75' x2='75' y2='25' stroke='red' stroke-width='10'/>
    </svg></span>`
      : '';
  }
}
