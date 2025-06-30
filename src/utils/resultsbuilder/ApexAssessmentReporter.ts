import { ApexAssessmentInfo } from '../interfaces';
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
import { FileDiffUtil } from '../lwcparser/fileutils/FileDiffUtil';
import { reportingHelper } from './reportingHelper';

export class ApexAssessmentReporter {
  private static rowId = 0;
  private static rowIdPrefix = 'apex-row-data-';
  public static getApexAssessmentData(
    apexAssessmentInfos: ApexAssessmentInfo[],
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): ReportParam {
    Logger.captureVerboseData('apex data:', apexAssessmentInfos);
    return {
      title: MessageService.getMessage('reportHeadingApex'),
      heading: MessageService.getMessage('reportHeadingApex'),
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toString(),
      total: apexAssessmentInfos?.length || 0,
      filterGroups: this.getFilterGroupsForReport(apexAssessmentInfos),
      headerGroups: this.getHeaderGroupsForReport(),
      rows: this.getRowsForReport(apexAssessmentInfos),
      callToAction: reportingHelper.getCallToAction(apexAssessmentInfos),
    };
  }

  public static getSummaryData(apexAssessmentInfos: ApexAssessmentInfo[]): SummaryItemDetailParam[] {
    return [
      {
        name: MessageService.getMessage('reportDashboardCanBeAutomated'),
        count: apexAssessmentInfos.filter(
          (apexAssessmentInfo) => !apexAssessmentInfo.warnings || apexAssessmentInfo.warnings.length === 0
        ).length,
        cssClass: 'text-success',
      },
      {
        name: MessageService.getMessage('reportLabelHasWarning'),
        count: apexAssessmentInfos.filter((info) => info.warnings && info.warnings.length > 0).length,
        cssClass: 'text-warning',
      },
    ];
  }

  private static getRowsForReport(apexAssessmentInfos: ApexAssessmentInfo[]): ReportRowParam[] {
    return apexAssessmentInfos.map((apexAssessmentInfo) => ({
      rowId: `${this.rowIdPrefix}${this.rowId++}`,
      data: [
        createRowDataParam('name', apexAssessmentInfo.name, true, 1, 1, false),
        createRowDataParam(
          'fileReference',
          apexAssessmentInfo.name,
          false,
          1,
          1,
          true,
          apexAssessmentInfo.path,
          apexAssessmentInfo.name + '.cls'
        ),
        createRowDataParam(
          'status',
          apexAssessmentInfo.warnings.length > 0 ? 'Has Warnings' : 'Can be Automated',
          false,
          1,
          1,
          false,
          undefined,
          undefined,
          apexAssessmentInfo.warnings.length > 0 ? 'text-error' : 'text-success'
        ),
        createRowDataParam(
          'diff',
          apexAssessmentInfo.name + 'diff',
          false,
          1,
          1,
          false,
          undefined,
          FileDiffUtil.getDiffHTML(apexAssessmentInfo.diff, apexAssessmentInfo.name)
        ),
        createRowDataParam(
          'comments',
          apexAssessmentInfo.infos ? apexAssessmentInfo.infos.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          apexAssessmentInfo.infos ? reportingHelper.decorateErrors(apexAssessmentInfo.infos) : []
        ),
        createRowDataParam(
          'errors',
          apexAssessmentInfo.warnings ? apexAssessmentInfo.warnings.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          apexAssessmentInfo.warnings ? reportingHelper.decorateErrors(apexAssessmentInfo.warnings) : []
        ),
      ],
    }));
  }

  private static getFilterGroupsForReport(apexAssessmentInfos: ApexAssessmentInfo[]): FilterGroupParam[] {
    return [
      createFilterGroupParam(
        MessageService.getMessage('reportFilterGroupSummaryLabel'),
        'comments',
        Array.from(new Set(apexAssessmentInfos.map((row: ApexAssessmentInfo) => row.infos.join(', '))))
      ),
      createFilterGroupParam(
        MessageService.getMessage('reportFilterGroupErrorsLabel'),
        'errors',
        Array.from(new Set(apexAssessmentInfos.map((row: ApexAssessmentInfo) => row.warnings.join(', '))))
      ),
    ];
  }

  private static getHeaderGroupsForReport(): ReportHeaderGroupParam[] {
    return [
      {
        header: [
          {
            name: MessageService.getMessage('reportTableHeaderName'),
            colspan: 1,
            rowspan: 1,
          },
          {
            name: MessageService.getMessage('reportTableHeaderFileRef'),
            colspan: 1,
            rowspan: 1,
          },
          {
            name: MessageService.getMessage('reportTableHeaderStatus'),
            colspan: 1,
            rowspan: 2,
          },
          {
            name: MessageService.getMessage('reportTableHeaderDiff'),
            colspan: 1,
            rowspan: 1,
          },
          {
            name: MessageService.getMessage('reportTableHeaderSummary'),
            colspan: 1,
            rowspan: 1,
          },
          {
            name: MessageService.getMessage('reportDashboardError'),
            colspan: 1,
            rowspan: 1,
          },
        ],
      },
    ];
  }
}
