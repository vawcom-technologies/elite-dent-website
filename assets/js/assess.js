(() => {
  const STORAGE_KEY = "elitedent-assess-message";

  const QUESTIONS = [
    {
      id: "concern",
      title: "Was stört Sie derzeit am meisten?",
      options: [
        { value: "color", label: "Farbe oder Verfärbungen" },
        { value: "alignment", label: "Engstand oder Lücken" },
        { value: "shape", label: "Absplitterungen, Lücken oder ungleichmäßige Kanten" },
        { value: "missing", label: "Ein fehlender Zahn" },
        { value: "checkup", label: "Einfach eine allgemeine Kontrolle" },
      ],
    },
    {
      id: "timeline",
      title: "Wie bald möchten Sie eine Veränderung sehen?",
      options: [
        { value: "soon", label: "Sobald es sinnvoll ist" },
        { value: "gradual", label: "Gerne in einem ruhigen Tempo" },
        { value: "exploring", label: "Ich informiere mich erst" },
      ],
    },
    {
      id: "approach",
      title: "Welcher erste Schritt fühlt sich richtig an?",
      options: [
        { value: "gentle", label: "So schonend und wenig invasiv wie möglich" },
        { value: "involved", label: "Offen für eine aufwendigere Behandlung, wenn sie hält" },
        { value: "unsure", label: "Unsicher – ich möchte eine Empfehlung" },
      ],
    },
  ];

  const CONCERN_LABEL = {
    color: "Farbe oder Verfärbungen",
    alignment: "Engstand oder Lücken",
    shape: "Absplitterungen, Lücken oder ungleichmäßige Kanten",
    missing: "ein fehlender Zahn",
    checkup: "eine allgemeine Kontrolle",
  };

  const TIMELINE_LABEL = {
    soon: "möchten bald eine Veränderung sehen",
    gradual: "sind mit einem ruhigen Tempo einverstanden",
    exploring: "informieren sich noch über die Möglichkeiten",
  };

  const APPROACH_LABEL = {
    gentle: "bevorzugen den schonendsten ersten Schritt",
    involved: "sind offen für eine aufwendigere Option, wenn sie hält",
    unsure: "wünschen sich eine klare Empfehlung für die nächsten Schritte",
  };

  const SERVICES = {
    whitening: {
      name: "Bleaching",
      href: "../services/#whitening",
      blurb: "Eine kontrollierte Aufhellung, wenn die Farbe im Vordergrund steht.",
    },
    aligners: {
      name: "Aligner",
      href: "../services/#aligners",
      blurb: "Unauffällige Schienen bei Engstand und Lücken über die Zeit.",
    },
    veneers: {
      name: "Veneers",
      href: "../services/#veneers",
      blurb: "Dünne Keramik, die Form, Absplitterungen und Farbe gemeinsam verfeinert.",
    },
    implants: {
      name: "Implantate",
      href: "../services/#implants",
      blurb: "Eine stabile Möglichkeit, einen fehlenden Zahn zu ersetzen.",
    },
    preventive: {
      name: "Prophylaxe",
      href: "../services/#preventive",
      blurb: "Eine ruhige Kontrolle und Reinigung für eine klare Ausgangslage.",
    },
    restorative: {
      name: "Zahnerhaltung",
      href: "../services/#restorative",
      blurb: "Reparaturen, die Komfort sowie abgenutzte oder abgesplitterte Kanten wiederherstellen.",
    },
  };

  const quiz = document.getElementById("assess-quiz");
  const stepEl = document.getElementById("assess-step");
  const progressEl = document.getElementById("assess-progress");
  const result = document.getElementById("assess-result");
  const summaryEl = document.getElementById("assess-summary");
  const servicesEl = document.getElementById("assess-services");
  const bookLink = document.getElementById("assess-book");
  const restartBtn = document.getElementById("assess-restart");
  if (!quiz || !stepEl || !result) return;

  const answers = {};
  let index = 0;

  function suggestServices(a) {
    const ids = [];
    if (a.concern === "color") {
      ids.push(a.approach === "involved" ? "veneers" : "whitening");
      if (a.approach === "involved") ids.push("whitening");
      else ids.push("veneers");
    } else if (a.concern === "alignment") {
      ids.push("aligners");
      if (a.approach === "involved") ids.push("veneers");
    } else if (a.concern === "shape") {
      ids.push(a.approach === "gentle" ? "restorative" : "veneers");
      ids.push(a.approach === "gentle" ? "veneers" : "restorative");
    } else if (a.concern === "missing") {
      ids.push("implants");
      ids.push("restorative");
    } else {
      ids.push("preventive");
      if (a.timeline === "soon") ids.push("whitening");
    }
    return [...new Set(ids)].slice(0, 2).map((id) => SERVICES[id]);
  }

  function buildMessage(a, services) {
    const names = services.map((s) => s.name).join(" / ");
    return [
      "Zusammenfassung Lächel-Check:",
      `Anliegen: ${CONCERN_LABEL[a.concern]}`,
      `Zeitrahmen: ${TIMELINE_LABEL[a.timeline]}`,
      `Wunsch: ${APPROACH_LABEL[a.approach]}`,
      `Zum Besprechen: ${names}`,
    ].join("\n");
  }

  function showResult() {
    const services = suggestServices(answers);
    const message = buildMessage(answers, services);

    summaryEl.textContent = `Ihr Schwerpunkt: ${CONCERN_LABEL[answers.concern]}. Sie ${TIMELINE_LABEL[answers.timeline]} und ${APPROACH_LABEL[answers.approach]}.`;

    servicesEl.innerHTML = "";
    services.forEach((s) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = s.href;
      link.textContent = s.name;
      const blurb = document.createElement("span");
      blurb.textContent = s.blurb;
      li.append(link, blurb);
      servicesEl.append(li);
    });

    try {
      sessionStorage.setItem(STORAGE_KEY, message);
    } catch (_) {}

    quiz.hidden = true;
    result.hidden = false;
    result.focus?.();
  }

  function renderStep() {
    const q = QUESTIONS[index];
    progressEl.textContent = `Frage ${index + 1} von ${QUESTIONS.length}`;

    const title = document.createElement("h2");
    title.id = "assess-question";
    title.textContent = q.title;

    const options = document.createElement("div");
    options.className = "assess-options";
    options.setAttribute("role", "group");
    options.setAttribute("aria-labelledby", "assess-question");

    q.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "assess-option";
      btn.textContent = opt.label;
      btn.addEventListener("click", () => {
        answers[q.id] = opt.value;
        index += 1;
        if (index >= QUESTIONS.length) showResult();
        else renderStep();
      });
      options.append(btn);
    });

    stepEl.replaceChildren(title, options);
    quiz.hidden = false;
    result.hidden = true;
  }

  bookLink?.addEventListener("click", () => {
    try {
      if (!sessionStorage.getItem(STORAGE_KEY) && answers.concern) {
        sessionStorage.setItem(STORAGE_KEY, buildMessage(answers, suggestServices(answers)));
      }
    } catch (_) {}
  });

  restartBtn?.addEventListener("click", () => {
    Object.keys(answers).forEach((k) => delete answers[k]);
    index = 0;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    renderStep();
    progressEl.focus?.();
  });

  renderStep();
})();
