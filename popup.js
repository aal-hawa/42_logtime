// 42 Logtime Tracker v1.1 — Popup Logic
// Uses chrome.scripting.executeScript to inject fetch into the intra tab directly

// ==================== HELPERS ====================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function parseTimeToMinutes(timeStr) {
  if (!timeStr || timeStr === "00:00:00") return 0;
  const parts = timeStr.split(":").map(Number);
  return parts[0] * 60 + parts[1] + Math.round(parts[2] / 60);
}

function formatHours(minutes) {
  if (minutes === 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDecimal(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}.${m.toString().padStart(2, "0")}`;
}

function getHoursColor(minutes) {
  const hours = minutes / 60;
  if (hours >= 6) return "#10b981";
  if (hours >= 4) return "#22c55e";
  if (hours >= 2) return "#f59e0b";
  if (hours >= 1) return "#f97316";
  if (minutes > 0) return "#ef4444";
  return "#2a2a2e";
}

function getHeatClass(minutes, threshold) {
  if (minutes === 0) return "zero";
  const hours = minutes / 60;
  if (hours < 1) return "low";
  if (hours < (threshold || 3)) return "medium";
  if (hours < (threshold || 3) * 2) return "good";
  return "great";
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function formatDate(d) {
  // Use LOCAL date components (not UTC) so timezone offset doesn't shift the date
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getWeekDates(offset = 0) {
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return { monday, sunday, days };
}

function getMonthDates(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return { firstDay, lastDay, days };
}

// ==================== SETTINGS ====================
// Default: 160h/month, 5 available days (Mon-Fri)
// Weekly goal = monthly / 30 * availableDaysPerWeek

const DEFAULT_SETTINGS = {
  monthlyGoalHours: 160,
  activeThresholdHours: 1,
  availableDays: [1, 2, 3, 4, 5], // 1=Mon ... 7=Sun
};

function getWeeklyGoal(settings) {
  return (settings.monthlyGoalHours * 7) / 30;
}

function getDailyTarget(settings) {
  const availCount = (settings.availableDays || [1,2,3,4,5]).length;
  return availCount > 0 ? getWeeklyGoal(settings) / availCount : 0;
}

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get("settings", (result) => {
      resolve({ ...DEFAULT_SETTINGS, ...(result.settings || {}) });
    });
  });
}

async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings }, resolve);
  });
}

// ==================== STATE ====================

let loginData = null;
let logtimeData = null;
let profileData = null;
let settings = null;

// ==================== MAIN ====================

document.addEventListener("DOMContentLoaded", init);

async function init() {
  showState("loading");
  settings = await loadSettings();

  try {
    const intraTab = await findIntraTab();
    if (!intraTab) {
      throw new Error("NO_INTRA_TAB");
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: intraTab.id },
      func: fetchAllFromIntraPage,
    });

    const data = results?.[0]?.result;
    if (!data || !data.login) {
      throw new Error("NOT_LOGGED_IN");
    }

    loginData = { login: data.login };
    logtimeData = data.logtime;
    profileData = data.profile;

    if (!logtimeData) {
      throw new Error("Failed to fetch logtime");
    }

    renderDashboard();
    showState("dashboard");

  } catch (err) {
    console.error("Init error:", err);
    showState("error");
  }
}

// ==================== INTRA TAB DETECTION ====================

async function findIntraTab() {
  const tabs = await chrome.tabs.query({});
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeIntra = activeTabs.find(t =>
    t.url?.includes(".intra.42.fr")
  );
  if (activeIntra) return activeIntra;
  return tabs.find(t =>
    t.url?.includes(".intra.42.fr")
  ) || null;
}

// ==================== THIS FUNCTION RUNS INSIDE THE INTRA PAGE ====================

function fetchAllFromIntraPage() {
  let login = null;
  let userId = null;

  const scripts = document.querySelectorAll("script:not([src])");
  for (const script of scripts) {
    const text = script.textContent || "";
    const loginMatch = text.match(/"login"\s*:\s*"([^"]+)"/);
    const idMatch = text.match(/"id"\s*:\s*(\d+)/);
    if (loginMatch) login = loginMatch[1];
    if (idMatch) userId = parseInt(idMatch[1]);
  }

  if (!login) {
    const loginSpan = document.querySelector("[data-login]");
    if (loginSpan) login = loginSpan.getAttribute("data-login") || loginSpan.textContent?.trim();
  }

  if (!login) {
    const profileLink = document.querySelector('a[href*="/users/"]');
    if (profileLink) {
      const match = profileLink.getAttribute("href")?.match(/\/users\/([^/]+)/);
      if (match) login = match[1];
    }
  }

  if (!login) return { login: null };

  return Promise.all([
    fetch(`https://translate.intra.42.fr/users/${login}/locations_stats`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }).then(r => r.ok ? r.json() : null),

    fetch(`https://profile.intra.42.fr/users/${login}`, {
      credentials: "include",
    }).then(r => r.ok ? r.text() : null),
  ]).then(([logtime, profileHtml]) => {
    let profile = null;
    if (profileHtml) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(profileHtml, "text/html");
      profile = { login, userId };

      const nameEl = doc.querySelector(".profile-name .name span, .profile-name span.name");
      if (nameEl) profile.name = nameEl.textContent?.trim();

      const coalitionEl = doc.querySelector(".coalition-span");
      if (coalitionEl) {
        profile.coalitionName = coalitionEl.textContent?.trim();
        profile.coalitionColor = coalitionEl.style.color;
      }

      const imgEl = doc.querySelector(".user-profile-picture");
      if (imgEl) {
        profile.imageUrl = imgEl.style.backgroundImage?.replace(/url\(["']?/, "").replace(/["']?\)/, "");
      }
    }

    return { login, logtime, profile };
  });
}

// ==================== RENDERING ====================

function renderDashboard() {
  renderHeader();
  renderCurrentMonth();
  renderPrevMonth();
  renderWeeklyGrid();
  renderDaysList();
  renderDebugPanel();
  bindSettings();
}

function renderHeader() {
  $("#user-login").textContent = `@${loginData.login}`;
  $("#refresh-btn").onclick = () => { showState("loading"); init(); };
  $("#settings-btn").onclick = () => { showState("settings"); renderSettingsPanel(); };
}

// ==================== CURRENT MONTH ====================

function renderCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const { firstDay, lastDay, days } = getMonthDates(year, month);
  const todayStr = formatDate(now);

  // Labels
  $("#current-month-label").textContent = MONTH_NAMES[month];
  $("#current-month-range").textContent = `${formatDateShort(formatDate(firstDay))} – ${formatDateShort(formatDate(lastDay))}`;

  // Calculate stats
  let totalMinutes = 0;
  let activeDays = 0;
  let bestDayMinutes = 0;
  let bestDayStr = "";
  let daysWithData = 0;
  let todayMinutes = 0;
  let passedAvailDays = 0;

  const availDays = settings.availableDays || [1,2,3,4,5];

  days.forEach(d => {
    const dateStr = formatDate(d);
    const timeStr = logtimeData[dateStr] || "00:00:00";
    const mins = parseTimeToMinutes(timeStr);

    // Use string comparison: only sum days up to and including today
    if (dateStr <= todayStr) {
      daysWithData++;
      
      const jsDay = d.getDay() === 0 ? 7 : d.getDay();
      if (availDays.includes(jsDay)) passedAvailDays++;

      if (mins > 0) {
        totalMinutes += mins;
        activeDays++;
        if (mins > bestDayMinutes) {
          bestDayMinutes = mins;
          bestDayStr = formatDateShort(dateStr);
        }
      }
      if (dateStr === todayStr) {
        todayMinutes = mins;
      }
    }
  });

  console.log(`[Logtime] Today: ${todayStr}, todayMinutes: ${todayMinutes}, totalMinutes: ${totalMinutes}, activeDays: ${activeDays}`);

  const totalHours = totalMinutes / 60;
  const goalHours = settings.monthlyGoalHours;
  const remainingMinutes = Math.max(0, goalHours * 60 - totalMinutes);
  const remainingHours = remainingMinutes / 60;
  const dailyAvg = passedAvailDays > 0 ? totalHours / passedAvailDays : 0;

  // Calculate available days left in the month
  let availDaysLeft = 0;
  for (let d = new Date(now); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const jsDay = d.getDay() === 0 ? 7 : d.getDay(); // 1=Mon...7=Sun
    if (availDays.includes(jsDay)) availDaysLeft++;
  }
  availDaysLeft = Math.max(1, availDaysLeft);
  const neededPerAvailDay = remainingMinutes > 0 ? remainingHours / availDaysLeft : 0;

  const percent = goalHours > 0 ? Math.min(100, Math.round((totalHours / goalHours) * 100)) : 0;

  // Ring
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (percent / 100) * circumference;
  const ring = $("#month-ring");
  ring.style.strokeDashoffset = offset;
  ring.style.stroke = percent >= 100 ? "#10b981" : percent >= 50 ? "#f59e0b" : "#ef4444";

  // Ring text
  $("#month-hours").textContent = formatDecimal(totalMinutes) + "h";
  $("#month-goal-label").textContent = `/ ${goalHours}h`;

  // Details
  $("#month-goal").textContent = `${goalHours}h`;
  $("#month-done").textContent = `${formatDecimal(totalMinutes)}h`;
  const remEl = $("#month-remaining");
  remEl.textContent = remainingMinutes > 0 ? `${formatDecimal(remainingMinutes)}h` : "✅ Done!";
  remEl.className = `detail-value ${remainingMinutes > 0 ? (remainingHours > goalHours * 0.5 ? "negative" : "warning") : "positive"}`;

  const avgEl = $("#month-daily-avg");
  avgEl.textContent = `${formatDecimal(dailyAvg * 60)}h`;
  avgEl.className = `detail-value ${dailyAvg >= 2 ? "positive" : dailyAvg >= 1 ? "warning" : "negative"}`;

  // Show/hide goal-only rows and banner
  const goalOnlyRows = $$(".goal-only");
  const goalBanner = $("#goal-reached-banner");
  if (remainingMinutes > 0) {
    goalOnlyRows.forEach(r => r.style.display = "");
    goalBanner.classList.add("hidden");

    const needEl = $("#month-needed-day");
    needEl.textContent = `${formatDecimal(neededPerAvailDay * 60)}h`;
    needEl.className = `detail-value ${neededPerAvailDay > 8 ? "negative" : neededPerAvailDay > 5 ? "warning" : "positive"}`;

    // Days left = available days left
    const daysLeftEl = $("#month-days-left");
    daysLeftEl.textContent = `${availDaysLeft} avail`;
    daysLeftEl.className = `detail-value ${availDaysLeft <= 3 ? "negative" : availDaysLeft <= 7 ? "warning" : ""}`;
  } else {
    goalOnlyRows.forEach(r => r.style.display = "none");
    goalBanner.classList.remove("hidden");
  }

  $("#month-active-days").textContent = `${activeDays} / ${daysWithData}`;
  $("#month-best-day").textContent = bestDayStr ? `${formatDecimal(bestDayMinutes)}h (${bestDayStr})` : "—";

  // Show today's contribution in the month details
  const todayDetailEl = $("#month-today-hours");
  if (todayDetailEl) {
    todayDetailEl.textContent = todayMinutes > 0 ? formatDecimal(todayMinutes) + "h" : "0h";
    todayDetailEl.style.color = todayMinutes > 0 ? getHoursColor(todayMinutes) : "var(--text-muted)";
  }

  // Heatmap
  renderMonthHeatmap("current-month-heatmap", year, month, now);
}

