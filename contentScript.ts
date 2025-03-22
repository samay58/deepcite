// Declare PDF.js types
declare const pdfjsLib: {
  getDocument: (url: string) => { promise: Promise<any> };
  GlobalWorkerOptions: { workerSrc: string };
};

// Global variable to store all discovered claims
let extractedClaims: Claim[] = [];

// We'll use our own LLMExtractionResult interface and directly reference the LLMExtractor class
// from llmExtractor.ts (which will be loaded via script tag in manifest.json)
interface LLMExtractionResult {
  claims: string[];
  confidence: number[];
}

// No need to redeclare LLMExtractor here since it will be loaded from llmExtractor.js

// Define types inline since we can't use modules in content scripts
interface Claim {
  id: number;
  text: string;
  cleanText: string;
  context: {
    page: number;
    paragraph: number;
  };
  relevance: number;
  confidence?: number; // Added confidence score from LLM
}

interface ClaimDetectionResult {
  claims: Claim[];
  totalProcessed: number;
}

// PDF handling types and class
interface PDFPageContent {
  text: string;
  viewport: any;
  pageNum: number;
}

interface PDFTextItem {
  str: string;
  transform: number[];
  pageNum?: number;
  paragraph?: number;
}

interface StoredTextItem {
  str: string;
  pageNum: number;
  paragraph: number;
}

class PDFHandler {
  private url: string;
  private pdfDoc: any = null;
  private textItems: StoredTextItem[] = [];
  
  constructor(url: string) {
    this.url = url;
    // @ts-ignore
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
  }

  async init(): Promise<void> {
    try {
      // @ts-ignore
      const loadingTask = pdfjsLib.getDocument(this.url);
      this.pdfDoc = await loadingTask.promise;
    } catch (error) {
      console.error('Error loading PDF:', error);
      throw error;
    }
  }

  async getPageContent(pageNum: number): Promise<PDFPageContent> {
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    
    let currentParagraph = 0;
    let lastY: number | undefined;
    
    textContent.items.forEach((item: PDFTextItem) => {
      if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > 15) {
        currentParagraph++;
      }
      lastY = item.transform[5];
      
      this.textItems.push({
        str: item.str,
        pageNum,
        paragraph: currentParagraph
      });
    });

    const text = textContent.items.map((item: PDFTextItem) => item.str).join(' ');
    return { text, viewport, pageNum };
  }

  async getAllContent(): Promise<string> {
    const numPages = this.pdfDoc.numPages;
    const pageTexts: string[] = [];

    for (let i = 1; i <= numPages; i++) {
      const { text } = await this.getPageContent(i);
      pageTexts.push(text);
    }

    return pageTexts.join('\n\n');
  }

  findTextLocation(text: string): StoredTextItem | null {
    for (let i = 0; i < this.textItems.length; i++) {
      const windowSize = 100;
      const chunk = this.textItems.slice(i, i + windowSize)
        .map(item => item.str)
        .join(' ');
      
      if (chunk.includes(text)) {
        return this.textItems[i];
      }
    }
    return null;
  }
}

/**
 * Extracts and processes factual claims from webpage content
 * This class uses rule-based heuristics to identify claims
 * It serves as a fallback when LLM-based extraction is unavailable
 */
class ContentExtractor {
  private claimCounter = 0;

  /**
   * Get main content from webpage, excluding navigation, footers, etc.
   * Focuses on paragraphs with substantive content by filtering out
   * short text elements that are likely UI components
   */
  public getMainContent(): string[] {
    console.log('Getting main content from webpage');
    
    // Get all text-containing elements
    const allElements = document.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, article, section, div');
    console.log(`Found ${allElements.length} potential text elements`);
    
    // Filter to elements that likely contain substantive content
    const contentElements = Array.from(allElements).filter(el => {
      const text = el.textContent || '';
      
      // Skip elements with very little text
      if (text.length < 30) return false;
      
      // Skip elements that are likely navigation, headers, footers, etc.
      const tagName = el.tagName.toLowerCase();
      if (tagName === 'div') {
        // Only include divs that are likely content containers, not layout divs
        // Check for content characteristics
        const hasEnoughText = text.length > 100;
        const hasSentences = text.split('.').length > 2;
        const hasParagraphChild = el.querySelector('p') !== null;
        
        return hasEnoughText && hasSentences && !hasParagraphChild;
      }
      
      // Accept paragraph and article elements by default
      return true;
    });
    
    console.log(`Filtered down to ${contentElements.length} content elements`);
    
    // Tag elements for easier identification later
    contentElements.forEach((el, index) => {
      if (!el.getAttribute('data-deepcite-id')) {
        el.setAttribute('data-deepcite-id', `content-${index}`);
        
        // Add a subtle border to help visualize what's being analyzed
        (el as HTMLElement).style.border = '1px dashed rgba(47, 128, 237, 0.3)';
      }
    });
    
    // Extract text from these elements
    const contentTexts = contentElements
      .map(el => el.textContent as string)
      .filter(text => text.length > 30);
    
    // Also always include paragraph elements as a fallback
    const paragraphs = Array.from(document.getElementsByTagName('p'))
      .filter(p => p.textContent && p.textContent.length > 50)
      .map(p => p.textContent as string);
    
    // Combine and deduplicate manually instead of using Set
    const allTexts = [...contentTexts, ...paragraphs];
    const uniqueTexts: string[] = [];
    
    for (const text of allTexts) {
      if (!uniqueTexts.includes(text)) {
        uniqueTexts.push(text);
      }
    }
    
    console.log(`Final content extraction: ${uniqueTexts.length} text blocks`);
    return uniqueTexts;
  }

