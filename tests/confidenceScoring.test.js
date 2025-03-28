require('./setup');

const { 
  getDomainReputation, 
  getConfidenceTier, 
  getConfidenceColor, 
  getConfidenceExplanation,
  calculateEnhancedConfidence 
} = require('./mockWebPageHandler');

describe('Confidence Scoring Tests', () => {
  test('getDomainReputation returns correct values for known domains', () => {
    expect(getDomainReputation('https://nature.com/article')).toBe(1.0);
    expect(getDomainReputation('https://cnn.com/news')).toBe(0.7);
    expect(getDomainReputation('https://medium.com/post')).toBe(0.5);
  });

  test('getConfidenceTier returns correct tier names', () => {
    expect(getConfidenceTier(0.9)).toBe('High Confidence');
    expect(getConfidenceTier(0.7)).toBe('Medium-High Confidence');
    expect(getConfidenceTier(0.55)).toBe('Medium Confidence');
    expect(getConfidenceTier(0.4)).toBe('Low-Medium Confidence');
    expect(getConfidenceTier(0.2)).toBe('Low Confidence');
    expect(getConfidenceTier(undefined)).toBe('Low Confidence');
  });

  test('calculateEnhancedConfidence handles claims with no sources', () => {
    const claim = { id: 1, text: 'Test claim' };
    const sources = [];
    calculateEnhancedConfidence(claim, sources);
    expect(claim.confidence).toBe(0.2);
  });

  test('calculateEnhancedConfidence correctly weights multiple sources', () => {
    const claim = { id: 1, text: 'Test claim' };
    
    const goodSources = [
      { title: 'Source 1', url: 'https://nature.com/article', score: 0.9 },
      { title: 'Source 2', url: 'https://science.org/paper', score: 0.8 }
    ];
    
    calculateEnhancedConfidence(claim, goodSources);
    expect(claim.confidence).toBeGreaterThan(0.8);
    
    claim.confidence = undefined;
    const mediumSources = [
      { title: 'Source 1', url: 'https://cnn.com/news', score: 0.7 },
      { title: 'Source 2', url: 'https://bbc.com/story', score: 0.6 }
    ];
    
    calculateEnhancedConfidence(claim, mediumSources);
    expect(claim.confidence).toBeGreaterThanOrEqual(0.5);
    expect(claim.confidence).toBeLessThan(0.8);
    
    claim.confidence = undefined;
    const lowSources = [
      { title: 'Source 1', url: 'https://medium.com/blog', score: 0.4 },
      { title: 'Source 2', url: 'https://reddit.com/post', score: 0.3 }
    ];
    
    calculateEnhancedConfidence(claim, lowSources);
    expect(claim.confidence).toBeLessThan(0.5);
  });

  test('calculateEnhancedConfidence applies source diversity bonus', () => {
    const claim = { id: 1, text: 'Test claim' };
    
    const singleDomainSources = [
      { title: 'Source 1', url: 'https://medium.com/article1', score: 0.6 },
      { title: 'Source 2', url: 'https://medium.com/article2', score: 0.6 }
    ];
    
    calculateEnhancedConfidence(claim, singleDomainSources);
    const singleDomainScore = claim.confidence;
    
    claim.confidence = undefined;
    const multipleDomainSources = [
      { title: 'Source 1', url: 'https://medium.com/article', score: 0.6 },
      { title: 'Source 2', url: 'https://cnn.com/paper', score: 0.6 }
    ];
    
    calculateEnhancedConfidence(claim, multipleDomainSources);
    const multipleDomainScore = claim.confidence;
    
    expect(multipleDomainScore).toBeGreaterThan(singleDomainScore);
  });

  test('getConfidenceExplanation returns appropriate explanations', () => {
    expect(getConfidenceExplanation(0.9)).toContain('High confidence');
    expect(getConfidenceExplanation(0.7)).toContain('Medium-high confidence');
    expect(getConfidenceExplanation(0.55)).toContain('Medium confidence');
    expect(getConfidenceExplanation(0.4)).toContain('Low-medium confidence');
    expect(getConfidenceExplanation(0.2)).toContain('Low confidence');
    expect(getConfidenceExplanation(undefined)).toContain('No sources');
  });
});
