"use strict";
// Ensure service worker activates
console.log('Background service worker starting...');
// Basic background service worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
    // Store the OpenAI key for LLM-based claim extraction
    // TODO: In the future, this will be configured by the user in options.html
    // The extension will fall back to rule-based extraction if this key is invalid
    chrome.storage.local.set({
        openAiKey: '4f19f27d-e552-4fed-b88d-eb2b6a217f54' // Development key only
    });
});
// Exa API configuration for source verification
// TODO: Move to user-configurable storage in future version
const EXA_API_KEY = '4f19f27d-e552-4fed-b88d-eb2b6a217f54';
const EXA_API_URL = 'https://api.exa.ai/search';
/**
 * Verify a claim using Exa's API to find supporting sources
 * This is the core function that connects claims to reliable sources
 *
 * @param claim - The text of the claim to verify
 * @returns Promise resolving to an array of search results with source information
 */
async function verifyClaimWithExa(claim) {
    try {
        // Send the claim to Exa API as a neural search query
        // This uses semantic understanding rather than just keyword matching
        const response = await fetch(EXA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${EXA_API_KEY}`
            },
            body: JSON.stringify({
                query: claim,
                numResults: 3, // Limit to 3 sources for UI simplicity
                type: 'neural' // Use neural search for better semantic understanding
            })
        });
        if (!response.ok) {
            throw new Error(`Exa API error: ${response.status}`);
        }
        const data = await response.json();
        return data.results;
    }
    catch (error) {
        console.error('Error verifying claim:', error);
        throw error;
    }
}
// Listen for messages from content script
// This handles the communication between the content script (UI) and background service worker (API calls)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
