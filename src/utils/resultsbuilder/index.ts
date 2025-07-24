import fs from 'fs';
import path from 'path';
import open from 'open';
import { Messages } from '@salesforce/core';
import { pushAssestUtilites } from '../file/fileUtil';
import {
  ApexAssessmentInfo,
  MigratedObject,
  MigratedRecordInfo,
  RelatedObjectAssesmentInfo,
  ExperienceSiteAssessmentInfo,
  FlexiPageAssessmentInfo,
} from '../interfaces';
import { ReportParam, SummaryItemDetailParam, DashboardParam } from '../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../orgUtils';
import { TemplateParser } from '../templateParser/generate';
import { createFilterGroupParam, createRowDataParam } from '../reportGenerator/reportUtil';
import { FileDiffUtil } from '../lwcparser/fileutils/FileDiffUtil';
import { Logger } from '../logger';
import { getMigrationHeading } from '../stringUtils';
import { reportingHelper } from './reportingHelper';
const resultsDir = path.join(process.cwd(), 'migration_report');
// const lwcConstants = { componentName: 'lwc', title: 'LWC Components Migration Result' };
const migrationReportHTMLfileName = 'dashboard.html';
const flexipageFileName = 'flexipage.html';
const templateDir = 'templates';
const reportTemplateName = 'migrationReport.template';
const dashboardTemplateName = 'dashboard.template';
const reportTemplateFilePath = path.join(__dirname, '..', '..', templateDir, reportTemplateName);
const dashboardTemplateFilePath = path.join(__dirname, '..', '..', templateDir, dashboardTemplateName);
const apexFileName = 'apex.html';
const experienceSiteFileName = 'experienceSite.html';

export class ResultsBuilder {
  private static rowClass = 'data-row-';
  private static rowId = 0;

