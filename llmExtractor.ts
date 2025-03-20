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

  private async extractClaimsFromChunk(text: string): Promise<LLMExtractionResult> {
    try {
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
              - confidence: 0-1 score of how clearly it's a factual claim
              Only include clear, verifiable claims. Ignore opinions and subjective statements.`
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
      const claims = data.choices[0].message.content;
      const parsed = JSON.parse(claims);
      
      return {
        claims: parsed.map((p: any) => p.claim),
        confidence: parsed.map((p: any) => p.confidence)
      };
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