"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsertAfterTokenUpdate = exports.MapUtil = exports.SingleTokenUpdate = exports.RangeTokenUpdate = exports.InterfaceMatcher = exports.InterfaceImplements = exports.ParameterType = exports.MethodParameter = exports.MethodCall = exports.ApexASTParser = void 0;
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
var apex_parser_1 = require("@apexdevtools/apex-parser");
var antlr4ts_1 = require("antlr4ts");
var ParseTreeWalker_1 = require("antlr4ts/tree/ParseTreeWalker");
var ApexASTParser = /** @class */ (function () {
    function ApexASTParser(apexFileContent, interfaceNames, methodCalls, namespace) {
        this.implementsInterface = new Map();
        this.methodParameter = new Map();
        this.nonReplacableMethodParameter = [];
        this.namespaceChange = new Map();
        this.apexFileContent = apexFileContent;
        this.interfaceNames = interfaceNames;
        this.methodCalls = methodCalls;
        this.namespace = namespace;
        this.astListener = this.createASTListener();
    }
    Object.defineProperty(ApexASTParser.prototype, "implementsInterfaces", {
        get: function () {
            return this.implementsInterface;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ApexASTParser.prototype, "classDeclaration", {
        get: function () {
            return this.classDeclarationToken;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ApexASTParser.prototype, "methodParameters", {
        get: function () {
            return this.methodParameter;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ApexASTParser.prototype, "namespaceChanges", {
        get: function () {
            return this.namespaceChange;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ApexASTParser.prototype, "nonReplacableMethodParameters", {
        get: function () {
            return this.nonReplacableMethodParameter;
        },
        enumerable: false,
        configurable: true
    });
    ApexASTParser.prototype.parse = function () {
        var lexer = new apex_parser_1.ApexLexer(new apex_parser_1.CaseInsensitiveInputStream(antlr4ts_1.CharStreams.fromString(this.apexFileContent)));
        var tokens = new apex_parser_1.CommonTokenStream(lexer);
        var parser = new apex_parser_1.ApexParser(tokens);
        var context = parser.compilationUnit();
        //  parser.addParseListener(new interfaceVisitor() as ApexParserListener);
        ParseTreeWalker_1.ParseTreeWalker.DEFAULT.walk(this.astListener, context);
        return context;
    };
    ApexASTParser.prototype.rewrite = function (tokenUpdates) {
        var lexer = new apex_parser_1.ApexLexer(new apex_parser_1.CaseInsensitiveInputStream(antlr4ts_1.CharStreams.fromString(this.apexFileContent)));
        var tokens = new apex_parser_1.CommonTokenStream(lexer);
        var rewriter = new antlr4ts_1.TokenStreamRewriter(tokens);
        var parser = new apex_parser_1.ApexParser(tokens);
        parser.compilationUnit();
        for (var _i = 0, tokenUpdates_1 = tokenUpdates; _i < tokenUpdates_1.length; _i++) {
            var tokenUpdate = tokenUpdates_1[_i];
            tokenUpdate.applyUpdate(rewriter);
        }
        return rewriter.getText();
    };
    ApexASTParser.prototype.createASTListener = function () {
        var ApexMigrationListener = /** @class */ (function () {
            function ApexMigrationListener(parser) {
                this.parser = parser;
                //
            }
            ApexMigrationListener.prototype.enterClassDeclaration = function (ctx) {
                var interfaceToBeSearched = this.parser.interfaceNames;
                if (!interfaceToBeSearched)
                    return;
                if (!ctx.typeList() || !ctx.typeList().typeRef())
                    return;
                for (var _i = 0, _a = ctx.typeList().typeRef(); _i < _a.length; _i++) {
                    var typeRefContext = _a[_i];
                    for (var _b = 0, _c = this.parser.interfaceNames; _b < _c.length; _b++) {
                        var toSearch = _c[_b];
                        var matchingTokens = InterfaceMatcher.getMatchingTokens(toSearch, typeRefContext);
                        if (matchingTokens.length === 0)
                            continue;
                        this.parser.implementsInterface.set(toSearch, matchingTokens);
                        this.parser.classDeclarationToken = ctx.classBody().LBRACE().symbol;
                    }
                }
            };
            ApexMigrationListener.prototype.enterDotExpression = function (ctx) {
                var _a, _b, _c, _d;
                var dotMethodCall = ctx.dotMethodCall();
                if (dotMethodCall && this.parser.methodCalls && ((_a = ctx.expression().children) === null || _a === void 0 ? void 0 : _a.length) > 2) {
                    var namespaceUsed = ctx.expression().getChild(0);
                    var methodName = (_c = (_b = dotMethodCall === null || dotMethodCall === void 0 ? void 0 : dotMethodCall.anyId()) === null || _b === void 0 ? void 0 : _b.Identifier()) === null || _c === void 0 ? void 0 : _c.symbol;
                    var className = ctx.expression().getChild(2);
                    if (!methodName)
                        return;
                    for (var _i = 0, _e = this.parser.methodCalls; _i < _e.length; _i++) {
                        var methodcall = _e[_i];
                        if (!methodcall.sameCall(className.text, methodName.text, namespaceUsed.text))
                            continue;
                        MapUtil.addToValueList(this.parser.namespaceChange, this.parser.namespace, ctx.expression().start);
                        var parameter = methodcall.parameter;
                        if (!parameter)
                            continue;
                        var bundleName = dotMethodCall.expressionList().expression(parameter.position - 1);
                        if (bundleName &&
                            (bundleName === null || bundleName === void 0 ? void 0 : bundleName.children) &&
                            bundleName.childCount > 0 &&
                            bundleName.children[0] instanceof apex_parser_1.LiteralPrimaryContext) {
                            var arg = bundleName.getChild(0);
                            var argValue = (_d = arg === null || arg === void 0 ? void 0 : arg.literal()) === null || _d === void 0 ? void 0 : _d.StringLiteral();
                            if (!argValue)
                                continue;
                            MapUtil.addToValueList(this.parser.methodParameter, parameter.type, argValue.symbol);
                        }
                        else {
                            this.parser.nonReplacableMethodParameter.push(methodcall);
                        }
                    }
                }
            };
            ApexMigrationListener.prototype.enterTypeRef = function (ctx) {
                if (ctx.childCount >= 2 &&
                    ctx.typeName(0).text === this.parser.namespace &&
                    ctx.typeName(1).text === 'DRProcessResult') {
                    MapUtil.addToValueList(this.parser.namespaceChange, this.parser.namespace, ctx.typeName(0).start);
                }
            };
            return ApexMigrationListener;
        }());
        return new ApexMigrationListener(this);
    };
    return ApexASTParser;
}());
exports.ApexASTParser = ApexASTParser;
var MethodCall = /** @class */ (function () {
    function MethodCall(className, methodName, namespace, parameter) {
        this.className = className;
        this.methodName = methodName;
        this.namespace = namespace;
        this.parameter = parameter;
    }
    MethodCall.prototype.getExpression = function () {
        if (this.namespace)
            return "".concat(this.namespace, ".").concat(this.className, ".").concat(this.methodName, "()");
        else
            return "".concat(this.className, ".").concat(this.methodName, "()");
    };
    MethodCall.prototype.sameCall = function (classname, methodName, namespace) {
        if (this.className === classname && this.methodName === methodName && this.namespace === namespace)
            return true;
        else
            return false;
    };
    return MethodCall;
}());
exports.MethodCall = MethodCall;
var MethodParameter = /** @class */ (function () {
    function MethodParameter(position, type) {
        this.position = position;
        this.type = type;
    }
    return MethodParameter;
}());
exports.MethodParameter = MethodParameter;
var ParameterType;
(function (ParameterType) {
    ParameterType[ParameterType["DR_NAME"] = 0] = "DR_NAME";
    ParameterType[ParameterType["IP_NAME"] = 1] = "IP_NAME";
})(ParameterType || (exports.ParameterType = ParameterType = {}));
var InterfaceImplements = /** @class */ (function () {
    function InterfaceImplements(name, namespace) {
        this.name = name;
        if (namespace)
            this.namespace = namespace;
    }
    return InterfaceImplements;
}());
exports.InterfaceImplements = InterfaceImplements;
var InterfaceMatcher = /** @class */ (function () {
    function InterfaceMatcher() {
    }
    InterfaceMatcher.getMatchingTokens = function (checkFor, ctx) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        var tokens = [];
        var typeNameContexts = ctx.typeName();
        if (!typeNameContexts)
            return tokens;
        if (!checkFor.namespace &&
            typeNameContexts.length === 1 &&
            checkFor.name === ((_d = (_c = (_b = (_a = typeNameContexts[0]) === null || _a === void 0 ? void 0 : _a.id()) === null || _b === void 0 ? void 0 : _b.Identifier()) === null || _c === void 0 ? void 0 : _c.symbol) === null || _d === void 0 ? void 0 : _d.text)) {
            tokens.push(typeNameContexts[0].id().Identifier().symbol);
        }
        else if (checkFor.namespace &&
            typeNameContexts.length === 2 &&
            checkFor.namespace === ((_h = (_g = (_f = (_e = typeNameContexts[0]) === null || _e === void 0 ? void 0 : _e.id()) === null || _f === void 0 ? void 0 : _f.Identifier()) === null || _g === void 0 ? void 0 : _g.symbol) === null || _h === void 0 ? void 0 : _h.text) &&
            checkFor.name === ((_m = (_l = (_k = (_j = typeNameContexts[1]) === null || _j === void 0 ? void 0 : _j.id()) === null || _k === void 0 ? void 0 : _k.Identifier()) === null || _l === void 0 ? void 0 : _l.symbol) === null || _m === void 0 ? void 0 : _m.text)) {
            tokens.push(typeNameContexts[0].id().Identifier().symbol);
            tokens.push(typeNameContexts[1].id().Identifier().symbol);
        }
        return tokens;
    };
    return InterfaceMatcher;
}());
exports.InterfaceMatcher = InterfaceMatcher;
var RangeTokenUpdate = /** @class */ (function () {
    function RangeTokenUpdate(newText, startToken, endToken) {
        this.newText = newText;
        this.startToken = startToken;
        this.endToken = endToken;
    }
    RangeTokenUpdate.prototype.applyUpdate = function (rewriter) {
        rewriter.replace(this.startToken, this.endToken, this.newText);
    };
    return RangeTokenUpdate;
}());
exports.RangeTokenUpdate = RangeTokenUpdate;
var SingleTokenUpdate = /** @class */ (function () {
    function SingleTokenUpdate(newText, token) {
        this.newText = newText;
        this.token = token;
    }
    SingleTokenUpdate.prototype.applyUpdate = function (rewriter) {
        rewriter.replaceSingle(this.token, this.newText);
    };
    return SingleTokenUpdate;
}());
exports.SingleTokenUpdate = SingleTokenUpdate;
var MapUtil = /** @class */ (function () {
    function MapUtil() {
    }
    MapUtil.addToValueList = function (map, key, value) {
        if (!map.has(key))
            map.set(key, []);
        map.get(key).push(value);
    };
    return MapUtil;
}());
exports.MapUtil = MapUtil;
var InsertAfterTokenUpdate = /** @class */ (function () {
    function InsertAfterTokenUpdate(newText, token) {
        this.newText = newText;
        this.token = token;
    }
    InsertAfterTokenUpdate.prototype.applyUpdate = function (rewriter) {
        rewriter.insertAfter(this.token, this.newText);
    };
    return InsertAfterTokenUpdate;
}());
exports.InsertAfterTokenUpdate = InsertAfterTokenUpdate;
