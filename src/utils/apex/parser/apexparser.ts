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
  LocalVariableDeclarationContext,
  VariableDeclaratorContext,
  VariableDeclaratorsContext,
} from '@apexdevtools/apex-parser';
import { CharStreams, ParserRuleContext, Token, TokenStreamRewriter } from 'antlr4ts';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';
import { Logger } from '../../logger';

// Constants for reserved keywords and special interface names
const SYSTEM_NAMESPACE = 'System';
const CALLABLE_INTERFACE = 'Callable';

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
  private hasCallMethod = false;

  // token value will be enclosed in quotes
  private simpleVariableDeclarations: Map<string, Token> = new Map();
  private dmVariablesInMethodCalls: Set<string> = new Set();
  private ipVariablesInMethodCalls: Set<string> = new Set();

  public get implementsInterfaces(): Map<InterfaceImplements, Token[]> {
    return this.implementsInterface;
  }

  public get classDeclaration(): Token {
    return this.classDeclarationToken;
  }

  public get simpleVarDeclarations(): Map<string, Token> {
    return this.simpleVariableDeclarations;
  }
  public get dmVarInMethodCalls(): Set<string> {
    return this.dmVariablesInMethodCalls;
  }
  public get ipVarInMethodCalls(): Set<string> {
    return this.ipVariablesInMethodCalls;
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
  public get hasCallMethodImplemented(): boolean {
    return this.hasCallMethod;
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
            if (bundleName && bundleName?.children && bundleName.childCount > 0) {
              if (bundleName.children[0] instanceof LiteralPrimaryContext) {
                const arg: LiteralPrimaryContext = bundleName.getChild(0) as LiteralPrimaryContext;
                const argValue = arg?.literal()?.StringLiteral();
                if (!argValue) continue;
                MapUtil.addToValueList(this.parser.methodParameter, parameter.type, argValue.symbol);
              } else {
                if (ParameterType.DR_NAME === parameter.type) {
                  this.parser.dmVariablesInMethodCalls.add(bundleName.text);
                } else if (ParameterType.IP_NAME === parameter.type) {
                  this.parser.ipVariablesInMethodCalls.add(bundleName.text);
                }
              }
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      public enterMethodDeclaration(ctx: any): void {
        if (ctx.id && ctx.id().text && ctx.id().text.toLowerCase() === 'call') {
          const formalParams = ctx.formalParameters();
          if (formalParams && formalParams.formalParameterList()) {
            const paramList = formalParams.formalParameterList();
            if (paramList.formalParameter() && paramList.formalParameter().length === 2) {
              this.parser.hasCallMethod = true;
            }
          }
        }
      }
      public enterLocalVariableDeclaration(ctx: LocalVariableDeclarationContext): void {
        try {
          Logger.logVerbose(`Found variable declaration: ${ctx?.text}`);
          if (!checkIfValidSimpleDeclaration(ctx)) {
            return;
          }

          const varName = ((ctx.children[1] as ParserRuleContext).children[0] as ParserRuleContext).children[0].text;
          const valueToken = (
            ((ctx.children[1] as ParserRuleContext).children[0] as ParserRuleContext).children[2] as ParserRuleContext
          ).start;
          this.parser.simpleVariableDeclarations.set(varName, valueToken);
        } catch (error) {
          Logger.logVerbose('Failed to check or parse variable declaration');
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
      checkFor.namespace === typeNameContexts[0]?.id()?.Identifier()?.symbol?.text?.toLowerCase() &&
      checkFor.name === typeNameContexts[1]?.id()?.Identifier()?.symbol?.text
    ) {
      tokens.push(typeNameContexts[0].id().Identifier().symbol);
      tokens.push(typeNameContexts[1].id().Identifier().symbol);
    } else if (
      // Special case for System.Callable - "System" is a reserved keyword so Identifier() returns null
      checkFor.namespace === SYSTEM_NAMESPACE &&
      checkFor.name === CALLABLE_INTERFACE &&
      typeNameContexts.length === 2 &&
      !typeNameContexts[0]?.id()?.Identifier() && // System is a reserved keyword, no Identifier
      typeNameContexts[1]?.id()?.Identifier()?.symbol?.text === CALLABLE_INTERFACE
    ) {
      tokens.push(typeNameContexts[0].start);
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

export function checkIfValidSimpleDeclaration(ctx: LocalVariableDeclarationContext): boolean {
  // check for String data type
  if (ctx.children?.length !== 2 || ctx.children[0].text !== 'String') {
    return false;
  }

  // check number of tokens in the variable declaration
  if (
    !(ctx.children[1] instanceof VariableDeclaratorsContext) ||
    ctx.children[1].children?.length !== 1 ||
    !(ctx.children[1].children[0] instanceof VariableDeclaratorContext) ||
    ctx.children[1].children[0].children?.length !== 3
  ) {
    return false;
  }

  // check for string literal as initial value
  return (
    ctx.children[1].children[0].children[2].text.startsWith("'") &&
    ctx.children[1].children[0].children[2].text.endsWith("'")
  );
}
