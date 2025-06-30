import { DataRaptorAssessmentInfo } from '../interfaces';
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

export class DRAssessmentReporter {
  private static rowId = 0;
  private static rowIdPrefix = 'dr-row-data-';
  public static getDatamapperAssessmentData(
    dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[],
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): ReportParam {
    return {
      title: MessageService.getMessage('reportHeadingDM'),
      heading: MessageService.getMessage('reportHeadingDM'),
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toString(),
      total: dataRaptorAssessmentInfos?.length || 0,
      filterGroups: this.getFilterGroupsForReport(),
      headerGroups: this.getHeaderGroupsForReport(),
      rows: this.getRowsForReport(dataRaptorAssessmentInfos, instanceUrl),
      rollbackFlags: (omnistudioOrgDetails.rollbackFlags || []).includes('RollbackDRChanges')
        ? ['RollbackDRChanges']
        : undefined,
    };
  }

  public static getSummaryData(dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[]): SummaryItemDetailParam[] {
    return [
      {
        name: MessageService.getMessage('reportDashboardCanBeAutomated'),
        count: dataRaptorAssessmentInfos.filter(
          (dataRaptorAssessmentInfo) =>
            !dataRaptorAssessmentInfo.warnings || dataRaptorAssessmentInfo.warnings.length === 0
        ).length,
        cssClass: 'text-success',
      },
      {
        name: MessageService.getMessage('reportLabelHasWarning'),
        count: dataRaptorAssessmentInfos.filter(
          (dataRaptorAssessmentInfo) =>
            dataRaptorAssessmentInfo.warnings && dataRaptorAssessmentInfo.warnings.length > 0
        ).length,
        cssClass: 'text-warning',
      },
    ];
  }

  private static getFilterGroupsForReport(): FilterGroupParam[] {
    return [
      createFilterGroupParam(MessageService.getMessage('reportFilterGroupDMTypeLabel'), 'type', [
        MessageService.getMessage('reportTableLabelDMExtract'),
        MessageService.getMessage('reportTableLabelDMTransform'),
        MessageService.getMessage('reportTableLabelDMLoad'),
        MessageService.getMessage('reportTableLabelDMTurboExtract'),
      ]),
    ];
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
            name: MessageService.getMessage('reportTableHeaderSummary'),
            colspan: 1,
            rowspan: 2,
          },
          {
            name: MessageService.getMessage('reportTableHeaderCustomFunctionDependencies'),
            colspan: 1,
            rowspan: 2,
          },
          {
            name: MessageService.getMessage('reportTableHeaderApexDependencies'),
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

  private static getRowsForReport(
    dataRaptorAssessmentInfos: DataRaptorAssessmentInfo[],
    instanceUrl: string
  ): ReportRowParam[] {
    return dataRaptorAssessmentInfos.map((dataRaptorAssessmentInfo) => ({
      rowId: `${this.rowIdPrefix}${this.rowId++}`,
      data: [
        createRowDataParam('name', dataRaptorAssessmentInfo.oldName, true, 1, 1, false),
        createRowDataParam(
          'id',
          dataRaptorAssessmentInfo.id,
          false,
          1,
          1,
          true,
          `${instanceUrl}/${dataRaptorAssessmentInfo.id}`
        ),
        createRowDataParam('newName', dataRaptorAssessmentInfo.name, false, 1, 1, false),
        createRowDataParam('type', dataRaptorAssessmentInfo.type, false, 1, 1, false),
        createRowDataParam(
          'summary',
          dataRaptorAssessmentInfo.infos ? dataRaptorAssessmentInfo.infos.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          dataRaptorAssessmentInfo.infos
        ),
        createRowDataParam(
          'customFunctionDependencies',
          dataRaptorAssessmentInfo.formulaChanges
            ? dataRaptorAssessmentInfo.formulaChanges.map((change) => `${change.old} -> ${change.new}`).join(', ')
            : '',
          false,
          1,
          1,
          false,
          undefined,
          dataRaptorAssessmentInfo.formulaChanges.map((change) => `${change.old} -> ${change.new}`)
        ),
        createRowDataParam(
          'apexDependencies',
          dataRaptorAssessmentInfo.apexDependencies ? dataRaptorAssessmentInfo.apexDependencies.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          dataRaptorAssessmentInfo.apexDependencies
        ),
      ],
    }));
  }
}
