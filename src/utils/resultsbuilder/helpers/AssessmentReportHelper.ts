import fs from 'fs';
import path from 'path';
import { Messages } from '@salesforce/core';
import { AssessmentInfo } from '../../interfaces';
import { DashboardParam, SummaryItemDetailParam, SummaryItemParam } from '../../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../../orgUtils';
import { Constants } from '../../constants/stringContants';
import { TemplateParser } from '../../templateParser/generate';
import { getOrgDetailsForReport } from '../../reportGenerator/reportUtil';
import { CustomLabelAssessmentInfo } from '../../customLabels';
import { Logger } from '../../logger';
import { stripHtml, escapeCSVValue } from '../../stringUtils';
import { isFoundationPackage, isStandardDataModelWithMetadataAPIEnabled } from '../../dataModelService';
import { OSAssessmentReporter } from '../OSAssessmentReporter';
import { ApexAssessmentReporter } from '../ApexAssessmentReporter';
import { IPAssessmentReporter } from '../IPAssessmentReporter';
import { DRAssessmentReporter } from '../DRAssessmentReporter';
import { FlexcardAssessmentReporter } from '../FlexcardAssessmentReporter';
import { LWCAssessmentReporter } from '../LWCAssessmentReporter';
import { GlobalAutoNumberAssessmentReporter } from '../GlobalAutoNumberAssessmentReporter';
import { FlexipageAssessmentReporter } from '../FlexipageAssessmentReporter';
import { ExperienceSiteAssessmentReporter } from '../ExperienceSiteAssessmentReporter';
import { CustomLabelAssessmentReporter } from '../CustomLabelAssessmentReporter';
import { SaveForLaterAssessmentReporter } from '../SaveForLaterAssessmentReporter';

/**
 * Helper class for assessment report generation
 * Handles document generation, dashboard creation, and summary item creation
 */
export class AssessmentReportHelper {
  // File name constants
  private static readonly DATA_MAPPER_FILE = 'datamapper_assessment.html';
  private static readonly INTEGRATION_PROCEDURE_FILE = 'integration_procedure_assessment.html';
  private static readonly OMNISCRIPT_FILE = 'omniscript_assessment.html';
  private static readonly FLEXCARD_FILE = 'flexcard_assessment.html';
  private static readonly GLOBAL_AUTO_NUMBER_FILE = 'globalautonumber_assessment.html';
  private static readonly APEX_FILE = 'apex_assessment.html';
  private static readonly FLEXIPAGE_FILE = 'flexipage_assessment.html';
  private static readonly EXPERIENCE_SITE_FILE = 'experience_site_assessment.html';
  private static readonly LWC_FILE = 'lwc_assessment.html';
  private static readonly CUSTOM_LABEL_FILE = 'customlabel_assessment.html';
  private static readonly SAVE_FOR_LATER_FILE = 'saveforlater_assessment.html';
  private static readonly DASHBOARD_TEMPLATE_NAME = 'dashboard.template';

  // =============================================================================
  // PUBLIC METHODS - DASHBOARD GENERATION
  // =============================================================================

  /**
   * Creates the assessment dashboard
   */
  public static createDashboard(
    basePath: string,
    dashboardFileName: string,
    templateDir: string,
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    reports: string[],
    userActionMessages: string[]
  ): void {
    const dashboardTemplatePath = path.join(__dirname, '..', '..', '..', templateDir, this.DASHBOARD_TEMPLATE_NAME);
    const dashboardTemplate = fs.readFileSync(dashboardTemplatePath, 'utf8');

    const dashboardParam = this.createDashboardParam(
      result,
      omnistudioOrgDetails,
      reports,
      userActionMessages,
      messages
    );

    const dashboardHtml = TemplateParser.generate(dashboardTemplate, dashboardParam, messages);
    fs.writeFileSync(path.join(basePath, dashboardFileName), dashboardHtml);
  }

  // =============================================================================
  // PUBLIC METHODS - SUMMARY ITEMS CREATION
  // =============================================================================

