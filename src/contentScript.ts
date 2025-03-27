// Import using path aliases
import { ContentExtractor, Claim, ClaimDetectionResult } from '@extractors/contentExtractor';
import { LLMExtractor, LLMExtractionResult } from '@extractors/llmExtractor';
import { PDFHandler, PDFPageContent, PDFTextItem, StoredTextItem } from '@handlers/pdfHandler';
import { 
  getConfidenceColor, 
  createDeepCiteBadge, 
  highlightClaim, 
  addStylesheet,
  createSidebarToggle,
  createClaimsOverlay,
  makeDraggable,
  cleanupEphemeralElements,
  addClaimToOverlay,
  setupVerifyButtonHandlers,
  updateClaimSources
} from '@handlers/webPageHandler';

// Declare PDF.js types
declare const pdfjsLib: {
  getDocument: (url: string) => { promise: Promise<any> };
  GlobalWorkerOptions: { workerSrc: string };
};

// Global variable to store all discovered claims
let extractedClaims: Claim[] = [];

// Add stylesheet immediately
addStylesheet();

/**
 * Check if current page is a PDF
 */
async function isPDF(): Promise<boolean> {
  return document.contentType === 'application/pdf' || 
         window.location.pathname.toLowerCase().endsWith('.pdf');
}

/**
 * Analyze PDF document for claims
 * @param openaiKey OpenAI API key for LLM extraction
 * @param useLLMExtraction Whether to use LLM-based extraction
 */
