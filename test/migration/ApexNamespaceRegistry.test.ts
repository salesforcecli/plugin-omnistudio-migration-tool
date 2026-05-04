/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { expect } from 'chai';
import * as sinon from 'sinon';
import { ApexNamespaceRegistry } from '../../src/migration/ApexNamespaceRegistry';

describe('ApexNamespaceRegistry', () => {
  let registry: ApexNamespaceRegistry;
  let mockConnection: any;

  beforeEach(() => {
    registry = ApexNamespaceRegistry.getInstance();
    registry.clear();

    mockConnection = {
      tooling: {
        query: sinon.stub(),
      },
    };
  });

  describe('resolve', () => {
    it('should query and cache namespace for a class name', async () => {
      mockConnection.tooling.query.resolves({
        totalSize: 1,
        records: [{ Name: 'MyController', NamespacePrefix: 'vlocity_ins' }],
      });

      await registry.resolve(mockConnection, 'MyController');

      expect(registry.getQualifiedClassName('MyController')).to.equal('vlocity_ins.MyController');
      expect(mockConnection.tooling.query.calledOnce).to.be.true;
    });

    it('should not query again for an already resolved class', async () => {
      mockConnection.tooling.query.resolves({
        totalSize: 1,
        records: [{ Name: 'MyController', NamespacePrefix: 'vlocity_ins' }],
      });

      await registry.resolve(mockConnection, 'MyController');
      await registry.resolve(mockConnection, 'MyController');

      expect(mockConnection.tooling.query.calledOnce).to.be.true;
    });

    it('should skip resolution if className already contains a dot', async () => {
      await registry.resolve(mockConnection, 'ns.MyController');

      expect(mockConnection.tooling.query.notCalled).to.be.true;
    });

    it('should skip resolution for empty className', async () => {
      await registry.resolve(mockConnection, '');

      expect(mockConnection.tooling.query.notCalled).to.be.true;
    });

    it('should handle class not found in org', async () => {
      mockConnection.tooling.query.resolves({ totalSize: 0, records: [] });

      await registry.resolve(mockConnection, 'UnknownClass');

      expect(registry.getQualifiedClassName('UnknownClass')).to.equal('UnknownClass');
    });

    it('should handle query errors gracefully', async () => {
      mockConnection.tooling.query.rejects(new Error('Connection timeout'));

      await registry.resolve(mockConnection, 'MyController');

      expect(registry.getQualifiedClassName('MyController')).to.equal('MyController');
    });
  });

  describe('getQualifiedClassName', () => {
    it('should return namespace.className when namespace exists', async () => {
      mockConnection.tooling.query.resolves({
        totalSize: 1,
        records: [{ Name: 'LookupController', NamespacePrefix: 'devopsimpkg15' }],
      });

      await registry.resolve(mockConnection, 'LookupController');

      expect(registry.getQualifiedClassName('LookupController')).to.equal('devopsimpkg15.LookupController');
    });

    it('should return original className when namespace is empty (local class)', async () => {
      mockConnection.tooling.query.resolves({
        totalSize: 1,
        records: [{ Name: 'LocalHelper', NamespacePrefix: null }],
      });

      await registry.resolve(mockConnection, 'LocalHelper');

      expect(registry.getQualifiedClassName('LocalHelper')).to.equal('LocalHelper');
    });

    it('should return original className if already namespace-qualified', () => {
      expect(registry.getQualifiedClassName('ns.MyClass')).to.equal('ns.MyClass');
    });

    it('should return empty string for empty input', () => {
      expect(registry.getQualifiedClassName('')).to.equal('');
    });
  });

  describe('wasNamespaceAdded', () => {
    it('should return true when namespace was resolved and prepended', async () => {
      mockConnection.tooling.query.resolves({
        totalSize: 1,
        records: [{ Name: 'MyController', NamespacePrefix: 'vlocity_ins' }],
      });

      await registry.resolve(mockConnection, 'MyController');

      expect(registry.wasNamespaceAdded('MyController')).to.be.true;
    });

    it('should return false when class is local (no namespace)', async () => {
      mockConnection.tooling.query.resolves({
        totalSize: 1,
        records: [{ Name: 'LocalHelper', NamespacePrefix: null }],
      });

      await registry.resolve(mockConnection, 'LocalHelper');

      expect(registry.wasNamespaceAdded('LocalHelper')).to.be.false;
    });

    it('should return false when className already contains a dot', () => {
      expect(registry.wasNamespaceAdded('ns.MyClass')).to.be.false;
    });

    it('should return false for unresolved class', () => {
      expect(registry.wasNamespaceAdded('NeverResolved')).to.be.false;
    });
  });
});
