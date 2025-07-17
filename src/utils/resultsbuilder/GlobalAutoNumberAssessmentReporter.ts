import { GlobalAutoNumberAssessmentInfo } from '../interfaces';
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

export class GlobalAutoNumberAssessmentReporter {
  private static rowId = 0;
  private static rowIdPrefix = 'autonumber-row-data-';

  public static getGlobalAutoNumberAssessmentData(
    globalAutoNumberAssessmentInfos: GlobalAutoNumberAssessmentInfo[],
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): ReportParam {
    Logger.captureVerboseData('GAN data', globalAutoNumberAssessmentInfos);
    return {
      title: 'Global Auto Number Migration Assessment',
      heading: 'Global Auto Number',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toString(),
      total: globalAutoNumberAssessmentInfos?.length || 0,
      filterGroups: this.getFilterGroupsForReport(globalAutoNumberAssessmentInfos),
      headerGroups: this.getHeaderGroupsForReport(),
      rows: this.getRowsForReport(globalAutoNumberAssessmentInfos, instanceUrl),
      rollbackFlags:
        (omnistudioOrgDetails.rollbackFlags || []).includes('RollbackIPChanges') ||
        (omnistudioOrgDetails.rollbackFlags || []).includes('RollbackDRChanges')
          ? ['RollbackIPChanges', 'RollbackDRChanges'].filter((flag) =>
              (omnistudioOrgDetails.rollbackFlags || []).includes(flag)
            )
          : undefined,
      callToAction: reportingHelper.getCallToAction(globalAutoNumberAssessmentInfos),
    };
  }

  public static getSummaryData(
    globalAutoNumberAssessmentInfos: GlobalAutoNumberAssessmentInfo[]
  ): SummaryItemDetailParam[] {
    return [
      {
        name: 'Can be Automated',
        count: globalAutoNumberAssessmentInfos.filter(
          (globalAutoNumberAssessmentInfo) =>
            (!globalAutoNumberAssessmentInfo.warnings || globalAutoNumberAssessmentInfo.warnings.length === 0) &&
            (!globalAutoNumberAssessmentInfo.errors || globalAutoNumberAssessmentInfo.errors.length === 0)
        ).length,
        cssClass: 'text-success',
      },
      {
        name: 'Has Warnings',
        count: globalAutoNumberAssessmentInfos.filter(
          (globalAutoNumberAssessmentInfo) =>
            globalAutoNumberAssessmentInfo.warnings && globalAutoNumberAssessmentInfo.warnings.length > 0
        ).length,
        cssClass: 'text-warning',
      },
      {
        name: 'Has Errors',
        count: globalAutoNumberAssessmentInfos.filter(
          (globalAutoNumberAssessmentInfo) =>
            globalAutoNumberAssessmentInfo.errors && globalAutoNumberAssessmentInfo.errors.length > 0
        ).length,
        cssClass: 'text-error',
      },
    ];
  }

  private static getFilterGroupsForReport(
    globalAutoNumberAssessmentInfos: GlobalAutoNumberAssessmentInfo[]
  ): FilterGroupParam[] {
    if (!globalAutoNumberAssessmentInfos || globalAutoNumberAssessmentInfos.length === 0) {
      return [];
    }

    // Create filter groups based on migration status
    const statuses = new Set<string>();
    globalAutoNumberAssessmentInfos.forEach((info) => {
      const status = this.getMigrationStatus(info);
      statuses.add(status);
    });

    if (statuses.size > 0) {
      return [createFilterGroupParam('Filter By Status', 'status', Array.from(statuses))];
    }
    return [];
  }

  private static getHeaderGroupsForReport(): ReportHeaderGroupParam[] {
    return [
      {
        header: [
          {
            name: 'In Package',
            colspan: 2,
            rowspan: 1,
          },
          {
            name: 'In Core',
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
            name: 'Record ID',
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

  private static getRowsForReport(
    globalAutoNumberAssessmentInfos: GlobalAutoNumberAssessmentInfo[],
    instanceUrl: string
  ): ReportRowParam[] {
    return globalAutoNumberAssessmentInfos.map((globalAutoNumberAssessmentInfo) => {
      const allMessages = [
        ...(globalAutoNumberAssessmentInfo.warnings || []),
        ...(globalAutoNumberAssessmentInfo.errors || []),
      ];

      return {
        rowId: `${this.rowIdPrefix}${this.rowId++}`,
        data: [
          createRowDataParam('name', globalAutoNumberAssessmentInfo.oldName, true, 1, 1, false),
          createRowDataParam(
            'id',
            globalAutoNumberAssessmentInfo.id,
            false,
            1,
            1,
            true,
            `${instanceUrl}/${globalAutoNumberAssessmentInfo.id}`
          ),
          createRowDataParam('newName', globalAutoNumberAssessmentInfo.name, false, 1, 1, false),
          createRowDataParam(
            'status',
            this.getMigrationStatus(globalAutoNumberAssessmentInfo),
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            this.getMigrationStatusCssClass(globalAutoNumberAssessmentInfo)
          ),
          createRowDataParam(
            'summary',
            allMessages.length > 0 ? allMessages.join(', ') : '',
            false,
            1,
            1,
            false,
            undefined,
            allMessages.length > 0 ? reportingHelper.decorateErrors(allMessages) : []
          ),
        ],
      };
    });
  }

  private static getMigrationStatus(globalAutoNumberAssessmentInfo: GlobalAutoNumberAssessmentInfo): string {
    if (globalAutoNumberAssessmentInfo.errors && globalAutoNumberAssessmentInfo.errors.length > 0) {
      return 'Has Errors';
    }
    if (globalAutoNumberAssessmentInfo.warnings && globalAutoNumberAssessmentInfo.warnings.length > 0) {
      return 'Has Warnings';
    }
    return 'Can be Automated';
  }

  private static getMigrationStatusCssClass(globalAutoNumberAssessmentInfo: GlobalAutoNumberAssessmentInfo): string {
    if (globalAutoNumberAssessmentInfo.errors && globalAutoNumberAssessmentInfo.errors.length > 0) {
      return 'text-error';
    }
    if (globalAutoNumberAssessmentInfo.warnings && globalAutoNumberAssessmentInfo.warnings.length > 0) {
      return 'text-warning';
    }
    return 'text-success';
  }
}
