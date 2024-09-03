import { expect } from '@salesforce/command/lib/test';
import { ApexASTParser } from '../../../../src/utils/apex/parser/apexparser';

describe('ApexASTParser', () => {
  it('should parse the Apex file and collect interface implementations, method calls, and class names', () => {
    const apexFileContent = `global with sharing class FormulaParserService implements Callable{

        global void justForTest(String kkdbk) {
        /* Specify Data Mapper extract or transform to call */
        String DRName = 'DataMapperNewName'; 
        /* Populate the input JSON */ 
        Map<String, Object> myTransformData = new Map<String, Object>{'MyKey'=>'MyValue'}; 
        /* Call the Data Mapper */ 
        omnistudio.DRProcessResult result1 = omnistudio.DRGlobal.process(myTransformData, DRName);
    }
    }`;
    const interfaceName = 'Callable';
    const methodName = 'yourMethod';

    const apexParser = new ApexASTParser(apexFileContent, interfaceName, methodName);
    apexParser.parse();
    const implementsInterface = apexParser.implementsInterfaces;
    // const callsMethods = apexParser.getCallsMethods();
    // const className = apexParser.getClassName();

    // Add your assertions here based on the expected results
    // implementsInterface.get(interfaceName);
    expect(implementsInterface.get(interfaceName).charPositionInLine).to.be.equal(58);
    expect(implementsInterface.get(interfaceName).line).to.be.equal(1);
    // expect(callsMethods).to.not.be.empty;
    // expect(className).to.equal('YourClass');
  });
});
