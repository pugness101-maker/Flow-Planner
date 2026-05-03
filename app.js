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
  logs: []
};

if (!Array.isArray(systemsData.habits)) systemsData.habits = [];
if (!Array.isArray(systemsData.logs)) systemsData.logs = [];

systemsData.habits = systemsData.habits.map(habit => ({
  id: habit.id || createId("habit"),
  name: habit.name || "",
  category: habit.category || "",
  frequency: habit.frequency || "Daily",
  target: habit.target || "",
  notes: habit.notes || "",
  completions: Array.isArray(habit.completions) ? habit.completions : []
}));

systemsData.logs = systemsData.logs.map(log => ({
  id: log.id || createId("log"),
  title: log.title || "",
  type: log.type || "Custom",
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
});

scheduleData.routines.forEach(routine => {
  if (!routine.id) routine.id = createId("routine");
  if (!Array.isArray(routine.repeatDays)) routine.repeatDays = [];
  if (!Array.isArray(routine.tasks)) routine.tasks = [];
});

function saveScheduleData() {
  localStorage.setItem("flowScheduleData", JSON.stringify(scheduleData));
}

let editingPlanIndex = null;
let editingFriendIndex = null;
let editingHangoutIndex = null;
let editingRoutineIndex = null;
let editingIdeaIndex = null;
let editingHabitIndex = null;
let activePlannerSection = "Day";
let activeSystemsSection = "Habits";
let activeSocialSection = "Friends";
let friendFormOpen = false;
let hangoutFormOpen = false;
let viewingFriendIndex = null;
let viewingHangoutIndex = null;

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
    <div class="card">
      <h3>Today Snapshot</h3>
      <div id="homeSnapshot"></div>
    </div>
    <div class="card">
      <h3>Quick Add</h3>
      <div class="quick-add-grid">
        <button onclick="openPlannerSection('Day')">Time Block</button>
        <button onclick="openSystemsSection('Habits')">Habit</button>
        <button onclick="openSystemsSection('Logs')">Log</button>
        <button onclick="openSocialSection('Hangouts')">Hangout</button>
      </div>
    </div>
    <div class="card">
      <h3>Today Timeline</h3>
      <div id="homeTimeline"></div>
    </div>
    <div class="card">
      <h3>Systems Today</h3>
      <div id="homeSystemsHabits"></div>
    </div>
    <div class="card">
      <h3>Upcoming Hangouts</h3>
      <div id="homeUpcomingHangouts"></div>
    </div>
    <div class="card">
      <h3>Smart Suggestions</h3>
      <div id="homeSuggestions"></div>
    </div>
    <div class="card">
      <h3>Stats</h3>
      <div id="homeProductivitySummary"></div>
      <div id="homeStats"></div>
    </div>
  `,

  Planner: () => `
    ${renderSubTabs("Planner", ["Day", "Week", "Routines"], activePlannerSection)}
    ${activePlannerSection === "Day" ? `
      <div class="card">
        <h3>Add Time Block</h3>
        <input id="blockTitle" placeholder="Block title">
        <input id="blockDate" type="date">
        <input id="blockStart" type="time">
        <input id="blockEnd" type="time">
        <select id="blockCategory">
          <option>School</option>
          <option>Work</option>
          <option>Gym</option>
          <option>Social</option>
          <option>Personal</option>
          <option>Errand</option>
        </select>
        <textarea id="blockNotes" placeholder="Notes"></textarea>
        <button onclick="addTimeBlock()">Save Time Block</button>
      </div>
      <div class="card">
        <h3>Today Timeline</h3>
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
    ` : ""}
    ${activePlannerSection === "Week" ? `
      <div class="card">
        <h3>Weekly View</h3>
        <div id="weeklyView"></div>
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
          <label><input type="checkbox" name="routineDay" value="0"> Sun</label>
          <label><input type="checkbox" name="routineDay" value="1"> Mon</label>
          <label><input type="checkbox" name="routineDay" value="2"> Tue</label>
          <label><input type="checkbox" name="routineDay" value="3"> Wed</label>
          <label><input type="checkbox" name="routineDay" value="4"> Thu</label>
          <label><input type="checkbox" name="routineDay" value="5"> Fri</label>
          <label><input type="checkbox" name="routineDay" value="6"> Sat</label>
        </div>
        <textarea id="routineTasks" placeholder="Tasks/steps, one per line"></textarea>
        <textarea id="routineNotes" placeholder="Notes"></textarea>
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
    ${renderSubTabs("Systems", ["Habits", "Logs", "Insights"], activeSystemsSection)}
    ${activeSystemsSection === "Habits" ? `
      <div class="card">
        <h3>Add Habit</h3>
        <input id="habitName" placeholder="Habit name">
        <input id="habitCategory" placeholder="Category">
        <select id="habitFrequency">
          <option>Daily</option>
          <option>Weekdays</option>
          <option>Weekly</option>
          <option>Custom</option>
        </select>
        <input id="habitTarget" placeholder="Target">
        <textarea id="habitNotes" placeholder="Notes"></textarea>
        <button id="habitSaveButton" onclick="saveHabit()">Save Habit</button>
        <button class="secondary-btn" onclick="resetHabitForm()">Clear Habit Form</button>
      </div>
      <div class="card">
        <h3>Habit List</h3>
        <div id="habitsList"></div>
      </div>
    ` : ""}
    ${activeSystemsSection === "Logs" ? `
      <div class="card">
        <h3>Add Log</h3>
        <input id="logTitle" placeholder="Log title">
        <select id="logType">
          <option>Sleep</option>
          <option>Gym</option>
          <option>Spending</option>
          <option>Health</option>
          <option>Custom</option>
        </select>
        <input id="logValue" placeholder="Value">
        <input id="logUnit" placeholder="Unit, ex: min, $, hrs, reps">
        <input id="logDate" type="date">
        <textarea id="logNotes" placeholder="Notes"></textarea>
        <button onclick="saveSystemLog()">Save Log</button>
      </div>
      <div class="card">
        <h3>Log List</h3>
        <div id="systemsLogsList"></div>
      </div>
    ` : ""}
    ${activeSystemsSection === "Insights" ? `
      <div class="card">
        <h3>Systems Insights</h3>
        <div id="systemsDashboard"></div>
      </div>
    ` : ""}
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
          <input id="hangoutDate" type="date">
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
    <div class="card">
      <h3>Social Data Import</h3>
      <textarea id="hangoutPlannerImportJson" placeholder="Paste Hangout Planner JSON here, or leave blank to import from hangout-planner-v1 localStorage"></textarea>
      <button onclick="importHangoutPlannerData()">Import Hangout Planner Data</button>
      <button class="secondary-btn" onclick="exportCurrentSocialData()">Export Current Social Data</button>
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
    const tab = btn.innerText;
    setActiveBottomNav(tab);
    main.innerHTML = getPageHTML(tab);

    if (tab === "Home") renderHome();
    if (tab === "Planner") renderPlanner();
    if (tab === "Systems") renderSystems();
    if (tab === "Social") renderSocial();
  });
});

main.innerHTML = getPageHTML("Home");
setActiveBottomNav("Home");
renderHome();

function setActiveBottomNav(tab) {
  document.querySelectorAll(".bottom-nav button").forEach(button => {
    button.classList.toggle("active", button.innerText === tab);
  });
}

// ---------------- PLANNER ----------------

function renderPlanner() {
  fillBufferSetting();
  renderRoutines();
  renderTimeBlocks();
  renderFreeTime();
  renderOverlapWarnings();
  renderProductivitySummary("productivitySummary");
  renderWeeklyView();
  fillEditingRoutineForm();
}

function addTimeBlock() {
  const title = document.getElementById("blockTitle").value;
  const date = document.getElementById("blockDate").value;
  const start = document.getElementById("blockStart").value;
  const end = document.getElementById("blockEnd").value;
  const category = document.getElementById("blockCategory").value;
  const notes = document.getElementById("blockNotes").value;

  if (!title || !date || !start || !end) {
    alert("Add title, date, start, and end time.");
    return;
  }

  scheduleData.blocks.push({
    id: createId("block"),
    title,
    date,
    start,
    end,
    category,
    notes,
    completed: false,
    tasks: []
  });

  addBufferBlocksForDate(date);
  saveScheduleData();
  activePlannerSection = "Day";
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
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
  const today = getTodayISO();

  const blocks = scheduleData.blocks
    .map((block, index) => ({ block, index }))
    .filter(item => item.block.date === today)
    .sort((a, b) => a.block.start.localeCompare(b.block.start));

  box.innerHTML = blocks.length
    ? blocks.map(({ block, index }) => `
      <div class="timeline-block draggable-plan" draggable="true" data-index="${index}">
        <strong>${escapeHTML(block.start)} - ${escapeHTML(block.end)} | ${escapeHTML(block.title)}</strong>
        <p>${escapeHTML(block.category)}</p>
        <p>${escapeHTML(block.notes || "")}</p>

        <input id="taskInput${index}" placeholder="Add task inside this block">
        <button onclick="addTaskToBlock(${index})">Add Task</button>

        <div>
          ${
            block.tasks.length
              ? block.tasks.map((task, taskIndex) => `
                <div class="task-row ${task.completed ? "task-done" : ""}">
                  <label>
                    <input type="checkbox" ${task.completed ? "checked" : ""} onchange="toggleTaskComplete(${index}, ${taskIndex})">
                    ${escapeHTML(task.text)}
                  </label>
                  <button onclick="deleteTaskFromBlock(${index}, ${taskIndex})">x</button>
                </div>
              `).join("")
              : "<p>No tasks yet.</p>"
          }
        </div>

        <label class="block-complete">
          <input type="checkbox" ${block.completed ? "checked" : ""} onchange="toggleBlockComplete(${index})">
          Block complete
        </label>
        <button onclick="deleteTimeBlock(${index})">Delete Block</button>
      </div>
    `).join("")
    : "<p>No blocks for today.</p>";

  enableBlockDragDrop();
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
  saveScheduleData();
  renderPlanner();
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
  addBufferBlocksForDate(date);
  saveScheduleData();
  renderPlanner();
}

function renderFreeTime() {
  const box = document.getElementById("freeTimeBox");
  const today = getTodayISO();

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
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const normalized = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  const h = String(Math.floor(normalized / 60)).padStart(2, "0");
  const m = String(normalized % 60).padStart(2, "0");
  return `${h}:${m}`;
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

function saveNewBlockOrder() {
  const items = document.querySelectorAll(".draggable-plan");
  const todayIndexes = scheduleData.blocks
    .map((block, index) => ({ block, index }))
    .filter(item => item.block.date === getTodayISO())
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
  addBufferBlocksForDate(getTodayISO());
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

  const warnings = getOverlapWarnings(getTodayISO());

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

  const routine = {
    id: editingRoutineIndex === null
      ? createId("routine")
      : scheduleData.routines[editingRoutineIndex].id,
    name,
    type,
    start,
    end,
    repeatDays,
    tasks,
    notes
  };

  if (editingRoutineIndex === null) {
    scheduleData.routines.push(routine);
  } else {
    scheduleData.routines[editingRoutineIndex] = routine;
  }

  editingRoutineIndex = null;
  saveScheduleData();
  activePlannerSection = "Routines";
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
}

function renderRoutines() {
  const box = document.getElementById("routinesList");
  if (!box) return;

  box.innerHTML = scheduleData.routines.length
    ? scheduleData.routines.map((routine, index) => `
      <div class="routine-item">
        <strong>${escapeHTML(routine.name)}</strong>
        <p>${escapeHTML(routine.type)} • ${escapeHTML(routine.start)} - ${escapeHTML(routine.end)}</p>
        <p>${routine.repeatDays.map(getDayName).join(", ")}</p>
        ${
          routine.tasks.length
            ? `<ul>${routine.tasks.map(task => `<li>${escapeHTML(task)}</li>`).join("")}</ul>`
            : "<p>No tasks added.</p>"
        }
        <p>${escapeHTML(routine.notes || "")}</p>
        <div class="button-row">
          <button onclick="editRoutine(${index})">Edit</button>
          <button class="danger-btn" onclick="deleteRoutine(${index})">Delete</button>
        </div>
      </div>
    `).join("")
    : "<p>No routines saved yet.</p>";
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
  document.querySelectorAll("input[name='routineDay']").forEach(input => {
    input.checked = routine.repeatDays.includes(Number(input.value));
  });
  document.getElementById("routineSaveButton").textContent = "Update Routine";
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

    scheduleData.blocks.push({
      id: createId("block"),
      routineId: routine.id,
      title: routine.name,
      date: today,
      start: routine.start,
      end: routine.end,
      category: routine.type,
      notes: routine.notes || "",
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

  box.innerHTML = `
    <div class="week-grid">
      ${weekDates.map(day => {
        const dayBlocks = scheduleData.blocks
          .map((block, index) => ({ block, index }))
          .filter(item => item.block.date === day.iso)
          .sort((a, b) => a.block.start.localeCompare(b.block.start));
        const stats = getDayWorkload(day.iso);

        return `
          <div class="week-day">
            <strong>${day.label} ${day.dayNumber}</strong>
            <div class="workload">
              <span>${stats.totalBlocks} blocks</span>
              <span>${formatMinutes(stats.totalMinutes)}</span>
              <span>${stats.unfinishedTasks} unfinished</span>
            </div>
            ${dayBlocks.length ? dayBlocks.map(({ block, index }) => renderWeeklyBlock(block, index, weekDates)).join("") : "<p>No blocks.</p>"}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderWeeklyBlock(block, index, weekDates) {
  return `
    <div class="week-block ${block.isBuffer ? "buffer-block" : ""}">
      <strong>${escapeHTML(block.start)} ${escapeHTML(block.title)}</strong>
      <small>${escapeHTML(block.end)} • ${escapeHTML(block.category)}</small>
      <select onchange="moveBlockToDate(${index}, this.value)">
        ${weekDates.map(day => `<option value="${day.iso}" ${block.date === day.iso ? "selected" : ""}>Move to ${day.label}</option>`).join("")}
      </select>
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

function moveUnfinishedToTomorrow() {
  const today = getTodayISO();
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
  renderHomeSnapshot();
  renderProductivitySummary("homeProductivitySummary");
  renderHomeTimeline();
  renderHomeSystemsHabits();
  renderHomeUpcomingHangouts();
  renderHomeSuggestions();
  renderHomeStats();
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

  return Math.max(...scheduleData.routines.map(routine => getRoutineStreak(routine.id)));
}

function getRoutineStreak(routineId) {
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

function renderSystems() {
  fillEditingHabitForm();
  renderSystemsDashboard();
  renderHabitsList();
  renderSystemsLogsList();
  fillDefaultLogDate();
}

function saveHabit() {
  const name = document.getElementById("habitName").value.trim();
  if (!name) return;

  const habit = {
    id: editingHabitIndex === null ? createId("habit") : systemsData.habits[editingHabitIndex].id,
    name,
    category: document.getElementById("habitCategory").value.trim(),
    frequency: document.getElementById("habitFrequency").value,
    target: document.getElementById("habitTarget").value.trim(),
    notes: document.getElementById("habitNotes").value.trim(),
    completions: editingHabitIndex === null ? [] : systemsData.habits[editingHabitIndex].completions
  };

  if (editingHabitIndex === null) {
    systemsData.habits.push(habit);
  } else {
    systemsData.habits[editingHabitIndex] = habit;
  }

  editingHabitIndex = null;
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
  document.getElementById("habitCategory").value = habit.category;
  document.getElementById("habitFrequency").value = habit.frequency;
  document.getElementById("habitTarget").value = habit.target;
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
  editingHabitIndex = index;
  activeSystemsSection = "Habits";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
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
  if (!habit.completions.includes(today)) {
    habit.completions.push(today);
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

  systemsData.logs.push({
    id: createId("log"),
    title,
    type: document.getElementById("logType").value,
    value,
    unit,
    date,
    notes: document.getElementById("logNotes").value.trim(),
    linkedHabitId: "",
    linkedPlannerBlockId: ""
  });

  saveSystemsData();
  activeSystemsSection = "Logs";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
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
  const completedToday = systemsData.habits.filter(habit => habit.completions.includes(today)).length;
  const bestStreak = systemsData.habits.reduce((best, habit) =>
    Math.max(best, getHabitStreak(habit)), 0);

  box.innerHTML = `
    <div class="summary-grid">
      <div><strong>${systemsData.habits.length}</strong><span>Active habits</span></div>
      <div><strong>${completedToday}</strong><span>Done today</span></div>
      <div><strong>${bestStreak}</strong><span>Best streak</span></div>
      <div><strong>${systemsData.logs.length}</strong><span>Total logs</span></div>
    </div>
  `;
}

function renderHabitsList() {
  const box = document.getElementById("habitsList");
  if (!box) return;

  box.innerHTML = systemsData.habits.length
    ? systemsData.habits.map((habit, index) => `
      <div class="system-item">
        <div class="item-title">
          <strong>${escapeHTML(habit.name)}</strong>
          <span>${getHabitStreak(habit)} streak</span>
        </div>
        <p>${escapeHTML(habit.category || "No category")} • ${escapeHTML(habit.frequency)}</p>
        <p>${escapeHTML(habit.target || "")}</p>
        <p>${escapeHTML(habit.notes || "")}</p>
        <button onclick="completeHabitToday(${index})">${habit.completions.includes(getTodayISO()) ? "Completed Today" : "Complete Today"}</button>
        <button class="secondary-btn" onclick="scheduleHabitInPlanner(${index})">Schedule in Planner</button>
        <div class="button-row">
          <button onclick="editHabit(${index})">Edit</button>
          <button class="danger-btn" onclick="deleteHabit(${index})">Delete</button>
        </div>
      </div>
    `).join("")
    : "<p>No habits saved yet.</p>";
}

function renderSystemsLogsList() {
  const box = document.getElementById("systemsLogsList");
  if (!box) return;

  const logs = [...systemsData.logs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  box.innerHTML = logs.length
    ? logs.map(log => {
      const index = systemsData.logs.findIndex(item => item.id === log.id);
      return `
        <div class="system-item">
          <div class="item-title">
            <strong>${escapeHTML(log.title || log.type)}</strong>
            <span>${escapeHTML(log.type)}</span>
          </div>
          <p>${escapeHTML(log.date || "No date")} • ${escapeHTML(log.value || "")} ${escapeHTML(log.unit || "")}</p>
          <p>${escapeHTML(log.notes || "")}</p>
          <button class="danger-btn" onclick="deleteSystemLog(${index})">Delete Log</button>
        </div>
      `;
    }).join("")
    : "<p>No logs saved yet.</p>";
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

  const suggestions = [
    unfinishedTask ? `Finish: ${unfinishedTask.task.text} (${unfinishedTask.block.title})` : "",
    unfinishedHabit ? `Complete habit: ${unfinishedHabit.name}` : "",
    friendSuggestion ? `Reach out: ${friendSuggestion.friend.name} (${friendSuggestion.reason})` : "",
    upcomingHangout ? `Next hangout: ${upcomingHangout.activity} on ${upcomingHangout.date}` : ""
  ].filter(Boolean);

  box.innerHTML = suggestions.length
    ? suggestions.map(suggestion => `<div class="home-list-item"><strong>${escapeHTML(suggestion)}</strong></div>`).join("")
    : "<p>No smart suggestions yet.</p>";
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

  editingHangoutIndex = null;
  hangoutFormOpen = false;
  saveSocialData();
  activeSocialSection = "Hangouts";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
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

  box.innerHTML = `
    <div class="summary-grid">
      <div><strong>${completedThisMonth.length}</strong><span>Hangouts this month</span></div>
      <div><strong>${friendsSeenThisMonth.length}</strong><span>Friends seen this month</span></div>
      <div><strong>${socialData.hangouts.length}</strong><span>Total hangouts</span></div>
      <div><strong>${notSeenRecently.length}</strong><span>Not seen recently</span></div>
    </div>
    <p>Not seen recently: ${notSeenRecently.length ? notSeenRecently.map(escapeHTML).join(", ") : "Everyone is current."}</p>
    <p>Priority balance: High ${priorityCounts.High || 0}, Medium ${priorityCounts.Medium || 0}, Low ${priorityCounts.Low || 0}</p>
    <p>Hangout frequency: ${getHangoutFrequencyText()}</p>
  `;
}

function renderFriendSuggestions() {
  const box = document.getElementById("friendSuggestions");
  if (!box) return;

  const suggestions = getFriendSuggestions().slice(0, 3);

  box.innerHTML = suggestions.length
    ? suggestions.map(item => `
      <div class="suggestion-item">
        <strong>${escapeHTML(item.friend.name)}</strong>
        <p>${escapeHTML(item.reason)}</p>
      </div>
    `).join("")
    : "<p>Add friends to get suggestions.</p>";
}

function getFriendSuggestions() {
  const priorityScore = {
    High: 60,
    Medium: 35,
    Low: 15
  };

  return socialData.friends
    .map(friend => {
      const daysSince = getDaysSince(friend.lastSeen);
      const recencyScore = daysSince === null ? 90 : Math.min(daysSince, 90);
      const score = (priorityScore[friend.priority] || 25) + recencyScore;
      const reasonDays = daysSince === null
        ? "not seen yet"
        : `not seen in ${daysSince} day${daysSince === 1 ? "" : "s"}`;

      return {
        friend,
        score,
        reason: `${friend.priority} priority and ${reasonDays}`
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

function importHangoutPlannerData() {
  const pastedJSON = document.getElementById("hangoutPlannerImportJson")?.value.trim();
  const savedJSON = localStorage.getItem("hangout-planner-v1");
  const sourceJSON = pastedJSON || savedJSON;

  if (!sourceJSON) {
    alert("No Hangout Planner data found.");
    return;
  }

  let oldData;
  try {
    let raw = sourceJSON.trim();

    if (raw.startsWith("`") && raw.endsWith("`")) {
      raw = raw.slice(1, -1).trim();
    }

    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1) {
      raw = raw.slice(firstBrace, lastBrace + 1);
    }

    oldData = JSON.parse(raw);
  } catch (error) {
    alert("Could not parse Hangout Planner data.");
    return;
  }

  const oldFriends = Array.isArray(oldData.friends) ? oldData.friends : [];
  const oldHangouts = Array.isArray(oldData.hangouts) ? oldData.hangouts : [];
  const oldIdeas = Array.isArray(oldData.ideas) ? oldData.ideas : [];
  const oldFriendNamesById = oldFriends.reduce((map, friend) => {
    if (friend.id && friend.name) map[String(friend.id)] = friend.name;
    return map;
  }, {});

  const importedFriends = oldFriends
    .map(convertHangoutFriend)
    .filter(friend => friend.name);
  const importedHangouts = oldHangouts
    .map(hangout => convertHangoutEvent(hangout, oldFriendNamesById))
    .filter(hangout => hangout.activity);
  const importedIdeas = oldIdeas
    .map(convertHangoutIdea)
    .filter(idea => idea.title);

  const existingFriendNames = new Set(socialData.friends.map(friend =>
    normalizeDuplicateKey(friend.name)
  ));
  let addedFriends = 0;
  let addedHangouts = 0;
  let addedIdeas = 0;

  importedFriends.forEach(friend => {
    const key = normalizeDuplicateKey(friend.name);
    if (!existingFriendNames.has(key)) {
      socialData.friends.push(friend);
      existingFriendNames.add(key);
      addedFriends++;
    }
  });

  const existingHangouts = new Set(socialData.hangouts.map(getHangoutDuplicateKey));
  importedHangouts.forEach(hangout => {
    const key = getHangoutDuplicateKey(hangout);
    if (!existingHangouts.has(key)) {
      socialData.hangouts.push(hangout);
      existingHangouts.add(key);
      addedHangouts++;
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
    }
  });

  saveSocialData();
  renderHome();
  alert(`Imported ${addedFriends} friends, ${addedHangouts} hangouts, and ${addedIdeas} ideas.`);
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
  alert("Current Social data exported.");
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
  systemsData = { habits: [], logs: [] };
  saveSystemsData();
  alert("Systems cleared");
}
