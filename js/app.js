(function () {
  const state = {
    role: null,
    eventId: null,
    eventData: null,
    myVotes: new Set(),
    searchQuery: "",
    forceLyricsShown: null
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  function showScreen(id) {
    $$(".screen").forEach((el) => el.classList.remove("active"));
    const el = $("#" + id);
    if (el) el.classList.add("active");
  }

  function updateHeader() {
    const meta = $("#header-meta");
    if (!state.eventId) {
      meta.innerHTML = "";
      return;
    }
    const fb = window.USE_FIREBASE ? " · Firebase" : " · локально";
    meta.innerHTML = `<span class="badge">${state.eventId}</span>
      <span>${state.role === "stage" ? "🎤 Сцена" : "👥 Зал"}${fb}</span>`;
  }

  function initWelcome() {
    $("#btn-stage").onclick = startAsStage;
    $("#btn-audience").onclick = () => $("#join-form").classList.remove("hidden");
    $("#btn-join").onclick = joinAsAudience;
    $("#join-code").addEventListener("keydown", (e) => {
      if (e.key === "Enter") joinAsAudience();
    });
  }

  async function startAsStage() {
    try {
      const id = await Realtime.createEvent();
      state.role = "stage";
      state.eventId = id;
      state.eventData = await Realtime.joinEvent(id);
      updateHeader();
      showScreen("screen-main");
      renderMain();
      generateQR(id);
      Realtime.subscribe(onEventUpdate);
    } catch (e) {
      alert("Ошибка: " + e.message);
    }
  }

  async function joinAsAudience() {
    const code = ($("#join-code").value || "").trim();
    if (!/^\d{3}$/.test(code)) {
      alert("Введите 3-значный код");
      return;
    }
    try {
      state.role = "audience";
      state.eventId = code;
      state.eventData = await Realtime.joinEvent(code);
      updateHeader();
      showScreen("screen-main");
      renderMain();
      Realtime.subscribe(onEventUpdate);
    } catch (e) {
      alert(e.message || "Не удалось войти");
    }
  }

  function generateQR(code) {
    const box = $("#qrcode");
    if (!box) return;
    box.innerHTML = "";
    const url = location.origin + location.pathname + "?code=" + code;
    if (typeof QRCode !== "undefined") {
      new QRCode(box, {
        text: url,
        width: 140,
        height: 140,
        colorDark: "#0b1426",
        colorLight: "#ffffff"
      });
    }
    $("#event-code-big").textContent = code;
  }

  function onEventUpdate(data) {
    if (!data) return;
    state.eventData = data;
    if (data.forceLyrics && data.forceLyrics !== state.forceLyricsShown) {
      state.forceLyricsShown = data.forceLyrics;
      if (state.role === "audience") openLyricsModal(data.forceLyrics, true);
    }
    renderAll();
  }

  function renderMain() {
    const isStage = state.role === "stage";
    $("#view-stage").classList.toggle("hidden", !isStage);
    $("#view-audience").classList.toggle("hidden", isStage);
    if (isStage) generateQR(state.eventId);

    if (isStage) {
      $("#btn-stop-voting").onclick = stopVoting;
      $("#btn-sung").onclick = markSung;
      $("#btn-new-round").onclick = startNewRound;
      $("#search-input-stage").oninput = (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        renderSongListStage();
      };
      $("#btn-send-chat").onclick = () => sendChat("stage");
      $("#chat-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendChat("stage");
      });
    } else {
      $("#search-input").oninput = (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        renderSongListAudience();
      };
      $("#btn-send-chat-aud").onclick = () => sendChat("audience");
      $("#chat-input-aud").addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendChat("audience");
      });
    }
    renderAll();
  }

  function renderAll() {
    updateVotingStatus();
    renderResults();
    if (state.role === "stage") {
      renderSongListStage();
      renderStageLyrics();
      renderChat("#chat-messages");
    } else {
      renderSongListAudience();
      renderChat("#chat-messages-aud");
    }
  }

  function updateVotingStatus() {
    const open = state.eventData?.votingOpen !== false;
    const el = $("#voting-status");
    if (el) {
      el.textContent = open ? "🟢 Голосование открыто" : "🔴 Голосование остановлено";
      el.style.color = open ? "var(--success)" : "var(--danger)";
    }
  }

  function getSortedVotes() {
    const votes = state.eventData?.votes || {};
    return Object.entries(votes)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1]);
  }

  function renderResults() {
    const sorted = getSortedVotes().slice(0, 12);
    const selected = state.eventData?.selectedSongId;
    const isStage = state.role === "stage";

    const html = sorted.length
      ? sorted
          .map(([id, count], i) => {
            const song = findSong(id);
            if (!song) return "";
            const sel = selected === id ? "selected" : "";
            const pick =
              isStage
                ? `<button class="btn btn-primary btn-sm pick-btn" data-pick="${id}">Показать всем</button>`
                : "";
            return `<li class="${sel}">
          <span><span class="rank">${i + 1}.</span>${esc(song.title)}
          <small style="color:var(--muted)"> (Сб.${song.collection} стр.${song.page})</small></span>
          <span style="display:flex;align-items:center;gap:8px">
            <strong style="color:var(--gold)">${count}</strong>
            ${pick}
          </span>
        </li>`;
          })
          .join("")
      : '<li style="color:var(--muted);text-align:center">Пока нет голосов</li>';

    if (isStage) {
      const ul = $("#top-list");
      if (ul) {
        ul.innerHTML = html;
        ul.querySelectorAll("[data-pick]").forEach((btn) => {
          btn.onclick = () => pickWinner(btn.dataset.pick);
        });
      }
    } else {
      const ul = $("#top-list-audience");
      if (ul) ul.innerHTML = html;
    }
  }

  async function pickWinner(songId) {
    await Realtime.update({
      selectedSongId: songId,
      forceLyrics: songId,
      votingOpen: false
    });
  }

  async function stopVoting() {
    await Realtime.update({ votingOpen: false });
  }

  async function markSung() {
    const data = state.eventData || {};
    const selected = data.selectedSongId;
    if (!selected) {
      alert("Сначала выберите песню кнопкой «Показать всем»");
      return;
    }
    const votes = { ...(data.votes || {}) };
    // keep all other votes (2nd, 3rd, ...) — only remove the sung one
    delete votes[selected];
    const sung = [...(data.sung || []), selected];
    // carryOver = remaining top songs by votes
    const remaining = Object.entries(votes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
    await Realtime.update({
      sung,
      votes,
      carryOver: remaining,
      selectedSongId: null,
      forceLyrics: null,
      votingOpen: true
    });
    state.forceLyricsShown = null;
    state.myVotes.clear();
  }

  async function startNewRound() {
    // keep votes for non-sung songs (already the case)
    await Realtime.update({
      votingOpen: true,
      forceLyrics: null,
      selectedSongId: null
    });
    state.forceLyricsShown = null;
  }

  function renderSongListAudience() {
    renderSongListInto("#song-list", true);
  }
  function renderSongListStage() {
    renderSongListInto("#song-list-stage", true);
  }

  function renderSongListInto(selector, canVote) {
    const list = $(selector);
    if (!list) return;
    const votes = state.eventData?.votes || {};
    const sung = new Set(state.eventData?.sung || []);
    const carry = new Set(state.eventData?.carryOver || []);
    const selected = state.eventData?.selectedSongId;

    let songs = (window.SONGS || []).filter((s) => !sung.has(s.id));
    if (state.searchQuery) {
      const q = state.searchQuery;
      songs = songs.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.artist || "").toLowerCase().includes(q) ||
          String(s.page).includes(q) ||
          String(s.collection).includes(q)
      );
    }
    songs.sort((a, b) => {
      const ca = carry.has(a.id) ? 1 : 0;
      const cb = carry.has(b.id) ? 1 : 0;
      if (cb !== ca) return cb - ca;
      const va = votes[a.id] || 0;
      const vb = votes[b.id] || 0;
      if (vb !== va) return vb - va;
      return a.title.localeCompare(b.title, "ru");
    });

    list.innerHTML =
      songs
        .map((s) => {
          const v = votes[s.id] || 0;
          const isVoted = state.myVotes.has(s.id);
          const isCarry = carry.has(s.id);
          const isWin = selected === s.id;
          return `<div class="song-card ${isVoted ? "voted" : ""} ${isWin ? "winner" : ""}" data-id="${s.id}">
          ${canVote ? `<div class="vote-check">${isVoted ? "✓" : ""}</div>` : ""}
          <div class="song-info">
            <div class="song-title">${esc(s.title)}${isCarry ? ' <span style="color:var(--gold);font-size:0.7rem">★</span>' : ""}</div>
            <div class="song-meta">${s.artist ? esc(s.artist) + " · " : ""}Сб. ${s.collection}, стр. ${s.page}</div>
          </div>
          <div class="song-votes">${v > 0 ? v : ""}</div>
          <button class="btn btn-sm btn-secondary btn-lyrics" data-id="${s.id}" title="Текст">📜</button>
          ${state.role === "stage" ? `<button class="btn btn-sm btn-primary btn-send-all" data-id="${s.id}" title="Показать всем">📤</button>` : ""}
        </div>`;
        })
        .join("") ||
      '<p class="text-center" style="color:var(--muted);padding:16px">Ничего не найдено</p>';

    list.querySelectorAll(".song-card").forEach((card) => {
      card.onclick = (e) => {
        if (e.target.closest(".btn-lyrics")) return;
        if (canVote) toggleVote(card.dataset.id);
      };
    });
    list.querySelectorAll(".btn-lyrics").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openLyricsModal(btn.dataset.id);
      };
    });
    list.querySelectorAll(".btn-send-all").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        pickWinner(btn.dataset.id);
      };
    });
  }

  async function toggleVote(songId) {
    if (state.eventData?.votingOpen === false) {
      alert("Голосование остановлено");
      return;
    }
    if (state.myVotes.has(songId)) {
      state.myVotes.delete(songId);
      await Realtime.removeVote(songId);
    } else {
      state.myVotes.add(songId);
      await Realtime.addVote(songId);
    }
    if (state.role === "stage") renderSongListStage();
    else renderSongListAudience();
  }

  function renderStageLyrics() {
    const box = $("#stage-lyrics");
    if (!box) return;
    const id = state.eventData?.selectedSongId || state.eventData?.forceLyrics;
    if (!id) {
      box.innerHTML =
        '<p style="color:var(--muted);text-align:center">Выберите песню в результатах — «Показать всем»</p>';
      return;
    }
    const song = findSong(id);
    if (!song) return;
    const lyrics =
      song.lyrics && song.lyrics.trim()
        ? esc(song.lyrics)
        : `Текст в бумажном сборнике\nСборник ${song.collection}, стр. ${song.page}`;
    box.innerHTML = `
      <div class="collection-tag">СБОРНИК ${song.collection} · СТР. ${song.page}</div>
      <h2>${esc(song.title)}</h2>
      <div class="artist">${esc(song.artist || "")}</div>
      <div class="body">${lyrics}</div>`;
  }

  function openLyricsModal(songId, auto = false) {
    const song = findSong(songId);
    if (!song) return;
    $("#lyrics-collection").textContent = `СБОРНИК ${song.collection} · СТР. ${song.page}`;
    $("#lyrics-title").textContent = song.title + (auto ? " ✨" : "");
    $("#lyrics-artist").textContent = song.artist || "";
    const body = $("#lyrics-body");
    if (song.lyrics && song.lyrics.trim()) {
      body.textContent = song.lyrics;
    } else {
      body.innerHTML = `<div class="no-lyrics">
        Текст смотрите в бумажном сборнике<br>
        <strong style="color:var(--gold)">Сборник ${song.collection}, страница ${song.page}</strong><br>
        <a href="https://www.google.com/search?q=${encodeURIComponent(
          song.title + " " + (song.artist || "") + " текст"
        )}" target="_blank">🔍 Найти текст в интернете</a>
      </div>`;
    }
    $("#lyrics-modal").classList.add("open");
    window._currentLyricsSong = song;
  }

  function closeLyrics() {
    $("#lyrics-modal").classList.remove("open");
  }

  function openSeparate() {
    const song = window._currentLyricsSong;
    if (!song) return;
    const w = window.open("", "_blank", "width=480,height=700");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
      song.title
    )}</title>
      <style>
        body{background:#0b1426;color:#f5f0e6;font-family:Georgia,serif;padding:24px;line-height:1.7}
        h1{color:#e8d48b;font-size:1.5rem}
        .meta{color:#a89b7e;font-size:0.85rem;margin-bottom:16px}
        pre{white-space:pre-wrap;font-family:Georgia,serif;font-size:1.05rem}
      </style></head><body>
      <div class="meta">Сборник ${song.collection} · стр. ${song.page}</div>
      <h1>${esc(song.title)}</h1>
      <div class="meta">${esc(song.artist || "")}</div>
      <pre>${song.lyrics ? esc(song.lyrics) : "Текст в бумажном сборнике"}</pre>
      </body></html>`);
    w.document.close();
  }

  function renderChat(selector) {
    const box = $(selector);
    if (!box) return;
    const msgs = state.eventData?.chat || [];
    // chat from Firebase is object if pushed — normalize
    const list = Array.isArray(msgs)
      ? msgs
      : Object.values(msgs || {}).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    box.innerHTML = list
      .slice(-25)
      .map(
        (m) =>
          `<div class="chat-msg"><span class="who">${esc(m.who)}:</span>${esc(m.text)}</div>`
      )
      .join("");
    box.scrollTop = box.scrollHeight;
  }

  async function sendChat(from) {
    const input = from === "stage" ? $("#chat-input") : $("#chat-input-aud");
    const text = (input.value || "").trim();
    if (!text) return;
    const who = from === "stage" ? "Мария 🎤" : "Гость";
    await Realtime.sendChat(who, text);
    input.value = "";
  }

  function findSong(id) {
    return window.findSongById
      ? window.findSongById(id)
      : (window.SONGS || []).find((s) => s.id === id);
  }

  function esc(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function checkUrlCode() {
    const code = new URLSearchParams(location.search).get("code");
    if (code && /^\d{3}$/.test(code)) {
      $("#join-code").value = code;
      $("#join-form").classList.remove("hidden");
    }
  }

  async function tryUnlock() {
    const input = $("#evening-password");
    const err = $("#password-error");
    const pwd = (input && input.value || "").trim();
    if (!pwd) {
      if (err) { err.style.display = "block"; err.textContent = "Введите пароль"; }
      return;
    }
    const btn = $("#btn-unlock");
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      const result = await window.unlockFirebase(pwd);
      if (err) err.style.display = "none";
      // remember unlock for this tab session only (not the password)
      sessionStorage.setItem("maria_unlocked", "1");
      showScreen("screen-welcome");
      initWelcome();
      checkUrlCode();
      if (result && result.useFirebase) {
        console.log("Firebase OK", result.projectId);
      } else {
        console.log("Локальный режим (нет реального Firebase-конфига)");
      }
    } catch (e) {
      if (err) {
        err.style.display = "block";
        err.textContent = e.message || "Неверный пароль";
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Войти"; }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("#lyrics-close").onclick = closeLyrics;
    $("#lyrics-modal").onclick = (e) => {
      if (e.target === $("#lyrics-modal")) closeLyrics();
    };
    $("#btn-open-separate").onclick = openSeparate;

    const btnUnlock = $("#btn-unlock");
    const pwdInput = $("#evening-password");
    if (btnUnlock) btnUnlock.onclick = tryUnlock;
    if (pwdInput) {
      pwdInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") tryUnlock();
      });
    }

    // Already unlocked this tab?
    if (sessionStorage.getItem("maria_unlocked") === "1" && window.FIREBASE_UNLOCKED) {
      showScreen("screen-welcome");
      initWelcome();
      checkUrlCode();
    }
  });
})();
