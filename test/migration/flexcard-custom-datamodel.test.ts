/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, camelcase, comma-dangle */
import { expect } from 'chai';
import { CardMigrationTool } from '../../src/migration/flexcard';
import { NameMappingRegistry } from '../../src/migration/NameMappingRegistry';
import { initializeDataModelService } from '../../src/utils/dataModelService';
import { OmnistudioOrgDetails } from '../../src/utils/orgUtils';

describe('FlexCard Custom Data Model - OmniScript Navigate URL', () => {
  let cardTool: CardMigrationTool;
  let nameRegistry: NameMappingRegistry;
  let mockConnection: any;
  let mockMessages: any;
  let mockUx: any;
  let mockLogger: any;

  beforeEach(() => {
    nameRegistry = NameMappingRegistry.getInstance();
    nameRegistry.clear();

    const mockOrgDetails: OmnistudioOrgDetails = {
      packageDetails: { version: '1.0.0', namespace: 'omnistudio' },
      omniStudioOrgPermissionEnabled: false, // Custom Data Model
      orgDetails: { Name: 'Test Org', Id: '00D000000000000' },
      dataModel: 'Custom',
      hasValidNamespace: true,
      isFoundationPackage: false,
      isOmnistudioMetadataAPIEnabled: false,
    };
    initializeDataModelService(mockOrgDetails);

    mockConnection = {};
    mockMessages = {
      getMessage: (key: string, args?: string[]) => {
        if (key === 'webPageOmniScriptNavigationDetected') {
          return `OmniScript navigation URL detected: ${args?.[0]} -> ${args?.[1]}`;
        }
        if (key === 'webPageOmniScriptUrlMalformedToken') {
          // Mirrors the production message shape so tests can assert on the
          // token list AND on the URLs without coupling to wording.
          return `OmniScript navigation URL malformed tokens: ${args?.[0]} | url=${args?.[1]} | rewritten=${args?.[2]}`;
        }
        return 'Mock message for testing';
      },
    };
    mockUx = {};
    mockLogger = {};

    cardTool = new CardMigrationTool('omnistudio', mockConnection, mockLogger, mockMessages, mockUx, false);
  });

  describe('Migration', () => {
    it('should convert absolute OmniScript Universal Page URL to relative standard URL', () => {
      const mockCardRecord = {
        Id: 'fc_mig_custom_os_url_abs',
        Name: 'MigCustomOmniUrlAbsolute',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          layout: 'Card',
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'action',
                      property: {
                        actionList: [
                          {
                            stateAction: {
                              type: 'Custom',
                              targetType: 'Web Page',
                              'Web Page': {
                                targetName:
                                  'https://migration01--devopsimpkg15.test1.vf.pc-rnd.force.com/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}&OmniScriptType=OS&OmniScriptSubType=Navigate&OmniScriptLang=English&PrefillDataRaptorBundle=&scriptMode=vertical&layout=lightning&ContextId={0}',
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
          events: [],
        }),
        omnistudio__Active__c: true,
        omnistudio__CardType__c: 'Parent',
        omnistudio__Version__c: 1,
      };

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map(), updates);
      const propertySetConfig = JSON.parse(result.PropertySetConfig);
      const targetName =
        propertySetConfig.states[0].components['layer-0'].children[0].property.actionList[0].stateAction['Web Page']
          .targetName;

      expect(targetName.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(targetName).to.not.include('migration01');
      expect(targetName).to.include('omniscript__type=OS');
      expect(targetName).to.include('omniscript__subType=Navigate');
      expect(targetName).to.include('omniscript__language=English');
      expect(targetName).to.include('omniscript__theme=lightning');
      expect(targetName).to.include('id=%7B0%7D');
      expect(targetName).to.include('ContextId=%7B0%7D');
      expect(updates.size).to.equal(1);
    });

    it('should clean special characters from OmniScriptType and OmniScriptSubType in standard URL', () => {
      const mockCardRecord = {
        Id: 'fc_mig_custom_os_url_clean',
        Name: 'MigCustomOmniUrlClean',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          layout: 'Card',
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'action',
                      property: {
                        actionList: [
                          {
                            stateAction: {
                              type: 'Custom',
                              targetType: 'Web Page',
                              'Web Page': {
                                targetName:
                                  '/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=A%24&OmniScriptSubType=B%23-Navigate&OmniScriptLang=en_US&layout=lightning',
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
          events: [],
        }),
        omnistudio__Active__c: true,
        omnistudio__CardType__c: 'Parent',
        omnistudio__Version__c: 1,
      };

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map(), updates);
      const propertySetConfig = JSON.parse(result.PropertySetConfig);
      const targetName =
        propertySetConfig.states[0].components['layer-0'].children[0].property.actionList[0].stateAction['Web Page']
          .targetName;

      expect(targetName).to.include('omniscript__type=A');
      expect(targetName).to.include('omniscript__subType=BNavigate');
      expect(targetName).to.include('omniscript__language=en_US');
    });

    it('should rewrite OmniScript URL with slash-separated fragment params (#/Key/Val/...)', () => {
      const mockCardRecord = {
        Id: 'fc_mig_custom_os_url_fragment',
        Name: 'MigCustomOmniUrlFragment',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          layout: 'Card',
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'action',
                      property: {
                        actionList: [
                          {
                            stateAction: {
                              type: 'Custom',
                              targetType: 'Web Page',
                              'Web Page': {
                                targetName:
                                  'https://migration01--devopsimpkg15.test1.vf.pc-rnd.force.com/apex/devopsimpkg15__OmniScriptUniversalPage?id=%7B0%7D&layout=lightning#/OmniScriptType/OSNameClean$/OmniScriptSubType/Test$/OmniScriptLang/English/ContextId/%7B0%7D/PrefillDataRaptorBundle//true',
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
          events: [],
        }),
        omnistudio__Active__c: true,
        omnistudio__CardType__c: 'Parent',
        omnistudio__Version__c: 1,
      };

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map(), updates);
      const propertySetConfig = JSON.parse(result.PropertySetConfig);
      const targetName =
        propertySetConfig.states[0].components['layer-0'].children[0].property.actionList[0].stateAction['Web Page']
          .targetName;

      expect(targetName.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(targetName).to.not.include('migration01');
      expect(targetName).to.not.include('#');
      expect(targetName).to.include('id=%7B0%7D');
      expect(targetName).to.include('omniscript__theme=lightning');
      expect(targetName).to.include('omniscript__type=OSNameClean');
      expect(targetName).to.include('omniscript__subType=Test');
      expect(targetName).to.include('omniscript__language=English');
      expect(targetName).to.include('ContextId=%7B0%7D');
      expect(targetName).to.include('PrefillDataRaptorBundle=');
      expect(updates.size).to.equal(1);
    });

    /**
     * Build a single-action FlexCard fixture parameterized by `targetName`.
     * Used by the edge-case tests below to keep them focused on the URL value
     * rather than re-stating boilerplate JSON.
     */
    const buildSingleActionCard = (id: string, name: string, targetName: string): any => ({
      Id: id,
      Name: name,
      omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
      omnistudio__Definition__c: JSON.stringify({
        layout: 'Card',
        states: [
          {
            components: {
              'layer-0': {
                children: [
                  {
                    element: 'action',
                    property: {
                      actionList: [
                        {
                          stateAction: {
                            type: 'Custom',
                            targetType: 'Web Page',
                            'Web Page': { targetName },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
        events: [],
      }),
      omnistudio__Active__c: true,
      omnistudio__CardType__c: 'Parent',
      omnistudio__Version__c: 1,
    });

    const getRewrittenTargetName = (transformedCard: any): string =>
      JSON.parse(transformedCard.PropertySetConfig).states[0].components['layer-0'].children[0].property.actionList[0]
        .stateAction['Web Page'].targetName;

    it('should leave non-OmniScript external URLs untouched (fast-path skip)', () => {
      const original = 'https://help.acme.com/articles/12345';
      const card = buildSingleActionCard('fc_url_external', 'NonOmniExternal', original);

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);

      expect(getRewrittenTargetName(result)).to.equal(original);
      expect(updates.size).to.equal(0);
    });

    it('should leave malformed/unparseable URLs untouched without throwing', () => {
      // `[bad` is an invalid IPv6 host literal -> new URL throws TypeError.
      const original =
        'https://[bad/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=A&OmniScriptSubType=B&OmniScriptLang=en';
      const card = buildSingleActionCard('fc_url_malformed', 'MalformedURL', original);

      const updates = new Set<string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);
      }).to.not.throw();

      expect(getRewrittenTargetName(result)).to.equal(original);
      expect(updates.size).to.equal(0);
    });

    it('should reject non-http(s) schemes such as javascript: even when OmniScript tokens are present', () => {
      const original =
        'javascript:alert(1)//apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=Foo&OmniScriptSubType=Bar&OmniScriptLang=English';
      const card = buildSingleActionCard('fc_url_javascript', 'JavascriptScheme', original);

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);

      expect(getRewrittenTargetName(result)).to.equal(original);
      expect(updates.size).to.equal(0);
    });

    it('should reject URLs whose required tokens are smuggled into query values rather than the path/params', () => {
      // pathname is `/foo`, not `/apex/...`; the `/apex/...` text is inside a query VALUE.
      const original =
        'https://evil.example.com/foo?bar=/apex/devopsimpkg15__OmniScriptUniversalPage&OmniScriptType=A&OmniScriptSubType=B&OmniScriptLang=en';
      const card = buildSingleActionCard('fc_url_smuggled', 'SmuggledTokens', original);

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);

      expect(getRewrittenTargetName(result)).to.equal(original);
      expect(updates.size).to.equal(0);
    });

    it('should rewrite without throwing when the fragment contains a malformed percent sequence', () => {
      // `Foo%` in the fragment would crash decodeURIComponent without our try/catch fallback.
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}#/OmniScriptType/Foo%/OmniScriptSubType/Bar/OmniScriptLang/English';
      const card = buildSingleActionCard('fc_url_bad_pct', 'MalformedPercent', original);

      const updates = new Set<string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);
      }).to.not.throw();

      const rewritten = getRewrittenTargetName(result);
      expect(rewritten.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      // OmniScriptType/SubType pass through cleanName which strips non-alphanumerics
      // (including the literal '%' that survived the malformed-percent fallback).
      expect(rewritten).to.include('omniscript__type=Foo');
      expect(rewritten).to.not.include('Foo%');
      expect(rewritten).to.include('omniscript__subType=Bar');
      expect(rewritten).to.include('omniscript__language=English');
      expect(updates.size).to.equal(1);
    });

    it('should drop a trailing orphan token when the fragment has an odd token count', () => {
      // 9 tokens after `#/`: 4 valid (Key, Value) pairs + 1 lone trailing key with no value.
      // The orphan `OrphanKey` must be dropped, NOT paired with `undefined` / `""`.
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}' +
        '#/OmniScriptType/Foo/OmniScriptSubType/Bar/OmniScriptLang/English/ContextId/%7B0%7D/OrphanKey';
      const card = buildSingleActionCard('fc_url_orphan_token', 'OrphanFragmentToken', original);

      const updates = new Set<string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);
      }).to.not.throw();

      const rewritten = getRewrittenTargetName(result);
      expect(rewritten.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(rewritten).to.include('omniscript__type=Foo');
      expect(rewritten).to.include('omniscript__subType=Bar');
      expect(rewritten).to.include('omniscript__language=English');
      expect(rewritten).to.include('ContextId=%7B0%7D');
      // The orphan key must not survive at all -- not as `OrphanKey=`, `OrphanKey=undefined`,
      // or any other shape. Asserting its absence pins the documented "trailing orphan
      // token (which is dropped)" behavior of parseSlashFragmentParams.
      expect(rewritten).to.not.include('OrphanKey');
      expect(rewritten).to.not.include('undefined');
      expect(updates.size).to.equal(1);
    });

    it('should drop a single lone fragment token (odd count of 1) without crashing', () => {
      // Degenerate case: fragment is just `#/JustOneToken` -- a single orphan with no value
      // partner. Must not produce any fragment-derived params and must not throw.
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage' +
        '?OmniScriptType=A&OmniScriptSubType=B&OmniScriptLang=en' +
        '#/JustOneToken';
      const card = buildSingleActionCard('fc_url_lone_token', 'LoneFragmentToken', original);

      const updates = new Set<string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);
      }).to.not.throw();

      const rewritten = getRewrittenTargetName(result);
      expect(rewritten.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      // Required params come from the query string, so the rewrite still succeeds.
      expect(rewritten).to.include('omniscript__type=A');
      expect(rewritten).to.include('omniscript__subType=B');
      expect(rewritten).to.include('omniscript__language=en');
      expect(rewritten).to.not.include('JustOneToken');
      expect(rewritten).to.not.include('undefined');
      expect(updates.size).to.equal(1);
    });

    it('should let query-string params win when the same key appears in both query and fragment', () => {
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=FromQuery&OmniScriptSubType=B&OmniScriptLang=en#/OmniScriptType/FromFragment';
      const card = buildSingleActionCard('fc_url_dup_keys', 'DupQueryFragment', original);

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);

      const rewritten = getRewrittenTargetName(result);
      expect(rewritten).to.include('omniscript__type=FromQuery');
      expect(rewritten).to.not.include('FromFragment');
      expect(updates.size).to.equal(1);
    });

    it('should rename layout to omniscript__theme and drop the original layout key', () => {
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=A&OmniScriptSubType=B&OmniScriptLang=en&layout=newport';
      const card = buildSingleActionCard('fc_url_layout_rename', 'LayoutThemeRename', original);

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);

      const rewritten = getRewrittenTargetName(result);
      expect(rewritten).to.include('omniscript__theme=newport');
      expect(rewritten).to.not.match(/(^|[?&])layout=/);
      expect(updates.size).to.equal(1);
    });

    it('should preserve Unicode characters in non-cleaned params and strip them from cleaned ones', () => {
      // OmniScriptLang is preserved as-is; OmniScriptType/SubType pass through cleanName
      // (which strips non [a-z0-9] characters, including Unicode letters like 'é').
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=Café&OmniScriptSubType=Über&OmniScriptLang=fr_CA';
      const card = buildSingleActionCard('fc_url_unicode', 'UnicodeChars', original);

      const updates = new Set<string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);
      }).to.not.throw();

      const rewritten = getRewrittenTargetName(result);
      expect(rewritten.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(rewritten).to.include('omniscript__type=Caf');
      expect(rewritten).to.include('omniscript__subType=ber');
      // OmniScriptLang is not in the clean list; Unicode survives (URL-encoded as %2F-style escapes for non-ASCII).
      expect(decodeURIComponent(rewritten)).to.include('omniscript__language=fr_CA');
      expect(updates.size).to.equal(1);
    });

    it('should rewrite very long URLs without truncation or crash', () => {
      // Build a ~50KB payload by padding a non-cleaned param value (id) with junk.
      const longValue = 'x'.repeat(50_000);
      const original =
        `/apex/devopsimpkg15__OmniScriptUniversalPage?id=${longValue}` +
        '&OmniScriptType=A&OmniScriptSubType=B&OmniScriptLang=en';
      const card = buildSingleActionCard('fc_url_very_long', 'VeryLongURL', original);

      const updates = new Set<string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);
      }).to.not.throw();

      const rewritten = getRewrittenTargetName(result);
      expect(rewritten.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(rewritten).to.include(`id=${longValue}`);
      expect(rewritten).to.include('omniscript__type=A');
      expect(updates.size).to.equal(1);
    });

    it('should rewrite multiple Custom Web Page actions within the same FlexCard', () => {
      const url1 =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=One&OmniScriptSubType=First&OmniScriptLang=en';
      const url2 =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?OmniScriptType=Two&OmniScriptSubType=Second&OmniScriptLang=en';

      const buildCustomWebPageAction = (targetName: string): any => ({
        stateAction: {
          type: 'Custom',
          targetType: 'Web Page',
          'Web Page': { targetName },
        },
      });

      const mockCardRecord = {
        Id: 'fc_url_multiple_actions',
        Name: 'MultipleURLActions',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          layout: 'Card',
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'action',
                      property: {
                        actionList: [buildCustomWebPageAction(url1), buildCustomWebPageAction(url2)],
                      },
                    },
                  ],
                },
              },
            },
          ],
          events: [],
        }),
        omnistudio__Active__c: true,
        omnistudio__CardType__c: 'Parent',
        omnistudio__Version__c: 1,
      };

      const updates = new Set<string>();
      const result = (cardTool as any).mapVlocityCardRecord(mockCardRecord, new Map(), new Map(), updates);

      const actionList = JSON.parse(result.PropertySetConfig).states[0].components['layer-0'].children[0].property
        .actionList;
      const rewritten1 = actionList[0].stateAction['Web Page'].targetName;
      const rewritten2 = actionList[1].stateAction['Web Page'].targetName;

      expect(rewritten1.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(rewritten1).to.include('omniscript__type=One');
      expect(rewritten1).to.include('omniscript__subType=First');

      expect(rewritten2.startsWith('/lightning/page/omnistudio/omniscript?')).to.be.true;
      expect(rewritten2).to.include('omniscript__type=Two');
      expect(rewritten2).to.include('omniscript__subType=Second');

      // Two distinct rewrites recorded in the summaries set.
      expect(updates.size).to.equal(2);
    });

    it('should record a malformed-fragment warning when a fragment token cannot be URL-decoded', () => {
      // `Foo%` is malformed -- decodeURIComponent throws. The rewrite proceeds
      // (best-effort) but we expect a warning entry so the customer can verify
      // the rewritten URL still points at the intended OmniScript.
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}' +
        '#/OmniScriptType/Foo%/OmniScriptSubType/Bar/OmniScriptLang/English';
      const card = buildSingleActionCard('fc_url_warn_malformed', 'WarnMalformedFragment', original);

      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates, malformedWarnings);

      expect(updates.size).to.equal(1);
      expect(malformedWarnings.size).to.equal(1);

      const warning = Array.from(malformedWarnings.values())[0];
      expect(warning).to.include('"Foo%"');
      // The mocked message renders the URL into `url=...` and rewrite into `rewritten=...`.
      // Asserting on these tags verifies the helper passes the URLs in the right slots.
      expect(warning).to.match(/url=.*OmniScriptUniversalPage/);
      expect(warning).to.match(/rewritten=.*\/lightning\/page\/omnistudio\/omniscript/);

      // Lock in the contract that the Map key equals the rewrite-summary string
      // tracked in `urlUpdateSummaries`. The migration emission step relies on
      // this equivalence to subtract malformed URLs from the aggregate
      // "Updated URLs:" locations message -- if these ever drift apart, the
      // customer would see the same malformed URL in BOTH bullets.
      const summaryKey = Array.from(malformedWarnings.keys())[0];
      expect(updates.has(summaryKey)).to.equal(true);
    });

    it('should track a clean URL and a malformed URL separately on the same card so the count message reflects only clean rewrites', () => {
      // Customer FlexCard has TWO Custom Web Page actions: one points at a
      // clean OmniScript URL, the other has a malformed fragment token. The
      // migration emission step subtracts `malformedWarnings.keys()` from
      // `urlUpdateSummaries` to derive the count for the
      // "Updated %s OmniScript Navigate URL action(s) to standard URL format"
      // bullet. We verify both containers carry exactly the right entries so
      // that subtraction yields 1 (clean) -- claiming "Updated 2 ..." next to
      // a malformed warning would contradict the warning and confuse customers.
      const cleanUrl =
        '/apex/devopsimpkg15__OmniScriptUniversalPage' +
        '?OmniScriptType=Clean&OmniScriptSubType=Path&OmniScriptLang=en';
      const malformedUrl =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}' +
        '#/OmniScriptType/Foo%/OmniScriptSubType/Bar/OmniScriptLang/English';
      const buildAction = (targetName: string): any => ({
        stateAction: {
          type: 'Custom',
          targetType: 'Web Page',
          'Web Page': { targetName },
        },
      });
      const card = {
        Id: 'fc_url_mixed_clean_and_malformed',
        Name: 'MixedCleanAndMalformed',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          layout: 'Card',
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'action',
                      property: { actionList: [buildAction(cleanUrl), buildAction(malformedUrl)] },
                    },
                  ],
                },
              },
            },
          ],
          events: [],
        }),
        omnistudio__Active__c: true,
        omnistudio__CardType__c: 'Parent',
        omnistudio__Version__c: 1,
      };

      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates, malformedWarnings);

      // Both URLs were rewritten, so `urlUpdateSummaries` has two entries.
      expect(updates.size).to.equal(2);
      // Only the malformed URL gets a dedicated warning + a malformed map entry.
      expect(malformedWarnings.size).to.equal(1);

      // Subtraction yields exactly the clean rewrites that should be reported
      // by the count message and the "Updated URLs:" locations message.
      const cleanRewriteSummaries = Array.from(updates).filter((s) => !malformedWarnings.has(s));
      expect(cleanRewriteSummaries.length).to.equal(1);
      // The lone clean summary must be the one whose source URL is the clean one
      // (not the malformed one). This catches accidental swaps in the keying logic.
      expect(cleanRewriteSummaries[0]).to.include('Clean');
      expect(cleanRewriteSummaries[0]).to.not.include('Foo%');
    });

    it('should yield zero clean rewrites when every URL on the card is malformed (suppress count message)', () => {
      // All URLs malformed => `urlUpdateSummaries.size === malformedWarnings.size`.
      // The migration emission step uses `(urlUpdateSummaries - malformedWarnings)`
      // to decide whether to emit the count + locations bullets. A length-0
      // result means those two bullets are suppressed entirely, which is the
      // user-visible fix for "Updated 1 ..." appearing next to a malformed
      // warning that says the URL was kept as-is.
      const malformedA =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}' +
        '#/OmniScriptType/Foo%/OmniScriptSubType/Bar/OmniScriptLang/English';
      const malformedB =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}' +
        '#/OmniScriptType/A/OmniScriptSubType/Baz%E2/OmniScriptLang/English';
      const buildAction = (targetName: string): any => ({
        stateAction: {
          type: 'Custom',
          targetType: 'Web Page',
          'Web Page': { targetName },
        },
      });
      const card = {
        Id: 'fc_url_all_malformed',
        Name: 'AllMalformed',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          layout: 'Card',
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'action',
                      property: { actionList: [buildAction(malformedA), buildAction(malformedB)] },
                    },
                  ],
                },
              },
            },
          ],
          events: [],
        }),
        omnistudio__Active__c: true,
        omnistudio__CardType__c: 'Parent',
        omnistudio__Version__c: 1,
      };

      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates, malformedWarnings);

      expect(updates.size).to.equal(2);
      expect(malformedWarnings.size).to.equal(2);

      // Subtracting malformed from total leaves ZERO clean rewrites -- the
      // emission step must skip the count + locations bullets entirely so
      // the customer only sees the per-URL malformed warnings.
      const cleanRewriteSummaries = Array.from(updates).filter((s) => !malformedWarnings.has(s));
      expect(cleanRewriteSummaries.length).to.equal(0);
    });

    it('should NOT record a malformed-fragment warning when every fragment token decodes cleanly', () => {
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}' +
        '#/OmniScriptType/Foo/OmniScriptSubType/Bar/OmniScriptLang/English';
      const card = buildSingleActionCard('fc_url_clean_fragment', 'CleanFragment', original);

      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates, malformedWarnings);

      expect(updates.size).to.equal(1);
      expect(malformedWarnings.size).to.equal(0);
    });

    it('should dedupe malformed-fragment warnings when the same bad URL appears in multiple actions', () => {
      // Same malformed URL referenced by two actions on one card. The Set must
      // contain a single entry so the customer's warning report stays focused
      // on distinct URLs rather than action-by-action duplicates.
      const malformedUrl =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}' +
        '#/OmniScriptType/Foo%/OmniScriptSubType/Bar/OmniScriptLang/English';
      const buildAction = (targetName: string): any => ({
        stateAction: {
          type: 'Custom',
          targetType: 'Web Page',
          'Web Page': { targetName },
        },
      });
      const card = {
        Id: 'fc_url_dedupe_malformed',
        Name: 'DedupeMalformedFragment',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          layout: 'Card',
          states: [
            {
              components: {
                'layer-0': {
                  children: [
                    {
                      element: 'action',
                      property: {
                        actionList: [buildAction(malformedUrl), buildAction(malformedUrl)],
                      },
                    },
                  ],
                },
              },
            },
          ],
          events: [],
        }),
        omnistudio__Active__c: true,
        omnistudio__CardType__c: 'Parent',
        omnistudio__Version__c: 1,
      };

      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates, malformedWarnings);

      // Same URL twice -> one rewrite entry, one warning entry.
      expect(updates.size).to.equal(1);
      expect(malformedWarnings.size).to.equal(1);
    });

    it('should aggregate every malformed token from a fragment into a single warning', () => {
      // Two malformed tokens in the same URL: `Foo%` and `Baz%E2`. Both must
      // appear in the single warning -- one warning per URL, not per token,
      // so the report stays compact even when a URL is heavily corrupted.
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}' +
        '#/OmniScriptType/Foo%/OmniScriptSubType/Bar/OmniScriptLang/English/ContextId/Baz%E2';
      const card = buildSingleActionCard('fc_url_multi_malformed', 'MultiMalformedTokens', original);

      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates, malformedWarnings);

      expect(malformedWarnings.size).to.equal(1);
      const warning = Array.from(malformedWarnings.values())[0];
      expect(warning).to.include('"Foo%"');
      expect(warning).to.include('"Baz%E2"');
    });

    it('should leave malformedFragmentWarnings untouched when caller omits the optional collector', () => {
      // Backward-compat: pre-existing call sites that pass only the four-arg
      // shape must keep working without producing TypeErrors.
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}' +
        '#/OmniScriptType/Foo%/OmniScriptSubType/Bar/OmniScriptLang/English';
      const card = buildSingleActionCard('fc_url_backcompat', 'BackCompatNoCollector', original);

      const updates = new Set<string>();
      expect(() => {
        (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates);
      }).to.not.throw();
      expect(updates.size).to.equal(1);
    });

    it('should NOT record a malformed-fragment warning for javascript: URLs even with bad fragment tokens', () => {
      // Hostile-input case: a `javascript:` URL that smuggles the OmniScript
      // path text AND a malformed token. The protocol guard in tryParseURL
      // must reject this BEFORE we ever look at the fragment, so we get no
      // rewrite AND no malformed-token warning.
      const original =
        'javascript:alert(1)//apex/devopsimpkg15__OmniScriptUniversalPage' +
        '?OmniScriptType=A&OmniScriptSubType=B&OmniScriptLang=en' +
        '#/OmniScriptType/Foo%/OmniScriptSubType/Bar/OmniScriptLang/English';
      const card = buildSingleActionCard('fc_url_js_malformed', 'JavascriptWithMalformedFragment', original);

      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates, malformedWarnings);
      }).to.not.throw();

      expect(getRewrittenTargetName(result)).to.equal(original);
      expect(updates.size).to.equal(0);
      expect(malformedWarnings.size).to.equal(0);
    });

    it('should NOT record a malformed-fragment warning when the URL has bad tokens but no required OmniScript params', () => {
      // The fragment is malformed but the URL doesn't carry the required
      // OmniScriptType / OmniScriptSubType / OmniScriptLang via either query
      // or fragment, so isValidOmniScriptNavigationURL rejects it BEFORE the
      // malformed-token plumbing fires. No rewrite => no warning, even though
      // a `Foo%` is sitting in the fragment.
      const original = '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}' + '#/UnrelatedKey/Foo%/AnotherKey/Bar';
      const card = buildSingleActionCard('fc_url_malformed_nonomni', 'MalformedButNonOmniShape', original);

      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates, malformedWarnings);
      }).to.not.throw();

      // URL is unchanged because the OmniScript shape check failed.
      expect(getRewrittenTargetName(result)).to.equal(original);
      expect(updates.size).to.equal(0);
      expect(malformedWarnings.size).to.equal(0);
    });

    it('should NOT record a malformed-fragment warning when targetName lacks the OmniScript indicator substring', () => {
      // Fast-screen rejection: the URL has a malformed fragment but doesn't
      // include `/apex/` and the universal-page token, so we never even parse
      // it. This locks in that the malformed-token check never short-circuits
      // the fast-screen.
      const original = 'https://help.acme.com/articles/12345#/Key/Foo%/Other/Bar';
      const card = buildSingleActionCard('fc_url_extern_malformed', 'ExternalMalformedFragment', original);

      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      let result: any;
      expect(() => {
        result = (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates, malformedWarnings);
      }).to.not.throw();

      expect(getRewrittenTargetName(result)).to.equal(original);
      expect(updates.size).to.equal(0);
      expect(malformedWarnings.size).to.equal(0);
    });

    it('should NOT crash and NOT record a malformed-fragment warning when stateAction is a bare empty object', () => {
      // `applyOmniScriptURLRewrite` is fed a stateAction of `{}` (no Web Page
      // property, no targetName). Optional chaining must keep this from
      // throwing, and we must produce no warning.
      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      expect(() => {
        (cardTool as any).applyOmniScriptURLRewrite({}, updates, malformedWarnings);
      }).to.not.throw();
      expect(updates.size).to.equal(0);
      expect(malformedWarnings.size).to.equal(0);
    });

    it('should NOT crash when stateAction.Web Page.targetName is a non-string', () => {
      // Customer data corruption: targetName is a number. Type guard in
      // getOmniScriptURLRewrite must reject this before we touch URL parsing.
      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      const stateAction = {
        type: 'Custom',
        targetType: 'Web Page',
        'Web Page': { targetName: 12345 },
      };
      expect(() => {
        (cardTool as any).applyOmniScriptURLRewrite(stateAction, updates, malformedWarnings);
      }).to.not.throw();
      expect(updates.size).to.equal(0);
      expect(malformedWarnings.size).to.equal(0);
    });

    it('should dedupe a repeated malformed token within a single fragment', () => {
      // Same bad token `Foo%` appears twice in the same fragment. The warning
      // must list it ONCE, not twice -- otherwise the customer report would
      // show `["Foo%", "Foo%"]` and look like a bug. A second distinct bad
      // token (`Baz%E2`) is included to confirm dedupe is per-token, not a
      // crude "first only" filter.
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}' +
        '#/OmniScriptType/Foo%/OmniScriptSubType/Bar/OmniScriptLang/English' +
        '/ContextId/Foo%/Other/Baz%E2';
      const card = buildSingleActionCard('fc_url_dup_malformed_token', 'DuplicateMalformedToken', original);

      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates, malformedWarnings);

      expect(malformedWarnings.size).to.equal(1);
      const warning = Array.from(malformedWarnings.values())[0];

      // `Foo%` appears as `"Foo%"` -- count occurrences. Must be exactly 1.
      const fooQuotedCount = warning.split('"Foo%"').length - 1;
      expect(fooQuotedCount).to.equal(1);
      // The second distinct bad token must still appear.
      expect(warning).to.include('"Baz%E2"');
    });

    it('should NOT record a malformed-fragment warning for a clean URL with no fragment at all', () => {
      // No `#` fragment, no chance of malformed tokens. Sanity check that the
      // empty-hash path through parseSlashFragmentParams returns no malformed
      // tokens (and we don't accidentally emit a blank warning).
      const original =
        '/apex/devopsimpkg15__OmniScriptUniversalPage' + '?OmniScriptType=A&OmniScriptSubType=B&OmniScriptLang=en';
      const card = buildSingleActionCard('fc_url_no_fragment', 'NoFragmentClean', original);

      const updates = new Set<string>();
      const malformedWarnings = new Map<string, string>();
      (cardTool as any).mapVlocityCardRecord(card, new Map(), new Map(), updates, malformedWarnings);

      // Rewrite still happens (params are in the query string).
      expect(updates.size).to.equal(1);
      expect(malformedWarnings.size).to.equal(0);
    });

    it('should produce empty string from formatMalformedFragmentTokenWarning when called with no tokens (defense-in-depth)', () => {
      // Direct unit test on the helper. Even though the production callers
      // already check `length > 0` before calling, the helper itself must be
      // safe to call with an empty list -- a future caller that forgets must
      // not be able to push a degenerate `[]`-bracket warning into the report.
      const result = (cardTool as any).formatMalformedFragmentTokenWarning(
        '/apex/foo',
        '/lightning/page/omnistudio/omniscript?x=1',
        []
      );
      expect(result).to.equal('');
    });

    it('should produce empty string from formatMalformedFragmentTokenWarning when called with non-array tokens (defense-in-depth)', () => {
      // If a misbehaving caller passes undefined / null / a non-array, the
      // helper must not crash and must not produce a warning that names
      // `undefined` or `null` to customers.
      expect((cardTool as any).formatMalformedFragmentTokenWarning('/apex/foo', '/dest', undefined as any)).to.equal(
        ''
      );
      expect((cardTool as any).formatMalformedFragmentTokenWarning('/apex/foo', '/dest', null as any)).to.equal('');
      expect(
        (cardTool as any).formatMalformedFragmentTokenWarning('/apex/foo', '/dest', 'not-an-array' as any)
      ).to.equal('');
    });
  });

  describe('Assessment', () => {
    it('should add warning for Custom type with Web Page target referencing OmniScript Universal Page', async () => {
      const mockFlexCard = {
        Id: 'fc_assess_custom_os_url',
        Name: 'AssessCustomOmniScriptUrl',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                comp1: {
                  element: 'action',
                  property: {
                    actionList: [
                      {
                        stateAction: {
                          type: 'Custom',
                          targetType: 'Web Page',
                          'Web Page': {
                            targetName:
                              '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}&OmniScriptType=OS&OmniScriptSubType=Navigate&OmniScriptLang=English&layout=lightning&ContextId={0}',
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(
        mockFlexCard,
        new Set<string>(),
        new Map<string, string>()
      );

      expect(result.warnings.length).to.be.greaterThan(0);
      expect(result.migrationStatus).to.equal('Warnings');
    });

    it('should add malformed-fragment-token warning during assessment when URL has a bad token', async () => {
      const mockFlexCard = {
        Id: 'fc_assess_malformed_token',
        Name: 'AssessMalformedFragmentToken',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                comp1: {
                  element: 'action',
                  property: {
                    actionList: [
                      {
                        stateAction: {
                          type: 'Custom',
                          targetType: 'Web Page',
                          'Web Page': {
                            targetName:
                              '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}#/OmniScriptType/Foo%/OmniScriptSubType/Bar/OmniScriptLang/English',
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(
        mockFlexCard,
        new Set<string>(),
        new Map<string, string>()
      );

      // ONE warning expected: the malformed-token warning subsumes the plain
      // rewrite warning (it already names the original URL, the rewritten
      // URL, the malformed token list, and the verify instruction). Emitting
      // both would duplicate the same signal back to the customer.
      const malformedWarnings = (result.warnings as string[]).filter((w: string) =>
        w.includes('OmniScript navigation URL malformed tokens')
      );
      expect(malformedWarnings.length).to.equal(1);
      expect(malformedWarnings[0]).to.include('"Foo%"');

      // The plain rewrite warning must NOT fire for a malformed URL. That is
      // the consolidation: malformed wins, rewrite is suppressed for that URL.
      const rewriteWarnings = (result.warnings as string[]).filter(
        (w: string) =>
          w.includes('OmniScript navigation URL detected') && !w.includes('OmniScript navigation URL malformed tokens')
      );
      expect(rewriteWarnings.length).to.equal(0);
      expect(result.migrationStatus).to.equal('Warnings');
    });

    it('should NOT add malformed-fragment-token warning during assessment when URL fragment is clean', async () => {
      const mockFlexCard = {
        Id: 'fc_assess_clean_fragment',
        Name: 'AssessCleanFragment',
        omnistudio__Datasource__c: JSON.stringify({ type: 'None' }),
        omnistudio__Definition__c: JSON.stringify({
          states: [
            {
              components: {
                comp1: {
                  element: 'action',
                  property: {
                    actionList: [
                      {
                        stateAction: {
                          type: 'Custom',
                          targetType: 'Web Page',
                          'Web Page': {
                            targetName:
                              '/apex/devopsimpkg15__OmniScriptUniversalPage?id={0}#/OmniScriptType/Foo/OmniScriptSubType/Bar/OmniScriptLang/English',
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        }),
        IsActive: true,
        OmniUiCardType: 'Parent',
        VersionNumber: 1,
      };

      const result = await (cardTool as any).processFlexCard(
        mockFlexCard,
        new Set<string>(),
        new Map<string, string>()
      );

      const malformedWarnings = (result.warnings as string[]).filter((w: string) =>
        w.includes('OmniScript navigation URL malformed tokens')
      );
      // Rewrite warning still fires (URL is being rewritten) but no malformed-token warning.
      expect(malformedWarnings.length).to.equal(0);
      expect(result.migrationStatus).to.equal('Warnings');
    });
  });
});
