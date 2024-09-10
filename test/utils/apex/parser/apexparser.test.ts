import { expect } from '@salesforce/command/lib/test';
import { ApexASTParser, MethodCall } from '../../../../src/utils/apex/parser/apexparser';

describe('ApexASTParser', () => {
  it('should parse the Apex file and collect interface implementations, method calls, and class names', () => {
    const apexFileContent = `global with sharing class FormulaParserService implements Callable{

        global void justForTest(String kkdbk) {
        /* Specify Data Mapper extract or transform to call */
        String DRName = 'DataMapperNewName'; 
        /* Populate the input JSON */ 
        Map<String, Object> myTransformData = new Map<String, Object>{'MyKey'=>'MyValue'}; 
        /* Call the Data Mapper */ 
        vlocity_ins.DRProcessResult result1 = vlocity_ins.DRGlobal.process(myTransformData, 'DRName');
    }
    }`;
    const callable = 'Callable';
    const interfaceName = new Set<string>(['Callable']);
    const methodCalls = new Set<MethodCall>();
    methodCalls.add(new MethodCall('process', 'DRGlobal', 'vlocity_ins'));
    methodCalls.add(new MethodCall('processObjectsJSON', 'DRGlobal', 'vlocity_ins'));
    const apexParser = new ApexASTParser(apexFileContent, interfaceName, methodCalls, 'vlocity_ins');
    apexParser.parse();
    const implementsInterface = apexParser.implementsInterfaces;
    // const callsMethods = apexParser.getCallsMethods();
    // const className = apexParser.getClassName();

    // Add your assertions here based on the expected results
    // implementsInterface.get(interfaceName);
    expect(implementsInterface.get(callable).charPositionInLine).to.be.equal(58);
    expect(implementsInterface.get(callable).line).to.be.equal(1);
    // expect(callsMethods).to.not.be.empty;
    // expect(className).to.equal('YourClass');
  });
});
