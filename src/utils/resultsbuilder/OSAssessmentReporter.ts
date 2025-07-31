import { OSAssessmentInfo } from '../interfaces';
import { Logger } from '../logger';
import { OmnistudioOrgDetails } from '../orgUtils';
import {
  FilterGroupParam,
  ReportHeaderGroupParam,
  ReportParam,
  ReportRowParam,
  SummaryItemDetailParam,
} from '../reportGenerator/reportInterfaces';
import { createFilterGroupParam, createRowDataParam, getOrgDetailsForReport } from '../reportGenerator/reportUtil';
import { reportingHelper } from './reportingHelper';

export class OSAssessmentReporter {
  private static rowId = 0;
  private static rowIdPrefix = 'os-row-data-';
  public static getOmniscriptAssessmentData(
    OSAssessmentInfos: OSAssessmentInfo[],
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): ReportParam {
    Logger.captureVerboseData('OS data:', OSAssessmentInfos);
    return {
      title: 'OmniScript Assessment Report',
      heading: 'OmniScript Assessment Report',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toLocaleString(),
      total: OSAssessmentInfos?.length || 0,
      filterGroups: this.getFilterGroupsForReport(OSAssessmentInfos),
      headerGroups: this.getHeaderGroupsForReport(),
      rows: this.getRowsForReport(OSAssessmentInfos, instanceUrl),
      rollbackFlags: (omnistudioOrgDetails.rollbackFlags || []).includes('RollbackOSChanges')
        ? ['RollbackOSChanges']
        : undefined,
      callToAction: reportingHelper.getCallToAction(OSAssessmentInfos),
    };
  }

  public static getSummaryData(osAssessmentInfos: OSAssessmentInfo[]): SummaryItemDetailParam[] {
    return [
      {
        name: 'Can be Automated',
        count: osAssessmentInfos.filter((osAssessmentInfo) => osAssessmentInfo.migrationStatus === 'Can be Automated')
          .length,
        cssClass: 'text-success',
      },
      {
        name: 'Need Manual Intervention',
        count: osAssessmentInfos.filter(
          (osAssessmentInfo) => osAssessmentInfo.migrationStatus === 'Need Manual Intervention'
        ).length,
        cssClass: 'text-warning',
      },
      {
        name: 'Has Errors',
        count: osAssessmentInfos.filter(
          (osAssessmentInfo) =>
            osAssessmentInfo.migrationStatus !== 'Can be Automated' &&
            osAssessmentInfo.migrationStatus !== 'Need Manual Intervention'
        ).length,
        cssClass: 'text-error',
      },
    ];
  }

  private static getRowsForReport(OSAssessmentInfos: OSAssessmentInfo[], instanceUrl: string): ReportRowParam[] {
    return OSAssessmentInfos.map((info) => ({
      rowId: `${this.rowIdPrefix}${this.rowId++}`,
      data: [
        createRowDataParam(
          'name',
          info.oldName,
          true,
          1,
          1,
          false,
          undefined,
          undefined,
          info.migrationStatus !== 'Can be Automated' ? 'invalid-icon' : ''
        ),
        createRowDataParam('recordId', info.id, false, 1, 1, true, `${instanceUrl}/${info.id}`),
        createRowDataParam('newName', info.name || '', false, 1, 1, false),
        createRowDataParam('type', info.type, false, 1, 1, false),
        createRowDataParam(
          'status',
          info.migrationStatus,
          false,
          1,
          1,
          false,
          undefined,
          undefined,
          info.migrationStatus === 'Can be Automated' ? 'text-success' : 'text-error'
        ),
        createRowDataParam(
          'summary',
          info.warnings ? info.warnings.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          info.warnings ? reportingHelper.decorateErrors(info.warnings) : []
        ),
        createRowDataParam(
          'omniScriptDependencies',
          info.dependenciesOS ? info.dependenciesOS.map((dependency) => dependency.name).join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          info.dependenciesOS.map((dependency) => dependency.name)
        ),
        createRowDataParam(
          'integrationProcedureDependencies',
          info.dependenciesIP ? info.dependenciesIP.map((dependency) => dependency.name).join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          info.dependenciesIP.map((dependency) => dependency.name)
        ),
        createRowDataParam(
          'dataMapperDependencies',
          info.dependenciesDR ? info.dependenciesDR.map((dependency) => dependency.name).join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          info.dependenciesDR.map((dependency) => dependency.name)
        ),
        createRowDataParam(
          'remoteActionDependencies',
          info.dependenciesRemoteAction
            ? info.dependenciesRemoteAction.map((dependency) => dependency.name).join(', ')
            : '',
          false,
          1,
          1,
          false,
          undefined,
          info.dependenciesRemoteAction.map((dependency) => dependency.name)
        ),
        createRowDataParam(
          'customLWCDependencies',
          info.dependenciesLWC ? info.dependenciesLWC.map((dependency) => dependency.name).join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          info.dependenciesLWC.map((dependency) => dependency.name)
        ),
      ],
    }));
  }

  private static getHeaderGroupsForReport(): ReportHeaderGroupParam[] {
    return [
      {
        header: [
          {
            name: 'Managed Package',
            colspan: 2,
            rowspan: 1,
          },
          {
            name: 'Standard',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Type',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Assessment Status',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Summary',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'OmniScript Dependencies',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Integration Procedure Dependencies',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Data Mapper Dependencies',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Remote action Dependencies',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Custom LWCs Dependencies',
            colspan: 1,
            rowspan: 2,
          },
        ],
      },
      {
        header: [
          {
            name: 'Name',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'ID',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Name',
            colspan: 1,
            rowspan: 1,
          },
        ],
      },
    ];
  }

  private static getFilterGroupsForReport(OSAssessmentInfos: OSAssessmentInfo[]): FilterGroupParam[] {
    if (!OSAssessmentInfos || OSAssessmentInfos.length === 0) {
      return [];
    }

    // Get distinct types from OSAssessmentInfos
    const distinctTypes = [...new Set(OSAssessmentInfos.map((info) => info.type))];
    const typeFilterGroupParam: FilterGroupParam[] =
      distinctTypes.length > 0 && distinctTypes.filter((type) => type).length > 0
        ? [createFilterGroupParam('Filter By Type', 'type', distinctTypes)]
        : [];
    const distinctStatuses = [...new Set(OSAssessmentInfos.map((info) => info.migrationStatus))];
    const statusFilterGroupParam: FilterGroupParam[] =
      distinctStatuses.length > 0 && distinctStatuses.filter((status) => status).length > 0
        ? [createFilterGroupParam('Filter By Status', 'status', distinctStatuses)]
        : [];

    return [...typeFilterGroupParam, ...statusFilterGroupParam];
  }
}
