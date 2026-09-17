/**
 * EliteDent voice guide — Welcome Script (Erlan Digital Twin), tailored to this site.
 *
 * German (`text.de`) is the live default. English (`text.en`) is for the EN toggle.
 * `when: "start"` — auto-plays on page load (after intro on home)
 * `when: "#services"` — plays when that section scrolls into view
 * `spotlight` — CSS selector highlighted only while that line is playing
 */
window.ELITEDENT_GUIDE = {
  DEFAULT: {
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
  },
  SCRIPTS: {
    "/": {
      title: { de: "Startseite", en: "Home" },
      steps: [
        {
          id: "home-hello",
          when: "start",
          intro: true,
          text: {
            de: "Hallo und willkommen. Mein Name ist Erlan Djaniev, und ich freue mich, Sie kennenzulernen.",
            en: "Hello, and welcome. My name is Erlan Djaniev, and I'm pleased to meet you.",
          },
        },
        {
          id: "home-welcome",
          when: "start",
          text: {
            de: "Das ist keine klassische Website. Es ist mein digitaler Raum, in dem ich mich persönlich vorstellen, meine Arbeit teilen und Sie durch die Ideen und Projekte führen kann, die mir am wichtigsten sind.",
            en: "This isn't just a traditional website. It's my digital space, where I can personally introduce myself, share my work, and guide you through the ideas and projects that matter most to me.",
          },
        },
        {
          id: "home-menu",
          when: "start",
          spotlight: ".nav",
          text: {
            de: "Hier finden Sie eine praktische Leiste mit allen Seiten der Website. Ich führe Sie Schritt für Schritt hindurch.",
            en: "Here you will find a handy tab with all pages on the site. I'll guide you through them one by one.",
          },
        },
        {
          id: "home-stats",
          when: ".stats",
          spotlight: ".stats",
          text: {
            de: "Hier sehen Sie, worauf Patientinnen und Patienten bei uns zählen — Erfahrung, Weiterempfehlung und Zeit für jedes Gespräch.",
            en: "Here you can see what patients count on with us — experience, recommendations, and time for every conversation.",
          },
        },
        {
          id: "home-hkp",
          when: ".hkp-band",
          spotlight: ".hkp-band",
          text: {
            de: "Haben Sie schon einen Heil- und Kostenplan? Senden Sie ihn uns — wir prüfen Behandlung und Kosten und melden uns mit den nächsten Schritten.",
            en: "Already have a treatment and cost plan? Send it to us — we review the treatment and costs, then get back to you with next steps.",
          },
        },
        {
          id: "home-services",
          when: "#services",
          spotlight: "#services",
          text: {
            de: "Scrollen Sie einfach zu einer Behandlung Ihrer Wahl — und ich erkläre sie Ihnen direkt, mit Bildern, Illustrationen und anschaulichen Beispielen.",
            en: "Simply scroll to select any treatment of your choice, and I will explain it to you directly, supported by images, illustrations, and visual examples.",
          },
        },
        {
          id: "home-about",
          when: "#about",
          spotlight: "#about .about-preview__link, #about",
          text: {
            de: "Tippen Sie hier, um mehr über mich zu erfahren.",
            en: "Click here to learn more about me.",
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
          spotlight: ".page-hero",
          text: {
            de: "Willkommen. Auf dieser Seite finden Sie mehrere Behandlungen zur Auswahl. Wenn Sie unsicher sind, tippen Sie auf den Lächel-Check — er zeigt Ihnen die passende Behandlung.",
            en: "Welcome. This page contains several treatments from which you can choose. If you're stuck, tap the smile check — it helps you find the right treatment.",
          },
        },
        {
          id: "services-assess",
          when: ".page-hero__cta, [data-assess-expand]",
          spotlight: "[href*='assess'], [data-assess-expand]",
          text: {
            de: "Der kurze Check führt Sie mit ein paar Fragen zu einem ruhigen nächsten Schritt.",
            en: "The short check guides you with a few questions to a calm next step.",
          },
        },
        {
          id: "services-whitening",
          when: "#whitening",
          spotlight: "#whitening",
          text: {
            de: "Zahnaufhellung: helles Lächeln mit kontrolliertem, schmelzschonendem professionellem Bleaching.",
            en: "Whitening: a brighter smile with controlled, enamel-friendly professional bleaching.",
          },
        },
        {
          id: "services-aligners",
          when: "#aligners",
          spotlight: "#aligners",
          text: {
            de: "Transparente Aligner: dezente Schienen, die Engstände und Lücken Schritt für Schritt ausgleichen.",
            en: "Clear aligners: discreet trays that gradually even out crowding and gaps.",
          },
        },
        {
          id: "services-veneers",
          when: "#veneers",
          spotlight: "#veneers",
          text: {
            de: "Veneers: Form und Farbe verfeinern mit dünnen Keramiken, die zu Ihrem Lächeln passen.",
            en: "Veneers: refine shape and color with thin ceramics that suit your smile.",
          },
        },
        {
          id: "services-implants",
          when: "#implants",
          spotlight: "#implants",
          text: {
            de: "Implantate: fehlende Zähne ersetzen mit stabilem Fundament und natürlich wirkender Krone.",
            en: "Implants: replace missing teeth with a stable foundation and a natural-looking crown.",
          },
        },
        {
          id: "services-preventive",
          when: "#preventive",
          spotlight: "#preventive",
          text: {
            de: "Prophylaxe: Kontrollen und Reinigungen, die Zähne und Zahnfleisch langfristig gesund halten.",
            en: "Prevention: check-ups and cleanings that keep teeth and gums healthy over time.",
          },
        },
        {
          id: "services-restorative",
          when: "#restorative",
          spotlight: "#restorative",
          text: {
            de: "Zahnerhaltung: Füllungen, Kronen und Reparaturen, die Komfort und Funktion wiederherstellen.",
            en: "Restorative care: fillings, crowns, and repairs that restore comfort and function.",
          },
        },
        {
          id: "services-hkp",
          when: ".hkp-band",
          spotlight: ".hkp-band",
          text: {
            de: "Schon einen Heil- und Kostenplan? Hier können Sie ihn einreichen und wir prüfen ihn für Sie.",
            en: "Already have a treatment and cost plan? You can submit it here and we will review it for you.",
          },
        },
        {
          id: "services-cta",
          when: ".cta-band",
          spotlight: ".cta-band",
          text: {
            de: "Wenn Sie bereit sind, starten Sie den Lächel-Check oder gehen Sie direkt zur Beratung.",
            en: "When you're ready, start the smile check or go straight to a consultation.",
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
          spotlight: ".about-essay__header",
          text: {
            de: "Lassen Sie mich kurz beginnen. Mich bewegen Forschung, Innovation und Lösungen mit echtem Nutzen.",
            en: "Let me begin with a short introduction. I am passionate about research, innovation, and creating solutions that can make a meaningful impact.",
          },
        },
        {
          id: "about-figure",
          when: ".about-essay__figure",
          spotlight: ".about-essay__figure",
          text: {
            de: "Das Ergebnis, das wir anstreben, wirkt unaufdringlich — ein Lächeln, das wie Sie an einem guten Tag wirkt.",
            en: "The result we aim for is understated — a smile that looks like you on a good day.",
          },
        },
        {
          id: "about-research",
          when: ".about-essay__body",
          spotlight: ".about-essay__body",
          text: {
            de: "In meiner Arbeit verbinde ich wissenschaftliches Denken, Technik und praktische Anwendung. Forschung steht im Zentrum — jedes Projekt beginnt mit der Frage, wie wir bestehende Wege verbessern können.",
            en: "Through my work, I combine scientific thinking, technology, and practical applications. Research is at the center — each project begins with how we can improve existing methods.",
          },
        },
        {
          id: "about-footer",
          when: ".about-essay__footer",
          spotlight: ".about-essay__cta, .about-essay__footer",
          text: {
            de: "Wenn Sie möchten, können Sie hier direkt eine Beratung anfragen — ich begleite Sie weiter.",
            en: "If you like, you can request a consultation here — and I will guide you further.",
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
          spotlight: "#assess-quiz, .assess-quiz",
          text: {
            de: "Diese Website ist interaktiv. Statt langer Texte können Sie einfach zuhören und entdecken. Beantworten Sie ein paar Fragen — ich zeige Ihnen einen ruhigen nächsten Schritt.",
            en: "This website offers an interactive experience. Rather than reading long pages of text, you can simply listen and explore. Answer a few questions, and I will point you to a calm next step.",
          },
        },
        {
          id: "assess-result",
          when: "#assess-result",
          spotlight: "#assess-result",
          text: {
            de: "Hier sehen Sie passende Behandlungen. Wählen Sie einen Vorschlag oder gehen Sie zur Beratung, wenn Sie bereit sind.",
            en: "Here you see matching treatments. Pick a suggestion, or go to a consultation when you're ready.",
          },
        },
      ],
    },
    "/hkp": {
      title: { de: "HKP", en: "HKP" },
      steps: [
        {
          id: "hkp-page",
          when: "start",
          spotlight: ".hkp-hero",
          text: {
            de: "Hier erklären wir den Heil- und Kostenplan: was er ist, warum wir ihn brauchen, und wie der Transfer von einer anderen Praxis funktioniert.",
            en: "Here we explain the treatment and cost plan: what it is, why we need it, and how a transfer from another practice works.",
          },
        },
        {
          id: "hkp-was",
          when: "#was",
          spotlight: "#was",
          text: {
            de: "Was der Plan enthält: die geplante Behandlung und die voraussichtlichen Kosten — oft die Grundlage für Zuschüsse.",
            en: "What the plan contains: the planned treatment and expected costs — often the basis for insurance support.",
          },
        },
        {
          id: "hkp-warum",
          when: "#warum",
          spotlight: "#warum",
          text: {
            de: "Warum wir ihn brauchen: damit wir Ihren Vorschlag fair vergleichen und sagen können, was bei uns möglich ist.",
            en: "Why we need it: so we can fairly compare your proposal and tell you what is possible with us.",
          },
        },
        {
          id: "hkp-transfer",
          when: "#transfer",
          spotlight: "#transfer",
          text: {
            de: "Transfer von einer anderen Praxis: laden Sie den Plan einfach hoch. Wir prüfen ihn und bereiten bei Bedarf ein Gegenangebot vor.",
            en: "Transfer from another practice: simply upload the plan. We review it and prepare a counter-offer if needed.",
          },
        },
        {
          id: "hkp-ablauf",
          when: "#ablauf",
          spotlight: "#ablauf",
          text: {
            de: "So geht es weiter: nach dem Absenden prüft unser Team Ihren Plan und meldet sich mit der Einschätzung.",
            en: "What happens next: after you submit, our team reviews your plan and follows up with an assessment.",
          },
        },
        {
          id: "hkp-process",
          when: ".hkp-process",
          spotlight: ".hkp-process",
          text: {
            de: "Ihr Plan kommt direkt mit in die Beratungsanfrage — Name, Kontakt und Dokument reichen.",
            en: "Your plan goes straight into the consultation request — name, contact, and the document are enough.",
          },
        },
        {
          id: "hkp-faq",
          when: ".hkp-close",
          spotlight: ".hkp-close",
          text: {
            de: "Häufige Fragen finden Sie hier. Wenn Sie bereit sind, öffnen Sie Jetzt beraten.",
            en: "Common questions are here. When you're ready, open Consult now.",
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
          spotlight: "#hkp-form, .book-form",
          text: {
            de: "Danke für Ihren Besuch. Hier senden Sie Ihre Anfrage — Name, E-Mail, Telefon und Ihr Heil- und Kostenplan reichen. Wir melden uns mit den nächsten Schritten.",
            en: "Thank you for visiting. Send your request here — name, email, phone, and your treatment and cost plan are enough. We will be in touch with next steps.",
          },
        },
      ],
    },
  },
};
