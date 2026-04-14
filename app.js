/**
 * 토론 앱 v3 — 로비 + 관전 + 대화신청
 *
 * payload 구조:
 * {
 *   celebName, side, intensity, currentIntensity,
 *   matchKey: null | "proNick::conNick",
 *   claim: "첫 주장 텍스트",   ← 대기 중 작성
 *   messages: [{text, timestamp}],
 *   reactions: { "👍": N, "❤️": N, "🤔": N, "😮": N },
 *   chatRequest: { from, fromCeleb, to, status: "pending"|"accepted"|"declined" } | null,
 *   ended: false | true,
 *   finalIntensity, persuasion, ratings
 * }
 */

// ── 설정 ─────────────────────────────────────────────────
var DEBATE_START_HOUR = 21;
var DEBATE_END_HOUR   = 24;

var INTENSITY_LABELS = {1:"매우 온건",2:"온건",3:"중립",4:"강경",5:"매우 강경"};
var CELEB_POOL = ["아이유","BTS RM","박서준","손예진","공유","김태리","이준호","수지","현빈","박보검","전지현","송강","한소희","차은우","이영애","김수현","고윤정","변우석","정호연","류준열","김고은","최우식","박은빈","위하준","신민아","주지훈","이세영","옹성우","박지현","남주혁"];
var AVATAR_COLORS = ["#FF6B6B","#FF8E53","#FFC947","#6BCB77","#4D96FF","#C77DFF","#FF6B9D","#00B4D8"];

function isVague(n)  { return n>=1&&n<=3; }
function isStrong(n) { return n>=4&&n<=5; }

// ── 상태 ─────────────────────────────────────────────────
var myInfo=null, myCelebName=null, myAvColor=null;
var myChosenSide=null, myIntensity=null, myCurrentIntensity=null;
var myMatchKey=null, oppData=null;
var debateEndTime=null, timerInterval=null, countdownInterval=null, lobbyTimerInterval=null;
var chatSetup=false, evalSetup=false, lobbySetup=false;
var lastRenderedKey="";
var cachedPayloads={};
var evalData={persuasion:null,ratings:{},finalIntensity:null};
var spectatingKey=null;   // 현재 관전 중인 matchKey
var myClaimSent=false;    // 첫 주장 전송 여부

var IS_VIEWER = new URLSearchParams(location.search).get("view")==="true";

// ── 유틸 ─────────────────────────────────────────────────
function getCelebName(n){var h=0;for(var i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))&0xffffffff;return CELEB_POOL[Math.abs(h)%CELEB_POOL.length];}
function getAvatarColor(n){var h=0;for(var i=0;i<(n||"").length;i++)h=(h*17+n.charCodeAt(i))&0xffffffff;return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length];}
function avatarChar(n){return(n||"?").charAt(0);}
function makeAvatar(el,name,color){if(!el)return;el.textContent=avatarChar(name);el.style.background=color||getAvatarColor(name);}
function iLabel(n){return INTENSITY_LABELS[n]||"";}
function stanceText(side,intensity){return(side==="pro"?"찬성":"반대")+" · "+iLabel(intensity);}
function groupLabel(n){return isVague(n)?"모호파":"강경파";}
function pad(n){return n<10?"0"+n:""+n;}
function esc(t){var d=document.createElement("div");d.textContent=t;return d.innerHTML;}
function mkKey(pro,con){return pro+"::"+con;}
function timeStr(ts){var d=new Date(ts);return pad(d.getHours())+":"+pad(d.getMinutes());}
function fmtCD(ms){if(ms<=0)return"00:00:00";var s=Math.floor(ms/1000);return pad(Math.floor(s/3600))+":"+pad(Math.floor((s%3600)/60))+":"+pad(s%60);}
function fmtTimer(ms){if(ms<=0)return"종료";var s=Math.floor(ms/1000);return pad(Math.floor(s/60))+":"+pad(s%60);}
function getKSTHour(){return new Date(Date.now()+9*3600000).getUTCHours();}
function isDebateOpen(){var h=getKSTHour();return DEBATE_END_HOUR>=24?h>=DEBATE_START_HOUR:(h>=DEBATE_START_HOUR&&h<DEBATE_END_HOUR);}
function getNextStart(){var k=new Date(Date.now()+9*3600000);if(k.getUTCHours()<DEBATE_START_HOUR)k.setUTCHours(DEBATE_START_HOUR,0,0,0);else{k.setUTCDate(k.getUTCDate()+1);k.setUTCHours(DEBATE_START_HOUR,0,0,0);}return new Date(k.getTime()-9*3600000);}
function getEndTime(){var k=new Date(Date.now()+9*3600000);if(DEBATE_END_HOUR>=24){k.setUTCDate(k.getUTCDate()+1);k.setUTCHours(0,0,0,0);}else k.setUTCHours(DEBATE_END_HOUR,0,0,0);return new Date(k.getTime()-9*3600000);}

