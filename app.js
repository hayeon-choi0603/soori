/**
 * 토론 앱 v4 — 공개 피드 방식
 *
 * 찬반/강경도 없음. 닉네임만 사용.
 *
 * payload 구조 (참여자 1명당):
 * {
 *   celebName: string,
 *   avatarColor: string,
 *   claims: [{ id, text, timestamp }],          ← 내 주장 목록
 *   comments: { claimOwnerNick: { claimId: [{ from, fromCeleb, text, timestamp }] } },
 *   chatRequest: { from, fromCeleb, fromColor, claimText, matchKey } | null,
 *   chatMatchKey: string | null,                ← 현재 진행 중인 1:1 채팅 키
 *   messages: [{ text, timestamp }],            ← 1:1 채팅 메시지
 *   ended: bool
 * }
 */

// ── 설정 ─────────────────────────────────────────────────
var DEBATE_START_HOUR = 14;
var DEBATE_END_HOUR   = 24;
var MAX_CLAIM_LEN     = 200;

var CELEB_POOL = ["아이유","BTS RM","박서준","손예진","공유","김태리","이준호","수지","현빈","박보검","전지현","송강","한소희","차은우","이영애","김수현","고윤정","변우석","정호연","류준열","김고은","최우식","박은빈","위하준","신민아","주지훈","이세영","옹성우","박지현","남주혁"];
var AVATAR_COLORS = ["#FF6B6B","#FF8E53","#FFC947","#6BCB77","#4D96FF","#C77DFF","#FF6B9D","#00B4D8"];

// ── 상태 ─────────────────────────────────────────────────
var myInfo = null, myCelebName = null, myAvColor = null;
var myMatchKey = null, oppData = null;
var debateEndTime = null, timerInterval = null, countdownInterval = null, feedTimerInterval = null;
var chatSetup = false;
var cachedPayloads = {};
var currentSheetNick = null, currentSheetClaimId = null; // 현재 열린 댓글 시트

var IS_VIEWER = new URLSearchParams(location.search).get("view") === "true";

// ── 유틸 ─────────────────────────────────────────────────
function getCelebName(n) { var h=0; for(var i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))&0xffffffff; return CELEB_POOL[Math.abs(h)%CELEB_POOL.length]; }
function getAvatarColor(n) { var h=0; for(var i=0;i<(n||"").length;i++) h=(h*17+n.charCodeAt(i))&0xffffffff; return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; }
function avatarChar(n) { return (n||"?").charAt(0); }
function makeAvatar(el, name, color) { if(!el) return; el.textContent=avatarChar(name); el.style.background=color||getAvatarColor(name); }
function pad(n) { return n<10?"0"+n:""+n; }
function esc(t) { var d=document.createElement("div"); d.textContent=t; return d.innerHTML; }
function timeStr(ts) { var d=new Date(ts); return pad(d.getHours())+":"+pad(d.getMinutes()); }
function fmtCD(ms) { if(ms<=0) return "00:00:00"; var s=Math.floor(ms/1000); return pad(Math.floor(s/3600))+":"+pad(Math.floor((s%3600)/60))+":"+pad(s%60); }
function fmtTimer(ms) { if(ms<=0) return "종료"; var s=Math.floor(ms/1000); return pad(Math.floor(s/60))+":"+pad(s%60); }
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

function getKSTHour() { return new Date(Date.now()+9*3600000).getUTCHours(); }
function isDebateOpen() { var h=getKSTHour(); return DEBATE_END_HOUR>=24?h>=DEBATE_START_HOUR:(h>=DEBATE_START_HOUR&&h<DEBATE_END_HOUR); }
function getNextStart() { var k=new Date(Date.now()+9*3600000); if(k.getUTCHours()<DEBATE_START_HOUR) k.setUTCHours(DEBATE_START_HOUR,0,0,0); else{k.setUTCDate(k.getUTCDate()+1);k.setUTCHours(DEBATE_START_HOUR,0,0,0);} return new Date(k.getTime()-9*3600000); }
function getEndTime() { var k=new Date(Date.now()+9*3600000); if(DEBATE_END_HOUR>=24){k.setUTCDate(k.getUTCDate()+1);k.setUTCHours(0,0,0,0);}else k.setUTCHours(DEBATE_END_HOUR,0,0,0); return new Date(k.getTime()-9*3600000); }

