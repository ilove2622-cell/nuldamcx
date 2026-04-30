# Claude Memory

## 완료된 인프라 셋업

### 멀티 PC Dropbox 동기화 (2026-04-30 완료) ✅

- **방식**: 개인 Dropbox(Basic 무료) + Junction
- **Junction**: 메인/새 PC 모두 `~/.claude/` → `~/Dropbox/claude-sync/`
- **동기화 데이터**: 토큰(`.credentials.json`), 대화기록(`projects/*.jsonl`), 메모리, 설정, 플러그인 — 전부 자동 sync
- **현재 사용량**: 약 250MB / 2GB (~12%)
- **셋업 스크립트** (재셋업 또는 또 다른 PC 추가용):
  - 메인 PC용: `C:\Users\User\setup-claude-dropbox-main.ps1`
  - 새 PC용: `~\Dropbox\setup-claude-dropbox-newpc.ps1` (Dropbox로 자동 sync됨)
- **새 PC 추가 시**: Dropbox 로그인 → sync 대기 → Claude Code 설치 → newpc 스크립트 1회 실행
- **운영 규칙**:
  - 두 PC 동시 사용 시 입력은 한 번에 한 PC에서만 (sync 충돌 방지)
  - PC 전환 시 Dropbox 트레이 "Up to date" 확인 후 다른 PC 시작
  - claude-sync 폴더는 "오프라인에서 사용 가능"(Pinned)으로 설정 — 항상 로컬 보관
- **백업**: `~\.claude.bak.20260430_115146` (정상 작동 검증 후 삭제 가능)

### 폐기된 git 메모리 sync 방식

- 어제(2026-04-29) 만들었던 git 기반 메모리 sync(`.claude/memory/` git push)는 **Dropbox 도입으로 폐기**
- 정리 작업 미완료:
  - 프로젝트 git의 `.claude/memory/` 제거 + `.gitignore` 추가 필요
  - session-start/end git pull/push hook은 그대로 둘지 폐기할지 결정 필요 (메모리는 Dropbox로 가지만 hook은 다른 용도로 유용할 수 있음)

## 채널톡 API 연동

- Access Key: `69b3e7a4e53e89238328`
- Access Secret: `a60c5638f778fbf5ad9c973e2910102a`
- Base URL: `https://api.channel.io/open/v5`
- Channel ID: `35237`

### 채널 유형 매핑
- `appKakao` → 카카오톡
- `appNaverTalk` → 네이버톡톡
- 빈값(`None`/`native`) → 채널톡

### 처리 완료 상태
- `state=closed` = 처리 완료(closed) 건

### 자주 쓰는 쿼리
- 오늘 처리 건수: `/user-chats?state=closed&limit=100` → `closedAt` 기준 KST 오늘 날짜 필터
- 페이지네이션: `next` 토큰 사용, `closedAt < today_start`이면 중단

## 사방넷 API 연동

- API Key: `bxP7r60W7rFXSEyr8CT8Y57PCY5VE4F44NR`

## 널담 택배사
- CJ대한통운, 롯데택배 두 곳만 사용
- 배송조회: tracker.delivery 오픈 API 사용 (kr.cjlogistics, kr.lotte)
- 송장번호 앞자리 판별 (2026-04 기준, 향후 변경 가능): 6→CJ대한통운, 2→롯데택배
- 변경 시 `app/api/tracking/route.ts`의 `PREFIX_CARRIER_MAP` 수정

## nuldamcx 프로젝트 (CX 통합 워크스페이스)

- [채널톡 Webhook 토큰](channeltalk_webhook.md) — `/api/webhook/channeltalk` 서명검증용
- [AICC 전화 서버](aicc.md) — OpenAI Realtime API 기반 AI 음성 상담

### 주요 탭 (NavBar)
채팅상담 | 게시판 | 클레임 | AICC | 분석 | 문의현황 | VOC | OCR | 설정

### 클레임 시스템 (2026-04-29)
- 전화(AICC) → submit_claim → 구글시트 기록 + SMS 사진 링크 발송
- 고객 사진 업로드: `/claim/[id]` (모바일 최적화, 최대 3장)
- 상담원 관리: `/claims` 탭 (검색/필터/상태변경)
- 사진 저장: Supabase Storage `claim-photos` 버킷
- 시트 열 A~N: 접수일시|ClaimID|주문사이트|주문번호|수취인명|수취인전화|주소|주문상품|송장번호|유형|처리요청|사진URL|처리상태|비고

