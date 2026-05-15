/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { expect } from 'chai';
import * as sinon from 'sinon';
import { ApexNamespaceRegistry, ApexResolveStatus } from '../../src/migration/ApexNamespaceRegistry';

describe('ApexNamespaceRegistry', () => {
  let registry: ApexNamespaceRegistry;
  let mockConnection: any;

  beforeEach(() => {
    registry = ApexNamespaceRegistry.getInstance();
    registry.clear();

    mockConnection = {
      tooling: {
        query: sinon.stub(),
        queryMore: sinon.stub(),
      },
    };
  });

  describe('initialize', () => {
    it('should load local and namespaced classes', async () => {
      mockConnection.tooling.query
        .onFirstCall()
        .resolves({ done: true, records: [{ Name: 'LocalHelper' }, { Name: 'MyUtil' }] });
      mockConnection.tooling.query
        .onSecondCall()
        .resolves({ done: true, records: [{ Name: 'LookupController' }, { Name: 'DataService' }] });

      await registry.initialize(mockConnection, 'vlocity_ins');

      expect(registry.resolveStatus('LocalHelper')).to.equal(ApexResolveStatus.LOCAL);
      expect(registry.resolveStatus('LookupController')).to.equal(ApexResolveStatus.NAMESPACED);
      expect(registry.resolveStatus('UnknownClass')).to.equal(ApexResolveStatus.NOT_FOUND);
    });

    it('should not re-initialize if already initialized', async () => {
      mockConnection.tooling.query.resolves({ done: true, records: [] });

      await registry.initialize(mockConnection, 'vlocity_ins');
      await registry.initialize(mockConnection, 'vlocity_ins');

      expect(mockConnection.tooling.query.calledTwice).to.be.true; // 2 calls for first init (local + namespaced)
    });

    it('should handle query errors gracefully', async () => {
      mockConnection.tooling.query.rejects(new Error('Connection timeout'));

      await registry.initialize(mockConnection, 'vlocity_ins');

      expect(registry.resolveStatus('AnyClass')).to.equal(ApexResolveStatus.NOT_FOUND);
    });

    it('should handle pagination via queryMore', async () => {
      mockConnection.tooling.query
        .onFirstCall()
        .resolves({ done: false, records: [{ Name: 'ClassA' }], nextRecordsUrl: '/next' });
      mockConnection.tooling.queryMore.resolves({ done: true, records: [{ Name: 'ClassB' }] });
      mockConnection.tooling.query.onSecondCall().resolves({ done: true, records: [] });

      await registry.initialize(mockConnection, 'vlocity_ins');

      expect(registry.resolveStatus('ClassA')).to.equal(ApexResolveStatus.LOCAL);
      expect(registry.resolveStatus('ClassB')).to.equal(ApexResolveStatus.LOCAL);
    });
  });

  describe('resolveStatus', () => {
    beforeEach(async () => {
      mockConnection.tooling.query.onFirstCall().resolves({ done: true, records: [{ Name: 'LocalHelper' }] });
      mockConnection.tooling.query.onSecondCall().resolves({ done: true, records: [{ Name: 'ManagedController' }] });

      await registry.initialize(mockConnection, 'vlocity_ins');
    });

    it('should return LOCAL for a local class', () => {
      expect(registry.resolveStatus('LocalHelper')).to.equal(ApexResolveStatus.LOCAL);
    });

    it('should return NAMESPACED for a managed package class', () => {
      expect(registry.resolveStatus('ManagedController')).to.equal(ApexResolveStatus.NAMESPACED);
    });

    it('should return NOT_FOUND for unknown class', () => {
      expect(registry.resolveStatus('DoesNotExist')).to.equal(ApexResolveStatus.NOT_FOUND);
    });

    it('should return SKIP for already namespace-qualified class', () => {
      expect(registry.resolveStatus('ns.MyClass')).to.equal(ApexResolveStatus.SKIP);
    });

    it('should return SKIP for empty className', () => {
      expect(registry.resolveStatus('')).to.equal(ApexResolveStatus.SKIP);
    });

    it('should return SKIP for invalid class name', () => {
      expect(registry.resolveStatus('1InvalidClass')).to.equal(ApexResolveStatus.SKIP);
      expect(registry.resolveStatus('My-Class')).to.equal(ApexResolveStatus.SKIP);
    });

    it('should be case-insensitive', () => {
      expect(registry.resolveStatus('localhelper')).to.equal(ApexResolveStatus.LOCAL);
      expect(registry.resolveStatus('MANAGEDCONTROLLER')).to.equal(ApexResolveStatus.NAMESPACED);
    });
  });

  describe('getQualifiedClassName', () => {
    beforeEach(async () => {
      mockConnection.tooling.query.onFirstCall().resolves({ done: true, records: [{ Name: 'LocalHelper' }] });
      mockConnection.tooling.query.onSecondCall().resolves({ done: true, records: [{ Name: 'LookupController' }] });

      await registry.initialize(mockConnection, 'devopsimpkg15');
    });

    it('should return namespace.className for namespaced class', () => {
      expect(registry.getQualifiedClassName('LookupController')).to.equal('devopsimpkg15.LookupController');
    });

    it('should return original className for local class', () => {
      expect(registry.getQualifiedClassName('LocalHelper')).to.equal('LocalHelper');
    });

    it('should return original if already namespace-qualified', () => {
      expect(registry.getQualifiedClassName('ns.MyClass')).to.equal('ns.MyClass');
    });

    it('should return empty string for empty input', () => {
      expect(registry.getQualifiedClassName('')).to.equal('');
    });

    it('should return original for unknown class', () => {
      expect(registry.getQualifiedClassName('UnknownClass')).to.equal('UnknownClass');
    });
  });

  describe('wasNamespaceAdded', () => {
    beforeEach(async () => {
      mockConnection.tooling.query.onFirstCall().resolves({ done: true, records: [{ Name: 'LocalHelper' }] });
      mockConnection.tooling.query.onSecondCall().resolves({ done: true, records: [{ Name: 'ManagedController' }] });

      await registry.initialize(mockConnection, 'vlocity_ins');
    });

    it('should return true for namespaced class', () => {
      expect(registry.wasNamespaceAdded('ManagedController')).to.be.true;
    });

    it('should return false for local class', () => {
      expect(registry.wasNamespaceAdded('LocalHelper')).to.be.false;
    });

    it('should return false for already qualified class', () => {
      expect(registry.wasNamespaceAdded('ns.MyClass')).to.be.false;
    });

    it('should return false for unknown class', () => {
      expect(registry.wasNamespaceAdded('UnknownClass')).to.be.false;
    });
  });
});
