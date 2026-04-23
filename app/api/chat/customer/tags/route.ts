import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/chat/customer/tags
 * body: { customerId, label, category?, color? }
 */
export async function POST(req: NextRequest) {
  try {
    const { customerId, label, category, color } = await req.json();
    if (!customerId || !label) {
      return NextResponse.json({ error: 'customerId, label 필수' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('customer_tags')
      .insert({
        customer_id: customerId,
        label,
        category: category || '일반',
        color: color || '#3b82f6',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tag: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/chat/customer/tags
 * body: { tagId }
 */
export async function DELETE(req: NextRequest) {
  try {
    const { tagId } = await req.json();
    if (!tagId) return NextResponse.json({ error: 'tagId 필수' }, { status: 400 });

    const { error } = await supabase
      .from('customer_tags')
      .delete()
      .eq('id', tagId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
