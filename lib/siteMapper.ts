// lib/siteMapper.ts
import { DISPLAY_CHANNELS } from './constants';

export function normalizeSiteName(rawName: string): string {
  if (!rawName) return '기타';

  // [1단계] 강력한 문자열 정제 (Nuclear Cleaning)
  // 1. 문자열로 변환
  // 2. normalize('NFC'): 맥/윈도우 간 한글 자모 분리 현상 해결
  // 3. replace: 모든 공백, 탭, 줄바꿈 제거
  // 4. toLowerCase: 영어 소문자 통일
  const cleanName = String(rawName)
    .normalize('NFC') 
    .replace(/[\s\uFEFF\xA0]+/g, '') // 눈에 안 보이는 공백까지 싹 제거
    .toLowerCase();

  // --- [사용자 요청 1순위 매핑] ---
  
  // 1. 네이버 그룹 (스마트스토어)
  if (cleanName.includes('스마트스토어') || cleanName.includes('네이버') || cleanName.includes('smartstore')) {
    return '네이버';
  }

  // 2. Toss 그룹 (토스쇼핑)
  if (cleanName.includes('토스') || cleanName.includes('toss')) {
    return 'toss';
  }

  // 3. 쿠팡
  if (cleanName.includes('쿠팡') || cleanName.includes('coupang')) {
    return '쿠팡';
  }

  // 4. 이베이 그룹 (ESM, 옥션, 지마켓)
  // "ESM옥션", "ESM지마켓", "이베이" 모두 여기서 걸립니다.
  if (
    cleanName.includes('esm') || 
    cleanName.includes('이베이') || 
    cleanName.includes('ebay') || 
    cleanName.includes('auction') || 
    cleanName.includes('gmarket') ||
    cleanName.includes('옥션') ||
    cleanName.includes('지마켓')
  ) {
    return '이베이';
  }

  // 5. 톡스토어 (카카오톡스토어)
  if (cleanName.includes('톡스토어') || cleanName.includes('카카오톡스토어') || cleanName.includes('store-kakaotalk')) {
    return '톡스토어';
  }

  // 6. 카카오 지그재그 (카카오스타일)
  if (cleanName.includes('카카오스타일') || cleanName.includes('지그재그') || cleanName.includes('zigzag') || cleanName.includes('포스티')) {
    return '카카오 지그재그';
  }

  // --- [기타 수집 목록 매핑] ---

  if (cleanName.includes('11번가') || cleanName.includes('11st')) return '11번가';
  if (cleanName.includes('롯데온') || cleanName.includes('lotteon')) return '롯데온';
  if (cleanName.includes('올웨이즈') || cleanName.includes('alwayz')) return '올웨이즈';
  if (cleanName.includes('알리') || cleanName.includes('aliexpress')) return '알리';
  if (cleanName.includes('올리브영') || cleanName.includes('oliveyoung')) return '올리브영';
  if (cleanName.includes('에이블리') || cleanName.includes('ably')) return '에이블리';
  if (cleanName.includes('요고') || cleanName.includes('yogo')) return '요고';
  if (cleanName.includes('캐시딜')) return '캐시딜';
  if (cleanName.includes('팔도감')) return '팔도감';
  if (cleanName.includes('코케비즈')) return '코케비즈';
  if (cleanName.includes('아톡')) return '아톡비즈_문자상담';
  if (cleanName.includes('ncp')) return 'NCP';

  // 카카오채널 상세 구분
  if (cleanName.includes('카카오') && cleanName.includes('b2b')) return '카카오채널 B2B';
  if (cleanName.includes('카카오') && cleanName.includes('b2c')) return '카카오채널 B2C';
  // 그냥 '카카오채널'만 있으면 B2C로 넣을지, 기타로 넣을지 결정 필요 (일단 기타 방지용으로 B2C 매핑 예시)
  if (cleanName === '카카오채널') return '카카오채널 B2C'; 

  if (cleanName.includes('채널톡')) return '채널톡 B2C & B2B';

  // --- [정확히 일치하는지 확인] ---
  // 공백 제거된 버전끼리 비교 (DISPLAY_CHANNELS의 공백도 제거하고 비교)
  const exactMatch = DISPLAY_CHANNELS.find(
    ch => ch.replace(/[\s\uFEFF\xA0]+/g, '').toLowerCase() === cleanName
  );
  if (exactMatch) return exactMatch;

  // 여기까지 왔는데 매핑 안되면 진짜 기타
  return '기타';
}