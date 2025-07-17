import fs from 'fs';
import path from 'path';
import open from 'open';
import { pushAssestUtilites } from '../file/fileUtil';
import { ApexAssessmentInfo, MigratedObject, MigratedRecordInfo, RelatedObjectAssesmentInfo } from '../interfaces';
import { DashboardParam, ReportParam } from '../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../orgUtils';
import { TemplateParser } from '../templateParser/generate';
import { createFilterGroupParam, createRowDataParam } from '../reportGenerator/reportUtil';
import { FileDiffUtil } from '../lwcparser/fileutils/FileDiffUtil';
import { Logger } from '../logger';
import { MessageService } from '../MessageService';
import { getMigrationHeading } from '../stringUtils';
import { reportingHelper } from './reportingHelper';

const resultsDir = path.join(process.cwd(), 'migration_report');
// const lwcConstants = { componentName: 'lwc', title: 'LWC Components Migration Result' };
const migrationReportHTMLfileName = 'dashboard.html';
const templateDir = 'templates';
const reportTemplateName = 'migrationReport.template';
const dashboardTemplateName = 'dashboard.template';
const reportTemplateFilePath = path.join(__dirname, '..', '..', templateDir, reportTemplateName);
const dashboardTemplateFilePath = path.join(__dirname, '..', '..', templateDir, dashboardTemplateName);
const apexFileName = 'apex.html';

export class ResultsBuilder {
  private static rowClass = 'data-row-';
  private static rowId = 0;

  public static async generateReport(
    results: MigratedObject[],
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    actionItems: string[]
  ): Promise<void> {
    fs.mkdirSync(resultsDir, { recursive: true });
    Logger.info(MessageService.getMessage('generatingComponentReports'));
    for (const result of results) {
      this.generateReportForResult(result, instanceUrl, orgDetails);
    }
    Logger.info(MessageService.getMessage('generatingRelatedObjectReports'));
    this.generateReportForRelatedObject(relatedObjectMigrationResult, instanceUrl, orgDetails);

    Logger.info(MessageService.getMessage('generatingMigrationReportDashboard'));
    this.generateMigrationReportDashboard(orgDetails, results, relatedObjectMigrationResult, actionItems);
    pushAssestUtilites('javascripts', resultsDir);
    pushAssestUtilites('styles', resultsDir);
    await open(path.join(resultsDir, migrationReportHTMLfileName));
  }

