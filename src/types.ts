// Common type definitions used throughout the application

export interface Claim {
  id: number;
  text: string;
  cleanText?: string;
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

export interface ExaSearchResult {
  title: string;
  url: string;
  publishedDate?: string;
  score: number;
  highlights: string[];
}

export interface VerifyClaimRequest {
  type: 'VERIFY_CLAIM';
  claim: Claim;
}

export interface Settings {
  exaKey: string;
  openaiKey: string;
  highlightsEnabled: boolean;
  sidebarEnabled: boolean;
  darkMode: boolean;
  excludedDomains: string[];
  maxVerificationsPerDay: number;
  enableCaching: boolean;
  cacheDuration: number;
  useLLMExtraction: boolean;
  usageCount: number;
  lastUsageReset: number;
}