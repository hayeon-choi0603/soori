/**
 * 설득왕 💘 — app.js
 * debate-core.js 위에 틴더 스타일 토론 소개팅 UI를 올립니다.
 * window.DebateCore.onReady 콜백 안에서만 작성합니다.
 */

/* ── 닉네임별 이모지 (25명 고정) ── */
var NICK_EMS = {
  '전여친':'🌊','변우석':'💼','최미나수':'🐯','송강':'🦊','정국':'🌸',
  '뷔':'🔥','박보검':'💫','장원영':'🍀','이재욱':'🌙','원빈':'⚡',
  '로운':'🎭','나띠':'🦋','도경수':'🌺','제니':'💎','전남친':'🎯',
  '전썸남':'🌈','전썸녀':'🏆','차은우':'🎪','그레고리':'🦄','첫사랑':'🌀',
  '이재용':'🎨','카리나':'🌿','지드래곤':'🦁','영숙':'🎵','지효':'🌸'
};
/* 프로필 사진 경로 — photos/닉네임.jpg 형식으로 넣으면 자동 적용 */
var PHOTOS_DIR = './photos/';
var PHOTO_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

/* ── 챗 로컬 저장소 (세션 메모리) ── */
var localChats = {};   // { nickname: [{ me, text, ts }] }
var pendingChatNick = null;
var replyIdx = 0;
var likedNicks = {};
var myInfo = null;
var allPayloads = {};  // 실시간 payload 캐시

var REPLIES = [
  '그 부분 정말 공감가요! 그렇다면 이런 경우는 어떻게 생각하세요? 😊',
  '좋은 질문이에요! 제 경험을 더 말씀드리면요...',
  '맞아요, 그런 어려움도 있죠. 하지만 이렇게 보면 어떨까요?',
  '아, 그 관점은 생각해보지 못했어요! 다만 한 가지만 더 말씀드리면...',
  '정말 날카로운 지적이에요 😊 그래도 전반적으로 봤을 때는...',
];

/* ── 헬퍼 ── */
function em(nick) { return NICK_EMS[nick] || '😊'; }

function getPhoto(nick) {
  for (var i = 0; i < PHOTO_EXTS.length; i++) {
    return PHOTOS_DIR + nick + '.' + PHOTO_EXTS[i]; // 첫 번째 확장자 시도
  }
  return null;
}

function avHTML(nick, size) {
  var sz = size || 36;
  var photo = getPhoto(nick);
  var emoji = em(nick);
  var base = 'width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;overflow:hidden;flex-shrink:0;' +
    'display:flex;align-items:center;justify-content:center;background:var(--bg3);' +
    'font-size:' + Math.floor(sz * 0.44) + 'px;';
  if (photo) {
    return '<div style="' + base + '">' +
      '<img src="' + photo + '" style="width:100%;height:100%;object-fit:cover" ' +
      'onerror="this.parentNode.innerHTML=\'' + emoji + '\'">' + emoji + '</div>';
  }
  return '<div style="' + base + '">' + emoji + '</div>';
}

