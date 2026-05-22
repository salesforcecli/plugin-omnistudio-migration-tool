/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { OmniScriptMigrationTool, OmniScriptExportType } from '../../src/migration/omniscript';
import { CustomCssRegistry } from '../../src/migration/CustomCssRegistry';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';

/**
 * Integration tests for `processOmniScript`'s stylesheet-namespace scan path.
 * Runs against the standard data model so we can use plain field names
 * (PropertySetConfig, Type, SubType, …) instead of namespaced versions.
 */
describe('OmniScript — Custom CSS namespace scan', () => {
  let omniScriptTool: OmniScriptMigrationTool;
  let mockConnection: any;
  let mockMessages: any;
  let queryCount: number;
  let requestCount: number;

  /** A reusable mock that lets the test customise per-call query/request behaviour. */
  const STATIC_RESOURCE_NAME_REGEX = /FROM StaticResource WHERE Name = '([^']+)'/;
  const STATIC_RESOURCE_ID_REGEX = /StaticResource\/([^/]+)\/Body/;

  function setupMockConnection(opts: {
    staticResources?: { [name: string]: { Id: string; ContentType: string; BodyLength: number } };
    bodies?: { [id: string]: any };
  }) {
    queryCount = 0;
    requestCount = 0;
    mockConnection = {
      // Standard query returns nothing unless overridden by the test (we only need
      // the StaticResource branch here).
      query: (sql: string) => {
        queryCount++;
        // Look for a StaticResource Name = 'xxx' filter and return that record if known.
        const match = STATIC_RESOURCE_NAME_REGEX.exec(sql);
        if (match && opts.staticResources && opts.staticResources[match[1]]) {
          const r = opts.staticResources[match[1]];
          return Promise.resolve({
            totalSize: 1,
            records: [{ Id: r.Id, Name: match[1], ContentType: r.ContentType, BodyLength: r.BodyLength }],
          });
        }
        return Promise.resolve({ totalSize: 0, records: [] });
      },
      request: (req: any) => {
        requestCount++;
        const url = req.url || '';
        const idMatch = STATIC_RESOURCE_ID_REGEX.exec(url);
        const id = idMatch ? idMatch[1] : '';
        return Promise.resolve(opts.bodies?.[id] ?? '');
      },
      getApiVersion: () => '60.0',
    };
  }

  beforeEach(() => {
    NameMappingRegistry.getInstance().clear();
    CustomCssRegistry.getInstance().reset();

    const mockOrgDetails: OmnistudioOrgDetails = {
      packageDetails: { version: '1.0.0', namespace: 'omnistudio' },
      omniStudioOrgPermissionEnabled: true, // forces standard data model
      orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
      dataModel: 'Standard',
      hasValidNamespace: true,
      isFoundationPackage: false,
      isOmnistudioMetadataAPIEnabled: false,
    };
    initializeDataModelService(mockOrgDetails);

    setupMockConnection({});

    mockMessages = {
      getMessage: (key: string, args?: string[]) => {
        if (key === 'customCssStylesheetNamespaceWarningOmniScript') {
          return `Custom CSS stylesheet '${args?.[0]}' has namespace references, OmniScript styles may break after migration.`;
        }
        if (key === 'customCssStylesheetNamespaceWarningFlexCard') {
          return `Custom CSS stylesheet '${args?.[0]}' has namespace references, FlexCard styles may break after migration.`;
        }
        if (key === 'customCssInlineNamespaceWarning') {
          return 'Custom inline CSS has namespace references, styles may break after migration.';
        }
        return `Mock message: ${key}`;
      },
    };
  });

  function makeTool(namespace: string): OmniScriptMigrationTool {
    return new OmniScriptMigrationTool(
      OmniScriptExportType.All,
      namespace,
      mockConnection,
      {} as any,
      mockMessages,
      {} as any,
      false
    );
  }

  function makeOmniscript(propertySetConfig: any) {
    return {
      Id: 'op-css-1',
      Name: 'TestCssOS',
      Type: 'TestType',
      SubType: 'TestSubType',
      Language: 'English',
      VersionNumber: '1',
      IsIntegrationProcedure: false,
      IsWebCompEnabled: true,
      IsActive: true,
      PropertySetConfig: JSON.stringify(propertySetConfig),
    };
  }

  it('emits a warning and escalates status to NMI when the stylesheet body contains the namespace', async () => {
    setupMockConnection({
      staticResources: {
        myCustomCss: { Id: '081SR1', ContentType: 'text/css', BodyLength: 30 },
      },
      bodies: {
        '081SR1': '.vlocity_cmt-card { display: none; }',
      },
    });
    omniScriptTool = makeTool('vlocity_cmt');
    (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve([]);

    const os = makeOmniscript({
      stylesheet: { lightning: 'myCustomCss', newport: '', lightningRtl: '', newportRtl: '' },
    });
    const result = await (omniScriptTool as any).processOmniScript(
      os,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      new Map<string, string>()
    );

    expect(result.warnings.some((w: string) => w.includes("'myCustomCss'"))).to.equal(true);
    // OmniScript-specific phrasing so reportingHelper resolves the OmniScript CTA URL.
    expect(result.warnings.some((w: string) => w.includes('OmniScript styles'))).to.equal(true);
    expect(result.migrationStatus).to.equal('Needs manual intervention');
  });

  it('does not warn when the stylesheet body has no namespace match', async () => {
    setupMockConnection({
      staticResources: {
        safeCss: { Id: '081SR2', ContentType: 'text/css', BodyLength: 30 },
      },
      bodies: { '081SR2': '.something-else { color: red; }' },
    });
    omniScriptTool = makeTool('vlocity_cmt');
    (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve([]);

    const os = makeOmniscript({
      stylesheet: { lightning: 'safeCss', newport: '', lightningRtl: '', newportRtl: '' },
    });
    const result = await (omniScriptTool as any).processOmniScript(
      os,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      new Map<string, string>()
    );

    expect(result.warnings.find((w: string) => w.includes('namespace references'))).to.equal(undefined);
    expect(result.migrationStatus).to.equal('Ready for migration');
  });

  it('skips silently when the referenced StaticResource does not exist', async () => {
    setupMockConnection({}); // no records
    omniScriptTool = makeTool('vlocity_cmt');
    (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve([]);

    const os = makeOmniscript({
      stylesheet: { lightning: 'doesNotExist', newport: '', lightningRtl: '', newportRtl: '' },
    });
    const result = await (omniScriptTool as any).processOmniScript(
      os,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      new Map<string, string>()
    );

    expect(result.warnings.find((w: string) => w.includes('namespace references'))).to.equal(undefined);
    expect(result.migrationStatus).to.equal('Ready for migration');
    // SOQL was issued, but no body fetch.
    expect(requestCount).to.equal(0);
  });

  it('does not run any SOQL or REST when namespace is empty', async () => {
    setupMockConnection({});
    omniScriptTool = makeTool(''); // empty namespace → registry disabled
    (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve([]);

    const os = makeOmniscript({
      stylesheet: { lightning: 'whatever', newport: '', lightningRtl: '', newportRtl: '' },
    });
    await (omniScriptTool as any).processOmniScript(
      os,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      new Map<string, string>()
    );

    expect(queryCount).to.equal(0);
    expect(requestCount).to.equal(0);
  });

  it('caches the resource: scanning the same name across two OmniScripts triggers only one SOQL + one fetch', async () => {
    setupMockConnection({
      staticResources: {
        sharedCss: { Id: '081SR3', ContentType: 'text/css', BodyLength: 30 },
      },
      bodies: { '081SR3': '.vlocity_cmt-x {}' },
    });
    omniScriptTool = makeTool('vlocity_cmt');
    (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve([]);

    const os1 = makeOmniscript({
      stylesheet: { lightning: 'sharedCss', newport: '', lightningRtl: '', newportRtl: '' },
    });
    const os2 = {
      ...makeOmniscript({ stylesheet: { lightning: 'sharedCss', newport: '', lightningRtl: '', newportRtl: '' } }),
      Id: 'op-css-2',
      Name: 'OtherOS',
    };

    const r1 = await (omniScriptTool as any).processOmniScript(
      os1,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      new Map<string, string>()
    );
    const r2 = await (omniScriptTool as any).processOmniScript(
      os2,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      new Map<string, string>()
    );

    expect(r1.warnings.some((w: string) => w.includes("'sharedCss'"))).to.equal(true);
    expect(r2.warnings.some((w: string) => w.includes("'sharedCss'"))).to.equal(true);
    // SOQL is invoked once for the StaticResource lookup. Other SOQLs may run
    // (for OmniScript element retrieval, e.g.), so we only assert the request
    // (body fetch) count, which is dedicated to StaticResource bodies.
    expect(requestCount).to.equal(1);
  });

  it('skips the scan entirely when PropertySetConfig has no stylesheet block', async () => {
    setupMockConnection({});
    omniScriptTool = makeTool('vlocity_cmt');
    (omniScriptTool as any).getAllElementsForOmniScript = () => Promise.resolve([]);

    const os = makeOmniscript({
      // no stylesheet key, just unrelated config
      persistentComponent: [],
    });
    const result = await (omniScriptTool as any).processOmniScript(
      os,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      new Map<string, string>()
    );

    expect(result.warnings.find((w: string) => w.includes('namespace references'))).to.equal(undefined);
    expect(requestCount).to.equal(0);
  });
});
