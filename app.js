console.log("Flow Planner Loaded");

const main = document.querySelector("main");
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const escapeHTML = (value = "") => String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const byDate = (a, b) => String(a.date || a.dueDate || a.targetDate || "").localeCompare(String(b.date || b.dueDate || b.targetDate || ""));

let toastTimeout = null;
function showToast(message) {
  let toast = document.getElementById("appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

const DataService = {
  KEYS: {
    PLANNER_DATA: "flowPlannerData",
    SCHEDULE_DATA: "flowScheduleData",
    SYSTEMS_DATA: "flowSystemsData",
    SOCIAL_DATA: "flowSocialData",
    ALL_ZIP_DATA: "flowAllZipData",
    ALL_ZIP_CUSTOM_OPTIONS: "flowAllZipCustomOptions"
  },
  get(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
  },
  set(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  },
  mergeArrays(localArray = [], remoteArray = []) {
    const map = new Map();
    [...localArray, ...remoteArray].forEach(item => {
      if (!item) return;
      const id = item.id || createId("item");
      const existing = map.get(id);
      const existingTime = Date.parse(existing?.updatedAt || existing?.createdAt || 0) || 0;
      const itemTime = Date.parse(item.updatedAt || item.createdAt || 0) || 0;
      map.set(id, !existing || itemTime >= existingTime ? { ...item, id } : existing);
    });
    return [...map.values()];
  },
  getAll() {
    return {
      plannerData: this.get(this.KEYS.PLANNER_DATA),
      scheduleData: this.get(this.KEYS.SCHEDULE_DATA),
      systemsData: this.get(this.KEYS.SYSTEMS_DATA),
      socialData: this.get(this.KEYS.SOCIAL_DATA),
      allZipData: this.get(this.KEYS.ALL_ZIP_DATA),
      allZipCustomOptions: this.get(this.KEYS.ALL_ZIP_CUSTOM_OPTIONS)
    };
  },
  saveAll() {
    this.set(this.KEYS.PLANNER_DATA, plannerData);
    this.set(this.KEYS.SCHEDULE_DATA, scheduleData);
    this.set(this.KEYS.SYSTEMS_DATA, systemsData);
    this.set(this.KEYS.SOCIAL_DATA, socialData);
    this.set(this.KEYS.ALL_ZIP_DATA, allZipData);
    this.set(this.KEYS.ALL_ZIP_CUSTOM_OPTIONS, allZipCustomOptions);
  },
  savePlannerData(data) { plannerData = data; return this.persist({ plannerData }); },
  saveScheduleData(data) { scheduleData = normalizeScheduleData(data); return this.persist({ scheduleData }); },
  saveSystemsData(data) { systemsData = normalizeSystemsData(data); return this.persist({ systemsData }); },
  saveSocialData(data) { socialData = normalizeSocialData(data); return this.persist({ socialData }); },
  saveAllZipData(data) { allZipData = Array.isArray(data) ? data : []; return this.persist({ allZipData }); },
  saveAllZipCustomOptions(data) { allZipCustomOptions = data || {}; return this.persist({ allZipCustomOptions }); },
  persist(partial = {}) {
    if (partial.plannerData) this.set(this.KEYS.PLANNER_DATA, partial.plannerData);
    if (partial.scheduleData) this.set(this.KEYS.SCHEDULE_DATA, partial.scheduleData);
    if (partial.systemsData) this.set(this.KEYS.SYSTEMS_DATA, partial.systemsData);
    if (partial.socialData) this.set(this.KEYS.SOCIAL_DATA, partial.socialData);
    if (partial.allZipData) this.set(this.KEYS.ALL_ZIP_DATA, partial.allZipData);
    if (partial.allZipCustomOptions) this.set(this.KEYS.ALL_ZIP_CUSTOM_OPTIONS, partial.allZipCustomOptions);
    this.syncToSupabase();
    return true;
  },
  exportAllData() {
    return JSON.stringify({ plannerData, scheduleData, systemsData, socialData, allZipData, allZipCustomOptions, exportedAt: nowISO(), version: "personal-planning-v1" }, null, 2);
  },
  importAllData(jsonString) {
    const incoming = JSON.parse(jsonString);
    const migrated = migrateImportedData(incoming);
    plannerData = migrated.plannerData;
    scheduleData = migrated.scheduleData;
    systemsData = migrated.systemsData;
    socialData = migrated.socialData;
    allZipData = migrated.allZipData;
    allZipCustomOptions = migrated.allZipCustomOptions;
    this.saveAll();
    renderCurrentPage();
    return true;
  },
  async loadFromSupabase() {
    if (!window.flowSupabaseStorage?.enabled) return null;
    const localData = { plannerData, scheduleData, systemsData, socialData, allZipData, allZipCustomOptions };
    const result = await window.flowSupabaseStorage.syncFromCloud?.(localData);
    if (!result?.success || !result.data) return null;
    const merged = window.flowSupabaseStorage.mergeCloudAndLocalData?.(localData, result.data) || result.data;
    const migrated = migrateImportedData(merged);
    plannerData = migrated.plannerData;
    scheduleData = migrated.scheduleData;
    systemsData = migrated.systemsData;
    socialData = migrated.socialData;
    allZipData = migrated.allZipData;
    allZipCustomOptions = migrated.allZipCustomOptions;
    this.saveAll();
    return result.data;
  },
  async syncToSupabase() {
    if (!window.flowSupabaseStorage?.enabled) return false;
    try {
      const result = await window.flowSupabaseStorage.syncToCloud?.({ plannerData, scheduleData, systemsData, socialData, allZipData, allZipCustomOptions, updatedAt: nowISO() });
      return Boolean(result?.success);
    } catch (error) {
      return false;
    }
  }
};

function normalizeStatus(status = "Not Started") {
  const value = String(status).toLowerCase();
  if (value.includes("complete") || value === "done") return "Complete";
  if (value.includes("progress") || value.includes("started")) return "In Progress";
  return "Not Started";
}

function normalizeTask(item = {}) {
  const completedAt = item.completedAt || item.completedDate || (normalizeStatus(item.status) === "Complete" ? item.updatedAt || item.dueDate || nowISO() : "");
  return {
    id: item.id || createId("task"),
    title: item.title || item.name || item.objective || "Untitled task",
    dueDate: item.dueDate || item.date || item.deadline || "",
    priority: item.priority || "Medium",
    status: normalizeStatus(item.status),
    notes: item.notes || item.description || "",
    linkedGoalId: item.linkedGoalId || "",
    linkedBlockId: item.linkedBlockId || item.linkedPlannerBlockId || "",
    completedAt,
    history: Array.isArray(item.history) ? item.history : completedAt ? [{ status: "Complete", date: completedAt }] : [],
    createdAt: item.createdAt || nowISO(),
    updatedAt: item.updatedAt || nowISO()
  };
}

const HABIT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function normalizeHabitScheduleEntry(entry = {}, fallback = {}) {
  const day = entry.day || "";
  const dayIndex = HABIT_DAY_NAMES.indexOf(day);
  const startTime = entry.startTime || fallback.startTime || "09:00";
  const durationMinutes = Number(entry.durationMinutes ?? fallback.durationMinutes) || 30;
  let endTime = entry.endTime || fallback.endTime || "";
  if (!endTime) endTime = minutesToTime(parseTimeToMinutes(startTime) + durationMinutes);
  const computedDuration = Math.max(15, parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime));
  return {
    day,
    dayIndex: dayIndex >= 0 ? dayIndex : undefined,
    startTime,
    endTime,
    durationMinutes: entry.endTime ? computedDuration : durationMinutes,
    calendarSync: entry.calendarSync === undefined ? Boolean(fallback.calendarSync) : Boolean(entry.calendarSync)
  };
}

function buildHabitScheduleFromLegacy(item = {}) {
  const daysOfWeek = Array.isArray(item.daysOfWeek) ? item.daysOfWeek.map(Number).filter(day => day >= 0 && day <= 6) : [];
  const fallback = {
    startTime: item.startTime || "09:00",
    endTime: item.endTime || "",
    durationMinutes: item.durationMinutes || 30,
    calendarSync: item.calendarSync
  };
  if (Array.isArray(item.schedule) && item.schedule.length) {
    return item.schedule.map(entry => normalizeHabitScheduleEntry(entry, fallback));
  }
  if (daysOfWeek.length) {
    return daysOfWeek.map(dayIndex => normalizeHabitScheduleEntry({ day: HABIT_DAY_NAMES[dayIndex] }, fallback));
  }
  if ((item.repeatSetting || item.frequency) === "Daily") {
    return HABIT_DAY_NAMES.map(day => normalizeHabitScheduleEntry({ day }, fallback));
  }
  return [];
}

function normalizeHabit(item = {}) {
  const completions = Array.from(new Set([...(item.completions || []), ...(item.completionHistory || []).map(entry => typeof entry === "string" ? entry : entry.date).filter(Boolean)]));
  const schedule = buildHabitScheduleFromLegacy(item);
  const daysOfWeek = schedule.length
    ? schedule.map(entry => HABIT_DAY_NAMES.indexOf(entry.day)).filter(day => day >= 0)
    : (Array.isArray(item.daysOfWeek) ? item.daysOfWeek.map(Number).filter(day => day >= 0 && day <= 6) : []);
  const primary = schedule[0] || {};
  return {
    id: item.id || createId("habit"),
    name: item.name || item.title || "Untitled habit",
    category: item.category || "Personal",
    frequency: item.frequency || item.targetFrequency || "Daily",
    repeatSetting: item.repeatSetting || item.frequency || "Daily",
    daysOfWeek,
    schedule,
    startTime: primary.startTime || item.startTime || "09:00",
    endTime: primary.endTime || item.endTime || "",
    durationMinutes: primary.durationMinutes || item.durationMinutes || 30,
    calendarSync: Boolean(item.calendarSync),
    linkedGoalId: item.linkedGoalId || "",
    linkedBlockIds: Array.isArray(item.linkedBlockIds) ? item.linkedBlockIds : [item.linkedPlannerBlockId, item.linkedRoutineId].filter(Boolean),
    completions,
    notes: item.notes || "",
    createdAt: item.createdAt || nowISO(),
    updatedAt: item.updatedAt || nowISO()
  };
}

const DEFAULT_GOAL_UNITS = ["%", "mi", "km", "lbs", "kg", "pages", "hours", "sessions", "reps"];
const DEFAULT_LOG_UNITS = ["%", "mi", "km", "lbs", "kg", "pages", "hours", "sessions", "reps", "count"];
const DEFAULT_GOAL_TYPES = ["Outcome", "Habit", "Project", "Health", "Other"];
const FRIEND_RELATIONSHIP_TYPES = ["Family", "Friend", "Good Friend", "Acquaintance", "Other"];

function getGoalUnits() {
  const units = allZipCustomOptions?.goalUnits;
  return Array.isArray(units) && units.length ? units : DEFAULT_GOAL_UNITS;
}

function getLogUnits() {
  const units = allZipCustomOptions?.logUnits;
  return Array.isArray(units) && units.length ? units : DEFAULT_LOG_UNITS;
}

function isPercentGoal(goal) {
  return !goal?.unit || goal.unit === "%";
}

function getGoalTypes() {
  const types = allZipCustomOptions?.goalTypes;
  return Array.isArray(types) && types.length ? types : DEFAULT_GOAL_TYPES;
}

function getGoalTargetUnit(goal) {
  return goal?.targetUnit || goal?.unit || "%";
}

function formatGoalProgress(goal) {
  const unit = getGoalTargetUnit(goal);
  return `${goal.progress} ${unit}`;
}

function getGoalPercentComplete(goal) {
  if (isPercentGoal(goal)) return Math.min(100, Math.max(0, Number(goal.progress) || 0));
  const target = Number(goal.targetAmount) || 0;
  if (!target) return 0;
  return Math.min(100, Math.round(((Number(goal.progress) || 0) / target) * 100));
}

function formatGoalProgressSummary(goal) {
  const unit = getGoalTargetUnit(goal);
  const progress = Number(goal.progress) || 0;
  const target = Number(goal.targetAmount) || 0;
  if (isPercentGoal(goal)) return `${progress}${unit} · ${getGoalPercentComplete(goal)}% complete`;
  if (target > 0) return `${progress} / ${target} ${unit} · ${getGoalPercentComplete(goal)}% complete`;
  return `${progress} ${unit} · ${getGoalPercentComplete(goal)}% complete`;
}

function formatLogMeasurement(log) {
  const amount = getLogNumericAmount(log);
  if (amount == null) return "";
  const unit = log.unit ? ` ${log.unit}` : "";
  return `${amount}${unit}`;
}

function getGoalUnit(goalId) {
  return getGoalTargetUnit(getGoalById(goalId));
}

function getGoalById(goalId) {
  return systemsData.goals.find(item => item.id === goalId) || null;
}

function getGoalLogs(goalId) {
  return systemsData.logs
    .filter(log => log.linkedGoalId === goalId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function getLogNumericAmount(log = {}) {
  const raw = log.amount ?? log.value;
  if (raw === "" || raw == null || Number.isNaN(Number(raw))) return null;
  return Number(raw);
}

function sumGoalLogAmount(goalId) {
  return getGoalLogs(goalId).reduce((sum, log) => {
    const amount = getLogNumericAmount(log);
    return amount == null ? sum : sum + amount;
  }, 0);
}

function syncGoalProgressFromLogs(goalId) {
  if (!goalId) return;
  const goal = getGoalById(goalId);
  if (!goal) return;
  const total = sumGoalLogAmount(goalId);
  if (isPercentGoal(goal)) {
    goal.progress = Math.min(100, Math.max(0, total));
  } else {
    const cap = Number(goal.targetAmount) || 0;
    goal.progress = cap > 0 ? Math.min(cap, Math.max(0, total)) : Math.max(0, total);
  }
  goal.updatedAt = nowISO();
}

function isInvalidLogId(id = "", linkedGoalId = "", goals = []) {
  if (!id) return true;
  if (linkedGoalId && id === linkedGoalId) return true;
  return goals.some(goal => goal.id === id);
}

function unlinkLogsFromGoal(goalId) {
  systemsData.logs.forEach(log => {
    if (log.linkedGoalId === goalId) {
      log.linkedGoalId = "";
      log.updatedAt = nowISO();
    }
  });
}

function normalizeGoal(item = {}) {
  const milestones = Array.isArray(item.milestones) ? item.milestones.map(milestone => ({
    id: milestone.id || createId("milestone"),
    title: milestone.title || milestone.name || "Milestone",
    completed: Boolean(milestone.completed),
    date: milestone.date || milestone.targetDate || ""
  })) : [];
  const unit = item.targetUnit || item.unit || item.progressUnit || "%";
  const isPercent = !unit || unit === "%";
  const targetAmount = Number(item.targetAmount ?? item.target ?? item.targetValue ?? (isPercent ? 100 : 0)) || 0;
  return {
    id: item.id || createId("goal"),
    name: item.name || item.title || "Untitled goal",
    category: item.category || "Personal",
    type: item.type || item.goalType || "Outcome",
    progress: Number(item.progress ?? item.progressPercent ?? item.currentValue ?? 0) || 0,
    targetAmount,
    unit,
    targetUnit: item.targetUnit || unit,
    targetDate: item.targetDate || item.deadline || item.dueDate || "",
    linkedHabitIds: Array.isArray(item.linkedHabitIds) ? item.linkedHabitIds : [item.linkedHabitId].filter(Boolean),
    linkedTaskIds: Array.isArray(item.linkedTaskIds) ? item.linkedTaskIds : [item.linkedObjectiveId, item.linkedTaskId].filter(Boolean),
    linkedBlockIds: Array.isArray(item.linkedBlockIds) ? item.linkedBlockIds : [item.linkedPlannerBlockId, item.linkedRoutineId].filter(Boolean),
    milestones,
    notes: item.notes || "",
    createdAt: item.createdAt || nowISO(),
    updatedAt: item.updatedAt || nowISO()
  };
}

function normalizeLog(item = {}, goals = []) {
  const linkedGoalId = item.linkedGoalId || "";
  const preserveId = item.id && !isInvalidLogId(item.id, linkedGoalId, goals);
  const amountRaw = item.amount ?? item.value ?? "";
  const noteRaw = item.note ?? item.notes ?? "";
  const amount = amountRaw === "" ? "" : Number.isNaN(Number(amountRaw)) ? amountRaw : Number(amountRaw);
  return {
    id: preserveId ? item.id : createId("log"),
    date: item.date || todayISO(),
    title: item.title || item.name || item.type || "Log entry",
    source: item.source || item.logSource || "Manual",
    category: item.category || "General",
    amount,
    value: amount,
    unit: item.unit || item.valueType || "",
    note: typeof noteRaw === "string" ? noteRaw : String(noteRaw || ""),
    notes: typeof noteRaw === "string" ? noteRaw : String(noteRaw || ""),
    linkedHabitId: item.linkedHabitId || "",
    linkedBlockId: item.linkedBlockId || item.linkedPlannerBlockId || "",
    linkedGoalId,
    linkedTaskId: item.linkedTaskId || item.linkedObjectiveId || "",
    createdAt: item.createdAt || nowISO(),
    updatedAt: item.updatedAt || nowISO()
  };
}

function normalizeLogsList(rawLogs = [], goals = []) {
  const seenIds = new Set();
  return (Array.isArray(rawLogs) ? rawLogs : []).map(item => {
    const log = normalizeLog(item, goals);
    if (seenIds.has(log.id)) log.id = createId("log");
    seenIds.add(log.id);
    return log;
  });
}

function applyGoalsProgressFromLogs(goals = [], logs = []) {
  goals.forEach(goal => {
    const goalLogs = logs.filter(log => log.linkedGoalId === goal.id);
    const hasAmountLogs = goalLogs.some(log => getLogNumericAmount(log) != null);
    if (!hasAmountLogs) return;
    const total = goalLogs.reduce((sum, log) => {
      const amount = getLogNumericAmount(log);
      return amount == null ? sum : sum + amount;
    }, 0);
    if (isPercentGoal(goal)) goal.progress = Math.min(100, Math.max(0, total));
    else {
      const cap = Number(goal.targetAmount) || 0;
      goal.progress = cap > 0 ? Math.min(cap, Math.max(0, total)) : Math.max(0, total);
    }
  });
}

function normalizeBlock(item = {}) {
  const startTime = normalizeTimeValue(item.startTime || item.time || "09:00");
  const allowEmptyEnd = Boolean(item.allowEmptyEnd || item.linkedHangoutId);
  const hasEndTime = item.endTime != null && item.endTime !== "";
  const endTime = hasEndTime
    ? normalizeTimeValue(item.endTime)
    : (allowEmptyEnd ? "" : normalizeTimeValue(item.endTime || "10:00"));
  let durationMinutes = item.durationMinutes;
  if (durationMinutes == null || durationMinutes === "" || Number.isNaN(Number(durationMinutes))) {
    durationMinutes = hasEndTime && endTime
      ? Math.max(15, parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime))
      : (allowEmptyEnd ? 60 : Math.max(15, parseTimeToMinutes(endTime || "10:00") - parseTimeToMinutes(startTime)));
  } else {
    durationMinutes = Number(durationMinutes);
  }
  return {
    id: item.id || createId("block"),
    title: item.title || item.name || item.activity || "Time block",
    type: item.type || item.blockKind || "Block",
    date: item.date || todayISO(),
    startTime,
    endTime,
    durationMinutes,
    recurring: item.recurring || item.repeat || "None",
    category: item.category || "Personal",
    linkedTaskId: item.linkedTaskId || item.linkedObjectiveId || "",
    linkedHabitId: item.linkedHabitId || "",
    linkedGoalId: item.linkedGoalId || "",
    linkedHangoutId: item.linkedHangoutId || "",
    completed: Boolean(item.completed),
    completedAt: item.completedAt || "",
    notes: item.notes || "",
    createdAt: item.createdAt || nowISO(),
    updatedAt: item.updatedAt || nowISO()
  };
}

function normalizeRoutine(item = {}) {
  return {
    id: item.id || createId("routine"),
    title: item.title || item.name || "Routine",
    days: Array.isArray(item.days) ? item.days : [],
    startTime: item.startTime || "09:00",
    endTime: item.endTime || "10:00",
    linkedHabitId: item.linkedHabitId || "",
    linkedTaskId: item.linkedTaskId || item.linkedObjectiveId || "",
    notes: item.notes || ""
  };
}

function normalizeSystemsData(raw = {}) {
  const legacyTasks = [...(raw.tasks || []), ...(raw.objectives || [])];
  const convertedGoals = (raw.trackers || []).filter(item => /goal|milestone/i.test(`${item.category || ""} ${item.goal?.mode || ""}`)).map(item => normalizeGoal({ ...item, name: item.name, progress: item.goal?.progress || item.currentValue || 0 }));
  const goals = [...(raw.goals || []).map(normalizeGoal), ...convertedGoals];
  const legacyLogs = Array.isArray(raw.logs) ? raw.logs : Object.values(raw.logs || {});
  const logs = normalizeLogsList(legacyLogs, goals);
  applyGoalsProgressFromLogs(goals, logs);
  return {
    tasks: legacyTasks.map(normalizeTask),
    habits: (raw.habits || []).map(normalizeHabit),
    goals,
    logs
  };
}

function normalizePeopleNames(people) {
  if (!people) return [];
  if (Array.isArray(people)) {
    return people.map(person => (typeof person === "string" ? person : person?.name || "")).map(name => name.trim()).filter(Boolean);
  }
  return String(people).split(",").map(name => name.trim()).filter(Boolean);
}

function friendNameKey(name = "") {
  return String(name).trim().toLowerCase();
}

function ideaTitleKey(title = "") {
  return String(title).trim().toLowerCase();
}

function getHangoutPeopleNames(hangout = {}, friends = []) {
  const people = normalizePeopleNames(hangout.people);
  if (people.length) return people;
  return (hangout.friendIds || [])
    .map(id => friends.find(friend => friend.id === id)?.name || "")
    .map(name => name.trim())
    .filter(Boolean);
}

function getHangoutDedupKey(hangout = {}, friends = []) {
  const activity = String(hangout.activity || hangout.title || "").trim().toLowerCase();
  const people = getHangoutPeopleNames(hangout, friends).map(name => name.toLowerCase()).sort().join(",");
  return `${hangout.date || ""}|${activity}|${people}`;
}

function getHangoutCalendarDedupKey(hangout = {}) {
  const activity = String(hangout.activity || hangout.title || "").trim().toLowerCase();
  const startTime = getHangoutStartTime(hangout);
  return `${hangout.date || ""}|${activity}|${startTime}`;
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unescapeIcsText(value = "") {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function unfoldIcsText(text = "") {
  return String(text).replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function parseIcsPropertyLine(line = "") {
  const idx = line.indexOf(":");
  if (idx === -1) return null;
  const keyPart = line.slice(0, idx);
  const value = unescapeIcsText(line.slice(idx + 1));
  const key = keyPart.split(";")[0].toUpperCase();
  const params = {};
  keyPart.split(";").slice(1).forEach(part => {
    const eq = part.indexOf("=");
    if (eq === -1) return;
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).toUpperCase();
  });
  return { key, value, params };
}

function parseIcsDateTime(value = "", params = {}) {
  const clean = String(value || "").trim();
  const dateOnly = params.VALUE === "DATE" || /^\d{8}$/.test(clean);
  if (dateOnly && /^\d{8}/.test(clean)) {
    const datePart = clean.slice(0, 8);
    return {
      date: `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`,
      time: ""
    };
  }
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (match) {
    return {
      date: `${match[1]}-${match[2]}-${match[3]}`,
      time: `${match[4]}:${match[5]}`
    };
  }
  return { date: "", time: "" };
}

function parseIcsEvents(icsText = "") {
  const events = [];
  let current = null;
  unfoldIcsText(icsText).split("\n").forEach(line => {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      current = {};
      return;
    }
    if (trimmed === "END:VEVENT") {
      if (current && (current.SUMMARY || current.DTSTART)) events.push(current);
      current = null;
      return;
    }
    if (!current) return;
    const parsed = parseIcsPropertyLine(trimmed);
    if (!parsed) return;
    current[parsed.key] = parsed.value;
    if (parsed.key === "DTSTART") current._dtstartParams = parsed.params;
    if (parsed.key === "DTEND") current._dtendParams = parsed.params;
  });
  return events;
}

function splitFriendNameList(text = "") {
  return String(text)
    .split(/\s+and\s+|,\s*|\s*\/\s*/i)
    .map(name => name.trim())
    .filter(Boolean);
}

function extractFriendNamesFromText(text = "") {
  const value = String(text || "").trim();
  if (!value) return [];
  const patterns = [
    /\bw\/\s*(.+)$/i,
    /\bwith\s+(.+)$/i,
    /\bw\s+(.+)$/i
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match?.[1]) continue;
    return splitFriendNameList(match[1]);
  }
  return [];
}

function extractFriendNamesFromHangout(hangout = {}) {
  const names = [];
  const seen = new Set();
  const addName = (name) => {
    const cleaned = String(name || "").trim();
    if (!cleaned || seen.has(friendNameKey(cleaned))) return;
    seen.add(friendNameKey(cleaned));
    names.push(cleaned);
  };

  normalizePeopleNames(hangout.people).forEach(addName);
  extractFriendNamesFromText(hangout.activity || hangout.title || "").forEach(addName);
  extractFriendNamesFromText(hangout.notes || "").forEach(addName);

  return names;
}

function resolveHangoutFriends(hangout = {}, stats = null) {
  const extractedNames = extractFriendNamesFromHangout(hangout);
  const linkedPeople = [];
  const linkedIds = [];
  let matched = 0;
  let created = 0;

  extractedNames.forEach(name => {
    let friend = socialData.friends.find(item => friendNameKey(item.name) === friendNameKey(name));
    if (friend) {
      matched += 1;
    } else {
      friend = normalizeFriendFields({
        name,
        relationship: "Friend",
        relationshipType: "Friend",
        priority: "Medium",
        lastSeen: hangout.date || "",
        notes: "",
        favoriteActivities: ""
      });
      socialData.friends.push(friend);
      created += 1;
    }
    if (hangout.date && String(hangout.date) > String(friend.lastSeen || friend.lastContacted || "")) {
      friend.lastSeen = hangout.date;
      friend.lastContacted = hangout.date;
      friend.updatedAt = nowISO();
    }
    if (!linkedPeople.some(existing => friendNameKey(existing) === friendNameKey(friend.name))) {
      linkedPeople.push(friend.name);
    }
    if (!linkedIds.includes(friend.id)) linkedIds.push(friend.id);
  });

  if (stats) {
    stats.friendsMatched = (stats.friendsMatched || 0) + matched;
    stats.newFriendsCreated = (stats.newFriendsCreated || 0) + created;
  }

  return { people: linkedPeople, friendIds: linkedIds, matched, created };
}

function applyHangoutFriendLinks(hangout = {}, stats = null) {
  const result = resolveHangoutFriends(hangout, stats);
  hangout.people = result.people;
  hangout.friendIds = result.friendIds;
  return result;
}

function convertIcsEventToHangout(event = {}, friends = []) {
  const start = parseIcsDateTime(event.DTSTART, event._dtstartParams || {});
  const end = event.DTEND ? parseIcsDateTime(event.DTEND, event._dtendParams || {}) : { date: "", time: "" };
  const activity = event.SUMMARY || "Calendar event";
  const description = event.DESCRIPTION || "";
  const date = start.date;
  const startTime = normalizeTimeValue(start.time);
  const endTime = event.DTEND ? normalizeTimeValue(end.time) : "";
  return {
    activity,
    title: activity,
    date,
    startTime,
    endTime,
    time: startTime,
    durationMinutes: calculateDurationMinutes(startTime, endTime),
    people: [],
    location: event.LOCATION || "",
    notes: description,
    completed: Boolean(date && date < todayISO()),
    source: "Calendar"
  };
}

function isDateWithinRange(date = "", startDate = "", endDate = "") {
  if (!date) return false;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

function importCalendarIcs(icsText = "", options = {}) {
  const startDate = options.startDate || "";
  const endDate = options.endDate || "";
  const stats = { eventsImported: 0, friendsMatched: 0, newFriendsCreated: 0, duplicatesSkipped: 0, skippedOutsideRange: 0 };
  const hangoutKeys = new Set(socialData.hangouts.map(hangout => getHangoutCalendarDedupKey(hangout)));
  parseIcsEvents(icsText).forEach(event => {
    const raw = convertIcsEventToHangout(event, socialData.friends);
    if (!isDateWithinRange(raw.date, startDate, endDate)) {
      stats.skippedOutsideRange += 1;
      return;
    }
    const hangout = normalizeImportedHangout(raw, socialData.friends, stats);
    const key = getHangoutCalendarDedupKey(hangout);
    if (!hangout.activity && !hangout.date) {
      stats.duplicatesSkipped += 1;
      return;
    }
    if (hangoutKeys.has(key)) {
      stats.duplicatesSkipped += 1;
      return;
    }
    socialData.hangouts.push(hangout);
    hangoutKeys.add(key);
    stats.eventsImported += 1;
  });
  return stats;
}

function showCalendarImportSummary(stats = {}) {
  alert([
    "Calendar import complete",
    "",
    `${stats.eventsImported || 0} events imported`,
    `${stats.skippedOutsideRange || 0} events skipped outside date range`,
    `${stats.friendsMatched || 0} friends matched`,
    `${stats.newFriendsCreated || 0} new friends created`,
    `${stats.duplicatesSkipped || 0} duplicates skipped`
  ].join("\n"));
}

function getCalendarImportDefaultStartDate() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function getCalendarImportDefaultEndDate() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function toggleCalendarImportForm() {
  calendarImportOpen = !calendarImportOpen;
  if (calendarImportOpen) {
    calendarImportStartDate = calendarImportStartDate || getCalendarImportDefaultStartDate();
    calendarImportEndDate = calendarImportEndDate || getCalendarImportDefaultEndDate();
  }
  renderHangouts();
}

function renderCalendarImportPanel() {
  if (!calendarImportOpen) {
    return `<div class="button-row hangouts-import-row"><button type="button" class="secondary-btn" onclick="toggleCalendarImportForm()">Import Calendar Events as Hangouts</button></div>`;
  }
  const startDate = calendarImportStartDate || getCalendarImportDefaultStartDate();
  const endDate = calendarImportEndDate || getCalendarImportDefaultEndDate();
  return `<div class="calendar-import-panel stack">
    <form id="calendarImportForm" onsubmit="handleCalendarRangeImport(event)" class="stack">
      <label class="stack-label">Calendar file (.ics)<input id="calendarImportFile" type="file" accept=".ics,text/calendar" required></label>
      <div class="grid-2">
        <label class="stack-label">Start date<input id="calendarImportStartDate" type="date" value="${escapeHTML(startDate)}" required></label>
        <label class="stack-label">End date<input id="calendarImportEndDate" type="date" value="${escapeHTML(endDate)}" required></label>
      </div>
      <div class="button-row">
        <button type="submit">Import</button>
        <button type="button" class="secondary-btn" onclick="toggleCalendarImportForm()">Cancel</button>
      </div>
    </form>
  </div>`;
}

async function handleCalendarRangeImport(event) {
  event.preventDefault();
  const file = document.getElementById("calendarImportFile")?.files?.[0];
  if (!file) return alert("Choose a calendar .ics file first.");
  const startDate = document.getElementById("calendarImportStartDate")?.value || "";
  const endDate = document.getElementById("calendarImportEndDate")?.value || "";
  if (startDate && endDate && startDate > endDate) return alert("Start date must be on or before end date.");
  try {
    calendarImportStartDate = startDate;
    calendarImportEndDate = endDate;
    const stats = importCalendarIcs(await file.text(), { startDate, endDate });
    saveSocialData();
    showCalendarImportSummary(stats);
    calendarImportOpen = false;
    renderHangouts();
  } catch (error) {
    console.error(error);
    alert("Could not import calendar file. Check that it is a valid .ics file.");
  }
}

function normalizeTimeValue(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const match24 = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hours = Number(match24[1]);
    const minutes = Number(match24[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }
  return text;
}

function getHangoutStartTime(hangout = {}) {
  return normalizeTimeValue(hangout.startTime || hangout.time || "");
}

function getHangoutEndTime(hangout = {}) {
  return normalizeTimeValue(hangout.endTime || "");
}

function parseCompletedFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null || value === "") return false;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true" || text === "yes" || text === "1" || text === "completed") return true;
    if (text === "false" || text === "no" || text === "0" || text === "planned" || text === "canceled") return false;
  }
  return Boolean(value);
}

function getHangoutStatus(hangout = {}) {
  const status = String(hangout.status || "").trim();
  if (status.toLowerCase() === "canceled") return "Canceled";
  if (parseCompletedFlag(hangout.completed) || status.toLowerCase() === "completed") return "Completed";
  return "Planned";
}

function applyHangoutStatusFields(hangout, status) {
  const value = String(status || "Planned");
  if (value === "Completed") return { ...hangout, status: "Completed", completed: true, updatedAt: nowISO() };
  if (value === "Canceled") return { ...hangout, status: "Canceled", completed: false, updatedAt: nowISO() };
  return { ...hangout, status: "Planned", completed: false, updatedAt: nowISO() };
}

function calculateDurationMinutes(startTime = "", endTime = "") {
  if (!startTime || !endTime) return null;
  return Math.max(0, parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime));
}

