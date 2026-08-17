/**
 * Tiny i18n layer. UI text lives here in 中文 / English; a language toggle
 * flips `lang` and notifies listeners so the HUD re-renders live.
 */

export type Lang = "zh" | "en";

const STRINGS: Record<Lang, Record<string, string>> = {
  zh: {
    "app.title": "迪迪和独独的多元宇宙",
    "hint.move": "滚动",
    "hint.look": "转头",
    "hint.chirp": "叫一声",
    "hint.excited": "兴奋",
    "hint.curious": "好奇",
    "hint.yes": "点头",
    "hint.no": "摇头",
    "hint.scared": "受惊",
    "hint.cutaway": "看内部结构",
    "hint.reset": "重新计时",
    "hint.camera": "鼠标拖动 旋转视角 / 滚轮 缩放",
    "hint.switch": "切换操控 迪迪 / 独独",
    "hint.universe": "穿越世界（或驶入传送门）",
    "world.entering": "进入",
    "key.space": "空格",
    "btn.serial": "连接串口",
    "btn.ble": "连接蓝牙",
    "btn.cutawayOn": "看内部结构",
    "btn.cutawayOff": "外壳",
    "btn.driveDudu": "操控独独",
    "btn.driveDidi": "操控迪迪",
    "universe.prefix": "宇宙：",
    "hw.idle": "未连接（仅仿真）",
    "hw.serialConnected": "串口已连接 115200",
    "hw.bleConnected": "蓝牙已连接 {name}",
    "hw.bleGattFail": "蓝牙 GATT 连接失败",
    "hw.noSerial": "当前浏览器不支持 Web Serial，请用 Chrome / Edge",
    "hw.noBle": "当前浏览器不支持 Web Bluetooth，请用 Chrome",
    "hw.sendFail": "发送失败，已断开",
    "hw.serialFail": "串口失败：{msg}",
    "hw.bleFail": "蓝牙失败：{msg}",
    "race.idle": "驾驶迪迪穿过发光的门开始计时",
    "race.running": "冲向下一个门（还剩 {n}）",
    "race.recordFinish": "完成！{t} — 新纪录！按 R 再来",
    "race.finish": "完成！{t} — 按 R 再来",
    "race.best": "最佳 {t}",
    "race.bestNone": "最佳 —",
    "story.b0": "有什么在叫……循着那点光去看看",
    "story.b1": "声音是从门里来的——驶进传送门",
    "story.b2": "这些是让你「变成真的」的零件——取一个",
    "story.b3": "变真＝变重＝会碎……但独独一直在",
    "story.b4": "越来越真，也越来越重了",
    "story.b5": "门开了一条缝，门外的回声——还缺着几个音",
  },
  en: {
    "app.title": "Didi & DuDu's Multiverse",
    "hint.move": "roll",
    "hint.look": "turn head",
    "hint.chirp": "chirp",
    "hint.excited": "excited",
    "hint.curious": "curious",
    "hint.yes": "nod",
    "hint.no": "shake",
    "hint.scared": "scared",
    "hint.cutaway": "see internals",
    "hint.reset": "restart timer",
    "hint.camera": "drag to orbit / scroll to zoom",
    "hint.switch": "swap driver: Didi / DuDu",
    "hint.universe": "hop world (or roll into the portal)",
    "world.entering": "Entering",
    "key.space": "Space",
    "btn.serial": "Connect Serial",
    "btn.ble": "Connect Bluetooth",
    "btn.cutawayOn": "See Internals",
    "btn.cutawayOff": "Shell",
    "btn.driveDudu": "Drive DuDu",
    "btn.driveDidi": "Drive Didi",
    "universe.prefix": "World: ",
    "hw.idle": "Not connected (sim only)",
    "hw.serialConnected": "Serial connected · 115200",
    "hw.bleConnected": "Bluetooth connected · {name}",
    "hw.bleGattFail": "Bluetooth GATT failed",
    "hw.noSerial": "Web Serial unsupported — use Chrome / Edge",
    "hw.noBle": "Web Bluetooth unsupported — use Chrome",
    "hw.sendFail": "Send failed — disconnected",
    "hw.serialFail": "Serial error: {msg}",
    "hw.bleFail": "Bluetooth error: {msg}",
    "race.idle": "Drive Didi through the glowing gate to start",
    "race.running": "Race to the next gate ({n} left)",
    "race.recordFinish": "Finish! {t} — new record! Press R to retry",
    "race.finish": "Finish! {t} — press R to retry",
    "race.best": "Best {t}",
    "race.bestNone": "Best —",
    "story.b0": "Something is calling… follow that faint light",
    "story.b1": "The sound is beyond the gate — roll through the portal",
    "story.b2": "These are the pieces to become real — take one",
    "story.b3": "Real means heavy, means breakable — but DuDu's always there",
    "story.b4": "More real now, and heavier for it",
    "story.b5": "The gate opens a crack; the echo beyond — still missing a few notes",
  },
};

const STORAGE_KEY = "bb8-lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") {
      return saved;
    }
  } catch {
    /* storage unavailable */
  }
  return "zh";
}

let lang: Lang = initialLang();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  for (const fn of listeners) {
    fn();
  }
}

export function toggleLang(): void {
  setLang(lang === "zh" ? "en" : "zh");
}

export function onLangChange(fn: () => void): void {
  listeners.add(fn);
}

/** Translate a key, filling {placeholders} from params. */
export function t(key: string, params?: Record<string, string | number>): string {
  let out = STRINGS[lang][key] ?? STRINGS.zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(`{${k}}`, String(v));
    }
  }
  return out;
}