  private static generateReportForResult(
    result: MigratedObject,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): void {
    Logger.captureVerboseData(`${result.name} data`, result);
    // Determine which rollback flag to use based on component type
    let rollbackFlagNames: string[] = [];
    const componentName = result.name.toLowerCase();
    if (componentName.includes('datamapper') || componentName.includes('data mapper')) {
      rollbackFlagNames = ['RollbackDRChanges'];
    } else if (componentName.includes('omniscript') || componentName.includes('integration procedure')) {
      rollbackFlagNames = ['RollbackOSChanges', 'RollbackIPChanges'];
    }
    const rollbackFlags = orgDetails.rollbackFlags || [];
    const flags = rollbackFlagNames.filter((flag) => rollbackFlags.includes(flag));
    const data: ReportParam = {
      title: getMigrationHeading(result.name),
      heading: getMigrationHeading(result.name),
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toString(),
      total: result.data?.length || 0,
      filterGroups: [
        createFilterGroupParam(MessageService.getMessage('reportFilterGroupStatusLabel'), 'status', [
          MessageService.getMessage('reportDashboardCardLabelCompleted'),
          MessageService.getMessage('reportDashboardCardLabelError'),
          MessageService.getMessage('reportDashboardCardLabelSkipped'),
        ]),
      ],
      headerGroups: [
        {
          header: [
            {
              name: MessageService.getMessage('reportTableHeaderInPackage'),
              colspan: 2,
              rowspan: 1,
            },
            {
              name: MessageService.getMessage('reportTableHeaderInCore'),
              colspan: 2,
              rowspan: 1,
            },
            {
              name: MessageService.getMessage('reportMigrationTableHeaderStatus'),
              colspan: 1,
              rowspan: 2,
            },
            {
              name: MessageService.getMessage('reportMigrationTableHeaderError'),
              colspan: 1,
              rowspan: 2,
            },
            {
              name: MessageService.getMessage('reportMigrationTableHeaderWarning'),
              colspan: 1,
              rowspan: 2,
            },
          ],
        },
        {
          header: [
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
      ],
      rows: [
        ...(result.data || []).map((item) => ({
          rowId: `${this.rowClass}${this.rowId++}`,
          data: [
            createRowDataParam('id', item.id, false, 1, 1, true, `${instanceUrl}/${item.id}`),
            createRowDataParam('name', item.name, true, 1, 1, false),
            createRowDataParam('migratedId', item.migratedId, false, 1, 1, true, `${instanceUrl}/${item.migratedId}`),
            createRowDataParam('migratedName', item.migratedName, false, 1, 1, false),
            createRowDataParam(
              'status',
              item.status,
              false,
              1,
              1,
              false,
              undefined,
              reportingHelper.decorateStatus(item.status)
            ),
            createRowDataParam(
              'errors',
              item.errors ? 'Has Errors' : 'Has No Errors',
              false,
              1,
              1,
              false,
              undefined,
              item.errors ? reportingHelper.decorateErrors(item.errors) : []
            ),
            createRowDataParam(
              'warnings',
              item.warnings ? 'Has Warnings' : 'Has No Warnings',
              false,
              1,
              1,
              false,
              undefined,
              item.warnings ? reportingHelper.decorateErrors(item.warnings) : []
            ),
          ],
        })),
      ],
      rollbackFlags: flags.length > 0 ? flags : undefined,
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data);
    fs.writeFileSync(path.join(resultsDir, result.name.replace(/ /g, '_').replace(/\//g, '_') + '.html'), html);
  }

  private static generateReportForRelatedObject(
    result: RelatedObjectAssesmentInfo,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): void {
    this.generateReportForApex(result.apexAssessmentInfos, instanceUrl, orgDetails);
  }

  private static generateReportForApex(
    result: ApexAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): void {
    Logger.captureVerboseData('apex data', result);
    const data: ReportParam = {
      title: getMigrationHeading('Apex'),
      heading: getMigrationHeading('Apex'),
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toString(),
      total: result.length,
      filterGroups: [
        createFilterGroupParam(MessageService.getMessage('reportFilterGroupErrorsLabel'), 'warnings', [
          'Has Errors',
          'Has No Errors',
        ]),
      ],
      headerGroups: [
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
              name: MessageService.getMessage('reportMigrationTableHeaderError'),
              colspan: 1,
              rowspan: 1,
            },
          ],
        },
      ],
      rows: result.map((item) => ({
        rowId: `${this.rowClass}${this.rowId++}`,
        data: [
          createRowDataParam('name', item.name, true, 1, 1, false),
          createRowDataParam('path', item.name, false, 1, 1, true, item.path, item.name + '.cls'),
          createRowDataParam(
            'diff',
            item.name + 'diff',
            false,
            1,
            1,
            false,
            undefined,
            FileDiffUtil.getDiffHTML(item.diff, item.name)
          ),
          createRowDataParam(
            'infos',
            item.infos ? item.infos.join(', ') : '',
            false,
            1,
            1,
            false,
            undefined,
            item.infos
          ),
          createRowDataParam(
            'warnings',
            item.warnings ? 'Has Errors' : 'Has No Errors',
            false,
            1,
            1,
            false,
            undefined,
            item.warnings ? reportingHelper.decorateErrors(item.warnings) : []
          ),
        ],
      })),
      rollbackFlags: (orgDetails.rollbackFlags || []).includes('RollbackApexChanges')
        ? ['RollbackApexChanges']
        : undefined,
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data);
    fs.writeFileSync(path.join(resultsDir, apexFileName), html);

    // call generate html from template
  }

  private static generateMigrationReportDashboard(
    orgDetails: OmnistudioOrgDetails,
    results: MigratedObject[],
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo,
    actionItems: string[]
  ): void {
    const data: DashboardParam = {
      mode: 'migrate',
      title: MessageService.getMessage('reportMigrationDashboardHeading'),
      heading: MessageService.getMessage('reportMigrationDashboardHeading'),
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toString(),
      summaryItems: [
        ...results.map((result) => ({
          name: getMigrationHeading(result.name),
          total: result.data?.length || 0,
          data: this.getDifferentStatusDataForResult(result.data),
          file: result.name.replace(/ /g, '_').replace(/\//g, '_') + '.html',
        })),
        {
          name: getMigrationHeading('Apex'),
          total: relatedObjectMigrationResult.apexAssessmentInfos?.length || 0,
          data: this.getDifferentStatusDataForApex(relatedObjectMigrationResult.apexAssessmentInfos),
          file: apexFileName,
        },
      ],
      actionItems,
    };

    const dashboardTemplate = fs.readFileSync(dashboardTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(dashboardTemplate, data);
    fs.writeFileSync(path.join(resultsDir, 'dashboard.html'), html);
  }

  private static getDifferentStatusDataForResult(
    data: MigratedRecordInfo[]
  ): Array<{ name: string; count: number; cssClass: string }> {
    let complete = 0;
    let error = 0;
    let skip = 0;
    data.forEach((item) => {
      if (item.status === MessageService.getMessage('reportDashboardCardLabelCompleted')) complete++;
      if (item.status === MessageService.getMessage('reportDashboardCardLabelError')) error++;
      if (item.status === MessageService.getMessage('reportDashboardCardLabelSkipped')) skip++;
    });
    return [
      {
        name: MessageService.getMessage('reportDashboardCardLabelCompleted'),
        count: complete,
        cssClass: 'text-success',
      },
      { name: MessageService.getMessage('reportDashboardCardLabelError'), count: error, cssClass: 'text-error' },
      { name: MessageService.getMessage('reportDashboardCardLabelSkipped'), count: skip, cssClass: 'text-warning' },
    ];
  }

  private static getDifferentStatusDataForApex(
    data: ApexAssessmentInfo[]
  ): Array<{ name: string; count: number; cssClass: string }> {
    let complete = 0;
    let error = 0;
    data.forEach((item) => {
      if (!item.warnings || item.warnings.length === 0) complete++;
      else error++;
    });
    return [
      {
        name: MessageService.getMessage('reportDashboardCardLabelCompleted'),
        count: complete,
        cssClass: 'text-success',
      },
      { name: MessageService.getMessage('reportDashboardCardLabelError'), count: error, cssClass: 'text-error' },
    ];
  }
}
