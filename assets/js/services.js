(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cards = document.querySelectorAll(".service-card[data-reveal]");
  if (cards.length) {
    const show = (el) => el.classList.add("is-in");
    if (reduced || !("IntersectionObserver" in window)) {
      cards.forEach(show);
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            show(entry.target);
            io.unobserve(entry.target);
          });
        },
        { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
      );
      cards.forEach((card) => io.observe(card));
    }
  }

  const panels = document.querySelectorAll(".service-panel");
  if (!panels.length) return;

  function setOpen(panel, open) {
    panel.classList.toggle("is-open", open);
    panel.querySelector(".service-panel__toggle")?.setAttribute("aria-expanded", String(open));
  }

  function openFromHash() {
    const id = location.hash.slice(1);
    panels.forEach((panel) => setOpen(panel, panel.id === id));
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  }

  panels.forEach((panel) => {
    panel.querySelector(".service-panel__toggle")?.addEventListener("click", () => {
      const willOpen = !panel.classList.contains("is-open");
      panels.forEach((other) => setOpen(other, false));
      if (willOpen) {
        setOpen(panel, true);
        history.replaceState(null, "", `#${panel.id}`);
      } else {
        history.replaceState(null, "", location.pathname);
      }
    });
  });

  window.addEventListener("hashchange", openFromHash);
  openFromHash();
})();
