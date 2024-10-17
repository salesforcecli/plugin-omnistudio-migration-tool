"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var test_1 = require("@salesforce/command/lib/test");
var apexparser_1 = require("../../../../src/utils/apex/parser/apexparser");
describe('ApexASTParser', function () {
    it('should parse the Apex file and collect interface implementations, method calls, and class names', function () {
        var apexFileContent = "global with sharing class FormulaParserService implements vlocity_ins.VlocityOpenInterface2, Callable\n{\n\n        global void justForTest(String kkdbk) {\n        /* Specify Data Mapper extract or transform to call */\n        String DRName = 'DataMapperNewName'; \n        /* Populate the input JSON */ \n        Map<String, Object> myTransformData = new Map<String, Object>{'MyKey'=>'MyValue'}; \n        /* Call the Data Mapper */ \n        vlocity_ins.DRProcessResult result1 = vlocity_ins.DRGlobal.process(myTransformData, 'DRName');\n    }\n    }";
        // const vlocityOpenInterface2 = 'vlocity_ins.VlocityOpenInterface2';
        var namespace = 'vlocity_ins';
        var interfaces = [];
        var vlocityOpenInterface = new apexparser_1.InterfaceImplements('VlocityOpenInterface', namespace);
        var vlocityOpenInterface2 = new apexparser_1.InterfaceImplements('VlocityOpenInterface2', namespace);
        interfaces.push(vlocityOpenInterface, vlocityOpenInterface2, new apexparser_1.InterfaceImplements('Callable'));
        var methodCalls = new Set();
        var drNameParameter = new apexparser_1.MethodParameter(2, apexparser_1.ParameterType.DR_NAME);
        var ipNameParameter = new apexparser_1.MethodParameter(1, apexparser_1.ParameterType.IP_NAME);
        methodCalls.add(new apexparser_1.MethodCall('DRGlobal', 'process', namespace, drNameParameter));
        methodCalls.add(new apexparser_1.MethodCall('DRGlobal', 'processObjectsJSON', namespace, drNameParameter));
        methodCalls.add(new apexparser_1.MethodCall('DRGlobal', 'processString', namespace, drNameParameter));
        methodCalls.add(new apexparser_1.MethodCall('DRGlobal', 'processFromApex', namespace, drNameParameter));
        methodCalls.add(new apexparser_1.MethodCall('IntegrationProcedureService', 'runIntegrationService', namespace, ipNameParameter));
        var apexParser = new apexparser_1.ApexASTParser(apexFileContent, interfaces, methodCalls, namespace);
        apexParser.parse();
        var implementsInterface = apexParser.implementsInterfaces;
        // const callsMethods = apexParser.getCallsMethods();
        // const className = apexParser.getClassName();
        // const pos = implementsInterface.get(vlocityOpenInterface2);
        // Add your assertions here based on the expected results
        // implementsInterface.get(interfaceName);
        (0, test_1.expect)(implementsInterface.get(vlocityOpenInterface2)[0].charPositionInLine).to.be.equal(58);
        (0, test_1.expect)(implementsInterface.get(vlocityOpenInterface2)[1].line).to.be.equal(1);
        // expect(callsMethods).to.not.be.empty;
        // expect(className).to.equal('YourClass');
    });
});
