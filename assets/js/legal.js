// Loaded in <head> before i18n.js: the legal text is authored in both languages,
// so this only picks which version shows and keeps ?lang= links (App Store) working.
(() => {
  const KEY = "elitedent-ui-lang";
  const html = document.documentElement;

  let lang = new URLSearchParams(location.search).get("lang");
  try {
    if (lang !== "en" && lang !== "de") lang = localStorage.getItem(KEY) || localStorage.getItem("elitedent-lang");
    if (lang === "en" || lang === "de") localStorage.setItem(KEY, lang);
  } catch (_) {}
  if (lang !== "en") lang = "de";

  html.lang = lang;
  document.title = html.getAttribute(`data-title-${lang}`) || document.title;
  const desc = html.getAttribute(`data-desc-${lang}`);
  if (desc) document.querySelector('meta[name="description"]')?.setAttribute("content", desc);
})();