// ── 화면 전환 ─────────────────────────────────────────────
function hideAll() { ["message","waiting-screen","feed-screen","chat-screen"].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display="none";}); }
function showMessage(t) { hideAll(); document.getElementById("message-text").textContent=t; document.getElementById("message").style.display="flex"; }
function showWaiting() {
  hideAll(); document.getElementById("waiting-screen").style.display="flex";
  if(countdownInterval) clearInterval(countdownInterval);
  function tick(){var d=getNextStart()-Date.now();document.getElementById("countdown-display").textContent=fmtCD(d);if(d<=0){clearInterval(countdownInterval);location.reload();}}
  tick(); countdownInterval=setInterval(tick,1000);
}
function showFeed() {
  hideAll(); document.getElementById("feed-screen").style.display="flex";
  makeAvatar(document.getElementById("feed-my-avatar"),myCelebName,myAvColor);
  document.getElementById("feed-my-name").textContent=myCelebName;
  document.getElementById("feed-topic").textContent=(myInfo&&myInfo.title)||"";
  makeAvatar(document.getElementById("compose-avatar"),myCelebName,myAvColor);
  startFeedTimer();
  setupCompose();
}
function showChat() {
  hideAll(); document.getElementById("chat-screen").style.display="flex";
  if(oppData) {
    makeAvatar(document.getElementById("chat-opp-avatar"),oppData.celebName,oppData.avatarColor);
    document.getElementById("chat-opp-name").textContent=oppData.celebName;
  }
  startChatTimer();
  renderMessages();
  setupChatInput();
  scrollToBottom();
}

// ── 피드 타이머 ───────────────────────────────────────────
function startFeedTimer() {
  var end=getEndTime();
  if(feedTimerInterval) clearInterval(feedTimerInterval);
  function tick(){var d=end-Date.now();var el=document.getElementById("feed-timer");if(el)el.textContent=fmtTimer(d);}
  tick(); feedTimerInterval=setInterval(tick,1000);
}

// ── 주장 작성 ─────────────────────────────────────────────
function setupCompose() {
  var input=document.getElementById("compose-input");
  var charEl=document.getElementById("compose-char");
  var submitBtn=document.getElementById("compose-submit");

  input.addEventListener("input",function(){
    var len=input.value.length;
    charEl.textContent=len+"/"+MAX_CLAIM_LEN;
    submitBtn.disabled=len===0||len>MAX_CLAIM_LEN;
  });

  submitBtn.addEventListener("click",function(){
    var text=input.value.trim();
    if(!text||text.length>MAX_CLAIM_LEN) return;
    submitBtn.disabled=true;

    myInfo.loadPayloads().then(function(p){
      var mine=p[myInfo.nickname]||{};
      var claims=(mine.claims||[]).slice();
      claims.push({id:uid(),text:text,timestamp:Date.now()});
      return myInfo.savePayload(Object.assign({},mine,{
        celebName:myCelebName,avatarColor:myAvColor,claims:claims
      }));
    }).then(function(){
      input.value="";charEl.textContent="0/"+MAX_CLAIM_LEN;submitBtn.disabled=true;
    }).catch(function(){submitBtn.disabled=false;});
  });
}