// ==================== PREV MONTH ====================

function renderPrevMonth() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() - 1;
  if (month < 0) { month = 11; year--; }
  const { firstDay, lastDay, days } = getMonthDates(year, month);

  $("#prev-month-label").textContent = MONTH_NAMES[month];
  $("#prev-month-range").textContent = `${formatDateShort(formatDate(firstDay))} – ${formatDateShort(formatDate(lastDay))}`;

  let totalMinutes = 0;
  let activeDays = 0;
  let bestDayMinutes = 0;
  const totalDays = days.length;

  days.forEach(d => {
    const dateStr = formatDate(d);
    const timeStr = logtimeData[dateStr] || "00:00:00";
    const mins = parseTimeToMinutes(timeStr);
    totalMinutes += mins;
    if (mins / 60 >= settings.activeThresholdHours) activeDays++;
    if (mins > bestDayMinutes) bestDayMinutes = mins;
  });

  const totalHours = totalMinutes / 60;
  const dailyAvg = totalDays > 0 ? totalHours / totalDays : 0;
  const goalPct = settings.monthlyGoalHours > 0 ? Math.round((totalHours / settings.monthlyGoalHours) * 100) : 0;

  $("#prev-total").textContent = formatDecimal(totalMinutes) + "h";
  $("#prev-total").style.color = getHoursColor(totalMinutes);
  $("#prev-avg").textContent = formatDecimal(dailyAvg * 60) + "h";
  $("#prev-active").textContent = activeDays.toString();
  $("#prev-best").textContent = bestDayMinutes > 0 ? formatDecimal(bestDayMinutes) + "h" : "—";
  const goalPctEl = $("#prev-goal-pct");
  goalPctEl.textContent = goalPct + "%";
  goalPctEl.style.color = goalPct >= 100 ? "#10b981" : goalPct >= 50 ? "#f59e0b" : "#ef4444";

  renderMonthHeatmap("prev-month-heatmap", year, month, null);
}

