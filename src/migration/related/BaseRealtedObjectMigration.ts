import { Org } from '@salesforce/core';

export abstract class BaseRelatedObjectMigration {
  public projectPath: string;
  public namespace: string;
  public org: Org;

  public constructor(projectPath: string, namespace: string, org: Org) {
    this.projectPath = projectPath;
    this.namespace = namespace;
    this.org = org;
  }
}