  /**
   * Creates all summary items for the given reports
   */
  public static createSummaryItems(
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    reports: string[],
    messages: Messages<string>
  ): SummaryItemParam[] {
    const summaryItems: SummaryItemParam[] = [];

    if (reports.includes(Constants.DataMapper)) {
      summaryItems.push(this.createDataMapperSummaryItem(result, messages));
    }
    if (reports.includes(Constants.IntegrationProcedure)) {
      summaryItems.push(this.createIntegrationProcedureSummaryItem(result, messages));
    }
    if (reports.includes(Constants.Omniscript)) {
      summaryItems.push(this.createOmniscriptSummaryItem(result, messages));
    }
    if (reports.includes(Constants.Flexcard)) {
      summaryItems.push(this.createFlexcardSummaryItem(result, messages));
    }
    if (reports.includes(Constants.GlobalAutoNumber)) {
      summaryItems.push(this.createGlobalAutoNumberSummaryItem(result, messages, omnistudioOrgDetails));
    }
    if (reports.includes(Constants.Apex)) {
      summaryItems.push(this.createApexSummaryItem(result));
    }
    if (reports.includes(Constants.FlexiPage)) {
      summaryItems.push(this.createFlexipageSummaryItem(result));
    }
    if (reports.includes(Constants.ExpSites)) {
      summaryItems.push(this.createExperienceSiteSummaryItem(result));
    }
    if (reports.includes(Constants.LWC)) {
      summaryItems.push(this.createLWCSummaryItem(result));
    }
    if (reports.includes(Constants.CustomLabel)) {
      summaryItems.push(this.createCustomLabelSummaryItem(result));
    }
    // Save for Later is included when it's in the reports array
    if (reports.includes(Constants.SaveForLater)) {
      summaryItems.push(this.createSaveForLaterSummaryItem(result, messages));
    }

    return summaryItems;
  }

  // =============================================================================
  // PUBLIC METHODS - DOCUMENT GENERATION
  // =============================================================================

  /**
   * Creates a document by writing HTML content to a file
   */
  public static createDocument(filePath: string, htmlBody: string): void {
    fs.writeFileSync(filePath, htmlBody);
  }

  /**
   * Generates Omniscript assessment document
   */
  public static generateOmniscriptDocument(
    basePath: string,
    fileName: string,
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string
  ): void {
    if (isStandardDataModelWithMetadataAPIEnabled()) {
      return;
    }

    this.createDocument(
      path.join(basePath, fileName),
      TemplateParser.generate(
        template,
        OSAssessmentReporter.getOmniscriptAssessmentData(
          result.omniAssessmentInfo.osAssessmentInfos,
          instanceUrl,
          omnistudioOrgDetails
        ),
        messages
      )
    );
  }

  /**
   * Generates Flexcard assessment document
   */
  public static generateFlexcardDocument(
    basePath: string,
    fileName: string,
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string
  ): void {
    if (isStandardDataModelWithMetadataAPIEnabled()) {
      return;
    }

    this.createDocument(
      path.join(basePath, fileName),
      TemplateParser.generate(
        template,
        FlexcardAssessmentReporter.getFlexcardAssessmentData(
          result.flexCardAssessmentInfos,
          instanceUrl,
          omnistudioOrgDetails
        ),
        messages
      )
    );
  }

  /**
   * Generates Integration Procedure assessment document
   */
  public static generateIntegrationProcedureDocument(
    basePath: string,
    fileName: string,
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string
  ): void {
    if (isStandardDataModelWithMetadataAPIEnabled()) {
      return;
    }

    this.createDocument(
      path.join(basePath, fileName),
      TemplateParser.generate(
        template,
        IPAssessmentReporter.getIntegrationProcedureAssessmentData(
          result.omniAssessmentInfo.ipAssessmentInfos,
          instanceUrl,
          omnistudioOrgDetails
        ),
        messages
      )
    );
  }

  /**
   * Generates Data Mapper assessment document
   */
  public static generateDataMapperDocument(
    basePath: string,
    fileName: string,
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string
  ): void {
    if (isStandardDataModelWithMetadataAPIEnabled()) {
      return;
    }

    this.createDocument(
      path.join(basePath, fileName),
      TemplateParser.generate(
        template,
        DRAssessmentReporter.getDatamapperAssessmentData(
          result.dataRaptorAssessmentInfos,
          instanceUrl,
          omnistudioOrgDetails
        ),
        messages
      )
    );
  }

