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

export class ApexAssessmentReporter {
  private static rowId = 0;
  private static rowIdPrefix = 'apex-row-data-';
  public static getApexAssessmentData(
    apexAssessmentInfos: ApexAssessmentInfo[],
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): ReportParam {
    Logger.captureVerboseData('apex data:', apexAssessmentInfos);
    return {
      title: 'Apex Migration Assessment',
      heading: 'Apex',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toString(),
      total: apexAssessmentInfos?.length || 0,
      filterGroups: this.getFilterGroupsForReport(apexAssessmentInfos),
      headerGroups: this.getHeaderGroupsForReport(),
      rows: this.getRowsForReport(apexAssessmentInfos),
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
        createRowDataParam('fileReference', apexAssessmentInfo.path, false, 1, 1, false),
        createRowDataParam('diff', apexAssessmentInfo.diff, false, 1, 1, false),
        createRowDataParam(
          'comments',
          apexAssessmentInfo.infos ? apexAssessmentInfo.infos.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          apexAssessmentInfo.infos
        ),
        createRowDataParam(
          'errors',
          apexAssessmentInfo.warnings ? apexAssessmentInfo.warnings.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          apexAssessmentInfo.warnings
        ),
      ],
    }));
  }

  private static getFilterGroupsForReport(apexAssessmentInfos: ApexAssessmentInfo[]): FilterGroupParam[] {
    return [
      createFilterGroupParam(
        'Filter By Comments',
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
            name: 'Diff',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Comments',
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
