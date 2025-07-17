import { OSAssessmentInfo } from '../interfaces';
import { Logger } from '../logger';
import { MessageService } from '../MessageService';
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
      title: MessageService.getMessage('reportHeadingOS'),
      heading: MessageService.getMessage('reportHeadingOS'),
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toString(),
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
        name: MessageService.getMessage('reportDashboardCanBeAutomated'),
        count: osAssessmentInfos.filter(
          (osAssessmentInfo) =>
            osAssessmentInfo.migrationStatus === MessageService.getMessage('reportDashboardCanBeAutomated')
        ).length,
        cssClass: 'text-success',
      },
      {
        name: MessageService.getMessage('reportDashboardNeedManualIntervention'),
        count: osAssessmentInfos.filter(
          (osAssessmentInfo) =>
            osAssessmentInfo.migrationStatus === MessageService.getMessage('reportDashboardNeedManualIntervention')
        ).length,
        cssClass: 'text-warning',
      },
      {
        name: MessageService.getMessage('reportDashboardError'),
        count: osAssessmentInfos.filter(
          (osAssessmentInfo) =>
            osAssessmentInfo.migrationStatus !== MessageService.getMessage('reportDashboardCanBeAutomated') &&
            osAssessmentInfo.migrationStatus !== MessageService.getMessage('reportDashboardNeedManualIntervention')
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
            name: MessageService.getMessage('reportTableHeaderInPackage'),
            colspan: 2,
            rowspan: 1,
          },
          {
            name: MessageService.getMessage('reportTableHeaderInCore'),
            colspan: 1,
            rowspan: 1,
          },
          {
            name: MessageService.getMessage('reportTableHeaderType'),
            colspan: 1,
            rowspan: 2,
          },
          {
            name: MessageService.getMessage('reportTableHeaderStatus'),
            colspan: 1,
            rowspan: 2,
          },
          {
            name: MessageService.getMessage('reportTableHeaderSummary'),
            colspan: 1,
            rowspan: 2,
          },
          {
            name: MessageService.getMessage('reportTableHeaderOSDependencies'),
            colspan: 1,
            rowspan: 2,
          },
          {
            name: MessageService.getMessage('reportTableHeaderIPDependencies'),
            colspan: 1,
            rowspan: 2,
          },
          {
            name: MessageService.getMessage('reportTableHeaderDMDependencies'),
            colspan: 1,
            rowspan: 2,
          },
          {
            name: MessageService.getMessage('reportTableHeaderRemoteActionDependencies'),
            colspan: 1,
            rowspan: 2,
          },
          {
            name: MessageService.getMessage('reportTableHeaderCustomLWCDependencies'),
            colspan: 1,
            rowspan: 2,
          },
        ],
      },
      {
        header: [
          {
            name: MessageService.getMessage('reportTableHeaderName'),
            colspan: 1,
            rowspan: 1,
          },
          {
            name: MessageService.getMessage('reportTableHeaderId'),
            colspan: 1,
            rowspan: 1,
          },
          {
            name: MessageService.getMessage('reportTableHeaderName'),
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
        ? [createFilterGroupParam(MessageService.getMessage('reportFilterGroupOSTypeLabel'), 'type', distinctTypes)]
        : [];
    const distinctStatuses = [...new Set(OSAssessmentInfos.map((info) => info.migrationStatus))];
    const statusFilterGroupParam: FilterGroupParam[] =
      distinctStatuses.length > 0 && distinctStatuses.filter((status) => status).length > 0
        ? [
            createFilterGroupParam(
              MessageService.getMessage('reportFilterGroupStatusLabel'),
              'status',
              distinctStatuses
            ),
          ]
        : [];

    return [...typeFilterGroupParam, ...statusFilterGroupParam];
  }
}