// ── 피드 렌더 ─────────────────────────────────────────────
function renderFeed(payloads) {
  // 모든 주장 수집 후 최신순 정렬
  var allClaims=[];
  Object.keys(payloads).forEach(function(nick){
    var p=payloads[nick];
    if(!p||!p.claims) return;
    p.claims.forEach(function(claim){
      allClaims.push({nick:nick,celebName:p.celebName||nick,avatarColor:p.avatarColor||getAvatarColor(nick),claim:claim,comments:getComments(payloads,nick,claim.id)});
    });
  });
  allClaims.sort(function(a,b){return b.claim.timestamp-a.claim.timestamp;});

  var list=document.getElementById("feed-list");
  if(!allClaims.length){list.innerHTML='<div class="feed-empty">아직 주장이 없습니다.<br>첫 주장을 올려보세요!</div>';return;}

  list.innerHTML=allClaims.map(function(item){
    var isMine=item.nick===myInfo.nickname;
    var commentCount=item.comments.length;
    var hasChat=!!(cachedPayloads[myInfo.nickname]&&cachedPayloads[myInfo.nickname].chatMatchKey);

    return(
      '<div class="feed-card" data-nick="'+esc(item.nick)+'" data-claimid="'+esc(item.claim.id)+'">' +
        '<div class="feed-card-header">' +
          '<div class="feed-card-avatar" style="background:'+item.avatarColor+'">'+esc(avatarChar(item.celebName))+'</div>' +
          '<div class="feed-card-meta">' +
            '<div class="feed-card-name">'+esc(item.celebName)+(isMine?' <span class="me-badge">나</span>':'')+'</div>' +
            '<div class="feed-card-time">'+timeStr(item.claim.timestamp)+'</div>' +
          '</div>' +
        '</div>' +
        '<div class="feed-card-text">'+esc(item.claim.text)+'</div>' +
        '<div class="feed-card-footer">' +
          (!isMine&&!hasChat ? '<button class="feed-action-btn chat-req-btn" data-nick="'+esc(item.nick)+'" data-claimid="'+esc(item.claim.id)+'" data-claimtext="'+esc(item.claim.text)+'">✉️ 대화 신청</button>' : '') +
        '</div>' +
      '</div>'
    );
  }).join("");

  // 이벤트 바인딩
  list.querySelectorAll(".chat-req-btn").forEach(function(btn){
    btn.addEventListener("click",function(e){e.stopPropagation();sendChatRequest(btn.dataset.nick,btn.dataset.claimtext);});
  });
}

// ── 댓글 수집 ─────────────────────────────────────────────
function getComments(payloads,ownerNick,claimId) {
  var result=[];
  // 모든 참여자 payload를 순회해서 이 claimId에 달린 댓글 수집
  Object.keys(payloads).forEach(function(nick){
    var p=payloads[nick];
    if(!p||!p.comments) return;
    var ownerComments=p.comments[ownerNick];
    if(!ownerComments) return;
    var claimComments=ownerComments[claimId];
    if(!claimComments) return;
    claimComments.forEach(function(c){result.push(Object.assign({},c,{from:nick}));});
  });
  result.sort(function(a,b){return a.timestamp-b.timestamp;});
  return result;
}

// ── 댓글 시트 ─────────────────────────────────────────────
function openCommentSheet(ownerNick,claimId,payloads) {
  currentSheetNick=ownerNick; currentSheetClaimId=claimId;
  var ownerP=payloads[ownerNick]||{};
  var claim=(ownerP.claims||[]).find(function(c){return c.id===claimId;});

  document.getElementById("sheet-claim-preview").textContent=claim?claim.text:"";
  makeAvatar(document.getElementById("sheet-compose-avatar"),myCelebName,myAvColor);

  renderComments(getComments(payloads,ownerNick,claimId));
  document.getElementById("comment-sheet").style.display="flex";

  var input=document.getElementById("sheet-input");
  var sendBtn=document.getElementById("sheet-send-btn");

  // 이전 이벤트 제거 후 재등록
  var newInput=input.cloneNode(true); input.parentNode.replaceChild(newInput,input);
  var newSend=sendBtn.cloneNode(true); sendBtn.parentNode.replaceChild(newSend,sendBtn);

  newSend.addEventListener("click",function(){submitComment(ownerNick,claimId,newInput);});
  newInput.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();submitComment(ownerNick,claimId,newInput);}});

  document.getElementById("sheet-close-btn").onclick=function(){document.getElementById("comment-sheet").style.display="none";};
}

