import { expect } from '@salesforce/command/lib/test';
import {
  ApexASTParser,
  InterfaceImplements,
  MethodCall,
  MethodParameter,
  ParameterType,
} from '../../../../src/utils/apex/parser/apexparser';

describe('ApexASTParser', () => {
  it('should parse the Apex file and collect interface implementations, method calls, and class names', () => {
    const apexFileContent = `global with sharing class FormulaParserService implements vlocity_ins.VlocityOpenInterface2, Callable
{

        global void justForTest(String kkdbk) {
        /* Specify Data Mapper extract or transform to call */
        String DRName = 'DataMapperNewName'; 
        /* Populate the input JSON */ 
        Map<String, Object> myTransformData = new Map<String, Object>{'MyKey'=>'MyValue'}; 
        /* Call the Data Mapper */ 
        vlocity_ins.DRProcessResult result1 = vlocity_ins.DRGlobal.process(myTransformData, 'DRName');
    }
    }`;
    // const vlocityOpenInterface2 = 'vlocity_ins.VlocityOpenInterface2';
    const namespace = 'vlocity_ins';
    const interfaces: InterfaceImplements[] = [];
    const vlocityOpenInterface = new InterfaceImplements('VlocityOpenInterface', namespace);
    const vlocityOpenInterface2 = new InterfaceImplements('VlocityOpenInterface2', namespace);
    interfaces.push(vlocityOpenInterface, vlocityOpenInterface2, new InterfaceImplements('Callable'));
    const methodCalls = new Set<MethodCall>();
    const drNameParameter = new MethodParameter(2, ParameterType.DR_NAME);
    const ipNameParameter = new MethodParameter(1, ParameterType.IP_NAME);
    methodCalls.add(new MethodCall('DRGlobal', 'process', namespace, drNameParameter));
    methodCalls.add(new MethodCall('DRGlobal', 'processObjectsJSON', namespace, drNameParameter));
    methodCalls.add(new MethodCall('DRGlobal', 'processString', namespace, drNameParameter));
    methodCalls.add(new MethodCall('DRGlobal', 'processFromApex', namespace, drNameParameter));
    methodCalls.add(new MethodCall('IntegrationProcedureService', 'runIntegrationService', namespace, ipNameParameter));

    const apexParser = new ApexASTParser(apexFileContent, interfaces, methodCalls, namespace);
    apexParser.parse();
    const implementsInterface = apexParser.implementsInterfaces;
    // const callsMethods = apexParser.getCallsMethods();
    // const className = apexParser.getClassName();
    // const pos = implementsInterface.get(vlocityOpenInterface2);

    // Add your assertions here based on the expected results
    // implementsInterface.get(interfaceName);
    expect(implementsInterface.get(vlocityOpenInterface2)[0].charPositionInLine).to.be.equal(58);
    expect(implementsInterface.get(vlocityOpenInterface2)[1].line).to.be.equal(1);
    // expect(callsMethods).to.not.be.empty;
    // expect(className).to.equal('YourClass');
  });
});
