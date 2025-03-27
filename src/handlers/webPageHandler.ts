import { Claim } from '../extractors/contentExtractor';

/**
 * Helper function to determine color based on confidence level
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'var(--high-confidence)';   // High confidence - green
  if (confidence >= 0.5) return 'var(--medium-confidence)'; // Medium confidence - yellow/amber
  return 'var(--low-confidence)';                           // Low confidence - red
}

/**
 * Creates a consistent DEEPCITE badge for UI elements
 */
export function createDeepCiteBadge(): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'deepcite-badge';
  badge.textContent = 'DEEPCITE';
  badge.title = 'This element contains a factual claim verified by DeepCite';
  
  // We're now using CSS defined in pdf-overlay.css
  // No need to add event listeners as they're handled via CSS :hover
  
  return badge;
}

/**
 * Highlight a claim within the web page content
 * @param claim The claim to highlight
 * @param sources The sources associated with the claim
 * @returns Whether the claim was successfully highlighted
 */
export function highlightClaim(claim: Claim, sources: any[]): boolean {
  console.log('Starting highlight process for claim:', claim.cleanText);
  
  // Check if this claim already has a data-claim-id attribute set in the DOM
  // to avoid duplicate highlights
  const existingHighlight = document.querySelector(`[data-claim-id="${claim.id}"]`);
  if (existingHighlight) {
    console.log('This claim is already highlighted, skipping duplicate highlight');
    return true;
  }
  
  // Try to find the claim in the actual page content
  const paragraphs = document.getElementsByTagName('p');
  console.log('Found paragraphs:', paragraphs.length);
  
  let foundMatch = false;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const cleanParagraphText = p.textContent?.replace(/\[\d+\]/g, '') || '';
    
    if (cleanParagraphText.includes(claim.cleanText)) {
      console.log('Found matching paragraph!', p.getAttribute('data-deepcite-id'));
      foundMatch = true;
      
      try {
        // Enhanced styling for better visibility
        p.style.backgroundColor = 'rgba(47, 128, 237, 0.2)'; // Increased opacity
        p.style.borderLeft = '4px solid rgba(47, 128, 237, 0.6)'; // Thicker border, more opacity
        p.style.padding = '8px'; // Increased padding
        p.style.cursor = 'pointer';
        p.style.transition = 'all 0.25s ease';
        p.style.borderRadius = '3px'; // Subtle rounded corners
        p.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)'; // Subtle shadow
        
        // Mark this paragraph
        p.setAttribute('data-claim-id', claim.id.toString());
        
        // Check if the paragraph already has a DEEPCITE badge to avoid duplicates
        if (!p.querySelector('.deepcite-badge')) {
          // Add the improved DEEPCITE badge only if one doesn't already exist
          const deepciteBadge = createDeepCiteBadge();
          
          // Add confidence score to the badge if available
          if (claim.confidence !== undefined) {
            const confidencePercent = Math.round(claim.confidence * 100);
            deepciteBadge.title = `Confidence score: ${confidencePercent}%`;
          }
          
          // Insert at the beginning of the paragraph
          if (p.firstChild) {
            p.insertBefore(deepciteBadge, p.firstChild);
          } else {
            p.appendChild(deepciteBadge);
          }
        }
        
        console.log('Applied enhanced styles to paragraph');
      } catch (err) {
        console.error('Error highlighting paragraph:', err);
      }
      
      // Create direct hover handler on the paragraph
      let currentTooltip: HTMLElement | null = null;
      let tooltipTimeout: number | null = null;
      let currentSourceIndex = 0;
      
      // Function to update tooltip content
      const updateTooltip = () => {
        if (!currentTooltip) return;
        
        // We'll update the tooltip to provide a better view of multiple sources
        let tooltipHTML = '';
        
        // Add claim confidence if available - with visual meter
        if (claim.confidence !== undefined) {
          tooltipHTML += `
            <div class="exa-claim-confidence" style="margin-bottom: 10px; padding: 6px 8px; background: rgba(47, 128, 237, 0.05); border-radius: 6px; font-size: 13px;">
              <span style="font-weight: bold;">Certainty:</span> 
              <span style="display: inline-block; height: 8px; border-radius: 4px; margin: 0 6px; width: ${Math.round(claim.confidence * 100)}px; background-color: ${getConfidenceColor(claim.confidence)};">
              </span>
              <span style="font-weight: 500; margin-left: 4px; color: ${getConfidenceColor(claim.confidence)}">
                ${Math.round(claim.confidence * 100)}%
              </span>
            </div>
          `;
        }
        
        // Add sources header
        tooltipHTML += `<div style="font-weight: 600; margin-bottom: 10px; color: #333;">
          Sources (${sources.length})
        </div>`;
        
        // Display sources
        if (sources.length <= 2) {
          // Show all sources in a compact view
          tooltipHTML += sources.map((source, index) => {
            const srcFavicon = `https://www.google.com/s2/favicons?domain=${new URL(source.url).hostname}`;
            return `
              <div style="margin-bottom: 10px; padding: 6px;">
                <div style="display: flex; align-items: center; margin-bottom: 6px;">
                  <img src="${srcFavicon}" alt="Source icon" style="width: 16px; height: 16px; margin-right: 8px; border-radius: 2px;">
                  <strong>${source.title}</strong>
                  <span style="display: inline-block; padding: 2px 6px; background: rgba(47, 128, 237, 0.05); border-radius: 4px; font-size: 12px; margin-left: 8px; color: #666;">
                    ${Math.round(source.score * 100)}%
                  </span>
                </div>
                <a href="${source.url}" target="_blank" style="color: #007AFF; text-decoration: none;">View source</a>
                ${index < sources.length - 1 ? '<hr style="margin: 10px 0; border: 0; border-top: 1px solid #eee;">' : ''}
              </div>
            `;
          }).join('');
        } else {
          // Use pagination for 3+ sources
          const source = sources[currentSourceIndex];
          const srcFavicon = `https://www.google.com/s2/favicons?domain=${new URL(source.url).hostname}`;
          
          tooltipHTML += `
            <div style="margin-bottom: 10px; padding: 6px;">
              <div style="display: flex; align-items: center; margin-bottom: 6px;">
                <img src="${srcFavicon}" alt="Source icon" style="width: 16px; height: 16px; margin-right: 8px; border-radius: 2px;">
                <strong>${source.title}</strong>
                <span style="display: inline-block; padding: 2px 6px; background: rgba(47, 128, 237, 0.05); border-radius: 4px; font-size: 12px; margin-left: 8px; color: #666;">
                  ${Math.round(source.score * 100)}%
                </span>
              </div>
              <a href="${source.url}" target="_blank" style="color: #007AFF; text-decoration: none;">View source</a>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 8px; border-top: 1px solid #eee;">
              <button id="prev-btn" ${currentSourceIndex === 0 ? 'disabled' : ''} style="background: #f8f9fa; border: 1px solid #eee; color: #333; cursor: pointer; padding: 4px 10px; border-radius: 6px;">
                ← Previous
              </button>
              <span>${currentSourceIndex + 1}/${sources.length}</span>
              <button id="next-btn" ${currentSourceIndex === sources.length - 1 ? 'disabled' : ''} style="background: #f8f9fa; border: 1px solid #eee; color: #333; cursor: pointer; padding: 4px 10px; border-radius: 6px;">
                Next →
              </button>
            </div>
          `;
        }
        
        currentTooltip.innerHTML = tooltipHTML;
        
        // Add event listeners to buttons
        if (sources.length > 2) {
          const prevBtn = currentTooltip.querySelector('#prev-btn');
          const nextBtn = currentTooltip.querySelector('#next-btn');
          
          if (prevBtn) {
            prevBtn.addEventListener('click', () => {
              if (currentSourceIndex > 0) {
                currentSourceIndex--;
                updateTooltip();
              }
            });
          }
          
          if (nextBtn) {
            nextBtn.addEventListener('click', () => {
              if (currentSourceIndex < sources.length - 1) {
                currentSourceIndex++;
                updateTooltip();
              }
            });
          }
        }
      };
      
      const clearTooltipTimeout = () => {
        if (tooltipTimeout) {
          clearTimeout(tooltipTimeout);
          tooltipTimeout = null;
        }
      };
      
      const startTooltipTimeout = () => {
        clearTooltipTimeout();
        tooltipTimeout = window.setTimeout(() => {
          if (currentTooltip) {
            currentTooltip.remove();
            currentTooltip = null;
          }
        }, 300);
      };
      
      // Add hover handler directly to the paragraph
      p.addEventListener('mouseenter', () => {
        clearTooltipTimeout();
        
        // Remove any existing tooltips
        const existingTooltip = document.querySelector('.exa-tooltip');
        if (existingTooltip) existingTooltip.remove();
        
        const newTooltip = document.createElement('div');
        newTooltip.className = 'exa-tooltip';
        newTooltip.style.position = 'fixed';
        newTooltip.style.background = 'white';
        newTooltip.style.border = '1px solid #e0e0e0';
        newTooltip.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
        newTooltip.style.padding = '14px 18px';
        newTooltip.style.borderRadius = '8px';
        newTooltip.style.fontSize = '14px';
        newTooltip.style.maxWidth = '320px';
        newTooltip.style.zIndex = '999999';
        newTooltip.style.color = '#333';
        newTooltip.style.backdropFilter = 'blur(10px)';
        newTooltip.style.opacity = '0';
        newTooltip.style.transform = 'translateY(8px)';
        newTooltip.style.transition = 'opacity 0.25s, transform 0.25s';
        newTooltip.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        newTooltip.style.lineHeight = '1.5';
        
        // Position the tooltip
        const rect = p.getBoundingClientRect();
        newTooltip.style.top = `${rect.bottom + 5}px`;
        newTooltip.style.left = `${rect.left}px`;
        
        document.body.appendChild(newTooltip);
        currentTooltip = newTooltip;
        
        // Add animation
        setTimeout(() => {
          newTooltip.style.opacity = '1';
          newTooltip.style.transform = 'translateY(0)';
        }, 10);
        
        // Initial tooltip content
        updateTooltip();
        
        // Add hover handlers to tooltip
        newTooltip.addEventListener('mouseenter', clearTooltipTimeout);
        newTooltip.addEventListener('mouseleave', startTooltipTimeout);
      });
      
      p.addEventListener('mouseleave', startTooltipTimeout);
      
      // Only process the first matching paragraph
      break;
    }
  }
  
  // Return whether we found and highlighted a match
  return foundMatch;
}

