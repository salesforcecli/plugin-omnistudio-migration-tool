/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { CustomCssRegistry } from '../../src/migration/CustomCssRegistry';
// jszip ships CommonJS — require() exposes the constructor at the top level.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip');

/**
 * Builds a minimal `connection` double with `query` + `request` stubs that the
 * registry calls. `query` is invoked by `QueryTools.query()` and must return
 * `{ totalSize, records }`. `request` is the REST blob fetch.
 */
function buildMockConnection(opts: {
  records?: any[];
  body?: any;
  apiVersion?: string;
  onQuery?: (sql: string) => void;
  onRequest?: (req: any) => void;
}) {
  return {
    query: (sql: string) => {
      if (opts.onQuery) opts.onQuery(sql);
      const records = opts.records ?? [];
      return Promise.resolve({ totalSize: records.length, records });
    },
    request: (req: any) => {
      if (opts.onRequest) opts.onRequest(req);
      return Promise.resolve(opts.body ?? '');
    },
    getApiVersion: () => opts.apiVersion ?? '60.0',
  };
}

function buildMockMessages(): any {
  return {
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
}

describe('CustomCssRegistry', () => {
  let registry: CustomCssRegistry;

  beforeEach(() => {
    registry = CustomCssRegistry.getInstance();
    registry.reset();
  });

  describe('init() / isEnabled() / reset()', () => {
    it('isEnabled returns false before init', () => {
      expect(registry.isEnabled()).to.equal(false);
    });

    it('isEnabled returns true once connection and namespace are configured', () => {
      const conn = buildMockConnection({});
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());
      expect(registry.isEnabled()).to.equal(true);
    });

    it('isEnabled stays false when namespace is empty even if connection is set', () => {
      const conn = buildMockConnection({});
      registry.init(conn as any, '', buildMockMessages());
      expect(registry.isEnabled()).to.equal(false);
    });

    it('init is idempotent — second init does not overwrite the first', () => {
      const conn1 = buildMockConnection({});
      const conn2 = buildMockConnection({});
      registry.init(conn1 as any, 'vlocity_cmt', buildMockMessages());
      registry.init(conn2 as any, 'somethingElse', buildMockMessages());
      // First connection wins; second init is a no-op
      expect((registry as any).connection).to.equal(conn1);
      expect((registry as any).namespace).to.equal('vlocity_cmt');
    });

    it('reset clears connection, namespace, messages, and cache', async () => {
      const conn = buildMockConnection({
        records: [{ Id: '081xx', Name: 'foo', ContentType: 'text/css', BodyLength: 10 }],
        body: 'body { color: red; }',
      });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());
      await registry.scanResource('foo');
      expect((registry as any).cache.size).to.equal(1);

      registry.reset();
      expect(registry.isEnabled()).to.equal(false);
      expect((registry as any).cache.size).to.equal(0);
    });
  });

  describe('scanResource() — text/css body', () => {
    it('returns namespaceFound when body contains the namespace', async () => {
      const conn = buildMockConnection({
        records: [{ Id: '081xx', Name: 'foo', ContentType: 'text/css', BodyLength: 30 }],
        body: '.vlocity_cmt-card-title { color: red; }',
      });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());
      const verdict = await registry.scanResource('foo');
      expect(verdict).to.equal('namespaceFound');
    });

    it('returns noNamespaceRef when body does not contain the namespace', async () => {
      const conn = buildMockConnection({
        records: [{ Id: '081xx', Name: 'foo', ContentType: 'text/css', BodyLength: 25 }],
        body: '.something-else { color: red; }',
      });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());
      const verdict = await registry.scanResource('foo');
      expect(verdict).to.equal('noNamespaceRef');
    });

    it('returns notFound when SOQL returns zero rows', async () => {
      const conn = buildMockConnection({ records: [] });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());
      const verdict = await registry.scanResource('missing_resource');
      expect(verdict).to.equal('notFound');
    });

    it('handles a Buffer response by decoding to utf8', async () => {
      const buf = Buffer.from('.vlocity_cmt-foo {}', 'utf8');
      const conn = buildMockConnection({
        records: [{ Id: '081xx', Name: 'foo', ContentType: 'text/css', BodyLength: buf.length }],
        body: buf,
      });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());
      const verdict = await registry.scanResource('foo');
      expect(verdict).to.equal('namespaceFound');
    });
  });

  describe('scanResource() — caching', () => {
    it('does not re-query or re-fetch the same resource on the second call', async () => {
      let queryCount = 0;
      let requestCount = 0;
      const conn = buildMockConnection({
        records: [{ Id: '081xx', Name: 'foo', ContentType: 'text/css', BodyLength: 5 }],
        body: 'body{}',
        onQuery: () => queryCount++,
        onRequest: () => requestCount++,
      });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());

      const v1 = await registry.scanResource('foo');
      const v2 = await registry.scanResource('foo');

      expect(v1).to.equal('noNamespaceRef');
      expect(v2).to.equal('noNamespaceRef');
      expect(queryCount).to.equal(1);
      expect(requestCount).to.equal(1);
    });

    it('caches notFound verdicts so missing resources are not re-queried', async () => {
      let queryCount = 0;
      const conn = buildMockConnection({
        records: [],
        onQuery: () => queryCount++,
      });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());

      await registry.scanResource('missing');
      await registry.scanResource('missing');
      expect(queryCount).to.equal(1);
    });
  });

  describe('scanResource() — application/zip body', () => {
    it('returns namespaceFound when any .css entry inside the zip contains the namespace', async () => {
      const zip = new JSZip();
      zip.file('themes/lightning.css', '.vlocity_cmt-foo { display: none; }');
      const buf: Buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const conn = buildMockConnection({
        records: [{ Id: '081xx', Name: 'bundle', ContentType: 'application/zip', BodyLength: buf.length }],
        body: buf,
      });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());
      const verdict = await registry.scanResource('bundle');
      expect(verdict).to.equal('namespaceFound');
    });

    it('returns noNamespaceRef when zip has only namespace-free .css entries', async () => {
      const zip = new JSZip();
      zip.file('themes/lightning.css', '.foo { color: red; }');
      zip.file('themes/notes.txt', 'this is not css');
      const buf: Buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const conn = buildMockConnection({
        records: [{ Id: '081xx', Name: 'bundle', ContentType: 'application/zip', BodyLength: buf.length }],
        body: buf,
      });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());
      const verdict = await registry.scanResource('bundle');
      expect(verdict).to.equal('noNamespaceRef');
    });
  });

  describe('scanResource() — unsupported and error paths', () => {
    it('returns unsupported for binary content types', async () => {
      const conn = buildMockConnection({
        records: [{ Id: '081xx', Name: 'image', ContentType: 'image/png', BodyLength: 99 }],
        body: '',
      });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());
      const verdict = await registry.scanResource('image');
      expect(verdict).to.equal('unsupported');
    });

    it('returns unsupported when the body fetch throws', async () => {
      const conn: any = {
        query: () =>
          Promise.resolve({
            totalSize: 1,
            records: [{ Id: '081xx', Name: 'foo', ContentType: 'text/css', BodyLength: 10 }],
          }),
        request: () => Promise.reject(new Error('network down')),
        getApiVersion: () => '60.0',
      };
      registry.init(conn, 'vlocity_cmt', buildMockMessages());
      const verdict = await registry.scanResource('foo');
      expect(verdict).to.equal('unsupported');
    });

    it('returns notFound for an empty resourceName without contacting the org', async () => {
      let queryCount = 0;
      const conn = buildMockConnection({ onQuery: () => queryCount++ });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());
      const verdict = await registry.scanResource('');
      expect(verdict).to.equal('notFound');
      expect(queryCount).to.equal(0);
    });

    it('returns unsupported (and does not query) when called pre-init', async () => {
      // Registry has been reset() in beforeEach, so it's pre-init here.
      const verdict = await registry.scanResource('foo');
      expect(verdict).to.equal('unsupported');
    });
  });

  describe('scanOmniScriptStylesheets()', () => {
    it('returns empty result when registry is not enabled', async () => {
      const result = await registry.scanOmniScriptStylesheets({ lightning: 'foo', newport: 'bar' });
      expect(result.stylesheetsWithNamespaceRefs).to.deep.equal([]);
    });

    it('returns empty result when stylesheet object is missing or non-object', async () => {
      const conn = buildMockConnection({});
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());

      const r1 = await registry.scanOmniScriptStylesheets(undefined);
      const r2 = await registry.scanOmniScriptStylesheets(null);
      const r3 = await registry.scanOmniScriptStylesheets('a string');
      expect(r1.stylesheetsWithNamespaceRefs).to.deep.equal([]);
      expect(r2.stylesheetsWithNamespaceRefs).to.deep.equal([]);
      expect(r3.stylesheetsWithNamespaceRefs).to.deep.equal([]);
    });

    it('skips empty / falsy variant names', async () => {
      let queryCount = 0;
      const conn = buildMockConnection({
        records: [],
        onQuery: () => queryCount++,
      });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());

      await registry.scanOmniScriptStylesheets({
        lightning: '',
        newport: null,
        lightningRtl: undefined,
        newportRtl: '   ', // whitespace-only
      });
      expect(queryCount).to.equal(0);
    });

    it('dedupes a stylesheet referenced from multiple variants and only queries once', async () => {
      const conn = buildMockConnection({
        records: [{ Id: '081xx', Name: 'sharedSheet', ContentType: 'text/css', BodyLength: 30 }],
        body: '.vlocity_cmt-foo {}',
      });
      registry.init(conn as any, 'vlocity_cmt', buildMockMessages());

      // Both variants point at the same resource — cache prevents two SOQLs and
      // the result array collapses the duplicate.
      let queryCount = 0;
      (conn as any).query = () => {
        queryCount++;
        return Promise.resolve({
          totalSize: 1,
          records: [{ Id: '081xx', Name: 'sharedSheet', ContentType: 'text/css', BodyLength: 30 }],
        });
      };

      const result = await registry.scanOmniScriptStylesheets({
        lightning: 'sharedSheet',
        newport: 'sharedSheet',
        lightningRtl: '',
        newportRtl: '',
      });

      expect(result.stylesheetsWithNamespaceRefs).to.deep.equal(['sharedSheet']);
      expect(queryCount).to.equal(1);
    });
  });

  describe('buildOmniScriptNamespaceWarning() / buildFlexCardNamespaceWarning() / buildInlineCssNamespaceWarning()', () => {
    it('returns null when not configured', () => {
      expect(registry.buildOmniScriptNamespaceWarning('foo')).to.equal(null);
      expect(registry.buildFlexCardNamespaceWarning('foo')).to.equal(null);
      expect(registry.buildInlineCssNamespaceWarning()).to.equal(null);
    });

    it('returns the OmniScript-specific stylesheet warning with the resource name interpolated', () => {
      registry.init(buildMockConnection({}) as any, 'vlocity_cmt', buildMockMessages());
      const msg = registry.buildOmniScriptNamespaceWarning('foo');
      expect(msg).to.include("'foo'");
      expect(msg).to.include('OmniScript styles');
      expect(msg).to.include('namespace references');
    });

    it('returns the FlexCard-specific stylesheet warning with the resource name interpolated', () => {
      registry.init(buildMockConnection({}) as any, 'vlocity_cmt', buildMockMessages());
      const msg = registry.buildFlexCardNamespaceWarning('foo');
      expect(msg).to.include("'foo'");
      expect(msg).to.include('FlexCard styles');
      expect(msg).to.include('namespace references');
    });

    it('keeps the OmniScript and FlexCard messages distinct so reportingHelper can resolve different CTAs', () => {
      registry.init(buildMockConnection({}) as any, 'vlocity_cmt', buildMockMessages());
      const os = registry.buildOmniScriptNamespaceWarning('shared');
      const fc = registry.buildFlexCardNamespaceWarning('shared');
      expect(os).to.not.equal(fc);
    });

    it('returns the inline-CSS warning without interpolating a name', () => {
      registry.init(buildMockConnection({}) as any, 'vlocity_cmt', buildMockMessages());
      const msg = registry.buildInlineCssNamespaceWarning();
      expect(msg).to.include('Custom inline CSS');
      expect(msg).to.include('namespace references');
    });
  });

  describe('containsNamespaceInText()', () => {
    it('returns false when registry not enabled', () => {
      expect(registry.containsNamespaceInText('.vlocity_cmt-foo {}')).to.equal(false);
    });

    it('returns false for non-string / empty input', () => {
      registry.init(buildMockConnection({}) as any, 'vlocity_cmt', buildMockMessages());
      expect(registry.containsNamespaceInText(undefined)).to.equal(false);
      expect(registry.containsNamespaceInText(null)).to.equal(false);
      expect(registry.containsNamespaceInText(42)).to.equal(false);
      expect(registry.containsNamespaceInText('')).to.equal(false);
    });

    it('returns true when text contains the namespace substring', () => {
      registry.init(buildMockConnection({}) as any, 'vlocity_cmt', buildMockMessages());
      expect(registry.containsNamespaceInText('.vlocity_cmt-card { display: none; }')).to.equal(true);
    });

    it('returns false when text does not contain the namespace', () => {
      registry.init(buildMockConnection({}) as any, 'vlocity_cmt', buildMockMessages());
      expect(registry.containsNamespaceInText('.foo { color: red; }')).to.equal(false);
    });
  });
});
