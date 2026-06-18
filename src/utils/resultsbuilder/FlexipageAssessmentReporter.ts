/*
 * Copyright (c) 2025, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { FlexiPageAssessmentInfo } from '../interfaces';
import { FileDiffUtil } from '../lwcparser/fileutils/FileDiffUtil';
import { OmnistudioOrgDetails } from '../orgUtils';
import {
  FilterGroupParam,
  ReportHeaderGroupParam,
  ReportParam,
  ReportRowParam,
  SummaryItemDetailParam,
} from '../reportGenerator/reportInterfaces';
import { createFilterGroupParam, createRowDataParam, getOrgDetailsForReport } from '../reportGenerator/reportUtil';

/**
 * FlexipageAssessmentReporter provides functionality to generate assessment reports
 * for Flexipage migration operations. It processes FlexiPage assessment information
 * and converts it into report-ready data structures.
 *
 * This class handles:
 * - Converting FlexiPage assessment data into report parameters
 * - Generating summary statistics for different migration statuses
 * - Creating report rows with proper formatting and styling
 * - Managing header groups and filter options for reports
 * - Ensuring unique row IDs for report data
 */
export class FlexipageAssessmentReporter {
  /** Static counter for generating unique row IDs */
  private static rowId = 0;
  /** Prefix for row ID generation */
  private static rowIdPrefix = 'flexipage-row-data-';

  private static flexiPageFileSuffix = '.flexipage-meta.xml';

  /**
   * Generates comprehensive assessment data for Flexipage migration reports.
   *
   * @param flexipageAssessmentInfos - Array of FlexiPage assessment information
   * @param omnistudioOrgDetails - Organization details for the report
   * @returns Complete report parameters including title, headers, filters, and rows
   */
  public static getFlexipageAssessmentData(
    flexipageAssessmentInfos: FlexiPageAssessmentInfo[],
    omnistudioOrgDetails: OmnistudioOrgDetails
  ): ReportParam {
    return {
      title: 'FlexiPages Assessment Report',
      heading: 'FlexiPages Assessment Report',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toLocaleString(),
      total: flexipageAssessmentInfos?.length || 0,
      filterGroups: this.getFilterGroupsForReport(flexipageAssessmentInfos || []),
      headerGroups: this.getHeaderGroupsForReport(),
      rows: this.getRowsForReport(flexipageAssessmentInfos),
    };
  }

  /**
   * Generates summary statistics for Flexipage assessment data.
   *
   * @param flexipageAssessmentInfos - Array of FlexiPage assessment information
   * @returns Array of summary items with counts and CSS classes for different statuses
   */
  public static getSummaryData(flexipageAssessmentInfos: FlexiPageAssessmentInfo[]): SummaryItemDetailParam[] {
    return [
      {
        name: 'Ready for migration',
        count: flexipageAssessmentInfos.filter((info) => info.status === 'Ready for migration').length,
        cssClass: 'text-success',
      },
      {
        name: 'Warnings',
        count: flexipageAssessmentInfos.filter((info) => info.status === 'Warnings').length,
        cssClass: 'text-warning',
      },
      {
        name: 'Needs manual intervention',
        count: flexipageAssessmentInfos.filter((info) => info.status === 'Needs manual intervention').length,
        cssClass: 'text-error',
      },
      {
        name: 'Failed',
        count: flexipageAssessmentInfos.filter((info) => info.status === 'Failed').length,
        cssClass: 'text-error',
      },
    ];
  }

  /**
   * Converts FlexiPage assessment information into report row data.
   *
   * @param flexipageAssessmentInfos - Array of FlexiPage assessment information
   * @returns Array of report row parameters with formatted data and unique row IDs
   */
  private static getRowsForReport(flexipageAssessmentInfos: FlexiPageAssessmentInfo[]): ReportRowParam[] {
    if (!flexipageAssessmentInfos || flexipageAssessmentInfos.length === 0) {
      return [];
    }
    return flexipageAssessmentInfos.map((flexipageAssessmentInfo) => ({
      data: [
        createRowDataParam(
          'name',
          flexipageAssessmentInfo.masterLabel ||
            flexipageAssessmentInfo.name.substring(
              0,
              flexipageAssessmentInfo.name.length - this.flexiPageFileSuffix.length
            ),
          true,
          1,
          1,
          false,
          undefined,
          undefined,
          flexipageAssessmentInfo.status === 'Needs manual intervention' || flexipageAssessmentInfo.status === 'Failed'
            ? 'invalid-icon'
            : ''
        ),
        createRowDataParam('path', flexipageAssessmentInfo.name, true, 1, 1, true, flexipageAssessmentInfo.path),
        createRowDataParam(
          'status',
          flexipageAssessmentInfo.status,
          false,
          1,
          1,
          false,
          undefined,
          undefined,
          flexipageAssessmentInfo.status === 'Needs manual intervention'
            ? 'text-error'
            : flexipageAssessmentInfo.status === 'Warnings'
            ? 'text-warning'
            : 'text-success'
        ),
        createRowDataParam(
          'diff',
          '',
          false,
          1,
          1,
          false,
          undefined,
          FileDiffUtil.getDiffHTML(flexipageAssessmentInfo.diff, flexipageAssessmentInfo.name),
          'diff-cell'
        ),
        createRowDataParam(
          'errors',
          flexipageAssessmentInfo.errors?.length > 0 ? 'Errors' : 'No Errors',
          false,
          1,
          1,
          false,
          undefined,
          flexipageAssessmentInfo.errors
        ),
        createRowDataParam(
          'warnings',
          flexipageAssessmentInfo.warnings && flexipageAssessmentInfo.warnings.length > 0 ? 'Warnings' : 'No Warnings',
          false,
          1,
          1,
          false,
          undefined,
          flexipageAssessmentInfo.warnings,
          flexipageAssessmentInfo.warnings && flexipageAssessmentInfo.warnings.length > 0 ? 'text-warning' : ''
        ),
      ],
      rowId: `${this.rowIdPrefix}${this.rowId++}`,
    }));
  }

  /**
   * Generates header groups for Flexipage assessment reports.
   *
   * @returns Array of header group parameters defining the report column structure
   */
  private static getHeaderGroupsForReport(): ReportHeaderGroupParam[] {
    return [
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
            name: 'Assessment Status',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Differences',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Summary',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Warnings',
            colspan: 1,
            rowspan: 1,
          },
        ],
      },
    ];
  }
  /**
   * Generates filter groups for Flexipage assessment reports.
   *
   * @returns Array of filter group parameters for filtering by errors and status
   */
  private static getFilterGroupsForReport(flexipageAssessmentInfos: FlexiPageAssessmentInfo[]): FilterGroupParam[] {
    const distinctStatuses = [...new Set(flexipageAssessmentInfos.map((info) => info.status))];
    const statusFilterGroupParam: FilterGroupParam[] =
      distinctStatuses.length > 0 && distinctStatuses.filter((status) => status).length > 0
        ? [createFilterGroupParam('Filter By Assessment Status', 'status', distinctStatuses)]
        : [];

    return [...statusFilterGroupParam];
  }
}
