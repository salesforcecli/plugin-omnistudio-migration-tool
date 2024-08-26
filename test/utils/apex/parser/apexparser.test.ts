import { expect } from '@salesforce/command/lib/test';
import { ApexASTParser } from '../../../../src/utils/apex/parser/apexparser';

describe('ApexASTParser', () => {
  it('should parse the Apex file and collect interface implementations, method calls, and class names', () => {
    const apexFilePath = 'test/utils/apex/parser/resource/FormulaParserService.cls';
    const interfaceName = 'Callable';
    const methodName = 'yourMethod';

    const apexParser = new ApexASTParser(apexFilePath, interfaceName, methodName);
    apexParser.parse();
    const implementsInterface = apexParser.implemementsInterface;
    // const callsMethods = apexParser.getCallsMethods();
    // const className = apexParser.getClassName();

    // Add your assertions here based on the expected results
    // implementsInterface.get(interfaceName);
    expect(implementsInterface.get(interfaceName).charPositionInLine).to.be.equal(58);
    expect(implementsInterface.get(interfaceName).line).to.be.equal(6);
    // expect(callsMethods).to.not.be.empty;
    // expect(className).to.equal('YourClass');
  });
});
