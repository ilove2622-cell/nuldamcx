import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/chat/customer?customerId=X
 * → { profile, tags, sessionHistory }
 */
export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get('customerId');
  if (!customerId) {
    return NextResponse.json({ error: 'customerId 필수' }, { status: 400 });
  }

  const [profileRes, tagsRes, historyRes] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select('*')
      .eq('customer_id', customerId)
      .maybeSingle(),
    supabase
      .from('customer_tags')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('chat_sessions')
      .select('id, user_chat_id, channel_type, customer_name, status, opened_at, closed_at, created_at, last_message_text')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (profileRes.error) return NextResponse.json({ error: profileRes.error.message }, { status: 500 });

  return NextResponse.json({
    profile: profileRes.data || null,
    tags: tagsRes.data || [],
    sessionHistory: historyRes.data || [],
  });
}

/**
 * PATCH /api/chat/customer
 * body: { customerId, updates: { name?, phone?, email?, member_id?, last_visit? } }
 */
export async function PATCH(req: NextRequest) {
  try {
    const { customerId, updates } = await req.json();
    if (!customerId || !updates) {
      return NextResponse.json({ error: 'customerId, updates 필수' }, { status: 400 });
    }

    const allowed = ['name', 'phone', 'email', 'member_id', 'last_visit'];
    const filtered: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in updates) filtered[key] = updates[key];
    }

    const { data, error } = await supabase
      .from('customer_profiles')
      .upsert({ customer_id: customerId, ...filtered }, { onConflict: 'customer_id' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
