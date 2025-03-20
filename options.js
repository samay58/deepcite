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
var _this = this;
// Test the Exa API key
function testExaKey(key) {
    return __awaiter(this, void 0, void 0, function () {
        var response, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fetch('https://api.exa.ai/search', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': "Bearer ".concat(key)
                            },
                            body: JSON.stringify({
                                query: 'test query',
                                numResults: 1
                            })
                        })];
                case 1:
                    response = _a.sent();
                    return [2 /*return*/, response.ok];
                case 2:
                    error_1 = _a.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Test the OpenAI API key
function testOpenAIKey(key) {
    return __awaiter(this, void 0, void 0, function () {
        var response, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fetch('https://api.openai.com/v1/models', {
                            headers: {
                                'Authorization': "Bearer ".concat(key)
                            }
                        })];
                case 1:
                    response = _a.sent();
                    return [2 /*return*/, response.ok];
                case 2:
                    error_2 = _a.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Save settings to storage
function saveSettings() {
    return __awaiter(this, void 0, void 0, function () {
        var settings, tabs, _i, tabs_1, tab;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    settings = {
                        exaKey: document.getElementById('exaKey').value,
                        openaiKey: document.getElementById('openaiKey').value,
                        highlightsEnabled: document.getElementById('highlightsEnabled').checked,
                        sidebarEnabled: document.getElementById('sidebarEnabled').checked,
                        darkMode: document.getElementById('darkMode').checked,
                        excludedDomains: document.getElementById('excludedDomains')
                            .value
                            .split('\n')
                            .map(function (d) { return d.trim(); })
                            .filter(function (d) { return d; })
                    };
                    return [4 /*yield*/, chrome.storage.local.set(settings)];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, chrome.tabs.query({})];
                case 2:
                    tabs = _a.sent();
                    for (_i = 0, tabs_1 = tabs; _i < tabs_1.length; _i++) {
                        tab = tabs_1[_i];
                        if (tab.id) {
                            chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings: settings });
                        }
                    }
                    return [2 /*return*/];
            }
        });
    });
}
// Load settings from storage
function loadSettings() {
    return __awaiter(this, void 0, void 0, function () {
        var settings;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, chrome.storage.local.get({
                        exaKey: '',
                        openaiKey: '',
                        highlightsEnabled: true,
                        sidebarEnabled: false,
                        darkMode: false,
                        excludedDomains: []
                    })];
                case 1:
                    settings = _a.sent();
                    document.getElementById('exaKey').value = settings.exaKey;
                    document.getElementById('openaiKey').value = settings.openaiKey;
                    document.getElementById('highlightsEnabled').checked = settings.highlightsEnabled;
                    document.getElementById('sidebarEnabled').checked = settings.sidebarEnabled;
                    document.getElementById('darkMode').checked = settings.darkMode;
                    document.getElementById('excludedDomains').value =
                        settings.excludedDomains.join('\n');
                    return [2 /*return*/];
            }
        });
    });
}
// Update status message
function updateStatus(elementId, success, message) {
    var element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = "status ".concat(success ? 'success' : 'error');
    }
}
// Initialize
document.addEventListener('DOMContentLoaded', function () {
    var _a, _b, _c;
    loadSettings();
    // Test Exa API key
    (_a = document.getElementById('testExaKey')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', function () { return __awaiter(_this, void 0, void 0, function () {
        var key, success;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    key = document.getElementById('exaKey').value;
                    return [4 /*yield*/, testExaKey(key)];
                case 1:
                    success = _a.sent();
                    updateStatus('exaKeyStatus', success, success ? '✓ API key is valid' : '✗ Invalid API key');
                    return [2 /*return*/];
            }
        });
    }); });
    // Test OpenAI API key
    (_b = document.getElementById('testOpenAIKey')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', function () { return __awaiter(_this, void 0, void 0, function () {
        var key, success;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    key = document.getElementById('openaiKey').value;
                    return [4 /*yield*/, testOpenAIKey(key)];
                case 1:
                    success = _a.sent();
                    updateStatus('openaiKeyStatus', success, success ? '✓ API key is valid' : '✗ Invalid API key');
                    return [2 /*return*/];
            }
        });
    }); });
    // Save settings
    (_c = document.getElementById('saveSettings')) === null || _c === void 0 ? void 0 : _c.addEventListener('click', function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, saveSettings()];
                case 1:
                    _a.sent();
                    updateStatus('saveStatus', true, 'Settings saved!');
                    setTimeout(function () {
                        var element = document.getElementById('saveStatus');
                        if (element)
                            element.textContent = '';
                    }, 2000);
                    return [2 /*return*/];
            }
        });
    }); });
});
