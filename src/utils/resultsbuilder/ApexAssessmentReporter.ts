import { ApexAssessmentInfo } from '../interfaces';
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
      title: 'Apex File Assessment Report',
      heading: 'Apex File Assessment Report',
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
        name: 'Can be Automated',
        count: apexAssessmentInfos.filter(
          (apexAssessmentInfo) => !apexAssessmentInfo.warnings || apexAssessmentInfo.warnings.length === 0
        ).length,
        cssClass: 'text-success',
      },
      {
        name: 'Has Warnings',
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
        'Filter By Summary',
        'comments',
        Array.from(new Set(apexAssessmentInfos.map((row: ApexAssessmentInfo) => row.infos.join(', '))))
      ),
      createFilterGroupParam(
        'Filter By Errors',
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
            name: 'Name',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'File Reference',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Assessment Status',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Code Difference',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Summary',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Errors',
            colspan: 1,
            rowspan: 1,
          },
        ],
      },
    ];
  }
}