function normalizeHangoutTime(hangout = {}) {
  const startTime = normalizeTimeValue(hangout.startTime || hangout.time || "");
  const endTime = normalizeTimeValue(hangout.endTime || "");
  const time = normalizeTimeValue(hangout.time || hangout.startTime || startTime || "");
  return {
    ...hangout,
    time,
    startTime,
    endTime,
    durationMinutes: calculateDurationMinutes(startTime, endTime)
  };
}

function getHangoutDurationMinutes(hangout = {}) {
  const stored = hangout.durationMinutes;
  if (stored != null && stored !== "" && !Number.isNaN(Number(stored)) && Number(stored) > 0) {
    return Number(stored);
  }
  return calculateDurationMinutes(getHangoutStartTime(hangout), getHangoutEndTime(hangout)) ?? 0;
}

function formatHangoutSchedule(hangout = {}) {
  const displayStart = getHangoutStartTime(hangout);
  const displayEnd = getHangoutEndTime(hangout);
  if (displayStart && displayEnd) return `${displayStart}–${displayEnd}`;
  if (displayStart) return displayStart;
  return "";
}

function getBlockByLinkedHangoutId(hangoutId) {
  return scheduleData.blocks.find(block => block.linkedHangoutId === hangoutId) || null;
}

function canAddHangoutToCalendar(hangout = {}) {
  return Boolean(hangout.date && getHangoutStartTime(hangout));
}

function buildHangoutBlockNotes(hangout = {}) {
  const parts = [];
  const people = getHangoutPeopleNames(hangout, socialData.friends);
  if (people.length) parts.push(`Friends: ${people.join(", ")}`);
  if (hangout.location) parts.push(`Location: ${hangout.location}`);
  if (hangout.notes) parts.push(hangout.notes);
  return parts.join("\n");
}

function createBlockFromHangout(hangout = {}) {
  const startTime = getHangoutStartTime(hangout);
  const endTime = getHangoutEndTime(hangout);
  const durationMinutes = hangout.durationMinutes ?? calculateDurationMinutes(startTime, endTime);
  return normalizeBlock({
    title: hangout.activity || hangout.title || "Hangout",
    date: hangout.date,
    startTime,
    endTime,
    durationMinutes,
    category: "Social",
    type: "Hangout",
    notes: buildHangoutBlockNotes(hangout),
    linkedHangoutId: hangout.id,
    allowEmptyEnd: true
  });
}

function addHangoutToCalendar(hangoutId) {
  const hangout = socialData.hangouts.find(item => item.id === hangoutId);
  if (!hangout) return { ok: false, message: "Hangout not found." };
  if (!canAddHangoutToCalendar(hangout)) return { ok: false, message: "Hangout needs a date and start time." };
  if (getBlockByLinkedHangoutId(hangoutId)) return { ok: false, message: "Already added to calendar." };
  scheduleData.blocks.push(createBlockFromHangout(hangout));
  saveScheduleData();
  return { ok: true, message: "Added to calendar." };
}

function syncLinkedHangoutBlock(hangout = {}) {
  const block = getBlockByLinkedHangoutId(hangout.id);
  if (!block) return;
  const updated = createBlockFromHangout(hangout);
  Object.assign(block, {
    title: updated.title,
    date: updated.date,
    startTime: updated.startTime,
    endTime: updated.endTime,
    durationMinutes: updated.durationMinutes,
    notes: updated.notes,
    category: updated.category,
    type: updated.type,
    updatedAt: nowISO()
  });
  saveScheduleData();
}

function addAllHangoutsToCalendar() {
  const stats = { added: 0, skippedNoSchedule: 0, skippedDuplicate: 0 };
  socialData.hangouts.forEach(hangout => {
    if (!canAddHangoutToCalendar(hangout)) {
      stats.skippedNoSchedule += 1;
      return;
    }
    if (getBlockByLinkedHangoutId(hangout.id)) {
      stats.skippedDuplicate += 1;
      return;
    }
    scheduleData.blocks.push(createBlockFromHangout(hangout));
    stats.added += 1;
  });
  if (stats.added) saveScheduleData();
  return stats;
}

function showHangoutCalendarImportSummary(stats = {}) {
  alert([
    "Calendar sync complete",
    "",
    `${stats.added || 0} hangouts added`,
    `${stats.skippedNoSchedule || 0} skipped (missing date or start time)`,
    `${stats.skippedDuplicate || 0} duplicates skipped`
  ].join("\n"));
}

function handleAddHangoutToCalendar(hangoutId) {
  const result = addHangoutToCalendar(hangoutId);
  if (result.ok) showToast(result.message);
  else alert(result.message);
  renderHangouts();
}

function handleAddAllHangoutsToCalendar() {
  const stats = addAllHangoutsToCalendar();
  showHangoutCalendarImportSummary(stats);
  renderHangouts();
}

function normalizeHangoutFields(hangout = {}) {
  const timed = normalizeHangoutTime(hangout);
  const people = normalizePeopleNames(timed.people);
  return {
    id: timed.id || createId("hangout"),
    activity: timed.activity || timed.title || "Hangout",
    title: timed.title || timed.activity || "Hangout",
    date: timed.date || "",
    startTime: timed.startTime,
    endTime: timed.endTime,
    durationMinutes: timed.durationMinutes,
    time: timed.time,
    people,
    friendIds: Array.isArray(timed.friendIds) ? timed.friendIds : [],
    location: timed.location || "",
    notes: timed.notes || "",
    cost: timed.cost || "",
    category: timed.category || "",
    followUpReminder: timed.followUpReminder || "",
    sourceIdeaId: timed.sourceIdeaId || "",
    status: getHangoutStatus(timed),
    completed: getHangoutStatus(timed) === "Completed",
    createdAt: timed.createdAt || nowISO(),
    updatedAt: timed.updatedAt || nowISO()
  };
}

function getFriendRelationshipType(friend = {}) {
  return friend.relationship || friend.relationshipType || "Friend";
}

function friendRelationshipOptionList(selected = "Friend") {
  const value = selected || "Friend";
  const options = [...FRIEND_RELATIONSHIP_TYPES];
  if (value && !options.includes(value)) options.push(value);
  return optionList(options, value);
}

function normalizeFriendFields(friend = {}) {
  const lastSeen = friend.lastSeen || friend.lastContacted || "";
  const relationshipType = getFriendRelationshipType(friend);
  return {
    id: friend.id || createId("friend"),
    name: friend.name || "Friend",
    relationship: relationshipType,
    relationshipType,
    priority: friend.priority || "Medium",
    lastContacted: friend.lastContacted || lastSeen,
    lastSeen,
    notes: friend.notes || friend.importantNotes || friend.details || "",
    favoriteActivities: friend.favoriteActivities || "",
    followUpReminder: friend.followUpReminder || friend.followUpDate || "",
    createdAt: friend.createdAt || nowISO(),
    updatedAt: friend.updatedAt || nowISO()
  };
}

function syncFriendNameReferences(friendId, oldName, newName) {
  if (!friendId || !oldName || friendNameKey(oldName) === friendNameKey(newName)) return;
  socialData.hangouts.forEach(hangout => {
    const linked = (hangout.friendIds || []).includes(friendId)
      || (hangout.people || []).some(name => friendNameKey(name) === friendNameKey(oldName));
    if (!linked) return;
    hangout.people = (hangout.people || []).map(name => (friendNameKey(name) === friendNameKey(oldName) ? newName : name));
    hangout.updatedAt = nowISO();
  });
  socialData.ideas.forEach(idea => {
    const linked = (idea.linkedFriendIds || idea.friendIds || []).includes(friendId)
      || (idea.linkedFriends || []).some(name => friendNameKey(name) === friendNameKey(oldName));
    if (!linked) return;
    idea.linkedFriends = (idea.linkedFriends || []).map(name => (friendNameKey(name) === friendNameKey(oldName) ? newName : name));
    idea.updatedAt = nowISO();
  });
}

function normalizeSocialData(raw = {}) {
  const friends = (raw.friends || []).map(friend => normalizeFriendFields(friend));
  const hangouts = (raw.hangouts || []).map(hangout => normalizeHangoutFields(normalizeHangoutTime(hangout)));
  const ideas = (raw.ideas || []).map(idea => normalizeIdeaFields(idea, friends));
  return { friends, hangouts, ideas };
}

function parseSocialImportPayload(data = {}) {
  if (data.socialData) return data.socialData;
  return {
    friends: data.friends || [],
    hangouts: data.hangouts || [],
    ideas: data.ideas || []
  };
}

function resolveHangoutFriendIds(people = [], friends = []) {
  return normalizePeopleNames(people)
    .map(name => friends.find(friend => friendNameKey(friend.name) === friendNameKey(name))?.id)
    .filter(Boolean);
}

function parseFriendNamesFromIdeaNotes(notes = "") {
  const text = String(notes || "").trim();
  const match = text.match(/Friends?\s*:\s*(.+)/i);
  if (!match) return { names: [], cleanedNotes: text };
  const names = match[1].split(",").map(name => name.trim()).filter(Boolean);
  return { names, cleanedNotes: text };
}

function getIdeaLinkedFriendNames(idea = {}, friends = []) {
  if (Array.isArray(idea.linkedFriends) && idea.linkedFriends.length) {
    return idea.linkedFriends.map(name => String(name).trim()).filter(Boolean);
  }
  const ids = idea.linkedFriendIds?.length ? idea.linkedFriendIds : (idea.friendIds || []);
  return ids
    .map(id => friends.find(friend => friend.id === id)?.name || "")
    .map(name => name.trim())
    .filter(Boolean);
}

