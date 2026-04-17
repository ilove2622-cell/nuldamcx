# 채널톡 채팅 자동응답 — 작업 핸드오프

## 목표
채널톡(카카오톡/네이버톡톡/웹챗 통합 허브)에 들어오는 채팅을 nuldamcx 프로젝트에서 받아서:
1. 주문번호 감지 시 → 사방넷 조회 → 자동응답
2. 일반 문의 → Gemini로 답변 생성 → 신뢰도 기반 자동응답 또는 상담사 에스컬레이션
3. **테스트기간엔 자동발송 OFF (드라이런)** — DB에만 기록, 발송은 안 함

## 운영 정책
- 모든 채널 대상 (카카오톡 + 네이버톡톡 + 채널톡 웹챗)
- 초기 모드: **드라이런** (`AUTO_REPLY_MODE=dryrun`) — 검증 후 `live` 전환
- LLM: **Gemini 먼저** (Claude는 나중에 추가)
- 인사말 통일: `안녕하세요, Suggest the better 널 담입니다.`
- 무조건 에스컬레이션: 환불/교환/취소, 클레임, 파손/오배송, 주문번호 못찾음, 같은 질문 반복 3회

## 채널톡 Webhook 등록 (이미 등록됨)
- 이름: 클로드 테스트2
- URL: `https://nuldamcx.vercel.app/api/webhook/channeltalk`
- 토큰: `3ff1193bcd38c14a1a49afc3547ac279` (HMAC 서명검증용)
- 구독: 유저챗 대화 ✅, 유저챗 열릴 때 ✅

## 채널톡 API 인증 (~/CLAUDE.md 메모리 참고)
- Access Key: `69b3e7a4e53e89238328`
- Access Secret: `a60c5638f778fbf5ad9c973e2910102a`
- Channel ID: `35237`
- Base URL: `https://api.channel.io/open/v5`

## 입점몰 주문번호 패턴 (실데이터 기준 — Supabase `inquiries`)
| 입점몰 | 패턴 | 예시 |
|---|---|---|
| 쿠팡 | 13~14자리 숫자 | `4100183511379` |
| 스마트스토어 | 16자리 숫자 (YYYYMMDD+8) | `2026031622702781` |
| 11번가 | 17자리 숫자 | `20260415059186080` |
| 롯데온 | 16자리 숫자 | `2026040515550148` |
| 롯데홈쇼핑 | YYYYMMDD+영문1자+5자리 | `20260411D86785` |
| CJ온스타일 | YYYYMMDD+6자리-001-001-001 | `20260413120122-001-001-001` |
| 카카오스타일 | 18자리 숫자 | `139610090017138986` |
| 카카오톡스토어 | 10자리 숫자 | `3304770419` |
| GS shop | 10자리 숫자 | `3442923255` |
| ESM(지마켓/옥션) | 10자리 숫자 | `4422604616` |
| 사방넷 내부 | 8자리 숫자 | `51065947` |

## 진행 상태

### ✅ 완료
- `lib/order-parser.ts` — 입점몰 주문번호 정규식 + 몰 식별
- `lib/sabangnet-order-lookup.ts` — 사방넷 조회 헬퍼 + 자동응답 포맷터

### 🔨 남은 작업
- [ ] `lib/channeltalk-client.ts` — 채널톡 API 클라이언트
  - `sendMessage(chatId, text)` — Open API v5 `/user-chats/{id}/messages` POST (Bot 발송)
  - `assignToBot(chatId)` / `unassignFromBot(chatId)` — 봇 배정/해제
  - `addTag(chatId, tag)` — 태그 추가
  - `verifyWebhookSignature(rawBody, signature)` — HMAC 검증 (토큰 사용)
- [ ] `lib/llm-router.ts` — Gemini 기반
  - `generate(prompt, context)` → `{ answer, confidence (0-1), category, escalate (bool), reason }`
  - `generate-draft/route.ts`의 멀티키 폴백 + RAG(`match_scripts`) 패턴 그대로 차용
  - 시스템 프롬프트에 "신뢰도와 카테고리도 JSON으로 같이 내라"
  - 카테고리: `주문조회|배송|환불|교환|취소|클레임|상품문의|기타`
- [ ] `lib/escalation.ts`
  - `escalate(chatId, reason, category)` — 봇 배정해제 + 태그 추가 + 내부 메모
  - 무조건 에스컬레이션 카테고리 체크
- [ ] `app/api/webhook/channeltalk/route.ts` — 메인 웹훅 핸들러
  - 서명 검증
  - 이벤트 타입 분기: `userChat.created` (인사) / `message.created` (응답)
  - 플로우:
    1. 주문번호 감지 → 사방넷 조회 → 응답 생성
    2. 키워드 룰 매칭 (auto_reply 같은 거 — 단순 FAQ는 옵션)
    3. LLM 호출 → 신뢰도 + 카테고리
    4. 신뢰도 ≥ 0.8 && 안전 카테고리 → 발송 (드라이런이면 DB만)
    5. 그 외 → escalate()
- [ ] `supabase/migrations/chat_tables.sql` — 새 테이블
  - `chat_sessions` (id, channel_talk_user_chat_id, channel_type, customer_id, status, opened_at, closed_at)
  - `chat_messages` (id, session_id, sender, text, created_at)
  - `ai_responses` (id, message_id, model, prompt, answer, confidence, category, sent_at, mode: dryrun|live)
  - `escalations` (id, session_id, reason, category, created_at)
- [ ] `.env` 추가 변수
  ```
  CHANNELTALK_ACCESS_KEY=69b3e7a4e53e89238328
  CHANNELTALK_ACCESS_SECRET=a60c5638f778fbf5ad9c973e2910102a
  CHANNELTALK_CHANNEL_ID=35237
  CHANNELTALK_WEBHOOK_TOKEN=3ff1193bcd38c14a1a49afc3547ac279
  AUTO_REPLY_MODE=dryrun
  AUTO_REPLY_CONFIDENCE_THRESHOLD=0.8
  ```

## 기존 자산 (재사용)
- `app/api/generate-draft/route.ts` — Gemini 멀티키 폴백 + RAG 패턴 (이거 그대로 라우터에 차용)
- `app/api/sabangnet-req-order/route.ts` — 사방넷 조회용 XML 콜백 엔드포인트 (이미 동작 중)
- `app/api/webhook/fetch-order-details/route.ts` — 사방넷 응답 파싱 패턴

## 터미널에서 이어가는 방법

```bash
cd C:/Users/User/nuldamcx
claude
```

그 다음 첫 메시지로 이거 붙여넣기:

> `HANDOFF_CHAT_AUTOREPLY.md` 읽고 "남은 작업" 항목 순서대로 구현해줘. 모든 채널 대상이고 초기엔 드라이런 모드(자동발송 OFF, DB만 기록). LLM은 Gemini 먼저, 멀티키 폴백 패턴은 generate-draft/route.ts 거 그대로 쓰면 됨.
