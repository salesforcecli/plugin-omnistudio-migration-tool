/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import fs from 'fs';
import path from 'path';
import open from 'open';
import { Messages } from '@salesforce/core';
import { AssessmentInfo } from '../interfaces';
import { OmnistudioOrgDetails } from '../orgUtils';
import { Constants } from '../constants/stringContants';
import { pushAssestUtilites } from '../file/fileUtil';
import { isFoundationPackage, isStandardDataModelWithMetadataAPIEnabled } from '../dataModelService';
import { AssessmentReportHelper } from './helpers/AssessmentReportHelper';

export class AssessmentReporter {
  private static basePath = path.join(process.cwd(), Constants.AssessmentReportsFolderName);
  private static omniscriptAssessmentFileName = 'omniscript_assessment.html';
  private static flexcardAssessmentFileName = 'flexcard_assessment.html';
  private static integrationProcedureAssessmentFileName = 'integration_procedure_assessment.html';
  private static dataMapperAssessmentFileName = 'datamapper_assessment.html';
  private static globalAutoNumberAssessmentFileName = 'globalautonumber_assessment.html';
  private static apexAssessmentFileName = 'apex_assessment.html';
  private static lwcAssessmentFileName = 'lwc_assessment.html';
  private static dashboardFileName = 'dashboard.html';
  private static templateDir = 'templates';
  private static experienceSiteAssessmentFileName = 'experience_site_assessment.html';
  private static flexipageAssessmentFileName = 'flexipage_assessment.html';
  private static customLabelAssessmentFileName = 'customlabel_assessment.html';
  private static reportTemplateName = 'assessmentReport.template';

  public static async generate(
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    assessOnly: string,
    relatedObjects: string[],
    messages: Messages<string>,
    userActionMessages: string[]
  ): Promise<void> {
    fs.mkdirSync(this.basePath, { recursive: true });

    const reports = [];
    const assessmentReportTemplate = fs.readFileSync(
      path.join(__dirname, '..', '..', this.templateDir, this.reportTemplateName),
      'utf8'
    );

    if (!assessOnly) {
      // Generate all reports
      if (!isStandardDataModelWithMetadataAPIEnabled()) {
        reports.push(Constants.Omniscript, Constants.Flexcard, Constants.IntegrationProcedure, Constants.DataMapper);
      }

      reports.push(Constants.CustomLabel);

      // Only add GlobalAutoNumber if it's not a foundation package
      if (!isFoundationPackage()) {
        reports.push(Constants.GlobalAutoNumber);
      }

      // Add Save for Later to reports if data exists (for dashboard tile)
      if (
        result.saveForLaterAssessmentInfos &&
        Array.isArray(result.saveForLaterAssessmentInfos) &&
        result.saveForLaterAssessmentInfos.length > 0
      ) {
        reports.push('sfl'); // Using 'sfl' as the report identifier
      }

      this.generateAllOmnistudioDocuments(
        result,
        instanceUrl,
        omnistudioOrgDetails,
        messages,
        assessmentReportTemplate
      );
    } else {
      // Generate specific report based on assessOnly parameter
      this.generateSpecificDocument(
        assessOnly,
        result,
        instanceUrl,
        omnistudioOrgDetails,
        messages,
        assessmentReportTemplate,
        reports
      );
    }

    // Generate related objects reports
    this.generateRelatedObjectsDocuments(
      relatedObjects,
      result,
      omnistudioOrgDetails,
      messages,
      assessmentReportTemplate,
      reports
    );

    // Create dashboard and push utilities
    AssessmentReportHelper.createDashboard(
      this.basePath,
      this.dashboardFileName,
      this.templateDir,
      result,
      omnistudioOrgDetails,
      messages,
      reports,
      userActionMessages
    );

    pushAssestUtilites('javascripts', this.basePath);
    pushAssestUtilites('styles', this.basePath);
    await open(path.join(this.basePath, this.dashboardFileName));
  }
  /**
   * Generates all OmniStudio component assessment documents
   */
  private static generateAllOmnistudioDocuments(
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string
  ): void {
    AssessmentReportHelper.generateOmniscriptDocument(
      this.basePath,
      this.omniscriptAssessmentFileName,
      result,
      instanceUrl,
      omnistudioOrgDetails,
      messages,
      template
    );

    AssessmentReportHelper.generateFlexcardDocument(
      this.basePath,
      this.flexcardAssessmentFileName,
      result,
      instanceUrl,
      omnistudioOrgDetails,
      messages,
      template
    );

    AssessmentReportHelper.generateIntegrationProcedureDocument(
      this.basePath,
      this.integrationProcedureAssessmentFileName,
      result,
      instanceUrl,
      omnistudioOrgDetails,
      messages,
      template
    );

    AssessmentReportHelper.generateDataMapperDocument(
      this.basePath,
      this.dataMapperAssessmentFileName,
      result,
      instanceUrl,
      omnistudioOrgDetails,
      messages,
      template
    );

    AssessmentReportHelper.generateGlobalAutoNumberDocument(
      this.basePath,
      this.globalAutoNumberAssessmentFileName,
      result,
      instanceUrl,
      omnistudioOrgDetails,
      messages,
      template
    );

    AssessmentReportHelper.generateCustomLabelDocument(
      this.basePath,
      this.customLabelAssessmentFileName,
      result.customLabelAssessmentInfos || [],
      instanceUrl,
      omnistudioOrgDetails,
      messages,
      template
    );

    // Generate Save for Later document if instances exist
    if (
      result.saveForLaterAssessmentInfos &&
      Array.isArray(result.saveForLaterAssessmentInfos) &&
      result.saveForLaterAssessmentInfos.length > 0
    ) {
      AssessmentReportHelper.generateSaveForLaterDocument(
        this.basePath,
        'saveforlater_assessment.html',
        result,
        instanceUrl,
        omnistudioOrgDetails,
        messages,
        template
      );
    }
  }

