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
  /** Base64 인코딩된 이미지 (mime 프리픽스 없이 순수 base64) */
  imageBase64?: string | null;
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
  /** DB에 동일 이물질 사례가 있어 csScript를 재사용한 경우의 원본 사례 ID */
  matchedCaseId?: number;
  error?: string;
}