// ── 화면 전환 ─────────────────────────────────────────────
function hideAll(){
  ["message","waiting-screen","side-screen","intensity-screen","lobby-screen","chat-screen","eval-screen"].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display="none";});
}
function showMessage(t){hideAll();document.getElementById("message-text").textContent=t;document.getElementById("message").style.display="flex";}
function showWaiting(){
  hideAll();document.getElementById("waiting-screen").style.display="flex";
  if(countdownInterval)clearInterval(countdownInterval);
  function tick(){var d=getNextStart()-Date.now();document.getElementById("countdown-display").textContent=fmtCD(d);if(d<=0){clearInterval(countdownInterval);location.reload();}}
  tick();countdownInterval=setInterval(tick,1000);
}
function showSideScreen(title){
  hideAll();
  document.getElementById("side-topic").textContent=title||"";
  document.getElementById("card-topic-text").textContent=title||"";
  document.getElementById("side-screen").style.display="flex";
}
function showIntensityScreen(){
  hideAll();
  makeAvatar(document.getElementById("is-avatar"),myCelebName,myAvColor);
  document.getElementById("is-name").textContent=myCelebName;
  var sb=document.getElementById("is-side-badge");
  sb.textContent=myChosenSide==="pro"?"찬성 👍":"반대 ✕";
  sb.className="is-side-badge "+(myChosenSide==="pro"?"pro":"con");
  document.getElementById("spectrum-fill").style.width="0%";
  document.querySelectorAll(".i-btn").forEach(function(b){b.classList.remove("selected","locked");b.disabled=false;});
  document.getElementById("intensity-screen").style.display="flex";
}
function showLobby(){
  hideAll();
  document.getElementById("lobby-screen").style.display="flex";
  makeAvatar(document.getElementById("lobby-avatar"),myCelebName,myAvColor);
  document.getElementById("lobby-name").textContent=myCelebName;
  document.getElementById("lobby-stance").textContent=stanceText(myChosenSide,myIntensity)+" · "+groupLabel(myIntensity);
  startLobbyTimer();
  setupLobby();
}
function showChat(){
  hideAll();
  document.getElementById("chat-screen").style.display="flex";
  if(oppData){
    makeAvatar(document.getElementById("chat-opp-avatar"),oppData.celebName,oppData.avatarColor);
    document.getElementById("chat-opp-name").textContent=oppData.celebName;
    document.getElementById("chat-opp-stance").textContent=stanceText(oppData.side,oppData.intensity)+" · "+groupLabel(oppData.intensity);
  }
  document.getElementById("chat-topic-text").textContent=(myInfo&&myInfo.title)||"";
  setupChatIntensityBar();
  startChatTimer();
  renderMessages();
  setupChatInput();
  scrollToBottom();
}
function showEval(){
  hideAll();
  document.getElementById("eval-screen").style.display="flex";
  var amVague=isVague(myIntensity);
  document.getElementById("eval-subtitle").textContent=amVague?"대화가 어땠나요? 솔직하게 알려주세요 😊":"상대방과의 대화를 평가해주세요";
  document.getElementById("eval-persuasion").style.display=amVague?"block":"none";
  document.getElementById("eval-rating").style.display=amVague?"none":"block";
  setupEval();
}

// ── 로비 타이머 ───────────────────────────────────────────
function startLobbyTimer(){
  var end=getEndTime();
  if(lobbyTimerInterval)clearInterval(lobbyTimerInterval);
  function tick(){var d=end-Date.now();var el=document.getElementById("lobby-timer");if(el)el.textContent=fmtTimer(d);}
  tick();lobbyTimerInterval=setInterval(tick,1000);
}

// ── 로비 설정 ─────────────────────────────────────────────
function setupLobby(){
  if(lobbySetup)return;
  lobbySetup=true;

  // 탭 전환
  document.querySelectorAll(".lobby-tab").forEach(function(tab){
    tab.addEventListener("click",function(){
      document.querySelectorAll(".lobby-tab").forEach(function(t){t.classList.remove("active");});
      tab.classList.add("active");
      var t=tab.dataset.tab;
      document.getElementById("lobby-live-list").style.display=t==="live"?"block":"none";
      document.getElementById("lobby-ended-list").style.display=t==="ended"?"block":"none";
    });
  });

  // 주장 입력 (claim): 입력하면 자동 저장
  var claimInput=document.getElementById("claim-input");
  var saveTimeout=null;
  claimInput.addEventListener("input",function(){
    if(saveTimeout)clearTimeout(saveTimeout);
    saveTimeout=setTimeout(function(){saveClaim(claimInput.value.trim());},800);
  });
}

