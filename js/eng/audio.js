// English voice for «Английский»: one fixed en-US system voice, normal or slow.
const RATE = 0.9;
const SLOW_RATE = 0.6;
const PREFERRED = ["Samantha", "Ava", "Allison", "Susan", "Alex"];

let voice = null;

function pickVoice() {
  const all = speechSynthesis.getVoices().filter((v) => /^en[-_]US/i.test(v.lang));
  const pool = all.length ? all : speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  voice = PREFERRED.map((n) => pool.find((v) => v.name.startsWith(n))).find(Boolean) || pool.find((v) => v.localService) || pool[0] || null;
}

export const canSpeak = () => "speechSynthesis" in window;

export function initVoice() {
  if (!canSpeak()) return;
  pickVoice();
  speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

/** False when the phone has no English voice installed: the UI then shows how to add one. */
export const hasEnglishVoice = () => canSpeak() && Boolean(voice || (pickVoice(), voice));

/** Speaks English. Must run inside a tap handler the first time: iOS blocks speech before a user gesture. */
export function speakEn(text, slow = false) {
  if (!canSpeak() || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  if (voice) u.voice = voice;
  u.rate = slow ? SLOW_RATE : RATE;
  speechSynthesis.speak(u);
}

export function stopSpeech() {
  if (canSpeak()) speechSynthesis.cancel();
}
