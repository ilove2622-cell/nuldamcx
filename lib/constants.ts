export const DISPLAY_CHANNELS = [
  '카카오채널 B2B',
  '카카오채널 B2C',
  '아톡비즈_문자상담',
  '이베이',
  '네이버',
  '11번가',
  '롯데온',
  '톡스토어',
  '올웨이즈',
  'toss',
  '코케비즈',
  'NCP',
  '쿠팡',
  '알리',
  '올리브영',
  '요고',
  '카카오 지그재그',
  '캐시딜',
  '팔도감',
  '채널톡 B2C & B2B',
  '에이블리',
  '기타' 
];

export const CHANNEL_MAP: Record<string, string> = {
  '스마트 스토어': '네이버',
  '스마트스토어': '네이버',
  'ESM지마켓': '이베이',
  'ESM옥션': '이베이',
  '카카오톡스토어': '톡스토어',
  '지그재그': '카카오 지그재그',
  '롯데홈쇼핑(신)' : '롯데홈쇼핑',
  '카카오스타일 (지그재그, 포스티)' : '지그재그',
  'GS shop' : 'GS샵',
};

export const CHANNEL_URL_MAP: Record<string, string> = {
  '네이버': 'https://sell.smartstore.naver.com/#/home/dashboard',
  '쿠팡': 'https://wing.coupang.com/tenants/cs/product/inquiries',
  '이베이': 'https://www.esmplus.com/Home/v2',
  '톡스토어': 'https://shopping-seller.kakao.com/product/store-seller/qna/list?answerExist=false&period=',
  '11번가': 'https://soffice.11st.co.kr/view/main',
  '롯데온': 'https://store.lotteon.com/cm/main/index_SO.wsp',
  '카카오 지그재그': 'https://partners.kakaostyle.com/shop/cq-xgnz8ee9/cs/inquiry',
  'CJ온스타일': 'https://partners.cjonstyle.com/login',
  '올웨이즈': 'https://alwayzseller.ilevit.com/',
  'GS샵': 'https://withgs.gsshop.com/cmm/login',
  '올리브영': 'https://partner.oliveyoung.co.kr/auth/login',
  '농협몰': 'https://pscm.nonghyupmall.com/pscm/index.html',
  '이지웰': 'https://hpas.ezwel.com/views/websquare/websquare.html',
  '신세계': 'https://spo.shinsegaetvshopping.com/app/index.html',
  '삼성카드': 'https://ecpartner.samsungcard.com/loginForm.do',
  '롯데홈쇼핑': 'https://partners.lotteimall.com/',
  '베네피아': 'https://newmallvenadm.benepia.co.kr/login/loginView.do',
};

export const QUICK_LINKS = [
  { name: '톡스토어', url: 'https://shopping-sellernoti-web.kakao.com/seller/article/findList?status=UNPROCESSED' },
  { name: '올웨이즈', url: 'https://alwayzseller.ilevit.com/' },
  { name: '토스', url: 'https://shopping-seller.toss.im/customer-support' },
  { name: '알리', url: 'https://gsp.aliexpress.com/m_apps/im-chat/im#/window' },
  { name: '에이블리', url: 'https://my.a-bly.com/inquiry' },
  { name: '11번가', url: 'https://soffice.11st.co.kr/tictoc/bridge.tmall?method=goChatPage' },
  { name: '코케비즈', url: 'https://biz.koke.kr/seller/chats' },
  { name: 'B2B', url: 'https://business.kakao.com/_gGxcCxj/chats' },
  { name: '쿠팡', url: 'https://wing.coupang.com/tenants/cs/csinquiry' },
  { name: '지그재그', url: 'https://partners.kakaostyle.com/shop/cq-xgnz8ee9/cs/inquiry' },
];


export const STATUS_OPTIONS = ['전체', '신규', '대기', '답변저장', '전송요청', '처리완료'];

export const MALL_OPTIONS = ['전체', ...DISPLAY_CHANNELS.filter(c => c !== '기타'), '기타'];