function saveClaim(text){
  if(!myInfo||!text)return;
  myInfo.loadPayloads().then(function(payloads){
    var mine=payloads[myInfo.nickname]||{};
    return myInfo.savePayload(Object.assign({},mine,{
      celebName:myCelebName,side:myChosenSide,intensity:myIntensity,
      currentIntensity:myCurrentIntensity,matchKey:null,claim:text,
      messages:mine.messages||[],ended:false
    }));
  });
}

// ── 매칭 알림 ─────────────────────────────────────────────
function showMatchNotification(oppName,oppColor){
  var notif=document.getElementById("match-notification");
  makeAvatar(document.getElementById("notif-avatar"),oppName,oppColor);
  document.getElementById("notif-name").textContent=oppName;
  notif.style.display="flex";
  if(navigator.vibrate)navigator.vibrate([100,50,100]);
}

// ── 채팅 타이머 ───────────────────────────────────────────
function startChatTimer(){
  debateEndTime=getEndTime();
  if(timerInterval)clearInterval(timerInterval);
  if(Date.now()>=debateEndTime.getTime()){endChat("시간");return;}
  function tick(){var d=debateEndTime-Date.now();var el=document.getElementById("chat-timer");if(el)el.textContent=fmtTimer(d);if(d<=0){clearInterval(timerInterval);endChat("시간");}}
  tick();timerInterval=setInterval(tick,1000);
}

function endChat(who){
  var bar=document.getElementById("chat-ended-bar");
  if(bar)bar.style.display="flex";
  var inp=document.getElementById("chat-input-area");if(inp)inp.style.display="none";
  var endBtn=document.getElementById("end-chat-btn");if(endBtn)endBtn.style.display="none";
  if(timerInterval){clearInterval(timerInterval);timerInterval=null;}
  var el=document.getElementById("chat-timer");if(el)el.textContent="종료";
  // 3초 후 평가
  setTimeout(function(){showEval();},3000);
}

// ── 채팅 중 강경도 바 ──────────────────────────────────────
function setupChatIntensityBar(){
  myCurrentIntensity=myCurrentIntensity||myIntensity;
  var btns=document.querySelectorAll(".cib-btn"),hint=document.getElementById("cib-hint");
  function updateBar(v){btns.forEach(function(b){b.classList.toggle("active",parseInt(b.dataset.v)===v);});hint.textContent=v!==myIntensity?(v>myIntensity?"↑ 더 강경해졌어요":"↓ 더 온건해졌어요"):"";hint.className="cib-hint"+(v>myIntensity?" up":v<myIntensity?" down":"");}
  updateBar(myCurrentIntensity);
  btns.forEach(function(btn){
    btn.addEventListener("click",function(){
      myCurrentIntensity=parseInt(btn.dataset.v);updateBar(myCurrentIntensity);
      if(myInfo)myInfo.loadPayloads().then(function(p){var mine=p[myInfo.nickname]||{};return myInfo.savePayload(Object.assign({},mine,{currentIntensity:myCurrentIntensity}));});
    });
  });
}

// ── 매칭 로직 ─────────────────────────────────────────────
function tryMatch(payloads,myNick){
  var myP=payloads[myNick];
  if(!myP||!myP.side||!myP.intensity||myP.matchKey)return null;
  var oppSide=myP.side==="pro"?"con":"pro";
  var candidates=Object.keys(payloads).filter(function(nick){
    if(nick===myNick)return false;
    var p=payloads[nick];return p&&p.side===oppSide&&p.intensity&&!p.matchKey;
  });
  if(!candidates.length)return null;
  var cross=candidates.filter(function(nick){var p=payloads[nick];return(isVague(myP.intensity)&&isStrong(p.intensity))||(isStrong(myP.intensity)&&isVague(p.intensity));});
  var best=null,bestDiff=-1;
  (cross.length?cross:candidates).forEach(function(nick){var d=Math.abs(myP.intensity-payloads[nick].intensity);if(d>bestDiff){bestDiff=d;best=nick;}});
  if(!best)return null;
  return{key:mkKey(myP.side==="pro"?myNick:best,myP.side==="con"?myNick:best),type:cross.length?"cross":"same"};
}

// ── 채팅 렌더 ─────────────────────────────────────────────
function getOppNick(){
  if(!myMatchKey||!myInfo)return null;
  var parts=myMatchKey.split("::");
  var myP=cachedPayloads[myInfo.nickname];
  return(myP&&myP.side==="pro")?parts[1]:parts[0];
}

