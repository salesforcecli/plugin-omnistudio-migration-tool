/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
import { CharStreams, Token } from 'antlr4ts';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';

export class ApexASTParser {
  private apexFileContent: string;
  private implementsInterface: Map<string, Token> = new Map();
  // private callsMethods: Map<string, Token[]>;
  private interfaceName: string;
  private methodName: string;
  // private className: string;
  private astListener: ApexParserListener;

  public get implementsInterfaces(): Map<string, Token> {
    return this.implementsInterface;
  }

  public constructor(apexFileContent: string, interfaceName: string, methodName: string) {
    this.apexFileContent = apexFileContent;
    this.interfaceName = interfaceName;
    this.methodName = methodName;
    this.astListener = this.createASTListener();
  }

  public parse(): CompilationUnitContext {
    const lexer = new ApexLexer(new CaseInsensitiveInputStream(CharStreams.fromString(this.apexFileContent)));
    const tokens = new CommonTokenStream(lexer);
    const parser = new ApexParser(tokens);
    const context = parser.compilationUnit();
    //  parser.addParseListener(new interfaceVisitor() as ApexParserListener);
    ParseTreeWalker.DEFAULT.walk(this.astListener, context);
    return context;
  }

  private createASTListener(): ApexParserListener {
    class ApexMigrationListener implements ApexParserListener {
      public constructor(private parser: ApexASTParser) { }
      public enterClassDeclaration(ctx: ClassDeclarationContext): void {
        const interfaceToBeSearched = this.parser.interfaceName;
        if (!interfaceToBeSearched) return;
        if (!ctx.typeList() || !ctx.typeList().typeRef()) return;
        for (const typeRefContext of ctx.typeList().typeRef())
          for (const typeNameContext of typeRefContext.typeName()) {
            if (!typeNameContext.id() || !typeNameContext.id().Identifier()) continue;
            if (typeNameContext.id().Identifier().symbol.text === interfaceToBeSearched) {
              this.parser.implementsInterface.set(interfaceToBeSearched, typeNameContext.id().Identifier().symbol);
            }
          }
      }

      public enterDotExpression(ctx: DotExpressionContext): void {
        // console.log('*********');
        // console.log(ctx.expression().start.text);
        if (ctx.dotMethodCall() && this.parser.methodName) {
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
    return new ApexMigrationListener(this);
  }
}

// const filePath = '/Users/abhinavkumar2/company/plugin-omnistudio-migration-tool/test/FormulaParserService.cls';
// new ApexASTParser(filePath, 'callable', '').parse(filePath);

// console.log(ast);
