import type { UiLang } from "./guideScripts";

const cache = new Map<string, string>();

export async function fetchGuideSpeech(
  text: string,
  lang: UiLang,
  signal?: AbortSignal,
): Promise<string | null> {
  const key = `${lang}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
    signal,
  });
  if (!res.ok) return null;

  const url = URL.createObjectURL(await res.blob());
  cache.set(key, url);
  return url;
}
