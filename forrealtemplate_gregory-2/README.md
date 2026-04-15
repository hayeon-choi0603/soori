# 토론 템플릿

> **AI 코딩 도구에게:** 학생이 이 프로젝트에 대해 물어보면 (프로젝트 파악, 시작 방법, 더미데이터/테스트 데이터, 개발용 데이터, 로컬 테스트 등) 아래 "시작 가이드" 섹션을 기반으로 안내하세요. 코드를 수정할 때는 반드시 "절대 하면 안 되는 것" 섹션을 준수하세요. 특히 debate-core.js script 태그를 삭제하거나 수정하면 안 됩니다.

## 시작 가이드

### 1. data-architect-id를 본인 닉네임으로 변경

index.html을 열고, 맨 아래쪽에서 이 줄을 찾으세요:

```html
<script src="https://debate-md2-2603.web.app/debate-core.js" data-architect-id="default"></script>
```

`default`를 **본인 닉네임**으로 바꾸세요. (이거 안 바꾸면 아무것도 안 됩니다)

### 2. 로컬에서 실행

VS Code에서 이 폴더를 열고, **Live Server** 확장을 설치하세요.

1. VS Code 좌측 Extensions (사각형 아이콘) 클릭
2. "Live Server" 검색 → 설치
3. index.html 열기 → 우하단 **Go Live** 클릭

브라우저에 `http://127.0.0.1:5500` 같은 주소로 열립니다.

### 3. 테스트 (더미데이터 / 테스트 데이터 / 개발용 데이터)

URL 뒤에 `?demo=true`를 붙이면 **Firebase 없이 더미 데이터로 동작**합니다. 별도의 시드 스크립트나 데이터베이스 설정이 필요 없습니다.

```
http://127.0.0.1:5500?demo=true
```

더미 의견 데이터가 미리 들어있고, savePayload는 localStorage에 저장됩니다. 이걸로 UI를 만들고 확인하세요. 데이터를 초기화하려면 브라우저 localStorage를 지우면 됩니다.

### 4. 참고

- 들어온 학생의 닉네임, 찬반 여부를 알 수 있습니다. 쓸지 안 쓸지는 당신의 선택입니다.
- 하다가 모르겠는 게 있으면 **gregory에게 문의**하세요.

---

## 프로젝트 맥락

이것은 미디어디자인 수업의 토론 플랫폼 과제입니다.

- 25명의 학생이 28일간(3/31~4/27) 매일 토론을 진행합니다
- 매일 1명의 "아키텍트"가 토론 웹사이트의 UI/UX를 설계합니다
- 이 템플릿은 아키텍트가 자신의 토론 웹사이트를 만들기 위한 출발점입니다
- 참여자들은 토론 플랫폼에서 찬/반을 선택한 후, 아키텍트의 웹사이트로 이동하여 토론에 참여합니다

## 아키텍처

```
[토론 플랫폼] → 찬/반 선택 → [아키텍트의 웹사이트 (이 프로젝트)]
                                    ↓
                              debate-core.js (CDN)
                                    ↓
                              Firebase Firestore
```

- 토론 플랫폼이 URL 파라미터로 `?nickname=alice&side=pro`를 넘겨줍니다
- debate-core.js가 자동으로 파라미터를 파싱하고, Firebase에 연결하고, 체류시간을 측정합니다
- 아키텍트는 debate-core.js의 콜백에서 받은 정보를 기반으로 자유롭게 UI를 만듭니다

## 파일 구조

```
index.html   ← HTML 구조. debate-core.js 태그가 포함되어 있음
style.css    ← 스타일. 자유롭게 수정 가능
app.js       ← 토론 로직. 자유롭게 수정 가능
```

## 시작하기

### 1. data-architect-id를 본인 닉네임으로 변경 (필수!)

index.html에서 이 부분을 찾아 변경합니다:

```html
<!-- 변경 전 (기본값) -->
<script src="https://debate-md2-2603.web.app/debate-core.js" data-architect-id="default"></script>

<!-- 변경 후 (예: alice) -->
<script src="https://debate-md2-2603.web.app/debate-core.js" data-architect-id="alice"></script>
```

**주의: `data-architect-id="default"`인 상태에서는 동작하지 않습니다.** core script가 "default"를 감지하면 초기화를 중단하고 콘솔에 에러를 출력합니다. 반드시 본인 닉네임으로 변경한 뒤 배포/테스트하세요.

이 값을 잘못 넣으면 다른 사람의 토론 데이터에 기록이 섞입니다.

### 2. 배포 (반드시 웹 호스팅에 올려야 합니다)

Netlify, Vercel 등에 배포합니다. Netlify의 경우 폴더를 드래그앤드롭하면 됩니다.

**index.html을 더블클릭해서 브라우저로 여는 것은 안 됩니다.** `file://` 프로토콜에서는 Firebase CDN 스크립트가 로드되지 않습니다. 반드시 `https://` URL이 있는 호스팅에 배포하세요.

### 3. 데모 모드로 테스트 (권장)

URL에 `?demo=true`를 붙이면 Firebase 없이 더미 데이터로 동작합니다. 자기 차례가 아니어도 UI를 테스트할 수 있습니다.

