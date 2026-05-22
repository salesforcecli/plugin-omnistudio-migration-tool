/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Connection, Messages } from '@salesforce/core';
import JSZip from 'jszip';
import { QueryTools } from '../utils/query';
import { Logger } from '../utils/logger';

/**
 * Outcome of scanning a single Static Resource for namespace references.
 * - `notFound`        — no record with this Name exists in the org
 * - `unsupported`     — body was unreadable or non-text & non-zip
 * - `noNamespaceRef`  — fetched, scanned, no namespace match
 * - `namespaceFound`  — fetched, scanned, namespace match found
 */
export type CustomCssScanVerdict = 'notFound' | 'unsupported' | 'noNamespaceRef' | 'namespaceFound';

/**
 * Result of scanning the four-key `stylesheet` object embedded in an OmniScript's
 * (or FlexCard's) PropertySetConfig. Returns the names of stylesheets whose
 * StaticResource bodies still reference the org's managed-package namespace.
 *
 * Names are deduplicated, so a single resource referenced from multiple variant
 * keys (e.g. both `lightning` and `newport`) appears only once.
 */
export interface CustomCssStylesheetScanResult {
  stylesheetsWithNamespaceRefs: string[];
}

/**
 * Subset of fields read off a `StaticResource` SOQL row during a scan.
 * `Body` is intentionally absent — that field is not queryable via SOQL and
 * must be fetched through the REST blob endpoint.
 */
interface StaticResourceRecord {
  Id: string;
  Name: string;
  ContentType: string;
  BodyLength: number;
}

/**
 * Centralised, process-wide cache & scanner for Static Resources referenced as
 * "Custom Lightning / Newport Stylesheet File Name" in OmniScript / FlexCard
 * PropertySetConfig.
 *
 * Why a registry (vs a per-tool field): the same StaticResource is frequently
 * shared across many OmniScripts and FlexCards. We don't want to re-query or
 * re-download it per tool. OmniScript and Integration Procedure are two
 * separate `OmniScriptMigrationTool` instances in the assess flow — without
 * the registry, their caches would be siloed. Future component types can plug
 * in by calling `scanResource()` directly without re-implementing the
 * fetch/zip/scan logic.
 *
 * Lifetime: a single assessment run. Tools call `init(connection, namespace,
 * messages)` once at construction time; subsequent inits are idempotent (the
 * first one wins, and a `reset()` is exposed for tests / re-entrant runs).
 */
export class CustomCssRegistry {
  private static instance: CustomCssRegistry;

  /** Variant keys present on `propertySetConfig.stylesheet` for OmniScript. */
  private static readonly OMNISCRIPT_STYLESHEET_VARIANTS: ReadonlyArray<
    'lightning' | 'newport' | 'lightningRtl' | 'newportRtl'
  > = ['lightning', 'newport', 'lightningRtl', 'newportRtl'];

  private cache: Map<string, CustomCssScanVerdict> = new Map();
  private connection?: Connection;
  private namespace?: string;
  private messages?: Messages<string>;

  public static getInstance(): CustomCssRegistry {
    if (!CustomCssRegistry.instance) {
      CustomCssRegistry.instance = new CustomCssRegistry();
    }
    return CustomCssRegistry.instance;
  }

  /**
   * Configure the registry. Safe to call multiple times — the first non-empty
   * configuration wins, so the order in which tools initialise doesn't matter.
   */
  public init(connection: Connection, namespace: string, messages: Messages<string>): void {
    if (!this.connection) this.connection = connection;
    if (!this.namespace && namespace) this.namespace = namespace;
    if (!this.messages) this.messages = messages;
  }

  /** Clears cache + configuration. Intended for tests / re-entrant assess runs. */
  public reset(): void {
    this.cache.clear();
    this.connection = undefined;
    this.namespace = undefined;
    this.messages = undefined;
  }

  /** Whether namespace scanning is meaningful in the current run. */
  public isEnabled(): boolean {
    return Boolean(this.connection && this.namespace);
  }

  /**
   * Scan the four OmniScript stylesheet variants
   * (`lightning`, `newport`, `lightningRtl`, `newportRtl`) on a parsed
   * `propertySetConfig.stylesheet` object and return any that still reference
   * the configured namespace inside their CSS body. Duplicate resource names
   * (the same StaticResource referenced from multiple variants) are collapsed.
   *
   * Returns an empty result when scanning is disabled (no namespace configured)
   * or when the stylesheet object is missing / malformed.
   */
  public async scanOmniScriptStylesheets(stylesheet: unknown): Promise<CustomCssStylesheetScanResult> {
    const result: CustomCssStylesheetScanResult = { stylesheetsWithNamespaceRefs: [] };

    if (!this.isEnabled()) return result;
    if (!stylesheet || typeof stylesheet !== 'object') return result;

    const sheet = stylesheet as Record<string, unknown>;
    const flagged = new Set<string>();
    for (const variant of CustomCssRegistry.OMNISCRIPT_STYLESHEET_VARIANTS) {
      const raw = sheet[variant];
      const resourceName = (raw == null ? '' : String(raw)).trim();
      if (!resourceName) continue;

      const verdict = await this.scanResource(resourceName);
      if (verdict === 'namespaceFound') {
        flagged.add(resourceName);
      }
    }
    result.stylesheetsWithNamespaceRefs = [...flagged];
    return result;
  }

