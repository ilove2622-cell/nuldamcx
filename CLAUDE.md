# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

이 저장소는 **널담(nuldam)** 쇼핑몰의 CS(고객서비스) 자동화 도구 모음입니다.

| 디렉토리/파일 | 설명 |
|---|---|
| `nuldam/` | 채널톡 웹훅 자동응답 서버 (Python/FastAPI) |
| `sabangnet_cs_auto_reply.py` | 사방넷 CS 자동응답 스탠드얼론 스크립트 |
| `sabangnet_downloader.py` | 사방넷 다운로더 설정 |

---

## nuldam/ — 채널톡 자동응답 서버

### 실행

```bash
cd nuldam
pip install -r requirements.txt
python main.py
# 또는
run.bat
```

### 아키텍처

- **`main.py`**: FastAPI 앱. `/webhook` 엔드포인트가 채널톡 `message_created` 이벤트를 수신하고, 메시지에서 쿠팡 주문번호를 감지하면 `coupang_client`로 실시간 조회 후 응답. 주문번호 없으면 `auto_reply`의 키워드 매칭 사용.
- **`auto_reply.py`**: 키워드 → 답변 규칙(`RULES` 리스트). 새 자동응답 추가 시 여기만 수정.
- **`channel_client.py`**: 채널톡 Open API v5 클라이언트 (`send_message`, `assign_to_bot`).
- **`coupang_client.py`**: 쿠팡 파트너스 API 클라이언트.
- **`config.py`**: `python-dotenv`로 `.env` 파일에서 키 로드.

### 환경변수 (`.env`)

```
CHANNEL_ACCESS_KEY=...
CHANNEL_ACCESS_SECRET=...
COUPANG_ACCESS_KEY=...
COUPANG_SECRET_KEY=...
COUPANG_VENDOR_ID=...
PORT=8000
```


---

## sabangnet_cs_auto_reply.py — 사방넷 자동응답

스탠드얼론 CLI 스크립트. 로컬 HTTP 서버 + serveo.net SSH 터널을 띄워 사방넷 XML API 콜백을 받는 방식.

```bash
pip install requests google-generativeai
python sabangnet_cs_auto_reply.py           # 오늘 문의
python sabangnet_cs_auto_reply.py --days 3  # 최근 3일
python sabangnet_cs_auto_reply.py --dry-run # 미리보기만
```

스크립트 상단의 `GEMINI_API_KEY`를 설정해야 실행됨.

---

## 작업 검증 규칙 (필수)

모든 코드 작업 시 아래 규칙을 반드시 따를 것. 상세 체크리스트는 `memory/checklist.md` 참조.

### 1. 단계별 검증
- 코드 작성 → `npm run build` 통과 → API 실제 호출 확인 → 배포 → 배포 후 URL 확인
- 각 단계를 통과해야 다음으로 넘어감. 빌드 안 돌리고 "완료"라고 하지 말 것

### 2. 작은 단위로 진행
- 한 번에 5개 파일 만들지 말고, 1~2개씩 만들고 검증 후 다음으로
- API route 먼저 → 동작 확인 → 그 다음 프론트엔드

### 3. 다중 파일 수정 시
- 변경 전: 영향받는 파일 전체 목록을 먼저 나열
- 변경 후: 모든 관련 파일을 다시 읽어서 필드명/타입/순서 대조

### 4. 에러 대응
- 에러 발생 시 추측으로 코드 수정 금지
- 에러 메시지 → 원인 특정 → 최소 범위 수정

### 5. 외부 의존성 명시
- 새 환경변수 추가 시 "어디에 설정해야 하는지" 즉시 안내 (로컬, Vercel, Railway)
- 코드만으로 안 되는 작업(버킷 생성, 시트 공유 등)은 "미완료 목록"에 명시

---

## 새 PC 초기 설정 (memory 동기화)

이 프로젝트의 Claude Code memory 파일은 `.claude/memory/`에 git으로 관리됩니다.
새 PC에서 처음 사용할 때 아래 명령어로 symlink를 생성해야 합니다:

```bash
# 프로젝트 루트에서 실행 (1회만)
mkdir -p ~/.claude/projects/C--Users-User/
ln -s "$(pwd)/.claude/memory" ~/.claude/projects/C--Users-User/memory
```

symlink 없이도 CLAUDE.md는 자동 로드되지만, memory 파일(MEMORY.md, checklist.md 등)은 위 설정이 필요합니다.

---

## 외부 API 연동 정보

- **채널톡 API**: `https://api.channel.io/open/v5`, Channel ID: `35237`
- **사방넷 API**: `https://sbadmin15.sabangnet.co.kr/RTL_API/`, EUC-KR 인코딩 XML 방식