// ==================== MONTH HEATMAP ====================

function renderMonthHeatmap(containerId, year, month, now) {
  const container = $(`#${containerId}`);
  container.innerHTML = "";

  const { firstDay, days } = getMonthDates(year, month);
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7;
  const todayStr = now ? formatDate(now) : null;

  DAY_LETTERS.forEach(d => {
    const label = document.createElement("div");
    label.className = "heat-label";
    label.textContent = d;
    container.appendChild(label);
  });

  for (let i = 0; i < firstDayOfWeek; i++) {
    const empty = document.createElement("div");
    empty.className = "heat-cell empty";
    container.appendChild(empty);
  }

  days.forEach(d => {
    const dateStr = formatDate(d);
    const timeStr = logtimeData[dateStr] || "00:00:00";
    const mins = parseTimeToMinutes(timeStr);
    const isToday = dateStr === todayStr;
    const isFuture = now && d > now;

    const cell = document.createElement("div");
    let cls = isFuture ? "future" : getHeatClass(mins, settings.activeThresholdHours);
    if (isToday) cls += " today";
    cell.className = `heat-cell ${cls}`;
    cell.title = `${formatDateShort(dateStr)}: ${mins > 0 ? formatHours(mins) : "0h"}`;
    container.appendChild(cell);
  });
}