  /**
   * Generates Global Auto Number assessment document
   */
  public static generateGlobalAutoNumberDocument(
    basePath: string,
    fileName: string,
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string
  ): void {
    if (!isFoundationPackage()) {
      this.createDocument(
        path.join(basePath, fileName),
        TemplateParser.generate(
          template,
          GlobalAutoNumberAssessmentReporter.getGlobalAutoNumberAssessmentData(
            result.globalAutoNumberAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          ),
          messages
        )
      );
    }
  }

  /**
   * Generates Apex assessment document
   */
  public static generateApexDocument(
    basePath: string,
    fileName: string,
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string
  ): void {
    this.createDocument(
      path.join(basePath, fileName),
      TemplateParser.generate(
        template,
        ApexAssessmentReporter.getApexAssessmentData(result.apexAssessmentInfos, omnistudioOrgDetails),
        messages
      )
    );
  }

  /**
   * Generates Experience Site assessment document
   */
  public static generateExperienceSiteDocument(
    basePath: string,
    fileName: string,
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string
  ): void {
    this.createDocument(
      path.join(basePath, fileName),
      TemplateParser.generate(
        template,
        ExperienceSiteAssessmentReporter.getExperienceSiteAssessmentData(
          result.experienceSiteAssessmentInfos,
          omnistudioOrgDetails
        ),
        messages
      )
    );
  }

  /**
   * Generates Flexipage assessment document
   */
  public static generateFlexipageDocument(
    basePath: string,
    fileName: string,
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string
  ): void {
    this.createDocument(
      path.join(basePath, fileName),
      TemplateParser.generate(
        template,
        FlexipageAssessmentReporter.getFlexipageAssessmentData(result.flexipageAssessmentInfos, omnistudioOrgDetails),
        messages
      )
    );
  }

  /**
   * Generates LWC assessment document
   */
  public static generateLWCDocument(
    basePath: string,
    fileName: string,
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string
  ): void {
    this.createDocument(
      path.join(basePath, fileName),
      TemplateParser.generate(
        template,
        LWCAssessmentReporter.getLwcAssessmentData(result.lwcAssessmentInfos, omnistudioOrgDetails),
        messages
      )
    );
  }

  /**
   * Generates Save for Later assessment document
   */
  public static generateSaveForLaterDocument(
    basePath: string,
    fileName: string,
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string
  ): void {
    if (isStandardDataModelWithMetadataAPIEnabled()) {
      return;
    }

    this.createDocument(
      path.join(basePath, fileName),
      TemplateParser.generate(
        template,
        SaveForLaterAssessmentReporter.getSaveForLaterAssessmentData(
          result.saveForLaterAssessmentInfos || [],
          instanceUrl,
          omnistudioOrgDetails
        ),
        messages
      )
    );
  }

  /**
   * Generates Custom Label assessment document with pagination
   */
  public static generateCustomLabelDocument(
    basePath: string,
    fileName: string,
    customLabels: CustomLabelAssessmentInfo[],
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string,
    allCustomLabels?: CustomLabelAssessmentInfo[]
  ): void {
    const pageSize = 1000;
    const totalLabels = customLabels.length;
    const totalPages = Math.max(1, Math.ceil(totalLabels / pageSize));

    // Generate CSV file with all labels (including success records) for export
    this.generateCustomLabelCsvFile(
      basePath,
      Constants.CustomLabelAssessmentCsvFileName,
      allCustomLabels || customLabels
    );

    // Generate paginated reports
    for (let page = 1; page <= totalPages; page++) {
      const data = CustomLabelAssessmentReporter.getCustomLabelAssessmentData(
        customLabels,
        instanceUrl,
        omnistudioOrgDetails,
        page,
        pageSize
      );

      // Pass CSV filename in props so the export button can download it
      data.props = JSON.stringify({ csvFile: Constants.CustomLabelAssessmentCsvFileName });

      const html = TemplateParser.generate(template, data, messages);

      const pageFileName = totalPages > 1 ? `customlabel_assessment_Page_${page}_of_${totalPages}.html` : fileName;
      this.createDocument(path.join(basePath, pageFileName), html);

      Logger.logVerbose(
        messages.getMessage('generatedCustomLabelAssessmentReportPage', [page, totalPages, data.rows.length])
      );
    }
  }

