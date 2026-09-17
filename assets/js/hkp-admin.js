(() => {
  const KEY = "elitedent-hkp-admin";
  const login = document.getElementById("hkp-admin-login");
  const panel = document.getElementById("hkp-admin-panel");
  const form = document.getElementById("hkp-admin-form");
  const error = document.getElementById("hkp-admin-error");
  const list = document.getElementById("hkp-admin-list");
  const logout = document.getElementById("hkp-admin-logout");
  const filters = document.getElementById("hkp-admin-filters");
  if (!form || !panel || !login) return;

  const LABELS = {
    new: "Offen",
    consultation_available: "Offen",
    in_progress: "Offen",
    approved: "Genehmigt",
    rejected: "Abgelehnt",
    done: "Erledigt",
  };

  const DECIDED = new Set(["approved", "rejected", "done"]);

  let rowsCache = [];
  let filter = "all";

  function password() {
    try {
      return sessionStorage.getItem(KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function setPassword(value) {
    try {
      if (value) sessionStorage.setItem(KEY, value);
      else sessionStorage.removeItem(KEY);
    } catch (_) {}
  }

  function headers() {
    return {
      Authorization: `Bearer ${password()}`,
      "Content-Type": "application/json",
    };
  }

  function setError(message) {
    if (!error) return;
    error.textContent = message || "";
    error.hidden = !message;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusLabel(status) {
    return LABELS[status] || "Offen";
  }

  function statusKey(status) {
    if (status === "approved") return "approved";
    if (status === "rejected") return "rejected";
    if (status === "done") return "done";
    return "open";
  }

  function isPending(status) {
    return !DECIDED.has(status);
  }

  function showLogin() {
    login.hidden = false;
    panel.hidden = true;
    if (filters) filters.hidden = true;
  }

  async function load() {
    const res = await fetch("/api/hkp-admin", { headers: headers() });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setPassword("");
      showLogin();
      setError("Passwort ist nicht korrekt.");
      return;
    }
    if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen.");
    rowsCache = data.submissions || [];
    render();
    login.hidden = true;
    panel.hidden = false;
    if (filters) filters.hidden = false;
    setError("");
  }

  function visibleRows() {
    if (filter === "all") return rowsCache;
    if (filter === "new") return rowsCache.filter((row) => isPending(row.status));
    return rowsCache.filter((row) => row.status === filter);
  }

  function render() {
    if (!list) return;
    const rows = visibleRows();
    if (!rowsCache.length) {
      list.innerHTML = '<p class="hkp-admin__empty">Noch keine Anfragen.</p>';
      return;
    }
    if (!rows.length) {
      list.innerHTML = '<p class="hkp-admin__empty">Keine Einträge in diesem Filter.</p>';
      return;
    }

    list.innerHTML = rows
      .map((row) => {
        const when = row.createdAt ? new Date(row.createdAt).toLocaleString("de-DE") : "";
        const label = statusLabel(row.status);
        const key = statusKey(row.status);
        const pending = isPending(row.status);
        return `<article class="hkp-admin__card" data-id="${escapeHtml(row.id)}">
          <div class="hkp-admin__card-top">
            <div>
              <h2>${escapeHtml(row.fullName)}</h2>
              <p class="hkp-admin__meta">${escapeHtml(when)} · <span class="hkp-admin__badge hkp-admin__badge--${key}">${escapeHtml(label)}</span></p>
            </div>
            <div class="hkp-admin__actions">
              ${
                pending
                  ? `<button type="button" class="hkp-admin__btn hkp-admin__btn--approve" data-action="approved">Annehmen</button>
                     <button type="button" class="hkp-admin__btn hkp-admin__btn--reject" data-action="rejected">Ablehnen</button>`
                  : `<button type="button" class="hkp-admin__btn hkp-admin__btn--reset" data-action="new">Zurücksetzen</button>`
              }
              <button type="button" class="hkp-admin__btn hkp-admin__btn--delete" data-action="delete">Löschen</button>
            </div>
          </div>
          <details class="hkp-admin__fold">
            <summary>Details</summary>
            <dl class="hkp-admin__details">
              <div><dt>E-Mail</dt><dd><a href="mailto:${escapeHtml(row.email)}">${escapeHtml(row.email)}</a></dd></div>
              <div><dt>Telefon</dt><dd><a href="tel:${escapeHtml(row.phone)}">${escapeHtml(row.phone)}</a></dd></div>
              <div><dt>HKP</dt><dd>${
                row.fileName
                  ? `<a href="/api/hkp-admin?id=${encodeURIComponent(row.id)}&download=1&password=${encodeURIComponent(password())}">${escapeHtml(row.fileName)}</a>`
                  : "—"
              }</dd></div>
              ${
                row.message
                  ? `<div><dt>Nachricht</dt><dd>${escapeHtml(row.message)}</dd></div>`
                  : ""
              }
            </dl>
          </details>
        </article>`;
      })
      .join("");
  }

  async function patch(id, body, btn) {
    if (btn) btn.disabled = true;
    setError("");
    try {
      const res = await fetch("/api/hkp-admin", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen.");
      const next = data.submission;
      if (next) {
        const idx = rowsCache.findIndex((row) => row.id === id);
        if (idx >= 0) rowsCache[idx] = { ...rowsCache[idx], ...next };
        else await load();
        render();
      } else {
        await load();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function remove(id, btn) {
    if (btn) btn.disabled = true;
    setError("");
    try {
      const res = await fetch("/api/hkp-admin", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ id, action: "delete" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen.");
      rowsCache = rowsCache.filter((row) => row.id !== id);
      render();
    } catch (err) {
      setError(err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = String(form.password.value || "").trim();
    if (!value) return;
    setPassword(value);
    try {
      await load();
    } catch (err) {
      setError(err.message);
    }
  });

  logout?.addEventListener("click", () => {
    setPassword("");
    showLogin();
  });

  filters?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-filter]");
    if (!chip) return;
    filter = chip.getAttribute("data-filter") || "all";
    filters.querySelectorAll("[data-filter]").forEach((el) => {
      el.classList.toggle("is-active", el === chip);
    });
    render();
  });

  list?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    const card = btn.closest("[data-id]");
    if (!card) return;
    const action = btn.getAttribute("data-action");
    if (action === "delete") {
      if (!window.confirm("Diese Anfrage und die HKP-Datei unwiderruflich löschen?")) return;
      await remove(card.dataset.id, btn);
      return;
    }
    await patch(card.dataset.id, { status: action }, btn);
  });

  if (password()) {
    load().catch((err) => {
      setError(err.message);
      showLogin();
    });
  }
})();