function linkIdeaFriendsFromNotes(idea = {}, friends = []) {
  const linkedFriendIds = [...(idea.linkedFriendIds || idea.friendIds || [])];
  const linkedFriends = [...(idea.linkedFriends || getIdeaLinkedFriendNames({ ...idea, linkedFriendIds }, friends))];
  const parsed = parseFriendNamesFromIdeaNotes(idea.notes || "");
  parsed.names.forEach(name => {
    const friend = friends.find(item => friendNameKey(item.name) === friendNameKey(name));
    if (!friend) return;
    if (!linkedFriendIds.includes(friend.id)) linkedFriendIds.push(friend.id);
    if (!linkedFriends.some(existing => friendNameKey(existing) === friendNameKey(friend.name))) linkedFriends.push(friend.name);
  });
  return { linkedFriendIds, linkedFriends };
}

function normalizeIdeaFields(idea = {}, friends = []) {
  const linked = linkIdeaFriendsFromNotes(idea, friends);
  return {
    id: idea.id || createId("idea"),
    title: idea.title || idea.name || "Idea",
    category: idea.category || "General",
    cost: idea.cost || "",
    linkedFriendIds: linked.linkedFriendIds,
    linkedFriends: linked.linkedFriends,
    friendIds: linked.linkedFriendIds,
    notes: idea.notes || idea.details || "",
    timing: idea.timing || "",
    favorite: Boolean(idea.favorite),
    createdAt: idea.createdAt || nowISO(),
    updatedAt: idea.updatedAt || nowISO()
  };
}

function parseIdeaTiming(timing = "") {
  if (!timing) return { date: "", startTime: "", endTime: "" };
  const value = String(timing).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value, startTime: "", endTime: "" };
  const rangeMatch = value.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (rangeMatch) {
    return {
      date: "",
      startTime: normalizeTimeValue(rangeMatch[1]),
      endTime: normalizeTimeValue(rangeMatch[2])
    };
  }
  const timeMatch = value.match(/\b(\d{1,2}:\d{2})\b/);
  if (timeMatch) return { date: "", startTime: normalizeTimeValue(timeMatch[1]), endTime: "" };
  return { date: "", startTime: "", endTime: "" };
}

function buildHangoutNotesFromIdea(idea = {}) {
  const parts = [];
  if (idea.category && idea.category !== "General") parts.push(`Category: ${idea.category}`);
  if (idea.cost) parts.push(`Cost: ${idea.cost}`);
  if (idea.timing && !parseIdeaTiming(idea.timing).date) parts.push(`Timing: ${idea.timing}`);
  if (idea.notes) parts.push(idea.notes);
  return parts.join("\n").trim();
}

function findHangoutBySourceIdeaId(ideaId) {
  return socialData.hangouts.find(hangout => hangout.sourceIdeaId === ideaId) || null;
}

function createHangoutFromIdea(idea) {
  const timing = parseIdeaTiming(idea.timing);
  const linkedFriends = getIdeaLinkedFriendNames(idea, socialData.friends);
  const draft = {
    activity: idea.title,
    title: idea.title,
    category: idea.category || "",
    date: timing.date || "",
    startTime: timing.startTime || "",
    endTime: timing.endTime || "",
    time: timing.startTime || "",
    people: linkedFriends,
    friendIds: [...(idea.linkedFriendIds || idea.friendIds || [])],
    notes: buildHangoutNotesFromIdea(idea),
    cost: idea.cost || "",
    completed: false,
    sourceIdeaId: idea.id,
    createdAt: nowISO(),
    updatedAt: nowISO()
  };
  applyHangoutFriendLinks(draft);
  return normalizeHangoutFields(draft);
}

function addIdeaToHangouts(ideaId) {
  const idea = socialData.ideas.find(item => item.id === ideaId);
  if (!idea) return;
  if (findHangoutBySourceIdeaId(ideaId)) {
    showToast("Already added to Hangouts");
    return;
  }
  const hangout = createHangoutFromIdea(idea);
  socialData.hangouts.push(hangout);
  highlightHangoutId = hangout.id;
  saveSocialData();
  socialTab = "Hangouts";
  renderSocial();
  showToast("Added to Hangouts");
}

function openHangoutFromCalendar(hangoutId) {
  highlightHangoutId = hangoutId;
  socialTab = "Hangouts";
  setPage("Social");
}

function normalizeImportedFriend(raw = {}) {
  const lastSeen = raw.lastSeen || raw.lastContacted || raw.lastSeenDate || raw.date || "";
  return normalizeFriendFields({
    ...raw,
    name: raw.name || "Friend",
    lastSeen,
    lastContacted: lastSeen || raw.lastContacted || ""
  });
}

function normalizeImportedHangout(raw = {}, friends = [], stats = null) {
  const draft = normalizeHangoutTime({
    ...raw,
    activity: raw.activity || raw.title || "Hangout",
    title: raw.activity || raw.title || "Hangout",
    people: normalizePeopleNames(raw.people)
  });
  applyHangoutFriendLinks(draft, stats);
  return normalizeHangoutFields(draft);
}

function normalizeImportedIdea(raw = {}, friends = []) {
  return normalizeIdeaFields({
    ...raw,
    title: raw.title || raw.name || "Idea",
    category: raw.category || "General",
    cost: raw.cost || "",
    favorite: Boolean(raw.favorite),
    linkedFriendIds: raw.linkedFriendIds || raw.friendIds || [],
    linkedFriends: raw.linkedFriends || []
  }, friends);
}

function importSocialData(payload = {}) {
  return mergeHangoutPlannerSocialData({
    friends: payload.friends || [],
    hangouts: (payload.hangouts || []).map(hangout => normalizeHangoutTime(hangout)),
    ideas: payload.ideas || []
  });
}

function mergeHangoutPlannerSocialData(payload = {}) {
  const stats = {
    friendsImported: 0,
    hangoutsImported: 0,
    ideasImported: 0,
    duplicatesSkipped: 0,
    friendsMatched: 0,
    newFriendsCreated: 0
  };
  const friendsByName = new Map(socialData.friends.map(friend => [friendNameKey(friend.name), friend]));
  const hangoutKeys = new Set(socialData.hangouts.map(hangout => getHangoutDedupKey(hangout, socialData.friends)));
  const ideaKeys = new Set(socialData.ideas.map(idea => ideaTitleKey(idea.title)));

  (payload.friends || []).forEach(raw => {
    const friend = normalizeImportedFriend(raw);
    const key = friendNameKey(friend.name);
    if (!key) {
      stats.duplicatesSkipped += 1;
      return;
    }
    const existing = friendsByName.get(key);
    if (existing) {
      stats.duplicatesSkipped += 1;
      const importedDate = friend.lastSeen || friend.lastContacted || "";
      const existingDate = existing.lastSeen || existing.lastContacted || "";
      if (importedDate && String(importedDate) > String(existingDate || "")) {
        existing.lastSeen = importedDate;
        existing.lastContacted = importedDate;
        existing.updatedAt = nowISO();
      }
      if (!existing.notes && friend.notes) existing.notes = friend.notes;
      return;
    }
    socialData.friends.push(friend);
    friendsByName.set(key, friend);
    stats.friendsImported += 1;
  });

  (payload.hangouts || []).forEach(raw => {
    const hangout = normalizeImportedHangout(raw, socialData.friends, stats);
    const key = getHangoutDedupKey(hangout, socialData.friends);
    if (!hangout.activity && !hangout.title && !hangout.date) {
      stats.duplicatesSkipped += 1;
      return;
    }
    if (hangoutKeys.has(key)) {
      stats.duplicatesSkipped += 1;
      return;
    }
    socialData.hangouts.push(hangout);
    hangoutKeys.add(key);
    stats.hangoutsImported += 1;
  });

  (payload.ideas || []).forEach(raw => {
    const idea = normalizeImportedIdea(raw, socialData.friends);
    const key = ideaTitleKey(idea.title);
    if (!key) {
      stats.duplicatesSkipped += 1;
      return;
    }
    if (ideaKeys.has(key)) {
      stats.duplicatesSkipped += 1;
      return;
    }
    socialData.ideas.push(idea);
    ideaKeys.add(key);
    stats.ideasImported += 1;
  });

  return stats;
}

function showSocialImportSummary(stats = {}) {
  alert([
    "Import complete",
    "",
    `${stats.hangoutsImported || 0} hangouts imported`,
    `${stats.friendsMatched || 0} friends matched`,
    `${stats.newFriendsCreated || 0} new friends created`,
    `${stats.duplicatesSkipped || 0} duplicates skipped`,
    stats.friendsImported ? `${stats.friendsImported} friends imported from file` : ""
  ].filter(Boolean).join("\n"));
}

function triggerSocialImport() {
  document.getElementById("socialImportFile")?.click();
}

async function handleSocialImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = parseSocialImportPayload(JSON.parse(await file.text()));
    const stats = importSocialData(payload);
    saveSocialData();
    showSocialImportSummary(stats);
    renderSocial();
  } catch (error) {
    console.error(error);
    alert("Could not import file. Check that it is valid Hangout Planner JSON.");
  }
  event.target.value = "";
}

function exportSocialData() {
  const payload = {
    friends: socialData.friends.map(friend => ({
      name: friend.name,
      relationship: getFriendRelationshipType(friend),
      relationshipType: getFriendRelationshipType(friend),
      priority: friend.priority || "Medium",
      lastSeen: friend.lastSeen || friend.lastContacted || "",
      lastContacted: friend.lastContacted || friend.lastSeen || "",
      notes: friend.notes || "",
      importantNotes: friend.notes || "",
      followUpReminder: friend.followUpReminder || "",
      followUpDate: friend.followUpReminder || ""
    })),
    hangouts: [...socialData.hangouts]
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.time || "").localeCompare(String(a.time || "")))
      .map(hangout => ({
        activity: hangout.activity || hangout.title || "",
        date: hangout.date || "",
        startTime: hangout.startTime || hangout.time || "",
        endTime: hangout.endTime || "",
        durationMinutes: calculateDurationMinutes(hangout.startTime || hangout.time || "", hangout.endTime || ""),
        time: hangout.time || hangout.startTime || "",
        people: getHangoutPeopleNames(hangout, socialData.friends),
        location: hangout.location || "",
        notes: hangout.notes || "",
        completed: Boolean(hangout.completed),
        cost: hangout.cost || "",
        category: hangout.category || "",
        sourceIdeaId: hangout.sourceIdeaId || "",
        status: getHangoutStatus(hangout)
      })),
    ideas: socialData.ideas.map(idea => ({
      title: idea.title,
      category: idea.category || "",
      cost: idea.cost || "",
      notes: idea.notes || "",
      timing: idea.timing || "",
      favorite: Boolean(idea.favorite),
      linkedFriendIds: idea.linkedFriendIds || idea.friendIds || [],
      linkedFriends: getIdeaLinkedFriendNames(idea, socialData.friends)
    }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `flow-social-export-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function renderSocialToolbar() {
  return `<div class="social-toolbar button-row">
    <button type="button" onclick="triggerSocialImport()">Import Social Data</button>
    <button type="button" class="secondary-btn" onclick="exportSocialData()">Export Social Data</button>
    <button type="button" class="secondary-btn danger-btn" onclick="clearSocialData()">Clear Social Data</button>
    <input id="socialImportFile" type="file" accept=".json,application/json" hidden onchange="handleSocialImportFile(event)">
  </div>`;
}

function clearSocialData() {
  if (!confirm("Delete ALL Friends, Hangouts, and Ideas? This cannot be undone.")) return;
  socialData.friends = [];
  socialData.hangouts = [];
  socialData.ideas = [];
  editingFriendId = null;
  editingHangoutId = null;
  editingIdeaId = null;
  editHangoutFriendIds = [];
  editIdeaFriendIds = [];
  hangoutFormDraft = null;
  hangoutFormFriendIds = [];
  ideaFormDraft = null;
  ideaFormFriendIds = [];
  saveSocialData();
  renderSocial();
  showToast("Social data cleared.");
}

function loadSocialSortPreferences() {
  try {
    socialFriendsSort = localStorage.getItem(SOCIAL_FRIENDS_SORT_KEY) || "name-asc";
    socialHangoutsSort = localStorage.getItem(SOCIAL_HANGOUTS_SORT_KEY) || "date-newest";
    socialIdeasSort = localStorage.getItem(SOCIAL_IDEAS_SORT_KEY) || "recent";
  } catch {
    socialFriendsSort = "name-asc";
    socialHangoutsSort = "date-newest";
    socialIdeasSort = "recent";
  }
}

function persistSocialSortPreference(tab, value) {
  const key = tab === "Friends" ? SOCIAL_FRIENDS_SORT_KEY : tab === "Hangouts" ? SOCIAL_HANGOUTS_SORT_KEY : SOCIAL_IDEAS_SORT_KEY;
  try { localStorage.setItem(key, value); } catch {}
  if (tab === "Friends") socialFriendsSort = value;
  if (tab === "Hangouts") socialHangoutsSort = value;
  if (tab === "Ideas") socialIdeasSort = value;
}

function setSocialSortPreference(tab, value) {
  persistSocialSortPreference(tab, value);
  refreshSocialList();
}

function matchesSocialSearch(query, ...fields) {
  const value = String(query || "").trim().toLowerCase();
  if (!value) return true;
  const haystack = fields.map(field => String(field ?? "")).join(" ").toLowerCase();
  return haystack.includes(value);
}

function parseIdeaCostValue(cost = "") {
  const num = parseFloat(String(cost).replace(/[^0-9.]/g, ""));
  return Number.isNaN(num) ? null : num;
}

function sortFriendsList(friends = []) {
  const sort = socialFriendsSort;
  return [...friends].sort((a, b) => {
    if (sort === "name-desc") return String(b.name || "").localeCompare(String(a.name || ""));
    if (sort === "priority") {
      const rank = (FRIEND_PRIORITY_RANK[a.priority] ?? 2) - (FRIEND_PRIORITY_RANK[b.priority] ?? 2);
      return rank || String(a.name || "").localeCompare(String(b.name || ""));
    }
    if (sort === "relationship") {
      return getFriendRelationshipType(a).localeCompare(getFriendRelationshipType(b))
        || String(a.name || "").localeCompare(String(b.name || ""));
    }
    if (sort === "recent") return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function sortHangoutsList(hangouts = []) {
  const sort = socialHangoutsSort;
  return [...hangouts].sort((a, b) => {
    if (highlightHangoutId) {
      if (a.id === highlightHangoutId) return -1;
      if (b.id === highlightHangoutId) return 1;
    }
    if (sort === "date-oldest") {
      const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
      if (dateCompare) return dateCompare;
      return String(a.startTime || a.time || "").localeCompare(String(b.startTime || b.time || ""));
    }
    if (sort === "name-asc") {
      return String(a.activity || a.title || "").localeCompare(String(b.activity || b.title || ""));
    }
    if (sort === "recent") return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCompare) return dateCompare;
    const timeCompare = String(b.startTime || b.time || "").localeCompare(String(a.startTime || a.time || ""));
    if (timeCompare) return timeCompare;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

function sortIdeasList(ideas = []) {
  const sort = socialIdeasSort;
  return [...ideas].sort((a, b) => {
    if (sort === "name-asc") return String(a.title || "").localeCompare(String(b.title || ""));
    if (sort === "category") {
      return String(a.category || "").localeCompare(String(b.category || ""))
        || String(a.title || "").localeCompare(String(b.title || ""));
    }
    if (sort === "favorites-first") {
      const favoriteCompare = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
      if (favoriteCompare) return favoriteCompare;
      return String(a.title || "").localeCompare(String(b.title || ""));
    }
    if (sort === "cost-low") {
      const aCost = parseIdeaCostValue(a.cost);
      const bCost = parseIdeaCostValue(b.cost);
      const aValue = aCost === null ? Number.POSITIVE_INFINITY : aCost;
      const bValue = bCost === null ? Number.POSITIVE_INFINITY : bCost;
      return aValue - bValue || String(a.title || "").localeCompare(String(b.title || ""));
    }
    if (sort === "cost-high") {
      const aCost = parseIdeaCostValue(a.cost);
      const bCost = parseIdeaCostValue(b.cost);
      const aValue = aCost === null ? Number.NEGATIVE_INFINITY : aCost;
      const bValue = bCost === null ? Number.NEGATIVE_INFINITY : bCost;
      return bValue - aValue || String(a.title || "").localeCompare(String(b.title || ""));
    }
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

function getFilteredFriends() {
  const filtered = socialData.friends.filter(friend => matchesSocialSearch(
    socialSearch,
    friend.name,
    getFriendRelationshipType(friend),
    friend.relationshipType,
    friend.priority,
    friend.notes
  ));
  const withEditing = editingFriendId && !filtered.some(item => item.id === editingFriendId)
    ? [socialData.friends.find(item => item.id === editingFriendId), ...filtered].filter(Boolean)
    : filtered;
  return sortFriendsList(withEditing);
}

function getFilteredHangouts() {
  const filtered = socialData.hangouts.filter(hangout => {
    const people = getHangoutPeopleNames(hangout, socialData.friends).join(" ");
    return matchesSocialSearch(
      socialSearch,
      hangout.activity,
      hangout.title,
      people,
      hangout.category,
      hangout.notes,
      hangout.date
    );
  });
  const withEditing = editingHangoutId && !filtered.some(item => item.id === editingHangoutId)
    ? [socialData.hangouts.find(item => item.id === editingHangoutId), ...filtered].filter(Boolean)
    : filtered;
  return sortHangoutsList(withEditing);
}

function getFilteredIdeas() {
  const filtered = socialData.ideas.filter(idea => {
    const friends = getIdeaLinkedFriendNames(idea, socialData.friends).join(" ");
    return matchesSocialSearch(
      socialSearch,
      idea.title,
      idea.category,
      idea.cost,
      friends,
      idea.notes,
      idea.timing,
      idea.favorite ? "favorite" : ""
    );
  });
  const withEditing = editingIdeaId && !filtered.some(item => item.id === editingIdeaId)
    ? [socialData.ideas.find(item => item.id === editingIdeaId), ...filtered].filter(Boolean)
    : filtered;
  return sortIdeasList(withEditing);
}

function getSortedHangouts() {
  return getFilteredHangouts();
}

function renderSocialSortOptions(tab) {
  const selected = tab === "Friends" ? socialFriendsSort : tab === "Hangouts" ? socialHangoutsSort : socialIdeasSort;
  const options = tab === "Friends"
    ? [["name-asc", "Name A–Z"], ["name-desc", "Name Z–A"], ["priority", "Priority"], ["relationship", "Relationship"], ["recent", "Recently Added"]]
    : tab === "Hangouts"
      ? [["date-newest", "Date Newest"], ["date-oldest", "Date Oldest"], ["name-asc", "Name A–Z"], ["recent", "Recently Added"]]
      : [["recent", "Recently Added"], ["name-asc", "Name A–Z"], ["category", "Category"], ["favorites-first", "Favorites First"], ["cost-low", "Cost Low–High"], ["cost-high", "Cost High–Low"]];
  return options.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${escapeHTML(label)}</option>`).join("");
}

function renderSocialSearchBar() {
  const placeholder = socialTab === "Friends" ? "Search friends…" : socialTab === "Hangouts" ? "Search hangouts…" : "Search ideas…";
  return `<div class="card social-search-card">
    <div class="social-search-row">
      <input type="search" id="socialSearchInput" placeholder="${placeholder}" value="${escapeHTML(socialSearch)}" oninput="socialSearch=this.value; refreshSocialList();">
      <select aria-label="Sort ${socialTab}" onchange="setSocialSortPreference('${socialTab}', this.value)">${renderSocialSortOptions(socialTab)}</select>
    </div>
  </div>`;
}

function renderSocialEmptyListMessage(hasAny) {
  return hasAny ? `<p class="muted-text">No results found.</p>` : "";
}

function renderFriendsListContent() {
  const filteredFriends = getFilteredFriends();
  if (!filteredFriends.length) {
    return socialData.friends.length
      ? renderSocialEmptyListMessage(true)
      : `<p class="muted-text">No friends yet.</p>`;
  }
  return `<div class="item-list">${filteredFriends.map(renderFriendItem).join("")}</div>`;
}

function renderHangoutsListContent() {
  const filteredHangouts = getFilteredHangouts();
  if (!filteredHangouts.length) {
    return socialData.hangouts.length
      ? renderSocialEmptyListMessage(true)
      : `<p class="muted-text">No hangouts yet.</p>`;
  }
  return `<div class="item-list">${filteredHangouts.map(renderHangoutItem).join("")}</div>`;
}

function renderIdeasListContent() {
  const filteredIdeas = getFilteredIdeas();
  if (!filteredIdeas.length) {
    return socialData.ideas.length
      ? renderSocialEmptyListMessage(true)
      : `<p class="muted-text">No ideas yet.</p>`;
  }
  return `<div class="item-list">${filteredIdeas.map(renderIdeaItem).join("")}</div>`;
}

function refreshSocialList() {
  if (socialTab === "Hangouts") captureHangoutFormDraft();
  if (socialTab === "Ideas") captureIdeaFormDraft();
  const listEl = document.getElementById("socialList");
  if (!listEl) {
    renderSocial();
    return;
  }
  if (socialTab === "Friends") listEl.innerHTML = renderFriendsListContent();
  if (socialTab === "Hangouts") listEl.innerHTML = renderHangoutsListContent();
  if (socialTab === "Ideas") listEl.innerHTML = renderIdeasListContent();
}

function setSocialTab(tab) {
  socialTab = tab;
  socialSearch = "";
  renderSocial();
}

function normalizeScheduleData(raw = {}) {
  return {
    blocks: (raw.blocks || []).map(normalizeBlock),
    routines: (raw.routines || []).map(normalizeRoutine)
  };
}

