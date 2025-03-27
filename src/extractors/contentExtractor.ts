/**
 * Extracts and processes factual claims from webpage content
 * This class uses rule-based heuristics to identify claims
 * It serves as a fallback when LLM-based extraction is unavailable
 */
export class ContentExtractor {
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

// Define types needed for the ContentExtractor
export interface Claim {
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

export interface ClaimDetectionResult {
  claims: Claim[];
  totalProcessed: number;
}