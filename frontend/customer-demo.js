const DEMO_CUSTOMER = {
  name: "Siddhant",
  email: "customer@example.com",
  password: "password123",
  nfcId: "NFC_CUSTOMER_DEMO",
  balance: 750,
};

const SHOPKEEPERS = [
  {
    key: "luna",
    name: "Luna Coffee",
    category: "Cafe",
    location: "Counter A",
    balance: 120,
    macAddress: "PAY:LUNA:COFFEE:01",
    shopkeeperId: "b11886bb-3f43-4139-8e5a-4bbb15f44912",
  },
  {
    key: "nova",
    name: "Nova Merch",
    category: "Merchandise",
    location: "Booth B",
    balance: 300,
    macAddress: "PAY:NOVA:MERCH:01",
    shopkeeperId: "4f35bc3f-163d-4498-9885-cb44f8dd3b20",
  },
];

const loginScreen = document.getElementById("login-screen");
const paymentScreen = document.getElementById("payment-screen");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const customerNameEl = document.getElementById("customer-name");
const customerBalanceCard = document.getElementById("customer-balance-card");
const customerBalanceEl = document.getElementById("customer-balance");
const shopkeeperListEl = document.getElementById("shopkeeper-list");
const selectedShopkeeperLabel = document.getElementById("selected-shopkeeper-label");
const amountInput = document.getElementById("amount");
const payButton = document.getElementById("pay-button");
const paymentMessage = document.getElementById("payment-message");
const transferDot = document.getElementById("transfer-dot");
const transferCopy = document.getElementById("transfer-copy");
const activityList = document.getElementById("activity-list");
const activityCount = document.getElementById("activity-count");

let customerBalance = DEMO_CUSTOMER.balance;
let selectedShopkeeperKey = "";
let activityTotal = 0;

document.addEventListener("DOMContentLoaded", () => {
  customerNameEl.textContent = DEMO_CUSTOMER.name;
  renderCustomerBalance();
  renderShopkeepers();
  loginForm.addEventListener("submit", handleLogin);
  payButton.addEventListener("click", handlePayment);
  amountInput.addEventListener("input", updateTransferCopy);
  updateTransferCopy();
});

function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;

  if (email !== DEMO_CUSTOMER.email || password !== DEMO_CUSTOMER.password) {
    loginMessage.textContent = "Use the seeded demo customer credentials.";
    loginMessage.className = "form-message error";
    return;
  }

  loginMessage.textContent = "";
  loginScreen.classList.add("hidden");
  paymentScreen.classList.remove("hidden");
  addActivity("Signed in to demo wallet.", "success");
}

function renderShopkeepers() {
  shopkeeperListEl.innerHTML = "";

  SHOPKEEPERS.forEach((shopkeeper) => {
    const card = document.createElement("article");
    card.className = "shopkeeper-card";
    card.dataset.shopkeeperKey = shopkeeper.key;
    card.innerHTML = `
      <span>${shopkeeper.category}</span>
      <h3>${shopkeeper.name}</h3>
      <div class="shopkeeper-meta">
        <span>${shopkeeper.location}</span>
        <span>Available now</span>
      </div>
      <div class="shopkeeper-balance" data-balance-for="${shopkeeper.key}">
        Balance: ${formatTokens(shopkeeper.balance)}
      </div>
    `;
    card.addEventListener("click", () => selectShopkeeper(shopkeeper.key));
    shopkeeperListEl.appendChild(card);
  });
}

function selectShopkeeper(key) {
  selectedShopkeeperKey = key;
  const shopkeeper = getSelectedShopkeeper();
  selectedShopkeeperLabel.textContent = shopkeeper.name;
  payButton.disabled = false;

  document.querySelectorAll(".shopkeeper-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.shopkeeperKey === key);
  });

  paymentMessage.textContent = "";
  paymentMessage.className = "form-message";
  updateTransferCopy();
}

