import fs from 'fs';
import open from 'open';
import { AssessmentInfo } from '../interfaces';

export class AssessmentReporter {
  public static async generate(result: AssessmentInfo, instanceUrl: string): Promise<void> {
    let htmlBody = '';

    htmlBody += '<br />' + this.generateResult(result, instanceUrl);

    const fileUrl = process.cwd() + '/migrationresults.html';
    fs.writeFileSync(fileUrl, htmlBody);

    await open('file://' + fileUrl);
  }
  private static generateResult(_result: AssessmentInfo, _instanceUrl: string): string {
    return '';
  }
}
