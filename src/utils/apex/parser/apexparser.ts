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
  CompilationUnitContext,
  TypeRefContext,
  LiteralPrimaryContext,
} from '@apexdevtools/apex-parser';
import { CharStreams, Token, TokenStreamRewriter } from 'antlr4ts';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';

export class ApexASTParser {
  private apexFileContent: string;
  private implementsInterface: Map<InterfaceImplements, Token[]> = new Map();
  private methodParameter: Map<ParameterType, Token[]> = new Map();
  private nonReplacableMethodParameter: MethodCall[] = [];
  private namespaceChange: Map<string, Token[]> = new Map();
  private namespace: string;
  private interfaceNames: InterfaceImplements[];
  private astListener: ApexParserListener;
  private methodCalls: Set<MethodCall>;
  private classDeclarationToken: Token;

  public get implementsInterfaces(): Map<InterfaceImplements, Token[]> {
    return this.implementsInterface;
  }

  public get classDeclaration(): Token {
    return this.classDeclarationToken;
  }

  public get methodParameters(): Map<ParameterType, Token[]> {
    return this.methodParameter;
  }
  public get namespaceChanges(): Map<string, Token[]> {
    return this.namespaceChange;
  }
  public get nonReplacableMethodParameters(): MethodCall[] {
    return this.nonReplacableMethodParameter;
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

  public rewrite(tokenUpdates: TokenUpdater[]): string {
    const lexer = new ApexLexer(new CaseInsensitiveInputStream(CharStreams.fromString(this.apexFileContent)));
    const tokens = new CommonTokenStream(lexer);
    const rewriter = new TokenStreamRewriter(tokens);
    const parser = new ApexParser(tokens);
    parser.compilationUnit();
    for (const tokenUpdate of tokenUpdates) {
      tokenUpdate.applyUpdate(rewriter);
    }
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
            this.parser.classDeclarationToken = ctx.classBody().LBRACE().symbol;
          }
      }
      public enterDotExpression(ctx: DotExpressionContext): void {
        const dotMethodCall = ctx.dotMethodCall();
        if (dotMethodCall && this.parser.methodCalls && ctx.expression().children?.length > 2) {
          const namespaceUsed = ctx.expression().getChild(0);
          const methodName = dotMethodCall?.anyId()?.Identifier()?.symbol;
          const className = ctx.expression().getChild(2);
          if (!methodName) return;
          for (const methodcall of this.parser.methodCalls) {
            if (!methodcall.sameCall(className.text, methodName.text, namespaceUsed.text)) continue;
            MapUtil.addToValueList(this.parser.namespaceChange, this.parser.namespace, ctx.expression().start);
            const parameter = methodcall.parameter;
            if (!parameter) continue;
            const bundleName = dotMethodCall.expressionList().expression(parameter.position - 1);
            if (
              bundleName &&
              bundleName?.children &&
              bundleName.childCount > 0 &&
              bundleName.children[0] instanceof LiteralPrimaryContext
            ) {
              const arg: LiteralPrimaryContext = bundleName.getChild(0) as LiteralPrimaryContext;
              const argValue = arg?.literal()?.StringLiteral();
              if (!argValue) continue;
              MapUtil.addToValueList(this.parser.methodParameter, parameter.type, argValue.symbol);
            } else {
              this.parser.nonReplacableMethodParameter.push(methodcall);
            }
          }
        }
      }
      public enterTypeRef(ctx: TypeRefContext): void {
        if (
          ctx.childCount >= 2 &&
          ctx.typeName(0).text === this.parser.namespace &&
          ctx.typeName(1).text === 'DRProcessResult'
        ) {
          MapUtil.addToValueList(this.parser.namespaceChange, this.parser.namespace, ctx.typeName(0).start);
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
  public parameter: MethodParameter;

  public constructor(className: string, methodName: string, namespace?: string, parameter?: MethodParameter) {
    this.className = className;
    this.methodName = methodName;
    this.namespace = namespace;
    this.parameter = parameter;
  }
  public getExpression(): string {
    if (this.namespace) return `${this.namespace}.${this.className}.${this.methodName}()`;
    else return `${this.className}.${this.methodName}()`;
  }

  public sameCall(classname: string, methodName: string, namespace?: string): boolean {
    if (this.className === classname && this.methodName === methodName && this.namespace === namespace) return true;
    else return false;
  }
}
export class MethodParameter {
  public position: number;
  public type: ParameterType;

  public constructor(position: number, type: ParameterType) {
    this.position = position;
    this.type = type;
  }
}

export enum ParameterType {
  DR_NAME,
  IP_NAME,
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

export class RangeTokenUpdate implements TokenUpdater {
  public newText: string;
  public startToken: Token;
  public endToken: Token;

  public constructor(newText: string, startToken: Token, endToken: Token) {
    this.newText = newText;
    this.startToken = startToken;
    this.endToken = endToken;
  }
  public applyUpdate(rewriter: TokenStreamRewriter): void {
    rewriter.replace(this.startToken, this.endToken, this.newText);
  }
}

export class SingleTokenUpdate implements TokenUpdater {
  public newText: string;
  public token: Token;

  public constructor(newText: string, token: Token) {
    this.newText = newText;
    this.token = token;
  }
  public applyUpdate(rewriter: TokenStreamRewriter): void {
    rewriter.replaceSingle(this.token, this.newText);
  }
}
export interface TokenUpdater {
  applyUpdate(rewriter: TokenStreamRewriter): void;
}

export class MapUtil {
  public static addToValueList(map: Map<unknown, unknown[]>, key: unknown, value: unknown): void {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }
}
export class InsertAfterTokenUpdate implements TokenUpdater {
  public newText: string;
  public token: Token;

  public constructor(newText: string, token: Token) {
    this.newText = newText;
    this.token = token;
  }
  public applyUpdate(rewriter: TokenStreamRewriter): void {
    rewriter.insertAfter(this.token, this.newText);
  }
}