async function handlePayment() {
  const shopkeeper = getSelectedShopkeeper();
  const amount = Number(amountInput.value);

  if (!shopkeeper) {
    showPaymentMessage("Choose a shopkeeper first.", "error");
    return;
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    showPaymentMessage("Enter a whole token amount greater than zero.", "error");
    return;
  }

  payButton.disabled = true;
  showPaymentMessage(`Sending ${formatTokens(amount)} tokens to ${shopkeeper.name}...`, "");
  startTransferAnimation();

  try {
    const response = await fetch("/api/esp/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nfc_id: DEMO_CUSTOMER.nfcId,
        mac_address: shopkeeper.macAddress,
        shopkeeper_id: shopkeeper.shopkeeperId,
        amount,
        timestamp: Date.now(),
        lat: 40.7128,
        lng: -74.006,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || result?.status !== "SUCCESS") {
      const message = result?.message || "Payment could not be completed.";
      showPaymentMessage(message, "error");
      addActivity(`${shopkeeper.name} payment failed: ${message}`, "error");
      return;
    }

    applySuccessfulPayment(shopkeeper, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    showPaymentMessage("Could not reach the payment gateway.", "error");
    addActivity(`Payment failed: ${message}`, "error");
  } finally {
    payButton.disabled = !selectedShopkeeperKey;
  }
}

function applySuccessfulPayment(shopkeeper, result) {
  const customerAfter = Number(result?.balances?.customer?.after);
  const shopkeeperAfter = Number(result?.balances?.shopkeeper?.after);
  const amount = Number(result?.amount);

  if (!Number.isFinite(customerAfter) || !Number.isFinite(shopkeeperAfter)) {
    showPaymentMessage("Payment succeeded, but the balance response was incomplete.", "error");
    addActivity("Payment succeeded but the visible balances were not updated.", "error");
    return;
  }

  customerBalance = customerAfter;
  shopkeeper.balance = shopkeeperAfter;
  renderCustomerBalance();
  renderShopkeeperBalance(shopkeeper);
  flashElement(customerBalanceCard);
  flashElement(document.querySelector(`[data-shopkeeper-key="${shopkeeper.key}"]`));

  showPaymentMessage(`${formatTokens(amount)} tokens sent to ${shopkeeper.name}.`, "success");
  addActivity(`${formatTokens(amount)} tokens sent to ${shopkeeper.name}.`, "success");
}

function renderCustomerBalance() {
  customerBalanceEl.textContent = formatTokens(customerBalance);
}

function renderShopkeeperBalance(shopkeeper) {
  const balanceEl = document.querySelector(`[data-balance-for="${shopkeeper.key}"]`);
  if (balanceEl) {
    balanceEl.textContent = `Balance: ${formatTokens(shopkeeper.balance)}`;
  }
}

function getSelectedShopkeeper() {
  return SHOPKEEPERS.find((shopkeeper) => shopkeeper.key === selectedShopkeeperKey) || null;
}

function showPaymentMessage(message, type) {
  paymentMessage.textContent = message;
  paymentMessage.className = type ? `form-message ${type}` : "form-message";
}

function addActivity(message, type) {
  activityTotal += 1;
  activityCount.textContent = `${activityTotal} ${activityTotal === 1 ? "payment" : "payments"}`;

  const item = document.createElement("li");
  item.className = type;
  item.innerHTML = `<span>${new Date().toLocaleTimeString()}</span><br>${message}`;
  activityList.prepend(item);
}

function updateTransferCopy() {
  const shopkeeper = getSelectedShopkeeper();
  const amount = Number(amountInput.value);

  if (!shopkeeper) {
    transferCopy.textContent = "Ready";
    return;
  }

  transferCopy.textContent = `${formatTokens(amount || 0)} to ${shopkeeper.name}`;
}

function startTransferAnimation() {
  transferDot.classList.remove("active");
  void transferDot.offsetWidth;
  transferDot.classList.add("active");
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
