// Declare PDF.js types
declare const pdfjsLib: {
  getDocument: (url: string) => { promise: Promise<any> };
  GlobalWorkerOptions: { workerSrc: string };
};

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
    // Get all paragraph elements
    const paragraphs = Array.from(document.getElementsByTagName('p'));
    
    // Filter out short paragraphs (likely navigation/footer text)
    // This helps focus on the actual content of the page
    return paragraphs
      .filter(p => p.textContent && p.textContent.length > 50)
      .map(p => p.textContent as string);
  }

  /**
   * Basic claim detection using rules
   * - Contains numbers
   * - Contains proper nouns (capitalized words not at start)
   * - Reasonable length
   */
  private isLikelyClaim(sentence: string): boolean {
    // Skip very short sentences
    if (sentence.length < 30) return false;
    
    // Check for numbers
    const hasNumbers = /\d/.test(sentence);
    
    // Check for proper nouns (simplified)
    const hasProperNouns = /\s[A-Z][a-z]+/.test(sentence);
    
    // Check for common claim indicators
    const hasClaimIndicators = /(found|showed|discovered|reported|according|study|research)/i.test(sentence);

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
   * Calculate relevance score based on heuristics
   */
  private calculateRelevance(sentence: string): number {
    let score = 0.5; // Base score
    
    // Boost score for numbers
    if (/\d/.test(sentence)) score += 0.2;
    
    // Boost for proper nouns
    if (/\s[A-Z][a-z]+/.test(sentence)) score += 0.1;
    
    // Boost for research indicators
    if (/(study|research|found|showed)/i.test(sentence)) score += 0.1;
    
    // Penalize very long sentences
    if (sentence.length > 200) score -= 0.1;

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
const linkToStyles = document.createElement('link');
linkToStyles.rel = 'stylesheet';
linkToStyles.href = chrome.runtime.getURL('styles/pdf-overlay.css');
document.head.appendChild(linkToStyles);

// Helper function to determine color based on confidence level
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'var(--high-confidence)';   // High confidence - green
  if (confidence >= 0.5) return 'var(--medium-confidence)'; // Medium confidence - yellow/amber
  return 'var(--low-confidence)';                           // Low confidence - red
}

// Function to highlight text and add tooltip with source information
// This is the core UI component that makes claims interactive
// and displays verification results to the user
function highlightClaim(claim: Claim, sources: any[]) {
  console.log('Starting highlight process for claim:', claim.cleanText);
  
  // Find the paragraph containing our claim
  const paragraphs = document.getElementsByTagName('p');
  console.log('Found paragraphs:', paragraphs.length);
  
  for (const p of paragraphs) {
    const cleanParagraphText = p.textContent?.replace(/\[\d+\]/g, '') || '';
    console.log('Checking paragraph:', cleanParagraphText.substring(0, 50) + '...');
    
    if (cleanParagraphText.includes(claim.cleanText)) {
      console.log('Found matching paragraph!');
      
      // Store original content for debugging
      console.log('Original paragraph HTML:', p.innerHTML);
      
      // Create a wrapper div to preserve existing HTML structure
      const wrapper = document.createElement('div');
      wrapper.innerHTML = p.innerHTML;
      
      // Try a simpler approach: wrap the entire paragraph content
      const span = document.createElement('span');
      span.className = 'exa-claim-highlight';
      span.innerHTML = wrapper.innerHTML;
      wrapper.innerHTML = '';
      wrapper.appendChild(span);
      
      // Update the paragraph
      p.innerHTML = wrapper.innerHTML;
      console.log('Updated paragraph HTML:', p.innerHTML);
      
      const highlightSpan = p.querySelector('.exa-claim-highlight');
      console.log('Found highlight span:', !!highlightSpan);
      
      if (highlightSpan) {
        let currentTooltip: HTMLElement | null = null;
        let tooltipTimeout: number | null = null;
        let currentSourceIndex = 0;
        
        // Function to update tooltip content
        const updateTooltip = () => {
          if (!currentTooltip) return;
          
          const currentSource = sources[currentSourceIndex];
          const favicon = `https://www.google.com/s2/favicons?domain=${new URL(currentSource.url).hostname}`;
          
          // We'll update the tooltip to provide a better view of multiple sources
          let tooltipHTML = '';
          
          // Add claim confidence if available
          if (claim.confidence !== undefined) {
            tooltipHTML += `
              <div class="exa-claim-confidence">
                <span style="font-weight: bold;">Certainty:</span> 
                <span style="color: ${getConfidenceColor(claim.confidence)}">
                  ${Math.round(claim.confidence * 100)}%
                </span>
              </div>
            `;
          }
          
          // Add sources header
          tooltipHTML += `<div class="exa-sources-header">
            Sources (${sources.length})
          </div>`;
          
          // Enhanced UI for multiple sources:
          // We provide two different UI patterns based on the number of sources
          // This optimizes the UI for both readability and space efficiency
          // 1. Show all sources in a compact list (if there are 1-2 sources)
          // 2. Use pagination to step through sources (if there are 3+ sources)
          
          if (sources.length <= 2) {
            // Option 1: Show all sources in a compact view for better at-a-glance comprehension
            tooltipHTML += sources.map((source, index) => {
              const srcFavicon = `https://www.google.com/s2/favicons?domain=${new URL(source.url).hostname}`;
              return `
                <div class="exa-tooltip-source">
                  <div class="exa-tooltip-source-header">
                    <img src="${srcFavicon}" alt="Source icon" class="exa-tooltip-favicon">
                    <strong>${source.title}</strong>
                    <span class="exa-source-confidence">
                      ${Math.round(source.score * 100)}%
                    </span>
                  </div>
                  <a href="${source.url}" target="_blank">View source</a>
                  ${index < sources.length - 1 ? '<hr class="pdf-source-divider">' : ''}
                </div>
              `;
            }).join('');
          } else {
            // Option 2: Use pagination for 3+ sources
            // This provides a cleaner UI when there are multiple sources
            // and allows users to focus on one source at a time
            const source = sources[currentSourceIndex];
            const srcFavicon = `https://www.google.com/s2/favicons?domain=${new URL(source.url).hostname}`;
            
            tooltipHTML += `
              <div class="exa-tooltip-source">
                <div class="exa-tooltip-source-header">
                  <img src="${srcFavicon}" alt="Source icon" class="exa-tooltip-favicon">
                  <strong>${source.title}</strong>
                  <span class="exa-source-confidence">
                    ${Math.round(source.score * 100)}%
                  </span>
                </div>
                <a href="${source.url}" target="_blank">View source</a>
              </div>
              <div class="exa-tooltip-nav">
                <button ${currentSourceIndex === 0 ? 'disabled' : ''}>
                  ← Previous
                </button>
                <span>${currentSourceIndex + 1}/${sources.length}</span>
                <button ${currentSourceIndex === sources.length - 1 ? 'disabled' : ''}>
                  Next →
                </button>
              </div>
            `;
          }
          
          currentTooltip.innerHTML = tooltipHTML;

          // Re-attach navigation handlers
          if (sources.length > 2) { // Only need navigation handlers for 3+ sources
            const nav = currentTooltip.querySelector('.exa-tooltip-nav');
            if (nav) {
              const [prevBtn, nextBtn] = nav.querySelectorAll('button');
              prevBtn.addEventListener('click', () => {
                if (currentSourceIndex > 0) {
                  currentSourceIndex--;
                  updateTooltip();
                }
              });
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

        highlightSpan.addEventListener('mouseenter', () => {
          clearTooltipTimeout();
          
          // Remove any existing tooltips
          const existingTooltip = document.querySelector('.exa-tooltip');
          if (existingTooltip) existingTooltip.remove();
          
          const newTooltip = document.createElement('div');
          newTooltip.className = 'exa-tooltip';
          
          // Position the tooltip
          const rect = highlightSpan.getBoundingClientRect();
          newTooltip.style.top = `${rect.bottom + 5}px`;
          newTooltip.style.left = `${rect.left}px`;
          
          document.body.appendChild(newTooltip);
          currentTooltip = newTooltip;
          
          // Add animation class after a small delay to trigger the animation
          setTimeout(() => {
            newTooltip.classList.add('visible');
          }, 10);
          
          // Initial tooltip content
          updateTooltip();
          
          // Tooltip animation is handled by the class we added

          // Add hover handlers to tooltip
          newTooltip.addEventListener('mouseenter', clearTooltipTimeout);
          newTooltip.addEventListener('mouseleave', startTooltipTimeout);
        });

        highlightSpan.addEventListener('mouseleave', startTooltipTimeout);
      }
      break;
    }
  }
}

async function isPDF(): Promise<boolean> {
  return document.contentType === 'application/pdf' || 
         window.location.pathname.toLowerCase().endsWith('.pdf');
}

async function createPDFOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'pdf-claims-overlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);
  return overlay;
}

async function analyzePDF(openAiKey: string) {
  const overlay = await createPDFOverlay();
  const analyzeButton = document.createElement('button');
  analyzeButton.className = 'analyze-pdf-button';
  analyzeButton.textContent = 'Analyze PDF';
  document.body.appendChild(analyzeButton);
  
  analyzeButton.addEventListener('click', async () => {
    try {
      analyzeButton.textContent = 'Analyzing...';
      analyzeButton.disabled = true;
      
      const pdfHandler = new PDFHandler(window.location.href);
      await pdfHandler.init();
      const content = await pdfHandler.getAllContent();
      
      // Try to use LLM extractor first, fallback to rule-based extractor
      let claims: ClaimDetectionResult | undefined;
      if (openAiKey) {
        try {
          const llmExtractor = new LLMExtractor(openAiKey);
          const llmResults = await llmExtractor.extractClaims(content);
          
          if (llmResults.claims.length > 0) {
            claims = {
              claims: llmResults.claims.map((claimText: string, index: number) => {
                return {
                  id: index + 1,
                  text: claimText,
                  cleanText: claimText.replace(/\[\d+\]/g, ''),
                  context: {
                    page: 1,
                    paragraph: index
                  },
                  relevance: 0.8,
                  confidence: llmResults.confidence[index]
                };
              }),
              totalProcessed: llmResults.claims.length
            };
          }
        } catch (error: any) {
          console.error('LLM extraction failed for PDF, falling back to rule-based:', error);
        }
      }
      
      // If LLM extraction failed or found no claims, use rule-based approach
      if (!claims || claims.claims.length === 0) {
        const extractor = new ContentExtractor();
        claims = await extractor.extractClaims(5);
      }
      
      overlay.innerHTML = `
        <div class="pdf-claims-header">
          <h3>Detected Claims</h3>
          <small>${claims.claims.length} claims found</small>
        </div>
      `;
      overlay.style.display = 'block';
      
      for (const claim of claims.claims) {
        const claimDiv = document.createElement('div');
        claimDiv.className = 'pdf-claim-item';
        
        // Find location in PDF
        const location = pdfHandler.findTextLocation(claim.cleanText);
        
        chrome.runtime.sendMessage({
          type: 'VERIFY_CLAIM',
          claim
        }, response => {
          if (response.success && response.results && response.results.length > 0) {
            const sources = response.results;
            
            // Create the basic claim information
            let claimHTML = `
              ${location ? `
                <div class="pdf-claim-location">
                  Page ${location.pageNum}, Paragraph ${location.paragraph + 1}
                </div>
              ` : ''}
              <div>${claim.text}</div>
              ${claim.confidence !== undefined ? `
                <div class="pdf-claim-confidence">
                  Certainty: <span style="color: ${getConfidenceColor(claim.confidence)}; font-weight: 500;">
                    ${Math.round(claim.confidence * 100)}%
                  </span>
                </div>
              ` : ''}
              <div class="pdf-claim-sources">
                <div class="pdf-claim-sources-header">Sources (${sources.length}):</div>
            `;
            
            // Add all sources to the claim
            sources.forEach((source: any, index: number) => {
              claimHTML += `
                <div class="pdf-claim-source-item">
                  <div class="pdf-source-title">
                    <a href="${source.url}" target="_blank">${source.title}</a>
                    <span class="pdf-source-confidence">(${Math.round(source.score * 100)}% confidence)</span>
                  </div>
                  ${index < sources.length - 1 ? '<hr class="pdf-source-divider">' : ''}
                </div>
              `;
            });
            
            // Close the sources div
            claimHTML += `</div>`;
            
            claimDiv.innerHTML = claimHTML;
            
            // Scroll to text in PDF when clicked
            claimDiv.addEventListener('click', () => {
              if (location) {
                // Most PDF viewers support #page=N for navigation
                window.location.hash = `#page=${location.pageNum}`;
              }
            });
          }
        });
        
        overlay.appendChild(claimDiv);
      }
      
      analyzeButton.style.display = 'none';
    } catch (error) {
      console.error('PDF analysis failed:', error);
      analyzeButton.textContent = 'Analysis Failed';
    }
  });
}

// Main initialization
chrome.storage.local.get(['openAiKey'], async result => {
  if (await isPDF()) {
    analyzePDF(result.openAiKey);
    return;
  }
  
  // Create analyze button for web pages
  // Manually trigger claim extraction only after user clicks "Analyze Webpage"
  // to avoid automatically scanning on page load and respect user privacy
  const analyzeWebButton = document.createElement('button');
  analyzeWebButton.className = 'analyze-webpage-button';
  analyzeWebButton.textContent = 'Analyze Webpage';
  document.body.appendChild(analyzeWebButton);
  
  analyzeWebButton.addEventListener('click', async () => {
    // Perform analysis only when clicked
    analyzeWebButton.textContent = 'Analyzing...';
    analyzeWebButton.disabled = true;
    
    try {
      // Get OpenAI key from storage
      const { openAiKey } = await new Promise<{openAiKey: string}>(resolve => {
        chrome.storage.local.get(['openAiKey'], (result) => resolve(result as {openAiKey: string}));
      });
      
      // Use Content Extractor to get main content
      const extractor = new ContentExtractor();
      const paragraphs = extractor.getMainContent().join('\n\n');
      
      // Use LLM Extractor for more accurate claim detection
      // This provides higher quality claim detection with confidence scoring
      // compared to the rule-based approach
      if (openAiKey) {
        const llmExtractor = new LLMExtractor(openAiKey);
        const llmResults = await llmExtractor.extractClaims(paragraphs);
        
        // Convert LLM results to Claim objects
        if (llmResults.claims.length > 0) {
          const claims: Claim[] = llmResults.claims.map((claimText: string, index: number) => {
            return {
              id: index + 1,
              text: claimText,
              cleanText: claimText.replace(/\[\d+\]/g, ''),
              context: {
                page: 1,
                paragraph: index
              },
              relevance: 0.8, // Default relevance
              confidence: llmResults.confidence[index]
            };
          });
          
          // Process each claim
          for (const claim of claims) {
            chrome.runtime.sendMessage({
              type: 'VERIFY_CLAIM',
              claim
            }, response => {
              if (response.success && response.results) {
                highlightClaim(claim, response.results);
              }
            });
          }
          
          analyzeWebButton.textContent = 'Analysis Complete';
        } else {
          // Fallback to rule-based approach if LLM finds no claims
          // This ensures we still provide value even if the LLM extraction fails
          console.log('LLM found no claims, falling back to rule-based detection');
          await runExtraction(extractor);
          analyzeWebButton.textContent = 'Analysis Complete (Fallback)';
        }
      } else {
        // No API key, use rule-based approach
        // The extension can work without OpenAI API access by using simple heuristics
        console.log('No OpenAI API key, using rule-based detection');
        await runExtraction(extractor);
        analyzeWebButton.textContent = 'Analysis Complete';
      }
    } catch (error: any) {
      console.error('Analysis failed:', error);
      analyzeWebButton.textContent = 'Analysis Failed';
    }
    
    setTimeout(() => {
      analyzeWebButton.style.display = 'none';
    }, 2000);
  });
});

async function runExtraction(extractor: ContentExtractor) {
  const result = await extractor.extractClaims(5); // Now extract multiple claims
  
  if (result.claims.length > 0) {
    for (const claim of result.claims) {
      chrome.runtime.sendMessage({
        type: 'VERIFY_CLAIM',
        claim
      }, response => {
        if (response.success && response.results) {
          highlightClaim(claim, response.results);
        }
      });
    }
  }
}