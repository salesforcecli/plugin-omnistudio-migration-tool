import { Connection } from '@salesforce/core';
import { Logger } from '../utils/logger';

export const ApexResolveStatus = {
  LOCAL: 'local',
  NAMESPACED: 'namespaced',
  NOT_FOUND: 'not_found',
  SKIP: 'skip',
} as const;

export type ApexResolveStatusType = (typeof ApexResolveStatus)[keyof typeof ApexResolveStatus];

/**
 * Singleton registry that pre-loads Apex class names at startup.
 * Stores two sets: local classes (no namespace) and namespaced classes (matching the selected package namespace).
 * All lookups after initialization are synchronous.
 */
export class ApexNamespaceRegistry {
  private static instance: ApexNamespaceRegistry;
  private static readonly VALID_APEX_CLASS_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/;

  private localClasses: Set<string> = new Set();
  private namespacedClasses: Set<string> = new Set();
  private namespace = '';
  private initialized = false;

  public static getInstance(): ApexNamespaceRegistry {
    if (!ApexNamespaceRegistry.instance) {
      ApexNamespaceRegistry.instance = new ApexNamespaceRegistry();
    }
    return ApexNamespaceRegistry.instance;
  }

  /**
   * Pre-loads all Apex classes from the org into two buckets:
   * - localClasses: classes with no namespace (NamespacePrefix is null/empty)
   * - namespacedClasses: classes matching the selected package namespace
   *
   * Call once before assessment/migration begins.
   */
  public async initialize(connection: Connection, namespace: string): Promise<void> {
    if (this.initialized) return;
    this.namespace = namespace;

    try {
      const localQuery = 'SELECT Name FROM ApexClass WHERE NamespacePrefix = null';
      let result = await connection.tooling.query<{ Name: string }>(localQuery);
      if (result && result.records) {
        result.records.forEach((r) => this.localClasses.add(r.Name.toLowerCase()));
        while (!result.done && result.nextRecordsUrl) {
          result = await connection.tooling.queryMore<{ Name: string }>(result.nextRecordsUrl);
          if (result && result.records) {
            result.records.forEach((r) => this.localClasses.add(r.Name.toLowerCase()));
          }
        }
      }
      Logger.logVerbose(`ApexNamespaceRegistry: Loaded ${this.localClasses.size} local Apex classes`);
    } catch (err) {
      Logger.logVerbose(`ApexNamespaceRegistry: Error loading local classes: ${(err as Error).message}`);
    }

    if (namespace) {
      try {
        const nsQuery = `SELECT Name FROM ApexClass WHERE NamespacePrefix = '${namespace}'`;
        let result = await connection.tooling.query<{ Name: string }>(nsQuery);
        if (result && result.records) {
          result.records.forEach((r) => this.namespacedClasses.add(r.Name.toLowerCase()));
          while (!result.done && result.nextRecordsUrl) {
            result = await connection.tooling.queryMore<{ Name: string }>(result.nextRecordsUrl);
            if (result && result.records) {
              result.records.forEach((r) => this.namespacedClasses.add(r.Name.toLowerCase()));
            }
          }
        }
        Logger.logVerbose(
          `ApexNamespaceRegistry: Loaded ${this.namespacedClasses.size} Apex classes for namespace "${namespace}"`
        );
      } catch (err) {
        Logger.logVerbose(`ApexNamespaceRegistry: Error loading namespaced classes: ${(err as Error).message}`);
      }
    }

    this.initialized = true;
  }

  /**
   * Checks a className and returns its resolution status:
   * - 'local': exists without namespace, no change needed
   * - 'namespaced': exists under the package namespace, needs prefix
   * - 'not_found': does not exist in either set
   * - 'skip': invalid class name or already qualified
   */
  public resolveStatus(className: string): ApexResolveStatusType {
    if (!className || className.includes('.')) return ApexResolveStatus.SKIP;
    if (!ApexNamespaceRegistry.VALID_APEX_CLASS_NAME.test(className)) return ApexResolveStatus.SKIP;

    const key = className.toLowerCase();
    if (this.localClasses.has(key)) return ApexResolveStatus.LOCAL;
    if (this.namespacedClasses.has(key)) return ApexResolveStatus.NAMESPACED;
    return ApexResolveStatus.NOT_FOUND;
  }

  /**
   * Returns "namespace.className" if the class belongs to the package namespace,
   * or the original className otherwise.
   */
  public getQualifiedClassName(className: string): string {
    if (!className || className.includes('.')) return className;
    if (!ApexNamespaceRegistry.VALID_APEX_CLASS_NAME.test(className)) return className;

    const key = className.toLowerCase();
    if (this.namespacedClasses.has(key) && !this.localClasses.has(key)) {
      return `${this.namespace}.${className}`;
    }
    return className;
  }

  /**
   * Returns true if the className was resolved to a namespaced class (will be prefixed).
   */
  public wasNamespaceAdded(className: string): boolean {
    return this.resolveStatus(className) === ApexResolveStatus.NAMESPACED;
  }

  public getNamespace(): string {
    return this.namespace;
  }

  public clear(): void {
    this.localClasses.clear();
    this.namespacedClasses.clear();
    this.namespace = '';
    this.initialized = false;
  }
}
