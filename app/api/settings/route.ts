import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** GET /api/settings — 앱 설정 조회 */
export async function GET() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value, updated_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings: Record<string, any> = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }
  return NextResponse.json(settings);
}

/** PATCH /api/settings — 설정 업데이트 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const updates: Array<{ key: string; value: any }> = [];

    for (const [key, value] of Object.entries(body)) {
      updates.push({ key, value: JSON.stringify(value) });
    }

    for (const { key, value } of updates) {
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          { key, value: JSON.parse(value), updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
