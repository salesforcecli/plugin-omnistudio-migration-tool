import fs from 'fs';
import open from 'open';
import { Logger } from '@salesforce/core';
import { pushAssestUtilites } from '../file/fileUtil';
import { ApexAssessmentInfo, MigratedObject, MigratedRecordInfo, RelatedObjectAssesmentInfo } from '../interfaces';
import { generateHtmlTable } from '../reportGenerator/reportGenerator';
import {
  ComponentDetail,
  Filter,
  HeaderColumn,
  ReportFrameworkParameters,
  ReportHeaderFormat,
  TableColumn,
} from '../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../orgUtils';

const resultsDir = process.cwd() + '/migration_report';
const dataMapperConstants = { componentName: 'DataMappers', title: 'Data Mappers Migration Result' };
const flexCardConstants = { componentName: 'FlexCards', title: 'Flex Cards Migration Result' };
const omniScriptConstants = {
  componentName: 'OmniScript___Integration_Procedures',
  title: 'OmniScripts / IP Migration Result',
};
const apexConstants = { componentName: 'apex', title: 'Apex Classes Migration Result' };
// const lwcConstants = { componentName: 'lwc', title: 'LWC Components Migration Result' };
const migrationResultCSSfileName = 'reportGenerator.css';
const migrationReportHTMLfileName = 'migration_report.html';

export class ResultsBuilder {
  private static logger: Logger = new Logger('ResultsBuilder');

  public static async generateReport(
    results: MigratedObject[],
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): Promise<void> {
    this.logger.info('Generating directories');
    fs.mkdirSync(resultsDir, { recursive: true });
    this.logger.info('Generating report for components');
    for (const result of results) {
      this.generateReportForResult(result, instanceUrl, ResultsBuilder.getResultConstant(result.name), orgDetails);
    }
    this.logger.info('Generating report for related objects');
    this.generateReportForRelatedObject(relatedObjectMigrationResult, instanceUrl, orgDetails);

    this.logger.info('Generating migration report dashboard');
    this.generateMigrationReportDashboard(orgDetails, this.getFormattedDetails(results, relatedObjectMigrationResult));

    this.logger.info('Pushing assets');
    pushAssestUtilites('javascripts', resultsDir);
    pushAssestUtilites('styles', resultsDir);
    await open(resultsDir + '/' + migrationReportHTMLfileName);
  }

  private static createHeadWithScript(title: string): string {
    return `<head><title>${title}</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/design-system/2.17.5/styles/salesforce-lightning-design-system.min.css" />
      <link rel="stylesheet" href="${migrationResultCSSfileName}" />
    </head>`;
  }

  private static getFormattedDetails(
    results: MigratedObject[],
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo
  ): ComponentDetail[] {
    const details: ComponentDetail[] = [];

    for (const result of results) {
      const resultConstants = this.getResultConstant(result.name);
      details.push({
        name: resultConstants.componentName,
        title: resultConstants.title,
        count: result.data?.length || 0,
        complete: result.data?.filter((record) => record.status === 'Complete').length || 0,
        error: result.data?.filter((record) => record.status === 'Error').length || 0,
        skip: result.data?.filter((record) => record.status === 'Skipped').length || 0,
      });
    }

    details.push({
      name: apexConstants.componentName,
      title: apexConstants.title,
      count: relatedObjectMigrationResult.apexAssessmentInfos.length,
      complete:
        relatedObjectMigrationResult.apexAssessmentInfos.filter(
          (record) => !record.warnings || record.warnings.length === 0
        ).length || 0,
      error:
        relatedObjectMigrationResult.apexAssessmentInfos.filter(
          (record) => record.warnings && record.warnings.length > 0
        ).length || 0,
    });
    // details.push({
    //   name: lwcConstants.componentName,
    //   title: lwcConstants.title,
    //   count: relatedObjectMigrationResult.lwcAssessmentInfos.length,
    //   complete:
    //     relatedObjectMigrationResult.lwcAssessmentInfos.filter((record) => !record.errors || record.errors.length === 0)
    //       .length || 0,
    //   error:
    //     relatedObjectMigrationResult.lwcAssessmentInfos.filter((record) => record.errors && record.errors.length > 0)
    //       .length || 0,
    // });

    return details;
  }

