/**
 * 기본 토론 템플릿 — app.js
 * 자유롭게 수정할 수 있습니다.
 */

let allOpinions = [];
let myInfo = null;
let loadAllOpinions = null;

window.DebateCore.onReady(function (info) {
  myInfo = info;

  if (!info.nickname) {
    showMessage("토론 플랫폼을 통해 다시 접속하세요.");
    return;
  }

  if (info.status === "pending") {
    showMessage("토론이 아직 시작되지 않았습니다.");
    return;
  }

  var isReadonly = info.status !== "active";

  document.getElementById("app").style.display = "block";
  document.getElementById("debate-title").textContent = info.title || "(제목 없음)";
  document.getElementById("nickname").textContent = info.nickname;

  var sideBadge = document.getElementById("side-badge");
  sideBadge.textContent = info.side === "pro" ? "찬성" : "반대";
  sideBadge.classList.add(info.side);

  // 의견 불러오기
  loadAllOpinions = function () {
    info.loadPayloads().then(function (payloads) {
      allOpinions = [];
      Object.keys(payloads).forEach(function (nickname) {
        var payload = payloads[nickname];
        if (payload && payload.opinions) {
          payload.opinions.forEach(function (op) {
            allOpinions.push({ nickname: nickname, text: op.text, timestamp: op.timestamp });
          });
        }
      });
      allOpinions.sort(function (a, b) { return a.timestamp - b.timestamp; });
      renderOpinions();
    });
  };

  loadAllOpinions();

  if (info.role !== "participant" || isReadonly) return;

  // 모달
  var openModalBtn = document.getElementById("open-modal-btn");
  var overlay = document.getElementById("modal-overlay");
  var closeModalBtn = document.getElementById("close-modal-btn");
  var input = document.getElementById("opinion-input");
  var submitBtn = document.getElementById("submit-btn");

  openModalBtn.style.display = "block";

  openModalBtn.addEventListener("click", function () {
    overlay.style.display = "flex";
    input.focus();
  });

  closeModalBtn.addEventListener("click", function () { overlay.style.display = "none"; });
  overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.style.display = "none"; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") overlay.style.display = "none"; });

  submitBtn.addEventListener("click", function () {
    var text = input.value.trim();
    if (!text) return;
    submitBtn.disabled = true;

    var myOpinions = allOpinions
      .filter(function (o) { return o.nickname === info.nickname; })
      .map(function (o) { return { text: o.text, timestamp: o.timestamp }; });
    myOpinions.push({ text: text, side: info.side, timestamp: Date.now() });

    info.savePayload({ opinions: myOpinions }).then(function () {
      input.value = "";
      submitBtn.disabled = false;
      overlay.style.display = "none";
      loadAllOpinions();
    }).catch(function () {
      submitBtn.disabled = false;
    });
  });
});

function showMessage(text) {
  document.getElementById("message").textContent = text;
  document.getElementById("message").style.display = "flex";
  document.getElementById("app").style.display = "none";
}

function renderOpinions() {
  var list = document.getElementById("opinions-list");
  if (allOpinions.length === 0) {
    list.innerHTML = '<p class="empty-text">아직 제출된 의견이 없습니다.</p>';
    return;
  }
  list.innerHTML = allOpinions.map(function (o) {
    return (
      '<div class="opinion-card">' +
      '<div class="opinion-nickname">' + escapeHtml(o.nickname) + '<span class="opinion-side">' + (o.side === "pro" ? "찬성" : "반대") + '</span></div>' +
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
