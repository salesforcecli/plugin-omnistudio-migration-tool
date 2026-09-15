/*
   The service implements Callable to support calling
   FormulaParser functions from Core/Java.
   The allowed functions are listed in FormulaParser FUNCTIONS_FROM_JAVA.
*/
global with sharing class FormulaParserService implements Callable
{
   /* global Object call(String action, Map<String, Object> args)
    {
        Map<String, Object> input = (Map<String, Object>) args.get('input');
        Map<String, Object> output = (Map<String, Object>) args.get('output');

        String function = (String)input.get('function');
        if (function == null || String.isBlank(function))
        {
            return null;
        }

        List<Object> arguments = (input.get('arguments') != null && input.get('arguments') InstanceOf List<Object>)
                    ? (List<Object>)input.get('arguments') : new List<Object>();

        if (action == 'evaluateFunctionFromJava')
        {
            Object res = FormulaParser.evaluateFunctionFromJava(function, arguments);
            if (res != null)
            {
                output.put('result', res);
            }
        }
        return null;
    }

    global void evaluateFunctionFromJava(String function, List<Object> arguments)
    {
        Map < String, Object > testMap = new Map < String, Object > { 'BirthDate' => '1982-11-06' };
		DRProcessResult result = DRGlobal.process(testMap, 'DRTurboTemp2');
		//List < Object > resultMap = (List < Object >)((Map < String, Object >)result.toJson()).get('Contact');
		//System.assertEquals(Date.newInstance(1982, 11, 6), ((Map < String, Object >)resultMap[0]).get('Birthdate'));
    }*/

    global void justForTest(String kkdbk) {
        /* Specify Data Mapper extract or transform to call */
        String DRName = 'DataMapperNewName'; 
        /* Populate the input JSON */ 
        Map<String, Object> myTransformData = new Map<String, Object>{'MyKey'=>'MyValue'}; 
        /* Call the Data Mapper */ 
        omnistudio.DRProcessResult result1 = omnistudio.DRGlobal.process(myTransformData, DRName);
    }
}