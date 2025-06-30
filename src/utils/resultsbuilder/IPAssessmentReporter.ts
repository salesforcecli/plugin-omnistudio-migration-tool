import { IPAssessmentInfo } from '../interfaces';
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
import { createRowDataParam, getOrgDetailsForReport } from '../reportGenerator/reportUtil';
import { reportingHelper } from './reportingHelper';

export class IPAssessmentReporter {
  private static rowId = 0;
  private static rowIdPrefix = 'ip-row-data-';
  public static getIntegrationProcedureAssessmentData(
    ipAssessmentInfos: IPAssessmentInfo[],
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): ReportParam {
    Logger.captureVerboseData('IP data', ipAssessmentInfos);
    return {
      title: MessageService.getMessage('reportHeadingIP'),
      heading: MessageService.getMessage('reportHeadingIP'),
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toString(),
      total: ipAssessmentInfos?.length || 0,
      filterGroups: this.getFilterGroupsForReport(),
      headerGroups: this.getHeaderGroupsForReport(),
      rows: this.getRowsForReport(ipAssessmentInfos, instanceUrl),
      rollbackFlags: (omnistudioOrgDetails.rollbackFlags || []).includes('RollbackIPChanges')
        ? ['RollbackIPChanges']
        : undefined,
      callToAction: reportingHelper.getCallToAction(ipAssessmentInfos),
    };
  }

  public static getSummaryData(ipAssessmentInfos: IPAssessmentInfo[]): SummaryItemDetailParam[] {
    return [
      {
        name: MessageService.getMessage('reportDashboardCanBeAutomated'),
        count: ipAssessmentInfos.filter(
          (ipAssessmentInfo) => !ipAssessmentInfo.errors || ipAssessmentInfo.errors.length === 0
        ).length,
        cssClass: 'text-success',
      },
      {
        name: MessageService.getMessage('reportFilterHasError'),
        count: ipAssessmentInfos.filter(
          (ipAssessmentInfo) => ipAssessmentInfo.errors && ipAssessmentInfo.errors.length > 0
        ).length,
        cssClass: 'text-error',
      },
    ];
  }

  private static getRowsForReport(ipAssessmentInfos: IPAssessmentInfo[], instanceUrl: string): ReportRowParam[] {
    return ipAssessmentInfos.map((ipAssessmentInfo) => ({
      rowId: `${this.rowIdPrefix}${this.rowId++}`,
      data: [
        createRowDataParam('name', ipAssessmentInfo.oldName, true, 1, 1, false),
        createRowDataParam('id', ipAssessmentInfo.id, false, 1, 1, true, `${instanceUrl}/${ipAssessmentInfo.id}`),
        createRowDataParam('newName', ipAssessmentInfo.name, false, 1, 1, false),
        createRowDataParam(
          'summary',
          ipAssessmentInfo.warnings ? ipAssessmentInfo.warnings.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          ipAssessmentInfo.warnings ? reportingHelper.decorateErrors(ipAssessmentInfo.warnings) : []
        ),
        createRowDataParam(
          'integrationProcedureDependencies',
          ipAssessmentInfo.dependenciesIP
            ? ipAssessmentInfo.dependenciesIP.map((dependency) => dependency.name).join(', ')
            : '',
          false,
          1,
          1,
          false,
          undefined,
          ipAssessmentInfo.dependenciesIP.map((dependency) => dependency.name)
        ),
        createRowDataParam(
          'dataMapperDependencies',
          ipAssessmentInfo.dependenciesDR
            ? ipAssessmentInfo.dependenciesDR.map((dependency) => dependency.name).join(', ')
            : '',
          false,
          1,
          1,
          false,
          undefined,
          ipAssessmentInfo.dependenciesDR.map((dependency) => dependency.name)
        ),
        createRowDataParam(
          'remoteActionDependencies',
          ipAssessmentInfo.dependenciesRemoteAction
            ? ipAssessmentInfo.dependenciesRemoteAction.map((dependency) => dependency.name).join(', ')
            : '',
          false,
          1,
          1,
          false,
          undefined,
          ipAssessmentInfo.dependenciesRemoteAction.map((dependency) => dependency.name)
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
            name: MessageService.getMessage('reportTableHeaderSummary'),
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

  private static getFilterGroupsForReport(): FilterGroupParam[] {
    return [];
  }
}
