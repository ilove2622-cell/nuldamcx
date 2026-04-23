import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/chat/tags?type=customer&q=VIP
 * 고객 태그 또는 상담 태그의 고유 목록 + 사용 건수 반환 (자동완성용)
 */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || 'customer';
  const q = req.nextUrl.searchParams.get('q') || '';
  const table = type === 'session' ? 'session_tags' : 'customer_tags';

  const { data, error } = await supabase
    .from(table)
    .select('label, category, color');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 집계: label+category → { label, category, color, count }
  const map = new Map<string, { label: string; category: string; color: string; count: number }>();
  for (const row of data || []) {
    const key = `${row.category}::${row.label}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
    } else {
      map.set(key, { label: row.label, category: row.category, color: row.color, count: 1 });
    }
  }

  let suggestions = [...map.values()].sort((a, b) => b.count - a.count);

  if (q) {
    const lower = q.toLowerCase();
    suggestions = suggestions.filter(s =>
      s.label.toLowerCase().includes(lower) || s.category.toLowerCase().includes(lower)
    );
  }

  return NextResponse.json({ suggestions: suggestions.slice(0, 20) });
}
