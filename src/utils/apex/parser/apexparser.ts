import fs from 'fs';
import {
  ApexLexer,
  CommonTokenStream,
  ApexParser,
  CaseInsensitiveInputStream,
  ApexParserListener,
  ClassDeclarationContext,
  DotExpressionContext,
  VariableDeclaratorContext,
  CompilationUnitContext,
} from '@apexdevtools/apex-parser';
import { CharStreams } from 'antlr4ts';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';

export class ApexASTTraverser {
  public static parse(apexClass: string): CompilationUnitContext {
    const lexer = new ApexLexer(new CaseInsensitiveInputStream(CharStreams.fromString(apexClass)));
    const tokens = new CommonTokenStream(lexer);
    const parser = new ApexParser(tokens);
    const context = parser.compilationUnit();
    //  parser.addParseListener(new interfaceVisitor() as ApexParserListener);
    ParseTreeWalker.DEFAULT.walk(new interfaceVisitor() as ApexParserListener, context);
    return context;
  }

  public static traverse(filePath: string): CompilationUnitContext {
    const fileContent = fs.readFileSync(filePath).toString();
    const ast = this.parse(fileContent);
    return ast;
  }
}
export class interfaceVisitor implements ApexParserListener {
  private interfaceImplementations: string[] = [];

  public enterClassDeclaration(ctx: ClassDeclarationContext): void {
    this.interfaceImplementations.push(ctx.typeList().typeRef(0).typeName(0).id().Identifier().symbol.text);
  }
  public enterDotExpression(ctx: DotExpressionContext): void {
    // console.log('*********');
    // console.log(ctx.expression().start.text);

    if (ctx.dotMethodCall()) {
      // console.log(ctx.dotMethodCall().anyId().Identifier().symbol.text);
      // ctx.dotMethodCall().expressionList().expression(1).children[0].children[0].children[0];
      // console.log(ctx.dotMethodCall().expressionList().expression(1).children[0]);
    }
    // console.log('*********');
  }
  public enterVariableDeclarator(ctx: VariableDeclaratorContext): void {
    if (ctx.id().Identifier().symbol.text === 'DRName') {
      // console.log(ctx.expression());
    }
  }
}

const filePath = '/Users/abhinavkumar2/company/plugin-omnistudio-migration-tool/test/FormulaParserService.cls';
ApexASTTraverser.traverse(filePath);

// console.log(ast);