function renderMessages(){
  if(!myMatchKey||!myInfo)return;
  var myP=cachedPayloads[myInfo.nickname],oppNick=getOppNick(),oppP=cachedPayloads[oppNick];
  var myMsgs=((myP&&myP.messages)||[]).map(function(m){return{text:m.text,ts:m.timestamp,mine:true};});
  var oppMsgs=((oppP&&oppP.messages)||[]).map(function(m){return{text:m.text,ts:m.timestamp,mine:false};});
  var all=myMsgs.concat(oppMsgs).sort(function(a,b){return a.ts-b.ts;});
  var key=all.map(function(m){return m.ts+(m.mine?"m":"o");}).join(",");
  if(key===lastRenderedKey)return;lastRenderedKey=key;
  var container=document.getElementById("chat-messages");if(!container)return;
  if(!all.length){container.innerHTML='<div class="chat-empty">대화를 시작해보세요</div>';return;}
  var oppName=oppData?oppData.celebName:(oppNick||"상대"),oppColor=oppData?oppData.avatarColor:getAvatarColor(oppName);
  container.innerHTML=all.map(function(m){
    if(m.mine)return'<div class="msg-row mine"><div class="msg-content"><div class="bubble mine">'+esc(m.text)+'</div><div class="bubble-time">'+timeStr(m.ts)+'</div></div></div>';
    return'<div class="msg-row theirs"><div class="msg-avatar" style="background:'+oppColor+'">'+esc(avatarChar(oppName))+'</div><div class="msg-content"><div class="bubble-name">'+esc(oppName)+'</div><div class="bubble theirs">'+esc(m.text)+'</div><div class="bubble-time">'+timeStr(m.ts)+'</div></div></div>';
  }).join("");
  scrollToBottom();
}
function scrollToBottom(){var c=document.getElementById("chat-messages");if(c)c.scrollTop=c.scrollHeight;}

// ── 채팅 입력 ─────────────────────────────────────────────
function setupChatInput(){
  if(chatSetup)return;chatSetup=true;
  var input=document.getElementById("chat-input"),sendBtn=document.getElementById("chat-send-btn");
  var endBtn=document.getElementById("end-chat-btn"),overlay=document.getElementById("end-confirm-overlay");

  input.addEventListener("input",function(){input.style.height="auto";input.style.height=Math.min(input.scrollHeight,120)+"px";});

  // 뒤로 가기 (로비로)
  document.getElementById("chat-back-btn").addEventListener("click",function(){showLobby();});
  document.getElementById("goto-lobby-btn").addEventListener("click",function(){showLobby();});

  endBtn.addEventListener("click",function(){overlay.style.display="flex";});
  document.getElementById("end-cancel-btn").addEventListener("click",function(){overlay.style.display="none";});
  overlay.addEventListener("click",function(e){if(e.target===overlay)overlay.style.display="none";});
  document.getElementById("end-confirm-btn").addEventListener("click",function(){
    overlay.style.display="none";
    myInfo.loadPayloads().then(function(p){var mine=p[myInfo.nickname]||{};return myInfo.savePayload(Object.assign({},mine,{ended:true}));}).then(function(){endChat("나");});
  });

  function send(){
    if(debateEndTime&&Date.now()>=debateEndTime.getTime()){endChat("시간");return;}
    var text=input.value.trim();if(!text)return;
    sendBtn.disabled=true;input.value="";input.style.height="auto";
    myInfo.loadPayloads().then(function(p){
      var mine=((p[myInfo.nickname]&&p[myInfo.nickname].messages)||[]).slice();
      mine.push({text:text,timestamp:Date.now()});
      return myInfo.savePayload(Object.assign({},p[myInfo.nickname]||{},{celebName:myCelebName,side:myChosenSide,intensity:myIntensity,currentIntensity:myCurrentIntensity,matchKey:myMatchKey,messages:mine,ended:false}));
    }).then(function(){sendBtn.disabled=false;}).catch(function(){sendBtn.disabled=false;});
  }
  sendBtn.addEventListener("click",send);
  input.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}});
}

