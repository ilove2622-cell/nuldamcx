import { createClient } from '@supabase/supabase-js';
import type { AnalysisResult, RiskLevel, SimilarCase } from '@/types/voc';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// 저장
export async function saveCase(
  productName: string | undefined,
  result: AnalysisResult,
  imageBase64?: string
): Promise<number> {
  const { data, error } = await supabase
    .from('substance_cases')
    .insert({
      product_name: productName ?? null,
      substance_type: result.substanceType,
      risk_level: result.riskLevel,
      characteristics: result.characteristics,
      recommended_actions: result.recommendedActions,
      cs_script: result.csScript,
      image_base64: imageBase64 ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`DB 저장 실패: ${error.message}`);
  return data.id;
}

// 수정
export async function updateCase(
  id: number,
  productName: string | undefined,
  result: AnalysisResult
): Promise<void> {
  const { error } = await supabase
    .from('substance_cases')
    .update({
      product_name: productName ?? null,
      substance_type: result.substanceType,
      risk_level: result.riskLevel,
      characteristics: result.characteristics,
      recommended_actions: result.recommendedActions,
      cs_script: result.csScript,
    })
    .eq('id', id);

  if (error) throw new Error(`DB 수정 실패: ${error.message}`);
}

// 유사 사례 검색
export async function findSimilarCases(
  substanceType: string,
  riskLevel: string,
  excludeId?: number,
  limit = 3
): Promise<SimilarCase[]> {
  let query = supabase
    .from('substance_cases')
    .select('id, created_at, product_name, substance_type, risk_level, characteristics, cs_script')
    .or(`substance_type.ilike.%${substanceType}%,risk_level.eq.${riskLevel}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`유사 사례 검색 실패: ${error.message}`);

  return (data || []).map(row => ({
    id: row.id,
    createdAt: row.created_at,
    productName: row.product_name,
    substanceType: row.substance_type,
    riskLevel: row.risk_level as RiskLevel,
    characteristics: row.characteristics,
    csScript: row.cs_script,
  }));
}

// 참조용 CS 스크립트 조회
export async function getReferenceScripts(limit = 5): Promise<string[]> {
  const { data, error } = await supabase
    .from('substance_cases')
    .select('cs_script')
    .not('cs_script', 'is', null)
    .not('cs_script', 'eq', '')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`참조 스크립트 조회 실패: ${error.message}`);
  return (data || []).map(r => r.cs_script as string);
}

// 전체 사례 수 조회
export async function getCaseCount(): Promise<number> {
  const { count, error } = await supabase
    .from('substance_cases')
    .select('*', { count: 'exact', head: true });

  if (error) throw new Error(`사례 수 조회 실패: ${error.message}`);
  return count || 0;
}