async function analyzePDF(openaiKey: string, useLLMExtraction: boolean = true) {
  const overlay = await createClaimsOverlay(true); // Using imported function from webPageHandler
  
  // Get the Exa API key from storage
  const { exaKey } = await new Promise<{exaKey: string}>(resolve => {
    chrome.storage.local.get(['exaKey'], (result) => resolve(result as {exaKey: string}));
  });
  
  // Check for missing API keys
  if (!exaKey || exaKey === '') {
    console.error('Exa API key is missing');
    
    // Update the overlay to show an error
    const header = overlay.querySelector('.deepcite-claims-header small');
    if (header) {
      header.textContent = 'API key missing. Please set in options.';
    }
    
    // Add an error message to the overlay
    const errorDiv = document.createElement('div');
    errorDiv.className = 'deepcite-claim-item';
    errorDiv.innerHTML = `
      <div class="deepcite-claim-text" style="color: #dc3545; text-align: center; padding: 15px;">
        Exa API key is missing. Please set it in the extension options.
      </div>
      <button id="open-options-btn" style="margin: 10px auto; display: block; padding: 8px 16px; background: #f8f9fa; border: 1px solid #eee; color: #333; cursor: pointer; border-radius: 6px;">
        Open Options
      </button>
    `;
    
    overlay.appendChild(errorDiv);
    
    // Add click handler for the options button
    const optionsBtn = errorDiv.querySelector('#open-options-btn');
    if (optionsBtn) {
      optionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }
    
    return;
  }
  
  // Create a temporary status indicator for analysis
  const statusIndicator = document.createElement('div');
  statusIndicator.setAttribute('data-temporary-indicator', 'true');
  statusIndicator.style.position = 'fixed';
  statusIndicator.style.top = '20px';
  statusIndicator.style.right = '20px';
  statusIndicator.style.padding = '12px 16px';
  statusIndicator.style.backgroundColor = 'var(--primary-color)';
  statusIndicator.style.color = 'white';
  statusIndicator.style.zIndex = '99999';
  statusIndicator.style.borderRadius = 'var(--border-radius-md)';
  statusIndicator.style.fontWeight = 'bold';
  statusIndicator.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  statusIndicator.style.transition = 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
  statusIndicator.style.fontFamily = 'var(--font-family)';
  statusIndicator.style.fontSize = '14px';
  statusIndicator.style.display = 'flex';
  statusIndicator.style.alignItems = 'center';
  statusIndicator.style.opacity = '0';
  statusIndicator.style.transform = 'translateY(-10px)';
  statusIndicator.innerHTML = '<span style="margin-right: 8px; font-size: 16px;">📄</span> Analyzing PDF...';
  document.body.appendChild(statusIndicator);
  
  // Animate in
  setTimeout(() => {
    statusIndicator.style.opacity = '1';
    statusIndicator.style.transform = 'translateY(0)';
  }, 10);
  
  try {
    const pdfHandler = new PDFHandler(window.location.href);
    await pdfHandler.init();
    const content = await pdfHandler.getAllContent();
    
    let useAI = false;
    
    // Try to use LLM extraction if OpenAI key is available and LLM extraction is enabled
    if (openaiKey && openaiKey !== '' && useLLMExtraction) {
      try {
        console.log('Testing LLM extraction for PDF...');
        const llmExtractor = new LLMExtractor(openaiKey);
        const testResult = await llmExtractor.extractClaimsFromChunk("This is a test claim.");
        
        if (testResult && testResult.claims.length > 0) {
          console.log('LLM extraction successful, will use it for PDF content');
          useAI = true;
          
          // Add a temporary indicator showing which extraction mode is used
          const extractionIndicator = document.createElement('div');
          extractionIndicator.setAttribute('data-temporary-indicator', 'true');
          extractionIndicator.style.position = 'fixed';
          extractionIndicator.style.bottom = '20px';
          extractionIndicator.style.right = '20px';
          extractionIndicator.style.padding = '8px 12px';
          extractionIndicator.style.backgroundColor = 'rgba(47, 128, 237, 0.8)';
          extractionIndicator.style.color = 'white';
          extractionIndicator.style.zIndex = '99998';
          extractionIndicator.style.borderRadius = 'var(--border-radius-md)';
          extractionIndicator.style.fontWeight = '500';
          extractionIndicator.style.fontSize = '13px';
          extractionIndicator.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          extractionIndicator.style.fontFamily = 'var(--font-family)';
          extractionIndicator.innerHTML = '🧠 Using AI Extraction';
          document.body.appendChild(extractionIndicator);
          
          // Automatically remove after 5 seconds
          setTimeout(() => extractionIndicator.remove(), 5000);
          
          // Process full content with LLM extraction
          const fullResults = await llmExtractor.extractClaims(content);
          
          if (fullResults && fullResults.claims.length > 0) {
            // Add context information to each claim
            const claims = fullResults.claims.map((text, index) => ({
              id: index + 1,
              text,
              cleanText: text.replace(/\[\d+\]/g, ''), // Remove reference numbers if present
              context: {
                page: 1, // We'll update this later
                paragraph: 0
              },
              relevance: 0.8, // Default high relevance since LLM already filtered
              confidence: undefined // Will be set during verification
            }));
            
            // Update the header of the overlay
            const header = overlay.querySelector('.deepcite-claims-header small');
            if (header) {
              header.textContent = `${claims.length} claims found (AI-based)`;
            }
            
            // Process the claims
            processPDFClaims(claims, pdfHandler, overlay);
          } else {
            console.log('LLM extraction returned no claims, falling back to rule-based');
            useAI = false;
          }
        } else {
          console.log('LLM test failed, falling back to rule-based extraction');
        }
      } catch (error) {
        console.error('LLM extraction failed, using rule-based approach:', error);
        useAI = false;
      }
    } else {
      if (useLLMExtraction && (!openaiKey || openaiKey === '')) {
        console.log('LLM extraction enabled but OpenAI key missing, using rule-based extraction');
      } else {
        console.log('Using rule-based extraction (LLM extraction disabled in settings)');
      }
    }
    
    // Use rule-based approach if LLM failed or wasn't attempted
    if (!useAI) {
      console.log('Using rule-based extraction for PDF');
      
      // Add a temporary indicator showing which extraction mode is used
      const extractionIndicator = document.createElement('div');
      extractionIndicator.setAttribute('data-temporary-indicator', 'true');
      extractionIndicator.style.position = 'fixed';
      extractionIndicator.style.bottom = '20px';
      extractionIndicator.style.right = '20px';
      extractionIndicator.style.padding = '8px 12px';
      extractionIndicator.style.backgroundColor = 'rgba(100, 100, 100, 0.8)';
      extractionIndicator.style.color = 'white';
      extractionIndicator.style.zIndex = '99998';
      extractionIndicator.style.borderRadius = 'var(--border-radius-md)';
      extractionIndicator.style.fontWeight = '500';
      extractionIndicator.style.fontSize = '13px';
      extractionIndicator.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      extractionIndicator.style.fontFamily = 'var(--font-family)';
      extractionIndicator.innerHTML = '📊 Using Rule-Based Extraction';
      document.body.appendChild(extractionIndicator);
      
      // Automatically remove after 5 seconds
      setTimeout(() => extractionIndicator.remove(), 5000);
      
      const extractor = new ContentExtractor();
      const extractionResult = await extractor.extractClaims(10);
      
      // Don't set default confidence scores - they'll be set during verification
      for (const claim of extractionResult.claims) {
        claim.confidence = undefined; // Will be set during verification
      }
      
      // Update the header of the overlay
      const header = overlay.querySelector('.deepcite-claims-header small');
      if (header) {
        header.textContent = `${extractionResult.claims.length} claims found (rule-based)`;
      }
      
      processPDFClaims(extractionResult.claims, pdfHandler, overlay);
    }
    
    // Update status indicator to show completion
    statusIndicator.innerHTML = '<span style="margin-right: 8px; font-size: 16px;">✓</span> PDF Analysis Complete';
    
  } catch (error) {
    console.error('PDF analysis failed:', error);
    
    // Update status indicator to show error
    statusIndicator.style.backgroundColor = '#dc3545';
    statusIndicator.innerHTML = '<span style="margin-right: 8px; font-size: 16px;">❌</span> PDF Analysis Failed';
  }
  
  // Remove status indicator after animation
  setTimeout(() => {
    statusIndicator.style.opacity = '0';
    statusIndicator.style.transform = 'translateY(-10px)';
    setTimeout(() => statusIndicator.remove(), 500);
  }, 5000);
}

