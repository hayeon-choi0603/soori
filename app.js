/**
 * 실시간 토론 — app.js
 *
 * 흐름:
 *  1) 찬반 선택 화면
 *  2) 매칭 대기 화면 진입 → 강경도 선택 → 선택 순간부터 매칭 탐색 시작
 *  3) 매칭 완료 → 토론 화면
 *
 * 매칭 기준: 찬반 반대 + 강경도 차이 최대
 *
 * ?demo=true  : 즉시 시뮬레이션
 * ?view=true  : 모든 대화 열람
 */

// ── 설정 ─────────────────────────────────────────────────
var DEBATE_START_HOUR = 21;
var DEBATE_END_HOUR   = 24;

var INTENSITY_LABELS = {
  1: "매우 온건", 2: "온건", 3: "중립", 4: "강경", 5: "매우 강경"
};

var CELEB_POOL = [
  "아이유","BTS RM","박서준","손예진","공유",
  "김태리","이준호","수지","현빈","박보검",
  "전지현","송강","한소희","차은우","이영애",
  "김수현","고윤정","변우석","정호연","류준열",
  "김고은","최우식","박은빈","위하준","신민아",
  "주지훈","이세영","옹성우","박지현","남주혁"
];

// ── 상태 ─────────────────────────────────────────────────
var myInfo        = null;
var myCelebName   = null;
var myChosenSide  = null;   // "pro" | "con"
var myIntensity   = null;   // 1~5, 선택 후 매칭 시작
var myMatchKey    = null;
var debateEndTime = null;
var timerInterval     = null;
var countdownInterval = null;
var modalSetup    = false;

var urlParams = new URLSearchParams(location.search);
var IS_DEMO   = urlParams.get("demo") === "true";
var IS_VIEWER = urlParams.get("view") === "true";

// ── 유틸 ─────────────────────────────────────────────────
function getCelebName(nickname) {
  var hash = 0;
  for (var i = 0; i < nickname.length; i++) hash = (hash * 31 + nickname.charCodeAt(i)) & 0xffffffff;
  return CELEB_POOL[Math.abs(hash) % CELEB_POOL.length];
}

function getKSTHour() { return new Date(Date.now() + 9 * 3600000).getUTCHours(); }

function isDebateOpen() {
  var h = getKSTHour();
  return DEBATE_END_HOUR >= 24 ? h >= DEBATE_START_HOUR : (h >= DEBATE_START_HOUR && h < DEBATE_END_HOUR);
}

function getNextDebateStart() {
  var kst = new Date(Date.now() + 9 * 3600000);
  if (kst.getUTCHours() < DEBATE_START_HOUR) kst.setUTCHours(DEBATE_START_HOUR, 0, 0, 0);
  else { kst.setUTCDate(kst.getUTCDate() + 1); kst.setUTCHours(DEBATE_START_HOUR, 0, 0, 0); }
  return new Date(kst.getTime() - 9 * 3600000);
}

function getTodayDebateEnd() {
  var kst = new Date(Date.now() + 9 * 3600000);
  if (DEBATE_END_HOUR >= 24) { kst.setUTCDate(kst.getUTCDate() + 1); kst.setUTCHours(0, 0, 0, 0); }
  else kst.setUTCHours(DEBATE_END_HOUR, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 3600000);
}

