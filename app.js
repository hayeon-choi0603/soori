/**
 * 실시간 토론 — app.js
 * debate-core.js는 유지하고, payload만으로 매칭과 의견 저장을 처리합니다.
 *
 * 이번 버전 추가점:
 *  - 플랫폼이 넘겨준 찬/반(side)을 유지
 *  - 사용자가 강경도(강경/중간/유연)를 직접 선택
 *  - 반대 진영이면서 강경도가 다른 상대와만 자동 매칭
 *  - 매칭 경쟁 중 생긴 일시적인 엇갈림을 클라이언트에서 정리
 */

var DEBATE_START_HOUR = 18;
var DEBATE_END_HOUR = 19;

var CELEB_POOL = [
  "아이유", "RM", "박서준", "손예진", "공유",
  "김태리", "이준호", "수지", "현빈", "박보검",
  "전지현", "송강", "한소희", "차은우", "이영애",
  "김수현", "고윤정", "변우석", "정호연", "류준열",
  "김고은", "최우식", "박은빈", "위하준", "신민아",
  "주지훈", "이세영", "옹성우", "박지현", "남주혁"
];

var STANCE_OPTIONS = [
  { key: "hard", label: "강경", score: 3 },
  { key: "middle", label: "중간", score: 2 },
  { key: "soft", label: "유연", score: 1 }
];

var myInfo = null;
var myCelebName = "";
var myMatchKey = null;
var currentPayloads = {};
var selectedStance = "";
var debateEndTime = null;
var timerInterval = null;
var countdownInterval = null;
var modalSetup = false;
var profileSetup = false;

function getCelebName(nickname) {
  var hash = 0;
  for (var i = 0; i < nickname.length; i++) {
    hash = (hash * 31 + nickname.charCodeAt(i)) & 0xffffffff;
  }
  return CELEB_POOL[Math.abs(hash) % CELEB_POOL.length];
}

