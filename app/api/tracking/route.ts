import { NextResponse } from 'next/server';
import { lookupTracking } from '@/lib/tracking-lookup';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const trackingNum = searchParams.get('num') || '';
  const courierName = searchParams.get('courierName') || searchParams.get('carrier') || '';

  if (!trackingNum) {
    return NextResponse.json({ error: 'Missing tracking number' }, { status: 400 });
  }

  const result = await lookupTracking(trackingNum, courierName);
  return NextResponse.json(result);
}