// ==================== WEEKLY GRID ====================

function renderWeeklyGrid() {
  const { monday, sunday, days } = getWeekDates(0);
  const rangeEl = $("#week-range");
  rangeEl.textContent = `${formatDateShort(formatDate(monday))} – ${formatDateShort(formatDate(sunday))}`;

  const weeklyGoal = getWeeklyGoal(settings);
  $("#weekly-goal-display").textContent = formatDecimal(weeklyGoal * 60) + "h";

  const gridEl = $("#weekly-grid");
  gridEl.innerHTML = "";
  const todayStr = formatDate(new Date());
  let totalMinutes = 0;

  days.forEach((day, i) => {
    const dateStr = formatDate(day);
    const timeStr = logtimeData[dateStr] || "00:00:00";
    const minutes = parseTimeToMinutes(timeStr);
    totalMinutes += minutes;
    const isToday = dateStr === todayStr;
    const pct = Math.min(100, (minutes / (8 * 60)) * 100);

    const cell = document.createElement("div");
    cell.className = `day-cell${isToday ? " today" : ""}`;
    cell.innerHTML = `
      <span class="day-label">${DAY_NAMES[i]}</span>
      <span class="day-hours" style="color:${getHoursColor(minutes)}">
        ${minutes > 0 ? formatDecimal(minutes) + "h" : "—"}
      </span>
      <div class="day-bar">
        <div class="day-bar-fill" style="width:${pct}%;background:${getHoursColor(minutes)}"></div>
      </div>`;
    gridEl.appendChild(cell);
  });

  const totalEl = $("#weekly-total-hours");
  totalEl.textContent = formatDecimal(totalMinutes) + "h";
  const weekPct = weeklyGoal > 0 ? Math.min(100, Math.round((totalMinutes / 60 / weeklyGoal) * 100)) : 0;
  const progressEl = $("#weekly-progress");
  progressEl.style.width = weekPct + "%";
  progressEl.style.background = weekPct >= 80 ? "#10b981" : weekPct >= 50 ? "#f59e0b" : "#ef4444";
  $("#weekly-percent").textContent = weekPct + "%";
}

// ==================== DAYS LIST ====================

function renderDaysList() {
  const listEl = $("#days-list");
  listEl.innerHTML = "";
  const now = new Date();
  const todayStr = formatDate(now);

  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = formatDate(d);
    const timeStr = logtimeData[dateStr] || "00:00:00";
    const minutes = parseTimeToMinutes(timeStr);
    const isToday = dateStr === todayStr;
    const pct = Math.min(100, (minutes / 60 / 10) * 100);

    const row = document.createElement("div");
    row.className = "day-row";
    row.innerHTML = `
      <span class="day-row-date" style="${isToday ? 'color:var(--accent);font-weight:600' : ''}">
        ${isToday ? "Today" : formatDateShort(dateStr)}
      </span>
      <div class="day-row-bar-container">
        <div class="day-row-bar" style="width:${pct}%;background:${getHoursColor(minutes)}"></div>
      </div>
      <span class="day-row-hours" style="color:${minutes > 0 ? getHoursColor(minutes) : 'var(--text-muted)'}">
        ${minutes > 0 ? formatHours(minutes) : "—"}
      </span>`;
    listEl.appendChild(row);
  }
}

