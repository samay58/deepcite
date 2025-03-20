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
            .filter(d => d)
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
        excludedDomains: []
    });
    document.getElementById('exaKey').value = settings.exaKey;
    document.getElementById('openaiKey').value = settings.openaiKey;
    document.getElementById('highlightsEnabled').checked = settings.highlightsEnabled;
    document.getElementById('sidebarEnabled').checked = settings.sidebarEnabled;
    document.getElementById('darkMode').checked = settings.darkMode;
    document.getElementById('excludedDomains').value =
        settings.excludedDomains.join('\n');
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
