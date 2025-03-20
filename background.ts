// Define types inline since we can't use modules in service worker
interface ExaSearchResult {
  title: string;
  url: string;
  publishedDate?: string;
  score: number;
  highlights: string[];
}

interface VerifyClaimRequest {
  type: 'VERIFY_CLAIM';
  claim: {
    id: number;
    text: string;
    context: {
      page: number;
      paragraph: number;
    };
    relevance: number;
  };
}

// Ensure service worker activates
console.log('Background service worker starting...');

// Basic background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  // Set default settings if not already set
  chrome.storage.local.get(['openaiKey', 'exaKey'], (result: {openaiKey?: string, exaKey?: string}) => {
    const defaults: {openaiKey?: string, exaKey?: string} = {};
    
    if (!result.openaiKey) {
      defaults['openaiKey'] = '';
    }
    
    if (!result.exaKey) {
      defaults['exaKey'] = '';
    }
    
    if (Object.keys(defaults).length > 0) {
      chrome.storage.local.set(defaults);
    }
  });
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
    // Get the API key from storage
    const result = await chrome.storage.local.get(['exaKey']);
    const exaKey = result.exaKey;
    
    if (!exaKey) {
      throw new Error('Exa API key not found. Please set it in the extension options.');
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
    return data.results;
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
        // Handle API errors gracefully
        console.error('Verification failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Return true to indicate we'll respond asynchronously
  }
  return true; // Always return true from the listener
});