/**
 * Links to the external stylesheet for UI components
 */
export function addStylesheet() {
  console.log('Adding stylesheet to document head');
  const existingStylesheets = document.querySelectorAll('link[href*="pdf-overlay.css"]');
  if (existingStylesheets.length > 0) {
    console.log('Stylesheet already exists, not adding again');
    return;
  }
  
  const linkToStyles = document.createElement('link');
  linkToStyles.rel = 'stylesheet';
  linkToStyles.href = chrome.runtime.getURL('styles/pdf-overlay.css');
  document.head.appendChild(linkToStyles);
  console.log('Stylesheet added:', linkToStyles.href);
}

/**
 * Creates a sidebar toggle button for the claims panel
 */
export function createSidebarToggle(): HTMLElement {
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'deepcite-sidebar-toggle';
  toggleBtn.textContent = '»';   // Arrow icon
  
  // Position it fixed on the right, about halfway down
  toggleBtn.style.position = 'fixed';
  toggleBtn.style.right = '0';
  toggleBtn.style.top = '50%';
  toggleBtn.style.transform = 'translateY(-50%)';
  toggleBtn.style.width = '32px';
  toggleBtn.style.height = '48px';
  toggleBtn.style.backgroundColor = 'var(--primary-color, #2F80ED)';
  toggleBtn.style.color = '#fff';
  toggleBtn.style.border = 'none';
  toggleBtn.style.borderRadius = '8px 0 0 8px'; // Round left corners
  toggleBtn.style.cursor = 'pointer';
  toggleBtn.style.zIndex = '99999';
  toggleBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  toggleBtn.style.fontSize = '16px';
  toggleBtn.style.fontWeight = 'bold';
  toggleBtn.style.transition = 'all 0.3s ease';
  
  // On hover, make the button slightly larger
  toggleBtn.addEventListener('mouseenter', () => {
    toggleBtn.style.width = '36px';
    toggleBtn.style.backgroundColor = 'var(--primary-color-hover, #1c68d3)';
  });
  
  toggleBtn.addEventListener('mouseleave', () => {
    toggleBtn.style.width = '32px';
    toggleBtn.style.backgroundColor = 'var(--primary-color, #2F80ED)';
  });
  
  document.body.appendChild(toggleBtn);
  return toggleBtn;
}

