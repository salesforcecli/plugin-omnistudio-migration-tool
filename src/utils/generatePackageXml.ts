import * as fs from 'fs';
import * as path from 'path';
import { Messages } from '@salesforce/core';
import {
  ApexAssessmentInfo,
  ExperienceSiteAssessmentInfo,
  FlexiPageAssessmentInfo,
  LWCAssessmentInfo,
} from './interfaces';
import { Logger } from './logger';

export class generatePackageXml {
  // Method to generate package.xml with additional types
  public static createChangeList(
    apexAssementInfos: ApexAssessmentInfo[],
    lwcAssessmentInfos: LWCAssessmentInfo[],
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo[],
    flexipageAssessmentInfos: FlexiPageAssessmentInfo[],
    version: string,
    messages: Messages<string>
  ): void {
    fs.rmSync(path.join(process.cwd(), 'package.xml'), { force: true });
    const { apexXml, lwcXml, expsiteXml, flexipageXml } = generatePackageXml.getRelatedObjectsXml(
      apexAssementInfos,
      lwcAssessmentInfos,
      experienceSiteAssessmentInfo,
      flexipageAssessmentInfos
    );

    if (!apexXml && !lwcXml && !expsiteXml && !flexipageXml) {
      Logger.warn(messages.getMessage('noMetadataToDeploy'));
      return;
    }

    const packageXmlContent = `
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
      ${apexXml}
      ${lwcXml}
      ${expsiteXml}
      ${flexipageXml}
    <version>${version}</version>
</Package>
`;

    const filePath = path.join(process.cwd(), 'package.xml');
    fs.writeFileSync(filePath, packageXmlContent.trim());
  }

  // Generates OmnistudioDeployment.xml containing OmniStudio components and related objects
  public static createOmnistudioDeploymentXml(
    apexAssementInfos: ApexAssessmentInfo[],
    lwcAssessmentInfos: LWCAssessmentInfo[],
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo[],
    flexipageAssessmentInfos: FlexiPageAssessmentInfo[],
    version: string
  ): void {
    fs.rmSync(path.join(process.cwd(), 'OmnistudioDeployment.xml'), { force: true });
    // Related objects XML
    const { apexXml, lwcXml, expsiteXml, flexipageXml } = generatePackageXml.getRelatedObjectsXml(
      apexAssementInfos,
      lwcAssessmentInfos,
      experienceSiteAssessmentInfo,
      flexipageAssessmentInfos
    );

    // OmniStudio components XML (always included)
    const omniScriptXml = generatePackageXml.getXmlElementforMembers(['*'], 'OmniScript');
    const omniUiCardXml = generatePackageXml.getXmlElementforMembers(['*'], 'OmniUiCard');
    const omniDataTransformXml = generatePackageXml.getXmlElementforMembers(['*'], 'OmniDataTransform');
    const omniIntegrationProcedureXml = generatePackageXml.getXmlElementforMembers(['*'], 'OmniIntegrationProcedure');
    const customLabelsXml = generatePackageXml.getXmlElementforMembers(['*'], 'CustomLabels');

    // Build array of non-empty XML sections to avoid blank lines and ensure proper spacing
    const xmlSections = [
      apexXml,
      lwcXml,
      expsiteXml,
      flexipageXml,
      omniScriptXml,
      omniUiCardXml,
      omniDataTransformXml,
      omniIntegrationProcedureXml,
      customLabelsXml,
    ].filter((xml) => xml && xml.trim().length > 0);

    const packageXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
      ${xmlSections.join('\n      ')}
    <version>${version}</version>
</Package>`;

    const filePath = path.join(process.cwd(), 'OmnistudioDeployment.xml');
    fs.writeFileSync(filePath, packageXmlContent.trim());
  }

  // Backup method without additional types
  public static backupChangeList(apexClasses: string[], lwcComponents: string[]): void {
    const apexXml = generatePackageXml.getXmlElementforMembers(apexClasses, 'ApexClass');
    const lwcXml = generatePackageXml.getXmlElementforMembers(lwcComponents, 'LightningComponentBundle');

    const packageXmlContent = `
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
        ${apexXml}
        ${lwcXml}
    <version>57.0</version>
</Package>
`;

    const filePath = path.join(__dirname, 'backup-package.xml');
    fs.writeFileSync(filePath, packageXmlContent.trim());
  }

  // Helper method to generate XML for related objects
  private static getRelatedObjectsXml(
    apexAssementInfos: ApexAssessmentInfo[],
    lwcAssessmentInfos: LWCAssessmentInfo[],
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo[],
    flexipageAssessmentInfos: FlexiPageAssessmentInfo[]
  ): {
    apexXml: string;
    lwcXml: string;
    expsiteXml: string;
    flexipageXml: string;
  } {
    const apexXml = generatePackageXml.getXmlElementforMembers(this.getApexclasses(apexAssementInfos), 'ApexClass');
    const lwcXml = generatePackageXml.getXmlElementforMembers(
      this.getLwcs(lwcAssessmentInfos),
      'LightningComponentBundle'
    );
    const expsiteXml = generatePackageXml.getXmlElementforMembers(
      this.getExperienceSiteXml(experienceSiteAssessmentInfo),
      'ExperienceBundle'
    );
    const flexipageXml = generatePackageXml.getXmlElementforMembers(
      this.getFlexipageXml(flexipageAssessmentInfos),
      'FlexiPage'
    );

    return { apexXml, lwcXml, expsiteXml, flexipageXml };
  }

  private static getXmlElementforMembers(members: string[], type: string): string {
    if (!members || members.length === 0) return '';
    const membersTag = members.map((member) => `<members>${member}</members>`).join('\n        ');
    return `
    <types>
        ${membersTag}
        <name>${type}</name>
    </types> `;
  }

  private static getExperienceSiteXml(experienceSiteAssessmentInfos: ExperienceSiteAssessmentInfo[]): string[] {
    if (!experienceSiteAssessmentInfos || experienceSiteAssessmentInfos.length === 0) return [];
    return ['*'];
  }

  private static getFlexipageXml(flexipageAssessmentInfos: FlexiPageAssessmentInfo[]): string[] {
    if (!flexipageAssessmentInfos || flexipageAssessmentInfos.length === 0) return [];
    return flexipageAssessmentInfos
      .filter((flexipageAssessmentInfo) => flexipageAssessmentInfo.status === 'Successfully migrated')
      .map((flexipageAssessmentInfo) => {
        return flexipageAssessmentInfo.name.replace('.flexipage-meta.xml', '');
      });
  }

  private static getApexclasses(apexAssessmentInfos: ApexAssessmentInfo[]): string[] {
    if (!apexAssessmentInfos || apexAssessmentInfos.length === 0) return [];
    return apexAssessmentInfos.map((apexAssessmentInfo) => {
      return apexAssessmentInfo.name;
    });
  }

  private static getLwcs(lwcAssessmentInfos: LWCAssessmentInfo[]): string[] {
    if (!lwcAssessmentInfos || lwcAssessmentInfos.length === 0) return [];
    return lwcAssessmentInfos.map((lwcAssessmentInfo) => {
      return lwcAssessmentInfo.name;
    });
  }
}