// ── 로비 관전 렌더 ────────────────────────────────────────
function renderLobby(payloads){
  var matches={};
  Object.keys(payloads).forEach(function(nick){
    var p=payloads[nick];if(!p||!p.matchKey)return;
    if(!matches[p.matchKey])matches[p.matchKey]=[];
    matches[p.matchKey].push({nick:nick,p:p});
  });

  var liveKeys=[],endedKeys=[];
  Object.keys(matches).forEach(function(key){
    var pair=matches[key];
    var anyEnded=pair.some(function(e){return e.p.ended;});
    (anyEnded?endedKeys:liveKeys).push(key);
  });

  function renderCard(key,idx,isLive){
    var pair=matches[key];
    var proE=pair.find(function(e){return e.p.side==="pro";}),conE=pair.find(function(e){return e.p.side==="con";});
    var proName=(proE&&proE.p.celebName)||"?",conName=(conE&&conE.p.celebName)||"?";
    var proMsgs=((proE&&proE.p.messages)||[]),conMsgs=((conE&&conE.p.messages)||[]);
    var total=proMsgs.length+conMsgs.length;
    var lastMsg=proMsgs.concat(conMsgs).sort(function(a,b){return b.timestamp-a.timestamp;})[0];
    var reactions=((proE&&proE.p.reactions)||{});
    var reactSum=Object.values(reactions).reduce(function(a,b){return a+(b||0);},0);
    var div=document.createElement("div");
    div.className="lobby-chat-card"+(isLive?" live":"");
    div.innerHTML=
      '<div class="lcc-header">'+
        '<div class="lcc-names"><span class="lcc-pro">'+esc(proName)+'<span class="lcc-tag pro">찬</span></span><span class="lcc-vs">vs</span><span class="lcc-con">'+esc(conName)+'<span class="lcc-tag con">반</span></span></div>'+
        (isLive?'<div class="lcc-live-dot"></div>':'<div class="lcc-ended-badge">종료</div>')+
      '</div>'+
      (lastMsg?'<div class="lcc-preview">'+esc(lastMsg.text.substring(0,60))+(lastMsg.text.length>60?"...":"")+'</div>':'<div class="lcc-preview muted">아직 대화가 없습니다</div>')+
      '<div class="lcc-footer"><span class="lcc-count">💬 '+total+'</span><span class="lcc-reactions">'+reactSum+'개 반응</span></div>';
    div.addEventListener("click",function(){openSpectate(key,pair,isLive);});
    return div;
  }

  var liveList=document.getElementById("lobby-live-list"),endedList=document.getElementById("lobby-ended-list");
  liveList.innerHTML="";endedList.innerHTML="";
  if(!liveKeys.length)liveList.innerHTML='<p class="lobby-empty">아직 진행 중인 대화가 없습니다</p>';
  else liveKeys.forEach(function(k,i){liveList.appendChild(renderCard(k,i,true));});
  if(!endedKeys.length)endedList.innerHTML='<p class="lobby-empty">아직 종료된 대화가 없습니다</p>';
  else endedKeys.forEach(function(k,i){endedList.appendChild(renderCard(k,i,false));});
}

// ── 관전 모달 ─────────────────────────────────────────────
function openSpectate(key,pair,isLive){
  spectatingKey=key;
  var modal=document.getElementById("spectate-modal");
  modal.style.display="flex";
  var proE=pair.find(function(e){return e.p.side==="pro";}),conE=pair.find(function(e){return e.p.side==="con";});
  var proName=(proE&&proE.p.celebName)||"?",conName=(conE&&conE.p.celebName)||"?";
  document.getElementById("spectate-title").textContent=proName+" vs "+conName;
  document.getElementById("spectate-badges").innerHTML=
    '<span class="lcc-tag pro">찬성 '+iLabel(proE?proE.p.intensity:"")+'</span>'+
    '<span class="lcc-tag con">반대 '+iLabel(conE?conE.p.intensity:"")+'</span>';

  // 메시지
  renderSpectateMessages(pair);

  // 반응 수
  var reactions=(proE&&proE.p.reactions)||{};
  document.getElementById("r-count-like").textContent=reactions["👍"]||0;

  // 반응 버튼
  document.querySelectorAll(".reaction-btn").forEach(function(btn){
    btn.onclick=function(){addReaction(key,proE?proE.nick:null,"👍");};
  });

  // 대화 신청 (종료된 대화의 참여자에게, 자신 제외, 이미 매칭 안 된 경우)
  var requestBtn=document.getElementById("spectate-request-btn");
  var iAmInThis=pair.some(function(e){return e.nick===myInfo.nickname;});
  var iHaveMatch=!!(cachedPayloads[myInfo.nickname]&&cachedPayloads[myInfo.nickname].matchKey);
  if(!isLive&&!iAmInThis&&!iHaveMatch){
    requestBtn.style.display="block";
    requestBtn.onclick=function(){sendChatRequest(pair);};
  } else {
    requestBtn.style.display="none";
  }

  // 닫기
  document.getElementById("spectate-close-btn").onclick=function(){modal.style.display="none";spectatingKey=null;};
}

