(() => {
  try {
    const gift = JSON.parse(sessionStorage.getItem("hs-gift-confirmation") || "null");
    const age = Date.now() - gift?.confirmedAt;
    if (!gift || !Number.isFinite(age) || age < 0 || age > 30 * 60 * 1000
        || !/^\d+(?:\.\d{1,2})?$/.test(gift.amount) || Number(gift.amount) <= 0
        || gift.currency !== "USD" || typeof gift.captureId !== "string" || !gift.captureId) return;
    document.getElementById("gift-amount").textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: gift.currency }).format(Number(gift.amount));
    document.getElementById("gift-reference").textContent = gift.captureId;
    const name = typeof gift.donorName === "string" ? gift.donorName.trim().slice(0, 200) : "";
    document.getElementById("confirmation-title").textContent = name ? `Thank you, ${name}.` : "Thank you for giving.";
    document.title = "Thank you for giving | Hope Sojourns";
    document.getElementById("gift-confirmed").hidden = false;
    document.getElementById("gift-unavailable").hidden = true;
  } catch { /* Direct visits and unavailable storage never imply a completed payment. */ }
})();