  public static async generateReport(
    results: MigratedObject[],
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages,
    actionItems: string[]
  ): Promise<void> {
    fs.mkdirSync(resultsDir, { recursive: true });
    Logger.info(messages.getMessage('generatingComponentReports'));
    for (const result of results) {
      this.generateReportForResult(result, instanceUrl, orgDetails, messages);
    }
    Logger.info(messages.getMessage('generatingRelatedObjectReports'));
    this.generateReportForRelatedObject(relatedObjectMigrationResult, instanceUrl, orgDetails, messages);

    Logger.info(messages.getMessage('generatingMigrationReportDashboard'));
    this.generateMigrationReportDashboard(orgDetails, results, relatedObjectMigrationResult, messages, actionItems);
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
    } else if (componentName.includes('global auto number') || componentName.includes('globalautonumber')) {
      rollbackFlagNames = ['RollbackDRChanges', 'RollbackIPChanges'];
    }
    const rollbackFlags = orgDetails.rollbackFlags || [];
    const flags = rollbackFlagNames.filter((flag) => rollbackFlags.includes(flag));
    const data: ReportParam = {
      title: `${getMigrationHeading(result.name)} Migration Report`,
      heading: `${getMigrationHeading(result.name)} Migration Report`,
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toString(),
      total: result.data?.length || 0,
      filterGroups: [
        createFilterGroupParam('Filter By Status', 'status', ['Successfully Completed', 'Error', 'Skipped']),
      ],
      headerGroups: [
        {
          header: [
            {
              name: 'Managed Package',
              colspan: 2,
              rowspan: 1,
            },
            {
              name: 'Standard',
              colspan: 2,
              rowspan: 1,
            },
            {
              name: 'Status',
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
              name: 'ID',
              colspan: 1,
              rowspan: 1,
            },
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
              item.status === 'Complete' ? 'Successfully Completed' : item.status,
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
    this.generateReportForExperienceSites(result.experienceSiteAssessmentInfos, instanceUrl, orgDetails, messages);
    this.generateReportForFlexipage(result.flexipageAssessmentInfos, instanceUrl, orgDetails, messages);
  }

  private static generateReportForExperienceSites(
    result: ExperienceSiteAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages
  ): void {
    Logger.logVerbose('Generating experience site report');
    const data: ReportParam = {
      title: 'Experience Site',
      heading: 'Experience Site',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toString(),
      total: result.length,
      filterGroups: [createFilterGroupParam('Filter by Errors', 'warnings', ['Has Errors', 'Has No Errors'])],
      headerGroups: [
        {
          header: [
            {
              name: 'Component Name',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'File Reference',
              colspan: 1,
              rowspan: 1,
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
      ],
      rows: result.map((item) => ({
        rowId: `${this.rowClass}${this.rowId++}`,
        data: [
          createRowDataParam('name', item.name, true, 1, 1, false),
          createRowDataParam('path', item.path, false, 1, 1, false),
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
            item.warnings
          ),
        ],
      })),
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data, messages);
    Logger.logVerbose('Generating experience site file ' + experienceSiteFileName);
    fs.writeFileSync(path.join(resultsDir, experienceSiteFileName), html);
  }

  private static generateReportForFlexipage(
    result: FlexiPageAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages
  ): void {
    Logger.captureVerboseData('flexipage data', result);
    const data: ReportParam = {
      title: 'Flexipages',
      heading: 'Flexipages',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toString(),
      total: result.length,
      filterGroups: [createFilterGroupParam('Filter by Status', 'status', ['Complete', 'Failed'])],
      headerGroups: [
        {
          header: [
            {
              name: 'Flexipage Name',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'File Reference',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Status',
              colspan: 1,
              rowspan: 1,
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
          ],
        },
      ],
      rows: result.map((item) => ({
        rowId: `${this.rowClass}${this.rowId++}`,
        data: [
          createRowDataParam('name', item.name, true, 1, 1, false),
          createRowDataParam('path', item.path, false, 1, 1, false),
          createRowDataParam(
            'status',
            item.status,
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            item.status === 'Failed' ? 'text-error' : 'text-success'
          ),
          createRowDataParam('diff', '', false, 1, 1, false, undefined, FileDiffUtil.getDiffHTML(item.diff, item.name)),
          createRowDataParam('error', 'error', false, 1, 1, false, undefined, item.errors, 'text-error'),
        ],
      })),
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, flexipageFileName), html);
  }

  private static generateReportForApex(
    result: ApexAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages
  ): void {
    Logger.captureVerboseData('apex data', result);
    const data: ReportParam = {
      title: 'Apex File Migration Report',
      heading: 'Apex File Migration Report',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toString(),
      total: result.length,
      filterGroups: [createFilterGroupParam('Filter by Errors', 'warnings', ['Has Errors', 'Has No Errors'])],
      headerGroups: [
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
    const html = TemplateParser.generate(reportTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, apexFileName), html);

    // call generate html from template
  }

  private static generateMigrationReportDashboard(
    orgDetails: OmnistudioOrgDetails,
    results: MigratedObject[],
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo,
    messages: Messages,
    actionItems: string[]
  ): void {
    const data: DashboardParam = {
      title: 'Omnistudio Migration Report Dashboard',
      heading: 'Omnistudio Migration Report Dashboard',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toString(),
      summaryItems: [
        ...results.map((result) => ({
          name: `${getMigrationHeading(result.name)} Migration`,
          total: result.data?.length || 0,
          data: this.getDifferentStatusDataForResult(result.data),
          file: result.name.replace(/ /g, '_').replace(/\//g, '_') + '.html',
        })),
        {
          name: 'Apex File Migration',
          total: relatedObjectMigrationResult.apexAssessmentInfos?.length || 0,
          data: this.getDifferentStatusDataForApex(relatedObjectMigrationResult.apexAssessmentInfos),
          file: apexFileName,
        },
        {
          name: 'ExperienceSites',
          total: relatedObjectMigrationResult.experienceSiteAssessmentInfos?.length || 0,
          data: this.getDifferentStatusDataForApex(relatedObjectMigrationResult.experienceSiteAssessmentInfos), // TODO - NEED TO UPDATE
          file: experienceSiteFileName,
        },
        {
          name: 'Flexipage',
          total: relatedObjectMigrationResult.flexipageAssessmentInfos?.length || 0,
          data: this.getDifferentStatusDataForFlexipage(relatedObjectMigrationResult.flexipageAssessmentInfos),
          file: flexipageFileName,
        },
      ],
      actionItems,
      mode: 'migrate',
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
      { name: 'Successfully Completed', count: complete, cssClass: 'text-success' },
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
      { name: 'Successfully Completed', count: complete, cssClass: 'text-success' },
      { name: 'Error', count: error, cssClass: 'text-error' },
    ];
  }

  private static getDifferentStatusDataForFlexipage(data: FlexiPageAssessmentInfo[]): SummaryItemDetailParam[] {
    let completed = 0;
    let failed = 0;
    data.forEach((item) => {
      if (item.status === 'Complete') completed++;
      else failed++;
    });

    return [
      { name: 'Completed', count: completed, cssClass: 'text-success' },
      { name: 'Failed', count: failed, cssClass: 'text-error' },
    ];
  }
}