/**
 * Creates a claims overlay panel for displaying detected claims
 * @param isPDF Whether this is being used for a PDF document
 */
export async function createClaimsOverlay(isPDF = false): Promise<HTMLElement> {
  console.log('Creating claims overlay, isPDF:', isPDF);
  
  // Clean up any temporary UI elements when creating/reopening overlay
  cleanupEphemeralElements();
  
  // Check if overlay already exists
  let overlay = document.querySelector('.deepcite-claims-overlay') as HTMLElement;
  console.log('Existing overlay found:', !!overlay);
  
  if (overlay) {
    // If overlay exists, keep it in its current state (closed/minimized)
    // We'll control visibility with the toggle button now
    console.log('Using existing overlay');
    
    // Update the header to show we're processing again
    const headerSmall = overlay.querySelector('.deepcite-claims-header small');
    if (headerSmall) {
      headerSmall.textContent = 'Processing...';
    }
    
    return overlay;
  }
  
  console.log('Creating new overlay');
  overlay = document.createElement('div');
  overlay.className = 'deepcite-claims-overlay';
  
  // Add close button
  const closeButton = document.createElement('button');
  closeButton.className = 'deepcite-overlay-close';
  closeButton.textContent = '×';
  closeButton.title = 'Toggle sidebar';
  
  // Toggle button handling
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    
    if (overlay.classList.contains('minimized')) {
      // If minimized, expand it back
      overlay.classList.remove('minimized');
      closeButton.title = 'Toggle sidebar';
    } else {
      // If expanded, minimize it
      overlay.classList.add('minimized');
      closeButton.title = 'Expand sidebar';
    }
  });
  
  // Add double-click to fully close
  closeButton.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    overlay.classList.add('closed');
    
    // Set a timeout to fully hide it after animation completes
    setTimeout(() => {
      if (overlay.classList.contains('closed')) {
        overlay.style.display = 'none';
        
        // Clean up any ephemeral UI elements when closing panel
        cleanupEphemeralElements();
      }
    }, 300); // match the CSS transition time
  });
  
  overlay.appendChild(closeButton);
  
  // Add header
  const header = document.createElement('div');
  header.className = 'deepcite-claims-header';
  header.innerHTML = `
    <h3>Detected Claims</h3>
    <small>Processing...</small>
  `;
  overlay.appendChild(header);
  
  // Make the overlay draggable using the header as the handle
  makeDraggable(overlay, header);
  
  // Add a "fully close" button at the bottom of the panel with improved styling
  const closeCompletelyButton = document.createElement('button');
  closeCompletelyButton.className = 'deepcite-close-panel-button';
  closeCompletelyButton.textContent = 'Close Panel';
  
  closeCompletelyButton.addEventListener('click', () => {
    overlay.classList.add('closed');
    
    // Set a timeout to fully hide it after animation completes
    setTimeout(() => {
      if (overlay.classList.contains('closed')) {
        overlay.style.display = 'none';
        
        // Clean up any ephemeral UI elements when closing panel
        cleanupEphemeralElements();
      }
    }, 300); // match the CSS transition time
  });
  
  overlay.appendChild(closeCompletelyButton);
  
  document.body.appendChild(overlay);
  
  // Hide the overlay by default - will be shown via the toggle button
  overlay.style.display = 'none';
  overlay.classList.add('closed');
  
  return overlay;
}

