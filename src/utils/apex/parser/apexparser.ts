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
  TypeRefContext,
} from '@apexdevtools/apex-parser';
import { CharStreams, Token, TokenStreamRewriter } from 'antlr4ts';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';

export class ApexASTParser {
  private apexFileContent: string;
  private implementsInterface: Map<InterfaceImplements, Token[]> = new Map();
  private methodParameter: Map<string, Token> = new Map();
  private namespaceChange: Map<string, Token[]> = new Map();
  private namespace: string;
  // private callsMethods: Map<string, Token[]>;
  private interfaceNames: InterfaceImplements[];
  // private className: string;
  private astListener: ApexParserListener;
  private methodCalls: Set<MethodCall>;

  public get implementsInterfaces(): Map<InterfaceImplements, Token[]> {
    return this.implementsInterface;
  }

  public get methodParameters(): Map<string, Token> {
    return this.methodParameter;
  }
  public get namespaceChanges(): Map<string, Token[]> {
    return this.namespaceChanges;
  }

  public constructor(
    apexFileContent: string,
    interfaceNames: InterfaceImplements[],
    methodCalls: Set<MethodCall>,
    namespace: string
  ) {
    this.apexFileContent = apexFileContent;
    this.interfaceNames = interfaceNames;
    this.methodCalls = methodCalls;
    this.namespace = namespace;
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

  public rewrite(): string {
    const lexer = new ApexLexer(new CaseInsensitiveInputStream(CharStreams.fromString(this.apexFileContent)));
    const tokens = new CommonTokenStream(lexer);
    const rewriter = new TokenStreamRewriter(tokens);
    const parser = new ApexParser(tokens);
    parser.compilationUnit();
    return rewriter.getText();
  }

  private createASTListener(): ApexParserListener {
    class ApexMigrationListener implements ApexParserListener {
      public constructor(private parser: ApexASTParser) {
        //
      }
      public enterClassDeclaration(ctx: ClassDeclarationContext): void {
        const interfaceToBeSearched = this.parser.interfaceNames;
        if (!interfaceToBeSearched) return;
        if (!ctx.typeList() || !ctx.typeList().typeRef()) return;
        for (const typeRefContext of ctx.typeList().typeRef())
          for (const toSearch of this.parser.interfaceNames) {
            const matchingTokens = InterfaceMatcher.getMatchingTokens(toSearch, typeRefContext);
            if (matchingTokens.length === 0) continue;
            this.parser.implementsInterface.set(toSearch, matchingTokens);
            // Logger.logger.info('For interface ${toSearch.name} found tokens ${matchingTokens}');
          }
        /*  
        for (const typeNameContext of typeRefContext.typeName()) {
          if (!typeNameContext.id() || !typeNameContext.id().Identifier()) continue;
          if (interfaceToBeSearched.has(typeNameContext.id().Identifier().symbol.text)) {
            this.parser.implementsInterface.set(
              typeNameContext.id().Identifier().symbol.text,
              typeNameContext.id().Identifier().symbol
            );
          }
        }
          */
      }
      public enterDotExpression(ctx: DotExpressionContext): void {
        // console.log('*********');
        // console.log(ctx.expression().start.text);
        if (ctx.dotMethodCall() && this.parser.methodCalls) {
          const namespaceUsed = ctx.expression().getChild(0);
          const methodName = ctx.dotMethodCall().anyId().Identifier().symbol;
          const className = ctx.expression().getChild(2);

          for (const methodcall of this.parser.methodCalls) {
            if (
              methodcall.methodName === methodName.text &&
              methodcall.className === className.text &&
              methodcall.namespace &&
              methodcall.namespace === namespaceUsed.text
            ) {
              const bundleName = ctx.dotMethodCall().expressionList().expression(1);
              this.parser.methodParameter.set(methodcall.getExpression(), bundleName.start);
            }
          }
        }
        // console.log(ctx.dotMethodCall().anyId().Identifier().symbol.text);
        // console.log(ctx.expression().anyId().Identifier().symbol.text);
        // console.log(ctx.expression().children[0].children[0].id().text);
        // console.log(ctx.dotMethodCall().expressionList().expression(0).children[0].children[0].children[0]);
        // ctx.dotMethodCall().expressionList().expression(1).children[0].children[0].children[0];
        // console.log(ctx.dotMethodCall().expressionList().expression(1).children[0]);
      }

      public enterVariableDeclarator(ctx: VariableDeclaratorContext): void {
        if (ctx.id().Identifier().symbol.text === 'DRName') {
          // console.log(ctx.expression());
        }
      }
      public enterTypeRef(ctx: TypeRefContext): void {
        if (
          ctx.childCount >= 2 &&
          ctx.typeName(0).text === this.parser.namespace &&
          ctx.typeName(1).text === 'DRProcessResult'
        ) {
          if (!this.parser.namespaceChange.has(this.parser.namespace)) {
            this.parser.namespaceChange.set(this.parser.namespace, []);
          }
          this.parser.namespaceChange.get(this.parser.namespace).push(ctx.typeName(0).start);
          // bkbkdv
          // console.log(ctx.typeName(0).text);
          // console.log(ctx.typeName(1).text);
        }
      }
    }
    return new ApexMigrationListener(this);
  }
}

export class MethodCall {
  public methodName: string;
  public className: string;
  public namespace: string;
  public constructor(className: string, methodName: string, namespace?: string) {
    this.className = className;
    this.methodName = methodName;
    this.namespace = namespace;
  }
  public getExpression(): string {
    if (this.namespace) return `${this.namespace}.${this.className}.${this.methodName}()`;
    else return `${this.className}.${this.methodName}()`;
  }
}

export class InterfaceImplements {
  public name: string;
  public namespace: string;

  public constructor(name: string, namespace?: string) {
    this.name = name;
    if (namespace) this.namespace = namespace;
  }
}
export class InterfaceMatcher {
  public static getMatchingTokens(checkFor: InterfaceImplements, ctx: TypeRefContext): Token[] {
    const tokens: Token[] = [];
    const typeNameContexts = ctx.typeName();
    if (!typeNameContexts) return tokens;
    if (
      !checkFor.namespace &&
      typeNameContexts.length === 1 &&
      checkFor.name === typeNameContexts[0]?.id()?.Identifier()?.symbol?.text
    ) {
      tokens.push(typeNameContexts[0].id().Identifier().symbol);
    } else if (
      checkFor.namespace &&
      typeNameContexts.length === 2 &&
      checkFor.namespace === typeNameContexts[0]?.id()?.Identifier()?.symbol?.text &&
      checkFor.name === typeNameContexts[1]?.id()?.Identifier()?.symbol?.text
    ) {
      tokens.push(typeNameContexts[0].id().Identifier().symbol);
      tokens.push(typeNameContexts[1].id().Identifier().symbol);
    }
    return tokens;
  }
}
