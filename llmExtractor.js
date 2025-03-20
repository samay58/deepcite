var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
/**
 * Extracts factual claims from text using OpenAI's GPT-4
 * This provides more accurate claim detection than rule-based approaches
 * and includes confidence scoring for each claim
 */
// Make the class global for content script access
var LLMExtractor = /** @class */ (function () {
    /**
     * Initialize the extractor with an OpenAI API key
     * @param apiKey - OpenAI API key
     */
    function class_1(apiKey) {
        this.maxTokens = 4000; // GPT-4 context window limit
        this.apiKey = apiKey;
    }
    class_1.prototype.extractClaimsFromChunk = function (text) {
        return __awaiter(this, void 0, void 0, function () {
            var response, data, claims, parsed, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, fetch('https://api.openai.com/v1/chat/completions', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': "Bearer ".concat(this.apiKey)
                                },
                                body: JSON.stringify({
                                    model: 'gpt-4',
                                    messages: [{
                                            role: 'system',
                                            content: "Extract factual claims from the text. Return a JSON array where each item has:\n              - claim: The exact claim text\n              - confidence: 0-1 score of how clearly it's a factual claim\n              Only include clear, verifiable claims. Ignore opinions and subjective statements.\n              Only include statements that appear to assert a verifiable fact. Exclude anything that is speculative or an opinion."
                                        }, {
                                            role: 'user',
                                            content: text
                                        }],
                                    temperature: 0.1
                                })
                            })];
                    case 1:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("OpenAI API error: ".concat(response.status));
                        }
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = _a.sent();
                        claims = data.choices[0].message.content;
                        parsed = JSON.parse(claims);
                        return [2 /*return*/, {
                                claims: parsed.map(function (p) { return p.claim; }),
                                confidence: parsed.map(function (p) { return p.confidence; })
                            }];
                    case 3:
                        error_1 = _a.sent();
                        console.error('LLM extraction failed:', error_1);
                        return [2 /*return*/, { claims: [], confidence: [] }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    class_1.prototype.chunkText = function (text, maxLength) {
        if (maxLength === void 0) { maxLength = 3000; }
        // Split into paragraphs
        var paragraphs = text.split(/\n\s*\n/);
        var chunks = [];
        var currentChunk = '';
        for (var _i = 0, paragraphs_1 = paragraphs; _i < paragraphs_1.length; _i++) {
            var paragraph = paragraphs_1[_i];
            if ((currentChunk + paragraph).length > maxLength) {
                if (currentChunk)
                    chunks.push(currentChunk);
                currentChunk = paragraph;
            }
            else {
                currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
            }
        }
        if (currentChunk)
            chunks.push(currentChunk);
        return chunks;
    };
    /**
     * Extract factual claims from text with confidence scores
     * Handles large texts by chunking and processing in parallel
     *
     * @param text - The text to analyze for factual claims
     * @returns Promise resolving to claims and confidence scores
     */
    class_1.prototype.extractClaims = function (text) {
        return __awaiter(this, void 0, void 0, function () {
            var chunks, results;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        chunks = this.chunkText(text);
                        return [4 /*yield*/, Promise.all(chunks.map(function (chunk) { return _this.extractClaimsFromChunk(chunk); }))];
                    case 1:
                        results = _a.sent();
                        // Merge results from all chunks into a single result
                        return [2 /*return*/, {
                                claims: results.flatMap(function (r) { return r.claims; }),
                                confidence: results.flatMap(function (r) { return r.confidence; })
                            }];
                }
            });
        });
    };
    return class_1;
}());
