(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const page = document.querySelector(".page");
  if (page) {
    requestAnimationFrame(() => page.classList.add("is-ready"));
  }

  const show = (el) => el.classList.add("is-in");

  function observe(els, opts) {
    if (!els.length) return;
    if (reduced || !("IntersectionObserver" in window)) {
      els.forEach(show);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        show(entry.target);
        io.unobserve(entry.target);
      });
    }, opts);
    els.forEach((el) => io.observe(el));
  }

  function bindHomeServicesWave() {
    const home = document.querySelector(".home");
    const cards = [...document.querySelectorAll(".home .service-card[data-reveal]")];
    if (!cards.length) return;

    const start = () => {
      // One-shot reveal — no close-on-leave (that caused scroll glitches)
      observe(cards, {
        threshold: 0.08,
        rootMargin: "0px 0px 18% 0px",
      });
    };

    if (home?.hidden) {
      const mo = new MutationObserver(() => {
        if (home.hidden) return;
        mo.disconnect();
        requestAnimationFrame(start);
      });
      mo.observe(home, { attributes: true, attributeFilter: ["hidden"] });
    } else {
      start();
    }
  }

  bindHomeServicesWave();

  const other = [...document.querySelectorAll("[data-reveal]")].filter(
    (el) => !(el.classList.contains("service-card") && el.closest(".home"))
  );
  observe(other, { threshold: 0.08, rootMargin: "0px 0px 18% 0px" });

  function bindServiceJump() {
    const jump = document.querySelector(".service-jump");
    const articles = [...document.querySelectorAll(".service-article[id]")];
    if (!jump || !articles.length) return;

    const links = [...jump.querySelectorAll("a[href^='#']")];
    const linkById = new Map(
      links
        .map((a) => [a.getAttribute("href")?.slice(1), a])
        .filter(([id]) => id)
    );

    const setActive = (id) => {
      links.forEach((a) => {
        const on = a.getAttribute("href") === `#${id}`;
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
      articles.forEach((article) => {
        article.classList.toggle("is-active", article.id === id);
      });
    };

    links.forEach((a) => {
      a.addEventListener("click", (event) => {
        const id = a.getAttribute("href")?.slice(1);
        const target = id && document.getElementById(id);
        if (!target) return;
        event.preventDefault();
        setActive(id);
        target.scrollIntoView({
          behavior: "auto",
          block: "start",
        });
        history.replaceState(null, "", `#${id}`);
      });
    });

    if (reduced || !("IntersectionObserver" in window)) {
      const hashId = location.hash.slice(1);
      if (hashId && linkById.has(hashId)) setActive(hashId);
      else if (articles[0]) setActive(articles[0].id);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (!visible.length) return;
        setActive(visible[0].target.id);
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0.1, 0.25, 0.5],
      }
    );
    articles.forEach((article) => io.observe(article));

    const hashId = location.hash.slice(1);
    if (hashId && linkById.has(hashId)) setActive(hashId);
  }

  bindServiceJump();

  function scrollToHash() {
    const id = location.hash.slice(1);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({
      behavior: "auto",
      block: "start",
    });
  }

  window.addEventListener("hashchange", scrollToHash);
  if (location.hash) {
    requestAnimationFrame(scrollToHash);
  }
})();
