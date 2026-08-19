const interestForm = document.getElementById("interest-form");

if (interestForm) {
  const submitButton = interestForm.querySelector("[data-submit-interest]");
  const formStatus = interestForm.querySelector("[data-interest-status]");
  const successPanel = document.querySelector("[data-interest-success]");
  const successMessage = document.querySelector("[data-interest-success-message]");
  const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const configuredApiBase = document.body.dataset.interestApiBase || "/api/interest";
  const apiBase = localPreview ? "http://127.0.0.1:8787" : configuredApiBase;
  let idempotencyKey = createIdempotencyKey();
  let lastPayloadSignature = "";

  function createIdempotencyKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function errorElement(field) {
    return interestForm.querySelector(`[data-error-for="${field}"]`);
  }

  function fieldControl(field) {
    const controls = {
      firstName: interestForm.elements.firstName,
      lastName: interestForm.elements.lastName,
      email: interestForm.elements.email,
      phone: interestForm.elements.phone,
      fieldOfStudy: interestForm.elements.fieldOfStudy,
      preferredTiming: interestForm.elements.preferredTiming,
      message: interestForm.elements.message,
      consent: interestForm.elements.consent,
      contactPreference: interestForm.querySelector("[name='contactPreference']"),
      opportunities: interestForm.querySelector("[name='opportunities']"),
    };
    return controls[field] || null;
  }

  function clearErrors() {
    interestForm.querySelectorAll("[data-error-for]").forEach(element => {
      element.hidden = true;
      element.textContent = "";
    });
    interestForm.querySelectorAll("[aria-invalid='true']").forEach(element => element.removeAttribute("aria-invalid"));
    interestForm.elements.phone.setCustomValidity("");
    formStatus.textContent = "";
    formStatus.removeAttribute("data-status");
  }

  function showFieldError(field, message) {
    const error = errorElement(field);
    const control = fieldControl(field);
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
    control?.setAttribute("aria-invalid", "true");
  }

  function showStatus(message, status = "error") {
    formStatus.textContent = message;
    formStatus.dataset.status = status;
  }

  function selectedOpportunities() {
    return [...interestForm.querySelectorAll("input[name='opportunities']:checked")].map(input => input.value);
  }

  function buildPayload() {
    const data = new FormData(interestForm);
    return {
      firstName: String(data.get("firstName") || ""),
      lastName: String(data.get("lastName") || ""),
      email: String(data.get("email") || ""),
      phone: String(data.get("phone") || ""),
      contactPreference: String(data.get("contactPreference") || ""),
      fieldOfStudy: String(data.get("fieldOfStudy") || ""),
      preferredTiming: String(data.get("preferredTiming") || ""),
      message: String(data.get("message") || ""),
      opportunities: selectedOpportunities(),
      consent: data.get("consent") === "yes",
      website: String(data.get("website") || ""),
    };
  }

  function validateClient(payload) {
    let valid = true;
    if (payload.opportunities.length === 0) {
      showFieldError("opportunities", "Choose at least one trip or internship.");
      valid = false;
    }
    const phoneDigits = payload.phone.replace(/\D/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 18) {
      const message = "Enter a valid cell phone number with 7 to 18 digits.";
      interestForm.elements.phone.setCustomValidity(message);
      showFieldError("phone", message);
      valid = false;
    }
    if (!interestForm.checkValidity()) valid = false;
    if (!valid) {
      interestForm.reportValidity();
      const firstInvalid = interestForm.querySelector("[aria-invalid='true'], :invalid");
      firstInvalid?.focus();
    }
    return valid;
  }

  function applyServerErrors(fieldErrors) {
    Object.entries(fieldErrors || {}).forEach(([field, message]) => {
      if (typeof message === "string") showFieldError(field, message);
    });
    const firstInvalid = interestForm.querySelector("[aria-invalid='true']");
    firstInvalid?.focus();
  }

  function prefillFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const requested = params.getAll("opportunity");
    requested.forEach(value => {
      const checkbox = interestForm.querySelector(`input[name="opportunities"][value="${value.replace(/[^a-z0-9-]/g, "")}"]`);
      if (checkbox) checkbox.checked = true;
    });
    const type = params.get("type");
    if (type === "trip" || type === "internship") {
      interestForm.querySelector(`[data-choice-group="${type}"]`)?.classList.add("is-recommended-group");
    }
  }

  interestForm.addEventListener("input", event => {
    const control = event.target;
    control.removeAttribute?.("aria-invalid");
    if (control.name === "phone") control.setCustomValidity("");
    const field = control.name === "opportunities" ? "opportunities" : control.name;
    const error = errorElement(field);
    if (error) error.hidden = true;
  });

  interestForm.addEventListener("submit", async event => {
    event.preventDefault();
    clearErrors();
    const payload = buildPayload();
    if (!validateClient(payload)) return;

    const payloadSignature = JSON.stringify(payload);
    if (lastPayloadSignature && lastPayloadSignature !== payloadSignature) idempotencyKey = createIdempotencyKey();
    lastPayloadSignature = payloadSignature;
    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    submitButton.textContent = "Sending…";
    showStatus("Sending your interest…", "working");

    try {
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ ...payload, idempotencyKey }),
      });
      let result = {};
      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok) {
        if (result.fieldErrors) applyServerErrors(result.fieldErrors);
        const duplicate = result.code === "DUPLICATE_SUBMISSION";
        showStatus(
          result.error || "We could not send the form. Please review your information and try again.",
          duplicate ? "notice" : "error",
        );
        if (duplicate || result.code === "IDEMPOTENCY_KEY_REUSED") idempotencyKey = createIdempotencyKey();
        formStatus.focus();
        return;
      }

      interestForm.hidden = true;
      successPanel.hidden = false;
      successMessage.textContent = result.message || "A Hope Sojourns team member will follow up with you.";
      successPanel.focus();
      interestForm.reset();
      idempotencyKey = createIdempotencyKey();
      lastPayloadSignature = "";
    } catch {
      showStatus("We could not connect to the form service. Please try again, or book a conversation with us.", "error");
      formStatus.focus();
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
      submitButton.textContent = "Share my interest";
    }
  });

  prefillFromUrl();
}
