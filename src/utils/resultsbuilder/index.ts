/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
import fs from 'fs';
import path from 'path';
import open from 'open';
import { Messages } from '@salesforce/core';
import { pushAssestUtilites } from '../file/fileUtil';
import {
  ApexAssessmentInfo,
  LWCAssessmentInfo,
  MigratedObject,
  MigratedRecordInfo,
  RelatedObjectAssesmentInfo,
  ExperienceSiteAssessmentInfo,
  FlexiPageAssessmentInfo,
  ExperienceSiteAssessmentPageInfo,
} from '../interfaces';
import {
  ReportParam,
  ReportRowParam,
  SummaryItemDetailParam,
  SummaryItemParam,
  DashboardParam,
  FilterGroupParam,
  ReportDataParam,
  ReportHeaderGroupParam,
} from '../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../orgUtils';
import { TemplateParser } from '../templateParser/generate';
import { createFilterGroupParam, createRowDataParam } from '../reportGenerator/reportUtil';
import { FileDiffUtil } from '../lwcparser/fileutils/FileDiffUtil';
import { Logger } from '../logger';
import { getMigrationHeading } from '../stringUtils';
import { Constants, Status } from '../constants/stringContants';
import { isStandardDataModel, isStandardDataModelWithMetadataAPIEnabled } from '../dataModelService';
import { CustomLabelMigrationInfo, CustomLabelMigrationReporter } from './CustomLabelMigrationReporter';

const resultsDir = path.join(process.cwd(), Constants.MigrationReportsFolderName);
const migrationReportHTMLfileName = 'dashboard.html';
const flexipageFileName = 'flexipage.html';
const templateDir = 'templates';
const reportTemplateName = 'migrationReport.template';
const dashboardTemplateName = 'dashboard.template';
const reportTemplateFilePath = path.join(__dirname, '..', '..', templateDir, reportTemplateName);
const dashboardTemplateFilePath = path.join(__dirname, '..', '..', templateDir, dashboardTemplateName);
const apexFileName = 'apex.html';
const experienceSiteFileName = 'experienceSite.html';
const lwcFileName = 'lwc.html';

export class ResultsBuilder {
  private static rowClass = 'data-row-';
  private static rowId = 0;
  private static experienceSiteFileSuffix = '.json';

  private static flexiPageFileSuffix = '.flexipage-meta.xml';

  private static successStatus = [Status.ReadyForMigration, Status.Complete, Status.SuccessfullyMigrated];
  private static errorStatus = [Status.Failed, Status.NeedsManualIntervention];

  /** Set at report generation start; used to show "Manual deployment needed" when deployment failed */
  private static deploymentFailed = false;

  public static async generateReport(
    results: MigratedObject[],
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    actionItems: string[],
    objectsToProcess: string[],
    migrateOnly: string,
    deploymentFailed = false
  ): Promise<void> {
    ResultsBuilder.deploymentFailed = deploymentFailed;

    fs.mkdirSync(resultsDir, { recursive: true });
    Logger.info(messages.getMessage('generatingComponentReports'));
    for (const result of results) {
      this.generateReportForResult(result, instanceUrl, orgDetails, messages);
    }
    Logger.info(messages.getMessage('generatingRelatedObjectReports'));
    this.generateReportForRelatedObject(
      relatedObjectMigrationResult,
      instanceUrl,
      orgDetails,
      messages,
      objectsToProcess
    );

    Logger.info(messages.getMessage('generatingMigrationReportDashboard'));
    this.generateMigrationReportDashboard(
      orgDetails,
      results,
      relatedObjectMigrationResult,
      messages,
      actionItems,
      objectsToProcess,
      migrateOnly
    );
    pushAssestUtilites('javascripts', resultsDir);
    pushAssestUtilites('styles', resultsDir);
    await open(path.join(resultsDir, migrationReportHTMLfileName));
  }