function renderSpectateMessages(pair){
  var proE=pair.find(function(e){return e.p.side==="pro";}),conE=pair.find(function(e){return e.p.side==="con";});
  var proName=(proE&&proE.p.celebName)||"?",conName=(conE&&conE.p.celebName)||"?";
  var proColor=proE?getAvatarColor(proName):"#999",conColor=conE?getAvatarColor(conName):"#999";
  var proMsgs=((proE&&proE.p.messages)||[]).map(function(m){return{name:proName,color:proColor,side:"pro",text:m.text,ts:m.timestamp};});
  var conMsgs=((conE&&conE.p.messages)||[]).map(function(m){return{name:conName,color:conColor,side:"con",text:m.text,ts:m.timestamp};});
  var all=proMsgs.concat(conMsgs).sort(function(a,b){return a.ts-b.ts;});
  var container=document.getElementById("spectate-messages");
  if(!all.length){container.innerHTML='<p class="lobby-empty">아직 대화가 없습니다</p>';return;}
  container.innerHTML=all.map(function(m){
    return'<div class="spec-msg-row"><div class="spec-avatar" style="background:'+m.color+'">'+esc(avatarChar(m.name))+'</div><div class="spec-content"><div class="spec-name">'+esc(m.name)+' <span class="lcc-tag '+m.side+'">'+(m.side==="pro"?"찬":"반")+'</span></div><div class="spec-bubble">'+esc(m.text)+'</div><div class="bubble-time">'+timeStr(m.ts)+'</div></div></div>';
  }).join("");
}

function addReaction(matchKey,targetNick,emoji){
  if(!targetNick||!myInfo)return;
  myInfo.loadPayloads().then(function(p){
    var target=p[targetNick]||{};
    var reactions=Object.assign({"👍":0,"❤️":0,"🤔":0,"😮":0},target.reactions||{});
    reactions[emoji]=(reactions[emoji]||0)+1;
    return myInfo.savePayload(Object.assign({},target,{reactions:reactions}));
  });
}

// ── 대화 신청 ─────────────────────────────────────────────
function sendChatRequest(pair){
  // 종료된 대화의 참여자 중 한 명에게 신청 (찬반 반대인 사람 우선)
  var target=pair.find(function(e){return e.p.side!==(myChosenSide);});
  if(!target)target=pair[0];
  myInfo.loadPayloads().then(function(p){
    var targetP=p[target.nick]||{};
    return myInfo.savePayload(Object.assign({},targetP,{
      chatRequest:{from:myInfo.nickname,fromCeleb:myCelebName,to:target.nick,status:"pending"}
    }));
  });
  document.getElementById("spectate-modal").style.display="none";
  alert(target.p.celebName+"님에게 대화 신청을 보냈습니다! 수락을 기다려주세요.");
}

function checkIncomingRequest(payloads){
  var myP=payloads[myInfo.nickname];
  if(!myP||!myP.chatRequest)return;
  var req=myP.chatRequest;
  if(req.to!==myInfo.nickname||req.status!=="pending")return;
  // 내가 이미 매칭 중이면 자동 거절
  if(myMatchKey){
    myInfo.loadPayloads().then(function(p){var mp=p[myInfo.nickname]||{};return myInfo.savePayload(Object.assign({},mp,{chatRequest:Object.assign({},req,{status:"declined"})}));});
    return;
  }
  // 수락/거절 모달
  var overlay=document.getElementById("chat-request-overlay");
  makeAvatar(document.getElementById("request-avatar"),req.fromCeleb,getAvatarColor(req.fromCeleb));
  document.getElementById("request-title").textContent=req.fromCeleb+"님이 대화를 신청했어요!";
  overlay.style.display="flex";
  document.getElementById("request-accept-btn").onclick=function(){
    overlay.style.display="none";
    // 새 매칭 키 생성
    var proNick=myChosenSide==="pro"?myInfo.nickname:req.from;
    var conNick=myChosenSide==="con"?myInfo.nickname:req.from;
    var newKey=mkKey(proNick,conNick);
    myMatchKey=newKey;
    var reqP=payloads[req.from]||{};
    oppData={celebName:req.fromCeleb,side:reqP.side,intensity:reqP.intensity,avatarColor:getAvatarColor(req.fromCeleb)};
    myInfo.loadPayloads().then(function(p){
      var mp=p[myInfo.nickname]||{};
      return myInfo.savePayload(Object.assign({},mp,{matchKey:newKey,chatRequest:null,messages:[],ended:false}));
    }).then(function(){showChat();});
  };
}

