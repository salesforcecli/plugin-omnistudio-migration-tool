/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { expect } from 'chai';
import { LwcPackageUtilityRegistry } from '../../../../src/utils/lwcparser/LwcPackageUtilityRegistry';

describe('LwcPackageUtilityRegistry', () => {
  let registry: LwcPackageUtilityRegistry;

  beforeEach(() => {
    registry = LwcPackageUtilityRegistry.getInstance();
    registry.clear();
    registry.initialize();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('Singleton lifecycle', () => {
    it('should return the same instance from getInstance', () => {
      const first = LwcPackageUtilityRegistry.getInstance();
      const second = LwcPackageUtilityRegistry.getInstance();
      expect(first).to.equal(second);
    });

    it('should be idempotent when initialize is called multiple times', () => {
      // Already initialized in beforeEach — a second call must not throw and must keep state.
      registry.initialize();
      expect(registry.hasUtilityComponent('insUtility')).to.be.true;
    });

    it('clear() should empty the registry so lookups return false', () => {
      registry.clear();
      expect(registry.hasUtilityComponent('insUtility')).to.be.false;
      expect(registry.hasUtilityComponentByTag('ins-utility')).to.be.false;
    });
  });

  describe('hasUtilityComponent (camelCase lookup)', () => {
    it('should return true for a known seeded utility component (insUtility)', () => {
      expect(registry.hasUtilityComponent('insUtility')).to.be.true;
    });

    it('should return true for additional known seeded components', () => {
      expect(registry.hasUtilityComponent('insLabels')).to.be.true;
      expect(registry.hasUtilityComponent('insAccordion')).to.be.true;
      expect(registry.hasUtilityComponent('insField')).to.be.true;
    });

    it('should be case-insensitive', () => {
      expect(registry.hasUtilityComponent('INSUTILITY')).to.be.true;
      expect(registry.hasUtilityComponent('insutility')).to.be.true;
      expect(registry.hasUtilityComponent('InsUtility')).to.be.true;
    });

    it('should return false for an unknown component name', () => {
      expect(registry.hasUtilityComponent('MyCustomComponent')).to.be.false;
    });

    it('should return false for null/undefined/empty input', () => {
      expect(registry.hasUtilityComponent('')).to.be.false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(registry.hasUtilityComponent(null as any)).to.be.false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(registry.hasUtilityComponent(undefined as any)).to.be.false;
    });
  });

  describe('hasUtilityComponentByTag (kebab-case lookup)', () => {
    it('should convert ins-utility to insUtility and return true', () => {
      expect(registry.hasUtilityComponentByTag('ins-utility')).to.be.true;
    });

    it('should resolve multi-hyphen kebab forms (ins-accordion-section)', () => {
      expect(registry.hasUtilityComponentByTag('ins-accordion-section')).to.be.true;
      expect(registry.hasUtilityComponentByTag('ins-attribute-category-list')).to.be.true;
    });

    it('should return false for an unknown kebab tag (my-custom-component)', () => {
      expect(registry.hasUtilityComponentByTag('my-custom-component')).to.be.false;
    });

    it('should return false for empty/null tag input', () => {
      expect(registry.hasUtilityComponentByTag('')).to.be.false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(registry.hasUtilityComponentByTag(null as any)).to.be.false;
    });
  });
});
