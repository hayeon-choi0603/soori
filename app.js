/**
 * 실시간 토론 — app.js
 * README 규칙 엄수:
 *  - debate-core.js 태그 유지
 *  - window.DebateCore.onReady 콜백 안에서 모든 로직
 *  - savePayload / onPayloadsChange 사용
 *  - Firebase 직접 접근 금지
 *
 * 추가 기능:
 *  - 한국 연예인 닉네임 랜덤 배정 (URL 닉네임 → 연예인 이름 매핑)
 *  - 특정 시간(18:00~19:00)에만 토론 오픈
 *  - 실시간 1:1 매칭 (찬vs반)
 *  - 매칭된 쌍은 독립 채널로 대화
 *  - 토론 시간 종료 시 입력 불가
 */

// ── 설정 ────────────────────────────────────────────────
var DEBATE_START_HOUR = 18; // 18:00
var DEBATE_END_HOUR = 19;   // 19:00
// 토론 시간이 status === 'active'로 제어되면 그쪽을 우선합니다.
// 위 상수는 데모 모드나 status가 active인 경우에도 클라이언트 측 마감으로 동작합니다.

var CELEB_POOL = [
  "아이유", "RM", "박서준", "손예진", "공유",
  "김태리", "이준호", "수지", "현빈", "박보검",
  "전지현", "송강", "한소희", "차은우", "이영애",
  "김수현", "고윤정", "변우석", "정호연", "류준열",
  "김고은", "최우식", "박은빈", "위하준", "신민아",
  "주지훈", "이세영", "옹성우", "박지현", "남주혁"
];

// ── 상태 ────────────────────────────────────────────────
var allOpinions = [];
var myInfo = null;
var myCelebName = null;
var myMatchKey = null;   // "proNick:conNick" 형태의 매치 키
var debateEndTime = null;
var timerInterval = null;
var countdownInterval = null;

// ── 닉네임 → 연예인 매핑 (세션 내 일관성) ────────────────
function getCelebName(nickname) {
  // 닉네임 문자열을 시드로 하여 항상 같은 연예인 반환
  var hash = 0;
  for (var i = 0; i < nickname.length; i++) {
    hash = (hash * 31 + nickname.charCodeAt(i)) & 0xffffffff;
  }
  return CELEB_POOL[Math.abs(hash) % CELEB_POOL.length];
}

// ── 시간 유틸 ────────────────────────────────────────────
function getKSTHour() {
  var now = new Date();
  // UTC+9
  return new Date(now.getTime() + 9 * 3600 * 1000).getUTCHours();
}

function isDebateOpen() {
  var h = getKSTHour();
  return h >= DEBATE_START_HOUR && h < DEBATE_END_HOUR;
}

function getNextDebateStart() {
  var now = new Date();
  var kst = new Date(now.getTime() + 9 * 3600 * 1000);
  var h = kst.getUTCHours();
  if (h < DEBATE_START_HOUR) {
    kst.setUTCHours(DEBATE_START_HOUR, 0, 0, 0);
  } else {
    // 내일
    kst.setUTCDate(kst.getUTCDate() + 1);
    kst.setUTCHours(DEBATE_START_HOUR, 0, 0, 0);
  }
  return new Date(kst.getTime() - 9 * 3600 * 1000); // UTC로 변환
}

function getTodayDebateEnd() {
  var now = new Date();
  var kst = new Date(now.getTime() + 9 * 3600 * 1000);
  kst.setUTCHours(DEBATE_END_HOUR, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 3600 * 1000);
}

function formatDuration(ms) {
  if (ms <= 0) return "00:00";
  var totalSec = Math.floor(ms / 1000);
  var min = Math.floor(totalSec / 60);
  var sec = totalSec % 60;
  return pad(min) + ":" + pad(sec);
}

function formatCountdown(ms) {
  if (ms <= 0) return "00:00:00";
  var totalSec = Math.floor(ms / 1000);
  var h = Math.floor(totalSec / 3600);
  var m = Math.floor((totalSec % 3600) / 60);
  var s = totalSec % 60;
  return pad(h) + ":" + pad(m) + ":" + pad(s);
}

function pad(n) { return n < 10 ? "0" + n : "" + n; }

// ── 화면 전환 ─────────────────────────────────────────────
function showMessage(text) {
  document.getElementById("message-text").textContent = text;
  document.getElementById("message").style.display = "flex";
  document.getElementById("waiting-screen").style.display = "none";
  document.getElementById("matching-screen").style.display = "none";
  document.getElementById("app").style.display = "none";
}