  /**
   * Enhanced claim detection using more precise rules
   * - Filters out subjective language and opinions
   * - Skips questions, emotional language, and speculative content
   * - Focuses on statements with factual indicators
   * - Requires presence of evidence-based language
   * - Detects statements with numeric data and proper nouns
   */
  private isLikelyClaim(sentence: string): boolean {
    // Skip very short sentences
    if (sentence.length < 20) return false;
    
    // Skip sentences with subjective/speculative language
    const hasSubjectiveIndicators = /\b(I think|I believe|in my opinion|I feel|it might be|it may be|we believe|probably|possibly|maybe|perhaps|likely|unlikely|seems to|could be|might be|may be|allegedly|supposedly|apparently)\b/i.test(sentence);
    if (hasSubjectiveIndicators) return false;
    
    // Skip questions (often not factual claims)
    if (sentence.trim().endsWith('?')) return false;
    
    // Skip emotional/opinion phrases
    const hasEmotionalLanguage = /\b(beautiful|ugly|wonderful|terrible|best|worst|amazing|awful|good|bad|love|hate|favorite|great|excellent|poor|superior|inferior)\b/i.test(sentence);
    if (hasEmotionalLanguage) return false;
    
    // Check for numbers
    const hasNumbers = /\d/.test(sentence);
    
    // Check for proper nouns (simplified)
    const hasProperNouns = /\s[A-Z][a-z]+/.test(sentence);
    
    // Enhanced claim indicators - expanded for better detection of fact-like language
    const hasClaimIndicators = /(found|showed|discovered|reported|according to|study|research|analysis|evidence|data|results|concluded|suggests|indicates|confirms|demonstrates|proves|supported by|measured|observed|conducted|survey|experiments|calculations|statistics|percent|percentage|proportion|scientific|researchers|scientists|experts|published|journal|paper|investigate|examine|analyze|determine|established|verify|confirmed|identify|document|record|reveal|show that|demonstrate that|indicate that|prove that|establish that|verified that)/i.test(sentence);
    
    // Force some sentences to be considered claims only if they don't have subjective indicators
    if (!hasSubjectiveIndicators && !hasEmotionalLanguage && (
        sentence.includes('climate') || 
        sentence.includes('research') || 
        sentence.includes('study') || 
        sentence.includes('found') ||
        sentence.includes('data') ||
        sentence.includes('showed'))) {
      return true;
    }

    return (hasNumbers || hasProperNouns) && hasClaimIndicators;
  }

