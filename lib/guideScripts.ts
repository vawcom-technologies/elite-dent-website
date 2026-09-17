export type UiLang = "de" | "en";

export type GuideCopy = { de: string; en: string };

export type GuideStep = {
  id: string;
  /** `"start"` after play, or a CSS selector that must scroll into view. */
  when?: "start" | (string & {});
  /** Spoken line. Edit this; TTS is generated from it once, then cached. */
  text: GuideCopy;
  src?: string;
};

export type GuideScript = {
  title: GuideCopy;
  steps: GuideStep[];
};

export const MUTE_STORAGE_KEY = "elitedent-guide-muted";

export function normalizePathname(pathname: string): string {
  const noIndex = pathname.replace(/\/index\.html$/i, "");
  const trimmed = noIndex.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function getGuideScript(pathname: string): GuideScript {
  return GUIDE_SCRIPTS[normalizePathname(pathname)] ?? DEFAULT_GUIDE_SCRIPT;
}

export const DEFAULT_GUIDE_SCRIPT: GuideScript = {
  title: { de: "Seitenführung", en: "Page guide" },
  steps: [
    {
      id: "default-1",
      when: "start",
      text: {
        de: "Hallo und willkommen. Ich begleite Sie gerne durch EliteDent. Pausieren oder stummschalten können Sie mich jederzeit.",
        en: "Hello, and welcome. I'm happy to guide you through EliteDent. Pause or mute me whenever you like.",
      },
    },
  ],
};

/** Adapted from assets/script.pdf for EliteDent routes. */
export const GUIDE_SCRIPTS: Record<string, GuideScript> = {
  "/": {
    title: { de: "Startseite", en: "Home" },
    steps: [
      {
        id: "home-welcome",
        when: "start",
        text: {
          de: "Hallo und willkommen. Mein Name ist Erlan Djaniev, und ich freue mich, Sie kennenzulernen. Diese Website ist mehr als eine klassische Praxis-Seite — sie ist mein digitaler Raum, in dem ich mich persönlich vorstellen, unsere Arbeit teilen und Sie durch die Themen führen kann, die mir wichtig sind.",
          en: "Hello, and welcome. My name is Erlan Djaniev, and I'm pleased to meet you. This website is more than a traditional website — it is my digital space, where I can personally introduce myself, share my work, and guide you through the ideas and care that matter most to me.",
        },
      },
      {
        id: "home-services",
        when: "#services",
        text: {
          de: "Hier finden Sie unsere Behandlungen. Wählen Sie, was Sie interessiert — Bleaching, Aligner, Veneers, Implantate oder die tägliche Versorgung — und ich erkläre es Ihnen klar, mit Bildern und Beispielen.",
          en: "Here you will find our treatments. Select any topic that interests you — whitening, aligners, veneers, implants, or everyday care — and I will explain it to you directly, supported by images and visual examples.",
        },
      },
      {
        id: "home-about",
        when: "#about",
        text: {
          de: "Lassen Sie mich kurz vorstellen. Mich bewegen Forschung, Innovation und Lösungen, die einen echten Unterschied machen — mit ruhiger, klarer Betreuung für jede Patientin und jeden Patienten.",
          en: "Let me begin with a short introduction. I am passionate about research, innovation, and creating solutions that can make a meaningful impact — calm, clear care for every patient.",
        },
      },
    ],
  },
  "/services": {
    title: { de: "Leistungen", en: "Services" },
    steps: [
      {
        id: "services-page",
        when: "start",
        text: {
          de: "Forschung steht im Zentrum meiner Arbeit. Jede Behandlung beginnt mit Fragen: Wie können wir bestehende Wege verbessern? Wie finden wir den nächsten ruhigen Schritt? Hier führe ich Sie Schritt für Schritt durch die Behandlungen — mit dem medizinischen Hintergrund und dem, was das für Sie in der Praxis bedeutet.",
          en: "Research is at the center of everything I do. Each treatment begins with a question: How can we improve existing methods? How can we create real value for you? Through this page I can walk you through our treatments step by step — the background, and the real-world application.",
        },
      },
    ],
  },
  "/about": {
    title: { de: "Über uns", en: "About" },
    steps: [
      {
        id: "about-page",
        when: "start",
        text: {
          de: "Lassen Sie mich mit einer kurzen Vorstellung beginnen. Ich verbinde wissenschaftliches Denken, moderne Technik und praktische Anwendung, um neue Ideen zu prüfen und komplexe Fragen klar zu lösen. EliteDent ist der Ort, an dem aus diesem Anspruch ruhige Betreuung wird — ohne gehetzte Termine.",
          en: "Let me begin with a short introduction. Through my work I combine scientific thinking, technology, and practical applications to explore new ideas and solve complex problems. EliteDent is where that becomes calm care — never a rushed visit.",
        },
      },
    ],
  },
  "/assess": {
    title: { de: "Lächel-Check", en: "Smile check" },
    steps: [
      {
        id: "assess-page",
        when: "start",
        text: {
          de: "Statt langer Texte können Sie einfach zuhören und ausprobieren. Beantworten Sie ein paar Fragen — und ich zeige Ihnen einen ruhigen nächsten Schritt. Betrachten Sie das als Gespräch: klar, natürlich und visuell.",
          en: "Rather than reading long pages of text, you can simply listen and explore. Answer a few questions, and I will point you to a calm next step. Think of this as a conversation — information presented naturally, clearly, and visually.",
        },
      },
    ],
  },
  "/book": {
    title: { de: "Beratung", en: "Consult" },
    steps: [
      {
        id: "book-page",
        when: "start",
        text: {
          de: "Danke für Ihren Besuch. Ich lade Sie ein, die Themen zu entdecken, die Sie am meisten interessieren, und mehr über unsere Arbeit zu erfahren. Name, E-Mail und Telefon reichen — wir finden einen Termin, der zu Ihnen passt. Wählen Sie, wann Sie beginnen möchten, und ich begleite Sie.",
          en: "Thank you for visiting. I invite you to explore the topics that interest you most and learn more about our work. Name, email, and phone are enough — we will find a time that suits you. Please begin whenever you like, and I will guide you through it.",
        },
      },
    ],
  },
};
