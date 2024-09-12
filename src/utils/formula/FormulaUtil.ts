/* eslint-disable */

import { AnyJson } from '@salesforce/ts-types';
import FDefFields from '../../mappings/FuncDefMetadataFields';
import Stack from './Stack';
import { DebugTimer } from '../logging/debugtimer';
import { QueryTools } from '../query';
import { DataRaptorMigrationTool } from '../../migration/dataraptor';
import { Connection } from '@salesforce/core';

export function getReplacedformulaString(
  formulaExpression: string,
  formulaName: string,
  className: string,
  methodName: string
): string {
  const regExStr = new RegExp('\\b' + formulaName + '\\b', 'g');
  const startIndex = formulaExpression.search(regExStr);
  const startParanthIndex = startIndex + formulaName.length;
  const endParanthIndex = getClosingIndexOfParantheses(formulaExpression, startParanthIndex);
  const newFormulaExpression =
    'Function(' +
    className +
    ',' +
    methodName +
    ',' +
    formulaExpression.substring(startParanthIndex + 1, endParanthIndex) +
    ')';
  const finalFormulaExpression = formulaExpression.replace(
    formulaExpression.substring(startIndex, endParanthIndex + 1),
    newFormulaExpression
  );

  return finalFormulaExpression;
}

function getClosingIndexOfParantheses(expression: string, openingIndex: number): number {
  let i;

  // If index given is invalid and is
  // not an opening bracket.
  if (expression[openingIndex] === '(') {
    // Stack to store opening brackets.
    const st = new Stack<string>();

    // Traverse through string starting from
    // given index.
    for (i = openingIndex; i < expression.length; i++) {
      // If current character is an
      // opening bracket push it in stack.
      if (expression[i] === '(') st.push(expression[i]);
      // If current character is a closing
      // bracket, pop from stack. If stack
      // is empty, then this closing
      // bracket is required bracket.
      else if (expression[i] === ')') {
        st.pop();
        if (st.size() === 0) {
          return i;
        }
      }
    }
  }

  return -1;
}

export function getFunctionDefinitionFields(): string[] {
  const requiredFields: string[] = [];
  FDefFields.forEach(function (field) {
    requiredFields.push(field);
  });

  return requiredFields;
}

// Get All FunctionDefinition__mdt records
export async function getAllFunctionMetadata(namespace: string, connection: Connection): Promise<AnyJson[]> {
  DebugTimer.getInstance().lap('Query FunctionDefinition__mdt');
  return await QueryTools.queryAll(connection, namespace, 'FunctionDefinition__mdt', getFunctionDefinitionFields());
}

export default getReplacedformulaString;
