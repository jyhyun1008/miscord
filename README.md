# Miscord

디스코드 스타일의 Misskey 웹 클라이언트 (Nuxt 4, 순수 클라이언트 SPA).

- **서버 레일** = 로그인한 계정들 (멀티 계정)
- **채널** = 홈 / 로컬 / 소셜 / 글로벌 타임라인 + 내가 등록한 **리스트**·**해시태그**
- **채팅** = 노트를 디스코드 메시지처럼 (연속 노트 그룹핑, 답장 참조 줄, 리노트 시스템 메시지, 인용 임베드, 리액션 pill)
- **멤버 목록** = 고정한 유저 + 내가 만든 분류(역할처럼 색상) + 팔로잉 (온라인 상태순), 프로필 팝아웃
- Misskey 라임 그린 테마, 다크/라이트

## 실행

Node.js 22.22.3 이상(22.x), 24.15.0 이상(24.x) 또는 26 이상이 필요합니다.

```bash
npm install
npm run dev        # http://localhost:3223
```

로그인 화면에서 인스턴스 주소(예: `misskey.io`)를 입력하면 MiAuth로 권한을 요청한 뒤 `/callback`으로 돌아옵니다.
토큰과 채널 설정은 브라우저 `localStorage`에만 저장되며 별도 서버는 없습니다.

정적 호스팅: `npm run generate` 후 `.output/public`을 배포하세요 (SPA fallback 필요).

## Docker 배포

이미지는 `nuxt generate`로 만든 정적 SPA를 nginx(80 포트)가 서빙합니다. 런타임 환경변수나 볼륨은 필요 없습니다.

### 이미지 빌드 & Docker Hub 업로드

```bash
docker login
# amd64 + arm64 멀티 아키텍처로 빌드 후 바로 push
docker buildx build --platform linux/amd64,linux/arm64 \
  -t jyhyun1008/miscord:latest -t jyhyun1008/miscord:0.1.0 \
  --push .
```

로컬에서만 테스트할 때는 `docker build -t miscord:local .` 후 `docker run --rm -p 3223:80 miscord:local`.

### docker compose로 실행

`docker-compose.yml`:

```yaml
services:
  miscord:
    image: ${DOCKERHUB_USER:-jyhyun1008}/miscord:${MISCORD_TAG:-latest}
    container_name: miscord
    restart: unless-stopped
    ports:
      - "${MISCORD_PORT:-3223}:80"
```

```bash
docker compose pull
docker compose up -d       # http://localhost:3223
docker compose logs -f     # 로그
docker compose down        # 중지
```

같은 폴더의 `.env`로 값을 바꿀 수 있습니다:

```dotenv
MISCORD_PORT=8080
MISCORD_TAG=0.1.0
```

### 리버스 프록시 / HTTPS

MiAuth 콜백은 브라우저가 연 주소(`location.origin`)의 `/callback`으로 돌아오므로, 외부에 공개할 때는 실제 접속 도메인으로 HTTPS 프록시를 붙이세요. 예 (Caddy):

```
miscord.example.com {
    reverse_proxy localhost:3223
}
```

## 사용법

| 동작 | 방법 |
| --- | --- |
| 리스트 채널 추가 | 사이드바 `리스트` 옆 `+` |
| 해시태그 채널 추가 | 사이드바 `해시태그` 옆 `+`, 또는 노트의 해시태그 클릭 → 헤더의 `채널로 추가` |
| 채널 순서 변경/삭제 | 채널에 마우스를 올리면 ↑ ↓ ✕ |
| 유저 고정 | 멤버 목록 hover 시 📌, 또는 프로필 팝아웃의 📌 |
| 유저 노트 보기 | 아바타/이름 클릭 → `노트 보기` |
| 팔로잉 분류 만들기/색상 | 멤버 목록 검색창 옆 🏷 → 분류 이름·색 지정, 순서 변경 |
| 유저를 분류에 넣기 | 프로필 팝아웃의 `분류` 칩 클릭 (다시 누르면 해제). 분류 색이 멤버 목록·타임라인 이름에 적용 |
| 뮤트 / 차단 | 프로필 팝아웃 하단 (뮤트는 영구·1시간·1일·7일), 또는 노트의 더보기 메뉴 |
| 전송 / 줄바꿈 | Enter / Shift+Enter (IME 조합 중에는 전송 안 함) |
| 파일 첨부 | `+` 버튼, 붙여넣기, 드래그 앤 드롭 |

## 구조

```
app/
  pages/            login, callback, [acct]/[...channel] (메인 화면)
  components/       AppShell, ServerRail, ChannelSidebar, ChatView, Composer, MemberList, ...
  components/note/  NoteMessage, NoteBody, ReactionBar
  composables/      useAccounts(MiAuth), usePrefs(계정별 채널/핀), useTimeline, useEmojis, ...
  utils/            misskey(API), stream(WebSocket), channels, reaction, time
```

설계 메모는 [PROMPT.md](PROMPT.md)에 있습니다.
