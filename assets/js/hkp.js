(() => {
  const TOKEN_KEY = "elitedent-hkp-token";
  const ASSESS_KEY = "elitedent-assess-message";
  const form = document.getElementById("hkp-form");
  const success = document.getElementById("hkp-success");
  const submitBtn = form?.querySelector('button[type="submit"]');
  const formError = document.getElementById("form-error");
  const fileError = document.getElementById("file-error");
  const fileOk = document.getElementById("file-ok");
  const hkpRef = document.getElementById("hkp-ref");
  const phone = document.getElementById("phone");
  const phoneError = document.getElementById("phone-error");
  const file = document.getElementById("hkp-file");
  if (!form || !success) return;

  let fileCheckGen = 0;
  let fileValid = false;

  try {
    const assessMsg = sessionStorage.getItem(ASSESS_KEY);
    if (assessMsg && form.message && !form.message.value.trim()) {
      form.message.value = assessMsg;
    }
  } catch (_) {}

  function normalizePhone(value) {
    return String(value || "").replace(/[\s()-]/g, "");
  }

  function setFormError(message) {
    if (!formError) return;
    if (message) {
      formError.textContent = message;
      formError.hidden = false;
    } else {
      formError.textContent = "";
      formError.hidden = true;
    }
  }

  function setFileStatus(message, { ok = false, checking = false } = {}) {
    fileValid = !!ok && !checking;
    if (fileError) {
      if (message && !ok) {
        fileError.textContent = message;
        fileError.hidden = false;
      } else {
        fileError.textContent = "";
        fileError.hidden = true;
      }
    }
    if (fileOk) {
      if (checking) {
        fileOk.textContent = "HKP wird geprüft…";
        fileOk.hidden = false;
      } else if (ok) {
        fileOk.textContent = "HKP erkannt — Sie können die Anfrage absenden.";
        fileOk.hidden = false;
      } else {
        fileOk.hidden = true;
      }
    }
    file?.classList.toggle("is-invalid", !!message && !ok && !checking);
    file?.setAttribute("aria-invalid", message && !ok && !checking ? "true" : "false");
  }

  function validatePhone() {
    const digits = normalizePhone(phone.value).replace(/\D/g, "");
    const ok = digits.length >= 6;
    phone.classList.toggle("is-invalid", !ok);
    phone.setAttribute("aria-invalid", ok ? "false" : "true");
    if (phoneError) phoneError.hidden = ok;
    return ok;
  }

  function validateFileBasics() {
    const chosen = file?.files?.[0];
    if (!chosen) return false;
    const okType = /\.(pdf|jpe?g|png)$/i.test(chosen.name);
    const okSize = chosen.size <= 8 * 1024 * 1024;
    return okType && okSize;
  }

  async function checkHkpFile() {
    const gen = ++fileCheckGen;
    const chosen = file?.files?.[0];
    fileValid = false;

    if (!chosen) {
      setFileStatus("");
      return false;
    }
    if (!validateFileBasics()) {
      setFileStatus("Bitte laden Sie ein PDF, JPG oder PNG bis 8 MB hoch.");
      return false;
    }

    setFileStatus("", { checking: true });
    const data = new FormData();
    data.set("file", chosen, chosen.name);

    try {
      const res = await fetch("/api/hkp?check=1", { method: "POST", body: data });
      const payload = await res.json().catch(() => ({}));
      if (gen !== fileCheckGen) return false;
      if (!res.ok) {
        setFileStatus(
          payload.error ||
            "Dieses Dokument wurde nicht als Heil- und Kostenplan erkannt. Bitte wählen Sie eine andere Datei.",
        );
        return false;
      }
      setFileStatus("", { ok: true });
      return true;
    } catch (_) {
      if (gen !== fileCheckGen) return false;
      setFileStatus("Prüfung fehlgeschlagen. Bitte Datei erneut wählen.");
      return false;
    }
  }

  phone?.addEventListener("input", () => {
    if (phone.classList.contains("is-invalid") || (phoneError && !phoneError.hidden)) {
      validatePhone();
    }
  });
  phone?.addEventListener("blur", validatePhone);

  file?.addEventListener("change", () => {
    setFormError("");
    void checkHkpFile();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormError("");

    if (!form.reportValidity()) return;
    if (!validatePhone()) {
      phone.focus();
      return;
    }
    if (!validateFileBasics()) {
      setFileStatus("Bitte laden Sie ein PDF, JPG oder PNG bis 8 MB hoch.");
      file?.focus();
      return;
    }

    if (!fileValid) {
      const ok = await checkHkpFile();
      if (!ok) {
        file?.focus();
        return;
      }
    }

    if (!form.consent?.checked) {
      setFormError("Bitte bestätigen Sie die Datenschutzerklärung.");
      form.consent?.focus();
      return;
    }

    const data = new FormData(form);
    data.set("phone", normalizePhone(form.phone.value));
    data.set("consent", "1");

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Wird gesendet…";
    }

    try {
      const res = await fetch("/api/hkp", { method: "POST", body: data });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload.code === "not_hkp") {
          setFileStatus(payload.error || "Dokument ist kein gültiger HKP.");
          throw new Error(payload.error || "Dokument ist kein gültiger HKP.");
        }
        throw new Error(payload.error || "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.");
      }

      try {
        if (payload.token) localStorage.setItem(TOKEN_KEY, payload.token);
        sessionStorage.removeItem(ASSESS_KEY);
      } catch (_) {}

      if (hkpRef && payload.refId) {
        hkpRef.textContent = `Referenz: ${payload.refId}`;
        hkpRef.hidden = false;
      }

      form.hidden = true;
      success.hidden = false;
      success.focus?.();
      success.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      setFormError(err.message || "Senden fehlgeschlagen. Bitte versuchen Sie es erneut.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Anfrage senden";
      }
    }
  });
})();
