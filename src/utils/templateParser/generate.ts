import { Messages } from '@salesforce/core';
import { DashboardParam, ReportParam } from '../reportGenerator/reportInterfaces';
import { Logger } from '../logger';
import { TemplateParserUtil } from './util';

/**
 * Main template parser class that provides a high-level interface for generating HTML from templates.
 * Combines template parsing and data binding to produce final HTML output.
 */
export class TemplateParser {
  /**
   * Generates HTML output from a template string and data object.
   * Parses the template into an ElementNode structure, flattens the data object,
   * and converts the template to HTML with the provided data.
   *
   * @param template - The HTML template string containing template syntax (conditionals, loops, placeholders)
   * @param data - The data object (ReportParam or DashboardParam) to bind to the template
   * @returns The generated HTML string with data substituted into the template
   */
  public static generate(template: string, data: ReportParam | DashboardParam, messages: Messages): string {
    if (!data) {
      return template;
    }

    Logger.captureVerboseData('sanitized param data:', data);
    const node = TemplateParserUtil.parseHtmlToNode(template, messages);
    const keypair = TemplateParserUtil.parseKeyPair(data, messages);
    const html = node.toHtml(keypair);
    return html;
  }
}
