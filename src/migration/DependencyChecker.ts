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

  private static async getDependencies(migrationObject: MigrationTool): Promise<string[]> {
    const dependencyFetchers = {
      OmniScriptMigrationTool: this.getOmniScriptDependencies,
      CardMigrationTool: this.getCardDependencies,
      DataRaptorMigrationTool: this.getDataRaptorDependencies,
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
  }

  private static async getDataRaptorDependencies(migrationObject: DataRaptorMigrationTool): Promise<string[]> {
    return []; // Implement actual logic for DataRaptor dependencies
  }

  private static async fetchIntegrationProceduresAndDataRaptors(migrationObject: any): Promise<string[]> {
    // Replace with actual fetching logic
    return ['IntegrationProcedure1', 'DataRaptor1'];
  }

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

  private static async determineComponentType(componentName: string): Promise<string> {
    if (componentName.includes('IntegrationProcedure')) {
      return 'Integration Procedure';
    } else if (componentName.includes('DataRaptor')) {
      return 'DataRaptor';
    } else if (componentName.includes('OmniScript')) {
      return 'OmniScript';
    } else if (componentName.includes('Card')) {
      return 'Flex Card';
    }
    return 'Unknown';
  }
}
