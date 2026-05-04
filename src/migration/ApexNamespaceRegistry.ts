import { Connection } from '@salesforce/core';
import { Logger } from '../utils/logger';

/**
 * Singleton registry that lazily caches the NamespacePrefix for Apex classes.
 * Uses async `resolve()` to query + cache, then sync `getQualifiedClassName()`
 * for cached lookups.
 */
export class ApexNamespaceRegistry {
  private static instance: ApexNamespaceRegistry;

  // className (lowercase) -> namespacePrefix (empty string if local)
  private namespaceMap: Map<string, string> = new Map();
  private notFoundClasses: Set<string> = new Set();

  public static getInstance(): ApexNamespaceRegistry {
    if (!ApexNamespaceRegistry.instance) {
      ApexNamespaceRegistry.instance = new ApexNamespaceRegistry();
    }
    return ApexNamespaceRegistry.instance;
  }

  /**
   * Resolves and caches the namespace for a given class name.
   * Skips if the className already contains a dot (already namespace-qualified).
   * Call this from any already-async method before using getQualifiedClassName().
   */
  public async resolve(connection: Connection, className: string): Promise<void> {
    if (!className || className.includes('.')) return;
    const key = className.toLowerCase();
    if (this.namespaceMap.has(key) || this.notFoundClasses.has(key)) return;

    try {
      const query = `SELECT Name, NamespacePrefix FROM ApexClass WHERE Name = '${className}'`;
      const result = await connection.tooling.query<{ Name: string; NamespacePrefix: string | null }>(query);

      if (result && result.totalSize > 0) {
        const ns = result.records[0].NamespacePrefix || '';
        this.namespaceMap.set(key, ns);
        Logger.logVerbose(`ApexNamespaceRegistry: "${className}" -> namespace "${ns || '(local)'}"`);
      } else {
        this.notFoundClasses.add(key);
      }
    } catch (err) {
      Logger.logVerbose(`ApexNamespaceRegistry: Error querying "${className}": ${(err as Error).message}`);
      this.notFoundClasses.add(key);
    }
  }

  /**
   * Synchronous lookup. Returns "namespace.className" if namespace exists,
   * or the original className otherwise. Skips if already namespace-qualified.
   * Requires resolve() to have been called for this className beforehand.
   */
  public getQualifiedClassName(className: string): string {
    if (!className || className.includes('.')) return className;
    const ns = this.namespaceMap.get(className.toLowerCase());
    return ns ? `${ns}.${className}` : className;
  }

  /**
   * Returns true if the className was modified (namespace was prepended).
   * Useful for adding warnings in assessment reports.
   */
  public wasNamespaceAdded(className: string): boolean {
    if (!className || className.includes('.')) return false;
    const ns = this.namespaceMap.get(className.toLowerCase());
    return !!ns;
  }

  public clear(): void {
    this.namespaceMap.clear();
    this.notFoundClasses.clear();
  }
}
