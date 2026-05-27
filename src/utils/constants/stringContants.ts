export const Constants = {
  // short form of the omni components
  Omniscript: 'os',
  Flexcard: 'fc',
  IntegrationProcedure: 'ip',
  DataMapper: 'dm',
  GlobalAutoNumber: 'autonumber',
  CustomLabel: 'cl',
  SaveForLater: 'sfl',
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
  Flyout: 'Flyout',
  ChildCard: 'childCard',
  ChildCardPreview: 'childCardPreview',
  CustomLwc: 'customLwc',
  OmniFlyout: 'omni-flyout',
  DataAction: 'DataAction',
  CardAction: 'cardAction',

  // FlexCard "Custom Web Page" navigation action targeting an OmniScript Universal Page
  CustomActionType: 'Custom',
  WebPageTargetType: 'Web Page',
  OmniScriptUniversalPagePath: '/apex',
  OmniScriptUniversalPageToken: 'OmniScriptUniversalPage',
  OmniScriptTypeParam: 'OmniScriptType',
  OmniScriptSubTypeParam: 'OmniScriptSubType',
  OmniScriptLangParam: 'OmniScriptLang',
  OmniScriptLayoutParam: 'layout',
  OmniScriptStandardTypeParam: 'omniscript__type',
  OmniScriptStandardSubTypeParam: 'omniscript__subType',
  OmniScriptStandardLanguageParam: 'omniscript__language',
  OmniScriptStandardThemeParam: 'omniscript__theme',
  OmniScriptStandardPagePath: '/lightning/page/omnistudio/omniscript',

  // OmniScript element/action type constants
  IntegrationProcedureAction: 'Integration Procedure Action',
  DataRaptorTurboAction: 'DataRaptor Turbo Action',
  DataRaptorTransformAction: 'DataRaptor Transform Action',
  DataRaptorPostAction: 'DataRaptor Post Action',
  DataRaptorExtractAction: 'DataRaptor Extract Action',
  DocuSignEnvelopeAction: 'DocuSign Envelope Action',
  DocuSignSignatureAction: 'DocuSign Signature Action',
  DecisionMatrixAction: 'Matrix Action',
  ExpressionSetAction: 'Calculation Action',
  HTTPAction: 'Rest Action',
  PDFAction: 'PDF Action',
  RemoteAction: 'Remote Action',
  StepElement: 'Step',
  CustomLightningWebComponent: 'Custom Lightning Web Component',

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

  // SObject API names
  AttachmentObjectName: 'Attachment',
  OmniProcessObjectName: 'OmniProcess',
  OmniUiCardObjectName: 'OmniUiCard',
  OmniDataTransformObjectName: 'OmniDataTransform',
  OmniscriptObjectName: 'OmniScript__c',
  OmniScriptInstanceObjectName: 'OmniScriptInstance__c',
  OmniScriptSavedSessionObjectName: 'OmniScriptSavedSession',

  // Config table names
  OmniScriptConfigTable: 'OmniScriptConfig',
  OmniIntegrationProcConfigTable: 'OmniIntegrationProcConfig',
  OmniDataTransformConfigTable: 'OmniDataTransformConfig',
  OmniUiCardConfigTable: 'OmniUiCardConfig',

  // Display names
  OmniScriptSavedSessionsDisplayName: 'OmniScript Saved Sessions',
};

export const Status = {
  Complete: 'Complete',
  Failed: 'Failed',
  ManualDeploymentNeeded: 'Manual deployment needed',
  NeedsManualIntervention: 'Needs manual intervention',
  ReadyForMigration: 'Ready for migration',
  Skipped: 'Skipped',
  SuccessfullyCompleted: 'Successfully Completed',
  SuccessfullyMigrated: 'Successfully migrated',
};
