/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable */
import { Connection, Messages } from '@salesforce/core';
import { QueryTools } from '../utils/query';
import { Logger } from '../utils/logger';

/**
 * Outcome of scanning a single Static Resource for namespace references.
 *  - `notFound`    — no record with this Name exists in the org
 *  - `unsupported` — body was unreadable or non-text & non-zip
 *  - `clean`       — fetched, scanned, no namespace match
 *  - `dirty`       — fetched, scanned, namespace match found
 */
export type CustomCssScanVerdict = 'notFound' | 'unsupported' | 'clean' | 'dirty';

/**
 * Result of scanning the four-key `stylesheet` object embedded in an OmniScript's
 * (or FlexCard's) PropertySetConfig. Returns the names of stylesheets whose
 * StaticResource bodies still reference the org's managed-package namespace.
 *
 * Callers use `dirtyStylesheets` to push warnings; the array preserves insertion
 * order so messages reflect the variant order checked (lightning, newport, …).
 */
export interface CustomCssStylesheetScanResult {
  dirtyStylesheets: string[];
}

/**
 * Centralised, process-wide cache & scanner for Static Resources referenced as
 * "Custom Lightning / Newport Stylesheet File Name" in OmniScript / FlexCard
 * PropertySetConfig.
 *
 * Why a registry (vs a per-tool field):
 *  - The same StaticResource is frequently shared across many OmniScripts and
 *    (in future) FlexCards. We don't want to re-query / re-download it per tool.
 *  - OmniScript and Integration Procedure are two separate
 *    `OmniScriptMigrationTool` instances in the assess flow — without the
 *    registry, their caches would be siloed.
 *  - Future component types (FlexCard, etc.) can plug in by calling
 *    `scanResource()` directly without re-implementing the fetch/zip/scan logic.
 *
 * Lifetime: a single assessment run. Tools call `init(connection, namespace,
 * messages)` once at construction time; subsequent inits are idempotent (the
 * first one wins, and a `reset()` is exposed for tests / re-entrant runs).
 */
export class CustomCssRegistry {
  private static instance: CustomCssRegistry;

  private cache: Map<string, CustomCssScanVerdict> = new Map();
  private connection?: Connection;
  private namespace?: string;
  private messages?: Messages<string>;

  /** Variant keys present on `propertySetConfig.stylesheet` for OmniScript. */
  private static readonly OMNISCRIPT_STYLESHEET_VARIANTS: ReadonlyArray<
    'lightning' | 'newport' | 'lightningRtl' | 'newportRtl'
  > = ['lightning', 'newport', 'lightningRtl', 'newportRtl'];

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
   * the configured namespace inside their CSS body.
   *
   * Returns an empty result when scanning is disabled (no namespace configured)
   * or when the stylesheet object is missing / malformed.
   */
  public async scanOmniScriptStylesheets(stylesheet: unknown): Promise<CustomCssStylesheetScanResult> {
    const result: CustomCssStylesheetScanResult = { dirtyStylesheets: [] };

    if (!this.isEnabled()) return result;
    if (!stylesheet || typeof stylesheet !== 'object') return result;

    const sheet = stylesheet as Record<string, unknown>;
    for (const variant of CustomCssRegistry.OMNISCRIPT_STYLESHEET_VARIANTS) {
      const raw = sheet[variant];
      const resourceName = (raw == null ? '' : String(raw)).trim();
      if (!resourceName) continue;

      const verdict = await this.scanResource(resourceName);
      if (verdict === 'dirty') {
        result.dirtyStylesheets.push(resourceName);
      }
    }
    return result;
  }

  /**
   * Build the customer-facing warning message for a dirty stylesheet. Centralised
   * here so both OmniScript and (future) FlexCard collectors phrase warnings
   * identically. Returns `null` if the registry has no message bundle yet.
   */
  public buildNamespaceWarning(resourceName: string): string | null {
    if (!this.messages || !this.namespace) return null;
    return this.messages.getMessage('customCssStylesheetNamespaceWarning', [resourceName]);
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

    // 1. Look up the record. StaticResource is a standard sObject — no namespace prefix.
    const filters = new Map<string, any>([['Name', resourceName]]);
    const rows = (await QueryTools.query(
      this.connection,
      'StaticResource',
      ['Id', 'Name', 'ContentType', 'BodyLength'],
      filters
    )) as any[];

    if (!rows || rows.length === 0) {
      this.cache.set(resourceName, 'notFound');
      return 'notFound';
    }

    const sr = rows[0];
    const contentType: string = (sr.ContentType || '').toLowerCase();
    const apiVersion = this.connection.getApiVersion();
    const url = `/services/data/v${apiVersion}/sobjects/StaticResource/${sr.Id}/Body`;
    const containsNamespace = (text: string): boolean => text.includes(this.namespace as string);

    try {
      // Plain-text resource (text/css, text/plain, application/json, or unknown).
      if (contentType.startsWith('text/') || contentType === 'application/json' || contentType === '') {
        const raw = await this.connection.request<any>({ method: 'GET', url });
        const cssText: string = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
        const verdict: CustomCssScanVerdict = containsNamespace(cssText) ? 'dirty' : 'clean';
        this.cache.set(resourceName, verdict);
        return verdict;
      }

      // Zip archive — scan every .css entry.
      if (contentType === 'application/zip' || contentType === 'application/x-zip-compressed') {
        const raw = await this.connection.request<any>({ method: 'GET', url });
        const buf: Buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'binary');
        // Lazy-require so jszip only loads when a zipped resource is actually encountered.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const JSZip = require('jszip');
        const zip = await JSZip.loadAsync(buf);
        let dirty = false;
        const entries: any[] = Object.values(zip.files);
        for (const file of entries) {
          if (file.dir) continue;
          if (!/\.css$/i.test(file.name)) continue;
          const cssText: string = await file.async('string');
          if (containsNamespace(cssText)) {
            dirty = true;
            break;
          }
        }
        const verdict: CustomCssScanVerdict = dirty ? 'dirty' : 'clean';
        this.cache.set(resourceName, verdict);
        return verdict;
      }

      // Anything else — flag unsupported but don't warn (avoids false positives).
      this.cache.set(resourceName, 'unsupported');
      return 'unsupported';
    } catch (err) {
      Logger.error(`Failed to fetch/scan StaticResource '${resourceName}': ${(err as Error).message}`);
      this.cache.set(resourceName, 'unsupported');
      return 'unsupported';
    }
  }
}
