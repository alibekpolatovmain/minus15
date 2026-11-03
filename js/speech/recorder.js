// Live speech-to-text in Russian via the browser's built-in recognition (Chrome sends audio to Google, Safari to Siri).
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
/** Recognition may still deliver the last words after stop(); give up waiting after this. */
const STOP_GRACE_MS = 1500;
const BLOCKED = new Set(["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"]);

export const canRecord = () => Boolean(Recognition);

/**
 * Starts listening. onText(text) gets the full transcript so far, onDone(text) once after stop(),
 * onBlocked(reason) when the microphone or recognition is unavailable.
 */
export function startRecording({ onText, onDone, onBlocked }) {
  const rec = new Recognition();
  rec.lang = "ru-RU";
  rec.continuous = true;
  rec.interimResults = true;
  let finals = "";
  let interim = "";
  let stopping = false;
  let finished = false;
  let graceTimer = null;

  const full = () => `${finals} ${interim}`.replace(/\s+/g, " ").trim();
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(graceTimer);
    onDone(full());
  };

  rec.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript;
      if (e.results[i].isFinal) finals += ` ${text}`;
      else interim += ` ${text}`;
    }
    onText(full());
  };
  rec.onerror = (e) => {
    if (!BLOCKED.has(e.error)) return;
    stopping = true;
    finished = true;
    onBlocked(e.error);
  };
  // Browsers end recognition after a pause in speech; keep listening until the user stops.
  rec.onend = () => {
    if (stopping) { finish(); return; }
    try {
      finals = full();
      interim = "";
      rec.start();
    } catch (err) {
      console.error("Speech recognition restart failed", err);
      finish();
    }
  };

  try {
    rec.start();
  } catch (err) {
    console.error("Speech recognition start failed", err);
    onBlocked("start");
    return { stop() {} };
  }

  return {
    stop() {
      if (stopping) return;
      stopping = true;
      graceTimer = setTimeout(finish, STOP_GRACE_MS);
      try { rec.stop(); } catch (err) { finish(); }
    },
  };
}
