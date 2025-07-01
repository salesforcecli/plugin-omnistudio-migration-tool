import fs from 'fs';
import path from 'path';
import open from 'open';
import { Messages } from '@salesforce/core';
import { pushAssestUtilites } from '../file/fileUtil';
import { ApexAssessmentInfo, MigratedObject, MigratedRecordInfo, RelatedObjectAssesmentInfo } from '../interfaces';
import { ReportParam } from '../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../orgUtils';
import { TemplateParser } from '../templateParser/generate';
import { createFilterGroupParam, createRowDataParam } from '../reportGenerator/reportUtil';
import { Logger } from '../logger';

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
    messages: Messages
  ): Promise<void> {
    fs.mkdirSync(resultsDir, { recursive: true });
    Logger.info(messages.getMessage('generatingComponentReports'));
    for (const result of results) {
      this.generateReportForResult(result, instanceUrl, orgDetails, messages);
    }
    Logger.info(messages.getMessage('generatingRelatedObjectReports'));
    this.generateReportForRelatedObject(relatedObjectMigrationResult, instanceUrl, orgDetails, messages);

    Logger.info(messages.getMessage('generatingMigrationReportDashboard'));
    this.generateMigrationReportDashboard(orgDetails, results, relatedObjectMigrationResult, messages);
    pushAssestUtilites('javascripts', resultsDir);
    pushAssestUtilites('styles', resultsDir);
    await open(path.join(resultsDir, migrationReportHTMLfileName));
  }

  private static generateReportForResult(
    result: MigratedObject,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages
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
      title: result.name,
      heading: result.name,
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toString(),
      total: result.data?.length || 0,
      filterGroups: [createFilterGroupParam('Filter By Migration Status', 'status', ['Complete', 'Error', 'Skipped'])],
      headerGroups: [
        {
          header: [
            {
              name: 'In Package',
              colspan: 2,
              rowspan: 1,
            },
            {
              name: 'In Core',
              colspan: 2,
              rowspan: 1,
            },
            {
              name: 'Migration Status',
              colspan: 1,
              rowspan: 2,
            },
            {
              name: 'Errors',
              colspan: 1,
              rowspan: 2,
            },
            {
              name: 'Warnings',
              colspan: 1,
              rowspan: 2,
            },
          ],
        },
        {
          header: [
            {
              name: 'Record ID',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Record Name',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Record ID',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Record Name',
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
            createRowDataParam('status', item.status, false, 1, 1, false),
            createRowDataParam(
              'errors',
              item.errors ? 'Has Errors' : 'Has No Errors',
              false,
              1,
              1,
              false,
              undefined,
              item.errors
            ),
            createRowDataParam(
              'warnings',
              item.warnings ? 'Has Warnings' : 'Has No Warnings',
              false,
              1,
              1,
              false,
              undefined,
              item.warnings || []
            ),
          ],
        })),
      ],
      rollbackFlags: flags.length > 0 ? flags : undefined,
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, result.name.replace(/ /g, '_').replace(/\//g, '_') + '.html'), html);
  }

  private static generateReportForRelatedObject(
    result: RelatedObjectAssesmentInfo,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages
  ): void {
    this.generateReportForApex(result.apexAssessmentInfos, instanceUrl, orgDetails, messages);
  }

  private static generateReportForApex(
    result: ApexAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages
  ): void {
    Logger.captureVerboseData('apex data', result);
    const data: ReportParam = {
      title: 'Apex Classes',
      heading: 'Apex Classes',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toString(),
      total: result.length,
      filterGroups: [createFilterGroupParam('Filter by Errors', 'errors', ['Has Errors', 'Has No Errors'])],
      headerGroups: [
        {
          header: [
            {
              name: 'Class Name',
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
      ],
      rows: result.map((item) => ({
        rowId: `${this.rowClass}${this.rowId++}`,
        data: [
          createRowDataParam('name', item.name, true, 1, 1, false),
          createRowDataParam('path', item.path, false, 1, 1, false),
          createRowDataParam('diff', item.diff, false, 1, 1, false),
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
            item.warnings
          ),
        ],
      })),
      rollbackFlags: (orgDetails.rollbackFlags || []).includes('RollbackApexChanges')
        ? ['RollbackApexChanges']
        : undefined,
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, apexFileName), html);

    // call generate html from template
  }

  private static generateMigrationReportDashboard(
    orgDetails: OmnistudioOrgDetails,
    results: MigratedObject[],
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo,
    messages: Messages
  ): void {
    const data = {
      title: 'Migration Report Dashboard',
      heading: 'Migration Report Dashboard',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toString(),
      summaryItems: [
        ...results.map((result) => ({
          name: result.name,
          total: result.data?.length || 0,
          data: this.getDifferentStatusDataForResult(result.data),
          file: result.name.replace(/ /g, '_').replace(/\//g, '_') + '.html',
        })),
        {
          name: 'Apex Classes',
          total: relatedObjectMigrationResult.apexAssessmentInfos?.length || 0,
          data: this.getDifferentStatusDataForApex(relatedObjectMigrationResult.apexAssessmentInfos),
          file: apexFileName,
        },
      ],
    };

    const dashboardTemplate = fs.readFileSync(dashboardTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(dashboardTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, 'dashboard.html'), html);
  }

  private static getDifferentStatusDataForResult(
    data: MigratedRecordInfo[]
  ): Array<{ name: string; count: number; cssClass: string }> {
    let complete = 0;
    let error = 0;
    let skip = 0;
    data.forEach((item) => {
      if (item.status === 'Complete') complete++;
      if (item.status === 'Error') error++;
      if (item.status === 'Skipped') skip++;
    });
    return [
      { name: 'Completed without errors', count: complete, cssClass: 'text-success' },
      { name: 'Error', count: error, cssClass: 'text-error' },
      { name: 'Skipped', count: skip, cssClass: 'text-warning' },
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
      { name: 'Completed without errors', count: complete, cssClass: 'text-success' },
      { name: 'Error', count: error, cssClass: 'text-error' },
    ];
  }
}
