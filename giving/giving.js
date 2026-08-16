(() => {
  const widget = document.querySelector("[data-giving-widget]");
  if (!widget) return;

  const apiBase = widget.dataset.paypalApi?.replace(/\/$/, "");
  const amountInput = document.getElementById("giving-amount");
  const cadenceNote = document.getElementById("giving-cadence-note");
  const buttonContainer = document.getElementById("giving-paypal-buttons");
  const statusMessage = document.getElementById("giving-status");
  const fallback = document.getElementById("giving-fallback");
  const frequencyInputs = [...widget.querySelectorAll('input[name="giving-frequency"]')];
  const quickAmountButtons = [...widget.querySelectorAll("[data-giving-amount]")];
  const otherAmountButton = widget.querySelector("[data-giving-other]");

  if (!apiBase || !amountInput || !cadenceNote || !buttonContainer || !statusMessage || !fallback) return;

  const state = {
    config: null,
    buttons: null,
    configFailed: false,
    renderVersion: 0,
    sdkPromises: new Map(),
  };

  const selectedFrequency = () => frequencyInputs.find((input) => input.checked)?.value ?? "once";

  const setStatus = (message, type = "info") => {
    statusMessage.textContent = message;
    statusMessage.dataset.status = type;
  };

  const showFallback = () => {
    fallback.hidden = false;
  };

  const readAmount = () => {
    const value = amountInput.value.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
      throw new Error("Enter a valid gift amount with no more than two decimal places.");
    }

    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
      throw new Error("Enter a gift amount between $1 and $100,000.");
    }

    return amount.toFixed(2);
  };

  const updateQuickAmounts = () => {
    const amount = Number(amountInput.value);
    let presetSelected = false;
    quickAmountButtons.forEach((button) => {
      const selected = Number(button.dataset.givingAmount) === amount;
      if (selected) presetSelected = true;
      button.setAttribute("aria-pressed", String(selected));
    });
    if (otherAmountButton) otherAmountButton.setAttribute("aria-pressed", String(!presetSelected && amountInput.value.trim() !== ""));
  };

  const updateCadenceNote = () => {
    let amount;
    try {
      amount = readAmount();
      amountInput.removeAttribute("aria-invalid");
    } catch (error) {
      amountInput.setAttribute("aria-invalid", "true");
      cadenceNote.textContent = error.message;
      updateQuickAmounts();
      return;
    }

    const frequency = selectedFrequency();
    const descriptions = {
      once: `A single gift of $${amount}.`,
      monthly: `$${amount} each month until canceled.`,
      yearly: `$${amount} each year until canceled.`,
    };
    cadenceNote.textContent = descriptions[frequency];
    updateQuickAmounts();
  };

  const readApiResponse = async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "PayPal could not start secure checkout.");
    return payload;
  };

  const loadPayPalSdk = (mode) => {
    if (state.sdkPromises.has(mode)) return state.sdkPromises.get(mode);

    const recurring = mode === "recurring";
    const namespace = recurring ? "HopeSojournsPayPalRecurring" : "HopeSojournsPayPalOnce";
    if (window[namespace]) return Promise.resolve(window[namespace]);

    const parameters = new URLSearchParams({
      "client-id": state.config.clientId,
      components: "buttons",
      currency: state.config.currency,
      intent: recurring ? "subscription" : "capture",
      "integration-date": "2026-08-14",
    });
    if (recurring) parameters.set("vault", "true");
    else parameters.set("enable-funding", "venmo");

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.paypal.com/sdk/js?${parameters}`;
      script.dataset.namespace = namespace;
      script.addEventListener("load", () => {
        if (window[namespace]) resolve(window[namespace]);
        else reject(new Error("PayPal loaded without providing checkout controls."));
      }, { once: true });
      script.addEventListener("error", () => reject(new Error("PayPal checkout could not be loaded.")), { once: true });
      document.head.append(script);
    });

    state.sdkPromises.set(mode, promise);
    return promise;
  };

  const commonButtonOptions = (frequency) => ({
    style: {
      layout: "vertical",
      color: "gold",
      shape: "pill",
      label: frequency === "once" ? "donate" : "subscribe",
      height: 48,
    },
    onCancel() {
      setStatus("Checkout was closed. Your gift has not been submitted.");
    },
    onError(error) {
      console.error("PayPal checkout error", error);
      setStatus("PayPal could not complete checkout. Please try again or use the fallback giving page.", "error");
      showFallback();
    },
  });

  const oneTimeOptions = () => ({
    ...commonButtonOptions("once"),
    async createOrder() {
      const amount = readAmount();
      setStatus("Opening secure PayPal checkout…");
      const response = await fetch(`${apiBase}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note: "Hope Sojourns" }),
      });
      const order = await readApiResponse(response);
      return order.id;
    },
    async onApprove(data) {
      setStatus("Confirming your gift securely…");
      const response = await fetch(`${apiBase}/orders/${encodeURIComponent(data.orderID)}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const capture = await readApiResponse(response);
      if (capture.status !== "COMPLETED" && capture.captureStatus !== "COMPLETED") {
        throw new Error("PayPal has not confirmed the gift yet.");
      }
      setStatus("Thank you. Your one-time gift is complete, and PayPal will send your receipt.", "success");
    },
  });

  const recurringOptions = (frequency) => ({
    ...commonButtonOptions(frequency),
    createSubscription(data, actions) {
      const amount = readAmount();
      const planId = state.config.plans[frequency];
      setStatus(`Opening secure PayPal checkout for your ${frequency} gift…`);
      return actions.subscription.create({
        plan_id: planId,
        plan: {
          billing_cycles: [{
            sequence: 1,
            pricing_scheme: {
              fixed_price: { value: amount, currency_code: state.config.currency },
            },
          }],
        },
        application_context: {
          brand_name: "Hope Sojourns",
          shipping_preference: "NO_SHIPPING",
          user_action: "SUBSCRIBE_NOW",
        },
      });
    },
    onApprove(data) {
      const label = frequency === "monthly" ? "monthly" : "yearly";
      setStatus(`Thank you. Your ${label} gift is authorized, and PayPal will send confirmation. Reference: ${data.subscriptionID}`, "success");
    },
  });

  const renderButtons = async () => {
    const version = ++state.renderVersion;
    const frequency = selectedFrequency();
    const recurring = frequency !== "once";

    updateCadenceNote();
    fallback.hidden = true;
    setStatus("Loading secure payment options…");

    if (!state.config) {
      if (state.configFailed) {
        setStatus("Secure payment options could not be loaded. Please use the fallback giving page.", "error");
        showFallback();
      }
      return;
    }

    if (state.buttons && typeof state.buttons.close === "function") {
      await state.buttons.close().catch(() => {});
    }
    buttonContainer.replaceChildren();

    try {
      readAmount();
      const paypalSdk = await loadPayPalSdk(recurring ? "recurring" : "once");
      if (version !== state.renderVersion) return;

      const buttons = paypalSdk.Buttons(recurring ? recurringOptions(frequency) : oneTimeOptions());
      if (!buttons.isEligible()) throw new Error("PayPal checkout is not available for this browser.");
      state.buttons = buttons;
      await buttons.render(buttonContainer);
      if (version === state.renderVersion) {
        setStatus(recurring
          ? `Choose an available PayPal payment method to authorize your ${frequency} gift.`
          : "Choose PayPal, Venmo when eligible, or another available payment method.");
      }
    } catch (error) {
      console.error("Giving widget initialization error", error);
      if (version !== state.renderVersion) return;
      setStatus(error.message || "Secure payment options could not be loaded.", "error");
      showFallback();
    }
  };

  frequencyInputs.forEach((input) => input.addEventListener("change", renderButtons));
  amountInput.addEventListener("input", updateCadenceNote);
  amountInput.addEventListener("blur", () => {
    try {
      amountInput.value = readAmount();
    } catch {
      // The inline cadence message already explains the validation problem.
    }
    updateCadenceNote();
  });
  quickAmountButtons.forEach((button) => {
    button.addEventListener("click", () => {
      amountInput.value = button.dataset.givingAmount;
      updateCadenceNote();
      amountInput.focus();
    });
  });
  otherAmountButton?.addEventListener("click", () => {
    quickAmountButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
    otherAmountButton.setAttribute("aria-pressed", "true");
    amountInput.focus();
    amountInput.select();
  });

  fetch(`${apiBase}/config`, { headers: { Accept: "application/json" } })
    .then(readApiResponse)
    .then((config) => {
      if (!config.ready || !config.clientId || !config.plans?.monthly || !config.plans?.yearly) {
        throw new Error("Recurring giving is still being prepared.");
      }
      state.config = config;
      return renderButtons();
    })
    .catch((error) => {
      console.error("Giving configuration error", error);
      state.configFailed = true;
      setStatus("Secure payment options could not be loaded. Please use the fallback giving page.", "error");
      showFallback();
    });
})();