function normalizePlannerData(raw = {}) {
  return { plans: Array.isArray(raw.plans) ? raw.plans : [] };
}

function migrateImportedData(data = {}) {
  const existing = {
    plannerData: normalizePlannerData(DataService.get(DataService.KEYS.PLANNER_DATA) || {}),
    scheduleData: normalizeScheduleData(DataService.get(DataService.KEYS.SCHEDULE_DATA) || {}),
    systemsData: normalizeSystemsData(DataService.get(DataService.KEYS.SYSTEMS_DATA) || {}),
    socialData: normalizeSocialData(DataService.get(DataService.KEYS.SOCIAL_DATA) || {}),
    allZipData: DataService.get(DataService.KEYS.ALL_ZIP_DATA) || [],
    allZipCustomOptions: DataService.get(DataService.KEYS.ALL_ZIP_CUSTOM_OPTIONS) || {}
  };
  const incoming = {
    plannerData: normalizePlannerData(data.plannerData || {}),
    scheduleData: normalizeScheduleData(data.scheduleData || {}),
    systemsData: normalizeSystemsData(data.systemsData || data.productivityData || {}),
    socialData: normalizeSocialData(data.socialData || {}),
    allZipData: Array.isArray(data.allZipData) ? data.allZipData : [],
    allZipCustomOptions: data.allZipCustomOptions || data.customOptionsData || {}
  };
  return {
    plannerData: incoming.plannerData.plans.length ? incoming.plannerData : existing.plannerData,
    scheduleData: {
      blocks: DataService.mergeArrays(existing.scheduleData.blocks, incoming.scheduleData.blocks),
      routines: DataService.mergeArrays(existing.scheduleData.routines, incoming.scheduleData.routines)
    },
    systemsData: {
      tasks: DataService.mergeArrays(existing.systemsData.tasks, incoming.systemsData.tasks),
      habits: DataService.mergeArrays(existing.systemsData.habits, incoming.systemsData.habits),
      goals: DataService.mergeArrays(existing.systemsData.goals, incoming.systemsData.goals),
      logs: DataService.mergeArrays(existing.systemsData.logs, incoming.systemsData.logs)
    },
    socialData: {
      friends: DataService.mergeArrays(existing.socialData.friends, incoming.socialData.friends),
      hangouts: DataService.mergeArrays(existing.socialData.hangouts, incoming.socialData.hangouts),
      ideas: DataService.mergeArrays(existing.socialData.ideas, incoming.socialData.ideas)
    },
    allZipData: DataService.mergeArrays(existing.allZipData, incoming.allZipData),
    allZipCustomOptions: { ...existing.allZipCustomOptions, ...incoming.allZipCustomOptions }
  };
}

let plannerData = {};
let systemsData = { tasks: [], habits: [], goals: [], logs: [] };
let socialData = { friends: [], hangouts: [], ideas: [] };
let scheduleData = { blocks: [], routines: [] };
let allZipData = [];
let allZipCustomOptions = {
  taskPriorities: ["Low", "Medium", "High"],
  habitCategories: ["Health", "Home", "Work", "Personal"],
  goalCategories: ["Personal", "Career", "Health"],
  goalTypes: DEFAULT_GOAL_TYPES,
  goalUnits: DEFAULT_GOAL_UNITS,
  logUnits: DEFAULT_LOG_UNITS
};

let activePage = "Tasks";
let calendarView = "Day";
let calendarDate = todayISO();
let customStartDate = todayISO();
let customEndDate = todayISO();
let productivityTab = "Habits";
let socialTab = "Friends";
let socialSearch = "";
let socialFriendsSort = "name-asc";
let socialHangoutsSort = "date-newest";
let socialIdeasSort = "recent";
let socialBulkSelectMode = false;
let socialBulkSelectedIds = [];
let bulkHangoutActionFriendIds = [];
const SOCIAL_FRIENDS_SORT_KEY = "flowPlannerSocialFriendsSort";
const SOCIAL_HANGOUTS_SORT_KEY = "flowPlannerSocialHangoutsSort";
const SOCIAL_IDEAS_SORT_KEY = "flowPlannerSocialIdeasSort";
const FRIEND_PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };
let goalSearch = "";
let goalCategoryFilter = "All";
let goalTypeFilter = "All";
let goalSort = "updated";
let goalLogFormOpenId = "";
let goalLogHistoryOpenId = "";
let editingGoalLogId = "";
let editingGoalId = null;
let editingHabitId = null;
let hangoutFormDraft = null;
let hangoutFormFriendIds = [];
let hangoutFriendPickerOpen = false;
let hangoutFriendSearch = "";
let calendarImportOpen = false;
let calendarImportStartDate = "";
let calendarImportEndDate = "";
let ideaFormDraft = null;
let ideaFormFriendIds = [];
let ideaFriendPickerOpen = false;
let ideaFriendSearch = "";
let highlightHangoutId = null;
let editingFriendId = null;
let editingHangoutId = null;
let editHangoutFriendIds = [];
let editHangoutFriendPickerOpen = false;
let editHangoutFriendSearch = "";
let editingIdeaId = null;
let editIdeaFriendIds = [];
let editIdeaFriendPickerOpen = false;
let editIdeaFriendSearch = "";
let taskFormExpanded = false;
let editingTaskId = null;
const TASKS_LIST_COLLAPSED_KEY = "flowPlannerTasksListCollapsed";

function loadAppStateFromStorage() {
  plannerData = normalizePlannerData(DataService.get(DataService.KEYS.PLANNER_DATA) || {});
  systemsData = normalizeSystemsData(DataService.get(DataService.KEYS.SYSTEMS_DATA) || {});
  socialData = normalizeSocialData(DataService.get(DataService.KEYS.SOCIAL_DATA) || {});
  scheduleData = normalizeScheduleData(DataService.get(DataService.KEYS.SCHEDULE_DATA) || {});
  allZipData = DataService.get(DataService.KEYS.ALL_ZIP_DATA) || [];
  allZipCustomOptions = {
    taskPriorities: ["Low", "Medium", "High"],
    habitCategories: ["Health", "Home", "Work", "Personal"],
    goalCategories: ["Personal", "Career", "Health"],
    goalTypes: DEFAULT_GOAL_TYPES,
    goalUnits: DEFAULT_GOAL_UNITS,
    logUnits: DEFAULT_LOG_UNITS,
    ...(DataService.get(DataService.KEYS.ALL_ZIP_CUSTOM_OPTIONS) || {})
  };
  DataService.saveAll();
}

function initializeApp() {
  loadAppStateFromStorage();
  loadSocialSortPreferences();
  setPage(activePage);
}

function saveSystemsData() { DataService.saveSystemsData(systemsData); }
function saveScheduleData() { DataService.saveScheduleData(scheduleData); }
function saveSocialData() { DataService.saveSocialData(socialData); }
function saveAllAppState() { DataService.saveAll(); }

function getPageHTML(page) {
  return `<section class="page page-${page.toLowerCase()}"><div id="pageRoot"></div></section>`;
}

function setPage(page) {
  activePage = page === "Systems" ? "Productivity" : page === "Planner" ? "Calendar" : page;
  document.querySelectorAll(".bottom-nav button").forEach(button => button.classList.toggle("active", button.dataset.tab === activePage));
  document.querySelector("header").textContent = activePage === "Productivity" ? "Productivity" : activePage;
  renderCurrentPage();
}

function renderCurrentPage() {
  main.innerHTML = getPageHTML(activePage);
  if (activePage === "Tasks") renderTasks();
  if (activePage === "Calendar") renderCalendar();
  if (activePage === "Productivity") renderProductivity();
  if (activePage === "Social") renderSocial();
  if (activePage === "Data") renderDataSettings();
}

function card(title, body, actions = "") {
  return `<div class="card"><div class="card-head"><h3>${escapeHTML(title)}</h3>${actions}</div>${body}</div>`;
}

function optionList(values, selected = "") {
  return values.map(value => `<option value="${escapeHTML(value)}" ${value === selected ? "selected" : ""}>${escapeHTML(value)}</option>`).join("");
}

function getTaskStats(tasks = []) {
  const today = todayISO();
  return {
    total: tasks.length,
    notStarted: tasks.filter(task => task.status === "Not Started").length,
    inProgress: tasks.filter(task => task.status === "In Progress").length,
    complete: tasks.filter(task => task.status === "Complete").length,
    overdue: tasks.filter(task => task.dueDate && task.dueDate < today && task.status !== "Complete").length
  };
}

function isTaskFormOpen(tasks = []) {
  return tasks.length === 0 || taskFormExpanded || Boolean(editingTaskId);
}

function renderTaskStats(stats) {
  return `<div class="card task-stats-card"><div class="stats-grid stats-grid-5"><div><strong>${stats.total}</strong><span>Total Tasks</span></div><div><strong>${stats.notStarted}</strong><span>Not Started</span></div><div><strong>${stats.inProgress}</strong><span>In Progress</span></div><div><strong>${stats.complete}</strong><span>Complete</span></div><div><strong>${stats.overdue}</strong><span>Overdue</span></div></div></div>`;
}

function isTasksListCollapsed() {
  try { return localStorage.getItem(TASKS_LIST_COLLAPSED_KEY) === "true"; } catch { return false; }
}

function setTasksListCollapsed(collapsed) {
  try { localStorage.setItem(TASKS_LIST_COLLAPSED_KEY, collapsed ? "true" : "false"); } catch {}
}

function renderTasksList(tasks) {
  const listOpen = !isTasksListCollapsed();
  const body = tasks.length
    ? `<div class="item-list task-list">${tasks.map(renderTaskItem).join("")}</div>`
    : `<p class="muted-text">No tasks yet.</p>`;
  return `<div class="card collapsible-card ${listOpen ? "is-open" : "is-collapsed"}">
    <button type="button" class="collapse-trigger" onclick="toggleTasksList()" aria-expanded="${listOpen}">
      <h3>Tasks</h3>
      <div class="collapse-trigger-meta">
        <span class="collapse-count">${tasks.length}</span>
        <span class="collapse-caret" aria-hidden="true">${listOpen ? "▾" : "▸"}</span>
      </div>
    </button>
    ${listOpen ? body : ""}
  </div>`;
}

function renderTaskForm(editingTask = null) {
  return `<form onsubmit="saveTask(event)" class="stack">
    <input id="taskTitle" placeholder="Task or objective" value="${escapeHTML(editingTask?.title || "")}" required>
    <div class="grid-2"><input id="taskDueDate" type="date" value="${escapeHTML(editingTask?.dueDate || "")}"><select id="taskPriority">${optionList(allZipCustomOptions.taskPriorities || ["Low", "Medium", "High"], editingTask?.priority || "Medium")}</select></div>
    <select id="taskStatus">${optionList(["Not Started", "In Progress", "Complete"], editingTask?.status || "Not Started")}</select>
    <textarea id="taskNotes" placeholder="Notes">${escapeHTML(editingTask?.notes || "")}</textarea>
    <div class="button-row">
      <button>${editingTask ? "Save Task" : "Add Task"}</button>
      ${editingTask ? `<button type="button" class="secondary-btn" onclick="cancelTaskEdit()">Cancel</button>` : ""}
    </div>
  </form>`;
}

function renderTasks() {
  const tasks = [...systemsData.tasks].sort(byDate);
  const complete = tasks.filter(task => task.status === "Complete").slice(-12).reverse();
  const stats = getTaskStats(tasks);
  const formOpen = isTaskFormOpen(tasks);
  const editingTask = editingTaskId ? tasks.find(task => task.id === editingTaskId) : null;
  document.getElementById("pageRoot").innerHTML = `
    <div class="card collapsible-card ${formOpen ? "is-open" : "is-collapsed"}">
      <button type="button" class="collapse-trigger" onclick="toggleTaskForm()" aria-expanded="${formOpen}">
        <h3>${editingTask ? "Edit Task" : "New Task"}</h3>
        <span class="collapse-caret" aria-hidden="true">${formOpen ? "▾" : "▸"}</span>
      </button>
      ${formOpen ? renderTaskForm(editingTask) : ""}
    </div>
    ${renderTaskStats(stats)}
    ${renderTasksList(tasks)}
    ${card("Completed History", complete.length ? `<div class="item-list compact">${complete.map(task => `<div class="item"><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML((task.completedAt || "").slice(0, 10))}</span></div>`).join("")}</div>` : `<p class="muted-text">Completed tasks will appear here.</p>`)}
  `;
}

function renderTaskItem(task) {
  return `<div class="item ${task.status === "Complete" ? "is-done" : ""}">
    <div><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(task.dueDate || "No due date")} · ${escapeHTML(task.priority)} · ${escapeHTML(task.status)}</span></div>
    <div class="mini-actions task-actions">
      <button onclick="cycleTaskStatus('${task.id}')">Status</button>
      <button class="secondary-btn" onclick="editTask('${task.id}')">Edit</button>
      <button class="secondary-btn" onclick="deleteTask('${task.id}')">Delete</button>
    </div>
  </div>`;
}

function toggleTaskForm() {
  if (!systemsData.tasks.length) return;
  taskFormExpanded = !taskFormExpanded;
  if (!taskFormExpanded) editingTaskId = null;
  renderTasks();
}

function toggleTasksList() {
  setTasksListCollapsed(!isTasksListCollapsed());
  renderTasks();
}

function editTask(id) {
  editingTaskId = id;
  taskFormExpanded = true;
  renderTasks();
}

function cancelTaskEdit() {
  editingTaskId = null;
  renderTasks();
}

function saveTask(event) {
  event.preventDefault();
  const payload = { title: taskTitle.value, dueDate: taskDueDate.value, priority: taskPriority.value, status: taskStatus.value, notes: taskNotes.value };
  if (editingTaskId) {
    const index = systemsData.tasks.findIndex(item => item.id === editingTaskId);
    if (index !== -1) {
      const existing = systemsData.tasks[index];
      systemsData.tasks[index] = normalizeTask({ ...existing, ...payload, id: editingTaskId, updatedAt: nowISO() });
    }
    editingTaskId = null;
  } else {
    systemsData.tasks.push(normalizeTask(payload));
  }
  if (systemsData.tasks.length) taskFormExpanded = false;
  saveSystemsData();
  renderTasks();
}

function cycleTaskStatus(id) {
  const task = systemsData.tasks.find(item => item.id === id);
  if (!task) return;
  const statuses = ["Not Started", "In Progress", "Complete"];
  task.status = statuses[(statuses.indexOf(task.status) + 1) % statuses.length];
  task.updatedAt = nowISO();
  if (task.status === "Complete") {
    task.completedAt = task.completedAt || nowISO();
    task.history.push({ status: "Complete", date: task.completedAt });
    addLog({ title: `Task completed: ${task.title}`, source: "Task", linkedTaskId: task.id, linkedGoalId: task.linkedGoalId || "", category: "Task" }, false);
  }
  saveSystemsData();
  renderTasks();
}

function deleteTask(id) {
  if (!confirm("Delete this task?")) return;
  if (editingTaskId === id) editingTaskId = null;
  systemsData.tasks = systemsData.tasks.filter(item => item.id !== id);
  saveSystemsData();
  renderTasks();
}

function getCalendarRange() {
  const base = new Date(`${calendarDate}T00:00:00`);
  if (calendarView === "Day") return { start: calendarDate, end: calendarDate, label: formatDisplayDate(calendarDate) };
  if (calendarView === "Custom") {
    const start = customStartDate <= customEndDate ? customStartDate : customEndDate;
    const end = customStartDate <= customEndDate ? customEndDate : customStartDate;
    return { start, end, label: `${formatDisplayDate(start)} to ${formatDisplayDate(end)}` };
  }
  const start = new Date(base);
  if (calendarView === "Week") start.setDate(base.getDate() - base.getDay());
  if (calendarView === "Month") start.setDate(1);
  const end = new Date(start);
  end.setDate(start.getDate() + (calendarView === "Week" ? 6 : new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate() - 1));
  const startISO = start.toISOString().slice(0, 10);
  const endISO = end.toISOString().slice(0, 10);
  return {
    start: startISO,
    end: endISO,
    label: calendarView === "Month"
      ? base.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : `${formatDisplayDate(startISO)} to ${formatDisplayDate(endISO)}`
  };
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return toISODate(date);
}

function moveCalendar(amount) {
  if (calendarView === "Custom") {
    const startDate = new Date(`${customStartDate}T00:00:00`);
    const endDate = new Date(`${customEndDate}T00:00:00`);
    const days = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);
    startDate.setDate(startDate.getDate() + (amount * days));
    endDate.setDate(endDate.getDate() + (amount * days));
    customStartDate = startDate.toISOString().slice(0, 10);
    customEndDate = endDate.toISOString().slice(0, 10);
    calendarDate = customStartDate;
    renderCalendar();
    return;
  }
  const date = new Date(`${calendarDate}T00:00:00`);
  if (calendarView === "Month") date.setMonth(date.getMonth() + amount);
  else date.setDate(date.getDate() + (calendarView === "Week" ? amount * 7 : amount));
  calendarDate = date.toISOString().slice(0, 10);
  renderCalendar();
}

function formatDisplayDate(dateString) {
  if (!dateString) return "No date";
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatCalendarDayLabel(dateString) {
  if (!dateString) return "No date";
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function getTasksForDate(date) {
  return systemsData.tasks.filter(task => task.dueDate === date);
}

function getHangoutsForDate(date) {
  return socialData.hangouts.filter(hangout => {
    if ((hangout.date || "") !== date) return false;
    return !getBlockByLinkedHangoutId(hangout.id);
  });
}

function getCalendarDayItemCount(date) {
  const blocks = scheduleData.blocks.filter(block => block.date === date).length;
  const hangouts = getHangoutsForDate(date).length;
  const tasks = getTasksForDate(date).length;
  return blocks + hangouts + tasks;
}

function renderDayItemBadge(count) {
  if (!count) return "";
  return `<span class="day-item-badge">${count} item${count === 1 ? "" : "s"}</span>`;
}

function hangoutToLayoutItem(hangout) {
  const startTime = getHangoutStartTime(hangout);
  return {
    id: hangout.id,
    startTime,
    endTime: getHangoutEndTime(hangout) || minutesToTime(parseTimeToMinutes(startTime) + 60)
  };
}

function getHangoutDurationMinutes(hangout = {}) {
  const startTime = getHangoutStartTime(hangout);
  const endTime = getHangoutEndTime(hangout);
  if (startTime && endTime) return Math.max(15, parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime));
  return 60;
}

function renderCalendarHangout(hangout, compact = false, layout = null) {
  const people = getHangoutPeopleNames(hangout, socialData.friends);
  const startTime = getHangoutStartTime(hangout);
  const start = startTime ? parseTimeToMinutes(startTime) : 0;
  const height = Math.max(26, getHangoutDurationMinutes(hangout) * (64 / 60));
  const top = start * (64 / 60);
  const width = layout ? `calc(${100 / layout.cols}% - 6px)` : "calc(100% - 8px)";
  const left = layout ? `calc(${(100 / layout.cols) * layout.col}% + 4px)` : "4px";
  const style = compact || !startTime ? "" : `style="top:${top}px;height:${height}px;left:${left};width:${width}"`;
  const timeLabel = startTime ? formatCalendarBlockTime({ startTime, endTime: getHangoutEndTime(hangout) }) : "All day";
  return `<button type="button" class="calendar-event calendar-hangout ${compact ? "compact" : ""} ${hangout.completed ? "is-complete" : ""}" ${style} data-category="Social" onclick="openHangoutFromCalendar('${hangout.id}')">
    <span class="calendar-item-type">Hangout</span>
    <strong>${escapeHTML(hangout.activity || hangout.title)}</strong>
    <span>${escapeHTML(timeLabel)}</span>
    ${people.length ? `<em>${escapeHTML(people.join(", "))}</em>` : ""}
  </button>`;
}

function renderCalendar() {
  const range = getCalendarRange();
  const blocks = getBlocksForRange(range.start, range.end);
  document.getElementById("pageRoot").innerHTML = `
    <section class="calendar-shell">
      <div class="calendar-toolbar">
        <div>
          <h2>${escapeHTML(range.label)}</h2>
          <p>${escapeHTML(calendarView)} view · ${blocks.length} block${blocks.length === 1 ? "" : "s"}</p>
        </div>
        <div class="calendar-toolbar-actions">
          <button class="secondary-btn" onclick="goToToday()">Today</button>
          <input aria-label="Jump to date" type="date" value="${calendarDate}" onchange="jumpToDate(this.value)">
          <button onclick="openBlockModal()">+ Add Block</button>
        </div>
      </div>
      <div class="calendar-nav-row">
        <button class="secondary-btn" onclick="moveCalendar(-1)">Previous</button>
        <div class="segmented">${["Day", "Week", "Month", "Custom"].map(view => `<button class="${calendarView === view ? "active" : ""}" onclick="setCalendarView('${view}')">${view}</button>`).join("")}</div>
        <button class="secondary-btn" onclick="moveCalendar(1)">Next</button>
      </div>
      ${calendarView === "Custom" ? `<div class="grid-2"><input type="date" value="${customStartDate}" onchange="customStartDate=this.value; renderCalendar();"><input type="date" value="${customEndDate}" onchange="customEndDate=this.value; renderCalendar();"></div>` : ""}
      ${renderCalendarSurface(range, blocks)}
    </section>
    ${renderBlockModal()}
  `;
}

function setCalendarView(view) {
  calendarView = view;
  renderCalendar();
}

function jumpToDate(date) {
  if (!date) return;
  calendarDate = date;
  if (calendarView === "Custom") {
    customStartDate = date;
    customEndDate = date;
  }
  renderCalendar();
}

function goToToday() {
  calendarDate = todayISO();
  if (calendarView === "Custom") {
    customStartDate = calendarDate;
    customEndDate = calendarDate;
  }
  renderCalendar();
}

function getBlocksForRange(start, end) {
  return scheduleData.blocks
    .filter(block => block.date >= start && block.date <= end)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

function renderCalendarSurface(range, blocks) {
  if (calendarView === "Day") return renderDayCalendar(range.start, blocks);
  if (calendarView === "Week") return renderWeekCalendar(range.start, blocks);
  if (calendarView === "Month") return renderMonthCalendar();
  return renderCustomCalendar(range, blocks);
}

function renderSchedule(range, blocks) {
  return `
    <div class="calendar-range-summary">
      <strong>${escapeHTML(range.label)}</strong>
      <span>${blocks.length} block${blocks.length === 1 ? "" : "s"} scheduled</span>
    </div>
    ${blocks.length ? `<div class="calendar-block-list">${blocks.map(renderBlockItem).join("")}</div>` : `<div class="empty-state small"><p>No blocks scheduled for this range.</p></div>`}
  `;
}

function renderBlocks() {
  const range = getCalendarRange();
  return renderSchedule(range, getBlocksForRange(range.start, range.end));
}

function parseTimeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return ((hours || 0) * 60) + (minutes || 0);
}

function minutesToTime(total) {
  const minutes = Math.max(0, Math.min(1439, total));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function getBlockDuration(block) {
  if (block.endTime) {
    return Math.max(15, parseTimeToMinutes(block.endTime) - parseTimeToMinutes(block.startTime));
  }
  const stored = Number(block.durationMinutes);
  if (!Number.isNaN(stored) && stored > 0) return stored;
  return 60;
}

function formatCalendarBlockTime(block = {}) {
  const start = block.startTime || "";
  const end = block.endTime || "";
  if (start && end) return `${start}-${end}`;
  return start || "";
}

function getWeekDates(startISO) {
  return Array.from({ length: 7 }, (_, index) => addDays(startISO, index));
}

function getDayLabel(dateString, options = {}) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, options);
}