  /**
   * Generates a specific assessment document based on the assessOnly parameter
   */
  private static generateSpecificDocument(
    assessOnly: string,
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string,
    reports: string[]
  ): void {
    switch (assessOnly) {
      case Constants.Omniscript:
        reports.push(Constants.Omniscript);
        AssessmentReportHelper.generateOmniscriptDocument(
          this.basePath,
          this.omniscriptAssessmentFileName,
          result,
          instanceUrl,
          omnistudioOrgDetails,
          messages,
          template
        );
        break;

      case Constants.Flexcard:
        reports.push(Constants.Flexcard);
        AssessmentReportHelper.generateFlexcardDocument(
          this.basePath,
          this.flexcardAssessmentFileName,
          result,
          instanceUrl,
          omnistudioOrgDetails,
          messages,
          template
        );
        break;

      case Constants.IntegrationProcedure:
        reports.push(Constants.IntegrationProcedure);
        AssessmentReportHelper.generateIntegrationProcedureDocument(
          this.basePath,
          this.integrationProcedureAssessmentFileName,
          result,
          instanceUrl,
          omnistudioOrgDetails,
          messages,
          template
        );
        break;

      case Constants.DataMapper:
        reports.push(Constants.DataMapper);
        AssessmentReportHelper.generateDataMapperDocument(
          this.basePath,
          this.dataMapperAssessmentFileName,
          result,
          instanceUrl,
          omnistudioOrgDetails,
          messages,
          template
        );
        break;

      case Constants.GlobalAutoNumber:
        reports.push(Constants.GlobalAutoNumber);
        AssessmentReportHelper.generateGlobalAutoNumberDocument(
          this.basePath,
          this.globalAutoNumberAssessmentFileName,
          result,
          instanceUrl,
          omnistudioOrgDetails,
          messages,
          template
        );
        break;

      case Constants.CustomLabel:
        reports.push(Constants.CustomLabel);
        AssessmentReportHelper.generateCustomLabelDocument(
          this.basePath,
          this.customLabelAssessmentFileName,
          result.customLabelAssessmentInfos || [],
          instanceUrl,
          omnistudioOrgDetails,
          messages,
          template
        );
        break;

      default:
    }
  }

  /**
   * Generates related objects assessment documents (Apex, LWC, FlexiPages, Experience Sites)
   */
  private static generateRelatedObjectsDocuments(
    relatedObjects: string[],
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages<string>,
    template: string,
    reports: string[]
  ): void {
    if (relatedObjects && relatedObjects.includes(Constants.Apex)) {
      reports.push(Constants.Apex);
      AssessmentReportHelper.generateApexDocument(
        this.basePath,
        this.apexAssessmentFileName,
        result,
        omnistudioOrgDetails,
        messages,
        template
      );
    }

    if (relatedObjects && relatedObjects.includes(Constants.ExpSites)) {
      reports.push(Constants.ExpSites);
      AssessmentReportHelper.generateExperienceSiteDocument(
        this.basePath,
        this.experienceSiteAssessmentFileName,
        result,
        omnistudioOrgDetails,
        messages,
        template
      );
    }

    if (relatedObjects && relatedObjects.includes(Constants.FlexiPage)) {
      reports.push(Constants.FlexiPage);
      AssessmentReportHelper.generateFlexipageDocument(
        this.basePath,
        this.flexipageAssessmentFileName,
        result,
        omnistudioOrgDetails,
        messages,
        template
      );
    }

    if (relatedObjects && relatedObjects.includes(Constants.LWC)) {
      reports.push(Constants.LWC);
      AssessmentReportHelper.generateLWCDocument(
        this.basePath,
        this.lwcAssessmentFileName,
        result,
        omnistudioOrgDetails,
        messages,
        template
      );
    }
  }
}
