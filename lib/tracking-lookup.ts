// 택배 실시간 배송조회 (tracker.delivery 오픈 API)
// 널담: CJ대한통운 + 롯데택배만 사용

const CARRIER_MAP: Record<string, { id: string; name: string }> = {
  cj:    { id: 'kr.cjlogistics', name: 'CJ대한통운' },
  lotte: { id: 'kr.lotte',       name: '롯데택배' },
};

// ⚠️ 2026-04 기준 규칙. 택배사 송장번호 체계 변경 시 아래 매핑 업데이트 필요
const PREFIX_CARRIER_MAP: Record<string, string> = {
  '6': 'cj',
  '2': 'lotte',
};

const STATUS_MAP: Record<string, string> = {
  information_received: '접수',
  at_pickup: '상품인수',
  in_transit: '배송중',
  out_for_delivery: '배송출발',
  delivered: '배달완료',
};

export interface TrackingResult {
  carrier: string;
  trackingNumber: string;
  currentStatus: string;
  sender: string;
  receiver: string;
  deliveredAt: string;
  steps: { step: string; date: string; location: string; detail: string }[];
}

function detectCarrier(courierName: string, trackingNum: string): string {
  const digits = trackingNum.replace(/[-\s]/g, '');
  const prefix = digits.charAt(0);
  if (prefix && PREFIX_CARRIER_MAP[prefix]) return PREFIX_CARRIER_MAP[prefix];
  const n = courierName.toLowerCase();
  if (n.includes('롯데')) return 'lotte';
  return 'cj';
}

function formatResult(data: any, carrierName: string, trackingNum: string): TrackingResult {
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

/** 송장번호로 실시간 배송조회 (직접 함수 호출용) */
export async function lookupTracking(trackingNum: string, courierName?: string): Promise<TrackingResult> {
  const digits = trackingNum.replace(/[-\s]/g, '');
  const carrier = detectCarrier(courierName || '', digits);
  const carrierInfo = CARRIER_MAP[carrier] || CARRIER_MAP.cj;

  try {
    const res = await fetch(`https://apis.tracker.delivery/carriers/${carrierInfo.id}/tracks/${digits}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.state && data.state.id) {
        return formatResult(data, carrierInfo.name, trackingNum);
      }
    }

    // 실패 시 다른 택배사 시도
    const other = carrier === 'cj' ? 'lotte' : 'cj';
    const otherInfo = CARRIER_MAP[other];
    const res2 = await fetch(`https://apis.tracker.delivery/carriers/${otherInfo.id}/tracks/${digits}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2.state && data2.state.id) {
        return formatResult(data2, otherInfo.name, trackingNum);
      }
    }
  } catch { /* ignore */ }

  return {
    carrier: carrierInfo.name,
    trackingNumber: trackingNum,
    currentStatus: '조회실패',
    sender: '', receiver: '', deliveredAt: '', steps: [],
  };
}