  private static generateMigrationReportDashboard(orgDetails: OmnistudioOrgDetails, details: ComponentDetail[]): void {
    const header = '<div class="slds-text-heading_large">OmniStudio Migration Report</div>';
    const propsBanner = this.createPropsBanner(this.formattedOrgDetails(orgDetails));
    const detailsBody = this.createDetailsBody(details);
    const html = `<html>${this.createHeadWithScript(
      'OmniStudio Migration Report'
    )}<body><div class="slds-m-around_medium">${header}${propsBanner}${detailsBody}</div></body></html>`;
    fs.writeFileSync(resultsDir + '/' + migrationReportHTMLfileName, html);
  }

  private static createPropsBanner(orgDetails: ReportHeaderFormat[]): string {
    return `<div class="header-container">
      ${orgDetails
        .map(
          (header) => `
        <div class="org-details-section">
          <div class="label-key">${header.key}</div>
          <div class="label-value">${header.value}</div>
        </div>
      `
        )
        .join('')}
      </div>
    `;
  }

  private static createDetailsBody(details: ComponentDetail[]): string {
    return `<div class="details-body">
      ${details.map((detail) => this.createDetailCard(detail)).join('')}
    </div>`;
  }

  private static createDetailCard(detail: ComponentDetail): string {
    return `<div class="slds-box slds-box_small slds-box_body-spacing">
      <div class="detail-row">
        <div class="detail-item slds-text-heading_medium">${detail.title}</div>
        <div class="detail-item slds-text-heading_medium">${detail.count}</div>
      </div>
      <hr />
      <div class="detail-row">
        <div class="detail-item">Completed Without Errors</div>
        <div class="detail-item text-success">${detail.complete}</div>
      </div>
      <div class="detail-row">
        <div class="detail-item">Errors</div>
        <div class="detail-item text-error">${detail.error}</div>
      </div>
        ${
          detail.skip !== undefined
            ? `
        <div class="detail-row">
          <div class="detail-item">Skipped</div>
          <div class="detail-item text-warning">${detail.skip}</div>
        </div>
        `
            : ''
        }
        <div class="detail-row card-footer">
          <button class="slds-button_stretch slds-button slds-button_neutral" onclick="window.location.href='${resultsDir}/${
      detail.name
    }.html'">View Report</button>
        </div>
    </div>`;
  }