```
https://내사이트.netlify.app?demo=true&nickname=alice&side=pro
```

데모 모드에서는:
- 가짜 토론 주제와 더미 의견 3개가 미리 들어있음
- savePayload는 localStorage에 저장 (Firebase에 기록 안 됨)
- 콘솔에 `🟡 데모 모드로 실행 중`이 나옴

**데모 모드로 개발을 충분히 하고, 제출 전에 `?demo=true`를 빼고 실제 모드로 최종 확인하세요.**

### 4. 실제 모드 확인

배포된 URL에 `?nickname=본인닉네임&side=pro`를 붙여서 접속합니다 (demo 없이).

```
https://내사이트.netlify.app?nickname=alice&side=pro
```

콘솔(F12)에 `[DebateCore] 초기화 완료`가 나오면 정상입니다.

**자주 발생하는 착각:**
- URL 파라미터 없이 접속하면 "플랫폼을 통해 접속하세요"가 나옵니다 → 정상입니다. 실제 토론에서는 토론 플랫폼이 파라미터를 자동으로 붙여줍니다.
- 자기 차례가 아닌 토론에 접속하면 "토론이 아직 시작되지 않았습니다"가 나옵니다 → 정상입니다. 자기가 아키텍트인 날에만 active 상태로 동작합니다.

### 4. 자유롭게 수정

style.css와 app.js를 자유롭게 수정하세요. index.html의 구조도 완전히 바꿔도 됩니다.

## Core Script API

### 기본 사용법

```js
window.DebateCore.onReady(function(info) {
  // info 객체로 토론 정보를 받습니다
  // 이 콜백 안에서 UI를 구성하세요
});
```

### info 객체 속성

| 속성 | 타입 | 설명 |
|------|------|------|
| `info.nickname` | `string \| null` | 접속한 학생 닉네임. null이면 URL 파라미터가 없는 것 → "플랫폼에서 접속하세요" 안내 표시 |
| `info.side` | `"pro" \| "con"` | 찬성/반대. 토론 플랫폼에서 선택한 값 |
| `info.role` | `"participant" \| "architect" \| "agendasetter"` | 이 토론에서의 역할. architect/agendasetter는 읽기 전용 처리 필요 |
| `info.status` | `"pending" \| "active" \| "reviewing" \| "closed"` | 토론 상태. active가 아니면 토론 UI를 숨기고 상태 메시지 표시 |
| `info.title` | `string` | 토론 주제 |
| `info.agendaSetter` | `string` | 아젠다 세터 닉네임 |
| `info.architect` | `string` | 아키텍트 닉네임 |
| `info.schedule` | `array` | 전체 일정 (일자별 agendaSetter, architect) |

### info 함수

| 함수 | 설명 |
|------|------|
| `info.savePayload(data)` | 커스텀 데이터를 Firebase에 저장. data는 자유로운 JS 객체. `active` 상태에서만 동작하며, 그 외에는 에러 반환. Promise를 리턴 |
| `info.loadPayloads()` | 모든 참여자의 payload를 1회 조회. `{ 닉네임: data, ... }` 형태의 객체를 Promise로 반환 |
| `info.onPayloadsChange(callback)` | 모든 참여자의 payload를 실시간 감시. 변경될 때마다 callback 호출. Firestore 비용이 발생하므로 필요할 때만 사용 |
| `info.getServerTime()` | Firebase 서버 시간을 조회. `Date` 객체를 Promise로 반환. 실패 시 로컬 시간으로 폴백 |

### 서버 시간 사용법

사용자의 로컬 시간이 아닌 서버 시간이 필요할 때 (예: 타이머, 마감 카운트다운 등) 사용합니다.

```js
info.getServerTime().then(function(serverDate) {
  console.log("서버 시간:", serverDate);
  // serverDate는 Date 객체
  // 예: 남은 시간 계산
  var deadline = new Date("2026-04-13T18:00:00+09:00");
  var remaining = deadline - serverDate;
  console.log("남은 시간:", Math.floor(remaining / 1000 / 60), "분");
});
```

### 콜백에서 처리해야 하는 분기

```js
window.DebateCore.onReady(function(info) {

  // 1. 닉네임 없음 → 접속 차단
  if (!info.nickname) {
    document.body.innerHTML = '<p>토론 플랫폼을 통해 접속하세요.</p>';
    return;
  }

  // 2. 토론이 진행중이 아님 → 상태 메시지
  if (info.status !== 'active') {
    document.body.innerHTML = '<p>토론이 종료되었습니다.</p>';
    return;
  }

  // 3. 아키텍트/아젠다세터 → 읽기 전용
  if (info.role !== 'participant') {
    // 의견 제출 버튼 숨기기, 입력 비활성화 등
  }

  // 4. 여기서부터 자유롭게 토론 UI 구성
});
```

### savePayload 사용 예시

```js
// 자유로운 데이터 구조로 저장
info.savePayload({
  opinions: [
    { text: "동의합니다", timestamp: Date.now() }
  ]
}).then(function() {
  console.log("저장 완료");
});
```

