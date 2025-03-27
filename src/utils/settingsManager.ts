/**
 * Manages the extension settings and storage
 * Provides unified access to config, cache, and usage statistics
 */

/**
 * Interface for all extension settings
 */
export interface Settings {
  exaKey: string;
  openaiKey: string;
  highlightsEnabled: boolean;
  sidebarEnabled: boolean;
  darkMode: boolean;
  excludedDomains: string[];
  maxVerificationsPerDay: number;
  enableCaching: boolean;
  cacheDuration: number;
  useLLMExtraction: boolean;
  usageCount: number;
  lastUsageReset: number;
}

/**
 * Interface for cached claim results
 */
export interface ClaimCache {
  timestamp: number;
  results: any[]; // ExaSearchResult[] 
}

/**
 * Default settings to use when none are stored
 */
const DEFAULT_SETTINGS: Settings = {
  exaKey: '',
  openaiKey: '',
  highlightsEnabled: true,
  sidebarEnabled: false,
  darkMode: false,
  excludedDomains: [],
  maxVerificationsPerDay: 10,
  enableCaching: true,
  cacheDuration: 7,
  useLLMExtraction: true,
  usageCount: 0,
  lastUsageReset: Date.now()
};

/**
 * Get all settings from storage
 * @returns Promise resolving to settings object
 */
export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (result) => {
      resolve(result as Settings);
    });
  });
}

/**
 * Get a specific setting from storage
 * @param key The setting key to retrieve
 * @returns Promise resolving to the setting value
 */
export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] !== undefined ? result[key] : DEFAULT_SETTINGS[key]);
    });
  });
}

/**
 * Update specific settings
 * @param settings Partial settings object with values to update
 * @returns Promise that resolves when settings are saved
 */
export async function updateSettings(settings: Partial<Settings>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(settings, () => {
      resolve();
    });
  });
}

/**
 * Check if usage should be reset (new day) and reset if needed
 * @returns Promise resolving when check and reset is complete
 */
export async function checkAndResetDailyUsage(): Promise<void> {
  const lastUsageReset = await getSetting('lastUsageReset');
  
  if (lastUsageReset) {
    const lastResetDate = new Date(lastUsageReset).toDateString();
    const todayDate = new Date().toDateString();
    
    if (lastResetDate !== todayDate) {
      // It's a new day, reset the counter
      console.log('New day detected, resetting usage counter');
      await updateSettings({
        usageCount: 0,
        lastUsageReset: Date.now()
      });
    }
  }
}

/**
 * Increment the usage counter
 * @returns Promise resolving to the new usage count
 */
export async function incrementUsageCounter(): Promise<number> {
  // First check if we need to reset for a new day
  await checkAndResetDailyUsage();
  
  // Get current usage count
  const currentUsage = await getSetting('usageCount');
  const newUsage = (currentUsage || 0) + 1;
  
  // Save updated count
  await updateSettings({ usageCount: newUsage });
  
  return newUsage;
}

/**
 * Reset the usage counter
 * @returns Promise resolving when usage is reset
 */
export async function resetUsageCounter(): Promise<void> {
  await updateSettings({
    usageCount: 0,
    lastUsageReset: Date.now()
  });
}

/**
 * Check if the user has exceeded their daily verification limit
 * @returns Promise resolving to true if limit is exceeded, false otherwise
 */
export async function isDailyLimitExceeded(): Promise<boolean> {
  const settings = await getSettings();
  return settings.maxVerificationsPerDay > 0 && 
         settings.usageCount >= settings.maxVerificationsPerDay;
}

/**
 * Get cached results for a claim if available
 * @param claim The claim text to look up
 * @returns Promise resolving to cached results or null if not found
 */
export async function getCachedResults(claim: string): Promise<any[] | null> {
  const settings = await getSettings();
  
  // Check if caching is enabled
  if (!settings.enableCaching) {
    return null;
  }
  
  // Get cache for this claim
  const cacheKey = `cache:${claim}`;
  return new Promise((resolve) => {
    chrome.storage.local.get([cacheKey], (result) => {
      if (result && result[cacheKey]) {
        const cache = result[cacheKey] as ClaimCache;
        
        // Check if cache is still valid based on cacheDuration (days)
        const cacheAgeMs = Date.now() - cache.timestamp;
        const cacheMaxAgeMs = settings.cacheDuration * 24 * 60 * 60 * 1000; // Convert days to ms
        
        if (cacheAgeMs < cacheMaxAgeMs) {
          console.log('Returning cached result for claim');
          resolve(cache.results);
        } else {
          console.log('Cache expired, fetching fresh results');
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Cache results for a claim
 * @param claim The claim text to cache
 * @param results The results to cache
 * @returns Promise resolving when cache is saved
 */
export async function cacheResults(claim: string, results: any[]): Promise<void> {
  const settings = await getSettings();
  
  // Only cache if enabled
  if (!settings.enableCaching) {
    return;
  }
  
  const cacheKey = `cache:${claim}`;
  const cacheData: ClaimCache = {
    timestamp: Date.now(),
    results: results
  };
  
  return new Promise((resolve) => {
    chrome.storage.local.set({ [cacheKey]: cacheData }, () => {
      resolve();
    });
  });
}

/**
 * Clean up expired cache entries
 * @returns Promise resolving when cleanup is complete
 */
export async function cleanupExpiredCache(): Promise<void> {
  try {
    // Get all storage items
    const allItems = await new Promise<Record<string, any>>((resolve) => {
      chrome.storage.local.get(null, (items) => {
        resolve(items);
      });
    });
    
    const { cacheDuration = 7 } = allItems;
    
    // Find all cache keys
    const cacheKeys = Object.keys(allItems).filter(key => key.startsWith('cache:'));
    const keysToRemove: string[] = [];
    
    // Check each cache's age
    const now = Date.now();
    const maxAgeMs = cacheDuration * 24 * 60 * 60 * 1000; // Convert days to ms
    
    for (const key of cacheKeys) {
      const cache = allItems[key] as ClaimCache;
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
      await new Promise<void>((resolve) => {
        chrome.storage.local.remove(keysToRemove, () => {
          resolve();
        });
      });
    }
  } catch (error) {
    console.error('Error cleaning up caches:', error);
  }
}

/**
 * Initialize settings with defaults if they don't exist
 * @returns Promise resolving when initialization is complete
 */
export async function initializeSettings(): Promise<void> {
  const currentSettings = await new Promise<Record<string, any>>((resolve) => {
    chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), (result) => {
      resolve(result);
    });
  });
  
  const settingsToSet: Partial<Settings> = {};
  
  // Check each default setting and add if missing
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (currentSettings[key] === undefined) {
      settingsToSet[key as keyof Settings] = value;
    }
  }
  
  // Save any missing settings
  if (Object.keys(settingsToSet).length > 0) {
    await updateSettings(settingsToSet);
  }
}