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
    .select('id, created_at, product_name, substance_type, risk_level, characteristics, cs_script, image_base64')
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
    imageBase64: row.image_base64,
  }));
}

// 🎯 동일 이물질 정확 매칭 — 저장된 사례 중 substance_type이 일치하는 가장 최근 1건 반환
// "식물성 섬유질 (줄기 추정)" 같은 표기 차이를 흡수하기 위해 핵심 키워드만 추출해 ILIKE 검색
export async function findExactMatchCase(
  substanceType: string
): Promise<SimilarCase | null> {
  if (!substanceType) return null;

  // 정규화: 괄호/기호 제거, 공백 정리
  const normalized = substanceType
    .replace(/[()[\]{}「」『』,.·•\-/|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;

  // 첫 번째 의미 토큰(2자 이상) 기준 검색 — "식물성", "플라스틱" 등
  const tokens = normalized.split(' ').filter((t) => t.length >= 2);
  const primary = tokens[0] || normalized;

  const { data, error } = await supabase
    .from('substance_cases')
    .select('id, created_at, product_name, substance_type, risk_level, characteristics, cs_script, image_base64')
    .ilike('substance_type', `%${primary}%`)
    .not('cs_script', 'is', null)
    .not('cs_script', 'eq', '')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.warn('[findExactMatchCase]', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const row = data[0];
  return {
    id: row.id,
    createdAt: row.created_at,
    productName: row.product_name,
    substanceType: row.substance_type,
    riskLevel: row.risk_level as RiskLevel,
    characteristics: row.characteristics,
    csScript: row.cs_script,
    imageBase64: row.image_base64,
  };
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
