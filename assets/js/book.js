(() => {
  const form = document.getElementById("book-form");
  const success = document.getElementById("book-success");
  const submitBtn = form?.querySelector('button[type="submit"]');
  const formError = document.getElementById("form-error");
  const bookRef = document.getElementById("book-ref");
  if (!form || !success) return;

  const phone = document.getElementById("phone");
  const phoneError = document.getElementById("phone-error");
  const API_URL = "/api/book";

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

  function validatePhone() {
    const digits = normalizePhone(phone.value).replace(/\D/g, "");
    const ok = digits.length >= 6;
    phone.classList.toggle("is-invalid", !ok);
    phone.setAttribute("aria-invalid", ok ? "false" : "true");
    if (phoneError) phoneError.hidden = ok;
    return ok;
  }

  phone?.addEventListener("input", () => {
    if (phone.classList.contains("is-invalid") || (phoneError && !phoneError.hidden)) {
      validatePhone();
    }
  });

  phone?.addEventListener("blur", validatePhone);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormError("");

    if (!form.reportValidity()) return;
    if (!validatePhone()) {
      phone.focus();
      return;
    }

    const payload = {
      fullName: form.fullName.value.trim(),
      email: form.email.value.trim(),
      phone: normalizePhone(form.phone.value),
      message: (form.message?.value || "").trim(),
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
    }

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      if (bookRef && data.refId) {
        bookRef.textContent = `Reference: ${data.refId}`;
        bookRef.hidden = false;
      }

      form.hidden = true;
      success.hidden = false;
      success.focus?.();
      success.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      setFormError(err.message || "Could not send. Please try again.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Request consultation";
      }
    }
  });
})();