/**
 * Process PDF claims
 * @param claims Claims extracted from the PDF
 * @param pdfHandler PDF handler instance
 * @param overlay Claims overlay element
 */
async function processPDFClaims(claims: Claim[], pdfHandler: PDFHandler, overlay: HTMLElement) {
  // Store the PDF claims globally to access from verify button handlers
  extractedClaims = [];
  
  // Sort claims by confidence for better presentation
  const sortedClaims = [...claims].sort((a, b) => {
    const confA = a.confidence !== undefined ? a.confidence : 0;
    const confB = b.confidence !== undefined ? b.confidence : 0;
    return confB - confA; // Sort in descending order
  });
  
  // Apply more strict filtering for PDF claims
  for (const claim of sortedClaims) {
    // Skip claims with low fact certainty (increased threshold)
    if (claim.confidence !== undefined && claim.confidence < 0.65) {
      console.log(`Skipping low confidence claim (${claim.confidence}): ${claim.text.substring(0, 50)}...`);
      continue;
    }
    
    // Skip claims that have subjective language patterns
    if (/\b(I think|I believe|in my opinion|we feel|might be|may be|probably|possibly|maybe|perhaps|could be|allegedly)\b/i.test(claim.text)) {
      console.log(`Skipping subjective claim: ${claim.text.substring(0, 50)}...`);
      continue;
    }
    
    // Find location in PDF to add to claim data
    const location = pdfHandler.findTextLocation(claim.cleanText);
    const pdfClaim = {...claim, pdfLocation: location};
    
    // Add to our global claims collection
    extractedClaims.push(pdfClaim);
    
    // Add to the overlay with the verify button
    addClaimToOverlay(overlay, pdfClaim);
    
    // For PDFs, override the click handler to navigate to the page
    const claimItem = overlay.querySelector(`.deepcite-claim-item[data-claim-id="${pdfClaim.id}"]`);
    if (claimItem && location) {
      claimItem.addEventListener('click', (e) => {
        // Don't navigate if clicking the verify button
        if ((e.target as HTMLElement).classList.contains('verify-claim-btn')) {
          return;
        }
        
        // Most PDF viewers support #page=N for navigation
        window.location.hash = `#page=${location.pageNum}`;
      });
    }
  }
  
  // Set up the verify button handlers
  // Use the imported function from webPageHandler
  setupVerifyButtonHandlers(overlay, extractedClaims);
  
  // Ensure the overlay is visible
  overlay.classList.remove('closed', 'minimized');
  overlay.style.display = 'block';
}

