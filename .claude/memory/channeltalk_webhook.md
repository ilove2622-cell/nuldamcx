---
name: 채널톡 Webhook 토큰 (CX 자동응답)
description: nuldamcx 프로젝트 /api/webhook/channeltalk 엔드포인트의 채널톡 웹훅 서명검증 토큰
type: reference
originSessionId: 492e3680-8172-4b22-b35d-c54b64fe925f
---
## 채널톡 Webhook (nuldamcx CX 자동응답용)

- 웹훅 이름: 클로드 테스트2
- URL: https://nuldamcx.vercel.app/api/webhook/channeltalk
- **서명 토큰**: `3ff1193bcd38c14a1a49afc3547ac279`
- 구독 이벤트: 유저챗 대화, 유저챗 열릴 때

### 환경변수
`.env`에 `CHANNELTALK_WEBHOOK_TOKEN=3ff1193bcd38c14a1a49afc3547ac279`로 추가.
웹훅 핸들러에서 `x-signature` 헤더 검증에 사용.
