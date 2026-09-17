import type { UiLang } from "./guideScripts";

const SKIP =
  /female|anna|sandy|shelley|grandma|kathy|karen|moira|samantha|helena|petra|katja|nora|whisper|zarvox|bells|cellos|bubbles|boing|trinoids|jester|junior|princess|organ|superstar|bad news|good news|wobble|bahh|tessa|veena|fiona|zira|victoria/i;

const PREFER: Record<UiLang, string[]> = {
  de: ["reed", "eddy", "rocko", "yannick", "otto", "markus", "stefan", "google deutsch"],
  en: ["daniel", "reed", "eddy", "rocko", "google uk english male", "alex", "microsoft david"],
};

export function pickMaleVoice(lang: UiLang): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const prefix = lang === "en" ? "en" : "de";
  const pool = speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith(prefix) && !SKIP.test(voice.name));

  for (const name of PREFER[lang]) {
    const hit = pool.find((voice) => voice.name.toLowerCase().includes(name));
    if (hit) return hit;
  }

  return pool.find((voice) => /male|reed|eddy|rocko|daniel|alex/.test(voice.name.toLowerCase())) ?? null;
}

/** Calm male delivery — slightly slower and lower than the browser default. */
export function applyFriendlyMaleVoice(utterance: SpeechSynthesisUtterance, lang: UiLang) {
  const voice = pickMaleVoice(lang);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = lang === "en" ? "en-GB" : "de-DE";
  }
  utterance.rate = 0.9;
  utterance.pitch = 0.92;
}
