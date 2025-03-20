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
// Ensure service worker activates
console.log('Background service worker starting...');
// Basic background service worker
chrome.runtime.onInstalled.addListener(function () {
    console.log('Extension installed');
    // Store the OpenAI key for LLM-based claim extraction
    // TODO: In the future, this will be configured by the user in options.html
    // The extension will fall back to rule-based extraction if this key is invalid
    chrome.storage.local.set({
        openAiKey: 'OPENAI-API-KEY-GOES-HERE' // Development key placeholder - replace with actual key during testing
    });
});
// Exa API configuration for source verification
// TODO: Move to user-configurable storage in future version
var EXA_API_KEY = 'EXA-API-KEY-GOES-HERE'; // Development key placeholder - replace with actual key during testing
var EXA_API_URL = 'https://api.exa.ai/search';
/**
 * Verify a claim using Exa's API to find supporting sources
 * This is the core function that connects claims to reliable sources
 *
 * @param claim - The text of the claim to verify
 * @returns Promise resolving to an array of search results with source information
 */
function verifyClaimWithExa(claim) {
    return __awaiter(this, void 0, void 0, function () {
        var response, data, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch(EXA_API_URL, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': "Bearer ".concat(EXA_API_KEY)
                            },
                            body: JSON.stringify({
                                query: claim,
                                numResults: 3, // Limit to 3 sources for UI simplicity
                                type: 'neural' // Use neural search for better semantic understanding
                            })
                        })];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("Exa API error: ".concat(response.status));
                    }
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _a.sent();
                    return [2 /*return*/, data.results];
                case 3:
                    error_1 = _a.sent();
                    console.error('Error verifying claim:', error_1);
                    throw error_1;
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Listen for messages from content script
// This handles the communication between the content script (UI) and background service worker (API calls)
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.type === 'VERIFY_CLAIM') {
        // Process the claim verification request
        // This keeps API calls in the background script for better security and performance
        verifyClaimWithExa(request.claim.text)
            .then(function (results) {
            console.log('Verification results:', results);
            sendResponse({ success: true, results: results });
        })
            .catch(function (error) {
            // Handle API errors gracefully
            console.error('Verification failed:', error);
            sendResponse({ success: false, error: error.message });
        });
        return true; // Return true to indicate we'll respond asynchronously
    }
    return true; // Always return true from the listener
});