  private static getResultConstant(resultName: string): { componentName: string; title: string } {
    switch (resultName.replace(/ /g, '_').replace(/\//g, '_')) {
      case dataMapperConstants.componentName:
        return dataMapperConstants;
      case flexCardConstants.componentName:
        return flexCardConstants;
      case omniScriptConstants.componentName:
        return omniScriptConstants;
    }
    return { componentName: resultName.toLowerCase().replace(/ /g, '_'), title: resultName };
  }

  private static formattedOrgDetails(orgDetails: OmnistudioOrgDetails): ReportHeaderFormat[] {
    return [
      {
        key: 'Org Name',
        value: orgDetails.orgDetails.Name,
      },
      {
        key: 'Org Id',
        value: orgDetails.orgDetails.Id,
      },
      {
        key: 'Namespace',
        value: orgDetails.packageDetails.namespace,
      },
      {
        key: 'Data Model',
        value: orgDetails.dataModel,
      },
      {
        key: 'Assessment Date and Time',
        value: new Date() as unknown as string,
      },
    ];
  }

  private static generateReportForResult(
    result: MigratedObject,
    instanceUrl: string,
    resultConstants: { componentName: string; title: string },
    orgDetails: OmnistudioOrgDetails
  ): void {
    this.logger.info(`Generating report for result: ${result.name}`);
    let tablebody = '';
    const headerColumns: HeaderColumn[] = [
      {
        label: 'In Package',
        colspan: 2,
        subColumn: [
          {
            label: 'Record ID',
            key: 'id',
          },
          {
            label: 'Record Name',
            key: 'name',
          },
        ],
      },
      {
        label: 'In Core',
        colspan: 2,
        subColumn: [
          {
            label: 'Record ID',
            key: 'migratedId',
          },
          {
            label: 'Record Name',
            key: 'migratedName',
          },
        ],
      },
      {
        label: 'Migration Status',
        key: 'status',
        rowspan: 2,
      },
      {
        label: 'Errors',
        key: 'errors',
        rowspan: 2,
      },
      {
        label: 'Warnings',
        key: 'warnings',
        rowspan: 2,
      },
    ];

    const columns: Array<TableColumn<MigratedRecordInfo>> = [
      {
        key: 'id',
        cell: (record: MigratedRecordInfo): string =>
          record.id ? `<a href="${instanceUrl}/${record.id}">${record.id}</a>` : '',
        filterValue: (record: MigratedRecordInfo): string => record.id,
        title: (record: MigratedRecordInfo): string => record.id,
      },
      {
        key: 'name',
        cell: (record: MigratedRecordInfo): string => record.name,
        filterValue: (record: MigratedRecordInfo): string => record.name,
        title: (record: MigratedRecordInfo): string => record.name,
      },
      {
        key: 'migratedId',
        cell: (record: MigratedRecordInfo): string =>
          record.migratedId ? `<a href="${instanceUrl}/${record.migratedId}">${record.migratedId}</a>` : '',
        filterValue: (record: MigratedRecordInfo): string => record.migratedId || '',
        title: (record: MigratedRecordInfo): string => record.migratedId || '',
      },
      {
        key: 'migratedName',
        cell: (record: MigratedRecordInfo): string => record.migratedName || '',
        filterValue: (record: MigratedRecordInfo): string => record.migratedName || '',
        title: (record: MigratedRecordInfo): string => record.migratedName || '',
      },
      {
        key: 'status',
        cell: (record: MigratedRecordInfo): string => record.status,
        filterValue: (record: MigratedRecordInfo): string => record.status,
        title: (record: MigratedRecordInfo): string => record.status,
      },
      {
        key: 'errors',
        cell: (record: MigratedRecordInfo): string => (record.errors ? record.errors.join('<br>') : ''),
        filterValue: (record: MigratedRecordInfo): string =>
          record.errors && record.errors.length > 0 ? 'Has Errors' : 'Has No Errors',
        title: (record: MigratedRecordInfo): string => (record.errors ? record.errors.join('<br>') : ''),
      },
      {
        key: 'warnings',
        cell: (record: MigratedRecordInfo): string => (record.warnings ? record.warnings.join('<br>') : ''),
        filterValue: (record: MigratedRecordInfo): string =>
          record.warnings && record.warnings.length > 0 ? 'Has Warnings' : 'Has No Warnings',
        title: (record: MigratedRecordInfo): string => (record.warnings ? record.warnings.join('<br>') : ''),
      },
    ];

    const filters: Filter[] = [
      {
        label: 'Migration Status',
        key: 'status',
        filterOptions: ['Complete', 'Error', 'Skipped'],
      },
    ];

    this.logger.info(`Generating table body for result: ${result.name}`);

    // Determine which rollback flag to use based on component type
    let rollbackFlagNames: string[] = [];
    const componentName = result.name.toLowerCase();
    if (componentName.includes('datamapper') || componentName.includes('data mapper')) {
      rollbackFlagNames = ['RollbackDRChanges'];
    } else if (componentName.includes('omniscript') || componentName.includes('integration procedure')) {
      rollbackFlagNames = ['RollbackOSChanges', 'RollbackIPChanges'];
    }

    const reportFrameworkParameters: ReportFrameworkParameters<MigratedRecordInfo> = {
      headerColumns,
      columns,
      rows: result.data || [],
      orgDetails: this.formattedOrgDetails(orgDetails),
      filters,
      ctaSummary: [],
      reportHeaderLabel: `${resultConstants.title}`,
      showMigrationBanner: true,
      rollbackFlags: orgDetails.rollbackFlags,
      rollbackFlagName: rollbackFlagNames.join(','),
      commandType: 'migrate',
    };

    tablebody = generateHtmlTable(reportFrameworkParameters);

    this.logger.info(`Table body generated for result: ${result.name}`);
    const html = `<html>${this.createHeadWithScript(
      `${resultConstants.title} Migration Report`
    )}<body>${tablebody}</body></html>`;
    fs.writeFileSync(resultsDir + '/' + resultConstants.componentName + '.html', html);
  }

  private static generateReportForRelatedObject(
    result: RelatedObjectAssesmentInfo,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): void {
    this.generateReportForApexResult(result.apexAssessmentInfos, instanceUrl, orgDetails);
    // this.generateReportForLwcResult(result.lwcAssessmentInfos, instanceUrl, orgDetails);
  }

  private static generateReportForApexResult(
    result: ApexAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails
  ): void {
    const headerColumns: HeaderColumn[] = [
      {
        label: 'Class Name',
        key: 'name',
      },
      {
        label: 'File Reference',
        key: 'path',
      },
      {
        label: 'Diff',
        key: 'diff',
      },
      {
        label: 'Comments',
        key: 'infos',
      },
      {
        label: 'Errors',
        key: 'warnings',
      },
    ];

    const columns: Array<TableColumn<ApexAssessmentInfo>> = [
      {
        key: 'name',
        cell: (record: ApexAssessmentInfo): string => record.name,
        filterValue: (record: ApexAssessmentInfo): string => record.name,
        title: (record: ApexAssessmentInfo): string => record.name,
      },
      {
        key: 'path',
        cell: (record: ApexAssessmentInfo): string =>
          record.path ? `<a href="${instanceUrl}/${record.path}">${record.name}</a>` : '',
        filterValue: (record: ApexAssessmentInfo): string => record.path,
        title: (record: ApexAssessmentInfo): string => record.path,
      },
      {
        key: 'diff',
        cell: (record: ApexAssessmentInfo): string => record.diff,
        filterValue: (record: ApexAssessmentInfo): string => record.diff,
        title: (record: ApexAssessmentInfo): string => record.diff,
      },
      {
        key: 'infos',
        cell: (record: ApexAssessmentInfo): string => (record.infos ? record.infos.join('<br>') : ''),
        filterValue: (record: ApexAssessmentInfo): string => (record.infos ? record.infos.join('<br>') : ''),
        title: (record: ApexAssessmentInfo): string => (record.infos ? record.infos.join('<br>') : ''),
      },
      {
        key: 'warnings',
        cell: (record: ApexAssessmentInfo): string => (record.warnings ? record.warnings.join('<br>') : ''),
        filterValue: (record: ApexAssessmentInfo): string =>
          record.warnings.length > 0 ? 'Has Errors' : 'Has No Errors',
        title: (record: ApexAssessmentInfo): string => (record.warnings ? record.warnings.join('<br>') : ''),
      },
    ];

    const filters: Filter[] = [
      {
        label: 'Errors',
        key: 'warnings',
        filterOptions: ['Has Errors', 'Has No Errors'],
      },
    ];

    const reportFrameworkParameters: ReportFrameworkParameters<ApexAssessmentInfo> = {
      headerColumns,
      columns,
      rows: result,
      orgDetails: this.formattedOrgDetails(orgDetails),
      filters,
      ctaSummary: [],
      reportHeaderLabel: `${apexConstants.title}`,
      showMigrationBanner: false,
      rollbackFlags: orgDetails.rollbackFlags,
      rollbackFlagName: 'RollbackApexChanges',
      commandType: 'migrate',
    };

    const html = `<html>${this.createHeadWithScript(
      `${apexConstants.title} Migration Report`
    )}<body>${generateHtmlTable(reportFrameworkParameters)}</div></body></html>`;
    fs.writeFileSync(resultsDir + '/' + apexConstants.componentName + '.html', html);
  }

  //   private static generateReportForLwcResult(
  //     result: LWCAssessmentInfo[],
  //     instanceUrl: string,
  //     orgDetails: OmnistudioOrgDetails
  //   ): void {
  //     const headerColumns: HeaderColumn[] = [
  //       {
  //         label: 'Component Name',
  //         key: 'name',
  //       },
  //       {
  //         label: 'File Reference',
  //         key: 'path',
  //       },
  //       {
  //         label: 'Diff',
  //         key: 'diff',
  //       },
  //       {
  //         label: 'Errors',
  //         key: 'errors',
  //       },
  //     ];

  //     const columns: Array<TableColumn<LWCAssessmentInfo>> = [
  //       {
  //         key: 'name',
  //         cell: (record: LWCAssessmentInfo): string => record.name,
  //         filterValue: (record: LWCAssessmentInfo): string => record.name,
  //         title: (record: LWCAssessmentInfo): string => record.name,
  //         skip: (record: LWCAssessmentInfo, index: number): boolean =>
  //           !(record.changeInfos && record.changeInfos.length > 0 && index === 0),
  //         rowspan: (record: LWCAssessmentInfo): number =>
  //           record.changeInfos && record.changeInfos.length > 0 ? record.changeInfos.length : 1,
  //       },
  //       {
  //         key: 'path',
  //         filterValue: (record: LWCAssessmentInfo, index: number): string => record.changeInfos[index].path,
  //         title: (record: LWCAssessmentInfo, index: number): string => record.changeInfos[index].path,
  //         cell: (record: LWCAssessmentInfo, index: number): string =>
  //           record.changeInfos[index].path
  //             ? `<a href="${instanceUrl}/${record.changeInfos[index].path}">${record.changeInfos[index].name}</a>`
  //             : '',
  //       },
  //       {
  //         key: 'diff',
  //         cell: (record: LWCAssessmentInfo, index: number): string => record.changeInfos[index].diff,
  //         filterValue: (record: LWCAssessmentInfo, index: number): string => record.changeInfos[index].diff,
  //       },
  //       {
  //         key: 'errors',
  //         cell: (record: LWCAssessmentInfo): string => (record.errors ? record.errors.join(', ') : ''),
  //         filterValue: (record: LWCAssessmentInfo): string =>
  //           record.errors && record.errors.length > 0 ? 'Has Errors' : 'Has No Errors',
  //         rowspan: (record: LWCAssessmentInfo): number =>
  //           record.changeInfos && record.changeInfos.length > 0 ? record.changeInfos.length : 1,
  //         skip: (record: LWCAssessmentInfo, index: number): boolean =>
  //           !(record.changeInfos && record.changeInfos.length > 0 && index === 0),
  //       },
  //     ];

  //     const filters: Filter[] = [
  //       {
  //         label: 'Errors',
  //         key: 'errors',
  //         filterOptions: ['Has Errors', 'Has No Errors'],
  //       },
  //     ];

  //     const html = `<html>
  //         ${this.createHeadWithScript(`${lwcConstants.title} Migration Report`)}
  //         <body>
  //           <div class="slds-m-around_medium">
  //             <div class="slds-text-heading_large">${lwcConstants.title}</div>
  //           ${generateHtmlTable(
  //             headerColumns,
  //             columns,
  //             result,
  //             this.formattedOrgDetails(orgDetails),
  //             filters,
  //             undefined,
  //             '',
  //             'changeInfos',
  //             false
  //           )}
  //           </div>
  //         </body>
  //       </html>`;
  //     fs.writeFileSync(resultsDir + '/' + lwcConstants.componentName + '.html', html);
  //   }
}
