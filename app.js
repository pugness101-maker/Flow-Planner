console.log("Flow Planner Loaded");

const main = document.querySelector("main");

// DATA
let plannerData = JSON.parse(localStorage.getItem("flowPlannerData")) || {
  plans: []
};

let socialData = JSON.parse(localStorage.getItem("flowSocialData")) || {
  friends: [],
  hangouts: [],
  ideas: []
};

if (!Array.isArray(socialData.friends)) socialData.friends = [];
if (!Array.isArray(socialData.hangouts)) socialData.hangouts = [];
if (!Array.isArray(socialData.ideas)) socialData.ideas = [];

socialData.friends = socialData.friends.map(friend => ({
  name: friend.name || "",
  priority: friend.priority || "Medium",
  interests: friend.interests || "",
  details: friend.details || "",
  notes: friend.notes || "",
  favoriteActivities: friend.favoriteActivities || "",
  contactNotes: friend.contactNotes || "",
  lastSeen: friend.lastSeen || friend.lastHangout || ""
}));

socialData.hangouts = socialData.hangouts.map(hangout => ({
  activity: hangout.activity || hangout.title || "",
  date: hangout.date || "",
  time: hangout.time || "",
  location: hangout.location || hangout.place || "",
  people: Array.isArray(hangout.people)
    ? hangout.people
    : (hangout.friend ? [hangout.friend] : []),
  cost: hangout.cost || "",
  notes: hangout.notes || "",
  completed: Boolean(hangout.completed)
}));

socialData.ideas = socialData.ideas.map(idea => ({
  title: idea.title || "",
  category: idea.category || "Cheap",
  cost: idea.cost || "",
  notes: idea.notes || "",
  favorite: Boolean(idea.favorite)
}));

let systemsData = JSON.parse(localStorage.getItem("flowSystemsData")) || {
  habits: [],
  logs: [],
  trackers: [],
  goals: [],
  metrics: []
};

if (!Array.isArray(systemsData.habits)) systemsData.habits = [];
if (!Array.isArray(systemsData.logs)) systemsData.logs = [];
if (!Array.isArray(systemsData.trackers)) systemsData.trackers = [];
if (!Array.isArray(systemsData.goals)) systemsData.goals = [];
if (!Array.isArray(systemsData.metrics)) systemsData.metrics = [];

systemsData.goals = systemsData.goals.map(goal => ({
  id: goal.id || createId("goal"),
  name: goal.name || "",
  category: goal.category || "Custom",
  startValue: goal.startValue ?? "",
  currentValue: goal.currentValue ?? "",
  targetValue: goal.targetValue ?? "",
  unit: goal.unit || "",
  startDate: goal.startDate || "",
  deadline: goal.deadline || "",
  linkedTrackerId: goal.linkedTrackerId || "",
  linkedHabitId: goal.linkedHabitId || "",
  linkedPlannerBlockId: goal.linkedPlannerBlockId || "",
  milestones: Array.isArray(goal.milestones) ? goal.milestones : [],
  recurringTarget: goal.recurringTarget || "",
  notes: goal.notes || ""
}));

systemsData.trackers = systemsData.trackers.map(tracker => ({
  id: tracker.id || createId("tracker"),
  name: tracker.name || "",
  type: tracker.type || "Custom",
  startValue: tracker.startValue ?? "",
  currentValue: tracker.currentValue ?? "",
  targetValue: tracker.targetValue ?? "",
  unit: tracker.unit || "",
  startDate: tracker.startDate || "",
  targetDate: tracker.targetDate || "",
  notes: tracker.notes || ""
}));

systemsData.metrics = systemsData.metrics.map(metric => ({
  id: metric.id || createId("metric"),
  name: metric.name || "",
  type: metric.type || "Counter",
  unit: metric.unit || "",
  startValue: metric.startValue ?? "",
  currentValue: metric.currentValue ?? "0",
  targetValue: metric.targetValue ?? "",
  startDate: metric.startDate || "",
  deadline: metric.deadline || "",
  linkedHabitId: metric.linkedHabitId || "",
  recurringTarget: metric.recurringTarget || "",
  notes: metric.notes || "",
  entries: Array.isArray(metric.entries) ? metric.entries : []
}));

systemsData.habits = systemsData.habits.map(habit => ({
  id: habit.id || createId("habit"),
  name: habit.name || "",
  category: habit.category || "",
  frequency: habit.frequency || "Daily",
  targetFrequency: habit.targetFrequency || habit.frequency || "Daily",
  target: habit.target || "",
  unit: habit.unit || "",
  linkedGoalId: habit.linkedGoalId || "",
  paused: Boolean(habit.paused),
  skippedDates: Array.isArray(habit.skippedDates) ? habit.skippedDates : [],
  completionHistory: Array.isArray(habit.completionHistory) ? habit.completionHistory : [],
  notes: habit.notes || "",
  completions: Array.isArray(habit.completions) ? habit.completions : []
}));

systemsData.logs = systemsData.logs.map(log => ({
  id: log.id || createId("log"),
  title: log.title || "",
  type: log.type || "Custom",
  valueType: log.valueType || log.type || "Custom",
  value: log.value || "",
  unit: log.unit || "",
  date: log.date || "",
  notes: log.notes || "",
  linkedHabitId: log.linkedHabitId || "",
  linkedPlannerBlockId: log.linkedPlannerBlockId || ""
}));

let scheduleData = JSON.parse(localStorage.getItem("flowScheduleData")) || {
  blocks: []
};

if (!Array.isArray(scheduleData.blocks)) {
  scheduleData.blocks = [];
}

if (!Array.isArray(scheduleData.routines)) {
  scheduleData.routines = [];
}

if (typeof scheduleData.bufferMinutes !== "number") {
  scheduleData.bufferMinutes = 15;
}

scheduleData.blocks.forEach(block => {
  if (!block.id) block.id = createId("block");
  if (typeof block.completed !== "boolean") block.completed = false;
  if (!Array.isArray(block.tasks)) block.tasks = [];
  block.tasks = block.tasks.map(normalizeTask);
  if (!block.type) block.type = block.routineId ? "routine" : "task";
  if (!block.category) block.category = "Personal";
  if (!block.notes) block.notes = "";
});

scheduleData.routines.forEach(routine => {
  if (!routine.id) routine.id = createId("routine");
  if (!Array.isArray(routine.repeatDays)) routine.repeatDays = [];
  if (!Array.isArray(routine.tasks)) routine.tasks = [];
  if (!routine.dayTimes || typeof routine.dayTimes !== "object") routine.dayTimes = {};
  if (!routine.completions || typeof routine.completions !== "object") routine.completions = {};
  if (!Array.isArray(routine.completedDates)) routine.completedDates = [];
  if (typeof routine.streak !== "number") routine.streak = 0;
  if (typeof routine.autoAdd !== "boolean") routine.autoAdd = false;
});

function saveScheduleData() {
  localStorage.setItem("flowScheduleData", JSON.stringify(scheduleData));
}

let editingPlanIndex = null;
let editingFriendIndex = null;
let editingHangoutIndex = null;
let editingRoutineIndex = null;
let editingBlockIndex = null;
let editingIdeaIndex = null;
let editingHabitIndex = null;
let editingTrackerIndex = null;
let editingGoalIndex = null;
let editingMetricIndex = null;
let activePlannerSection = "Day";
let activeSystemsSection = "Dashboard";
let activeSocialSection = "Friends";
let activeSystemsForm = null;
let friendFormOpen = false;
let hangoutFormOpen = false;
let viewingFriendIndex = null;
let viewingHangoutIndex = null;
let selectedPlannerDate = getTodayISO();
let visiblePlannerMonth = getTodayISO().slice(0, 7);
let pendingSocialImport = null;

// SAVE
function savePlannerData() {
  localStorage.setItem("flowPlannerData", JSON.stringify(plannerData));
}

function saveSocialData() {
  localStorage.setItem("flowSocialData", JSON.stringify(socialData));
}

function saveSystemsData() {
  localStorage.setItem("flowSystemsData", JSON.stringify(systemsData));
}

// PAGES
const pages = {
  Home: () => `
    <div class="dashboard-shell">
      <div class="dashboard-hero">
        <div>
          <p class="eyebrow">Today</p>
          <h2>${formatDashboardDate(getTodayISO())}</h2>
          <p>What should I do next?</p>
        </div>
        <button onclick="openQuickAddDefault()">Quick Add</button>
      </div>
      <div id="todayFocus"></div>
    </div>
    <div class="dashboard-grid">
      <div class="card dashboard-card wide-card">
        <h3>Next Action</h3>
        <div id="homeNextAction"></div>
      </div>
      <div class="card dashboard-card">
        <h3>Today Focus</h3>
        <div id="homeSnapshot"></div>
      </div>
      <div class="card dashboard-card">
        <h3>Quick Add</h3>
        <div class="quick-add-grid">
          <button onclick="openPlannerSection('Day')">Time Block</button>
          <button onclick="openSystemsSection('Habits')">Habit</button>
          <button onclick="openSystemsSection('Logs')">Log</button>
          <button onclick="openSocialSection('Hangouts')">Hangout</button>
        </div>
      </div>
      <div class="card dashboard-card">
        <h3>Goal Progress</h3>
        <div id="homeGoalProgress"></div>
      </div>
      <div class="card dashboard-card">
        <h3>Social Reminder</h3>
        <div id="homeSocialReminder"></div>
      </div>
      <div class="card dashboard-card">
        <h3>Smart Suggestion</h3>
        <div id="homeSuggestions"></div>
      </div>
      <div class="card dashboard-card wide-card">
        <h3>Today Timeline</h3>
        <div id="homeTimeline"></div>
      </div>
      <div class="card dashboard-card">
        <h3>Systems Today</h3>
        <div id="homeSystemsHabits"></div>
      </div>
      <div class="card dashboard-card">
        <h3>Stats</h3>
        <div id="homeProductivitySummary"></div>
        <div id="homeStats"></div>
      </div>
    </div>
  `,

  Planner: () => `
    ${renderSubTabs("Planner", ["Day", "Week", "Month", "Routines"], activePlannerSection)}
    ${activePlannerSection === "Day" ? `
      ${renderPlannerBlockSheet()}
      <div class="card">
        <h3>Templates</h3>
        <div class="template-grid">
          ${getPlannerTemplates().map(template => `<button class="secondary-btn" onclick="addPlannerTemplate('${template.id}')">${escapeHTML(template.name)}</button>`).join("")}
        </div>
      </div>
      <div class="card">
        <h3>Workload Analytics</h3>
        <div id="plannerAnalytics"></div>
      </div>
      <div class="card">
        <div class="planner-day-header">
          <div>
            <h3>${selectedPlannerDate === getTodayISO() ? "Today Timeline" : `Timeline for ${escapeHTML(selectedPlannerDate)}`}</h3>
            <p class="muted-text">Drag blocks to move them. Pull the bottom handle to resize.</p>
          </div>
          <button class="secondary-btn" onclick="goToPlannerToday(); activePlannerSection='Day'; main.innerHTML=getPageHTML('Planner'); renderPlanner();">Today</button>
        </div>
        <div id="timeBlocksList"></div>
      </div>
      <div class="card">
        <h3>Free Time</h3>
        <div id="freeTimeBox"></div>
      </div>
      <div class="card">
        <h3>Overlap Warnings</h3>
        <input id="bufferMinutesInput" type="number" min="0" max="120" placeholder="Default buffer minutes">
        <button onclick="saveBufferSetting()">Save Buffer Setting</button>
        <button onclick="addBuffersForToday()">Auto-add Buffer Time</button>
        <button onclick="moveUnfinishedToTomorrow()">Move unfinished to tomorrow</button>
        <div id="overlapWarnings"></div>
      </div>
      <div class="card">
        <h3>Productivity Summary</h3>
        <div id="productivitySummary"></div>
      </div>
      <button class="floating-add-btn" onclick="openTimeBlockModal()">+</button>
    ` : ""}
    ${activePlannerSection === "Week" ? `
      <div class="card">
        <h3>Weekly View</h3>
        <div id="weeklyView"></div>
      </div>
    ` : ""}
    ${activePlannerSection === "Month" ? `
      <div class="card">
        <h3>Monthly Planner</h3>
        <div id="monthlyPlannerView"></div>
      </div>
    ` : ""}
    ${activePlannerSection === "Routines" ? `
      <div class="card">
        <h3>Add Routine</h3>
        <input id="routineName" placeholder="Routine name">
        <select id="routineType">
          <option>Morning</option>
          <option>Night</option>
          <option>Custom</option>
        </select>
        <input id="routineStart" type="time">
        <input id="routineEnd" type="time">
        <div class="repeat-days">
          <label><input type="checkbox" name="routineDay" value="0" onchange="updateDayTimesSection()"> Sun</label>
          <label><input type="checkbox" name="routineDay" value="1" onchange="updateDayTimesSection()"> Mon</label>
          <label><input type="checkbox" name="routineDay" value="2" onchange="updateDayTimesSection()"> Tue</label>
          <label><input type="checkbox" name="routineDay" value="3" onchange="updateDayTimesSection()"> Wed</label>
          <label><input type="checkbox" name="routineDay" value="4" onchange="updateDayTimesSection()"> Thu</label>
          <label><input type="checkbox" name="routineDay" value="5" onchange="updateDayTimesSection()"> Fri</label>
          <label><input type="checkbox" name="routineDay" value="6" onchange="updateDayTimesSection()"> Sat</label>
        </div>
        <div id="dayTimesSection" style="display:none">
          <p><strong>Times by Day</strong></p>
          <div id="dayTimeRows"></div>
        </div>
        <textarea id="routineTasks" placeholder="Tasks/steps, one per line"></textarea>
        <textarea id="routineNotes" placeholder="Notes"></textarea>
        <label class="inline-check">
          <input type="checkbox" id="routineAutoAdd">
          Auto-add to planner daily
        </label>
        <button id="routineSaveButton" onclick="saveRoutine()">Save Routine</button>
        <button class="secondary-btn" onclick="resetRoutineForm()">Clear Routine Form</button>
        <button onclick="autoFillToday()">Auto-fill Today</button>
      </div>
      <div class="card">
        <h3>Saved Routines</h3>
        <div id="routinesList"></div>
      </div>
    ` : ""}
  `,

  Systems: () => `
    ${renderSubTabs("Systems", ["Dashboard", "Habits", "Logs", "Metrics", "Goals", "Insights"], activeSystemsSection)}
    ${renderSystemsSheet()}
    <div class="systems-hero card">
      <div>
        <p class="eyebrow">Systems</p>
        <h2>Life Analytics</h2>
        <p class="muted-text">Habits, logs, metrics, goals, and planner blocks now work together.</p>
      </div>
      <button onclick="openSystemsFormForSection()">+ Add</button>
    </div>
    ${activeSystemsSection === "Dashboard" ? `
      <div class="systems-dashboard-grid">
        <div class="card wide-card">
          <h3>Growth Dashboard</h3>
          <div id="systemsDashboard"></div>
        </div>
        <div class="card">
          <h3>Today Habits</h3>
          <div id="habitsList"></div>
        </div>
        <div class="card">
          <h3>Goal Forecasts</h3>
          <div id="goalsList"></div>
        </div>
      </div>
    ` : ""}
    ${activeSystemsSection === "Habits" ? `
      <div class="section-toolbar card">
        <div>
          <h3>Habits</h3>
          <p class="muted-text">Track streaks, completion rate, skips, and category consistency.</p>
        </div>
        <button onclick="openSystemsForm('habit')">Add Habit</button>
      </div>
      <div id="habitsList"></div>
    ` : ""}
    ${activeSystemsSection === "Logs" ? `
      <div class="section-toolbar card">
        <div>
          <h3>Logs</h3>
          <p class="muted-text">Numeric, time, boolean, counter, mood, and custom-unit logs with trends.</p>
        </div>
        <button onclick="openSystemsForm('log')">Add Log</button>
      </div>
      <div class="card">
        <div id="systemsLogsList"></div>
      </div>
    ` : ""}
    ${activeSystemsSection === "Metrics" ? `
      <div class="section-toolbar card">
        <div>
          <h3>Metrics</h3>
          <p class="muted-text">Track progress, rolling averages, pace, and recurring targets.</p>
        </div>
        <button onclick="openSystemsForm('metric')">Add Metric</button>
      </div>
      <div id="metricsList"></div>
    ` : ""}
    ${activeSystemsSection === "Goals" ? `
      <div class="section-toolbar card">
        <div>
          <h3>Goals</h3>
          <p class="muted-text">Milestones, deadlines, linked habits, planner suggestions, and projections.</p>
        </div>
        <button onclick="openSystemsForm('goal')">Add Goal</button>
      </div>
      <div id="goalsList"></div>
    ` : ""}
    ${activeSystemsSection === "Insights" ? `
      <div class="card">
        <h3>Smart Insights</h3>
        <div id="systemsDashboard"></div>
      </div>
    ` : ""}
    <button class="floating-add-btn systems-fab" onclick="openSystemsFormForSection()">+</button>
  `,

  Social: () => `
    ${renderSubTabs("Social", ["Friends", "Hangouts", "Ideas", "Insights"], activeSocialSection)}
    ${activeSocialSection === "Friends" ? `
      <div class="card collapsible-card">
        <button class="collapse-header" onclick="toggleFriendForm()">
          <span>Add Friend</span>
          <span>${friendFormOpen ? "^" : "v"}</span>
        </button>
        <div class="${friendFormOpen ? "" : "hidden"}">
          <input id="friendName" placeholder="Name">
          <select id="friendPriority">
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <input id="friendLastSeen" type="date">
          <textarea id="friendInterests" placeholder="Interests"></textarea>
          <textarea id="friendDetails" placeholder="Details"></textarea>
          <textarea id="friendFavoriteActivities" placeholder="Favorite activities"></textarea>
          <textarea id="friendContactNotes" placeholder="Contact notes"></textarea>
          <textarea id="friendNotes" placeholder="Notes"></textarea>
          <button id="friendSaveButton" onclick="saveFriend()">Save Friend</button>
          <button class="secondary-btn" onclick="resetFriendForm()">Clear Friend Form</button>
        </div>
      </div>
      <div class="card">
        <h3>Friend List</h3>
        <div class="list-controls">
          <input id="friendSearch" placeholder="Search friends" oninput="renderFriends()">
          <select id="friendPriorityFilter" onchange="renderFriends()">
            <option value="All">All priorities</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <select id="friendSort" onchange="renderFriends()">
            <option value="name">Sort by name</option>
            <option value="lastSeen">Sort by last seen</option>
            <option value="priority">Sort by priority</option>
          </select>
        </div>
        <div id="friendsList"></div>
      </div>
    ` : ""}
    ${activeSocialSection === "Hangouts" ? `
      <div class="card collapsible-card">
        <button class="collapse-header" onclick="toggleHangoutForm()">
          <span>Create Hangout</span>
          <span>${hangoutFormOpen ? "^" : "v"}</span>
        </button>
        <div class="${hangoutFormOpen ? "" : "hidden"}">
          <input id="hangoutActivity" placeholder="Activity">
          <input id="hangoutDate" type="date" onchange="renderHangoutFreeSlots()">
          <div id="hangoutFreeSlots"></div>
          <input id="hangoutTime" type="time">
          <input id="hangoutLocation" placeholder="Place/location">
          <input id="hangoutFriendSearch" placeholder="Search friends to pick" oninput="populateHangoutPeopleSelect()">
          <select id="hangoutPeopleSelect" multiple onchange="renderSelectedHangoutPeopleChips()"></select>
          <div id="selectedHangoutPeopleChips" class="chip-row"></div>
          <input id="hangoutCost" placeholder="Cost">
          <textarea id="hangoutNotes" placeholder="Notes"></textarea>
          <button id="hangoutSaveButton" onclick="saveHangout()">Save Hangout</button>
          <button class="secondary-btn" onclick="resetHangoutForm()">Clear Hangout Form</button>
        </div>
      </div>
      <div class="card">
        <h3>Hangout List</h3>
        <div class="list-controls">
          <input id="hangoutSearch" placeholder="Search hangouts" oninput="renderHangouts()">
          <select id="hangoutStatusFilter" onchange="renderHangouts()">
            <option value="All">All</option>
            <option value="Planned">Planned</option>
            <option value="Completed">Completed</option>
          </select>
          <select id="hangoutSort" onchange="renderHangouts()">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>
        <div id="hangoutsList"></div>
      </div>
    ` : ""}
    ${activeSocialSection === "Ideas" ? `
      <div class="card">
        <h3>Add Idea</h3>
        <input id="ideaTitle" placeholder="Idea">
        <select id="ideaCategory">
          <option>Cheap</option>
          <option>Active</option>
          <option>Chill</option>
          <option>Events</option>
        </select>
        <input id="ideaCost" placeholder="Cost">
        <textarea id="ideaNotes" placeholder="Notes"></textarea>
        <label class="inline-check"><input id="ideaFavorite" type="checkbox"> Favorite idea</label>
        <button id="ideaSaveButton" onclick="saveIdea()">Save Idea</button>
        <button class="secondary-btn" onclick="resetIdeaForm()">Clear Idea Form</button>
      </div>
      <div class="card">
        <h3>Saved Ideas</h3>
        <div id="ideasList"></div>
      </div>
    ` : ""}
    ${activeSocialSection === "Insights" ? `
      <div class="card">
        <h3>Who should I hang out with?</h3>
        <div id="friendSuggestions"></div>
      </div>
      <div class="card">
        <h3>People You're Neglecting</h3>
        <div id="neglectedFriends"></div>
      </div>
      <div class="card">
        <h3>Most Seen This Month</h3>
        <div id="mostSeenMonth"></div>
      </div>
      <div class="card">
        <h3>Social Balance</h3>
        <div id="socialBalance"></div>
      </div>
      <div class="card">
        <h3>Social Insights</h3>
        <div id="socialInsights"></div>
      </div>
    ` : ""}
  `,

  Settings: `
    <div class="card">
      <h3>Settings</h3>
      <button onclick="clearPlanner()">Clear Planner</button>
      <button onclick="clearSystems()">Clear Systems</button>
      <button onclick="clearSocial()">Clear Social</button>
    </div>
    <div class="card backup-restore-card">
      <h3>Backup + Restore</h3>
      <p class="settings-warning">Local data is saved per browser and per URL/port. Switching between localhost, Replit, Netlify, Codex preview, or different ports may show different data unless you import a backup.</p>
      <p class="muted-text">Backup includes plannerData, scheduleData, systemsData, and socialData. Offline localStorage stays enabled.</p>
      <button onclick="downloadFullBackup()">Download Backup JSON</button>
      <textarea id="allDataImportJson" placeholder="Paste Flow Planner backup JSON here to restore plannerData, scheduleData, systemsData, and socialData"></textarea>
      <button onclick="importAllData()">Restore From Backup</button>
    </div>
    <div class="card social-import-card">
      <h3>Social Data Import</h3>
      <p class="muted-text">Bring in friends, hangouts, and ideas from a backup file, pasted JSON, or browser localStorage.</p>
      <div class="import-mode-grid">
        <button onclick="showSocialImportMode('file')">Upload JSON file</button>
        <button class="secondary-btn" onclick="showSocialImportMode('paste')">Paste JSON manually</button>
        <button class="secondary-btn" onclick="previewSocialImportFromLocalStorage()">Import from browser localStorage</button>
      </div>
      <div id="socialImportFileMode" class="social-import-mode">
        <label class="file-upload-box">
          <span>Choose a JSON file</span>
          <input id="socialImportFile" type="file" accept="application/json,.json" onchange="handleSocialImportFile(event)">
        </label>
      </div>
      <div id="socialImportPasteMode" class="social-import-mode hidden">
        <textarea id="hangoutPlannerImportJson" placeholder="Paste social JSON here"></textarea>
        <button onclick="previewSocialImportFromTextarea()">Preview pasted JSON</button>
      </div>
      <div id="socialImportPreview" class="import-preview empty-state small">
        <p>No import preview yet.</p>
      </div>
      <div class="button-row">
        <button id="socialImportConfirmButton" onclick="confirmSocialImport()" disabled>Import Previewed Data</button>
        <button class="secondary-btn" onclick="exportCurrentSocialData()">Export Social Data</button>
      </div>
    </div>
  `
};

function getPageHTML(tab) {
  return typeof pages[tab] === "function" ? pages[tab]() : pages[tab];
}

function renderSubTabs(page, tabs, activeTab) {
  return `
    <div class="section-tabs">
      ${tabs.map(tab => `
        <button class="${tab === activeTab ? "active" : ""}" onclick="set${page}Section('${tab}')">${tab}</button>
      `).join("")}
    </div>
  `;
}

function setPlannerSection(section) {
  activePlannerSection = section;
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
}

function setSystemsSection(section) {
  activeSystemsSection = section;
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function setSocialSection(section) {
  activeSocialSection = section;
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function openPlannerSection(section) {
  setActiveBottomNav("Planner");
  setPlannerSection(section);
}

function openSystemsSection(section) {
  setActiveBottomNav("Systems");
  setSystemsSection(section);
}

function openSocialSection(section) {
  setActiveBottomNav("Social");
  setSocialSection(section);
}

// NAV
document.querySelectorAll(".bottom-nav button").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    setActiveBottomNav(tab);
    main.innerHTML = getPageHTML(tab);

    if (tab === "Home") renderHome();
    if (tab === "Planner") renderPlanner();
    if (tab === "Systems") renderSystems();
    if (tab === "Social") renderSocial();
  });
});

dailyAutoInsert();
main.innerHTML = getPageHTML("Home");
setActiveBottomNav("Home");
renderHome();

function setActiveBottomNav(tab) {
  document.querySelectorAll(".bottom-nav button").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
}

// ---------------- PLANNER ----------------

function renderPlanner() {
  fillBufferSetting();
  fillEditingTimeBlockForm();
  renderRoutines();
  renderTimeBlocks();
  renderFreeTime();
  renderOverlapWarnings();
  renderProductivitySummary("productivitySummary");
  renderPlannerAnalytics();
  renderWeeklyView();
  renderMonthlyPlannerView();
  fillEditingRoutineForm();
}

