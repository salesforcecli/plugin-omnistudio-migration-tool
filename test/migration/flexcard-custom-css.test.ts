/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { CardMigrationTool } from '../../src/migration/flexcard';
import { CustomCssRegistry } from '../../src/migration/CustomCssRegistry';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';

/**
 * Integration tests for FlexCard's two custom-CSS scan paths:
 * 1. `Definition__c.customStyleSheet` → StaticResource lookup + scan (cached)
 * 2. `Styles__c.customStyles`         → raw inline-CSS substring check
 *
 * Runs against the standard data model so we use the unprefixed field names
 * (PropertySetConfig, StylingConfiguration, …).
 */
describe('FlexCard — Custom CSS namespace scan', () => {
  let cardTool: CardMigrationTool;
  let mockConnection: any;
  let mockMessages: any;
  let requestCount: number;

  const STATIC_RESOURCE_NAME_REGEX = /FROM StaticResource WHERE Name = '([^']+)'/;
  const STATIC_RESOURCE_ID_REGEX = /StaticResource\/([^/]+)\/Body/;

  function setupMockConnection(opts: {
    staticResources?: { [name: string]: { Id: string; ContentType: string; BodyLength: number } };
    bodies?: { [id: string]: any };
  }) {
    requestCount = 0;
    mockConnection = {
      query: (sql: string) => {
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
      omniStudioOrgPermissionEnabled: true, // standard data model
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
        if (key === 'customCssStylesheetNamespaceWarning') {
          return `Custom CSS stylesheet '${args?.[0]}' has namespace references, styles may break after migration.`;
        }
        if (key === 'customCssInlineNamespaceWarning') {
          return 'Custom inline CSS has namespace references, styles may break after migration.';
        }
        if (key === 'cardNameChangeMessage') {
          return `The card name '${args?.[0]}' will be changed to '${args?.[1]}'`;
        }
        return `Mock message: ${key}`;
      },
    };
  });

  function makeTool(namespace: string): CardMigrationTool {
    return new CardMigrationTool(namespace, mockConnection, {} as any, mockMessages, {} as any, false);
  }

  function makeFlexCard(opts: { definition?: any; styles?: any }) {
    const record: any = {
      Id: 'fc-css-1',
      Name: 'CleanFlex',
      AuthorName: 'Tester',
      IsActive: true,
      OmniUiCardType: 'Parent',
      VersionNumber: 1,
    };
    if (opts.definition !== undefined) record.PropertySetConfig = JSON.stringify(opts.definition);
    if (opts.styles !== undefined) record.StylingConfiguration = JSON.stringify(opts.styles);
    return record;
  }

  describe('Definition__c.customStyleSheet (StaticResource path)', () => {
    it('emits a warning and bumps status when the static resource body contains the namespace', async () => {
      setupMockConnection({
        staticResources: { flaggedCss: { Id: '081A1', ContentType: 'text/css', BodyLength: 20 } },
        bodies: { '081A1': '.vlocity_cmt-card {}' },
      });
      cardTool = makeTool('vlocity_cmt');

      const fc = makeFlexCard({
        definition: { states: [], customStyleSheet: 'flaggedCss' },
      });
      const result = await (cardTool as any).processFlexCard(fc, new Set<string>(), new Map<string, string>());

      expect(result.warnings.some((w: string) => w.includes("'flaggedCss'"))).to.equal(true);
      expect(result.migrationStatus).to.equal('Warnings');
    });

    it('does not warn when the static resource body has no namespace match', async () => {
      setupMockConnection({
        staticResources: { safeCss: { Id: '081A2', ContentType: 'text/css', BodyLength: 20 } },
        bodies: { '081A2': '.foo { color: red; }' },
      });
      cardTool = makeTool('vlocity_cmt');

      const fc = makeFlexCard({
        definition: { states: [], customStyleSheet: 'safeCss' },
      });
      const result = await (cardTool as any).processFlexCard(fc, new Set<string>(), new Map<string, string>());

      expect(result.warnings.find((w: string) => w.includes('namespace references'))).to.equal(undefined);
      expect(result.migrationStatus).to.equal('Ready for migration');
    });

    it('skips silently when customStyleSheet references a missing StaticResource', async () => {
      setupMockConnection({}); // no records
      cardTool = makeTool('vlocity_cmt');

      const fc = makeFlexCard({
        definition: { states: [], customStyleSheet: 'doesNotExist' },
      });
      const result = await (cardTool as any).processFlexCard(fc, new Set<string>(), new Map<string, string>());

      expect(result.warnings.find((w: string) => w.includes('namespace references'))).to.equal(undefined);
      expect(result.migrationStatus).to.equal('Ready for migration');
      expect(requestCount).to.equal(0);
    });

    it('skips entirely when customStyleSheet is empty/missing', async () => {
      setupMockConnection({});
      cardTool = makeTool('vlocity_cmt');

      const fc = makeFlexCard({
        definition: { states: [] }, // no customStyleSheet key
      });
      await (cardTool as any).processFlexCard(fc, new Set<string>(), new Map<string, string>());

      // No StaticResource SOQL should have been issued.
      expect(requestCount).to.equal(0);
    });
  });

  describe('Styles__c.customStyles (inline CSS path)', () => {
    it('emits the inline-CSS warning when customStyles contains the namespace', async () => {
      setupMockConnection({});
      cardTool = makeTool('vlocity_cmt');

      const fc = makeFlexCard({
        definition: { states: [] },
        styles: { customStyles: '.vlocity_cmt-foo { display: none; }' },
      });
      const result = await (cardTool as any).processFlexCard(fc, new Set<string>(), new Map<string, string>());

      expect(result.warnings.some((w: string) => w.includes('Custom inline CSS'))).to.equal(true);
      expect(result.migrationStatus).to.equal('Warnings');
      // Pure substring match — no SOQL, no REST.
      expect(requestCount).to.equal(0);
    });

    it('does not warn when customStyles has no namespace match', async () => {
      setupMockConnection({});
      cardTool = makeTool('vlocity_cmt');

      const fc = makeFlexCard({
        definition: { states: [] },
        styles: { customStyles: '.classxyz { color: red; }' },
      });
      const result = await (cardTool as any).processFlexCard(fc, new Set<string>(), new Map<string, string>());

      expect(result.warnings.find((w: string) => w.includes('namespace references'))).to.equal(undefined);
      expect(result.migrationStatus).to.equal('Ready for migration');
    });

    it('skips when Styles__c is missing entirely', async () => {
      setupMockConnection({});
      cardTool = makeTool('vlocity_cmt');

      const fc = makeFlexCard({
        definition: { states: [] },
        // no styles key
      });
      const result = await (cardTool as any).processFlexCard(fc, new Set<string>(), new Map<string, string>());

      expect(result.warnings.find((w: string) => w.includes('Custom inline CSS'))).to.equal(undefined);
    });

    it('skips when customStyles is an empty string', async () => {
      setupMockConnection({});
      cardTool = makeTool('vlocity_cmt');

      const fc = makeFlexCard({
        definition: { states: [] },
        styles: { customStyles: '' },
      });
      const result = await (cardTool as any).processFlexCard(fc, new Set<string>(), new Map<string, string>());

      expect(result.warnings.find((w: string) => w.includes('Custom inline CSS'))).to.equal(undefined);
    });
  });

  describe('Combined: both paths can fire on the same FlexCard', () => {
    it('emits two warnings when both Definition stylesheet AND inline CSS match', async () => {
      setupMockConnection({
        staticResources: { flaggedCss: { Id: '081A1', ContentType: 'text/css', BodyLength: 20 } },
        bodies: { '081A1': '.vlocity_cmt-card {}' },
      });
      cardTool = makeTool('vlocity_cmt');

      const fc = makeFlexCard({
        definition: { states: [], customStyleSheet: 'flaggedCss' },
        styles: { customStyles: '.vlocity_cmt-foo {}' },
      });
      const result = await (cardTool as any).processFlexCard(fc, new Set<string>(), new Map<string, string>());

      expect(result.warnings.filter((w: string) => w.includes('namespace references')).length).to.equal(2);
      expect(result.warnings.some((w: string) => w.includes("'flaggedCss'"))).to.equal(true);
      expect(result.warnings.some((w: string) => w.includes('Custom inline CSS'))).to.equal(true);
      expect(result.migrationStatus).to.equal('Warnings');
    });
  });

  describe('Empty namespace short-circuits both paths', () => {
    it('runs no SOQL and no REST when namespace is empty, even with both inputs present', async () => {
      setupMockConnection({});
      cardTool = makeTool(''); // empty namespace → registry disabled

      const fc = makeFlexCard({
        definition: { states: [], customStyleSheet: 'something' },
        styles: { customStyles: '.vlocity_cmt-foo {}' },
      });
      const result = await (cardTool as any).processFlexCard(fc, new Set<string>(), new Map<string, string>());

      // No CSS warning should be emitted, and no StaticResource lookup should happen.
      expect(result.warnings.find((w: string) => w.includes('namespace references'))).to.equal(undefined);
      expect(requestCount).to.equal(0);
    });
  });
});
