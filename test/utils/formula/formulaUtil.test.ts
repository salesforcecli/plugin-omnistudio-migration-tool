/* eslint-disable camelcase */
import { expect } from '@salesforce/command/lib/test';
import { AnyJson } from '@salesforce/ts-types';
import { getReplacedString } from '../../../src/utils/formula/FormulaUtil';

describe('ApexASTParser', () => {
  it('should generate new string with standard function format', () => {
    const namespacePrefix = 'test_namespace__';
    const mockedFunctionDefinitionMetadata = getMockedAllFunctionMetadata();
    const inputString = "TESTMETHODFIRST('hello','bye')";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = getReplacedString(namespacePrefix, inputString, mockedFunctionDefinitionMetadata);
    const expectedResult = "Function(testClassFirst,testMethodFirst,'hello','bye')";

    expect(result).to.be.equal(expectedResult);
  });

  it('should generate new string with standard function format with nested custom formula', () => {
    const namespacePrefix = 'test_namespace__';
    const mockedFunctionDefinitionMetadata = getMockedAllFunctionMetadata();
    const inputString = "TESTMETHODFIRST('hello',TESTMETHOD('bye'))";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = getReplacedString(namespacePrefix, inputString, mockedFunctionDefinitionMetadata);
    const expectedResult = "Function(testClassFirst,testMethodFirst,'hello',Function(testClass,testMethod,'bye'))";

    expect(result).to.be.equal(expectedResult);
  });

  it('should generate new string with standard function format with nested custom formula and a formula used more than Once', () => {
    const namespacePrefix = 'test_namespace__';
    const mockedFunctionDefinitionMetadata = getMockedAllFunctionMetadata();
    const inputString = "TESTMETHODFIRST('hello',TESTMETHOD(TESTMETHODFIRST('bye','check')))";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = getReplacedString(namespacePrefix, inputString, mockedFunctionDefinitionMetadata);
    const expectedResult =
      "Function(testClassFirst,testMethodFirst,'hello',Function(testClass,testMethod,Function(testClassFirst,testMethodFirst,'bye','check')))";
    expect(result).to.be.equal(expectedResult);
  });
});

function getMockedAllFunctionMetadata(): AnyJson[] {
  return [
    {
      DeveloperName: 'TESTMETHOD',
      test_namespace__ClassName__c: 'testClass',
      test_namespace__MethodName__c: 'testMethod',
    },
    {
      DeveloperName: 'TESTMETHODFIRST',
      test_namespace__ClassName__c: 'testClassFirst',
      test_namespace__MethodName__c: 'testMethodFirst',
    },
    {
      DeveloperName: 'TESTMETHODSECOND',
      test_namespace__ClassName__c: 'testClassSecond',
      test_namespace__MethodName__c: 'testMethodSecond',
    },
    {
      DeveloperName: 'TESTMETHODTHIRD',
      test_namespace__ClassName__c: 'testClassThird',
      test_namespace__MethodName__c: 'testMethodThird',
    },
  ];
}