// ── 평가 ──────────────────────────────────────────────────
function setupEval(){
  if(evalSetup)return;evalSetup=true;
  document.querySelectorAll(".eval-p-btn").forEach(function(btn){btn.addEventListener("click",function(){document.querySelectorAll(".eval-p-btn").forEach(function(b){b.classList.remove("selected");});btn.classList.add("selected");evalData.persuasion=btn.dataset.val;checkEvalReady();});});
  document.querySelectorAll(".eval-stars").forEach(function(row){var key=row.dataset.key,stars=row.querySelectorAll(".star");stars.forEach(function(star){star.addEventListener("click",function(){var v=parseInt(star.dataset.v);evalData.ratings[key]=v;stars.forEach(function(s){s.classList.toggle("filled",parseInt(s.dataset.v)<=v);});checkEvalReady();});});});
  document.querySelectorAll(".eval-i-btn").forEach(function(btn){btn.addEventListener("click",function(){document.querySelectorAll(".eval-i-btn").forEach(function(b){b.classList.remove("selected");});btn.classList.add("selected");evalData.finalIntensity=parseInt(btn.dataset.v);checkEvalReady();});});
  document.getElementById("eval-submit-btn").addEventListener("click",function(){
    myInfo.loadPayloads().then(function(p){var mine=p[myInfo.nickname]||{};return myInfo.savePayload(Object.assign({},mine,{finalIntensity:evalData.finalIntensity,persuasion:evalData.persuasion,ratings:evalData.ratings,ended:true}));}).then(function(){showLobby();});
  });
}
function checkEvalReady(){var amVague=isVague(myIntensity),ok=evalData.finalIntensity!==null;if(amVague)ok=ok&&evalData.persuasion!==null;else ok=ok&&Object.keys(evalData.ratings).length>=3;document.getElementById("eval-submit-btn").disabled=!ok;}

// ── 카드 스와이프 ──────────────────────────────────────────
function setupCardSwipe(onSelect){
  var card=document.getElementById("debate-card"),hintL=document.getElementById("hint-left"),hintR=document.getElementById("hint-right");
  var startX=0,curX=0,dragging=false;
  function onStart(x){startX=x;dragging=true;card.style.transition="";}
  function onMove(x){if(!dragging)return;curX=x-startX;card.style.transform="translateX("+curX+"px) rotate("+(curX*0.08)+"deg)";hintR.style.opacity=curX>30?Math.min((curX-30)/60,1):0;hintL.style.opacity=curX<-30?Math.min((-curX-30)/60,1):0;}
  function onEnd(){if(!dragging)return;dragging=false;hintL.style.opacity=0;hintR.style.opacity=0;if(curX>80)flyOut("right",function(){onSelect("pro");});else if(curX<-80)flyOut("left",function(){onSelect("con");});else{card.style.transition="transform 0.3s";card.style.transform="";setTimeout(function(){card.style.transition="";},300);}curX=0;}
  card.addEventListener("mousedown",function(e){onStart(e.clientX);});window.addEventListener("mousemove",function(e){onMove(e.clientX);});window.addEventListener("mouseup",onEnd);
  card.addEventListener("touchstart",function(e){onStart(e.touches[0].clientX);},{passive:true});window.addEventListener("touchmove",function(e){if(dragging)onMove(e.touches[0].clientX);},{passive:true});window.addEventListener("touchend",onEnd);
  function flyOut(dir,cb){var tx=dir==="right"?window.innerWidth+200:-(window.innerWidth+200);card.style.transition="transform 0.35s ease";card.style.transform="translateX("+tx+"px) rotate("+(dir==="right"?20:-20)+"deg)";setTimeout(cb,350);}
  document.getElementById("pro-btn").addEventListener("click",function(){flyOut("right",function(){onSelect("pro");});});
  document.getElementById("con-btn").addEventListener("click",function(){flyOut("left",function(){onSelect("con");});});
}

// ── 강경도 선택 ───────────────────────────────────────────
function setupIntensitySelection(onSelected){
  var fill=document.getElementById("spectrum-fill");
  document.querySelectorAll(".i-btn").forEach(function(btn){
    btn.addEventListener("click",function(){
      if(btn.disabled)return;
      myIntensity=parseInt(btn.dataset.intensity);myCurrentIntensity=myIntensity;
      document.querySelectorAll(".i-btn").forEach(function(b){b.classList.add("locked");b.disabled=true;b.classList.remove("selected");});
      btn.classList.add("selected");
      fill.style.width=((myIntensity-1)/4*100)+"%";
      onSelected(myIntensity);
    });
  });
}