/**
 * Helper function to make an element draggable
 * @param element The element to make draggable
 * @param handle The drag handle (usually the header)
 */
export function makeDraggable(element: HTMLElement, handle: HTMLElement) {
  let posX = 0, posY = 0, posLeft = 0, posTop = 0;
  
  const dragMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    
    // Get starting positions
    posLeft = element.offsetLeft;
    posTop = element.offsetTop;
    posX = e.clientX;
    posY = e.clientY;
    
    // Add event listeners for drag and release
    document.addEventListener('mousemove', elementDrag);
    document.addEventListener('mouseup', closeDragElement);
    
    // Add dragging class for styling
    element.classList.add('dragging');
  };
  
  const elementDrag = (e: MouseEvent) => {
    e.preventDefault();
    
    // Calculate the new position
    const dx = posX - e.clientX;
    const dy = posY - e.clientY;
    posX = e.clientX;
    posY = e.clientY;
    
    // Check if the new position would be within screen bounds
    const newTop = element.offsetTop - dy;
    const newLeft = element.offsetLeft - dx;
    
    // Stay within viewport 
    const buffer = 20; // Minimum distance from edge
    
    if (newTop >= buffer && newTop + element.offsetHeight <= window.innerHeight - buffer) {
      element.style.top = `${newTop}px`;
    }
    
    if (newLeft >= buffer && newLeft + element.offsetWidth <= window.innerWidth - buffer) {
      element.style.left = `${newLeft}px`;
    }
  };
  
  const closeDragElement = () => {
    // Stop moving when mouse button is released
    document.removeEventListener('mousemove', elementDrag);
    document.removeEventListener('mouseup', closeDragElement);
    
    // Remove dragging class
    element.classList.remove('dragging');
  };
  
  // Attach the mousedown event listener to the handle
  handle.addEventListener('mousedown', dragMouseDown);
  
  // Apply initial draggable styling
  handle.style.cursor = 'move';
  element.style.position = 'fixed';
}