function pad(n) { return n < 10 ? "0" + n : "" + n; }
function fmt(ms) { if (ms <= 0) return "00:00"; var s = Math.floor(ms/1000); return pad(Math.floor(s/60)) + ":" + pad(s%60); }
function fmtCD(ms) { if (ms <= 0) return "00:00:00"; var s = Math.floor(ms/1000); return pad(Math.floor(s/3600)) + ":" + pad(Math.floor((s%3600)/60)) + ":" + pad(s%60); }
function esc(t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
function matchKey(pro, con) { return pro + "::" + con; }
function iLabel(n) { return INTENSITY_LABELS[n] || "강경도 " + n; }
function stanceText(side, intensity) { return (side === "pro" ? "찬성" : "반대") + " · " + iLabel(intensity); }

// ── 화면 전환 ─────────────────────────────────────────────
function hideAll() {
  ["message","waiting-screen","side-screen","matching-screen","app","viewer-screen"].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

function showMessage(text) {
  hideAll();
  document.getElementById("message-text").textContent = text;
  document.getElementById("message").style.display = "flex";
}

function showWaiting() {
  hideAll();
  document.getElementById("waiting-screen").style.display = "flex";
  if (countdownInterval) clearInterval(countdownInterval);
  function tick() {
    var diff = getNextDebateStart() - Date.now();
    document.getElementById("countdown-display").textContent = fmtCD(diff);
    if (diff <= 0) { clearInterval(countdownInterval); location.reload(); }
  }
  tick(); countdownInterval = setInterval(tick, 1000);
}

function showSideScreen(title) {
  hideAll();
  document.getElementById("side-title").textContent = title || "(제목 없음)";
  document.getElementById("side-screen").style.display = "flex";
}

function showMatchingScreen() {
  hideAll();
  // 이름 + 찬반 배지
  document.getElementById("my-celeb-name").textContent = myCelebName;
  var sb = document.getElementById("my-side-badge");
  sb.textContent = myChosenSide === "pro" ? "찬성" : "반대";
  sb.className = "side-badge " + myChosenSide;
  // 강경도 선택 UI 보이기, 탐색 상태 숨기기
  document.getElementById("matching-searching").style.display = "none";
  document.querySelectorAll(".intensity-btn").forEach(function(b) { b.classList.remove("selected", "disabled"); b.disabled = false; });
  document.getElementById("matching-screen").style.display = "flex";
}

function showApp() { hideAll(); document.getElementById("app").style.display = "block"; }
function showViewer() { hideAll(); document.getElementById("viewer-screen").style.display = "block"; }

// ── 타이머 ─────────────────────────────────────────────────
function startTimer() {
  debateEndTime = IS_DEMO ? new Date(Date.now() + 60 * 60 * 1000) : getTodayDebateEnd();
  if (timerInterval) clearInterval(timerInterval);
  function tick() {
    var diff = debateEndTime - Date.now();
    if (diff <= 0) { clearInterval(timerInterval); document.getElementById("timer-display").textContent = "종료"; endDebate(); return; }
    document.getElementById("timer-display").textContent = fmt(diff);
  }
  tick(); timerInterval = setInterval(tick, 1000);
}

function endDebate() {
  var btn = document.getElementById("open-modal-btn");
  if (btn) btn.style.display = "none";
  var banner = document.getElementById("ended-banner");
  if (banner) banner.style.display = "block";
  document.getElementById("modal-overlay").style.display = "none";
}

// ── STEP 1: 찬반 선택 ────────────────────────────────────
function setupSideSelection(info) {
  document.querySelectorAll(".side-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      myChosenSide = btn.dataset.side;
      // 매칭 화면으로 이동 (강경도 미선택 상태)
      showMatchingScreen();
      // 강경도 선택 이벤트 등록
      setupIntensitySelection(info);
    });
  });
}

// ── STEP 2: 강경도 선택 → 매칭 시작 ─────────────────────
function setupIntensitySelection(info) {
  document.querySelectorAll(".intensity-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      if (btn.disabled) return;
      myIntensity = parseInt(btn.dataset.intensity);

      // 선택 표시 + 버튼 잠금
      document.querySelectorAll(".intensity-btn").forEach(function(b) {
        b.classList.remove("selected");
        b.classList.add("disabled");
        b.disabled = true;
      });
      btn.classList.add("selected");
      btn.classList.remove("disabled");

      // 탐색 상태 표시
      document.getElementById("searching-stance").textContent = stanceText(myChosenSide, myIntensity);
      document.getElementById("matching-searching").style.display = "block";

      // payload 등록 → onPayloadsChange에서 매칭 탐색 시작
      if (!IS_DEMO) {
        info.savePayload({
          celebName:  myCelebName,
          side:       myChosenSide,
          intensity:  myIntensity,
          matchKey:   null,
          opinions:   []
        });
      } else {
        // 데모: 가짜 상대 즉시 매칭
        runDemoMatch();
      }
    });
  });
}

