/**
 * EliteDent voice guide (Erlan Digital Twin), tailored to this site.
 *
 * German (`text.de`) is the live default. English (`text.en`) is for the EN toggle.
 * Keep lines plain and spoken: no em dashes, no marketing phrases.
 *
 * `when: "start"` plays on page load (the `intro` lines play in the full-screen hub on home)
 * `when: "#services"` plays when that section scrolls into view, or when the page opens on that hash
 * `spotlight` CSS selector highlighted only while that line is playing
 * `image` optional photo shown in the guide window next to the line
 *
 * `HUB` is the spoken conversation in the full-screen welcome. Each question is read aloud and the
 * visitor answers by picking a reply: `go` asks the next question, `href` opens that page (the guide
 * explains it there), `close` shrinks the guide and lets them look around.
 */
window.ELITEDENT_GUIDE = {
  HUB: {
    start: {
      id: "hub-start",
      text: {
        de: "Und jetzt zu Ihnen. Was führt Sie heute zu uns? Tippen Sie einfach auf eine Antwort, dann gehen wir zusammen dorthin.",
        en: "Now over to you. What brings you here today? Just tap an answer and we'll go there together.",
      },
      replies: [
        { go: "treatments", label: { de: "Ich möchte mir Behandlungen ansehen", en: "I'd like to look at treatments" } },
        { href: "/hkp/", label: { de: "Ich habe schon einen Heil- und Kostenplan", en: "I already have a treatment and cost plan" } },
        { href: "/team/", label: { de: "Ich möchte das Team kennenlernen", en: "I'd like to meet the team" } },
        { href: "/about/", label: { de: "Erzählen Sie mir mehr über die Praxis", en: "Tell me more about the practice" } },
        { href: "/app/", label: { de: "Zeigen Sie mir die App für Praxen", en: "Show me the app for practices" } },
        { href: "/book/", label: { de: "Ich möchte einen Termin anfragen", en: "I'd like to book a consultation" } },
        { close: true, label: { de: "Ich schaue mich lieber selbst um", en: "I'd rather look around myself" } },
      ],
    },
    treatments: {
      id: "hub-treatments",
      text: {
        de: "Gern. Worum geht es Ihnen?",
        en: "Sure. What are you looking for?",
      },
      replies: [
        { href: "/services/#whitening", label: { de: "Hellere Zähne", en: "Whiter teeth" } },
        { href: "/services/#aligners", label: { de: "Geradere Zähne", en: "Straighter teeth" } },
        { href: "/services/#veneers", label: { de: "Form und Farbe mit Veneers", en: "Shape and colour with veneers" } },
        { href: "/services/#implants", label: { de: "Einen fehlenden Zahn ersetzen", en: "Replacing a missing tooth" } },
        { href: "/services/#preventive", label: { de: "Kontrolle und Reinigung", en: "A check-up and cleaning" } },
        { href: "/services/#restorative", label: { de: "Eine Füllung oder Krone", en: "A filling or crown" } },
        { href: "/assess/", label: { de: "Ich bin mir noch unsicher", en: "I'm not sure yet" } },
        { go: "start", back: true, label: { de: "Zurück", en: "Back" } },
      ],
    },
  },
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
            de: "Hallo und willkommen bei EliteDent. Ich bin Erlan Djaniev und führe Sie heute durch unsere Seite.",
            en: "Hello and welcome to EliteDent. I'm Erlan Djaniev, and I'll show you around our site today.",
          },
        },
        {
          id: "home-about-us",
          when: "start",
          intro: true,
          text: {
            de: "Schön, dass Sie bei uns in Pforzheim vorbeischauen. Wir nehmen uns Zeit, erklären jeden Schritt und behandeln so schonend wie möglich.",
            en: "Thanks for stopping by our practice in Pforzheim. Here we take our time, explain every step and treat as gently as we can.",
          },
        },
        {
          id: "home-stats",
          when: ".stats",
          spotlight: ".stats",
          text: {
            de: "Hier sehen Sie, worauf Patientinnen und Patienten bei uns zählen: Erfahrung, Weiterempfehlung und Zeit für jedes Gespräch.",
            en: "Here you can see what patients count on with us: experience, recommendations, and time for every conversation.",
          },
        },
        {
          id: "home-hkp",
          when: ".hkp-band",
          spotlight: ".hkp-band",
          text: {
            de: "Haben Sie schon einen Heil- und Kostenplan? Senden Sie ihn uns. Wir prüfen Behandlung und Kosten und melden uns mit den nächsten Schritten.",
            en: "Already have a treatment and cost plan? Send it to us. We review the treatment and costs, then get back to you with next steps.",
          },
        },
        {
          id: "home-services",
          when: "#services",
          spotlight: "#services",
          image: "/assets/images/display/equipment.jpg",
          text: {
            de: "Hier finden Sie unsere Behandlungen. Tippen Sie auf eine davon, und ich erkläre sie Ihnen auf der nächsten Seite mit Bildern.",
            en: "Here are our treatments. Tap one and I'll explain it on the next page, with pictures.",
          },
        },
        {
          id: "home-about",
          when: "#about",
          spotlight: "#about .about-preview__link, #about",
          text: {
            de: "Tippen Sie hier, um mehr über uns zu erfahren.",
            en: "Tap here to learn more about us.",
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
          image: "/assets/images/display/equipment.jpg",
          text: {
            de: "Willkommen. Hier finden Sie alle unsere Behandlungen. Zu jeder erklären wir, wie sie abläuft und was ein Termin umfasst.",
            en: "Welcome. Here you'll find all our treatments. For each one we explain how it works and what an appointment includes.",
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
          image: "/assets/images/display/perfectsmile.jpg",
          text: {
            de: "Zahnaufhellung: ein helleres Lächeln mit kontrolliertem, schmelzschonendem Bleaching in der Praxis.",
            en: "Whitening: a brighter smile with controlled, enamel-friendly bleaching in the practice.",
          },
        },
        {
          id: "services-aligners",
          when: "#aligners",
          spotlight: "#aligners",
          image: "/assets/images/heroimg.png",
          text: {
            de: "Transparente Aligner: dezente Schienen, die Engstände und Lücken Schritt für Schritt ausgleichen.",
            en: "Clear aligners: discreet trays that gradually even out crowding and gaps.",
          },
        },
        {
          id: "services-veneers",
          when: "#veneers",
          spotlight: "#veneers",
          image: "/assets/images/display/teeth.jpg",
          text: {
            de: "Veneers: Form und Farbe verfeinern mit dünnen Keramiken, die zu Ihrem Lächeln passen.",
            en: "Veneers: refine shape and color with thin ceramics that suit your smile.",
          },
        },
        {
          id: "services-implants",
          when: "#implants",
          spotlight: "#implants",
          image: "/assets/images/display/perfectsmile2.jpg",
          text: {
            de: "Implantate: fehlende Zähne ersetzen mit stabilem Fundament und natürlich wirkender Krone.",
            en: "Implants: replace missing teeth with a stable foundation and a natural-looking crown.",
          },
        },
        {
          id: "services-preventive",
          when: "#preventive",
          spotlight: "#preventive",
          image: "/assets/images/display/perfectsmile.jpg",
          text: {
            de: "Prophylaxe: Kontrollen und Reinigungen, die Zähne und Zahnfleisch langfristig gesund halten.",
            en: "Prevention: check-ups and cleanings that keep teeth and gums healthy over time.",
          },
        },
        {
          id: "services-restorative",
          when: "#restorative",
          spotlight: "#restorative",
          image: "/assets/images/display/teeth.jpg",
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
            de: "Falls Sie nach dem Lesen noch schwanken, können Sie den Lächel-Check hier unten jederzeit öffnen.",
            en: "If you're still undecided after reading, you can open the smile check down here at any time.",
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
            en: "Let me begin with a short introduction. I care about research, new ideas, and solutions that actually help people.",
          },
        },
        {
          id: "about-figure",
          when: ".about-essay__figure",
          spotlight: ".about-essay__figure",
          text: {
            de: "Das Ergebnis, das wir anstreben, wirkt unaufdringlich: ein Lächeln, das wie Sie an einem guten Tag aussieht.",
            en: "The result we aim for is understated: a smile that looks like you on a good day.",
          },
        },
        {
          id: "about-research",
          when: ".about-essay__body",
          spotlight: ".about-essay__body",
          text: {
            de: "In meiner Arbeit verbinde ich wissenschaftliches Denken, Technik und praktische Anwendung. Jedes Projekt beginnt mit der Frage, wie wir bestehende Wege verbessern können.",
            en: "In my work I combine scientific thinking, technology, and practical application. Every project starts with one question: how can we improve what already exists?",
          },
        },
        {
          id: "about-footer",
          when: ".about-essay__footer",
          spotlight: ".about-essay__cta, .about-essay__footer",
          text: {
            de: "Wenn Sie möchten, können Sie hier direkt eine Beratung anfragen. Ich begleite Sie gern weiter.",
            en: "If you like, you can request a consultation right here. I'm happy to guide you further.",
          },
        },
      ],
    },
    "/team": {
      title: { de: "Team", en: "Team" },
      steps: [
        {
          id: "team-intro",
          when: "start",
          spotlight: ".team-header",
          text: {
            de: "Hier stellen wir uns vor, damit Sie wissen, wer Sie bei EliteDent behandelt.",
            en: "This is where we introduce ourselves, so you know who will be treating you at EliteDent.",
          },
        },
        {
          id: "team-people",
          when: ".team-people",
          spotlight: ".team-people",
          text: {
            de: "Profile und Lebensläufe finden Sie bei jedem von uns. Scrollen Sie weiter für Kontakt und Anfahrt.",
            en: "You'll find each of our profiles and CVs here. Keep scrolling for contact details and directions.",
          },
        },
        {
          id: "team-contact",
          when: "#kontakt",
          spotlight: "#kontakt",
          text: {
            de: "Hier finden Sie E-Mail, Adresse und Öffnungszeiten. Die Karte zeigt Ihnen den Weg nach Pforzheim.",
            en: "Here you'll find our email, address, and opening hours. The map shows you the way to Pforzheim.",
          },
        },
      ],
    },
    "/app": {
      title: { de: "App", en: "App" },
      steps: [
        {
          id: "app-intro",
          when: "start",
          spotlight: ".app-intro",
          text: {
            de: "Das ist unsere App für Zahnarztpraxen. Sie läuft auf dem iPad und wird direkt am Behandlungsstuhl genutzt.",
            en: "This is our app for dental practices. It runs on the iPad and is used right at the treatment chair.",
          },
        },
        {
          id: "app-dashboard",
          when: "section[aria-labelledby=\"app-dashboard\"]",
          spotlight: "section[aria-labelledby=\"app-dashboard\"]",
          text: {
            de: "Nach der Anmeldung sieht man zuerst, welche Fälle gerade Aufmerksamkeit brauchen. Neue Patienten legt man direkt hier an.",
            en: "After signing in, you first see which cases need attention right now. New patients can be added straight from here.",
          },
        },
        {
          id: "app-shade",
          when: "section[aria-labelledby=\"app-shade\"]",
          spotlight: "section[aria-labelledby=\"app-shade\"]",
          text: {
            de: "Hier geht es um die Zahnfarbe. Die App macht einen Vorschlag, und die Zahnärztin oder der Zahnarzt entscheidet.",
            en: "This part is about tooth colour. The app makes a suggestion, and the dentist makes the call.",
          },
        },
        {
          id: "app-smile",
          when: "section[aria-labelledby=\"app-smile\"]",
          spotlight: "section[aria-labelledby=\"app-smile\"]",
          text: {
            de: "Mit der Lächel-Vorschau legt man eine Zahnform auf das Foto. So sprechen Patient und Praxis über dasselbe Bild, bevor etwas entschieden wird.",
            en: "The smile preview places a tooth shape over the photo, so patient and practice can talk about the same picture before anything is decided.",
          },
        },
        {
          id: "app-interpreter",
          when: "section[aria-labelledby=\"app-interpreter\"]",
          spotlight: "section[aria-labelledby=\"app-interpreter\"]",
          text: {
            de: "Der Dolmetscher übersetzt das Gespräch im Behandlungszimmer, wenn Patient und Praxis nicht dieselbe Sprache sprechen.",
            en: "The interpreter translates the conversation in the treatment room when patient and practice don't share a language.",
          },
        },
        {
          id: "app-messages",
          when: "section[aria-labelledby=\"app-messages\"]",
          spotlight: "section[aria-labelledby=\"app-messages\"]",
          text: {
            de: "Fragen an das Labor gehen direkt aus der App, als Text oder Sprachnachricht. Das Gespräch bleibt beim Fall.",
            en: "Questions for the lab go straight from the app, as text or a voice message. The conversation stays with the case.",
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
            de: "Beantworten Sie ein paar kurze Fragen, und ich zeige Ihnen, welcher nächste Schritt zu Ihnen passt.",
            en: "Answer a few short questions and I'll show you which next step suits you.",
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
            de: "Was der Plan enthält: die geplante Behandlung und die voraussichtlichen Kosten. Er ist oft die Grundlage für Zuschüsse.",
            en: "What the plan contains: the planned treatment and the expected costs. It is often the basis for insurance support.",
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
            de: "Ihr Plan kommt direkt mit in die Beratungsanfrage. Name, Kontakt und Dokument reichen.",
            en: "Your plan goes straight into the consultation request. Your name, contact details, and the document are enough.",
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
            de: "Danke für Ihren Besuch. Hier senden Sie Ihre Anfrage. Name, E-Mail, Telefon und Ihr Heil- und Kostenplan reichen. Wir melden uns mit den nächsten Schritten.",
            en: "Thanks for visiting. You can send your request here. Your name, email, phone, and treatment and cost plan are enough. We'll get back to you with next steps.",
          },
        },
      ],
    },
  },
};