/**
 * Cleans up temporary UI elements
 */
export function cleanupEphemeralElements() {
  // Remove any floating tooltips
  const tooltips = document.querySelectorAll('.exa-tooltip');
  tooltips.forEach(tooltip => tooltip.remove());
  
  // Remove any temporary status indicators
  const indicators = document.querySelectorAll('[data-temporary-indicator]');
  indicators.forEach(indicator => indicator.remove());
}

/**
 * Function to add a claim to the claims overlay
 */
export function addClaimToOverlay(overlay: HTMLElement, claim: Claim, sources: any[] = []) {
  const claimDiv = document.createElement('div');
  claimDiv.className = 'deepcite-claim-item';
  claimDiv.setAttribute('data-claim-id', claim.id.toString());
  
  // Create the basic claim information
  let claimHTML = `
    ${(claim as any).pdfLocation ? `
      <div class="pdf-claim-location">
        Page ${(claim as any).pdfLocation.pageNum}, Paragraph ${(claim as any).pdfLocation.paragraph + 1}
      </div>
    ` : ''}
    <div class="deepcite-claim-text">${claim.text}</div>
    <div class="deepcite-claim-confidence" style="${claim.confidence === undefined ? 'display: none;' : ''}">
      <span style="font-weight: bold;">Certainty:</span>
      <span class="confidence-meter" style="
        width: ${claim.confidence !== undefined ? Math.round(claim.confidence * 100) : 0}px;
        background-color: ${claim.confidence !== undefined ? getConfidenceColor(claim.confidence) : 'transparent'};
      "></span>
      <span class="confidence-text" style="color: ${claim.confidence !== undefined ? getConfidenceColor(claim.confidence) : 'inherit'}; font-weight: 500;">
        ${claim.confidence !== undefined ? Math.round(claim.confidence * 100) + '%' : ''}
      </span>
    </div>
  `;
  
  // Add the verify button if sources haven't been checked yet
  if (sources.length === 0) {
    claimHTML += `
      <button class="verify-claim-btn" data-claim-id="${claim.id}">
        Verify
      </button>
      <div class="deepcite-claim-sources" style="margin-top: 8px; display: none;">
        <!-- Sources will go here after user verifies -->
      </div>
    `;
  } else {
    // If sources are already provided, show them
    claimHTML += `
      <div class="deepcite-claim-sources" style="margin-top: 8px;">
        <div class="deepcite-claim-sources-header">Sources (${sources.length}):</div>
    `;
    
    // Add all sources to the claim or show "no sources" message
    if (sources.length === 0) {
      claimHTML += `
        <div class="deepcite-claim-source-item">
          <div class="deepcite-source-title">
            <span style="color: #666; font-style: italic;">No relevant sources found</span>
          </div>
        </div>
      `;
    } else {
      sources.forEach((source: any, index: number) => {
        // Skip "no sources" placeholder entries
        if (source.title === "No relevant sources found" || source.url === "#") {
          claimHTML += `
            <div class="deepcite-claim-source-item">
              <div class="deepcite-source-title">
                <span style="color: #666; font-style: italic;">No relevant sources found</span>
              </div>
            </div>
          `;
        } else {
          claimHTML += `
            <div class="deepcite-claim-source-item">
              <div class="deepcite-source-title">
                <a href="${source.url}" target="_blank">${source.title}</a>
                <span class="deepcite-source-confidence">(${Math.round(source.score * 100)}% confidence)</span>
              </div>
              ${source.highlights && source.highlights.length > 0 ? 
                `<div class="deepcite-source-highlight">"${source.highlights[0]}"</div>` : ''}
              ${index < sources.length - 1 ? '<hr class="deepcite-source-divider">' : ''}
            </div>
          `;
        }
      });
    }
    
    // Close the sources div
    claimHTML += `</div>`;
  }
  
  claimDiv.innerHTML = claimHTML;
  
  // Add click handler to highlight the claim text in the document
  claimDiv.addEventListener('click', (e) => {
    // Don't trigger if clicking the verify button
    if ((e.target as HTMLElement).classList.contains('verify-claim-btn')) {
      return;
    }
    
    // Find the element with the claim text and scroll to it
    const elements = document.querySelectorAll('.exa-claim-highlight');
    for (let i = 0; i < elements.length; i++) {
      const elem = elements[i];
      if (elem.textContent?.includes(claim.cleanText)) {
        elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        elem.classList.add('exa-claim-highlight-flash');
        setTimeout(() => {
          elem.classList.remove('exa-claim-highlight-flash');
        }, 1500);
        break;
      }
    }
  });
  
  overlay.appendChild(claimDiv);
}

