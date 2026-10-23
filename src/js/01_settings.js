/* =====================================================================
   Settings — значения по умолчанию и сохранение
   ===================================================================== */
const DEFAULT_LAYOUT = {
  // x, y — доли безопасной области экрана; s — собственный масштаб кнопки
  joy:    { x: 0.14, y: 0.74, s: 1 },
  attack: { x: 0.885, y: 0.72, s: 1 },
  jump:   { x: 0.755, y: 0.84, s: 1 },
  dodge:  { x: 0.80, y: 0.53, s: 1 },
};

const DEFAULT_SETTINGS = {
  musicVol: 0.8, sfxVol: 0.7, uiVol: 0.55,
  sfxStyle: "samples",      // звуки эффектов: samples (записанные, Kenney CC0) | synth
  quality: "auto",          // auto | high | low
  shake: 0.8,               // 0..1
  flashes: true,
  beatGuide: true,
  fullscreen: true,
  forceLandscape: true,     // горизонтальный экран по умолчанию (поворот интерфейса в портрете)
  slowmoMode: "rare",       // замедления времени: normal | rare | off
  showFps: false,
  fpsCap: 0,                // ограничение кадров: 0 — без ограничения, 90, 60
  latencyMs: 0,             // пользовательская калибровка задержки звука
  sensitivity: 1.0,         // 0.5..1.5
  windowScale: 1.0,         // 0.7..1.5
  assist: true,             // буферизация ввода к доле
  btnScale: 1.0,            // общий размер кнопок 0.6..1.5
  btnAlpha: 0.55,           // прозрачность кнопок 0.1..1
  joyFloat: true,
  touchForce: false,
  layout: JSON.parse(JSON.stringify(DEFAULT_LAYOUT)),
  skin: "shade",
  mode: "waves",
  difficulty: "normal",
};

class Settings extends Emitter {
  constructor() {
    super();
    const saved = Store.get("settings", {});
    this.v = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), saved);
    // аккуратно дополняем раскладку, если в сохранении нет новых кнопок
    this.v.layout = Object.assign(JSON.parse(JSON.stringify(DEFAULT_LAYOUT)), this.v.layout || {});
  }
  get(k) { return this.v[k]; }
  set(k, val) { this.v[k] = val; this.save(); this.emit("change", k, val); }
  save() { Store.set("settings", this.v); }
  resetLayout() { this.v.layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT)); this.save(); this.emit("change", "layout"); }
}
