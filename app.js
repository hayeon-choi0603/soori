/**
 * 토론 앱 — 틴더 스타일
 *
 * 흐름:
 *  1) 카드(찬반) → 버튼 또는 스와이프로 선택
 *  2) 매칭 대기 화면 → 강경도 선택 → 매칭 시작
 *  3) 매칭 완료 화면
 *  4) 1:1 채팅
 */

// ── 설정 ─────────────────────────────────────────────────
var DEBATE_START_HOUR = 21;
var DEBATE_END_HOUR   = 24;

var INTENSITY_LABELS = { 1:"매우 온건", 2:"온건", 3:"중립", 4:"강경", 5:"매우 강경" };

var CELEB_POOL = [
  "아이유","BTS RM","박서준","손예진","공유",
  "김태리","이준호","수지","현빈","박보검",
  "전지현","송강","한소희","차은우","이영애",
  "김수현","고윤정","변우석","정호연","류준열",
  "김고은","최우식","박은빈","위하준","신민아",
  "주지훈","이세영","옹성우","박지현","남주혁"
];

// 연예인 이름 첫 글자로 아바타 배경색
var AVATAR_COLORS = ["#FF6B6B","#FF8E53","#FFC947","#6BCB77","#4D96FF","#C77DFF","#FF6B9D","#00B4D8"];

// ── 상태 ─────────────────────────────────────────────────
var myInfo       = null;
var myCelebName  = null;
var myAvColor    = null;
var myChosenSide = null;
var myIntensity  = null;
var myMatchKey   = null;
var oppData      = null;   // { celebName, side, intensity, avatarColor }
var debateEndTime= null;
var timerInterval= null;
var countdownInterval = null;
var chatSetup    = false;
var lastMsgCount = 0;

// 로컬 채팅 메시지 캐시 (onPayloadsChange 콜백에서 업데이트)
var cachedPayloads = {};

var urlParams = new URLSearchParams(location.search);
var IS_DEMO   = urlParams.get("demo") === "true";
var IS_VIEWER = urlParams.get("view") === "true";

// ── 유틸 ─────────────────────────────────────────────────
function getCelebName(nickname) {
  var hash = 0;
  for (var i = 0; i < nickname.length; i++) hash = (hash * 31 + nickname.charCodeAt(i)) & 0xffffffff;
  return CELEB_POOL[Math.abs(hash) % CELEB_POOL.length];
}