// ── 메인 ──────────────────────────────────────────────────
window.DebateCore.onReady(function(info){
  myInfo=info;
  if(!info.nickname){showMessage("토론 플랫폼을 통해 다시 접속하세요.");return;}
  myCelebName=getCelebName(info.nickname);myAvColor=getAvatarColor(myCelebName);

  if(IS_VIEWER){
    // 관찰자: 로비처럼 전체 대화 보기
    document.getElementById("viewer-screen") && (document.getElementById("viewer-screen").style.display="none");
    showLobby();
    info.onPayloadsChange(function(p){cachedPayloads=p;renderLobby(p);});
    return;
  }

  if(info.status==="pending"){showWaiting();return;}
  if(info.status!=="active"){showMessage("토론이 종료되었습니다.");return;}
  if(!isDebateOpen()){showWaiting();return;}

  var isReadonly=info.role!=="participant";

  // STEP1: 찬반
  showSideScreen(info.title);
  setupCardSwipe(function(side){
    myChosenSide=side;
    showIntensityScreen();
    // STEP2: 강경도
    setupIntensitySelection(function(intensity){
      myIntensity=intensity;myCurrentIntensity=intensity;
      // Firebase 등록
      info.savePayload({celebName:myCelebName,side:myChosenSide,intensity:myIntensity,currentIntensity:myIntensity,matchKey:null,claim:"",messages:[],reactions:{"👍":0,"❤️":0,"🤔":0,"😮":0},ended:false});
      // STEP3: 로비
      showLobby();
    });
  });

  // 실시간 감시
  info.onPayloadsChange(function(payloads){
    cachedPayloads=payloads;
    var myP=payloads[info.nickname];

    // 로비 항상 갱신
    if(document.getElementById("lobby-screen").style.display!=="none") renderLobby(payloads);

    // 관전 모달 실시간 갱신
    if(spectatingKey){
      var matches={};Object.keys(payloads).forEach(function(nick){var p=payloads[nick];if(!p||!p.matchKey)return;if(!matches[p.matchKey])matches[p.matchKey]=[];matches[p.matchKey].push({nick:nick,p:p});});
      if(matches[spectatingKey]) renderSpectateMessages(matches[spectatingKey]);
    }

    if(!myP||!myP.intensity)return;

    // 대화 신청 수신 체크
    checkIncomingRequest(payloads);

    // 새로고침 복원
    if(myP.matchKey&&!myMatchKey){
      myMatchKey=myP.matchKey;myChosenSide=myP.side;myIntensity=myP.intensity;myCurrentIntensity=myP.currentIntensity||myP.intensity;
      var parts=myMatchKey.split("::"),oppNick=myP.side==="pro"?parts[1]:parts[0],oppP=payloads[oppNick];
      if(oppP)oppData={celebName:oppP.celebName||oppNick,side:oppP.side,intensity:oppP.intensity,avatarColor:getAvatarColor(oppP.celebName||oppNick)};
      if(document.getElementById("chat-screen").style.display!=="flex")showChat();
      else renderMessages();
      return;
    }

    // 채팅 중 메시지 갱신 + 상대 종료 감지
    if(myMatchKey){
      if(document.getElementById("chat-screen").style.display==="flex"){
        renderMessages();
        var parts2=myMatchKey.split("::"),myP2=payloads[info.nickname];
        var oppNick2=(myP2&&myP2.side==="pro")?parts2[1]:parts2[0];
        var oppP2=payloads[oppNick2];
        var inp=document.getElementById("chat-input-area");
        if(oppP2&&oppP2.ended&&inp&&inp.style.display!=="none")endChat("상대");
      }
      return;
    }

    // 매칭 탐색
    if(isReadonly)return;
    var result=tryMatch(payloads,info.nickname);
    if(!result)return;

    myMatchKey=result.key;
    var parts3=result.key.split("::"),oppNick3=myP.side==="pro"?parts3[1]:parts3[0],oppP3=payloads[oppNick3];
    if(oppP3)oppData={celebName:oppP3.celebName||oppNick3,side:oppP3.side,intensity:oppP3.intensity,avatarColor:getAvatarColor(oppP3.celebName||oppNick3)};

    // 대기 중 작성한 주장 → 첫 메시지로 전송
    var claim=(myP.claim||"").trim();
    var initMessages=claim?[{text:claim,timestamp:Date.now()}]:[];

    info.savePayload({celebName:myCelebName,side:myChosenSide,intensity:myIntensity,currentIntensity:myCurrentIntensity,matchKey:myMatchKey,claim:claim,messages:initMessages,reactions:myP.reactions||{"👍":0,"❤️":0,"🤔":0,"😮":0},ended:false}).then(function(){
      // 디스코드식 알림 배너
      showMatchNotification(oppData?oppData.celebName:oppNick3,oppData?oppData.avatarColor:"");
      document.getElementById("notif-enter-btn").onclick=function(){
        document.getElementById("match-notification").style.display="none";
        showChat();
      };
      // 주장 입력창 상태 업데이트
      var statusEl=document.getElementById("claim-status-text");
      if(statusEl)statusEl.textContent=(oppData?oppData.celebName:"상대")+"님과 매칭됐어요! 입장하세요 →";
    });
  });
});
