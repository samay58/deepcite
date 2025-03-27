// Import types
import { VerifyClaimRequest, ExaSearchResult } from '@types';

// Import settings manager using path aliases
import { 
  initializeSettings,
  checkAndResetDailyUsage, 
  getSettings, 
  isDailyLimitExceeded,
  incrementUsageCounter,
  getCachedResults,
  cacheResults,
  cleanupExpiredCache
} from '@utils/settingsManager';

// Ensure service worker activates
console.log('Background service worker starting...');

// Basic background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  // Initialize settings with defaults if needed
  initializeSettings();
});

// The Exa API key will be retrieved from storage in the verifyClaimWithExa function
const EXA_API_URL = 'https://api.exa.ai/search';

/**
 * Verify a claim using Exa's API to find supporting sources
 * This is the core function that connects claims to reliable sources
 * 
 * @param claim - The text of the claim to verify
 * @returns Promise resolving to an array of search results with source information
 */
async function verifyClaimWithExa(claim: string): Promise<ExaSearchResult[]> {
  try {
    // First check for a new day to potentially reset usage counter
    await checkAndResetDailyUsage();

    // Get settings
    const settings = await getSettings();
    const { exaKey } = settings;
    
    if (!exaKey) {
      throw new Error('Exa API key not found. Please set it in the extension options.');
    }
    
    // Check if user has reached daily limit
    if (await isDailyLimitExceeded()) {
      const maxVerificationsPerDay = settings.maxVerificationsPerDay;
      throw new Error(`Daily verification limit (${maxVerificationsPerDay}) reached. Please try again tomorrow.`);
    }
    
    // Check cache first
    const cachedResults = await getCachedResults(claim);
    if (cachedResults) {
      return cachedResults;
    }
    
    // Send the claim to Exa API as a neural search query
    // This uses semantic understanding rather than just keyword matching
    const response = await fetch(EXA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${exaKey}`
      },
      body: JSON.stringify({
        query: claim,
        numResults: 3, // Limit to 3 sources for UI simplicity
        type: 'neural'  // Use neural search for better semantic understanding
      })
    });

    if (!response.ok) {
      throw new Error(`Exa API error: ${response.status}`);
    }

    const data = await response.json();
    const results = data.results;
    
    // Update usage counter
    await incrementUsageCounter();
    
    // Cache the results
    await cacheResults(claim, results);
    
    return results;
  } catch (error) {
    console.error('Error verifying claim:', error);
    throw error;
  }
}

// Listen for messages from content script
// This handles the communication between the content script (UI) and background service worker (API calls)
chrome.runtime.onMessage.addListener((
  request: VerifyClaimRequest,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) => {
  if (request.type === 'VERIFY_CLAIM') {
    // Process the claim verification request
    // This keeps API calls in the background script for better security and performance
    verifyClaimWithExa(request.claim.text)
      .then(results => {
        console.log('Verification results:', results);
        sendResponse({ success: true, results });
      })
      .catch(error => {
        // Check if this is a daily limit error
        if (error.message && error.message.includes('Daily verification limit')) {
          console.warn('Daily limit reached:', error.message);
          sendResponse({ 
            success: false, 
            error: 'DAILY_LIMIT_REACHED',
            message: error.message,
            results: [] 
          });
        } else {
          // Handle other API errors gracefully by returning an empty results array
          console.error('Verification failed:', error);
          sendResponse({ success: false, error: 'API_ERROR', results: [] });
        }
      });
    return true; // Return true to indicate we'll respond asynchronously
  } else if (request.type === 'GET_USAGE_STATS') {
    // Return current usage statistics
    getSettings().then(settings => {
      sendResponse({
        success: true,
        usageCount: settings.usageCount || 0,
        maxVerificationsPerDay: settings.maxVerificationsPerDay || 10,
        lastUsageReset: settings.lastUsageReset || Date.now()
      });
    });
    return true;
  }
  return true; // Always return true from the listener
});

// Run cache cleanup once a day
setInterval(cleanupExpiredCache, 24 * 60 * 60 * 1000); // Every 24 hours

// Also run cleanup when extension starts
cleanupExpiredCache();