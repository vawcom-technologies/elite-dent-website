(() => {
  const STORAGE_KEY = "elitedent-assess-message";

  const QUESTIONS = [
    {
      id: "concern",
      title: "What bothers you most right now?",
      options: [
        { value: "color", label: "Shade or staining" },
        { value: "alignment", label: "Crowding or spacing" },
        { value: "shape", label: "Chips, gaps, or uneven edges" },
        { value: "missing", label: "A missing tooth" },
        { value: "checkup", label: "Just a general check-up" },
      ],
    },
    {
      id: "timeline",
      title: "How soon do you want to see a change?",
      options: [
        { value: "soon", label: "As soon as it makes sense" },
        { value: "gradual", label: "Happy with a gradual pace" },
        { value: "exploring", label: "Just exploring options" },
      ],
    },
    {
      id: "approach",
      title: "What kind of first step feels right?",
      options: [
        { value: "gentle", label: "As gentle and non-invasive as possible" },
        { value: "involved", label: "Open to a more involved treatment if it lasts" },
        { value: "unsure", label: "Not sure - I want advice" },
      ],
    },
  ];

  const CONCERN_LABEL = {
    color: "shade or staining",
    alignment: "crowding or spacing",
    shape: "chips, gaps, or uneven edges",
    missing: "a missing tooth",
    checkup: "a general check-up",
  };

  const TIMELINE_LABEL = {
    soon: "hoping for a change soon",
    gradual: "fine with a gradual pace",
    exploring: "still exploring options",
  };

  const APPROACH_LABEL = {
    gentle: "prefers the gentlest first step",
    involved: "open to a more involved option if it lasts",
    unsure: "wants clear advice on next steps",
  };

  const SERVICES = {
    whitening: {
      name: "Teeth whitening",
      href: "../services/#whitening",
      blurb: "A controlled brightening option when color is the main concern.",
    },
    aligners: {
      name: "Clear aligners",
      href: "../services/#aligners",
      blurb: "Discreet trays for crowding and spacing over time.",
    },
    veneers: {
      name: "Veneers",
      href: "../services/#veneers",
      blurb: "Thin ceramics that refine shape, chips, and shade together.",
    },
    implants: {
      name: "Dental implants",
      href: "../services/#implants",
      blurb: "A stable way to replace a missing tooth.",
    },
    preventive: {
      name: "Preventive care",
      href: "../services/#preventive",
      blurb: "A calm check-up and cleaning to set a clear baseline.",
    },
    restorative: {
      name: "Restorative care",
      href: "../services/#restorative",
      blurb: "Repairs that restore comfort and worn or chipped edges.",
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
      "Smile assessment summary:",
      `Concern: ${CONCERN_LABEL[a.concern]}`,
      `Timeline: ${TIMELINE_LABEL[a.timeline]}`,
      `Preference: ${APPROACH_LABEL[a.approach]}`,
      `Worth discussing: ${names}`,
    ].join("\n");
  }

  function showResult() {
    const services = suggestServices(answers);
    const message = buildMessage(answers, services);

    summaryEl.textContent = `You’re most concerned about ${CONCERN_LABEL[answers.concern]}, ${TIMELINE_LABEL[answers.timeline]}, and ${APPROACH_LABEL[answers.approach]}.`;

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
    progressEl.textContent = `Question ${index + 1} of ${QUESTIONS.length}`;

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
