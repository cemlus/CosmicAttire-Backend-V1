window.onload = async () => {
  const encryptedId = getEncryptedIdFromPath();
  const nameEl = document.getElementById("display-name");
  const photoEl = document.getElementById("profile-photo");
  const zoneEl = document.getElementById("zone");
  const permissionEl = document.getElementById("permission");
  const timeEl = document.getElementById("time");
  const userIdEl = document.getElementById("user-id");
  const detailsEl = document.getElementById("details");
  const responseEl = document.getElementById("backend-response");

  setResponse(`Route token: ${encryptedId || "missing"}`);

  if (!encryptedId) {
    setBadge("Missing verification link", "denied");
    setResponse("The URL must be /verification-1/:encryptedId.");
    return;
  }

  let data;
  try {
    const res = await fetch(`/api/verify-user-by-id?encryptedId=${encodeURIComponent(encryptedId)}`);

    try {
      data = await res.json();
    } catch (jsonErr) {
      console.error("❌ Failed to parse JSON:", jsonErr);
      setBadge("Invalid server response", "denied");
      return;
    }

    if (!res.ok || data.error) {
      console.warn("❌ Server error or user not found:", data.error);
      setBadge(data.error || "Verification failed", "denied");
      setResponse(JSON.stringify(data, null, 2));
      return;
    }

  } catch (err) {
    console.error("❌ Network error:", err);
    setBadge("Network error", "denied");
    setResponse("Could not reach the backend API.");
    return;
  }

  const granted = data.permission?.toLowerCase() === "yes";
  const name = typeof data.name === "string" ? data.name.trim() : "User";
  const zone = data.zone || "Unknown Zone";
  const permission = data.permission || "unknown";
  const timestamp = data.timestamp || "-";

  if (granted) {
    setBadge("Access Granted", "granted");
  } else {
    setBadge("Access Denied", "denied");
  }

  nameEl.textContent = name;
  nameEl.classList.remove("hidden");

  if (data.image_url) {
    photoEl.src = data.image_url;
    photoEl.classList.remove("hidden");
  } else {
    photoEl.classList.add("hidden");
  }

  zoneEl.textContent = zone;
  permissionEl.textContent = permission;
  timeEl.textContent = timestamp;
  userIdEl.textContent = data.user_id || "-";
  detailsEl.classList.remove("hidden");
  setResponse(JSON.stringify(data, null, 2));
};

function getEncryptedIdFromPath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  return segments[0] === "verification-1" ? segments[1] || "" : segments.at(-1) || "";
}

function setBadge(text, type) {
  const badge = document.getElementById("access-badge");
  badge.textContent = text;
  badge.className = `access-badge ${type}`;
}

function setResponse(text) {
  const responseEl = document.getElementById("backend-response");
  if (responseEl) responseEl.textContent = null;
}
