/* eslint-disable @typescript-eslint/explicit-member-accessibility */
export class AssessmentResults {
  public componentName: string;
  public filePath: string;
  public olderContent: string;
  public newContent: string;
  public diff: Map<string, Map<string, string>>;

  constructor(
    componentName: string,
    filePath: string,
    olderContent: string,
    newContent: string,
    diff: Map<string, Map<string, string>>
  ) {
    this.componentName = componentName;
    this.filePath = filePath;
    this.olderContent = olderContent;
    this.newContent = newContent;
    this.diff = diff;
  }
}
