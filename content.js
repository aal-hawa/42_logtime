// Content script: runs on profile.intra.42.fr / profile-v3.intra.42.fr pages
// Extracts the logged-in user's login and fetches data using the page's cookies

(function () {
  // Extract user info from the page
  function extractUserInfo() {
    let login = null;
    let userId = null;

    // Method 1: From the global _user object that intra sets in script tags
    const scripts = document.querySelectorAll("script:not([src])");
    for (const script of scripts) {
      const text = script.textContent || "";
      const loginMatch = text.match(/"login"\s*:\s*"([^"]+)"/);
      const idMatch = text.match(/"id"\s*:\s*(\d+)/);
      if (loginMatch) login = loginMatch[1];
      if (idMatch) userId = parseInt(idMatch[1]);
    }

    // Method 2: From the navbar user menu
    if (!login) {
      const loginSpan = document.querySelector("[data-login]");
      if (loginSpan) {
        login = loginSpan.getAttribute("data-login") || loginSpan.textContent?.trim();
      }
    }

    // Method 3: From profile URL
    if (!login) {
      const profileLink = document.querySelector('a[href*="/users/"]');
      if (profileLink) {
        const match = profileLink.getAttribute("href")?.match(/\/users\/([^/]+)/);
        if (match) login = match[1];
      }
    }

    // Method 4: From the page title or heading
    if (!login) {
      const profileName = document.querySelector(".login[data-login]");
      if (profileName) {
        login = profileName.getAttribute("data-login");
      }
    }

    return { login, userId };
  }

  // Fetch logtime data — runs in the intra page context so cookies are sent automatically
  async function fetchLogtime(login) {
    const url = `https://translate.intra.42.fr/users/${login}/locations_stats`;
    const response = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Failed to fetch logtime: ${response.status}`);
    return await response.json();
  }

  // Fetch profile data — runs in the intra page context so cookies are sent automatically
  async function fetchProfile(login) {
    // Detect which domain we're on
    const origin = window.location.origin;
    const url = `${origin}/users/${login}`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(`Failed to fetch profile: ${response.status}`);
    const html = await response.text();
    return parseProfileHTML(html);
  }

  function parseProfileHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const result = {};

    const scripts = doc.querySelectorAll("script:not([src])");
    for (const script of scripts) {
      const text = script.textContent || "";
      const loginMatch = text.match(/"login"\s*:\s*"([^"]+)"/);
      const idMatch = text.match(/"id"\s*:\s*(\d+)/);
      if (loginMatch) result.login = loginMatch[1];
      if (idMatch) result.userId = parseInt(idMatch[1]);
    }

    const nameEl = doc.querySelector(".profile-name .name span, .profile-name span.name");
    if (nameEl) result.name = nameEl.textContent?.trim();

    const loginEl = doc.querySelector(".login[data-login]");
    if (loginEl) {
      result.login = result.login || loginEl.getAttribute("data-login");
      result.displayName = loginEl.textContent?.trim();
    }

    const coalitionEl = doc.querySelector(".coalition-span");
    if (coalitionEl) {
      result.coalitionName = coalitionEl.textContent?.trim();
      result.coalitionColor = coalitionEl.style.color;
    }

    const imgEl = doc.querySelector(".user-profile-picture");
    if (imgEl) {
      result.imageUrl = imgEl.style.backgroundImage?.replace(/url\(["']?/, "").replace(/["']?\)/, "");
    }

    return result;
  }

  // Send user info to the extension on load
  const userInfo = extractUserInfo();
  if (userInfo.login) {
    chrome.runtime.sendMessage({
      type: "USER_INFO",
      data: userInfo,
    });
  }

  // Listen for requests from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_USER_INFO") {
      const info = extractUserInfo();
      sendResponse(info);
      return true;
    }

    if (message.type === "FETCH_ALL_DATA") {
      const login = message.login || extractUserInfo().login;
      if (!login) {
        sendResponse({ success: false, error: "No login found" });
        return true;
      }

      // Fetch both logtime and profile from the intra page context (cookies work!)
      Promise.allSettled([
        fetchLogtime(login),
        fetchProfile(login),
      ]).then(([logtimeResult, profileResult]) => {
        sendResponse({
          success: true,
          data: {
            login,
            logtime: logtimeResult.status === "fulfilled" ? logtimeResult.value : null,
            profile: profileResult.status === "fulfilled" ? profileResult.value : null,
          },
        });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });

      return true; // Keep channel open for async
    }

    return true;
  });
})();