function renderComments(comments) {
  var el=document.getElementById("sheet-comments");
  if(!comments.length){el.innerHTML='<p class="sheet-empty">아직 의견이 없습니다</p>';return;}
  el.innerHTML=comments.map(function(c){
    var isMine=c.from===myInfo.nickname;
    var color=c.avatarColor||(cachedPayloads[c.from]&&cachedPayloads[c.from].avatarColor)||getAvatarColor(c.fromCeleb||c.from);
    return(
      '<div class="comment-row'+(isMine?" mine":"")+'">' +
        '<div class="comment-avatar" style="background:'+color+'">'+esc(avatarChar(c.fromCeleb||c.from))+'</div>' +
        '<div class="comment-content">' +
          '<div class="comment-name">'+esc(c.fromCeleb||c.from)+(isMine?' <span class="me-badge">나</span>':'')+'</div>' +
          '<div class="comment-bubble">'+esc(c.text)+'</div>' +
          '<div class="comment-time">'+timeStr(c.timestamp)+'</div>' +
        '</div>' +
      '</div>'
    );
  }).join("");
  el.scrollTop=el.scrollHeight;
}

function submitComment(ownerNick,claimId,input) {
  var text=input.value.trim();
  if(!text) return;
  input.value="";

  myInfo.loadPayloads().then(function(p){
    var mine=p[myInfo.nickname]||{};
    var comments=JSON.parse(JSON.stringify(mine.comments||{}));
    if(!comments[ownerNick]) comments[ownerNick]={};
    if(!comments[ownerNick][claimId]) comments[ownerNick][claimId]=[];
    comments[ownerNick][claimId].push({fromCeleb:myCelebName,avatarColor:myAvColor,text:text,timestamp:Date.now()});
    return myInfo.savePayload(Object.assign({},mine,{celebName:myCelebName,avatarColor:myAvColor,comments:comments}));
  });
}

// ── 대화 신청 ─────────────────────────────────────────────
function sendChatRequest(targetNick,claimText) {
  var myMK=Date.now().toString(36)+"_"+myInfo.nickname;
  // 상대 payload에 chatRequest 저장
  myInfo.loadPayloads().then(function(p){
    var targetP=p[targetNick]||{};
    return myInfo.savePayload(Object.assign({},targetP,{
      chatRequest:{from:myInfo.nickname,fromCeleb:myCelebName,fromColor:myAvColor,claimText:claimText,matchKey:myMK}
    }));
  });
  showToast(esc((cachedPayloads[targetNick]&&cachedPayloads[targetNick].celebName)||targetNick)+"님에게 대화를 신청했어요!");
}

// ── 대화 신청 수신 체크 ───────────────────────────────────
function checkIncomingRequest(payloads) {
  var myP=payloads[myInfo.nickname];
  if(!myP||!myP.chatRequest) return;
  var req=myP.chatRequest;
  if(req.from===myInfo.nickname) return; // 내가 보낸 것
  if(myMatchKey) return; // 이미 채팅 중

  var overlay=document.getElementById("request-overlay");
  if(overlay.style.display==="flex") return; // 이미 표시 중

  makeAvatar(document.getElementById("request-avatar"),req.fromCeleb,req.fromColor);
  document.getElementById("request-title").textContent=req.fromCeleb+"님이 대화를 신청했어요!";
  document.getElementById("request-claim-preview").textContent='"'+req.claimText+'"';
  overlay.style.display="flex";

  document.getElementById("request-accept-btn").onclick=function(){
    overlay.style.display="none";
    myMatchKey=req.matchKey;
    oppData={celebName:req.fromCeleb,avatarColor:req.fromColor,nick:req.from};

    // 양측 모두 chatMatchKey 저장
    myInfo.loadPayloads().then(function(p){
      var mine=p[myInfo.nickname]||{};
      var fromP=p[req.from]||{};
      // 내 payload 업데이트
      return myInfo.savePayload(Object.assign({},mine,{chatRequest:null,chatMatchKey:myMatchKey,messages:[],ended:false}));
    }).then(function(){
      showChat();
    });
  };
}