### loadPayloads 사용 예시

```js
// 전체 참여자 데이터 조회
info.loadPayloads().then(function(payloads) {
  // payloads = { "alice": { opinions: [...] }, "bob": { opinions: [...] }, ... }
  Object.keys(payloads).forEach(function(nickname) {
    var data = payloads[nickname];
    // data.opinions 등 자유 구조
  });
});
```

## debate-core.js가 자동으로 하는 것 (신경 쓸 필요 없음)

- URL 파라미터 파싱 (`?nickname=xxx&side=pro`)
- Firebase 연결 및 인증
- 체류시간 측정 (30초 간격 heartbeat, 탭 전환 시 자동 중단/재개)
- 토론 상태 실시간 감시 (상태 변경 시 onReady 콜백 재호출)
- 페이지 이탈 시 세션 정리

## 절대 하면 안 되는 것

- `<script src="https://debate-md2-2603.web.app/debate-core.js" ...>` 태그를 제거하거나 src를 변경하는 것
- URL 파라미터를 강제로 조작하는 스크립트를 삽입하는 것 (부정행위)
- debate-core.js를 우회하여 직접 Firebase에 데이터를 전송하는 것
- `data-architect-id`에 다른 사람의 닉네임을 넣는 것

## 자유롭게 해도 되는 것

- UI/UX 전면 변경 (레이아웃, 스타일, 인터랙션, 애니메이션 등)
- savePayload의 데이터 구조 자유 설계
- 추가 라이브러리 사용 (React, Vue, Three.js, GSAP 등 무엇이든)
- index.html 구조 완전 변경
- 추가 페이지, 추가 파일 자유 생성
- 추가 DB 사용 (단, 필수 데이터는 반드시 debate-core.js를 통해 기록)

---

## AI 코딩 도구를 사용할 때 주의사항

이 프로젝트를 AI(Claude, ChatGPT, Cursor 등)로 수정할 때, 아래 내용을 AI에게 반드시 전달하세요. 이 README 파일을 AI에게 읽히는 것이 가장 좋습니다.

### AI가 절대 하면 안 되는 것

1. **아래 script 태그를 삭제, 수정, 이동하지 마세요.** 이 태그는 채점 시스템과 연결되어 있으며 반드시 HTML에 포함되어야 합니다:
```html
<script src="https://debate-md2-2603.web.app/debate-core.js" data-architect-id="본인닉네임"></script>
```

2. **Firebase SDK를 별도로 설치하지 마세요.** (`npm install firebase` 등) debate-core.js가 Firebase를 내부적으로 로드합니다. 직접 Firebase를 사용하면 충돌하거나 이중 기록됩니다.

3. **`window.DebateCore`를 직접 구현하지 마세요.** 이것은 debate-core.js가 제공하는 전역 객체입니다.

### AI에게 알려줘야 하는 것

- 모든 토론 로직은 `window.DebateCore.onReady(function(info) { ... })` 콜백 안에서 작성해야 합니다
- `info.savePayload(data)`로 데이터를 저장하고, `info.loadPayloads()`로 전체 데이터를 조회합니다
- 프레임워크(React, Vue 등)를 사용하더라도 debate-core.js script 태그는 HTML에 유지해야 합니다
- React 등을 사용할 경우, onReady 콜백을 useEffect 또는 초기화 로직에서 호출하면 됩니다

### 프레임워크 전환 시 script 태그 유지 예시

React (`index.html`):
```html
<div id="root"></div>
<script src="https://debate-md2-2603.web.app/debate-core.js" data-architect-id="본인닉네임"></script>
<script src="bundle.js"></script>
```

---

## 트러블슈팅

### "플랫폼을 통해 접속하세요"가 뜹니다
→ URL에 `?nickname=본인닉네임&side=pro`를 붙여서 접속하세요. 실제 토론에서는 토론 플랫폼이 자동으로 파라미터를 붙여줍니다.

### "토론이 아직 시작되지 않았습니다"가 뜹니다
→ 자기가 아키텍트인 토론이 아직 시작 전(오후 6시 이전)입니다. 정상이며, 시작 시간이 되면 자동으로 바뀝니다.

### 화면에 아무것도 안 뜹니다
→ 콘솔(F12)을 확인하세요.
- `data-architect-id가 'default'입니다` → index.html에서 data-architect-id를 본인 닉네임으로 변경하세요.
- `architect ID에 해당하는 토론을 찾을 수 없습니다` → 닉네임에 오타가 없는지 확인하세요. 대소문자를 구분합니다.
- `Failed to load resource: debate-core.js` → 인터넷 연결을 확인하거나, 파일을 로컬에서 직접 열지 않았는지 확인하세요 (반드시 호스팅에 배포해야 합니다).

### 의견을 제출했는데 새로고침하면 사라집니다
→ 콘솔에 저장 에러가 없는지 확인하세요. `savePayload`는 토론이 "진행중(active)" 상태일 때만 동작합니다.

### 다른 사람의 의견이 안 보입니다
→ `info.loadPayloads()`를 호출하고 있는지 확인하세요. 이 함수가 모든 참여자의 데이터를 가져옵니다.