function renderPlannerBlockSheet() {
  return `
    <div id="blockModal" class="modal-backdrop hidden" onclick="closeTimeBlockModalFromBackdrop(event)">
      <div class="planner-sheet" role="dialog" aria-modal="true">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <h3 id="blockSheetTitle">${editingBlockIndex === null ? "Add Time Block" : "Edit Time Block"}</h3>
          <button class="icon-btn" onclick="closeTimeBlockModal()">x</button>
        </div>
        <input id="blockTitle" placeholder="Block title">
        <input id="blockDate" type="date">
        <div class="time-input-row">
          <input id="blockStart" type="time">
          <input id="blockEnd" type="time">
        </div>
        <select id="blockCategory">
          <option>School</option>
          <option>Work</option>
          <option>Gym</option>
          <option>Social</option>
          <option>Personal</option>
          <option>Errand</option>
        </select>
        <textarea id="blockNotes" placeholder="Notes"></textarea>
        <textarea id="blockTasks" placeholder="Tasks, one per line"></textarea>
        <button id="blockSaveButton" onclick="addTimeBlock()">${editingBlockIndex === null ? "Save Time Block" : "Update Time Block"}</button>
        <button class="secondary-btn" onclick="closeTimeBlockModal()">Cancel</button>
      </div>
    </div>
  `;
}

function addTimeBlock() {
  const title = document.getElementById("blockTitle")?.value.trim() || "";
  const date = document.getElementById("blockDate")?.value || selectedPlannerDate;
  const start = document.getElementById("blockStart")?.value || "";
  const end = document.getElementById("blockEnd")?.value || "";
  const category = document.getElementById("blockCategory")?.value || "Personal";
  const notes = document.getElementById("blockNotes")?.value.trim() || "";
  const tasks = (document.getElementById("blockTasks")?.value || "")
    .split("\n")
    .map(task => task.trim())
    .filter(Boolean)
    .map(text => ({ text, completed: false }));

  if (!title || !date || !start || !end) {
    alert("Add title, date, start, and end time.");
    return;
  }

  const existing = editingBlockIndex !== null ? scheduleData.blocks[editingBlockIndex] : null;
  const oldDate = existing ? existing.date : date;
  const previousTasks = existing ? existing.tasks : [];
  const block = {
    ...(existing || {}),
    id: existing ? existing.id : createId("block"),
    title,
    date,
    start,
    end,
    category,
    notes,
    type: existing ? existing.type || "task" : "task",
    completed: existing ? existing.completed : false,
    tasks: tasks.length ? mergeEditedTasks(tasks, previousTasks) : previousTasks
  };

  if (editingBlockIndex === null) {
    scheduleData.blocks.push(block);
  } else {
    scheduleData.blocks[editingBlockIndex] = block;
    editingBlockIndex = null;
  }

  selectedPlannerDate = date;
  visiblePlannerMonth = date.slice(0, 7);
  addBufferBlocksForDate(oldDate);
  addBufferBlocksForDate(date);
  saveScheduleData();
  activePlannerSection = "Day";
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
}

function mergeEditedTasks(newTasks, oldTasks) {
  return newTasks.map(task => {
    const oldTask = oldTasks.find(item => item.text === task.text);
    return oldTask ? { text: task.text, completed: oldTask.completed } : task;
  });
}

function editTimeBlock(index) {
  editingBlockIndex = index;
  selectedPlannerDate = scheduleData.blocks[index]?.date || selectedPlannerDate;
  activePlannerSection = "Day";
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
  openTimeBlockModal(index);
}

function fillEditingTimeBlockForm() {
  if (editingBlockIndex === null) {
    const dateInput = document.getElementById("blockDate");
    if (dateInput && !dateInput.value) dateInput.value = selectedPlannerDate;
    return;
  }
  const block = scheduleData.blocks[editingBlockIndex];
  if (!block || !document.getElementById("blockTitle")) return;
  document.getElementById("blockTitle").value = block.title || "";
  document.getElementById("blockDate").value = block.date || selectedPlannerDate;
  document.getElementById("blockStart").value = block.start || "";
  document.getElementById("blockEnd").value = block.end || "";
  document.getElementById("blockCategory").value = block.category || "Personal";
  document.getElementById("blockNotes").value = block.notes || "";
  document.getElementById("blockTasks").value = (block.tasks || []).map(task => task.text).join("\n");
  document.getElementById("blockSaveButton").textContent = "Update Time Block";
  const title = document.getElementById("blockSheetTitle");
  if (title) title.textContent = "Edit Time Block";
}

function resetTimeBlockForm() {
  editingBlockIndex = null;
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
}

function openTimeBlockModal(index = null) {
  editingBlockIndex = index;
  if (index !== null && scheduleData.blocks[index]) {
    selectedPlannerDate = scheduleData.blocks[index].date || selectedPlannerDate;
  }
  const modal = document.getElementById("blockModal");
  if (!modal) {
    main.innerHTML = getPageHTML("Planner");
    renderPlanner();
    return;
  }
  modal.classList.remove("hidden");
  fillEditingTimeBlockForm();
  const title = document.getElementById("blockSheetTitle");
  if (title) title.textContent = editingBlockIndex === null ? "Add Time Block" : "Edit Time Block";
  document.getElementById("blockTitle")?.focus();
}

function closeTimeBlockModal() {
  const modal = document.getElementById("blockModal");
  if (modal) modal.classList.add("hidden");
  editingBlockIndex = null;
}

function closeTimeBlockModalFromBackdrop(event) {
  if (event.target && event.target.id === "blockModal") closeTimeBlockModal();
}