function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function nowStr() {
  var d = new Date();
  return '오후 ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* ── DEBATE-CORE READY ── */
window.DebateCore.onReady(function(info) {
  myInfo = info;

  /* 1. 닉네임 없음 */
  if (!info.nickname) {
    showMessage('토론 플랫폼을 통해 다시 접속하세요. 💘');
    return;
  }

  /* 2. 토론 대기/종료 */
  if (info.status !== 'active') {
    showMessage(info.status === 'pending'
      ? '아직 토론이 시작되지 않았어요. 잠시 후 다시 확인해주세요!'
      : '토론이 종료되었어요. 수고하셨습니다! 🌟');
    return;
  }

  /* 3. 앱 표시 */
  document.getElementById('app').style.display = 'flex';

  /* ── 내 정보 렌더 ── */
  var isPro = info.side === 'pro';
  document.getElementById('sbAv').innerHTML = avHTML(info.nickname, 36);
  document.getElementById('sbName').textContent = info.nickname;
  document.getElementById('sbStance').textContent = isPro ? '🔵 찬성' : '🔴 반대';
  document.getElementById('wpAv').innerHTML = avHTML(info.nickname, 32);
  document.getElementById('wpName').textContent = info.nickname;
  document.getElementById('wpStance').textContent = isPro ? '🔵 강찬성' : '🔴 강반대';

  /* ── 논제 ── */
  var title = info.title || '오늘의 토론 주제';
  document.getElementById('debate-title').textContent = '"' + title + '"';

  /* ── 읽기전용 처리 (architect/agendasetter) ── */
  var isReadonly = info.role !== 'participant';
  if (isReadonly) {
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('submitBtn').textContent = '관전 모드';
    document.getElementById('claimInput').disabled = true;
    document.getElementById('evInput').disabled = true;
  }

  /* ── 실시간 payload 감시 ── */
  info.onPayloadsChange(function(payloads) {
    allPayloads = payloads || {};
    renderFeeds();
    updateStats();
  });

  /* ── 시뮬레이션: 참여자 라이브 목록 ── */
  startLiveSim(Object.keys(allPayloads));

  /* ── 진입 알림 (0.75초 후) ── */
  setTimeout(function() { fireEntryNotif(); }, 750);
});

/* ── SHOW MESSAGE ── */
function showMessage(text) {
  document.getElementById('message').textContent = text;
  document.getElementById('message').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

/* ── STATS UPDATE ── */
function updateStats() {
  var pro = 0, con = 0;
  Object.keys(allPayloads).forEach(function(nick) {
    var p = allPayloads[nick];
    if (!p || !p.opinions || !p.opinions.length) return;
    var side = p.opinions[0].side || 'pro';
    if (side === 'pro') pro++; else con++;
  });
  document.getElementById('proCnt').textContent = '🔵 찬성 ' + pro + '명';
  document.getElementById('conCnt').textContent = '🔴 반대 ' + con + '명';
}

/* ── RENDER FEEDS ── */
function renderFeeds() {
  var proFeed = document.getElementById('proFeed');
  var conFeed = document.getElementById('conFeed');
  proFeed.innerHTML = '';
  conFeed.innerHTML = '';
  var proCount = 0, conCount = 0;

  /* 알림 배너 — 첫 번째 반대 의견 제출자 */
  var bannerNick = null;
  Object.keys(allPayloads).forEach(function(nick) {
    if (!bannerNick && nick !== (myInfo && myInfo.nickname)) bannerNick = nick;
  });
  if (bannerNick) {
    var banner = makeBanner(bannerNick);
    conFeed.appendChild(banner);
  }

  /* 카드 렌더 */
  Object.keys(allPayloads).forEach(function(nick) {
    var payload = allPayloads[nick];
    if (!payload || !payload.opinions || !payload.opinions.length) return;
    var opinion = payload.opinions[0]; // 첫 번째 주장 = 핵심 카드
    var side = opinion.side || 'pro';
    var isPro = side === 'pro';
    var card = makeCard(nick, opinion, isPro);
    if (isPro) { proFeed.appendChild(card); proCount++; }
    else { conFeed.appendChild(card); conCount++; }
  });

  /* 빈 상태 */
  if (proCount === 0) proFeed.innerHTML += '<div class="es"><div class="es-em">💬</div><div class="es-t">아직 찬성 주장이 없어요</div><div class="es-s">첫 번째 찬성 주장을<br>올려봐요!</div></div>';
  if (conCount === 0) conFeed.innerHTML += '<div class="es"><div class="es-em">💬</div><div class="es-t">아직 반대 주장이 없어요</div><div class="es-s">첫 번째 반대 주장을<br>올려봐요!</div></div>';

  document.getElementById('proCount').textContent = proCount;
  document.getElementById('conCount').textContent = conCount;

  /* 랭킹 업데이트 */
  renderRanking();
}

/* ── MAKE BANNER ── */
function makeBanner(nick) {
  var div = document.createElement('div');
  div.className = 'notif-banner';
  div.innerHTML = avHTML(nick, 42) +
    '<div style="flex:1"><div class="nb-name">' + esc(nick) + '님이 대화를 요청했어요 💌</div>' +
    '<div class="nb-msg">탭해서 바로 1:1 대화 시작</div></div>' +
    '<div class="nb-heart">💗</div>';
  div.onclick = function() { openChatWith(nick); };
  return div;
}

/* ── MAKE CARD ── */
function makeCard(nick, opinion, isPro) {
  var col = isPro ? 'var(--pro)' : 'var(--con)';
  var bg = isPro ? '#e0eaff' : '#ffe0e8';
  var gc = isPro ? 'rgba(37,99,235,.5)' : 'rgba(244,63,94,.5)';
  var lbl = isPro ? '👍 찬성' : '👎 반대';
  var likes = likedNicks[nick] || 0;
  var photo = getPhoto(nick);
  var emoji = em(nick);

  var photoEl = photo
    ? '<img src="' + photo + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" ' +
      'onerror="this.style.display=\'none\'">'
    : '<div class="tc-bg-em">' + emoji + '</div><div class="tc-em">' + emoji + '</div>';

  var claimText = opinion.text
    ? (opinion.text.length > 20 ? opinion.text.slice(0, 20) : opinion.text)
    : '주장 없음';

  /* rebuttals from other opinions in payload */
  var payload = allPayloads[nick] || {};
  var rebHtml = '';
  if (payload.opinions && payload.opinions.length > 1) {
    rebHtml = '<div class="tc-rebs"><div class="tc-reb-lbl">💬 반론 ' + (payload.opinions.length - 1) + '개</div>';
    payload.opinions.slice(1, 3).forEach(function(op) {
      rebHtml += '<div class="tc-reb-item">' + avHTML(nick, 22) +
        '<div class="tri-bub">' + esc(op.text.slice(0, 40)) + '</div></div>';
    });
    rebHtml += '</div>';
  }

  var div = document.createElement('div');
  div.className = 'tcard ' + (isPro ? 'pro-card' : 'con-card');
  div.innerHTML =
    '<div class="tc-photo" style="background:' + bg + '" onclick="openChatWith(\'' + esc(nick) + '\')">' +
      photoEl +
      '<div class="tc-grad" style="background:linear-gradient(to top,' + bg + ' 0%,' + gc + ' 40%,transparent 100%)"></div>' +
      '<div class="tc-over">' +
        '<div class="tc-name">' + esc(nick) + ' <span class="tc-bdg">' + lbl + '</span></div>' +
        '<div class="tc-stance-txt">' + (isPro ? '🔵 찬성' : '🔴 반대') + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="tc-body">' +
      '<div class="tc-claim" style="border-left-color:' + col + '">"' + esc(claimText) + '"</div>' +
      '<div class="tc-meta">' +
        '<div class="sp sp-l" id="likes-' + nick + '">❤️ ' + likes + '</div>' +
      '</div>' +
    '</div>' +
    rebHtml +
    '<div class="tc-like-row"><button class="tc-like" id="likeBtn-' + nick + '" onclick="quickLike(\'' + nick + '\')" style="border:none">❤️ 좋아요</button></div>' +
    '<div class="tc-chat-btn ' + (isPro ? 'pro-btn' : 'con-btn') + '" onclick="openChatWith(\'' + esc(nick) + '\')">' +
      '💬 1:1 대화 신청' +
    '</div>';
  return div;
}

/* ── LIKE ── */
function quickLike(nick) {
  likedNicks[nick] = (likedNicks[nick] || 0) + 1;
  var el = document.getElementById('likes-' + nick);
  if (el) el.textContent = '❤️ ' + likedNicks[nick];
  var btn = document.getElementById('likeBtn-' + nick);
  if (btn) { btn.textContent = '❤️ ' + likedNicks[nick]; btn.classList.add('liked'); }
}

/* ── RANKING ── */
function renderRanking() {
  var data = Object.keys(likedNicks)
    .map(function(n) { return { nick: n, wins: likedNicks[n] }; })
    .sort(function(a, b) { return b.wins - a.wins; })
    .slice(0, 5);
  var medals = ['🥇', '🥈', '🥉', '4위', '5위'];
  var rl = document.getElementById('rankList');
  if (data.length === 0) {
    rl.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 0">아직 좋아요가 없어요!</div>';
    return;
  }
  rl.innerHTML = '';
  data.forEach(function(d, i) {
    var div = document.createElement('div');
    div.className = 'rrow';
    div.innerHTML = '<div class="rn">' + medals[i] + '</div>' + avHTML(d.nick, 22) +
      '<div style="flex:1;min-width:0"><div class="r-name">' + esc(d.nick) + '</div>' +
      '<div class="r-wins">' + d.wins + '회 좋아요</div></div>';
    rl.appendChild(div);
  });
}

/* ── LIVE SIM ── */
var liveStarted = false;
function startLiveSim(existingNicks) {
  if (liveStarted) return;
  liveStarted = true;
  var ll = document.getElementById('liveList');
  ll.innerHTML = '';
  existingNicks.slice(0, 8).forEach(function(n) { addLiveUser(n, false); });
  var remaining = Object.keys(NICK_EMS).filter(function(n) { return existingNicks.indexOf(n) < 0; });
  var idx = 0;
  var iv = setInterval(function() {
    if (idx >= remaining.length) { clearInterval(iv); return; }
    addLiveUser(remaining[idx], true);
    showJoinToast(remaining[idx]);
    idx++;
  }, 4000);
}

function addLiveUser(nick, animated) {
  var ll = document.getElementById('liveList');
  var div = document.createElement('div');
  div.className = 'live-item';
  div.innerHTML = avHTML(nick, 22) + '<div class="li-name">' + esc(nick) + '</div><div class="li-green"></div>';
  ll.insertBefore(div, ll.firstChild);
  if (ll.children.length > 7) ll.removeChild(ll.lastChild);
}

function showJoinToast(nick) {
  document.getElementById('joinText').textContent = nick + '님이 참여했어요! 🎉';
  var jt = document.getElementById('joinToast');
  jt.classList.add('show');
  setTimeout(function() { jt.classList.remove('show'); }, 2800);
}

/* ── ENTRY NOTIF ── */
function fireEntryNotif() {
  var nicks = Object.keys(allPayloads).filter(function(n) { return n !== (myInfo && myInfo.nickname); });
  if (!nicks.length) return;
  var nick = nicks[0];
  pendingChatNick = nick;
  document.getElementById('tAv').innerHTML = avHTML(nick, 36);
  document.getElementById('tName').textContent = nick + '님이 1:1 대화를 요청했어요 💌';
  var t = document.getElementById('toast');
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 6000);
}

function openToastChat() {
  document.getElementById('toast').classList.remove('show');
  if (pendingChatNick) openChatWith(pendingChatNick);
}

/* ── TABS ── */
function switchTab(tab) {
  var home = document.getElementById('homeView');
  var mc = document.getElementById('mychats-view');
  var ch = document.querySelector('.col-headers');
  home.style.display = tab === 'home' ? 'flex' : 'none';
  mc.style.display = tab === 'mychats' ? 'block' : 'none';
  if (ch) ch.style.display = tab === 'home' ? 'flex' : 'none';
  ['home', 'mychats'].forEach(function(t) {
    var el = document.getElementById('nav-' + t);
    if (el) el.classList.toggle('on', t === tab);
  });
  if (tab === 'mychats') renderMychats();
}

function switchRTab(tab) {
  document.getElementById('rp-write').style.display = tab === 'write' ? 'block' : 'none';
  document.getElementById('rp-watch').style.display = tab === 'watch' ? 'block' : 'none';
  ['write', 'watch'].forEach(function(t) {
    var el = document.getElementById('rpt-' + t);
    if (el) el.classList.toggle('on', t === tab);
  });
  if (tab === 'watch') renderWatchPanel();
}

/* ── MY CHATS ── */
function renderMychats() {
  var mc = document.getElementById('mychats-view');
  mc.innerHTML = '<div style="padding:14px">';
  var nicks = Object.keys(localChats);
  var html = '<div class="sec-title">💌 내 1:1 대화</div>';
  if (!nicks.length) {
    html += '<div class="es"><div class="es-em">💌</div><div class="es-t">아직 대화가 없어요</div><div class="es-s">홈에서 카드를 클릭하면<br>바로 1:1 대화가 시작돼요!</div></div>';
  } else {
    nicks.forEach(function(nick) {
      var msgs = localChats[nick];
      var last = msgs[msgs.length - 1] || {};
      html += '<div class="ci" onclick="openChatWith(\'' + esc(nick) + '\')">' +
        avHTML(nick, 38) +
        '<div style="flex:1;min-width:0"><div class="ci-name">' + esc(nick) + '</div>' +
        '<div class="ci-last">' + esc((last.text || '').slice(0, 30)) + '</div></div>' +
        '</div>';
    });
  }
  mc.innerHTML = '<div style="padding:14px">' + html + '</div>';
}

/* ── WATCH PANEL ── */
function renderWatchPanel() {
  var wp = document.getElementById('watchPanel');
  var nicks = Object.keys(localChats);
  if (!nicks.length) {
    wp.innerHTML = '<div class="es"><div class="es-em">👀</div><div class="es-t">아직 공개 대화가 없어요</div></div>';
    return;
  }
  wp.innerHTML = '';
  nicks.forEach(function(nick) {
    var msgs = localChats[nick];
    var last = msgs[msgs.length - 1] || {};
    var div = document.createElement('div');
    div.className = 'ci';
    div.innerHTML = avHTML(nick, 38) +
      '<div style="flex:1;min-width:0"><div class="ci-name">' + esc(nick) + '</div>' +
      '<div class="ci-last">' + esc((last.text || '').slice(0, 30)) + '</div></div>';
    div.onclick = function() { openChatWith(nick, true); };
    wp.appendChild(div);
  });
}

/* ── CHAT ── */
function openChatWith(nick, watchOnly) {
  pendingChatNick = nick;
  var payload = allPayloads[nick] || {};
  var opinions = payload.opinions || [];
  var isPro = opinions.length && opinions[0].side === 'pro';
  var bg = isPro ? '#e0eaff' : '#ffe0e8';
  var gc = isPro ? 'rgba(37,99,235,.5)' : 'rgba(244,63,94,.5)';

  /* photo header setup */
  document.getElementById('cmPhoto').style.background = bg;
  document.getElementById('cmPhotoGrad').style.background =
    'linear-gradient(to top,' + bg + ',' + gc + ' 50%,transparent)';
  document.getElementById('cmPhotoBg').innerHTML =
    '<div style="font-size:90px;opacity:.07">' + em(nick) + '</div>';
  var photo = getPhoto(nick);
  var imgEl = document.getElementById('cmPhotoImg');
  if (photo) {
    imgEl.style.cssText = 'display:block;background-image:url(' + photo + ');';
    document.getElementById('cmPhotoEm').style.display = 'none';
  } else {
    imgEl.style.display = 'none';
    document.getElementById('cmPhotoEm').textContent = em(nick);
    document.getElementById('cmPhotoEm').style.display = 'block';
  }
  document.getElementById('cmName').textContent = nick;
  document.getElementById('cmSub').textContent = (isPro ? '강찬성' : '강반대') + ' · ' + nick;
  document.getElementById('cmBadge').textContent = watchOnly ? '👀 관전중' : '💬 1:1 대화';

  /* show/hide eval & bar */
  document.getElementById('cmEval').style.display = watchOnly ? 'none' : '';
  document.getElementById('cmBar').style.display = watchOnly ? 'none' : '';

  /* load messages */
  var box = document.getElementById('cmMsgs');
  box.innerHTML = '';
  var sysdiv = document.createElement('div');
  sysdiv.className = 'sys-msg';
  sysdiv.innerHTML = '<span class="sys-text">' + (watchOnly ? '👀 관전 중' : '🔒 익명 1:1 대화 · 24시간') + '</span>';
  box.appendChild(sysdiv);

  /* init local chat if new */
  if (!localChats[nick]) {
    var initText = opinions.length
      ? opinions[0].text
      : '안녕하세요! 제 생각을 들어봐 주실 수 있나요? 😊';
    localChats[nick] = [{ me: false, text: initText }];
  }
  localChats[nick].forEach(function(m) { appendBubble(box, m.me, m.text, nick); });
  box.scrollTop = box.scrollHeight;

  document.getElementById('chatModal').classList.add('open');
}

function appendBubble(box, isMe, text, nick) {
  var d = document.createElement('div');
  d.className = 'msg' + (isMe ? ' me' : '');
  if (isMe) {
    d.innerHTML = '<div class="msg-t">' + nowStr() + '</div>' +
      '<div class="bub">' + esc(text) + '</div>' +
      avHTML(myInfo ? myInfo.nickname : '나', 27);
  } else {
    d.innerHTML = avHTML(nick, 27) +
      '<div><div class="msg-na">' + esc(nick) + '</div>' +
      '<div class="bub">' + esc(text) + '</div></div>' +
      '<div class="msg-t">' + nowStr() + '</div>';
  }
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function sendChatMsg() {
  var inp = document.getElementById('cmInp');
  var text = inp.value.trim();
  if (!text) return;
  var nick = document.getElementById('cmName').textContent;
  if (!localChats[nick]) localChats[nick] = [];
  localChats[nick].push({ me: true, text: text });
  var box = document.getElementById('cmMsgs');
  appendBubble(box, true, text, nick);
  inp.value = ''; inp.focus();
  setTimeout(function() {
    var r = REPLIES[replyIdx++ % REPLIES.length];
    localChats[nick].push({ me: false, text: r });
    appendBubble(box, false, r, nick);
  }, 900);
}

document.getElementById('cmInp').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMsg(); }
});