function getKSTDate() {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

function getKSTHour() {
  return getKSTDate().getUTCHours();
}

function getSessionKey() {
  var kst = getKSTDate();
  return kst.getUTCFullYear() + "-" + pad(kst.getUTCMonth() + 1) + "-" + pad(kst.getUTCDate());
}

function isDebateOpen() {
  var hour = getKSTHour();
  return hour >= DEBATE_START_HOUR && hour < DEBATE_END_HOUR;
}

function getNextDebateStart() {
  var kst = getKSTDate();
  var hour = kst.getUTCHours();

  if (hour < DEBATE_START_HOUR) {
    kst.setUTCHours(DEBATE_START_HOUR, 0, 0, 0);
  } else {
    kst.setUTCDate(kst.getUTCDate() + 1);
    kst.setUTCHours(DEBATE_START_HOUR, 0, 0, 0);
  }

  return new Date(kst.getTime() - 9 * 3600 * 1000);
}

function getTodayDebateEnd() {
  var kst = getKSTDate();
  kst.setUTCHours(DEBATE_END_HOUR, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 3600 * 1000);
}

function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

function formatDuration(ms) {
  if (ms <= 0) return "00:00";
  var totalSeconds = Math.floor(ms / 1000);
  var minutes = Math.floor(totalSeconds / 60);
  var seconds = totalSeconds % 60;
  return pad(minutes) + ":" + pad(seconds);
}

function formatCountdown(ms) {
  if (ms <= 0) return "00:00:00";
  var totalSeconds = Math.floor(ms / 1000);
  var hours = Math.floor(totalSeconds / 3600);
  var minutes = Math.floor((totalSeconds % 3600) / 60);
  var seconds = totalSeconds % 60;
  return pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
}

function getStanceMeta(key) {
  for (var i = 0; i < STANCE_OPTIONS.length; i++) {
    if (STANCE_OPTIONS[i].key === key) {
      return STANCE_OPTIONS[i];
    }
  }
  return null;
}

function getStanceScore(key) {
  var meta = getStanceMeta(key);
  return meta ? meta.score : 0;
}

function getSideLabel(side) {
  return side === "pro" ? "찬성" : "반대";
}

function getCurrentPayload(payloads, nickname) {
  var payload = payloads && payloads[nickname];
  if (!payload || payload.sessionKey !== getSessionKey()) {
    return null;
  }
  return payload;
}

function buildEmptyPayload(side) {
  return {
    sessionKey: getSessionKey(),
    celebName: myCelebName,
    side: side,
    stance: null,
    matchKey: null,
    opinions: [],
    joinedAt: Date.now()
  };
}

function saveMergedPayload(info, currentPayload, updates) {
  var base = currentPayload && currentPayload.sessionKey === getSessionKey()
    ? currentPayload
    : buildEmptyPayload(info.side);

  var next = {
    sessionKey: getSessionKey(),
    celebName: Object.prototype.hasOwnProperty.call(updates, "celebName") ? updates.celebName : (base.celebName || myCelebName),
    side: Object.prototype.hasOwnProperty.call(updates, "side") ? updates.side : (base.side || info.side),
    stance: Object.prototype.hasOwnProperty.call(updates, "stance") ? updates.stance : (base.stance || null),
    matchKey: Object.prototype.hasOwnProperty.call(updates, "matchKey") ? updates.matchKey : (base.matchKey || null),
    opinions: Object.prototype.hasOwnProperty.call(updates, "opinions") ? updates.opinions : (base.opinions || []),
    joinedAt: base.joinedAt || Date.now()
  };

  return info.savePayload(next);
}

function resetBadge(el, variants) {
  if (!el) return;
  variants.forEach(function (name) {
    el.classList.remove(name);
  });
}

function applySideBadge(el, side) {
  if (!el) return;
  resetBadge(el, ["pro", "con"]);
  el.textContent = getSideLabel(side);
  el.classList.add(side);
}

function applyStanceBadge(el, stance) {
  if (!el) return;
  var meta = getStanceMeta(stance);
  resetBadge(el, ["hard", "middle", "soft"]);
  el.textContent = meta ? meta.label : "강경도 선택 전";
  if (meta) {
    el.classList.add(meta.key);
  }
}

function showMessage(text) {
  document.getElementById("message-text").textContent = text;
  document.getElementById("message").style.display = "flex";
  document.getElementById("waiting-screen").style.display = "none";
  document.getElementById("profile-screen").style.display = "none";
  document.getElementById("matching-screen").style.display = "none";
  document.getElementById("app").style.display = "none";
}

function showWaiting() {
  document.getElementById("message").style.display = "none";
  document.getElementById("waiting-screen").style.display = "flex";
  document.getElementById("profile-screen").style.display = "none";
  document.getElementById("matching-screen").style.display = "none";
  document.getElementById("app").style.display = "none";

  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  function tick() {
    var diff = getNextDebateStart() - Date.now();
    document.getElementById("countdown-display").textContent = formatCountdown(diff);
    if (diff <= 0) {
      clearInterval(countdownInterval);
      location.reload();
    }
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

function showProfileSelection(side, stance) {
  document.getElementById("message").style.display = "none";
  document.getElementById("waiting-screen").style.display = "none";
  document.getElementById("profile-screen").style.display = "flex";
  document.getElementById("matching-screen").style.display = "none";
  document.getElementById("app").style.display = "none";

  document.getElementById("profile-celeb-name").textContent = myCelebName;
  applySideBadge(document.getElementById("profile-side-badge"), side);
  updateStanceSelection(stance || "");
}

function showMatching(side, stance) {
  document.getElementById("message").style.display = "none";
  document.getElementById("waiting-screen").style.display = "none";
  document.getElementById("profile-screen").style.display = "none";
  document.getElementById("matching-screen").style.display = "flex";
  document.getElementById("app").style.display = "none";

  document.getElementById("my-celeb-name").textContent = myCelebName;
  applySideBadge(document.getElementById("matching-side-badge"), side);
  applyStanceBadge(document.getElementById("matching-stance-badge"), stance);
}

function showApp() {
  document.getElementById("message").style.display = "none";
  document.getElementById("waiting-screen").style.display = "none";
  document.getElementById("profile-screen").style.display = "none";
  document.getElementById("matching-screen").style.display = "none";
  document.getElementById("app").style.display = "block";
}

function updateStanceSelection(stance) {
  selectedStance = stance || "";

  var buttons = document.querySelectorAll(".stance-option");
  Array.prototype.forEach.call(buttons, function (button) {
    var active = button.getAttribute("data-stance") === selectedStance;
    button.classList.toggle("is-selected", active);
  });

  document.getElementById("start-matching-btn").disabled = !selectedStance;
}

function updateIdentity(payload) {
  document.getElementById("nickname").textContent = myCelebName;
  document.getElementById("modal-nickname").textContent = myCelebName;
  applySideBadge(document.getElementById("side-badge"), payload.side || myInfo.side);
  applySideBadge(document.getElementById("modal-side-badge"), payload.side || myInfo.side);
  applyStanceBadge(document.getElementById("stance-badge"), payload.stance);
  applyStanceBadge(document.getElementById("modal-stance-badge"), payload.stance);
}

function startTimer() {
  debateEndTime = getTodayDebateEnd();

  if (timerInterval) {
    clearInterval(timerInterval);
  }

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
  document.getElementById("modal-overlay").style.display = "none";
}

function buildMatchKey(proNick, conNick) {
  return proNick + "::" + conNick;
}

function getOpponentNick(matchKey, myNick) {
  if (!matchKey) return "";
  var parts = matchKey.split("::");
  if (parts[0] === myNick) return parts[1];
  if (parts[1] === myNick) return parts[0];
  return "";
}

function resolveOwnMatchKey(payloads, myNick, myPayload) {
  if (!myPayload || !myPayload.matchKey) {
    return null;
  }

  var opponentNick = getOpponentNick(myPayload.matchKey, myNick);
  if (!opponentNick) {
    return null;
  }

  var opponentPayload = getCurrentPayload(payloads, opponentNick);
  if (!opponentPayload) {
    return null;
  }

  if (!opponentPayload.matchKey || opponentPayload.matchKey === myPayload.matchKey) {
    return myPayload.matchKey;
  }

  return null;
}

function findExistingMatchForMe(payloads, myNick) {
  var nicknames = Object.keys(payloads || {});

  for (var i = 0; i < nicknames.length; i++) {
    var nickname = nicknames[i];
    if (nickname === myNick) continue;

    var payload = getCurrentPayload(payloads, nickname);
    if (!payload || !payload.matchKey) continue;

    var parts = payload.matchKey.split("::");
    if (parts[0] === myNick || parts[1] === myNick) {
      return payload.matchKey;
    }
  }

  return null;
}

function compareCandidates(aNick, bNick, payloads, myStance) {
  var a = getCurrentPayload(payloads, aNick);
  var b = getCurrentPayload(payloads, bNick);
  var aGap = Math.abs(getStanceScore(a.stance) - getStanceScore(myStance));
  var bGap = Math.abs(getStanceScore(b.stance) - getStanceScore(myStance));

  if (aGap !== bGap) {
    return bGap - aGap;
  }

  if ((a.joinedAt || 0) !== (b.joinedAt || 0)) {
    return (a.joinedAt || 0) - (b.joinedAt || 0);
  }

  return aNick.localeCompare(bNick);
}

function tryMatch(payloads, myNick, mySide, myStance) {
  if (!myStance) {
    return null;
  }

  var oppSide = mySide === "pro" ? "con" : "pro";
  var nicknames = Object.keys(payloads || {});
  var candidates = nicknames.filter(function (nickname) {
    if (nickname === myNick) return false;

    var payload = getCurrentPayload(payloads, nickname);
    if (!payload) return false;

    return payload.side === oppSide &&
      !!payload.stance &&
      payload.stance !== myStance &&
      !payload.matchKey;
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort(function (aNick, bNick) {
    return compareCandidates(aNick, bNick, payloads, myStance);
  });

  var opponent = candidates[0];
  var proNick = mySide === "pro" ? myNick : opponent;
  var conNick = mySide === "con" ? myNick : opponent;

  return buildMatchKey(proNick, conNick);
}

function renderOpinions(payloads) {
  if (!myMatchKey) return;

  var parts = myMatchKey.split("::");
  var proNick = parts[0];
  var conNick = parts[1];
  var proOpinions = [];
  var conOpinions = [];

  [proNick, conNick].forEach(function (nickname) {
    var payload = getCurrentPayload(payloads, nickname);
    if (!payload || !payload.opinions) return;

    payload.opinions.forEach(function (opinion) {
      var item = {
        celebName: payload.celebName || nickname,
        stance: payload.stance,
        text: opinion.text,
        timestamp: opinion.timestamp
      };

      if (payload.side === "pro") {
        proOpinions.push(item);
      } else {
        conOpinions.push(item);
      }
    });
  });

  proOpinions.sort(function (a, b) { return a.timestamp - b.timestamp; });
  conOpinions.sort(function (a, b) { return a.timestamp - b.timestamp; });

  renderList("pro-list", proOpinions);
  renderList("con-list", conOpinions);

  var opponentNick = myInfo.side === "pro" ? conNick : proNick;
  var opponentPayload = getCurrentPayload(payloads, opponentNick);
  if (opponentPayload) {
    document.getElementById("opponent-name").textContent = opponentPayload.celebName || opponentNick;
    document.getElementById("opponent-stance").textContent = getStanceMeta(opponentPayload.stance)
      ? getStanceMeta(opponentPayload.stance).label
      : "";
  }
}

function renderList(listId, opinions) {
  var el = document.getElementById(listId);

  if (opinions.length === 0) {
    el.innerHTML = '<p class="empty-text">아직 없습니다</p>';
    return;
  }

  el.innerHTML = opinions.map(function (item) {
    var stanceMeta = getStanceMeta(item.stance);
    var metaText = item.celebName + (stanceMeta ? " · " + stanceMeta.label : "");

    return (
      '<div class="opinion-card">' +
      '<div class="opinion-meta">' + escapeHtml(metaText) + '</div>' +
      '<p class="opinion-text">' + escapeHtml(item.text) + '</p>' +
      '</div>'
    );
  }).join("");
}

function escapeHtml(text) {
  var div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function setupProfileHandlers(info) {
  if (profileSetup) return;
  profileSetup = true;

  var buttons = document.querySelectorAll(".stance-option");
  Array.prototype.forEach.call(buttons, function (button) {
    button.addEventListener("click", function () {
      updateStanceSelection(button.getAttribute("data-stance"));
    });
  });

  document.getElementById("start-matching-btn").addEventListener("click", function () {
    if (!selectedStance) return;

    var currentPayload = getCurrentPayload(currentPayloads, info.nickname);
    var startButton = document.getElementById("start-matching-btn");
    startButton.disabled = true;

    saveMergedPayload(info, currentPayload, {
      celebName: myCelebName,
      side: info.side,
      stance: selectedStance,
      matchKey: null
    }).then(function () {
      showMatching(info.side, selectedStance);
    }).catch(function () {
      startButton.disabled = false;
    });
  });
}

function setupModalHandlers(info) {
  if (modalSetup) return;
  modalSetup = true;

  var openBtn = document.getElementById("open-modal-btn");
  var overlay = document.getElementById("modal-overlay");
  var closeBtn = document.getElementById("close-modal-btn");
  var input = document.getElementById("opinion-input");
  var submitBtn = document.getElementById("submit-btn");

  openBtn.style.display = "block";

  openBtn.addEventListener("click", function () {
    if (debateEndTime && Date.now() >= debateEndTime.getTime()) {
      endDebate();
      return;
    }
    overlay.style.display = "flex";
    input.focus();
  });

  closeBtn.addEventListener("click", function () {
    overlay.style.display = "none";
  });

  overlay.addEventListener("click", function (event) {
    if (event.target === overlay) {
      overlay.style.display = "none";
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      overlay.style.display = "none";
    }
  });

  submitBtn.addEventListener("click", function () {
    if (debateEndTime && Date.now() >= debateEndTime.getTime()) {
      endDebate();
      overlay.style.display = "none";
      return;
    }

    var text = input.value.trim();
    if (!text) return;

    var currentPayload = getCurrentPayload(currentPayloads, info.nickname) || buildEmptyPayload(info.side);
    var opinions = (currentPayload.opinions || []).slice();

    opinions.push({
      text: text,
      timestamp: Date.now()
    });

    submitBtn.disabled = true;

    saveMergedPayload(info, currentPayload, {
      opinions: opinions,
      matchKey: myMatchKey,
      stance: currentPayload.stance || selectedStance
    }).then(function () {
      input.value = "";
      submitBtn.disabled = false;
      overlay.style.display = "none";
    }).catch(function () {
      submitBtn.disabled = false;
    });
  });
}

window.DebateCore.onReady(function (info) {
  myInfo = info;

  if (!info.nickname) {
    showMessage("토론 플랫폼을 통해 다시 접속하세요.");
    return;
  }

  myCelebName = getCelebName(info.nickname);

  if (info.status === "pending") {
    showWaiting();
    return;
  }

  if (info.status !== "active") {
    showMessage("토론이 종료되었습니다.");
    return;
  }

  if (!isDebateOpen()) {
    showWaiting();
    return;
  }

  if (info.role !== "participant") {
    showMessage("이번 화면은 참여자만 매칭할 수 있습니다.");
    return;
  }

  document.getElementById("debate-title").textContent = info.title || "(제목 없음)";
  document.getElementById("nickname").textContent = myCelebName;
  document.getElementById("modal-nickname").textContent = myCelebName;

  setupProfileHandlers(info);

  info.onPayloadsChange(function (payloads) {
    currentPayloads = payloads || {};

    var myPayload = getCurrentPayload(payloads, info.nickname);

    if (!myPayload || !myPayload.celebName) {
      saveMergedPayload(info, myPayload, {
        celebName: myCelebName,
        side: info.side
      });

      showProfileSelection(info.side, "");
      return;
    }

    updateIdentity(myPayload);

    if (!myPayload.stance) {
      showProfileSelection(info.side, myPayload.stance);
      return;
    }

    var resolvedMatch = resolveOwnMatchKey(payloads, info.nickname, myPayload);
    if (!resolvedMatch) {
      resolvedMatch = findExistingMatchForMe(payloads, info.nickname);
    }

    if (!resolvedMatch) {
      if (myPayload.matchKey) {
        saveMergedPayload(info, myPayload, { matchKey: null });
      }

      var newMatch = tryMatch(payloads, info.nickname, info.side, myPayload.stance);
      if (newMatch) {
        myMatchKey = newMatch;
        saveMergedPayload(info, myPayload, { matchKey: newMatch });
        showApp();
        startTimer();
        setupModalHandlers(info);
        renderOpinions(payloads);
      } else {
        myMatchKey = null;
        showMatching(info.side, myPayload.stance);
      }
      return;
    }

    myMatchKey = resolvedMatch;

    if (myPayload.matchKey !== resolvedMatch) {
      saveMergedPayload(info, myPayload, { matchKey: resolvedMatch });
    }

    showApp();
    startTimer();
    setupModalHandlers(info);
    renderOpinions(payloads);
  });
});