  private static generateReportForResult(
    result: MigratedObject,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages<string>
  ): void {
    Logger.captureVerboseData(`${result.name} data`, result);

    // Handle Custom Labels migration specifically
    if (result.name.toLowerCase().includes('custom labels')) {
      this.generateCustomLabelsMigrationReport(result, instanceUrl, orgDetails, messages);
      return;
    }

    // Determine which rollback flag to use based on component type
    let rollbackFlagNames: string[] = [];
    const componentName = result.name.toLowerCase();
    const isGlobalAutoNumber =
      componentName.includes('global auto number') || componentName.includes('globalautonumber');

    if (componentName.includes('datamapper') || componentName.includes('data mapper')) {
      rollbackFlagNames = ['RollbackDRChanges'];
    } else if (componentName.includes('omniscript') || componentName.includes('integration procedure')) {
      rollbackFlagNames = ['RollbackOSChanges', 'RollbackIPChanges'];
    } else if (isGlobalAutoNumber) {
      rollbackFlagNames = ['RollbackDRChanges', 'RollbackIPChanges'];
    }
    const rollbackFlags = orgDetails.rollbackFlags || [];
    const flags = rollbackFlagNames.filter((flag) => rollbackFlags.includes(flag));

    // Common report fields
    const baseData: ReportParam = {
      title: `${getMigrationHeading(result.name)} Migration Report`,
      heading: `${getMigrationHeading(result.name)} Migration Report`,
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toLocaleString(),
      total: 0,
      filterGroups: [],
      headerGroups: [],
      rows: [],
    };

    // If Global Auto Number and foundation package, skip document creation as feature is not supported
    if (isGlobalAutoNumber && orgDetails.isFoundationPackage) {
      return;
    }

    const data: ReportParam = {
      ...baseData,
      total: result.data?.length || 0,
      filterGroups: [...this.getStatusFilterGroup(result.data?.map((item) => item.status) || [])],
      headerGroups: [...this.getHeaderGroupsForReport(componentName, isGlobalAutoNumber)],
      rows: [
        ...(result.data || []).map((item) => ({
          rowId: `${this.rowClass}${this.rowId++}`,
          data: [
            createRowDataParam('id', item.id, false, 1, 1, true, `${instanceUrl}/${item.id}`),
            createRowDataParam('name', item.name, true, 1, 1, false),
            // Include migratedId for custom data model OR Global Auto Number
            ...(isStandardDataModel() && !isGlobalAutoNumber
              ? []
              : [
                  createRowDataParam(
                    'migratedId',
                    item.migratedId,
                    false,
                    1,
                    1,
                    true,
                    `${instanceUrl}/${item.migratedId}`
                  ),
                ]),
            createRowDataParam('migratedName', item.migratedName, false, 1, 1, false),
            createRowDataParam(
              'status',
              item.status,
              false,
              1,
              1,
              false,
              undefined,
              undefined,
              item.status === Status.SuccessfullyMigrated ? 'text-success' : 'text-error'
            ),
            createRowDataParam(
              'errors',
              item.errors ? Status.Failed : 'Has No Errors',
              false,
              1,
              1,
              false,
              undefined,
              item.errors || []
            ),
            createRowDataParam(
              'summary',
              item.warnings ? 'Warnings' : 'Has No Warnings',
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

  private static getHeaderGroupsForReport(
    componentName: string,
    isGlobalAutoNumber: boolean
  ): ReportHeaderGroupParam[] {
    const firstRowHeaders = [
      ...this.getNameHeaders(componentName, isGlobalAutoNumber),
      { name: 'Status', colspan: 1, rowspan: 2 },
      { name: 'Errors', colspan: 1, rowspan: 2 },
      { name: 'Summary', colspan: 1, rowspan: 2 },
    ];

    const nameLabel = isStandardDataModel() ? 'Updated Name' : 'Name';

    const secondRowHeadersForCustom = [
      { name: 'ID', colspan: 1, rowspan: 1 },
      { name: 'Name', colspan: 1, rowspan: 1 },
      { name: 'ID', colspan: 1, rowspan: 1 },
      { name: nameLabel, colspan: 1, rowspan: 1 },
    ];

    const secondRowHeadersForStandard = [
      { name: 'ID', colspan: 1, rowspan: 1 },
      { name: 'Name', colspan: 1, rowspan: 1 },
      { name: nameLabel, colspan: 1, rowspan: 1 },
    ];

    // Global Auto Number always needs 4 columns (Managed Package + Standard), even in standard data model
    if (isStandardDataModel() && !isGlobalAutoNumber) {
      return [{ header: firstRowHeaders }, { header: secondRowHeadersForStandard }];
    } else {
      return [{ header: firstRowHeaders }, { header: secondRowHeadersForCustom }];
    }
  }

  private static getNameHeaders(
    componentName: string,
    isGlobalAutoNumber: boolean
  ): Array<{ name: string; colspan: number; rowspan: number }> {
    if (isStandardDataModel() && !isGlobalAutoNumber) {
      return [{ name: 'Standard', colspan: 3, rowspan: 1 }];
    } else {
      return [
        { name: 'Managed Package', colspan: 2, rowspan: 1 },
        { name: 'Standard', colspan: 2, rowspan: 1 },
      ];
    }
  }

  private static generateCustomLabelsMigrationReport(
    result: MigratedObject,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages<string>
  ): void {
    Logger.captureVerboseData(`${result.name} data`, result);

    // Convert migration results to CustomLabelMigrationInfo format
    const customLabelMigrationInfos: CustomLabelMigrationInfo[] = [];

    if (result.data) {
      result.data.forEach((record: any) => {
        // Handle both old and new data formats
        const labelName = record.name || record.labelName;
        const cloneStatus =
          record.status === Status.Complete
            ? 'created'
            : record.status === 'Error'
            ? 'error'
            : record.status === Status.Skipped
            ? 'duplicate'
            : record.status || 'duplicate';
        const message = record.message || '';
        const coreInfo = record.coreInfo || { id: '', value: '' };
        const packageInfo = record.packageInfo || { id: '', value: '' };
        const errors = record.errors || [];
        const warnings = record.warnings || [];

        customLabelMigrationInfos.push({
          labelName,
          cloneStatus,
          message,
          coreInfo,
          packageInfo,
          errors,
          warnings,
        });
      });
    }

    const pageSize = 1000; // Smaller page size for better performance
    const totalLabels = customLabelMigrationInfos.length;
    const totalPages = Math.max(1, Math.ceil(totalLabels / pageSize));

    Logger.logVerbose(messages.getMessage('generatingCustomLabelsReport', [totalLabels, totalPages, pageSize]));

    // Generate paginated reports
    for (let page = 1; page <= totalPages; page++) {
      const data = CustomLabelMigrationReporter.getCustomLabelMigrationData(
        customLabelMigrationInfos,
        instanceUrl,
        orgDetails,
        page,
        pageSize
      );

      const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');

      // Replace the pagination section with custom generated HTML
      const customPaginationHtml = CustomLabelMigrationReporter.generateCustomTemplateForPage(page, totalPages);
      const modifiedTemplate = reportTemplate.replace(
        /<!-- Pagination Navigation -->[\s\S]*?<\/div>\s*<\/div>\s*<\/c:if>/,
        customPaginationHtml
      );

      const html = TemplateParser.generate(modifiedTemplate, data, messages);

      const fileName = totalPages > 1 ? `Custom_Labels_Page_${page}_of_${totalPages}.html` : 'Custom_Labels.html';
      fs.writeFileSync(path.join(resultsDir, fileName), html);

      Logger.logVerbose(messages.getMessage('generatedCustomLabelsReportPage', [page, totalPages, data.rows.length]));
    }
  }

  private static generateReportForRelatedObject(
    result: RelatedObjectAssesmentInfo,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    objectsToProcess: string[]
  ): void {
    if (objectsToProcess.includes(Constants.Apex)) {
      this.generateReportForApex(result.apexAssessmentInfos, instanceUrl, orgDetails, messages);
    }
    if (objectsToProcess.includes(Constants.ExpSites)) {
      this.generateReportForExperienceSites(result.experienceSiteAssessmentInfos, instanceUrl, orgDetails, messages);
    }
    if (objectsToProcess.includes(Constants.FlexiPage)) {
      this.generateReportForFlexipage(result.flexipageAssessmentInfos, instanceUrl, orgDetails, messages);
    }
    if (objectsToProcess.includes(Constants.LWC)) {
      this.generateReportForLwc(result.lwcAssessmentInfos, instanceUrl, orgDetails, messages);
    }
  }

  private static generateReportForExperienceSites(
    result: ExperienceSiteAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages<string>
  ): void {
    Logger.logVerbose('Generating experience site report');
    const data: ReportParam = {
      title: 'Experience Cloud Site Pages Migration Report',
      heading: 'Experience Cloud Site Pages Migration Report',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toLocaleString(),
      total: result.length,
      filterGroups: [
        ...this.getStatusFilterGroup(
          result.flatMap((item) =>
            item.experienceSiteAssessmentPageInfos.map((page) => this.resolveDisplayStatus(page.status, messages))
          )
        ),
      ],
      headerGroups: [
        {
          header: [
            {
              name: 'Experience Cloud Site Name',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Page Name',
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
              name: 'Differences',
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
      rows: this.getRowsForExperienceSites(result, messages),
      props: JSON.stringify({
        recordName: 'Pages',
        rowBased: true,
        rowCount: true,
      }),
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
    messages: Messages<string>
  ): void {
    Logger.captureVerboseData('flexipage data', result);
    const data: ReportParam = {
      title: 'FlexiPages Migration Report',
      heading: 'FlexiPages Migration Report',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toLocaleString(),
      total: result.length,
      filterGroups: [
        ...this.getStatusFilterGroup(result.map((item) => this.resolveDisplayStatus(item.status, messages))),
      ],
      headerGroups: [
        {
          header: [
            {
              name: 'FlexiPage Name',
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
          createRowDataParam(
            'name',
            item.name.substring(0, item.name.length - this.flexiPageFileSuffix.length),
            true,
            1,
            1,
            false
          ),
          createRowDataParam('path', item.name, false, 1, 1, true, item.path),
          createRowDataParam(
            'status',
            this.resolveDisplayStatus(item.status, messages),
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            this.resolveStatusClass(item.status)
          ),
          createRowDataParam(
            'diff',
            '',
            false,
            1,
            1,
            false,
            undefined,
            FileDiffUtil.getDiffHTML(item.diff, item.name),
            'diff-cell'
          ),
          createRowDataParam('error', 'error', false, 1, 1, false, undefined, item.errors),
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
    messages: Messages<string>
  ): void {
    Logger.captureVerboseData('apex data', result);
    const data: ReportParam = {
      title: 'Apex Classes Migration Report',
      heading: 'Apex Classes Migration Report',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toLocaleString(),
      total: result.length,
      filterGroups: [
        createFilterGroupParam('Filter by Errors', 'warnings', [Status.Failed, Status.SuccessfullyCompleted]),
      ],
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
            'status',
            item.status,
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            this.successStatus.includes(item.status)
              ? 'text-success'
              : this.errorStatus.includes(item.status)
              ? 'text-error'
              : 'text-warning'
          ),
          createRowDataParam(
            'diff',
            item.name + 'diff',
            false,
            1,
            1,
            false,
            undefined,
            FileDiffUtil.getDiffHTML(item.diff, item.name),
            'diff-cell'
          ),
          createRowDataParam('infos', item.infos ? item.infos.join(', ') : '', false, 1, 1, false, undefined, [
            ...item.infos,
            ...item.warnings,
          ]),
          createRowDataParam(
            'warnings',
            item.errors.length > 0 ? Status.Failed : Status.SuccessfullyCompleted,
            false,
            1,
            1,
            false,
            undefined,
            item.errors
          ),
        ],
      })),
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, apexFileName), html);

    // call generate html from template
  }

  private static generateReportForLwc(
    result: LWCAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages<string>
  ): void {
    Logger.captureVerboseData('lwc data', result);
    const data: ReportParam = {
      title: 'Lightning Web Components Migration Report',
      heading: 'Lightning Web Components Migration Report',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toLocaleString(),
      total: result.length,
      filterGroups: [
        ...this.getStatusFilterGroup(
          result.flatMap((item) => this.resolveDisplayStatus(this.getStatusFromErrors(item.errors), messages))
        ),
      ],
      headerGroups: [
        {
          header: [
            {
              name: 'Name',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Status',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'File Reference',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'File Diff',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Migration Status',
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
      rows: this.getLwcRowsForReport(result, messages),
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, lwcFileName), html);
  }

  private static getLwcRowsForReport(
    lwcAssessmentInfos: LWCAssessmentInfo[],
    messages: Messages<string>
  ): ReportRowParam[] {
    const rows: ReportRowParam[] = [];

    for (const lwcAssessmentInfo of lwcAssessmentInfos) {
      let showCommon = true;
      const rid = `${this.rowClass}${this.rowId++}`;
      const commonRowSpan = Math.max(1, lwcAssessmentInfo.changeInfos.length);
      const actualStatus = this.getStatusFromErrors(lwcAssessmentInfo.errors);
      const displayStatus = this.resolveDisplayStatus(actualStatus, messages);
      const statusClass = this.resolveStatusClass(actualStatus);
      for (const fileChangeInfo of lwcAssessmentInfo.changeInfos) {
        rows.push({
          rowId: rid,
          data: [
            ...(showCommon
              ? [
                  createRowDataParam('name', lwcAssessmentInfo.name, true, commonRowSpan, 1, false),
                  createRowDataParam(
                    'status',
                    displayStatus,
                    false,
                    commonRowSpan,
                    1,
                    false,
                    undefined,
                    undefined,
                    statusClass
                  ),
                ]
              : []),
            createRowDataParam(
              'fileReference',
              fileChangeInfo.name,
              false,
              1,
              1,
              true,
              fileChangeInfo.path,
              fileChangeInfo.name,
              'normal-td-padding'
            ),
            createRowDataParam(
              'diff',
              fileChangeInfo.name + 'diff',
              false,
              1,
              1,
              false,
              undefined,
              FileDiffUtil.getDiffHTML(fileChangeInfo.diff, fileChangeInfo.name),
              'diff-cell'
            ),
            ...(showCommon
              ? [
                  createRowDataParam(
                    'comments',
                    lwcAssessmentInfo.warnings && lwcAssessmentInfo.warnings.length > 0
                      ? Status.Failed
                      : Status.SuccessfullyCompleted,
                    false,
                    commonRowSpan,
                    1,
                    false,
                    undefined,
                    lwcAssessmentInfo.warnings || []
                  ),
                  createRowDataParam(
                    'errors',
                    lwcAssessmentInfo.errors ? lwcAssessmentInfo.errors.join(', ') : '',
                    false,
                    commonRowSpan,
                    1,
                    false,
                    undefined,
                    lwcAssessmentInfo.errors || []
                  ),
                ]
              : []),
          ],
        });
        showCommon = false;
      }
    }

    return rows;
  }

  // Related object summary item creation helper methods
  private static createApexMigrationSummaryItem(
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo
  ): SummaryItemParam {
    return {
      name: 'Apex Classes',
      total: relatedObjectMigrationResult.apexAssessmentInfos?.length || 0,
      data: this.getDifferentStatusDataForApex(relatedObjectMigrationResult.apexAssessmentInfos),
      file: apexFileName,
    };
  }

  private static createExperienceSiteMigrationSummaryItem(
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo
  ): SummaryItemParam {
    return {
      name: 'Experience Cloud Sites',
      total:
        relatedObjectMigrationResult.experienceSiteAssessmentInfos?.flatMap(
          (item) => item.experienceSiteAssessmentPageInfos
        ).length || 0,
      data: this.getDifferentStatusDataForExperienceSites(relatedObjectMigrationResult.experienceSiteAssessmentInfos),
      file: experienceSiteFileName,
    };
  }

  private static createFlexipageMigrationSummaryItem(
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo
  ): SummaryItemParam {
    return {
      name: 'FlexiPages',
      total: relatedObjectMigrationResult.flexipageAssessmentInfos?.length || 0,
      data: this.getDifferentStatusDataForFlexipage(relatedObjectMigrationResult.flexipageAssessmentInfos),
      file: flexipageFileName,
    };
  }

  private static createLWCMigrationSummaryItem(
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo
  ): SummaryItemParam {
    return {
      name: 'Lightning Web Components',
      total: relatedObjectMigrationResult.lwcAssessmentInfos?.length || 0,
      data: this.getDifferentStatusDataForLwc(relatedObjectMigrationResult.lwcAssessmentInfos),
      file: lwcFileName,
    };
  }

  private static generateMigrationReportDashboard(
    orgDetails: OmnistudioOrgDetails,
    results: MigratedObject[],
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo,
    messages: Messages<string>,
    actionItems: string[],
    objectsToProcess: string[],
    migrateOnly: string
  ): void {
    const relatedObjectSummaryItems: SummaryItemParam[] = [];

    if (objectsToProcess.includes(Constants.Apex)) {
      relatedObjectSummaryItems.push(this.createApexMigrationSummaryItem(relatedObjectMigrationResult));
    }
    if (objectsToProcess.includes(Constants.ExpSites)) {
      relatedObjectSummaryItems.push(this.createExperienceSiteMigrationSummaryItem(relatedObjectMigrationResult));
    }
    if (objectsToProcess.includes(Constants.FlexiPage)) {
      relatedObjectSummaryItems.push(this.createFlexipageMigrationSummaryItem(relatedObjectMigrationResult));
    }
    if (objectsToProcess.includes(Constants.LWC)) {
      relatedObjectSummaryItems.push(this.createLWCMigrationSummaryItem(relatedObjectMigrationResult));
    }

    const data: DashboardParam = {
      title: 'Omnistudio Migration Report Dashboard',
      heading: 'Omnistudio Migration Report Dashboard',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toLocaleString(),
      summaryItems: [
        ...results
          .filter((result) => {
            // When metadata API is enabled and not migrateOnly, exclude OmniStudio components as we dont need to process them
            if (isStandardDataModelWithMetadataAPIEnabled() && !migrateOnly) {
              const componentName = result.name.toLowerCase();
              // Only include Custom Labels and Global Auto Numbers
              return (
                componentName.includes('custom labels') ||
                componentName.includes('global auto number') ||
                componentName.includes('globalautonumber')
              );
            }
            // Include all items in other cases
            return true;
          })
          .map((result) => {
            // Handle custom labels specially for pagination and status calculation
            if (result.name.toLowerCase().includes('custom labels')) {
              const totalLabels = result.totalCount || result.data?.length || 0;
              // Use actual processed records for file naming, not total count
              const processedRecords = result.data?.length || 0;
              const totalPages = Math.max(1, Math.ceil(processedRecords / 1000));
              const fileName = totalPages > 1 ? `Custom_Labels_Page_1_of_${totalPages}.html` : 'Custom_Labels.html';

              return {
                name: result.name,
                total: totalLabels,
                data: this.getCustomLabelStatusData(result.data, result.totalCount),
                file: fileName,
              };
            }

            // Handle Global Auto Numbers in foundation package (not supported)
            const isGlobalAutoNumber =
              result.name.toLowerCase().includes('global auto number') ||
              result.name.toLowerCase().includes('globalautonumber');
            if (isGlobalAutoNumber) {
              if (orgDetails.isFoundationPackage) {
                return this.createSpecialCaseMigrationSummaryItem(
                  result,
                  messages.getMessage('globalAutoNumberUnSupportedInOmnistudioPackage')
                ); // Foundation Package does not have the custom global auto number entity
              } else {
                return this.createMigrationSummaryItem(result);
              }
            }

            // Handle metadata API enabled with migrateOnly
            if (isStandardDataModelWithMetadataAPIEnabled() && migrateOnly) {
              return this.createSpecialCaseMigrationSummaryItem(result, messages.getMessage('processingNotRequired'));
            }

            // Default case
            return this.createMigrationSummaryItem(result);
          }),
        ...relatedObjectSummaryItems,
      ],
      actionItems,
      mode: 'migrate',
    };

    const dashboardTemplate = fs.readFileSync(dashboardTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(dashboardTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, 'dashboard.html'), html);
  }

  private static createSpecialCaseMigrationSummaryItem(
    result: MigratedObject,
    customMessage: string
  ): SummaryItemParam {
    return {
      name: `${getMigrationHeading(result.name)}`,
      total: 0,
      data: [{ name: customMessage, count: 0, cssClass: 'text-warning' }],
      file: result.name.replace(/ /g, '_').replace(/\//g, '_') + '.html',
      showDetails: false,
    };
  }

  private static createMigrationSummaryItem(result: MigratedObject): SummaryItemParam {
    return {
      name: `${getMigrationHeading(result.name)}`,
      total: result.data?.length || 0,
      data: this.getDifferentStatusDataForResult(result.data),
      file: result.name.replace(/ /g, '_').replace(/\//g, '_') + '.html',
    };
  }

  private static getDifferentStatusDataForResult(
    data: MigratedRecordInfo[]
  ): Array<{ name: string; count: number; cssClass: string }> {
    let complete = 0;
    let error = 0;
    let skip = 0;
    data.forEach((item) => {
      if (item.status === Status.SuccessfullyMigrated) complete++;
      if (item.status === Status.Failed) error++;
      if (item.status === Status.Skipped) skip++;
    });
    return [
      { name: Status.SuccessfullyMigrated, count: complete, cssClass: 'text-success' },
      { name: Status.Skipped, count: skip, cssClass: 'text-error' },
      { name: Status.Failed, count: error, cssClass: 'text-error' },
    ];
  }

  private static getCustomLabelStatusData(
    data: MigratedRecordInfo[],
    totalCount?: number
  ): Array<{ name: string; count: number; cssClass: string }> {
    // For custom labels, we need to calculate based on the total from API response
    // The data only contains error and duplicate (where message is not "same value")
    // So we need to calculate the actual counts from the migration tool

    let error = 0;
    let duplicate = 0;

    data.forEach((item) => {
      // Handle both old and new status formats
      const status = item.status || (item as any).cloneStatus;
      if (status === 'error' || status === 'Error' || status === Status.Failed) error++;
      else if (status === 'duplicate' || status === Status.Skipped) duplicate++;
    });

    // Use totalCount if provided, otherwise fall back to data length
    const actualTotal = totalCount || data.length;
    const successfullyMigrated = Math.max(0, actualTotal - error - duplicate);

    return [
      { name: Status.SuccessfullyMigrated, count: successfullyMigrated, cssClass: 'text-success' },
      { name: Status.Failed, count: error, cssClass: 'text-error' },
      { name: Status.Skipped, count: duplicate, cssClass: 'text-warning' },
    ];
  }

  private static getDifferentStatusDataForApex(
    data: ApexAssessmentInfo[]
  ): Array<{ name: string; count: number; cssClass: string }> {
    let complete = 0;
    let error = 0;
    data.forEach((item: ApexAssessmentInfo) => {
      if (this.successStatus.includes(item.status)) complete++;
      else error++;
    });
    return [
      { name: Status.SuccessfullyMigrated, count: complete, cssClass: 'text-success' },
      { name: Status.Skipped, count: 0, cssClass: 'text-error' },
      { name: Status.Failed, count: error, cssClass: 'text-error' },
    ];
  }

  private static buildStatusSummary(counts: {
    completed: number;
    manualDeploymentNeeded: number;
    skipped: number;
    failed: number;
  }): SummaryItemDetailParam[] {
    const result: SummaryItemDetailParam[] = [
      { name: Status.SuccessfullyMigrated, count: counts.completed, cssClass: 'text-success' },
    ];
    if (counts.manualDeploymentNeeded > 0) {
      result.push({
        name: Status.ManualDeploymentNeeded,
        count: counts.manualDeploymentNeeded,
        cssClass: 'text-error',
      });
    }
    result.push({ name: Status.Skipped, count: counts.skipped, cssClass: 'text-error' });
    result.push({ name: Status.Failed, count: counts.failed, cssClass: 'text-error' });
    return result;
  }

  private static countStatusesFromItems(statuses: string[]): {
    completed: number;
    manualDeploymentNeeded: number;
    skipped: number;
    failed: number;
  } {
    let completed = 0;
    let manualDeploymentNeeded = 0;
    let skipped = 0;
    let failed = 0;
    for (const status of statuses) {
      if (this.isManualDeploymentNeeded(status)) {
        manualDeploymentNeeded++;
      } else if (status === Status.SuccessfullyMigrated) {
        completed++;
      } else if (status === Status.Skipped) {
        skipped++;
      } else {
        failed++;
      }
    }
    return { completed, manualDeploymentNeeded, skipped, failed };
  }

  private static getDifferentStatusDataForFlexipage(data: FlexiPageAssessmentInfo[]): SummaryItemDetailParam[] {
    return this.buildStatusSummary(this.countStatusesFromItems(data.map((item) => item.status)));
  }

  private static getDifferentStatusDataForLwc(data: LWCAssessmentInfo[]): SummaryItemDetailParam[] {
    return this.buildStatusSummary(
      this.countStatusesFromItems(data.map((item) => this.getStatusFromErrors(item.errors)))
    );
  }

  private static getDifferentStatusDataForExperienceSites(
    data: ExperienceSiteAssessmentInfo[]
  ): SummaryItemDetailParam[] {
    const statuses = data.flatMap((item) => item.experienceSiteAssessmentPageInfos.map((page) => page.status));
    return this.buildStatusSummary(this.countStatusesFromItems(statuses));
  }

  private static getStatusFilterGroup(statuses: string[]): FilterGroupParam[] {
    const statusSet = new Set(statuses);
    if (statusSet.size === 0) return [];
    return [createFilterGroupParam('Filter by Status', 'status', Array.from(statusSet))];
  }

  private static getStatusFromErrors(errors: string[]): string {
    if (errors && errors.length > 0) return Status.Failed;
    return Status.SuccessfullyMigrated;
  }

  /** True when deployment failed but the component was successfully processed locally. */
  private static isManualDeploymentNeeded(status: string): boolean {
    return this.deploymentFailed && status === Status.SuccessfullyMigrated;
  }

  /** Returns display status — "Manual deployment needed" when deployment failed, original status otherwise. */
  private static resolveDisplayStatus(status: string, messages: Messages<string>): string {
    return this.isManualDeploymentNeeded(status) ? messages.getMessage('manualDeploymentNeeded') : status;
  }

  /** Returns CSS class — error for manual deployment needed, success/error otherwise. */
  private static resolveStatusClass(status: string): string {
    if (this.isManualDeploymentNeeded(status)) return 'text-error';
    return status === Status.SuccessfullyMigrated ? 'text-success' : 'text-error';
  }

  private static getRowsForExperienceSites(
    result: ExperienceSiteAssessmentInfo[],
    messages: Messages<string>
  ): ReportRowParam[] {
    const rows: ReportRowParam[] = [];

    result.forEach((item) => {
      const rId = `${this.rowClass}${this.rowId++}`;
      let showBundleName = true;
      item.experienceSiteAssessmentPageInfos.forEach((page) => {
        rows.push({
          rowId: rId,
          data: this.getRowDataForExperienceSites(page, item, showBundleName, messages),
        });
        showBundleName = false;
      });
    });

    return rows;
  }

  private static getRowDataForExperienceSites(
    page: ExperienceSiteAssessmentPageInfo,
    item: ExperienceSiteAssessmentInfo,
    showBundleName: boolean,
    messages: Messages<string>
  ): ReportDataParam[] {
    const displayStatus = this.resolveDisplayStatus(page.status, messages);
    const statusClass = this.resolveStatusClass(page.status);
    return [
      createRowDataParam(
        'name',
        item.experienceBundleName,
        true,
        item.experienceSiteAssessmentPageInfos.length,
        1,
        false,
        undefined,
        undefined,
        showBundleName ? '' : 'no-display'
      ),
      createRowDataParam('pageName', page.name, false, 1, 1, false, undefined, undefined),
      createRowDataParam('path', page.name + this.experienceSiteFileSuffix, false, 1, 1, true, page.path),
      createRowDataParam('status', displayStatus, false, 1, 1, false, undefined, undefined, statusClass),
      createRowDataParam(
        'diff',
        page.name + 'diff',
        false,
        1,
        1,
        false,
        undefined,
        FileDiffUtil.getDiffHTML(page.diff, page.name),
        'diff-cell'
      ),
      createRowDataParam('errors', page.errors ? page.errors.join(', ') : '', false, 1, 1, false, undefined, [
        ...(page.errors || []),
        ...(page.warnings || []),
      ]),
    ];
  }
}
