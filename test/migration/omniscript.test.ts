/* eslint-disable */
/// <reference types="mocha" />
import { expect } from 'chai';
import * as sinon from 'sinon';
import { OmniScriptMigrationTool, OmniScriptExportType } from '../../src/migration/omniscript';
import { DebugTimer } from '../../src/utils/logging/debugtimer';
import { Logger } from '../../src/utils/logger';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { CustomCssRegistry } from '../../src/migration/CustomCssRegistry';

describe('OmniScriptMigrationTool - Remote Action PreHook/PostHook', () => {
  let sandbox: sinon.SinonSandbox;
  let mockConnection: any;
  let mockMessages: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    DebugTimer.getInstance().start();
    NameMappingRegistry.getInstance().clear();
    CustomCssRegistry.getInstance().reset();

    // Initialize DataModelService with custom (non-standard) data model
    initializeDataModelService({
      packageDetails: { version: '1.0.0', namespace: 'vlocity_ins' },
      omniStudioOrgPermissionEnabled: false,
      orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
      dataModel: 'Custom',
      hasValidNamespace: true,
      isFoundationPackage: false,
      isOmnistudioMetadataAPIEnabled: false,
    } as any);

    // Stub static Logger methods
    sandbox.stub(Logger, 'log');
    sandbox.stub(Logger, 'warn');
    sandbox.stub(Logger, 'info');
    sandbox.stub(Logger, 'logVerbose');
    sandbox.stub(Logger, 'error');

    mockConnection = {
      query: sandbox.stub(),
      queryMore: sandbox.stub(),
    };

    mockMessages = {
      getMessage: sandbox.stub().returns(''),
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  function createTool(namespace: string = 'vlocity_ins'): OmniScriptMigrationTool {
    return new OmniScriptMigrationTool(
      OmniScriptExportType.IP,
      namespace,
      mockConnection,
      {} as any,
      mockMessages,
      {} as any,
      false
    );
  }

  function createRemoteActionElement(
    namespace: string,
    remoteOptions: Record<string, any> = {},
    remoteClass: string = 'CpqAppHandler'
  ): Record<string, any> {
    const prefix = namespace ? namespace + '__' : '';
    return {
      Id: 'elemId001',
      [`${prefix}Type__c`]: 'Remote Action',
      [`${prefix}PropertySet__c`]: JSON.stringify({ remoteOptions, remoteClass }),
      [`${prefix}OmniScriptId__c`]: 'osId001',
      [`${prefix}Level__c`]: 0,
      [`${prefix}ParentElementId__c`]: null,
      [`${prefix}Name__c`]: 'TestRemoteAction',
      Name: 'TestRemoteAction',
      [`${prefix}Active__c`]: true,
      [`${prefix}Order__c`]: 1,
      [`${prefix}SearchKey__c`]: '',
      [`${prefix}InternalNotes__c`]: '',
    };
  }

  function createNonRemoteActionElement(
    namespace: string,
    elementType: string = 'DataRaptor Extract Action'
  ): Record<string, any> {
    const prefix = namespace ? namespace + '__' : '';
    return {
      Id: 'elemId002',
      [`${prefix}Type__c`]: elementType,
      [`${prefix}PropertySet__c`]: JSON.stringify({
        remoteOptions: { preTransformBundle: 'MyBundle', postTransformBundle: 'OtherBundle' },
        bundle: 'TestBundle',
      }),
      [`${prefix}OmniScriptId__c`]: 'osId001',
      [`${prefix}Level__c`]: 0,
      [`${prefix}ParentElementId__c`]: null,
      [`${prefix}Name__c`]: 'TestDRAction',
      Name: 'TestDRAction',
      [`${prefix}Active__c`]: true,
      [`${prefix}Order__c`]: 2,
      [`${prefix}SearchKey__c`]: '',
      [`${prefix}InternalNotes__c`]: '',
    };
  }

  describe('migrate() with CpqAppHandlerHook registered', () => {
    it('should set PreHook=true and PostHook=true on Remote Action elements', async () => {
      const namespace = 'vlocity_ins';
      const tool = createTool(namespace);

      mockConnection.query.callsFake((soql: string) => {
        if (soql.includes('CustomClassImplementation__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [{ Id: 'hookId001', Name: 'CpqAppHandlerHook' }],
            done: true,
          });
        }
        if (soql.includes('OmniScript__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [
              {
                Id: 'osId001',
                [`${namespace}__Type__c`]: 'TestType',
                [`${namespace}__SubType__c`]: 'TestSubType',
                [`${namespace}__Language__c`]: 'English',
                [`${namespace}__Version__c`]: 1,
                [`${namespace}__IsActive__c`]: false,
                [`${namespace}__IsProcedure__c`]: true,
              },
            ],
          });
        }
        if (soql.includes('Element__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [createRemoteActionElement(namespace)],
          });
        }
        if (soql.includes('OmniScriptDefinition__c')) {
          return Promise.resolve({ totalSize: 0, records: [] });
        }
        return Promise.resolve({ totalSize: 0, records: [] });
      });

      const { NetUtils } = require('../../src/utils/net');
      const createStub = sandbox.stub(NetUtils, 'create');
      const createOneStub = sandbox.stub(NetUtils, 'createOne');

      createOneStub.resolves({
        id: 'newOsId001',
        success: true,
        errors: [],
        warnings: [],
      });

      let capturedElements: any[] = [];
      createStub.callsFake((_conn: any, objectName: string, records: any[]) => {
        if (objectName === 'OmniProcessElement') {
          capturedElements = records;
        }
        const resultMap = new Map();
        for (const rec of records) {
          resultMap.set(rec.attributes.referenceId, {
            id: 'new_' + rec.attributes.referenceId,
            success: true,
            errors: [],
          });
        }
        return Promise.resolve(resultMap);
      });

      await tool.migrate();

      expect(capturedElements).to.have.lengthOf(1);
      const propertySet = JSON.parse(capturedElements[0].PropertySetConfig);
      expect(propertySet.remoteOptions.PreHook).to.equal(true);
      expect(propertySet.remoteOptions.PostHook).to.equal(true);

      createStub.restore();
      createOneStub.restore();
    });
  });

  describe('migrate() without CpqAppHandlerHook registered', () => {
    it('should not modify remoteOptions on Remote Action elements', async () => {
      const namespace = 'vlocity_ins';
      const tool = createTool(namespace);

      mockConnection.query.callsFake((soql: string) => {
        if (soql.includes('CustomClassImplementation__c')) {
          return Promise.resolve({ totalSize: 0, records: [] });
        }
        if (soql.includes('OmniScript__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [
              {
                Id: 'osId001',
                [`${namespace}__Type__c`]: 'TestType',
                [`${namespace}__SubType__c`]: 'TestSubType',
                [`${namespace}__Language__c`]: 'English',
                [`${namespace}__Version__c`]: 1,
                [`${namespace}__IsActive__c`]: false,
                [`${namespace}__IsProcedure__c`]: true,
              },
            ],
          });
        }
        if (soql.includes('Element__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [createRemoteActionElement(namespace, { someExisting: 'value' })],
          });
        }
        if (soql.includes('OmniScriptDefinition__c')) {
          return Promise.resolve({ totalSize: 0, records: [] });
        }
        return Promise.resolve({ totalSize: 0, records: [] });
      });

      const { NetUtils } = require('../../src/utils/net');
      const createStub = sandbox.stub(NetUtils, 'create');
      const createOneStub = sandbox.stub(NetUtils, 'createOne');

      createOneStub.resolves({
        id: 'newOsId001',
        success: true,
        errors: [],
        warnings: [],
      });

      let capturedElements: any[] = [];
      createStub.callsFake((_conn: any, objectName: string, records: any[]) => {
        if (objectName === 'OmniProcessElement') {
          capturedElements = records;
        }
        const resultMap = new Map();
        for (const rec of records) {
          resultMap.set(rec.attributes.referenceId, {
            id: 'new_' + rec.attributes.referenceId,
            success: true,
            errors: [],
          });
        }
        return Promise.resolve(resultMap);
      });

      await tool.migrate();

      expect(capturedElements).to.have.lengthOf(1);
      const propertySet = JSON.parse(capturedElements[0].PropertySetConfig);
      expect(propertySet.remoteOptions).to.deep.equal({ someExisting: 'value' });
      expect(propertySet.remoteOptions).to.not.have.property('PreHook');
      expect(propertySet.remoteOptions).to.not.have.property('PostHook');

      createStub.restore();
      createOneStub.restore();
    });
  });

  describe('migrate() with hook registered and PreHook/PostHook already true', () => {
    it('should preserve PreHook=true and PostHook=true (idempotent)', async () => {
      const namespace = 'vlocity_ins';
      const tool = createTool(namespace);

      mockConnection.query.callsFake((soql: string) => {
        if (soql.includes('CustomClassImplementation__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [{ Id: 'hookId001', Name: 'CpqAppHandlerHook' }],
            done: true,
          });
        }
        if (soql.includes('OmniScript__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [
              {
                Id: 'osId001',
                [`${namespace}__Type__c`]: 'TestType',
                [`${namespace}__SubType__c`]: 'TestSubType',
                [`${namespace}__Language__c`]: 'English',
                [`${namespace}__Version__c`]: 1,
                [`${namespace}__IsActive__c`]: false,
                [`${namespace}__IsProcedure__c`]: true,
              },
            ],
          });
        }
        if (soql.includes('Element__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [createRemoteActionElement(namespace, { PreHook: true, PostHook: true })],
          });
        }
        if (soql.includes('OmniScriptDefinition__c')) {
          return Promise.resolve({ totalSize: 0, records: [] });
        }
        return Promise.resolve({ totalSize: 0, records: [] });
      });

      const { NetUtils } = require('../../src/utils/net');
      const createStub = sandbox.stub(NetUtils, 'create');
      const createOneStub = sandbox.stub(NetUtils, 'createOne');

      createOneStub.resolves({
        id: 'newOsId001',
        success: true,
        errors: [],
        warnings: [],
      });

      let capturedElements: any[] = [];
      createStub.callsFake((_conn: any, objectName: string, records: any[]) => {
        if (objectName === 'OmniProcessElement') {
          capturedElements = records;
        }
        const resultMap = new Map();
        for (const rec of records) {
          resultMap.set(rec.attributes.referenceId, {
            id: 'new_' + rec.attributes.referenceId,
            success: true,
            errors: [],
          });
        }
        return Promise.resolve(resultMap);
      });

      await tool.migrate();

      expect(capturedElements).to.have.lengthOf(1);
      const propertySet = JSON.parse(capturedElements[0].PropertySetConfig);
      expect(propertySet.remoteOptions.PreHook).to.equal(true);
      expect(propertySet.remoteOptions.PostHook).to.equal(true);

      createStub.restore();
      createOneStub.restore();
    });
  });

  describe('migrate() with non-Remote-Action element type', () => {
    it('should not add PreHook/PostHook to non-Remote-Action elements', async () => {
      const namespace = 'vlocity_ins';
      const tool = createTool(namespace);

      mockConnection.query.callsFake((soql: string) => {
        if (soql.includes('CustomClassImplementation__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [{ Id: 'hookId001', Name: 'CpqAppHandlerHook' }],
            done: true,
          });
        }
        if (soql.includes('OmniScript__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [
              {
                Id: 'osId001',
                [`${namespace}__Type__c`]: 'TestType',
                [`${namespace}__SubType__c`]: 'TestSubType',
                [`${namespace}__Language__c`]: 'English',
                [`${namespace}__Version__c`]: 1,
                [`${namespace}__IsActive__c`]: false,
                [`${namespace}__IsProcedure__c`]: true,
              },
            ],
          });
        }
        if (soql.includes('Element__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [createNonRemoteActionElement(namespace, 'DataRaptor Extract Action')],
          });
        }
        if (soql.includes('OmniScriptDefinition__c')) {
          return Promise.resolve({ totalSize: 0, records: [] });
        }
        return Promise.resolve({ totalSize: 0, records: [] });
      });

      const { NetUtils } = require('../../src/utils/net');
      const createStub = sandbox.stub(NetUtils, 'create');
      const createOneStub = sandbox.stub(NetUtils, 'createOne');

      createOneStub.resolves({
        id: 'newOsId001',
        success: true,
        errors: [],
        warnings: [],
      });

      let capturedElements: any[] = [];
      createStub.callsFake((_conn: any, objectName: string, records: any[]) => {
        if (objectName === 'OmniProcessElement') {
          capturedElements = records;
        }
        const resultMap = new Map();
        for (const rec of records) {
          resultMap.set(rec.attributes.referenceId, {
            id: 'new_' + rec.attributes.referenceId,
            success: true,
            errors: [],
          });
        }
        return Promise.resolve(resultMap);
      });

      await tool.migrate();

      expect(capturedElements).to.have.lengthOf(1);
      const propertySet = JSON.parse(capturedElements[0].PropertySetConfig);
      expect(propertySet.remoteOptions).to.not.have.property('PreHook');
      expect(propertySet.remoteOptions).to.not.have.property('PostHook');

      createStub.restore();
      createOneStub.restore();
    });
  });

  describe('migrate() when CustomClassImplementation__c query fails', () => {
    it('should default to false and not set hooks', async () => {
      const namespace = 'vlocity_ins';
      const tool = createTool(namespace);

      mockConnection.query.callsFake((soql: string) => {
        if (soql.includes('CustomClassImplementation__c')) {
          return Promise.reject(new Error('INVALID_TYPE: sObject type not found'));
        }
        if (soql.includes('OmniScript__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [
              {
                Id: 'osId001',
                [`${namespace}__Type__c`]: 'TestType',
                [`${namespace}__SubType__c`]: 'TestSubType',
                [`${namespace}__Language__c`]: 'English',
                [`${namespace}__Version__c`]: 1,
                [`${namespace}__IsActive__c`]: false,
                [`${namespace}__IsProcedure__c`]: true,
              },
            ],
          });
        }
        if (soql.includes('Element__c')) {
          return Promise.resolve({
            totalSize: 1,
            records: [createRemoteActionElement(namespace)],
          });
        }
        if (soql.includes('OmniScriptDefinition__c')) {
          return Promise.resolve({ totalSize: 0, records: [] });
        }
        return Promise.resolve({ totalSize: 0, records: [] });
      });

      const { NetUtils } = require('../../src/utils/net');
      const createStub = sandbox.stub(NetUtils, 'create');
      const createOneStub = sandbox.stub(NetUtils, 'createOne');

      createOneStub.resolves({
        id: 'newOsId001',
        success: true,
        errors: [],
        warnings: [],
      });

      let capturedElements: any[] = [];
      createStub.callsFake((_conn: any, objectName: string, records: any[]) => {
        if (objectName === 'OmniProcessElement') {
          capturedElements = records;
        }
        const resultMap = new Map();
        for (const rec of records) {
          resultMap.set(rec.attributes.referenceId, {
            id: 'new_' + rec.attributes.referenceId,
            success: true,
            errors: [],
          });
        }
        return Promise.resolve(resultMap);
      });

      await tool.migrate();

      expect((Logger.warn as sinon.SinonStub).calledOnce).to.equal(true);
      expect(capturedElements).to.have.lengthOf(1);
      const propertySet = JSON.parse(capturedElements[0].PropertySetConfig);
      expect(propertySet.remoteOptions).to.not.have.property('PreHook');
      expect(propertySet.remoteOptions).to.not.have.property('PostHook');

      createStub.restore();
      createOneStub.restore();
    });
  });
});
