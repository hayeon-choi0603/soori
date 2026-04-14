/**
 * 토론 앱 — app.js
 * README의 DebateCore API를 사용해 작성되었습니다.
 * debate-core.js 태그를 절대 수정/삭제하지 마세요.
 */

var CELEBRITY_NAMES = [
  "최미나수", "지드래곤", "제니", "이재용", "카리나",
  "차은우", "티모시 샬라메", "박서준", "킴 카다시안", "한소희",
  "카디비", "장원영", "안유진", "이수만", "민희진",
  "태연", "백현", "방시혁", "이도현", "변우석",
  "레이디 가가", "박보검", "수지", "로제", "비욘세"
];

var myInfo = null;
var myCelebrity = null;
var allPayloads = {};
var countdownInterval = null;
var serverTimeOffset = 0; // 로컬시간 - 서버시간 보정값 (ms)

// ───────────────────────────────
// 진입점
// ───────────────────────────────

window.DebateCore.onReady(function (info) {
  myInfo = info;

  // 1. 닉네임 없음
  if (!info.nickname) {
    showMessage("토론 플랫폼을 통해 접속하세요.");
    return;
  }

  // 2. 서버 시간 확인 후 시간 제한 적용
  info.getServerTime().then(function (serverDate) {
    var localNow = Date.now();
    serverTimeOffset = localNow - serverDate.getTime();

    if (!isDebateOpen(serverDate)) {
      showCountdown(info.title || "토론");
      return;
    }

    // 3. 토론 상태 확인
    if (info.status === "pending") {
      showMessage("토론이 아직 시작되지 않았습니다.");
      return;
    }
    if (info.status === "closed" || info.status === "reviewing") {
      showMessage("토론이 종료되었습니다.");
      return;
    }

    // 4. 연예인 이름 배정
    assignCelebrity(info, function (celebName) {
      myCelebrity = celebName;
      startApp(info);
    });

  }).catch(function () {
    // 서버 시간 실패 시 로컬 시간으로 폴백
    var localDate = new Date();
    if (!isDebateOpen(localDate)) {
      showCountdown(info.title || "토론");
      return;
    }
    assignCelebrity(info, function (celebName) {
      myCelebrity = celebName;
      startApp(info);
    });
  });
});

// ───────────────────────────────
// 시간 제한
// ───────────────────────────────

function isDebateOpen(date) {
  return true; // TODO: 테스트 완료 후 아래 줄로 교체
  // var kstHour = (date.getUTCHours() + 9) % 24;
  // return (kstHour >= 17 && kstHour < 18) || (kstHour >= 20 && kstHour < 21);
}

function getNextOpenMs(date) {
  var kstHour = (date.getUTCHours() + 9) % 24;
  var kstMinute = date.getUTCMinutes();
  var kstSecond = date.getUTCSeconds();

  // 현재 KST 시각을 분 단위 (0~1439)
  var kstTotalSec = kstHour * 3600 + kstMinute * 60 + kstSecond;
  var open1 = 17 * 3600; // 17:00
  var open2 = 20 * 3600; // 20:00

  var remainSec;
  if (kstTotalSec < open1) {
    remainSec = open1 - kstTotalSec;
  } else if (kstTotalSec < open2) {
    remainSec = open2 - kstTotalSec;
  } else {
    // 다음날 17:00
    remainSec = (24 * 3600 - kstTotalSec) + open1;
  }
  return remainSec * 1000;
}

