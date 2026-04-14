/**
 * 토론 앱 — 가설 기반 설계
 *
 * 가설 1: '논의' 프레이밍 → "찬반 대립" 대신 "대화 상대 발견" 언어 사용
 * 가설 2: 강경도 스펙트럼 → 모호파(1~3) ↔ 강경파(4~5) 매칭 + 채팅 중 실시간 강경도 조정
 * 가설 3: 1:1 관계 형성 → 개인 이름, 아바타, 디스코드식 알림
 * 가설 4: 감정적 환경 → 연예인 닉네임, 부드러운 UI, "논의" 언어
 * 가설 5: 설득 구조 → 종료 후 설득 여부/평가 수집, 강경도 변화 측정
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

var AVATAR_COLORS = ["#FF6B6B","#FF8E53","#FFC947","#6BCB77","#4D96FF","#C77DFF","#FF6B9D","#00B4D8"];

// 강경도 그룹 판별
function isVague(n)  { return n >= 1 && n <= 3; }  // 모호파
function isStrong(n) { return n >= 4 && n <= 5; }  // 강경파

// ── 상태 ─────────────────────────────────────────────────
var myInfo        = null;
var myCelebName   = null;
var myAvColor     = null;
var myChosenSide  = null;
var myIntensity   = null;   // 초기 선택
var myCurrentIntensity = null;  // 채팅 중 실시간 조정값
var myMatchKey    = null;
var oppData       = null;
var debateEndTime = null;
var timerInterval     = null;
var countdownInterval = null;
var chatSetup     = false;
var evalSetup     = false;
var lastRenderedKey = "";
var cachedPayloads  = {};
var evalData = { persuasion: null, ratings: {}, finalIntensity: null };

var IS_VIEWER = new URLSearchParams(location.search).get("view") === "true";

// ── 유틸 ─────────────────────────────────────────────────
function getCelebName(nickname) {
  var hash = 0;
  for (var i = 0; i < nickname.length; i++) hash = (hash * 31 + nickname.charCodeAt(i)) & 0xffffffff;
  return CELEB_POOL[Math.abs(hash) % CELEB_POOL.length];
}
function getAvatarColor(name) {
  var hash = 0;
  for (var i = 0; i < (name||"").length; i++) hash = (hash * 17 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function avatarChar(name) { return (name||"?").charAt(0); }
function makeAvatar(el, name, color) { el.textContent = avatarChar(name); el.style.background = color || getAvatarColor(name); }
function iLabel(n) { return INTENSITY_LABELS[n] || ""; }
function stanceText(side, intensity) { return (side === "pro" ? "찬성" : "반대") + " · " + iLabel(intensity); }
function groupLabel(n) { return isVague(n) ? "모호파" : "강경파"; }

function pad(n) { return n < 10 ? "0" + n : "" + n; }
function esc(t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
function mkKey(pro, con) { return pro + "::" + con; }
function timeStr(ts) { var d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function fmtCD(ms) { if (ms<=0) return "00:00:00"; var s=Math.floor(ms/1000); return pad(Math.floor(s/3600))+":"+pad(Math.floor((s%3600)/60))+":"+pad(s%60); }
function fmtTimer(ms) { if (ms<=0) return "종료"; var s=Math.floor(ms/1000); return pad(Math.floor(s/60))+":"+pad(s%60); }

function getKSTHour() { return new Date(Date.now() + 9*3600000).getUTCHours(); }
function isDebateOpen() { var h=getKSTHour(); return DEBATE_END_HOUR>=24 ? h>=DEBATE_START_HOUR : (h>=DEBATE_START_HOUR && h<DEBATE_END_HOUR); }
function getNextStart() {
  var kst = new Date(Date.now()+9*3600000);
  if (kst.getUTCHours()<DEBATE_START_HOUR) kst.setUTCHours(DEBATE_START_HOUR,0,0,0);
  else { kst.setUTCDate(kst.getUTCDate()+1); kst.setUTCHours(DEBATE_START_HOUR,0,0,0); }
  return new Date(kst.getTime()-9*3600000);
}
function getEndTime() {
  var kst = new Date(Date.now()+9*3600000);
  if (DEBATE_END_HOUR>=24) { kst.setUTCDate(kst.getUTCDate()+1); kst.setUTCHours(0,0,0,0); }
  else kst.setUTCHours(DEBATE_END_HOUR,0,0,0);
  return new Date(kst.getTime()-9*3600000);
}

// ── 화면 전환 ─────────────────────────────────────────────
function hideAll() {
  ["message","waiting-screen","side-screen","matching-screen","match-found-screen",
   "chat-screen","eval-screen","done-screen","viewer-screen"].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = "none";
  });
}

function showMessage(text) { hideAll(); document.getElementById("message-text").textContent = text; document.getElementById("message").style.display = "flex"; }

function showWaiting() {
  hideAll(); document.getElementById("waiting-screen").style.display = "flex";
  if (countdownInterval) clearInterval(countdownInterval);
  function tick() { var d=getNextStart()-Date.now(); document.getElementById("countdown-display").textContent=fmtCD(d); if(d<=0){clearInterval(countdownInterval);location.reload();} }
  tick(); countdownInterval = setInterval(tick, 1000);
}

function showSideScreen(title) {
  hideAll();
  // 가설 1: "찬반 선택" 대신 "입장" 언어 사용 (카드 텍스트에서도)
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
  document.getElementById("match-notification").style.display = "none";
  document.querySelectorAll(".i-btn").forEach(function(b) { b.classList.remove("selected","locked"); b.disabled=false; });
  document.getElementById("spectrum-fill").style.width = "0%";
  document.getElementById("matching-screen").style.display = "flex";
}

// 가설 3, 4: 디스코드식 알림 배너
function showMatchNotification(oppName, oppColor) {
  var notif = document.getElementById("match-notification");
  makeAvatar(document.getElementById("notif-avatar"), oppName, oppColor);
  document.getElementById("notif-name").textContent = oppName;
  notif.style.display = "flex";
  // 진동 (모바일)
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

function showMatchFound(oppName, oppColor, matchType) {
  hideAll();
  makeAvatar(document.getElementById("av-me"), myCelebName, myAvColor);
  makeAvatar(document.getElementById("av-opp"), oppName, oppColor);
  // 가설 1: "매칭"이 아닌 "대화 상대 발견" 언어
  document.getElementById("match-found-sub").textContent = oppName + "님과 논의를 시작합니다";
  document.getElementById("av-me-label").textContent  = groupLabel(myIntensity);
  document.getElementById("av-opp-label").textContent = groupLabel(oppData ? oppData.intensity : 3);

  // 매치 타입 배지 (가설 2)
  var badge = document.getElementById("match-type-badge");
  if (matchType === "cross") {
    badge.textContent = "🎯 모호파 ↔ 강경파 매칭";
    badge.className = "match-type-badge cross";
  } else {
    badge.textContent = "⚡ 강경파 간 토론";
    badge.className = "match-type-badge strong";
  }
  document.getElementById("match-found-screen").style.display = "flex";
  document.getElementById("start-chat-btn").onclick = function() { showChatScreen(); };
}

function showChatScreen() {
  hideAll();
  document.getElementById("chat-screen").style.display = "flex";
  if (oppData) {
    makeAvatar(document.getElementById("chat-opp-avatar"), oppData.celebName, oppData.avatarColor);
    document.getElementById("chat-opp-name").textContent   = oppData.celebName;
    document.getElementById("chat-opp-stance").textContent = stanceText(oppData.side, oppData.intensity);
  }
  document.getElementById("chat-topic-text").textContent = (myInfo&&myInfo.title)||"";
  setupChatIntensityBar();
  startTimer();
  renderMessages();
  setupChatInput();
  scrollToBottom();
}

// 가설 2, 5: 채팅 중 강경도 실시간 조정 바
function setupChatIntensityBar() {
  myCurrentIntensity = myIntensity;
  var btns = document.querySelectorAll(".cib-btn");
  var hint = document.getElementById("cib-hint");

  function updateBar(v) {
    btns.forEach(function(b) {
      b.classList.toggle("active", parseInt(b.dataset.v) === v);
    });
    var changed = v !== myIntensity;
    hint.textContent = changed ? (v > myIntensity ? "↑ 더 강경해졌어요" : "↓ 더 온건해졌어요") : "";
    hint.className = "cib-hint" + (v > myIntensity ? " up" : v < myIntensity ? " down" : "");
  }

  updateBar(myCurrentIntensity);

  btns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      myCurrentIntensity = parseInt(btn.dataset.v);
      updateBar(myCurrentIntensity);
      // Firebase에 실시간 저장
      if (myInfo) {
        myInfo.loadPayloads().then(function(payloads) {
          var mine = ((payloads[myInfo.nickname]&&payloads[myInfo.nickname].messages)||[]).slice();
          return myInfo.savePayload({
            celebName: myCelebName, side: myChosenSide,
            intensity: myIntensity, currentIntensity: myCurrentIntensity,
            matchKey: myMatchKey, messages: mine, ended: false
          });
        });
      }
    });
  });
}

function showEvalScreen() {
  hideAll();
  document.getElementById("eval-screen").style.display = "flex";
  var amVague = isVague(myIntensity);

  // 가설 5: 모호파 → 설득 여부, 강경파 → 상대 평가
  document.getElementById("eval-subtitle").textContent =
    amVague ? "대화가 어땠나요? 솔직하게 알려주세요 😊" : "상대방과의 대화를 평가해주세요";
  document.getElementById("eval-persuasion").style.display = amVague ? "block" : "none";
  document.getElementById("eval-rating").style.display     = amVague ? "none"  : "block";

  if (!evalSetup) {
    evalSetup = true;

    // 모호파: 설득 버튼
    document.querySelectorAll(".eval-p-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        document.querySelectorAll(".eval-p-btn").forEach(function(b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
        evalData.persuasion = btn.dataset.val;
        checkEvalReady();
      });
    });

    // 강경파: 별점
    document.querySelectorAll(".eval-stars").forEach(function(row) {
      var key   = row.dataset.key;
      var stars = row.querySelectorAll(".star");
      stars.forEach(function(star) {
        star.addEventListener("click", function() {
          var v = parseInt(star.dataset.v);
          evalData.ratings[key] = v;
          stars.forEach(function(s) { s.classList.toggle("filled", parseInt(s.dataset.v) <= v); });
          checkEvalReady();
        });
      });
    });

    // 최종 강경도
    document.querySelectorAll(".eval-i-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        document.querySelectorAll(".eval-i-btn").forEach(function(b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
        evalData.finalIntensity = parseInt(btn.dataset.v);
        checkEvalReady();
      });
    });

    // 제출
    document.getElementById("eval-submit-btn").addEventListener("click", function() {
      submitEval();
    });
  }
}

function checkEvalReady() {
  var amVague = isVague(myIntensity);
  var ok = evalData.finalIntensity !== null;
  if (amVague) ok = ok && evalData.persuasion !== null;
  else ok = ok && Object.keys(evalData.ratings).length >= 3;
  document.getElementById("eval-submit-btn").disabled = !ok;
}

function submitEval() {
  myInfo.loadPayloads().then(function(payloads) {
    var mine = ((payloads[myInfo.nickname]&&payloads[myInfo.nickname].messages)||[]).slice();
    return myInfo.savePayload({
      celebName: myCelebName, side: myChosenSide,
      intensity: myIntensity, currentIntensity: myCurrentIntensity,
      finalIntensity: evalData.finalIntensity,
      persuasion: evalData.persuasion,
      ratings: evalData.ratings,
      matchKey: myMatchKey, messages: mine, ended: true
    });
  }).then(function() {
    showDoneScreen();
  }).catch(function(e) { console.error(e); });
}

function showDoneScreen() {
  hideAll();
  document.getElementById("done-screen").style.display = "flex";
  var change = evalData.finalIntensity - myIntensity;
  var changeText = "";
  if (change > 0) changeText = "강경도가 " + change + "단계 올라갔어요 📈";
  else if (change < 0) changeText = "강경도가 " + Math.abs(change) + "단계 내려갔어요 📉";
  else changeText = "강경도 변화 없음 ➡️";

  document.getElementById("done-sub").textContent = isVague(myIntensity)
    ? (evalData.persuasion === "yes" ? "설득된 것 같아요! 오늘 대화가 생각을 바꿨네요 😊"
     : evalData.persuasion === "maybe" ? "아직 고민 중이군요. 계속 생각해봐요 🤔"
     : "이번엔 설득이 안 됐군요. 다음엔 어떨까요?")
    : "평가해주셔서 감사해요!";
  document.getElementById("done-change").textContent = changeText;
}

function showViewer() { hideAll(); document.getElementById("viewer-screen").style.display = "block"; }

// ── 타이머 ─────────────────────────────────────────────────
function startTimer() {
  debateEndTime = getEndTime();
  if (timerInterval) clearInterval(timerInterval);
  if (Date.now() >= debateEndTime.getTime()) { endDebate("시간"); return; }
  function tick() {
    var diff = debateEndTime - Date.now();
    var el = document.getElementById("chat-timer");
    if (el) el.textContent = fmtTimer(diff);
    if (diff <= 0) { clearInterval(timerInterval); endDebate("시간"); }
  }
  tick(); timerInterval = setInterval(tick, 1000);
}

function endDebate(who) {
  var bar = document.getElementById("chat-ended-bar");
  if (bar) {
    bar.textContent = who === "나" ? "내가 대화를 종료했습니다" : who === "상대" ? "상대방이 대화를 종료했습니다" : "토론 시간이 종료되었습니다";
    bar.style.display = "flex";
  }
  var inp = document.getElementById("chat-input-area");
  if (inp) inp.style.display = "none";
  var endBtn = document.getElementById("end-chat-btn");
  if (endBtn) endBtn.style.display = "none";
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  var el = document.getElementById("chat-timer");
  if (el) el.textContent = "종료";

  // 3초 후 평가 화면으로 이동 (가설 5)
  setTimeout(function() { showEvalScreen(); }, 3000);
}

// ── 카드 스와이프 ──────────────────────────────────────────
function setupCardSwipe(onSelect) {
  var card  = document.getElementById("debate-card");
  var hintL = document.getElementById("hint-left");
  var hintR = document.getElementById("hint-right");
  var startX=0, curX=0, dragging=false;

  function onStart(x) { startX=x; dragging=true; card.style.transition=""; }
  function onMove(x) {
    if (!dragging) return;
    curX = x - startX;
    card.style.transform = "translateX("+curX+"px) rotate("+(curX*0.08)+"deg)";
    hintR.style.opacity = curX>30 ? Math.min((curX-30)/60,1) : 0;
    hintL.style.opacity = curX<-30 ? Math.min((-curX-30)/60,1) : 0;
  }
  function onEnd() {
    if (!dragging) return; dragging=false;
    hintL.style.opacity=0; hintR.style.opacity=0;
    if (curX>80)       flyOut("right",function(){onSelect("pro");});
    else if (curX<-80) flyOut("left", function(){onSelect("con");});
    else { card.style.transition="transform 0.3s"; card.style.transform=""; setTimeout(function(){card.style.transition="";},300); }
    curX=0;
  }
  card.addEventListener("mousedown",  function(e){onStart(e.clientX);});
  window.addEventListener("mousemove",function(e){onMove(e.clientX);});
  window.addEventListener("mouseup",  onEnd);
  card.addEventListener("touchstart", function(e){onStart(e.touches[0].clientX);},{passive:true});
  window.addEventListener("touchmove",function(e){if(dragging)onMove(e.touches[0].clientX);},{passive:true});
  window.addEventListener("touchend", onEnd);

  function flyOut(dir,cb) {
    var tx = dir==="right" ? window.innerWidth+200 : -(window.innerWidth+200);
    card.style.transition="transform 0.35s ease";
    card.style.transform="translateX("+tx+"px) rotate("+(dir==="right"?20:-20)+"deg)";
    setTimeout(cb,350);
  }
  document.getElementById("pro-btn").addEventListener("click",function(){flyOut("right",function(){onSelect("pro");});});
  document.getElementById("con-btn").addEventListener("click",function(){flyOut("left", function(){onSelect("con");});});
}

// ── 강경도 선택 ───────────────────────────────────────────
function setupIntensitySelection(onSelected) {
  var fill = document.getElementById("spectrum-fill");
  document.querySelectorAll(".i-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      if (btn.disabled) return;
      myIntensity = parseInt(btn.dataset.intensity);
      document.querySelectorAll(".i-btn").forEach(function(b){b.classList.add("locked");b.disabled=true;b.classList.remove("selected");});
      btn.classList.add("selected");
      // 스펙트럼 바 업데이트
      fill.style.width = ((myIntensity-1)/4*100) + "%";
      document.getElementById("searching-text").textContent = stanceText(myChosenSide,myIntensity)+" · 상대 탐색 중";
      document.getElementById("searching-status").style.display="flex";
      onSelected(myIntensity);
    });
  });
}

// ── 매칭 로직 (가설 2: 모호파↔강경파 우선) ────────────────
function tryMatch(payloads, myNick) {
  var myP = payloads[myNick];
  if (!myP||!myP.side||!myP.intensity||myP.matchKey) return null;
  var oppSide = myP.side==="pro" ? "con" : "pro";

  var candidates = Object.keys(payloads).filter(function(nick) {
    if (nick===myNick) return false;
    var p = payloads[nick];
    return p && p.side===oppSide && p.intensity && !p.matchKey;
  });
  if (!candidates.length) return null;

  // 우선순위 1: 크로스 매칭 (모호↔강경)
  var crossMatch = candidates.filter(function(nick) {
    var p = payloads[nick];
    return (isVague(myP.intensity) && isStrong(p.intensity)) ||
           (isStrong(myP.intensity) && isVague(p.intensity));
  });

  var best = crossMatch.length ? crossMatch[0] : null;

  // 우선순위 2: 강경도 차이 최대
  if (!best) {
    var bestDiff = -1;
    candidates.forEach(function(nick) {
      var diff = Math.abs(myP.intensity - payloads[nick].intensity);
      if (diff > bestDiff) { bestDiff=diff; best=nick; }
    });
  }

  if (!best) return null;
  return { key: mkKey(myP.side==="pro"?myNick:best, myP.side==="con"?myNick:best),
           type: crossMatch.length ? "cross" : "same" };
}

// ── 채팅 렌더 ─────────────────────────────────────────────
function getOppNick() {
  if (!myMatchKey||!myInfo) return null;
  var parts = myMatchKey.split("::");
  var myP = cachedPayloads[myInfo.nickname];
  return (myP&&myP.side==="pro") ? parts[1] : parts[0];
}

function renderMessages() {
  if (!myMatchKey||!myInfo) return;
  var myP  = cachedPayloads[myInfo.nickname];
  var oppNick = getOppNick();
  var oppP = cachedPayloads[oppNick];

  var myMsgs  = ((myP&&myP.messages)||[]).map(function(m){return{text:m.text,ts:m.timestamp,mine:true};});
  var oppMsgs = ((oppP&&oppP.messages)||[]).map(function(m){return{text:m.text,ts:m.timestamp,mine:false};});
  var all = myMsgs.concat(oppMsgs).sort(function(a,b){return a.ts-b.ts;});

  var key = all.map(function(m){return m.ts+(m.mine?"m":"o");}).join(",");
  if (key===lastRenderedKey) return;
  lastRenderedKey=key;

  var container = document.getElementById("chat-messages");
  if (!container) return;

  if (!all.length) { container.innerHTML='<div class="chat-empty">대화를 시작해보세요</div>'; return; }

  var oppName  = oppData ? oppData.celebName : (oppNick||"상대");
  var oppColor = oppData ? oppData.avatarColor : getAvatarColor(oppName);

  container.innerHTML = all.map(function(m) {
    if (m.mine) {
      return '<div class="msg-row mine"><div class="msg-content"><div class="bubble mine">'+esc(m.text)+'</div><div class="bubble-time">'+timeStr(m.ts)+'</div></div></div>';
    }
    return '<div class="msg-row theirs"><div class="msg-avatar" style="background:'+oppColor+'">'+esc(avatarChar(oppName))+'</div><div class="msg-content"><div class="bubble-name">'+esc(oppName)+'</div><div class="bubble theirs">'+esc(m.text)+'</div><div class="bubble-time">'+timeStr(m.ts)+'</div></div></div>';
  }).join("");

  scrollToBottom();
}

function scrollToBottom() { var c=document.getElementById("chat-messages"); if(c) c.scrollTop=c.scrollHeight; }

// ── 채팅 입력 ─────────────────────────────────────────────
function setupChatInput() {
  if (chatSetup) return;
  chatSetup = true;

  var input   = document.getElementById("chat-input");
  var sendBtn = document.getElementById("chat-send-btn");
  var endBtn  = document.getElementById("end-chat-btn");
  var overlay = document.getElementById("end-confirm-overlay");

  input.addEventListener("input", function() { input.style.height="auto"; input.style.height=Math.min(input.scrollHeight,120)+"px"; });

  endBtn.addEventListener("click", function() { overlay.style.display="flex"; });
  document.getElementById("end-cancel-btn").addEventListener("click", function() { overlay.style.display="none"; });
  overlay.addEventListener("click", function(e) { if(e.target===overlay) overlay.style.display="none"; });
  document.getElementById("end-confirm-btn").addEventListener("click", function() {
    overlay.style.display="none";
    myInfo.loadPayloads().then(function(payloads) {
      var mine = ((payloads[myInfo.nickname]&&payloads[myInfo.nickname].messages)||[]).slice();
      return myInfo.savePayload({ celebName:myCelebName, side:myChosenSide, intensity:myIntensity, currentIntensity:myCurrentIntensity, matchKey:myMatchKey, messages:mine, ended:true });
    }).then(function() { endDebate("나"); });
  });

  function send() {
    if (debateEndTime&&Date.now()>=debateEndTime.getTime()) { endDebate("시간"); return; }
    var text = input.value.trim();
    if (!text) return;
    sendBtn.disabled=true; input.value=""; input.style.height="auto";

    myInfo.loadPayloads().then(function(payloads) {
      var mine = ((payloads[myInfo.nickname]&&payloads[myInfo.nickname].messages)||[]).slice();
      mine.push({ text:text, timestamp:Date.now() });
      return myInfo.savePayload({ celebName:myCelebName, side:myChosenSide, intensity:myIntensity, currentIntensity:myCurrentIntensity, matchKey:myMatchKey, messages:mine, ended:false });
    }).then(function(){sendBtn.disabled=false;}).catch(function(){sendBtn.disabled=false;});
  }

  sendBtn.addEventListener("click",send);
  input.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}});
}

// ── 관찰자 ────────────────────────────────────────────────
function renderViewer(payloads) {
  var matches = {};
  Object.keys(payloads).forEach(function(nick) {
    var p=payloads[nick]; if(!p||!p.matchKey) return;
    if(!matches[p.matchKey]) matches[p.matchKey]=[];
    matches[p.matchKey].push({nick:nick,p:p});
  });
  var container = document.getElementById("viewer-matches");
  var keys = Object.keys(matches);
  if (!keys.length) { container.innerHTML='<p style="text-align:center;padding:3rem;color:#aaa;font-size:0.85rem">아직 매칭이 없습니다</p>'; return; }

  container.innerHTML = keys.map(function(key,idx) {
    var pair = matches[key];
    var proE = pair.find(function(e){return e.p.side==="pro";}), conE = pair.find(function(e){return e.p.side==="con";});
    var proName=(proE&&(proE.p.celebName||proE.nick))||"?", conName=(conE&&(conE.p.celebName||conE.nick))||"?";
    var proMsgs=((proE&&proE.p.messages)||[]).map(function(m){return{name:proName,side:"pro",text:m.text,ts:m.timestamp};});
    var conMsgs=((conE&&conE.p.messages)||[]).map(function(m){return{name:conName,side:"con",text:m.text,ts:m.timestamp};});
    var all=proMsgs.concat(conMsgs).sort(function(a,b){return a.ts-b.ts;});

    // 강경도 변화 표시
    var proChange = proE ? ((proE.p.finalIntensity||proE.p.currentIntensity||proE.p.intensity)-proE.p.intensity) : 0;
    var conChange = conE ? ((conE.p.finalIntensity||conE.p.currentIntensity||conE.p.intensity)-conE.p.intensity) : 0;

    var bubbles = all.length ? all.map(function(m) {
      return '<div class="v-bubble-row '+m.side+'"><div class="v-name">'+esc(m.name)+' <span class="v-side-tag '+m.side+'">'+(m.side==="pro"?"찬성":"반대")+'</span></div><div class="v-bubble '+m.side+'">'+esc(m.text)+'</div><div class="v-time">'+timeStr(m.ts)+'</div></div>';
    }).join("") : '<p style="color:#bbb;font-size:0.8rem;padding:1rem 0">아직 대화가 없습니다</p>';

    function changeTag(c) { if(c>0) return '<span class="change-tag up">+'+c+'↑</span>'; if(c<0) return '<span class="change-tag down">'+c+'↓</span>'; return ''; }

    return '<div class="v-match-card">'+
      '<div class="v-match-header">'+
        '<span class="v-match-num">#'+(idx+1)+'</span>'+
        '<span class="v-pro">'+esc(proName)+' <span class="v-side-tag pro">찬성 '+iLabel(proE?proE.p.intensity:"")+' '+changeTag(proChange)+'</span></span>'+
        '<span class="v-vs">vs</span>'+
        '<span class="v-con">'+esc(conName)+' <span class="v-side-tag con">반대 '+iLabel(conE?conE.p.intensity:"")+' '+changeTag(conChange)+'</span></span>'+
      '</div>'+
      '<div class="v-chat">'+bubbles+'</div>'+
    '</div>';
  }).join("");
}

// ── 메인 ──────────────────────────────────────────────────
window.DebateCore.onReady(function(info) {
  myInfo = info;
  if (!info.nickname) { showMessage("토론 플랫폼을 통해 다시 접속하세요."); return; }
  myCelebName = getCelebName(info.nickname);
  myAvColor   = getAvatarColor(myCelebName);

  if (IS_VIEWER) {
    var vt=document.getElementById("viewer-title"); if(vt) vt.textContent=info.title||"";
    showViewer();
    info.onPayloadsChange(function(payloads){renderViewer(payloads);});
    return;
  }

  if (info.status==="pending") { showWaiting(); return; }
  if (info.status!=="active")  { showMessage("토론이 종료되었습니다."); return; }
  if (!isDebateOpen())         { showWaiting(); return; }

  var isReadonly = info.role !== "participant";

  // STEP 1: 찬반 카드
  showSideScreen(info.title);
  setupCardSwipe(function(side) {
    myChosenSide = side;
    showMatchingScreen();
    if (!isReadonly) {
      setupIntensitySelection(function(intensity) {
        myIntensity = intensity;
        myCurrentIntensity = intensity;
        info.savePayload({ celebName:myCelebName, side:myChosenSide, intensity:myIntensity, currentIntensity:myIntensity, matchKey:null, messages:[], ended:false });
      });
    }
  });

  // 실시간 감시
  info.onPayloadsChange(function(payloads) {
    cachedPayloads = payloads;
    var myP = payloads[info.nickname];
    if (!myP||!myP.intensity) return;

    // 새로고침 후 복원
    if (myP.matchKey && !myMatchKey) {
      myMatchKey = myP.matchKey;
      myChosenSide = myP.side; myIntensity = myP.intensity; myCurrentIntensity = myP.currentIntensity||myP.intensity;
      var parts=myMatchKey.split("::"), oppNick=myP.side==="pro"?parts[1]:parts[0], oppP=payloads[oppNick];
      if (oppP) oppData={ celebName:oppP.celebName||oppNick, side:oppP.side, intensity:oppP.intensity, avatarColor:getAvatarColor(oppP.celebName||oppNick) };
      if (document.getElementById("chat-screen").style.display!=="flex") showChatScreen();
      else renderMessages();
      return;
    }

    // 이미 매칭 → 메시지 갱신 + 상대 종료 감지
    if (myMatchKey) {
      renderMessages();
      var parts2=myMatchKey.split("::"), myP2=payloads[info.nickname];
      var oppNick2=(myP2&&myP2.side==="pro")?parts2[1]:parts2[0];
      var oppP2=payloads[oppNick2];
      var inputArea=document.getElementById("chat-input-area");
      if (oppP2&&oppP2.ended&&inputArea&&inputArea.style.display!=="none") endDebate("상대");
      return;
    }

    // 매칭 탐색
    if (isReadonly) return;
    var result = tryMatch(payloads, info.nickname);
    if (!result) return;

    myMatchKey = result.key;
    var parts3=result.key.split("::"), myP3=payloads[info.nickname];
    var oppNick3=myP3.side==="pro"?parts3[1]:parts3[0];
    var oppP3=payloads[oppNick3];
    if (oppP3) oppData={ celebName:oppP3.celebName||oppNick3, side:oppP3.side, intensity:oppP3.intensity, avatarColor:getAvatarColor(oppP3.celebName||oppNick3) };

    // 가설 3, 4: 디스코드식 알림 먼저 보여주기
    showMatchNotification(oppData?oppData.celebName:oppNick3, oppData?oppData.avatarColor:"");

    info.savePayload({ celebName:myCelebName, side:myChosenSide, intensity:myIntensity, currentIntensity:myCurrentIntensity, matchKey:myMatchKey, messages:myP3.messages||[], ended:false })
      .then(function() {
        // 알림 버튼에 입장 연결
        document.getElementById("notif-enter-btn").onclick = function() {
          showMatchFound(oppData?oppData.celebName:oppNick3, oppData?oppData.avatarColor:"", result.type);
        };
      });
  });
});