// Main initialization
chrome.storage.local.get(['openaiKey', 'exaKey', 'highlightsEnabled', 'useLLMExtraction'], async (result) => {
  // Log the key availability and settings (but not the actual value for security)
  console.log('OpenAI key available:', !!result.openaiKey && result.openaiKey !== '');
  console.log('Exa key available:', !!result.exaKey && result.exaKey !== '');
  console.log('Highlights enabled:', result.highlightsEnabled !== false); // Default to true if undefined
  console.log('Using LLM extraction:', result.useLLMExtraction === true && !!result.openaiKey);
  
  // Create the overlay ahead of time (it will remain hidden)
  const isPdfPage = await isPDF();
  await createClaimsOverlay(isPdfPage);
  
  // Create the sidebar toggle button (which replaces the analyze buttons)
  // Using imported function from webPageHandler
  const toggleBtn = createSidebarToggle();
  
  // Add click handler to the toggle button
  toggleBtn.addEventListener('click', () => {
    // First check if we need to run the analysis
    const hasRunAnalysis = toggleBtn.getAttribute('data-analysis-run') === 'true';
    const overlay = document.querySelector('.deepcite-claims-overlay') as HTMLElement;
    
    if (!hasRunAnalysis) {
      // If analysis hasn't been run yet, run it
      toggleBtn.setAttribute('data-analysis-run', 'true');
      toggleBtn.textContent = '⟳'; // Loading indicator
      toggleBtn.style.opacity = '0.8';
      
      // Run the appropriate analysis based on content type
      if (document.contentType === 'application/pdf' || 
          window.location.pathname.toLowerCase().endsWith('.pdf')) {
        // For PDFs
        chrome.storage.local.get(['openaiKey', 'useLLMExtraction'], result => {
          analyzePDF(result.openaiKey, result.useLLMExtraction);
          // After analysis complete
          toggleBtn.textContent = '»';
          toggleBtn.style.opacity = '1';
        });
      } else {
        // For web pages
        chrome.storage.local.get(['openaiKey', 'useLLMExtraction'], async (result) => {
          // Use Content Extractor to get main content
          const extractor = new ContentExtractor();
          await runExtraction(extractor, result.openaiKey, result.useLLMExtraction);
          // After analysis complete
          toggleBtn.textContent = '»';
          toggleBtn.style.opacity = '1';
        });
      }
    }
    
    // Toggle overlay visibility with improved animation
    if (overlay) {
      if (overlay.classList.contains('closed') || overlay.style.display === 'none') {
        // First display the overlay but keep it closed
        overlay.style.display = 'block';
        
        // Force a reflow to ensure the transition works
        overlay.offsetHeight;
        
        // Now remove classes to trigger animation
        setTimeout(() => {
          overlay.classList.remove('closed', 'minimized');
          toggleBtn.textContent = '«'; // Change arrow direction
        }, 10);
      } else {
        if (overlay.classList.contains('minimized')) {
          // If minimized, expand it
          overlay.classList.remove('minimized');
          toggleBtn.textContent = '«';
        } else {
          // If expanded, minimize it
          overlay.classList.add('minimized');
          toggleBtn.textContent = '»';
        }
      }
    }
  });
  
  // Check for missing API keys - we'll handle this when the toggle is clicked
  if (!result.exaKey || result.exaKey === '') {
    console.warn('Exa API key is missing');
    
    // We'll still show the button, but it will display an error when clicked
    toggleBtn.title = 'DeepCite (API key missing)';
    toggleBtn.style.backgroundColor = '#dc3545'; // Red to indicate error
    
    // Add an alert message to the sidebar about missing API key
    const overlay = document.querySelector('.deepcite-claims-overlay') as HTMLElement;
    if (overlay) {
      const apiErrorDiv = document.createElement('div');
      apiErrorDiv.className = 'deepcite-claim-item';
      apiErrorDiv.innerHTML = `
        <div style="color: #dc3545; padding: 15px; background: rgba(220, 53, 69, 0.1); border-radius: 6px; text-align: center;">
          <span style="font-size: 24px; display: block; margin-bottom: 10px;">⚠️</span>
          <strong>Exa API Key Missing</strong>
          <p style="margin: 10px 0; font-size: 14px;">
            DeepCite requires an Exa API key to verify claims. Please add your key in the options page.
          </p>
          <button id="open-options-btn" style="margin: 10px auto; display: block; padding: 8px 16px; background: #f8f9fa; border: 1px solid #eee; color: #333; cursor: pointer; border-radius: 6px;">
            Open Options
          </button>
        </div>
      `;
      
      overlay.insertBefore(apiErrorDiv, overlay.querySelector('.deepcite-claim-item'));
      
      // Add click handler for the options button
      const optionsBtn = apiErrorDiv.querySelector('#open-options-btn');
      if (optionsBtn) {
        optionsBtn.addEventListener('click', () => {
          chrome.runtime.openOptionsPage();
        });
      }
    }
  }
});