  /**
   * Generates a CSV file containing all custom label data for export
   */
  private static generateCustomLabelCsvFile(
    basePath: string,
    fileName: string,
    allLabels: CustomLabelAssessmentInfo[]
  ): void {
    const headers = [
      'Name',
      'Package - Id',
      'Package - Value',
      'Core - Id',
      'Core - Value',
      'Assessment Status',
      'Summary',
    ];
    const csvRows: string[] = [];

    // Add BOM for Excel UTF-8 compatibility
    csvRows.push(headers.map((h) => escapeCSVValue(h)).join(','));

    // Sort labels by name for consistent ordering
    const sortedLabels = [...allLabels].sort((a, b) => a.name.localeCompare(b.name));

    for (const label of sortedLabels) {
      const row = [
        label.name || '',
        label.packageId || '',
        stripHtml(label.packageValue || ''),
        label.coreId || '',
        stripHtml(label.coreValue || ''),
        label.assessmentStatus || '',
        label.summary || '',
      ];
      csvRows.push(row.map((v) => escapeCSVValue(v)).join(','));
    }

    const csvContent = '﻿' + csvRows.join('\n');
    fs.writeFileSync(path.join(basePath, fileName), csvContent, 'utf8');
    Logger.logVerbose(`Generated custom label CSV export: ${fileName} with ${allLabels.length} records`);
  }

  // =============================================================================
  // PRIVATE METHODS - DASHBOARD HELPERS
  // =============================================================================

  /**
   * Creates the dashboard parameters
   */
  private static createDashboardParam(
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    reports: string[],
    userActionMessages: string[],
    messages: Messages<string>
  ): DashboardParam {
    const summaryItems = this.createSummaryItems(result, omnistudioOrgDetails, reports, messages);

    return {
      title: 'Omnistudio Assessment Report Dashboard',
      heading: 'Omnistudio Assessment Report Dashboard',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toLocaleString(),
      summaryItems,
      mode: 'assess',
      actionItems: userActionMessages,
    };
  }

  // =============================================================================
  // PRIVATE METHODS - SUMMARY ITEM CREATORS
  // =============================================================================

  private static createDataMapperSummaryItem(result: AssessmentInfo, messages: Messages<string>): SummaryItemParam {
    return this.createSummaryItem(
      'Data Mappers',
      result.dataRaptorAssessmentInfos,
      this.DATA_MAPPER_FILE,
      DRAssessmentReporter,
      messages.getMessage('processingNotRequired')
    );
  }

  private static createIntegrationProcedureSummaryItem(
    result: AssessmentInfo,
    messages: Messages<string>
  ): SummaryItemParam {
    return this.createSummaryItem(
      'Integration Procedures',
      result.omniAssessmentInfo.ipAssessmentInfos,
      this.INTEGRATION_PROCEDURE_FILE,
      IPAssessmentReporter,
      messages.getMessage('processingNotRequired')
    );
  }

  private static createOmniscriptSummaryItem(result: AssessmentInfo, messages: Messages<string>): SummaryItemParam {
    return this.createSummaryItem(
      'Omniscripts',
      result.omniAssessmentInfo.osAssessmentInfos,
      this.OMNISCRIPT_FILE,
      OSAssessmentReporter,
      messages.getMessage('processingNotRequired')
    );
  }

  private static createFlexcardSummaryItem(result: AssessmentInfo, messages: Messages<string>): SummaryItemParam {
    return this.createSummaryItem(
      'Flexcards',
      result.flexCardAssessmentInfos,
      this.FLEXCARD_FILE,
      FlexcardAssessmentReporter,
      messages.getMessage('processingNotRequired')
    );
  }

  private static createGlobalAutoNumberSummaryItem(
    result: AssessmentInfo,
    messages: Messages<string>,
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): SummaryItemParam {
    const isFoundationPkg = omnistudioOrgDetails.isFoundationPackage;
    return {
      name: 'Omni Global Auto Numbers',
      total: isFoundationPkg ? 0 : result.globalAutoNumberAssessmentInfos.length,
      data: isFoundationPkg
        ? this.getSummaryDataWithCustomMessage(messages.getMessage('globalAutoNumberUnSupportedInOmnistudioPackage'))
        : GlobalAutoNumberAssessmentReporter.getSummaryData(result.globalAutoNumberAssessmentInfos),
      file: this.GLOBAL_AUTO_NUMBER_FILE,
      showDetails: !isFoundationPkg,
    };
  }

