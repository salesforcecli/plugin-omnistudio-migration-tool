import { expect } from 'chai';
import { stripHtml, escapeCSVValue, escapeHtml, formatUnicorn } from '../../src/utils/stringUtils';

describe('stringUtils', () => {
  describe('stripHtml', () => {
    it('should remove simple HTML tags', () => {
      expect(stripHtml('<p>Hello World</p>')).to.equal('Hello World');
    });

    it('should remove nested HTML tags', () => {
      expect(stripHtml('<div><strong>Bold</strong> text</div>')).to.equal('Bold text');
    });

    it('should decode &nbsp; entities', () => {
      expect(stripHtml('Hello&nbsp;World')).to.equal('Hello World');
    });

    it('should decode &amp; entities', () => {
      expect(stripHtml('Tom &amp; Jerry')).to.equal('Tom & Jerry');
    });

    it('should decode &lt; and &gt; entities', () => {
      expect(stripHtml('&lt;script&gt;')).to.equal('<script>');
    });

    it('should decode &quot; entities', () => {
      expect(stripHtml('She said &quot;hello&quot;')).to.equal('She said "hello"');
    });

    it('should decode &#39; entities', () => {
      expect(stripHtml('it&#39;s')).to.equal("it's");
    });

    it('should handle strings with no HTML', () => {
      expect(stripHtml('plain text')).to.equal('plain text');
    });

    it('should handle empty string', () => {
      expect(stripHtml('')).to.equal('');
    });

    it('should handle complex HTML with multiple tags and entities', () => {
      const input = '<p>Label with <strong>bold</strong> &amp; <em>italic</em>&nbsp;text</p>';
      expect(stripHtml(input)).to.equal('Label with bold & italic text');
    });

    it('should handle self-closing tags', () => {
      expect(stripHtml('Line 1<br/>Line 2')).to.equal('Line 1Line 2');
    });
  });

  describe('escapeCSVValue', () => {
    it('should return value as-is if no special characters', () => {
      expect(escapeCSVValue('simple text')).to.equal('simple text');
    });

    it('should wrap in quotes if value contains comma', () => {
      expect(escapeCSVValue('hello, world')).to.equal('"hello, world"');
    });

    it('should wrap in quotes if value contains double quote and escape it', () => {
      expect(escapeCSVValue('say "hello"')).to.equal('"say ""hello"""');
    });

    it('should wrap in quotes if value contains newline', () => {
      expect(escapeCSVValue('line1\nline2')).to.equal('"line1\nline2"');
    });

    it('should wrap in quotes if value contains carriage return', () => {
      expect(escapeCSVValue('line1\rline2')).to.equal('"line1\rline2"');
    });

    it('should return empty quoted string for null', () => {
      expect(escapeCSVValue(null as unknown as string)).to.equal('""');
    });

    it('should handle empty string', () => {
      expect(escapeCSVValue('')).to.equal('');
    });

    it('should handle value with multiple special characters', () => {
      expect(escapeCSVValue('value with, "quotes" and\nnewline')).to.equal('"value with, ""quotes"" and\nnewline"');
    });
  });

  describe('escapeHtml', () => {
    it('should escape < and > characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).to.equal(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('should escape & character', () => {
      expect(escapeHtml('Tom & Jerry')).to.equal('Tom &amp; Jerry');
    });

    it('should return empty string for falsy input', () => {
      expect(escapeHtml('')).to.equal('');
    });
  });

  describe('formatUnicorn', () => {
    it('should replace numbered placeholders', () => {
      expect(formatUnicorn('Hello {0}, welcome to {1}', 'World', 'Salesforce')).to.equal(
        'Hello World, welcome to Salesforce'
      );
    });

    it('should replace named placeholders with object', () => {
      expect(formatUnicorn('Hello {name}', { name: 'World' })).to.equal('Hello World');
    });
  });
});
