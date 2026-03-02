export const Constants = {
  // short form of the omni components
  Omniscript: 'os',
  Flexcard: 'fc',
  IntegrationProcedure: 'ip',
  DataMapper: 'dm',
  GlobalAutoNumber: 'autonumber',
  CustomLabel: 'cl',
  LWC: 'lwc',
  Apex: 'apex',
  FlexiPage: 'flexipage',
  ExpSites: 'expsites',

  // full form of the omni components
  OmniScriptComponentName: 'OmniScript',
  OmniScriptPluralName: 'OmniScripts',
  FlexCardComponentName: 'Flexcard',
  FlexCardPluralName: 'Flexcards',
  IntegrationProcedureComponentName: 'IntegrationProcedure',
  IntegrationProcedurePluralName: 'IntegrationProcedures',
  DataRaptorComponentName: 'DataRaptor',
  DataRaptorPluralName: 'DataRaptors',
  GlobalAutoNumberComponentName: 'Omni Global Auto Number',
  GlobalAutoNumberPluralName: 'GlobalAutoNumbers',
  ApexRemoteComponentName: 'ApexRemote',
  LWCComponentName: 'Lightning Web Component',
  ApexComponentName: 'Apex Classes',
  CustomLabelComponentName: 'Custom Label',
  CustomLabelPluralName: 'Custom Labels',
  CustomDataModel: 'custom',
  StandardDataModel: 'standard',
  DataMapperComponentName: 'Data Mapper',

  // artifacts persistance folder names
  AssessmentReportsFolderName: 'assessment_reports',
  MigrationReportsFolderName: 'migration_report',

  // custom label migration status constants
  CustomLabelInvalidStatuses: ['error', 'duplicate'],
  CustomLabelErrorStatus: 'error',
  CustomLabelDuplicateStatus: 'duplicate',
  CustomLabelSameValueMessage: 'same value',

  // Package constants
  FoundationPackageName: 'omnistudio',

  // Generic Constants
  On: 'on',
  Off: 'off',
};

export const Status = {
  SuccessfullyMigrated: 'Successfully migrated',
  Failed: 'Failed',
  Skipped: 'Skipped',
  Complete: 'Complete',
  ReadyForMigration: 'Ready for migration',
  NeedsManualIntervention: 'Needs manual intervention',
  ManualDeploymentNeeded: 'Manual deployment needed',
  SuccessfullyCompleted: 'Successfully Completed',
};