// ── 매칭 로직 ─────────────────────────────────────────────
// 찬반 반대 + 강경도 차이 최대인 상대 선택
function tryMatch(payloads, myNick) {
  var myP = payloads[myNick];
  if (!myP || !myP.side || !myP.intensity) return null;
  if (myP.matchKey) return myP.matchKey;

  var oppSide = myP.side === "pro" ? "con" : "pro";
  var best = null, bestDiff = -1;

  Object.keys(payloads).forEach(function(nick) {
    if (nick === myNick) return;
    var p = payloads[nick];
    // 상대: 찬반 반대, 강경도 선택 완료, 아직 매칭 안 됨
    if (!p || p.side !== oppSide || !p.intensity || p.matchKey) return;
    var diff = Math.abs(myP.intensity - p.intensity);
    if (diff > bestDiff) { bestDiff = diff; best = nick; }
  });

  if (!best) return null;
  return matchKey(
    myP.side === "pro" ? myNick : best,
    myP.side === "con" ? myNick : best
  );
}

// ── 토론 화면 초기화 ──────────────────────────────────────
function initAppUI(info, payloads) {
  var myNick = typeof info === "string" ? info : info.nickname;
  var title  = typeof info === "string" ? myInfo.title : info.title;
  var myP    = payloads[myNick];
  var parts  = myMatchKey.split("::");
  var oppNick = myP.side === "pro" ? parts[1] : parts[0];
  var oppP    = payloads[oppNick];

  document.getElementById("debate-title").textContent = title || "(제목 없음)";
  document.getElementById("nickname").textContent = myCelebName;

  var sb = document.getElementById("side-badge");
  sb.textContent = myP.side === "pro" ? "찬성" : "반대";
  sb.className = "side-badge " + myP.side;

  var ib = document.getElementById("intensity-badge");
  ib.textContent = iLabel(myP.intensity);
  ib.className = "intensity-badge intensity-" + myP.intensity;

  document.getElementById("modal-side-badge").textContent = myP.side === "pro" ? "찬성" : "반대";
  document.getElementById("modal-side-badge").className = "side-badge " + myP.side;
  document.getElementById("modal-intensity-badge").textContent = iLabel(myP.intensity);
  document.getElementById("modal-intensity-badge").className = "intensity-badge intensity-" + myP.intensity;
  document.getElementById("modal-nickname").textContent = myCelebName;
  document.getElementById("my-match-label").textContent = myCelebName;

  if (oppP) {
    document.getElementById("opponent-name").textContent = oppP.celebName || oppNick;
    var ob = document.getElementById("opponent-stance-badge");
    ob.textContent = stanceText(oppP.side, oppP.intensity);
    ob.className = "opponent-stance-badge " + oppP.side;
  }
}

// ── 의견 렌더 ─────────────────────────────────────────────
function renderOpinions(payloads) {
  if (!myMatchKey) return;
  var parts = myMatchKey.split("::");
  var proNick = parts[0], conNick = parts[1];
  var proList = [], conList = [];
  [proNick, conNick].forEach(function(nick) {
    var p = payloads[nick];
    if (!p || !p.opinions) return;
    p.opinions.forEach(function(op) {
      (p.side === "pro" ? proList : conList).push({ celebName: p.celebName || nick, intensity: p.intensity, text: op.text, timestamp: op.timestamp });
    });
  });
  proList.sort(function(a,b){ return a.timestamp - b.timestamp; });
  conList.sort(function(a,b){ return a.timestamp - b.timestamp; });
  renderList("pro-list", proList);
  renderList("con-list", conList);
}

function renderList(id, opinions) {
  var el = document.getElementById(id);
  if (!opinions.length) { el.innerHTML = '<p class="empty-text">아직 없습니다</p>'; return; }
  el.innerHTML = opinions.map(function(o) {
    return '<div class="opinion-card">' +
      '<div class="opinion-meta">' + esc(o.celebName) +
        '<span class="intensity-badge intensity-' + o.intensity + '">' + iLabel(o.intensity) + '</span>' +
      '</div>' +
      '<p class="opinion-text">' + esc(o.text) + '</p>' +
    '</div>';
  }).join("");
}

