import { nameLocation, oldNew } from '../interfaces';
import { CTASummary } from '../reportGenerator/reportInterfaces';
import { IPAssessmentInfo, OSAssessmentInfo, DataRaptorAssessmentInfo, ApexAssessmentInfo } from '../interfaces';
import { documentRegistry } from '../constants/documentRegistry';
import { Logger } from '../logger';
import { MessageService } from '../MessageService';

export class reportingHelper {
  public static decorate(nameLocations: nameLocation[]): string {
    let htmlContent = '<ul class="slds-list_dotted">';
    for (const nameLoc of nameLocations) {
      htmlContent += `<li class="slds-item" title="Used in ${nameLoc.location}">${nameLoc.name}</li>`;
    }
    htmlContent += '</ul>';
    return htmlContent;
  }

  public static convertToBuletedList(messages: string[]): string {
    let htmlContent = '<ul class="slds-list_dotted">';
    for (const msg of messages) {
      htmlContent += `<li class="slds-item" title="${msg}">${msg}</li>`;
    }
    htmlContent += '</ul>';
    return htmlContent;
  }

  public static decorateChanges(changes: oldNew[], what: string): string {
    if (!changes || changes.length === 0) return '';
    let htmlContent = '<ul class="slds-list_dotted">';
    for (const change of changes) {
      htmlContent += `<li class="slds-item" title=" ${what} will change ${change.old} to ${change.new}"> ${what} will change ${change.old} to ${change.new}</li>`;

      return htmlContent;
    }
  }

  public static decorateErrors(errors: string[]): string[] {
    if (!errors || errors.length === 0) return [];
    const errorMessages: string[] = [];
    for (const error of errors) {
      errorMessages.push('<div class="slds-text-color_error">' + error + '</div>');
    }
    return errorMessages;
  }

  public static decorateStatus(status: string): string {
    if (status === 'Can be Automated' || status === 'Complete') {
      return '<div class="slds-text-color_success">' + status + '</div>';
    }
    if (status === 'Skipped') {
      return '<div class="text-warning">' + status + '</div>';
    }
    return '<div class="slds-text-color_error">' + status + '</div>';
  }

  public static getCallToAction(
    assessmentInfos: Array<IPAssessmentInfo | OSAssessmentInfo | DataRaptorAssessmentInfo | ApexAssessmentInfo>
  ): CTASummary[] {
    const callToAction = [];
    assessmentInfos.forEach((assessmentInfo) => {
      if (assessmentInfo.warnings && assessmentInfo.warnings.length > 0) {
        for (const info of assessmentInfo.warnings) {
          for (const key of Object.keys(documentRegistry)) {
            const value = MessageService.getMessage(key);
            if (
              typeof value === 'string' &&
              typeof key === 'string' &&
              this.checkMatch(info, value) &&
              this.getLink(key) !== undefined
            ) {
              callToAction.push({
                name: key,
                message: info,
                link: this.getLink(key),
              });
            }
          }
        }
      }
    });
    return this.uniqueByName(callToAction);
  }

  // This function checks if one string is derived from another string by replacing %s with wildcard
  private static checkMatch(info: string, message: string): boolean {
    // Escape regex special chars except %s
    function escapeRegex(s: string): string {
      return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    }
    try {
      // Convert template to regex pattern by replacing %s with wildcard
      const parts = message.split('%s').map(escapeRegex);
      const pattern = '^' + parts.join('(.+?)') + '$';
      const regex = new RegExp(pattern);
      if (regex.test(info)) {
        return true;
      }
    } catch (error) {
      Logger.error(error);
      return false;
    }
    return false;
  }

  private static uniqueByName(arr: CTASummary[]): CTASummary[] {
    const seen = new Set<string>();
    return arr.filter((item) => {
      if (seen.has(item.name)) {
        return false;
      } else {
        seen.add(item.name);
        return true;
      }
    });
  }

  private static getLink(key: string): string {
    if (documentRegistry[key]) {
      return documentRegistry[key] as string;
    }
    Logger.logVerbose(`No link found for ${key}`);
    return undefined;
  }
}