  /**
   * Build the customer-facing warning message for an OmniScript StaticResource-
   * backed stylesheet that contains namespace references. The OmniScript and
   * FlexCard variants are split so each can map to its own help-doc URL in
   * `documentRegistry`. Returns `null` if the registry has no message bundle yet.
   */
  public buildOmniScriptNamespaceWarning(resourceName: string): string | null {
    if (!this.messages || !this.namespace) return null;
    return this.messages.getMessage('customCssStylesheetNamespaceWarningOmniScript', [resourceName]);
  }

  /**
   * Build the customer-facing warning message for a FlexCard StaticResource-
   * backed stylesheet that contains namespace references. Mirrors
   * `buildOmniScriptNamespaceWarning` but uses the FlexCard-specific message key
   * so the call-to-action helper resolves the FlexCard help-doc link.
   */
  public buildFlexCardNamespaceWarning(resourceName: string): string | null {
    if (!this.messages || !this.namespace) return null;
    return this.messages.getMessage('customCssStylesheetNamespaceWarningFlexCard', [resourceName]);
  }

  /**
   * Build the customer-facing warning message for inline CSS (e.g. FlexCard's
   * `Styles__c.customStyles`) that contains namespace references. No
   * StaticResource is involved, so no resource name is interpolated — the
   * surrounding row in the assessment report already identifies the component.
   */
  public buildInlineCssNamespaceWarning(): string | null {
    if (!this.messages || !this.namespace) return null;
    return this.messages.getMessage('customCssInlineNamespaceWarning');
  }

  /**
   * Substring-test the configured namespace against an arbitrary CSS string.
   * Used for FlexCard `Styles__c.customStyles` (raw inline CSS) — no caching
   * because the input is per-record and not shared.
   */
  public containsNamespaceInText(text: unknown): boolean {
    if (!this.isEnabled()) return false;
    if (typeof text !== 'string' || text.length === 0) return false;
    return text.includes(this.namespace);
  }

  /**
   * Look up a Static Resource by Name, fetch its body (handling text and zip
   * bodies), and report whether the configured namespace appears anywhere in
   * its CSS. Cached by Name for the lifetime of the registry.
   *
   * Public so future component types (FlexCard, …) can reuse the cache directly
   * without going through `scanOmniScriptStylesheets`.
   */
  public async scanResource(resourceName: string): Promise<CustomCssScanVerdict> {
    if (!resourceName) return 'notFound';

    const cached = this.cache.get(resourceName);
    if (cached) return cached;

    if (!this.connection || !this.namespace) {
      // Registry was queried before init() — treat as unsupported but don't cache;
      // a later init() must still get a chance to scan.
      return 'unsupported';
    }

    const sr = await this.lookupStaticResource(resourceName);
    if (!sr) {
      this.cache.set(resourceName, 'notFound');
      return 'notFound';
    }

    const verdict = await this.scanStaticResourceBody(sr);
    this.cache.set(resourceName, verdict);
    return verdict;
  }

  /** SOQL lookup of a StaticResource by Name. Returns undefined when not found. */
  private async lookupStaticResource(resourceName: string): Promise<StaticResourceRecord | undefined> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filters = new Map<string, any>([['Name', resourceName]]);
    const rows = (await QueryTools.query(
      this.connection,
      'StaticResource',
      ['Id', 'Name', 'ContentType', 'BodyLength'],
      filters
    )) as StaticResourceRecord[];
    return rows && rows.length > 0 ? rows[0] : undefined;
  }

  /**
   * Fetch the StaticResource body and dispatch to the appropriate scanner.
   * Errors are logged and folded into the `unsupported` verdict so a single
   * broken resource doesn't poison the rest of the assessment run.
   */
  private async scanStaticResourceBody(sr: StaticResourceRecord): Promise<CustomCssScanVerdict> {
    const contentType: string = (sr.ContentType || '').toLowerCase();
    const apiVersion = this.connection.getApiVersion();
    const url = `/services/data/v${apiVersion}/sobjects/StaticResource/${sr.Id}/Body`;

    try {
      if (this.isTextContentType(contentType)) {
        return await this.scanTextBody(url);
      }
      if (this.isZipContentType(contentType)) {
        return await this.scanZipBody(url);
      }
      // Unsupported content type — don't false-positive.
      return 'unsupported';
    } catch (err) {
      Logger.error(`Failed to fetch/scan StaticResource '${sr.Name}': ${(err as Error).message}`);
      return 'unsupported';
    }
  }

  private isTextContentType(contentType: string): boolean {
    return contentType.startsWith('text/') || contentType === 'application/json' || contentType === '';
  }

  private isZipContentType(contentType: string): boolean {
    return contentType === 'application/zip' || contentType === 'application/x-zip-compressed';
  }

  /** Fetch a plain-text body and substring-check for the namespace. */
  private async scanTextBody(url: string): Promise<CustomCssScanVerdict> {
    const raw = await this.connection.request<string | Buffer>({ method: 'GET', url });
    const cssText: string = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
    return cssText.includes(this.namespace) ? 'namespaceFound' : 'noNamespaceRef';
  }

  /** Fetch a zip body and substring-check the namespace across every .css entry. */
  private async scanZipBody(url: string): Promise<CustomCssScanVerdict> {
    const raw = await this.connection.request<string | Buffer>({ method: 'GET', url });
    const buf: Buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'binary');
    const zip = await JSZip.loadAsync(buf);
    const entries: JSZip.JSZipObject[] = Object.values(zip.files);
    for (const file of entries) {
      if (file.dir) continue;
      if (!/\.css$/i.test(file.name)) continue;
      const cssText: string = await file.async('string');
      if (cssText.includes(this.namespace)) return 'namespaceFound';
    }
    return 'noNamespaceRef';
  }
}
