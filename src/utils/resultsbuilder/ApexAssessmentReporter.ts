import { ApexAssessmentInfo } from '../interfaces';
import { generateHtmlTable } from '../reportGenerator/reportGenerator';
import { Filter, HeaderColumn, ReportHeaderFormat, TableColumn } from '../reportGenerator/reportInterfaces';

export class ApexAssessmentReporter {
  public static generateApexAssesment(
    apexAssessmentInfos: ApexAssessmentInfo[],
    instanceUrl: string,
    org: ReportHeaderFormat[]
  ): string {
    // Header Columns
    const headerColumn: HeaderColumn[] = [
      {
        label: 'Name',
        key: 'name',
        colspan: 1,
        rowspan: 1,
        subColumn: [],
      },
      {
        label: 'File Reference',
        key: 'fileReference',
        colspan: 1,
        rowspan: 1,
        subColumn: [],
      },
      {
        label: 'Diff',
        key: 'diff',
        colspan: 1,
        rowspan: 1,
        subColumn: [],
      },
      {
        label: 'Comments',
        key: 'comments',
        colspan: 1,
        rowspan: 1,
        subColumn: [],
      },
      {
        label: 'Errors',
        key: 'errors',
        colspan: 1,
        rowspan: 1,
        subColumn: [],
      },
    ];

    // Define columns
    const columns: Array<TableColumn<ApexAssessmentInfo>> = [
      {
        key: 'name',
        cell: (row: ApexAssessmentInfo): string => row.name,
        filterValue: (row: ApexAssessmentInfo): string => row.name,
        title: (row: ApexAssessmentInfo): string => row.name,
      },
      {
        key: 'fileReference',
        cell: (row: ApexAssessmentInfo): string => `<span><a href="${row.path}">${row.name}</a></span>`,
        filterValue: (row: ApexAssessmentInfo): string => row.name,
        title: (row: ApexAssessmentInfo): string => row.name,
      },
      {
        key: 'diff',
        cell: (row: ApexAssessmentInfo): string => this.getDiffHTML(row.diff),
        filterValue: (row: ApexAssessmentInfo): string => `Diff_${row.name}`,
        title: (row: ApexAssessmentInfo): string => `Diff_${row.name}`,
      },
      {
        key: 'comments',
        cell: (row: ApexAssessmentInfo): string => this.generateMessages(row.infos),
        filterValue: (row: ApexAssessmentInfo): string => row.name,
        title: (row: ApexAssessmentInfo): string => row.name,
      },
      {
        key: 'errors',
        cell: (row: ApexAssessmentInfo): string => this.generateMessages(row.warnings),
        filterValue: (row: ApexAssessmentInfo): string => row.name,
        title: (row: ApexAssessmentInfo): string => row.name,
      },
    ];

    const filters: Filter[] = [
      {
        label: 'Comments',
        key: 'comments',
        filterOptions: Array.from(new Set(apexAssessmentInfos.map((row: ApexAssessmentInfo) => row.infos.join(', ')))),
      },
      {
        label: 'Errors',
        key: 'errors',
        filterOptions: Array.from(
          new Set(apexAssessmentInfos.map((row: ApexAssessmentInfo) => row.warnings.join(', ')))
        ),
      },
    ];

    // Render table
    const tableHtml = generateHtmlTable(
      headerColumn,
      columns,
      apexAssessmentInfos,
      org,
      filters,
      undefined,
      'Apex Assessment'
    );
    return `<div class="slds-text-heading_large">Apex Assessment Report</div>${tableHtml}`;
  }

  private static getDiffContent(diff: string, lineLimit = -1): string {
    const diffArray: Array<[string | null, string | null]> = JSON.parse(diff) as Array<[string | null, string | null]>;
    let result = '';
    let originalLine = 1;
    let modifiedLine = 1;
    let linecount = 0;
    for (const [original, modified] of diffArray) {
      if (original === modified) {
        result += `<div style="color: black;">• Line ${modifiedLine}: ${original}</div>`;
        modifiedLine++;
        originalLine++;
        linecount++;
      } else if (original !== null && modified === null) {
        result += `<div style="color: red;">- Line ${originalLine}: ${original}</div>`;
        originalLine++;
        linecount++;
      } else if (original === null && modified !== null) {
        result += `<div style="color: green;">+ Line ${modifiedLine}: ${modified}</div>`;
        modifiedLine++;
        linecount++;
      }
      if (linecount >= lineLimit && lineLimit !== -1) {
        result += '<div style="color: black;">..........</div>';
        break;
      }
    }
    return result;
  }

  private static getDiffHTML(diff: string): string {
    const diffArray: Array<[string | null, string | null]> = JSON.parse(diff) as Array<[string | null, string | null]>;
    let result = '<div style="height: 120px; text-align: left; overflow-x: auto;">';
    if (diffArray.length <= 6) {
      result += this.getDiffContent(diff);
      result += '</div>';
    } else {
      result += this.getDiffContent(diff, 6);
      result += '</div>';
      result +=
        '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">';
      result +=
        '<button onclick="document.getElementById(\'myModal\').style.display=\'flex\'" style="position: absolute; top: 5px; right: 5px; width: 30px; height: 30px; opacity: 0.7;"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>';
      result += `<div id="myModal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.4); align-items: center; justify-content: center;">
              <div style="background-color: #fff; margin: auto; padding: 20px; width: 60%; height: 60%; box-shadow: 0 5px 15px rgba(0,0,0,.5); border-radius: 4px; text-align: left; position: relative;">
                <span onclick="document.getElementById('myModal').style.display='none'" style="color: #222121; height: 30px; width: 30px; position: absolute; background-color: #fff; top: -35px; right: 0; font-size: 25px; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 3px;">&times;</span>
                <h2 style="margin-top: 0; border-bottom: 1px solid #ddd; padding-bottom: 10px; text-align: center; font-size: 18px;">Summary</h2>
                <p style="margin-top: 20px;">${this.getDiffContent(diff, -1)}</p>
        </div>
      </div>`;
    }
    return result;
  }

  private static generateMessages(messages: string[]): string {
    let messageBody = '';
    for (const message of messages) {
      messageBody += `<li class="slds-item slds-text-color_destructive">${message}</li>`;
    }
    return messageBody;
  }
}
