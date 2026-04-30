---
name: 멀티 PC Dropbox 동기화 셋업 계획
description: 클로드코드 토큰/대화기록/메모리/설정을 여러 PC에서 동일하게 사용하기 위한 Dropbox 기반 동기화 셋업 진행 중. 사용자 PC 업데이트 후 재개 예정.
type: project
---

## 목적

사용자는 여러 PC에서 클로드코드를 사용. 한 PC에만 토큰/대화기록/메모리/설정이 있어 다른 PC에서 재로그인 등 추가 작업이 필요한 상태. **재로그인 없이** 어느 PC에서든 동일한 환경으로 사용하고 싶음.

**Why:** 사용자 명시 — "동일한 성능과 기록을 원해. 다른 컴퓨터에서 토큰이 필요할 때 추가 작업이 있는 건 불편할 거 같아."

**How to apply:** 다음 세션에서 사용자가 PC 업데이트를 끝내고 재개하면, 아래 셋업 계획대로 진행할 것.

## 의사결정 히스토리

1. **OneDrive 검토** → 회사 OneDrive(조인앤조인)와 개인 OneDrive 충돌 우려로 보류
2. **Google Drive 검토** → 회사 Google 계정으로 G:\공유드라이브, G:\내드라이브 사용 중. 개인 계정 추가 시 헷갈림 + 회사 G드라이브 집에서도 봐야 해서 분리 필요. 보류
3. **Dropbox 최종 선택** ✅
   - 회사가 Dropbox 안 쓰므로 계정 충돌 0%
   - 폴더 위치 고정 (`C:\Users\User\Dropbox\`)
   - Junction 호환성 검증됨
   - 무료 2GB로 ~4년 충분 (현재 클로드 데이터 ~200MB)

## 결정된 사항

| 항목 | 결정 |
|---|---|
| 동기화 수단 | **개인 Dropbox** (회사 데이터 분리, 새 가입 OK) |
| 동기화 폴더 위치 | `C:\Users\User\Dropbox\claude-sync\` |
| 각 PC 연결 방식 | `~/.claude/` → Dropbox 폴더로 **Junction** (PC별 로컬 1회 생성) |
| Dropbox 폴더 안 Junction | **금지**. sync 도구는 reparse point를 일반 폴더로 변환하므로 Dropbox 안에는 평탄화된 일반 폴더만 |
| 동시 사용 | 두 PC 동시 켜놔도 되지만 **한 번에 한 PC에서만 입력/실행**. 전환 시 Dropbox sync 완료 대기 |
| 새 PC 사용자명 | 모름. 사용자명 달라도 작동하는 설계 (PC별 로컬 Junction이 Dropbox 폴더 가리키게 만들면 OK) |
| 기존 프로젝트 git의 `.claude/memory/` | 더 이상 사용 안 함. `.gitignore` 추가 + 기존 파일 git에서 제거 (Dropbox로만 sync) |

## 진행 계획 (이 세션 마지막 시점)

### 메인 PC (이 PC) — 사용자 PC 업데이트 후

1. ⏸️ Dropbox 가입 (개인 이메일) + 데스크톱 앱 설치 + 로그인
2. ⏸️ PowerShell 스크립트 실행 (제가 작성):
   - `~/.claude/` 백업 → `C:\Users\User\.claude.bak.<timestamp>\`
   - `~/.claude/` 내용을 `C:\Users\User\Dropbox\claude-sync\`로 이동 (sub-junction 평탄화)
   - `~/.claude/` → Dropbox 폴더로 Junction 생성
3. ⏸️ 클로드코드 재시작 → 검증

### 새 PC

1. ⏸️ Dropbox 설치 + 같은 개인 계정 로그인 → sync 완료 대기
2. ⏸️ Claude Code 설치
3. ⏸️ Dropbox에 미리 올려둔 PowerShell 스크립트 실행 (PC당 1회):
   - 빈 `~/.claude/` 백업
   - `~/.claude/` → Dropbox 폴더로 Junction 생성
4. ⏸️ 클로드코드 시작 → 토큰/메모리/대화기록 자동 적용

## 스크립트 설계 메모 (재개 시 참고)

### 메인 PC 스크립트 (`setup-main-pc.ps1`)

```powershell
# 1. 클로드코드 종료 확인 (실행 중이면 중단)
$claudeRunning = Get-Process -Name "claude*", "node" -ErrorAction SilentlyContinue
# ... 종료 확인 로직

# 2. 백업
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = "$env:USERPROFILE\.claude.bak.$timestamp"
Copy-Item "$env:USERPROFILE\.claude" $backupPath -Recurse

# 3. Dropbox 폴더 준비
$dropboxPath = "$env:USERPROFILE\Dropbox\claude-sync"
New-Item -ItemType Directory -Path $dropboxPath -Force

# 4. 데이터 이동 (sub-junction 평탄화: `~/.claude/projects/C--Users-User-nuldamcx/memory` junction 풀고 일반 폴더로)
# 주의: 기존 nuldamcx memory junction은 풀어서 안의 실제 파일만 복사

# 5. 원래 ~/.claude/ 삭제
Remove-Item "$env:USERPROFILE\.claude" -Recurse -Force

# 6. Junction 생성
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude" -Target $dropboxPath

# 7. 검증 (credentials.json 등 핵심 파일 접근 가능한지)
```

### 새 PC 스크립트 (`setup-new-pc.ps1`)

```powershell
# 1. Dropbox sync 완료 확인
$dropboxPath = "$env:USERPROFILE\Dropbox\claude-sync"
if (-not (Test-Path "$dropboxPath\.credentials.json")) {
    Write-Error "Dropbox sync 완료되지 않음. 잠시 기다린 후 재실행하세요."
    exit 1
}

# 2. 빈 ~/.claude/ 백업
$backupPath = "$env:USERPROFILE\.claude.bak.firstrun"
if (Test-Path "$env:USERPROFILE\.claude") {
    Move-Item "$env:USERPROFILE\.claude" $backupPath
}

# 3. Junction 생성
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude" -Target $dropboxPath

# 4. 검증
```

## 이미 완료된 사전 작업 (2026-04-29)

- 프로젝트 `.claude/memory/`를 git에 push (다른 PC에서 `git pull`로 메모리 받기 가능)
- `~/.claude/projects/C--Users-User-nuldamcx/memory` Junction 생성 (메인 checkout `.claude/memory/` 가리킴)
- `CLAUDE.md`에 Junction 경로 안내 수정
- 세션 시작 git pull / 종료 git push hook 설정

## 이주 시 정리할 것

- ⚠️ Dropbox 방식 도입 후에는 위 git-memory 방식과 충돌 가능. Dropbox 도입 시 git에서 `.claude/memory/` 빼는 정리 필요 (.gitignore 추가).
- ⚠️ 기존 `~/.claude/projects/C--Users-User-nuldamcx/memory` junction은 평탄화 필요 (Dropbox는 reparse point sync 못 함).
- ⚠️ 새 PC에서 사용자명이 다른 경우, Dropbox 폴더 위치도 다름(`C:\Users\<다른이름>\Dropbox\`). Junction은 PC별 로컬에서 만들면 되므로 OK.

## 주의사항 (재개 시)

- Junction은 **Dropbox 폴더 밖에서 Dropbox 폴더 안을 가리키게** 만들 것. Dropbox 폴더 안에 Junction 만들면 sync 시 깨짐.
- 새 PC 사용자명 모름. 새 PC 셋업 시 `whoami` 또는 `$env:USERPROFILE`로 자동 감지하는 스크립트 작성.
- 두 PC 동시 사용 금지 (sync 충돌). 전환 시 Dropbox 트레이 아이콘 "최신 상태" 확인 후 다른 PC 사용.
- 무료 2GB 한도 모니터링 필요 (대화기록 누적 시).
