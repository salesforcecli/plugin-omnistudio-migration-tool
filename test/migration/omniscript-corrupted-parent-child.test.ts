/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { OmniScriptMigrationTool, OmniScriptExportType } from '../../src/migration/omniscript';
import { CustomCssRegistry } from '../../src/migration/CustomCssRegistry';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';

/**
 * Tests for detecting corrupted parent-child level hierarchy in OmniScript elements.
 * W-19747619: Action Block elements that have parent and child persisted at the same level
 * will cause data loss after migration.
 *
 * Uses custom data model (MPD) since the bug occurs in managed package data where
 * fields are namespace-prefixed (e.g., vlocity_cmt__Level__c).
 */
describe('OmniScript — Corrupted Parent-Child Level Detection', () => {
  let omniScriptTool: OmniScriptMigrationTool;
  let mockConnection: any;
  let mockMessages: any;
  const NAMESPACE = 'vlocity_cmt';
  const NS_PREFIX = `${NAMESPACE}__`;

  beforeEach(() => {
    NameMappingRegistry.getInstance().clear();
    CustomCssRegistry.getInstance().reset();

    const mockOrgDetails: OmnistudioOrgDetails = {
      packageDetails: { version: '1.0.0', namespace: NAMESPACE },
      omniStudioOrgPermissionEnabled: false,
      orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
      dataModel: 'Custom',
      hasValidNamespace: true,
      isFoundationPackage: false,
      isOmnistudioMetadataAPIEnabled: false,
    };
    initializeDataModelService(mockOrgDetails);

    mockConnection = {
      query: () => Promise.resolve({ totalSize: 0, records: [] }),
      request: () => Promise.resolve(''),
      getApiVersion: () => '60.0',
    };

    mockMessages = {
      getMessage: (key: string, args?: string[]) => {
        if (key === 'corruptedParentChildLevel') {
          return `${args?.[0]} has elements with corrupted parent-child hierarchy. The following elements have their parent and child persisted at the same level, which will cause data loss after migration: ${args?.[1]}. Create a new version of this ${args?.[2]} to fix the issue before migrating.`;
        }
        return `Mock message: ${key}`;
      },
    };
  });

  function makeTool(): OmniScriptMigrationTool {
    return new OmniScriptMigrationTool(
      OmniScriptExportType.All,
      NAMESPACE,
      mockConnection,
      {} as any,
      mockMessages,
      {} as any,
      false
    );
  }

  function makeOmniscript(overrides?: any) {
    return {
      Id: 'op-parent-child-1',
      Name: 'TestParentChildOS',
      [`${NS_PREFIX}Type__c`]: 'TestType',
      [`${NS_PREFIX}SubType__c`]: 'TestSubType',
      [`${NS_PREFIX}Language__c`]: 'English',
      [`${NS_PREFIX}Version__c`]: '1',
      [`${NS_PREFIX}IsProcedure__c`]: false,
      [`${NS_PREFIX}IsLwcEnabled__c`]: true,
      [`${NS_PREFIX}IsActive__c`]: true,
      [`${NS_PREFIX}PropertySet__c`]: JSON.stringify({}),
      ...overrides,
    };
  }

  /**
   * Creates mock elements with custom (namespace-prefixed) data model field names.
   * Level = 0 is root/parent level, Level > 0 is child level.
   */
  function makeElements(
    elements: Array<{ id: string; name: string; level: number; parentId?: string; type?: string }>
  ) {
    return elements.map((e) => ({
      Id: e.id,
      Name: e.name,
      [`${NS_PREFIX}Level__c`]: e.level,
      [`${NS_PREFIX}ParentElementId__c`]: e.parentId || null,
      [`${NS_PREFIX}Type__c`]: e.type || 'Step',
      [`${NS_PREFIX}PropertySet__c`]: JSON.stringify({}),
      [`${NS_PREFIX}Order__c`]: 1,
      [`${NS_PREFIX}Active__c`]: true,
    }));
  }

  it('detects elements with parent and child at the same level (level 0)', async () => {
    omniScriptTool = makeTool();

    // Simulating corrupted data: Parent Step at level 0, child Action also at level 0
    const corruptedElements = makeElements([
      { id: 'elem-1', name: 'ParentStep', level: 0, type: 'Step' },
      { id: 'elem-2', name: 'ChildAction', level: 0, parentId: 'elem-1', type: 'Integration Procedure Action' },
    ]);

    (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(corruptedElements);

    const os = makeOmniscript();
    const result = await (omniScriptTool as any).processOmniScript(
      os,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      new Map<string, string>()
    );

    expect(result.warnings.some((w: string) => w.includes('corrupted parent-child hierarchy'))).to.equal(true);
    expect(result.warnings.some((w: string) => w.includes('ChildAction'))).to.equal(true);
    expect(result.migrationStatus).to.equal('Needs manual intervention');
  });

  it('does not flag elements with correct parent-child hierarchy', async () => {
    omniScriptTool = makeTool();

    // Valid hierarchy: Parent at level 0, child at level 1
    const validElements = makeElements([
      { id: 'elem-1', name: 'ParentStep', level: 0, type: 'Step' },
      { id: 'elem-2', name: 'ChildAction', level: 1, parentId: 'elem-1', type: 'Integration Procedure Action' },
    ]);

    (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(validElements);

    const os = makeOmniscript();
    const result = await (omniScriptTool as any).processOmniScript(
      os,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      new Map<string, string>()
    );

    expect(result.warnings.some((w: string) => w.includes('corrupted parent-child hierarchy'))).to.equal(false);
  });

  it('does not flag root-level elements without a parent', async () => {
    omniScriptTool = makeTool();

    // Root elements at level 0 without any parent are fine
    const rootElements = makeElements([
      { id: 'elem-1', name: 'Step1', level: 0, type: 'Step' },
      { id: 'elem-2', name: 'Step2', level: 0, type: 'Step' },
    ]);

    (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(rootElements);

    const os = makeOmniscript();
    const result = await (omniScriptTool as any).processOmniScript(
      os,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      new Map<string, string>()
    );

    expect(result.warnings.some((w: string) => w.includes('corrupted parent-child hierarchy'))).to.equal(false);
  });

  it('detects multiple corrupted elements in the same OmniScript', async () => {
    omniScriptTool = makeTool();

    // Multiple children at same level as parent
    const corruptedElements = makeElements([
      { id: 'elem-1', name: 'ParentStep', level: 0, type: 'Step' },
      { id: 'elem-2', name: 'Action1', level: 0, parentId: 'elem-1', type: 'DataRaptor Extract Action' },
      { id: 'elem-3', name: 'Action2', level: 0, parentId: 'elem-1', type: 'Integration Procedure Action' },
      { id: 'elem-4', name: 'ValidChild', level: 1, parentId: 'elem-1', type: 'Remote Action' },
    ]);

    (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(corruptedElements);

    const os = makeOmniscript();
    const result = await (omniScriptTool as any).processOmniScript(
      os,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      new Map<string, string>()
    );

    expect(result.warnings.some((w: string) => w.includes('Action1'))).to.equal(true);
    expect(result.warnings.some((w: string) => w.includes('Action2'))).to.equal(true);
    expect(result.warnings.some((w: string) => w.includes('ValidChild'))).to.equal(false);
    expect(result.migrationStatus).to.equal('Needs manual intervention');
  });

  it('detects corruption at non-zero levels (e.g. parent at level 1, child also at level 1)', async () => {
    omniScriptTool = makeTool();

    // Parent at level 1, child also at level 1
    const corruptedElements = makeElements([
      { id: 'elem-1', name: 'RootStep', level: 0, type: 'Step' },
      { id: 'elem-2', name: 'NestedParent', level: 1, parentId: 'elem-1', type: 'Step' },
      { id: 'elem-3', name: 'CorruptedChild', level: 1, parentId: 'elem-2', type: 'Rest Action' },
    ]);

    (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve(corruptedElements);

    const os = makeOmniscript();
    const result = await (omniScriptTool as any).processOmniScript(
      os,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      new Map<string, string>()
    );

    expect(result.warnings.some((w: string) => w.includes('CorruptedChild'))).to.equal(true);
    expect(result.migrationStatus).to.equal('Needs manual intervention');
  });

  it('tests the detectCorruptedParentChildElements helper method directly', () => {
    omniScriptTool = makeTool();

    const elements = makeElements([
      { id: 'elem-1', name: 'ParentStep', level: 0, type: 'Step' },
      { id: 'elem-2', name: 'CorruptedAction', level: 0, parentId: 'elem-1', type: 'Integration Procedure Action' },
      { id: 'elem-3', name: 'ValidChild', level: 1, parentId: 'elem-1', type: 'Remote Action' },
      { id: 'elem-4', name: 'AnotherRoot', level: 0, type: 'Step' },
    ]);

    const result = (omniScriptTool as any).detectCorruptedParentChildElements(elements);

    expect(result.size).to.equal(1);
    expect(result.has('CorruptedAction')).to.equal(true);
    expect(result.has('ValidChild')).to.equal(false);
    expect(result.has('ParentStep')).to.equal(false);
  });
});
