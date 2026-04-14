export type RiskLevel = 'low' | 'medium' | 'high';

export interface AnalysisResult {
  substanceType: string;
  characteristics: string;
  riskLevel: RiskLevel;
  riskReason: string;
  estimatedSource: string;
  recommendedActions: string[];
  csScript: string;
}

export interface SimilarCase {
  id: number;
  createdAt: string;
  productName: string | null;
  substanceType: string;
  riskLevel: RiskLevel;
  characteristics: string;
  csScript: string;
}

export interface AnalyzeRequest {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  productName?: string;
}

export interface AnalyzeResponse {
  success: boolean;
  data?: AnalysisResult;
  similarCases?: SimilarCase[];
  error?: string;
}