// ── 관찰자 렌더 ───────────────────────────────────────────
function renderViewer(payloads) {
  var matches = {};
  Object.keys(payloads).forEach(function(nick) {
    var p = payloads[nick];
    if (!p || !p.matchKey) return;
    if (!matches[p.matchKey]) matches[p.matchKey] = [];
    matches[p.matchKey].push({ nick: nick, payload: p });
  });
  var container = document.getElementById("viewer-matches");
  var keys = Object.keys(matches);
  if (!keys.length) { container.innerHTML = '<p class="empty-text" style="text-align:center;padding:3rem 0">아직 진행된 매칭이 없습니다.</p>'; return; }
  container.innerHTML = keys.map(function(key, idx) {
    var pair = matches[key];
    var proE = pair.find(function(e){ return e.payload.side === "pro"; });
    var conE = pair.find(function(e){ return e.payload.side === "con"; });
    var proName = proE ? (proE.payload.celebName || proE.nick) : "?";
    var conName = conE ? (conE.payload.celebName || conE.nick) : "?";
    var proI = proE ? proE.payload.intensity : 3;
    var conI = conE ? conE.payload.intensity : 3;
    var proOps = ((proE && proE.payload.opinions) || []).slice().sort(function(a,b){ return a.timestamp-b.timestamp; });
    var conOps = ((conE && conE.payload.opinions) || []).slice().sort(function(a,b){ return a.timestamp-b.timestamp; });
    function cards(ops) {
      if (!ops.length) return '<p class="empty-text">아직 없습니다</p>';
      return ops.map(function(op){ return '<div class="opinion-card"><p class="opinion-text">' + esc(op.text) + '</p></div>'; }).join("");
    }
    return '<div class="viewer-match">' +
      '<div class="viewer-match-header">' +
        '<span class="viewer-match-num">매칭 #' + (idx+1) + '</span>' +
        '<div class="viewer-pair">' +
          '<span class="pro-name">' + esc(proName) + '</span>' +
          '<span class="side-badge pro">찬성</span>' +
          '<span class="intensity-badge intensity-' + proI + '">' + iLabel(proI) + '</span>' +
          '<span class="vs-dot">vs</span>' +
          '<span class="side-badge con">반대</span>' +
          '<span class="intensity-badge intensity-' + conI + '">' + iLabel(conI) + '</span>' +
          '<span class="con-name">' + esc(conName) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="viewer-columns">' +
        '<div class="viewer-col pro-col"><div class="col-header"><span class="col-dot pro-dot"></span>찬성 의견</div>' + cards(proOps) + '</div>' +
        '<div class="viewer-divider"></div>' +
        '<div class="viewer-col con-col"><div class="col-header"><span class="col-dot con-dot"></span>반대 의견</div>' + cards(conOps) + '</div>' +
      '</div>' +
    '</div>';
  }).join("");
}

// ── 데모: 강경도 선택 후 가짜 매칭 ──────────────────────
function runDemoMatch() {
  var oppSide      = myChosenSide === "pro" ? "con" : "pro";
  var oppIntensity = 6 - myIntensity;  // 최대 차이
  var oppCeleb     = CELEB_POOL[Math.floor(Math.random() * CELEB_POOL.length)];
  var oppNick      = "demo_opp";

  myMatchKey = matchKey(
    myChosenSide === "pro" ? myInfo.nickname : oppNick,
    myChosenSide === "con" ? myInfo.nickname : oppNick
  );

  var demoPayloads = {};
  demoPayloads[myInfo.nickname] = { celebName: myCelebName, side: myChosenSide, intensity: myIntensity, matchKey: myMatchKey, opinions: [] };
  demoPayloads[oppNick] = {
    celebName: oppCeleb, side: oppSide, intensity: oppIntensity, matchKey: myMatchKey,
    opinions: [
      { text: stanceText(oppSide, oppIntensity) + " 입장입니다. 이 주제는 기술의 문제가 아니라 인간의 본질에 관한 질문입니다.", timestamp: Date.now() - 8000 },
      { text: "역사적으로 기술은 항상 새로운 가능성을 열어왔습니다. 중요한 것은 우리가 어떻게 그 변화를 이끌어가느냐입니다.", timestamp: Date.now() - 3000 }
    ]
  };

  setTimeout(function() {
    showApp();
    startTimer();
    initAppUI(myInfo.nickname, demoPayloads);
    renderOpinions(demoPayloads);
    setupModalHandlers(myInfo, demoPayloads);
  }, 1500);
}

