"use strict";
// Test the Exa API key
async function testExaKey(key) {
    try {
        const response = await fetch('https://api.exa.ai/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                query: 'test query',
                numResults: 1
            })
        });
        return response.ok;
    }
    catch (error) {
        return false;
    }
}
// Test the OpenAI API key
async function testOpenAIKey(key) {
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            headers: {
                'Authorization': `Bearer ${key}`
            }
        });
        return response.ok;
    }
    catch (error) {
        return false;
    }
}
// Save settings to storage
async function saveSettings() {
    const maxVerifications = document.getElementById('maxVerifications').value;
    const cacheDuration = document.getElementById('cacheDuration').value;
    // Get current usage stats to preserve them
    const currentStats = await chrome.storage.local.get(['usageCount', 'lastUsageReset']);
    const settings = {
        exaKey: document.getElementById('exaKey').value,
        openaiKey: document.getElementById('openaiKey').value,
        highlightsEnabled: document.getElementById('highlightsEnabled').checked,
        sidebarEnabled: document.getElementById('sidebarEnabled').checked,
        darkMode: document.getElementById('darkMode').checked,
        excludedDomains: document.getElementById('excludedDomains')
            .value
            .split('\n')
            .map(d => d.trim())
            .filter(d => d),
        maxVerificationsPerDay: parseInt(maxVerifications || '10', 10),
        enableCaching: document.getElementById('enableCaching').checked,
        cacheDuration: parseInt(cacheDuration || '7', 10),
        useLLMExtraction: document.getElementById('useLLMExtraction').checked,
        usageCount: currentStats.usageCount || 0,
        lastUsageReset: currentStats.lastUsageReset || Date.now()
    };
    await chrome.storage.local.set(settings);
    // Notify content scripts of settings change
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings });
        }
    }
}
// Load settings from storage
async function loadSettings() {
    const settings = await chrome.storage.local.get({
        exaKey: '',
        openaiKey: '',
        highlightsEnabled: true,
        sidebarEnabled: false,
        darkMode: false,
        excludedDomains: [],
        maxVerificationsPerDay: 10,
        enableCaching: true,
        cacheDuration: 7,
        usageCount: 0,
        lastUsageReset: Date.now(),
        useLLMExtraction: true
    });
    // Reset usage counter if it's a new day
    const today = new Date().toDateString();
    const lastReset = new Date(settings.lastUsageReset).toDateString();
    if (today !== lastReset) {
        console.log('New day detected, resetting usage counter');
        await chrome.storage.local.set({
            usageCount: 0,
            lastUsageReset: Date.now()
        });
        settings.usageCount = 0;
    }
    document.getElementById('exaKey').value = settings.exaKey;
    document.getElementById('openaiKey').value = settings.openaiKey;
    document.getElementById('highlightsEnabled').checked = settings.highlightsEnabled;
    document.getElementById('sidebarEnabled').checked = settings.sidebarEnabled;
    document.getElementById('darkMode').checked = settings.darkMode;
    document.getElementById('excludedDomains').value =
        settings.excludedDomains.join('\n');
    document.getElementById('maxVerifications').value =
        settings.maxVerificationsPerDay.toString();
    document.getElementById('enableCaching').checked =
        settings.enableCaching;
    document.getElementById('cacheDuration').value =
        settings.cacheDuration.toString();
    document.getElementById('useLLMExtraction').checked =
        settings.useLLMExtraction;
    // Update current usage display
    const currentUsageElement = document.getElementById('currentUsage');
    if (currentUsageElement) {
        currentUsageElement.textContent = settings.usageCount.toString();
    }
    // Conditionally disable LLM extraction toggle if OpenAI key is missing
    const openaiKeyField = document.getElementById('openaiKey');
    const useLLMExtractionField = document.getElementById('useLLMExtraction');
    if (!openaiKeyField.value) {
        useLLMExtractionField.checked = false;
        useLLMExtractionField.disabled = true;
        useLLMExtractionField.parentElement?.parentElement?.setAttribute('title', 'OpenAI API key required');
    }
    else {
        useLLMExtractionField.disabled = false;
        useLLMExtractionField.parentElement?.parentElement?.removeAttribute('title');
    }
}
// Update status message
function updateStatus(elementId, success, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = `status ${success ? 'success' : 'error'}`;
    }
}
// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    // Test Exa API key
    document.getElementById('testExaKey')?.addEventListener('click', async () => {
        const key = document.getElementById('exaKey').value;
        const success = await testExaKey(key);
        updateStatus('exaKeyStatus', success, success ? '✓ API key is valid' : '✗ Invalid API key');
    });
    // Test OpenAI API key
    document.getElementById('testOpenAIKey')?.addEventListener('click', async () => {
        const key = document.getElementById('openaiKey').value;
        const success = await testOpenAIKey(key);
        updateStatus('openaiKeyStatus', success, success ? '✓ API key is valid' : '✗ Invalid API key');
        // Update LLM extraction toggle based on key validity
        const useLLMExtractionField = document.getElementById('useLLMExtraction');
        if (success) {
            useLLMExtractionField.disabled = false;
            useLLMExtractionField.parentElement?.parentElement?.removeAttribute('title');
        }
        else {
            useLLMExtractionField.checked = false;
            useLLMExtractionField.disabled = true;
            useLLMExtractionField.parentElement?.parentElement?.setAttribute('title', 'OpenAI API key required');
        }
    });
    // Listen for changes to the OpenAI key field
    document.getElementById('openaiKey')?.addEventListener('input', () => {
        const key = document.getElementById('openaiKey').value;
        const useLLMExtractionField = document.getElementById('useLLMExtraction');
        if (key.trim() === '') {
            useLLMExtractionField.checked = false;
            useLLMExtractionField.disabled = true;
            useLLMExtractionField.parentElement?.parentElement?.setAttribute('title', 'OpenAI API key required');
        }
        else {
            useLLMExtractionField.disabled = false;
            useLLMExtractionField.parentElement?.parentElement?.removeAttribute('title');
        }
    });
    // Reset usage counter
    document.getElementById('resetUsage')?.addEventListener('click', async () => {
        await chrome.storage.local.set({
            usageCount: 0,
            lastUsageReset: Date.now()
        });
        // Update UI
        const currentUsageElement = document.getElementById('currentUsage');
        if (currentUsageElement) {
            currentUsageElement.textContent = '0';
        }
        updateStatus('saveStatus', true, 'Usage counter reset!');
        setTimeout(() => {
            const element = document.getElementById('saveStatus');
            if (element)
                element.textContent = '';
        }, 2000);
    });
    // Save settings
    document.getElementById('saveSettings')?.addEventListener('click', async () => {
        await saveSettings();
        updateStatus('saveStatus', true, 'Settings saved!');
        setTimeout(() => {
            const element = document.getElementById('saveStatus');
            if (element)
                element.textContent = '';
        }, 2000);
    });
});