function showCountdown(title) {
  hideAll();
  document.getElementById("countdown-title").textContent = title;
  document.getElementById("countdown-screen").style.display = "flex";

  if (countdownInterval) clearInterval(countdownInterval);

  function tick() {
    var nowLocal = Date.now();
    var serverNow = new Date(nowLocal - serverTimeOffset);
    var remainMs = getNextOpenMs(serverNow);

    if (remainMs <= 0) {
      clearInterval(countdownInterval);
      location.reload();
      return;
    }

    var h = Math.floor(remainMs / 3600000);
    var m = Math.floor((remainMs % 3600000) / 60000);
    var s = Math.floor((remainMs % 60000) / 1000);
    document.getElementById("countdown-timer").textContent =
      pad(h) + ":" + pad(m) + ":" + pad(s);
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

// 현재 세션 종료까지 남은 ms (열려 있지 않으면 null)
function getSessionEndMs(date) {
  var kstHour = (date.getUTCHours() + 9) % 24;
  var kstMin = date.getUTCMinutes();
  var kstSec = date.getUTCSeconds();
  var kstTotalSec = kstHour * 3600 + kstMin * 60 + kstSec;

  if (kstTotalSec >= 17 * 3600 && kstTotalSec < 18 * 3600) {
    return (18 * 3600 - kstTotalSec) * 1000;
  }
  if (kstTotalSec >= 20 * 3600 && kstTotalSec < 21 * 3600) {
    return (21 * 3600 - kstTotalSec) * 1000;
  }
  return null;
}

var sessionEndInterval = null;

function startSessionCountdown(barId, timerId) {
  if (sessionEndInterval) clearInterval(sessionEndInterval);

  var bar = document.getElementById(barId);
  var timerEl = document.getElementById(timerId);
  if (!bar || !timerEl) return;

  function tick() {
    var serverNow = new Date(Date.now() - serverTimeOffset);
    var remainMs = getSessionEndMs(serverNow);
    if (remainMs === null) { bar.style.display = "none"; return; }

    bar.style.display = "flex";
    var m = Math.floor(remainMs / 60000);
    var s = Math.floor((remainMs % 60000) / 1000);
    timerEl.textContent = pad(m) + ":" + pad(s);

    if (remainMs <= 0) {
      clearInterval(sessionEndInterval);
      location.reload();
    }
  }

  tick();
  sessionEndInterval = setInterval(tick, 1000);
}

// ───────────────────────────────
// 연예인 이름 배정
// ───────────────────────────────

function assignCelebrity(info, callback) {
  var storageKey = "debate_celebrity_" + info.nickname;

  info.loadPayloads().then(function (payloads) {
    // Firebase에 이미 내 이름이 저장된 경우 그대로 사용
    if (payloads[info.nickname] && payloads[info.nickname].celebrityName) {
      var name = payloads[info.nickname].celebrityName;
      localStorage.setItem(storageKey, name);
      callback(name);
      return;
    }

    // 다른 사람이 이미 선점한 이름 목록
    var taken = {};
    Object.keys(payloads).forEach(function (nick) {
      if (nick !== info.nickname && payloads[nick] && payloads[nick].celebrityName) {
        taken[payloads[nick].celebrityName] = true;
      }
    });

    // localStorage 캐시가 유효하면 재사용, 아니면 새로 뽑기
    var cached = localStorage.getItem(storageKey);
    var chosen;
    if (cached && !taken[cached]) {
      chosen = cached;
    } else {
      var available = CELEBRITY_NAMES.filter(function (n) { return !taken[n]; });
      chosen = available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : CELEBRITY_NAMES[Math.floor(Math.random() * CELEBRITY_NAMES.length)];
    }

    localStorage.setItem(storageKey, chosen);

    // Firebase에 즉시 선점 저장
    var base = payloads[info.nickname] || {};
    info.savePayload({
      celebrityName: chosen,
      side: info.side,
      claim: base.claim || null,
      messages: base.messages || []
    }).then(function () {
      // 저장 후 충돌 재확인 (동시 접속자와 같은 이름을 집었을 경우 대비)
      info.loadPayloads().then(function (fresh) {
        var resolved = pickNonConflict(info, fresh, chosen, storageKey);
        if (resolved === chosen) {
          callback(chosen);
        } else {
          // 충돌 패자 → 새 이름으로 재저장
          var freshBase = fresh[info.nickname] || {};
          info.savePayload({
            celebrityName: resolved,
            side: info.side,
            claim: freshBase.claim || null,
            messages: freshBase.messages || []
          }).then(function () { callback(resolved); })
            .catch(function () { callback(resolved); });
        }
      }).catch(function () { callback(chosen); });
    }).catch(function () {
      // savePayload 실패(비활성 토론 등)여도 로컬에서는 진행
      callback(chosen);
    });

  }).catch(function () {
    var cached = localStorage.getItem(storageKey);
    if (cached) { callback(cached); return; }
    var fallback = CELEBRITY_NAMES[Math.floor(Math.random() * CELEBRITY_NAMES.length)];
    localStorage.setItem(storageKey, fallback);
    callback(fallback);
  });
}

// 충돌 발생 시 알파벳 순서로 맨 뒤 닉네임이 새 이름을 재선택
function pickNonConflict(info, payloads, myName, storageKey) {
  var conflictNicks = Object.keys(payloads).filter(function (nick) {
    return nick !== info.nickname &&
      payloads[nick] &&
      payloads[nick].celebrityName === myName;
  });

  if (conflictNicks.length === 0) return myName;

  // 충돌 그룹 중 알파벳 순 마지막 닉네임이 이름을 양보
  var loser = [info.nickname].concat(conflictNicks).sort().pop();
  if (loser !== info.nickname) return myName;

  // 내가 패자 → 남은 이름 중 랜덤 재선택
  var taken = {};
  Object.keys(payloads).forEach(function (nick) {
    if (nick !== info.nickname && payloads[nick] && payloads[nick].celebrityName) {
      taken[payloads[nick].celebrityName] = true;
    }
  });
  var available = CELEBRITY_NAMES.filter(function (n) { return !taken[n]; });
  var newName = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : CELEBRITY_NAMES[Math.floor(Math.random() * CELEBRITY_NAMES.length)];
  localStorage.setItem(storageKey, newName);
  return newName;
}

// ───────────────────────────────
// 앱 시작
// ───────────────────────────────

function startApp(info) {
  // 실시간 payload 감시
  info.onPayloadsChange(function (payloads) {
    allPayloads = payloads;
    var myPayload = payloads[info.nickname] || {};

    // 주장이 없으면 claim 화면, 있으면 메인 앱
    if (!myPayload.claim) {
      showClaimScreen(info);
    } else {
      showMainApp(info, payloads);
    }
  });
}

// ───────────────────────────────
// 주장 입력 화면
// ───────────────────────────────

function showClaimScreen(info) {
  hideAll();
  var screen = document.getElementById("claim-screen");
  screen.style.display = "block";

  document.getElementById("claim-title").textContent = info.title || "(제목 없음)";
  document.getElementById("claim-celebrity").textContent = myCelebrity;
  startSessionCountdown("claim-session-bar", "claim-session-timer");

  var sideBadge = document.getElementById("claim-side-badge");
  sideBadge.textContent = info.side === "pro" ? "찬성" : "반대";
  sideBadge.className = "side-badge " + info.side;

  var submitBtn = document.getElementById("claim-submit-btn");
  var input = document.getElementById("claim-input");

  // 읽기 전용 (아키텍트/아젠다세터)
  if (info.role !== "participant") {
    input.disabled = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "참여자만 주장을 제출할 수 있습니다";
    return;
  }

  // 중복 이벤트 방지
  submitBtn.replaceWith(submitBtn.cloneNode(true));
  var newBtn = document.getElementById("claim-submit-btn");

  newBtn.addEventListener("click", function () {
    var text = input.value.trim();
    if (!text) return;
    newBtn.disabled = true;
    newBtn.textContent = "제출 중...";

    var payload = buildMyPayload(info, { text: text, timestamp: Date.now() }, []);
    info.savePayload(payload).catch(function () {
      newBtn.disabled = false;
      newBtn.textContent = "주장 제출하기";
    });
  });
}

// ───────────────────────────────
// 메인 앱 (탭 UI)
// ───────────────────────────────

function showMainApp(info, payloads) {
  hideAll();
  document.getElementById("app").style.display = "block";

  document.getElementById("app-celebrity").textContent = myCelebrity;
  document.getElementById("app-title").textContent = info.title || "";
  startSessionCountdown("app-session-bar", "app-session-timer");

  var sideBadge = document.getElementById("app-side-badge");
  sideBadge.textContent = info.side === "pro" ? "찬성" : "반대";
  sideBadge.className = "side-badge " + info.side;

  // 탭 전환
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.onclick = function () {
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      var tab = btn.getAttribute("data-tab");
      document.getElementById("tab-my-chat").style.display = tab === "my-chat" ? "flex" : "none";
      document.getElementById("tab-all-chats").style.display = tab === "all-chats" ? "block" : "none";
    };
  });

  renderMyChat(info, payloads);
  renderAllChats(info, payloads);
}

