"use strict";
// Ensure service worker activates
console.log('Background service worker starting...');
// Basic background service worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
    // Set default settings if not already set
    chrome.storage.local.get([
        'openaiKey',
        'exaKey',
        'maxVerificationsPerDay',
        'enableCaching',
        'cacheDuration',
        'usageCount',
        'lastUsageReset'
    ], (result) => {
        const defaults = {};
        if (!result.openaiKey) {
            defaults['openaiKey'] = '';
        }
        if (!result.exaKey) {
            defaults['exaKey'] = '';
        }
        if (result.maxVerificationsPerDay === undefined) {
            defaults['maxVerificationsPerDay'] = 10;
        }
        if (result.enableCaching === undefined) {
            defaults['enableCaching'] = true;
        }
        if (result.cacheDuration === undefined) {
            defaults['cacheDuration'] = 7;
        }
        if (result.usageCount === undefined) {
            defaults['usageCount'] = 0;
        }
        if (result.lastUsageReset === undefined) {
            defaults['lastUsageReset'] = Date.now();
        }
        if (Object.keys(defaults).length > 0) {
            chrome.storage.local.set(defaults);
        }
    });
});
// Check if usage limits should be reset (new day)
async function checkAndResetDailyUsage() {
    const { lastUsageReset } = await chrome.storage.local.get(['lastUsageReset']);
    if (lastUsageReset) {
        const lastResetDate = new Date(lastUsageReset).toDateString();
        const todayDate = new Date().toDateString();
        if (lastResetDate !== todayDate) {
            // It's a new day, reset the counter
            console.log('New day detected, resetting usage counter');
            await chrome.storage.local.set({
                usageCount: 0,
                lastUsageReset: Date.now()
            });
        }
    }
}
// The Exa API key will be retrieved from storage in the verifyClaimWithExa function
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
        // First check for a new day to potentially reset usage counter
        await checkAndResetDailyUsage();
        // Get settings from storage
        const settings = await chrome.storage.local.get([
            'exaKey',
            'maxVerificationsPerDay',
            'enableCaching',
            'cacheDuration',
            'usageCount'
        ]);
        const { exaKey, maxVerificationsPerDay = 10, enableCaching = true, cacheDuration = 7, usageCount = 0 } = settings;
        if (!exaKey) {
            throw new Error('Exa API key not found. Please set it in the extension options.');
        }
        // Check if user has reached daily limit
        if (maxVerificationsPerDay > 0 && usageCount >= maxVerificationsPerDay) {
            throw new Error(`Daily verification limit (${maxVerificationsPerDay}) reached. Please try again tomorrow.`);
        }
        // Check cache first if enabled
        if (enableCaching) {
            const cacheKey = `cache:${claim}`;
            const cachedData = await chrome.storage.local.get([cacheKey]);
            if (cachedData && cachedData[cacheKey]) {
                const cache = cachedData[cacheKey];
                // Check if cache is still valid based on cacheDuration (days)
                const cacheAgeMs = Date.now() - cache.timestamp;
                const cacheMaxAgeMs = cacheDuration * 24 * 60 * 60 * 1000; // Convert days to ms
                if (cacheAgeMs < cacheMaxAgeMs) {
                    console.log('Returning cached result for claim');
                    return cache.results;
                }
                else {
                    console.log('Cache expired, fetching fresh results');
                }
            }
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
                type: 'neural' // Use neural search for better semantic understanding
            })
        });
        if (!response.ok) {
            throw new Error(`Exa API error: ${response.status}`);
        }
        const data = await response.json();
        const results = data.results;
        // Update usage counter
        await chrome.storage.local.set({ usageCount: usageCount + 1 });
        // Cache the results if caching is enabled
        if (enableCaching) {
            const cacheKey = `cache:${claim}`;
            const cacheData = {
                timestamp: Date.now(),
                results: results
            };
            await chrome.storage.local.set({ [cacheKey]: cacheData });
        }
        return results;
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
            // Check if this is a daily limit error
            if (error.message && error.message.includes('Daily verification limit')) {
                console.warn('Daily limit reached:', error.message);
                sendResponse({
                    success: false,
                    error: 'DAILY_LIMIT_REACHED',
                    message: error.message,
                    results: []
                });
            }
            else {
                // Handle other API errors gracefully by returning an empty results array
                console.error('Verification failed:', error);
                sendResponse({ success: false, error: 'API_ERROR', results: [] });
            }
        });
        return true; // Return true to indicate we'll respond asynchronously
    }
    else if (request.type === 'GET_USAGE_STATS') {
        // Return current usage statistics
        chrome.storage.local.get(['usageCount', 'maxVerificationsPerDay', 'lastUsageReset'], (result) => {
            sendResponse({
                success: true,
                usageCount: result.usageCount || 0,
                maxVerificationsPerDay: result.maxVerificationsPerDay || 10,
                lastUsageReset: result.lastUsageReset || Date.now()
            });
        });
        return true;
    }
    return true; // Always return true from the listener
});
// Clean up old cached items periodically
async function cleanupOldCaches() {
    try {
        // Get all storage items
        const allItems = await chrome.storage.local.get(null);
        const { cacheDuration = 7 } = allItems;
        // Find all cache keys
        const cacheKeys = Object.keys(allItems).filter(key => key.startsWith('cache:'));
        const keysToRemove = [];
        // Check each cache's age
        const now = Date.now();
        const maxAgeMs = cacheDuration * 24 * 60 * 60 * 1000; // Convert days to ms
        for (const key of cacheKeys) {
            const cache = allItems[key];
            if (cache && cache.timestamp) {
                const age = now - cache.timestamp;
                if (age > maxAgeMs) {
                    keysToRemove.push(key);
                }
            }
        }
        // Remove old caches
        if (keysToRemove.length > 0) {
            console.log(`Removing ${keysToRemove.length} expired cache entries`);
            await chrome.storage.local.remove(keysToRemove);
        }
    }
    catch (error) {
        console.error('Error cleaning up caches:', error);
    }
}
// Run cache cleanup once a day
setInterval(cleanupOldCaches, 24 * 60 * 60 * 1000); // Every 24 hours
// Also run cleanup when extension starts
cleanupOldCaches();