function closeChat() {
  document.getElementById('chatModal').classList.remove('open');
}

function onModalBgClick(e) {
  if (e.target === document.getElementById('chatModal')) closeChat();
}

function markConvinced() {
  document.getElementById('convModal').classList.add('open');
}

/* ── WRITE / SUBMIT ── */
function onClaimKey(inp) {
  var l = inp.value.length;
  document.getElementById('cc1').textContent = l + '/20자';
  var w = document.getElementById('cw1');
  w.textContent = l >= 17 ? (20 - l) + '자 남았어요' : '';
  w.className = 'cw' + (l >= 17 ? ' over' : '');
}
function onEvKey(ta) {
  var l = ta.value.length;
  document.getElementById('cc2').textContent = l + '/300자';
  var w = document.getElementById('cw2');
  w.textContent = l >= 270 ? (300 - l) + '자 남았어요' : '';
  w.className = 'cw' + (l >= 270 ? ' over' : '');
}

function submitClaim() {
  if (!myInfo) return;
  var claim = document.getElementById('claimInput').value.trim();
  var ev = document.getElementById('evInput').value.trim();
  if (!claim) { alert('핵심 주장을 입력해주세요!'); return; }
  var btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = '올리는 중...';

  /* 기존 의견 불러와서 덧붙이기 */
  myInfo.loadPayloads().then(function(payloads) {
    var myPayload = payloads[myInfo.nickname] || {};
    var existing = myPayload.opinions || [];
    var newOp = { text: claim, side: myInfo.side, evidence: ev, timestamp: Date.now() };
    var updated = [newOp].concat(existing);
    return myInfo.savePayload({ opinions: updated });
  }).then(function() {
    btn.disabled = false; btn.textContent = '주장 올리기 💘';
    document.getElementById('claimInput').value = '';
    document.getElementById('evInput').value = '';
    document.getElementById('cc1').textContent = '0/20자';
    document.getElementById('cc2').textContent = '0/300자';
    /* 바로 알림 띄우기 */
    setTimeout(function() { fireEntryNotif(); }, 600);
  }).catch(function() {
    btn.disabled = false; btn.textContent = '주장 올리기 💘';
    alert('저장에 실패했어요. 다시 시도해주세요.');
  });
}