function showWaiting() {
  document.getElementById("message").style.display = "none";
  document.getElementById("waiting-screen").style.display = "flex";
  document.getElementById("matching-screen").style.display = "none";
  document.getElementById("app").style.display = "none";

  // 카운트다운
  if (countdownInterval) clearInterval(countdownInterval);
  function tick() {
    var target = getNextDebateStart();
    var diff = target - Date.now();
    document.getElementById("countdown-display").textContent = formatCountdown(diff);
    if (diff <= 0) {
      clearInterval(countdownInterval);
      location.reload();
    }
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

function showMatching(celebName) {
  document.getElementById("message").style.display = "none";
  document.getElementById("waiting-screen").style.display = "none";
  document.getElementById("matching-screen").style.display = "flex";
  document.getElementById("app").style.display = "none";
  document.getElementById("my-celeb-name").textContent = celebName;
}

function showApp() {
  document.getElementById("message").style.display = "none";
  document.getElementById("waiting-screen").style.display = "none";
  document.getElementById("matching-screen").style.display = "none";
  document.getElementById("app").style.display = "block";
}

// ── 타이머 ─────────────────────────────────────────────────
function startTimer() {
  debateEndTime = getTodayDebateEnd();
  if (timerInterval) clearInterval(timerInterval);

  function tick() {
    var diff = debateEndTime - Date.now();
    if (diff <= 0) {
      clearInterval(timerInterval);
      document.getElementById("timer-display").textContent = "종료";
      endDebate();
      return;
    }
    document.getElementById("timer-display").textContent = formatDuration(diff);
  }
  tick();
  timerInterval = setInterval(tick, 1000);
}

function endDebate() {
  document.getElementById("open-modal-btn").style.display = "none";
  document.getElementById("ended-banner").style.display = "block";
  // 모달 열려있으면 닫기
  document.getElementById("modal-overlay").style.display = "none";
}

// ── 매칭 로직 ──────────────────────────────────────────────
// payload 구조:
// {
//   celebName: "아이유",
//   side: "pro",
//   matchKey: "proNick:conNick" | null,
//   opinions: [ { text, side, celebName, timestamp } ]
// }

function buildMatchKey(proNick, conNick) {
  return proNick + "::" + conNick;
}

function tryMatch(payloads, myNick, mySide) {
  // 이미 매칭된 상태면 스킵
  var myPayload = payloads[myNick];
  if (myPayload && myPayload.matchKey) {
    return myPayload.matchKey;
  }

  var oppSide = mySide === "pro" ? "con" : "pro";

  // 상대방 중 매칭 안 된 사람 탐색
  var candidates = Object.keys(payloads).filter(function (nick) {
    if (nick === myNick) return false;
    var p = payloads[nick];
    return p && p.side === oppSide && !p.matchKey;
  });

  if (candidates.length === 0) return null;

  // 첫 번째 후보와 매칭
  var opponent = candidates[0];
  var proNick = mySide === "pro" ? myNick : opponent;
  var conNick = mySide === "con" ? myNick : opponent;
  return buildMatchKey(proNick, conNick);
}

// ── 의견 렌더링 ────────────────────────────────────────────
function renderOpinions(payloads) {
  if (!myMatchKey) return;

  // 매치에 속한 참여자 닉네임
  var parts = myMatchKey.split("::");
  var proNick = parts[0];
  var conNick = parts[1];

  var proOpinions = [];
  var conOpinions = [];

  [proNick, conNick].forEach(function (nick) {
    var p = payloads[nick];
    if (!p || !p.opinions) return;
    p.opinions.forEach(function (op) {
      var item = {
        celebName: p.celebName || nick,
        text: op.text,
        timestamp: op.timestamp
      };
      if (p.side === "pro") proOpinions.push(item);
      else conOpinions.push(item);
    });
  });

  proOpinions.sort(function (a, b) { return a.timestamp - b.timestamp; });
  conOpinions.sort(function (a, b) { return a.timestamp - b.timestamp; });

  renderList("pro-list", proOpinions);
  renderList("con-list", conOpinions);

  // 상대방 이름 표시
  var opponentNick = myInfo.side === "pro" ? conNick : proNick;
  var opponentPayload = payloads[opponentNick];
  if (opponentPayload && opponentPayload.celebName) {
    document.getElementById("opponent-name").textContent = opponentPayload.celebName;
  }
}

function renderList(listId, opinions) {
  var el = document.getElementById(listId);
  if (opinions.length === 0) {
    el.innerHTML = '<p class="empty-text">아직 없습니다</p>';
    return;
  }
  el.innerHTML = opinions.map(function (o) {
    return (
      '<div class="opinion-card">' +
      '<div class="opinion-meta">' + escapeHtml(o.celebName) + '</div>' +
      '<p class="opinion-text">' + escapeHtml(o.text) + '</p>' +
      '</div>'
    );
  }).join("");
}

function escapeHtml(text) {
  var div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ── 메인 ──────────────────────────────────────────────────
window.DebateCore.onReady(function (info) {
  myInfo = info;

  // 1. 닉네임 없으면 차단
  if (!info.nickname) {
    showMessage("토론 플랫폼을 통해 다시 접속하세요.");
    return;
  }

  // 2. 연예인 이름 배정
  myCelebName = getCelebName(info.nickname);

  // 3. 토론 상태 체크
  if (info.status === "pending") {
    // 시간이 되면 새로고침
    showWaiting();
    return;
  }

  if (info.status !== "active") {
    showMessage("토론이 종료되었습니다.");
    return;
  }

  // 4. 클라이언트 측 시간 체크 (active 상태여도 시간 외면 대기)
  if (!isDebateOpen()) {
    showWaiting();
    return;
  }

  // 5. UI 기본 설정
  document.getElementById("debate-title").textContent = info.title || "(제목 없음)";
  document.getElementById("nickname").textContent = myCelebName;

  var sideBadge = document.getElementById("side-badge");
  sideBadge.textContent = info.side === "pro" ? "찬성" : "반대";
  sideBadge.classList.add(info.side);

  var modalSideBadge = document.getElementById("modal-side-badge");
  modalSideBadge.textContent = info.side === "pro" ? "찬성" : "반대";
  modalSideBadge.classList.add(info.side);
  document.getElementById("modal-nickname").textContent = myCelebName;

  var isReadonly = info.role !== "participant";

  // 6. 실시간 payload 감시
  info.onPayloadsChange(function (payloads) {
    var myPayload = payloads[info.nickname];

    // 내 payload에 연예인 이름이 없으면 등록
    if (!myPayload || !myPayload.celebName) {
      if (!isReadonly) {
        info.savePayload({
          celebName: myCelebName,
          side: info.side,
          matchKey: null,
          opinions: []
        });
      }
      showMatching(myCelebName);
      return;
    }

    // 매칭 시도
    if (!myPayload.matchKey) {
      var matchKey = tryMatch(payloads, info.nickname, info.side);
      if (matchKey) {
        myMatchKey = matchKey;
        // 매칭 확정 저장
        if (!isReadonly) {
          info.savePayload({
            celebName: myCelebName,
            side: info.side,
            matchKey: matchKey,
            opinions: myPayload.opinions || []
          });
        }
        showApp();
        startTimer();
        renderOpinions(payloads);
        setupModalHandlers(info, myPayload.opinions || []);
      } else {
        showMatching(myCelebName);
      }
      return;
    }

    // 이미 매칭됨
    myMatchKey = myPayload.matchKey;
    showApp();

    if (!timerInterval) {
      startTimer();
      if (!isReadonly) setupModalHandlers(info, myPayload.opinions || []);
    }

    renderOpinions(payloads);
  });
});

// ── 모달 & 제출 ────────────────────────────────────────────
var modalSetup = false;

function setupModalHandlers(info, initialOpinions) {
  if (modalSetup) return;
  modalSetup = true;

  var openBtn = document.getElementById("open-modal-btn");
  var overlay = document.getElementById("modal-overlay");
  var closeBtn = document.getElementById("close-modal-btn");
  var input = document.getElementById("opinion-input");
  var submitBtn = document.getElementById("submit-btn");

  openBtn.style.display = "block";

  openBtn.addEventListener("click", function () {
    // 시간 종료 체크
    if (debateEndTime && Date.now() >= debateEndTime.getTime()) {
      endDebate();
      return;
    }
    overlay.style.display = "flex";
    input.focus();
  });

  closeBtn.addEventListener("click", function () { overlay.style.display = "none"; });
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.style.display = "none";
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") overlay.style.display = "none";
  });

  submitBtn.addEventListener("click", function () {
    // 시간 종료 체크
    if (debateEndTime && Date.now() >= debateEndTime.getTime()) {
      endDebate();
      overlay.style.display = "none";
      return;
    }

    var text = input.value.trim();
    if (!text) return;
    submitBtn.disabled = true;

    // 현재 의견 목록은 전역 allOpinions 대신 payload에서 읽어야 하므로
    // loadPayloads는 없지만 onPayloadsChange 콜백에서 이미 최신 상태를 받음
    // 여기서는 저장된 내 opinions를 재활용
    info.loadPayloads && info.loadPayloads().then(function (payloads) {
      var mine = (payloads[info.nickname] && payloads[info.nickname].opinions) || [];
      mine = mine.slice(); // 복사
      mine.push({ text: text, timestamp: Date.now() });

      info.savePayload({
        celebName: myCelebName,
        side: info.side,
        matchKey: myMatchKey,
        opinions: mine
      }).then(function () {
        input.value = "";
        submitBtn.disabled = false;
        overlay.style.display = "none";
      }).catch(function () {
        submitBtn.disabled = false;
      });
    }).catch(function () {
      // loadPayloads 없는 환경(데모) 대비 fallback
      info.savePayload({
        celebName: myCelebName,
        side: info.side,
        matchKey: myMatchKey,
        opinions: [{ text: text, timestamp: Date.now() }]
      }).then(function () {
        input.value = "";
        submitBtn.disabled = false;
        overlay.style.display = "none";
      }).catch(function () {
        submitBtn.disabled = false;
      });
    });
  });
}