// ───────────────────────────────
// 탭 1: 내 채팅
// ───────────────────────────────

function renderMyChat(info, payloads) {
  var myPayload = payloads[info.nickname] || {};
  var match = findMyMatch(info, payloads);

  // 내 주장 (말풍선)
  var myCard = document.getElementById("my-claim-card");
  myCard.innerHTML = renderClaimBubble(
    myCelebrity, info.side, myPayload.claim ? myPayload.claim.text : "", "mine"
  );

  // 상대 주장 (말풍선)
  var partnerCard = document.getElementById("partner-claim-card");
  if (match) {
    var partnerPayload = payloads[match.nickname] || {};
    var partnerCeleb = partnerPayload.celebrityName || match.nickname;
    var partnerSide = partnerPayload.side || match.side;
    partnerCard.innerHTML = renderClaimBubble(
      partnerCeleb, partnerSide, partnerPayload.claim ? partnerPayload.claim.text : "(주장 없음)", "partner"
    );
    partnerCard.style.display = "block";
  } else {
    partnerCard.innerHTML = '<p class="waiting-text">매칭 상대를 찾고 있습니다...</p>';
  }

  // 채팅 메시지
  var chatArea = document.getElementById("chat-messages");
  if (match) {
    var partnerPayload2 = payloads[match.nickname] || {};
    var partnerCeleb2 = (partnerPayload2.celebrityName) || match.nickname;
    var partnerSide2 = partnerPayload2.side || match.side;
    var merged = mergeMessages(
      myPayload.messages || [],
      partnerPayload2.messages || [],
      info.nickname,
      match.nickname,
      myCelebrity,
      partnerCeleb2,
      info.side,
      partnerSide2
    );
    renderMessages(chatArea, merged, info.nickname);
  } else {
    chatArea.innerHTML = '<p class="chat-empty">매칭 후 채팅을 시작할 수 있습니다.</p>';
  }

  // 채팅 입력
  setupChatInput(info, payloads, match);
}