// ── 채팅 타이머 ───────────────────────────────────────────
function startChatTimer() {
  debateEndTime=getEndTime();
  if(timerInterval) clearInterval(timerInterval);
  if(Date.now()>=debateEndTime.getTime()){endChat("시간");return;}
  function tick(){var d=debateEndTime-Date.now();var el=document.getElementById("chat-timer");if(el)el.textContent=fmtTimer(d);if(d<=0){clearInterval(timerInterval);endChat("시간");}}
  tick(); timerInterval=setInterval(tick,1000);
}

function endChat(who) {
  var bar=document.getElementById("chat-ended-bar");
  if(bar) bar.style.display="flex";
  var inp=document.getElementById("chat-input-area"); if(inp) inp.style.display="none";
  var endBtn=document.getElementById("end-chat-btn"); if(endBtn) endBtn.style.display="none";
  if(timerInterval){clearInterval(timerInterval);timerInterval=null;}
  var el=document.getElementById("chat-timer"); if(el) el.textContent="종료";
}

// ── 채팅 렌더 ─────────────────────────────────────────────
function getOppMessages(payloads) {
  if(!myMatchKey||!oppData) return [];
  var oppP=payloads[oppData.nick];
  return (oppP&&oppP.messages)||[];
}

function renderMessages() {
  if(!myMatchKey||!myInfo) return;
  var myP=cachedPayloads[myInfo.nickname];
  var myMsgs=((myP&&myP.messages)||[]).map(function(m){return{text:m.text,ts:m.timestamp,mine:true};});
  var oppMsgs=getOppMessages(cachedPayloads).map(function(m){return{text:m.text,ts:m.timestamp,mine:false};});
  var all=myMsgs.concat(oppMsgs).sort(function(a,b){return a.ts-b.ts;});
  var container=document.getElementById("chat-messages"); if(!container) return;
  if(!all.length){container.innerHTML='<div class="chat-empty">대화를 시작해보세요</div>';return;}
  var oppName=oppData?oppData.celebName:"상대", oppColor=oppData?oppData.avatarColor:"#ccc";
  container.innerHTML=all.map(function(m){
    if(m.mine) return'<div class="msg-row mine"><div class="msg-content"><div class="bubble mine">'+esc(m.text)+'</div><div class="bubble-time">'+timeStr(m.ts)+'</div></div></div>';
    return'<div class="msg-row theirs"><div class="msg-avatar" style="background:'+oppColor+'">'+esc(avatarChar(oppName))+'</div><div class="msg-content"><div class="bubble-name">'+esc(oppName)+'</div><div class="bubble theirs">'+esc(m.text)+'</div><div class="bubble-time">'+timeStr(m.ts)+'</div></div></div>';
  }).join("");
  scrollToBottom();
}
function scrollToBottom(){var c=document.getElementById("chat-messages");if(c)c.scrollTop=c.scrollHeight;}

// ── 채팅 입력 ─────────────────────────────────────────────
function setupChatInput() {
  if(chatSetup) return; chatSetup=true;
  var input=document.getElementById("chat-input"), sendBtn=document.getElementById("chat-send-btn");
  var endBtn=document.getElementById("end-chat-btn"), overlay=document.getElementById("end-confirm-overlay");

  input.addEventListener("input",function(){input.style.height="auto";input.style.height=Math.min(input.scrollHeight,120)+"px";});

  document.getElementById("chat-back-btn").addEventListener("click",function(){showFeed();});
  document.getElementById("goto-feed-btn").addEventListener("click",function(){showFeed();});

  endBtn.addEventListener("click",function(){overlay.style.display="flex";});
  document.getElementById("end-cancel-btn").addEventListener("click",function(){overlay.style.display="none";});
  overlay.addEventListener("click",function(e){if(e.target===overlay)overlay.style.display="none";});
  document.getElementById("end-confirm-btn").addEventListener("click",function(){
    overlay.style.display="none";
    myInfo.loadPayloads().then(function(p){var mine=p[myInfo.nickname]||{};return myInfo.savePayload(Object.assign({},mine,{ended:true}));}).then(function(){endChat("나");});
  });

  function send(){
    if(debateEndTime&&Date.now()>=debateEndTime.getTime()){endChat("시간");return;}
    var text=input.value.trim(); if(!text) return;
    sendBtn.disabled=true; input.value=""; input.style.height="auto";
    myInfo.loadPayloads().then(function(p){
      var mine=((p[myInfo.nickname]&&p[myInfo.nickname].messages)||[]).slice();
      mine.push({text:text,timestamp:Date.now()});
      return myInfo.savePayload(Object.assign({},p[myInfo.nickname]||{},{celebName:myCelebName,avatarColor:myAvColor,chatMatchKey:myMatchKey,messages:mine,ended:false}));
    }).then(function(){sendBtn.disabled=false;}).catch(function(){sendBtn.disabled=false;});
  }
  sendBtn.addEventListener("click",send);
  input.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}});
}

