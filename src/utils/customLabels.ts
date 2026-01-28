import { Connection, Messages } from '@salesforce/core';
import { Logger } from './logger';

export interface ExternalStringRecord {
  Id: string;
  Name: string;
  NamespacePrefix: string;
  Value: string;
}

export interface CustomLabelAssessmentInfo {
  name: string;
  value: string;
  id: string;
  namespace: string;
  assessmentStatus: string;
  packageId?: string;
  packageValue?: string;
  coreId?: string;
  coreValue?: string;
  summary?: string;
}

export interface CustomLabelStatistics {
  totalLabels: number;
  readyForMigration: number;
  needManualIntervention: number;
  warnings: number;
  failed: number;
}

export interface CustomLabelResult {
  labels: CustomLabelAssessmentInfo[];
  statistics: CustomLabelStatistics;
}

export class CustomLabelsUtil {
  public static async fetchCustomLabels(
    connection: Connection,
    namespace: string,
    messages: Messages<string>
  ): Promise<CustomLabelResult> {
    try {
      const customLabels = await this.fetchExternalStringsFromTooling(connection, namespace, messages);

      if (!customLabels || customLabels.length === 0) {
        return {
          labels: [],
          statistics: { totalLabels: 0, readyForMigration: 0, needManualIntervention: 0, warnings: 0, failed: 0 },
        };
      }

      const externalStrings = await this.fetchExternalStringsFromTooling(connection, '', messages);

      const processedLabels = customLabels.map((label) => {
        const name = label.Name;
        const value = label.Value;
        const id = label.Id;
        const externalString = externalStrings.find((es) => es.Name.toLowerCase() === name.toLowerCase());
        let assessmentStatus = 'Ready for migration';
        let summary = '';

        if (externalString && externalString.Value !== value) {
          assessmentStatus = 'Warnings';
          summary = messages.getMessage('customLabelAssessmentSummary');
        }

        return {
          name,
          value,
          id,
          namespace,
          assessmentStatus,
          packageId: id,
          packageValue: String(value),
          coreId: externalString ? externalString.Id : '',
          coreValue: externalString ? String(externalString.Value) : '',
          summary,
        };
      });

      const warnings = processedLabels.filter((label) => label.assessmentStatus === 'Warnings');

      const needsManualIntervention = processedLabels.filter(
        (label) => label.assessmentStatus === 'Needs manual intervention'
      );

      const failed = processedLabels.filter((label) => label.assessmentStatus === 'Failed');

      const readyForMigration = processedLabels.filter(
        (label) => label.assessmentStatus === 'Ready for migration'
      ).length;

      const totalAttentionNeeded = warnings.length + needsManualIntervention.length + failed.length;

      Logger.logVerbose(
        messages.getMessage('assessedCustomLabelsCount', [String(totalAttentionNeeded), String(processedLabels.length)])
      );

      return {
        labels: [...warnings, ...needsManualIntervention, ...failed],
        statistics: {
          totalLabels: processedLabels.length,
          readyForMigration,
          needManualIntervention: needsManualIntervention.length,
          warnings: warnings.length,
          failed: failed.length,
        },
      };
    } catch (error) {
      Logger.error(messages.getMessage('errorFetchingCustomLabels', [String(error)]));
      return {
        labels: [],
        statistics: { totalLabels: 0, readyForMigration: 0, needManualIntervention: 0, warnings: 0, failed: 0 },
      };
    }
  }

  private static async fetchExternalStringsFromTooling(
    connection: Connection,
    namespace: string,
    messages: Messages<string>
  ): Promise<ExternalStringRecord[]> {
    try {
      const query = `SELECT Id, Name, NamespacePrefix, Value FROM ExternalString WHERE NamespacePrefix = '${namespace}'`;
      let result = await connection.tooling.query(query);
      const allRecords: ExternalStringRecord[] = [];

      if (result && result.records) {
        allRecords.push(...(result.records as ExternalStringRecord[]));
      }

      while (result && result.done === false && result.nextRecordsUrl) {
        try {
          result = await connection.tooling.queryMore(result.nextRecordsUrl);
          if (result && result.records) {
            allRecords.push(...(result.records as ExternalStringRecord[]));
          }

          if (!result || !result.records || result.records.length === 0) {
            break;
          }
        } catch (error) {
          Logger.error(`Error in queryMore: ${String(error)}`);
          break;
        }
      }

      return allRecords;
    } catch (error) {
      Logger.error(messages.getMessage('errorFetchingCustomLabels', [String(error)]));
      return [];
    }
  }
}
