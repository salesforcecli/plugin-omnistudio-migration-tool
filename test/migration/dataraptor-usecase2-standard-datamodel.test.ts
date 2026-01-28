/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { expect } from 'chai';
import { Connection, Messages } from '@salesforce/core';
import * as sinon from 'sinon';
import { DataRaptorMigrationTool } from '../../src/migration/dataraptor';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { Logger } from '../../src/utils/logger';
import DRBundleMappings from '../../src/mappings/DRBundle';
import DRMapItemMappings from '../../src/mappings/DRMapItem';
import * as dataModelService from '../../src/utils/dataModelService';

/**
 * DataRaptor Standard Data Model (Metadata API Disabled) - Assessment and Migration Tests
 *
 * This test suite covers DataRaptor migration scenarios for the Standard Data Model where:
 * - DRBundle__c records are migrated to OmniDataTransform objects
 * - DRMapItem__c records are migrated to OmniDataTransformItem objects
 * - Special character handling in DataRaptor names (assessment warnings vs migration cleaning)
 * - Formula field reference updates using NameMappingRegistry
 * - Field mapping validation for Standard vs Custom data models
 * - Apex dependency detection and validation
 */

describe('DataRaptor Standard Data Model (Metadata API Disabled) - Assessment and Migration', () => {
  let dataRaptorTool: DataRaptorMigrationTool;
  let mockConnection: Connection;
  let mockLogger: Logger;
  let mockMessages: Messages<string>;
  let mockUx: any;
  let isStandardDataModelStub: sinon.SinonStub;

  beforeEach(() => {
    // Mock the standard data model check to return true BEFORE creating DataRaptorMigrationTool
    isStandardDataModelStub = sinon.stub().returns(true);
    sinon.replace(dataModelService, 'isStandardDataModel', isStandardDataModelStub);
    mockConnection = {
      sobject: sinon.stub().returns({
        find: sinon.stub().resolves([]),
        create: sinon.stub().resolves({ success: true }),
        update: sinon.stub().resolves({ success: true }),
      }),
      query: sinon.stub().resolves({ records: [], done: true }),
    } as unknown as Connection;

    // Mock Messages object
    mockMessages = {
      getMessage: sinon.stub().callsFake((key: string, params?: string[]) => {
        const messages: Record<string, string> = {
          changeMessage: `The ${params?.[0]} ${params?.[1]} will be changed from ${params?.[2]} to ${params?.[3]}`,
          dataMapperNameStartsWithNumber: `DataMapper name '${params?.[0]}' starts with a number, suggested name: '${params?.[1]}'`,
          duplicatedName: 'Duplicated name found',
          unexpectedError: 'An unexpected error occurred',
          componentMappingNotFound: `No registry mapping found for ${params?.[0]} component: ${params?.[1]}, using fallback cleaning`,
        };
        return messages[key] || 'Mock message for testing';
      }),
    } as unknown as Messages<string>;

    mockUx = {};
    mockLogger = {} as Logger;

    dataRaptorTool = new DataRaptorMigrationTool('testNamespace', mockConnection, mockLogger, mockMessages, mockUx);

    // Setup NameMappingRegistry with test data
    const registry = NameMappingRegistry.getInstance();
    registry.registerNameMapping({
      originalName: 'Customer-Data@Loader!',
      cleanedName: 'CustomerDataLoader',
      componentType: 'DataMapper',
      recordId: 'test-id-1',
    });
    registry.registerNameMapping({
      originalName: 'Product#Info$Extractor',
      cleanedName: 'ProductInfoExtractor',
      componentType: 'DataMapper',
      recordId: 'test-id-2',
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Standard Data Model Assessment - OmniDataTransform with Special Characters', () => {
    it('should assess DataRaptor with special characters in name and generate warnings', async () => {
      const mockDataRaptor = {
        Id: 'dr1',
        Name: 'Customer-Data@Loader!',
        Type: 'Extract', // Standard Data Model field (no __c suffix)
        Description: 'Test DataRaptor with special chars',
        InputType: 'JSON',
        OutputType: 'SObject',
        IsActive: true,
      };

      const result = await (dataRaptorTool as any).processDataMappers(mockDataRaptor, new Set<string>(), new Map(), []);

      // DataRaptor name should be cleaned for tracking
      expect(result.name).to.equal('CustomerDataLoader');
      expect(result.oldName).to.equal('Customer-Data@Loader!');

      // Should generate warning about name change
      expect(result.warnings).to.have.length(1);
      expect(result.warnings[0]).to.include('Customer-Data@Loader!');
      expect(result.warnings[0]).to.include('CustomerDataLoader');
      expect(result.migrationStatus).to.equal('Warnings');
    });

    it('should assess DataRaptor with clean name and allow migration', async () => {
      const mockDataRaptor = {
        Id: 'dr2',
        Name: 'CustomerDataLoader',
        Type: 'Transform',
        Description: 'Clean DataRaptor name',
        InputType: 'SObject',
        OutputType: 'JSON',
        IsActive: true,
      };

      const result = await (dataRaptorTool as any).processDataMappers(mockDataRaptor, new Set<string>(), new Map(), []);

      // Clean DataRaptor name should remain unchanged
      expect(result.name).to.equal('CustomerDataLoader');
      expect(result.oldName).to.equal('CustomerDataLoader');
      expect(result.migrationStatus).to.equal('Ready for migration');

      // No warnings should be generated for clean names
      expect(result.warnings).to.be.empty;
    });

    it('should detect DataRaptor name starting with number and require manual intervention', async () => {
      const mockDataRaptor = {
        Id: 'dr3',
        Name: '3rdPartyDataLoader',
        Type: 'Load',
        Description: 'DataRaptor starting with number',
        InputType: 'JSON',
        OutputType: 'SObject',
        IsActive: true,
      };

      const result = await (dataRaptorTool as any).processDataMappers(mockDataRaptor, new Set<string>(), new Map(), []);

      // Should require manual intervention for names starting with numbers
      expect(result.migrationStatus).to.equal('Needs manual intervention');
      expect(result.warnings).to.have.length.greaterThan(0);
      expect(result.warnings.some((warning) => warning.includes('3rdPartyDataLoader'))).to.be.true;
      expect(result.warnings.some((warning) => warning.includes('DM3rdPartyDataLoader'))).to.be.true;
    });

    it('should detect duplicate DataRaptor names and require manual intervention', async () => {
      const existingNames = new Set(['customerdataloader']); // Use lowercase to match the actual implementation
      const mockDataRaptor = {
        Id: 'dr4',
        Name: 'Customer-Data@Loader!', // This will clean to CustomerDataLoader (duplicate)
        Type: 'Extract',
        Description: 'Duplicate name after cleaning',
        InputType: 'JSON',
        OutputType: 'SObject',
        IsActive: true,
      };

      const result = await (dataRaptorTool as any).processDataMappers(mockDataRaptor, existingNames, new Map(), []);

      // Should require manual intervention for duplicated names
      // Note: When there's both a name cleaning warning AND a duplicate, 'Needs manual intervention' takes precedence
      expect(result.migrationStatus).to.equal('Needs manual intervention');
      expect(result.warnings).to.have.length.greaterThan(1); // Should have both name change warning and duplicate warning
      expect(result.warnings.some((warning) => warning.includes('Duplicated'))).to.be.true;
    });

    it('should detect Apex dependencies in DataRaptor configuration', async () => {
      const mockDataRaptor = {
        Id: 'dr5',
        Name: 'ApexDataRaptor',
        Type: 'Transform',
        InputParsingClass: 'CustomInputProcessor', // Standard Data Model field name
        OutputParsingClass: 'CustomOutputProcessor', // Standard Data Model field name
        Description: 'DataRaptor with Apex dependencies',
        InputType: 'Custom',
        OutputType: 'Custom',
        IsActive: true,
      };

      const result = await (dataRaptorTool as any).processDataMappers(mockDataRaptor, new Set<string>(), new Map(), []);

      // Should detect Apex dependencies
      expect(result.apexDependencies).to.have.length(2);
      expect(result.apexDependencies).to.include('CustomInputProcessor');
      expect(result.apexDependencies).to.include('CustomOutputProcessor');
      expect(result.migrationStatus).to.equal('Ready for migration');
    });
  });

  describe('Standard Data Model Migration - OmniDataTransform Field Mapping and Transformation', () => {
    it('should map OmniDataTransform fields correctly for Standard Data Model', () => {
      const mockDataRaptorRecord = {
        Id: 'dr1',
        Name: 'CustomerDataProcessor',
        Type: 'Transform',
        Description: 'Customer data processing',
        BatchSize: 50,
        IsFieldLevelSecurityEnabled: true,
        InputType: 'JSON',
        OutputType: 'SObject',
        IsActive: false, // Will be overridden to true
        ExpectedInputJson: '{"test": "input"}',
        ExpectedOutputJson: '{"test": "output"}',
        PreprocessorClassName: 'TestPreprocessor',
        ResponseCacheType: 'Platform',
        ResponseCacheTtlMinutes: 30,
        GlobalKey: 'test-global-key',
      };

      const result = (dataRaptorTool as any).mapDataRaptorRecord(mockDataRaptorRecord);

      // Standard Data Model should preserve field structure and clean name
      expect(result.Name).to.equal('CustomerDataProcessor');
      expect(result.Type).to.equal('Transform');
      expect(result.Description).to.equal('Customer data processing');
      expect(result.BatchSize).to.equal(50);
      expect(result.IsFieldLevelSecurityEnabled).to.be.true;
      expect(result.InputType).to.equal('JSON');
      expect(result.OutputType).to.equal('SObject');
      expect(result.IsActive).to.be.true; // Always set to true during migration
      expect(result.ExpectedInputJson).to.equal('{"test": "input"}');
      expect(result.ExpectedOutputJson).to.equal('{"test": "output"}');
      expect(result.PreprocessorClassName).to.equal('TestPreprocessor');
      expect(result.ResponseCacheType).to.equal('Platform');
      expect(result.ResponseCacheTtlMinutes).to.equal(30);
      expect(result.GlobalKey).to.equal('test-global-key');

      // Should have correct attributes for batch processing
      expect(result.attributes).to.deep.equal({
        type: 'OmniDataTransform',
        referenceId: 'dr1',
      });
    });

    it('should clean DataRaptor name with special characters during migration', () => {
      const mockDataRaptorRecord = {
        Id: 'dr2',
        Name: 'Customer-Profile@Loader!',
        Type: 'Extract',
        Description: 'Test description',
        IsActive: false,
      };

      const result = (dataRaptorTool as any).mapDataRaptorRecord(mockDataRaptorRecord);

      // Name should be cleaned during migration
      expect(result.Name).to.equal('CustomerProfileLoader');
      expect(result.IsActive).to.be.true;
      expect(result.attributes.referenceId).to.equal('dr2');
    });
  });

  describe('Standard Data Model Migration - OmniDataTransformItem Field Mapping and Formula Updates', () => {
    it('should map OmniDataTransformItem fields correctly for Standard Data Model', () => {
      const mockDataRaptorItemRecord = {
        Id: 'dri1',
        Name: 'CustomerNameMapping',
        InputFieldName: 'FirstName',
        OutputFieldName: 'Customer_First_Name__c',
        OutputObjectName: 'Account',
        FormulaExpression: 'CONCAT(FirstName, " ", LastName)',
        DefaultValue: 'N/A',
        FilterOperator: 'EQUALS',
        FilterValue: 'Active',
        IsDisabled: false,
        IsUpsertKey: true,
        GlobalKey: 'test-item-key',
      };

      const result = (dataRaptorTool as any).mapDataRaptorItemData(mockDataRaptorItemRecord, 'parent-transform-id');

      // Standard Data Model should preserve field structure
      expect(result.Name).to.equal('CustomerNameMapping');
      expect(result.InputFieldName).to.equal('FirstName');
      expect(result.OutputFieldName).to.equal('Customer_First_Name__c');
      expect(result.OutputObjectName).to.equal('Account');
      expect(result.FormulaExpression).to.equal('CONCAT(FirstName, " ", LastName)');
      expect(result.DefaultValue).to.equal('N/A');
      expect(result.FilterOperator).to.equal('EQUALS');
      expect(result.FilterValue).to.equal('Active');
      expect(result.IsDisabled).to.be.false;
      expect(result.IsUpsertKey).to.be.true;
      expect(result.GlobalKey).to.equal('test-item-key');

      // Should set parent relationship
      expect(result.OmniDataTransformationId).to.equal('parent-transform-id');

      // Should have correct attributes for batch processing
      expect(result.attributes).to.deep.equal({
        type: 'OmniDataTransformItem',
        referenceId: 'dri1',
      });
    });

    it('should preserve formula field structure for registry processing', () => {
      const mockDataRaptorItemRecord = {
        Id: 'dri2',
        Name: 'FormulaWithDependencies',
        FormulaExpression: 'DATARAPTOR("Customer-Data@Loader!", {}) + DATARAPTOR("Product#Info$Extractor", {})',
        InputFieldName: 'TestField',
        OutputFieldName: 'TestOutput',
      };

      const result = (dataRaptorTool as any).mapDataRaptorItemData(mockDataRaptorItemRecord, 'parent-id');

      // Formula structure should be preserved for further processing
      expect(result.FormulaExpression).to.be.a('string');
      expect(result.InputFieldName).to.equal('TestField');
      expect(result.OutputFieldName).to.equal('TestOutput');
      expect(result.OmniDataTransformationId).to.equal('parent-id');
    });

    it('should handle DataRaptor item with special characters in name', () => {
      const mockDataRaptorItemRecord = {
        Id: 'dri3',
        Name: 'Item-With@Special!Chars',
        InputFieldName: 'TestInput',
        OutputFieldName: 'TestOutput',
        FormulaExpression: null,
      };

      const result = (dataRaptorTool as any).mapDataRaptorItemData(mockDataRaptorItemRecord, 'parent-id');

      // Item name should be cleaned
      expect(result.Name).to.equal('ItemWithSpecialChars');
      expect(result.OmniDataTransformationId).to.equal('parent-id');
    });
  });

  describe('Standard Data Model - Complex Scenarios with Multiple Items and Dependencies', () => {
    it('should handle DataRaptor with multiple items and mixed dependencies', async () => {
      const mockDataRaptor = {
        Id: 'dr_complex',
        Name: 'ComplexDataRaptor',
        Type: 'Transform',
        Description: 'Complex data transformation',
        InputParsingClass: 'CustomProcessor',
        InputType: 'JSON',
        OutputType: 'SObject',
        IsActive: true,
      };

      const mockItems = [
        {
          Id: 'dri1',
          Name: 'CustomerMapping',
          InputFieldName: 'customer_name',
          OutputFieldName: 'Name',
          FormulaExpression: 'UPPER(customer_name)',
        },
        {
          Id: 'dri2',
          Name: 'Item-With@Special!',
          InputFieldName: 'contact_email',
          OutputFieldName: 'Email',
          FormulaExpression: 'DATARAPTOR("Customer-Data@Loader!", {})',
        },
      ];

      const dataRaptorItemsMap = new Map();
      dataRaptorItemsMap.set('ComplexDataRaptor', mockItems);

      // Test assessment
      const assessmentResult = await (dataRaptorTool as any).processDataMappers(
        mockDataRaptor,
        new Set<string>(),
        dataRaptorItemsMap,
        []
      );

      // Assessment should show ready for migration (clean name)
      expect(assessmentResult.migrationStatus).to.equal('Ready for migration');
      expect(assessmentResult.warnings).to.be.empty;
      expect(assessmentResult.apexDependencies).to.include('CustomProcessor');

      // Test migration transformation
      const migrationResult = (dataRaptorTool as any).mapDataRaptorRecord(mockDataRaptor);
      const itemResults = mockItems.map((item) =>
        (dataRaptorTool as any).mapDataRaptorItemData(item, migrationResult.attributes.referenceId)
      );

      // Migration should preserve structure and clean names
      expect(migrationResult.Name).to.equal('ComplexDataRaptor');
      expect(migrationResult.IsActive).to.be.true;

      // Items should be processed correctly
      expect(itemResults[0].Name).to.equal('CustomerMapping');
      expect(itemResults[1].Name).to.equal('ItemWithSpecial'); // Special chars cleaned

      // All items should have correct parent relationship
      itemResults.forEach((item) => {
        expect(item.OmniDataTransformationId).to.equal(migrationResult.attributes.referenceId);
      });
    });

    it('should handle DataRaptor migration with comprehensive structure validation', () => {
      const mockDataRaptor = {
        Id: 'dr_registry',
        Name: 'RegistryTestDataRaptor',
        Type: 'Load',
        Description: 'Testing registry mappings',
        IsActive: false,
      };

      const mockItems = [
        {
          Id: 'dri_reg1',
          Name: 'RegistryItem1',
          FormulaExpression: 'DATARAPTOR("Customer-Data@Loader!", {"input": value})',
          InputFieldName: 'test1',
          OutputFieldName: 'output1',
        },
        {
          Id: 'dri_reg2',
          Name: 'RegistryItem2',
          FormulaExpression: 'DATARAPTOR("Product#Info$Extractor", {"data": input}) + 10',
          InputFieldName: 'test2',
          OutputFieldName: 'output2',
        },
      ];

      const migrationResult = (dataRaptorTool as any).mapDataRaptorRecord(mockDataRaptor);
      const itemResults = mockItems.map((item) => (dataRaptorTool as any).mapDataRaptorItemData(item, 'parent-id'));

      // All results should have proper structure for registry processing
      expect(migrationResult.Name).to.equal('RegistryTestDataRaptor');
      expect(migrationResult.IsActive).to.be.true;
      expect(itemResults).to.have.length(2);

      itemResults.forEach((item, index) => {
        expect(item.Name).to.equal(mockItems[index].Name);
        expect(item.FormulaExpression).to.be.a('string');
        expect(item.OmniDataTransformationId).to.equal('parent-id');
      });
    });
  });

  describe('Standard Data Model - Error Scenarios and Edge Cases', () => {
    it('should handle empty or null field values gracefully', () => {
      const mockDataRaptorRecord = {
        Id: 'dr_empty',
        Name: null,
        Type: '',
        Description: undefined,
        IsActive: null,
      };

      const result = (dataRaptorTool as any).mapDataRaptorRecord(mockDataRaptorRecord);

      // Should handle null/undefined values gracefully
      expect(result.Name).to.equal(''); // cleanName handles null
      expect(result.Type).to.equal('');
      expect(result.Description).to.be.undefined;
      expect(result.IsActive).to.be.true; // Always set to true
    });

    it('should handle DataRaptor items without formula expressions', () => {
      const mockDataRaptorItemRecord = {
        Id: 'dri_no_formula',
        Name: 'SimpleMapping',
        InputFieldName: 'source_field',
        OutputFieldName: 'target_field',
        FormulaExpression: null,
      };

      const result = (dataRaptorTool as any).mapDataRaptorItemData(mockDataRaptorItemRecord, 'parent-id');

      // Should handle null formula gracefully
      expect(result.Name).to.equal('SimpleMapping');
      expect(result.InputFieldName).to.equal('source_field');
      expect(result.OutputFieldName).to.equal('target_field');
      expect(result.FormulaExpression).to.be.null;
      expect(result.OmniDataTransformationId).to.equal('parent-id');
    });

    it('should preserve all DataRaptor field mappings correctly for Standard Data Model', () => {
      const mockDataRaptorRecord = {
        Id: 'dr_all_fields',
        Name: 'AllFieldsTest',
        BatchSize: 100,
        IsFieldLevelSecurityEnabled: false,
        InputParsingClass: 'InputParser',
        OutputParsingClass: 'OutputParser',
        IsDeletedOnSuccess: true,
        Description: 'All fields test',
        IsErrorIgnored: false,
        ExpectedInputOtherData: 'custom input',
        ExpectedInputJson: '{}',
        InputType: 'JSON',
        ExpectedInputXml: '<xml/>',
        SourceObject: 'Account',
        IsSourceObjectDefault: true,
        IsProcessSuperBulk: false,
        OutputType: 'SObject',
        IsNullInputsIncludedInOutput: true,
        PreprocessorClassName: 'Preprocessor',
        SynchronousProcessThreshold: 500,
        RequiredPermission: 'CustomPermission',
        IsRollbackOnError: true,
        ResponseCacheType: 'Platform',
        PreviewOtherData: 'preview data',
        PreviewJsonData: '{"preview": true}',
        PreviewSourceObjectData: 'source preview',
        PreviewXmlData: '<preview/>',
        ExpectedOutputOtherData: 'output data',
        TargetOutputDocumentIdentifier: 'doc-123',
        ExpectedOutputJson: '{"output": true}',
        TargetOutputFileName: 'output.pdf',
        ExpectedOutputXml: '<output/>',
        ResponseCacheTtlMinutes: 60,
        Type: 'Transform',
        IsAssignmentRulesUsed: false,
        XmlOutputTagsOrder: 'ordered',
        IsXmlDeclarationRemoved: true,
        GlobalKey: 'global-key-123',
      };

      const result = (dataRaptorTool as any).mapDataRaptorRecord(mockDataRaptorRecord);

      // All fields should be preserved correctly for Standard Data Model
      expect(result.Name).to.equal('AllFieldsTest');
      expect(result.BatchSize).to.equal(100);
      expect(result.IsFieldLevelSecurityEnabled).to.be.false;
      expect(result.InputParsingClass).to.equal('InputParser');
      expect(result.OutputParsingClass).to.equal('OutputParser');
      expect(result.IsDeletedOnSuccess).to.be.true;
      expect(result.Description).to.equal('All fields test');
      expect(result.IsErrorIgnored).to.be.false;
      expect(result.ExpectedInputOtherData).to.equal('custom input');
      expect(result.ExpectedInputJson).to.equal('{}');
      expect(result.InputType).to.equal('JSON');
      expect(result.ExpectedInputXml).to.equal('<xml/>');
      expect(result.SourceObject).to.equal('Account');
      expect(result.IsSourceObjectDefault).to.be.true;
      expect(result.IsProcessSuperBulk).to.be.false;
      expect(result.OutputType).to.equal('SObject');
      expect(result.IsNullInputsIncludedInOutput).to.be.true;
      expect(result.PreprocessorClassName).to.equal('Preprocessor');
      expect(result.SynchronousProcessThreshold).to.equal(500);
      expect(result.RequiredPermission).to.equal('CustomPermission');
      expect(result.IsRollbackOnError).to.be.true;
      expect(result.ResponseCacheType).to.equal('Platform');
      expect(result.PreviewOtherData).to.equal('preview data');
      expect(result.PreviewJsonData).to.equal('{"preview": true}');
      expect(result.PreviewSourceObjectData).to.equal('source preview');
      expect(result.PreviewXmlData).to.equal('<preview/>');
      expect(result.ExpectedOutputOtherData).to.equal('output data');
      expect(result.TargetOutputDocumentIdentifier).to.equal('doc-123');
      expect(result.ExpectedOutputJson).to.equal('{"output": true}');
      expect(result.TargetOutputFileName).to.equal('output.pdf');
      expect(result.ExpectedOutputXml).to.equal('<output/>');
      expect(result.ResponseCacheTtlMinutes).to.equal(60);
      expect(result.Type).to.equal('Transform');
      expect(result.IsAssignmentRulesUsed).to.be.false;
      expect(result.XmlOutputTagsOrder).to.equal('ordered');
      expect(result.IsXmlDeclarationRemoved).to.be.true;
      expect(result.GlobalKey).to.equal('global-key-123');
      expect(result.IsActive).to.be.true; // Always set to true during migration
    });
  });

  describe('Standard Data Model - Field Access and Validation', () => {
    it('should use correct field keys for Standard Data Model bundle fields', () => {
      // Test getBundleFieldKey method behavior for Standard Data Model
      const fieldKey = (dataRaptorTool as any).getBundleFieldKey('Type__c');
      expect(fieldKey).to.equal('Type'); // Should map to standard field

      const descriptionKey = (dataRaptorTool as any).getBundleFieldKey('Description__c');
      expect(descriptionKey).to.equal('Description');

      const batchSizeKey = (dataRaptorTool as any).getBundleFieldKey('BatchSize__c');
      expect(batchSizeKey).to.equal('BatchSize');
    });

    it('should validate DRBundle and DRMapItem mappings are correctly imported', () => {
      // Verify key field mappings exist
      expect(DRBundleMappings['Name']).to.equal('Name');
      expect(DRBundleMappings['Type__c']).to.equal('Type');
      expect(DRBundleMappings['Description__c']).to.equal('Description');
      expect(DRBundleMappings['BatchSize__c']).to.equal('BatchSize');
      expect(DRBundleMappings['GlobalKey__c']).to.equal('GlobalKey');

      expect(DRMapItemMappings['Name']).to.equal('Name');
      expect(DRMapItemMappings['Formula__c']).to.equal('FormulaExpression');
      expect(DRMapItemMappings['InterfaceFieldAPIName__c']).to.equal('InputFieldName');
      expect(DRMapItemMappings['DomainObjectFieldAPIName__c']).to.equal('OutputFieldName');
      expect(DRMapItemMappings['GlobalKey__c']).to.equal('GlobalKey');
    });

    it('should use getBundleFieldKey method for field access', () => {
      // Test getBundleFieldKey behavior for different field names
      const typeKey = (dataRaptorTool as any).getBundleFieldKey('Type__c');
      const descKey = (dataRaptorTool as any).getBundleFieldKey('Description__c');
      const inputClassKey = (dataRaptorTool as any).getBundleFieldKey('CustomInputClass__c');

      // For Standard Data Model, should return mapped field names
      expect(typeKey).to.equal('Type');
      expect(descKey).to.equal('Description');
      expect(inputClassKey).to.equal('InputParsingClass');
    });
  });
});
