/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-eval */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { Messages } from '@salesforce/core';
import { Logger } from '../../logger';
import { TemplateParserUtil } from '../util';
import { NodeType } from './nodeTypes';

/**
 * Represents a node in the template parsing tree that can be converted to HTML.
 * Supports different node types including native HTML elements, loops, conditionals, and placeholders.
 */
export class ElementNode {
  public type: NodeType;
  public name: string;
  public properties: Map<string, string>;
  public children: ElementNode[];
  public messages: Messages;

  public constructor(
    type: NodeType,
    name: string,
    properties: Map<string, string>,
    children: ElementNode[],
    messages: Messages
  ) {
    this.type = type;
    this.name = name;
    this.properties = properties;
    this.children = children;
    this.messages = messages;
  }

  /**
   * Converts the element node to HTML based on its type.
   * Routes to appropriate conversion method based on the node type.
   *
   * @param props - Map of properties/values to use during conversion
   * @returns Generated HTML string
   */
  public toHtml(props: Map<string, any>): string {
    try {
      switch (this.type) {
        case NodeType.NATIVE:
          return this.nativeToHtml(props);
        case NodeType.FOR_LOOP:
          return this.forLoopToHtml(props);
        case NodeType.PLACEHOLDER:
          return this.placeholderToHtml(props);
        case NodeType.IF:
          return this.ifToHtml(props);
      }
    } catch (error) {
      Logger.error(this.messages.getMessage('errorGeneratingHTML', [JSON.stringify(this), this.getPropertiesString()]));
      throw error;
    }
  }

  /**
   * Converts a native HTML element node to HTML string.
   * Handles text nodes and regular HTML elements with attributes and children.
   *
   * @param props - Map of properties/values for attribute interpolation
   * @returns Generated HTML string for the native element
   */
  public nativeToHtml(props: Map<string, any>): string {
    if (this.name === 'text') {
      return this.properties.get('content') || '';
    }
    let html = `<${this.name}`;
    for (const [key, value] of this.properties) {
      if (value == null) {
        html += ` ${key}`;
        continue;
      }
      if (value.startsWith('(')) {
        html += ` ${key}="${props.get(value.slice(1, -1))}"`;
      } else {
        html += ` ${key}="${value}"`;
      }
    }
    html += '>';
    for (const child of this.children) {
      html += child.toHtml(props);
    }
    html += `</${this.name}>`;
    return html;
  }

  /**
   * Converts a for-loop node to HTML by iterating over an array.
   * Renders children for each item in the array with item and index context.
   *
   * @param props - Map containing the array to iterate over and other properties
   * @returns Generated HTML string from the loop iteration
   */
  public forLoopToHtml(props: Map<string, any>): string {
    let html = '';
    const array = props.get(this.name) as any[];
    if (!array) {
      return '';
    }

    // Get custom variable and index names from properties
    const itemVarName = this.properties.get('item') || 'item';
    const indexVarName = this.properties.get('index') || 'index';

    array.forEach((item, index) => {
      if (item == null) {
        Logger.warn('skipping item in for loop, found to be null or undefined');
        return;
      }
      this.addProps(props, index.toString(), item, itemVarName, indexVarName);
      html += this.children.map((child) => child.toHtml(props)).join('');
      this.removeProps(props, item, itemVarName, indexVarName);
    });
    return html;
  }

  /**
   * Converts a conditional (if) node to HTML based on expression evaluation.
   * Only renders children if the condition evaluates to true.
   *
   * @param props - Map of properties used in the conditional expression
   * @returns Generated HTML string if condition is true, empty string otherwise
   */
  public ifToHtml(props: Map<string, any>): string {
    // Evaluate the JavaScript expression
    const expression = this.name;
    const isTrue = this.evaluateExpression(expression, props);

    if (isTrue) {
      // Render children if condition is true
      return this.children.map((child) => child.toHtml(props)).join('');
    }
    // Return empty string if condition is false
    return '';
  }

  /**
   * Converts a placeholder node to HTML by substituting with a property value.
   *
   * @param props - Map containing the value to substitute for the placeholder
   * @returns The substituted value as a string
   */
  public placeholderToHtml(props: Map<string, any>): string {
    return props.get(this.name) as string;
  }

  /**
   * Adds loop context variables (item and index) to the properties map.
   * Handles different data types (strings, arrays, objects) appropriately.
   *
   * @param props - Properties map to add variables to
   * @param ind - Index value as string
   * @param value - Current item value
   * @param itemVarName - Name of the item variable
   * @param indexVarName - Name of the index variable
   */
  private addProps(props: Map<string, any>, ind: string, value: any, itemVarName: string, indexVarName: string): void {
    props.set(indexVarName, ind);
    if (typeof value === 'string' || Array.isArray(value)) {
      props.set(itemVarName, value);
      return;
    }
    TemplateParserUtil.parseKeyPair(value, this.messages, itemVarName).forEach((val, key) => {
      props.set(key, val);
    });
  }

  /**
   * Removes loop context variables from the properties map after iteration.
   * Cleans up temporary variables to prevent pollution of the properties map.
   *
   * @param props - Properties map to remove variables from
   * @param value - Current item value
   * @param itemVarName - Name of the item variable
   * @param indexVarName - Name of the index variable
   */
  private removeProps(props: Map<string, any>, value: any, itemVarName: string, indexVarName: string): void {
    props.delete(indexVarName);
    if (typeof value === 'string' || Array.isArray(value)) {
      props.delete(itemVarName);
      return;
    }
    TemplateParserUtil.parseKeyPair(value, this.messages, itemVarName).forEach((_value, key) => {
      props.delete(key);
    });
  }

  /**
   * Evaluates a JavaScript expression by substituting property values.
   * Replaces property references (e.g., $variable) with their actual values.
   *
   * @param expression - JavaScript expression string to evaluate
   * @param props - Map of properties to substitute in the expression
   * @returns Boolean result of the expression evaluation
   */
  private evaluateExpression(expression: string, props: Map<string, any>): boolean {
    props.forEach((value, key) => {
      expression = expression.replace(`$${key}`, JSON.stringify(value));
    });
    // replace remaining variables with undefined
    const remainingVariables = expression.match(/\$\w+(?:\.\w+)*/g);
    if (remainingVariables) {
      remainingVariables.forEach((variable) => {
        expression = expression.replace(variable, 'undefined');
      });
    }
    try {
      return eval(expression) as boolean;
    } catch (error) {
      Logger.error(this.messages.getMessage('errorEvaluatingExpression', [expression, error]));
      return false;
    }
  }

  /**
   * Returns a string representation of the element's properties.
   * Formats properties as a JSON object with key-value pairs.
   * For logging purposes only.
   *
   * @returns String representation of properties
   */
  private getPropertiesString(): string | number | boolean {
    if (!this.properties) {
      return '{}';
    }

    let propertiesString = '{\n';
    for (const [key, value] of this.properties.entries()) {
      propertiesString += `"${key}": "${value}"\n`;
    }
    propertiesString += '}';
    return propertiesString;
  }
}