function getBlockCategory(block) {
  return block.category || "Personal";
}

function getCalendarBlockMeta(block) {
  const task = systemsData.tasks.find(item => item.id === block.linkedTaskId);
  const habit = systemsData.habits.find(item => item.id === block.linkedHabitId);
  const hangout = block.linkedHangoutId
    ? socialData.hangouts.find(item => item.id === block.linkedHangoutId) || null
    : null;
  return { task, habit, hangout };
}

function getBlockEndMinutes(block) {
  if (block.endTime) return parseTimeToMinutes(block.endTime);
  return parseTimeToMinutes(block.startTime) + getBlockDuration(block);
}

function layoutOverlappingBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
  const positioned = new Map();
  let group = [];
  let groupEnd = 0;
  const flush = () => {
    const columns = [];
    group.forEach(block => {
      const start = parseTimeToMinutes(block.startTime);
      let col = columns.findIndex(end => end <= start);
      if (col === -1) {
        col = columns.length;
        columns.push(0);
      }
      columns[col] = getBlockEndMinutes(block);
      positioned.set(block.id, { col, cols: 1 });
    });
    const total = Math.max(1, columns.length);
    group.forEach(block => positioned.set(block.id, { ...positioned.get(block.id), cols: total }));
    group = [];
    groupEnd = 0;
  };
  sorted.forEach(block => {
    const start = parseTimeToMinutes(block.startTime);
    const end = getBlockEndMinutes(block);
    if (group.length && start >= groupEnd) flush();
    group.push(block);
    groupEnd = Math.max(groupEnd, end);
  });
  if (group.length) flush();
  return positioned;
}

function renderCalendarBlock(block, compact = false, layout = null) {
  const { task, habit, hangout } = getCalendarBlockMeta(block);
  const people = hangout ? getHangoutPeopleNames(hangout, socialData.friends) : [];
  const location = hangout?.location || "";
  const start = parseTimeToMinutes(block.startTime);
  const height = Math.max(26, getBlockDuration(block) * (64 / 60));
  const top = start * (64 / 60);
  const width = layout ? `calc(${100 / layout.cols}% - 6px)` : "calc(100% - 8px)";
  const left = layout ? `calc(${(100 / layout.cols) * layout.col}% + 4px)` : "4px";
  const style = compact ? "" : `style="top:${top}px;height:${height}px;left:${left};width:${width}"`;
  return `<button class="calendar-event ${compact ? "compact" : ""} ${block.completed ? "is-complete" : ""}" ${style} data-category="${escapeHTML(getBlockCategory(block))}" draggable="true" ondragstart="startBlockDrag(event, '${block.id}')" onclick="openBlockModal('${block.id}')">
    ${hangout ? `<span class="calendar-item-type">Hangout</span>` : ""}
    <strong>${escapeHTML(block.title)}</strong>
    <span>${escapeHTML(formatCalendarBlockTime(block))}</span>
    ${people.length ? `<em>${escapeHTML(people.join(", "))}</em>` : ""}
    ${location ? `<em>${escapeHTML(location)}</em>` : ""}
    ${task ? `<em>${escapeHTML(task.title)}</em>` : ""}
    ${habit ? `<em>${escapeHTML(habit.name)}</em>` : ""}
  </button>`;
}

function renderDayCalendar(date, blocks) {
  const hangouts = getHangoutsForDate(date);
  const allDayHangouts = hangouts.filter(hangout => !getHangoutStartTime(hangout));
  const timedHangouts = hangouts.filter(hangout => getHangoutStartTime(hangout));
  const layout = layoutOverlappingBlocks([...blocks, ...timedHangouts.map(hangoutToLayoutItem)]);
  const itemCount = getCalendarDayItemCount(date);
  const currentTime = new Date();
  const showNow = date === todayISO();
  const nowTop = ((currentTime.getHours() * 60) + currentTime.getMinutes()) * (64 / 60);
  return `<div class="calendar-board day-board ${date === todayISO() ? "is-today" : ""}">
    <div class="calendar-day-title">
      <strong>${escapeHTML(formatCalendarDayLabel(date))}</strong>
      ${renderDayItemBadge(itemCount)}
    </div>
    ${allDayHangouts.length ? `<div class="calendar-all-day-row">${allDayHangouts.map(hangout => renderCalendarHangout(hangout, true)).join("")}</div>` : ""}
    <div class="time-grid day-grid" ondragover="allowCalendarDrop(event)" ondrop="dropBlockOnTimeline(event, '${date}')">
      <div class="time-gutter">${renderHourLabels()}</div>
      <div class="time-canvas">
        ${renderHourRows(date)}
        ${showNow ? `<div class="now-line" style="top:${nowTop}px"><span></span></div>` : ""}
        ${blocks.map(block => renderCalendarBlock(block, false, layout.get(block.id))).join("")}
        ${timedHangouts.map(hangout => renderCalendarHangout(hangout, false, layout.get(hangout.id))).join("")}
      </div>
    </div>
    ${itemCount ? "" : `<div class="empty-state small"><p>No blocks scheduled for this range.</p></div>`}
  </div>`;
}

function renderWeekCalendar(startDate, blocks) {
  const dates = getWeekDates(startDate);
  return `<div class="calendar-board week-board">
    <div class="week-header"><div></div>${dates.map(date => {
      const itemCount = getCalendarDayItemCount(date);
      return `<button class="week-day-head ${date === todayISO() ? "is-today" : ""}" onclick="calendarDate='${date}'; calendarView='Day'; renderCalendar();">
        <span>${escapeHTML(formatCalendarDayLabel(date))}</span>
        ${renderDayItemBadge(itemCount)}
      </button>`;
    }).join("")}</div>
    <div class="week-grid">
      <div class="time-gutter">${renderHourLabels()}</div>
      ${dates.map(date => {
        const dayBlocks = blocks.filter(block => block.date === date);
        const hangouts = getHangoutsForDate(date);
        const allDayHangouts = hangouts.filter(hangout => !getHangoutStartTime(hangout));
        const timedHangouts = hangouts.filter(hangout => getHangoutStartTime(hangout));
        const layout = layoutOverlappingBlocks([...dayBlocks, ...timedHangouts.map(hangoutToLayoutItem)]);
        return `<div class="time-canvas week-day-column ${date === todayISO() ? "is-today" : ""}" ondragover="allowCalendarDrop(event)" ondrop="dropBlockOnTimeline(event, '${date}')">
          ${allDayHangouts.length ? `<div class="calendar-all-day-row compact">${allDayHangouts.map(hangout => renderCalendarHangout(hangout, true)).join("")}</div>` : ""}
          ${renderHourRows(date)}
          ${dayBlocks.map(block => renderCalendarBlock(block, false, layout.get(block.id))).join("")}
          ${timedHangouts.map(hangout => renderCalendarHangout(hangout, false, layout.get(hangout.id))).join("")}
        </div>`;
      }).join("")}
    </div>
    ${blocks.length ? "" : `<div class="empty-state small"><p>No blocks scheduled for this range.</p></div>`}
  </div>`;
}

function renderMonthCalendar() {
  const base = new Date(`${calendarDate}T00:00:00`);
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  const dates = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return toISODate(date);
  });
  return `<div class="calendar-board month-board">
    <div class="month-weekdays">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => `<span>${day}</span>`).join("")}</div>
    <div class="month-grid">
      ${dates.map(date => {
        const dayBlocks = scheduleData.blocks.filter(block => block.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
        const dayHangouts = getHangoutsForDate(date);
        const dayItems = [...dayBlocks.map(block => ({ type: "block", item: block })), ...dayHangouts.map(hangout => ({ type: "hangout", item: hangout }))];
        const itemCount = getCalendarDayItemCount(date);
        const isOutside = new Date(`${date}T00:00:00`).getMonth() !== base.getMonth();
        const preview = dayItems.slice(0, 3).map(entry => entry.type === "block"
          ? renderCalendarBlock(entry.item, true)
          : renderCalendarHangout(entry.item, true)).join("");
        const overflow = dayItems.length > 3 ? dayItems.length - 3 : 0;
        return `<div class="month-cell ${isOutside ? "is-outside" : ""} ${date === todayISO() ? "is-today" : ""}" ondragover="allowCalendarDrop(event)" ondrop="dropBlockOnDate(event, '${date}')">
          <div class="month-cell-head">
            <button class="month-date" onclick="calendarDate='${date}'; calendarView='Day'; renderCalendar();">${new Date(`${date}T00:00:00`).getDate()}</button>
            <span class="month-day-label">${escapeHTML(getDayLabel(date, { weekday: "short" }))}</span>
            ${renderDayItemBadge(itemCount)}
          </div>
          <div class="month-events">${preview}${overflow ? `<button class="more-events" onclick="calendarDate='${date}'; calendarView='Day'; renderCalendar();">+${overflow} more</button>` : ""}</div>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

function renderCustomCalendar(range, blocks) {
  const days = [];
  for (let date = range.start; date <= range.end; date = addDays(date, 1)) days.push(date);
  return `<div class="calendar-board custom-board">
    ${renderSchedule(range, blocks)}
    <div class="custom-day-groups">
      ${days.map(date => {
        const dayBlocks = blocks.filter(block => block.date === date);
        const dayHangouts = getHangoutsForDate(date);
        const itemCount = getCalendarDayItemCount(date);
        return `<section class="custom-day ${date === todayISO() ? "is-today" : ""}" ondragover="allowCalendarDrop(event)" ondrop="dropBlockOnDate(event, '${date}')">
          <div class="custom-day-head">
            <button onclick="calendarDate='${date}'; calendarView='Day'; renderCalendar();">${escapeHTML(formatCalendarDayLabel(date))}</button>
            ${renderDayItemBadge(itemCount)}
          </div>
          ${dayHangouts.length ? `<div class="custom-day-hangouts">${dayHangouts.map(hangout => renderCalendarHangout(hangout, true)).join("")}</div>` : ""}
          ${dayBlocks.length ? dayBlocks.map(block => renderBlockItem(block)).join("") : dayHangouts.length ? "" : `<p class="muted-text">No blocks scheduled.</p>`}
        </section>`;
      }).join("")}
    </div>
  </div>`;
}

function renderHourLabels() {
  return Array.from({ length: 24 }, (_, hour) => `<div>${hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}</div>`).join("");
}

function renderHourRows(date) {
  return Array.from({ length: 24 }, (_, hour) => `<div class="hour-row" ondragover="allowCalendarDrop(event)" ondrop="dropBlockOnTimeline(event, '${date}', ${hour})"></div>`).join("");
}

function renderBlockItem(block) {
  const { task, habit, hangout } = getCalendarBlockMeta(block);
  const people = hangout ? getHangoutPeopleNames(hangout, socialData.friends) : [];
  const location = hangout?.location || "";
  return `<div class="item calendar-block-card ${block.completed ? "is-done" : ""}" data-category="${escapeHTML(getBlockCategory(block))}" draggable="true" ondragstart="startBlockDrag(event, '${block.id}')" onclick="openBlockModal('${block.id}')">
    <div>
      <strong>${escapeHTML(block.title)}</strong>
      <span>${escapeHTML(formatDisplayDate(block.date))} · ${escapeHTML(formatCalendarBlockTime(block))}</span>
      <div class="linked-line">${people.length ? `<span>Friends: ${escapeHTML(people.join(", "))}</span>` : ""}${location ? `<span>${escapeHTML(location)}</span>` : ""}${task ? `<span>Task: ${escapeHTML(task.title)}</span>` : ""}${habit ? `<span>Habit: ${escapeHTML(habit.name)}</span>` : ""}</div>
      ${block.notes ? `<p>${escapeHTML(block.notes)}</p>` : ""}
    </div>
    <div class="mini-actions"><button onclick="event.stopPropagation(); completeBlock('${block.id}')">${block.completed ? "Undo" : "Complete"}</button><button class="secondary-btn" onclick="event.stopPropagation(); deleteBlock('${block.id}', event)">Delete</button></div>
  </div>`;
}

let editingBlockId = null;
let calendarDraggedBlockId = null;

function openBlockModal(id = "", date = calendarDate, startTime = "09:00") {
  closeBlockModal();
  editingBlockId = id || null;
  const existing = editingBlockId ? scheduleData.blocks.find(block => block.id === editingBlockId) : null;
  const start = existing?.startTime || startTime;
  const end = existing?.endTime || minutesToTime(parseTimeToMinutes(start) + 60);
  document.body.insertAdjacentHTML("beforeend", renderBlockModal(existing || normalizeBlock({ date, startTime: start, endTime: end })));
}

function closeBlockModal() {
  editingBlockId = null;
  document.querySelector(".modal-backdrop")?.remove();
}

function renderBlockModal(block = null) {
  if (!block) return "";
  return `<div class="modal-backdrop" onclick="if(event.target===this) closeBlockModal()">
    <div class="modal">
      <div class="modal-head">
        <h3>${editingBlockId ? "Edit Block" : "Add Block"}</h3>
        <button class="icon-btn" onclick="closeBlockModal()">x</button>
      </div>
      <form id="blockForm" onsubmit="addBlock(event)" class="stack">
        <input id="blockTitle" name="blockTitle" placeholder="Scheduled item" value="${escapeHTML(editingBlockId ? block.title : "")}" required>
        <div class="grid-3">
          <input id="blockDate" name="blockDate" type="date" value="${escapeHTML(block.date || calendarDate)}">
          <input id="blockStart" name="blockStart" type="time" value="${escapeHTML(block.startTime || "09:00")}">
          <input id="blockEnd" name="blockEnd" type="time" value="${escapeHTML(block.endTime || "10:00")}">
        </div>
        <div class="grid-2">
          <select id="blockCategory" name="blockCategory">${optionList(["Work", "School", "Fitness", "Social", "Personal", "Custom"], block.category || "Personal")}</select>
          <select id="blockRecurring" name="blockRecurring">${optionList(["None", "Daily", "Weekly", "Monthly"], block.recurring || "None")}</select>
        </div>
        <div class="grid-2">
          <select id="blockTask" name="blockTask"><option value="">Linked task</option>${systemsData.tasks.map(task => `<option value="${task.id}" ${task.id === block.linkedTaskId ? "selected" : ""}>${escapeHTML(task.title)}</option>`).join("")}</select>
          <select id="blockHabit" name="blockHabit"><option value="">Linked habit</option>${systemsData.habits.map(habit => `<option value="${habit.id}" ${habit.id === block.linkedHabitId ? "selected" : ""}>${escapeHTML(habit.name)}</option>`).join("")}</select>
        </div>
        <textarea id="blockNotes" name="blockNotes" placeholder="Notes">${escapeHTML(block.notes || "")}</textarea>
        ${editingBlockId ? `<div class="duration-tools"><span>Resize duration</span><button type="button" class="secondary-btn" onclick="resizeBlock('${editingBlockId}', -15)">-15 min</button><button type="button" class="secondary-btn" onclick="resizeBlock('${editingBlockId}', 15)">+15 min</button></div>` : ""}
        <div class="button-row">
          <button>Save</button>
          ${editingBlockId ? `<button type="button" class="secondary-btn" onclick="duplicateBlock('${editingBlockId}')">Duplicate</button>` : `<button type="button" class="secondary-btn" onclick="closeBlockModal()">Cancel</button>`}
        </div>
      </form>
    </div>
  </div>`;
}

function addBlock(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const block = normalizeBlock({
    title: form.blockTitle.value,
    date: form.blockDate.value,
    startTime: form.blockStart.value,
    endTime: form.blockEnd.value,
    recurring: form.blockRecurring.value,
    category: form.blockCategory.value,
    linkedTaskId: form.blockTask.value,
    linkedHabitId: form.blockHabit.value,
    notes: form.blockNotes.value
  });
  if (editingBlockId) {
    const index = scheduleData.blocks.findIndex(item => item.id === editingBlockId);
    if (index !== -1) scheduleData.blocks[index] = { ...scheduleData.blocks[index], ...block, id: editingBlockId, updatedAt: nowISO() };
  } else {
    scheduleData.blocks.push(block);
  }
  calendarDate = block.date;
  saveScheduleData();
  closeBlockModal();
  renderCalendar();
}

function saveBlock(event) {
  addBlock(event);
}

function completeBlock(id) {
  const block = scheduleData.blocks.find(item => item.id === id);
  if (!block) return;
  block.completed = !block.completed;
  block.completedAt = block.completed ? nowISO() : "";
  if (block.completed) {
    addLog({ title: `Block completed: ${block.title}`, source: "Block", linkedBlockId: block.id, linkedHabitId: block.linkedHabitId, linkedTaskId: block.linkedTaskId, category: "Block" }, false);
    if (block.linkedHabitId) completeHabit(block.linkedHabitId, block.date, false);
  }
  saveScheduleData();
  saveSystemsData();
  renderCalendar();
}

function toggleBlock(id) {
  completeBlock(id);
}

function deleteBlock(id, evt = null) {
  evt?.stopPropagation?.();
  if (!confirm("Delete this block?")) return;
  scheduleData.blocks = scheduleData.blocks.filter(item => item.id !== id);
  saveScheduleData();
  closeBlockModal();
  renderCalendar();
}

function duplicateBlock(id) {
  const block = scheduleData.blocks.find(item => item.id === id);
  if (!block) return;
  scheduleData.blocks.push({ ...block, id: createId("block"), title: `${block.title} copy`, completed: false, completedAt: "", createdAt: nowISO(), updatedAt: nowISO() });
  saveScheduleData();
  closeBlockModal();
  renderCalendar();
}

function resizeBlock(id, deltaMinutes) {
  const block = scheduleData.blocks.find(item => item.id === id);
  if (!block) return;
  block.endTime = minutesToTime(parseTimeToMinutes(block.endTime) + deltaMinutes);
  if (parseTimeToMinutes(block.endTime) <= parseTimeToMinutes(block.startTime)) {
    block.endTime = minutesToTime(parseTimeToMinutes(block.startTime) + 15);
  }
  block.updatedAt = nowISO();
  saveScheduleData();
  renderCalendar();
}

function startBlockDrag(event, id) {
  calendarDraggedBlockId = id;
  event.dataTransfer?.setData("text/plain", id);
}

function allowCalendarDrop(event) {
  event.preventDefault();
}

function dropBlockOnDate(event, date) {
  event.preventDefault();
  const id = event.dataTransfer?.getData("text/plain") || calendarDraggedBlockId;
  const block = scheduleData.blocks.find(item => item.id === id);
  if (!block) return;
  block.date = date;
  block.updatedAt = nowISO();
  saveScheduleData();
  renderCalendar();
}

function dropBlockOnTimeline(event, date, hour = null) {
  event.preventDefault();
  const id = event.dataTransfer?.getData("text/plain") || calendarDraggedBlockId;
  const block = scheduleData.blocks.find(item => item.id === id);
  if (!block) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const minutesFromTop = hour === null ? Math.round(((event.clientY - rect.top) / 64) * 60 / 15) * 15 : hour * 60;
  const duration = getBlockDuration(block);
  block.date = date;
  block.startTime = minutesToTime(minutesFromTop);
  block.endTime = minutesToTime(minutesFromTop + duration);
  block.updatedAt = nowISO();
  saveScheduleData();
  renderCalendar();
}

function renderProductivity() {
  if (productivityTab === "Logs") productivityTab = "Goals";
  document.getElementById("pageRoot").innerHTML = `
    <div class="segmented page-tabs">${["Habits", "Goals"].map(tab => `<button class="${productivityTab === tab ? "active" : ""}" onclick="productivityTab='${tab}'; renderProductivity();">${tab}</button>`).join("")}</div>
    <div id="productivityBody"></div>`;
  if (productivityTab === "Habits") renderHabits();
  if (productivityTab === "Goals") renderGoals();
}

