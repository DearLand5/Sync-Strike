/* =====================================================================
   TrackLibrary — библиотека загруженных треков (IndexedDB, только на устройстве).
   Два хранилища: "meta" — короткие записи для списка, "data" — сам файл и результат анализа
   (при повторном запуске трек не анализируется заново). Когда место заканчивается,
   удаляется трек, который дольше всех не запускали (кроме защищённых: текущий и автосохранение).
   ===================================================================== */
const LIB_MAX_TRACKS = 30;
const LIB_MAX_BYTES = 400 * 1024 * 1024;
const ANALYSIS_VERSION = 4;    // увеличить при изменении формата/логики анализатора — карты пересчитаются

class TrackLibrary {
  constructor() {
    this.db = null;
    this.ok = false;
    this.items = [];             // кэш записей meta
    this.maxTracks = LIB_MAX_TRACKS; this.maxBytes = LIB_MAX_BYTES;
    this.ready = this._open().catch(e => { console.warn("library:", e); return false; });
  }

  _req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  _tx(stores, mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(stores, mode);
      let out;
      tx.oncomplete = () => res(out);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error("abort"));
      out = fn(tx);
    });
  }

  async _open() {
    if (typeof indexedDB === "undefined") return false;
    const r = indexedDB.open("syncstrike", 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
      if (!db.objectStoreNames.contains("data")) db.createObjectStore("data", { keyPath: "id" });
    };
    this.db = await this._req(r);
    // _tx завершается с результатом fn (промис запроса разворачивается)
    this.items = (await this._tx(["meta"], "readonly", tx => this._req(tx.objectStore("meta").getAll()))) || [];
    this.ok = true;
    return true;
  }

  /** Треки по последнему запуску (свежие сверху). */
  list() { return this.items.slice().sort((a, b) => b.lastPlayed - a.lastPlayed); }
  get(id) { return this.items.find(m => m.id === id) || null; }
  findByKey(key) { return this.items.find(m => m.key === key) || null; }
  totalBytes() { return this.items.reduce((a, m) => a + m.size, 0); }

  /**
   * Добавляет трек (или обновляет существующий с тем же ключом).
   * protect — id, которые нельзя вытеснять. Возвращает { id, evicted: [имена] }.
   */
  async add(info, bytes, map, protect = []) {
    if (!this.ok) throw new Error("no-db");
    const old = this.findByKey(info.key);
    const now = Date.now();
    const meta = {
      id: old ? old.id : "t" + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      key: info.key, name: info.name, size: bytes.byteLength,
      addedAt: old ? old.addedAt : now, lastPlayed: now,
      bpm: map.bpm, duration: map.duration, ver: ANALYSIS_VERSION,
      tempo: old && old.tempo ? old.tempo : null,   // темп и правка долей — поверх исходного анализа
    };
    const keep = new Set([meta.id, ...protect]);
    const evicted = [];
    const evictOne = async () => {
      const victim = this.items.filter(m => !keep.has(m.id)).sort((a, b) => a.lastPlayed - b.lastPlayed)[0];
      if (!victim) return false;
      await this.remove(victim.id);
      evicted.push(victim.name);
      return true;
    };
    // лимиты библиотеки: число треков и общий объём
    const others = () => this.items.filter(m => m.id !== meta.id);
    while (others().length >= this.maxTracks || others().reduce((a, m) => a + m.size, 0) + meta.size > this.maxBytes) {
      if (!(await evictOne())) break;
    }
    if (navigator.storage && navigator.storage.persist && !this._persistAsked) {
      this._persistAsked = true;
      navigator.storage.persist().catch(() => {});   // просим браузер не чистить хранилище сам
    }
    // браузер может отказать по квоте — тогда освобождаем место и пробуем снова
    for (;;) {
      try {
        await this._tx(["meta", "data"], "readwrite", tx => {
          tx.objectStore("data").put({ id: meta.id, audio: bytes, map });
          tx.objectStore("meta").put(meta);
        });
        break;
      } catch (e) {
        const quota = e && (e.name === "QuotaExceededError" || /quota/i.test(e.message || ""));
        if (!quota || !(await evictOne())) throw e;
      }
    }
    compactInPlace(this.items, m => m.id !== meta.id);
    this.items.push(meta);
    return { id: meta.id, evicted };
  }

  /** Полная запись: { meta, audio: ArrayBuffer, map }. */
  async load(id) {
    if (!this.ok) return null;
    const meta = this.get(id);
    if (!meta) return null;
    const data = await this._tx(["data"], "readonly", tx => this._req(tx.objectStore("data").get(id)));
    if (!data) return null;
    return { meta, audio: data.audio, map: meta.ver === ANALYSIS_VERSION ? data.map : null };
  }

  /** Новый результат анализа (после смены версии анализатора). */
  async updateMap(id, audio, map) {
    const meta = this.get(id);
    if (!meta) return;
    meta.ver = ANALYSIS_VERSION; meta.bpm = map.bpm; meta.duration = map.duration;
    await this._tx(["meta", "data"], "readwrite", tx => {
      tx.objectStore("data").put({ id, audio, map });
      tx.objectStore("meta").put(meta);
    });
  }

  /** Темп трека и правка долей (null — по умолчанию). Исходный анализ в data не трогаем. */
  async setTempo(id, tempo) {
    const meta = this.get(id);
    if (!meta) return;
    meta.tempo = tempo || null;
    try { await this._tx(["meta"], "readwrite", tx => { tx.objectStore("meta").put(meta); }); } catch (e) { console.warn(e); }
  }

  async touch(id) {
    const meta = this.get(id);
    if (!meta) return;
    meta.lastPlayed = Date.now();
    try { await this._tx(["meta"], "readwrite", tx => { tx.objectStore("meta").put(meta); }); } catch (e) { /* не критично */ }
  }

  async remove(id) {
    if (!this.ok) return;
    await this._tx(["meta", "data"], "readwrite", tx => {
      tx.objectStore("meta").delete(id);
      tx.objectStore("data").delete(id);
    });
    compactInPlace(this.items, m => m.id !== id);
  }
}