/**
 * Set up handlers for the "Verify" buttons in the claims overlay
 */
export function setupVerifyButtonHandlers(overlay: HTMLElement, extractedClaims: Claim[]) {
  overlay.addEventListener('click', (ev) => {
    const btn = ev.target as HTMLElement;
    if (btn.classList.contains('verify-claim-btn')) {
      ev.stopPropagation(); // Prevent triggering the parent claim click event
      const claimId = btn.getAttribute('data-claim-id');
      if (!claimId) return;
      
      // Disable the button and show loading spinner
      btn.innerHTML = '<span class="exa-loading" style="margin-right: 8px;"></span>Verifying...';
      btn.setAttribute('disabled', 'true');
      btn.style.opacity = '0.8';
      btn.style.cursor = 'wait';
      
      // Find the claim in extractedClaims
      const targetClaim = extractedClaims.find(c => c.id.toString() === claimId);
      if (!targetClaim) {
        btn.textContent = 'Error';
        return;
      }
      
      // Now call Exa with that single claim
      chrome.runtime.sendMessage({
        type: 'VERIFY_CLAIM',
        claim: targetClaim
      }, (response) => {
        if (response && response.success && response.results) {
          // Show sources section
          const claimItem = btn.closest('.deepcite-claim-item') as HTMLElement;
          const sourcesDiv = claimItem?.querySelector('.deepcite-claim-sources') as HTMLElement;
          
          if (sourcesDiv) {
            // Update the sources div
            updateClaimSources(claimId, response.results, sourcesDiv, extractedClaims);
            sourcesDiv.style.display = 'block';
          }
          
          // Remove the verify button
          btn.remove();
        } else if (response && response.error === 'DAILY_LIMIT_REACHED') {
          // Handle daily limit reached error
          const claimItem = btn.closest('.deepcite-claim-item') as HTMLElement;
          const sourcesDiv = claimItem?.querySelector('.deepcite-claim-sources') as HTMLElement;
          
          if (sourcesDiv) {
            sourcesDiv.style.display = 'block';
            sourcesDiv.innerHTML = `
              <div style="color: #dc3545; padding: 10px; background: rgba(220, 53, 69, 0.1); border-radius: 6px; margin-top: 10px;">
                <strong>⚠️ ${response.message}</strong>
                <div style="margin-top: 5px; font-size: 14px;">
                  You can adjust limits in the extension options.
                </div>
              </div>
            `;
          }
          
          // Update button to show options
          btn.textContent = 'Options';
          btn.removeAttribute('disabled');
          btn.style.opacity = '1';
          btn.style.cursor = 'pointer';
          
          // Change button to open options page when clicked
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.openOptionsPage();
          }, { once: true });
        } else {
          // Show general error state
          btn.textContent = 'Retry';
          btn.removeAttribute('disabled');
          btn.style.opacity = '1';
          btn.style.cursor = 'pointer';
          
          // Show error message
          const claimItem = btn.closest('.deepcite-claim-item') as HTMLElement;
          const sourcesDiv = claimItem?.querySelector('.deepcite-claim-sources') as HTMLElement;
          
          if (sourcesDiv) {
            sourcesDiv.style.display = 'block';
            sourcesDiv.innerHTML = `
              <div style="color: #666; font-style: italic; padding: 10px;">
                No sources could be found. Please try again later.
              </div>
            `;
          }
        }
      });
    }
  });
}

