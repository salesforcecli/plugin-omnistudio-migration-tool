import { SaveForLaterAssessmentInfo } from '../interfaces';
import { Logger } from '../logger';
import { OmnistudioOrgDetails } from '../orgUtils';
import {
  FilterGroupParam,
  ReportHeaderGroupParam,
  ReportParam,
  ReportRowParam,
  SummaryItemDetailParam,
} from '../reportGenerator/reportInterfaces';
import {
  createFilterGroupParam,
  createRowDataParam,
  getAssessmentReportNameHeaders,
  getOrgDetailsForReport,
} from '../reportGenerator/reportUtil';
import { reportingHelper } from './reportingHelper';

export class SaveForLaterAssessmentReporter {
  private static rowId = 0;
  private static rowIdPrefix = 'sfl-row-data-';

  public static getSaveForLaterAssessmentData(
    saveForLaterAssessmentInfos: SaveForLaterAssessmentInfo[],
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): ReportParam {
    Logger.captureVerboseData('Save for Later data', saveForLaterAssessmentInfos);
    return {
      title: 'OmniScript Saved Sessions Assessment Report',
      heading: 'OmniScript Saved Sessions Assessment Report',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toLocaleString(),
      total: saveForLaterAssessmentInfos?.length || 0,
      filterGroups: this.getFilterGroupsForReport(saveForLaterAssessmentInfos),
      headerGroups: this.getHeaderGroupsForReport(),
      rows: this.getRowsForReport(saveForLaterAssessmentInfos, instanceUrl),
      callToAction: reportingHelper.getCallToAction(saveForLaterAssessmentInfos),
    };
  }

  public static getSummaryData(saveForLaterAssessmentInfos: SaveForLaterAssessmentInfo[]): SummaryItemDetailParam[] {
    return [
      {
        name: 'Ready for migration',
        count: saveForLaterAssessmentInfos.filter((info) => info.migrationStatus === 'Ready for migration').length,
        cssClass: 'text-success',
      },
      {
        name: 'Warnings',
        count: saveForLaterAssessmentInfos.filter((info) => info.migrationStatus === 'Warnings').length,
        cssClass: 'text-warning',
      },
      {
        name: 'Needs manual intervention',
        count: saveForLaterAssessmentInfos.filter((info) => info.migrationStatus === 'Needs manual intervention')
          .length,
        cssClass: 'text-error',
      },
      {
        name: 'Failed',
        count: saveForLaterAssessmentInfos.filter((info) => info.migrationStatus === 'Failed').length,
        cssClass: 'text-error',
      },
    ];
  }

  private static getFilterGroupsForReport(
    saveForLaterAssessmentInfos: SaveForLaterAssessmentInfo[]
  ): FilterGroupParam[] {
    if (!saveForLaterAssessmentInfos || saveForLaterAssessmentInfos.length === 0) {
      return [];
    }

    const distinctStatuses = [...new Set(saveForLaterAssessmentInfos.map((info) => info.migrationStatus))];
    const statusFilterGroupParam: FilterGroupParam[] =
      distinctStatuses.length > 0 && distinctStatuses.filter((status) => status).length > 0
        ? [createFilterGroupParam('Filter By Assessment Status', 'migrationStatus', distinctStatuses)]
        : [];

    return [...statusFilterGroupParam];
  }

  private static getHeaderGroupsForReport(): ReportHeaderGroupParam[] {
    const firstRowHeaders = [
      ...getAssessmentReportNameHeaders(),
      { name: 'OmniScript', colspan: 1, rowspan: 2 },
      { name: 'OmniScript Status', colspan: 1, rowspan: 2 },
      { name: 'Status', colspan: 1, rowspan: 2 },
      { name: 'Last Saved', colspan: 1, rowspan: 2 },
      { name: 'Assessment Status', colspan: 1, rowspan: 2 },
      { name: 'Summary', colspan: 1, rowspan: 2 },
      { name: 'Errors', colspan: 1, rowspan: 2 },
      { name: 'OmniScript Dependencies', colspan: 1, rowspan: 2 },
    ];

    const secondRowHeaders = [
      { name: 'Name', colspan: 1, rowspan: 1 },
      { name: 'ID', colspan: 1, rowspan: 1 },
      { name: 'Name', colspan: 1, rowspan: 1 },
    ];

    return [{ header: firstRowHeaders }, { header: secondRowHeaders }];
  }

  private static getRowsForReport(
    saveForLaterAssessmentInfos: SaveForLaterAssessmentInfo[],
    instanceUrl: string
  ): ReportRowParam[] {
    return saveForLaterAssessmentInfos.map((info) => ({
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
          info.migrationStatus === 'Needs manual intervention' || info.migrationStatus === 'Failed'
            ? 'invalid-icon'
            : ''
        ),
        createRowDataParam('id', info.id, false, 1, 1, true, `${instanceUrl}/${info.id}`),
        createRowDataParam('newName', info.name, false, 1, 1, false),
        createRowDataParam('omniScriptName', info.omniScriptName || info.omniScriptId || 'N/A', false, 1, 1, false),
        createRowDataParam(
          'omniScriptStatus',
          info.omniScriptMigrationStatus || 'N/A',
          false,
          1,
          1,
          false,
          undefined,
          undefined,
          info.omniScriptMigrationStatus === 'Ready for migration' || info.omniScriptMigrationStatus === 'Complete'
            ? 'text-success'
            : info.omniScriptMigrationStatus === 'Needs manual intervention' ||
              info.omniScriptMigrationStatus === 'Failed'
            ? 'text-error'
            : ''
        ),
        createRowDataParam('status', info.status, false, 1, 1, false),
        createRowDataParam('lastSaved', info.lastSaved || 'N/A', false, 1, 1, false),
        createRowDataParam(
          'migrationStatus',
          info.migrationStatus,
          false,
          1,
          1,
          false,
          undefined,
          undefined,
          info.migrationStatus === 'Ready for migration'
            ? 'text-success'
            : info.migrationStatus === 'Warnings'
            ? 'text-warning'
            : 'text-error'
        ),
        createRowDataParam(
          'summary',
          info.infos && info.infos.length > 0 ? info.infos.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          info.infos
        ),
        createRowDataParam(
          'errors',
          info.errors ? info.errors.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          info.errors
        ),
        createRowDataParam(
          'dependenciesOS',
          info.dependenciesOS ? info.dependenciesOS.join(', ') : '',
          false,
          1,
          1,
          false,
          undefined,
          info.dependenciesOS
        ),
      ],
    }));
  }
}
