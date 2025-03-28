
/**
 * Get domain reputation score based on URL
 */
function getDomainReputation(url) {
  if (url.includes('nature.com')) return 1.0;
  if (url.includes('science.org')) return 0.9;
  if (url.includes('bbc.com')) return 0.8;
  if (url.includes('cnn.com')) return 0.7;
  if (url.includes('medium.com')) return 0.5;
  if (url.includes('reddit.com')) return 0.3;
  return 0.5; // Default for unknown domains
}

/**
 * Get confidence tier label based on numerical score
 */
function getConfidenceTier(confidence) {
  if (confidence === undefined) return 'Low Confidence';
  if (confidence >= 0.8) return 'High Confidence';
  if (confidence >= 0.65) return 'Medium-High Confidence';
  if (confidence >= 0.5) return 'Medium Confidence';
  if (confidence >= 0.35) return 'Low-Medium Confidence';
  return 'Low Confidence';
}

/**
 * Get color for confidence labels
 */
function getConfidenceColor(confidence) {
  if (confidence === undefined) return '#FF3B30';
  if (confidence >= 0.8) return '#34C759';
  if (confidence >= 0.5) return '#FF9500';
  return '#FF3B30';
}

/**
 * Generate human-readable explanation for a confidence score
 */
function getConfidenceExplanation(confidence) {
  if (confidence === undefined) return 'No sources found to verify this claim';
  if (confidence >= 0.8) return 'High confidence based on multiple high-quality sources with strong credibility';
  if (confidence >= 0.65) return 'Medium-high confidence based on credible sources with good corroboration';
  if (confidence >= 0.5) return 'Medium confidence based on somewhat reliable sources';
  if (confidence >= 0.35) return 'Low-medium confidence with limited reliable sources';
  return 'Low confidence due to insufficient reliable sources';
}

/**
 * Calculate enhanced confidence score for a claim based on sources
 */
function calculateEnhancedConfidence(claim, sources) {
  if (!sources.length) {
    claim.confidence = 0.2;
    return;
  }
  
  let weightedScores = [];
  let domains = new Set();
  let highQualitySources = 0;
  
  sources.forEach(source => {
    if (source.title === "No relevant sources found" || source.url === "#") {
      return;
    }
    
    const domainReputation = getDomainReputation(source.url);
    
    try {
      const hostname = new URL(source.url).hostname;
      domains.add(hostname);
    } catch (error) {
      console.error('Invalid URL:', source.url);
    }
    
    const weightedScore = source.score * domainReputation;
    weightedScores.push(weightedScore);
    
    if (source.score >= 0.7 && domainReputation >= 0.7) {
      highQualitySources++;
    }
    
    source.domainReputation = domainReputation;
    source.weightedScore = weightedScore;
  });
  
  if (weightedScores.length === 0) {
    claim.confidence = 0.2;
    return;
  }
  
  const sumWeightedScores = weightedScores.reduce((sum, score) => sum + score, 0);
  let finalScore = sumWeightedScores / weightedScores.length;
  
  const diversityBonus = Math.min(0.2, 0.05 * (domains.size - 1));
  finalScore += diversityBonus;
  
  const qualityBonus = Math.min(0.15, 0.075 * highQualitySources);
  finalScore += qualityBonus;
  
  finalScore = Math.min(finalScore, 1.0);
  
  claim.confidence = finalScore;
}

module.exports = {
  getDomainReputation,
  getConfidenceTier,
  getConfidenceColor,
  getConfidenceExplanation,
  calculateEnhancedConfidence
};