/**
 * Update the sources section for a claim
 */
export function updateClaimSources(claimId: string, sources: any[], sourcesDiv: HTMLElement, extractedClaims: Claim[]) {
  if (!sources.length) {
    sourcesDiv.innerHTML = '<div class="deepcite-claim-sources-header">Sources:</div><em>No sources found</em>';
    return;
  }
  
  // Find the claim to update its confidence
  const targetClaim = extractedClaims.find(c => c.id.toString() === claimId);
  if (targetClaim) {
    // Calculate final confidence based on sources
    // Simple approach: use the highest source score as confidence
    const bestSourceScore = Math.max(...sources.map(s => s.score || 0));
    // Only set confidence if we have valid sources with scores
    if (bestSourceScore > 0) {
      targetClaim.confidence = bestSourceScore;
      
      // Find the claim element to update the confidence meter
      const claimItem = sourcesDiv.closest('.deepcite-claim-item') as HTMLElement;
      const confidenceContainer = claimItem?.querySelector('.deepcite-claim-confidence') as HTMLElement;
      const confidenceMeter = claimItem?.querySelector('.confidence-meter') as HTMLElement;
      const confidenceText = claimItem?.querySelector('.confidence-text') as HTMLElement;
      
      if (confidenceContainer && confidenceMeter && confidenceText) {
        // Show the confidence container if it was hidden
        confidenceContainer.style.display = 'block';
        
        // Animate from 0 to final confidence
        confidenceMeter.style.width = '0px'; // Start from zero
        confidenceMeter.style.transition = 'none'; // Reset transition
        // Force a reflow
        confidenceMeter.offsetWidth;
        
        // First set the color for the text
        if (targetClaim.confidence !== undefined) {
          confidenceText.textContent = Math.round(targetClaim.confidence * 100) + '%';
          confidenceText.style.color = getConfidenceColor(targetClaim.confidence);
        }
        
        // Then animate width with a slight delay for better visual effect
        setTimeout(() => {
          if (targetClaim.confidence !== undefined) {
            confidenceMeter.style.transition = 'width 1s ease-out';
            confidenceMeter.style.backgroundColor = getConfidenceColor(targetClaim.confidence);
            confidenceMeter.style.width = Math.round(targetClaim.confidence * 100) + 'px';
          }
        }, 50);
      }
    }
  }
  
  let html = `<div class="deepcite-claim-sources-header">Sources (${sources.length}):</div>`;
  sources.forEach((source, index) => {
    if (source.title === "No relevant sources found" || source.url === "#") {
      html += `
        <div class="deepcite-claim-source-item">
          <div class="deepcite-source-title">
            <span style="color: #666; font-style: italic;">No relevant sources found</span>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="deepcite-claim-source-item">
          <div class="deepcite-source-title">
            <a href="${source.url}" target="_blank">${source.title}</a>
            <span class="deepcite-source-confidence">(${Math.round(source.score * 100)}% confidence)</span>
          </div>
          ${source.highlights && source.highlights.length > 0 ? 
            `<div class="deepcite-source-highlight">"${source.highlights[0]}"</div>` : ''}
          ${index < sources.length - 1 ? '<hr class="deepcite-source-divider">' : ''}
        </div>
      `;
    }
  });
  sourcesDiv.innerHTML = html;
}
