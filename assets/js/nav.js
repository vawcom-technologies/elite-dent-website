(() => {
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav__toggle");
  const panel = document.getElementById("nav-panel");
  if (!nav || !toggle || !panel) return;

  const mq = window.matchMedia("(max-width: 767px)");
  const services = nav.querySelector(".nav__services");
  const servicesToggle = nav.querySelector(".nav__services-toggle");

  function setOpen(open) {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    document.documentElement.classList.toggle("nav-lock", open && mq.matches);
    if (!open) collapseServices();
  }

  function close() {
    setOpen(false);
  }

  function collapseServices() {
    if (!services || !servicesToggle) return;
    services.classList.remove("is-expanded");
    servicesToggle.setAttribute("aria-expanded", "false");
    servicesToggle.setAttribute("aria-label", "Show services");
  }

  function toggleServices() {
    if (!services || !servicesToggle) return;
    const open = !services.classList.contains("is-expanded");
    services.classList.toggle("is-expanded", open);
    servicesToggle.setAttribute("aria-expanded", open ? "true" : "false");
    servicesToggle.setAttribute("aria-label", open ? "Hide services" : "Show services");
  }

  toggle.addEventListener("click", () => {
    setOpen(!nav.classList.contains("is-open"));
  });

  servicesToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleServices();
  });

  panel.addEventListener("click", (event) => {
    if (event.target.closest(".nav__services-toggle")) return;
    const link = event.target.closest("a[href]");
    if (link) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  document.addEventListener("click", (event) => {
    if (!nav.classList.contains("is-open")) return;
    if (nav.contains(event.target)) return;
    close();
  });

  const onMq = () => {
    if (!mq.matches) {
      close();
      collapseServices();
    }
  };
  if (mq.addEventListener) mq.addEventListener("change", onMq);
  else mq.addListener(onMq);
})();