// ── 토스트 알림 ───────────────────────────────────────────
function showToast(msg) {
  var t=document.createElement("div");
  t.className="toast"; t.innerHTML=msg;
  document.body.appendChild(t);
  setTimeout(function(){t.classList.add("show");},10);
  setTimeout(function(){t.classList.remove("show");setTimeout(function(){t.remove();},300);},3000);
}

// ── 메인 ──────────────────────────────────────────────────
window.DebateCore.onReady(function(info){
  myInfo=info;
  if(!info.nickname){showMessage("토론 플랫폼을 통해 다시 접속하세요.");return;}
  myCelebName=getCelebName(info.nickname);
  myAvColor=getAvatarColor(myCelebName);

  if(info.status==="pending"){showWaiting();return;}
  if(info.status!=="active"){showMessage("토론이 종료되었습니다.");return;}
  if(!isDebateOpen()){showWaiting();return;}

  var isReadonly=info.role!=="participant";

  // 내 초기 payload 등록 (없으면)
  if(!isReadonly){
    info.loadPayloads().then(function(p){
      if(!p[info.nickname]||!p[info.nickname].celebName){
        return info.savePayload({celebName:myCelebName,avatarColor:myAvColor,claims:[],comments:{},chatRequest:null,chatMatchKey:null,messages:[],ended:false});
      }
    });
  }

  showFeed();

  // 실시간 감시
  info.onPayloadsChange(function(payloads){
    cachedPayloads=payloads;

    // 피드 항상 갱신
    if(document.getElementById("feed-screen").style.display!=="none") renderFeed(payloads);

    // 댓글 시트 실시간 갱신
    if(currentSheetNick&&currentSheetClaimId&&document.getElementById("comment-sheet").style.display!=="none"){
      renderComments(getComments(payloads,currentSheetNick,currentSheetClaimId));
    }

    // 채팅 중 메시지 갱신 + 상대 종료 감지
    if(myMatchKey){
      if(document.getElementById("chat-screen").style.display!=="none") renderMessages();
      var oppP=oppData?payloads[oppData.nick]:null;
      var inputArea=document.getElementById("chat-input-area");
      if(oppP&&oppP.ended&&inputArea&&inputArea.style.display!=="none") endChat("상대");
      return;
    }

    // 새로고침 후 채팅 복원
    var myP=payloads[info.nickname];
    if(myP&&myP.chatMatchKey&&!myMatchKey){
      myMatchKey=myP.chatMatchKey;
      // 상대 찾기
      Object.keys(payloads).forEach(function(nick){
        if(nick===info.nickname) return;
        var p=payloads[nick];
        if(p&&p.chatMatchKey===myMatchKey) oppData={celebName:p.celebName||nick,avatarColor:p.avatarColor||getAvatarColor(nick),nick:nick};
      });
      if(document.getElementById("chat-screen").style.display!=="flex") showChat();
      else renderMessages();
      return;
    }

    // 대화 신청 수신
    if(!isReadonly) checkIncomingRequest(payloads);
  });
});
