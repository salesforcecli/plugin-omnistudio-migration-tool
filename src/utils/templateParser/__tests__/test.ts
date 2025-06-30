/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'assert';
import { TemplateParserUtil } from '../util';
import { TemplateParser } from '../generate';

/**
 * Test suite for TemplateParser functionality
 */

export function runTemplateParserTests(): void {
  // Test the attribute parsing
  const testHtml = '<div class="container" style="color: red;" id="main">Hello {{name}}</div>';

  const node = TemplateParserUtil.parseHtmlToNode(testHtml);

  // Assert node properties
  assert.strictEqual(node.type, 0, 'Node type should be NATIVE');
  assert.strictEqual(node.name, 'div', 'Node name should be div');
  assert.strictEqual(node.properties.get('class'), 'container', 'Class attribute should be parsed correctly');
  assert.strictEqual(node.properties.get('style'), 'color: red;', 'Style attribute should be parsed correctly');
  assert.strictEqual(node.properties.get('id'), 'main', 'ID attribute should be parsed correctly');
  assert.strictEqual(node.children.length, 1, 'Should have one child (text node)');
  assert.strictEqual(node.children[0].name, 'text', 'Child should be a text node');
  assert.strictEqual(node.children[0].properties.get('content'), 'Hello {{name}}', 'Text content should be preserved');

  // Test with a more complex example
  const complexHtml =
    '<div class="main" id="container"><span class="text" style="font-weight: bold;">Hello</span></div>';

  const complexNode = TemplateParserUtil.parseHtmlToNode(complexHtml);

  // Assert complex node properties
  assert.strictEqual(complexNode.type, 0, 'Complex node type should be NATIVE');
  assert.strictEqual(complexNode.name, 'div', 'Complex node name should be div');
  assert.strictEqual(complexNode.properties.get('class'), 'main', 'Complex node class should be parsed');
  assert.strictEqual(complexNode.properties.get('id'), 'container', 'Complex node ID should be parsed');
  assert.strictEqual(complexNode.children.length, 1, 'Complex node should have one child');

  const childNode = complexNode.children[0];
  assert.strictEqual(childNode.name, 'span', 'Child should be span element');
  assert.strictEqual(childNode.properties.get('class'), 'text', 'Child class should be parsed');
  assert.strictEqual(childNode.properties.get('style'), 'font-weight: bold;', 'Child style should be parsed');
  assert.strictEqual(childNode.children.length, 1, 'Child should have one text child');
  assert.strictEqual(
    childNode.children[0].properties.get('content'),
    'Hello',
    'Child text content should be preserved'
  );

  // Test enhanced for loop functionality
  const forLoopHtml = '<c:for items=(users) var="user" index="i"><div>{{user.name}} - {{i}}</div></c:for>';

  const forLoopNode = TemplateParserUtil.parseHtmlToNode(forLoopHtml);

  // Assert for loop node properties
  assert.strictEqual(forLoopNode.type, 1, 'For loop node type should be FOR_LOOP');
  assert.strictEqual(forLoopNode.name, 'users', 'For loop items name should be users');
  assert.strictEqual(forLoopNode.properties.get('item'), 'user', 'For loop item variable should be user');
  assert.strictEqual(forLoopNode.properties.get('index'), 'i', 'For loop index variable should be i');
  assert.strictEqual(forLoopNode.children.length, 1, 'For loop should have one child');

  // Test with default values (no custom var/index)
  const defaultForLoopHtml = '<c:for items=(items)><div>{{item.name}}</div></c:for>';

  const defaultForLoopNode = TemplateParserUtil.parseHtmlToNode(defaultForLoopHtml);

  // Assert default for loop properties
  assert.strictEqual(defaultForLoopNode.type, 1, 'Default for loop node type should be FOR_LOOP');
  assert.strictEqual(defaultForLoopNode.name, 'items', 'Default for loop items name should be items');
  assert.strictEqual(defaultForLoopNode.properties.get('item'), 'item', 'Default for loop item should default to item');
  assert.strictEqual(
    defaultForLoopNode.properties.get('index'),
    'index',
    'Default for loop index should default to index'
  );

  // Test if condition functionality
  const ifHtml = '<c:if exp={showMessage}><div>This message is shown conditionally</div></c:if>';

  const ifNode = TemplateParserUtil.parseHtmlToNode(ifHtml);

  // Assert if condition node properties
  assert.strictEqual(ifNode.type, 3, 'If node type should be IF');
  assert.strictEqual(ifNode.name, 'showMessage', 'If node expression should be showMessage');
  assert.strictEqual(ifNode.children.length, 1, 'If node should have one child');

  // Test complex if condition
  const complexIfHtml = '<c:if exp={user && user.isAdmin}><div>Admin panel: {{user.name}}</div></c:if>';

  const complexIfNode = TemplateParserUtil.parseHtmlToNode(complexIfHtml);

  // Assert complex if condition properties
  assert.strictEqual(complexIfNode.type, 3, 'Complex if node type should be IF');
  assert.strictEqual(complexIfNode.name, 'user && user.isAdmin', 'Complex if expression should be preserved');
  assert.strictEqual(complexIfNode.children.length, 1, 'Complex if node should have one child');

  // Test placeholder functionality
  const placeholderHtml = '{{userName}}';

  const placeholderNode = TemplateParserUtil.parseHtmlToNode(placeholderHtml);

  // Assert placeholder node properties
  assert.strictEqual(placeholderNode.type, 2, 'Placeholder node type should be PLACEHOLDER');
  assert.strictEqual(placeholderNode.name, 'userName', 'Placeholder name should be userName');
  assert.strictEqual(placeholderNode.children.length, 0, 'Placeholder should have no children');

  // Test template generation with data
  const template = '<div>Hello {{name}}! <c:if exp={isAdmin}>You are an admin.</c:if></div>';
  const data = { name: 'John', isAdmin: true } as any;

  const generatedHtml = TemplateParser.generate(template, data);
  const expectedHtml = '<div>Hello John! You are an admin.</div>';

  assert.strictEqual(generatedHtml, expectedHtml, 'Generated HTML should match expected output');

  // Test template generation with false condition
  const data2 = { name: 'Jane', isAdmin: false } as any;
  const generatedHtml2 = TemplateParser.generate(template, data2);
  const expectedHtml2 = '<div>Hello Jane! </div>';

  assert.strictEqual(
    generatedHtml2,
    expectedHtml2,
    'Generated HTML with false condition should hide conditional content'
  );

  // Test for loop generation
  const loopTemplate = '<c:for items=(users) var="user" index="i"><div>{{i}}: {{user.name}}</div></c:for>';
  const loopData = { users: [{ name: 'Alice' }, { name: 'Bob' }] } as any;

  const generatedLoopHtml = TemplateParser.generate(loopTemplate, loopData);
  const expectedLoopHtml = '<div>0: Alice</div><div>1: Bob</div>';

  assert.strictEqual(generatedLoopHtml, expectedLoopHtml, 'Generated loop HTML should match expected output');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTemplateParserTests();
}
