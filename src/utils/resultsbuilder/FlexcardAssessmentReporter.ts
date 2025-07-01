import { FlexCardAssessmentInfo } from '../interfaces';
import { Logger } from '../logger';
import { OmnistudioOrgDetails } from '../orgUtils';
import {
  FilterGroupParam,
  ReportHeaderGroupParam,
  ReportParam,
  ReportRowParam,
  SummaryItemDetailParam,
} from '../reportGenerator/reportInterfaces';
import { createRowDataParam, getOrgDetailsForReport } from '../reportGenerator/reportUtil';

export class FlexcardAssessmentReporter {
  private static rowId = 0;
  private static rowIdPrefix = 'flexcard-row-data-';
  public static getFlexcardAssessmentData(
    flexCardAssessmentInfos: FlexCardAssessmentInfo[],
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): ReportParam {
    Logger.captureVerboseData('fc data:', flexCardAssessmentInfos);
    return {
      title: 'Flexcard Migration Assessment',
      heading: 'Flexcard',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toString(),
      total: flexCardAssessmentInfos?.length || 0,
      filterGroups: this.getFilterGroupsForReport(),
      headerGroups: this.getHeaderGroupsForReport(),
      rows: this.getRowsForReport(flexCardAssessmentInfos, instanceUrl),
    };
  }

  public static getSummaryData(flexCardAssessmentInfos: FlexCardAssessmentInfo[]): SummaryItemDetailParam[] {
    return [
      {
        name: 'Can be Automated',
        count: flexCardAssessmentInfos.filter(
          (flexCardAssessmentInfo) => !flexCardAssessmentInfo.warnings || flexCardAssessmentInfo.warnings.length === 0
        ).length,
        cssClass: 'text-success',
      },
      {
        name: 'Has Warnings',
        count: flexCardAssessmentInfos.filter(
          (flexCardAssessmentInfo) => flexCardAssessmentInfo.warnings && flexCardAssessmentInfo.warnings.length > 0
        ).length,
        cssClass: 'text-warning',
      },
    ];
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
            name: 'Flexcard Dependencies',
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
  private static getFilterGroupsForReport(): FilterGroupParam[] {
    return [];
  }

  private static getRowsForReport(
    flexCardAssessmentInfos: FlexCardAssessmentInfo[],
    instanceUrl: string
  ): ReportRowParam[] {
    return flexCardAssessmentInfos.map((flexCardAssessmentInfo) => ({
      rowId: `${this.rowIdPrefix}${this.rowId++}`,
      data: [
        createRowDataParam('name', flexCardAssessmentInfo.name, true, 1, 1, false),
        createRowDataParam(
          'recordId',
          flexCardAssessmentInfo.id,
          false,
          1,
          1,
          true,
          `${instanceUrl}/${flexCardAssessmentInfo.id}`
        ),
        createRowDataParam('newName', flexCardAssessmentInfo.name, false, 1, 1, false),
        createRowDataParam(
          'omniScriptDependencies',
          flexCardAssessmentInfo.dependenciesOS ? flexCardAssessmentInfo.dependenciesOS.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          flexCardAssessmentInfo.dependenciesOS
        ),
        createRowDataParam(
          'integrationProcedureDependencies',
          flexCardAssessmentInfo.dependenciesIP ? flexCardAssessmentInfo.dependenciesIP.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          flexCardAssessmentInfo.dependenciesIP
        ),
        createRowDataParam(
          'dataMapperDependencies',
          flexCardAssessmentInfo.dependenciesDR ? flexCardAssessmentInfo.dependenciesDR.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          flexCardAssessmentInfo.dependenciesDR
        ),
        createRowDataParam(
          'flexcardDependencies',
          flexCardAssessmentInfo.dependenciesFC ? flexCardAssessmentInfo.dependenciesFC.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          flexCardAssessmentInfo.dependenciesFC
        ),
      ],
    }));
  }
}