/**
 * Run the extraction process for web pages
 * @param extractor The ContentExtractor instance
 * @param openaiKey Optional OpenAI API key for LLM extraction
 * @param useLLMExtraction Whether to use LLM-based extraction
 */
async function runExtraction(extractor: ContentExtractor, openaiKey: string = '', useLLMExtraction: boolean = false) {
  console.log('Running extraction, LLM enabled:', useLLMExtraction && !!openaiKey);
  
  // Show which extraction mode is being used
  const extractionMode = (useLLMExtraction && !!openaiKey) ? 
    { text: '🧠 Using AI Extraction', color: 'rgba(47, 128, 237, 0.8)' } : 
    { text: '📊 Using Rule-Based Extraction', color: 'rgba(100, 100, 100, 0.8)' };
    
  // Add a temporary indicator showing the extraction mode
  const extractionIndicator = document.createElement('div');
  extractionIndicator.setAttribute('data-temporary-indicator', 'true');
  extractionIndicator.style.position = 'fixed';
  extractionIndicator.style.bottom = '20px';
  extractionIndicator.style.right = '20px';
  extractionIndicator.style.padding = '8px 12px';
  extractionIndicator.style.backgroundColor = extractionMode.color;
  extractionIndicator.style.color = 'white';
  extractionIndicator.style.zIndex = '99998';
  extractionIndicator.style.borderRadius = 'var(--border-radius-md)';
  extractionIndicator.style.fontWeight = '500';
  extractionIndicator.style.fontSize = '13px';
  extractionIndicator.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  extractionIndicator.style.fontFamily = 'var(--font-family)';
  extractionIndicator.innerHTML = extractionMode.text;
  document.body.appendChild(extractionIndicator);
  
  // Automatically remove after 5 seconds
  setTimeout(() => extractionIndicator.remove(), 5000);
  
  // Create a temporary status indicator
  const statusIndicator = document.createElement('div');
  statusIndicator.setAttribute('data-temporary-indicator', 'true');
  statusIndicator.style.position = 'fixed';
  statusIndicator.style.top = '20px';
  statusIndicator.style.right = '20px';
  statusIndicator.style.padding = '12px 16px';
  statusIndicator.style.backgroundColor = 'var(--primary-color)';
  statusIndicator.style.color = 'white';
  statusIndicator.style.zIndex = '99999';
  statusIndicator.style.borderRadius = 'var(--border-radius-md)';
  statusIndicator.style.fontWeight = 'bold';
  statusIndicator.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  statusIndicator.style.transition = 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
  statusIndicator.style.fontFamily = 'var(--font-family)';
  statusIndicator.style.fontSize = '14px';
  statusIndicator.style.display = 'flex';
  statusIndicator.style.alignItems = 'center';
  statusIndicator.style.opacity = '0';
  statusIndicator.style.transform = 'translateY(-10px)';
  statusIndicator.innerHTML = '<span style="margin-right: 8px; font-size: 16px;">🔍</span> DeepCite Analysis Active';
  document.body.appendChild(statusIndicator);
  
  // Animate in
  setTimeout(() => {
    statusIndicator.style.opacity = '1';
    statusIndicator.style.transform = 'translateY(0)';
  }, 10);
  
  // Remove status indicator after 5 seconds with animation
  setTimeout(() => {
    statusIndicator.style.opacity = '0';
    statusIndicator.style.transform = 'translateY(-10px)';
    setTimeout(() => statusIndicator.remove(), 500);
  }, 5000);
  
  // Find potential factual paragraphs to highlight
  const allParagraphs = document.querySelectorAll('p');
  const candidateParagraphs: HTMLElement[] = [];
  
  // Look for paragraphs that might contain factual claims
  for (let i = 0; i < allParagraphs.length; i++) {
    const p = allParagraphs[i] as HTMLElement;
    if (p.textContent && p.textContent.length > 80) {
      // Try to detect if this paragraph has factual content
      const text = p.textContent.toLowerCase();
      
      // Skip paragraphs with primarily subjective content
      const hasSubjectiveIndicators = /(I think|I believe|in my opinion|we feel|might be|may be|probably|possibly|maybe|perhaps|could be|allegedly)/i.test(text);
      const hasEmotionalLanguage = /(beautiful|ugly|wonderful|terrible|best|worst|amazing|awful|good|bad|love|hate|favorite)/i.test(text);
      
      if (hasSubjectiveIndicators && hasEmotionalLanguage) {
        continue; // Skip this paragraph
      }
      
      const hasNumbers = /\d/.test(text);
      const hasProperNouns = /\s[A-Z][a-z]+/.test(p.textContent);
      
      // Enhanced fact indicators with stronger emphasis on verifiable sources
      const hasFactIndicators = /(study|research|found|showed|according to|evidence|data|results|published|journal|measure|observe|statistic|percent|survey|experiment)/i.test(text);
      
      // Require more evidence for a paragraph to be considered factual
      if ((hasNumbers || (hasProperNouns && !hasSubjectiveIndicators)) && hasFactIndicators) {
        candidateParagraphs.push(p);
      }
    }
  }
  
  // Highlight up to 2 paragraphs maximum
  const paragraphsToHighlight = candidateParagraphs.slice(0, Math.min(2, candidateParagraphs.length));
  
  paragraphsToHighlight.forEach(p => {
    // Skip already marked paragraphs
    if (p.querySelector('.deepcite-badge') || p.getAttribute('data-claim-id')) {
      console.log('Paragraph already has a DEEPCITE badge, skipping');
      return;
    }
    
    // Create a wrapper around the paragraph to allow removal
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.backgroundColor = 'rgba(47, 128, 237, 0.15)';
    wrapper.style.borderLeft = '3px solid rgba(47, 128, 237, 0.5)';
    wrapper.style.padding = '8px';
    wrapper.style.borderRadius = '3px';
    wrapper.style.marginBottom = '10px';
    wrapper.style.transition = 'all 0.3s ease';
    
    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '5px';
    closeBtn.style.right = '5px';
    closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    closeBtn.style.color = '#666';
    closeBtn.style.border = 'none';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.width = '20px';
    closeBtn.style.height = '20px';
    closeBtn.style.fontSize = '12px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.textContent = '×';
    closeBtn.title = 'Remove highlight';
    
    // Add a consistent DEEPCITE badge
    const tagSpan = createDeepCiteBadge();
    tagSpan.style.marginBottom = '8px';
    tagSpan.style.marginLeft = '0';
    
    // Clone the paragraph
    const pClone = p.cloneNode(true) as HTMLElement;
    
    // Add event listeners
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrapper.style.opacity = '0';
      setTimeout(() => wrapper.remove(), 300);
    });
    
    // Append everything
    wrapper.appendChild(closeBtn);
    wrapper.appendChild(tagSpan);
    wrapper.appendChild(pClone);
    
    // Replace the original paragraph with our wrapped version
    p.style.display = 'none'; // Hide original but keep in DOM for structure
    p.parentNode?.insertBefore(wrapper, p.nextSibling);
    
    // Auto-remove after 30 seconds if not interacted with
    setTimeout(() => {
      if (document.body.contains(wrapper)) {
        wrapper.style.opacity = '0';
        setTimeout(() => {
          if (document.body.contains(wrapper)) {
            wrapper.remove();
            p.style.display = ''; // Restore original paragraph
          }
        }, 300);
      }
    }, 30000);
  });
  
  // If no paragraphs were found, don't leave the user confused
  if (paragraphsToHighlight.length === 0) {
    console.log('No factual paragraphs detected for demonstration');
  }
  
  // Determine whether to use AI-based extraction
  let result;
  
  if (useLLMExtraction && openaiKey && openaiKey !== '') {
    try {
      console.log('Attempting LLM-based claim extraction for web page');
      const llmExtractor = new LLMExtractor(openaiKey);
      
      // Get the main content from the page
      const contentBlocks = extractor.getMainContent();
      const content = contentBlocks.join('\n\n');
      
      // Use LLM to extract claims
      const llmResults = await llmExtractor.extractClaims(content);
      
      if (llmResults && llmResults.claims.length > 0) {
        console.log('LLM extraction successful, found claims:', llmResults.claims.length);
        
        // Convert LLM results to our Claim format
        const claims = llmResults.claims.map((text, index) => ({
          id: index + 1,
          text,
          cleanText: text.replace(/\[\d+\]/g, ''), // Remove reference numbers if present
          context: {
            page: 1,
            paragraph: 0
          },
          relevance: 0.8, // Default high relevance since LLM already filtered
          confidence: undefined // Will be set during verification
        }));
        
        result = { claims, totalProcessed: contentBlocks.length };
      } else {
        console.log('LLM extraction returned no claims, falling back to rule-based');
        result = await extractor.extractClaims(10);
      }
    } catch (error) {
      console.error('LLM extraction failed, using rule-based approach:', error);
      result = await extractor.extractClaims(10);
    }
  } else {
    // Use rule-based approach
    console.log('Using rule-based claim extraction for web page');
    result = await extractor.extractClaims(10); // Increase to 10 claims for better results
  }
  
  // Store claims globally for later access by verify buttons
  extractedClaims = result.claims;
  
  console.log('Extraction found claims:', result.claims.length);
  
  // Create claims overlay
  const overlay = await createClaimsOverlay(false);
  overlay.style.display = 'block';
  
  if (result.claims.length > 0) {
    const header = overlay.querySelector('.deepcite-claims-header small');
    if (header) {
      const extractionMethod = (useLLMExtraction && openaiKey && openaiKey !== '') ? 'AI-based' : 'rule-based';
      header.textContent = `${result.claims.length} claims found (${extractionMethod})`;
    }
    
    // Process each claim
    for (const claim of result.claims) {
      // Add a default confidence score if one isn't present
      claim.confidence = undefined; // Will be set during verification
      
      // Try to highlight the claim in the text
      highlightClaim(claim, []);
      
      // Add the claim to overlay with a verify button (not sources yet)
      addClaimToOverlay(overlay, claim);
    }
    
    // Set up the verify button handlers
    // Use the imported function from webPageHandler
    setupVerifyButtonHandlers(overlay, extractedClaims);
    
    // Ensure overlay is visible
    overlay.classList.remove('closed', 'minimized');
    overlay.style.display = 'block';
  } else {
    // If no claims were found, display a clear message
    const header = overlay.querySelector('.deepcite-claims-header small');
    if (header) {
      header.textContent = `No claims found on this page`;
    }
    
    // Add a single "no claims found" message to the overlay
    const noClaimsDiv = document.createElement('div');
    noClaimsDiv.className = 'deepcite-claim-item';
    noClaimsDiv.innerHTML = `
      <div class="deepcite-claim-text" style="text-align: center; padding: 15px;">
        No factual claims were detected on this page.
      </div>
    `;
    overlay.appendChild(noClaimsDiv);
    
    // Ensure overlay is visible
    overlay.classList.remove('closed', 'minimized');
    overlay.style.display = 'block';
  }
}