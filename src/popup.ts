// Popup script for DeepCite Chrome extension
document.addEventListener('DOMContentLoaded', () => {
  // Get UI elements
  const analyzePageBtn = document.getElementById('analyzePageBtn') as HTMLButtonElement;
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn') as HTMLButtonElement;
  const optionsLink = document.getElementById('optionsLink');
  const usageCountElement = document.getElementById('usageCount');
  const usageLimitElement = document.getElementById('usageLimit');
  const usageStatusElement = document.getElementById('usageStatus');
  
  // Get current tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTabId = tabs[0].id;
    
    // Disable buttons if we're on a chrome:// or edge:// URL (can't inject scripts there)
    const isRestrictedUrl = tabs[0].url?.startsWith('chrome://') || 
                          tabs[0].url?.startsWith('edge://') ||
                          tabs[0].url?.startsWith('about:');
    
    if (isRestrictedUrl) {
      if (analyzePageBtn) {
        analyzePageBtn.disabled = true;
        analyzePageBtn.title = 'Cannot analyze browser pages';
      }
      if (toggleSidebarBtn) {
        toggleSidebarBtn.disabled = true;
        toggleSidebarBtn.title = 'Cannot toggle sidebar on browser pages';
      }
    } else {
      // Analyze page button
      analyzePageBtn?.addEventListener('click', () => {
        if (currentTabId) {
          chrome.tabs.sendMessage(currentTabId, { type: 'ANALYZE_PAGE' });
          window.close(); // Close the popup
        }
      });
      
      // Toggle sidebar button
      toggleSidebarBtn?.addEventListener('click', () => {
        if (currentTabId) {
          chrome.tabs.sendMessage(currentTabId, { type: 'TOGGLE_SIDEBAR' });
          window.close(); // Close the popup
        }
      });
    }
  });
  
  // Options link
  optionsLink?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close(); // Close the popup
  });
  
  // Get usage stats from background
  chrome.runtime.sendMessage({ type: 'GET_USAGE_STATS' }, (response) => {
    if (response && response.success) {
      // Update the UI with usage information
      if (usageCountElement) {
        usageCountElement.textContent = response.usageCount.toString();
      }
      if (usageLimitElement) {
        usageLimitElement.textContent = response.maxVerificationsPerDay === 0 ? 
          'unlimited' : response.maxVerificationsPerDay.toString();
      }
      if (usageStatusElement) {
        const isLimited = response.maxVerificationsPerDay > 0;
        const remainingUses = response.maxVerificationsPerDay - response.usageCount;
        
        if (!isLimited) {
          usageStatusElement.textContent = 'Unlimited usage';
          usageStatusElement.style.color = '#28a745'; // Green
        } else if (remainingUses <= 0) {
          usageStatusElement.textContent = 'Daily limit reached!';
          usageStatusElement.style.color = '#dc3545'; // Red
        } else if (remainingUses <= 3) {
          usageStatusElement.textContent = `${remainingUses} remaining today`;
          usageStatusElement.style.color = '#ffc107'; // Yellow
        } else {
          usageStatusElement.textContent = `${remainingUses} remaining today`;
          usageStatusElement.style.color = '#28a745'; // Green
        }
      }
    } else {
      console.error('Failed to get usage stats');
      if (usageStatusElement) {
        usageStatusElement.textContent = 'Error fetching data';
        usageStatusElement.style.color = '#dc3545'; // Red
      }
    }
  });
});