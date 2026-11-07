(function () {
  class RealtimeAdapter {
    constructor() {
      this.eventId = null;
      this.listeners = {};
      this.isFirebase = false;
      this.db = null;
      this.channel = null;
      this._initLocalChannel();
    }

    _initLocalChannel() {
      if (this.channel) return;
      try {
        this.channel = new BroadcastChannel("maria-vote-v7");
        this.channel.onmessage = (ev) => this._onMsg(ev.data);
      } catch (e) {}
    }

    /** Call after password unlock + firebase.initializeApp */
    attachFirebase() {
      if (!(window.USE_FIREBASE && typeof firebase !== "undefined")) {
        this.isFirebase = false;
        return;
      }
      try {
        this.db = firebase.database();
        this.isFirebase = true;
      } catch (e) {
        console.warn("attachFirebase", e);
        this.isFirebase = false;
      }
    }

    _genCode() {
      return String(Math.floor(100 + Math.random() * 900));
    }

    _empty(id) {
      return {
        id,
        createdAt: Date.now(),
        votingOpen: true,
        votes: {},
        carryOver: [],
        sung: [],
        selectedSongId: null,
        forceLyrics: null,
        chat: [],
        stageName: "Мария"
      };
    }

    async createEvent() {
      const id = this._genCode();
      const data = this._empty(id);
      if (this.isFirebase && this.db) {
        await this.db.ref("events/" + id).set(data);
      } else {
        localStorage.setItem("ev7_" + id, JSON.stringify(data));
        this._bc({ type: "update", eventId: id, data });
      }
      this.eventId = id;
      return id;
    }

    async joinEvent(id) {
      this.eventId = id;
      if (this.isFirebase && this.db) {
        const snap = await this.db.ref("events/" + id).once("value");
        if (!snap.exists()) {
          throw new Error(
            "Вечер не найден. На сцене сначала нажмите «Я на сцене» и проверьте код."
          );
        }
        return snap.val();
      }
      const raw = localStorage.getItem("ev7_" + id);
      if (!raw) {
        throw new Error(
          "Вечер не найден.\n\nБез Firebase работает только в одном браузере (две вкладки).\nДля разных телефонов: подключите Firebase (DEPLOY.md) и введите пароль вечера."
        );
      }
      return JSON.parse(raw);
    }

    subscribe(cb) {
      this.listeners.main = cb;
      if (this.isFirebase && this.db && this.eventId) {
        this.db.ref("events/" + this.eventId).on("value", (s) => cb(s.val()));
      }
    }

    async update(partial) {
      if (!this.eventId) return;
      if (this.isFirebase && this.db) {
        await this.db.ref("events/" + this.eventId).update(partial);
        return;
      }
      const data = {
        ...JSON.parse(localStorage.getItem("ev7_" + this.eventId) || "{}"),
        ...partial
      };
      localStorage.setItem("ev7_" + this.eventId, JSON.stringify(data));
      this._bc({ type: "update", eventId: this.eventId, data });
      if (this.listeners.main) this.listeners.main(data);
    }

    async addVote(songId) {
      if (this.isFirebase && this.db) {
        await this.db
          .ref("events/" + this.eventId + "/votes/" + songId)
          .transaction((c) => (c || 0) + 1);
        return;
      }
      const data = JSON.parse(localStorage.getItem("ev7_" + this.eventId) || "{}");
      data.votes = data.votes || {};
      data.votes[songId] = (data.votes[songId] || 0) + 1;
      localStorage.setItem("ev7_" + this.eventId, JSON.stringify(data));
      this._bc({ type: "update", eventId: this.eventId, data });
      if (this.listeners.main) this.listeners.main(data);
    }

    async removeVote(songId) {
      if (this.isFirebase && this.db) {
        await this.db
          .ref("events/" + this.eventId + "/votes/" + songId)
          .transaction((c) => Math.max(0, (c || 0) - 1));
        return;
      }
      const data = JSON.parse(localStorage.getItem("ev7_" + this.eventId) || "{}");
      data.votes = data.votes || {};
      data.votes[songId] = Math.max(0, (data.votes[songId] || 0) - 1);
      localStorage.setItem("ev7_" + this.eventId, JSON.stringify(data));
      this._bc({ type: "update", eventId: this.eventId, data });
      if (this.listeners.main) this.listeners.main(data);
    }

    async sendChat(who, text) {
      const msg = { who, text, ts: Date.now() };
      if (this.isFirebase && this.db) {
        await this.db.ref("events/" + this.eventId + "/chat").push(msg);
        return;
      }
      const data = JSON.parse(localStorage.getItem("ev7_" + this.eventId) || "{}");
      data.chat = (data.chat || []).concat(msg).slice(-40);
      localStorage.setItem("ev7_" + this.eventId, JSON.stringify(data));
      this._bc({ type: "update", eventId: this.eventId, data });
      if (this.listeners.main) this.listeners.main(data);
    }

    _bc(p) {
      if (this.channel) this.channel.postMessage(p);
    }
    _onMsg(m) {
      if (m.eventId !== this.eventId) return;
      if (this.listeners.main) this.listeners.main(m.data);
    }
  }

  window.Realtime = new RealtimeAdapter();
})();
