const form = document.getElementById("payment-form");
const statusEl = document.getElementById("route-status");
const httpStatusEl = document.getElementById("http-status");
const responseBodyEl = document.getElementById("response-body");
const eventLogEl = document.getElementById("event-log");
const stageCountEl = document.getElementById("stage-count");
const payloadSizeEl = document.getElementById("payload-size");
const payButton = document.getElementById("pay-button");
const transferDot = document.getElementById("transfer-dot");
const transferLabel = document.getElementById("transfer-label");
const customerWalletEl = document.getElementById("customer-wallet");
const shopkeeperWalletEl = document.getElementById("shopkeeper-wallet");
const customerBalanceEl = document.getElementById("customer-balance");
const shopkeeperBalanceEl = document.getElementById("shopkeeper-balance");

let stageCount = 0;
let customerBalance = 500;
let shopkeeperBalance = 100;

document.addEventListener("DOMContentLoaded", () => {
  setFreshTimestamp();
  renderBalances();
  updatePayloadSize();
  form.addEventListener("input", updatePayloadSize);
  document.getElementById("fresh-timestamp").addEventListener("click", setFreshTimestamp);
  form.addEventListener("submit", submitPayment);
  logStage("Page loaded. Seed the database, then submit plaintext JSON to the official ESP route.", "ok");
});

function buildPayload() {
  return {
    nfc_id: document.getElementById("nfc-id").value.trim(),
    mac_address: document.getElementById("mac-address").value.trim(),
    shopkeeper_id: document.getElementById("shopkeeper-id").value.trim(),
    amount: Number(document.getElementById("amount").value),
    timestamp: Number(document.getElementById("timestamp").value),
    lat: Number(document.getElementById("lat").value),
    lng: Number(document.getElementById("lng").value),
  };
}

function serializePayload(payload) {
  return JSON.stringify(payload);
}

function payloadBytes() {
  return new TextEncoder().encode(serializePayload(buildPayload())).byteLength;
}

function updatePayloadSize() {
  const bytes = payloadBytes();
  payloadSizeEl.textContent = `${bytes} bytes`;
  payloadSizeEl.className = "";
  transferLabel.textContent = `${document.getElementById("amount").value || 0} INR`;
}

function setFreshTimestamp() {
  document.getElementById("timestamp").value = String(Date.now());
  updatePayloadSize();
}

async function submitPayment(event) {
  event.preventDefault();
  resetRun();

  const payload = buildPayload();
  const payloadText = serializePayload(payload);
  const bytes = new TextEncoder().encode(payloadText).byteLength;

  payButton.disabled = true;
  setStatus("pending", "Submitting");

  try {
    logStage(`Built compact JSON payload (${bytes} bytes).`, "ok");
    logStage("POST /api/esp/verify with plaintext JSON for endpoint testing.", "ok");
    startTransferAnimation();

    const response = await fetch("/api/esp/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payloadText,
    });

    const responseText = await response.text();
    httpStatusEl.textContent = `${response.status} ${response.statusText}`;

    let responseJson = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = null;
    }

    responseBodyEl.textContent = responseJson
      ? JSON.stringify(responseJson, null, 2)
      : responseText || "(empty response)";

    if (response.ok) {
      setStatus("ok", "HTTP OK");
      logStage("Official route returned HTTP OK with readable JSON.", "ok");
      updateBalancesFromResponse(responseJson);
      logStage("Run the SQL verification queries to confirm wallet and transaction table updates.", "ok");
    } else {
      setStatus("error", "HTTP Error");
      logStage("Official route returned an error status. Wallets should be unchanged for validation failures.", "error");
    }
  } catch (error) {
    setStatus("error", "Failed");
    httpStatusEl.textContent = "-";
    responseBodyEl.textContent = error instanceof Error ? error.message : String(error);
    logStage(error instanceof Error ? error.message : "Payment request failed.", "error");
  } finally {
    payButton.disabled = false;
  }
}

function resetRun() {
  eventLogEl.innerHTML = "";
  stageCount = 0;
  stageCountEl.textContent = "0";
  responseBodyEl.textContent = "Waiting for route response...";
  httpStatusEl.textContent = "-";
}

function updateBalancesFromResponse(responseJson) {
  const customer = responseJson?.balances?.customer;
  const shopkeeper = responseJson?.balances?.shopkeeper;

  if (!hasNumericBalance(customer) || !hasNumericBalance(shopkeeper)) {
    logStage("Response did not include wallet balances, so the wallet cards were not changed.", "error");
    return;
  }

  customerBalance = Number(customer.after);
  shopkeeperBalance = Number(shopkeeper.after);
  renderBalances();
  flashWallets();

  logStage(`Customer wallet: ${formatTokens(customer.before)} -> ${formatTokens(customer.after)} INR.`, "ok");
  logStage(`Shopkeeper wallet: ${formatTokens(shopkeeper.before)} -> ${formatTokens(shopkeeper.after)} INR.`, "ok");
}

function hasNumericBalance(balance) {
  return Number.isFinite(Number(balance?.before)) && Number.isFinite(Number(balance?.after));
}

function renderBalances() {
  customerBalanceEl.textContent = `Current balance: ${formatTokens(customerBalance)} INR`;
  shopkeeperBalanceEl.textContent = `Current balance: ${formatTokens(shopkeeperBalance)} INR`;
}

function formatTokens(value) {
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

function flashWallets() {
  [customerWalletEl, shopkeeperWalletEl].forEach((wallet) => {
    wallet.classList.remove("updated");
    void wallet.offsetWidth;
    wallet.classList.add("updated");
  });
}

function logStage(message, type = "") {
  stageCount += 1;
  stageCountEl.textContent = String(stageCount);

  const item = document.createElement("li");
  item.textContent = message;
  if (type) item.classList.add(type);
  eventLogEl.appendChild(item);
}

function setStatus(type, text) {
  statusEl.className = `status-pill ${type}`;
  statusEl.textContent = text;
}

function startTransferAnimation() {
  transferDot.classList.remove("active");
  void transferDot.offsetWidth;
  transferDot.classList.add("active");
}