function getHabitScheduleMap(habit) {
  const map = new Map();
  (habit?.schedule || []).forEach(entry => {
    const dayIndex = HABIT_DAY_NAMES.indexOf(entry.day);
    if (dayIndex >= 0) map.set(dayIndex, entry);
  });
  return map;
}

function renderHabitScheduleRow(dayIndex, entry = {}, isSelected = false) {
  const day = HABIT_DAY_NAMES[dayIndex];
  const startTime = entry.startTime || "09:00";
  const endTime = entry.endTime || "";
  const duration = entry.durationMinutes || 30;
  const calendarSync = entry.calendarSync !== false;
  return `<div id="habitSchedule-${dayIndex}" class="habit-schedule-row${isSelected ? "" : " hidden"}">
    <span class="habit-schedule-day">${day}</span>
    <input name="habitScheduleStart-${dayIndex}" type="time" value="${escapeHTML(startTime)}" aria-label="${day} start time">
    <input name="habitScheduleEnd-${dayIndex}" type="time" value="${escapeHTML(endTime)}" aria-label="${day} end time" placeholder="End">
    <input name="habitScheduleDuration-${dayIndex}" type="number" min="15" step="15" value="${escapeHTML(duration)}" aria-label="${day} duration minutes">
    <label class="toggle-row habit-schedule-sync"><input name="habitScheduleSync-${dayIndex}" type="checkbox" ${calendarSync ? "checked" : ""}>Calendar</label>
  </div>`;
}

function toggleHabitScheduleRow(dayIndex) {
  const checkbox = document.querySelector(`input[name="habitDays"][value="${dayIndex}"]`);
  const row = document.getElementById(`habitSchedule-${dayIndex}`);
  if (row && checkbox) row.classList.toggle("hidden", !checkbox.checked);
}

function renderHabits() {
  const editingHabit = editingHabitId ? systemsData.habits.find(habit => habit.id === editingHabitId) : null;
  const scheduleMap = getHabitScheduleMap(editingHabit);
  const selectedDays = new Set(
    scheduleMap.size ? [...scheduleMap.keys()] : (editingHabit?.daysOfWeek || [])
  );
  document.getElementById("productivityBody").innerHTML = `
    ${card(editingHabit ? "Edit Habit" : "New Habit", `
      <form onsubmit="saveHabit(event)" class="stack habit-form">
        <input id="habitName" name="habitName" placeholder="Habit name" value="${escapeHTML(editingHabit?.name || "")}" required>
        <div class="grid-2">
          <select id="habitCategory" name="habitCategory">${optionList(allZipCustomOptions.habitCategories || ["Health", "Home", "Work", "Personal"], editingHabit?.category || "Personal")}</select>
          <select id="habitGoal" name="habitGoal"><option value="">Linked goal</option>${systemsData.goals.map(goal => `<option value="${goal.id}" ${goal.id === editingHabit?.linkedGoalId ? "selected" : ""}>${escapeHTML(goal.name)}</option>`).join("")}</select>
        </div>
        <div class="weekday-picker">
          ${HABIT_DAY_NAMES.map((day, index) => `<label><input type="checkbox" name="habitDays" value="${index}" ${selectedDays.has(index) ? "checked" : ""} onchange="toggleHabitScheduleRow(${index})">${day}</label>`).join("")}
        </div>
        <div class="habit-schedule-list" aria-label="Per-day schedule">
          <div class="habit-schedule-header">
            <span>Day</span><span>Start</span><span>End</span><span>Min</span><span>Sync</span>
          </div>
          ${HABIT_DAY_NAMES.map((day, index) => renderHabitScheduleRow(index, scheduleMap.get(index) || {}, selectedDays.has(index))).join("")}
        </div>
        <div class="grid-2">
          <select id="habitRepeat" name="habitRepeat">${optionList(["Daily", "Selected days", "Weekly"], editingHabit?.repeatSetting || "Daily")}</select>
          <label class="toggle-row"><input id="habitCalendarSync" name="habitCalendarSync" type="checkbox" ${editingHabit?.calendarSync ? "checked" : ""}>Add this habit to calendar blocks</label>
        </div>
        <textarea id="habitNotes" name="habitNotes" placeholder="Notes">${escapeHTML(editingHabit?.notes || "")}</textarea>
        <div class="button-row">
          <button>${editingHabit ? "Save Habit" : "Add Habit"}</button>
          ${editingHabit ? `<button type="button" class="secondary-btn" onclick="cancelHabitEdit()">Cancel</button>` : `<button type="button" class="secondary-btn" onclick="clearHabitForm()">Clear</button>`}
        </div>
      </form>`)}
    ${card("Habit Tracking", systemsData.habits.length ? `<div class="item-list">${systemsData.habits.map(renderHabitItem).join("")}</div>` : `<p class="muted-text">No habits yet.</p>`)}
  `;
}

function renderHabitItem(habit) {
  const streak = getHabitStreak(habit);
  const doneToday = habit.completions.includes(todayISO());
  const goal = systemsData.goals.find(item => item.id === habit.linkedGoalId);
  const scheduleLines = getHabitScheduleDisplay(habit);
  return `<div class="item habit-card ${doneToday ? "is-done" : ""}">
    <div>
      <strong>${escapeHTML(habit.name)}</strong>
      <span>${escapeHTML(habit.category)} · ${streak} day streak · ${habit.completions.length} completions</span>
      <div class="habit-meta">
        ${scheduleLines.map(line => `<span>${escapeHTML(line)}</span>`).join("")}
        <span>${goal ? `Goal: ${escapeHTML(goal.name)}` : "No linked goal"}</span>
        <span>${habit.calendarSync ? "Calendar sync on" : "Calendar sync off"}</span>
      </div>
    </div>
    <div class="mini-actions habit-actions">
      <button onclick="completeHabit('${habit.id}')">${doneToday ? "Done" : "Complete Today"}</button>
      <button class="secondary-btn" onclick="editHabit('${habit.id}')">Edit</button>
      <button class="secondary-btn" onclick="addHabitToCalendar('${habit.id}')">Add to Calendar</button>
      <button class="secondary-btn" onclick="deleteHabit('${habit.id}')">Delete</button>
    </div>
  </div>`;
}

function collectHabitScheduleFromForm(form) {
  const field = (name) => form.querySelector(`[name="${name}"]`);
  return [...form.querySelectorAll('input[name="habitDays"]:checked')].map(input => {
    const dayIndex = Number(input.value);
    const startTime = field(`habitScheduleStart-${dayIndex}`)?.value || "09:00";
    const endTimeInput = field(`habitScheduleEnd-${dayIndex}`)?.value || "";
    const durationMinutes = Number(field(`habitScheduleDuration-${dayIndex}`)?.value) || 30;
    const endTime = endTimeInput || minutesToTime(parseTimeToMinutes(startTime) + durationMinutes);
    return normalizeHabitScheduleEntry({
      day: HABIT_DAY_NAMES[dayIndex],
      startTime,
      endTime,
      durationMinutes: endTimeInput ? undefined : durationMinutes,
      calendarSync: field(`habitScheduleSync-${dayIndex}`)?.checked
    });
  });
}

function saveHabit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const field = (name) => form.querySelector(`[name="${name}"]`);
  const schedule = collectHabitScheduleFromForm(form);
  const daysOfWeek = schedule.map(entry => HABIT_DAY_NAMES.indexOf(entry.day)).filter(day => day >= 0);
  const existingHabit = editingHabitId ? systemsData.habits.find(item => item.id === editingHabitId) : null;
  const habit = normalizeHabit({
    id: editingHabitId || createId("habit"),
    name: field("habitName").value,
    category: field("habitCategory").value,
    linkedGoalId: field("habitGoal").value,
    daysOfWeek,
    schedule,
    calendarSync: field("habitCalendarSync").checked,
    repeatSetting: field("habitRepeat").value,
    notes: field("habitNotes").value,
    completions: existingHabit?.completions || [],
    linkedBlockIds: existingHabit?.linkedBlockIds || [],
    createdAt: existingHabit?.createdAt || nowISO()
  });
  const existingIndex = systemsData.habits.findIndex(item => item.id === habit.id);
  if (existingIndex === -1) systemsData.habits.push(habit);
  else systemsData.habits[existingIndex] = { ...systemsData.habits[existingIndex], ...habit, updatedAt: nowISO() };
  if (habit.calendarSync) syncHabitCalendarBlocks(habit);
  else {
    const today = todayISO();
    scheduleData.blocks = scheduleData.blocks.filter(block => !(block.generatedFromHabit && block.linkedHabitId === habit.id && block.date >= today));
  }
  saveSystemsData();
  saveScheduleData();
  editingHabitId = null;
  renderHabits();
}

function completeHabit(id, date = todayISO(), shouldRender = true) {
  const habit = systemsData.habits.find(item => item.id === id);
  if (!habit || habit.completions.includes(date)) return;
  habit.completions.push(date);
  habit.updatedAt = nowISO();
  const todayBlock = scheduleData.blocks.find(block => block.linkedHabitId === habit.id && block.date === date);
  if (todayBlock) {
    todayBlock.completed = true;
    todayBlock.completedAt = nowISO();
    todayBlock.updatedAt = nowISO();
  }
  addLog({
    title: `Completed habit: ${habit.name}`,
    source: "Habit",
    category: habit.category,
    linkedHabitId: habit.id,
    linkedGoalId: habit.linkedGoalId,
    unit: habit.linkedGoalId ? getGoalUnit(habit.linkedGoalId) : ""
  }, false);
  saveSystemsData();
  saveScheduleData();
  if (shouldRender) renderProductivity();
}

function deleteHabit(id) {
  if (!confirm("Delete this habit?")) return;
  systemsData.habits = systemsData.habits.filter(item => item.id !== id);
  saveSystemsData();
  renderProductivity();
}

function editHabit(id) {
  editingHabitId = id;
  renderHabits();
}

function cancelHabitEdit() {
  editingHabitId = null;
  renderHabits();
}

function clearHabitForm() {
  editingHabitId = null;
  renderHabits();
}

function getHabitScheduleEntry(habit, dayIndex) {
  const day = HABIT_DAY_NAMES[dayIndex];
  return (habit.schedule || []).find(entry => entry.day === day) || null;
}

function getHabitEndTime(habit, scheduleEntry) {
  const entry = scheduleEntry || habit.schedule?.[0];
  if (entry?.endTime) return entry.endTime;
  if (habit.endTime) return habit.endTime;
  const startTime = entry?.startTime || habit.startTime || "09:00";
  const duration = Number(entry?.durationMinutes ?? habit.durationMinutes) || 30;
  return minutesToTime(parseTimeToMinutes(startTime) + duration);
}

function formatHabitClock(time24 = "09:00") {
  const [hours, minutes] = String(time24).split(":").map(Number);
  const hour12 = (hours % 12) || 12;
  return `${hour12}:${String(minutes || 0).padStart(2, "0")}`;
}

function formatHabitTimeRange(entry) {
  const endTime = entry.endTime || minutesToTime(parseTimeToMinutes(entry.startTime || "09:00") + (Number(entry.durationMinutes) || 30));
  return `${formatHabitClock(entry.startTime)}–${formatHabitClock(endTime)}`;
}

function getHabitScheduleDisplay(habit) {
  const entries = (habit.schedule || []).length ? habit.schedule : buildHabitScheduleFromLegacy(habit);
  if (!entries.length) return ["No schedule"];
  return entries.map(entry => `${entry.day} ${formatHabitTimeRange(entry)}`);
}

function getHabitDayLabel(habit) {
  if (habit.repeatSetting === "Daily") return "Daily";
  const entries = habit.schedule || [];
  if (entries.length) return entries.map(entry => entry.day).join(", ");
  if (!habit.daysOfWeek?.length) return "No days selected";
  return habit.daysOfWeek.map(day => HABIT_DAY_NAMES[day]).join(", ");
}

function getHabitSelectedDayIndexes(habit) {
  if (habit.schedule?.length) {
    return habit.schedule.map(entry => HABIT_DAY_NAMES.indexOf(entry.day)).filter(day => day >= 0);
  }
  if (habit.repeatSetting === "Daily") return [0, 1, 2, 3, 4, 5, 6];
  return habit.daysOfWeek || [];
}

function getHabitCalendarDates(habit, startDate = todayISO(), weeks = 8) {
  const selected = new Set(getHabitSelectedDayIndexes(habit));
  if (!selected.size && habit.repeatSetting === "Weekly") selected.add(new Date(`${startDate}T00:00:00`).getDay());
  const days = [];
  const totalDays = Math.max(7, weeks * 7);
  for (let i = 0; i < totalDays; i += 1) {
    const date = addDays(startDate, i);
    const day = new Date(`${date}T00:00:00`).getDay();
    if (selected.has(day)) days.push(date);
  }
  return days;
}

function hasHabitCalendarBlock(habitId, date, startTime) {
  return scheduleData.blocks.some(block => block.linkedHabitId === habitId && block.date === date && block.startTime === startTime);
}

function getHabitBlockCategory(habit) {
  const allowed = ["Work", "School", "Fitness", "Social", "Personal", "Custom"];
  return allowed.includes(habit.category) ? habit.category : "Personal";
}

function syncHabitCalendarBlocks(habit) {
  const today = todayISO();
  scheduleData.blocks = scheduleData.blocks.filter(block => !(block.generatedFromHabit && block.linkedHabitId === habit.id && block.date >= today));
  const createdIds = [];
  getHabitCalendarDates(habit).forEach(date => {
    const dayIndex = new Date(`${date}T00:00:00`).getDay();
    const entry = getHabitScheduleEntry(habit, dayIndex);
    if (!entry) return;
    if (!habit.calendarSync || !entry.calendarSync) return;
    const startTime = entry.startTime || "09:00";
    const endTime = entry.endTime || getHabitEndTime(habit, entry);
    const durationMinutes = Number(entry.durationMinutes) || Math.max(15, parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime));
    if (hasHabitCalendarBlock(habit.id, date, startTime)) return;
    const block = normalizeBlock({
      title: habit.name,
      type: "Habit",
      category: getHabitBlockCategory(habit),
      date,
      startTime,
      endTime,
      durationMinutes,
      recurring: habit.repeatSetting || "Selected days",
      linkedHabitId: habit.id,
      linkedGoalId: habit.linkedGoalId || "",
      notes: habit.notes || "",
      completed: false
    });
    block.generatedFromHabit = true;
    block.habitScheduleKey = `${habit.id}-${date}-${startTime}`;
    scheduleData.blocks.push(block);
    createdIds.push(block.id);
  });
  habit.linkedBlockIds = Array.from(new Set([...(habit.linkedBlockIds || []), ...createdIds]));
  habit.calendarSync = Boolean(habit.calendarSync);
  habit.updatedAt = nowISO();
}

function addHabitToCalendar(id) {
  const habit = systemsData.habits.find(item => item.id === id);
  if (!habit) return;
  syncHabitCalendarBlocks(habit);
  saveSystemsData();
  saveScheduleData();
  renderHabits();
}

