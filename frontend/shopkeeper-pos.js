const DEMO_CUSTOMER = {
  userId: "36c973ef-a786-46ed-8be0-ecc4dc63ccc8",
  ringId: "NFC_CUSTOMER_DEMO",
  balance: 750,
};

const COUNTERS = [
  {
    key: "luna",
    name: "Luna Coffee",
    location: "Counter A",
    balance: 120,
    macAddress: "PAY:LUNA:COFFEE:01",
    shopkeeperId: "b11886bb-3f43-4139-8e5a-4bbb15f44912",
  },
  {
    key: "nova",
    name: "Nova Merch",
    location: "Booth B",
    balance: 300,
    macAddress: "PAY:NOVA:MERCH:01",
    shopkeeperId: "4f35bc3f-163d-4498-9885-cb44f8dd3b20",
  },
];

const counterSelect = document.getElementById("counter-select");
const amountInput = document.getElementById("amount-input");
const generateButton = document.getElementById("generate-button");
const simulateButton = document.getElementById("simulate-button");
const counterLabel = document.getElementById("counter-label");
const requestState = document.getElementById("request-state");
const merchantName = document.getElementById("merchant-name");
const requestAmount = document.getElementById("request-amount");
const requestCopy = document.getElementById("request-copy");
const setupMessage = document.getElementById("setup-message");
const paymentMessage = document.getElementById("payment-message");
const posStatus = document.getElementById("pos-status");
const customerBalance = document.getElementById("customer-balance");
const shopkeeperBalance = document.getElementById("shopkeeper-balance");
const shopkeeperCardLabel = document.getElementById("shopkeeper-card-label");
const customerCard = document.getElementById("customer-card");
const shopkeeperCard = document.getElementById("shopkeeper-card");
const readyPanel = document.getElementById("ready-panel");
const activityList = document.getElementById("activity-list");
const activityCount = document.getElementById("activity-count");

let activeRequest = null;
let selectedCounterKey = "";
let customerTokens = DEMO_CUSTOMER.balance;
let eventTotal = 0;

document.addEventListener("DOMContentLoaded", async () => {
  renderCounters();
  await renderBalances();
  counterSelect.addEventListener("change", handleCounterChange);
  generateButton.addEventListener("click", generateRequest);
  simulateButton.addEventListener("click", simulateRingTap);
  amountInput.addEventListener("input", clearRequest);
  addActivity("POS ready. Select a counter and create a payment request.", "");
});

function renderCounters() {
  COUNTERS.forEach((counter) => {
    const option = document.createElement("option");
    option.value = counter.key;
    option.textContent = `${counter.name} - ${counter.location}`;
    counterSelect.appendChild(option);
  });
}

async function handleCounterChange() {
  selectedCounterKey = counterSelect.value;
  const counter = getSelectedCounter();

  clearRequest();

  if (!counter) {
    counterLabel.textContent = "No counter selected";
    shopkeeperCardLabel.textContent = "Selected shopkeeper";
    shopkeeperBalance.textContent = "-";
    return;
  }

  counterLabel.textContent = counter.location;
  shopkeeperCardLabel.textContent = counter.name;
  await renderBalances();
}

function generateRequest() {
  const counter = getSelectedCounter();
  const amount = Number(amountInput.value);

  if (!counter) {
    showMessage(setupMessage, "Select a shopkeeper counter first.", "error");
    return;
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    showMessage(setupMessage, "Enter a whole token amount greater than zero.", "error");
    return;
  }

  activeRequest = {
    counterKey: counter.key,
    amount,
    createdAt: Date.now(),
  };

  merchantName.textContent = `${counter.name} - ${counter.location}`;
  requestAmount.textContent = `${formatTokens(amount)} tokens`;
  requestCopy.textContent = "Ask the customer to tap their ring to complete this payment.";
  requestState.textContent = "Waiting for ring tap";
  simulateButton.disabled = false;
  setStatus("pending", "Waiting");
  showMessage(setupMessage, "Payment request is ready.", "success");
  showMessage(paymentMessage, "", "");
  flashElement(readyPanel);
  addActivity(`${counter.name} requested ${formatTokens(amount)} tokens.`, "");
}