  private static createApexSummaryItem(result: AssessmentInfo): SummaryItemParam {
    return {
      name: 'Apex Classes',
      total: result.apexAssessmentInfos.length,
      data: ApexAssessmentReporter.getSummaryData(result.apexAssessmentInfos),
      file: this.APEX_FILE,
    };
  }

  private static createFlexipageSummaryItem(result: AssessmentInfo): SummaryItemParam {
    return {
      name: 'FlexiPages',
      total: result.flexipageAssessmentInfos.length,
      data: FlexipageAssessmentReporter.getSummaryData(result.flexipageAssessmentInfos),
      file: this.FLEXIPAGE_FILE,
    };
  }

  private static createExperienceSiteSummaryItem(result: AssessmentInfo): SummaryItemParam {
    return {
      name: 'Experience Cloud Site Pages',
      total: result.experienceSiteAssessmentInfos.flatMap((info) => info.experienceSiteAssessmentPageInfos).length,
      data: ExperienceSiteAssessmentReporter.getSummaryData(result.experienceSiteAssessmentInfos),
      file: this.EXPERIENCE_SITE_FILE,
    };
  }

  private static createLWCSummaryItem(result: AssessmentInfo): SummaryItemParam {
    return {
      name: 'Lightning Web Components',
      total: result.lwcAssessmentInfos.length,
      data: LWCAssessmentReporter.getSummaryData(result.lwcAssessmentInfos),
      file: this.LWC_FILE,
    };
  }

  private static createSaveForLaterSummaryItem(result: AssessmentInfo, messages: Messages<string>): SummaryItemParam {
    // Ensure we have an array
    const saveForLaterData = Array.isArray(result.saveForLaterAssessmentInfos)
      ? result.saveForLaterAssessmentInfos
      : result.saveForLaterAssessmentInfos
      ? [result.saveForLaterAssessmentInfos]
      : [];

    return this.createSummaryItem(
      'OmniScript Saved Sessions',
      saveForLaterData,
      this.SAVE_FOR_LATER_FILE,
      SaveForLaterAssessmentReporter,
      messages.getMessage('processingNotRequired')
    );
  }

  private static createCustomLabelSummaryItem(result: AssessmentInfo): SummaryItemParam {
    return {
      name: 'Custom Labels',
      total: result.customLabelStatistics.totalLabels,
      data: [
        {
          name: 'Ready for migration',
          count: result.customLabelStatistics.readyForMigration,
          cssClass: 'text-success',
        },
        {
          name: 'Warning',
          count: result.customLabelStatistics.warnings,
          cssClass: 'text-warning',
        },
        {
          name: 'Needs manual intervention',
          count: result.customLabelStatistics.needManualIntervention,
          cssClass: 'text-error',
        },
        {
          name: 'Failed',
          count: result.customLabelStatistics.failed,
          cssClass: 'text-error',
        },
      ],
      file: this.getCustomLabelAssessmentFileName(result.customLabelStatistics.needManualIntervention),
    };
  }

  private static createSummaryItem<T>(
    name: string,
    assessmentData: T[],
    fileName: string,
    reporter: { getSummaryData: (data: T[]) => SummaryItemDetailParam[] },
    customMessage: string
  ): SummaryItemParam {
    return {
      name,
      total: isStandardDataModelWithMetadataAPIEnabled() ? 0 : assessmentData.length,
      data: isStandardDataModelWithMetadataAPIEnabled()
        ? this.getSummaryDataWithCustomMessage(customMessage)
        : reporter.getSummaryData(assessmentData),
      file: fileName,
      showDetails: !isStandardDataModelWithMetadataAPIEnabled(),
    };
  }

  /**
   * Helper method to return custom message data for summary items
   */
  private static getSummaryDataWithCustomMessage(customMessage?: string): SummaryItemDetailParam[] {
    return [{ name: customMessage, count: 0, cssClass: 'text-warning' }];
  }

  private static getCustomLabelAssessmentFileName(totalLabels: number): string {
    const pageSize = 1000;
    const totalPages = Math.max(1, Math.ceil(totalLabels / pageSize));
    return totalPages > 1 ? `customlabel_assessment_Page_1_of_${totalPages}.html` : this.CUSTOM_LABEL_FILE;
  }
}
