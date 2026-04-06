import { NextResponse } from 'next/server';

function detectMall(text: string): string {
  const full = text;

  if (full.match(/ncp_|NaverPay|네이버페이|lion\d+/i)) return '스마트스토어';
  if (full.match(/coupang|CP_/i)) return '쿠팡';
  if (full.match(/kakao|KAK_/i)) return '카카오';
  if (full.match(/eleven|11ST/i)) return '11번가';
  if (full.match(/gmarket|GM_|auction|AUC_/i)) return 'G마켓/옥션';
  if (full.match(/lotteon/i)) return '롯데온';

  if (full.match(/SmartStore|스마트스토어/i)) return '스마트스토어';
  if (full.match(/쿠팡/i)) return '쿠팡';
  if (full.match(/카카오/i)) return '카카오';
  if (full.match(/11번가/i)) return '11번가';
  if (full.match(/옥션/i)) return '옥션';
  if (full.match(/G마켓/i)) return 'G마켓';
  if (full.match(/롯데온/i)) return '롯데온';
  if (full.match(/위메프/i)) return '위메프';
  if (full.match(/티몬/i)) return '티몬';
  return '기타';
}

function parseOrderInfo(text: string) {
  const result: Record<string, string> = {
    쇼핑몰: '', 주문번호: '', 수취인이름: '', 연락처: '', 주소: '',
    상품명: '', 옵션: '', 수량: '', 송장번호: '', 택배사: ''
  };

  result['쇼핑몰'] = detectMall(text);

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const full = text.replace(/\n/g, ' ');

  const isTrackingScreen = full.match(/운송장번호|화물추적|송하인|집하점소|배달점소|화물이동현황|상품추적.*운송장/);
  const isCJScreen = full.match(/TRTRTR|상품추적.*운송장정보|품목명.*박스타입|고객주문번호/);

  if (isCJScreen) {
    const m = full.match(/고객주문번호\s+([\d\/]+)/);
    if (m) result['주문번호'] = m[1].split('/')[0];
  } else if (!isTrackingScreen) {
    for (const line of lines) {
      const m = line.match(/쇼핑.{0,5}주문번호\s+(\d{6,})/);
      if (m) { result['주문번호'] = m[1]; break; }
      const parts = line.split(/\t/);
      for (let i = 0; i < parts.length - 1; i++) {
        if (parts[i].match(/쇼핑.{0,5}주문번호/)) {
          const val = parts[i + 1].trim();
          if (val.match(/^\d{6,}$/)) { result['주문번호'] = val; break; }
        }
      }
      if (result['주문번호']) break;
    }
    if (!result['주문번호']) {
      const m = full.match(/쇼핑.{0,5}주문번호\s+(\d{6,})/);
      if (m) result['주문번호'] = m[1];
    }
  }

  const receiverSectionEnd = isCJScreen
    ? text.search(/운임구분|품목명|상품추적\s+집배정보/)
    : text.search(/송하인|출고지|집하점소|배달점소/);
  const receiverText = receiverSectionEnd > 0 ? text.slice(0, receiverSectionEnd) : text;
  const receiverLines = receiverText.split('\n').map(l => l.trim()).filter(Boolean);
  const receiverFull = receiverText.replace(/\n/g, ' ');

  function formatPhone(phone: string) {
    const digits = phone.replace(/[^\d]/g, '');
    if (digits.startsWith('010') && digits.length === 11) {
      return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
    }
    if (digits.length === 12) {
      return `${digits.slice(0,4)}-${digits.slice(4,8)}-${digits.slice(8)}`;
    }
    if (digits.length === 11 && !digits.startsWith('010')) {
      return `${digits.slice(0,4)}-${digits.slice(4,7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    return digits.length >= 9 ? digits : phone;
  }

  if (isCJScreen) {
    const nameMatches = [...text.matchAll(/성명\s+([가-힣]{2,5})/g)];
    if (nameMatches.length >= 2) result['수취인이름'] = nameMatches[1][1];
    else if (nameMatches.length === 1) result['수취인이름'] = nameMatches[0][1];

    const phoneM = text.match(/(010[-\s]?\d{3,4}[-\s]?\d{4})/);
    if (phoneM) {
      result['연락처'] = formatPhone(phoneM[1]);
    }

    const addrPattern = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]+/g;
    const addrMatches = [...text.matchAll(addrPattern)];
    if (addrMatches.length >= 2) {
      result['주소'] = addrMatches[1][0].replace(/^\[?\d{5}\]?\s*/, '').replace(/\s+수정.*$/, '').replace(/\s{2,}.*$/, '').trim();
    } else if (addrMatches.length === 1) {
      result['주소'] = addrMatches[0][0].replace(/\s+수정.*$/, '').trim();
    }

    const productM = text.match(/품목명\s+(.+?)(?:\s{2,}|박스타입|\n|$)/);
    if (productM) {
      result['상품명'] = productM[1].replace(/[▶►▷~].*/,'').replace(/\s*합포장.*/,'').trim();
    }

    const qtyM = text.match(/수량\s+(\d+)/);
    if (qtyM) result['수량'] = qtyM[1];

    result['택배사'] = 'CJ대한통운';

    const trackM = text.match(/운송장번호\s+([\d\-]{10,})/);
    if (trackM) {
      const digits = trackM[1].replace(/[^\d]/g, '');
      result['송장번호'] = digits.length === 12 ? `${digits.slice(0,4)}-${digits.slice(4,8)}-${digits.slice(8)}` : trackM[1];
    }
    return result;
  }

  if (!result['수취인이름']) {
    for (const line of lines) {
      const m = line.match(/수하인\s+([가-힣]{2,5})(?:\s|$)/) || line.match(/수취인\s+([가-힣]{2,5})(?:\s|$)/);
      if (m) { result['수취인이름'] = m[1]; break; }
    }
  }
  if (!result['수취인이름']) {
    for (const line of lines) {
      if (line.match(/수정/) && line.match(/\d{3,4}[-\s]\d{4}/)) {
        const beforePhone = line.replace(/[\d\-]{9,}.*$/, '');
        const m = beforePhone.match(/([가-힣]{2,5})\s+수정\s*$/);
        if (m && !m[1].match(/문앞|PC명|배송|상품|메세지/)) {
          result['수취인이름'] = m[1]; break;
        }
      }
    }
  }
  if (!result['수취인이름']) {
    const namePatterns = [
      /[•·]\s*수하인\s+([가-힣]{2,5})/, /수하인\s*[\|:]?\s*([가-힣]{2,5})/, /수취인\s*[\|:]?\s*([가-힣]{2,5})/,
      /받는\s*분\s*[\|:]?\s*([가-힣]{2,5})/, /고객명\s*[\|:]?\s*([가-힣]{2,5})/,
    ];
    for (const p of namePatterns) {
      const m = full.match(p);
      if (m) { result['수취인이름'] = m[1]; break; }
    }
  }

  if (!result['연락처']) {
    for (const line of lines) {
      const m = line.match(/수하인.+?전화번호.?\s+([\d\-]{10,})/);
      if (m) { result['연락처'] = formatPhone(m[1]); break; }
    }
  }
  if (!result['연락처']) {
    for (const line of lines) {
      const m = line.match(/수취인전화번호.?\s+([\dL\-]{9,})/);
      if (m) { result['연락처'] = formatPhone(m[1]); break; }
    }
  }
  if (!result['연락처']) {
    const phoneM = receiverFull.match(/([\d]{3,4}[-][\d\-]{7,})/);
    if (phoneM) result['연락처'] = formatPhone(phoneM[1]);
  }

  // ==== 주소 파싱 ====
  const addrKeyword = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/;
  let addrFound = false;
  
  // 1. 수취인 영역에서 먼저 찾기
  if (!addrFound) {
    for (const line of receiverLines) {
      if (addrKeyword.test(line)) {
        let addr = line.replace(/^\[?\d{5}\]?\s*/, '').replace(/^주소\s*/, '');
        const regionMatch = addr.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주).+/);
        if (regionMatch) addr = regionMatch[0];
        addr = addr.replace(/\s+수정.*$/i, '').replace(/\s*[•·]\s*주소.*$/,'').replace(/\s*(배송메세지|메모|배송메모).*/i, '').replace(/\s{2,}.*$/, '').trim();
        if (addr.length > 5) { result['주소'] = addr; addrFound = true; break; }
      }
    }
  }

  // 2. 전체 텍스트에서 보조로 찾기 (강력한 예외 처리)
  if (!addrFound) {
    for (const line of lines) {
      if (addrKeyword.test(line)) {
        let addr = line.replace(/^\[?\d{5}\]?\s*/, '').replace(/^주소\s*/, '');
        const regionMatch = addr.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주).+/);
        if (regionMatch) addr = regionMatch[0];
        addr = addr.replace(/\s+수정.*$/i, '').replace(/\s*[•·]\s*주소.*$/, '').replace(/\s*(배송메세지|메모).*/i, '').trim();
        if (addr.length > 5) { result['주소'] = addr; break; }
      }
    }
  }

  // ==== 상품명 파싱 ====
  const headerKeyword = /\[?품번|SKU.*코드|자체상품코드|쇼핑몰상품코드|수집상품명/;
  for (let i = 0; i < lines.length; i++) {
    if (headerKeyword.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const candidate = lines[j].trim();
        if (candidate.match(/상품보기|재고보기|관리자메모|수집옵션|단품코드/)) continue;
        if (candidate.match(/^\d[\d\s|]+C\s/)) continue;
        if (candidate.match(/^공급가|^수량|^\d{1,3},\d{3}/)) continue;
        if (candidate.match(/[가-힣]/) && candidate.length >= 8) {
          result['상품명'] = candidate.replace(/\s*\d{1,3},\d{3}.*$/, '').trim(); break;
        }
      }
      if (result['상품명']) break;
    }
  }
  if (!result['상품명']) {
    const m = full.match(/[•·]\s*상품명\s+(.+?)(?:\s*합포장|\s*[•·]|$)/);
    if (m) result['상품명'] = m[1].trim();
  }
  if (result['상품명']) {
    result['상품명'] = result['상품명'].replace(/^[•·]\s*상품명\s*/i, '').replace(/\s*합포장상품.*$/i, '').replace(/\s*합포장.*$/i, '').trim();
  }

  // ==== 옵션 및 수량 파싱 ====
  const optM = text.match(/수집.{0,2}선명\s*:\s*(.+?)(?:\t|\n|$)/);
  if (optM && !optM[0].match(/단품코드/)) result['옵션'] = optM[1].replace(/\s*\([\d,.]+\)\s*$/, '').trim();
  
  if (!result['수량']) {
    const qtyPatterns = [/수량\s*[\|:]?\s*(\d+)/, /(\d+)\s*개/, /qty\s*[\|:]?\s*(\d+)/i];
    for (const p of qtyPatterns) {
      const m = full.match(p);
      if (m) { result['수량'] = m[1]; break; }
    }
  }

  // ==== 송장번호 및 택배사 파싱 ====
  const trackPatterns = [/송장\s*번호\s*[\|:]?\s*([\d\-]{10,})/, /운송장\s*[\|:]?\s*([\d\-]{10,})/, /\b(6\d{9,12})\b/, /\b(\d{12,13})\b/];
  for (const p of trackPatterns) {
    const m = full.match(p);
    if (m && m[1] !== result['주문번호']) {
      const digits = m[1].replace(/[^\d]/g, '');
      result['송장번호'] = digits.length === 12 ? `${digits.slice(0,4)}-${digits.slice(4,8)}-${digits.slice(8)}` : m[1];
      break;
    }
  }

  // 1. 송장정보/송장번호 라인에서 찾기
  if (!result['택배사']) {
    for (const line of lines) {
      if (line.match(/송장정보|송장번호/)) {
        const carrierM = line.match(/(대한통운|대한동운|대한동문|대한동은|CJ대한통운|한진|롯데|우체국|로젠|경동|대신)/);
        if (carrierM) {
          result['택배사'] = carrierM[1].match(/대한/) ? 'CJ대한통운' : carrierM[1]; break;
        }
      }
    }
  }

  // 2. 전체 텍스트에서 보조로 찾기 (강력한 예외 처리)
  if (!result['택배사']) {
    const carrierMap = [
      [/대한통운|대한동운|대한동문|대한동은/, 'CJ대한통운'],
      [/CJ대한통운/, 'CJ대한통운'],
      [/롯데.{0,4}택배|롯데글로벌/, '롯데택배'],
      [/한진택배|한진/, '한진택배'],
      [/우체국/, '우체국택배'],
      [/로젠택배|로젠/, '로젠택배'],
      [/경동택배/, '경동택배'],
      [/대신택배/, '대신택배'],
    ];
    for (const [pattern, name] of carrierMap) {
      if (full.match(pattern)) { result['택배사'] = name as string; break; }
    }
  }

  return result;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey, base64, mimeType } = body;

    if (!base64) {
      return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
    }

    const formData = new URLSearchParams();
    const activeApiKey = process.env.OCR_API_KEY || process.env.OCR_SPACE_API_KEY || apiKey || 'K82110292788957';
    formData.append('apikey', activeApiKey); 
    formData.append('base64Image', `data:${mimeType || 'image/jpeg'};base64,${base64}`);
    formData.append('language', 'kor');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('isTable', 'true');
    formData.append('OCREngine', '2'); 

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const data = await response.json();

    if (data.IsErroredOnProcessing) {
      return NextResponse.json({ error: data.ErrorMessage?.[0] || 'OCR 처리 에러' }, { status: 500 });
    }

    const parsedText = data.ParsedResults?.[0]?.ParsedText || '';
    
    const resultInfo = parseOrderInfo(parsedText);

    return NextResponse.json({ 
      result: resultInfo,   
      rawText: parsedText   
    });

  } catch (err: any) {
    console.error('OCR 에러:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}