async function simulateRingTap() {
  const counter = getCounterByKey(activeRequest?.counterKey);
  const amount = Number(activeRequest?.amount);

  if (!counter || !Number.isInteger(amount) || amount <= 0) {
    showMessage(paymentMessage, "Generate a payment request first.", "error");
    return;
  }

  simulateButton.disabled = true;
  setStatus("pending", "Processing");
  requestState.textContent = "Processing ring tap";
  showMessage(paymentMessage, "Customer ring detected. Processing payment...", "");

  try {
    const response = await fetch("/api/esp/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nfc_id: DEMO_CUSTOMER.ringId,
        mac_address: counter.macAddress,
        shopkeeper_id: counter.shopkeeperId,
        amount,
        timestamp: Date.now(),
        lat: 40.7128,
        lng: -74.006,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || result?.status !== "SUCCESS") {
      const message = result?.message || "Payment could not be completed.";
      setStatus("error", "Failed");
      requestState.textContent = "Payment failed";
      showMessage(paymentMessage, message, "error");
      addActivity(`${counter.name} payment failed: ${message}`, "error");
      simulateButton.disabled = false;
      return;
    }

    await applySuccessfulPayment(counter, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    setStatus("error", "Failed");
    requestState.textContent = "Payment failed";
    showMessage(paymentMessage, "Could not reach the payment gateway.", "error");
    addActivity(`Payment failed: ${message}`, "error");
    simulateButton.disabled = false;
  }
}

async function applySuccessfulPayment(counter, result) {
  const customerAfter = Number(result?.balances?.customer?.after);
  const shopkeeperAfter = Number(result?.balances?.shopkeeper?.after);
  const amount = Number(result?.amount);

  if (!Number.isFinite(customerAfter) || !Number.isFinite(shopkeeperAfter)) {
    setStatus("error", "Incomplete");
    requestState.textContent = "Payment status unclear";
    showMessage(paymentMessage, "Payment succeeded, but balance response was incomplete.", "error");
    addActivity("Payment succeeded but balances were not updated on-screen.", "error");
    simulateButton.disabled = false;
    return;
  }

  customerTokens = customerAfter;
  counter.balance = shopkeeperAfter;
  await renderBalances();
  flashElement(customerCard);
  flashElement(shopkeeperCard);
  flashElement(readyPanel);

  setStatus("ok", "Paid");
  requestState.textContent = "Payment complete";
  requestCopy.textContent = "Payment received. Create another request for the next customer.";
  showMessage(paymentMessage, `${formatTokens(amount)} tokens received by ${counter.name}.`, "success");
  addActivity(`${counter.name} received ${formatTokens(amount)} tokens.`, "success");
  activeRequest = null;
}

function clearRequest() {
  activeRequest = null;
  simulateButton.disabled = true;
  requestState.textContent = "No active request";
  merchantName.textContent = "Select a counter";
  requestAmount.textContent = "0 tokens";
  requestCopy.textContent = "Generate a request to show the amount to the customer.";
  setStatus("idle", "Ready");
  showMessage(setupMessage, "", "");
  showMessage(paymentMessage, "", "");
}

async function fetchBalance(userId) {
  try {
    const response = await fetch(`/api/wallet/balance/${userId}`);
    if (!response.ok) throw new Error("Failed to fetch balance");
    const data = await response.json();
    return data.balance;
  } catch (error) {
    console.error("Balance fetch error:", error);
    return null;
  }
}

async function renderBalances() {
  const customerLiveBalance = await fetchBalance(DEMO_CUSTOMER.userId);
  if (customerLiveBalance !== null) {
    customerTokens = customerLiveBalance;
  }
  customerBalance.textContent = formatTokens(customerTokens);

  const counter = getSelectedCounter();
  if (counter) {
    const shopkeeperLiveBalance = await fetchBalance(counter.shopkeeperId);
    if (shopkeeperLiveBalance !== null) {
      counter.balance = shopkeeperLiveBalance;
    }
    shopkeeperBalance.textContent = formatTokens(counter.balance);
  } else {
    shopkeeperBalance.textContent = "-";
  }
}

function getSelectedCounter() {
  return getCounterByKey(selectedCounterKey);
}

function getCounterByKey(key) {
  return COUNTERS.find((counter) => counter.key === key) || null;
}

function setStatus(type, text) {
  posStatus.className = `status-pill ${type}`;
  posStatus.textContent = text;
}

function showMessage(element, message, type) {
  element.textContent = message;
  element.className = type ? `message ${type}` : "message";
}

function addActivity(message, type) {
  eventTotal += 1;
  activityCount.textContent = `${eventTotal} ${eventTotal === 1 ? "event" : "events"}`;

  const item = document.createElement("li");
  if (type) item.className = type;
  item.innerHTML = `<span>${new Date().toLocaleTimeString()}</span><br>${message}`;
  activityList.prepend(item);
}

function flashElement(element) {
  if (!element) return;
  element.classList.remove("updated");
  void element.offsetWidth;
  element.classList.add("updated");
}

function formatTokens(value) {
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}