function getHabitStreak(habit) {
  const dates = new Set(habit.completions || []);
  let streak = 0;
  const cursor = new Date(`${todayISO()}T00:00:00`);
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function getFilteredGoals() {
  const q = goalSearch.trim().toLowerCase();
  let goals = systemsData.goals.filter(goal => {
    const matchesSearch = !q || `${goal.name} ${goal.category} ${goal.type} ${goal.notes} ${getGoalTargetUnit(goal)}`.toLowerCase().includes(q);
    const matchesCategory = goalCategoryFilter === "All" || goal.category === goalCategoryFilter;
    const matchesType = goalTypeFilter === "All" || goal.type === goalTypeFilter;
    return matchesSearch && matchesCategory && matchesType;
  });
  goals.sort((a, b) => {
    if (goalSort === "progress") return (Number(b.progress) || 0) - (Number(a.progress) || 0);
    if (goalSort === "targetDate") return String(a.targetDate || "9999").localeCompare(String(b.targetDate || "9999"));
    return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  });
  return goals;
}

function renderGoalForm() {
  const editingGoal = editingGoalId ? getGoalById(editingGoalId) : null;
  const categories = allZipCustomOptions.goalCategories || ["Personal", "Career", "Health"];
  return `<form onsubmit="saveGoal(event)" class="stack goal-form">
    <input id="goalName" placeholder="Goal name" value="${escapeHTML(editingGoal?.name || "")}" required>
    <div class="grid-2">
      <select id="goalCategory">${optionList(categories, editingGoal?.category || categories[0])}</select>
      <select id="goalType">${optionList(getGoalTypes(), editingGoal?.type || "Outcome")}</select>
    </div>
    <div class="grid-3">
      <input id="goalProgress" type="number" min="0" step="any" placeholder="Current" value="${escapeHTML(editingGoal?.progress ?? "")}">
      <input id="goalTargetAmount" type="number" min="0" step="any" placeholder="Target amount" value="${escapeHTML(editingGoal?.targetAmount ?? (editingGoal && isPercentGoal(editingGoal) ? 100 : ""))}">
      <select id="goalUnit">${optionList(getGoalUnits(), getGoalTargetUnit(editingGoal || { unit: "%" }))}</select>
    </div>
    <input id="goalDate" type="date" value="${escapeHTML(editingGoal?.targetDate || "")}">
    <textarea id="goalNotes" placeholder="Notes">${escapeHTML(editingGoal?.notes || "")}</textarea>
    <div class="button-row">
      <button>${editingGoal ? "Save Goal" : "Add Goal"}</button>
      ${editingGoal ? `<button type="button" class="secondary-btn" onclick="cancelGoalEdit()">Cancel</button>` : ""}
    </div>
  </form>`;
}

function renderGoalFilters() {
  const categories = ["All", ...(allZipCustomOptions.goalCategories || ["Personal", "Career", "Health"])];
  const types = ["All", ...getGoalTypes()];
  return `<div class="goal-filters">
    <div class="grid-2">
      <input value="${escapeHTML(goalSearch)}" placeholder="Search goals" oninput="goalSearch=this.value; renderGoals();">
      <select onchange="goalSort=this.value; renderGoals();">
        <option value="updated" ${goalSort === "updated" ? "selected" : ""}>Recently updated</option>
        <option value="progress" ${goalSort === "progress" ? "selected" : ""}>Progress</option>
        <option value="targetDate" ${goalSort === "targetDate" ? "selected" : ""}>Target date</option>
      </select>
    </div>
    <div class="grid-2">
      <select onchange="goalCategoryFilter=this.value; renderGoals();">${categories.map(cat => `<option value="${escapeHTML(cat)}" ${cat === goalCategoryFilter ? "selected" : ""}>${cat === "All" ? "All categories" : escapeHTML(cat)}</option>`).join("")}</select>
      <select onchange="goalTypeFilter=this.value; renderGoals();">${types.map(type => `<option value="${escapeHTML(type)}" ${type === goalTypeFilter ? "selected" : ""}>${type === "All" ? "All types" : escapeHTML(type)}</option>`).join("")}</select>
    </div>
  </div>`;
}

function renderGoalInlineLogForm(goal) {
  return `<form onsubmit="saveInlineGoalLog(event, '${goal.id}')" class="goal-inline-log-form stack">
    <div class="grid-2">
      <input name="logDate" type="date" value="${todayISO()}" required>
      <input name="logAmount" type="number" step="any" placeholder="Amount" required>
    </div>
    <div class="grid-2">
      <select name="logUnit">${optionList(getLogUnits(), getGoalTargetUnit(goal))}</select>
      <input name="logNote" type="text" placeholder="Note (optional)">
    </div>
    <div class="button-row">
      <button type="submit">Save log</button>
      <button type="button" class="secondary-btn" onclick="toggleGoalLogForm('')">Cancel</button>
    </div>
  </form>`;
}

function renderGoalLogHistory(goal) {
  const logs = getGoalLogs(goal.id);
  if (!logs.length) return `<p class="muted-text small">No log history for this goal yet.</p>`;
  return `<div class="goal-log-history">${logs.map(log => renderGoalLogEntry(log, goal.id)).join("")}</div>`;
}

function renderGoalLogEditForm(log, goalId) {
  const amount = getLogNumericAmount(log);
  return `<form onsubmit="saveGoalLogEdit(event, '${log.id}', '${goalId}')" class="stack goal-log-edit-form">
    <div class="grid-2">
      <input name="editLogDate" type="date" value="${escapeHTML(log.date || todayISO())}" required>
      <input name="editLogAmount" type="number" step="any" placeholder="Amount" value="${amount == null ? "" : escapeHTML(amount)}" required>
    </div>
    <div class="grid-2">
      <select name="editLogUnit">${optionList(getLogUnits(), log.unit || getGoalUnit(goalId))}</select>
      <input name="editLogNote" type="text" placeholder="Note (optional)" value="${escapeHTML(log.note || log.notes || "")}">
    </div>
    <div class="button-row">
      <button type="submit">Save</button>
      <button type="button" class="secondary-btn" onclick="cancelGoalLogEdit()">Cancel</button>
      <button type="button" class="secondary-btn" onclick="deleteGoalLog('${log.id}', '${goalId}')">Delete</button>
    </div>
  </form>`;
}

function renderGoalLogEntry(log, goalId) {
  if (editingGoalLogId === log.id) {
    return `<div class="goal-log-entry is-editing">${renderGoalLogEditForm(log, goalId)}</div>`;
  }
  const measurement = formatLogMeasurement(log);
  const note = log.note || log.notes || "";
  return `<div class="goal-log-entry">
    <div><span>${escapeHTML(log.date)} · ${escapeHTML(log.source)}${measurement ? ` · ${escapeHTML(measurement)}` : ""}</span>${note ? `<p>${escapeHTML(note)}</p>` : ""}</div>
    <div class="mini-actions">
      <button type="button" class="secondary-btn" onclick="editGoalLog('${log.id}')">Edit</button>
      <button type="button" class="secondary-btn" onclick="deleteGoalLog('${log.id}', '${goalId}')">Delete</button>
    </div>
  </div>`;
}

function renderGoals() {
  const goals = getFilteredGoals();
  document.getElementById("productivityBody").innerHTML = `
    ${card(editingGoalId ? "Edit Goal" : "Add Goal", renderGoalForm())}
    ${card("Goals", `${renderGoalFilters()}${goals.length ? `<div class="item-list">${goals.map(renderGoalItem).join("")}</div>` : `<p class="muted-text">No goals match these filters.</p>`}`)}
  `;
}

function renderGoalItem(goal) {
  const linkedHabits = systemsData.habits.filter(habit => habit.linkedGoalId === goal.id).length;
  const linkedTasks = systemsData.tasks.filter(task => task.linkedGoalId === goal.id).length;
  const goalLogs = getGoalLogs(goal.id);
  const percent = getGoalPercentComplete(goal);
  const logFormOpen = goalLogFormOpenId === goal.id;
  const logHistoryOpen = goalLogHistoryOpenId === goal.id;
  return `<div class="item goal-card">
    <div class="goal-card-body">
      <strong>${escapeHTML(goal.name)}</strong>
      <span class="goal-meta-line">${escapeHTML(goal.category)} · ${escapeHTML(goal.type)} · due ${escapeHTML(goal.targetDate || "none")} · ${linkedHabits} habits · ${linkedTasks} tasks · ${goalLogs.length} log${goalLogs.length === 1 ? "" : "s"}</span>
      <div class="goal-progress-summary">${escapeHTML(formatGoalProgressSummary(goal))}</div>
      <div class="progress"><span style="width:${percent}%"></span></div>
      ${logFormOpen ? renderGoalInlineLogForm(goal) : ""}
      ${logHistoryOpen ? renderGoalLogHistory(goal) : ""}
    </div>
    <div class="mini-actions goal-card-actions">
      <button type="button" class="secondary-btn" onclick="toggleGoalLogForm('${goal.id}')">${logFormOpen ? "Hide log form" : "Add log"}</button>
      <button type="button" class="secondary-btn" onclick="toggleGoalLogHistory('${goal.id}')">${logHistoryOpen ? "Hide history" : "View log history"}</button>
      <button type="button" class="secondary-btn" onclick="editGoal('${goal.id}')">Edit</button>
      <button type="button" class="secondary-btn" onclick="deleteGoal('${goal.id}')">Delete</button>
    </div>
  </div>`;
}

function toggleGoalLogForm(goalId) {
  goalLogFormOpenId = goalLogFormOpenId === goalId ? "" : goalId;
  if (goalId) {
    goalLogHistoryOpenId = "";
    editingGoalLogId = "";
  }
  renderGoals();
}

function toggleGoalLogHistory(goalId) {
  goalLogHistoryOpenId = goalLogHistoryOpenId === goalId ? "" : goalId;
  if (goalId) {
    goalLogFormOpenId = "";
    editingGoalLogId = "";
  }
  renderGoals();
}

function editGoal(id) {
  editingGoalId = id;
  goalLogFormOpenId = "";
  renderGoals();
}

function cancelGoalEdit() {
  editingGoalId = null;
  renderGoals();
}

function saveGoal(event) {
  event.preventDefault();
  const payload = {
    name: goalName.value,
    targetDate: goalDate.value,
    progress: goalProgress.value,
    targetAmount: goalTargetAmount.value,
    unit: goalUnit.value,
    targetUnit: goalUnit.value,
    category: goalCategory.value,
    type: goalType.value,
    notes: goalNotes.value
  };
  if (editingGoalId) {
    const index = systemsData.goals.findIndex(item => item.id === editingGoalId);
    const existing = systemsData.goals[index];
    if (index !== -1) systemsData.goals[index] = normalizeGoal({ ...existing, ...payload, id: editingGoalId, updatedAt: nowISO() });
    editingGoalId = null;
  } else {
    systemsData.goals.push(normalizeGoal(payload));
  }
  saveSystemsData();
  renderGoals();
}

function saveInlineGoalLog(event, goalId) {
  event.preventDefault();
  const goal = getGoalById(goalId);
  if (!goal) return;
  const form = event.currentTarget;
  addLog({
    title: `Log: ${goal.name}`,
    date: form.querySelector('[name="logDate"]')?.value || todayISO(),
    amount: form.querySelector('[name="logAmount"]')?.value,
    unit: form.querySelector('[name="logUnit"]')?.value || getGoalTargetUnit(goal),
    note: form.querySelector('[name="logNote"]')?.value || "",
    linkedGoalId: goalId,
    source: "Manual",
    category: goal.category
  });
  goalLogFormOpenId = "";
  goalLogHistoryOpenId = goalId;
  renderGoals();
}

function editGoalLog(logId) {
  editingGoalLogId = logId;
  goalLogFormOpenId = "";
  renderGoals();
}

function cancelGoalLogEdit() {
  editingGoalLogId = "";
  renderGoals();
}

function saveGoalLogEdit(event, logId, goalId) {
  event.preventDefault();
  const index = systemsData.logs.findIndex(item => item.id === logId);
  if (index === -1) return;
  const form = event.currentTarget;
  const existing = systemsData.logs[index];
  systemsData.logs[index] = normalizeLog({
    ...existing,
    id: logId,
    date: form.querySelector('[name="editLogDate"]')?.value || existing.date,
    amount: form.querySelector('[name="editLogAmount"]')?.value,
    unit: form.querySelector('[name="editLogUnit"]')?.value || existing.unit,
    note: form.querySelector('[name="editLogNote"]')?.value || "",
    linkedGoalId: goalId,
    updatedAt: nowISO()
  }, systemsData.goals);
  editingGoalLogId = "";
  syncGoalProgressFromLogs(goalId);
  saveSystemsData();
  goalLogHistoryOpenId = goalId;
  renderGoals();
}

function deleteGoal(id) {
  if (!confirm("Delete this goal? Linked logs will be kept but unlinked.")) return;
  unlinkLogsFromGoal(id);
  if (goalLogFormOpenId === id) goalLogFormOpenId = "";
  if (goalLogHistoryOpenId === id) goalLogHistoryOpenId = "";
  if (editingGoalId === id) editingGoalId = null;
  systemsData.goals = systemsData.goals.filter(item => item.id !== id);
  saveSystemsData();
  renderGoals();
}

function addLog(log, shouldSave = true) {
  const entry = normalizeLog({
    ...log,
    id: createId("log"),
    createdAt: nowISO(),
    updatedAt: nowISO()
  }, systemsData.goals);
  if (entry.linkedGoalId && !entry.unit) entry.unit = getGoalUnit(entry.linkedGoalId);
  if (entry.linkedGoalId) {
    const goal = getGoalById(entry.linkedGoalId);
    if (goal && !entry.category) entry.category = goal.category;
  }
  systemsData.logs = [...systemsData.logs, entry];
  if (entry.linkedGoalId) syncGoalProgressFromLogs(entry.linkedGoalId);
  if (shouldSave) saveSystemsData();
}

function deleteGoalLog(logId, goalId) {
  if (!confirm("Delete this log entry?")) return;
  if (editingGoalLogId === logId) editingGoalLogId = "";
  systemsData.logs = systemsData.logs.filter(item => item.id !== logId);
  syncGoalProgressFromLogs(goalId);
  saveSystemsData();
  goalLogHistoryOpenId = goalId;
  renderGoals();
}

function renderSocial() {
  document.getElementById("pageRoot").innerHTML = `
    ${renderSocialToolbar()}
    <div class="segmented page-tabs">${["Friends", "Hangouts", "Ideas"].map(tab => `<button class="${socialTab === tab ? "active" : ""}" onclick="setSocialTab('${tab}')">${tab}</button>`).join("")}</div>
    ${renderSocialSearchBar()}
    <div id="socialBody" class="social-body"></div>`;
  if (socialTab === "Friends") renderFriends();
  if (socialTab === "Hangouts") renderHangouts();
  if (socialTab === "Ideas") renderIdeas();
}

function formatFriendDate(value = "") {
  return String(value || "").slice(0, 10);
}

function renderFriendEditForm(friend) {
  return `<form onsubmit="saveFriendEdit(event, '${friend.id}')" class="stack friend-edit-form">
    <input name="editFriendName" placeholder="Name" value="${escapeHTML(friend.name)}" required>
    <select name="editFriendRelationship">${friendRelationshipOptionList(getFriendRelationshipType(friend))}</select>
    <select name="editFriendPriority">${optionList(["Low", "Medium", "High"], friend.priority || "Medium")}</select>
    <div class="grid-2">
      <input name="editFriendLastSeen" type="date" value="${escapeHTML(formatFriendDate(friend.lastSeen || friend.lastContacted))}">
      <input name="editFriendFollowUp" type="date" value="${escapeHTML(formatFriendDate(friend.followUpReminder))}">
    </div>
    <textarea name="editFriendNotes" placeholder="Important notes">${escapeHTML(friend.notes || "")}</textarea>
    <div class="button-row">
      <button type="submit">Save</button>
      <button type="button" class="secondary-btn" onclick="cancelFriendEdit()">Cancel</button>
      <button type="button" class="secondary-btn" onclick="deleteFriend('${friend.id}')">Delete</button>
    </div>
  </form>`;
}

function renderFriendItem(friend) {
  if (editingFriendId === friend.id) {
    return `<div class="item friend-card is-editing">${renderFriendEditForm(friend)}</div>`;
  }
  return `<div class="item friend-card">
    <div>
      <strong>${escapeHTML(friend.name)}</strong>
      <span>${escapeHTML(getFriendRelationshipType(friend))} · ${escapeHTML(friend.priority || "Medium")} priority</span>
      <span>Last seen ${escapeHTML(friend.lastSeen || friend.lastContacted || "not set")} · Follow-up ${escapeHTML(friend.followUpReminder || "not set")}</span>
      ${friend.notes ? `<p>${escapeHTML(friend.notes)}</p>` : ""}
    </div>
    <div class="mini-actions">
      <button type="button" class="secondary-btn" onclick="editFriend('${friend.id}')">Edit</button>
      <button type="button" class="secondary-btn" onclick="deleteFriend('${friend.id}')">Delete</button>
    </div>
  </div>`;
}

function renderFriends() {
  document.getElementById("socialBody").innerHTML = `${card("New Friend", `<form onsubmit="saveFriend(event)" class="stack"><input id="friendName" placeholder="Name" required><select id="friendRelationship">${friendRelationshipOptionList("Friend")}</select><input id="friendReminder" type="date"><textarea id="friendNotes" placeholder="Relationship notes"></textarea><button>Add Friend</button></form>`)}${card("Friends", `<div id="socialList">${renderFriendsListContent()}</div>`)}`;
}

function saveFriend(event) {
  event.preventDefault();
  socialData.friends.push(normalizeFriendFields({
    name: friendName.value,
    relationship: friendRelationship.value,
    relationshipType: friendRelationship.value,
    followUpReminder: friendReminder.value,
    notes: friendNotes.value
  }));
  saveSocialData();
  renderFriends();
}

function editFriend(id) {
  editingFriendId = id;
  renderFriends();
}

function cancelFriendEdit() {
  editingFriendId = null;
  renderFriends();
}

function saveFriendEdit(event, id) {
  event.preventDefault();
  const friend = socialData.friends.find(item => item.id === id);
  if (!friend) return;
  const form = event.currentTarget;
  const oldName = friend.name;
  const lastSeen = form.querySelector('[name="editFriendLastSeen"]')?.value || "";
  const updated = normalizeFriendFields({
    ...friend,
    name: form.querySelector('[name="editFriendName"]')?.value || friend.name,
    relationship: form.querySelector('[name="editFriendRelationship"]')?.value || getFriendRelationshipType(friend),
    relationshipType: form.querySelector('[name="editFriendRelationship"]')?.value || getFriendRelationshipType(friend),
    priority: form.querySelector('[name="editFriendPriority"]')?.value || "Medium",
    lastSeen,
    lastContacted: lastSeen,
    followUpReminder: form.querySelector('[name="editFriendFollowUp"]')?.value || "",
    notes: form.querySelector('[name="editFriendNotes"]')?.value || "",
    updatedAt: nowISO()
  });
  Object.assign(friend, updated);
  syncFriendNameReferences(id, oldName, friend.name);
  editingFriendId = null;
  saveSocialData();
  renderFriends();
}

function deleteFriend(id) {
  if (!confirm("Delete this friend?")) return;
  if (editingFriendId === id) editingFriendId = null;
  socialData.friends = socialData.friends.filter(item => item.id !== id);
  saveSocialData();
  renderFriends();
}

function captureHangoutFormDraft() {
  if (!document.getElementById("hangoutActivity")) return;
  hangoutFormDraft = {
    activity: hangoutActivity.value,
    date: hangoutDate.value,
    startTime: hangoutStartTime.value,
    endTime: hangoutEndTime.value,
    location: hangoutLocation.value,
    notes: hangoutNotes.value,
    completed: hangoutCompleted.checked
  };
}

function hangoutFormRefresh() {
  captureHangoutFormDraft();
  renderHangouts();
}

function getHangoutFormFriendPeople() {
  return hangoutFormFriendIds
    .map(id => socialData.friends.find(friend => friend.id === id)?.name || "")
    .map(name => name.trim())
    .filter(Boolean);
}

function toggleHangoutFriendPicker() {
  hangoutFriendPickerOpen = !hangoutFriendPickerOpen;
  hangoutFormRefresh();
}

function toggleHangoutFriendSelection(friendId) {
  const selected = new Set(hangoutFormFriendIds);
  if (selected.has(friendId)) selected.delete(friendId);
  else selected.add(friendId);
  hangoutFormFriendIds = [...selected];
  hangoutFormRefresh();
}

function toggleEditHangoutFriendPicker() {
  editHangoutFriendPickerOpen = !editHangoutFriendPickerOpen;
  renderHangouts();
}

function toggleEditHangoutFriendSelection(friendId) {
  const selected = new Set(editHangoutFriendIds);
  if (selected.has(friendId)) selected.delete(friendId);
  else selected.add(friendId);
  editHangoutFriendIds = [...selected];
  renderHangouts();
}

function getHangoutFriendIdsFromHangout(hangout = {}) {
  if (Array.isArray(hangout.friendIds) && hangout.friendIds.length) return [...hangout.friendIds];
  return resolveHangoutFriendIds(hangout.people || [], socialData.friends);
}

function getEditHangoutFriendPeople() {
  return editHangoutFriendIds
    .map(id => socialData.friends.find(friend => friend.id === id)?.name || "")
    .map(name => name.trim())
    .filter(Boolean);
}

function syncHangoutDuration() {
  const start = document.getElementById("hangoutStartTime")?.value || "";
  const end = document.getElementById("hangoutEndTime")?.value || "";
  const display = document.getElementById("hangoutDurationDisplay");
  if (!display) return;
  if (!start || !end) {
    display.textContent = "—";
    return;
  }
  const durationMinutes = Math.max(0, parseTimeToMinutes(end) - parseTimeToMinutes(start));
  display.textContent = durationMinutes ? `${durationMinutes} min` : "—";
}

function syncEditHangoutDuration(hangoutId) {
  const form = document.getElementById(`hangout-edit-${hangoutId}`);
  if (!form) return;
  const start = form.querySelector('[name="editHangoutStartTime"]')?.value || "";
  const end = form.querySelector('[name="editHangoutEndTime"]')?.value || "";
  const display = form.querySelector(".hangout-duration-display");
  if (!display) return;
  if (!start || !end) {
    display.textContent = "—";
    return;
  }
  const durationMinutes = Math.max(0, parseTimeToMinutes(end) - parseTimeToMinutes(start));
  display.textContent = durationMinutes ? `${durationMinutes} min` : "—";
}

function renderHangoutFriendPicker(options = {}) {
  const selectedIds = options.selectedIds || hangoutFormFriendIds;
  const isOpen = options.isOpen ?? hangoutFriendPickerOpen;
  const search = options.search ?? hangoutFriendSearch;
  const togglePickerFn = options.togglePickerFn || "toggleHangoutFriendPicker";
  const toggleSelectionFn = options.toggleSelectionFn || "toggleHangoutFriendSelection";
  const refreshFn = options.refreshFn || "hangoutFormRefresh";
  const selectedFriends = selectedIds
    .map(id => socialData.friends.find(friend => friend.id === id))
    .filter(Boolean);
  const searchValue = String(search).trim().toLowerCase();
  const availableFriends = socialData.friends.filter(friend => !searchValue || friend.name.toLowerCase().includes(searchValue));
  return `<div class="friend-picker">
    <button type="button" class="friend-picker-toggle secondary-btn" onclick="${togglePickerFn}()">${isOpen ? "▾" : "▸"} Friends${selectedFriends.length ? ` (${selectedFriends.length})` : ""}</button>
    ${isOpen ? `<div class="friend-picker-panel">
      ${selectedFriends.length ? `<div class="friend-chips">${selectedFriends.map(friend => `<button type="button" class="friend-chip" onclick="${toggleSelectionFn}('${friend.id}')">${escapeHTML(friend.name)} ×</button>`).join("")}</div>` : ""}
      <input type="search" placeholder="Search friends" value="${escapeHTML(search)}" oninput="${options.searchField || "hangoutFriendSearch"}=this.value; ${refreshFn}();">
      <div class="friend-picker-list">${availableFriends.length ? availableFriends.map(friend => {
        const isSelected = selectedIds.includes(friend.id);
        return `<button type="button" class="friend-picker-option ${isSelected ? "is-selected" : ""}" onclick="${toggleSelectionFn}('${friend.id}')">${escapeHTML(friend.name)}${isSelected ? " ✓" : ""}</button>`;
      }).join("") : `<p class="muted-text small">${socialData.friends.length ? "No friends match this search." : "Add friends first in the Friends tab."}</p>`}</div>
    </div>` : ""}
  </div>`;
}

function renderHangoutEditForm(hangout) {
  const displayStart = getHangoutStartTime(hangout);
  const displayEnd = getHangoutEndTime(hangout);
  const durationPreview = displayStart && displayEnd
    ? `${Math.max(0, parseTimeToMinutes(displayEnd) - parseTimeToMinutes(displayStart))} min`
    : "—";
  const completed = parseCompletedFlag(hangout.completed);
  return `<form id="hangout-edit-${hangout.id}" onsubmit="saveHangoutEdit(event, '${hangout.id}')" class="stack hangout-edit-form">
    <input name="editHangoutActivity" placeholder="Activity" value="${escapeHTML(hangout.activity || hangout.title || "")}" required>
    <input name="editHangoutDate" type="date" value="${escapeHTML(String(hangout.date || "").slice(0, 10))}">
    <div class="grid-3">
      <input name="editHangoutStartTime" type="time" value="${escapeHTML(displayStart)}" oninput="syncEditHangoutDuration('${hangout.id}')" onchange="syncEditHangoutDuration('${hangout.id}')">
      <input name="editHangoutEndTime" type="time" value="${escapeHTML(displayEnd)}" oninput="syncEditHangoutDuration('${hangout.id}')" onchange="syncEditHangoutDuration('${hangout.id}')">
      <div class="hangout-duration-display">${escapeHTML(durationPreview)}</div>
    </div>
    ${renderHangoutFriendPicker({
      selectedIds: editHangoutFriendIds,
      isOpen: editHangoutFriendPickerOpen,
      search: editHangoutFriendSearch,
      togglePickerFn: "toggleEditHangoutFriendPicker",
      toggleSelectionFn: "toggleEditHangoutFriendSelection",
      refreshFn: "renderHangouts",
      searchField: "editHangoutFriendSearch"
    })}
    <input name="editHangoutLocation" placeholder="Location" value="${escapeHTML(hangout.location || "")}">
    <textarea name="editHangoutNotes" placeholder="Notes">${escapeHTML(hangout.notes || "")}</textarea>
    <label class="toggle-row"><input name="editHangoutCompleted" type="checkbox" ${completed ? "checked" : ""}>Completed</label>
    <div class="button-row">
      <button type="submit">Save</button>
      <button type="button" class="secondary-btn" onclick="cancelHangoutEdit()">Cancel</button>
      <button type="button" class="secondary-btn" onclick="deleteHangout('${hangout.id}')">Delete</button>
    </div>
  </form>`;
}

function renderHangoutItem(hangout) {
  if (editingHangoutId === hangout.id) {
    return `<div class="item hangout-item is-editing">${renderHangoutEditForm(hangout)}</div>`;
  }
  const people = getHangoutPeopleNames(hangout, socialData.friends);
  const schedule = formatHangoutSchedule(hangout);
  const completed = parseCompletedFlag(hangout.completed);
  const onCalendar = Boolean(getBlockByLinkedHangoutId(hangout.id));
  const canAdd = canAddHangoutToCalendar(hangout);
  return `<div class="item hangout-item ${completed ? "is-done" : ""} ${hangout.id === highlightHangoutId ? "is-highlighted" : ""}">
    <div>
      <strong>${escapeHTML(hangout.activity || hangout.title)}</strong>
      <span>${escapeHTML(hangout.date || "No date")}${schedule ? ` · ${escapeHTML(schedule)}` : ""}</span>
      <span>${people.length ? `Friends: ${escapeHTML(people.join(", "))}` : "No friends listed"}${hangout.location ? ` · ${escapeHTML(hangout.location)}` : ""}</span>
      <span>${completed ? "Completed" : "Planned"}${onCalendar ? " · On calendar" : ""}${hangout.sourceIdeaId ? " · From idea" : ""}</span>
      ${hangout.notes ? `<p>${escapeHTML(hangout.notes)}</p>` : ""}
    </div>
    <div class="mini-actions">
      ${canAdd ? `<button type="button" class="secondary-btn" onclick="handleAddHangoutToCalendar('${hangout.id}')">${onCalendar ? "On Calendar" : "Add to Calendar"}</button>` : ""}
      <button type="button" class="secondary-btn" onclick="editHangout('${hangout.id}')">Edit</button>
      <button type="button" class="secondary-btn" onclick="deleteHangout('${hangout.id}')">Delete</button>
    </div>
  </div>`;
}

function editHangout(id) {
  const hangout = socialData.hangouts.find(item => item.id === id);
  if (!hangout) return;
  editingHangoutId = id;
  editHangoutFriendIds = getHangoutFriendIdsFromHangout(hangout);
  editHangoutFriendPickerOpen = false;
  editHangoutFriendSearch = "";
  renderHangouts();
}

function cancelHangoutEdit() {
  editingHangoutId = null;
  editHangoutFriendIds = [];
  editHangoutFriendPickerOpen = false;
  editHangoutFriendSearch = "";
  renderHangouts();
}

function saveHangoutEdit(event, id) {
  event.preventDefault();
  const hangout = socialData.hangouts.find(item => item.id === id);
  if (!hangout) return;
  const form = event.currentTarget;
  const people = getEditHangoutFriendPeople();
  const startTime = form.querySelector('[name="editHangoutStartTime"]')?.value || "";
  const endTime = form.querySelector('[name="editHangoutEndTime"]')?.value || "";
  const draft = {
    ...hangout,
    activity: form.querySelector('[name="editHangoutActivity"]')?.value || hangout.activity,
    title: form.querySelector('[name="editHangoutActivity"]')?.value || hangout.title,
    date: form.querySelector('[name="editHangoutDate"]')?.value || "",
    startTime,
    endTime,
    time: startTime,
    people,
    friendIds: [...editHangoutFriendIds],
    location: form.querySelector('[name="editHangoutLocation"]')?.value || "",
    notes: form.querySelector('[name="editHangoutNotes"]')?.value || "",
    completed: Boolean(form.querySelector('[name="editHangoutCompleted"]')?.checked),
    updatedAt: nowISO()
  };
  applyHangoutFriendLinks(draft);
  Object.assign(hangout, normalizeHangoutFields(draft));
  editingHangoutId = null;
  editHangoutFriendIds = [];
  editHangoutFriendPickerOpen = false;
  editHangoutFriendSearch = "";
  syncLinkedHangoutBlock(hangout);
  saveSocialData();
  renderHangouts();
}

function renderHangouts() {
  const draft = hangoutFormDraft || {};
  const durationPreview = draft.startTime && draft.endTime
    ? `${Math.max(0, parseTimeToMinutes(draft.endTime) - parseTimeToMinutes(draft.startTime))} min`
    : "—";
  document.getElementById("socialBody").innerHTML = `${card("New Hangout", `<form id="hangoutForm" onsubmit="saveHangout(event)" class="stack">
    <input id="hangoutActivity" placeholder="Activity" value="${escapeHTML(draft.activity || "")}" required>
    <input id="hangoutDate" type="date" value="${escapeHTML(draft.date || "")}">
    <div class="grid-3">
      <input id="hangoutStartTime" type="time" value="${escapeHTML(draft.startTime || "")}" oninput="syncHangoutDuration()" onchange="syncHangoutDuration()">
      <input id="hangoutEndTime" type="time" value="${escapeHTML(draft.endTime || "")}" oninput="syncHangoutDuration()" onchange="syncHangoutDuration()">
      <div class="hangout-duration-display" id="hangoutDurationDisplay">${escapeHTML(durationPreview)}</div>
    </div>
    ${renderHangoutFriendPicker()}
    <input id="hangoutLocation" placeholder="Location" value="${escapeHTML(draft.location || "")}">
    <textarea id="hangoutNotes" placeholder="Notes">${escapeHTML(draft.notes || "")}</textarea>
    <label class="toggle-row"><input id="hangoutCompleted" type="checkbox" ${draft.completed ? "checked" : ""}>Completed</label>
    <button type="submit">Add Hangout</button>
  </form>`)}${card("Import Calendar Events as Hangouts (Date Range)", renderCalendarImportPanel())}${card("Hangout History", `<div class="button-row hangouts-import-row"><button type="button" class="secondary-btn" onclick="handleAddAllHangoutsToCalendar()">Add all dated hangouts to Calendar</button></div><div id="socialList">${renderHangoutsListContent()}</div>`)}`;
  syncHangoutDuration();
}

function saveHangout(event) {
  event.preventDefault();
  const people = getHangoutFormFriendPeople();
  const startTime = hangoutStartTime.value;
  const endTime = hangoutEndTime.value;
  const draft = {
    activity: hangoutActivity.value,
    title: hangoutActivity.value,
    date: hangoutDate.value,
    startTime,
    endTime,
    time: startTime,
    people,
    friendIds: [...hangoutFormFriendIds],
    location: hangoutLocation.value,
    notes: hangoutNotes.value,
    completed: hangoutCompleted.checked
  };
  applyHangoutFriendLinks(draft);
  socialData.hangouts.push(normalizeHangoutFields(draft));
  hangoutFormDraft = null;
  hangoutFormFriendIds = [];
  hangoutFriendSearch = "";
  hangoutFriendPickerOpen = false;
  saveSocialData();
  renderHangouts();
}
function deleteHangout(id) {
  if (!confirm("Delete this hangout?")) return;
  const linkedBlock = getBlockByLinkedHangoutId(id);
  if (linkedBlock) {
    const alsoDelete = confirm("This hangout is linked to the calendar. Also delete the linked calendar block?");
    if (alsoDelete) {
      scheduleData.blocks = scheduleData.blocks.filter(block => block.id !== linkedBlock.id);
      saveScheduleData();
    } else {
      linkedBlock.linkedHangoutId = "";
      linkedBlock.updatedAt = nowISO();
      saveScheduleData();
    }
  }
  if (editingHangoutId === id) editingHangoutId = null;
  editHangoutFriendIds = [];
  socialData.hangouts = socialData.hangouts.filter(item => item.id !== id);
  saveSocialData();
  renderHangouts();
}

function captureIdeaFormDraft() {
  if (!document.getElementById("ideaTitle")) return;
  ideaFormDraft = {
    title: ideaTitle.value,
    category: ideaCategory.value,
    cost: ideaCost.value,
    notes: ideaNotes.value,
    favorite: ideaFavorite.checked
  };
}

function ideaFormRefresh() {
  captureIdeaFormDraft();
  renderIdeas();
}

function getIdeaFormLinkedFriends() {
  return ideaFormFriendIds
    .map(id => socialData.friends.find(friend => friend.id === id)?.name || "")
    .map(name => name.trim())
    .filter(Boolean);
}

function toggleIdeaFriendPicker() {
  ideaFriendPickerOpen = !ideaFriendPickerOpen;
  ideaFormRefresh();
}

function toggleIdeaFriendSelection(friendId) {
  const selected = new Set(ideaFormFriendIds);
  if (selected.has(friendId)) selected.delete(friendId);
  else selected.add(friendId);
  ideaFormFriendIds = [...selected];
  ideaFormRefresh();
}

function toggleEditIdeaFriendPicker() {
  editIdeaFriendPickerOpen = !editIdeaFriendPickerOpen;
  renderIdeas();
}

function toggleEditIdeaFriendSelection(friendId) {
  const selected = new Set(editIdeaFriendIds);
  if (selected.has(friendId)) selected.delete(friendId);
  else selected.add(friendId);
  editIdeaFriendIds = [...selected];
  renderIdeas();
}

function getIdeaFriendIdsFromIdea(idea = {}) {
  if (Array.isArray(idea.linkedFriendIds) && idea.linkedFriendIds.length) return [...idea.linkedFriendIds];
  if (Array.isArray(idea.friendIds) && idea.friendIds.length) return [...idea.friendIds];
  return resolveHangoutFriendIds(idea.linkedFriends || [], socialData.friends);
}

function getEditIdeaLinkedFriends() {
  return editIdeaFriendIds
    .map(id => socialData.friends.find(friend => friend.id === id)?.name || "")
    .map(name => name.trim())
    .filter(Boolean);
}

function renderIdeaFriendPicker(options = {}) {
  const selectedIds = options.selectedIds || ideaFormFriendIds;
  const isOpen = options.isOpen ?? ideaFriendPickerOpen;
  const search = options.search ?? ideaFriendSearch;
  const togglePickerFn = options.togglePickerFn || "toggleIdeaFriendPicker";
  const toggleSelectionFn = options.toggleSelectionFn || "toggleIdeaFriendSelection";
  const refreshFn = options.refreshFn || "ideaFormRefresh";
  const selectedFriends = selectedIds
    .map(id => socialData.friends.find(friend => friend.id === id))
    .filter(Boolean);
  const searchValue = String(search).trim().toLowerCase();
  const availableFriends = socialData.friends.filter(friend => !searchValue || friend.name.toLowerCase().includes(searchValue));
  return `<div class="friend-picker">
    <button type="button" class="friend-picker-toggle secondary-btn" onclick="${togglePickerFn}()">${isOpen ? "▾" : "▸"} Friends${selectedFriends.length ? ` (${selectedFriends.length})` : ""}</button>
    ${isOpen ? `<div class="friend-picker-panel">
      ${selectedFriends.length ? `<div class="friend-chips">${selectedFriends.map(friend => `<button type="button" class="friend-chip" onclick="${toggleSelectionFn}('${friend.id}')">${escapeHTML(friend.name)} ×</button>`).join("")}</div>` : ""}
      <input type="search" placeholder="Search friends" value="${escapeHTML(search)}" oninput="${options.searchField || "ideaFriendSearch"}=this.value; ${refreshFn}();">
      <div class="friend-picker-list">${availableFriends.length ? availableFriends.map(friend => {
        const isSelected = selectedIds.includes(friend.id);
        return `<button type="button" class="friend-picker-option ${isSelected ? "is-selected" : ""}" onclick="${toggleSelectionFn}('${friend.id}')">${escapeHTML(friend.name)}${isSelected ? " ✓" : ""}</button>`;
      }).join("") : `<p class="muted-text small">${socialData.friends.length ? "No friends match this search." : "Add friends first in the Friends tab."}</p>`}</div>
    </div>` : ""}
  </div>`;
}

function renderIdeaEditForm(idea) {
  return `<form id="idea-edit-${idea.id}" onsubmit="saveIdeaEdit(event, '${idea.id}')" class="stack idea-edit-form">
    <input name="editIdeaTitle" placeholder="Title" value="${escapeHTML(idea.title)}" required>
    <div class="grid-2">
      <input name="editIdeaCategory" placeholder="Category" value="${escapeHTML(idea.category || "")}">
      <input name="editIdeaCost" placeholder="Cost" value="${escapeHTML(idea.cost || "")}">
    </div>
    ${renderIdeaFriendPicker({
      selectedIds: editIdeaFriendIds,
      isOpen: editIdeaFriendPickerOpen,
      search: editIdeaFriendSearch,
      togglePickerFn: "toggleEditIdeaFriendPicker",
      toggleSelectionFn: "toggleEditIdeaFriendSelection",
      refreshFn: "renderIdeas",
      searchField: "editIdeaFriendSearch"
    })}
    <textarea name="editIdeaNotes" placeholder="Notes">${escapeHTML(idea.notes || "")}</textarea>
    <label class="toggle-row"><input name="editIdeaFavorite" type="checkbox" ${idea.favorite ? "checked" : ""}>Favorite</label>
    <div class="button-row">
      <button type="submit">Save</button>
      <button type="button" class="secondary-btn" onclick="cancelIdeaEdit()">Cancel</button>
      <button type="button" class="secondary-btn" onclick="deleteIdea('${idea.id}')">Delete</button>
    </div>
  </form>`;
}

function renderIdeaItem(idea) {
  if (editingIdeaId === idea.id) {
    return `<div class="item idea-card is-editing ${idea.favorite ? "is-favorite" : ""}">${renderIdeaEditForm(idea)}</div>`;
  }
  const friends = getIdeaLinkedFriendNames(idea, socialData.friends);
  const hasHangout = Boolean(findHangoutBySourceIdeaId(idea.id));
  return `<div class="item idea-card ${idea.favorite ? "is-favorite" : ""}">
    <div>
      <strong>${escapeHTML(idea.title)}</strong>
      <span>Category: ${escapeHTML(idea.category || "General")}${idea.cost ? ` · Cost: ${escapeHTML(idea.cost)}` : ""}</span>
      <span>${friends.length ? `Friends: ${escapeHTML(friends.join(", "))}` : "No friends linked"}</span>
      <span>${idea.favorite ? "Favorite" : "Not favorited"}${hasHangout ? " · In Hangouts" : ""}</span>
      ${idea.notes ? `<p>${escapeHTML(idea.notes)}</p>` : ""}
    </div>
    <div class="mini-actions idea-actions">
      <button type="button" class="secondary-btn" onclick="addIdeaToHangouts('${idea.id}')" ${hasHangout ? "disabled title=\"Already added to Hangouts\"" : ""}>Plan Hangout</button>
      <button type="button" class="secondary-btn" onclick="editIdea('${idea.id}')">Edit</button>
      <button type="button" class="secondary-btn" onclick="deleteIdea('${idea.id}')">Delete</button>
    </div>
  </div>`;
}

function editIdea(id) {
  const idea = socialData.ideas.find(item => item.id === id);
  if (!idea) return;
  editingIdeaId = id;
  editIdeaFriendIds = getIdeaFriendIdsFromIdea(idea);
  editIdeaFriendPickerOpen = false;
  editIdeaFriendSearch = "";
  renderIdeas();
}

function cancelIdeaEdit() {
  editingIdeaId = null;
  editIdeaFriendIds = [];
  editIdeaFriendPickerOpen = false;
  editIdeaFriendSearch = "";
  renderIdeas();
}

function saveIdeaEdit(event, id) {
  event.preventDefault();
  const idea = socialData.ideas.find(item => item.id === id);
  if (!idea) return;
  const form = event.currentTarget;
  const linkedFriends = getEditIdeaLinkedFriends();
  Object.assign(idea, normalizeIdeaFields({
    ...idea,
    title: form.querySelector('[name="editIdeaTitle"]')?.value || idea.title,
    category: form.querySelector('[name="editIdeaCategory"]')?.value || "General",
    cost: form.querySelector('[name="editIdeaCost"]')?.value || "",
    notes: form.querySelector('[name="editIdeaNotes"]')?.value || "",
    favorite: Boolean(form.querySelector('[name="editIdeaFavorite"]')?.checked),
    linkedFriendIds: [...editIdeaFriendIds],
    linkedFriends
  }, socialData.friends));
  editingIdeaId = null;
  editIdeaFriendIds = [];
  editIdeaFriendPickerOpen = false;
  editIdeaFriendSearch = "";
  saveSocialData();
  renderIdeas();
}

function renderIdeas() {
  const draft = ideaFormDraft || {};
  document.getElementById("socialBody").innerHTML = `${card("New Idea", `<form id="ideaForm" onsubmit="saveIdea(event)" class="stack">
    <input id="ideaTitle" placeholder="Idea" value="${escapeHTML(draft.title || "")}" required>
    <div class="grid-2">
      <input id="ideaCategory" placeholder="Category" value="${escapeHTML(draft.category || "")}">
      <input id="ideaCost" placeholder="Cost" value="${escapeHTML(draft.cost || "")}">
    </div>
    ${renderIdeaFriendPicker()}
    <textarea id="ideaNotes" placeholder="Notes">${escapeHTML(draft.notes || "")}</textarea>
    <label class="toggle-row"><input id="ideaFavorite" type="checkbox" ${draft.favorite ? "checked" : ""}>Favorite</label>
    <button type="submit">Add Idea</button>
  </form>`)}${card("Ideas", `<div id="socialList">${renderIdeasListContent()}</div>`)}`;
}

function saveIdea(event) {
  event.preventDefault();
  const linkedFriends = getIdeaFormLinkedFriends();
  socialData.ideas.push(normalizeIdeaFields({
    title: ideaTitle.value,
    category: ideaCategory.value,
    cost: ideaCost.value,
    notes: ideaNotes.value,
    favorite: ideaFavorite.checked,
    linkedFriendIds: [...ideaFormFriendIds],
    linkedFriends
  }, socialData.friends));
  ideaFormDraft = null;
  ideaFormFriendIds = [];
  ideaFriendSearch = "";
  ideaFriendPickerOpen = false;
  saveSocialData();
  renderIdeas();
}
function deleteIdea(id) {
  if (!confirm("Delete this idea?")) return;
  if (editingIdeaId === id) editingIdeaId = null;
  editIdeaFriendIds = [];
  socialData.ideas = socialData.ideas.filter(item => item.id !== id);
  saveSocialData();
  renderIdeas();
}

function renderDataSettings() {
  document.getElementById("pageRoot").innerHTML = `
    ${card("Data Management", `<div class="stats-grid"><div><strong>${systemsData.tasks.length}</strong><span>Tasks</span></div><div><strong>${scheduleData.blocks.length}</strong><span>Blocks</span></div><div><strong>${systemsData.habits.length}</strong><span>Habits</span></div><div><strong>${systemsData.logs.length}</strong><span>Logs</span></div></div><p class="muted-text">Download all Flow Planner data as a JSON backup.</p><div class="button-row"><button onclick="downloadBackup()">Export Full Backup</button><button class="secondary-btn" onclick="downloadBackup()">Download Backup</button></div>`)}
    ${card("Restore Full Backup", `<p class="muted-text">Paste a full Flow Planner backup JSON to restore your data.</p><textarea id="restoreJson" rows="8" placeholder="Paste full backup JSON"></textarea><button onclick="restoreBackup()">Restore Backup</button>`)}
    ${card("Import Planner Data", `<p class="muted-text">Paste simple JSON arrays or CSV rows to preview and add tasks, calendar blocks, habits, or goals.</p><textarea id="allZipImportData" rows="5" placeholder="Paste JSON array or CSV"></textarea><button onclick="flowImportExport.handleAllZipImport()">Preview Import</button><div id="importPreview" class="import-preview"></div>`)}
    ${card("Custom Dropdown Options", `<label>Task priorities</label><input id="priorityOptions" value="${escapeHTML((allZipCustomOptions.taskPriorities || []).join(", "))}"><label>Habit categories</label><input id="habitOptions" value="${escapeHTML((allZipCustomOptions.habitCategories || []).join(", "))}"><label>Goal categories</label><input id="goalOptions" value="${escapeHTML((allZipCustomOptions.goalCategories || []).join(", "))}"><label>Goal types</label><input id="goalTypeOptions" value="${escapeHTML((allZipCustomOptions.goalTypes || DEFAULT_GOAL_TYPES).join(", "))}"><label>Goal units</label><input id="goalUnitOptions" value="${escapeHTML((allZipCustomOptions.goalUnits || DEFAULT_GOAL_UNITS).join(", "))}"><label>Log units</label><input id="logUnitOptions" value="${escapeHTML((allZipCustomOptions.logUnits || DEFAULT_LOG_UNITS).join(", "))}"><button onclick="saveCustomOptions()">Save Options</button>`)}
  `;
}

function downloadBackup() {
  const blob = new Blob([DataService.exportAllData()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `flow-planner-backup-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function restoreBackup() {
  if (!restoreJson.value.trim()) return alert("Paste JSON first.");
  DataService.importAllData(restoreJson.value.trim());
  alert("Restore complete. Old data was migrated into the simplified structure.");
}

function saveCustomOptions() {
  allZipCustomOptions.taskPriorities = priorityOptions.value.split(",").map(v => v.trim()).filter(Boolean);
  allZipCustomOptions.habitCategories = habitOptions.value.split(",").map(v => v.trim()).filter(Boolean);
  allZipCustomOptions.goalCategories = goalOptions.value.split(",").map(v => v.trim()).filter(Boolean);
  allZipCustomOptions.goalTypes = goalTypeOptions.value.split(",").map(v => v.trim()).filter(Boolean);
  allZipCustomOptions.goalUnits = goalUnitOptions.value.split(",").map(v => v.trim()).filter(Boolean);
  allZipCustomOptions.logUnits = logUnitOptions.value.split(",").map(v => v.trim()).filter(Boolean);
  DataService.saveAllZipCustomOptions(allZipCustomOptions);
  renderDataSettings();
}

window.DataService = DataService;
window.setPage = setPage;
window.saveAllAppState = saveAllAppState;
window.allZipData = allZipData;
window.allZipCustomOptions = allZipCustomOptions;
Object.defineProperty(window, "activePage", { get: () => activePage });
Object.defineProperty(window, "systemsData", { get: () => systemsData, set: value => { systemsData = normalizeSystemsData(value); } });
Object.defineProperty(window, "scheduleData", { get: () => scheduleData, set: value => { scheduleData = normalizeScheduleData(value); } });
Object.defineProperty(window, "socialData", { get: () => socialData, set: value => { socialData = normalizeSocialData(value); } });

initializeApp();
