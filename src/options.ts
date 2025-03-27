// Import settings manager and types using path aliases
import { Settings } from '@types';
import { 
  getSettings, 
  updateSettings, 
  resetUsageCounter 
} from '@utils/settingsManager';

// Test the Exa API key
async function testExaKey(key: string): Promise<boolean> {
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
  } catch (error) {
    return false;
  }
}

// Test the OpenAI API key
async function testOpenAIKey(key: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${key}`
      }
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Save settings to storage
async function saveSettings(): Promise<void> {
  const maxVerifications = (document.getElementById('maxVerifications') as HTMLInputElement).value;
  const cacheDuration = (document.getElementById('cacheDuration') as HTMLInputElement).value;
  
  // Get current settings to preserve usage stats
  const currentSettings = await getSettings();
  
  const settings: Settings = {
    exaKey: (document.getElementById('exaKey') as HTMLInputElement).value,
    openaiKey: (document.getElementById('openaiKey') as HTMLInputElement).value,
    highlightsEnabled: (document.getElementById('highlightsEnabled') as HTMLInputElement).checked,
    sidebarEnabled: (document.getElementById('sidebarEnabled') as HTMLInputElement).checked,
    darkMode: (document.getElementById('darkMode') as HTMLInputElement).checked,
    excludedDomains: (document.getElementById('excludedDomains') as HTMLTextAreaElement)
      .value
      .split('\n')
      .map(d => d.trim())
      .filter(d => d),
    maxVerificationsPerDay: parseInt(maxVerifications || '10', 10),
    enableCaching: (document.getElementById('enableCaching') as HTMLInputElement).checked,
    cacheDuration: parseInt(cacheDuration || '7', 10),
    useLLMExtraction: (document.getElementById('useLLMExtraction') as HTMLInputElement).checked,
    // Preserve usage stats
    usageCount: currentSettings.usageCount,
    lastUsageReset: currentSettings.lastUsageReset
  };

  // Update settings using the settings manager
  await updateSettings(settings);
  
  // Notify content scripts of settings change
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings });
    }
  }
}

// Load settings from storage
async function loadSettings(): Promise<void> {
  // Get settings from the settings manager
  const settings = await getSettings();

  (document.getElementById('exaKey') as HTMLInputElement).value = settings.exaKey;
  (document.getElementById('openaiKey') as HTMLInputElement).value = settings.openaiKey;
  (document.getElementById('highlightsEnabled') as HTMLInputElement).checked = settings.highlightsEnabled;
  (document.getElementById('sidebarEnabled') as HTMLInputElement).checked = settings.sidebarEnabled;
  (document.getElementById('darkMode') as HTMLInputElement).checked = settings.darkMode;
  (document.getElementById('excludedDomains') as HTMLTextAreaElement).value = 
    settings.excludedDomains.join('\n');
  (document.getElementById('maxVerifications') as HTMLInputElement).value = 
    settings.maxVerificationsPerDay.toString();
  (document.getElementById('enableCaching') as HTMLInputElement).checked = 
    settings.enableCaching;
  (document.getElementById('cacheDuration') as HTMLInputElement).value = 
    settings.cacheDuration.toString();
  (document.getElementById('useLLMExtraction') as HTMLInputElement).checked = 
    settings.useLLMExtraction;
  
  // Update current usage display
  const currentUsageElement = document.getElementById('currentUsage');
  if (currentUsageElement) {
    currentUsageElement.textContent = settings.usageCount.toString();
  }
  
  // Conditionally disable LLM extraction toggle if OpenAI key is missing
  const openaiKeyField = document.getElementById('openaiKey') as HTMLInputElement;
  const useLLMExtractionField = document.getElementById('useLLMExtraction') as HTMLInputElement;
  
  if (!openaiKeyField.value) {
    useLLMExtractionField.checked = false;
    useLLMExtractionField.disabled = true;
    useLLMExtractionField.parentElement?.parentElement?.setAttribute('title', 'OpenAI API key required');
  } else {
    useLLMExtractionField.disabled = false;
    useLLMExtractionField.parentElement?.parentElement?.removeAttribute('title');
  }
}

// Update status message
function updateStatus(elementId: string, success: boolean, message: string): void {
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
    const key = (document.getElementById('exaKey') as HTMLInputElement).value;
    const success = await testExaKey(key);
    updateStatus('exaKeyStatus', success, 
      success ? '✓ API key is valid' : '✗ Invalid API key');
  });

  // Test OpenAI API key
  document.getElementById('testOpenAIKey')?.addEventListener('click', async () => {
    const key = (document.getElementById('openaiKey') as HTMLInputElement).value;
    const success = await testOpenAIKey(key);
    updateStatus('openaiKeyStatus', success, 
      success ? '✓ API key is valid' : '✗ Invalid API key');
      
    // Update LLM extraction toggle based on key validity
    const useLLMExtractionField = document.getElementById('useLLMExtraction') as HTMLInputElement;
    if (success) {
      useLLMExtractionField.disabled = false;
      useLLMExtractionField.parentElement?.parentElement?.removeAttribute('title');
    } else {
      useLLMExtractionField.checked = false;
      useLLMExtractionField.disabled = true;
      useLLMExtractionField.parentElement?.parentElement?.setAttribute('title', 'OpenAI API key required');
    }
  });
  
  // Listen for changes to the OpenAI key field
  document.getElementById('openaiKey')?.addEventListener('input', () => {
    const key = (document.getElementById('openaiKey') as HTMLInputElement).value;
    const useLLMExtractionField = document.getElementById('useLLMExtraction') as HTMLInputElement;
    
    if (key.trim() === '') {
      useLLMExtractionField.checked = false;
      useLLMExtractionField.disabled = true;
      useLLMExtractionField.parentElement?.parentElement?.setAttribute('title', 'OpenAI API key required');
    } else {
      useLLMExtractionField.disabled = false;
      useLLMExtractionField.parentElement?.parentElement?.removeAttribute('title');
    }
  });

  // Reset usage counter
  document.getElementById('resetUsage')?.addEventListener('click', async () => {
    // Use the settings manager to reset usage counter
    await resetUsageCounter();
    
    // Update UI
    const currentUsageElement = document.getElementById('currentUsage');
    if (currentUsageElement) {
      currentUsageElement.textContent = '0';
    }
    
    updateStatus('saveStatus', true, 'Usage counter reset!');
    setTimeout(() => {
      const element = document.getElementById('saveStatus');
      if (element) element.textContent = '';
    }, 2000);
  });

  // Save settings
  document.getElementById('saveSettings')?.addEventListener('click', async () => {
    await saveSettings();
    updateStatus('saveStatus', true, 'Settings saved!');
    setTimeout(() => {
      const element = document.getElementById('saveStatus');
      if (element) element.textContent = '';
    }, 2000);
  });
});