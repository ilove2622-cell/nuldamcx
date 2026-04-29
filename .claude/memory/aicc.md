# nuldam-aicc (AICC 전화 서버)

## 개요
- OpenAI Realtime API 기반 AI 음성 상담 서버 (Python/FastAPI)
- 소스: `C:/Users/User/Desktop/nuldam-aicc/`
- GitHub: `ilove2622-cell/nuldam-aicc`
- 배포: Railway → `https://nuldam-aicc-production.up.railway.app`
- 모델: `gpt-4o-mini-realtime-preview`, 음성: `coral`

## 도구 (5개)
| 도구 | 기능 |
|---|---|
| `lookup_order` | 주문번호 또는 휴대폰번호로 사방넷 주문조회 (수취인→주문자 순 검색) |
| `track_delivery` | 송장번호로 배송추적 (tracker.delivery) |
| `check_hours` | 영업시간 확인 (평일 10:00~17:00) |
| `submit_claim` | 클레임 접수 → 시트 기록 + SMS 사진 링크 (주문상세 10개 필드 포함) |
| `transfer_to_agent` | 상담원 콜백 접수 (사유 + 전화번호 필수) |

## 비즈니스 룰
- 파손/불량/오배송/환불/교환 → **사진 증빙 필수** → submit_claim → SMS
- 주문취소 → **신규주문만 가능**, 주문확인/출고대기 → 불가 안내
- 상담원 연결 → 콜백 방식 (사유 + 전화번호)

## 시트 열 구조 (클레임 탭, A~N)
A:접수일시 | B:Claim ID | C:주문사이트 | D:주문번호 | E:수취인명
F:수취인전화번호 | G:주소 | H:주문상품 | I:송장번호
J:유형 | K:처리요청 | L:사진URL | M:처리상태 | N:비고

## Claim ID 형식
`CLM-YYYYMMDD-NNN` (예: CLM-20260429-001)

## 환경변수 (Railway)
- OPENAI_API_KEY, SABANGNET_ID, SABANGNET_API_KEY, DOMAIN
- GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, CLAIM_SHEET_ID
- ATALKBIZ_API_KEY, ATALKBIZ_SENDER_NUMBER (15337941)
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

## 남은 작업 (2026-04-29)
- [ ] CLAIM_SHEET_ID 설정 (구글시트 '클레임' 탭 생성 필요)
- [ ] Supabase `claim-photos` 버킷 생성 (public)
- [ ] ATALKBIZ_API_KEY 설정
- [ ] DOMAIN 값 확인 (`https://nuldam-aicc-production.up.railway.app`)