// ==================== SETTINGS PANEL ====================

function bindSettings() {
  // Bound after rendering settings panel
}

function renderSettingsPanel() {
  $("#setting-monthly-goal").value = settings.monthlyGoalHours;
  $("#setting-active-threshold").value = settings.activeThresholdHours;

  // Set day picker buttons
  const availDays = settings.availableDays || [1,2,3,4,5];
  $$("#day-picker .day-pick-btn").forEach(btn => {
    const day = parseInt(btn.dataset.day);
    btn.classList.toggle("active", availDays.includes(day));
  });

  updateWeeklyCalc();

  // Toggle day buttons
  $$("#day-picker .day-pick-btn").forEach(btn => {
    btn.onclick = () => {
      btn.classList.toggle("active");
      updateWeeklyCalc();
    };
  });

  // Update calc when monthly goal changes
  $("#setting-monthly-goal").oninput = () => updateWeeklyCalc();

  $("#settings-back").onclick = () => { showState("dashboard"); };

  $("#save-settings").onclick = async () => {
    const monthly = parseFloat($("#setting-monthly-goal").value) || 160;
    const threshold = parseFloat($("#setting-active-threshold").value) || 1;
    const selectedDays = [];
    $$("#day-picker .day-pick-btn.active").forEach(btn => {
      selectedDays.push(parseInt(btn.dataset.day));
    });

    settings.monthlyGoalHours = monthly;
    settings.activeThresholdHours = threshold;
    settings.availableDays = selectedDays.length > 0 ? selectedDays : [1,2,3,4,5];

    await saveSettings(settings);
    showToast("Settings saved!");

    renderCurrentMonth();
    renderPrevMonth();
    renderWeeklyGrid();

    setTimeout(() => showState("dashboard"), 800);
  };
}

function updateWeeklyCalc() {
  const monthly = parseFloat($("#setting-monthly-goal").value) || 160;
  const activeBtns = $$("#day-picker .day-pick-btn.active");
  const daysCount = activeBtns.length || 1;
  const weekly = (monthly * 7) / 30;

  $("#calc-weekly").textContent = formatDecimal(weekly * 60) + "h";
  $("#calc-days-count").textContent = daysCount;
}

function showToast(message) {
  const existing = $(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// ==================== DEBUG PANEL ====================

function renderDebugPanel() {
  const apiUrl = `https://translate.intra.42.fr/users/${loginData.login}/locations_stats`;
  const now = new Date();
  const todayStr = formatDate(now);

  // Show the API URL
  $("#debug-url").textContent = `🔗 ${apiUrl}`;

  // Show today's key and what the API has for it
  const todayApiValue = logtimeData ? logtimeData[todayStr] : null;
  $("#debug-today-key").innerHTML =
    `📅 Today key (local): <strong>${todayStr}</strong> → API value: <strong>${todayApiValue ?? "NOT FOUND"}</strong>` +
    `<br>🕐 Browser now: ${now.toString()}` +
    `<br>🕐 ISO string: ${now.toISOString()}`;

  // Show all logtime data keys (last 30 days for readability)
  const dataEl = $("#debug-data");
  if (logtimeData) {
    const keys = Object.keys(logtimeData).sort().reverse();
    let html = `Total keys: ${keys.length}\n\n`;
    keys.slice(0, 30).forEach(k => {
      const isToday = k === todayStr;
      const cls = isToday ? 'today-entry' : '';
      html += `<span class="${cls}">${k}: ${logtimeData[k]}${isToday ? ' ← TODAY' : ''}</span>\n`;
    });
    if (keys.length > 30) html += `\n... and ${keys.length - 30} more`;
    dataEl.innerHTML = html;
  } else {
    dataEl.textContent = "No logtime data loaded";
  }

  // Toggle debug panel visibility
  const panel = $("#debug-panel");
  const toggle = $("#debug-toggle");
  panel.style.display = "none"; // collapsed by default
  toggle.onclick = () => {
    const isHidden = panel.style.display === "none";
    panel.style.display = isHidden ? "block" : "none";
    toggle.textContent = isHidden ? "▲" : "▼";
  };
}

// ==================== UI HELPERS ====================

function showState(state) {
  ["loading", "error", "dashboard", "settings"].forEach(s => {
    const el = $(`#${s}`);
    if (el) el.classList.toggle("hidden", s !== state);
  });
}

document.addEventListener("click", (e) => {
  if (e.target.id === "retry-btn") { showState("loading"); init(); }
});
