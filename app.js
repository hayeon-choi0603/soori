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

// 시간 제한과 무관하게 읽기 전용으로 항상 입장 가능한 닉네임
var VIEWER_NICKNAMES = ["tomo", "gregory", "soori"];
function isViewer(info) {
  return !!(info && info.nickname && VIEWER_NICKNAMES.indexOf(info.nickname) !== -1);
}

// 이 시각(KST) 이후로는 모두에게 공개되지만 쓰기는 차단됨
// 2026-04-15 18:00 KST = 2026-04-15 09:00 UTC
var VIEW_ONLY_AFTER_MS = Date.UTC(2026, 11, 31, 15, 0, 0); // 데모용: 2026-12-31 24:00 KST
var viewOnlyMode = false;
function isReadOnly(info) {
  return viewOnlyMode || isViewer(info);
}

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
    viewOnlyMode = serverDate.getTime() >= VIEW_ONLY_AFTER_MS;

    if (!isDebateOpen(serverDate) && !isReadOnly(info)) {
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
    viewOnlyMode = localDate.getTime() >= VIEW_ONLY_AFTER_MS;
    if (!isDebateOpen(localDate) && !isReadOnly(info)) {
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
  return true; // 데모용: 시간 제한 없이 항상 열림
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
    if (!myPayload.claim && !isReadOnly(info)) {
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

  // 읽기 전용 (아키텍트/아젠다세터/뷰어/감상 모드)
  if (info.role !== "participant" || isReadOnly(info)) {
    input.disabled = true;
    submitBtn.disabled = true;
    submitBtn.textContent = viewOnlyMode
      ? "토론이 마감되어 읽기 전용입니다"
      : (isViewer(info)
        ? "읽기 전용 계정입니다"
        : "참여자만 주장을 제출할 수 있습니다");
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
  document.getElementById("app").style.display = "flex";

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
      document.getElementById("tab-all-chats").style.display = tab === "all-chats" ? "flex" : "none";
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
  var chatArea = document.getElementById("chat-messages");

  // 내 주장
  var myClaimHtml = renderClaimBubble(
    myCelebrity, info.side, myPayload.claim ? myPayload.claim.text : "",
    "mine", myPayload.claim ? myPayload.claim.timestamp : null
  );

  // 상대 주장 + 채팅
  var partnerClaimHtml = "";
  var messagesHtml = "";

  if (match) {
    var partnerPayload = payloads[match.nickname] || {};
    var partnerCeleb = partnerPayload.celebrityName || match.nickname;
    var partnerSide = partnerPayload.side || match.side;
    partnerClaimHtml = renderClaimBubble(
      partnerCeleb, partnerSide, partnerPayload.claim ? partnerPayload.claim.text : "(주장 없음)",
      "partner", partnerPayload.claim ? partnerPayload.claim.timestamp : null
    );
    var merged = mergeMessages(
      myPayload.messages || [],
      partnerPayload.messages || [],
      info.nickname,
      match.nickname,
      myCelebrity,
      partnerCeleb,
      info.side,
      partnerSide
    );
    messagesHtml = buildMessagesHtml(merged, info.nickname);
  } else {
    partnerClaimHtml = '<p class="waiting-text">매칭 상대를 찾고 있습니다...</p>';
  }

  chatArea.innerHTML = myClaimHtml + partnerClaimHtml + messagesHtml;
  chatArea.scrollTop = chatArea.scrollHeight;

  // 타이핑 연출 진행중이면 재렌더 후에도 유지
  if (typingActive && match) {
    var tpPayload = payloads[match.nickname] || {};
    var tpCeleb = tpPayload.celebrityName || match.nickname;
    var tpSide = tpPayload.side || match.side;
    showPartnerTyping(chatArea, tpCeleb, tpSide);
  }

  // 찬성 참여자 전용 재매칭 버튼
  var rematchBar = document.getElementById("rematch-bar");
  if (info.side === "pro" && info.role === "participant" && !isReadOnly(info) && match) {
    rematchBar.style.display = "flex";
    var rematchBtn = document.getElementById("rematch-btn");
    // 기존 이벤트 리스너 제거 후 재등록
    var newRematchBtn = rematchBtn.cloneNode(true);
    rematchBtn.parentNode.replaceChild(newRematchBtn, rematchBtn);
    newRematchBtn.addEventListener("click", function () {
      var myPayload = allPayloads[info.nickname] || {};
      var currentCount = myPayload.rematchCount || 0;
      var newPayload = buildMyPayload(info, myPayload.claim, myPayload.messages, currentCount + 1);
      info.savePayload(newPayload);
    });
  } else {
    rematchBar.style.display = "none";
  }

  // 채팅 입력
  setupChatInput(info, payloads, match);
}

function setupChatInput(info, payloads, match) {
  var inputArea = document.getElementById("chat-input-area");
  var sendBtn = document.getElementById("chat-send-btn");
  var chatInput = document.getElementById("chat-input");

  if (!match || info.role !== "participant" || info.status !== "active" || isReadOnly(info)) {
    inputArea.style.display = match ? "flex" : "none";
    if (sendBtn) sendBtn.disabled = true;
    if (chatInput) {
      chatInput.disabled = true;
      if (viewOnlyMode) chatInput.placeholder = "토론이 마감되어 읽기 전용입니다";
      else if (isViewer(info)) chatInput.placeholder = "읽기 전용 계정입니다";
    }
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

    var newPayload = buildMyPayload(info, myPayload.claim, messages, myPayload.rematchCount);
    // 즉시 비워서 onPayloadsChange 재렌더 시 값이 유지되지 않도록
    newChatInput.value = "";
    info.savePayload(newPayload).then(function () {
      var current = document.getElementById("chat-input");
      if (current) current.value = "";
      scheduleTypingAfterSend(match);
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
    var proPayload = pair.proNick ? (payloads[pair.proNick] || {}) : {};
    var conPayload = pair.conNick ? (payloads[pair.conNick] || {}) : {};
    var proCeleb = pair.proNick ? (proPayload.celebrityName || pair.proNick) : "매칭 대기 중";
    var conCeleb = pair.conNick ? (conPayload.celebrityName || pair.conNick) : "매칭 대기 중";

    var lastTs = lastMessageTimestamp(proPayload, conPayload);
    var lastLabel = lastTs ? formatRelativeTime(lastTs)
      : (pair.proNick && pair.conNick ? "아직 대화 없음" : "상대 대기 중");

    var item = document.createElement("div");
    item.className = "pair-item";
    var proWait = !pair.proNick ? " waiting" : "";
    var conWait = !pair.conNick ? " waiting" : "";
    var proAvatar = pair.proNick
      ? renderAvatar(proCeleb)
      : '<div class="avatar avatar-placeholder"></div>';
    var conAvatar = pair.conNick
      ? renderAvatar(conCeleb)
      : '<div class="avatar avatar-placeholder"></div>';
    item.innerHTML =
      '<div class="pair-names">' +
      '<span class="pair-avatar' + proWait + '">' + proAvatar + '</span>' +
      '<span class="pair-name' + proWait + '">' + escapeHtml(proCeleb) + '</span>' +
      '<span class="side-badge pro' + proWait + '">찬성</span>' +
      '<span class="pair-vs">vs</span>' +
      '<span class="pair-avatar' + conWait + '">' + conAvatar + '</span>' +
      '<span class="pair-name' + conWait + '">' + escapeHtml(conCeleb) + '</span>' +
      '<span class="side-badge con' + conWait + '">반대</span>' +
      '</div>' +
      '<div class="pair-right">' +
      '<span class="pair-last-time">' + escapeHtml(lastLabel) + '</span>' +
      '<span class="pair-arrow">›</span>' +
      '</div>';

    item.addEventListener("click", function () {
      openPairChat(pair, payloads, proCeleb, conCeleb);
    });
    pairsList.appendChild(item);
  });
}

function lastMessageTimestamp(a, b) {
  var ts = 0;
  [a, b].forEach(function (p) {
    var msgs = (p && p.messages) || [];
    if (msgs.length > 0) {
      var t = msgs[msgs.length - 1].timestamp || 0;
      if (t > ts) ts = t;
    }
  });
  return ts || null;
}

function formatRelativeTime(ts) {
  var diffMs = Date.now() - ts;
  if (diffMs < 60000) return "방금 전";
  var mins = Math.floor(diffMs / 60000);
  if (mins < 60) return mins + "분 전";
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "시간 전";
  var days = Math.floor(hours / 24);
  return days + "일 전";
}

function openPairChat(pair, payloads, proCeleb, conCeleb) {
  var pairsList = document.getElementById("pairs-list");
  var pairChatView = document.getElementById("pair-chat-view");

  pairsList.style.display = "none";
  pairChatView.style.display = "flex";
  pairChatView.style.flex = "1";
  pairChatView.style.minHeight = "0";

  document.getElementById("pair-chat-title").textContent =
    proCeleb + " (찬성) vs " + conCeleb + " (반대)";

  var proPayload = pair.proNick ? (payloads[pair.proNick] || {}) : {};
  var conPayload = pair.conNick ? (payloads[pair.conNick] || {}) : {};

  var merged = mergeMessages(
    proPayload.messages || [],
    conPayload.messages || [],
    pair.proNick || "__none_pro__",
    pair.conNick || "__none_con__",
    proCeleb,
    conCeleb,
    "pro",
    "con"
  );

  var chatArea = document.getElementById("pair-chat-messages");
  var mySide = (myInfo && myInfo.side) || "pro";
  function posBySide(side) { return side === mySide ? "mine" : "partner"; }

  var claimsHtml = "";
  if (proPayload.claim) {
    claimsHtml += renderClaimBubble(proCeleb, "pro", proPayload.claim.text, posBySide("pro"), proPayload.claim.timestamp);
  }
  if (conPayload.claim) {
    claimsHtml += renderClaimBubble(conCeleb, "con", conPayload.claim.text, posBySide("con"), conPayload.claim.timestamp);
  }
  if (!pair.proNick || !pair.conNick) {
    claimsHtml += '<p class="waiting-text">아직 매칭 상대가 없습니다.</p>';
  }

  var mySideNick = mySide === "pro" ? pair.proNick : pair.conNick;
  chatArea.innerHTML = claimsHtml + buildMessagesHtml(merged, mySideNick || "__none__");
  chatArea.scrollTop = chatArea.scrollHeight;

  document.getElementById("back-btn").onclick = function () {
    pairChatView.style.display = "none";
    pairsList.style.display = "flex";
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
    if (p.side === "pro") pros.push({ nickname: nick, timestamp: p.claim.timestamp, side: "pro", rematchCount: p.rematchCount || 0 });
    else cons.push({ nickname: nick, timestamp: p.claim.timestamp, side: "con" });
  });

  pros.sort(function (a, b) { return a.timestamp - b.timestamp; });
  cons.sort(function (a, b) { return a.timestamp - b.timestamp; });

  var pairs = [];
  var matchedConNicks = {};

  // 찬성 유저별로 rematchCount를 이용해 매칭
  for (var i = 0; i < pros.length; i++) {
    var conNick = null;
    if (cons.length > 0) {
      var conIndex = (i + pros[i].rematchCount) % cons.length;
      conNick = cons[conIndex].nickname;
    }
    pairs.push({ proNick: pros[i].nickname, conNick: conNick });
    if (conNick) matchedConNicks[conNick] = true;
  }

  // 아무 찬성과도 매칭되지 않은 반대 유저는 별도 항목으로 추가
  for (var j = 0; j < cons.length; j++) {
    if (!matchedConNicks[cons[j].nickname]) {
      pairs.push({ proNick: null, conNick: cons[j].nickname });
    }
  }

  return pairs;
}

function findMyMatch(info, payloads) {
  var pros = [];
  var cons = [];

  Object.keys(payloads).forEach(function (nick) {
    var p = payloads[nick];
    if (!p || !p.claim || !p.side) return;
    if (p.side === "pro") pros.push({ nickname: nick, timestamp: p.claim.timestamp, side: "pro", rematchCount: p.rematchCount || 0 });
    else cons.push({ nickname: nick, timestamp: p.claim.timestamp, side: "con" });
  });

  pros.sort(function (a, b) { return a.timestamp - b.timestamp; });
  cons.sort(function (a, b) { return a.timestamp - b.timestamp; });

  if (info.side === "pro") {
    // 내 인덱스 찾기
    var myIndex = -1;
    for (var i = 0; i < pros.length; i++) {
      if (pros[i].nickname === info.nickname) { myIndex = i; break; }
    }
    if (myIndex === -1 || cons.length === 0) return null;
    var conIndex = (myIndex + pros[myIndex].rematchCount) % cons.length;
    return cons[conIndex];
  } else {
    // 반대 유저: 나를 현재 가리키고 있는 찬성 유저를 찾음
    var myConIndex = -1;
    for (var j = 0; j < cons.length; j++) {
      if (cons[j].nickname === info.nickname) { myConIndex = j; break; }
    }
    if (myConIndex === -1) return null;
    for (var k = 0; k < pros.length; k++) {
      var targetConIndex = (k + pros[k].rematchCount) % cons.length;
      if (targetConIndex === myConIndex) return pros[k];
    }
    return null;
  }
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

function renderClaimBubble(celeb, side, text, position, timestamp) {
  var sideLabel = side === "pro" ? "찬성" : "반대";
  var avatar = renderAvatar(celeb);
  var timeBlock = timestamp
    ? '<div class="msg-time">' + formatTime(timestamp) + '</div>'
    : '';
  var body =
    '<div class="msg-body">' +
    '<div class="msg-sender">' +
    escapeHtml(celeb) +
    '<span class="side-badge ' + side + '">' + sideLabel + '</span>' +
    '</div>' +
    '<div class="msg-bubble ' + side + '">' + escapeHtml(text) + '</div>' +
    timeBlock +
    '</div>';
  return (
    '<div class="msg-row ' + position + '">' +
    (position === "mine" ? (body + avatar) : (avatar + body)) +
    '</div>'
  );
}

function buildMessagesHtml(messages, myNickname) {
  return messages.map(function (m) {
    var isMe = myNickname && m.nickname === myNickname;
    var rowClass = isMe ? "mine" : "partner";
    var timeStr = formatTime(m.timestamp);
    var avatar = renderAvatar(m.celeb);
    var body =
      '<div class="msg-body">' +
      '<div class="msg-sender">' +
      escapeHtml(m.celeb) +
      '<span class="side-badge ' + m.side + '">' + (m.side === "pro" ? "찬성" : "반대") + '</span>' +
      '</div>' +
      '<div class="msg-bubble ' + m.side + '">' + escapeHtml(m.text) + '</div>' +
      '<div class="msg-time">' + timeStr + '</div>' +
      '</div>';
    return (
      '<div class="msg-row ' + rowClass + '">' +
      (isMe ? (body + avatar) : (avatar + body)) +
      '</div>'
    );
  }).join("");
}

function renderMessages(container, messages, myNickname) {
  if (messages.length === 0) {
    container.innerHTML = '<p class="chat-empty">아직 채팅이 없습니다.</p>';
    return;
  }
  container.innerHTML = buildMessagesHtml(messages, myNickname);
  container.scrollTop = container.scrollHeight;
}

// ───────────────────────────────
// 아바타 (이니셜 + 색상 + 온라인 dot)
// ───────────────────────────────

var CELEBRITY_IMAGES = {
  "최미나수": "images/01.jpg",
  "지드래곤": "images/02.jpg",
  "제니": "images/03.jpg",
  "이재용": "images/04.jpg",
  "카리나": "images/05.jpg",
  "차은우": "images/06.jpg",
  "티모시 샬라메": "images/07.jpg",
  "박서준": "images/08.jpg",
  "킴 카다시안": "images/09.jpg",
  "한소희": "images/10.jpg",
  "카디비": "images/11.jpg",
  "장원영": "images/12.jpg",
  "안유진": "images/13.jpg",
  "이수만": "images/14.jpg",
  "민희진": "images/15.jpg",
  "태연": "images/16.jpg",
  "백현": "images/17.jpg",
  "방시혁": "images/18.jpg",
  "이도현": "images/19.jpg",
  "변우석": "images/20.jpg",
  "레이디 가가": "images/21.jpg",
  "박보검": "images/22.jpg",
  "수지": "images/23.jpg",
  "로제": "images/24.jpg",
  "비욘세": "images/25.jpg"
};

function renderAvatar(name) {
  var img = CELEBRITY_IMAGES[name];
  var color = avatarColor(name || "");
  var inner;
  if (img) {
    inner = '<img class="avatar-img" src="' + encodeURI(img) + '" alt="' + escapeHtml(name) + '">';
  } else {
    var initial = (name || "?").trim().charAt(0) || "?";
    inner = '<span class="avatar-initial">' + escapeHtml(initial) + '</span>';
  }
  return (
    '<div class="avatar"' + (img ? '' : ' style="background:' + color + '"') + '>' +
    inner +
    '<span class="avatar-dot"></span>' +
    '</div>'
  );
}

function avatarColor(seed) {
  var h = 0;
  for (var i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  var hue = h % 360;
  return 'hsl(' + hue + ', 55%, 62%)';
}

// ───────────────────────────────
// 타이핑 연출
// ───────────────────────────────

var typingShowTimeout = null;
var typingHideTimeout = null;
var typingActive = false;

function showPartnerTyping(container, partnerCeleb, partnerSide) {
  if (!container || !partnerCeleb) return;
  hidePartnerTyping(container);

  var row = document.createElement("div");
  row.className = "msg-row partner typing-row";
  row.id = "typing-indicator";
  row.innerHTML =
    renderAvatar(partnerCeleb) +
    '<div class="msg-body">' +
    '<div class="msg-sender">' + escapeHtml(partnerCeleb) +
    '<span class="side-badge ' + partnerSide + '">' + (partnerSide === "pro" ? "찬성" : "반대") + '</span>' +
    '</div>' +
    '<div class="msg-bubble ' + partnerSide + ' typing-bubble">' +
    '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>' +
    '</div>' +
    '</div>';
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function hidePartnerTyping(container) {
  var el = container && container.querySelector("#typing-indicator");
  if (el) el.remove();
}

function scheduleTypingAfterSend(match) {
  if (typingShowTimeout) clearTimeout(typingShowTimeout);
  if (typingHideTimeout) clearTimeout(typingHideTimeout);
  typingActive = false;
  hidePartnerTyping(document.getElementById("chat-messages"));

  typingShowTimeout = setTimeout(function () {
    var container = document.getElementById("chat-messages");
    var partnerPayload = allPayloads[match.nickname] || {};
    var partnerCeleb = partnerPayload.celebrityName || match.nickname;
    var partnerSide = partnerPayload.side || match.side;
    typingActive = true;
    showPartnerTyping(container, partnerCeleb, partnerSide);

    typingHideTimeout = setTimeout(function () {
      typingActive = false;
      hidePartnerTyping(document.getElementById("chat-messages"));
    }, 5000);
  }, 5000);
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

function buildMyPayload(info, claim, messages, rematchCount) {
  var payload = {
    celebrityName: myCelebrity,
    side: info.side,
    claim: claim,
    messages: messages || []
  };
  if (rematchCount !== undefined && rematchCount !== null) {
    payload.rematchCount = rematchCount;
  }
  return payload;
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