function getAvatarColor(name) {
  var hash = 0;
  for (var i = 0; i < name.length; i++) hash = (hash * 17 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function avatarChar(name) { return name ? name.charAt(0) : "?"; }

function makeAvatar(el, name, color) {
  el.textContent = avatarChar(name);
  el.style.background = color || getAvatarColor(name);
}

function iLabel(n) { return INTENSITY_LABELS[n] || ""; }
function stanceText(side, intensity) { return (side === "pro" ? "찬성" : "반대") + " · " + iLabel(intensity); }

function getKSTHour() { return new Date(Date.now() + 9 * 3600000).getUTCHours(); }
function isDebateOpen() { var h = getKSTHour(); return DEBATE_END_HOUR >= 24 ? h >= DEBATE_START_HOUR : (h >= DEBATE_START_HOUR && h < DEBATE_END_HOUR); }
function getNextStart() {
  var kst = new Date(Date.now() + 9 * 3600000);
  if (kst.getUTCHours() < DEBATE_START_HOUR) kst.setUTCHours(DEBATE_START_HOUR, 0, 0, 0);
  else { kst.setUTCDate(kst.getUTCDate() + 1); kst.setUTCHours(DEBATE_START_HOUR, 0, 0, 0); }
  return new Date(kst.getTime() - 9 * 3600000);
}
function getEndTime() {
  var kst = new Date(Date.now() + 9 * 3600000);
  if (DEBATE_END_HOUR >= 24) { kst.setUTCDate(kst.getUTCDate() + 1); kst.setUTCHours(0, 0, 0, 0); }
  else kst.setUTCHours(DEBATE_END_HOUR, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 3600000);
}

function pad(n) { return n < 10 ? "0" + n : "" + n; }
function fmtCD(ms) { if (ms <= 0) return "00:00:00"; var s = Math.floor(ms/1000); return pad(Math.floor(s/3600)) + ":" + pad(Math.floor((s%3600)/60)) + ":" + pad(s%60); }
function fmtTimer(ms) { if (ms <= 0) return "종료"; var s = Math.floor(ms/1000); return pad(Math.floor(s/60)) + ":" + pad(s%60); }
function esc(t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
function mkKey(pro, con) { return pro + "::" + con; }
function timeStr(ts) {
  var d = new Date(ts);
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

// ── 화면 전환 ─────────────────────────────────────────────
function hideAll() {
  ["message","waiting-screen","side-screen","matching-screen","match-found-screen","chat-screen","viewer-screen"].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

function showMessage(text) { hideAll(); document.getElementById("message-text").textContent = text; document.getElementById("message").style.display = "flex"; }
function showWaiting() {
  hideAll(); document.getElementById("waiting-screen").style.display = "flex";
  if (countdownInterval) clearInterval(countdownInterval);
  function tick() { var d = getNextStart() - Date.now(); document.getElementById("countdown-display").textContent = fmtCD(d); if (d <= 0) { clearInterval(countdownInterval); location.reload(); } }
  tick(); countdownInterval = setInterval(tick, 1000);
}

function showSideScreen(title) {
  hideAll();
  document.getElementById("side-topic").textContent = title || "";
  document.getElementById("card-topic-text").textContent = title || "";
  document.getElementById("side-screen").style.display = "flex";
}

function showMatchingScreen() {
  hideAll();
  makeAvatar(document.getElementById("matching-avatar"), myCelebName, myAvColor);
  document.getElementById("matching-celeb-name").textContent = myCelebName;
  var sb = document.getElementById("matching-side-badge");
  sb.textContent = myChosenSide === "pro" ? "찬성 👍" : "반대 ✕";
  sb.className = "matching-side-badge " + myChosenSide;
  document.getElementById("searching-status").style.display = "none";
  document.querySelectorAll(".i-btn").forEach(function(b) { b.classList.remove("selected","locked"); b.disabled = false; });
  document.getElementById("matching-screen").style.display = "flex";
}

function showMatchFound(oppName, oppColor) {
  hideAll();
  makeAvatar(document.getElementById("av-me"), myCelebName, myAvColor);
  makeAvatar(document.getElementById("av-opp"), oppName, oppColor);
  document.getElementById("match-found-sub").textContent = oppName + "과(와) 매칭되었습니다";
  document.getElementById("match-found-screen").style.display = "flex";
  document.getElementById("start-chat-btn").onclick = function() { showChatScreen(); };
}

function showChatScreen() {
  hideAll();
  document.getElementById("chat-screen").style.display = "flex";
  // 오pp 정보
  if (oppData) {
    makeAvatar(document.getElementById("chat-opp-avatar"), oppData.celebName, oppData.avatarColor);
    document.getElementById("chat-opp-name").textContent = oppData.celebName;
    document.getElementById("chat-opp-stance").textContent = stanceText(oppData.side, oppData.intensity);
  }
  document.getElementById("chat-topic-text").textContent = myInfo ? (myInfo.title || "") : "";
  startTimer();
  renderMessages();
  setupChat();
  scrollToBottom();
}

function showViewer() { hideAll(); document.getElementById("viewer-screen").style.display = "block"; }

// ── 타이머 ─────────────────────────────────────────────────
function startTimer() {
  debateEndTime = IS_DEMO ? new Date(Date.now() + 60 * 60 * 1000) : getEndTime();
  if (timerInterval) clearInterval(timerInterval);
  function tick() {
    var diff = debateEndTime - Date.now();
    var el = document.getElementById("chat-timer");
    if (el) el.textContent = fmtTimer(diff);
    if (diff <= 0) { clearInterval(timerInterval); endDebate(); }
  }
  tick(); timerInterval = setInterval(tick, 1000);
}

function endDebate() {
  var bar = document.getElementById("chat-ended-bar");
  if (bar) bar.style.display = "flex";
  var inp = document.getElementById("chat-input-area");
  if (inp) inp.style.display = "none";
}

// ── 스와이프 카드 ──────────────────────────────────────────
function setupCardSwipe(onSelect) {
  var card = document.getElementById("debate-card");
  var hintL = document.getElementById("hint-left");
  var hintR = document.getElementById("hint-right");
  var startX = 0, curX = 0, dragging = false;

  function onStart(x) { startX = x; dragging = true; }
  function onMove(x) {
    if (!dragging) return;
    curX = x - startX;
    var rot = curX * 0.08;
    card.style.transform = "translateX(" + curX + "px) rotate(" + rot + "deg)";
    if (curX > 30) { hintR.style.opacity = Math.min((curX - 30) / 60, 1); hintL.style.opacity = 0; }
    else if (curX < -30) { hintL.style.opacity = Math.min((-curX - 30) / 60, 1); hintR.style.opacity = 0; }
    else { hintL.style.opacity = 0; hintR.style.opacity = 0; }
  }
  function onEnd() {
    if (!dragging) return; dragging = false;
    hintL.style.opacity = 0; hintR.style.opacity = 0;
    if (curX > 80) { flyOut("right", function() { onSelect("pro"); }); }
    else if (curX < -80) { flyOut("left", function() { onSelect("con"); }); }
    else { card.style.transform = ""; card.style.transition = "transform 0.3s"; setTimeout(function() { card.style.transition = ""; }, 300); }
    curX = 0;
  }

  card.addEventListener("mousedown", function(e) { onStart(e.clientX); });
  window.addEventListener("mousemove", function(e) { onMove(e.clientX); });
  window.addEventListener("mouseup", onEnd);

  card.addEventListener("touchstart", function(e) { onStart(e.touches[0].clientX); }, { passive: true });
  window.addEventListener("touchmove", function(e) { onMove(e.touches[0].clientX); }, { passive: true });
  window.addEventListener("touchend", onEnd);

  function flyOut(dir, cb) {
    var tx = dir === "right" ? window.innerWidth + 100 : -(window.innerWidth + 100);
    card.style.transition = "transform 0.35s ease";
    card.style.transform = "translateX(" + tx + "px) rotate(" + (dir === "right" ? 15 : -15) + "deg)";
    setTimeout(cb, 350);
  }

  // 버튼도 flyOut 연동
  document.getElementById("pro-btn").addEventListener("click", function() { flyOut("right", function() { onSelect("pro"); }); });
  document.getElementById("con-btn").addEventListener("click", function() { flyOut("left", function() { onSelect("con"); }); });
}

// ── 강경도 선택 ───────────────────────────────────────────
function setupIntensitySelection(onIntensitySelected) {
  document.querySelectorAll(".i-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      if (btn.disabled) return;
      myIntensity = parseInt(btn.dataset.intensity);
      document.querySelectorAll(".i-btn").forEach(function(b) { b.classList.add("locked"); b.disabled = true; b.classList.remove("selected"); });
      btn.classList.add("selected");
      document.getElementById("searching-text").textContent = stanceText(myChosenSide, myIntensity) + " · 상대 탐색 중";
      document.getElementById("searching-status").style.display = "flex";
      onIntensitySelected(myIntensity);
    });
  });
}

// ── 매칭 로직 ─────────────────────────────────────────────
function tryMatch(payloads, myNick) {
  var myP = payloads[myNick];
  if (!myP || !myP.side || !myP.intensity || myP.matchKey) return null;
  var oppSide = myP.side === "pro" ? "con" : "pro";
  var best = null, bestDiff = -1;
  Object.keys(payloads).forEach(function(nick) {
    if (nick === myNick) return;
    var p = payloads[nick];
    if (!p || p.side !== oppSide || !p.intensity || p.matchKey) return;
    var diff = Math.abs(myP.intensity - p.intensity);
    if (diff > bestDiff) { bestDiff = diff; best = nick; }
  });
  if (!best) return null;
  return mkKey(myP.side === "pro" ? myNick : best, myP.side === "con" ? myNick : best);
}

// ── 채팅 렌더 ─────────────────────────────────────────────
function getMyMessages() {
  if (!myMatchKey || !myInfo) return [];
  var myP = cachedPayloads[myInfo.nickname];
  return (myP && myP.messages) ? myP.messages : [];
}

function getOppMessages() {
  if (!myMatchKey || !myInfo) return [];
  var parts = myMatchKey.split("::");
  var oppNick = (cachedPayloads[myInfo.nickname] && cachedPayloads[myInfo.nickname].side === "pro") ? parts[1] : parts[0];
  var oppP = cachedPayloads[oppNick];
  return (oppP && oppP.messages) ? oppP.messages : [];
}

function renderMessages() {
  var myMsgs  = getMyMessages().map(function(m) { return { text: m.text, ts: m.timestamp, mine: true }; });
  var oppMsgs = getOppMessages().map(function(m) { return { text: m.text, ts: m.timestamp, mine: false }; });
  var all = myMsgs.concat(oppMsgs).sort(function(a,b) { return a.ts - b.ts; });

  if (all.length === lastMsgCount) return;
  lastMsgCount = all.length;

  var container = document.getElementById("chat-messages");
  if (!container) return;

  container.innerHTML = all.map(function(m) {
    var cls = m.mine ? "bubble mine" : "bubble theirs";
    var name = m.mine ? "" : ('<div class="bubble-name">' + esc(oppData ? oppData.celebName : "상대") + '</div>');
    return (
      '<div class="msg-row ' + (m.mine ? "mine" : "theirs") + '">' +
        (!m.mine ? '<div class="msg-avatar">' + esc(avatarChar(oppData ? oppData.celebName : "?")) + '</div>' : '') +
        '<div class="msg-content">' +
          name +
          '<div class="' + cls + '">' + esc(m.text) + '</div>' +
          '<div class="bubble-time">' + timeStr(m.ts) + '</div>' +
        '</div>' +
      '</div>'
    );
  }).join("");

  scrollToBottom();
}

function scrollToBottom() {
  var c = document.getElementById("chat-messages");
  if (c) c.scrollTop = c.scrollHeight;
}

// ── 채팅 입력 ─────────────────────────────────────────────
function setupChat() {
  if (chatSetup) return;
  chatSetup = true;

  var input   = document.getElementById("chat-input");
  var sendBtn = document.getElementById("chat-send-btn");

  // 자동 높이
  input.addEventListener("input", function() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  function send() {
    if (debateEndTime && Date.now() >= debateEndTime.getTime()) { endDebate(); return; }
    var text = input.value.trim();
    if (!text) return;
    sendBtn.disabled = true;
    input.value = ""; input.style.height = "auto";

    if (IS_DEMO) {
      // 데모: 로컬에서 바로 추가
      if (!cachedPayloads[myInfo.nickname]) cachedPayloads[myInfo.nickname] = { messages: [] };
      cachedPayloads[myInfo.nickname].messages.push({ text: text, timestamp: Date.now() });
      renderMessages();
      sendBtn.disabled = false;
      return;
    }

    myInfo.loadPayloads().then(function(payloads) {
      var mine = ((payloads[myInfo.nickname] && payloads[myInfo.nickname].messages) || []).slice();
      mine.push({ text: text, timestamp: Date.now() });
      return myInfo.savePayload({
        celebName: myCelebName, side: myChosenSide, intensity: myIntensity,
        matchKey: myMatchKey, messages: mine
      });
    }).then(function() { sendBtn.disabled = false; })
      .catch(function() { sendBtn.disabled = false; });
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
}

// ── 관찰자 ────────────────────────────────────────────────
function renderViewer(payloads) {
  var matches = {};
  Object.keys(payloads).forEach(function(nick) {
    var p = payloads[nick];
    if (!p || !p.matchKey) return;
    if (!matches[p.matchKey]) matches[p.matchKey] = [];
    matches[p.matchKey].push({ nick: nick, p: p });
  });

  var container = document.getElementById("viewer-matches");
  var keys = Object.keys(matches);
  if (!keys.length) { container.innerHTML = '<p style="text-align:center;padding:3rem;color:#aaa;font-size:0.85rem">아직 매칭이 없습니다</p>'; return; }

  container.innerHTML = keys.map(function(key, idx) {
    var pair = matches[key];
    var proE = pair.find(function(e){ return e.p.side === "pro"; });
    var conE = pair.find(function(e){ return e.p.side === "con"; });
    var proName = proE ? (proE.p.celebName || proE.nick) : "?";
    var conName = conE ? (conE.p.celebName || conE.nick) : "?";
    var proMsgs = ((proE && proE.p.messages) || []).slice();
    var conMsgs = ((conE && conE.p.messages) || []).slice();
    var all = proMsgs.map(function(m){ return { name: proName, side:"pro", text:m.text, ts:m.timestamp }; })
              .concat(conMsgs.map(function(m){ return { name: conName, side:"con", text:m.text, ts:m.timestamp }; }))
              .sort(function(a,b){ return a.ts - b.ts; });

    var bubbles = all.length ? all.map(function(m) {
      return '<div class="v-bubble-row ' + m.side + '">' +
        '<div class="v-name">' + esc(m.name) + ' <span class="v-side-tag ' + m.side + '">' + (m.side==="pro"?"찬성":"반대") + '</span></div>' +
        '<div class="v-bubble ' + m.side + '">' + esc(m.text) + '</div>' +
        '<div class="v-time">' + timeStr(m.ts) + '</div>' +
      '</div>';
    }).join("") : '<p style="color:#bbb;font-size:0.8rem;padding:1rem">아직 대화가 없습니다</p>';

    return '<div class="v-match-card">' +
      '<div class="v-match-header">' +
        '<span class="v-match-num">#' + (idx+1) + '</span>' +
        '<span class="v-pro">' + esc(proName) + ' <span class="v-side-tag pro">찬성 ' + (proE?iLabel(proE.p.intensity):"") + '</span></span>' +
        '<span class="v-vs">vs</span>' +
        '<span class="v-con">' + esc(conName) + ' <span class="v-side-tag con">반대 ' + (conE?iLabel(conE.p.intensity):"") + '</span></span>' +
      '</div>' +
      '<div class="v-chat">' + bubbles + '</div>' +
    '</div>';
  }).join("");
}

// ── 데모 모드 ─────────────────────────────────────────────
function runDemo(title) {
  showSideScreen(title || "AI가 인간의 창의성을 대체할 수 있는가");

  setupCardSwipe(function(side) {
    myChosenSide = side;
    showMatchingScreen();

    setupIntensitySelection(function(intensity) {
      myIntensity = intensity;
      var oppSide = side === "pro" ? "con" : "pro";
      var oppInt  = 6 - intensity;
      var oppName = CELEB_POOL[Math.floor(Math.random() * CELEB_POOL.length)];
      var oppColor = getAvatarColor(oppName);

      myMatchKey = mkKey(side === "pro" ? myInfo.nickname : "demo_opp", side === "con" ? myInfo.nickname : "demo_opp");

      oppData = { celebName: oppName, side: oppSide, intensity: oppInt, avatarColor: oppColor };

      // 데모 더미 메시지
      cachedPayloads[myInfo.nickname] = { celebName: myCelebName, side: myChosenSide, intensity: myIntensity, matchKey: myMatchKey, messages: [] };
      cachedPayloads["demo_opp"] = {
        celebName: oppName, side: oppSide, intensity: oppInt, matchKey: myMatchKey,
        messages: [
          { text: "안녕하세요! 저는 " + stanceText(oppSide, oppInt) + " 입장입니다. 잘 부탁드립니다.", timestamp: Date.now() - 10000 },
          { text: "이 주제에 대해 다양한 관점에서 이야기 나눠봐요.", timestamp: Date.now() - 5000 }
        ]
      };

      setTimeout(function() {
        showMatchFound(oppName, oppColor);
      }, 1000);
    });
  });
}

// ── 메인 ──────────────────────────────────────────────────
window.DebateCore.onReady(function(info) {
  myInfo = info;
  if (!info.nickname) { showMessage("토론 플랫폼을 통해 다시 접속하세요."); return; }
  myCelebName = getCelebName(info.nickname);
  myAvColor   = getAvatarColor(myCelebName);

  // 관찰자 모드
  if (IS_VIEWER) {
    var vt = document.getElementById("viewer-title");
    if (vt) vt.textContent = info.title || "";
    showViewer();
    info.onPayloadsChange(function(payloads) { renderViewer(payloads); });
    return;
  }

  // 데모 모드
  if (IS_DEMO) { runDemo(info.title); return; }

  // 실제 모드
  if (info.status === "pending") { showWaiting(); return; }
  if (info.status !== "active")  { showMessage("토론이 종료되었습니다."); return; }
  if (!isDebateOpen())           { showWaiting(); return; }

  var isReadonly = info.role !== "participant";

  // STEP 1: 찬반 선택
  showSideScreen(info.title);
  setupCardSwipe(function(side) {
    myChosenSide = side;
    showMatchingScreen();

    // STEP 2: 강경도 선택
    setupIntensitySelection(function(intensity) {
      myIntensity = intensity;
      // payload 등록 → onPayloadsChange에서 매칭
      info.savePayload({
        celebName: myCelebName, side: myChosenSide, intensity: myIntensity,
        matchKey: null, messages: []
      });
    });
  });

  // 실시간 매칭 + 채팅 갱신
  info.onPayloadsChange(function(payloads) {
    cachedPayloads = payloads;

    var myP = payloads[info.nickname];
    if (!myP || !myP.intensity) return;  // 아직 강경도 미선택

    // 매칭 완료 상태 복원 (새로고침 등)
    if (myP.matchKey && !myMatchKey) {
      myMatchKey = myP.matchKey;
      myChosenSide = myP.side;
      myIntensity  = myP.intensity;
      var parts = myMatchKey.split("::");
      var oppNick = myP.side === "pro" ? parts[1] : parts[0];
      var oppP = payloads[oppNick];
      if (oppP) {
        oppData = { celebName: oppP.celebName || oppNick, side: oppP.side, intensity: oppP.intensity, avatarColor: getAvatarColor(oppP.celebName || oppNick) };
      }
      showChatScreen();
      return;
    }

    // 이미 매칭됨 → 채팅 업데이트
    if (myMatchKey) {
      renderMessages();
      return;
    }

    // 매칭 탐색
    var found = tryMatch(payloads, info.nickname);
    if (found && !isReadonly) {
      myMatchKey = found;
      var parts2 = found.split("::");
      var oppNick2 = myP.side === "pro" ? parts2[1] : parts2[0];
      var oppP2 = payloads[oppNick2];
      if (oppP2) {
        oppData = { celebName: oppP2.celebName || oppNick2, side: oppP2.side, intensity: oppP2.intensity, avatarColor: getAvatarColor(oppP2.celebName || oppNick2) };
      }
      info.savePayload({
        celebName: myCelebName, side: myChosenSide, intensity: myIntensity,
        matchKey: myMatchKey, messages: myP.messages || []
      }).then(function() {
        showMatchFound(oppData ? oppData.celebName : oppNick2, oppData ? oppData.avatarColor : "");
      });
    }
  });
});
