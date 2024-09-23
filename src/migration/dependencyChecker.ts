/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { MigrationTool } from './interfaces';
import { OmniScriptMigrationTool } from './omniscript';
import { CardMigrationTool } from './flexcard';
import { DataRaptorMigrationTool } from './dataraptor';

interface DependencyReport {
  name: string;
  type: string;
  id: string;
  missingDependencies: DependencyReport[];
}

export class DependencyChecker {
  public static async checkDependencies(migrationObjects: MigrationTool[]): Promise<DependencyReport[]> {
    const existingNames = new Set(migrationObjects.map((obj) => obj.getName()));
    const componentsReport: DependencyReport[] = [];

    for (const migrationObject of migrationObjects) {
      const dependencies = await this.getDependencies(migrationObject);
      const missing = dependencies.filter((dep) => !existingNames.has(dep));

      const componentReport: DependencyReport = {
        name: migrationObject.getName(),
        type: migrationObject.constructor.name,
        id: migrationObject['Id'],
        missingDependencies: await this.getMissingComponents(missing, migrationObjects),
      };

      componentsReport.push(componentReport);
    }

    return componentsReport;
  }

  private static async getDependencies(this: void, migrationObject: MigrationTool): Promise<string[]> {
    const dependencyFetchers: { [key: string]: (migrationObject: MigrationTool) => Promise<string[]> } = {
      OmniScriptMigrationTool: DependencyChecker.getOmniScriptDependencies
    };
  
    const fetcher = dependencyFetchers[migrationObject.constructor.name];
    return fetcher ? await fetcher(migrationObject) : [];
  }
  
  private static async getOmniScriptDependencies(this: void, migrationObject: OmniScriptMigrationTool): Promise<string[]> {
    const elements = await migrationObject.getAllElementsForOmniScript(migrationObject.getName());
    return elements.map((element) => migrationObject.getName());
  }
  
  /*private static async getCardDependencies(this: void, migrationObject: CardMigrationTool): Promise<string[]> {
    return await this.fetchIntegrationProceduresAndDataRaptors(migrationObject);
  }
  /*private static async getDependencies(migrationObject: MigrationTool): Promise<string[]> {
    const dependencyFetchers: { [key: string]: (migrationObject: MigrationTool) => Promise<string[]> } = {
      OmniScriptMigrationTool: DependencyChecker.getOmniScriptDependencies,
      CardMigrationTool: DependencyChecker.getCardDependencies,
    };

    const fetcher = dependencyFetchers[migrationObject.constructor.name];
    return fetcher ? await fetcher(migrationObject) : [];
  }

  private static async getOmniScriptDependencies(migrationObject: OmniScriptMigrationTool): Promise<string[]> {
    const elements = await migrationObject.getAllElementsForOmniScript(migrationObject.getName());
    return elements.map((element) => migrationObject.getRecordName(element));
  }

  private static async getCardDependencies(migrationObject: CardMigrationTool): Promise<string[]> {
    return await this.fetchIntegrationProceduresAndDataRaptors(migrationObject);
  }*/

   /* private static fetchIntegrationProceduresAndDataRaptors(this: void, migrationObject: any): Promise<string[]> {
    // Replace with actual fetching logic
    return Promise.resolve(['IntegrationProcedure1', 'DataRaptor1']);
  }*/

  private static async getMissingComponents(
    missing: string[],
    migrationObjects: MigrationTool[]
  ): Promise<DependencyReport[]> {
    const missingReports: DependencyReport[] = [];

    for (const dep of missing) {
      const component = migrationObjects.find((obj) => obj.getName() === dep);
      const report = component
        ? await this.createReportForFoundComponent(component, dep)
        : await this.createReportForUnknownComponent(dep);
      missingReports.push(report);
    }

    return missingReports;
  }

  private static async createReportForFoundComponent(component: MigrationTool, dep: string): Promise<DependencyReport> {
    const componentType = await this.determineComponentType(component.getName());
    return {
      name: component.getName(),
      type: component.constructor.name,
      id: component['Id'],
      missingDependencies: [],
    };
  }

  private static async createReportForUnknownComponent(componentName: string): Promise<DependencyReport> {
    const componentType = await this.determineComponentType(componentName);
    return {
      name: componentName,
      type: componentType,
      id: '',
      missingDependencies: [],
    };
  }

  private static determineComponentType(componentName: string): Promise<string> {
    if (componentName.includes('IntegrationProcedure')) {
      return Promise.resolve('Integration Procedure');
    } else if (componentName.includes('DataRaptor')) {
      return Promise.resolve('DataRaptor');
    } else if (componentName.includes('OmniScript')) {
      return Promise.resolve('OmniScript');
    } else if (componentName.includes('Card')) {
      return Promise.resolve('Flex Card');
    }
    return Promise.resolve('Unknown');
  }
}
