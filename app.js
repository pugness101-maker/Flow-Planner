console.log("Flow Planner Loaded");

const main = document.querySelector("main");
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const escapeHTML = (value = "") => String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const byDate = (a, b) => String(a.date || a.dueDate || a.targetDate || "").localeCompare(String(b.date || b.dueDate || b.targetDate || ""));

const DataService = {
  KEYS: {
    PLANNER_DATA: "flowPlannerData",
    SCHEDULE_DATA: "flowScheduleData",
    SYSTEMS_DATA: "flowSystemsData",
    SOCIAL_DATA: "flowSocialData",
    ALL_ZIP_DATA: "flowAllZipData",
    ALL_ZIP_CUSTOM_OPTIONS: "flowAllZipCustomOptions"
  },
  syncStatus: { lastSyncTime: null, isCloudConnected: false, syncErrors: [] },
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
    this.syncStatus.isCloudConnected = true;
    this.syncStatus.lastSyncTime = nowISO();
    this.saveAll();
    return result.data;
  },
  async syncToSupabase() {
    if (!window.flowSupabaseStorage?.enabled) return false;
    try {
      const result = await window.flowSupabaseStorage.syncToCloud?.({ plannerData, scheduleData, systemsData, socialData, allZipData, allZipCustomOptions, updatedAt: nowISO() });
      this.syncStatus.isCloudConnected = Boolean(result?.success);
      this.syncStatus.lastSyncTime = result?.success ? nowISO() : this.syncStatus.lastSyncTime;
      return Boolean(result?.success);
    } catch (error) {
      this.syncStatus.syncErrors.push({ time: nowISO(), error: error.message });
      this.syncStatus.isCloudConnected = false;
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

function normalizeHabit(item = {}) {
  const completions = Array.from(new Set([...(item.completions || []), ...(item.completionHistory || []).map(entry => typeof entry === "string" ? entry : entry.date).filter(Boolean)]));
  const daysOfWeek = Array.isArray(item.daysOfWeek) ? item.daysOfWeek.map(Number).filter(day => day >= 0 && day <= 6) : [];
  return {
    id: item.id || createId("habit"),
    name: item.name || item.title || "Untitled habit",
    category: item.category || "Personal",
    frequency: item.frequency || item.targetFrequency || "Daily",
    repeatSetting: item.repeatSetting || item.frequency || "Daily",
    daysOfWeek,
    startTime: item.startTime || "09:00",
    endTime: item.endTime || "",
    durationMinutes: item.durationMinutes || "30",
    calendarSync: Boolean(item.calendarSync),
    linkedGoalId: item.linkedGoalId || "",
    linkedBlockIds: Array.isArray(item.linkedBlockIds) ? item.linkedBlockIds : [item.linkedPlannerBlockId, item.linkedRoutineId].filter(Boolean),
    completions,
    notes: item.notes || "",
    createdAt: item.createdAt || nowISO(),
    updatedAt: item.updatedAt || nowISO()
  };
}

function normalizeGoal(item = {}) {
  const milestones = Array.isArray(item.milestones) ? item.milestones.map(milestone => ({
    id: milestone.id || createId("milestone"),
    title: milestone.title || milestone.name || "Milestone",
    completed: Boolean(milestone.completed),
    date: milestone.date || milestone.targetDate || ""
  })) : [];
  return {
    id: item.id || createId("goal"),
    name: item.name || item.title || "Untitled goal",
    category: item.category || "Personal",
    progress: Number(item.progress ?? item.progressPercent ?? item.currentValue ?? 0) || 0,
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

function normalizeLog(item = {}) {
  return {
    id: item.id || createId("log"),
    date: item.date || todayISO(),
    title: item.title || item.name || item.type || "Log entry",
    source: item.source || item.logSource || "Manual",
    category: item.category || "General",
    notes: item.notes || item.value || item.amount || "",
    linkedHabitId: item.linkedHabitId || "",
    linkedBlockId: item.linkedBlockId || item.linkedPlannerBlockId || "",
    linkedGoalId: item.linkedGoalId || "",
    linkedTaskId: item.linkedTaskId || item.linkedObjectiveId || "",
    createdAt: item.createdAt || nowISO(),
    updatedAt: item.updatedAt || nowISO()
  };
}

function normalizeBlock(item = {}) {
  return {
    id: item.id || createId("block"),
    title: item.title || item.name || item.activity || "Time block",
    type: item.type || item.blockKind || "Block",
    date: item.date || todayISO(),
    startTime: item.startTime || item.time || "09:00",
    endTime: item.endTime || "10:00",
    recurring: item.recurring || item.repeat || "None",
    category: item.category || "Personal",
    linkedTaskId: item.linkedTaskId || item.linkedObjectiveId || "",
    linkedHabitId: item.linkedHabitId || "",
    linkedGoalId: item.linkedGoalId || "",
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
  const legacyLogs = [...(raw.logs || [])];
  return {
    tasks: legacyTasks.map(normalizeTask),
    habits: (raw.habits || []).map(normalizeHabit),
    goals: [...(raw.goals || []).map(normalizeGoal), ...convertedGoals],
    logs: legacyLogs.map(normalizeLog)
  };
}

function normalizeSocialData(raw = {}) {
  return {
    friends: (raw.friends || []).map(friend => ({
      id: friend.id || createId("friend"),
      name: friend.name || "Friend",
      relationship: friend.relationship || friend.relationshipType || "Friend",
      lastContacted: friend.lastContacted || friend.lastSeen || "",
      notes: friend.notes || friend.importantNotes || friend.details || "",
      followUpReminder: friend.followUpReminder || "",
      createdAt: friend.createdAt || nowISO(),
      updatedAt: friend.updatedAt || nowISO()
    })),
    hangouts: (raw.hangouts || []).map(hangout => ({
      id: hangout.id || createId("hangout"),
      title: hangout.title || hangout.activity || "Hangout",
      date: hangout.date || "",
      friendIds: Array.isArray(hangout.friendIds) ? hangout.friendIds : [],
      location: hangout.location || "",
      notes: hangout.notes || "",
      followUpReminder: hangout.followUpReminder || "",
      completed: Boolean(hangout.completed),
      createdAt: hangout.createdAt || nowISO(),
      updatedAt: hangout.updatedAt || nowISO()
    })),
    ideas: (raw.ideas || []).map(idea => ({
      id: idea.id || createId("idea"),
      title: idea.title || idea.name || "Idea",
      category: idea.category || "General",
      friendIds: Array.isArray(idea.friendIds) ? idea.friendIds : (Array.isArray(idea.linkedFriendIds) ? idea.linkedFriendIds : []),
      notes: idea.notes || "",
      favorite: Boolean(idea.favorite),
      createdAt: idea.createdAt || nowISO(),
      updatedAt: idea.updatedAt || nowISO()
    }))
  };
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

let plannerData = normalizePlannerData(DataService.get(DataService.KEYS.PLANNER_DATA) || {});
let systemsData = normalizeSystemsData(DataService.get(DataService.KEYS.SYSTEMS_DATA) || {});
let socialData = normalizeSocialData(DataService.get(DataService.KEYS.SOCIAL_DATA) || {});
let scheduleData = normalizeScheduleData(DataService.get(DataService.KEYS.SCHEDULE_DATA) || {});
let allZipData = DataService.get(DataService.KEYS.ALL_ZIP_DATA) || [];
let allZipCustomOptions = DataService.get(DataService.KEYS.ALL_ZIP_CUSTOM_OPTIONS) || { taskPriorities: ["Low", "Medium", "High"], habitCategories: ["Health", "Home", "Work", "Personal"], goalCategories: ["Personal", "Career", "Health"] };
DataService.saveAll();

let activePage = "Tasks";
let calendarView = "Day";
let calendarDate = todayISO();
let customStartDate = todayISO();
let customEndDate = todayISO();
let productivityTab = "Habits";
let socialTab = "Friends";
let logSearch = "";
let logFilter = "All";
let editingHabitId = null;

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

function renderTasks() {
  const tasks = [...systemsData.tasks].sort(byDate);
  const complete = tasks.filter(task => task.status === "Complete").slice(-12).reverse();
  document.getElementById("pageRoot").innerHTML = `
    ${card("New Task", `
      <form onsubmit="saveTask(event)" class="stack">
        <input id="taskTitle" placeholder="Task or objective" required>
        <div class="grid-2"><input id="taskDueDate" type="date"><select id="taskPriority">${optionList(allZipCustomOptions.taskPriorities || ["Low", "Medium", "High"], "Medium")}</select></div>
        <select id="taskStatus">${optionList(["Not Started", "In Progress", "Complete"])}</select>
        <textarea id="taskNotes" placeholder="Notes"></textarea>
        <button>Add Task</button>
      </form>`)}
    ${card("Tasks", tasks.length ? `<div class="item-list">${tasks.map(renderTaskItem).join("")}</div>` : `<p class="muted-text">No tasks yet.</p>`)}
    ${card("Completed History", complete.length ? `<div class="item-list compact">${complete.map(task => `<div class="item"><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML((task.completedAt || "").slice(0, 10))}</span></div>`).join("")}</div>` : `<p class="muted-text">Completed tasks will appear here.</p>`)}
  `;
}

function renderTaskItem(task) {
  return `<div class="item ${task.status === "Complete" ? "is-done" : ""}">
    <div><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(task.dueDate || "No due date")} · ${escapeHTML(task.priority)} · ${escapeHTML(task.status)}</span></div>
    <div class="mini-actions">
      <button onclick="cycleTaskStatus('${task.id}')">Status</button>
      <button class="secondary-btn" onclick="deleteTask('${task.id}')">Delete</button>
    </div>
  </div>`;
}

function saveTask(event) {
  event.preventDefault();
  systemsData.tasks.push(normalizeTask({ title: taskTitle.value, dueDate: taskDueDate.value, priority: taskPriority.value, status: taskStatus.value, notes: taskNotes.value }));
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
    addLog({ title: `Task completed: ${task.title}`, source: "Task", linkedTaskId: task.id, category: "Task" }, false);
  }
  saveSystemsData();
  renderTasks();
}

function deleteTask(id) {
  if (!confirm("Delete this task?")) return;
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
  return Math.max(15, parseTimeToMinutes(block.endTime) - parseTimeToMinutes(block.startTime));
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
  return { task, habit };
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
      columns[col] = parseTimeToMinutes(block.endTime);
      positioned.set(block.id, { col, cols: 1 });
    });
    const total = Math.max(1, columns.length);
    group.forEach(block => positioned.set(block.id, { ...positioned.get(block.id), cols: total }));
    group = [];
    groupEnd = 0;
  };
  sorted.forEach(block => {
    const start = parseTimeToMinutes(block.startTime);
    const end = parseTimeToMinutes(block.endTime);
    if (group.length && start >= groupEnd) flush();
    group.push(block);
    groupEnd = Math.max(groupEnd, end);
  });
  if (group.length) flush();
  return positioned;
}

function renderCalendarBlock(block, compact = false, layout = null) {
  const { task, habit } = getCalendarBlockMeta(block);
  const start = parseTimeToMinutes(block.startTime);
  const height = Math.max(26, getBlockDuration(block) * (64 / 60));
  const top = start * (64 / 60);
  const width = layout ? `calc(${100 / layout.cols}% - 6px)` : "calc(100% - 8px)";
  const left = layout ? `calc(${(100 / layout.cols) * layout.col}% + 4px)` : "4px";
  const style = compact ? "" : `style="top:${top}px;height:${height}px;left:${left};width:${width}"`;
  return `<button class="calendar-event ${compact ? "compact" : ""} ${block.completed ? "is-complete" : ""}" ${style} data-category="${escapeHTML(getBlockCategory(block))}" draggable="true" ondragstart="startBlockDrag(event, '${block.id}')" onclick="openBlockModal('${block.id}')">
    <strong>${escapeHTML(block.title)}</strong>
    <span>${escapeHTML(block.startTime)}-${escapeHTML(block.endTime)}</span>
    ${task ? `<em>${escapeHTML(task.title)}</em>` : ""}
    ${habit ? `<em>${escapeHTML(habit.name)}</em>` : ""}
  </button>`;
}

function renderDayCalendar(date, blocks) {
  const layout = layoutOverlappingBlocks(blocks);
  const currentTime = new Date();
  const showNow = date === todayISO();
  const nowTop = ((currentTime.getHours() * 60) + currentTime.getMinutes()) * (64 / 60);
  return `<div class="calendar-board day-board">
    <div class="calendar-day-title">${escapeHTML(getDayLabel(date, { weekday: "long", month: "long", day: "numeric" }))}</div>
    <div class="time-grid day-grid" ondragover="allowCalendarDrop(event)" ondrop="dropBlockOnTimeline(event, '${date}')">
      <div class="time-gutter">${renderHourLabels()}</div>
      <div class="time-canvas">
        ${renderHourRows(date)}
        ${showNow ? `<div class="now-line" style="top:${nowTop}px"><span></span></div>` : ""}
        ${blocks.map(block => renderCalendarBlock(block, false, layout.get(block.id))).join("")}
      </div>
    </div>
    ${blocks.length ? "" : `<div class="empty-state small"><p>No blocks scheduled for this range.</p></div>`}
  </div>`;
}

function renderWeekCalendar(startDate, blocks) {
  const dates = getWeekDates(startDate);
  return `<div class="calendar-board week-board">
    <div class="week-header"><div></div>${dates.map(date => `<button class="${date === todayISO() ? "is-today" : ""}" onclick="calendarDate='${date}'; calendarView='Day'; renderCalendar();"><span>${escapeHTML(getDayLabel(date, { weekday: "short" }))}</span><strong>${new Date(`${date}T00:00:00`).getDate()}</strong></button>`).join("")}</div>
    <div class="week-grid">
      <div class="time-gutter">${renderHourLabels()}</div>
      ${dates.map(date => {
        const dayBlocks = blocks.filter(block => block.date === date);
        const layout = layoutOverlappingBlocks(dayBlocks);
        return `<div class="time-canvas week-day-column" ondragover="allowCalendarDrop(event)" ondrop="dropBlockOnTimeline(event, '${date}')">
          ${renderHourRows(date)}
          ${dayBlocks.map(block => renderCalendarBlock(block, false, layout.get(block.id))).join("")}
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
        const isOutside = new Date(`${date}T00:00:00`).getMonth() !== base.getMonth();
        return `<div class="month-cell ${isOutside ? "is-outside" : ""} ${date === todayISO() ? "is-today" : ""}" ondragover="allowCalendarDrop(event)" ondrop="dropBlockOnDate(event, '${date}')">
          <button class="month-date" onclick="calendarDate='${date}'; calendarView='Day'; renderCalendar();">${new Date(`${date}T00:00:00`).getDate()}</button>
          <div class="month-events">${dayBlocks.slice(0, 3).map(block => renderCalendarBlock(block, true)).join("")}${dayBlocks.length > 3 ? `<button class="more-events" onclick="calendarDate='${date}'; calendarView='Day'; renderCalendar();">+${dayBlocks.length - 3} more</button>` : ""}</div>
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
        return `<section class="custom-day" ondragover="allowCalendarDrop(event)" ondrop="dropBlockOnDate(event, '${date}')">
          <button onclick="calendarDate='${date}'; calendarView='Day'; renderCalendar();">${escapeHTML(getDayLabel(date, { weekday: "short", month: "short", day: "numeric" }))}</button>
          ${dayBlocks.length ? dayBlocks.map(block => renderBlockItem(block)).join("") : `<p class="muted-text">No blocks scheduled.</p>`}
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
  const { task, habit } = getCalendarBlockMeta(block);
  return `<div class="item calendar-block-card ${block.completed ? "is-done" : ""}" data-category="${escapeHTML(getBlockCategory(block))}" draggable="true" ondragstart="startBlockDrag(event, '${block.id}')" onclick="openBlockModal('${block.id}')">
    <div>
      <strong>${escapeHTML(block.title)}</strong>
      <span>${escapeHTML(formatDisplayDate(block.date))} · ${escapeHTML(block.startTime)}-${escapeHTML(block.endTime)}</span>
      <div class="linked-line">${task ? `<span>Task: ${escapeHTML(task.title)}</span>` : ""}${habit ? `<span>Habit: ${escapeHTML(habit.name)}</span>` : ""}</div>
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
  document.getElementById("pageRoot").innerHTML = `
    <div class="segmented page-tabs">${["Habits", "Goals", "Logs"].map(tab => `<button class="${productivityTab === tab ? "active" : ""}" onclick="productivityTab='${tab}'; renderProductivity();">${tab}</button>`).join("")}</div>
    <div id="productivityBody"></div>`;
  if (productivityTab === "Habits") renderHabits();
  if (productivityTab === "Goals") renderGoals();
  if (productivityTab === "Logs") renderLogs();
}

function renderHabits() {
  const editingHabit = editingHabitId ? systemsData.habits.find(habit => habit.id === editingHabitId) : null;
  const dayOptions = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const selectedDays = new Set(editingHabit?.daysOfWeek || []);
  document.getElementById("productivityBody").innerHTML = `
    ${card(editingHabit ? "Edit Habit" : "New Habit", `
      <form onsubmit="saveHabit(event)" class="stack habit-form">
        <input id="habitName" name="habitName" placeholder="Habit name" value="${escapeHTML(editingHabit?.name || "")}" required>
        <div class="grid-2">
          <select id="habitCategory" name="habitCategory">${optionList(allZipCustomOptions.habitCategories || ["Health", "Home", "Work", "Personal"], editingHabit?.category || "Personal")}</select>
          <select id="habitGoal" name="habitGoal"><option value="">Linked goal</option>${systemsData.goals.map(goal => `<option value="${goal.id}" ${goal.id === editingHabit?.linkedGoalId ? "selected" : ""}>${escapeHTML(goal.name)}</option>`).join("")}</select>
        </div>
        <div class="weekday-picker">
          ${dayOptions.map((day, index) => `<label><input type="checkbox" name="habitDays" value="${index}" ${selectedDays.has(index) ? "checked" : ""}>${day}</label>`).join("")}
        </div>
        <div class="grid-3">
          <input id="habitStartTime" name="habitStartTime" type="time" value="${escapeHTML(editingHabit?.startTime || "09:00")}">
          <input id="habitEndTime" name="habitEndTime" type="time" value="${escapeHTML(editingHabit?.endTime || "")}">
          <input id="habitDuration" name="habitDuration" type="number" min="15" step="15" placeholder="Duration min" value="${escapeHTML(editingHabit?.durationMinutes || "30")}">
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
  const days = getHabitDayLabel(habit);
  const time = `${habit.startTime || "09:00"}-${getHabitEndTime(habit)}`;
  return `<div class="item habit-card ${doneToday ? "is-done" : ""}">
    <div>
      <strong>${escapeHTML(habit.name)}</strong>
      <span>${escapeHTML(habit.category)} · ${streak} day streak · ${habit.completions.length} completions</span>
      <div class="habit-meta">
        <span>${escapeHTML(days)}</span>
        <span>${escapeHTML(time)}</span>
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

function saveHabit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const field = (name) => form.querySelector(`[name="${name}"]`);
  const daysOfWeek = [...form.querySelectorAll('input[name="habitDays"]:checked')].map(input => Number(input.value));
  const existingHabit = editingHabitId ? systemsData.habits.find(item => item.id === editingHabitId) : null;
  const habit = normalizeHabit({
    id: editingHabitId || createId("habit"),
    name: field("habitName").value,
    category: field("habitCategory").value,
    linkedGoalId: field("habitGoal").value,
    daysOfWeek,
    startTime: field("habitStartTime").value || "09:00",
    endTime: field("habitEndTime").value,
    durationMinutes: field("habitDuration").value || "30",
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
  addLog({ title: `Completed habit: ${habit.name}`, source: "Habit", category: habit.category, linkedHabitId: habit.id, linkedGoalId: habit.linkedGoalId }, false);
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

function getHabitEndTime(habit) {
  if (habit.endTime) return habit.endTime;
  return minutesToTime(parseTimeToMinutes(habit.startTime || "09:00") + (Number(habit.durationMinutes) || 30));
}

function getHabitDayLabel(habit) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (habit.repeatSetting === "Daily") return "Daily";
  if (!habit.daysOfWeek?.length) return "No days selected";
  return habit.daysOfWeek.map(day => names[day]).join(", ");
}

function getHabitCalendarDates(habit, startDate = todayISO(), weeks = 8) {
  const selected = new Set(habit.repeatSetting === "Daily" ? [0, 1, 2, 3, 4, 5, 6] : habit.daysOfWeek || []);
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

function getHabitBlockCategory(habit) {
  const allowed = ["Work", "School", "Fitness", "Social", "Personal", "Custom"];
  return allowed.includes(habit.category) ? habit.category : "Personal";
}

function syncHabitCalendarBlocks(habit) {
  const today = todayISO();
  scheduleData.blocks = scheduleData.blocks.filter(block => !(block.generatedFromHabit && block.linkedHabitId === habit.id && block.date >= today));
  const existingDates = new Set(scheduleData.blocks.filter(block => block.linkedHabitId === habit.id).map(block => block.date));
  const createdIds = [];
  getHabitCalendarDates(habit).forEach(date => {
    if (existingDates.has(date)) return;
    const block = normalizeBlock({
      title: habit.name,
      type: "Habit",
      category: getHabitBlockCategory(habit),
      date,
      startTime: habit.startTime || "09:00",
      endTime: getHabitEndTime(habit),
      recurring: habit.repeatSetting || "Selected days",
      linkedHabitId: habit.id,
      linkedGoalId: habit.linkedGoalId || "",
      notes: habit.notes || "",
      completed: false
    });
    block.generatedFromHabit = true;
    block.habitScheduleKey = `${habit.id}-${date}`;
    scheduleData.blocks.push(block);
    createdIds.push(block.id);
  });
  habit.linkedBlockIds = Array.from(new Set([...(habit.linkedBlockIds || []), ...createdIds]));
  habit.calendarSync = true;
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

function renderGoals() {
  document.getElementById("productivityBody").innerHTML = `
    ${card("New Goal", `<form onsubmit="saveGoal(event)" class="stack"><input id="goalName" placeholder="Goal" required><div class="grid-2"><input id="goalDate" type="date"><input id="goalProgress" type="number" min="0" max="100" placeholder="Progress %"></div><select id="goalCategory">${optionList(allZipCustomOptions.goalCategories || ["Personal", "Career", "Health"])}</select><textarea id="goalNotes" placeholder="Milestones, notes, links"></textarea><button>Add Goal</button></form>`)}
    ${card("Goal Tracking", systemsData.goals.length ? `<div class="item-list">${systemsData.goals.map(renderGoalItem).join("")}</div>` : `<p class="muted-text">No goals yet.</p>`)}
  `;
}

function renderGoalItem(goal) {
  const linkedHabits = systemsData.habits.filter(habit => habit.linkedGoalId === goal.id).length;
  const linkedTasks = systemsData.tasks.filter(task => task.linkedGoalId === goal.id).length;
  return `<div class="item"><div><strong>${escapeHTML(goal.name)}</strong><span>${escapeHTML(goal.category)} · ${goal.progress}% · target ${escapeHTML(goal.targetDate || "none")} · ${linkedHabits} habits · ${linkedTasks} tasks</span><div class="progress"><span style="width:${Math.max(0, Math.min(100, goal.progress))}%"></span></div></div><div class="mini-actions"><button onclick="advanceGoal('${goal.id}')">+10%</button><button class="secondary-btn" onclick="deleteGoal('${goal.id}')">Delete</button></div></div>`;
}

function saveGoal(event) {
  event.preventDefault();
  systemsData.goals.push(normalizeGoal({ name: goalName.value, targetDate: goalDate.value, progress: goalProgress.value, category: goalCategory.value, notes: goalNotes.value }));
  saveSystemsData();
  renderGoals();
}

function advanceGoal(id) {
  const goal = systemsData.goals.find(item => item.id === id);
  if (!goal) return;
  goal.progress = Math.min(100, Number(goal.progress || 0) + 10);
  goal.updatedAt = nowISO();
  addLog({ title: `Goal updated: ${goal.name}`, source: "Goal", category: goal.category, linkedGoalId: goal.id, notes: `${goal.progress}%` }, false);
  saveSystemsData();
  renderProductivity();
}

function deleteGoal(id) {
  if (!confirm("Delete this goal?")) return;
  systemsData.goals = systemsData.goals.filter(item => item.id !== id);
  saveSystemsData();
  renderProductivity();
}

function addLog(log, shouldSave = true) {
  systemsData.logs.push(normalizeLog(log));
  if (shouldSave) saveSystemsData();
}

function renderLogs() {
  const logs = systemsData.logs.filter(log => {
    const q = logSearch.toLowerCase();
    const matchesSearch = !q || `${log.title} ${log.notes} ${log.category} ${log.source}`.toLowerCase().includes(q);
    const matchesFilter = logFilter === "All" || log.source === logFilter;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  document.getElementById("productivityBody").innerHTML = `
    ${card("Manual Log", `<form onsubmit="saveManualLog(event)" class="stack"><input id="logTitle" placeholder="What happened?" required><div class="grid-2"><input id="logDate" type="date" value="${todayISO()}"><select id="logGoal"><option value="">Linked goal</option>${systemsData.goals.map(goal => `<option value="${goal.id}">${escapeHTML(goal.name)}</option>`).join("")}</select></div><textarea id="logNotes" placeholder="Notes"></textarea><button>Add Log</button></form>`)}
    ${card("Search & Filter", `<div class="grid-2"><input value="${escapeHTML(logSearch)}" placeholder="Search logs" oninput="logSearch=this.value; renderLogs();"><select onchange="logFilter=this.value; renderLogs();">${optionList(["All", "Manual", "Habit", "Block", "Task", "Goal"], logFilter)}</select></div>`)}
    ${card("History", logs.length ? `<div class="item-list compact">${logs.map(log => `<div class="item"><div><strong>${escapeHTML(log.title)}</strong><span>${escapeHTML(log.date)} · ${escapeHTML(log.source)} · ${escapeHTML(log.category)}</span>${log.notes ? `<p>${escapeHTML(log.notes)}</p>` : ""}</div><button class="secondary-btn" onclick="deleteLog('${log.id}')">Delete</button></div>`).join("")}</div>` : `<p class="muted-text">No logs match this view.</p>`)}
  `;
}

function saveManualLog(event) {
  event.preventDefault();
  addLog({ title: logTitle.value, date: logDate.value, notes: logNotes.value, linkedGoalId: logGoal.value, source: "Manual" });
  renderLogs();
}

function deleteLog(id) {
  systemsData.logs = systemsData.logs.filter(item => item.id !== id);
  saveSystemsData();
  renderLogs();
}

function renderSocial() {
  document.getElementById("pageRoot").innerHTML = `
    <div class="segmented page-tabs">${["Friends", "Hangouts", "Ideas"].map(tab => `<button class="${socialTab === tab ? "active" : ""}" onclick="socialTab='${tab}'; renderSocial();">${tab}</button>`).join("")}</div>
    <div id="socialBody"></div>`;
  if (socialTab === "Friends") renderFriends();
  if (socialTab === "Hangouts") renderHangouts();
  if (socialTab === "Ideas") renderIdeas();
}

function renderFriends() {
  document.getElementById("socialBody").innerHTML = `${card("New Friend", `<form onsubmit="saveFriend(event)" class="stack"><input id="friendName" placeholder="Name" required><input id="friendReminder" type="date"><textarea id="friendNotes" placeholder="Relationship notes"></textarea><button>Add Friend</button></form>`)}${card("Friends", socialData.friends.length ? `<div class="item-list">${socialData.friends.map(friend => `<div class="item"><div><strong>${escapeHTML(friend.name)}</strong><span>Follow up ${escapeHTML(friend.followUpReminder || "not set")}</span><p>${escapeHTML(friend.notes)}</p></div><button class="secondary-btn" onclick="deleteFriend('${friend.id}')">Delete</button></div>`).join("")}</div>` : `<p class="muted-text">No friends yet.</p>`)}`;
}

function saveFriend(event) { event.preventDefault(); socialData.friends.push(normalizeSocialData({ friends: [{ name: friendName.value, followUpReminder: friendReminder.value, notes: friendNotes.value }] }).friends[0]); saveSocialData(); renderFriends(); }
function deleteFriend(id) { socialData.friends = socialData.friends.filter(item => item.id !== id); saveSocialData(); renderFriends(); }

function renderHangouts() {
  document.getElementById("socialBody").innerHTML = `${card("New Hangout", `<form onsubmit="saveHangout(event)" class="stack"><input id="hangoutTitle" placeholder="Hangout" required><input id="hangoutDate" type="date"><select id="hangoutFriend"><option value="">Friend</option>${socialData.friends.map(friend => `<option value="${friend.id}">${escapeHTML(friend.name)}</option>`).join("")}</select><textarea id="hangoutNotes" placeholder="Notes"></textarea><button>Add Hangout</button></form>`)}${card("Hangouts", socialData.hangouts.length ? `<div class="item-list">${socialData.hangouts.map(hangout => `<div class="item"><div><strong>${escapeHTML(hangout.title)}</strong><span>${escapeHTML(hangout.date || "No date")}</span><p>${escapeHTML(hangout.notes)}</p></div><button class="secondary-btn" onclick="deleteHangout('${hangout.id}')">Delete</button></div>`).join("")}</div>` : `<p class="muted-text">No hangouts yet.</p>`)}`;
}

function saveHangout(event) { event.preventDefault(); socialData.hangouts.push(normalizeSocialData({ hangouts: [{ title: hangoutTitle.value, date: hangoutDate.value, friendIds: hangoutFriend.value ? [hangoutFriend.value] : [], notes: hangoutNotes.value }] }).hangouts[0]); saveSocialData(); renderHangouts(); }
function deleteHangout(id) { socialData.hangouts = socialData.hangouts.filter(item => item.id !== id); saveSocialData(); renderHangouts(); }

function renderIdeas() {
  document.getElementById("socialBody").innerHTML = `${card("New Idea", `<form onsubmit="saveIdea(event)" class="stack"><input id="ideaTitle" placeholder="Idea" required><input id="ideaCategory" placeholder="Category"><textarea id="ideaNotes" placeholder="Notes"></textarea><button>Add Idea</button></form>`)}${card("Ideas", socialData.ideas.length ? `<div class="item-list">${socialData.ideas.map(idea => `<div class="item"><div><strong>${escapeHTML(idea.title)}</strong><span>${escapeHTML(idea.category)}</span><p>${escapeHTML(idea.notes)}</p></div><button class="secondary-btn" onclick="deleteIdea('${idea.id}')">Delete</button></div>`).join("")}</div>` : `<p class="muted-text">No ideas yet.</p>`)}`;
}

function saveIdea(event) { event.preventDefault(); socialData.ideas.push(normalizeSocialData({ ideas: [{ title: ideaTitle.value, category: ideaCategory.value, notes: ideaNotes.value }] }).ideas[0]); saveSocialData(); renderIdeas(); }
function deleteIdea(id) { socialData.ideas = socialData.ideas.filter(item => item.id !== id); saveSocialData(); renderIdeas(); }

function renderDataSettings() {
  document.getElementById("pageRoot").innerHTML = `
    ${card("Data Management", `<div class="stats-grid"><div><strong>${systemsData.tasks.length}</strong><span>Tasks</span></div><div><strong>${scheduleData.blocks.length}</strong><span>Blocks</span></div><div><strong>${systemsData.habits.length}</strong><span>Habits</span></div><div><strong>${systemsData.logs.length}</strong><span>Logs</span></div></div><button onclick="downloadBackup()">Export JSON</button><button class="secondary-btn" onclick="downloadBackup()">Backup</button>`)}
    ${card("Restore / Import JSON", `<textarea id="restoreJson" rows="8" placeholder="Paste Flow Planner JSON"></textarea><button onclick="restoreBackup()">Restore</button>`)}
    ${card("Supabase Sync", `<p class="muted-text">${DataService.syncStatus.isCloudConnected ? "Cloud sync connected." : "Cloud sync is local-first until Supabase is configured."}</p><button onclick="DataService.syncToSupabase().then(() => renderDataSettings())">Sync Now</button>`)}
    ${card("Custom Dropdown Options", `<label>Task priorities</label><input id="priorityOptions" value="${escapeHTML((allZipCustomOptions.taskPriorities || []).join(", "))}"><label>Habit categories</label><input id="habitOptions" value="${escapeHTML((allZipCustomOptions.habitCategories || []).join(", "))}"><label>Goal categories</label><input id="goalOptions" value="${escapeHTML((allZipCustomOptions.goalCategories || []).join(", "))}"><button onclick="saveCustomOptions()">Save Options</button>`)}
    <div class="settings-content"></div>
  `;
  window.flowImportExport?.addSettingsUI?.();
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

setPage("Tasks");
