/**
 * Interface for LLM extraction results containing claims and confidence scores
 */
interface LLMExtractionResult {
  claims: string[];         // Array of extracted factual claims
  confidence: number[];     // Corresponding confidence scores (0-1)
}

/**
 * Extracts factual claims from text using OpenAI's GPT-4
 * This provides more accurate claim detection than rule-based approaches
 * and includes confidence scoring for each claim
 * 
 * Enhanced with improved prompting to:
 * - Filter out subjective, speculative, and opinion-based statements
 * - Focus on verifiable claims with specific data and evidence
 * - Assess confidence based on factual clarity and specificity
 * - Prioritize claims that reference research, measurements, or established facts
 */
// Make the class global for content script access
const LLMExtractor = class {
  private apiKey: string;
  private maxTokens = 4000; // GPT-4 context window limit
  
  /**
   * Initialize the extractor with an OpenAI API key
   * @param apiKey - OpenAI API key
   */
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  public async extractClaimsFromChunk(text: string): Promise<LLMExtractionResult> {
    try {
      if (!this.apiKey || this.apiKey === '') {
        throw new Error('OpenAI API key not provided or empty');
      }
      
      // Validate API key format (should be a non-empty string starting with 'sk-')
      if (!this.apiKey.startsWith('sk-')) {
        throw new Error('Invalid OpenAI API key format');
      }
      
      console.log('Sending request to OpenAI API...');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{
            role: 'system',
            content: `Extract factual claims from the text. Return a JSON array where each item has:
              - claim: The exact claim text
              - confidence: 0-1 score of how clearly it's a factual claim (0.9+ for very clear factual claims with specific data, 0.7-0.9 for likely factual claims, below 0.7 for statements that might be factual but lack specificity)
              
              Only include clear, verifiable claims that could be fact-checked against reliable sources.
              
              EXCLUDE the following types of statements:
              - Opinions, subjective judgments, or matters of taste
              - Speculative statements containing "might," "may," "could," "possibly," etc.
              - Value judgments containing "good," "bad," "best," "worst," etc.
              - Relative or comparative claims without specific metrics
              - Personal beliefs starting with "I think," "I believe," etc.
              - Questions or hypotheticals
              - Future predictions
              - Claims about intentions or motivations
              - General claims without specificity
              
              INCLUDE statements that:
              - Contain specific numbers, dates, statistics, or measurements
              - Reference research, studies, or specific published findings
              - Make clear cause-effect assertions based on evidence
              - Describe specific historical events, discoveries, or observations
              - Reference specific organizations, people, or places in relation to verifiable actions
              - Make definitive statements about established processes or systems
              
              Prioritize precision, specificity, and verifiability in your selection.`
          }, {
            role: 'user',
            content: text
          }],
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      if (!data || !data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
        throw new Error('Invalid response format from OpenAI API');
      }
      
      const claims = data.choices[0].message.content;
      
      try {
        const parsed = JSON.parse(claims);
        
        if (!Array.isArray(parsed)) {
          throw new Error('Expected JSON array in response');
        }
        
        return {
          claims: parsed.map((p: any) => p.claim),
          confidence: parsed.map((p: any) => p.confidence)
        };
      } catch (parseError) {
        console.error('Failed to parse OpenAI response as JSON:', parseError);
        // Try to extract claims with regex as fallback
        const claimMatches = claims.match(/claim["\s:]+([^"]+)/gi);
        const confidenceMatches = claims.match(/confidence["\s:]+([0-9.]+)/gi);
        
        if (claimMatches) {
          const extractedClaims = claimMatches.map((m: string) => {
            const match = m.match(/claim["\s:]+(.+)/i);
            return match ? match[1].trim() : '';
          }).filter((c: string) => c);
          
          const extractedConfidences = confidenceMatches ? confidenceMatches.map((m: string) => {
            const match = m.match(/confidence["\s:]+([0-9.]+)/i);
            return match ? parseFloat(match[1]) : 0.5;
          }) : extractedClaims.map(() => 0.5);
          
          if (extractedClaims.length > 0) {
            return {
              claims: extractedClaims,
              confidence: extractedConfidences
            };
          }
        }
        
        throw new Error('Failed to parse claims from OpenAI response');
      }
    } catch (error) {
      console.error('LLM extraction failed:', error);
      return { claims: [], confidence: [] };
    }
  }

  private chunkText(text: string, maxLength: number = 3000): string[] {
    // Split into paragraphs
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if ((currentChunk + paragraph).length > maxLength) {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }

  /**
   * Extract factual claims from text with confidence scores
   * Handles large texts by chunking and processing in parallel
   * 
   * @param text - The text to analyze for factual claims
   * @returns Promise resolving to claims and confidence scores
   */
  public async extractClaims(text: string): Promise<LLMExtractionResult> {
    // Split large text into manageable chunks to fit within token limits
    const chunks = this.chunkText(text);
    
    // Process all chunks in parallel for better performance
    const results = await Promise.all(
      chunks.map(chunk => this.extractClaimsFromChunk(chunk))
    );

    // Merge results from all chunks into a single result
    return {
      claims: results.flatMap(r => r.claims),
      confidence: results.flatMap(r => r.confidence)
    };
  }
}