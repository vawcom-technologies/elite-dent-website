"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  MUTE_STORAGE_KEY,
  getGuideScript,
  type GuideStep,
  type UiLang,
} from "../lib/guideScripts";
import { applyFriendlyMaleVoice } from "../lib/guideVoice";
import { fetchGuideSpeech } from "../lib/ttsClient";
import "../assets/css/site-guide.css";

export type GuideStatus = "idle" | "playing" | "paused" | "ended";

export type GuidePlaybackState = {
  status: GuideStatus;
  stepIndex: number;
  muted: boolean;
};

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    /* private mode */
  }
}

function readLang(): UiLang {
  try {
    return localStorage.getItem("elitedent-ui-lang") === "en" ? "en" : "de";
  } catch {
    return "de";
  }
}

function stepText(step: GuideStep | undefined, lang: UiLang): string {
  if (!step) return "";
  return step.text[lang];
}

/**
 * Page-specific voice guide. Mount once in `app/layout.tsx`:
 * `<SiteGuideAgent />`
 *
 * Playback is owned by a persistent `HTMLAudioElement` ref so pause / resume /
 * mute stay exact under rapid toggles. Native audio events are the 3D avatar hooks.
 */
export function SiteGuideAgent() {
  const pathname = usePathname() ?? "/";
  const script = getGuideScript(pathname);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const playGenRef = useRef(0);
  const wantPausedRef = useRef(false);
  const mutedRef = useRef(false);
  const stepIndexRef = useRef(0);
  const statusRef = useRef<GuideStatus>("idle");
  const stepsRef = useRef(script.steps);
  const langRef = useRef<UiLang>("de");
  const playStepRef = useRef<(index: number) => void>(() => {});

  const [status, setStatus] = useState<GuideStatus>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [lang, setLang] = useState<UiLang>("de");

  stepsRef.current = script.steps;
  mutedRef.current = muted;
  stepIndexRef.current = stepIndex;
  statusRef.current = status;
  langRef.current = lang;

  const setPlayback = useCallback((next: Partial<GuidePlaybackState>) => {
    if (next.status !== undefined) {
      statusRef.current = next.status;
      setStatus(next.status);
    }
    if (next.stepIndex !== undefined) {
      stepIndexRef.current = next.stepIndex;
      setStepIndex(next.stepIndex);
    }
    if (next.muted !== undefined) {
      mutedRef.current = next.muted;
      setMuted(next.muted);
    }
  }, []);

  const stopNow = useCallback(() => {
    playGenRef.current += 1;
    wantPausedRef.current = true;
    utteranceRef.current = null;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      try {
        audio.load();
      } catch {
        /* empty src */
      }
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }, []);

  const playStep = useCallback(
    async (index: number) => {
      const steps = stepsRef.current;
      if (index >= steps.length) {
        setPlayback({ status: "ended" });
        return;
      }
      if (index < 0) return;

      const gen = ++playGenRef.current;
      wantPausedRef.current = false;
      const step = steps[index];
      setPlayback({ status: "playing", stepIndex: index });

      const audio = audioRef.current;
      const playSrc = (src: string) => {
        if (!audio) return;
        if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
        utteranceRef.current = null;
        audio.src = src;
        audio.muted = mutedRef.current;
        void audio.play().then(
          () => {
            if (wantPausedRef.current || gen !== playGenRef.current) audio.pause();
          },
          (err: unknown) => {
            if (gen !== playGenRef.current) return;
            if (err instanceof DOMException && err.name === "AbortError") return;
            setPlayback({ status: "paused" });
          },
        );
      };

      if (step.src && audio) {
        playSrc(step.src);
        return;
      }

      const text = stepText(step, langRef.current);
      ttsAbortRef.current?.abort();
      const ac = new AbortController();
      ttsAbortRef.current = ac;
      try {
        const src = await fetchGuideSpeech(text, langRef.current, ac.signal);
        if (gen !== playGenRef.current || wantPausedRef.current) return;
        if (src) {
          playSrc(src);
          return;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }

      if (gen !== playGenRef.current || wantPausedRef.current) return;
      if (typeof speechSynthesis === "undefined") {
        setPlayback({ status: "ended" });
        return;
      }

      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      applyFriendlyMaleVoice(utterance, langRef.current);
      utterance.volume = mutedRef.current ? 0 : 1;
      utteranceRef.current = utterance;
      utterance.onend = () => {
        if (gen !== playGenRef.current) return;
        playStepRef.current(index + 1);
      };
      utterance.onerror = (event) => {
        if (gen !== playGenRef.current) return;
        if (event.error === "canceled" || event.error === "interrupted") return;
        setPlayback({ status: "paused" });
      };
      speechSynthesis.speak(utterance);
    },
    [setPlayback],
  );

  playStepRef.current = playStep;

  // Persistent audio element — one instance for the life of this client tree.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    // 3D AVATAR: start talking animation / begin viseme stream
    audio.onplay = () => {
      setPlayback({ status: "playing" });
    };

    // 3D AVATAR: freeze current mouth pose; do not reset the clip
    audio.onpause = () => {
      if (audio.ended) return;
      if (statusRef.current === "playing") setPlayback({ status: "paused" });
    };

    // 3D AVATAR: rest pose, then the next line starts
    audio.onended = () => {
      playStepRef.current(stepIndexRef.current + 1);
    };

    // 3D AVATAR: map `audio.currentTime` → viseme / jaw open
    audio.ontimeupdate = () => {
      void audio.currentTime;
    };

    return () => {
      playGenRef.current += 1;
      audio.pause();
      audio.removeAttribute("src");
      audio.onplay = null;
      audio.onpause = null;
      audio.onended = null;
      audio.ontimeupdate = null;
      audioRef.current = null;
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, [setPlayback]);

  // Pathname swap: stop immediately and reset the step counter.
  useEffect(() => {
    stopNow();
    setPlayback({ status: "idle", stepIndex: 0 });
  }, [pathname, stopNow, setPlayback]);

  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.getVoices();
    const warm = () => speechSynthesis.getVoices();
    speechSynthesis.addEventListener("voiceschanged", warm);
    return () => speechSynthesis.removeEventListener("voiceschanged", warm);
  }, []);

  useEffect(() => {
    const stored = readMuted();
    mutedRef.current = stored;
    setMuted(stored);
    if (audioRef.current) audioRef.current.muted = stored;
    setLang(readLang());
  }, []);

  const pause = () => {
    if (statusRef.current !== "playing") return;
    wantPausedRef.current = true;
    audioRef.current?.pause();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.pause();
    setPlayback({ status: "paused" });
  };

  const resume = () => {
    if (statusRef.current === "ended") {
      playStep(0);
      return;
    }
    if (statusRef.current === "idle") {
      playStep(0);
      return;
    }
    if (statusRef.current !== "paused") return;

    const audio = audioRef.current;
    const usingAudio = Boolean(audio?.src);
    const gen = playGenRef.current;
    wantPausedRef.current = false;
    setPlayback({ status: "playing" });

    if (usingAudio && audio) {
      audio.muted = mutedRef.current;
      void audio.play().then(
        () => {
          if (wantPausedRef.current || gen !== playGenRef.current) audio.pause();
        },
        (err: unknown) => {
          if (gen !== playGenRef.current) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setPlayback({ status: "paused" });
        },
      );
      return;
    }

    if (typeof speechSynthesis !== "undefined") speechSynthesis.resume();
  };

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    writeMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
    if (utteranceRef.current) utteranceRef.current.volume = next ? 0 : 1;
  };

  const playing = status === "playing";
  const step = script.steps[stepIndex];
  const line =
    status === "idle"
      ? lang === "en"
        ? "Start the page guide"
        : "Seitenführung starten"
      : status === "ended"
        ? lang === "en"
          ? "Guide finished"
          : "Führung beendet"
        : stepText(step, lang);

  return (
    <aside className="site-guide" aria-label={lang === "en" ? "Page guide" : "Seitenführung"}>
      <div
        className={`site-guide__avatar${playing ? " is-talking" : ""}`}
        aria-hidden="true"
      />
      <div className="site-guide__body">
        <p className="site-guide__kicker">
          {script.title[lang]}
          <span>
            {stepIndex + 1}/{script.steps.length}
          </span>
        </p>
        <p className="site-guide__line" aria-live="polite">
          {line}
        </p>
        <div className="site-guide__controls">
          <button
            type="button"
            className="site-guide__btn"
            aria-label={playing ? (lang === "en" ? "Pause" : "Pause") : lang === "en" ? "Resume" : "Fortsetzen"}
            onClick={playing ? pause : resume}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="5" width="4.5" height="14" rx="1" />
                <rect x="13.5" y="5" width="4.5" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="site-guide__btn"
            aria-pressed={muted}
            aria-label={muted ? (lang === "en" ? "Unmute" : "Ton an") : lang === "en" ? "Mute" : "Stumm"}
            onClick={toggleMute}
          >
            {muted ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 10v4h3.5L12 18V6L7.5 10H4z" />
                <path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 10v4h3.5L12 18V6L7.5 10H4z" />
                <path d="M16 9.5a4.5 4.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
