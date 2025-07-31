import { IPAssessmentInfo } from '../interfaces';
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
      title: 'Integration Procedure Assessment Report',
      heading: 'Integration Procedure Assessment Report',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toLocaleString(),
      total: ipAssessmentInfos?.length || 0,
      filterGroups: this.getFilterGroupsForReport(ipAssessmentInfos),
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
        name: 'Can be Automated',
        count: ipAssessmentInfos.filter((ipAssessmentInfo) => ipAssessmentInfo.migrationStatus === 'Can be Automated')
          .length,
        cssClass: 'text-success',
      },
      {
        name: 'Has Warnings',
        count: ipAssessmentInfos.filter(
          (ipAssessmentInfo) => ipAssessmentInfo.warnings && ipAssessmentInfo.warnings.length > 0
        ).length,
        cssClass: 'text-warning',
      },
      {
        name: 'Has Errors',
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
          'status',
          ipAssessmentInfo.migrationStatus,
          false,
          1,
          1,
          false,
          undefined,
          undefined,
          ipAssessmentInfo.migrationStatus === 'Can be Automated' ? 'text-success' : 'text-error'
        ),
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
            name: 'Remote Action Dependencies',
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

  private static getFilterGroupsForReport(ipAssessmentInfo: IPAssessmentInfo[]): FilterGroupParam[] {
    if (!ipAssessmentInfo || ipAssessmentInfo.length === 0) {
      return [];
    }

    // Get distinct status from IPAssessmentInfo
    const distinctStatuses = [...new Set(ipAssessmentInfo.map((info) => info.migrationStatus))];
    const statusFilterGroupParam: FilterGroupParam[] =
      distinctStatuses.length > 0 && distinctStatuses.filter((status) => status).length > 0
        ? [createFilterGroupParam('Filter By Assessment Status', 'status', distinctStatuses)]
        : [];

    return [...statusFilterGroupParam];
  }
}
