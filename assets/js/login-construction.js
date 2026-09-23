(() => {
  const overlay = document.getElementById("login-construction");
  if (!overlay) return;

  function open() {
    overlay.hidden = false;
    document.documentElement.classList.add("is-login-construction");
    overlay.querySelector("[data-login-close]")?.focus();
  }

  function close() {
    overlay.hidden = true;
    document.documentElement.classList.remove("is-login-construction");
    try {
      const url = new URL(location.href);
      if (url.searchParams.has("login")) {
        url.searchParams.delete("login");
        history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    } catch (_) {}
  }

  document.querySelectorAll("[data-login-open]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      open();
    });
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelectorAll("[data-login-close]").forEach((el) => {
    el.addEventListener("click", close);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) close();
  });

  try {
    if (new URLSearchParams(location.search).has("login")) open();
  } catch (_) {}
})();
