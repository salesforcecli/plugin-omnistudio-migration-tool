import {
  ApexLexer,
  CommonTokenStream,
  ApexParser,
  CaseInsensitiveInputStream,
  ApexParserListener,
  ClassDeclarationContext,
  DotExpressionContext,
  VariableDeclaratorContext
} from "@apexdevtools/apex-parser";
import {
  CharStreams,
} from "antlr4ts";
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';
import fs from 'fs';

export class ApexASTTraverser {

  public static parse(apexClass: string): any {
    let lexer = new ApexLexer(new CaseInsensitiveInputStream(CharStreams.fromString(apexClass)));
    let tokens = new CommonTokenStream(lexer);
    let parser = new ApexParser(tokens);
    let context = parser.compilationUnit();
    //  parser.addParseListener(new interfaceVisitor() as ApexParserListener);
    ParseTreeWalker.DEFAULT.walk(
      new interfaceVisitor() as ApexParserListener,
      context
    );
    return context;
  }

  public static traverse(filePath: string): any {
    let fileContent = fs.readFileSync(filePath).toString();
    let ast = this.parse(fileContent);
    return ast;
  }
}
export class interfaceVisitor implements ApexParserListener {
  enterClassDeclaration(ctx: ClassDeclarationContext): void {
    console.log(ctx.typeList().typeRef(0).typeName(0).id().Identifier().symbol.text);
  };
  enterDotExpression(ctx: DotExpressionContext): void {
    console.log("*********")
    console.log(ctx.expression().start.text);

    if (ctx.dotMethodCall()) {
      console.log(ctx.dotMethodCall().anyId().Identifier().symbol.text);
      //ctx.dotMethodCall().expressionList().expression(1).children[0].children[0].children[0] 
      console.log(ctx.dotMethodCall().expressionList().expression(1).children[0]);

    }
    console.log("*********")
  }
  enterVariableDeclarator(ctx: VariableDeclaratorContext): void {
    if (ctx.id().Identifier().symbol.text === 'DRName') {
      console.log(ctx.expression());
    }
  }

}



let filePath = '/Users/abhinavkumar2/company/plugin-omnistudio-migration-tool/test/FormulaParserService.cls';
let ast = ApexASTTraverser.traverse(filePath);

console.log(ast);