  /**
   * Split text into sentences, handling common abbreviations
   */
  private splitIntoSentences(text: string): string[] {
    // Basic sentence splitting with some abbreviation handling
    return text
      .replace(/([.?!])\s+(?=[A-Z])/g, "$1|")
      .split("|")
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Calculate relevance score based on enhanced heuristics
   * - Boosts statements with specific data, percentages, and statistics
   * - Rewards research references and evidence-based language
   * - Penalizes subjective elements like first-person pronouns
   * - Adjusts for future tense and non-verifiable content
   */
  private calculateRelevance(sentence: string): number {
    let score = 0.5; // Base score
    
    // Boost score for numbers (important for factual claims)
    if (/\d/.test(sentence)) score += 0.15;
    
    // Give higher boost for percentages and statistics
    if (/\d+(\.\d+)?%|\d+ percent|\d+ percentage/i.test(sentence)) score += 0.1;
    
    // Boost for proper nouns (entities being discussed)
    if (/\s[A-Z][a-z]+/.test(sentence)) score += 0.1;
    
    // Substantial boost for research/evidence indicators
    if (/(study|research|found|showed|evidence|data|results|published|journal|paper)/i.test(sentence)) score += 0.15;
    
    // Boost for specific verifiable terms
    if (/(according to|reported by|measured|observed|conducted|statistics|researchers|scientists)/i.test(sentence)) score += 0.1;
    
    // Penalize very long sentences (more likely to contain mixed content)
    if (sentence.length > 200) score -= 0.1;
    
    // Penalize sentences with first-person pronouns (often opinions)
    if (/\b(I|we|our|my)\b/i.test(sentence)) score -= 0.15;
    
    // Slight penalty for future tense (less verifiable)
    if (/\b(will|going to|shall|would)\b/i.test(sentence)) score -= 0.05;

    return Math.min(Math.max(score, 0), 1); // Clamp between 0 and 1
  }

  /**
   * Extract claims from the current webpage
   */
  public async extractClaims(maxClaims: number = 5): Promise<ClaimDetectionResult> {
    const paragraphs = this.getMainContent();
    const claims: Claim[] = [];
    let totalProcessed = 0;

    // Fall back to rule-based approach if LLM fails or isn't available
    for (let pIndex = 0; pIndex < paragraphs.length; pIndex++) {
      const sentences = this.splitIntoSentences(paragraphs[pIndex]);
      
      for (const sentence of sentences) {
        totalProcessed++;
        
        if (this.isLikelyClaim(sentence)) {
          const relevance = this.calculateRelevance(sentence);
          
          // Clean the text by removing references
          const cleanText = sentence.replace(/\[\d+\]/g, '');
          
          claims.push({
            id: ++this.claimCounter,
            text: sentence,
            cleanText,
            context: {
              page: 1,
              paragraph: pIndex
            },
            relevance
          });

          if (claims.length >= maxClaims) {
            return { claims, totalProcessed };
          }
        }
      }
    }
    return { claims, totalProcessed };
  }
}

// Link to our external stylesheet that has all the styles
// Make sure to add this early to ensure styles are applied
function addStylesheet() {
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

// Creates a small sidebar toggle button fixed to the right edge of the screen
function createSidebarToggle() {
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
  
  // On click, open or close the claims overlay
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
  
  document.body.appendChild(toggleBtn);
  return toggleBtn;
}

// Add stylesheet immediately
addStylesheet();

// Helper function to determine color based on confidence level
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'var(--high-confidence)';   // High confidence - green
  if (confidence >= 0.5) return 'var(--medium-confidence)'; // Medium confidence - yellow/amber
  return 'var(--low-confidence)';                           // Low confidence - red
}

// Function to add a claim to the unified claims overlay
function addClaimToOverlay(overlay: HTMLElement, claim: Claim, sources: any[] = []) {
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

// Set up a single event listener to handle all "Verify" button clicks
function setupVerifyButtonHandlers(overlay: HTMLElement) {
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
            updateClaimSources(claimId, response.results, sourcesDiv);
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

// Update the sources section for a claim
function updateClaimSources(claimId: string, sources: any[], sourcesDiv: HTMLElement) {
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

// Function to highlight text and add tooltip with source information
// This is the core UI component that makes claims interactive
// and displays verification results to the user
// Helper function to create a consistent DEEPCITE badge
function createDeepCiteBadge(): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'deepcite-badge';
  badge.textContent = 'DEEPCITE';
  badge.title = 'This element contains a factual claim verified by DeepCite';
  
  // We're now using CSS defined in pdf-overlay.css
  // No need to add event listeners as they're handled via CSS :hover
  
  return badge;
}

function highlightClaim(claim: Claim, sources: any[]): boolean {
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

async function isPDF(): Promise<boolean> {
  return document.contentType === 'application/pdf' || 
         window.location.pathname.toLowerCase().endsWith('.pdf');
}

/**
 * Create a draggable claims overlay panel
 * Improved with smooth animations and draggable functionality
 * @param isPDF Whether this is being used in PDF mode
 * @returns The overlay HTML element
 */
async function createClaimsOverlay(isPDF = false) {
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
function makeDraggable(element: HTMLElement, handle: HTMLElement) {
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
 * Cleans up temporary UI elements when opening/closing the panel
 * This ensures a clean state
 */
function cleanupEphemeralElements() {
  // Remove any floating tooltips
  const tooltips = document.querySelectorAll('.exa-tooltip');
  tooltips.forEach(tooltip => tooltip.remove());
  
  // Remove any temporary status indicators
  const indicators = document.querySelectorAll('[data-temporary-indicator]');
  indicators.forEach(indicator => indicator.remove());
}

async function analyzePDF(openaiKey: string, useLLMExtraction: boolean = true) {
  const overlay = await createClaimsOverlay(true);
  
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

// Helper function to process PDF claims
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
  setupVerifyButtonHandlers(overlay);
  
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
  const toggleBtn = createSidebarToggle();
  
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

// Any function that would create demonstration highlights with dummy sources
// has been completely removed - we now only display real API-verified results

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
    setupVerifyButtonHandlers(overlay);
    
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