### Google 서비스 계정
- Email: `nuldamcx@nuldam-cx.iam.gserviceaccount.com`
- Project: `nuldam-cx`
- JSON key: `C:/Users/User/Downloads/nuldam-cx-64134d2c6d7b.json`
- Vercel에 GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY 설정 완료

### 남은 설정 작업
- [ ] CLAIM_SHEET_ID: 구글시트 '클레임' 탭 생성 → 서비스계정에 공유 → Railway + Vercel 설정
- [ ] Supabase `claim-photos` 버킷 생성 (public)
- [ ] ATALKBIZ_API_KEY 설정 (Railway)
- [ ] DOMAIN 값 확인 (Railway AICC)

## 사용자 선호
- 코드 없이 바로 결과만 확인해주면 됨 (API 직접 조회해서 요약 제공)
- 이전에 확인한 API/설정 정보는 기록해두고 다시 묻지 말 것
- 오류 수정 후 반드시 검증(빌드, API 호출 등)까지 완료할 것

## 작업 검증 체계
- [체크리스트 & 실수 기록](checklist.md) — 과거 실수 사례 + 작업 유형별 필수 검증 항목
- CLAUDE.md에 필수 규칙 등록됨 → 모든 세션에서 자동 적용
- 새로운 실수 발생 시 checklist.md에 사례 추가할 것

## nuldamcx Supabase 주의사항
- chat_sessions, chat_messages, ai_responses, escalations 테이블은 RLS가 걸려있어 anon key로 직접 접근 불가
- 클라이언트 페이지에서는 반드시 `/api/chat/*` API 라우트(service role key) 경유해야 함
- 기존 inquiries, substance_cases 등은 anon key로 접근 가능

## nuldamcx 배포 (필수: 항상 Railway + Vercel 동시 배포)
- Railway: `git push origin main` → 자동 배포
- Vercel: `npx vercel --prod` → 자동 빌드/배포, Production URL: **nuldamcx-delta.vercel.app**
- ⚠️ `nuldamcx.vercel.app`은 구버전! 코드 내 self-call URL은 반드시 `nuldamcx-delta.vercel.app` 사용
- **수정/배포 시 반드시 Railway(git push)와 Vercel(npx vercel --prod) 모두 한번에 진행할 것**

## PC BSOD/네트워크 끊김 문제 (2026-04-24 업데이트)
- **증상**: 인터넷 끊김 + 검은 화면 → 전원 버튼 강제 종료 필요
- **진짜 원인**: BSOD 0x9F (DRIVER_POWER_STATE_FAILURE) + GPU WATCHDOG 타임아웃
- **하드웨어**: Samsung NT950XFT-A51AS (Galaxy Book)
  - GPU: Intel Iris Xe, WiFi: Intel AX211, 이더넷: Realtek USB GbE (RTL8153)
- **BSOD 이력**: 04/17, 04/20, 04/21, 04/22, **04/24** — 모두 BugCheck 0x9F
- **04/23 GPU 드라이버 업데이트 실패**: Windows Update에서 40.25.926.173 설치 성공 표시되었으나, 실제 드라이버 31.0.101.4314 그대로 (Extension만 업데이트됨, 메인 Display 드라이버 미적용)
- **5차 수정 (04-24)**:
  - GPU PnPCapabilities=24 설정 (전원관리 비활성화) — 어제 누락되었던 것
  - USB4 Virtual Power PDO 전원관리 비활성화 (Enable:True → False)
  - Realtek SelectiveSuspend=0, WakeEnabled=0 추가 설정
  - 절전/최대절전 모드 완전 비활성화 (standby=0, hibernate=0)
  - Intel Graphics Power Plan 최대 성능 모드 설정
  - Intel DSA(Driver & Support Assistant) 설치 완료 (winget)
- **6차 수정 (04-24, 재부팅 후)**:
  - Realtek USB GbE 드라이버 업데이트 완료: 1153.8.608.2022 → **1153.22.20.113**
  - Intel GPU 메인 드라이버 업데이트 완료: 31.0.101.4314 → **32.0.101.7085** (2026-03-03)
    - Intel 공식 11th-14th Gen 드라이버 (gfx_win_101.7085.exe) GUI 설치
    - 사일런트 모드(-s)는 exit code 7로 실패, GUI 모드로 성공
  - 모든 전원관리 설정 재부팅 후 유지 확인 완료
  - **모든 조치 완료 — BSOD 재발 여부 모니터링 중**