function normalizeTask(task) {
  if (typeof task === "string") {
    return {
      text: task,
      completed: false
    };
  }

  return {
    text: task && task.text ? task.text : "",
    completed: Boolean(task && task.completed)
  };
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getTodayISO() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderTimeBlocks() {
  const box = document.getElementById("timeBlocksList");
  if (!box) return;
  const date = selectedPlannerDate;

  const blocks = scheduleData.blocks
    .map((block, index) => ({ block, index }))
    .filter(item => item.block.date === date)
    .sort((a, b) => a.block.start.localeCompare(b.block.start));
  const overlapIndexes = getOverlappingBlockIndexes(date);
  const currentTimeTop = getCurrentTimeIndicatorTop(date);
  const timelineStart = 6 * 60;
  const timelineEnd = 23 * 60;
  const pxPerMinute = 1;
  const timelineHeight = (timelineEnd - timelineStart) * pxPerMinute;

  box.innerHTML = blocks.length
    ? `
      <div class="visual-timeline" data-date="${date}" style="--timeline-height:${timelineHeight}px">
        <div class="timeline-hours">
          ${Array.from({ length: 18 }, (_, hourOffset) => {
            const hour = 6 + hourOffset;
            return `<div class="timeline-hour" style="top:${(hour * 60 - timelineStart) * pxPerMinute}px"><span>${formatHourLabel(hour)}</span></div>`;
          }).join("")}
        </div>
        ${currentTimeTop !== null ? `<div class="current-time-line" style="top:${currentTimeTop}px"><span>Now</span></div>` : ""}
        ${blocks.map(({ block, index }) => renderVisualTimeBlock(block, index, overlapIndexes.has(index), timelineStart, pxPerMinute)).join("")}
      </div>
    `
    : `<div class="empty-state"><p>No blocks for this day.</p><button onclick="focusTimeBlockForm()">Create time block</button></div>`;

  enableVisualBlockInteractions();
  enableTaskDragDrop();
}

function renderVisualTimeBlock(block, index, isOverlapping, timelineStart, pxPerMinute) {
  const startMinutes = timeToMinutes(block.start || "06:00");
  const endMinutes = timeToMinutes(block.end || block.start || "06:30");
  const top = Math.max((startMinutes - timelineStart) * pxPerMinute, 0);
  const height = Math.max((endMinutes - startMinutes) * pxPerMinute, 34);
  const categoryClass = getCategoryClass(block.category);

  return `
    <div class="timeline-block visual-block ${categoryClass} ${block.completed ? "completed-block" : ""} ${isOverlapping ? "overlap-block" : ""} block-type-${block.type || "task"}"
      draggable="true"
      data-index="${index}"
      style="top:${top}px;height:${height}px">
      <div class="visual-block-main" onclick="editTimeBlock(${index})">
        <div class="visual-block-title">
          <strong>${escapeHTML(block.title)}</strong>
          <span>${escapeHTML(block.start)}-${escapeHTML(block.end)}</span>
        </div>
        <div class="visual-block-meta">
          ${renderCategoryPill(block.category)}
          ${block.type && block.type !== "task" ? `<span class="block-tag block-tag-${block.type}">${block.type}</span>` : ""}
          ${isOverlapping ? `<span class="overlap-pill">Overlap</span>` : ""}
        </div>
        ${block.notes ? `<p>${escapeHTML(block.notes)}</p>` : ""}
      </div>
      <div class="visual-task-list" data-block-index="${index}">
        ${
          block.tasks.length
            ? block.tasks.map((task, taskIndex) => `
              <div class="task-row compact-task ${task.completed ? "task-done" : ""}" draggable="true" data-block-index="${index}" data-task-index="${taskIndex}">
                <label>
                  <input type="checkbox" ${task.completed ? "checked" : ""} onchange="toggleTaskComplete(${index}, ${taskIndex})">
                  ${escapeHTML(task.text)}
                </label>
                <button onclick="deleteTaskFromBlock(${index}, ${taskIndex})">x</button>
              </div>
            `).join("")
            : `<p class="muted-text">No tasks yet.</p>`
        }
      </div>
      <div class="visual-block-actions">
        <input id="taskInput${index}" placeholder="Add task">
        <button class="secondary-btn" onclick="addTaskToBlock(${index})">Add</button>
        <button class="secondary-btn" onclick="duplicateTimeBlock(${index})">Duplicate</button>
        <label class="block-complete">
          <input type="checkbox" ${block.completed ? "checked" : ""} onchange="toggleBlockComplete(${index})">
          Done
        </label>
        <button class="danger-btn" onclick="deleteTimeBlock(${index})">Delete</button>
      </div>
      ${block.isBuffer ? "" : `<div class="resize-handle" data-index="${index}" title="Drag to resize"></div>`}
    </div>
  `;
}

function focusTimeBlockForm() {
  activePlannerSection = "Day";
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
  document.getElementById("blockTitle")?.focus();
}

function addTaskToBlock(index) {
  const input = document.getElementById(`taskInput${index}`);
  const task = input.value;

  if (!task) return;

  scheduleData.blocks[index].tasks.push({
    text: task,
    completed: false
  });
  saveScheduleData();
  renderPlanner();
}

function toggleTaskComplete(blockIndex, taskIndex) {
  const task = scheduleData.blocks[blockIndex].tasks[taskIndex];
  task.completed = !task.completed;
  scheduleData.blocks[blockIndex].completed = scheduleData.blocks[blockIndex].tasks.length
    ? scheduleData.blocks[blockIndex].tasks.every(item => item.completed)
    : scheduleData.blocks[blockIndex].completed;
  saveScheduleData();
  renderPlanner();
}

function toggleBlockComplete(index) {
  const block = scheduleData.blocks[index];
  block.completed = !block.completed;
  block.tasks = block.tasks.map(task => ({
    ...task,
    completed: block.completed ? true : task.completed
  }));
  if (block.completed && block.systemHabitId) {
    completeHabitFromPlannerBlock(block);
  }
  saveScheduleData();
  renderPlanner();
}

function completeHabitFromPlannerBlock(block) {
  const habit = systemsData.habits.find(item => item.id === block.systemHabitId);
  if (!habit || habit.paused) return;
  const date = block.date || getTodayISO();
  if (!Array.isArray(habit.completions)) habit.completions = [];
  if (!habit.completions.includes(date)) habit.completions.push(date);
  habit.skippedDates = (habit.skippedDates || []).filter(item => item !== date);
  if (!Array.isArray(habit.completionHistory)) habit.completionHistory = [];
  if (!habit.completionHistory.some(entry => entry.date === date && entry.plannerBlockId === block.id)) {
    habit.completionHistory.push({
      date,
      time: block.end || new Date().toTimeString().slice(0, 5),
      plannerBlockId: block.id
    });
  }
  const alreadyLogged = systemsData.logs.some(log =>
    log.linkedHabitId === habit.id && log.linkedPlannerBlockId === block.id
  );
  if (!alreadyLogged) {
    systemsData.logs.push({
      id: createId("log"),
      title: habit.name,
      type: "Habit",
      valueType: "Boolean",
      value: "1",
      unit: "completion",
      date,
      notes: `Completed from Planner block: ${block.title}`,
      linkedHabitId: habit.id,
      linkedPlannerBlockId: block.id
    });
  }
  saveSystemsData();
}

function deleteTaskFromBlock(blockIndex, taskIndex) {
  scheduleData.blocks[blockIndex].tasks.splice(taskIndex, 1);
  scheduleData.blocks[blockIndex].completed = scheduleData.blocks[blockIndex].tasks.length
    ? scheduleData.blocks[blockIndex].tasks.every(task => task.completed)
    : false;
  saveScheduleData();
  renderPlanner();
}

function deleteTimeBlock(index) {
  const date = scheduleData.blocks[index].date;
  scheduleData.blocks.splice(index, 1);
  if (editingBlockIndex === index) editingBlockIndex = null;
  addBufferBlocksForDate(date);
  saveScheduleData();
  renderPlanner();
}

function duplicateTimeBlock(index) {
  const block = scheduleData.blocks[index];
  if (!block) return;
  const copy = {
    ...block,
    id: createId("block"),
    title: `${block.title} Copy`,
    completed: false,
    tasks: (block.tasks || []).map(task => ({ ...task, completed: false })),
    isBuffer: false
  };
  scheduleData.blocks.push(copy);
  addBufferBlocksForDate(copy.date);
  saveScheduleData();
  renderPlanner();
}

function renderFreeTime() {
  const box = document.getElementById("freeTimeBox");
  if (!box) return;
  const today = selectedPlannerDate;

  const blocks = scheduleData.blocks.filter(b => b.date === today && !b.isBuffer);

  let usedMinutes = 0;

  blocks.forEach(block => {
    usedMinutes += timeToMinutes(block.end) - timeToMinutes(block.start);
  });

  const dayMinutes = timeToMinutes("23:00") - timeToMinutes("06:00");
  const freeMinutes = Math.max(dayMinutes - usedMinutes, 0);

  box.innerHTML = `
    <p>Used time: ${Math.floor(usedMinutes / 60)}h ${usedMinutes % 60}m</p>
    <p>Free time: ${Math.floor(freeMinutes / 60)}h ${freeMinutes % 60}m</p>
  `;
}

function timeToMinutes(time) {
  const [h, m] = String(time || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const normalized = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  const h = String(Math.floor(normalized / 60)).padStart(2, "0");
  const m = String(normalized % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function formatHourLabel(hour) {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function getCategoryClass(category) {
  return `visual-category-${String(category || "Personal").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function getCurrentTimeIndicatorTop(date) {
  if (date !== getTodayISO()) return null;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = 6 * 60;
  const end = 23 * 60;
  if (minutes < start || minutes > end) return null;
  return minutes - start;
}

function getOverlappingBlockIndexes(date) {
  const indexes = new Set();
  const blocks = scheduleData.blocks
    .map((block, index) => ({ block, index }))
    .filter(item => item.block.date === date && !item.block.isBuffer && item.block.start && item.block.end)
    .sort((a, b) => a.block.start.localeCompare(b.block.start));

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (timeToMinutes(blocks[j].block.start) >= timeToMinutes(blocks[i].block.end)) break;
      if (blocksOverlap(blocks[i].block.start, blocks[i].block.end, blocks[j].block.start, blocks[j].block.end)) {
        indexes.add(blocks[i].index);
        indexes.add(blocks[j].index);
      }
    }
  }

  return indexes;
}

function enableBlockDragDrop() {
  const items = document.querySelectorAll(".draggable-plan");

  items.forEach(item => {
    item.addEventListener("dragstart", () => item.classList.add("dragging"));
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      saveNewBlockOrder();
    });
  });

  const box = document.getElementById("timeBlocksList");

  box.addEventListener("dragover", e => {
    e.preventDefault();
    const dragging = document.querySelector(".dragging");
    const afterElement = getDragAfterElement(box, e.clientY);

    if (!afterElement) box.appendChild(dragging);
    else box.insertBefore(dragging, afterElement);
  });
}

function enableVisualBlockInteractions() {
  const timeline = document.querySelector(".visual-timeline");
  if (!timeline) return;
  const blocks = timeline.querySelectorAll(".visual-block[draggable='true']");

  blocks.forEach(blockEl => {
    blockEl.addEventListener("dragstart", event => {
      if (event.target.classList.contains("compact-task") || event.target.closest(".resize-handle")) {
        event.preventDefault();
        return;
      }
      blockEl.classList.add("dragging");
      event.dataTransfer.setData("text/plain", blockEl.dataset.index);
    });

    blockEl.addEventListener("dragend", () => blockEl.classList.remove("dragging"));
  });

  timeline.addEventListener("dragover", event => event.preventDefault());
  timeline.addEventListener("drop", event => {
    const blockIndex = Number(event.dataTransfer.getData("text/plain"));
    if (!Number.isFinite(blockIndex) || !scheduleData.blocks[blockIndex]) return;
    const rect = timeline.getBoundingClientRect();
    const y = event.clientY - rect.top + timeline.scrollTop;
    moveBlockToTimelineY(blockIndex, y);
  });

  document.querySelectorAll(".resize-handle").forEach(handle => {
    handle.addEventListener("mousedown", event => {
      event.preventDefault();
      const index = Number(handle.dataset.index);
      startResizeBlock(index, event.clientY);
    });
  });
}

function moveBlockToTimelineY(blockIndex, y) {
  const block = scheduleData.blocks[blockIndex];
  const duration = Math.max(timeToMinutes(block.end) - timeToMinutes(block.start), 15);
  const start = snapMinutes(Math.max(6 * 60, Math.min(23 * 60 - duration, 6 * 60 + y)));
  block.start = minutesToTime(start);
  block.end = minutesToTime(start + duration);
  addBufferBlocksForDate(block.date);
  saveScheduleData();
  renderPlanner();
}

function startResizeBlock(blockIndex, startY) {
  const block = scheduleData.blocks[blockIndex];
  if (!block) return;
  const originalEnd = timeToMinutes(block.end);
  const onMove = event => {
    const delta = event.clientY - startY;
    const proposed = snapMinutes(originalEnd + delta);
    const minEnd = timeToMinutes(block.start) + 15;
    block.end = minutesToTime(Math.max(minEnd, Math.min(23 * 60, proposed)));
    saveScheduleData();
    renderTimeBlocks();
    renderFreeTime();
    renderOverlapWarnings();
    renderPlannerAnalytics();
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    addBufferBlocksForDate(block.date);
    saveScheduleData();
    renderPlanner();
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function snapMinutes(minutes, interval = 15) {
  return Math.round(minutes / interval) * interval;
}

function enableTaskDragDrop() {
  document.querySelectorAll(".compact-task").forEach(taskEl => {
    taskEl.addEventListener("dragstart", event => {
      event.stopPropagation();
      taskEl.classList.add("dragging-task");
      event.dataTransfer.setData("text/plain", JSON.stringify({
        blockIndex: Number(taskEl.dataset.blockIndex),
        taskIndex: Number(taskEl.dataset.taskIndex)
      }));
    });
    taskEl.addEventListener("dragend", () => taskEl.classList.remove("dragging-task"));
  });

  document.querySelectorAll(".visual-task-list").forEach(list => {
    list.addEventListener("dragover", event => event.preventDefault());
    list.addEventListener("drop", event => {
      event.preventDefault();
      event.stopPropagation();
      const payload = JSON.parse(event.dataTransfer.getData("text/plain") || "{}");
      const targetBlockIndex = Number(list.dataset.blockIndex);
      const targetTaskEl = event.target.closest(".compact-task");
      const targetTaskIndex = targetTaskEl ? Number(targetTaskEl.dataset.taskIndex) : scheduleData.blocks[targetBlockIndex].tasks.length;
      reorderTask(payload.blockIndex, payload.taskIndex, targetBlockIndex, targetTaskIndex);
    });
  });
}

function reorderTask(sourceBlockIndex, sourceTaskIndex, targetBlockIndex, targetTaskIndex) {
  const sourceBlock = scheduleData.blocks[sourceBlockIndex];
  const targetBlock = scheduleData.blocks[targetBlockIndex];
  if (!sourceBlock || !targetBlock || !sourceBlock.tasks[sourceTaskIndex]) return;
  const [task] = sourceBlock.tasks.splice(sourceTaskIndex, 1);
  const adjustedTarget = sourceBlockIndex === targetBlockIndex && targetTaskIndex > sourceTaskIndex
    ? targetTaskIndex - 1
    : targetTaskIndex;
  targetBlock.tasks.splice(adjustedTarget, 0, task);
  sourceBlock.completed = sourceBlock.tasks.length ? sourceBlock.tasks.every(item => item.completed) : false;
  targetBlock.completed = targetBlock.tasks.length ? targetBlock.tasks.every(item => item.completed) : false;
  saveScheduleData();
  renderPlanner();
}

function saveNewBlockOrder() {
  const items = document.querySelectorAll(".draggable-plan");
  const todayIndexes = scheduleData.blocks
    .map((block, index) => ({ block, index }))
    .filter(item => item.block.date === selectedPlannerDate)
    .map(item => item.index);

  const reorderedTodayBlocks = [...items].map(item => {
    const oldIndex = Number(item.dataset.index);
    return scheduleData.blocks[oldIndex];
  });

  todayIndexes.forEach((blockIndex, orderIndex) => {
    scheduleData.blocks[blockIndex] = reorderedTodayBlocks[orderIndex];
  });

  saveScheduleData();
}

function fillBufferSetting() {
  const input = document.getElementById("bufferMinutesInput");
  if (input) input.value = scheduleData.bufferMinutes;
}

function saveBufferSetting() {
  const input = document.getElementById("bufferMinutesInput");
  const value = Number(input.value);
  scheduleData.bufferMinutes = Number.isFinite(value) ? Math.max(0, value) : 15;
  scheduleData.blocks
    .map(block => block.date)
    .filter((date, index, dates) => date && dates.indexOf(date) === index)
    .forEach(addBufferBlocksForDate);
  saveScheduleData();
  renderPlanner();
}

function addBuffersForToday() {
  addBufferBlocksForDate(selectedPlannerDate);
  saveScheduleData();
  renderPlanner();
}

function addBufferBlocksForDate(date) {
  const bufferMinutes = scheduleData.bufferMinutes || 0;
  scheduleData.blocks = scheduleData.blocks.filter(block =>
    !(block.date === date && block.isBuffer)
  );

  if (!bufferMinutes) return;

  const blocks = scheduleData.blocks
    .filter(block => block.date === date && block.start && block.end)
    .sort((a, b) => a.start.localeCompare(b.start));

  const bufferBlocks = [];

  for (let i = 0; i < blocks.length - 1; i++) {
    const currentEnd = timeToMinutes(blocks[i].end);
    const nextStart = timeToMinutes(blocks[i + 1].start);
    const gap = nextStart - currentEnd;

    if (gap <= 0) continue;

    const bufferLength = Math.min(bufferMinutes, gap);
    bufferBlocks.push({
      id: createId("buffer"),
      title: "Buffer",
      date,
      start: minutesToTime(currentEnd),
      end: minutesToTime(currentEnd + bufferLength),
      category: "Buffer",
      notes: `${bufferLength} minute buffer`,
      completed: true,
      tasks: [],
      isBuffer: true
    });
  }

  scheduleData.blocks.push(...bufferBlocks);
}

function renderOverlapWarnings() {
  const box = document.getElementById("overlapWarnings");
  if (!box) return;

  const warnings = getOverlapWarnings(selectedPlannerDate);

  box.innerHTML = warnings.length
    ? warnings.map(warning => `<p class="warning">${escapeHTML(warning)}</p>`).join("")
    : "<p>No overlap warnings for today.</p>";
}

function getOverlapWarnings(date) {
  const warnings = [];
  const blocks = scheduleData.blocks
    .filter(block => block.date === date && !block.isBuffer && block.start && block.end)
    .sort((a, b) => a.start.localeCompare(b.start));

  for (let i = 0; i < blocks.length - 1; i++) {
    const current = blocks[i];
    const next = blocks[i + 1];
    const currentEnd = timeToMinutes(current.end);
    const nextStart = timeToMinutes(next.start);
    const gap = nextStart - currentEnd;

    if (gap < 0) {
      warnings.push(`${current.title} overlaps ${next.title}.`);
    } else if (scheduleData.bufferMinutes && gap < scheduleData.bufferMinutes) {
      warnings.push(`${current.title} has less than ${scheduleData.bufferMinutes} minutes before ${next.title}.`);
    }
  }

  return warnings;
}

function getSelectedRoutineDays() {
  return [...document.querySelectorAll("input[name='routineDay']:checked")]
    .map(input => Number(input.value));
}

function saveRoutine() {
  const name = document.getElementById("routineName").value.trim();
  const type = document.getElementById("routineType").value;
  const start = document.getElementById("routineStart").value;
  const end = document.getElementById("routineEnd").value;
  const repeatDays = getSelectedRoutineDays();
  const tasks = document.getElementById("routineTasks").value
    .split("\n")
    .map(task => task.trim())
    .filter(Boolean);
  const notes = document.getElementById("routineNotes").value.trim();

  if (!name || !start || !end || !repeatDays.length) {
    alert("Add a routine name, start time, end time, and at least one repeat day.");
    return;
  }

  const dayTimes = {};
  repeatDays.forEach(dayIndex => {
    const startEl = document.getElementById(`dayStart_${dayIndex}`);
    const endEl = document.getElementById(`dayEnd_${dayIndex}`);
    dayTimes[dayIndex] = {
      start: startEl ? startEl.value || start : start,
      end: endEl ? endEl.value || end : end
    };
  });

  const autoAdd = document.getElementById("routineAutoAdd")?.checked || false;
  const existing = editingRoutineIndex !== null ? scheduleData.routines[editingRoutineIndex] : null;

  const routine = {
    id: existing ? existing.id : createId("routine"),
    name,
    type,
    start,
    end,
    repeatDays,
    dayTimes,
    tasks,
    notes,
    autoAdd,
    completions: existing ? (existing.completions || {}) : {},
    completedDates: existing ? (existing.completedDates || []) : [],
    streak: existing ? (existing.streak || 0) : 0
  };

  if (editingRoutineIndex === null) {
    scheduleData.routines.push(routine);
  } else {
    scheduleData.routines[editingRoutineIndex] = routine;
  }

  editingRoutineIndex = null;
  autoInsertRoutineBlocks(routine);
  saveScheduleData();
  activePlannerSection = "Routines";
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
}

function autoInsertRoutineBlocks(routine) {
  const today = getTodayISO();
  for (let offset = 0; offset < 7; offset++) {
    const date = getDateOffset(today, offset);
    const dayIndex = new Date(date + "T00:00:00").getDay();
    if (!routine.repeatDays.includes(dayIndex)) continue;
    const alreadyAdded = scheduleData.blocks.some(b =>
      b.date === date && b.routineId === routine.id
    );
    if (alreadyAdded) continue;
    const times = getRoutineTimeForDay(routine, dayIndex);
    scheduleData.blocks.push({
      id: createId("block"),
      routineId: routine.id,
      title: routine.name,
      date,
      start: times.start,
      end: times.end,
      category: routine.type,
      notes: routine.notes || "",
      type: "routine",
      completed: false,
      tasks: routine.tasks.map(task => ({ text: task, completed: false }))
    });
  }
}

function renderRoutines() {
  const box = document.getElementById("routinesList");
  if (!box) return;

  const today = getTodayISO();

  box.innerHTML = scheduleData.routines.length
    ? scheduleData.routines.map((routine, index) => {
        const todayCompletions = routine.completions[today] || {};
        const stepsTotal = routine.tasks.length;
        const stepsCompleted = routine.tasks.filter((_, ti) => todayCompletions[ti]).length;
        const isCompletedToday = routine.completedDates.includes(today);
        const streak = routine.streak || 0;

        return `
          <div class="routine-item ${isCompletedToday ? "routine-done" : ""}">
            <div class="item-title">
              <strong>${escapeHTML(routine.name)}</strong>
              <span class="streak-badge">🔥 ${streak} day${streak === 1 ? "" : "s"}</span>
            </div>
            <p>${escapeHTML(routine.type)} • ${escapeHTML(routine.start)}–${escapeHTML(routine.end)}</p>
            <p>${routine.repeatDays.map(getDayName).join(", ")}</p>
            ${routine.autoAdd ? `<span class="auto-add-badge">Auto-add on</span>` : ""}
            ${stepsTotal ? `
              <div class="routine-steps">
                <p class="steps-label"><strong>Today's steps</strong> <span class="muted-text">${stepsCompleted}/${stepsTotal}</span></p>
                ${routine.tasks.map((task, ti) => `
                  <label class="routine-step ${todayCompletions[ti] ? "step-done" : ""}">
                    <input type="checkbox" ${todayCompletions[ti] ? "checked" : ""} onchange="toggleRoutineStep(${index}, ${ti})">
                    ${escapeHTML(task)}
                  </label>
                `).join("")}
              </div>
            ` : "<p>No tasks added.</p>"}
            ${routine.notes ? `<p>${escapeHTML(routine.notes)}</p>` : ""}
            <div class="button-row">
              ${isCompletedToday
                ? `<span class="done-label">✓ Completed today</span>`
                : `<button onclick="completeRoutineDay(${index})">Mark Complete</button>`}
              <button onclick="editRoutine(${index})">Edit</button>
              <button class="danger-btn" onclick="deleteRoutine(${index})">Delete</button>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="empty-state"><p>No routines saved yet.</p><button onclick="openPlannerSection('Routines')">Add first routine</button></div>`;
}

function toggleRoutineStep(routineIndex, stepIndex) {
  const routine = scheduleData.routines[routineIndex];
  if (!routine) return;
  const today = getTodayISO();
  if (!routine.completions) routine.completions = {};
  if (!routine.completions[today]) routine.completions[today] = {};
  routine.completions[today][stepIndex] = !routine.completions[today][stepIndex];
  const allDone = routine.tasks.length > 0 &&
    routine.tasks.every((_, ti) => routine.completions[today][ti]);
  if (allDone) {
    completeRoutineDay(routineIndex, true);
  } else {
    saveScheduleData();
    renderRoutines();
  }
}

function completeRoutineDay(routineIndex, silent) {
  const routine = scheduleData.routines[routineIndex];
  if (!routine) return;
  const today = getTodayISO();
  if (!routine.completedDates) routine.completedDates = [];
  if (!routine.completedDates.includes(today)) {
    routine.completedDates.push(today);
  }
  routine.streak = getRoutineCompletionStreak(routine);
  saveScheduleData();
  renderRoutines();
  if (!silent) {
    alert(`"${routine.name}" marked complete! Streak: ${routine.streak} day${routine.streak === 1 ? "" : "s"} 🔥`);
  }
}

function getRoutineCompletionStreak(routine) {
  if (!routine.completedDates || !routine.completedDates.length) return 0;
  const today = getTodayISO();
  let streak = 0;
  let check = today;
  while (routine.completedDates.includes(check)) {
    streak++;
    check = getDateOffset(check, -1);
  }
  return streak;
}

function dailyAutoInsert() {
  const today = getTodayISO();
  const todayDay = new Date().getDay();
  let inserted = false;
  scheduleData.routines.forEach(routine => {
    if (!routine.autoAdd) return;
    if (!routine.repeatDays.includes(todayDay)) return;
    const alreadyAdded = scheduleData.blocks.some(b =>
      b.date === today && b.routineId === routine.id
    );
    if (alreadyAdded) return;
    const times = getRoutineTimeForDay(routine, todayDay);
    scheduleData.blocks.push({
      id: createId("block"),
      routineId: routine.id,
      title: routine.name,
      date: today,
      start: times.start,
      end: times.end,
      category: routine.type,
      notes: routine.notes || "",
      type: "routine",
      completed: false,
      tasks: routine.tasks.map(task => ({ text: task, completed: false }))
    });
    inserted = true;
  });
  if (inserted) {
    addBufferBlocksForDate(today);
    saveScheduleData();
  }
}

function editRoutine(index) {
  editingRoutineIndex = index;
  activePlannerSection = "Routines";
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
}

function fillEditingRoutineForm() {
  if (editingRoutineIndex === null) return;
  if (!document.getElementById("routineName")) return;
  const routine = scheduleData.routines[editingRoutineIndex];
  if (!routine) return;

  document.getElementById("routineName").value = routine.name;
  document.getElementById("routineType").value = routine.type;
  document.getElementById("routineStart").value = routine.start;
  document.getElementById("routineEnd").value = routine.end;
  document.getElementById("routineTasks").value = routine.tasks.join("\n");
  document.getElementById("routineNotes").value = routine.notes || "";
  const autoAddEl = document.getElementById("routineAutoAdd");
  if (autoAddEl) autoAddEl.checked = routine.autoAdd || false;
  document.querySelectorAll("input[name='routineDay']").forEach(input => {
    input.checked = routine.repeatDays.includes(Number(input.value));
  });
  document.getElementById("routineSaveButton").textContent = "Update Routine";

  updateDayTimesSection();

  routine.repeatDays.forEach(dayIndex => {
    const times = getRoutineTimeForDay(routine, dayIndex);
    const startEl = document.getElementById(`dayStart_${dayIndex}`);
    const endEl = document.getElementById(`dayEnd_${dayIndex}`);
    if (startEl) startEl.value = times.start;
    if (endEl) endEl.value = times.end;
  });
}

function resetRoutineForm() {
  editingRoutineIndex = null;
  activePlannerSection = "Routines";
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
}

function deleteRoutine(index) {
  if (!confirm("Delete this routine?")) return;
  scheduleData.routines.splice(index, 1);
  if (editingRoutineIndex === index) editingRoutineIndex = null;
  saveScheduleData();
  renderPlanner();
}

function getRoutineTimeForDay(routine, dayIndex) {
  return (routine.dayTimes && routine.dayTimes[dayIndex])
    ? routine.dayTimes[dayIndex]
    : { start: routine.start, end: routine.end };
}

function updateDayTimesSection() {
  const section = document.getElementById("dayTimesSection");
  const rowsBox = document.getElementById("dayTimeRows");
  if (!section || !rowsBox) return;

  const checkedInputs = [...document.querySelectorAll("input[name='routineDay']:checked")];
  const defaultStart = document.getElementById("routineStart") ? document.getElementById("routineStart").value : "";
  const defaultEnd = document.getElementById("routineEnd") ? document.getElementById("routineEnd").value : "";
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  if (!checkedInputs.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "";

  const existingValues = {};
  [0, 1, 2, 3, 4, 5, 6].forEach(i => {
    const s = document.getElementById(`dayStart_${i}`);
    const e = document.getElementById(`dayEnd_${i}`);
    if (s) existingValues[i] = { start: s.value, end: e ? e.value : "" };
  });

  rowsBox.innerHTML = checkedInputs
    .sort((a, b) => Number(a.value) - Number(b.value))
    .map(input => {
      const d = Number(input.value);
      const prev = existingValues[d];
      const s = prev ? prev.start : defaultStart;
      const e = prev ? prev.end : defaultEnd;
      return `
        <div class="day-time-row">
          <span class="day-time-label">${dayNames[d]}</span>
          <input type="time" id="dayStart_${d}" value="${s}">
          <input type="time" id="dayEnd_${d}" value="${e}">
        </div>
      `;
    }).join("");
}

function autoFillToday() {
  const today = getTodayISO();
  const todayDay = new Date().getDay();
  const matchingRoutines = scheduleData.routines.filter(routine =>
    routine.repeatDays.includes(todayDay)
  );

  if (!matchingRoutines.length) {
    alert("No routines match today.");
    return;
  }

  let addedCount = 0;

  matchingRoutines.forEach(routine => {
    const alreadyAdded = scheduleData.blocks.some(block =>
      block.date === today && block.routineId === routine.id
    );

    if (alreadyAdded) return;

    const times = getRoutineTimeForDay(routine, todayDay);

    scheduleData.blocks.push({
      id: createId("block"),
      routineId: routine.id,
      title: routine.name,
      date: today,
      start: times.start,
      end: times.end,
      category: routine.type,
      notes: routine.notes || "",
      type: "routine",
      completed: false,
      tasks: routine.tasks.map(task => ({
        text: task,
        completed: false
      }))
    });

    addedCount++;
  });

  addBufferBlocksForDate(today);
  saveScheduleData();
  renderPlanner();
  alert(addedCount ? `Added ${addedCount} routine block${addedCount === 1 ? "" : "s"} for today.` : "Today's matching routines are already in your schedule.");
}

function getWeekDates() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return {
      iso: `${year}-${month}-${day}`,
      label: getDayName(index),
      dayNumber: date.getDate()
    };
  });
}

function renderWeeklyView() {
  const box = document.getElementById("weeklyView");
  if (!box) return;

  const weekDates = getWeekDates();
  const weekStats = weekDates.map(day => ({ ...day, stats: getDayWorkload(day.iso) }));
  const busiestMinutes = Math.max(...weekStats.map(day => day.stats.totalMinutes), 0);

  box.innerHTML = `
    <div class="weekly-balance">
      ${weekStats.map(day => {
        const pct = busiestMinutes ? Math.round((day.stats.totalMinutes / busiestMinutes) * 100) : 0;
        return `
          <div class="balance-row compact">
            <span class="balance-name">${day.label}</span>
            <div class="balance-bar-bg"><div class="balance-bar-fill" style="width:${pct}%"></div></div>
            <span class="balance-count">${formatMinutes(day.stats.totalMinutes)}</span>
          </div>
        `;
      }).join("")}
    </div>
    <div class="week-grid">
      ${weekStats.map(day => {
        const dayBlocks = scheduleData.blocks
          .map((block, index) => ({ block, index }))
          .filter(item => item.block.date === day.iso)
          .sort((a, b) => a.block.start.localeCompare(b.block.start));
        const stats = day.stats;
        const overloaded = isOverloadedDay(stats);

        return `
          <div class="week-day ${overloaded ? "overloaded-day" : ""}">
            <strong>${day.label} ${day.dayNumber}</strong>
            <div class="workload">
              <span>${stats.totalBlocks} blocks</span>
              <span>${formatMinutes(stats.totalMinutes)}</span>
              <span>${stats.unfinishedTasks} unfinished</span>
            </div>
            ${overloaded ? `<p class="warning compact-warning">Overloaded day</p>` : ""}
            ${dayBlocks.length ? dayBlocks.map(({ block, index }) => renderWeeklyBlock(block, index, weekDates)).join("") : `<div class="empty-state small"><p>No blocks.</p><button onclick="selectPlannerDate('${day.iso}')">Create time block</button></div>`}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderWeeklyBlock(block, index, weekDates) {
  return `
    <div class="week-block ${block.isBuffer ? "buffer-block" : ""} ${getCategoryClass(block.category)} ${block.completed ? "completed-block" : ""} block-type-${block.type || "task"}">
      <strong>${escapeHTML(block.start)} ${escapeHTML(block.title)}</strong>
      ${block.type && block.type !== "task" ? `<span class="block-tag block-tag-${block.type}">${block.type}</span>` : ""}
      <small>${escapeHTML(block.end)} • ${escapeHTML(block.category)}</small>
      <select onchange="moveBlockToDate(${index}, this.value)">
        ${weekDates.map(day => `<option value="${day.iso}" ${block.date === day.iso ? "selected" : ""}>Move to ${day.label}</option>`).join("")}
      </select>
      ${block.isBuffer ? "" : `<button class="secondary-btn" onclick="duplicateTimeBlock(${index})">Duplicate block</button>`}
      ${block.isBuffer ? "" : `<button class="secondary-btn" onclick="editTimeBlock(${index})">Quick edit</button>`}
      ${
        block.tasks.length
          ? block.tasks.map((task, taskIndex) => `
            <div class="week-task ${task.completed ? "task-done" : ""}">
              <span>${escapeHTML(task.text)}</span>
              <select onchange="moveTaskToDate(${index}, ${taskIndex}, this.value)">
                ${weekDates.map(day => `<option value="${day.iso}" ${block.date === day.iso ? "selected" : ""}>${day.label}</option>`).join("")}
              </select>
            </div>
          `).join("")
          : ""
      }
    </div>
  `;
}

function isOverloadedDay(stats) {
  return stats.totalMinutes >= 8 * 60 || stats.totalBlocks >= 7 || stats.unfinishedTasks >= 8;
}

function moveBlockToDate(index, date) {
  const oldDate = scheduleData.blocks[index].date;
  scheduleData.blocks[index].date = date;
  addBufferBlocksForDate(oldDate);
  addBufferBlocksForDate(date);
  saveScheduleData();
  renderPlanner();
}

function moveTaskToDate(blockIndex, taskIndex, date) {
  const sourceBlock = scheduleData.blocks[blockIndex];
  const oldDate = sourceBlock.date;
  const task = sourceBlock.tasks.splice(taskIndex, 1)[0];
  const targetBlock = findOrCreateMovedTasksBlock(date);

  targetBlock.tasks.push(task);
  sourceBlock.completed = sourceBlock.tasks.length
    ? sourceBlock.tasks.every(item => item.completed)
    : false;

  addBufferBlocksForDate(oldDate);
  addBufferBlocksForDate(date);
  saveScheduleData();
  renderPlanner();
}

function findOrCreateMovedTasksBlock(date) {
  let block = scheduleData.blocks.find(item =>
    item.date === date && item.title === "Moved Tasks" && item.category === "Personal"
  );

  if (!block) {
    block = {
      id: createId("block"),
      title: "Moved Tasks",
      date,
      start: "09:00",
      end: "09:30",
      category: "Personal",
      notes: "Tasks moved from another day",
      completed: false,
      tasks: []
    };
    scheduleData.blocks.push(block);
  }

  return block;
}

function getDayWorkload(date) {
  const blocks = scheduleData.blocks.filter(block => block.date === date && !block.isBuffer);
  const totalMinutes = blocks.reduce((sum, block) =>
    sum + Math.max(timeToMinutes(block.end) - timeToMinutes(block.start), 0), 0);
  const unfinishedTasks = blocks.reduce((sum, block) =>
    sum + block.tasks.filter(task => !task.completed).length, 0);

  return {
    totalBlocks: blocks.length,
    totalMinutes,
    unfinishedTasks
  };
}

function getPlannerAnalytics(date) {
  const blocks = scheduleData.blocks
    .filter(block => block.date === date && !block.isBuffer)
    .sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const totalMinutes = blocks.reduce((sum, block) =>
    sum + Math.max(timeToMinutes(block.end) - timeToMinutes(block.start), 0), 0);
  const freeSlots = getFreeSlots(date, 15);
  const freeMinutes = freeSlots.reduce((sum, slot) =>
    sum + Math.max(timeToMinutes(slot.end) - timeToMinutes(slot.start), 0), 0);
  const focusMinutes = blocks
    .filter(block => ["School", "Work", "Personal"].includes(block.category || ""))
    .reduce((sum, block) => sum + Math.max(timeToMinutes(block.end) - timeToMinutes(block.start), 0), 0);
  const overlapCount = getOverlappingBlockIndexes(date).size;

  return {
    totalMinutes,
    freeMinutes,
    focusMinutes,
    overlapCount,
    blocks,
    freeSlots
  };
}

function renderPlannerAnalytics() {
  const box = document.getElementById("plannerAnalytics");
  if (!box) return;
  const stats = getPlannerAnalytics(selectedPlannerDate);

  box.innerHTML = `
    <div class="summary-grid planner-summary-grid">
      <div><strong>${formatMinutes(stats.totalMinutes)}</strong><span>Total planned</span></div>
      <div><strong>${formatMinutes(stats.freeMinutes)}</strong><span>Free time gaps</span></div>
      <div><strong>${formatMinutes(stats.focusMinutes)}</strong><span>Focus time</span></div>
      <div><strong>${stats.overlapCount}</strong><span>Overlaps</span></div>
    </div>
    ${stats.freeSlots.length ? `
      <div class="free-slots-row">
        ${stats.freeSlots.slice(0, 5).map(slot => `<button class="slot-chip" onclick="prefillBlockTime('${slot.start}', '${slot.end}')">${slot.start}-${slot.end}</button>`).join("")}
      </div>
    ` : `<p class="muted-text">No open free-time gaps in the 6 AM to 11 PM planning window.</p>`}
  `;
}

function prefillBlockTime(start, end) {
  openTimeBlockModal();
  const startInput = document.getElementById("blockStart");
  const endInput = document.getElementById("blockEnd");
  const dateInput = document.getElementById("blockDate");
  if (dateInput) dateInput.value = selectedPlannerDate;
  if (startInput) startInput.value = start;
  if (endInput) endInput.value = end;
}

function renderMonthlyPlannerView() {
  const box = document.getElementById("monthlyPlannerView");
  if (!box) return;
  const [year, month] = visiblePlannerMonth.split("-").map(Number);
  const monthDates = getMonthDates(year, month - 1);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });

  box.innerHTML = `
    <div class="planner-month-header">
      <button class="secondary-btn" onclick="changePlannerMonth(-1)">Prev</button>
      <strong>${escapeHTML(monthLabel)}</strong>
      <button class="secondary-btn" onclick="changePlannerMonth(1)">Next</button>
    </div>
    <button class="secondary-btn" onclick="goToPlannerToday()">Today</button>
    <div class="planner-month-weekdays">
      ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => `<span>${day}</span>`).join("")}
    </div>
    <div class="planner-month-grid">
      ${monthDates.map(day => {
        const blocks = getBlocksForDate(day.iso).filter(block => !block.isBuffer);
        return `
          <button class="planner-month-day ${day.inMonth ? "" : "muted-month"} ${day.iso === selectedPlannerDate ? "selected" : ""} ${day.iso === getTodayISO() ? "today" : ""}" onclick="selectPlannerDate('${day.iso}')">
            <span>${day.day}</span>
            ${blocks.slice(0, 3).map(block => `<small>${escapeHTML(block.start || "")} ${escapeHTML(block.title || "")}</small>`).join("")}
            ${blocks.length > 3 ? `<em>+${blocks.length - 3} more</em>` : ""}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function getMonthDates(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const iso = toLocalISO(date);
    return {
      iso,
      day: date.getDate(),
      inMonth: date.getMonth() === monthIndex
    };
  });
}

function toLocalISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function selectPlannerDate(date) {
  selectedPlannerDate = date;
  visiblePlannerMonth = date.slice(0, 7);
  activePlannerSection = "Day";
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
}

function changePlannerMonth(offset) {
  const [year, month] = visiblePlannerMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  visiblePlannerMonth = toLocalISO(date).slice(0, 7);
  renderMonthlyPlannerView();
}

function goToPlannerToday() {
  selectedPlannerDate = getTodayISO();
  visiblePlannerMonth = selectedPlannerDate.slice(0, 7);
  renderMonthlyPlannerView();
}

function getBlocksForDate(date) {
  return scheduleData.blocks
    .filter(block => block.date === date)
    .sort((a, b) => (a.start || "").localeCompare(b.start || ""));
}

function getPlannerTemplates() {
  return [
    { id: "morning", name: "Morning routine", title: "Morning Routine", start: "07:00", end: "08:00", category: "Personal", tasks: ["Wake up", "Get ready", "Review priorities"] },
    { id: "night", name: "Night routine", title: "Night Routine", start: "21:30", end: "22:30", category: "Personal", tasks: ["Reset space", "Plan tomorrow", "Wind down"] },
    { id: "work", name: "Work shift", title: "Work Shift", start: "09:00", end: "17:00", category: "Work", tasks: ["Clock in", "Main work", "Wrap up"] },
    { id: "gym", name: "Gym", title: "Gym", start: "17:30", end: "18:30", category: "Gym", tasks: ["Warm up", "Workout", "Cool down"] },
    { id: "study", name: "Study block", title: "Study Block", start: "18:00", end: "19:30", category: "School", tasks: ["Review notes", "Practice", "Summarize"] },
    { id: "hangout", name: "Hangout", title: "Hangout", start: "19:00", end: "21:00", category: "Social", tasks: ["Confirm plans", "Meet up", "Follow up"] }
  ];
}

function addPlannerTemplate(templateId) {
  const template = getPlannerTemplates().find(item => item.id === templateId);
  if (!template) return;
  scheduleData.blocks.push({
    id: createId("block"),
    title: template.title,
    date: selectedPlannerDate,
    start: template.start,
    end: template.end,
    category: template.category,
    notes: "Created from template",
    type: template.id === "hangout" ? "social" : "task",
    completed: false,
    tasks: template.tasks.map(text => ({ text, completed: false }))
  });
  addBufferBlocksForDate(selectedPlannerDate);
  saveScheduleData();
  renderPlanner();
}

function moveUnfinishedToTomorrow() {
  const today = selectedPlannerDate;
  const tomorrow = getDateOffset(today, 1);
  let movedCount = 0;
  const targetBlock = findOrCreateMovedTasksBlock(tomorrow);

  scheduleData.blocks
    .filter(block => block.date === today && !block.isBuffer)
    .forEach(block => {
      const unfinished = block.tasks.filter(task => !task.completed);
      if (!unfinished.length) return;

      targetBlock.tasks.push(...unfinished.map(task => ({
        ...task,
        completed: false
      })));
      block.tasks = block.tasks.filter(task => task.completed);
      block.completed = block.tasks.length ? block.tasks.every(task => task.completed) : false;
      movedCount += unfinished.length;
    });

  addBufferBlocksForDate(tomorrow);
  saveScheduleData();
  renderPlanner();
  alert(movedCount ? `Moved ${movedCount} unfinished task${movedCount === 1 ? "" : "s"} to tomorrow.` : "No unfinished tasks to move.");
}

function getDateOffset(isoDate, offsetDays) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offsetDays);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function renderHome() {
  renderTodayFocus();
  renderHomeNextAction();
  renderHomeSnapshot();
  renderProductivitySummary("homeProductivitySummary");
  renderHomeTimeline();
  renderHomeSystemsHabits();
  renderHomeGoalProgress();
  renderHomeSocialReminder();
  renderHomeSuggestions();
  renderHomeStats();
}

function renderTodayFocus() {
  const box = document.getElementById("todayFocus");
  if (!box) return;
  const focus = getTodayFocus();
  box.innerHTML = `
    <div class="today-focus-grid">
      <button onclick="${focus.nextBlockAction}"><span>Current/next block</span><strong>${escapeHTML(focus.nextBlock)}</strong></button>
      <button onclick="openPlannerSection('Day')"><span>Top unfinished task</span><strong>${escapeHTML(focus.topTask)}</strong></button>
      <button onclick="openSystemsSection('Habits')"><span>Habit left</span><strong>${escapeHTML(focus.habitLeft)}</strong></button>
      <button onclick="openSystemsSection('Metrics')"><span>Goal preview</span><strong>${escapeHTML(focus.goalPreview)}</strong></button>
      <button onclick="openSocialSection('Friends')"><span>Social reminder</span><strong>${escapeHTML(focus.socialSuggestion)}</strong></button>
    </div>
  `;
}

function getTodayFocus() {
  const today = getTodayISO();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentBlock = scheduleData.blocks
    .filter(block => block.date === today && !block.isBuffer)
    .find(block => timeToMinutes(block.start || "00:00") <= nowMinutes && timeToMinutes(block.end || "00:00") > nowMinutes);
  const nextBlock = scheduleData.blocks
    .filter(block => block.date === today && !block.isBuffer && timeToMinutes(block.start || "00:00") >= nowMinutes)
    .sort((a, b) => (a.start || "").localeCompare(b.start || ""))[0];
  const currentOrNextBlock = currentBlock || nextBlock;
  const topTask = scheduleData.blocks
    .filter(block => block.date === today && !block.isBuffer)
    .flatMap(block => block.tasks.map(task => ({ task, block })))
    .find(item => !item.task.completed);
  const nextFree = getFreeSlots(today, 30).find(slot => timeToMinutes(slot.end) >= nowMinutes) || getFreeSlots(today, 30)[0];
  const habitLeft = systemsData.habits.find(habit => !habit.completions.includes(today));
  const goal = getTopGoalPreview();
  const social = getSocialReminder();
  const nextAction = getHomeNextAction({
    currentBlock,
    nextBlock,
    topTask,
    habitLeft,
    goal,
    social,
    nextFree
  });

  return {
    nextAction,
    currentBlock,
    nextPlannerBlock: nextBlock,
    topTask,
    habitLeft,
    goal,
    social,
    nextBlock: currentOrNextBlock ? `${currentOrNextBlock.start} ${currentOrNextBlock.title}` : "No planner block",
    nextBlockAction: currentOrNextBlock ? "openPlannerSection('Day')" : "openPlannerSection('Day')",
    topTask: topTask ? `${topTask.task.text}` : "No unfinished tasks",
    nextFreeSlot: nextFree ? `${nextFree.start}-${nextFree.end}` : "No open slot",
    habitLeft: habitLeft ? habitLeft.name : "All habits done",
    goalPreview: goal ? `${goal.name} ${goal.progress}%` : "No goal yet",
    socialSuggestion: social ? social.title : "Add a friend"
  };
}

function getHomeNextAction(context) {
  if (context.currentBlock) {
    const task = (context.currentBlock.tasks || []).find(item => !item.completed);
    return {
      label: "Stay in this block",
      title: task ? task.text : context.currentBlock.title,
      detail: `${context.currentBlock.start}-${context.currentBlock.end} • ${context.currentBlock.title}`,
      actionLabel: "Open planner",
      action: "openPlannerSection('Day')"
    };
  }

  if (context.topTask) {
    return {
      label: "Finish this task",
      title: context.topTask.task.text,
      detail: `From ${context.topTask.block.title}`,
      actionLabel: "Open planner",
      action: "openPlannerSection('Day')"
    };
  }

  if (context.nextBlock) {
    return {
      label: "Prepare for your next block",
      title: context.nextBlock.title,
      detail: `${context.nextBlock.start}-${context.nextBlock.end} • ${context.nextBlock.category || "Planner"}`,
      actionLabel: "Open planner",
      action: "openPlannerSection('Day')"
    };
  }

  if (context.habitLeft) {
    return {
      label: "Complete one habit",
      title: context.habitLeft.name,
      detail: context.habitLeft.target || context.habitLeft.category || "Keep the streak alive",
      actionLabel: "Open habits",
      action: "openSystemsSection('Habits')"
    };
  }

  if (context.goal) {
    return {
      label: "Move a goal forward",
      title: context.goal.name,
      detail: `${context.goal.progress}% complete${context.goal.status ? ` • ${context.goal.status}` : ""}`,
      actionLabel: "Open metrics",
      action: "openSystemsSection('Metrics')"
    };
  }

  if (context.social) {
    return {
      label: "Keep your social rhythm",
      title: context.social.title,
      detail: context.social.detail,
      actionLabel: "Open social",
      action: "openSocialSection('Friends')"
    };
  }

  return {
    label: "Plan the next useful thing",
    title: context.nextFree ? `Use ${context.nextFree.start}-${context.nextFree.end}` : "Create a time block",
    detail: "Your day has open space. Give it a job.",
    actionLabel: "Create time block",
    action: "openPlannerSection('Day')"
  };
}

function renderHomeNextAction() {
  const box = document.getElementById("homeNextAction");
  if (!box) return;
  const focus = getTodayFocus();
  box.innerHTML = `
    <div class="next-action-panel">
      <p class="eyebrow">${escapeHTML(focus.nextAction.label)}</p>
      <strong>${escapeHTML(focus.nextAction.title)}</strong>
      <p>${escapeHTML(focus.nextAction.detail)}</p>
      <div class="next-action-actions">
        <button onclick="${focus.nextAction.action}">${escapeHTML(focus.nextAction.actionLabel)}</button>
        <button class="secondary-btn" onclick="openQuickAddDefault()">Quick Add</button>
      </div>
    </div>
  `;
}

function openQuickAddDefault() {
  openPlannerSection("Day");
}

function getTopGoalPreview() {
  const goals = systemsData.goals
    .map(goal => ({
      name: goal.name || "Untitled goal",
      progress: getGoalProgress(goal),
      status: getGoalStatus(goal),
      deadline: goal.deadline || "",
      unit: goal.unit || "",
      current: getGoalCurrentValue(goal),
      target: getGoalTargetValue(goal)
    }))
    .sort((a, b) => {
      if (a.status === "behind" && b.status !== "behind") return -1;
      if (a.status !== "behind" && b.status === "behind") return 1;
      return a.progress - b.progress;
    });

  return goals[0] || null;
}

function getSocialReminder() {
  const today = getTodayISO();
  const upcoming = socialData.hangouts
    .filter(hangout => !hangout.completed && hangout.date && hangout.date >= today)
    .sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`))[0];

  if (upcoming) {
    return {
      title: upcoming.activity || "Upcoming hangout",
      detail: `${upcoming.date}${upcoming.time ? ` at ${upcoming.time}` : ""}${upcoming.people.length ? ` • ${upcoming.people.join(", ")}` : ""}`
    };
  }

  const friendSuggestion = getFriendSuggestions().find(item => {
    const daysSince = getDaysSince(item.friend.lastSeen);
    return daysSince === null || daysSince >= 21;
  }) || getFriendSuggestions()[0];

  if (!friendSuggestion) return null;

  return {
    title: `Reach out to ${friendSuggestion.friend.name}`,
    detail: friendSuggestion.reason || "Good person to reconnect with"
  };
}

function renderHomeGoalProgress() {
  const box = document.getElementById("homeGoalProgress");
  if (!box) return;
  const goal = getTopGoalPreview();

  box.innerHTML = goal
    ? `
      <div class="home-focus-preview">
        <strong>${escapeHTML(goal.name)}</strong>
        <p>${goal.progress}% complete${goal.status ? ` • ${escapeHTML(goal.status)}` : ""}</p>
        <div class="tracker-progress-bar">
          <div class="tracker-progress-fill goal-progress-fill-${goal.status}" style="width:${goal.progress}%"></div>
        </div>
        <p class="tracker-pct">${escapeHTML(String(goal.current))}/${escapeHTML(String(goal.target))} ${escapeHTML(goal.unit)}</p>
        ${goal.deadline ? `<p>Deadline: ${escapeHTML(goal.deadline)}</p>` : ""}
        <button class="secondary-btn" onclick="openSystemsSection('Metrics')">Open goals</button>
      </div>
    `
    : `<div class="empty-state small"><p>No goals yet.</p><button onclick="openSystemsSection('Metrics')">Add first goal</button></div>`;
}

function renderHomeSocialReminder() {
  const box = document.getElementById("homeSocialReminder");
  if (!box) return;
  const reminder = getSocialReminder();

  box.innerHTML = reminder
    ? `
      <div class="home-focus-preview">
        <strong>${escapeHTML(reminder.title)}</strong>
        <p>${escapeHTML(reminder.detail)}</p>
        <button class="secondary-btn" onclick="openSocialSection('Friends')">Open social</button>
      </div>
    `
    : `<div class="empty-state small"><p>No social reminder yet.</p><button onclick="openSocialSection('Friends')">Add friend</button></div>`;
}

function formatDashboardDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
}

function renderCategoryPill(category) {
  const label = category || "Personal";
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `<span class="category-pill category-${key}">${escapeHTML(label)}</span>`;
}

function renderProductivitySummary(targetId) {
  const box = document.getElementById(targetId);
  if (!box) return;

  const summary = getProductivitySummary();

  box.innerHTML = `
    <div class="summary-grid">
      <div><strong>${summary.taskCompletion}%</strong><span>Tasks done</span></div>
      <div><strong>${formatMinutes(summary.completedMinutes)}</strong><span>Used</span></div>
      <div><strong>${formatMinutes(summary.plannedMinutes)}</strong><span>Planned</span></div>
      <div><strong>${summary.bestRoutineStreak}</strong><span>Routine streak</span></div>
    </div>
  `;
}

function getProductivitySummary() {
  const today = getTodayISO();
  const blocks = scheduleData.blocks.filter(block => block.date === today && !block.isBuffer);
  const tasks = blocks.flatMap(block => block.tasks);
  const completedTasks = tasks.filter(task => task.completed).length;
  const taskCompletion = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const plannedMinutes = blocks.reduce((sum, block) =>
    sum + Math.max(timeToMinutes(block.end) - timeToMinutes(block.start), 0), 0);
  const completedMinutes = blocks
    .filter(block => block.completed || (block.tasks.length && block.tasks.every(task => task.completed)))
    .reduce((sum, block) => sum + Math.max(timeToMinutes(block.end) - timeToMinutes(block.start), 0), 0);

  return {
    taskCompletion,
    plannedMinutes,
    completedMinutes,
    bestRoutineStreak: getBestRoutineStreak()
  };
}

function getBestRoutineStreak() {
  if (!scheduleData.routines.length) return 0;

  return Math.max(...scheduleData.routines.map(routine => getRoutineBlockStreak(routine.id)));
}

function getRoutineBlockStreak(routineId) {
  let streak = 0;
  let date = getTodayISO();

  while (streak < 365) {
    const routineBlocks = scheduleData.blocks.filter(block =>
      block.date === date && block.routineId === routineId
    );

    if (!routineBlocks.length) break;

    const routineDone = routineBlocks.every(block =>
      block.completed || (block.tasks.length && block.tasks.every(task => task.completed))
    );

    if (!routineDone) break;

    streak++;
    date = getDateOffset(date, -1);
  }

  return streak;
}

function formatMinutes(minutes) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// ---------------- SYSTEMS ----------------

function renderSystemsSheet() {
  if (!activeSystemsForm) return "";
  const titles = {
    habit: editingHabitIndex === null ? "Add Habit" : "Edit Habit",
    log: "Add Log",
    metric: editingMetricIndex === null && editingTrackerIndex === null ? "Add Metric" : "Edit Metric",
    goal: editingGoalIndex === null ? "Add Goal" : "Edit Goal"
  };

  return `
    <div id="systemsModal" class="modal-backdrop" onclick="closeSystemsFormFromBackdrop(event)">
      <div class="planner-sheet systems-sheet" role="dialog" aria-modal="true">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <h3>${titles[activeSystemsForm] || "Add System Item"}</h3>
          <button class="icon-btn" onclick="closeSystemsForm()">x</button>
        </div>
        ${activeSystemsForm === "habit" ? renderHabitFormFields() : ""}
        ${activeSystemsForm === "log" ? renderLogFormFields() : ""}
        ${activeSystemsForm === "metric" ? renderMetricFormFields() : ""}
        ${activeSystemsForm === "goal" ? renderGoalFormFields() : ""}
      </div>
    </div>
  `;
}

function renderHabitFormFields() {
  return `
    <input id="habitName" placeholder="Habit name">
    <select id="habitCategory">
      <option value="">Category</option>
      <option>Health</option>
      <option>Fitness</option>
      <option>Learning</option>
      <option>Mindfulness</option>
      <option>Productivity</option>
      <option>Social</option>
      <option>Finance</option>
      <option>Sleep</option>
      <option>School</option>
      <option>Work</option>
      <option>Personal</option>
      <option>Gym</option>
      <option>Custom</option>
    </select>
    <select id="habitFrequency">
      <option>Daily</option>
      <option>Weekdays</option>
      <option>Weekly</option>
      <option>Custom</option>
    </select>
    <select id="habitTargetFrequency">
      <option value="Daily">Target frequency: Daily</option>
      <option value="Weekdays">Target frequency: Weekdays</option>
      <option value="3x/week">Target frequency: 3x/week</option>
      <option value="Weekly">Target frequency: Weekly</option>
      <option value="Custom">Target frequency: Custom</option>
    </select>
    <input id="habitTarget" placeholder="Target (e.g. 30, 8 glasses)">
    <div class="habit-meta-row">
      <select id="habitUnit">
        <option value="">Unit</option>
        <option>times</option>
        <option>minutes</option>
        <option>hours</option>
        <option>pages</option>
        <option>miles</option>
        <option>reps</option>
        <option>glasses</option>
        <option>calories</option>
        <option>steps</option>
        <option>Custom</option>
      </select>
      <select id="habitLinkedGoalId">
        <option value="">Link to goal</option>
        ${systemsData.goals.map(g => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join("")}
      </select>
    </div>
    <textarea id="habitNotes" placeholder="Notes"></textarea>
    <button id="habitSaveButton" onclick="saveHabit()">${editingHabitIndex === null ? "Save Habit" : "Update Habit"}</button>
    <button class="secondary-btn" onclick="closeSystemsForm()">Cancel</button>
  `;
}

function renderLogFormFields() {
  return `
    <input id="logTitle" placeholder="Log title">
    <select id="logType">
      <option>Numeric</option>
      <option>Time</option>
      <option>Boolean</option>
      <option>Counter</option>
      <option>Mood</option>
      <option>Sleep</option>
      <option>Gym</option>
      <option>Spending</option>
      <option>Health</option>
      <option>Custom</option>
    </select>
    <input id="logValue" placeholder="Value">
    <input id="logUnit" placeholder="Custom unit, ex: min, $, hrs, reps">
    <input id="logDate" type="date">
    <select id="logLinkedHabit">
      <option value="">No linked habit</option>
      ${systemsData.habits.map(h => `<option value="${h.id}">${escapeHTML(h.name)}</option>`).join("")}
    </select>
    <textarea id="logNotes" placeholder="Notes"></textarea>
    <button onclick="saveSystemLog()">Save Log</button>
    <button class="secondary-btn" onclick="closeSystemsForm()">Cancel</button>
  `;
}

function renderMetricFormFields() {
  return `
    <input id="metricName" placeholder="Name">
    <select id="metricType">
      <option value="Numeric">Numeric Tracker</option>
      <option value="Progress">Progress Goal</option>
      <option value="Counter">Counter</option>
      <option value="Boolean">Daily Check-in</option>
      <option value="Time">Time Tracker</option>
      <option value="Milestone">Milestone Goal</option>
    </select>
    <input id="metricUnit" placeholder="Unit (lb, hrs, $, reps...)">
    <input id="metricStartValue" type="number" placeholder="Start value">
    <input id="metricCurrentValue" type="number" placeholder="Current value">
    <input id="metricTargetValue" type="number" placeholder="Target value">
    <input id="metricRecurringTarget" placeholder="Recurring target (weekly, monthly, custom)">
    <input id="metricStartDate" type="date">
    <input id="metricDeadline" type="date">
    <select id="metricLinkedHabit">
      <option value="">No linked habit</option>
      ${systemsData.habits.map(h => `<option value="${h.id}">${escapeHTML(h.name)}</option>`).join("")}
    </select>
    <textarea id="metricNotes" placeholder="Notes"></textarea>
    <button id="metricSaveButton" onclick="saveMetric()">${editingMetricIndex === null && editingTrackerIndex === null ? "Save Metric" : "Update Metric"}</button>
    <button class="secondary-btn" onclick="closeSystemsForm()">Cancel</button>
  `;
}

function renderGoalFormFields() {
  return `
    <input id="goalName" placeholder="Goal name">
    <select id="goalCategory">
      <option>Study</option>
      <option>Savings</option>
      <option>Fitness</option>
      <option>Sleep</option>
      <option>Reading</option>
      <option>Calories</option>
      <option>Work</option>
      <option>Personal</option>
      <option>Custom</option>
    </select>
    <div class="habit-meta-row">
      <input id="goalStartValue" type="number" placeholder="Start value">
      <input id="goalCurrentValue" type="number" placeholder="Current value">
    </div>
    <div class="habit-meta-row">
      <input id="goalTargetValue" type="number" placeholder="Target value">
      <input id="goalUnit" placeholder="Unit">
    </div>
    <input id="goalRecurringTarget" placeholder="Recurring target (optional)">
    <div class="habit-meta-row">
      <input id="goalStartDate" type="date">
      <input id="goalDeadline" type="date">
    </div>
    <select id="goalLinkedTracker">
      <option value="">No linked tracker</option>
      ${systemsData.trackers.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join("")}
    </select>
    <select id="goalLinkedHabit">
      <option value="">No linked habit</option>
      ${systemsData.habits.map(h => `<option value="${h.id}">${escapeHTML(h.name)}</option>`).join("")}
    </select>
    <textarea id="goalMilestones" placeholder="Milestones, one per line"></textarea>
    <textarea id="goalNotes" placeholder="Notes"></textarea>
    <button id="goalSaveButton" onclick="saveGoal()">${editingGoalIndex === null ? "Save Goal" : "Update Goal"}</button>
    <button class="secondary-btn" onclick="closeSystemsForm()">Cancel</button>
  `;
}

function openSystemsForm(kind, index = null) {
  activeSystemsForm = kind;
  editingHabitIndex = kind === "habit" ? index : null;
  editingMetricIndex = kind === "metric" ? index : null;
  editingGoalIndex = kind === "goal" ? index : null;
  editingTrackerIndex = null;
  if (kind === "habit") activeSystemsSection = "Habits";
  if (kind === "log") activeSystemsSection = "Logs";
  if (kind === "metric") activeSystemsSection = "Metrics";
  if (kind === "goal") activeSystemsSection = "Goals";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
  fillDefaultLogDate();
  const firstInput = document.querySelector("#systemsModal input, #systemsModal select, #systemsModal textarea");
  firstInput?.focus();
}

function openSystemsFormForSection() {
  const map = {
    Dashboard: "habit",
    Habits: "habit",
    Logs: "log",
    Metrics: "metric",
    Goals: "goal",
    Insights: "log"
  };
  openSystemsForm(map[activeSystemsSection] || "habit");
}

function closeSystemsForm() {
  activeSystemsForm = null;
  editingHabitIndex = null;
  editingTrackerIndex = null;
  editingGoalIndex = null;
  editingMetricIndex = null;
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function closeSystemsFormFromBackdrop(event) {
  if (event.target && event.target.id === "systemsModal") closeSystemsForm();
}

function renderSystems() {
  fillEditingHabitForm();
  fillEditingTrackerForm();
  fillEditingGoalForm();
  fillEditingMetricForm();
  renderSystemsDashboard();
  renderHabitsList();
  renderSystemsLogsList();
  renderMetricsList();
  renderGoalsList();
  fillDefaultLogDate();
}

function saveHabit() {
  const name = document.getElementById("habitName").value.trim();
  if (!name) return;

  const habit = {
    id: editingHabitIndex === null ? createId("habit") : systemsData.habits[editingHabitIndex].id,
    name,
    category: document.getElementById("habitCategory").value,
    frequency: document.getElementById("habitFrequency").value,
    targetFrequency: document.getElementById("habitTargetFrequency")?.value || document.getElementById("habitFrequency").value,
    target: document.getElementById("habitTarget").value.trim(),
    unit: document.getElementById("habitUnit")?.value || "",
    linkedGoalId: document.getElementById("habitLinkedGoalId")?.value || "",
    notes: document.getElementById("habitNotes").value.trim(),
    completions: editingHabitIndex === null ? [] : systemsData.habits[editingHabitIndex].completions,
    skippedDates: editingHabitIndex === null ? [] : (systemsData.habits[editingHabitIndex].skippedDates || []),
    completionHistory: editingHabitIndex === null ? [] : (systemsData.habits[editingHabitIndex].completionHistory || []),
    paused: editingHabitIndex === null ? false : Boolean(systemsData.habits[editingHabitIndex].paused)
  };

  if (editingHabitIndex === null) {
    systemsData.habits.push(habit);
  } else {
    systemsData.habits[editingHabitIndex] = habit;
  }

  editingHabitIndex = null;
  activeSystemsForm = null;
  saveSystemsData();
  activeSystemsSection = "Habits";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function fillEditingHabitForm() {
  if (editingHabitIndex === null) return;
  if (!document.getElementById("habitName")) return;
  const habit = systemsData.habits[editingHabitIndex];
  if (!habit) return;

  document.getElementById("habitName").value = habit.name;
  document.getElementById("habitCategory").value = habit.category || "";
  document.getElementById("habitFrequency").value = habit.frequency;
  const targetFrequencyEl = document.getElementById("habitTargetFrequency");
  if (targetFrequencyEl) targetFrequencyEl.value = habit.targetFrequency || habit.frequency || "Daily";
  document.getElementById("habitTarget").value = habit.target;
  const habitUnitEl = document.getElementById("habitUnit");
  if (habitUnitEl) habitUnitEl.value = habit.unit || "";
  const habitGoalEl = document.getElementById("habitLinkedGoalId");
  if (habitGoalEl) habitGoalEl.value = habit.linkedGoalId || "";
  document.getElementById("habitNotes").value = habit.notes;
  document.getElementById("habitSaveButton").textContent = "Update Habit";
}

function resetHabitForm() {
  editingHabitIndex = null;
  activeSystemsSection = "Habits";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function editHabit(index) {
  openSystemsForm("habit", index);
}

function deleteHabit(index) {
  if (!confirm("Delete this habit?")) return;
  systemsData.habits.splice(index, 1);
  if (editingHabitIndex === index) editingHabitIndex = null;
  saveSystemsData();
  renderSystems();
}

function completeHabitToday(index) {
  const today = getTodayISO();
  const habit = systemsData.habits[index];
  if (!habit || habit.paused) return;
  if (!habit.completions.includes(today)) {
    habit.completions.push(today);
  }
  habit.skippedDates = (habit.skippedDates || []).filter(date => date !== today);
  if (!Array.isArray(habit.completionHistory)) habit.completionHistory = [];
  if (!habit.completionHistory.some(entry => entry.date === today)) {
    habit.completionHistory.push({
      date: today,
      time: new Date().toTimeString().slice(0, 5)
    });
  }

  const alreadyLogged = systemsData.logs.some(log =>
    log.linkedHabitId === habit.id && log.date === today && log.type === "Habit"
  );

  if (!alreadyLogged) {
    systemsData.logs.push({
      id: createId("log"),
      title: habit.name,
      type: "Habit",
      value: "1",
      unit: "completion",
      date: today,
      notes: "Completed habit",
      linkedHabitId: habit.id,
      linkedPlannerBlockId: ""
    });
  }

  saveSystemsData();
  renderSystems();
}

function skipHabitToday(index) {
  const habit = systemsData.habits[index];
  if (!habit) return;
  const today = getTodayISO();
  if (!Array.isArray(habit.skippedDates)) habit.skippedDates = [];
  if (!habit.skippedDates.includes(today)) habit.skippedDates.push(today);
  habit.completions = (habit.completions || []).filter(date => date !== today);
  saveSystemsData();
  renderSystems();
}

function toggleHabitPaused(index) {
  const habit = systemsData.habits[index];
  if (!habit) return;
  habit.paused = !habit.paused;
  saveSystemsData();
  renderSystems();
}

function scheduleHabitInPlanner(index) {
  const habit = systemsData.habits[index];
  const today = getTodayISO();
  const alreadyScheduled = scheduleData.blocks.some(block =>
    block.date === today && block.systemHabitId === habit.id
  );

  if (alreadyScheduled) {
    alert("This habit is already scheduled for today.");
    return;
  }

  scheduleData.blocks.push({
    id: createId("block"),
    systemHabitId: habit.id,
    title: habit.name,
    date: today,
    start: "09:00",
    end: "09:30",
    category: habit.category || "Personal",
    notes: habit.notes || "Scheduled from Systems habit",
    completed: false,
    tasks: [{
      text: habit.target || habit.name,
      completed: false
    }]
  });

  addBufferBlocksForDate(today);
  saveScheduleData();
  alert("Habit scheduled in Planner for today.");
}

function saveSystemLog() {
  const title = document.getElementById("logTitle").value.trim();
  const value = document.getElementById("logValue").value.trim();
  const unit = document.getElementById("logUnit").value.trim();
  const date = document.getElementById("logDate").value || getTodayISO();
  if (!title && !value) return;

  const log = {
    id: createId("log"),
    title,
    type: document.getElementById("logType").value,
    valueType: document.getElementById("logType").value,
    value,
    unit,
    date,
    notes: document.getElementById("logNotes").value.trim(),
    linkedHabitId: document.getElementById("logLinkedHabit")?.value || "",
    linkedPlannerBlockId: ""
  };
  systemsData.logs.push(log);
  syncMetricsFromLog(log);

  saveSystemsData();
  activeSystemsForm = null;
  activeSystemsSection = "Logs";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function syncMetricsFromLog(log) {
  const numericValue = getLogNumber(log);
  if (isNaN(numericValue)) return;
  const normalizedTitle = (log.title || "").trim().toLowerCase();
  const metric = systemsData.metrics.find(item =>
    item.name.trim().toLowerCase() === normalizedTitle ||
    (log.linkedHabitId && item.linkedHabitId === log.linkedHabitId)
  );
  if (!metric) return;
  metric.currentValue = String(numericValue);
  if (!Array.isArray(metric.entries)) metric.entries = [];
  metric.entries.push({ date: log.date || getTodayISO(), value: String(numericValue), logId: log.id });
}

function deleteSystemLog(index) {
  systemsData.logs.splice(index, 1);
  saveSystemsData();
  renderSystems();
}

function fillDefaultLogDate() {
  const input = document.getElementById("logDate");
  if (input && !input.value) input.value = getTodayISO();
}

function renderSystemsDashboard() {
  const box = document.getElementById("systemsDashboard");
  if (!box) return;
  const today = getTodayISO();
  const activeHabits = systemsData.habits.filter(habit => !habit.paused);
  const completedToday = activeHabits.filter(habit => habit.completions.includes(today)).length;
  const weekDates = getLastNDates(7);
  const expectedHabitChecks = activeHabits.reduce((sum, habit) =>
    sum + getHabitExpectedCount(habit, weekDates), 0);
  const weeklyHabitHits = activeHabits.reduce((sum, habit) =>
    sum + weekDates.filter(date => habit.completions.includes(date)).length, 0);
  const weeklyCompletionPct = expectedHabitChecks ? Math.round((weeklyHabitHits / expectedHabitChecks) * 100) : 0;
  const bestStreak = activeHabits.reduce((best, habit) =>
    Math.max(best, getHabitStreak(habit)), 0);
  const missedHabits = activeHabits.filter(habit =>
    !habit.completions.includes(today) && !habit.skippedDates.includes(today)
  );
  const skippedToday = activeHabits.filter(habit => habit.skippedDates.includes(today));
  const bestHabit = getBestHabit();
  const mostSkipped = getMostSkippedHabit();

  const trackerProgresses = systemsData.trackers.map(t => getTrackerProgress(t));
  const metricProgresses = systemsData.metrics.map(m => getMetricProgress(m));
  const allProgresses = [...trackerProgresses, ...metricProgresses];
  const avgProgress = trackerProgresses.length
    ? Math.round(trackerProgresses.reduce((s, p) => s + p, 0) / trackerProgresses.length)
    : 0;
  const onTrack = systemsData.trackers.filter(t => getTrackerProgress(t) >= 50).length;
  const logsThisWeek = systemsData.logs.filter(log => weekDates.includes(log.date)).length;
  const insights = getSmartSystemsInsights();

  const recentLogs = [...systemsData.logs]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 3);

  box.innerHTML = `
    <div class="systems-summary-grid">
      <div class="progress-ring-card">
        <div class="progress-ring" style="--pct:${activeHabits.length ? Math.round((completedToday / activeHabits.length) * 100) : 0}%">
          <span>${activeHabits.length ? Math.round((completedToday / activeHabits.length) * 100) : 0}%</span>
        </div>
        <strong>Today</strong>
        <p>${completedToday}/${activeHabits.length} habits complete</p>
      </div>
      <div><strong>${activeHabits.length}</strong><span>Active habits</span></div>
      <div><strong>${weeklyCompletionPct}%</strong><span>Weekly habits</span></div>
      <div><strong>${bestStreak}</strong><span>Best streak</span></div>
      <div><strong>${missedHabits.length}</strong><span>Missed today</span></div>
      <div><strong>${skippedToday.length}</strong><span>Skipped today</span></div>
      <div><strong>${logsThisWeek}</strong><span>Logs this week</span></div>
      <div><strong>${systemsData.trackers.length}</strong><span>Trackers</span></div>
      <div><strong>${onTrack}/${systemsData.trackers.length}</strong><span>On track</span></div>
      <div><strong>${allProgresses.length ? Math.round(allProgresses.reduce((s, p) => s + p, 0) / allProgresses.length) : avgProgress}%</strong><span>Metric progress</span></div>
    </div>
    <div class="systems-highlight-grid">
      <div class="system-highlight">
        <span>Best habit</span>
        <strong>${bestHabit ? escapeHTML(bestHabit.name) : "No habit yet"}</strong>
        <p>${bestHabit ? `${getHabitCompletionPct(bestHabit, 30)}% over 30 days` : "Add a habit to start tracking."}</p>
      </div>
      <div class="system-highlight">
        <span>Most skipped</span>
        <strong>${mostSkipped ? escapeHTML(mostSkipped.name) : "None"}</strong>
        <p>${mostSkipped ? `${getHabitSkippedCount(mostSkipped, 30)} skips in 30 days` : "No skip pattern yet."}</p>
      </div>
    </div>
    <div class="weekly-bars">
      ${weekDates.slice().reverse().map(date => {
        const done = activeHabits.filter(habit => habit.completions.includes(date)).length;
        const pct = activeHabits.length ? Math.round((done / activeHabits.length) * 100) : 0;
        return `
          <div class="weekly-bar">
            <div class="weekly-bar-fill" style="height:${Math.max(pct, 8)}%"></div>
            <span>${new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1)}</span>
          </div>
        `;
      }).join("")}
    </div>
    ${insights.length ? `
      <div class="smart-insight-list">
        ${insights.map(insight => `<div class="smart-insight ${insight.tone}"><strong>${escapeHTML(insight.title)}</strong><p>${escapeHTML(insight.detail)}</p></div>`).join("")}
      </div>
    ` : ""}
    ${missedHabits.length ? `
      <p style="margin-top:12px;font-weight:600;font-size:14px;">Missed Habits</p>
      ${missedHabits.slice(0, 5).map(habit => `
        <div class="home-list-item">
          <strong>${escapeHTML(habit.name)}</strong>
          <p>${escapeHTML(habit.category || "No category")} • ${getHabitStreak(habit)} streak</p>
        </div>
      `).join("")}
    ` : `<p class="empty-state small">All habits are complete today.</p>`}
    ${systemsData.metrics.length ? `
      <p style="margin-top:12px;font-weight:600;font-size:14px;">Metric Progress</p>
      ${systemsData.metrics.slice(0, 4).map(metric => `
        <div class="home-list-item">
          <strong>${escapeHTML(metric.name)}</strong>
          <p>${getMetricProgress(metric)}% • ${escapeHTML(String(metric.currentValue || 0))}/${escapeHTML(String(metric.targetValue || ""))} ${escapeHTML(metric.unit || "")}</p>
        </div>
      `).join("")}
    ` : ""}
    ${recentLogs.length ? `
      <p style="margin-top:12px;font-weight:600;font-size:14px;">Recent Logs</p>
      ${recentLogs.map(log => `
        <div class="home-list-item">
          <strong>${escapeHTML(log.title || log.type)}</strong>
          <p>${escapeHTML(log.date || "")} • ${escapeHTML(log.value || "")} ${escapeHTML(log.unit || "")}</p>
        </div>
      `).join("")}
    ` : ""}
  `;
}

function getLastNDates(count) {
  const today = getTodayISO();
  return Array.from({ length: count }, (_, index) => getDateOffset(today, -index));
}

function getHabitExpectedCount(habit, dates) {
  const frequency = habit.targetFrequency || habit.frequency || "Daily";
  if (habit.paused) return 0;
  if (frequency === "Weekly") return dates.length ? 1 : 0;
  if (frequency === "3x/week") return Math.min(3, dates.length);
  if (frequency === "Weekdays") {
    return dates.filter(date => {
      const day = new Date(`${date}T00:00:00`).getDay();
      return day !== 0 && day !== 6;
    }).length;
  }
  return dates.length;
}

function getHabitCompletionPct(habit, days = 30) {
  const dates = getLastNDates(days);
  const expected = getHabitExpectedCount(habit, dates);
  if (!expected) return 0;
  const hits = dates.filter(date => habit.completions.includes(date)).length;
  return Math.min(100, Math.round((hits / expected) * 100));
}

function getHabitWeeklyConsistency(habit) {
  return getHabitCompletionPct(habit, 7);
}

function getHabitSkippedCount(habit, days = 30) {
  const dates = new Set(getLastNDates(days));
  return (habit.skippedDates || []).filter(date => dates.has(date)).length;
}

function getBestHabit() {
  return systemsData.habits
    .filter(habit => !habit.paused)
    .sort((a, b) => getHabitCompletionPct(b, 30) - getHabitCompletionPct(a, 30))[0] || null;
}

function getMostSkippedHabit() {
  return systemsData.habits
    .filter(habit => getHabitSkippedCount(habit, 30) > 0)
    .sort((a, b) => getHabitSkippedCount(b, 30) - getHabitSkippedCount(a, 30))[0] || null;
}

function renderHabitHeatmap(habit) {
  const dates = getLastNDates(28).slice().reverse();
  return `
    <div class="habit-heatmap" aria-label="Habit heatmap">
      ${dates.map(date => {
        const complete = habit.completions.includes(date);
        const skipped = (habit.skippedDates || []).includes(date);
        return `<span class="${complete ? "done" : skipped ? "skipped" : ""}" title="${date}"></span>`;
      }).join("")}
    </div>
  `;
}

function getSmartSystemsInsights() {
  const insights = [];
  const history = systemsData.habits.flatMap(habit =>
    (habit.completionHistory || []).map(entry => ({ ...entry, habitName: habit.name }))
  );
  const timedHistory = history.filter(entry => entry.time);
  if (timedHistory.length >= 2) {
    const before11 = timedHistory.filter(entry => timeToMinutes(entry.time) < 11 * 60).length;
    if (before11 / timedHistory.length >= 0.5) {
      insights.push({
        tone: "positive",
        title: "You complete habits most often before 11AM.",
        detail: `${before11}/${timedHistory.length} timed completions happened before late morning.`
      });
    }
  }

  const sleepLogs = systemsData.logs
    .filter(log => /sleep/i.test(`${log.title} ${log.type}`) && !isNaN(getLogNumber(log)))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const sleepChange = getPeriodChangePct(sleepLogs);
  if (sleepChange !== null) {
    insights.push({
      tone: sleepChange >= 0 ? "positive" : "warning",
      title: `Your sleep average ${sleepChange >= 0 ? "improved" : "dropped"} ${Math.abs(sleepChange)}%.`,
      detail: "This compares your latest 7 logged sleep values with the prior 7."
    });
  }

  const gymHabit = systemsData.habits.find(habit => /gym|workout|fitness/i.test(`${habit.name} ${habit.category}`));
  if (gymHabit) {
    const weekendSkips = (gymHabit.skippedDates || []).filter(date => {
      const day = new Date(`${date}T00:00:00`).getDay();
      return day === 0 || day === 6;
    }).length;
    if (weekendSkips) {
      insights.push({
        tone: "warning",
        title: "You skip gym most on weekends.",
        detail: `${weekendSkips} recent gym skips landed on Saturday or Sunday.`
      });
    }
  }

  const studyHabit = systemsData.habits.find(habit => /study|school|learn/i.test(`${habit.name} ${habit.category}`));
  if (studyHabit) {
    const last7 = getHabitCompletionPct(studyHabit, 7);
    const last30 = getHabitCompletionPct(studyHabit, 30);
    if (last7 >= last30 && last7 > 0) {
      insights.push({
        tone: "positive",
        title: "Your study consistency is trending upward.",
        detail: `Study is at ${last7}% this week versus ${last30}% across 30 days.`
      });
    }
  }

  if (!insights.length && systemsData.habits.length) {
    insights.push({
      tone: "neutral",
      title: "Your system is collecting signal.",
      detail: "Complete habits and add logs for a few more days to unlock stronger trend insights."
    });
  }
  return insights.slice(0, 4);
}

function getPeriodChangePct(logs) {
  if (logs.length < 4) return null;
  const latest = logs.slice(-7);
  const previous = logs.slice(-14, -7);
  if (!previous.length) return null;
  const latestAvg = average(latest.map(getLogNumber).filter(value => !isNaN(value)));
  const previousAvg = average(previous.map(getLogNumber).filter(value => !isNaN(value)));
  if (!previousAvg) return null;
  return Math.round(((latestAvg - previousAvg) / Math.abs(previousAvg)) * 100);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function getMetricProgress(metric) {
  const current = Number(metric.currentValue);
  const target = Number(metric.targetValue);
  const start = Number(metric.startValue || 0);
  if (isNaN(current) || isNaN(target) || target === start) return 0;
  return Math.min(100, Math.max(0, Math.round(((current - start) / (target - start)) * 100)));
}

function renderHabitsList() {
  const box = document.getElementById("habitsList");
  if (!box) return;

  box.innerHTML = systemsData.habits.length
    ? `<div class="systems-card-grid">${systemsData.habits.map((habit, index) => {
      const doneToday = habit.completions.includes(getTodayISO());
      const skippedToday = (habit.skippedDates || []).includes(getTodayISO());
      const pct = getHabitCompletionPct(habit, 30);
      const weekly = getHabitWeeklyConsistency(habit);
      return `
        <div class="system-item habit-card ${habit.paused ? "paused" : ""}">
          <div class="item-title">
            <strong>${escapeHTML(habit.name)}</strong>
            <span class="streak-badge">${getHabitStreak(habit)} streak</span>
          </div>
          <div class="habit-pill-row">
            <span class="metric-type-pill metric-type-progress">${escapeHTML(habit.category || "No category")}</span>
            <span class="metric-type-pill">${escapeHTML(habit.targetFrequency || habit.frequency)}</span>
            ${habit.paused ? `<span class="metric-type-pill metric-type-milestone">Paused</span>` : ""}
          </div>
          <div class="habit-stat-row">
            <div><strong>${pct}%</strong><span>30-day completion</span></div>
            <div><strong>${weekly}%</strong><span>weekly consistency</span></div>
            <div><strong>${getHabitSkippedCount(habit, 30)}</strong><span>skips</span></div>
          </div>
          ${renderHabitHeatmap(habit)}
          ${habit.target ? `<p>${escapeHTML(habit.target)} ${escapeHTML(habit.unit || "")}</p>` : ""}
          ${habit.notes ? `<p>${escapeHTML(habit.notes)}</p>` : ""}
          <div class="button-row three-actions">
            <button onclick="completeHabitToday(${index})" ${habit.paused || doneToday ? "disabled" : ""}>${doneToday ? "Done" : "Complete"}</button>
            <button class="secondary-btn" onclick="skipHabitToday(${index})" ${habit.paused || skippedToday ? "disabled" : ""}>${skippedToday ? "Skipped" : "Skip"}</button>
            <button class="secondary-btn" onclick="scheduleHabitInPlanner(${index})">Plan</button>
          </div>
          <div class="button-row three-actions">
            <button class="secondary-btn" onclick="toggleHabitPaused(${index})">${habit.paused ? "Resume" : "Pause"}</button>
            <button onclick="editHabit(${index})">Edit</button>
            <button class="danger-btn" onclick="deleteHabit(${index})">Delete</button>
          </div>
        </div>
      `;
    }).join("")}</div>`
    : `<div class="empty-state"><p>No habits saved yet.</p><button onclick="openSystemsForm('habit')">Add first habit</button></div>`;
}

function renderSystemsLogsList() {
  const box = document.getElementById("systemsLogsList");
  if (!box) return;

  const logs = [...systemsData.logs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const numericLogs = logs.filter(log => !isNaN(getLogNumber(log))).slice().reverse();
  const recentValues = numericLogs.slice(-14).map(getLogNumber);
  const sevenDayAvg = average(numericLogs.slice(-7).map(getLogNumber));
  const previousAvg = average(numericLogs.slice(-14, -7).map(getLogNumber));
  const trend = previousAvg
    ? Math.round(((sevenDayAvg - previousAvg) / Math.abs(previousAvg)) * 100)
    : 0;

  box.innerHTML = logs.length
    ? `
      <div class="log-analytics-panel">
        <div class="summary-grid">
          <div><strong>${logs.length}</strong><span>Total logs</span></div>
          <div><strong>${numericLogs.length ? roundForDisplay(average(numericLogs.map(getLogNumber))) : "-"}</strong><span>Average</span></div>
          <div><strong>${numericLogs.length ? roundForDisplay(sevenDayAvg) : "-"}</strong><span>Rolling 7-day avg</span></div>
          <div><strong>${trend > 0 ? "↑" : trend < 0 ? "↓" : "→"} ${Math.abs(trend)}%</strong><span>Compare periods</span></div>
        </div>
        ${recentValues.length ? renderMiniBars(recentValues) : `<p class="muted-text">Add numeric values to unlock charts and trend lines.</p>`}
      </div>
      ${logs.map(log => {
      const index = systemsData.logs.findIndex(item => item.id === log.id);
      const linkedHabit = log.linkedHabitId
        ? systemsData.habits.find(habit => habit.id === log.linkedHabitId)
        : null;
      return `
        <div class="system-item">
          <div class="item-title">
            <strong>${escapeHTML(log.title || log.type)}</strong>
            <span>${escapeHTML(log.type)}</span>
          </div>
          <p>${escapeHTML(log.date || "No date")} • ${escapeHTML(log.value || "")} ${escapeHTML(log.unit || "")}</p>
          ${linkedHabit ? `<p class="muted-text">Linked habit: ${escapeHTML(linkedHabit.name)}</p>` : ""}
          <p>${escapeHTML(log.notes || "")}</p>
          <button class="danger-btn" onclick="deleteSystemLog(${index})">Delete Log</button>
        </div>
      `;
    }).join("")}`
    : `<div class="empty-state"><p>No logs saved yet.</p><button onclick="openSystemsForm('log')">Add first log</button></div>`;
}

function getLogNumber(log) {
  const cleaned = String(log.value || "").replace(/[^0-9.-]/g, "");
  if (!cleaned) return NaN;
  const value = Number(cleaned);
  return value;
}

function roundForDisplay(value) {
  return Math.round(value * 10) / 10;
}

function renderMiniBars(values) {
  const max = Math.max(...values.map(value => Math.abs(value)), 1);
  return `
    <div class="mini-chart">
      ${values.map(value => `<span style="height:${Math.max((Math.abs(value) / max) * 100, 8)}%" title="${roundForDisplay(value)}"></span>`).join("")}
    </div>
  `;
}

function getTrackerProgress(tracker) {
  const start = Number(tracker.startValue);
  const current = Number(tracker.currentValue);
  const target = Number(tracker.targetValue);
  if (isNaN(start) || isNaN(current) || isNaN(target)) return 0;
  if (start === target) return current >= target ? 100 : 0;
  let pct;
  if (tracker.type === "Weight" || tracker.type === "Taper") {
    pct = ((start - current) / (start - target)) * 100;
  } else {
    pct = (current / target) * 100;
  }
  return Math.min(100, Math.max(0, Math.round(pct)));
}

function saveTracker() {
  const name = document.getElementById("trackerName").value.trim();
  const type = document.getElementById("trackerType").value;
  const unit = document.getElementById("trackerUnit").value.trim();
  const startValue = document.getElementById("trackerStartValue").value;
  const currentValue = document.getElementById("trackerCurrentValue").value;
  const targetValue = document.getElementById("trackerTargetValue").value;
  const startDate = document.getElementById("trackerStartDate").value;
  const targetDate = document.getElementById("trackerTargetDate").value;
  const notes = document.getElementById("trackerNotes").value.trim();

  if (!name || startValue === "" || targetValue === "") {
    alert("Add a tracker name, start value, and target value.");
    return;
  }

  const tracker = {
    id: editingTrackerIndex === null
      ? createId("tracker")
      : systemsData.trackers[editingTrackerIndex].id,
    name, type, unit, startValue, currentValue, targetValue,
    startDate, targetDate, notes
  };

  if (editingTrackerIndex === null) {
    systemsData.trackers.push(tracker);
  } else {
    systemsData.trackers[editingTrackerIndex] = tracker;
  }

  editingTrackerIndex = null;
  saveSystemsData();
  activeSystemsSection = "Metrics";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function renderTrackersList() {
  const box = document.getElementById("trackersList");
  if (!box) return;

  box.innerHTML = systemsData.trackers.length
    ? systemsData.trackers.map((tracker, index) => {
        const pct = getTrackerProgress(tracker);
        const remaining = (Number(tracker.targetValue) - Number(tracker.currentValue)).toFixed(2);
        const unit = escapeHTML(tracker.unit || "");
        return `
          <div class="system-item">
            <div class="item-title">
              <strong>${escapeHTML(tracker.name)}</strong>
              <span>${escapeHTML(tracker.type)}</span>
            </div>
            <p>${escapeHTML(String(tracker.currentValue))} ${unit} → ${escapeHTML(String(tracker.targetValue))} ${unit}</p>
            <div class="tracker-progress-bar">
              <div class="tracker-progress-fill" style="width:${pct}%"></div>
            </div>
            <p class="tracker-pct">${pct}% complete • ${Math.abs(Number(remaining))} ${unit} remaining</p>
            ${tracker.targetDate ? `<p>Target: ${escapeHTML(tracker.targetDate)}</p>` : ""}
            ${tracker.notes ? `<p>${escapeHTML(tracker.notes)}</p>` : ""}
            <div class="button-row">
              <button onclick="logTrackerValue(${index})">Log Value</button>
              <button onclick="editTracker(${index})">Edit</button>
              <button class="danger-btn" onclick="deleteTracker(${index})">Delete</button>
            </div>
          </div>
        `;
      }).join("")
    : "<p>No trackers saved yet.</p>";
}

function logTrackerValue(index) {
  const tracker = systemsData.trackers[index];
  if (!tracker) return;
  const raw = prompt(`Log new value for "${tracker.name}" (${tracker.unit || "unit"}):`);
  if (raw === null || raw.trim() === "") return;
  const value = raw.trim();
  tracker.currentValue = value;
  systemsData.logs.push({
    id: createId("log"),
    title: tracker.name,
    type: tracker.type,
    value,
    unit: tracker.unit,
    date: getTodayISO(),
    notes: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    trackerId: tracker.id
  });
  saveSystemsData();
  renderSystems();
}

function editTracker(index) {
  activeSystemsForm = "metric";
  editingTrackerIndex = index;
  editingGoalIndex = null;
  editingMetricIndex = null;
  activeSystemsSection = "Metrics";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function fillEditingTrackerForm() {
  // Handled by fillEditingMetricForm — tracker form elements no longer in DOM
}

function resetTrackerForm() {
  editingTrackerIndex = null;
  editingGoalIndex = null;
  editingMetricIndex = null;
  activeSystemsSection = "Metrics";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function deleteTracker(index) {
  if (!confirm("Delete this tracker?")) return;
  if (editingTrackerIndex === index) editingTrackerIndex = null;
  systemsData.trackers.splice(index, 1);
  saveSystemsData();
  renderSystems();
}

// ---------------- GOALS ----------------

function saveGoal() {
  const name = document.getElementById("goalName").value.trim();
  const category = document.getElementById("goalCategory").value;
  const startValue = document.getElementById("goalStartValue").value;
  const currentValue = document.getElementById("goalCurrentValue").value;
  const targetValue = document.getElementById("goalTargetValue").value;
  const unit = document.getElementById("goalUnit").value.trim();
  const recurringTarget = document.getElementById("goalRecurringTarget")?.value.trim() || "";
  const startDate = document.getElementById("goalStartDate").value;
  const deadline = document.getElementById("goalDeadline").value;
  const linkedTrackerId = document.getElementById("goalLinkedTracker").value;
  const linkedHabitId = document.getElementById("goalLinkedHabit").value;
  const milestones = (document.getElementById("goalMilestones")?.value || "")
    .split("\n")
    .map(item => item.trim())
    .filter(Boolean)
    .map((title, index) => ({
      id: editingGoalIndex === null
        ? createId("milestone")
        : (systemsData.goals[editingGoalIndex].milestones?.[index]?.id || createId("milestone")),
      title,
      completed: editingGoalIndex !== null
        ? Boolean(systemsData.goals[editingGoalIndex].milestones?.[index]?.completed)
        : false
    }));
  const notes = document.getElementById("goalNotes").value.trim();

  if (!name || targetValue === "") {
    alert("Add a goal name and target value.");
    return;
  }

  const goal = {
    id: editingGoalIndex === null
      ? createId("goal")
      : systemsData.goals[editingGoalIndex].id,
    name, category, startValue, currentValue, targetValue,
    unit, startDate, deadline,
    linkedTrackerId, linkedHabitId, recurringTarget, milestones,
    linkedPlannerBlockId: editingGoalIndex === null
      ? ""
      : systemsData.goals[editingGoalIndex].linkedPlannerBlockId || "",
    notes
  };

  if (editingGoalIndex === null) {
    systemsData.goals.push(goal);
  } else {
    systemsData.goals[editingGoalIndex] = goal;
  }

  editingGoalIndex = null;
  activeSystemsForm = null;
  saveSystemsData();
  activeSystemsSection = "Goals";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function resetGoalForm() {
  editingGoalIndex = null;
  editingTrackerIndex = null;
  editingMetricIndex = null;
  activeSystemsSection = "Metrics";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function editGoal(index) {
  openSystemsForm("goal", index);
}

function deleteGoal(index) {
  if (!confirm("Delete this goal?")) return;
  if (editingGoalIndex === index) editingGoalIndex = null;
  systemsData.goals.splice(index, 1);
  saveSystemsData();
  renderSystems();
}

function fillEditingGoalForm() {
  if (editingGoalIndex === null || !document.getElementById("goalName")) return;
  const goal = systemsData.goals[editingGoalIndex];
  if (!goal) return;
  document.getElementById("goalName").value = goal.name || "";
  document.getElementById("goalCategory").value = goal.category || "Custom";
  document.getElementById("goalStartValue").value = goal.startValue || "";
  document.getElementById("goalCurrentValue").value = goal.currentValue || "";
  document.getElementById("goalTargetValue").value = goal.targetValue || "";
  document.getElementById("goalUnit").value = goal.unit || "";
  const recurringEl = document.getElementById("goalRecurringTarget");
  if (recurringEl) recurringEl.value = goal.recurringTarget || "";
  document.getElementById("goalStartDate").value = goal.startDate || "";
  document.getElementById("goalDeadline").value = goal.deadline || "";
  document.getElementById("goalLinkedTracker").value = goal.linkedTrackerId || "";
  document.getElementById("goalLinkedHabit").value = goal.linkedHabitId || "";
  const milestonesEl = document.getElementById("goalMilestones");
  if (milestonesEl) milestonesEl.value = (goal.milestones || []).map(item => item.title || "").join("\n");
  document.getElementById("goalNotes").value = goal.notes || "";
  const saveButton = document.getElementById("goalSaveButton");
  if (saveButton) saveButton.textContent = "Update Goal";
}

function getGoalCurrentValue(goal) {
  if (goal.linkedTrackerId) {
    const tracker = systemsData.trackers.find(t => t.id === goal.linkedTrackerId);
    if (tracker) return Number(tracker.currentValue);
  }
  return Number(goal.currentValue);
}

function getGoalTargetValue(goal) {
  if (goal.linkedTrackerId) {
    const tracker = systemsData.trackers.find(t => t.id === goal.linkedTrackerId);
    if (tracker) return Number(tracker.targetValue);
  }
  return Number(goal.targetValue);
}

function getGoalStartValue(goal) {
  if (goal.linkedTrackerId) {
    const tracker = systemsData.trackers.find(t => t.id === goal.linkedTrackerId);
    if (tracker && tracker.startValue !== "") return Number(tracker.startValue);
  }
  if (goal.startValue !== undefined && goal.startValue !== "") return Number(goal.startValue);
  return null;
}

function getGoalProgress(goal) {
  const current = getGoalCurrentValue(goal);
  const target = getGoalTargetValue(goal);
  const start = getGoalStartValue(goal);

  if (isNaN(current) || isNaN(target)) return 0;

  const isDecreasing = start !== null
    ? target < start
    : (goal.category === "Weight" || goal.category === "Taper") && target < current;

  if (isDecreasing) {
    const startVal = start !== null ? start : current;
    const range = startVal - target;
    if (range <= 0) return current <= target ? 100 : 0;
    const pct = ((startVal - current) / range) * 100;
    return Math.min(100, Math.max(0, Math.round(pct)));
  }

  if (start !== null) {
    const range = target - start;
    if (range <= 0) return current >= target ? 100 : 0;
    const pct = ((current - start) / range) * 100;
    return Math.min(100, Math.max(0, Math.round(pct)));
  }

  if (!target) return 0;
  return Math.min(100, Math.max(0, Math.round((current / target) * 100)));
}

function getGoalStatus(goal) {
  const pct = getGoalProgress(goal);
  if (pct >= 100) return "complete";
  if (!goal.deadline || !goal.startDate) return "on track";
  const today = getTodayISO();
  if (today > goal.deadline) return "behind";
  const totalDays = Math.max(
    (new Date(goal.deadline) - new Date(goal.startDate)) / 86400000, 1
  );
  const elapsed = Math.max(
    (new Date(today) - new Date(goal.startDate)) / 86400000, 0
  );
  const expectedPct = Math.min((elapsed / totalDays) * 100, 100);
  return pct >= expectedPct ? "on track" : "behind";
}

function logGoalProgress(index) {
  const goal = systemsData.goals[index];
  if (!goal) return;
  const unit = goal.unit || "units";
  const raw = prompt(`Log current value for "${goal.name}" (${unit}):`);
  if (raw === null || raw.trim() === "") return;
  const value = raw.trim();
  goal.currentValue = value;
  if (goal.linkedTrackerId) {
    const tracker = systemsData.trackers.find(t => t.id === goal.linkedTrackerId);
    if (tracker) {
      tracker.currentValue = value;
      systemsData.logs.push({
        id: createId("log"),
        title: goal.name,
        type: goal.category,
        value,
        unit: goal.unit,
        date: getTodayISO(),
        notes: `Goal: ${goal.name}`,
        linkedHabitId: goal.linkedHabitId || "",
        linkedPlannerBlockId: "",
        trackerId: goal.linkedTrackerId
      });
    }
  }
  saveSystemsData();
  renderSystems();
}

function renderGoalsList() {
  const box = document.getElementById("goalsList");
  if (!box) return;

  if (!systemsData.goals.length) {
    box.innerHTML = `<div class="empty-state"><p>No goals saved yet.</p><button onclick="openSystemsForm('goal')">Create first goal</button></div>`;
    return;
  }

  box.innerHTML = `<div class="systems-card-grid">${systemsData.goals.map((goal, index) => {
    const current = getGoalCurrentValue(goal);
    const target = getGoalTargetValue(goal);
    const pct = getGoalProgress(goal);
    const status = getGoalStatus(goal);
    const unit = escapeHTML(goal.unit || "");
    const projection = getGoalProjection(goal);
    const linkedTracker = goal.linkedTrackerId
      ? systemsData.trackers.find(t => t.id === goal.linkedTrackerId)
      : null;
    const linkedHabit = goal.linkedHabitId
      ? systemsData.habits.find(h => h.id === goal.linkedHabitId)
      : null;

    return `
      <div class="system-item goal-item">
        <div class="item-title">
          <strong>${escapeHTML(goal.name)}</strong>
          <span class="goal-status-badge goal-status-${status}">${status}</span>
        </div>
        <div class="goal-card-top">
          <div class="progress-ring small-ring" style="--pct:${pct}%"><span>${pct}%</span></div>
          <div>
            <p class="muted-text">${escapeHTML(goal.category)}</p>
            <p>${current} ${unit} → ${target} ${unit}</p>
            ${projection ? `<p class="muted-text">${escapeHTML(projection)}</p>` : ""}
          </div>
        </div>
        <div class="tracker-progress-bar">
          <div class="tracker-progress-fill goal-progress-fill-${status}" style="width:${pct}%"></div>
        </div>
        ${goal.deadline ? `<p>Deadline: <strong>${escapeHTML(goal.deadline)}</strong></p>` : ""}
        ${goal.recurringTarget ? `<p class="muted-text">Recurring target: ${escapeHTML(goal.recurringTarget)}</p>` : ""}
        ${linkedTracker ? `<p class="muted-text">Linked tracker: ${escapeHTML(linkedTracker.name)}</p>` : ""}
        ${linkedHabit ? `<p class="muted-text">Linked habit: ${escapeHTML(linkedHabit.name)}</p>` : ""}
        ${goal.milestones?.length ? `
          <div class="milestone-list">
            ${goal.milestones.map((milestone, milestoneIndex) => `
              <label class="${milestone.completed ? "complete" : ""}">
                <input type="checkbox" ${milestone.completed ? "checked" : ""} onchange="toggleGoalMilestone(${index}, ${milestoneIndex})">
                ${escapeHTML(milestone.title || "")}
              </label>
            `).join("")}
          </div>
        ` : ""}
        ${goal.notes ? `<p>${escapeHTML(goal.notes)}</p>` : ""}
        <div class="button-row three-actions">
          <button onclick="logGoalProgress(${index})">Log Progress</button>
          <button class="secondary-btn" onclick="scheduleGoalPlannerBlock(${index})">Plan</button>
          <button onclick="editGoal(${index})">Edit</button>
        </div>
        <div class="button-row">
          <button class="danger-btn" onclick="deleteGoal(${index})">Delete</button>
        </div>
      </div>
    `;
  }).join("")}</div>`;
}

function toggleGoalMilestone(goalIndex, milestoneIndex) {
  const goal = systemsData.goals[goalIndex];
  if (!goal || !goal.milestones?.[milestoneIndex]) return;
  goal.milestones[milestoneIndex].completed = !goal.milestones[milestoneIndex].completed;
  saveSystemsData();
  renderSystems();
}

function getGoalProjection(goal) {
  const current = getGoalCurrentValue(goal);
  const target = getGoalTargetValue(goal);
  if (isNaN(current) || isNaN(target) || !goal.deadline) return "";
  const today = getTodayISO();
  const daysLeft = Math.max(Math.ceil((new Date(`${goal.deadline}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000), 0);
  const remaining = target - current;
  if (daysLeft === 0) return remaining <= 0 ? "Goal complete by deadline." : "Deadline is today.";
  const pace = remaining / daysLeft;
  if (remaining <= 0) return "Goal is complete.";
  return `${roundForDisplay(pace)} ${goal.unit || "units"}/day needed for ${daysLeft} days`;
}

function scheduleGoalPlannerBlock(index) {
  const goal = systemsData.goals[index];
  if (!goal) return;
  const date = getTodayISO();
  const freeSlot = getFreeSlots(date, 30)[0];
  const start = freeSlot?.start || "17:00";
  const end = freeSlot?.end || "17:30";
  const block = {
    id: createId("block"),
    title: goal.name,
    date,
    start,
    end,
    category: goal.category === "Fitness" ? "Gym" : goal.category === "Study" ? "School" : "Personal",
    notes: `Suggested from Systems goal${goal.deadline ? ` due ${goal.deadline}` : ""}`,
    completed: false,
    type: "goal",
    systemGoalId: goal.id,
    tasks: (goal.milestones || []).filter(item => !item.completed).slice(0, 3).map(item => ({
      text: item.title,
      completed: false
    }))
  };
  scheduleData.blocks.push(block);
  goal.linkedPlannerBlockId = block.id;
  addBufferBlocksForDate(date);
  saveScheduleData();
  saveSystemsData();
  activePlannerSection = "Day";
  selectedPlannerDate = date;
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
}

// ---------------- METRICS ----------------

function saveMetric() {
  const name = document.getElementById("metricName")?.value.trim();
  const type = document.getElementById("metricType")?.value;
  if (!name) { alert("Add a metric name."); return; }
  const unit = document.getElementById("metricUnit")?.value.trim() || "";
  const startValue = document.getElementById("metricStartValue")?.value || "";
  const currentValue = document.getElementById("metricCurrentValue")?.value || "0";
  const targetValue = document.getElementById("metricTargetValue")?.value || "";
  const recurringTarget = document.getElementById("metricRecurringTarget")?.value.trim() || "";
  const startDate = document.getElementById("metricStartDate")?.value || "";
  const deadline = document.getElementById("metricDeadline")?.value || "";
  const linkedHabitId = document.getElementById("metricLinkedHabit")?.value || "";
  const notes = document.getElementById("metricNotes")?.value.trim() || "";

  if (editingTrackerIndex !== null) {
    const orig = systemsData.trackers[editingTrackerIndex];
    systemsData.trackers[editingTrackerIndex] = {
      id: orig.id, name, type: orig.type, unit, startValue, currentValue,
      targetValue, startDate, targetDate: deadline, recurringTarget, notes
    };
    editingTrackerIndex = null;
  } else if (editingGoalIndex !== null) {
    const orig = systemsData.goals[editingGoalIndex];
    systemsData.goals[editingGoalIndex] = {
      id: orig.id, name, category: orig.category, startValue, currentValue,
      targetValue, unit, startDate, deadline, recurringTarget,
      linkedTrackerId: orig.linkedTrackerId || "", linkedHabitId,
      linkedPlannerBlockId: orig.linkedPlannerBlockId || "",
      milestones: orig.milestones || [],
      notes
    };
    editingGoalIndex = null;
  } else if (editingMetricIndex !== null) {
    const orig = systemsData.metrics[editingMetricIndex];
    systemsData.metrics[editingMetricIndex] = {
      ...orig, name, type, unit, startValue, currentValue,
      targetValue, startDate, deadline, linkedHabitId, recurringTarget, notes
    };
    editingMetricIndex = null;
  } else if (type === "Numeric") {
    systemsData.trackers.push({
      id: createId("tracker"), name, type: "Custom", unit,
      startValue, currentValue, targetValue, startDate, targetDate: deadline, recurringTarget, notes
    });
  } else if (type === "Progress") {
    systemsData.goals.push({
      id: createId("goal"), name, category: "Custom", startValue, currentValue,
      targetValue, unit, startDate, deadline, recurringTarget,
      linkedTrackerId: "", linkedHabitId, linkedPlannerBlockId: "", milestones: [], notes
    });
  } else {
    systemsData.metrics.push({
      id: createId("metric"), name, type, unit,
      startValue, currentValue: type === "Counter" ? "0" : currentValue,
      targetValue, startDate, deadline, linkedHabitId, recurringTarget, notes, entries: []
    });
  }

  activeSystemsForm = null;
  saveSystemsData();
  activeSystemsSection = "Metrics";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function resetMetricForm() {
  editingMetricIndex = null;
  editingTrackerIndex = null;
  editingGoalIndex = null;
  activeSystemsSection = "Metrics";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function editMetric(index) {
  openSystemsForm("metric", index);
}

function deleteMetric(index) {
  if (!confirm("Delete this metric?")) return;
  systemsData.metrics.splice(index, 1);
  saveSystemsData();
  renderSystems();
}

function fillEditingMetricForm() {
  const el = id => document.getElementById(id);
  if (!el("metricName")) return;
  if (editingTrackerIndex !== null) {
    const t = systemsData.trackers[editingTrackerIndex];
    if (!t) return;
    el("metricName").value = t.name;
    el("metricType").value = "Numeric";
    el("metricUnit").value = t.unit;
    el("metricStartValue").value = t.startValue;
    el("metricCurrentValue").value = t.currentValue;
    el("metricTargetValue").value = t.targetValue;
    if (el("metricRecurringTarget")) el("metricRecurringTarget").value = t.recurringTarget || "";
    el("metricStartDate").value = t.startDate;
    el("metricDeadline").value = t.targetDate;
    if (el("metricLinkedHabit")) el("metricLinkedHabit").value = "";
    el("metricNotes").value = t.notes;
    el("metricSaveButton").textContent = "Update Tracker";
  } else if (editingGoalIndex !== null) {
    const g = systemsData.goals[editingGoalIndex];
    if (!g) return;
    el("metricName").value = g.name;
    el("metricType").value = "Progress";
    el("metricUnit").value = g.unit;
    el("metricStartValue").value = g.startValue || "";
    el("metricCurrentValue").value = g.currentValue;
    el("metricTargetValue").value = g.targetValue;
    if (el("metricRecurringTarget")) el("metricRecurringTarget").value = g.recurringTarget || "";
    el("metricStartDate").value = g.startDate;
    el("metricDeadline").value = g.deadline;
    if (el("metricLinkedHabit")) el("metricLinkedHabit").value = g.linkedHabitId;
    el("metricNotes").value = g.notes;
    el("metricSaveButton").textContent = "Update Goal";
  } else if (editingMetricIndex !== null) {
    const m = systemsData.metrics[editingMetricIndex];
    if (!m) return;
    el("metricName").value = m.name;
    el("metricType").value = m.type;
    el("metricUnit").value = m.unit;
    el("metricStartValue").value = m.startValue;
    el("metricCurrentValue").value = m.currentValue;
    el("metricTargetValue").value = m.targetValue;
    if (el("metricRecurringTarget")) el("metricRecurringTarget").value = m.recurringTarget || "";
    el("metricStartDate").value = m.startDate;
    el("metricDeadline").value = m.deadline;
    if (el("metricLinkedHabit")) el("metricLinkedHabit").value = m.linkedHabitId;
    el("metricNotes").value = m.notes;
    el("metricSaveButton").textContent = "Update Metric";
  }
}

function incrementCounter(index) {
  const metric = systemsData.metrics[index];
  if (!metric) return;
  metric.currentValue = String((Number(metric.currentValue) || 0) + 1);
  if (!Array.isArray(metric.entries)) metric.entries = [];
  const today = getTodayISO();
  const todayEntry = metric.entries.find(e => e.date === today);
  if (todayEntry) {
    todayEntry.value = String(Number(todayEntry.value || 0) + 1);
  } else {
    metric.entries.push({ date: today, value: "1" });
  }
  saveSystemsData();
  renderSystems();
}

function resetCounter(index) {
  const metric = systemsData.metrics[index];
  if (!metric) return;
  if (!confirm("Reset counter to 0?")) return;
  metric.currentValue = "0";
  saveSystemsData();
  renderSystems();
}

function toggleBoolean(index) {
  const metric = systemsData.metrics[index];
  if (!metric) return;
  const today = getTodayISO();
  if (!Array.isArray(metric.entries)) metric.entries = [];
  const existing = metric.entries.find(e => e.date === today);
  if (existing) {
    existing.value = existing.value === "1" ? "0" : "1";
  } else {
    metric.entries.push({ date: today, value: "1" });
  }
  saveSystemsData();
  renderSystems();
}

function logMetricTime(index) {
  const metric = systemsData.metrics[index];
  if (!metric) return;
  const raw = prompt(`Log minutes for "${metric.name}":`);
  if (raw === null || raw.trim() === "") return;
  const minutes = Number(raw.trim());
  if (isNaN(minutes) || minutes <= 0) return;
  if (!Array.isArray(metric.entries)) metric.entries = [];
  metric.entries.push({ date: getTodayISO(), value: String(minutes) });
  saveSystemsData();
  renderSystems();
}

function logNewMetricValue(index) {
  const metric = systemsData.metrics[index];
  if (!metric) return;
  const raw = prompt(`New value for "${metric.name}" (${metric.unit || "unit"}):`);
  if (raw === null || raw.trim() === "") return;
  metric.currentValue = raw.trim();
  if (!Array.isArray(metric.entries)) metric.entries = [];
  metric.entries.push({ date: getTodayISO(), value: raw.trim() });
  saveSystemsData();
  renderSystems();
}

function renderMetricsList() {
  const box = document.getElementById("metricsList");
  if (!box) return;
  const trackerItems = systemsData.trackers.map((t, i) => renderMetricTrackerRow(t, i));
  const goalItems = systemsData.goals.map((g, i) => renderMetricGoalRow(g, i));
  const metricItems = systemsData.metrics.map((m, i) => renderMetricRow(m, i));
  const all = [...trackerItems, ...goalItems, ...metricItems];
  box.innerHTML = all.length
    ? all.join("")
    : `<div class="empty-state"><p>No metrics yet.</p><button onclick="openSystemsForm('metric')">Add first metric</button></div>`;
}

function renderMetricTrackerRow(tracker, index) {
  const pct = getTrackerProgress(tracker);
  const unit = escapeHTML(tracker.unit || "");
  const linkedLogs = systemsData.logs
    .filter(log => log.trackerId === tracker.id || log.title === tracker.name)
    .map(getLogNumber)
    .filter(value => !isNaN(value))
    .slice(-10);
  return `
    <div class="system-item">
      <div class="item-title">
        <strong>${escapeHTML(tracker.name)}</strong>
        <span class="metric-type-pill metric-type-numeric">Numeric</span>
      </div>
      <p>${escapeHTML(String(tracker.currentValue))} ${unit} → ${escapeHTML(String(tracker.targetValue))} ${unit}</p>
      <div class="tracker-progress-bar">
        <div class="tracker-progress-fill" style="width:${pct}%"></div>
      </div>
      <p class="tracker-pct">${pct}% complete</p>
      ${linkedLogs.length ? renderMiniBars(linkedLogs) : ""}
      ${tracker.targetDate ? `<p>Target: ${escapeHTML(tracker.targetDate)}</p>` : ""}
      ${tracker.recurringTarget ? `<p class="muted-text">Recurring target: ${escapeHTML(tracker.recurringTarget)}</p>` : ""}
      ${tracker.notes ? `<p>${escapeHTML(tracker.notes)}</p>` : ""}
      <div class="button-row three-actions">
        <button onclick="logTrackerValue(${index})">Log</button>
        <button onclick="editTracker(${index})">Edit</button>
        <button class="danger-btn" onclick="deleteTracker(${index})">Delete</button>
      </div>
    </div>
  `;
}

function renderMetricGoalRow(goal, index) {
  const pct = getGoalProgress(goal);
  const status = getGoalStatus(goal);
  const current = getGoalCurrentValue(goal);
  const target = getGoalTargetValue(goal);
  const unit = escapeHTML(goal.unit || "");
  return `
    <div class="system-item goal-item">
      <div class="item-title">
        <strong>${escapeHTML(goal.name)}</strong>
        <span class="metric-type-pill metric-type-progress">Goal</span>
      </div>
      <p>${current} ${unit} → ${target} ${unit}</p>
      <div class="tracker-progress-bar">
        <div class="tracker-progress-fill goal-progress-fill-${status}" style="width:${pct}%"></div>
      </div>
      <p class="tracker-pct">${pct}% • <span class="goal-status-badge goal-status-${status}">${status}</span></p>
      ${goal.deadline ? `<p>Deadline: ${escapeHTML(goal.deadline)}</p>` : ""}
      ${goal.recurringTarget ? `<p class="muted-text">Recurring target: ${escapeHTML(goal.recurringTarget)}</p>` : ""}
      ${goal.notes ? `<p>${escapeHTML(goal.notes)}</p>` : ""}
      <div class="button-row three-actions">
        <button onclick="logGoalProgress(${index})">Log</button>
        <button onclick="editGoal(${index})">Edit</button>
        <button class="danger-btn" onclick="deleteGoal(${index})">Delete</button>
      </div>
    </div>
  `;
}

function renderMetricRow(metric, index) {
  const type = metric.type;
  const unit = escapeHTML(metric.unit || "");
  const typeLabels = { Counter: "Counter", Boolean: "Daily", Time: "Time", Milestone: "Milestone" };
  const typeLabel = typeLabels[type] || type;
  const typeCls = (type || "").toLowerCase();
  const values = (metric.entries || []).map(entry => Number(entry.value)).filter(value => !isNaN(value)).slice(-14);
  const trend = getValuesTrend(values);
  let body = "";
  let actions = "";

  if (type === "Counter") {
    const count = Number(metric.currentValue) || 0;
    body = `<p class="metric-counter-value">${count}${unit ? " " + unit : ""}</p>`;
    actions = `
      <div class="button-row">
        <button onclick="incrementCounter(${index})">+1</button>
        <button class="secondary-btn" onclick="resetCounter(${index})">Reset</button>
      </div>
      <div class="button-row">
        <button onclick="editMetric(${index})">Edit</button>
        <button class="danger-btn" onclick="deleteMetric(${index})">Delete</button>
      </div>`;
  } else if (type === "Boolean") {
    const today = getTodayISO();
    const entry = (metric.entries || []).find(e => e.date === today);
    const done = entry && entry.value === "1";
    body = `<p>${done ? "Done today" : "Not done yet"}</p>`;
    actions = `
      <div class="button-row three-actions">
        <button onclick="toggleBoolean(${index})">${done ? "Undo" : "Mark Done"}</button>
        <button onclick="editMetric(${index})">Edit</button>
        <button class="danger-btn" onclick="deleteMetric(${index})">Delete</button>
      </div>`;
  } else if (type === "Time") {
    const totalMin = (metric.entries || []).reduce((s, e) => s + Number(e.value || 0), 0);
    const target = Number(metric.targetValue) || 0;
    const pct = target > 0 ? Math.min(100, Math.round((totalMin / target) * 100)) : 0;
    body = `
      <p>${totalMin} / ${target || "?"} ${unit || "min"}</p>
      ${target > 0 ? `<div class="tracker-progress-bar"><div class="tracker-progress-fill" style="width:${pct}%"></div></div><p class="tracker-pct">${pct}%</p>` : ""}`;
    actions = `
      <div class="button-row three-actions">
        <button onclick="logMetricTime(${index})">Log Time</button>
        <button onclick="editMetric(${index})">Edit</button>
        <button class="danger-btn" onclick="deleteMetric(${index})">Delete</button>
      </div>`;
  } else if (type === "Milestone") {
    body = metric.notes ? `<p>${escapeHTML(metric.notes)}</p>` : "";
    actions = `
      <div class="button-row">
        <button onclick="editMetric(${index})">Edit</button>
        <button class="danger-btn" onclick="deleteMetric(${index})">Delete</button>
      </div>`;
  } else {
    const pct = metric.targetValue
      ? Math.min(100, Math.max(0, Math.round((Number(metric.currentValue) / Number(metric.targetValue)) * 100)))
      : 0;
    body = `
      <p>${escapeHTML(String(metric.currentValue || 0))} ${unit}</p>
      ${metric.targetValue ? `<div class="tracker-progress-bar"><div class="tracker-progress-fill" style="width:${pct}%"></div></div><p class="tracker-pct">${pct}%</p>` : ""}`;
    actions = `
      <div class="button-row three-actions">
        <button onclick="logNewMetricValue(${index})">Log</button>
        <button onclick="editMetric(${index})">Edit</button>
        <button class="danger-btn" onclick="deleteMetric(${index})">Delete</button>
      </div>`;
  }

  return `
    <div class="system-item">
      <div class="item-title">
        <strong>${escapeHTML(metric.name)}</strong>
        <span class="metric-type-pill metric-type-${typeCls}">${typeLabel} ${trend}</span>
      </div>
      ${body}
      ${values.length ? renderMiniBars(values) : ""}
      ${metric.recurringTarget ? `<p class="muted-text">Recurring target: ${escapeHTML(metric.recurringTarget)}</p>` : ""}
      ${metric.deadline ? `<p>Deadline: ${escapeHTML(metric.deadline)}</p>` : ""}
      ${actions}
    </div>
  `;
}

function getValuesTrend(values) {
  if (values.length < 4) return "→";
  const midpoint = Math.floor(values.length / 2);
  const first = average(values.slice(0, midpoint));
  const second = average(values.slice(midpoint));
  if (second > first) return "↑";
  if (second < first) return "↓";
  return "→";
}

function getHabitStreak(habit) {
  let streak = 0;
  let date = getTodayISO();

  while (streak < 365) {
    if (!habit.completions.includes(date)) break;
    streak++;
    date = getDateOffset(date, -1);
  }

  return streak;
}

function renderHomeTimeline() {
  const box = document.getElementById("homeTimeline");
  if (!box) return;

  const todayBlocks = scheduleData.blocks
    .filter(block => block.date === getTodayISO())
    .sort((a, b) => a.start.localeCompare(b.start));

  box.innerHTML = todayBlocks.length
    ? todayBlocks.map(block => `
      <div class="home-list-item">
        <strong>${escapeHTML(block.start)}-${escapeHTML(block.end)} ${escapeHTML(block.title)}</strong>
        <p>${block.tasks.length ? block.tasks.map(task => escapeHTML(task.text)).join(", ") : escapeHTML(block.category)}</p>
      </div>
    `).join("")
    : "<p>No Planner blocks scheduled today.</p>";
}

function renderHomeSnapshot() {
  const box = document.getElementById("homeSnapshot");
  if (!box) return;
  const today = getTodayISO();
  const blocks = scheduleData.blocks.filter(block => block.date === today && !block.isBuffer);
  const habitsDone = systemsData.habits.filter(habit => habit.completions.includes(today)).length;
  const upcomingHangouts = socialData.hangouts.filter(hangout =>
    !hangout.completed && hangout.date && hangout.date >= today
  ).length;

  box.innerHTML = `
    <div class="summary-grid">
      <div><strong>${blocks.length}</strong><span>Blocks today</span></div>
      <div><strong>${habitsDone}/${systemsData.habits.length}</strong><span>Habits done</span></div>
      <div><strong>${formatMinutes(getDayWorkload(today).totalMinutes)}</strong><span>Planned</span></div>
      <div><strong>${upcomingHangouts}</strong><span>Hangouts ahead</span></div>
    </div>
  `;
}

function renderHomeSystemsHabits() {
  const box = document.getElementById("homeSystemsHabits");
  if (!box) return;
  const today = getTodayISO();

  box.innerHTML = systemsData.habits.length
    ? systemsData.habits.map(habit => `
      <div class="home-list-item">
        <strong>${escapeHTML(habit.name)}</strong>
        <p>${habit.completions.includes(today) ? "Done today" : "Not done yet"} • ${getHabitStreak(habit)} streak</p>
      </div>
    `).join("")
    : "<p>No Systems habits yet.</p>";
}

function renderHomeUpcomingHangouts() {
  const box = document.getElementById("homeUpcomingHangouts");
  if (!box) return;
  const today = getTodayISO();
  const upcoming = socialData.hangouts
    .filter(hangout => !hangout.completed && hangout.date && hangout.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  box.innerHTML = upcoming.length
    ? upcoming.map(hangout => `
      <div class="home-list-item">
        <strong>${escapeHTML(hangout.activity)}</strong>
        <p>${escapeHTML(hangout.date)} ${escapeHTML(hangout.time || "")} • ${hangout.people.map(escapeHTML).join(", ")}</p>
      </div>
    `).join("")
    : "<p>No upcoming hangouts.</p>";
}

function renderHomeSuggestions() {
  const box = document.getElementById("homeSuggestions");
  if (!box) return;
  const today = getTodayISO();
  const todayDay = new Date().getDay();

  const unfinishedTask = scheduleData.blocks
    .filter(block => block.date === today && !block.isBuffer)
    .flatMap(block => block.tasks.map(task => ({ task, block })))
    .find(item => !item.task.completed);

  const unfinishedHabit = systemsData.habits.find(habit =>
    !habit.completions.includes(today)
  );

  const friendSuggestion = getFriendSuggestions().find(item => {
    const daysSince = getDaysSince(item.friend.lastSeen);
    return daysSince === null || daysSince >= 21;
  });

  const upcomingHangout = socialData.hangouts
    .filter(hangout => !hangout.completed && hangout.date && hangout.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const freeSlots = getFreeSlots(today, 30);
  const nextFreeSlot = freeSlots[0] || null;

  const pendingRoutine = scheduleData.routines.find(routine =>
    routine.repeatDays.includes(todayDay) &&
    !scheduleData.blocks.some(b => b.date === today && b.routineId === routine.id)
  );

  const suggestions = [
    pendingRoutine ? `Routine not started: ${pendingRoutine.name}` : "",
    unfinishedTask ? `Finish: ${unfinishedTask.task.text} (${unfinishedTask.block.title})` : "",
    unfinishedHabit ? `Complete habit: ${unfinishedHabit.name}` : "",
    friendSuggestion ? `Reach out: ${friendSuggestion.friend.name} (${friendSuggestion.reason})` : "",
    upcomingHangout ? `Next hangout: ${upcomingHangout.activity} on ${upcomingHangout.date}` : "",
    nextFreeSlot ? `Use your next free slot: ${nextFreeSlot.start}-${nextFreeSlot.end}` : ""
  ].filter(Boolean);

  box.innerHTML = suggestions.length
    ? `<div class="home-focus-preview"><strong>${escapeHTML(suggestions[0])}</strong><p>Best single nudge based on your planner, habits, and social data.</p></div>`
    : `<div class="empty-state small"><p>No smart suggestion yet.</p><button onclick="openPlannerSection('Day')">Create time block</button></div>`;
}

function renderHomeStats() {
  const box = document.getElementById("homeStats");
  if (!box) return;
  const today = getTodayISO();
  const completedToday = systemsData.habits.filter(habit => habit.completions.includes(today)).length;
  const bestHabitStreak = systemsData.habits.reduce((best, habit) =>
    Math.max(best, getHabitStreak(habit)), 0);
  const monthPrefix = today.slice(0, 7);
  const socialThisMonth = socialData.hangouts.filter(hangout =>
    hangout.completed && hangout.date && hangout.date.startsWith(monthPrefix)
  ).length;

  box.innerHTML = `
    <div class="summary-grid">
      <div><strong>${completedToday}</strong><span>Habits today</span></div>
      <div><strong>${bestHabitStreak}</strong><span>Best habit streak</span></div>
      <div><strong>${systemsData.logs.length}</strong><span>System logs</span></div>
      <div><strong>${socialThisMonth}</strong><span>Social month</span></div>
    </div>
  `;
}

function getDayName(dayIndex) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayIndex] || "";
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function addPlan() {
  const title = document.getElementById("planTitle").value;
  const date = document.getElementById("planDate").value;
  const time = document.getElementById("planTime").value;
  const category = document.getElementById("planCategory").value;
  const notes = document.getElementById("planNotes").value;

  if (!title) return;

  plannerData.plans.push({ title, date, time, category, notes });
  savePlannerData();
  activePlannerSection = "Day";
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
}

function renderAllPlans() {
  const box = document.getElementById("plansList");

  box.innerHTML = plannerData.plans.map((p, i) => `
    <div class="card draggable-plan" draggable="true" data-index="${i}">
      <strong>${p.title}</strong>
      <p>${p.date || "No date"} ${p.time || ""}</p>
      <p>${p.category}</p>
      <p>${p.notes || ""}</p>
      <button onclick="deletePlan(${i})">Delete</button>
    </div>
  `).join("");

  enablePlanDragDrop();
}
function enablePlanDragDrop() {
  const items = document.querySelectorAll(".draggable-plan");

  items.forEach(item => {
    item.addEventListener("dragstart", () => {
      item.classList.add("dragging");
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      saveNewPlanOrder();
    });
  });

  const box = document.getElementById("plansList");

  box.addEventListener("dragover", e => {
    e.preventDefault();

    const dragging = document.querySelector(".dragging");
    const afterElement = getDragAfterElement(box, e.clientY);

    if (!afterElement) {
      box.appendChild(dragging);
    } else {
      box.insertBefore(dragging, afterElement);
    }
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll(".draggable-plan:not(.dragging)")];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;

    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function saveNewPlanOrder() {
  const items = document.querySelectorAll(".draggable-plan");

  plannerData.plans = [...items].map(item => {
    const oldIndex = item.dataset.index;
    return plannerData.plans[oldIndex];
  });

  savePlannerData();
  renderPlanner();
}

function deletePlan(i) {
  plannerData.plans.splice(i, 1);
  savePlannerData();
  renderPlanner();
}

// WEEK
function renderWeeklyCalendar() {
  const box = document.getElementById("weeklyCalendar");
  const today = new Date();
  let html = "";

  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(today.getDate() - today.getDay() + i);
    const iso = d.toISOString().split("T")[0];

    const plans = plannerData.plans.filter(p => p.date === iso);

    html += `
      <div class="calendar-item">
        <strong>${d.toDateString()}</strong>
        ${plans.map(p => `<p>${p.time} - ${p.title}</p>`).join("")}
      </div>
    `;
  }

  box.innerHTML = html;
}

// MONTH
function renderMonthlyCalendar() {
  const box = document.getElementById("monthlyCalendar");
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  let html = `<div class="month-grid">`;

  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d);
    if (date.getMonth() !== month) break;

    const iso = date.toISOString().split("T")[0];
    const count = plannerData.plans.filter(p => p.date === iso).length;

    html += `
      <div class="month-day">
        ${d}
        ${count ? `<small>${count}</small>` : ""}
      </div>
    `;
  }

  html += `</div>`;
  box.innerHTML = html;
}

// ---------------- SOCIAL ----------------

function renderSocial() {
  fillEditingSocialForms();
  populateHangoutPeopleSelect();
  renderSelectedHangoutPeopleChips();
  renderFriendSuggestions();
  renderNeglectedFriends();
  renderMostSeenMonth();
  renderSocialBalance();
  renderSocialInsights();
  renderIdeas();
  renderFriends();
  renderHangouts();
}

function toggleFriendForm() {
  friendFormOpen = !friendFormOpen;
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function toggleHangoutForm() {
  hangoutFormOpen = !hangoutFormOpen;
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function saveFriend() {
  const name = document.getElementById("friendName").value.trim();
  if (!name) return;

  const friend = {
    name,
    priority: document.getElementById("friendPriority").value,
    lastSeen: document.getElementById("friendLastSeen").value,
    interests: document.getElementById("friendInterests").value.trim(),
    details: document.getElementById("friendDetails").value.trim(),
    favoriteActivities: document.getElementById("friendFavoriteActivities").value.trim(),
    contactNotes: document.getElementById("friendContactNotes").value.trim(),
    notes: document.getElementById("friendNotes").value.trim()
  };

  if (editingFriendIndex === null) {
    socialData.friends.push(friend);
  } else {
    const oldName = socialData.friends[editingFriendIndex].name;
    socialData.friends[editingFriendIndex] = friend;
    socialData.hangouts.forEach(hangout => {
      hangout.people = hangout.people.map(person => person === oldName ? name : person);
    });
  }

  editingFriendIndex = null;
  friendFormOpen = false;
  saveSocialData();
  activeSocialSection = "Friends";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function renderFriends() {
  const box = document.getElementById("friendsList");
  if (!box) return;

  const search = document.getElementById("friendSearch")?.value.trim().toLowerCase() || "";
  const priorityFilter = document.getElementById("friendPriorityFilter")?.value || "All";
  const sort = document.getElementById("friendSort")?.value || "name";
  const priorityRank = { High: 1, Medium: 2, Low: 3 };
  const friends = socialData.friends
    .map((friend, index) => ({ friend, index }))
    .filter(({ friend }) =>
      (!search || [
        friend.name,
        friend.interests,
        friend.favoriteActivities,
        friend.notes,
        friend.details
      ].join(" ").toLowerCase().includes(search)) &&
      (priorityFilter === "All" || friend.priority === priorityFilter)
    )
    .sort((a, b) => {
      if (sort === "lastSeen") return (b.friend.lastSeen || "").localeCompare(a.friend.lastSeen || "");
      if (sort === "priority") return (priorityRank[a.friend.priority] || 9) - (priorityRank[b.friend.priority] || 9);
      return a.friend.name.localeCompare(b.friend.name);
    });

  box.innerHTML = friends.length
    ? friends.map(({ friend: f, index: i }) => `
    <div class="social-item">
      <div class="item-title">
        <strong>${escapeHTML(f.name)}</strong>
        <span class="priority-pill ${f.priority.toLowerCase()}">${escapeHTML(f.priority)}</span>
      </div>
      <p>Last seen: ${f.lastSeen || "Not logged yet"}</p>
      <p>${escapeHTML(f.favoriteActivities || "")}</p>
      <div class="button-row three-actions">
        <button onclick="toggleFriendDetail(${i})">View</button>
        <button onclick="editFriend(${i})">Edit</button>
        <button class="danger-btn" onclick="deleteFriend(${i})">Delete</button>
      </div>
      ${viewingFriendIndex === i ? renderFriendDetail(f) : ""}
    </div>
  `).join("")
    : "<p>No friends match those filters.</p>";
}

function renderFriendDetail(friend) {
  const relatedHangouts = socialData.hangouts
    .filter(hangout => hangout.people.includes(friend.name))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 5);

  return `
    <div class="detail-panel">
      <p><strong>Interests:</strong> ${escapeHTML(friend.interests || "None added")}</p>
      <p><strong>Details:</strong> ${escapeHTML(friend.details || "None added")}</p>
      <p><strong>Notes:</strong> ${escapeHTML(friend.notes || "None added")}</p>
      <p><strong>Contact:</strong> ${escapeHTML(friend.contactNotes || "None added")}</p>
      <p><strong>Favorite activities:</strong> ${escapeHTML(friend.favoriteActivities || "None added")}</p>
      <p><strong>Related hangouts:</strong></p>
      ${
        relatedHangouts.length
          ? relatedHangouts.map(h => `<p>${escapeHTML(h.date || "No date")} - ${escapeHTML(h.activity)}</p>`).join("")
          : "<p>No related hangouts yet.</p>"
      }
    </div>
  `;
}

function toggleFriendDetail(index) {
  viewingFriendIndex = viewingFriendIndex === index ? null : index;
  renderFriends();
}

function editFriend(i) {
  editingFriendIndex = i;
  friendFormOpen = true;
  activeSocialSection = "Friends";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function resetFriendForm() {
  editingFriendIndex = null;
  friendFormOpen = false;
  activeSocialSection = "Friends";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function deleteFriend(i) {
  const friendName = socialData.friends[i].name;
  if (!confirm(`Delete ${friendName}?`)) return;
  socialData.friends.splice(i, 1);
  socialData.hangouts.forEach(hangout => {
    hangout.people = hangout.people.filter(person => person !== friendName);
  });
  saveSocialData();
  activeSocialSection = "Friends";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function getSelectedHangoutPeople() {
  const select = document.getElementById("hangoutPeopleSelect");
  if (!select) return [];
  return [...select.selectedOptions].map(option => option.value);
}

function populateHangoutPeopleSelect(selectedPeople = getSelectedHangoutPeople()) {
  const select = document.getElementById("hangoutPeopleSelect");
  if (!select) return;
  const search = document.getElementById("hangoutFriendSearch")?.value.trim().toLowerCase() || "";
  const selectedSet = new Set(selectedPeople);
  const friends = socialData.friends.filter(friend =>
    !search || friend.name.toLowerCase().includes(search)
  );

  select.innerHTML = friends.length
    ? friends.map(friend => `
      <option value="${escapeHTML(friend.name)}" ${selectedSet.has(friend.name) ? "selected" : ""}>${escapeHTML(friend.name)}</option>
    `).join("")
    : `<option disabled>No friends match</option>`;

  renderSelectedHangoutPeopleChips();
}

function renderSelectedHangoutPeopleChips() {
  const box = document.getElementById("selectedHangoutPeopleChips");
  if (!box) return;
  const people = getSelectedHangoutPeople();
  box.innerHTML = people.length
    ? people.map(person => `<span class="chip">${escapeHTML(person)}</span>`).join("")
    : "<span class=\"muted-text\">No friends selected.</span>";
}

function saveHangout() {
  const activity = document.getElementById("hangoutActivity").value.trim();
  const date = document.getElementById("hangoutDate").value;
  const time = document.getElementById("hangoutTime").value;
  const location = document.getElementById("hangoutLocation").value.trim();
  const people = getSelectedHangoutPeople();
  const cost = document.getElementById("hangoutCost").value.trim();
  const notes = document.getElementById("hangoutNotes").value.trim();

  if (!activity || !people.length) return;

  const hangout = {
    activity,
    date,
    time,
    location,
    people,
    cost,
    notes,
    completed: editingHangoutIndex === null ? false : socialData.hangouts[editingHangoutIndex].completed
  };

  if (editingHangoutIndex === null) {
    socialData.hangouts.push(hangout);
  } else {
    socialData.hangouts[editingHangoutIndex] = hangout;
  }

  if (date && time && editingHangoutIndex === null) {
    const endTime = minutesToTime(timeToMinutes(time) + 60);
    const overlaps = getBlocksOnDate(date).filter(b =>
      !b.isBuffer && blocksOverlap(b.start, b.end, time, endTime)
    );
    const alreadySynced = scheduleData.blocks.some(b =>
      b.date === date && b.type === "social" && b.title === activity
    );
    if (!alreadySynced) {
      if (overlaps.length) {
        alert(`Note: This hangout overlaps with "${overlaps[0].title}" in your Planner. It has been added anyway.`);
      }
      scheduleData.blocks.push({
        id: createId("block"),
        title: activity,
        date,
        start: time,
        end: endTime,
        category: "Social",
        notes: `With: ${people.join(", ")}${location ? " at " + location : ""}`,
        type: "social",
        completed: false,
        tasks: []
      });
      addBufferBlocksForDate(date);
      saveScheduleData();
    }
  }

  editingHangoutIndex = null;
  hangoutFormOpen = false;
  saveSocialData();
  activeSocialSection = "Hangouts";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function getFreeSlots(date, minDuration = 30) {
  const dayStart = timeToMinutes("06:00");
  const dayEnd = timeToMinutes("23:00");
  const blocks = scheduleData.blocks
    .filter(b => b.date === date && !b.isBuffer)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const slots = [];
  let cursor = dayStart;
  for (const block of blocks) {
    const bStart = timeToMinutes(block.start);
    const bEnd = timeToMinutes(block.end);
    if (bStart - cursor >= minDuration) {
      slots.push({ start: minutesToTime(cursor), end: minutesToTime(bStart) });
    }
    cursor = Math.max(cursor, bEnd);
  }
  if (dayEnd - cursor >= minDuration) {
    slots.push({ start: minutesToTime(cursor), end: minutesToTime(dayEnd) });
  }
  return slots;
}

function getBlocksOnDate(date) {
  return scheduleData.blocks.filter(b => b.date === date);
}

function blocksOverlap(aStart, aEnd, bStart, bEnd) {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) &&
    timeToMinutes(aEnd) > timeToMinutes(bStart);
}

function renderHangoutFreeSlots() {
  const box = document.getElementById("hangoutFreeSlots");
  if (!box) return;
  const dateInput = document.getElementById("hangoutDate");
  const date = dateInput ? dateInput.value : "";
  if (!date) { box.innerHTML = ""; return; }
  const slots = getFreeSlots(date, 30);
  if (!slots.length) {
    box.innerHTML = "<p class='muted-text'>No free slots found for that day.</p>";
    return;
  }
  box.innerHTML = `
    <p class="muted-text" style="margin-bottom:4px">Free slots on this day:</p>
    <div class="free-slots-row">
      ${slots.map(s => `
        <button class="slot-chip" onclick="applyFreeSlot('${s.start}','${s.end}')">${s.start}–${s.end}</button>
      `).join("")}
    </div>
  `;
}

function applyFreeSlot(start, end) {
  const timeInput = document.getElementById("hangoutTime");
  if (timeInput) timeInput.value = start;
}

function renderHangouts() {
  const box = document.getElementById("hangoutsList");
  if (!box) return;

  const search = document.getElementById("hangoutSearch")?.value.trim().toLowerCase() || "";
  const statusFilter = document.getElementById("hangoutStatusFilter")?.value || "All";
  const sort = document.getElementById("hangoutSort")?.value || "newest";
  const hangouts = socialData.hangouts
    .map((hangout, index) => ({ hangout, index }))
    .filter(({ hangout }) => {
      const status = hangout.completed ? "Completed" : "Planned";
      const searchable = [
        hangout.activity,
        hangout.date,
        hangout.time,
        hangout.location,
        hangout.cost,
        hangout.notes,
        hangout.people.join(" ")
      ].join(" ").toLowerCase();

      return (!search || searchable.includes(search)) &&
        (statusFilter === "All" || statusFilter === status);
    })
    .sort((a, b) => {
      const aDate = `${a.hangout.date || ""} ${a.hangout.time || ""}`;
      const bDate = `${b.hangout.date || ""} ${b.hangout.time || ""}`;
      return sort === "oldest" ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
    });

  box.innerHTML = hangouts.length
    ? hangouts.map(({ hangout: h, index: i }) => `
    <div class="social-item">
      <div class="item-title">
        <strong>${escapeHTML(h.activity)}</strong>
        <span>${h.completed ? "Logged" : "Planned"}</span>
      </div>
      <p>${h.date || "No date"} ${h.time || ""}</p>
      <p>${escapeHTML(h.location || "")}</p>
      <p>${h.people.map(escapeHTML).join(", ")}</p>
      <p>${escapeHTML(h.cost || "")}</p>
      <div class="button-row">
        <button onclick="toggleHangoutDetail(${i})">View/Edit</button>
        <button onclick="logHangout(${i})">${h.completed ? "Update Log" : "Log Completed"}</button>
      </div>
      <button class="secondary-btn" onclick="scheduleHangoutInPlanner(${i})">Schedule in Planner</button>
      <button class="danger-btn" onclick="deleteHangout(${i})">Delete</button>
      ${viewingHangoutIndex === i ? renderHangoutDetail(h, i) : ""}
    </div>
  `).join("")
    : "<p>No hangouts match those filters.</p>";
}

function renderHangoutDetail(hangout, index) {
  return `
    <div class="detail-panel">
      <p><strong>People:</strong> ${hangout.people.map(escapeHTML).join(", ") || "None"}</p>
      <p><strong>Location:</strong> ${escapeHTML(hangout.location || "None added")}</p>
      <p><strong>Cost:</strong> ${escapeHTML(hangout.cost || "None added")}</p>
      <p><strong>Notes:</strong> ${escapeHTML(hangout.notes || "None added")}</p>
      <button onclick="editHangout(${index})">Edit Hangout</button>
    </div>
  `;
}

function toggleHangoutDetail(index) {
  viewingHangoutIndex = viewingHangoutIndex === index ? null : index;
  renderHangouts();
}

function scheduleHangoutInPlanner(index) {
  const hangout = socialData.hangouts[index];
  const date = hangout.date || getTodayISO();
  const start = hangout.time || "18:00";
  const end = hangout.time ? minutesToTime(timeToMinutes(hangout.time) + 60) : "19:00";
  const notes = [
    hangout.people.length ? `People: ${hangout.people.join(", ")}` : "",
    hangout.location ? `Location: ${hangout.location}` : "",
    hangout.cost ? `Cost: ${hangout.cost}` : "",
    hangout.notes ? `Notes: ${hangout.notes}` : ""
  ].filter(Boolean).join("\n");

  scheduleData.blocks.push({
    id: createId("block"),
    title: hangout.activity,
    date,
    start,
    end,
    category: "Social",
    notes,
    completed: false,
    tasks: [{
      text: hangout.activity,
      completed: false
    }]
  });

  addBufferBlocksForDate(date);
  saveScheduleData();
  alert("Hangout scheduled in Planner.");
}

function editHangout(i) {
  editingHangoutIndex = i;
  hangoutFormOpen = true;
  activeSocialSection = "Hangouts";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function resetHangoutForm() {
  editingHangoutIndex = null;
  hangoutFormOpen = false;
  activeSocialSection = "Hangouts";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function logHangout(i) {
  const hangout = socialData.hangouts[i];
  const seenDate = hangout.date || getTodayISO();
  hangout.completed = true;
  hangout.date = seenDate;

  socialData.friends.forEach(friend => {
    if (hangout.people.includes(friend.name)) {
      friend.lastSeen = seenDate;
    }
  });

  saveSocialData();
  renderSocial();
}

function deleteHangout(i) {
  socialData.hangouts.splice(i, 1);
  saveSocialData();
  renderSocial();
}

// IDEAS
function saveIdea() {
  const title = document.getElementById("ideaTitle").value.trim();
  const category = document.getElementById("ideaCategory").value;
  const cost = document.getElementById("ideaCost").value.trim();
  const notes = document.getElementById("ideaNotes").value.trim();
  const favorite = document.getElementById("ideaFavorite").checked;

  if (!title) return;

  const idea = {
    title,
    category,
    cost,
    notes,
    favorite
  };

  if (editingIdeaIndex === null) {
    socialData.ideas.push(idea);
  } else {
    socialData.ideas[editingIdeaIndex] = idea;
  }

  editingIdeaIndex = null;
  saveSocialData();
  activeSocialSection = "Ideas";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function renderIdeas() {
  const box = document.getElementById("ideasList");
  if (!box) return;

  box.innerHTML = socialData.ideas.length
    ? socialData.ideas.map((idea, i) => `
    <div class="social-item">
      <div class="item-title">
        <strong>${escapeHTML(idea.favorite ? `* ${idea.title}` : idea.title)}</strong>
        <span>${escapeHTML(idea.category)}</span>
      </div>
      <p>${escapeHTML(idea.cost || "")}</p>
      <p>${escapeHTML(idea.notes || "")}</p>
      <div class="button-row">
        <button onclick="useIdea(${i})">Turn into Hangout</button>
        <button onclick="toggleIdeaFavorite(${i})">${idea.favorite ? "Unfavorite" : "Favorite"}</button>
      </div>
      <div class="button-row">
        <button onclick="editIdea(${i})">Edit</button>
        <button class="danger-btn" onclick="deleteIdea(${i})">Delete</button>
      </div>
    </div>
  `).join("")
    : "<p>No ideas saved yet.</p>";
}

function useIdea(i) {
  const idea = socialData.ideas[i];
  activeSocialSection = "Hangouts";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
  document.getElementById("hangoutActivity").value = idea.title;
  document.getElementById("hangoutCost").value = idea.cost;
  document.getElementById("hangoutNotes").value = idea.notes;
}

function editIdea(i) {
  editingIdeaIndex = i;
  activeSocialSection = "Ideas";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function resetIdeaForm() {
  editingIdeaIndex = null;
  activeSocialSection = "Ideas";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function toggleIdeaFavorite(i) {
  socialData.ideas[i].favorite = !socialData.ideas[i].favorite;
  saveSocialData();
  renderSocial();
}

function deleteIdea(i) {
  socialData.ideas.splice(i, 1);
  saveSocialData();
  renderSocial();
}

function fillEditingSocialForms() {
  if (editingFriendIndex !== null) {
    if (!document.getElementById("friendName")) return;
    const friend = socialData.friends[editingFriendIndex];
    document.getElementById("friendName").value = friend.name;
    document.getElementById("friendPriority").value = friend.priority;
    document.getElementById("friendLastSeen").value = friend.lastSeen || "";
    document.getElementById("friendInterests").value = friend.interests || "";
    document.getElementById("friendDetails").value = friend.details || "";
    document.getElementById("friendFavoriteActivities").value = friend.favoriteActivities || "";
    document.getElementById("friendContactNotes").value = friend.contactNotes || "";
    document.getElementById("friendNotes").value = friend.notes || "";
    document.getElementById("friendSaveButton").textContent = "Update Friend";
  }

  if (editingHangoutIndex !== null) {
    if (!document.getElementById("hangoutActivity")) return;
    const hangout = socialData.hangouts[editingHangoutIndex];
    document.getElementById("hangoutActivity").value = hangout.activity;
    document.getElementById("hangoutDate").value = hangout.date || "";
    document.getElementById("hangoutTime").value = hangout.time || "";
    document.getElementById("hangoutLocation").value = hangout.location || "";
    document.getElementById("hangoutCost").value = hangout.cost || "";
    document.getElementById("hangoutNotes").value = hangout.notes || "";
    populateHangoutPeopleSelect(hangout.people);
    renderSelectedHangoutPeopleChips();
    document.getElementById("hangoutSaveButton").textContent = "Update Hangout";
  }

  if (editingIdeaIndex !== null) {
    if (!document.getElementById("ideaTitle")) return;
    const idea = socialData.ideas[editingIdeaIndex];
    document.getElementById("ideaTitle").value = idea.title;
    document.getElementById("ideaCategory").value = idea.category;
    document.getElementById("ideaCost").value = idea.cost || "";
    document.getElementById("ideaNotes").value = idea.notes || "";
    document.getElementById("ideaFavorite").checked = idea.favorite;
    document.getElementById("ideaSaveButton").textContent = "Update Idea";
  }
}

function renderSocialInsights() {
  const box = document.getElementById("socialInsights");
  if (!box) return;

  const monthPrefix = getTodayISO().slice(0, 7);
  const completedThisMonth = socialData.hangouts.filter(hangout =>
    hangout.completed && hangout.date && hangout.date.startsWith(monthPrefix)
  );
  const friendsSeenThisMonth = [...new Set(completedThisMonth.flatMap(h => h.people))];
  const notSeenRecently = socialData.friends
    .filter(friend => getDaysSince(friend.lastSeen) === null || getDaysSince(friend.lastSeen) >= 21)
    .map(friend => friend.name);
  const priorityCounts = socialData.friends.reduce((counts, friend) => {
    counts[friend.priority] = (counts[friend.priority] || 0) + 1;
    return counts;
  }, {});

  const scores = socialData.friends.map(f => computeFriendScore(f).score);
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
  const topFriend = getFriendSuggestions()[0];

  box.innerHTML = `
    <div class="summary-grid">
      <div><strong>${completedThisMonth.length}</strong><span>Hangouts this month</span></div>
      <div><strong>${friendsSeenThisMonth.length}</strong><span>Friends seen this month</span></div>
      <div><strong>${socialData.hangouts.length}</strong><span>Total hangouts</span></div>
      <div><strong>${notSeenRecently.length}</strong><span>Neglected friends</span></div>
      <div><strong>${avgScore}</strong><span>Avg friend score</span></div>
      <div><strong>${socialData.friends.length}</strong><span>Total friends</span></div>
    </div>
    <p><strong>Top suggestion:</strong> ${topFriend ? `${escapeHTML(topFriend.friend.name)} (score ${topFriend.score})` : "Add friends to get suggestions."}</p>
    <p><strong>Priority balance:</strong> High ${priorityCounts.High || 0} · Medium ${priorityCounts.Medium || 0} · Low ${priorityCounts.Low || 0}</p>
    <p><strong>Hangout frequency:</strong> ${getHangoutFrequencyText()}</p>
  `;
}

function renderFriendSuggestions() {
  const box = document.getElementById("friendSuggestions");
  if (!box) return;

  const suggestions = getFriendSuggestions().slice(0, 5);

  box.innerHTML = suggestions.length
    ? suggestions.map(item => {
        const { score } = computeFriendScore(item.friend);
        return `
          <div class="suggestion-item">
            <div class="item-title">
              <strong>${escapeHTML(item.friend.name)}</strong>
              <span class="score-badge">Score ${score}</span>
            </div>
            <p>${escapeHTML(item.reason)}</p>
          </div>
        `;
      }).join("")
    : "<p>Add friends to get suggestions.</p>";
}

function renderNeglectedFriends() {
  const box = document.getElementById("neglectedFriends");
  if (!box) return;

  const sorted = socialData.friends
    .map(friend => ({ friend, daysSince: getDaysSince(friend.lastSeen) }))
    .sort((a, b) => {
      if (a.daysSince === null && b.daysSince === null) return 0;
      if (a.daysSince === null) return -1;
      if (b.daysSince === null) return 1;
      return b.daysSince - a.daysSince;
    })
    .slice(0, 5);

  box.innerHTML = sorted.length
    ? sorted.map(({ friend, daysSince }) => `
        <div class="social-item-row">
          <strong>${escapeHTML(friend.name)}</strong>
          <span class="muted-text">${daysSince === null ? "Never seen" : `${daysSince} days ago`}</span>
        </div>
      `).join("")
    : "<p>No friends added yet.</p>";
}

function renderMostSeenMonth() {
  const box = document.getElementById("mostSeenMonth");
  if (!box) return;

  const monthPrefix = getTodayISO().slice(0, 7);
  const counts = {};
  socialData.hangouts
    .filter(h => h.completed && h.date && h.date.startsWith(monthPrefix))
    .forEach(h => h.people.forEach(p => { counts[p] = (counts[p] || 0) + 1; }));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  box.innerHTML = sorted.length
    ? sorted.map(([name, count]) => `
        <div class="social-item-row">
          <strong>${escapeHTML(name)}</strong>
          <span class="muted-text">${count} hangout${count === 1 ? "" : "s"}</span>
        </div>
      `).join("")
    : "<p>No completed hangouts logged this month.</p>";
}

function renderSocialBalance() {
  const box = document.getElementById("socialBalance");
  if (!box) return;

  const counts = {};
  socialData.friends.forEach(f => { counts[f.name] = 0; });
  socialData.hangouts
    .filter(h => h.completed)
    .forEach(h => h.people.forEach(p => {
      if (Object.prototype.hasOwnProperty.call(counts, p)) counts[p]++;
    }));

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = sorted.length ? sorted[0][1] : 1;

  box.innerHTML = sorted.length
    ? sorted.map(([name, count]) => `
        <div class="balance-row">
          <span class="balance-name">${escapeHTML(name)}</span>
          <div class="balance-bar-bg">
            <div class="balance-bar-fill" style="width:${max ? Math.round((count / max) * 100) : 0}%"></div>
          </div>
          <span class="balance-count muted-text">${count}</span>
        </div>
      `).join("")
    : "<p>No friends added yet.</p>";
}

function computeFriendScore(friend) {
  const priorityPoints = { High: 60, Medium: 35, Low: 15 }[friend.priority] || 25;
  const daysSince = getDaysSince(friend.lastSeen);
  const recencyPoints = daysSince === null ? 90 : Math.min(daysSince, 90);
  const score = priorityPoints + recencyPoints;
  const reasonDays = daysSince === null
    ? "never seen"
    : `${daysSince}d ago`;
  return { score, priorityPoints, recencyPoints, daysSince, reasonDays };
}

function getFriendSuggestions() {
  return socialData.friends
    .map(friend => {
      const { score, reasonDays } = computeFriendScore(friend);
      return {
        friend,
        score,
        reason: `${friend.priority} priority · ${reasonDays}`
      };
    })
    .sort((a, b) => b.score - a.score);
}

function getDaysSince(dateString) {
  if (!dateString) return null;
  const [year, month, day] = dateString.split("-").map(Number);
  const seenDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  seenDate.setHours(0, 0, 0, 0);
  return Math.max(Math.floor((today - seenDate) / 86400000), 0);
}

function getHangoutFrequencyText() {
  const completed = socialData.hangouts.filter(hangout => hangout.completed && hangout.date);
  if (!completed.length) return "No completed hangouts logged yet.";

  const sortedDates = completed
    .map(hangout => hangout.date)
    .sort();
  const firstDate = sortedDates[0];
  const daysSinceFirst = Math.max(getDaysSince(firstDate), 1);
  const perWeek = Math.round((completed.length / Math.max(daysSinceFirst / 7, 1)) * 10) / 10;

  return `${perWeek} completed hangout${perWeek === 1 ? "" : "s"} per week`;
}

function showSocialImportMode(mode) {
  document.getElementById("socialImportFileMode")?.classList.toggle("hidden", mode !== "file");
  document.getElementById("socialImportPasteMode")?.classList.toggle("hidden", mode !== "paste");
  pendingSocialImport = null;
  renderSocialImportPreview(null);
}

function handleSocialImportFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => previewSocialImport(String(reader.result || ""), file.name);
  reader.onerror = () => {
    pendingSocialImport = null;
    renderSocialImportPreview(null);
    showToast("Could not read that file.", "error");
  };
  reader.readAsText(file);
}

function previewSocialImportFromTextarea() {
  const raw = document.getElementById("hangoutPlannerImportJson")?.value.trim();
  if (!raw) {
    pendingSocialImport = null;
    renderSocialImportPreview(null);
    showToast("Paste JSON first.", "error");
    return;
  }
  previewSocialImport(raw, "Pasted JSON");
}

function previewSocialImportFromLocalStorage() {
  const savedJSON = localStorage.getItem("hangout-planner-v1") || localStorage.getItem("flowSocialData");
  if (!savedJSON) {
    pendingSocialImport = null;
    renderSocialImportPreview(null);
    showToast("No social import data found in this browser localStorage.", "error");
    return;
  }
  previewSocialImport(savedJSON, localStorage.getItem("hangout-planner-v1") ? "hangout-planner-v1 localStorage" : "flowSocialData localStorage");
}

function previewSocialImport(rawJSON, sourceLabel) {
  try {
    const parsed = parseSocialImportJSON(rawJSON);
    const normalized = normalizeSocialImportPayload(parsed);
    pendingSocialImport = {
      ...normalized,
      sourceLabel
    };
    renderSocialImportPreview(pendingSocialImport);
    showToast(`Preview ready: ${normalized.friends.length} friends, ${normalized.hangouts.length} hangouts, ${normalized.ideas.length} ideas.`);
  } catch (error) {
    pendingSocialImport = null;
    renderSocialImportPreview(null, error.message);
    showToast(error.message || "Invalid JSON.", "error");
  }
}

function parseSocialImportJSON(sourceJSON) {
  let raw = String(sourceJSON || "").trim();

  if (!raw) {
    throw new Error("No JSON found.");
  }

  if (raw.startsWith("`") && raw.endsWith("`")) {
    raw = raw.slice(1, -1).trim();
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1) {
    raw = raw.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("Invalid JSON. Check for missing commas, extra text, or an incomplete file.");
  }
}

function normalizeSocialImportPayload(data) {
  const source = data && data.socialData && typeof data.socialData === "object"
    ? data.socialData
    : data;

  if (!source || typeof source !== "object") {
    throw new Error("Import must be a JSON object.");
  }

  const oldFriends = Array.isArray(source.friends) ? source.friends : [];
  const oldHangouts = Array.isArray(source.hangouts) ? source.hangouts : [];
  const oldIdeas = Array.isArray(source.ideas) ? source.ideas : [];

  if (!oldFriends.length && !oldHangouts.length && !oldIdeas.length) {
    throw new Error("No friends, hangouts, or ideas were found in that JSON.");
  }

  const looksLikeFlowSocial = oldFriends.some(friend => "lastSeen" in friend || "favoriteActivities" in friend || "contactNotes" in friend) ||
    oldHangouts.some(hangout => "activity" in hangout && "people" in hangout) ||
    oldIdeas.some(idea => "favorite" in idea);

  if (looksLikeFlowSocial) {
    const normalized = normalizeSocialBackupData({
      friends: oldFriends,
      hangouts: oldHangouts,
      ideas: oldIdeas
    });

    return {
      friends: normalized.friends.filter(friend => friend.name),
      hangouts: normalized.hangouts.filter(hangout => hangout.activity),
      ideas: normalized.ideas.filter(idea => idea.title)
    };
  }

  const oldFriendNamesById = oldFriends.reduce((map, friend) => {
    if (friend.id && friend.name) map[String(friend.id)] = friend.name;
    return map;
  }, {});

  return {
    friends: oldFriends.map(convertHangoutFriend).filter(friend => friend.name),
    hangouts: oldHangouts.map(hangout => convertHangoutEvent(hangout, oldFriendNamesById)).filter(hangout => hangout.activity),
    ideas: oldIdeas.map(convertHangoutIdea).filter(idea => idea.title)
  };
}

function renderSocialImportPreview(importData, errorMessage = "") {
  const box = document.getElementById("socialImportPreview");
  const button = document.getElementById("socialImportConfirmButton");
  if (!box) return;

  if (button) button.disabled = !importData;

  if (!importData) {
    box.innerHTML = errorMessage
      ? `<p class="import-error">${escapeHTML(errorMessage)}</p>`
      : "<p>No import preview yet.</p>";
    return;
  }

  box.innerHTML = `
    <p class="muted-text">Preview from ${escapeHTML(importData.sourceLabel || "JSON")}</p>
    <div class="summary-grid import-count-grid">
      <div><strong>${importData.friends.length}</strong><span>Friends</span></div>
      <div><strong>${importData.hangouts.length}</strong><span>Hangouts</span></div>
      <div><strong>${importData.ideas.length}</strong><span>Ideas</span></div>
    </div>
    <p class="muted-text">Nothing is imported until you press Import Previewed Data.</p>
  `;
}

function importHangoutPlannerData() {
  const raw = document.getElementById("hangoutPlannerImportJson")?.value.trim() || localStorage.getItem("hangout-planner-v1") || "";
  previewSocialImport(raw, "Legacy import");
  confirmSocialImport();
}

function confirmSocialImport() {
  if (!pendingSocialImport) {
    showToast("Preview a JSON file, pasted JSON, or browser localStorage before importing.", "error");
    return;
  }

  const importedFriends = pendingSocialImport.friends;
  const importedHangouts = pendingSocialImport.hangouts;
  const importedIdeas = pendingSocialImport.ideas;
  const existingFriendNames = new Set(socialData.friends.map(friend =>
    normalizeDuplicateKey(friend.name)
  ));
  let addedFriends = 0;
  let addedHangouts = 0;
  let addedIdeas = 0;
  let skippedFriends = 0;
  let skippedHangouts = 0;
  let skippedIdeas = 0;

  importedFriends.forEach(friend => {
    const key = normalizeDuplicateKey(friend.name);
    if (!existingFriendNames.has(key)) {
      socialData.friends.push(friend);
      existingFriendNames.add(key);
      addedFriends++;
    } else {
      skippedFriends++;
    }
  });

  const existingHangouts = new Set(socialData.hangouts.map(getHangoutDuplicateKey));
  importedHangouts.forEach(hangout => {
    const key = getHangoutDuplicateKey(hangout);
    if (!existingHangouts.has(key)) {
      socialData.hangouts.push(hangout);
      existingHangouts.add(key);
      addedHangouts++;
    } else {
      skippedHangouts++;
    }
  });

  const existingIdeas = new Set(socialData.ideas.map(idea =>
    normalizeDuplicateKey(idea.title)
  ));
  importedIdeas.forEach(idea => {
    const key = normalizeDuplicateKey(idea.title);
    if (!existingIdeas.has(key)) {
      socialData.ideas.push(idea);
      existingIdeas.add(key);
      addedIdeas++;
    } else {
      skippedIdeas++;
    }
  });

  saveSocialData();
  pendingSocialImport = null;
  renderSocialImportPreview(null);
  const fileInput = document.getElementById("socialImportFile");
  const textInput = document.getElementById("hangoutPlannerImportJson");
  if (fileInput) fileInput.value = "";
  if (textInput) textInput.value = "";
  showToast(`Imported ${addedFriends} friends, ${addedHangouts} hangouts, and ${addedIdeas} ideas. Skipped ${skippedFriends + skippedHangouts + skippedIdeas} duplicates.`);
}

function convertHangoutFriend(friend) {
  return {
    name: friend.name || "",
    priority: normalizePriority(friend.priority),
    interests: joinValue(friend.interests),
    details: [
      friend.birthday ? `Birthday: ${friend.birthday}` : "",
      friend.favorite_food_drinks ? `Favorite food/drinks: ${joinValue(friend.favorite_food_drinks)}` : "",
      friend.budget_level ? `Budget: ${friend.budget_level}` : "",
      friend.availability ? `Availability: ${friend.availability}` : "",
      friend.dislikes ? `Dislikes: ${joinValue(friend.dislikes)}` : "",
      friend.gift_ideas ? `Gift ideas: ${joinValue(friend.gift_ideas)}` : "",
      friend.memories ? `Memories: ${joinValue(friend.memories)}` : ""
    ].filter(Boolean).join("\n"),
    notes: friend.notes || friend.next_idea || "",
    favoriteActivities: joinValue(friend.favorites || friend.favorite_food_drinks),
    contactNotes: friend.contact_info || "",
    lastSeen: friend.last_hangout || ""
  };
}

function convertHangoutEvent(hangout, friendNamesById) {
  const people = Array.isArray(hangout.friendIds)
    ? hangout.friendIds.map(id => friendNamesById[String(id)]).filter(Boolean)
    : [];
  const checklist = Array.isArray(hangout.shared_checklist)
    ? hangout.shared_checklist.map(item => typeof item === "string" ? item : item.text || item.title || "").filter(Boolean).join(", ")
    : joinValue(hangout.shared_checklist);

  return {
    activity: hangout.activity || "",
    date: hangout.date || "",
    time: hangout.time || "",
    location: hangout.location || "",
    people,
    cost: hangout.actual_cost || hangout.estimated_cost || "",
    notes: [
      hangout.notes || "",
      hangout.mood ? `Mood: ${hangout.mood}` : "",
      checklist ? `Checklist: ${checklist}` : ""
    ].filter(Boolean).join("\n"),
    completed: hangout.status === "Completed"
  };
}

function convertHangoutIdea(idea) {
  return {
    title: idea.title || "",
    category: idea.category || "Cheap",
    cost: idea.estimated_cost || "",
    notes: [
      idea.notes || "",
      idea.timing ? `Timing: ${idea.timing}` : "",
      idea.friend_connections ? `Friends: ${joinValue(idea.friend_connections)}` : ""
    ].filter(Boolean).join("\n"),
    favorite: false
  };
}

function exportCurrentSocialData() {
  const json = JSON.stringify(socialData, null, 2);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(json).catch(() => {});
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "flow-social-data.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Social data exported.");
}

function showToast(message, type = "success") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-hide");
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

function getHangoutDuplicateKey(hangout) {
  return [
    hangout.date || "",
    normalizeDuplicateKey(hangout.activity),
    [...hangout.people].sort().map(normalizeDuplicateKey).join("|")
  ].join("::");
}

function normalizeDuplicateKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePriority(priority) {
  const value = String(priority || "").trim().toLowerCase();
  if (value === "high") return "High";
  if (value === "low") return "Low";
  return "Medium";
}

function joinValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (value && typeof value === "object") return Object.values(value).filter(Boolean).join(", ");
  return value || "";
}

function getFullDataBackup() {
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    plannerData,
    scheduleData,
    systemsData,
    socialData
  };
}

function downloadJSON(filename, data) {
  const json = JSON.stringify(data, null, 2);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(json).catch(() => {});
  }
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadFullBackup() {
  downloadJSON(`flow-planner-backup-${getTodayISO()}.json`, getFullDataBackup());
  alert("Flow Planner backup downloaded.");
}

function exportAllData() {
  downloadFullBackup();
}

function importAllData() {
  const textarea = document.getElementById("allDataImportJson");
  const raw = textarea ? textarea.value.trim() : "";
  if (!raw) {
    alert("Paste a Flow Planner backup JSON first.");
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const backup = normalizeFullBackup(parsed);
    plannerData = backup.plannerData;
    scheduleData = backup.scheduleData;
    systemsData = backup.systemsData;
    socialData = backup.socialData;
    saveScheduleData();
    saveSystemsData();
    saveSocialData();
    savePlannerData();
    selectedPlannerDate = getTodayISO();
    visiblePlannerMonth = selectedPlannerDate.slice(0, 7);
    editingPlanIndex = null;
    editingRoutineIndex = null;
    editingBlockIndex = null;
    editingHabitIndex = null;
    editingTrackerIndex = null;
    editingGoalIndex = null;
    editingMetricIndex = null;
    alert("Flow Planner backup restored.");
    main.innerHTML = getPageHTML("Settings");
  } catch (error) {
    alert(error.message || "Could not import that JSON backup.");
  }
}

function normalizeFullBackup(parsed) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Backup must be a JSON object.");
  }

  const hasAllSections = ["plannerData", "scheduleData", "systemsData", "socialData"]
    .every(key => parsed[key] && typeof parsed[key] === "object");

  if (!hasAllSections) {
    throw new Error("Backup must include plannerData, scheduleData, systemsData, and socialData.");
  }

  return {
    plannerData: normalizePlannerBackupData(parsed.plannerData),
    scheduleData: normalizeScheduleBackupData(parsed.scheduleData),
    systemsData: normalizeSystemsBackupData(parsed.systemsData),
    socialData: normalizeSocialBackupData(parsed.socialData)
  };
}

function normalizePlannerBackupData(data) {
  return {
    plans: Array.isArray(data.plans)
      ? data.plans.map(plan => ({
          title: plan.title || "",
          date: plan.date || "",
          time: plan.time || "",
          category: plan.category || "Personal",
          notes: plan.notes || ""
        }))
      : []
  };
}

function normalizeScheduleBackupData(data) {
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  const routines = Array.isArray(data.routines) ? data.routines : [];

  return {
    ...data,
    blocks: blocks.map(block => ({
      ...block,
      id: block.id || createId("block"),
      title: block.title || "",
      date: block.date || "",
      start: block.start || "",
      end: block.end || "",
      category: block.category || "Personal",
      notes: block.notes || "",
      type: block.type || (block.routineId ? "routine" : "task"),
      completed: Boolean(block.completed),
      tasks: Array.isArray(block.tasks) ? block.tasks.map(normalizeTask) : [],
      isBuffer: Boolean(block.isBuffer)
    })),
    routines: routines.map(routine => ({
      ...routine,
      id: routine.id || createId("routine"),
      name: routine.name || "",
      type: routine.type || "Custom",
      start: routine.start || "",
      end: routine.end || "",
      repeatDays: Array.isArray(routine.repeatDays) ? routine.repeatDays.map(Number).filter(day => day >= 0 && day <= 6) : [],
      dayTimes: routine.dayTimes && typeof routine.dayTimes === "object" ? routine.dayTimes : {},
      tasks: Array.isArray(routine.tasks) ? routine.tasks : [],
      notes: routine.notes || "",
      autoAdd: Boolean(routine.autoAdd),
      completions: routine.completions && typeof routine.completions === "object" ? routine.completions : {},
      completedDates: Array.isArray(routine.completedDates) ? routine.completedDates : [],
      streak: typeof routine.streak === "number" ? routine.streak : 0
    })),
    bufferMinutes: typeof data.bufferMinutes === "number" ? data.bufferMinutes : 15
  };
}

function normalizeSystemsBackupData(data) {
  return {
    habits: Array.isArray(data.habits) ? data.habits.map(habit => ({
      ...habit,
      id: habit.id || createId("habit"),
      name: habit.name || "",
      category: habit.category || "",
      frequency: habit.frequency || "Daily",
      targetFrequency: habit.targetFrequency || habit.frequency || "Daily",
      target: habit.target || "",
      unit: habit.unit || "",
      linkedGoalId: habit.linkedGoalId || "",
      paused: Boolean(habit.paused),
      skippedDates: Array.isArray(habit.skippedDates) ? habit.skippedDates : [],
      completionHistory: Array.isArray(habit.completionHistory) ? habit.completionHistory : [],
      notes: habit.notes || "",
      completions: Array.isArray(habit.completions) ? habit.completions : []
    })) : [],
    logs: Array.isArray(data.logs) ? data.logs.map(log => ({
      ...log,
      id: log.id || createId("log"),
      title: log.title || "",
      type: log.type || "Custom",
      valueType: log.valueType || log.type || "Custom",
      value: log.value || "",
      unit: log.unit || "",
      date: log.date || "",
      notes: log.notes || "",
      linkedHabitId: log.linkedHabitId || "",
      linkedPlannerBlockId: log.linkedPlannerBlockId || ""
    })) : [],
    trackers: Array.isArray(data.trackers) ? data.trackers.map(tracker => ({
      ...tracker,
      id: tracker.id || createId("tracker"),
      name: tracker.name || "",
      type: tracker.type || "Custom",
      unit: tracker.unit || "",
      notes: tracker.notes || ""
    })) : [],
    goals: Array.isArray(data.goals) ? data.goals.map(goal => ({
      ...goal,
      id: goal.id || createId("goal"),
      name: goal.name || "",
      category: goal.category || "Custom",
      unit: goal.unit || "",
      linkedPlannerBlockId: goal.linkedPlannerBlockId || "",
      milestones: Array.isArray(goal.milestones) ? goal.milestones : [],
      recurringTarget: goal.recurringTarget || "",
      notes: goal.notes || ""
    })) : [],
    metrics: Array.isArray(data.metrics) ? data.metrics.map(metric => ({
      ...metric,
      id: metric.id || createId("metric"),
      name: metric.name || "",
      type: metric.type || "Counter",
      unit: metric.unit || "",
      recurringTarget: metric.recurringTarget || "",
      notes: metric.notes || "",
      entries: Array.isArray(metric.entries) ? metric.entries : []
    })) : []
  };
}

function normalizeSocialBackupData(data) {
  return {
    friends: Array.isArray(data.friends) ? data.friends.map(friend => ({
      name: friend.name || "",
      priority: friend.priority || "Medium",
      interests: friend.interests || "",
      details: friend.details || "",
      notes: friend.notes || "",
      favoriteActivities: friend.favoriteActivities || "",
      contactNotes: friend.contactNotes || "",
      lastSeen: friend.lastSeen || friend.lastHangout || ""
    })) : [],
    hangouts: Array.isArray(data.hangouts) ? data.hangouts.map(hangout => ({
      activity: hangout.activity || hangout.title || "",
      date: hangout.date || "",
      time: hangout.time || "",
      location: hangout.location || hangout.place || "",
      people: Array.isArray(hangout.people) ? hangout.people : (hangout.friend ? [hangout.friend] : []),
      cost: hangout.cost || "",
      notes: hangout.notes || "",
      completed: Boolean(hangout.completed)
    })) : [],
    ideas: Array.isArray(data.ideas) ? data.ideas.map(idea => ({
      title: idea.title || "",
      category: idea.category || "Cheap",
      cost: idea.cost || "",
      notes: idea.notes || "",
      favorite: Boolean(idea.favorite)
    })) : []
  };
}

// SETTINGS
function clearPlanner() {
  plannerData = { plans: [] };
  savePlannerData();
  alert("Planner cleared");
}

function clearSocial() {
  socialData = { friends: [], hangouts: [], ideas: [] };
  saveSocialData();
  alert("Social cleared");
}

function clearSystems() {
  systemsData = { habits: [], logs: [], trackers: [], goals: [], metrics: [] };
  saveSystemsData();
  alert("Systems cleared");
}
