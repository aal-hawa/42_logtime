// Background service worker for 42 Logtime Tracker
// Handles API requests to intra.42.fr using the user's existing session cookies

// Try v3 first, fall back to old domain
const PROFILE_DOMAINS = [
  "https://profile-v3.intra.42.fr",
  "https://profile.intra.42.fr",
];

// Cache which domain works
let workingDomain = null;

async function getProfileDomain() {
  if (workingDomain) return workingDomain;
  for (const domain of PROFILE_DOMAINS) {
    try {
      const res = await fetch(domain + "/", { method: "HEAD", credentials: "include" });
      if (res.ok && !res.redirected) {
        workingDomain = domain;
        return domain;
      }
    } catch { /* domain not reachable */ }
  }
  // Default to v3
  workingDomain = PROFILE_DOMAINS[0];
  return workingDomain;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH_LOGTIME") {
    fetchLogtime(message.login)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.type === "FETCH_PROFILE") {
    fetchProfile(message.login)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "FETCH_COALITION") {
    fetchCoalition(message.userId)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "CHECK_LOGIN") {
    checkLogin()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Check if the user is logged into intra.42.fr
 */
async function checkLogin() {
  try {
    const domain = await getProfileDomain();
    const response = await fetch(domain + "/", {
      method: "HEAD",
      credentials: "include",
    });
    if (response.redirected) {
      return { loggedIn: false };
    }
    return { loggedIn: response.ok };
  } catch {
    return { loggedIn: false };
  }
}

/**
 * Fetch logtime data from translate.intra.42.fr
 * This is the same endpoint the intra website uses for the logtime chart
 * Returns: { "2026-05-24": "00:00:00", "2026-05-23": "06:26:58", ... }
 */
async function fetchLogtime(login) {
  const url = `https://translate.intra.42.fr/users/${login}/locations_stats`;
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch logtime: ${response.status}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Fetch user profile from intra.42.fr
 * Parses the HTML profile page to extract user info
 */
async function fetchProfile(login) {
  const domain = await getProfileDomain();
  const url = `${domain}/users/${login}`;
  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch profile: ${response.status}`);
  }

  const html = await response.text();
  return parseProfileHTML(html);
}

/**
 * Parse the intra profile HTML to extract user information
 */
function parseProfileHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const result = {};

  // Extract from inline script: this._user = { "login": "...", "id": ... }
  const scripts = doc.querySelectorAll("script:not([src])");
  for (const script of scripts) {
    const text = script.textContent || "";
    const loginMatch = text.match(/"login"\s*:\s*"([^"]+)"/);
    const idMatch = text.match(/"id"\s*:\s*(\d+)/);
    if (loginMatch) result.login = loginMatch[1];
    if (idMatch) result.userId = parseInt(idMatch[1]);
  }

  // Name
  const nameEl = doc.querySelector(".profile-name .name span, .profile-name span.name");
  if (nameEl) result.name = nameEl.textContent?.trim();

  // Login
  const loginEl = doc.querySelector(".login[data-login]");
  if (loginEl) {
    result.login = result.login || loginEl.getAttribute("data-login");
    result.displayName = loginEl.textContent?.trim();
  }

  // Coalition
  const coalitionEl = doc.querySelector(".coalition-span");
  if (coalitionEl) {
    result.coalitionName = coalitionEl.textContent?.trim();
    result.coalitionColor = coalitionEl.style.color;
  }

  // Wallet
  const walletEl = doc.querySelector(".user-wallet-value");
  if (walletEl) {
    result.wallet = walletEl.textContent?.trim();
  }

  // Correction points
  const correctionEl = doc.querySelector(".user-correction-point-value");
  if (correctionEl) {
    result.correctionPoints = correctionEl.textContent?.trim();
  }

  // Grade
  const gradeEl = doc.querySelector(".user-grade-value");
  if (gradeEl) {
    result.grade = gradeEl.textContent?.trim();
  }

  // Level (from progress bar)
  const progressEl = doc.querySelector(".progress .on-progress");
  if (progressEl) {
    result.levelText = progressEl.textContent?.trim();
  }

  // Current location status
  const locationEl = doc.querySelector(".user-poste-status");
  if (locationEl) {
    result.status = locationEl.textContent?.trim();
  }

  const locationInfoEl = doc.querySelector(".user-poste-infos");
  if (locationInfoEl) {
    result.locationInfo = locationInfoEl.textContent?.trim();
  }

  // Profile image
  const imgEl = doc.querySelector(".user-profile-picture");
  if (imgEl) {
    result.imageUrl = imgEl.style.backgroundImage?.replace(/url\(["']?/, "").replace(/["']?\)/, "");
  }

  return result;
}

/**
 * Fetch coalition info for a user
 */
async function fetchCoalition(userId) {
  try {
    const domain = await getProfileDomain();
    const url = `${domain}/users/${userId}/coalitions`;
    const response = await fetch(url, {
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data;
  } catch {
    return null;
  }
}