// ── 모달 & 제출 ────────────────────────────────────────────
function setupModalHandlers(info, demoPayloads) {
  if (modalSetup) return;
  modalSetup = true;

  var openBtn   = document.getElementById("open-modal-btn");
  var overlay   = document.getElementById("modal-overlay");
  var closeBtn  = document.getElementById("close-modal-btn");
  var input     = document.getElementById("opinion-input");
  var submitBtn = document.getElementById("submit-btn");

  openBtn.style.display = "block";
  openBtn.addEventListener("click", function() {
    if (debateEndTime && Date.now() >= debateEndTime.getTime()) { endDebate(); return; }
    overlay.style.display = "flex"; input.focus();
  });
  closeBtn.addEventListener("click", function() { overlay.style.display = "none"; });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.style.display = "none"; });
  document.addEventListener("keydown", function(e) { if (e.key === "Escape") overlay.style.display = "none"; });

  submitBtn.addEventListener("click", function() {
    if (debateEndTime && Date.now() >= debateEndTime.getTime()) { endDebate(); overlay.style.display = "none"; return; }
    var text = input.value.trim();
    if (!text) return;
    submitBtn.disabled = true;

    if (IS_DEMO) {
      demoPayloads[info.nickname].opinions.push({ text: text, timestamp: Date.now() });
      renderOpinions(demoPayloads);
      input.value = ""; submitBtn.disabled = false; overlay.style.display = "none";
      return;
    }

    info.loadPayloads().then(function(payloads) {
      var mine = ((payloads[info.nickname] && payloads[info.nickname].opinions) || []).slice();
      mine.push({ text: text, timestamp: Date.now() });
      return info.savePayload({ celebName: myCelebName, side: myChosenSide, intensity: myIntensity, matchKey: myMatchKey, opinions: mine });
    }).then(function() {
      input.value = ""; submitBtn.disabled = false; overlay.style.display = "none";
    }).catch(function() { submitBtn.disabled = false; });
  });
}

// ── 메인 ──────────────────────────────────────────────────
window.DebateCore.onReady(function(info) {
  myInfo = info;
  if (!info.nickname) { showMessage("토론 플랫폼을 통해 다시 접속하세요."); return; }
  myCelebName = getCelebName(info.nickname);

  // 관찰자 모드
  if (IS_VIEWER) {
    var vt = document.getElementById("viewer-title");
    if (vt) vt.textContent = info.title || "(제목 없음)";
    showViewer();
    info.onPayloadsChange(function(payloads) { renderViewer(payloads); });
    return;
  }

  // 데모 모드
  if (IS_DEMO) {
    showSideScreen(info.title || "AI가 인간의 창의성을 대체할 수 있는가");
    setupSideSelection(info);
    return;
  }

  // 실제 모드
  if (info.status === "pending") { showWaiting(); return; }
  if (info.status !== "active")  { showMessage("토론이 종료되었습니다."); return; }
  if (!isDebateOpen())           { showWaiting(); return; }

  var isReadonly = info.role !== "participant";

  // STEP 1: 찬반 선택
  showSideScreen(info.title);
  if (!isReadonly) setupSideSelection(info);

  // 실시간 감시: 강경도 선택(=payload 등록) 후 매칭 탐색
  info.onPayloadsChange(function(payloads) {
    var myP = payloads[info.nickname];

    // 아직 강경도 미선택 (payload 없거나 intensity 없음)
    if (!myP || !myP.intensity) return;

    // 매칭 이미 완료된 경우
    if (myMatchKey) {
      renderOpinions(payloads);
      return;
    }

    // 매칭 탐색
    var found = tryMatch(payloads, info.nickname);
    if (found) {
      myMatchKey = found;
      if (!isReadonly) {
        info.savePayload({
          celebName: myCelebName, side: myChosenSide, intensity: myIntensity,
          matchKey: myMatchKey, opinions: myP.opinions || []
        });
      }
      showApp();
      startTimer();
      initAppUI(info, payloads);
      renderOpinions(payloads);
      if (!isReadonly) setupModalHandlers(info, null);
    }
    // 매칭 상대 없으면 계속 대기 (화면 유지)
  });
});
