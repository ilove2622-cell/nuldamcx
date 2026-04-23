import { NextResponse } from 'next/server';

// tracker.delivery 오픈 API를 사용하여 실시간 배송 조회
// 지원 택배사: CJ대한통운, 롯데택배, 한진, 우체국, 로젠, 쿠팡LS 등

// 널담은 CJ대한통운 + 롯데택배만 사용
const CARRIER_MAP: Record<string, { id: string; name: string }> = {
  cj:    { id: 'kr.cjlogistics', name: 'CJ대한통운' },
  lotte: { id: 'kr.lotte',       name: '롯데택배' },
};

// 택배사 판별: 송장번호 앞자리 우선, 그다음 택배사명
// ⚠️ 2026-04 기준 규칙. 택배사 송장번호 체계 변경 시 아래 매핑 업데이트 필요
// 현재: 6→CJ대한통운, 2→롯데택배 (향후 변경 가능)
const PREFIX_CARRIER_MAP: Record<string, string> = {
  '6': 'cj',
  '2': 'lotte',
};

function detectCarrier(courierName: string, trackingNum?: string): string {
  const digits = (trackingNum || '').replace(/[-\s]/g, '');
  const prefix = digits.charAt(0);
  if (prefix && PREFIX_CARRIER_MAP[prefix]) return PREFIX_CARRIER_MAP[prefix];
  // 송장번호로 판별 불가 시 택배사명으로
  const n = courierName.toLowerCase();
  if (n.includes('롯데')) return 'lotte';
  return 'cj';
}

// status.id → 한글 매핑
const STATUS_MAP: Record<string, string> = {
  information_received: '접수',
  at_pickup: '상품인수',
  in_transit: '배송중',
  out_for_delivery: '배송출발',
  delivered: '배달완료',
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let carrier = searchParams.get('carrier') || '';
  const trackingNum = searchParams.get('num') || '';
  const courierName = searchParams.get('courierName') || '';

  if (!trackingNum) {
    return NextResponse.json({ error: 'Missing tracking number' }, { status: 400 });
  }

  // 송장번호 앞자리 + 택배사명으로 자동 감지
  if (!carrier) {
    carrier = detectCarrier(courierName, trackingNum);
  }

  const carrierInfo = CARRIER_MAP[carrier] || CARRIER_MAP.cj;

  try {
    const apiUrl = `https://apis.tracker.delivery/carriers/${carrierInfo.id}/tracks/${trackingNum}`;
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) {
      // 해당 택배사에서 조회 실패 시 다른 택배사로 자동 시도
      if (carrier !== 'auto') {
        const fallbackResult = await tryAllCarriers(trackingNum, carrier);
        if (fallbackResult) return NextResponse.json(fallbackResult);
      }
      return NextResponse.json({
        carrier: carrierInfo.name,
        trackingNumber: trackingNum,
        currentStatus: '조회실패',
        steps: [],
      });
    }

    const data = await res.json();
    return NextResponse.json(formatResult(data, carrierInfo.name, trackingNum));
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      carrier: carrierInfo.name,
      trackingNumber: trackingNum,
      currentStatus: '조회실패',
      steps: [],
    }, { status: 200 });
  }
}

// CJ/롯데 순차 시도
async function tryAllCarriers(trackingNum: string, excludeCarrier: string) {
  const tryOrder = ['cj', 'lotte'];
  for (const c of tryOrder) {
    if (c === excludeCarrier) continue;
    const info = CARRIER_MAP[c];
    try {
      const res = await fetch(`https://apis.tracker.delivery/carriers/${info.id}/tracks/${trackingNum}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.state && data.state.id) {
        return formatResult(data, info.name, trackingNum);
      }
    } catch { continue; }
  }
  return null;
}

function formatResult(data: any, carrierName: string, trackingNum: string) {
  const stateId = data.state?.id || '';
  const currentStatus = STATUS_MAP[stateId] || stateId || '조회중';

  const steps = (data.progresses || []).map((p: any) => {
    const time = p.time ? new Date(p.time).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '';
    return {
      step: STATUS_MAP[p.status?.id] || p.status?.id || '',
      date: time,
      location: p.location?.name || '',
      detail: p.description || '',
    };
  });

  return {
    carrier: carrierName,
    trackingNumber: trackingNum,
    currentStatus,
    sender: data.from?.name || '',
    receiver: data.to?.name || '',
    deliveredAt: data.to?.time || '',
    steps,
  };
}