function setupChatInput(info, payloads, match) {
  var inputArea = document.getElementById("chat-input-area");
  var sendBtn = document.getElementById("chat-send-btn");
  var chatInput = document.getElementById("chat-input");

  if (!match || info.role !== "participant" || info.status !== "active") {
    inputArea.style.display = match ? "flex" : "none";
    if (sendBtn) sendBtn.disabled = true;
    if (chatInput) chatInput.disabled = true;
    return;
  }

  inputArea.style.display = "flex";

  // 중복 이벤트 방지: 버튼과 textarea 모두 교체 (cloneNode는 이벤트 리스너 제거)
  // disabled 상태가 복사되지 않도록 교체 전에 먼저 초기화
  sendBtn.disabled = false;
  chatInput.disabled = false;
  sendBtn.replaceWith(sendBtn.cloneNode(true));
  chatInput.replaceWith(chatInput.cloneNode(true));
  var newSendBtn = document.getElementById("chat-send-btn");
  var newChatInput = document.getElementById("chat-input");

  var isSending = false;

  function sendMessage() {
    var text = newChatInput.value.trim();
    if (!text || isSending) return;
    isSending = true;
    newSendBtn.disabled = true;

    var myPayload = allPayloads[info.nickname] || {};
    var messages = (myPayload.messages || []).slice();
    messages.push({ text: text, timestamp: Date.now() });

    var newPayload = buildMyPayload(info, myPayload.claim, messages);
    info.savePayload(newPayload).then(function () {
      newChatInput.value = "";
    }).catch(function () {
      isSending = false;
      newSendBtn.disabled = false;
    });
  }

  newSendBtn.addEventListener("click", sendMessage);
  newChatInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// ───────────────────────────────
// 탭 2: 다른 사람 채팅 리스트
// ───────────────────────────────

function renderAllChats(info, payloads) {
  var pairs = buildAllPairs(payloads);
  var pairsList = document.getElementById("pairs-list");
  var pairChatView = document.getElementById("pair-chat-view");

  pairsList.innerHTML = "";
  pairChatView.style.display = "none";

  if (pairs.length === 0) {
    pairsList.innerHTML = '<p class="pairs-empty">아직 매칭된 참여자가 없습니다.</p>';
    return;
  }

  pairs.forEach(function (pair) {
    var proPayload = payloads[pair.proNick] || {};
    var conPayload = payloads[pair.conNick] || {};
    var proCeleb = proPayload.celebrityName || pair.proNick;
    var conCeleb = conPayload.celebrityName || pair.conNick;

    var item = document.createElement("div");
    item.className = "pair-item";
    item.innerHTML =
      '<div class="pair-names">' +
      '<span>' + escapeHtml(proCeleb) + '</span>' +
      '<span class="side-badge pro">찬성</span>' +
      '<span class="pair-vs">vs</span>' +
      '<span>' + escapeHtml(conCeleb) + '</span>' +
      '<span class="side-badge con">반대</span>' +
      '</div>' +
      '<span class="pair-arrow">›</span>';

    item.addEventListener("click", function () {
      openPairChat(pair, payloads, proCeleb, conCeleb);
    });
    pairsList.appendChild(item);
  });
}

function openPairChat(pair, payloads, proCeleb, conCeleb) {
  var pairsList = document.getElementById("pairs-list");
  var pairChatView = document.getElementById("pair-chat-view");

  pairsList.style.display = "none";
  pairChatView.style.display = "flex";

  document.getElementById("pair-chat-title").textContent =
    proCeleb + " (찬성) vs " + conCeleb + " (반대)";

  var proPayload = payloads[pair.proNick] || {};
  var conPayload = payloads[pair.conNick] || {};

  var merged = mergeMessages(
    proPayload.messages || [],
    conPayload.messages || [],
    pair.proNick,
    pair.conNick,
    proCeleb,
    conCeleb,
    "pro",
    "con"
  );

  var chatArea = document.getElementById("pair-chat-messages");
  renderMessages(chatArea, merged, null); // null = 모두 partner처럼 표시

  document.getElementById("back-btn").onclick = function () {
    pairChatView.style.display = "none";
    pairsList.style.display = "block";
  };
}

// ───────────────────────────────
// 매칭 로직
// ───────────────────────────────

function buildAllPairs(payloads) {
  var pros = [];
  var cons = [];

  Object.keys(payloads).forEach(function (nick) {
    var p = payloads[nick];
    if (!p || !p.claim || !p.side) return;
    if (p.side === "pro") pros.push({ nickname: nick, timestamp: p.claim.timestamp, side: "pro" });
    else cons.push({ nickname: nick, timestamp: p.claim.timestamp, side: "con" });
  });

  pros.sort(function (a, b) { return a.timestamp - b.timestamp; });
  cons.sort(function (a, b) { return a.timestamp - b.timestamp; });

  var pairs = [];
  var len = Math.min(pros.length, cons.length);
  for (var i = 0; i < len; i++) {
    pairs.push({ proNick: pros[i].nickname, conNick: cons[i].nickname });
  }
  return pairs;
}

function findMyMatch(info, payloads) {
  var pros = [];
  var cons = [];

  Object.keys(payloads).forEach(function (nick) {
    var p = payloads[nick];
    if (!p || !p.claim || !p.side) return;
    if (p.side === "pro") pros.push({ nickname: nick, timestamp: p.claim.timestamp, side: "pro" });
    else cons.push({ nickname: nick, timestamp: p.claim.timestamp, side: "con" });
  });

  pros.sort(function (a, b) { return a.timestamp - b.timestamp; });
  cons.sort(function (a, b) { return a.timestamp - b.timestamp; });

  var mySideArr = info.side === "pro" ? pros : cons;
  var otherSideArr = info.side === "pro" ? cons : pros;

  var myIndex = -1;
  for (var i = 0; i < mySideArr.length; i++) {
    if (mySideArr[i].nickname === info.nickname) {
      myIndex = i;
      break;
    }
  }

  if (myIndex === -1 || myIndex >= otherSideArr.length) return null;
  return otherSideArr[myIndex];
}

// ───────────────────────────────
// 메시지 렌더링
// ───────────────────────────────

function mergeMessages(msgsA, msgsB, nickA, nickB, celebA, celebB, sideA, sideB) {
  var all = [];
  (msgsA || []).forEach(function (m) {
    all.push({ text: m.text, timestamp: m.timestamp, nickname: nickA, celeb: celebA, side: sideA });
  });
  (msgsB || []).forEach(function (m) {
    all.push({ text: m.text, timestamp: m.timestamp, nickname: nickB, celeb: celebB, side: sideB });
  });
  all.sort(function (a, b) { return a.timestamp - b.timestamp; });
  return all;
}

function renderClaimBubble(celeb, side, text, position) {
  var sideLabel = side === "pro" ? "찬성" : "반대";
  return (
    '<div class="claim-bubble-row ' + position + '">' +
    '<div class="msg-sender">' +
    '<span class="claim-label">첫 주장</span>' +
    escapeHtml(celeb) +
    '<span class="side-badge ' + side + '">' + sideLabel + '</span>' +
    '</div>' +
    '<div class="msg-bubble ' + side + '">' + escapeHtml(text) + '</div>' +
    '</div>'
  );
}

function renderMessages(container, messages, myNickname) {
  if (messages.length === 0) {
    container.innerHTML = '<p class="chat-empty">아직 채팅이 없습니다.</p>';
    return;
  }

  container.innerHTML = messages.map(function (m) {
    var isMe = myNickname && m.nickname === myNickname;
    var rowClass = isMe ? "mine" : "partner";
    var timeStr = formatTime(m.timestamp);
    return (
      '<div class="msg-row ' + rowClass + '">' +
      '<div class="msg-sender">' +
      escapeHtml(m.celeb) +
      '<span class="side-badge ' + m.side + '">' + (m.side === "pro" ? "찬성" : "반대") + '</span>' +
      '</div>' +
      '<div class="msg-bubble ' + m.side + '">' + escapeHtml(m.text) + '</div>' +
      '<div class="msg-time">' + timeStr + '</div>' +
      '</div>'
    );
  }).join("");

  // 스크롤 맨 아래로
  container.scrollTop = container.scrollHeight;
}

function formatTime(ts) {
  var d = new Date(ts);
  var h = d.getHours();
  var m = d.getMinutes();
  var ampm = h < 12 ? "오전" : "오후";
  var h12 = h % 12 || 12;
  return ampm + " " + h12 + ":" + pad(m);
}

// ───────────────────────────────
// 유틸
// ───────────────────────────────

function buildMyPayload(info, claim, messages) {
  return {
    celebrityName: myCelebrity,
    side: info.side,
    claim: claim,
    messages: messages || []
  };
}

function showMessage(text) {
  hideAll();
  document.getElementById("message-text").textContent = text;
  document.getElementById("message-screen").style.display = "flex";
}

function hideAll() {
  document.getElementById("message-screen").style.display = "none";
  document.getElementById("countdown-screen").style.display = "none";
  document.getElementById("claim-screen").style.display = "none";
  document.getElementById("app").style.display = "none";
}

function escapeHtml(text) {
  if (!text) return "";
  var div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}
