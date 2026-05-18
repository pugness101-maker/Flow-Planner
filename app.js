console.log("Flow Planner Loaded");

const main = document.querySelector("main");

// ==================== CENTRALIZED DATA SERVICE ====================
// This service provides a single source of truth for all data operations
// ensuring consistency across all environments (local, GitHub, Vercel, etc.)

const DataService = {
  // Storage keys - DO NOT CHANGE these to maintain backward compatibility
  KEYS: {
    PLANNER_DATA: "flowPlannerData",
    SCHEDULE_DATA: "flowScheduleData",
    SYSTEMS_DATA: "flowSystemsData",
    SOCIAL_DATA: "flowSocialData",
    ALL_ZIP_DATA: "flowAllZipData",
    ALL_ZIP_CUSTOM_OPTIONS: "flowAllZipCustomOptions"
  },

  // Sync status tracking
  syncStatus: {
    lastSyncTime: null,
    isCloudConnected: false,
    syncErrors: []
  },

  // Check if Supabase is configured
  isSupabaseConfigured() {
    return typeof window.flowSupabaseStorage === 'object' && 
           window.flowSupabaseStorage !== null &&
           window.flowSupabaseStorage.enabled &&
           window.flowSupabaseStorage.client !== null;
  },

  // Get data from localStorage
  get(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Error getting data for key ${key}:`, error);
      return null;
    }
  },

  // Set data to localStorage
  set(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error(`Error setting data for key ${key}:`, error);
      return false;
    }
  },

  // Remove data from localStorage
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing data for key ${key}:`, error);
      return false;
    }
  },

  // Safe merge logic - merge arrays by id, respect timestamps
  mergeArrays(localArray, remoteArray) {
    if (!localArray) return remoteArray || [];
    if (!remoteArray) return localArray;

    const merged = [...localArray];
    const localIds = new Set(localArray.map(item => item.id));

    remoteArray.forEach(remoteItem => {
      if (!remoteItem.id) return;

      const localIndex = merged.findIndex(item => item.id === remoteItem.id);
      if (localIndex === -1) {
        // Item doesn't exist locally, add it
        merged.push(remoteItem);
      } else {
        // Item exists, merge based on updatedAt
        const localItem = merged[localIndex];
        const localTime = localItem.updatedAt || localItem.createdAt || 0;
        const remoteTime = remoteItem.updatedAt || remoteItem.createdAt || 0;

        if (remoteTime > localTime) {
          // Remote is newer, use remote data
          merged[localIndex] = remoteItem;
        }
        // If local is newer or same time, keep local data
      }
    });

    return merged;
  },

  // Merge objects with timestamp comparison
  mergeObjects(localObj, remoteObj) {
    if (!localObj) return remoteObj || {};
    if (!remoteObj) return localObj;

    const localTime = localObj.updatedAt || localObj.createdAt || 0;
    const remoteTime = remoteObj.updatedAt || remoteObj.createdAt || 0;

    if (remoteTime > localTime) {
      return remoteObj;
    }
    return localObj;
  },

  // Load data from Supabase and merge with local data
  async loadFromSupabase() {
    console.log("[SYNC] DataService.loadFromSupabase called");
    if (!this.isSupabaseConfigured()) {
      console.log("[SYNC] Supabase not configured, using localStorage only");
      this.syncStatus.isCloudConnected = false;
      return null;
    }

    try {
      const localData = {
        plannerData,
        scheduleData,
        systemsData,
        socialData,
        allZipData,
        allZipCustomOptions,
        updatedAt: this.syncStatus.lastSyncTime
      };

      const result = await window.flowSupabaseStorage.syncFromCloud?.(localData);
      
      if (!result || !result.success) {
        if (result?.conflict) {
          console.log("[SYNC] Conflict detected, not overwriting local data");
        }
        return null;
      }

      if (!result.data) {
        console.log("[SYNC] No cloud data found (first sync)");
        return null;
      }

      this.syncStatus.isCloudConnected = true;
      this.syncStatus.lastSyncTime = new Date().toISOString();

      console.log("[SYNC] Merging cloud data with local data");
      const mergedData = window.flowSupabaseStorage.mergeCloudAndLocalData?.(localData, result.data);

      if (mergedData) {
        // Apply merged data to global variables
        if (mergedData.plannerData) plannerData = mergedData.plannerData;
        if (mergedData.scheduleData) scheduleData = mergedData.scheduleData;
        if (mergedData.systemsData) systemsData = mergedData.systemsData;
        if (mergedData.socialData) socialData = mergedData.socialData;
        if (mergedData.allZipData) allZipData = mergedData.allZipData;
        if (mergedData.allZipCustomOptions) allZipCustomOptions = mergedData.allZipCustomOptions;

        // Save merged data to localStorage
        this.saveAll();
        console.log("[SYNC] Data merged and saved to localStorage");
      }

      return result.data;
    } catch (error) {
      console.error("[SYNC] Error loading from Supabase:", error);
      this.syncStatus.syncErrors.push({ time: new Date().toISOString(), error: error.message });
      this.syncStatus.isCloudConnected = false;
      return null;
    }
  },

  // Save data to Supabase
  async saveToSupabase(data) {
    console.log("[SYNC] DataService.saveToSupabase called");
    if (!this.isSupabaseConfigured()) {
      console.log("[SYNC] Supabase not configured");
      this.syncStatus.isCloudConnected = false;
      return false;
    }

    try {
      const syncData = {
        ...data,
        settingsData: null,
        customOptionsData: data.allZipCustomOptions || null,
        updatedAt: new Date().toISOString()
      };

      const result = await window.flowSupabaseStorage.syncToCloud?.(syncData);
      
      if (result && result.success) {
        this.syncStatus.isCloudConnected = true;
        this.syncStatus.lastSyncTime = new Date().toISOString();
        this.syncStatus.syncErrors = [];
        console.log("[SYNC] Data saved to cloud successfully");
        return true;
      } else if (result?.conflict) {
        console.log("[SYNC] Conflict detected, cloud data is newer");
        return false;
      }

      return false;
    } catch (error) {
      console.error("[SYNC] Error saving to Supabase:", error);
      this.syncStatus.syncErrors.push({ time: new Date().toISOString(), error: error.message });
      this.syncStatus.isCloudConnected = false;
      return false;
    }
  },

  // Get all app data at once
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

  // Save all data at once
  saveAll() {
    this.set(this.KEYS.PLANNER_DATA, plannerData);
    this.set(this.KEYS.SCHEDULE_DATA, scheduleData);
    this.set(this.KEYS.SYSTEMS_DATA, systemsData);
    this.set(this.KEYS.SOCIAL_DATA, socialData);
    this.set(this.KEYS.ALL_ZIP_DATA, allZipData);
    this.set(this.KEYS.ALL_ZIP_CUSTOM_OPTIONS, allZipCustomOptions);
  },

  // Save planner data with Supabase sync
  savePlannerData(data) {
    if (this.set(this.KEYS.PLANNER_DATA, data)) {
      this.saveToSupabase({
        plannerData: data,
        scheduleData,
        systemsData,
        socialData
      });
      return true;
    }
    return false;
  },

  // Save schedule data with Supabase sync
  saveScheduleData(data) {
    if (this.set(this.KEYS.SCHEDULE_DATA, data)) {
      this.saveToSupabase({
        plannerData,
        scheduleData: data,
        systemsData,
        socialData
      });
      return true;
    }
    return false;
  },

  // Save systems data with Supabase sync
  saveSystemsData(data) {
    if (this.set(this.KEYS.SYSTEMS_DATA, data)) {
      this.saveToSupabase({
        plannerData,
        scheduleData,
        systemsData: data,
        socialData
      });
      return true;
    }
    return false;
  },

  // Save social data with Supabase sync
  saveSocialData(data) {
    if (this.set(this.KEYS.SOCIAL_DATA, data)) {
      this.saveToSupabase({
        plannerData,
        scheduleData,
        systemsData,
        socialData: data
      });
      return true;
    }
    return false;
  },

  // Save All Zip Data with Supabase sync
  saveAllZipData(data) {
    if (this.set(this.KEYS.ALL_ZIP_DATA, data)) {
      this.saveToSupabase({
        plannerData,
        scheduleData,
        systemsData,
        socialData,
        allZipData: data
      });
      return true;
    }
    return false;
  },

  // Save All Zip Custom Options with Supabase sync
  saveAllZipCustomOptions(data) {
    if (this.set(this.KEYS.ALL_ZIP_CUSTOM_OPTIONS, data)) {
      this.saveToSupabase({
        plannerData,
        scheduleData,
        systemsData,
        socialData,
        allZipCustomOptions: data
      });
      return true;
    }
    return false;
  },

  // Clear all data (for reset functionality)
  clearAll() {
    Object.values(this.KEYS).forEach(key => this.remove(key));
    return true;
  },

  // Export all data as JSON
  exportAllData() {
    const data = {
      plannerData,
      scheduleData,
      systemsData,
      socialData,
      allZipData,
      allZipCustomOptions,
      exportDate: new Date().toISOString(),
      version: "1.0"
    };
    return JSON.stringify(data, null, 2);
  },

  // Import all data from JSON
  importAllData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      
      // Validate data structure
      if (!data || typeof data !== 'object') {
        throw new Error("Invalid data format");
      }

      // Merge data with existing data using safe merge logic
      if (data.plannerData) {
        plannerData = this.mergeObjects(plannerData, data.plannerData);
      }
      if (data.scheduleData) {
        scheduleData.blocks = this.mergeArrays(scheduleData.blocks, data.scheduleData.blocks || []);
        scheduleData.routines = this.mergeArrays(scheduleData.routines, data.scheduleData.routines || []);
      }
      if (data.systemsData) {
        systemsData.goals = this.mergeArrays(systemsData.goals, data.systemsData.goals || []);
        systemsData.habits = this.mergeArrays(systemsData.habits, data.systemsData.habits || []);
        systemsData.trackers = this.mergeArrays(systemsData.trackers, data.systemsData.trackers || []);
        systemsData.logs = this.mergeArrays(systemsData.logs, data.systemsData.logs || []);
        systemsData.metrics = this.mergeArrays(systemsData.metrics, data.systemsData.metrics || []);
        systemsData.objectives = this.mergeArrays(systemsData.objectives, data.systemsData.objectives || []);
      }
      if (data.socialData) {
        socialData.friends = this.mergeArrays(socialData.friends, data.socialData.friends || []);
        socialData.hangouts = this.mergeArrays(socialData.hangouts, data.socialData.hangouts || []);
        socialData.ideas = this.mergeArrays(socialData.ideas, data.socialData.ideas || []);
      }
      if (data.allZipData) {
        allZipData = this.mergeArrays(allZipData, data.allZipData);
      }
      if (data.allZipCustomOptions) {
        allZipCustomOptions = this.mergeObjects(allZipCustomOptions, data.allZipCustomOptions);
      }

      // Save merged data
      this.saveAll();

      return true;
    } catch (error) {
      console.error("Error importing data:", error);
      return false;
    }
  }
};

// ==================== APP STATE HELPERS ====================

// Save all app state to localStorage
function saveAllAppState() {
  console.log("[LOCAL] saveAllAppState called");
  const state = {
    plannerData,
    scheduleData,
    systemsData,
    socialData,
    allZipData,
    allZipCustomOptions,
    updatedAt: new Date().toISOString()
  };
  
  // Store with the keys specified in requirements
  localStorage.setItem("flow-planner-state-v3", JSON.stringify({
    plannerData,
    scheduleData,
    updatedAt: state.updatedAt
  }));
  
  localStorage.setItem("flow-planner-social-v2", JSON.stringify({
    socialData,
    updatedAt: state.updatedAt
  }));
  
  localStorage.setItem("flow-planner-systems-v2", JSON.stringify({
    systemsData,
    updatedAt: state.updatedAt
  }));
  
  localStorage.setItem("flow-planner-allzip-v2", JSON.stringify({
    allZipData,
    allZipCustomOptions,
    updatedAt: state.updatedAt
  }));
  
  // Also save with existing keys for backward compatibility
  DataService.saveAll();
  
  console.log("[LOCAL] All app state saved");
  return state;
}

// Load all app state from localStorage
function loadAllAppState() {
  console.log("[LOCAL] loadAllAppState called");
  
  // Try new keys first (specified in requirements)
  const stateV3 = localStorage.getItem("flow-planner-state-v3");
  const socialV2 = localStorage.getItem("flow-planner-social-v2");
  const systemsV2 = localStorage.getItem("flow-planner-systems-v2");
  const allzipV2 = localStorage.getItem("flow-planner-allzip-v2");
  
  let loadedState = {
    updatedAt: null
  };
  
  if (stateV3) {
    try {
      const parsed = JSON.parse(stateV3);
      loadedState.plannerData = parsed.plannerData;
      loadedState.scheduleData = parsed.scheduleData;
      loadedState.updatedAt = parsed.updatedAt;
    } catch (e) {
      console.error("[LOCAL] Error parsing state-v3:", e);
    }
  }
  
  if (socialV2) {
    try {
      const parsed = JSON.parse(socialV2);
      loadedState.socialData = parsed.socialData;
      if (parsed.updatedAt && (!loadedState.updatedAt || new Date(parsed.updatedAt) > new Date(loadedState.updatedAt))) {
        loadedState.updatedAt = parsed.updatedAt;
      }
    } catch (e) {
      console.error("[LOCAL] Error parsing social-v2:", e);
    }
  }
  
  if (systemsV2) {
    try {
      const parsed = JSON.parse(systemsV2);
      loadedState.systemsData = parsed.systemsData;
      if (parsed.updatedAt && (!loadedState.updatedAt || new Date(parsed.updatedAt) > new Date(loadedState.updatedAt))) {
        loadedState.updatedAt = parsed.updatedAt;
      }
    } catch (e) {
      console.error("[LOCAL] Error parsing systems-v2:", e);
    }
  }
  
  if (allzipV2) {
    try {
      const parsed = JSON.parse(allzipV2);
      loadedState.allZipData = parsed.allZipData;
      loadedState.allZipCustomOptions = parsed.allZipCustomOptions;
      if (parsed.updatedAt && (!loadedState.updatedAt || new Date(parsed.updatedAt) > new Date(loadedState.updatedAt))) {
        loadedState.updatedAt = parsed.updatedAt;
      }
    } catch (e) {
      console.error("[LOCAL] Error parsing allzip-v2:", e);
    }
  }
  
  // Fall back to existing keys if new keys don't have data
  if (!loadedState.plannerData) {
    loadedState.plannerData = DataService.get(DataService.KEYS.PLANNER_DATA);
  }
  if (!loadedState.scheduleData) {
    loadedState.scheduleData = DataService.get(DataService.KEYS.SCHEDULE_DATA);
  }
  if (!loadedState.systemsData) {
    loadedState.systemsData = DataService.get(DataService.KEYS.SYSTEMS_DATA);
  }
  if (!loadedState.socialData) {
    loadedState.socialData = DataService.get(DataService.KEYS.SOCIAL_DATA);
  }
  if (!loadedState.allZipData) {
    loadedState.allZipData = DataService.get(DataService.KEYS.ALL_ZIP_DATA);
  }
  if (!loadedState.allZipCustomOptions) {
    loadedState.allZipCustomOptions = DataService.get(DataService.KEYS.ALL_ZIP_CUSTOM_OPTIONS);
  }
  
  console.log("[LOCAL] All app state loaded");
  return loadedState;
}

// DATA - Initialize using DataService
let plannerData = DataService.get(DataService.KEYS.PLANNER_DATA) || {
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
  birthday: friend.birthday || "",
  phoneHandle: friend.phoneHandle || friend.contactNotes || "",
  favoriteFood: friend.favoriteFood || "",
  giftIdeas: friend.giftIdeas || "",
  importantNotes: friend.importantNotes || friend.notes || "",
  relationshipType: friend.relationshipType || "Friend",
  priority: friend.priority || "Medium",
  interests: friend.interests || "",
  details: friend.details || "",
  notes: friend.notes || "",
  favoriteActivities: friend.favoriteActivities || "",
  contactNotes: friend.contactNotes || "",
  lastContacted: friend.lastContacted || "",
  lastSeen: friend.lastSeen || friend.lastHangout || "",
  preferredHangoutStyle: friend.preferredHangoutStyle || ""
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
  checklist: hangout.checklist || "",
  moodAfter: hangout.moodAfter || "",
  rating: hangout.rating || "",
  memories: hangout.memories || "",
  followUpReminder: hangout.followUpReminder || "",
  notes: hangout.notes || "",
  completed: Boolean(hangout.completed)
}));

socialData.ideas = socialData.ideas.map(idea => ({
  title: idea.title || "",
  category: idea.category || "Cheap",
  cost: idea.cost || "",
  notes: idea.notes || "",
  favorite: Boolean(idea.favorite),
  linkedFriendIds: Array.isArray(idea.linkedFriendIds) ? idea.linkedFriendIds : []
}));

let systemsData = DataService.get(DataService.KEYS.SYSTEMS_DATA) || {
  habits: [],
  logs: [],
  trackers: [],
  goals: [],
  metrics: [],
  objectives: [],
  savedTrackerCategories: [],
  savedTrackerUnits: [],
  unitSortMode: "defaults"
};

if (!Array.isArray(systemsData.habits)) systemsData.habits = [];
if (!Array.isArray(systemsData.logs)) systemsData.logs = [];
if (!Array.isArray(systemsData.trackers)) systemsData.trackers = [];
if (!Array.isArray(systemsData.goals)) systemsData.goals = [];
if (!Array.isArray(systemsData.metrics)) systemsData.metrics = [];
if (!Array.isArray(systemsData.objectives)) systemsData.objectives = [];
if (!Array.isArray(systemsData.savedTrackerCategories)) systemsData.savedTrackerCategories = [];
if (!Array.isArray(systemsData.savedTrackerUnits)) systemsData.savedTrackerUnits = [];
if (!systemsData.unitSortMode) systemsData.unitSortMode = "defaults";

const TRACKER_CATEGORIES = ["Goal", "Counter", "Taper", "Habit-linked", "Milestone", "Body Metric", "Finance", "Custom"];
const DEFAULT_TRACKER_UNITS = [
  "classes",
  "hours",
  "hrs",
  "minutes",
  "min",
  "dollars",
  "$",
  "lbs",
  "oz",
  "grams",
  "g",
  "mg",
  "days",
  "sessions",
  "reps",
  "%",
  "completion",
  "pages",
  "chapters",
  "miles",
  "steps"
];
const TRACKER_RESET_TYPES = ["No reset", "Daily", "Weekly", "Monthly", "Custom recurring", "Milestone-based"];

systemsData.goals = systemsData.goals.map(goal => ({
  id: goal.id || createId("goal"),
  name: goal.name || "",
  category: goal.category || "Custom",
  goalType: goal.goalType || goal.category || "Increase toward target",
  resetCycle: goal.resetCycle || "weekly",
  startValue: goal.startValue ?? "",
  currentValue: goal.currentValue ?? "",
  targetValue: goal.targetValue ?? "",
  unit: goal.unit || "",
  startDate: goal.startDate || "",
  deadline: goal.deadline || "",
  linkedTrackerId: goal.linkedTrackerId || "",
  linkedHabitId: goal.linkedHabitId || "",
  linkedPlannerBlockId: goal.linkedPlannerBlockId || "",
  linkedRoutineId: goal.linkedRoutineId || "",
  linkedObjectiveId: goal.linkedObjectiveId || "",
  milestones: Array.isArray(goal.milestones) ? goal.milestones : [],
  recurringTarget: goal.recurringTarget || "",
  notes: goal.notes || ""
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
  linkedTrackerId: habit.linkedTrackerId || "",
  linkedRoutineId: habit.linkedRoutineId || "",
  linkedPlannerBlockId: habit.linkedPlannerBlockId || "",
  autoLogTrackerOnComplete: Boolean(habit.autoLogTrackerOnComplete),
  trackerLogAmount: habit.trackerLogAmount !== undefined && habit.trackerLogAmount !== null ? String(habit.trackerLogAmount) : "",
  paused: Boolean(habit.paused),
  skippedDates: Array.isArray(habit.skippedDates) ? habit.skippedDates : [],
  completionHistory: Array.isArray(habit.completionHistory) ? habit.completionHistory : [],
  notes: habit.notes || "",
  completions: Array.isArray(habit.completions) ? habit.completions : [],
  // Amount-based completion fields
  completionType: habit.completionType || "checkbox", // "checkbox" or "amount"
  dailyTargetAmount: habit.dailyTargetAmount || "",
  weeklyTargetAmount: habit.weeklyTargetAmount || "",
  autoLogToTracker: habit.autoLogToTracker !== false, // default true
  // System type field for backward compatibility
  type: habit.type || "Daily"
}));

systemsData.objectives = systemsData.objectives.map(objective => ({
  id: objective.id || createId("objective"),
  title: objective.title || "",
  type: objective.type || "Task",
  status: objective.status || "Not started",
  priority: objective.priority || "Medium",
  dueDate: objective.dueDate || "",
  dueTime: objective.dueTime || "",
  estimatedMinutes: objective.estimatedMinutes || "",
  category: objective.category || "",
  tags: objective.tags || "",
  notes: objective.notes || "",
  linkedPlannerBlockId: objective.linkedPlannerBlockId || "",
  linkedRoutineId: objective.linkedRoutineId || "",
  linkedHabitId: objective.linkedHabitId || "",
  linkedTrackerId: objective.linkedTrackerId || "",
  linkedGoalId: objective.linkedGoalId || "",
  trackerLogAmount: objective.trackerLogAmount || "",
  completedDate: objective.completedDate || "",
  completedAt: objective.completedAt || "",
  autoCompleteFromPlanner: objective.autoCompleteFromPlanner !== false,
  autoCompleteFromHabit: objective.autoCompleteFromHabit !== false,
  focus: Boolean(objective.focus),
  recurring: objective.recurring || "",
  subtasks: Array.isArray(objective.subtasks) ? objective.subtasks.map(item => ({
    id: item.id || createId("subtask"),
    title: item.title || "",
    completed: Boolean(item.completed)
  })) : [],
  // Timestamps and tracking
  createdAt: objective.createdAt || "",
  updatedAt: objective.updatedAt || "",
  deferredCount: objective.deferredCount || 0
}));

function inferLegacyLogSource(log) {
  const tid = log.linkedTrackerId || log.trackerId || log.linkedMetricId;
  if (log.logSource === "manual" || log.logSource === "habit" || log.logSource === "planner") return log.logSource;
  if (log.linkedPlannerBlockId && tid) return "planner";
  if (log.notes && /Planner completion/i.test(log.notes) && tid) return "planner";
  if (log.notes === "Habit auto" || (log.notes && /habit completion/i.test(log.notes))) return "habit";
  if (log.type === "Habit" && log.linkedPlannerBlockId) return "habit";
  if (tid) return "manual";
  return "manual";
}

// ==================== ALL ZIP DATA - UNIFIED MASTER LOG ====================

function convertToAllZipData() {
  const unifiedRows = [];

  // Helper to add row
  const addRow = (row) => {
    unifiedRows.push({
      id: row.id || "",
      date: row.date || "",
      source: row.source || "",
      category: row.category || "",
      type: row.type || "",
      name: row.name || "",
      amount: row.amount || "",
      unit: row.unit || "",
      startTime: row.startTime || "",
      endTime: row.endTime || "",
      durationMinutes: row.durationMinutes || "",
      status: row.status || "",
      notes: row.notes || "",
      linkedGoalId: row.linkedGoalId || "",
      linkedHabitId: row.linkedHabitId || "",
      linkedPlannerBlockId: row.linkedPlannerBlockId || "",
      createdAt: row.createdAt || "",
      updatedAt: row.updatedAt || ""
    });
  };

  // Convert planner blocks
  scheduleData.blocks.forEach(block => {
    addRow({
      id: block.id,
      date: block.date || "",
      source: "Planner",
      category: block.category || "",
      type: block.type || "task",
      name: block.title || "",
      amount: "",
      unit: "",
      startTime: block.startTime || "",
      endTime: block.endTime || "",
      durationMinutes: block.durationMinutes || "",
      status: block.completed ? "completed" : "open",
      notes: block.notes || "",
      linkedGoalId: block.linkedGoalId || "",
      linkedHabitId: block.linkedHabitId || "",
      linkedPlannerBlockId: "",
      createdAt: block.createdAt || "",
      updatedAt: block.updatedAt || ""
    });
  });

  // Convert routines
  scheduleData.routines.forEach(routine => {
    addRow({
      id: routine.id,
      date: "",
      source: "Planner",
      category: routine.category || "",
      type: "routine",
      name: routine.title || "",
      amount: "",
      unit: "",
      startTime: routine.start || "",
      endTime: routine.end || "",
      durationMinutes: routine.durationMinutes || "",
      status: "",
      notes: routine.notes || "",
      linkedGoalId: routine.linkedGoalId || "",
      linkedHabitId: routine.linkedHabitId || "",
      linkedPlannerBlockId: "",
      createdAt: routine.createdAt || "",
      updatedAt: routine.updatedAt || ""
    });
  });

  // Convert habits
  systemsData.habits.forEach(habit => {
    addRow({
      id: habit.id,
      date: "",
      source: "Systems",
      category: habit.category || "",
      type: "habit",
      name: habit.name || "",
      amount: habit.target || "",
      unit: habit.unit || "",
      startTime: "",
      endTime: "",
      durationMinutes: "",
      status: habit.paused ? "paused" : "active",
      notes: habit.notes || "",
      linkedGoalId: habit.linkedGoalId || "",
      linkedHabitId: "",
      linkedPlannerBlockId: habit.linkedPlannerBlockId || "",
      createdAt: habit.createdAt || "",
      updatedAt: habit.updatedAt || ""
    });
  });

  // Convert goals
  systemsData.goals.forEach(goal => {
    addRow({
      id: goal.id,
      date: goal.startDate || "",
      source: "Systems",
      category: goal.category || "",
      type: "goal",
      name: goal.name || "",
      amount: goal.targetValue || "",
      unit: goal.unit || "",
      startTime: "",
      endTime: goal.deadline || "",
      durationMinutes: "",
      status: goal.status || "",
      notes: goal.notes || "",
      linkedGoalId: "",
      linkedHabitId: goal.linkedHabitId || "",
      linkedPlannerBlockId: goal.linkedPlannerBlockId || "",
      createdAt: goal.createdAt || "",
      updatedAt: goal.updatedAt || ""
    });
  });

  // Convert objectives
  systemsData.objectives.forEach(objective => {
    addRow({
      id: objective.id,
      date: objective.dueDate || "",
      source: "Systems",
      category: objective.category || "",
      type: "objective",
      name: objective.title || "",
      amount: "",
      unit: "",
      startTime: "",
      endTime: objective.dueTime || "",
      durationMinutes: objective.estimatedMinutes || "",
      status: objective.status || "",
      notes: objective.notes || "",
      linkedGoalId: objective.linkedGoalId || "",
      linkedHabitId: objective.linkedHabitId || "",
      linkedPlannerBlockId: objective.linkedPlannerBlockId || "",
      createdAt: objective.createdAt || "",
      updatedAt: objective.updatedAt || ""
    });
  });

  // Convert metrics
  systemsData.metrics.forEach(metric => {
    addRow({
      id: metric.id,
      date: metric.startDate || "",
      source: "Systems",
      category: metric.type || "",
      type: "metric",
      name: metric.name || "",
      amount: metric.currentValue || "",
      unit: metric.unit || "",
      startTime: "",
      endTime: metric.deadline || "",
      durationMinutes: "",
      status: "",
      notes: metric.notes || "",
      linkedGoalId: metric.linkedGoalId || "",
      linkedHabitId: metric.linkedHabitId || "",
      linkedPlannerBlockId: "",
      createdAt: metric.createdAt || "",
      updatedAt: metric.updatedAt || ""
    });
  });

  // Convert logs (includes study hours, body metrics, taper/recovery logs, course/license hours)
  systemsData.logs.forEach(log => {
    addRow({
      id: log.id,
      date: log.date || "",
      source: log.logSource || "manual",
      category: log.category || "",
      type: log.type || "log",
      name: log.title || "",
      amount: log.value || "",
      unit: log.unit || "",
      startTime: "",
      endTime: "",
      durationMinutes: "",
      status: "",
      notes: log.notes || "",
      linkedGoalId: log.linkedGoalId || "",
      linkedHabitId: log.linkedHabitId || "",
      linkedPlannerBlockId: log.linkedPlannerBlockId || "",
      createdAt: log.createdAt || "",
      updatedAt: log.updatedAt || ""
    });
  });

  // Convert social hangouts
  socialData.hangouts.forEach(hangout => {
    addRow({
      id: hangout.id || createId("hangout"),
      date: hangout.date || "",
      source: "Social",
      category: "Social",
      type: "hangout",
      name: hangout.activity || "",
      amount: hangout.cost || "",
      unit: "",
      startTime: hangout.time || "",
      endTime: "",
      durationMinutes: "",
      status: hangout.completed ? "completed" : "planned",
      notes: hangout.notes || "",
      linkedGoalId: "",
      linkedHabitId: "",
      linkedPlannerBlockId: "",
      createdAt: hangout.createdAt || "",
      updatedAt: hangout.updatedAt || ""
    });
  });

  // Convert social ideas
  socialData.ideas.forEach(idea => {
    addRow({
      id: idea.id || createId("idea"),
      date: "",
      source: "Social",
      category: idea.category || "",
      type: "idea",
      name: idea.title || "",
      amount: idea.cost || "",
      unit: "",
      startTime: "",
      endTime: "",
      durationMinutes: "",
      status: idea.favorite ? "favorite" : "",
      notes: idea.notes || "",
      linkedGoalId: "",
      linkedHabitId: "",
      linkedPlannerBlockId: "",
      createdAt: idea.createdAt || "",
      updatedAt: idea.updatedAt || ""
    });
  });

  // Convert friends (as reference entries)
  socialData.friends.forEach(friend => {
    addRow({
      id: friend.id || createId("friend"),
      date: friend.birthday || "",
      source: "Social",
      category: friend.relationshipType || "",
      type: "friend",
      name: friend.name || "",
      amount: "",
      unit: "",
      startTime: friend.lastSeen || "",
      endTime: "",
      durationMinutes: "",
      status: friend.priority || "",
      notes: friend.importantNotes || "",
      linkedGoalId: "",
      linkedHabitId: "",
      linkedPlannerBlockId: "",
      createdAt: friend.createdAt || "",
      updatedAt: friend.updatedAt || ""
    });
  });

  return unifiedRows;
}

function exportAllZipDataAsJSON() {
  const data = window.filteredAllZipData || convertToAllZipData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flow-planner-all-zip-data-${getTodayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAllZipDataAsCSV() {
  const data = window.filteredAllZipData || convertToAllZipData();
  if (data.length === 0) {
    alert("No data to export.");
    return;
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map(row => headers.map(header => {
      const value = row[header] || "";
      const escaped = String(value).replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flow-planner-all-zip-data-${getTodayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function importAllZipDataJSON(jsonString) {
  try {
    const importedRows = JSON.parse(jsonString);
    if (!Array.isArray(importedRows)) {
      alert("Invalid JSON format: Expected an array of rows.");
      return;
    }
    mergeAllZipData(importedRows);
    alert("Import successful!");
  } catch (e) {
    alert("Invalid JSON file: " + e.message);
  }
}

function importAllZipDataCSV(csvString) {
  try {
    const lines = csvString.trim().split("\n");
    if (lines.length < 2) {
      alert("CSV file is empty or has no data rows.");
      return;
    }

    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const importedRows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });
      importedRows.push(row);
    }

    mergeAllZipData(importedRows);
    alert("Import successful!");
  } catch (e) {
    alert("Invalid CSV file: " + e.message);
  }
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function mergeAllZipData(importedRows) {
  const existingIds = new Set();

  // Collect existing IDs from all data sources
  scheduleData.blocks.forEach(b => existingIds.add(b.id));
  scheduleData.routines.forEach(r => existingIds.add(r.id));
  systemsData.habits.forEach(h => existingIds.add(h.id));
  systemsData.goals.forEach(g => existingIds.add(g.id));
  systemsData.objectives.forEach(o => existingIds.add(o.id));
  systemsData.metrics.forEach(m => existingIds.add(m.id));
  systemsData.logs.forEach(l => existingIds.add(l.id));
  socialData.hangouts.forEach(h => h.id && existingIds.add(h.id));
  socialData.ideas.forEach(i => i.id && existingIds.add(i.id));
  socialData.friends.forEach(f => f.id && existingIds.add(f.id));

  // Process imported rows
  importedRows.forEach(row => {
    if (!row.id || existingIds.has(row.id)) {
      return; // Skip if no ID or already exists
    }

    switch (row.source) {
      case "Planner":
        if (row.type === "routine") {
          scheduleData.routines.push({
            id: row.id,
            title: row.name,
            category: row.category,
            start: row.startTime,
            end: row.endTime,
            durationMinutes: row.durationMinutes,
            notes: row.notes,
            linkedGoalId: row.linkedGoalId,
            linkedHabitId: row.linkedHabitId,
            repeatDays: [],
            dayTimes: {},
            timesByDay: {},
            completions: {},
            completedDates: [],
            streak: 0,
            autoAdd: false,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          });
        } else {
          scheduleData.blocks.push({
            id: row.id,
            title: row.name,
            date: row.date,
            startTime: row.startTime,
            endTime: row.endTime,
            durationMinutes: row.durationMinutes,
            category: row.category,
            type: row.type,
            completed: row.status === "completed",
            notes: row.notes,
            linkedGoalId: row.linkedGoalId,
            linkedHabitId: row.linkedHabitId,
            linkedRoutineId: "",
            linkedTrackerId: "",
            linkedObjectiveId: "",
            tasks: [],
            trackerAutoLogMode: "none",
            trackerLogAmount: "",
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          });
        }
        break;

      case "Systems":
        if (row.type === "habit") {
          systemsData.habits.push({
            id: row.id,
            name: row.name,
            category: row.category,
            frequency: "Daily",
            targetFrequency: "Daily",
            target: row.amount,
            unit: row.unit,
            linkedGoalId: row.linkedGoalId,
            linkedTrackerId: "",
            linkedRoutineId: "",
            linkedPlannerBlockId: row.linkedPlannerBlockId,
            autoLogTrackerOnComplete: false,
            trackerLogAmount: "",
            paused: row.status === "paused",
            skippedDates: [],
            completionHistory: [],
            notes: row.notes,
            completions: [],
            completionType: "checkbox",
            dailyTargetAmount: "",
            weeklyTargetAmount: "",
            autoLogToTracker: true,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          });
        } else if (row.type === "goal") {
          systemsData.goals.push({
            id: row.id,
            name: row.name,
            category: row.category,
            goalType: "Increase toward target",
            startValue: "",
            currentValue: row.amount,
            targetValue: row.amount,
            unit: row.unit,
            startDate: row.date,
            deadline: row.endTime,
            linkedTrackerId: "",
            linkedHabitId: row.linkedHabitId,
            linkedPlannerBlockId: row.linkedPlannerBlockId,
            linkedRoutineId: "",
            linkedObjectiveId: "",
            recurringTarget: "",
            milestones: [],
            notes: row.notes,
            resetCycle: "weekly",
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          });
        } else if (row.type === "objective") {
          systemsData.objectives.push({
            id: row.id,
            title: row.name,
            type: row.type,
            status: row.status,
            priority: "Medium",
            dueDate: row.date,
            dueTime: row.endTime,
            estimatedMinutes: row.durationMinutes,
            category: row.category,
            tags: "",
            notes: row.notes,
            linkedPlannerBlockId: row.linkedPlannerBlockId,
            linkedRoutineId: "",
            linkedHabitId: row.linkedHabitId,
            linkedTrackerId: "",
            linkedGoalId: row.linkedGoalId,
            trackerLogAmount: "",
            completedDate: "",
            completedAt: "",
            autoCompleteFromPlanner: true,
            autoCompleteFromHabit: true,
            focus: false,
            recurring: "",
            subtasks: [],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            deferredCount: 0
          });
        } else if (row.type === "metric") {
          systemsData.metrics.push({
            id: row.id,
            name: row.name,
            type: row.category,
            unit: row.unit,
            startValue: "",
            currentValue: row.amount,
            targetValue: "",
            startDate: row.date,
            deadline: row.endTime,
            linkedHabitId: row.linkedHabitId,
            recurringTarget: "",
            notes: row.notes,
            entries: [],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          });
        } else if (row.type === "log") {
          systemsData.logs.push({
            id: row.id,
            title: row.name,
            type: row.category,
            valueType: row.category,
            value: row.amount,
            unit: row.unit,
            date: row.date,
            notes: row.notes,
            linkedHabitId: row.linkedHabitId,
            linkedItemType: "",
            linkedMetricId: "",
            linkedTrackerId: "",
            linkedGoalId: row.linkedGoalId,
            linkedPlannerBlockId: row.linkedPlannerBlockId,
            linkedRoutineId: "",
            linkedObjectiveId: "",
            logSource: row.source,
            plannerAutoLogKey: "",
            inactive: false,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          });
        }
        break;

      case "Social":
        if (row.type === "hangout") {
          socialData.hangouts.push({
            id: row.id,
            activity: row.name,
            date: row.date,
            time: row.startTime,
            location: row.endTime,
            people: [],
            cost: row.amount,
            checklist: "",
            moodAfter: "",
            rating: "",
            memories: "",
            followUpReminder: "",
            notes: row.notes,
            completed: row.status === "completed",
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          });
        } else if (row.type === "idea") {
          socialData.ideas.push({
            id: row.id,
            title: row.name,
            category: row.category,
            cost: row.amount,
            notes: row.notes,
            favorite: false,
            linkedFriendIds: [],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          });
        } else if (row.type === "friend") {
          socialData.friends.push({
            id: row.id,
            name: row.name,
            birthday: row.date,
            phoneHandle: row.startTime,
            favoriteFood: row.endTime,
            giftIdeas: "",
            importantNotes: row.notes,
            relationshipType: row.category,
            priority: row.status,
            interests: "",
            details: "",
            notes: "",
            favoriteActivities: "",
            contactNotes: "",
            lastContacted: "",
            lastSeen: "",
            preferredHangoutStyle: "",
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          });
        }
        break;
    }
  });

  // Recalculate tracker progress from imported logs
  recalcAllTrackerCurrentsFromLogs();

  // Save all data after merge
  savePlannerData();
  saveScheduleData();
  saveSystemsData();
  saveSocialData();
  saveAllZipData();
}

function handleAllZipDataImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    const fileExtension = file.name.split('.').pop().toLowerCase();

    if (fileExtension === 'json') {
      importAllZipDataJSON(content);
    } else if (fileExtension === 'csv') {
      importAllZipDataCSV(content);
    } else {
      alert("Unsupported file type. Please upload a JSON or CSV file.");
    }

    event.target.value = "";
  };
  reader.onerror = () => {
    alert("Error reading file.");
  };
  reader.readAsText(file);
}

function saveAllZipData() {
  const result = DataService.saveAllZipData(allZipData);
  triggerAutosync();
  return result;
}

function saveAllZipCustomOptions() {
  const result = DataService.saveAllZipCustomOptions(allZipCustomOptions);
  triggerAutosync();
  return result;
}

// Social Data Import Functions
function handleSocialImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      console.log("Social import file parsed:", parsed);
      previewSocialImport(parsed);
    } catch (error) {
      console.error("Social import JSON parse error:", error);
      alert("Invalid JSON file: " + error.message);
      pendingSocialImport = null;
      renderSocialImportPreview();
    }
  };

  reader.onerror = () => {
    console.error("Social import file read error");
    alert("Could not read file.");
  };

  reader.readAsText(file);
}

function previewSocialImport(data) {
  const social = data.socialData || data;

  const normalized = {
    friends: Array.isArray(social.friends) ? social.friends : [],
    hangouts: Array.isArray(social.hangouts) ? social.hangouts : [],
    ideas: Array.isArray(social.ideas) ? social.ideas : []
  };

  if (!normalized.friends.length && !normalized.hangouts.length && !normalized.ideas.length) {
    alert("No friends, hangouts, or ideas found in this JSON.");
    pendingSocialImport = null;
  } else {
    pendingSocialImport = normalized;
  }

  renderSocialImportPreview();
}

function renderSocialImportPreview() {
  const box = document.getElementById("socialImportPreview");
  const btn = document.getElementById("socialImportConfirmButton");
  if (!box || !btn) return;

  if (!pendingSocialImport) {
    box.innerHTML = "<p>No import preview yet.</p>";
    btn.disabled = true;
    return;
  }

  box.innerHTML = `
    <div class="summary-grid import-count-grid">
      <div><strong>${pendingSocialImport.friends.length}</strong><span>Friends</span></div>
      <div><strong>${pendingSocialImport.hangouts.length}</strong><span>Hangouts</span></div>
      <div><strong>${pendingSocialImport.ideas.length}</strong><span>Ideas</span></div>
    </div>
  `;
  btn.disabled = false;
}

function confirmSocialImport() {
  if (!pendingSocialImport) {
    alert("No data to import.");
    return;
  }

  // Merge imported data with existing social data
  socialData.friends = [...socialData.friends, ...pendingSocialImport.friends];
  socialData.hangouts = [...socialData.hangouts, ...pendingSocialImport.hangouts];
  socialData.ideas = [...socialData.ideas, ...pendingSocialImport.ideas];

  saveSocialData();
  pendingSocialImport = null;
  renderSettings();
  alert("Social data imported successfully.");
}

function previewSocialImportFromLocalStorage() {
  try {
    const stored = DataService.get(DataService.KEYS.SOCIAL_DATA);
    if (stored) {
      previewSocialImport(stored);
    } else {
      alert("No social data found in browser localStorage.");
    }
  } catch (error) {
    console.error("Social import from localStorage error:", error);
    alert("Error reading from localStorage: " + error.message);
  }
}

function previewSocialImportFromTextarea() {
  const textarea = document.getElementById("hangoutPlannerImportJson");
  if (!textarea) return;

  const jsonText = textarea.value.trim();
  if (!jsonText) {
    alert("Please paste JSON data first.");
    return;
  }

  try {
    const parsed = JSON.parse(jsonText);
    console.log("Social import from textarea parsed:", parsed);
    previewSocialImport(parsed);
  } catch (error) {
    console.error("Social import from textarea parse error:", error);
    alert("Invalid JSON: " + error.message);
  }
}

function exportCurrentSocialData() {
  const data = {
    friends: socialData.friends,
    hangouts: socialData.hangouts,
    ideas: socialData.ideas
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flow-social-data-${getTodayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function logToAllZipData(entry) {
  const now = new Date().toISOString();
  const row = {
    id: entry.id || createId("zip"),
    date: entry.date || getTodayISO(),
    source: entry.source || "manual",
    category: entry.category || "",
    type: entry.type || "",
    name: entry.name || "",
    amount: entry.amount || "",
    unit: entry.unit || "",
    startTime: entry.startTime || "",
    endTime: entry.endTime || "",
    durationMinutes: entry.durationMinutes || "",
    status: entry.status || "",
    notes: entry.notes || "",
    linkedGoalId: entry.linkedGoalId || "",
    linkedHabitId: entry.linkedHabitId || "",
    linkedPlannerBlockId: entry.linkedPlannerBlockId || "",
    createdAt: entry.createdAt || now,
    updatedAt: now
  };

  // Check if entry with same id exists and update, otherwise add new
  const existingIndex = allZipData.findIndex(r => r.id === row.id);
  if (existingIndex >= 0) {
    allZipData[existingIndex] = row;
  } else {
    allZipData.push(row);
  }

  saveAllZipData();
}

function filterAllZipData() {
  const categoryFilter = document.getElementById("allZipDataCategoryFilter")?.value || "All";
  const typeFilter = document.getElementById("allZipDataTypeFilter")?.value || "All";
  const unitFilter = document.getElementById("allZipDataUnitFilter")?.value || "All";
  const sourceFilter = document.getElementById("allZipDataSourceFilter")?.value || "All";
  const goalFilter = document.getElementById("allZipDataGoalFilter")?.value || "All";
  const startDate = document.getElementById("allZipDataStartDate")?.value || "";
  const endDate = document.getElementById("allZipDataEndDate")?.value || "";

  const filtered = allZipData.filter(row => {
    if (categoryFilter !== "All" && row.category !== categoryFilter) return false;
    if (typeFilter !== "All" && row.type !== typeFilter) return false;
    if (unitFilter !== "All" && row.unit !== unitFilter) return false;
    if (sourceFilter !== "All" && row.source !== sourceFilter) return false;
    if (goalFilter !== "All" && row.linkedGoalId !== goalFilter) return false;
    if (startDate && row.date < startDate) return false;
    if (endDate && row.date > endDate) return false;
    return true;
  });

  // Update export functions to use filtered data if filters are active
  window.filteredAllZipData = (categoryFilter !== "All" || typeFilter !== "All" || unitFilter !== "All" || sourceFilter !== "All" || goalFilter !== "All" || startDate || endDate) ? filtered : null;

  // Update history display
  renderAllZipDataHistory(filtered);
}

function addCustomCategory() {
  const input = document.getElementById("newCategoryInput");
  const value = input.value.trim();
  if (!value) return;
  if (!allZipCustomOptions.categories.includes(value)) {
    allZipCustomOptions.categories.push(value);
    saveAllZipCustomOptions();
    populateAllZipDataDropdowns();
    renderCustomOptionChips();
  }
  input.value = "";
}

function addCustomType() {
  const input = document.getElementById("newTypeInput");
  const value = input.value.trim();
  if (!value) return;
  if (!allZipCustomOptions.types.includes(value)) {
    allZipCustomOptions.types.push(value);
    saveAllZipCustomOptions();
    populateAllZipDataDropdowns();
    renderCustomOptionChips();
  }
  input.value = "";
}

function addCustomUnit() {
  const input = document.getElementById("newUnitInput");
  const value = input.value.trim();
  if (!value) return;
  if (!allZipCustomOptions.units.includes(value)) {
    allZipCustomOptions.units.push(value);
    saveAllZipCustomOptions();
    populateAllZipDataDropdowns();
    renderCustomOptionChips();
  }
  input.value = "";
}

function removeCustomCategory(category) {
  allZipCustomOptions.categories = allZipCustomOptions.categories.filter(c => c !== category);
  saveAllZipCustomOptions();
  populateAllZipDataDropdowns();
  renderCustomOptionChips();
}

function removeCustomType(type) {
  allZipCustomOptions.types = allZipCustomOptions.types.filter(t => t !== type);
  saveAllZipCustomOptions();
  populateAllZipDataDropdowns();
  renderCustomOptionChips();
}

function removeCustomUnit(unit) {
  allZipCustomOptions.units = allZipCustomOptions.units.filter(u => u !== unit);
  saveAllZipCustomOptions();
  populateAllZipDataDropdowns();
  renderCustomOptionChips();
}

function populateAllZipDataDropdowns() {
  // Populate category filter
  const categorySelect = document.getElementById("allZipDataCategoryFilter");
  if (categorySelect) {
    const currentValue = categorySelect.value;
    categorySelect.innerHTML = `<option value="All">All Categories</option>` +
      allZipCustomOptions.categories.map(cat => `<option value="${cat}">${cat}</option>`).join("");
    categorySelect.value = currentValue || "All";
  }

  // Populate type filter
  const typeSelect = document.getElementById("allZipDataTypeFilter");
  if (typeSelect) {
    const currentValue = typeSelect.value;
    typeSelect.innerHTML = `<option value="All">All Types</option>` +
      allZipCustomOptions.types.map(type => `<option value="${type}">${type}</option>`).join("");
    typeSelect.value = currentValue || "All";
  }

  // Populate unit filter
  const unitSelect = document.getElementById("allZipDataUnitFilter");
  if (unitSelect) {
    const currentValue = unitSelect.value;
    unitSelect.innerHTML = `<option value="All">All Units</option>` +
      allZipCustomOptions.units.map(unit => `<option value="${unit}">${unit}</option>`).join("");
    unitSelect.value = currentValue || "All";
  }

  // Populate goal filter
  const goalSelect = document.getElementById("allZipDataGoalFilter");
  if (goalSelect) {
    const currentValue = goalSelect.value;
    goalSelect.innerHTML = `<option value="All">All Goals</option>` +
      systemsData.goals.map(goal => `<option value="${goal.id}">${goal.name}</option>`).join("");
    goalSelect.value = currentValue || "All";
  }
}

function renderCustomOptionChips() {
  // Render category chips
  const categoryChips = document.getElementById("customCategoriesChips");
  if (categoryChips) {
    categoryChips.innerHTML = allZipCustomOptions.categories.map(cat =>
      `<span class="chip">${escapeHTML(cat)} <button onclick="removeCustomCategory('${escapeHTML(cat)}')" class="chip-remove">×</button></span>`
    ).join("");
  }

  // Render type chips
  const typeChips = document.getElementById("customTypesChips");
  if (typeChips) {
    typeChips.innerHTML = allZipCustomOptions.types.map(type =>
      `<span class="chip">${escapeHTML(type)} <button onclick="removeCustomType('${escapeHTML(type)}')" class="chip-remove">×</button></span>`
    ).join("");
  }

  // Render unit chips
  const unitChips = document.getElementById("customUnitsChips");
  if (unitChips) {
    unitChips.innerHTML = allZipCustomOptions.units.map(unit =>
      `<span class="chip">${escapeHTML(unit)} <button onclick="removeCustomUnit('${escapeHTML(unit)}')" class="chip-remove">×</button></span>`
    ).join("");
  }
}

function renderAllZipDataHistory(data = allZipData) {
  const container = document.getElementById("allZipDataHistory");
  if (!container) return;

  const sortedData = [...data].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (sortedData.length === 0) {
    container.innerHTML = "<p>No logs to display.</p>";
    return;
  }

  container.innerHTML = sortedData.slice(0, 50).map(row => `
    <div class="card" style="padding: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
        <div>
          <strong>${escapeHTML(row.name || "")}</strong>
          <span style="font-size: 12px; color: var(--text-muted); margin-left: 8px;">${escapeHTML(row.type || "")}</span>
        </div>
        <span style="font-size: 12px; color: var(--text-muted);">${escapeHTML(row.date || "")}</span>
      </div>
      <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
        ${row.source ? `Source: ${escapeHTML(row.source)}` : ""}
        ${row.category ? ` | Category: ${escapeHTML(row.category)}` : ""}
        ${row.amount ? ` | Amount: ${escapeHTML(row.amount)}${row.unit ? " " + escapeHTML(row.unit) : ""}` : ""}
        ${row.status ? ` | Status: ${escapeHTML(row.status)}` : ""}
      </div>
      ${row.notes ? `<p style="font-size: 13px; margin-top: 6px;">${escapeHTML(row.notes)}</p>` : ""}
    </div>
  `).join("");
}

function calculateGoalProgressFromAllZipData(goalId) {
  if (!goalId) return { current: 0, target: 0, percentage: 0, logs: [] };

  const goal = systemsData.goals.find(g => g.id === goalId);
  if (!goal) return { current: 0, target: 0, percentage: 0, logs: [] };

  const target = Number(goal.targetValue) || 0;
  const start = Number(goal.startValue) || 0;

  // Get all logs linked to this goal
  const goalLogs = allZipData.filter(row => row.linkedGoalId === goalId && row.amount);

  let current = start;
  goalLogs.forEach(log => {
    const amount = Number(log.amount) || 0;
    if (goal.goalType === "Decrease toward target") {
      current -= amount;
    } else {
      current += amount;
    }
  });

  const percentage = target > 0 ? Math.round((current / target) * 100) : 0;

  return {
    current,
    target,
    percentage: Math.min(percentage, 100),
    logs: goalLogs
  };
}

function populateGoalProgressDropdown() {
  const select = document.getElementById("allZipDataGoalProgressSelect");
  if (!select) return;

  select.innerHTML = `<option value="">Select a goal</option>` +
    systemsData.goals.map(goal => `<option value="${goal.id}">${escapeHTML(goal.name)}</option>`).join("");
}

function displayGoalProgressFromAllZipData() {
  const goalId = document.getElementById("allZipDataGoalProgressSelect")?.value || "";
  const container = document.getElementById("allZipDataGoalProgress");

  if (!container) return;

  if (!goalId) {
    container.innerHTML = "<p>Select a goal to view progress.</p>";
    return;
  }

  const progress = calculateGoalProgressFromAllZipData(goalId);
  const goal = systemsData.goals.find(g => g.id === goalId);

  container.innerHTML = `
    <div class="tracker-progress-bar">
      <div class="tracker-progress-fill" style="width: ${progress.percentage}%"></div>
    </div>
    <p class="tracker-pct">${progress.percentage}% complete</p>
    <p><strong>${progress.current}</strong> / ${progress.target} ${goal.unit || ""}</p>
    <p class="muted-text">${progress.logs.length} log entries linked to this goal</p>
  `;
}

function addAllZipDataExamples() {
  const today = getTodayISO();

  // Weight loss example (body metric)
  logToAllZipData({
    id: "example_weight_loss_1",
    date: getDateOffset(today, -7),
    source: "manual",
    category: "Body Metric",
    type: "metric",
    name: "Weight tracking",
    amount: "185",
    unit: "lbs",
    startTime: "",
    endTime: "",
    durationMinutes: "",
    status: "",
    notes: "Starting weight measurement",
    linkedGoalId: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    createdAt: ""
  });

  logToAllZipData({
    id: "example_weight_loss_2",
    date: getDateOffset(today, -3),
    source: "manual",
    category: "Body Metric",
    type: "metric",
    name: "Weight tracking",
    amount: "183",
    unit: "lbs",
    startTime: "",
    endTime: "",
    durationMinutes: "",
    status: "",
    notes: "Progress update",
    linkedGoalId: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    createdAt: ""
  });

  // Taper example (reduction log)
  logToAllZipData({
    id: "example_taper_1",
    date: getDateOffset(today, -14),
    source: "manual",
    category: "Taper",
    type: "log",
    name: "Caffeine taper",
    amount: "400",
    unit: "mg",
    startTime: "",
    endTime: "",
    durationMinutes: "",
    status: "",
    notes: "Starting caffeine intake",
    linkedGoalId: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    createdAt: ""
  });

  logToAllZipData({
    id: "example_taper_2",
    date: getDateOffset(today, -7),
    source: "manual",
    category: "Taper",
    type: "log",
    name: "Caffeine taper",
    amount: "300",
    unit: "mg",
    startTime: "",
    endTime: "",
    durationMinutes: "",
    status: "",
    notes: "Reduced to 300mg",
    linkedGoalId: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    createdAt: ""
  });

  // ACC study hours example
  logToAllZipData({
    id: "example_acc_study_1",
    date: getDateOffset(today, -5),
    source: "manual",
    category: "School",
    type: "log",
    name: "ACC study session",
    amount: "2.5",
    unit: "hours",
    startTime: "09:00",
    endTime: "11:30",
    durationMinutes: "150",
    status: "completed",
    notes: "Chapter 5-7 review",
    linkedGoalId: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    createdAt: ""
  });

  logToAllZipData({
    id: "example_acc_study_2",
    date: getDateOffset(today, -2),
    source: "manual",
    category: "School",
    type: "log",
    name: "ACC study session",
    amount: "3",
    unit: "hours",
    startTime: "14:00",
    endTime: "17:00",
    durationMinutes: "180",
    status: "completed",
    notes: "Practice exam",
    linkedGoalId: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    createdAt: ""
  });

  // Kings MMA classes example (routine)
  logToAllZipData({
    id: "example_mma_1",
    date: getDateOffset(today, -6),
    source: "Planner",
    category: "Gym",
    type: "routine",
    name: "Kings MMA BJJ class",
    amount: "",
    unit: "",
    startTime: "18:00",
    endTime: "19:30",
    durationMinutes: "90",
    status: "completed",
    notes: "Drills and sparring",
    linkedGoalId: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    createdAt: ""
  });

  logToAllZipData({
    id: "example_mma_2",
    date: getDateOffset(today, -3),
    source: "Planner",
    category: "Gym",
    type: "routine",
    name: "Kings MMA striking class",
    amount: "",
    unit: "",
    startTime: "17:30",
    endTime: "18:30",
    durationMinutes: "60",
    status: "completed",
    notes: "Muay Thai techniques",
    linkedGoalId: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    createdAt: ""
  });

  // Real estate license hours example (course hours)
  logToAllZipData({
    id: "example_real_estate_1",
    date: getDateOffset(today, -10),
    source: "manual",
    category: "Work",
    type: "log",
    name: "Real estate pre-license course",
    amount: "4",
    unit: "hours",
    startTime: "09:00",
    endTime: "13:00",
    durationMinutes: "240",
    status: "completed",
    notes: "Module 1: Property law",
    linkedGoalId: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    createdAt: ""
  });

  logToAllZipData({
    id: "example_real_estate_2",
    date: getDateOffset(today, -4),
    source: "manual",
    category: "Work",
    type: "log",
    name: "Real estate pre-license course",
    amount: "3.5",
    unit: "hours",
    startTime: "10:00",
    endTime: "13:30",
    durationMinutes: "210",
    status: "completed",
    notes: "Module 2: Contracts",
    linkedGoalId: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    createdAt: ""
  });

  // Social/hangout logs example
  logToAllZipData({
    id: "example_social_1",
    date: getDateOffset(today, -8),
    source: "Social",
    category: "Social",
    type: "hangout",
    name: "Dinner with Alex",
    amount: "45",
    unit: "dollars",
    startTime: "19:00",
    endTime: "21:00",
    durationMinutes: "120",
    status: "completed",
    notes: "Italian restaurant downtown",
    linkedGoalId: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    createdAt: ""
  });

  logToAllZipData({
    id: "example_social_2",
    date: getDateOffset(today, -1),
    source: "Social",
    category: "Social",
    type: "hangout",
    name: "Coffee with Sarah",
    amount: "8",
    unit: "dollars",
    startTime: "10:00",
    endTime: "11:30",
    durationMinutes: "90",
    status: "completed",
    notes: "Catching up on life updates",
    linkedGoalId: "",
    linkedHabitId: "",
    linkedPlannerBlockId: "",
    createdAt: ""
  });

  alert("Example data added to All Zip Data!");
}

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
  linkedItemType: log.linkedItemType || (log.linkedMetricId ? "metric" : log.linkedGoalId ? "goal" : log.linkedHabitId ? "habit" : ""),
  linkedMetricId: log.linkedMetricId || "",
  linkedTrackerId: log.linkedTrackerId || log.trackerId || "",
  linkedGoalId: log.linkedGoalId || "",
  linkedPlannerBlockId: log.linkedPlannerBlockId || "",
  linkedRoutineId: log.linkedRoutineId || "",
  linkedObjectiveId: log.linkedObjectiveId || "",
  logSource: log.logSource || inferLegacyLogSource(log),
  plannerAutoLogKey: log.plannerAutoLogKey || "",
  inactive: Boolean(log.inactive)
}));

migrateSystemsToUnifiedTrackers();

systemsData.trackers = systemsData.trackers.map(normalizeUnifiedTrackerRecord);

let scheduleData = DataService.get(DataService.KEYS.SCHEDULE_DATA) || {
  blocks: []
};

// All Zip Data - Unified Master Log for real-time tracking
let allZipData = DataService.get(DataService.KEYS.ALL_ZIP_DATA) || [];

// Custom options for All Zip Data filters
let allZipCustomOptions = DataService.get(DataService.KEYS.ALL_ZIP_CUSTOM_OPTIONS) || {
  categories: [],
  habitTypes: [],
  trackerTypes: [],
  objectiveTypes: [],
  activityTypes: [],
  socialTypes: [],
  units: [],
  removedDefaults: {
    categories: [],
    types: [],
    habitTypes: [],
    trackerTypes: [],
    objectiveTypes: [],
    activityTypes: [],
    socialTypes: [],
    units: []
  }
};

if (!Array.isArray(scheduleData.blocks)) {
  scheduleData.blocks = [];
}

if (!Array.isArray(scheduleData.routines)) {
  scheduleData.routines = [];
}

// Helper functions for Categories, Types, and Units
const DEFAULT_CATEGORIES = ["School", "Work", "Gym", "Social", "Personal", "Errand", "Custom"];
const DEFAULT_UNITS = ["hours", "hrs", "minutes", "min", "dollars", "$", "lbs", "oz", "grams", "g", "kg", "miles", "km", "reps", "sets"];

// System-specific types
const DEFAULT_HABIT_TYPES = ["Daily", "Weekly", "Routine", "Wellness", "Recovery", "Discipline", "Custom"];
const DEFAULT_TRACKER_TYPES = ["Progress", "Metric", "Taper", "Finance"];
const DEFAULT_OBJECTIVE_TYPES = ["Task", "Deadline", "Reminder", "Errand", "Follow-up"];
const DEFAULT_ACTIVITY_TYPES = ["Manual", "Habit completion", "Tracker update", "Objective completion", "Planner completion", "Imported"];
const DEFAULT_SOCIAL_TYPES = ["Friend", "Hangout", "Group", "Family", "Networking", "Relationship"];

// Legacy default types (for compatibility)
const DEFAULT_TYPES = ["task", "routine", "habit", "goal", "objective", "metric", "log", "hangout", "idea", "friend"];

function getAllCategories() {
  const custom = allZipCustomOptions?.categories || [];
  const removed = allZipCustomOptions?.removedDefaults?.categories || [];
  const seen = new Set();
  
  return [...DEFAULT_CATEGORIES, ...custom].filter(c => {
    const trimmed = String(c).trim();
    if (!trimmed) return false;
    if (removed.map(x => x.toLowerCase()).includes(trimmed.toLowerCase())) return false;
    if (seen.has(trimmed.toLowerCase())) return false;
    seen.add(trimmed.toLowerCase());
    return true;
  });
}

function getAllTypes() {
  const custom = allZipCustomOptions?.types || [];
  const removed = allZipCustomOptions?.removedDefaults?.types || [];
  const seen = new Set();
  
  return [...DEFAULT_TYPES, ...custom].filter(t => {
    const trimmed = String(t).trim();
    if (!trimmed) return false;
    if (removed.map(x => x.toLowerCase()).includes(trimmed.toLowerCase())) return false;
    if (seen.has(trimmed.toLowerCase())) return false;
    seen.add(trimmed.toLowerCase());
    return true;
  });
}

// System-specific type helper functions
function getHabitTypes() {
  const custom = allZipCustomOptions?.habitTypes || [];
  const removed = allZipCustomOptions?.removedDefaults?.habitTypes || [];
  const seen = new Set();
  
  return [...DEFAULT_HABIT_TYPES, ...custom].filter(t => {
    const trimmed = String(t).trim();
    if (!trimmed) return false;
    if (removed.map(x => x.toLowerCase()).includes(trimmed.toLowerCase())) return false;
    if (seen.has(trimmed.toLowerCase())) return false;
    seen.add(trimmed.toLowerCase());
    return true;
  });
}

function renderHabitTypeOptions(selected = "") {
  return getHabitTypes().map(type =>
    `<option value="${escapeHTML(type)}" ${type === selected ? "selected" : ""}>${escapeHTML(type)}</option>`
  ).join("");
}

function getTrackerTypes() {
  const custom = allZipCustomOptions?.trackerTypes || [];
  const removed = allZipCustomOptions?.removedDefaults?.trackerTypes || [];
  const seen = new Set();
  
  return [...DEFAULT_TRACKER_TYPES, ...custom].filter(t => {
    const trimmed = String(t).trim();
    if (!trimmed) return false;
    if (removed.map(x => x.toLowerCase()).includes(trimmed.toLowerCase())) return false;
    if (seen.has(trimmed.toLowerCase())) return false;
    seen.add(trimmed.toLowerCase());
    return true;
  });
}

function getObjectiveTypes() {
  const custom = allZipCustomOptions?.objectiveTypes || [];
  const removed = allZipCustomOptions?.removedDefaults?.objectiveTypes || [];
  const seen = new Set();
  
  return [...DEFAULT_OBJECTIVE_TYPES, ...custom].filter(t => {
    const trimmed = String(t).trim();
    if (!trimmed) return false;
    if (removed.map(x => x.toLowerCase()).includes(trimmed.toLowerCase())) return false;
    if (seen.has(trimmed.toLowerCase())) return false;
    seen.add(trimmed.toLowerCase());
    return true;
  });
}

function getActivityTypes() {
  const custom = allZipCustomOptions?.activityTypes || [];
  const removed = allZipCustomOptions?.removedDefaults?.activityTypes || [];
  const seen = new Set();
  
  return [...DEFAULT_ACTIVITY_TYPES, ...custom].filter(t => {
    const trimmed = String(t).trim();
    if (!trimmed) return false;
    if (removed.map(x => x.toLowerCase()).includes(trimmed.toLowerCase())) return false;
    if (seen.has(trimmed.toLowerCase())) return false;
    seen.add(trimmed.toLowerCase());
    return true;
  });
}

function getSocialTypes() {
  const custom = allZipCustomOptions?.socialTypes || [];
  const removed = allZipCustomOptions?.removedDefaults?.socialTypes || [];
  const seen = new Set();
  
  return [...DEFAULT_SOCIAL_TYPES, ...custom].filter(t => {
    const trimmed = String(t).trim();
    if (!trimmed) return false;
    if (removed.map(x => x.toLowerCase()).includes(trimmed.toLowerCase())) return false;
    if (seen.has(trimmed.toLowerCase())) return false;
    seen.add(trimmed.toLowerCase());
    return true;
  });
}

function getAllUnits() {
  const custom = allZipCustomOptions?.units || [];
  const removed = allZipCustomOptions?.removedDefaults?.units || [];
  const seen = new Set();
  
  return [...DEFAULT_UNITS, ...custom].filter(u => {
    const trimmed = String(u).trim();
    if (!trimmed) return false;
    if (removed.map(x => x.toLowerCase()).includes(trimmed.toLowerCase())) return false;
    if (seen.has(trimmed.toLowerCase())) return false;
    seen.add(trimmed.toLowerCase());
    return true;
  });
}

function renderCategoryOptions(selected = "") {
  return getAllCategories().map(c => `<option value="${escapeHTML(c)}" ${c === selected ? "selected" : ""}>${escapeHTML(c)}</option>`).join("");
}

function renderTypeOptions(selected = "", systemType = null) {
  return getAllTypes(systemType).map(t => `<option value="${escapeHTML(t)}" ${t === selected ? "selected" : ""}>${escapeHTML(t)}</option>`).join("");
}

function renderUnitOptions(selected = "") {
  return getAllUnits().map(u => `<option value="${escapeHTML(u)}" ${u === selected ? "selected" : ""}>${escapeHTML(u)}</option>`).join("");
}

function saveAllZipCustomOptions() {
  DataService.set(DataService.KEYS.ALL_ZIP_CUSTOM_OPTIONS, allZipCustomOptions);
}

// Render options lists in Settings
function renderOptionsLists() {
  renderSelectedOptionGroup();
}

function renderSelectedOptionGroup() {
  const type = document.getElementById("optionGroupSelector")?.value || "category";
  const box = document.getElementById("optionsList");
  if (!box) return;
  
  let allOptions, defaults, storageKey;
  if (type === 'category') {
    allOptions = getAllCategories();
    defaults = DEFAULT_CATEGORIES;
    storageKey = 'categories';
  } else if (type === 'habitTypes') {
    allOptions = getHabitTypes();
    defaults = DEFAULT_HABIT_TYPES;
    storageKey = 'habitTypes';
  } else if (type === 'trackerTypes') {
    allOptions = getTrackerTypes();
    defaults = DEFAULT_TRACKER_TYPES;
    storageKey = 'trackerTypes';
  } else if (type === 'objectiveTypes') {
    allOptions = getObjectiveTypes();
    defaults = DEFAULT_OBJECTIVE_TYPES;
    storageKey = 'objectiveTypes';
  } else if (type === 'activityTypes') {
    allOptions = getActivityTypes();
    defaults = DEFAULT_ACTIVITY_TYPES;
    storageKey = 'activityTypes';
  } else if (type === 'socialTypes') {
    allOptions = getSocialTypes();
    defaults = DEFAULT_SOCIAL_TYPES;
    storageKey = 'socialTypes';
  } else {
    allOptions = getAllUnits();
    defaults = DEFAULT_UNITS;
    storageKey = 'units';
  }
  
  const searchTerm = document.getElementById("optionSearchInput")?.value?.toLowerCase() || "";
  
  const filteredOptions = allOptions.filter(opt => 
    opt.toLowerCase().includes(searchTerm)
  );
  
  box.innerHTML = filteredOptions.map(option => {
    const isDefault = defaults.includes(option);
    return `
      <div class="option-row ${isDefault ? 'is-default' : ''}" data-option="${escapeHTML(option)}">
        <span class="option-row-name">${escapeHTML(option)}</span>
        <div class="option-row-actions">
          <button onclick="startEditOption('${escapeHTML(option)}')">Edit</button>
          <button class="delete-option-btn" onclick="deleteOptionFromManager('${escapeHTML(option)}')">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

// Add custom option from manager
function addCustomOptionFromManager() {
  const type = document.getElementById("optionGroupSelector")?.value || "category";
  const input = document.getElementById("newOptionInput");
  const value = input?.value?.trim();
  
  if (!value) {
    alert("Please enter a value");
    return;
  }
  
  let arrayName, allOptions;
  if (type === 'category') {
    arrayName = 'categories';
    allOptions = getAllCategories();
  } else if (type === 'habitTypes') {
    arrayName = 'habitTypes';
    allOptions = getHabitTypes();
  } else if (type === 'trackerTypes') {
    arrayName = 'trackerTypes';
    allOptions = getTrackerTypes();
  } else if (type === 'objectiveTypes') {
    arrayName = 'objectiveTypes';
    allOptions = getObjectiveTypes();
  } else if (type === 'activityTypes') {
    arrayName = 'activityTypes';
    allOptions = getActivityTypes();
  } else if (type === 'socialTypes') {
    arrayName = 'socialTypes';
    allOptions = getSocialTypes();
  } else {
    arrayName = 'units';
    allOptions = getAllUnits();
  }
  
  if (allOptions.map(o => o.toLowerCase()).includes(value.toLowerCase())) {
    alert("This option already exists");
    return;
  }
  
  if (!allZipCustomOptions[arrayName]) {
    allZipCustomOptions[arrayName] = [];
  }
  
  allZipCustomOptions[arrayName].push(value);
  saveAllZipCustomOptions();
  
  if (input) input.value = "";
  renderSelectedOptionGroup();
}

// Start editing option
function startEditOption(option) {
  const type = document.getElementById("optionGroupSelector")?.value || "category";
  const row = document.querySelector(`.option-row[data-option="${escapeHTML(option)}"]`);
  if (!row) return;
  
  row.innerHTML = `
    <div class="option-row-edit">
      <input id="editOptionInput" value="${escapeHTML(option)}" placeholder="New name">
      <button onclick="saveEditOption('${escapeHTML(option)}')">Save</button>
      <button class="secondary-btn" onclick="renderSelectedOptionGroup()">Cancel</button>
    </div>
  `;
  
  const editInput = document.getElementById("editOptionInput");
  if (editInput) {
    editInput.focus();
    editInput.select();
  }
}

// Save edited option
function saveEditOption(oldValue) {
  const type = document.getElementById("optionGroupSelector")?.value || "category";
  const input = document.getElementById("editOptionInput");
  const newValue = input?.value?.trim();
  
  if (!newValue || newValue === "") {
    alert("Please enter a value");
    return;
  }
  
  if (newValue.toLowerCase() === oldValue.toLowerCase()) {
    renderSelectedOptionGroup();
    return;
  }
  
  const arrayName = type === 'category' ? 'categories' : type === 'type' ? 'types' : 'units';
  const allOptions = type === 'category' ? getAllCategories() : type === 'type' ? getAllTypes() : getAllUnits();
  
  if (allOptions.map(o => o.toLowerCase()).includes(newValue.toLowerCase())) {
    alert("This option already exists");
    return;
  }
  
  // Update in allZipCustomOptions if it's a custom option
  if (allZipCustomOptions[arrayName]) {
    const idx = allZipCustomOptions[arrayName].indexOf(oldValue);
    if (idx !== -1) {
      allZipCustomOptions[arrayName][idx] = newValue;
    }
  }
  
  // Update existing records
  updateRecordsWithOption(type, oldValue, newValue);
  
  saveAllZipCustomOptions();
  saveSystemsData();
  saveScheduleData();
  saveAllZipData();
  
  renderSelectedOptionGroup();
  refreshOpenForms();
}

// Delete option from manager
function deleteOptionFromManager(value) {
  const type = document.getElementById("optionGroupSelector")?.value || "category";
  
  // Check if currently editing this specific option
  const row = document.querySelector(`.option-row[data-option="${escapeHTML(value)}"]`);
  if (row && row.querySelector('.option-row-edit')) {
    alert("Please cancel or save the current edit before deleting.");
    return;
  }
  
  if (!confirm(`Delete "${value}" from dropdown options? Existing records using this option will keep their value.`)) {
    return;
  }
  
  const arrayName = type === 'category' ? 'categories' : type === 'type' ? 'types' : 'units';
  const defaults = type === 'category' ? DEFAULT_CATEGORIES : type === 'type' ? DEFAULT_TYPES : DEFAULT_UNITS;
  
  // Remove from custom options
  if (allZipCustomOptions[arrayName]) {
    const idx = allZipCustomOptions[arrayName].indexOf(value);
    if (idx !== -1) {
      allZipCustomOptions[arrayName].splice(idx, 1);
    }
  }
  
  // If it's a default, track it as removed
  if (!allZipCustomOptions.removedDefaults) {
    allZipCustomOptions.removedDefaults = { categories: [], types: [], units: [] };
  }
  
  if (defaults.includes(value)) {
    const removedArrayName = type === 'category' ? 'categories' : type === 'type' ? 'types' : 'units';
    if (!allZipCustomOptions.removedDefaults[removedArrayName].includes(value)) {
      allZipCustomOptions.removedDefaults[removedArrayName].push(value);
    }
  }
  
  saveAllZipCustomOptions();
  renderSelectedOptionGroup();
}

// Reset to defaults from manager
function resetOptionsToDefaultsFromManager() {
  const type = document.getElementById("optionGroupSelector")?.value || "category";
  if (!confirm(`Reset ${type}s to defaults? This will restore all default options and remove all custom ${type}s.`)) {
    return;
  }
  
  let arrayName, removedArrayName;
  if (type === 'category') {
    arrayName = 'categories';
    removedArrayName = 'categories';
  } else if (type === 'habitTypes') {
    arrayName = 'habitTypes';
    removedArrayName = 'habitTypes';
  } else if (type === 'trackerTypes') {
    arrayName = 'trackerTypes';
    removedArrayName = 'trackerTypes';
  } else if (type === 'objectiveTypes') {
    arrayName = 'objectiveTypes';
    removedArrayName = 'objectiveTypes';
  } else if (type === 'activityTypes') {
    arrayName = 'activityTypes';
    removedArrayName = 'activityTypes';
  } else if (type === 'socialTypes') {
    arrayName = 'socialTypes';
    removedArrayName = 'socialTypes';
  } else {
    arrayName = 'units';
    removedArrayName = 'units';
  }
  
  allZipCustomOptions[arrayName] = [];
  
  // Also clear removed defaults to restore them
  if (!allZipCustomOptions.removedDefaults) {
    allZipCustomOptions.removedDefaults = { 
      categories: [], 
      types: [], 
      habitTypes: [],
      trackerTypes: [],
      objectiveTypes: [],
      activityTypes: [],
      socialTypes: [],
      units: [] 
    };
  }
  allZipCustomOptions.removedDefaults[removedArrayName] = [];
  
  saveAllZipCustomOptions();
  renderSelectedOptionGroup();
}

// Update records when option is renamed
function updateRecordsWithOption(type, oldValue, newValue) {
  if (type === 'category') {
    // Update planner blocks
    scheduleData.blocks.forEach(block => {
      if (block.category === oldValue) block.category = newValue;
    });
    
    // Update habits
    systemsData.habits.forEach(habit => {
      if (habit.category === oldValue) habit.category = newValue;
    });
    
    // Update trackers
    systemsData.trackers.forEach(tracker => {
      if (tracker.category === oldValue) tracker.category = newValue;
    });
    
    // Update goals
    systemsData.goals.forEach(goal => {
      if (goal.category === oldValue) goal.category = newValue;
    });
    
    // Update objectives
    systemsData.objectives.forEach(objective => {
      if (objective.category === oldValue) objective.category = newValue;
    });
    
    // Update logs
    systemsData.logs.forEach(log => {
      if (log.category === oldValue) log.category = newValue;
    });
    
    // Update allZipData
    allZipData.forEach(item => {
      if (item.category === oldValue) item.category = newValue;
    });
  } else if (type === 'habitTypes') {
    // Update habits
    systemsData.habits.forEach(habit => {
      if (habit.type === oldValue) habit.type = newValue;
    });
  } else if (type === 'trackerTypes') {
    // Update trackers
    systemsData.trackers.forEach(tracker => {
      if (tracker.type === oldValue) tracker.type = newValue;
    });
  } else if (type === 'objectiveTypes') {
    // Update objectives
    systemsData.objectives.forEach(objective => {
      if (objective.type === oldValue) objective.type = newValue;
    });
  } else if (type === 'activityTypes') {
    // Update logs
    systemsData.logs.forEach(log => {
      if (log.type === oldValue) log.type = newValue;
    });
  } else if (type === 'socialTypes') {
    // Update friends
    if (socialData && socialData.friends) {
      socialData.friends.forEach(friend => {
        if (friend.type === oldValue) friend.type = newValue;
      });
    }
  } else if (type === 'unit') {
    // Update trackers
    systemsData.trackers.forEach(tracker => {
      if (tracker.unit === oldValue) tracker.unit = newValue;
    });
    
    // Update habits
    systemsData.habits.forEach(habit => {
      if (habit.unit === oldValue) habit.unit = newValue;
    });
    
    // Update goals
    systemsData.goals.forEach(goal => {
      if (goal.unit === oldValue) goal.unit = newValue;
    });
    
    // Update logs
    systemsData.logs.forEach(log => {
      if (log.unit === oldValue) log.unit = newValue;
    });
    
    // Update allZipData
    allZipData.forEach(item => {
      if (item.unit === oldValue) item.unit = newValue;
    });
  }
}

// Delete option
function deleteOption(type, value) {
  if (!confirm(`Delete "${value}" from ${type}s? This will only remove it from the dropdown options. Existing records using this option will keep their value.`)) {
    return;
  }
  
  const arrayName = type === 'category' ? 'categories' : type === 'type' ? 'types' : 'units';
  
  if (allZipCustomOptions[arrayName]) {
    const idx = allZipCustomOptions[arrayName].indexOf(value);
    if (idx !== -1) {
      allZipCustomOptions[arrayName].splice(idx, 1);
    }
  }
  
  saveAllZipCustomOptions();
  renderOptionsLists();
}

// Reset to defaults
function resetOptionsToDefaults(type) {
  if (!confirm(`Reset ${type}s to defaults? This will remove all custom ${type}s.`)) {
    return;
  }
  
  const arrayName = type === 'category' ? 'categories' : type === 'type' ? 'types' : 'units';
  allZipCustomOptions[arrayName] = [];
  
  saveAllZipCustomOptions();
  renderOptionsLists();
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
  block.linkedRoutineId = block.linkedRoutineId || block.routineId || "";
  block.routineId = block.routineId || block.linkedRoutineId || "";
  block.linkedHabitId = block.linkedHabitId || block.systemHabitId || "";
  block.systemHabitId = block.systemHabitId || block.linkedHabitId || "";
  block.linkedTrackerId = block.linkedTrackerId || block.systemTrackerId || "";
  block.systemTrackerId = block.systemTrackerId || block.linkedTrackerId || "";
  block.linkedGoalId = block.linkedGoalId || block.systemGoalId || "";
  block.systemGoalId = block.systemGoalId || block.linkedGoalId || "";
  block.linkedObjectiveId = block.linkedObjectiveId || block.systemObjectiveId || "";
  block.systemObjectiveId = block.systemObjectiveId || block.linkedObjectiveId || "";
  block.trackerAutoLogMode = block.trackerAutoLogMode || "none";
  block.trackerLogAmount = block.trackerLogAmount !== undefined && block.trackerLogAmount !== null ? String(block.trackerLogAmount) : "";
});

scheduleData.routines.forEach(routine => {
  if (!routine.id) routine.id = createId("routine");
  if (!Array.isArray(routine.repeatDays)) routine.repeatDays = [];
  if (!Array.isArray(routine.tasks)) routine.tasks = [];
  if (!routine.dayTimes || typeof routine.dayTimes !== "object") routine.dayTimes = {};
  routine.dayTimes = normalizeRoutineDayTimes(routine);
  routine.timesByDay = buildRoutineTimesByDay(routine.dayTimes);
  if (!routine.completions || typeof routine.completions !== "object") routine.completions = {};
  if (!Array.isArray(routine.completedDates)) routine.completedDates = [];
  if (typeof routine.streak !== "number") routine.streak = 0;
  if (typeof routine.autoAdd !== "boolean") routine.autoAdd = false;
  routine.linkedHabitId = routine.linkedHabitId || "";
  routine.linkedTrackerId = routine.linkedTrackerId || "";
  routine.linkedGoalId = routine.linkedGoalId || "";
  routine.linkedObjectiveId = routine.linkedObjectiveId || "";
  routine.category = routine.category || routine.type || "Custom";
  routine.syncFutureBlocks = Boolean(routine.syncFutureBlocks);
  routine.trackerAutoLogMode = routine.trackerAutoLogMode || "none";
  routine.trackerLogAmount = routine.trackerLogAmount !== undefined && routine.trackerLogAmount !== null ? String(routine.trackerLogAmount) : "";
});

collectExistingUnitsIntoSettings();

let editingPlanIndex = null;
let editingFriendIndex = null;
let editingHangoutIndex = null;
let editingRoutineIndex = null;
let editingBlockIndex = null;
let editingIdeaIndex = null;
let editingHabitIndex = null;
let editingTrackerIndex = null;
let editingGoalIndex = null;
let editingObjectiveIndex = null;
let openBlockActionMenuIndex = null;

// Computed editing trackers
const editingTracker = () => {
  if (editingTrackerIndex === null || editingTrackerIndex < 0) return null;
  return systemsData.trackers[editingTrackerIndex];
};
const editingHabit = () => {
  if (editingHabitIndex === null || editingHabitIndex < 0) return null;
  return systemsData.habits[editingHabitIndex];
};
const editingObjective = () => {
  if (editingObjectiveIndex === null || editingObjectiveIndex < 0) return null;
  return systemsData.objectives[editingObjectiveIndex];
};

// History section state
let historyFilter = "All";
let historySort = "dueDate";
let historySearch = "";
let routineCopySourceDay = null;
let editingMetricIndex = null;
let editingLogIndex = null;
let manualLogTrackerId = null;
// duplicate removed: let editingObjectiveIndex = null;
let trackerCategoryFilter = "All";
let completedObjectiveFilter = "All";
let activePlannerSection = "Day";
let activeSystemsSection = "Overview";
let activeSocialSection = "Friends";
let activeSystemsForm = null;
let systemsAddMenuOpen = false;
let friendFormOpen = false;
let hangoutFormOpen = false;
let viewingFriendIndex = null;
let viewingHangoutIndex = null;
let selectedPlannerDate = getTodayISO();
let visiblePlannerMonth = getTodayISO().slice(0, 7);
let plannerWeekStart = getStartOfWeekISO(getTodayISO());
let plannerWeekEnd = getDateOffset(plannerWeekStart, 6);
let pendingSocialImport = null;
let habitCompleteModalIndex = null;
let manageOptionsOpen = false;

// SAVE - All save functions now use centralized DataService
function savePlannerData() {
  const result = DataService.savePlannerData(plannerData);
  triggerAutosync();
  return result;
}

function saveSocialData() {
  const result = DataService.saveSocialData(socialData);
  triggerAutosync();
  return result;
}

function saveSystemsData() {
  const result = DataService.saveSystemsData(systemsData);
  triggerAutosync();
  return result;
}

function saveScheduleData() {
  const result = DataService.saveScheduleData(scheduleData);
  triggerAutosync();
  return result;
}

// CLEAR - All clear functions now use centralized DataService
function clearPlanner() {
  if (confirm("Are you sure you want to clear all Planner data? This cannot be undone.")) {
    DataService.remove(DataService.KEYS.PLANNER_DATA);
    plannerData = { plans: [] };
    location.reload();
  }
}

function clearSystems() {
  if (confirm("Are you sure you want to clear all Systems data? This cannot be undone.")) {
    DataService.remove(DataService.KEYS.SYSTEMS_DATA);
    systemsData = {
      habits: [],
      logs: [],
      trackers: [],
      goals: [],
      metrics: [],
      objectives: [],
      savedTrackerCategories: [],
      savedTrackerUnits: [],
      unitSortMode: "defaults"
    };
    editingHabitIndex = null;
    editingTrackerIndex = null;
    editingGoalIndex = null;
    editingObjectiveIndex = null;
    editingMetricIndex = null;
    editingLogIndex = null;
    activeSystemsForm = null;
    systemsAddMenuOpen = false;
    location.reload();
  }
}

function clearSocial() {
  if (confirm("Are you sure you want to clear all Social data? This cannot be undone.")) {
    DataService.remove(DataService.KEYS.SOCIAL_DATA);
    socialData = { friends: [], hangouts: [], ideas: [] };
    location.reload();
  }
}

// SYNC STATUS DISPLAY
function updateSyncStatusDisplay() {
  const localStorageStatus = document.getElementById("localStorageStatus");
  const cloudStatus = document.getElementById("cloudStatus");
  const lastSyncTime = document.getElementById("lastSyncTime");

  if (localStorageStatus) {
    localStorageStatus.textContent = "Active ✓";
  }

  if (cloudStatus) {
    if (DataService.syncStatus.isCloudConnected) {
      cloudStatus.textContent = "Connected ✓";
      cloudStatus.style.color = "green";
    } else {
      cloudStatus.textContent = "Not Connected";
      cloudStatus.style.color = "orange";
    }
  }

  if (lastSyncTime) {
    const lastSync = localStorage.getItem("flow-planner-last-sync") || DataService.syncStatus.lastSyncTime;
    if (lastSync) {
      const syncDate = new Date(lastSync);
      const now = new Date();
      const diffMs = now - syncDate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) {
        lastSyncTime.textContent = "Just now";
      } else if (diffMins < 60) {
        lastSyncTime.textContent = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      } else if (diffHours < 24) {
        lastSyncTime.textContent = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      } else {
        lastSyncTime.textContent = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      }
    } else {
      lastSyncTime.textContent = "Never";
    }
  }
}

async function forceSyncFromCloud() {
  console.log("[SYNC] Manual sync from cloud triggered");
  const cloudStatus = document.getElementById("cloudStatus");
  const syncErrorMessage = document.getElementById("syncErrorMessage");
  
  if (cloudStatus) {
    cloudStatus.textContent = "Syncing...";
    cloudStatus.style.color = "blue";
  }
  if (syncErrorMessage) {
    syncErrorMessage.textContent = "";
    syncErrorMessage.style.display = "none";
  }

  const result = await DataService.loadFromSupabase();
  if (result) {
    alert("Sync from cloud successful!");
    updateSyncStatusDisplay();
    location.reload();
  } else {
    const errorMsg = "Sync from cloud failed. " + 
      (DataService.syncStatus.syncErrors.length > 0 
        ? DataService.syncStatus.syncErrors[DataService.syncStatus.syncErrors.length - 1].error 
        : "Supabase not configured or connection error.");
    alert(errorMsg);
    if (syncErrorMessage) {
      syncErrorMessage.textContent = errorMsg;
      syncErrorMessage.style.display = "block";
      syncErrorMessage.style.color = "red";
    }
    updateSyncStatusDisplay();
  }
}

async function forceSyncToCloud() {
  console.log("[SYNC] Manual sync to cloud triggered");
  const cloudStatus = document.getElementById("cloudStatus");
  const syncErrorMessage = document.getElementById("syncErrorMessage");
  
  if (cloudStatus) {
    cloudStatus.textContent = "Syncing...";
    cloudStatus.style.color = "blue";
  }
  if (syncErrorMessage) {
    syncErrorMessage.textContent = "";
    syncErrorMessage.style.display = "none";
  }

  const data = {
    plannerData,
    scheduleData,
    systemsData,
    socialData,
    allZipData,
    allZipCustomOptions
  };
  const result = await DataService.saveToSupabase(data);
  if (result) {
    alert("Sync to cloud successful!");
    updateSyncStatusDisplay();
  } else {
    const errorMsg = "Sync to cloud failed. " + 
      (DataService.syncStatus.syncErrors.length > 0 
        ? DataService.syncStatus.syncErrors[DataService.syncStatus.syncErrors.length - 1].error 
        : "Supabase not configured or connection error.");
    alert(errorMsg);
    if (syncErrorMessage) {
      syncErrorMessage.textContent = errorMsg;
      syncErrorMessage.style.display = "block";
      syncErrorMessage.style.color = "red";
    }
    updateSyncStatusDisplay();
  }
}

async function testCloudSync() {
  console.log("[SYNC] Testing cloud sync");
  const testButton = document.getElementById("testCloudSyncButton");
  const testResult = document.getElementById("testCloudSyncResult");
  
  if (testButton) {
    testButton.textContent = "Testing...";
    testButton.disabled = true;
  }
  if (testResult) {
    testResult.textContent = "";
    testResult.style.display = "none";
  }

  if (!window.flowSupabaseStorage?.enabled) {
    const errorMsg = "Supabase not configured. Please check your environment variables.";
    if (testResult) {
      testResult.textContent = errorMsg;
      testResult.style.display = "block";
      testResult.style.color = "red";
    }
    if (testButton) {
      testButton.textContent = "Test Cloud Sync";
      testButton.disabled = false;
    }
    alert(errorMsg);
    return;
  }

  try {
    const ownerId = await window.flowSupabaseStorage.getOwnerId();
    if (!ownerId) {
      throw new Error("Could not get owner ID");
    }

    // Write test object
    const testData = {
      test: true,
      timestamp: new Date().toISOString(),
      message: "Cloud sync test"
    };

    const { error: upsertError } = await window.flowSupabaseStorage.client
      .from("flow_planner_sync")
      .upsert({
        user_id: ownerId,
        data: testData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "user_id"
      });

    if (upsertError) {
      throw new Error("Write failed: " + upsertError.message);
    }

    // Read test object back
    const { data: readData, error: readError } = await window.flowSupabaseStorage.client
      .from("flow_planner_sync")
      .select("data")
      .eq("user_id", ownerId)
      .maybeSingle();

    if (readError) {
      throw new Error("Read failed: " + readError.message);
    }

    if (!readData || !readData.data || readData.data.test !== true) {
      throw new Error("Data verification failed");
    }

    // Restore actual data
    const actualData = {
      plannerData,
      scheduleData,
      systemsData,
      socialData,
      allZipData,
      allZipCustomOptions,
      updatedAt: new Date().toISOString()
    };

    await window.flowSupabaseStorage.syncToCloud(actualData);

    const successMsg = "Cloud sync test passed! Write and read successful.";
    if (testResult) {
      testResult.textContent = successMsg;
      testResult.style.display = "block";
      testResult.style.color = "green";
    }
    if (testButton) {
      testButton.textContent = "Test Cloud Sync";
      testButton.disabled = false;
    }
    alert(successMsg);
    console.log("[SYNC] Test passed");
  } catch (error) {
    const errorMsg = "Cloud sync test failed: " + error.message;
    if (testResult) {
      testResult.textContent = errorMsg;
      testResult.style.display = "block";
      testResult.style.color = "red";
    }
    if (testButton) {
      testButton.textContent = "Test Cloud Sync";
      testButton.disabled = false;
    }
    alert(errorMsg);
    console.error("[SYNC] Test failed:", error);
  }
}

// EXPORT/IMPORT FUNCTIONS
function downloadFullBackup() {
  const json = DataService.exportAllData();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flow-planner-backup-${getTodayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importAllData() {
  const textarea = document.getElementById("allDataImportJson");
  const jsonString = textarea.value.trim();
  if (!jsonString) {
    alert("Please paste a backup JSON to import.");
    return;
  }

  const success = DataService.importAllData(jsonString);
  if (success) {
    alert("Import successful! Data has been merged with existing data.");
    textarea.value = "";
    location.reload();
  } else {
    alert("Import failed. Please check the JSON format.");
  }
}

function getPlannerBlockHabitId(block) {
  return block?.linkedHabitId || block?.systemHabitId || "";
}

function getPlannerBlockTrackerId(block) {
  return block?.linkedTrackerId || block?.systemTrackerId || "";
}

function getPlannerBlockGoalId(block) {
  return block?.linkedGoalId || block?.systemGoalId || "";
}

function getPlannerBlockObjectiveId(block) {
  return block?.linkedObjectiveId || block?.systemObjectiveId || "";
}

function getLinkedItemName(collection, id, fallback = "") {
  if (!id) return "";
  const item = collection.find(entry => entry.id === id);
  return item ? (item.name || item.title || fallback) : fallback;
}

function renderLinkOptions(collection, selectedId = "", emptyLabel = "None") {
  return `<option value="">${emptyLabel}</option>${collection.map(item =>
    `<option value="${escapeHTML(item.id)}" ${item.id === selectedId ? "selected" : ""}>${escapeHTML(item.name || item.title || "Untitled")}</option>`
  ).join("")}`;
}

function renderConnectionBadges(links = {}) {
  const badges = [
    links.routineId ? ["Routine", getLinkedItemName(scheduleData.routines, links.routineId)] : null,
    links.habitId ? ["Habit", getLinkedItemName(systemsData.habits, links.habitId)] : null,
    links.trackerId ? ["Tracker", getLinkedItemName(systemsData.trackers, links.trackerId)] : null,
    links.goalId ? ["Goal", getLinkedItemName(systemsData.goals, links.goalId)] : null,
    links.objectiveId ? ["Objective", getLinkedItemName(systemsData.objectives, links.objectiveId)] : null,
    links.plannerBlockId ? ["Planner", getLinkedItemName(scheduleData.blocks, links.plannerBlockId)] : null
  ].filter(item => item && item[1]);
  if (!badges.length) return "";
  return `<div class="linked-badge-row">${badges.map(([label, name]) =>
    `<span class="linked-badge" title="${escapeHTML(label)}">${escapeHTML(label)}: ${escapeHTML(name)}</span>`
  ).join("")}</div>`;
}

function syncSupabaseData() {
  DataService.saveToSupabase({
    plannerData,
    scheduleData,
    systemsData,
    socialData
  });
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
          <button onclick="quickAddObjective('Task')">+ Task</button>
          <button onclick="quickAddObjective('Objective')">+ Objective</button>
          <button onclick="openPlannerSection('Day')">Planner Block</button>
          <button onclick="openSystemsSection('Habits')">Habit</button>
          <button onclick="openSystemsSection('Trackers')">Tracker</button>
        </div>
      </div>
      <div class="card dashboard-card wide-card">
        <h3>Today's Objectives</h3>
        <div id="homeObjectives"></div>
      </div>
      <div class="card dashboard-card wide-card">
        <div id="homeCompletedToday"></div>
      </div>
      <div class="card dashboard-card wide-card">
        <div id="homeHistory"></div>
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
    ${renderPlannerNav()}
    ${renderSubTabs("Planner", ["Day", "Week", "Month", "Routines"], activePlannerSection)}
    ${activePlannerSection === "Day" ? `
      ${renderPlannerBlockSheet()}
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
      <div class="planner-action-grid">
        <div class="card">
          <h3>Quick Actions</h3>
          <div class="quick-add-grid">
            <button onclick="openTimeBlockModal()">Add Block</button>
            <button class="secondary-btn" onclick="addBuffersForToday()">Add Buffers</button>
            <button class="secondary-btn" onclick="moveUnfinishedToTomorrow()">Move Unfinished</button>
            <button class="secondary-btn" onclick="setPlannerSection('Routines')">Routines</button>
          </div>
        </div>
        <div class="card">
          <h3>Templates</h3>
          <div class="template-grid">
            ${getPlannerTemplates().map(template => `<button class="secondary-btn" onclick="addPlannerTemplate('${template.id}')">${escapeHTML(template.name)}</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="card">
        <h3>Today Snapshot</h3>
        <div id="plannerAnalytics"></div>
      </div>
      <div class="card">
        <h3>Free Time</h3>
        <div id="freeTimeBox"></div>
      </div>
      <div class="card">
        <h3>Planning Tools</h3>
        <input id="bufferMinutesInput" type="number" min="0" max="120" placeholder="Default buffer minutes">
        <button onclick="saveBufferSetting()">Save Buffer Setting</button>
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
        <label class="inline-check">
          <input type="checkbox" id="routineSameTimeMode" checked onchange="updateRoutineTimeMode()">
          Use same time for all selected days
        </label>
        <div id="routineGlobalTimes" class="time-input-row">
          <input id="routineStart" type="time">
          <input id="routineEnd" type="time">
        </div>
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
        <details class="advanced-options link-options" open>
          <summary>Linked items and sync</summary>
          <label class="muted-text small">Linked habit</label>
          <select id="routineLinkedHabit">${renderLinkOptions(systemsData.habits, "", "No linked habit")}</select>
          <label class="muted-text small">Linked tracker</label>
          <select id="routineLinkedTracker">${renderLinkOptions(systemsData.trackers, "", "No linked tracker")}</select>
          <label class="muted-text small">Linked goal</label>
          <select id="routineLinkedGoal">${renderLinkOptions(systemsData.goals, "", "No linked goal")}</select>
          <label class="muted-text small">Linked objective</label>
          <select id="routineLinkedObjective">${renderLinkOptions(systemsData.objectives, "", "No linked objective")}</select>
          <div class="habit-meta-row">
            <select id="routineTrackerAutoMode">
              <option value="none">Tracker logging off</option>
              <option value="fixed">Auto-log fixed amount</option>
              <option value="duration">Auto-log duration</option>
            </select>
            <input id="routineTrackerLogAmount" type="number" step="any" placeholder="Fixed amount">
          </div>
          <label class="inline-check">
            <input type="checkbox" id="routineSyncFutureBlocks">
            Update future blocks from this routine?
          </label>
        </details>
        <textarea id="routineNotes" placeholder="Notes"></textarea>
        <label class="inline-check">
          <input type="checkbox" id="routineAutoAdd">
          Auto-add to planner daily
        </label>
        <button id="routineSaveButton" onclick="saveRoutine()">Save Routine</button>
        <button class="secondary-btn" onclick="resetRoutineForm()">Clear Routine Form</button>
        <button onclick="autoFillSelectedDay()">Fill Selected Date</button>
        <button onclick="autoFillThisWeek()">Fill This Week</button>
      </div>
      <div class="card">
        <h3>Saved Routines</h3>
        <div id="routinesList"></div>
      </div>
    ` : ""}
  `,

  Systems: () => `
    ${renderSubTabs("Systems", ["Overview", "Habits", "Trackers", "Objectives", "Activity"], activeSystemsSection)}
    ${renderSystemsSheet()}
    ${systemsAddMenuOpen ? renderSystemsAddMenu() : ""}
    <div class="systems-hero card">
      <div>
        <p class="eyebrow">Systems</p>
        <h2>Systems</h2>
        <p class="muted-text">A connected Life OS for habits, trackers, goals, objectives, and activity logs.</p>
        <div class="systems-architecture-info">
          <p class="muted-text small"><strong>Habits</strong> → Recurring behaviors with streaks and consistency</p>
          <p class="muted-text small"><strong>Trackers</strong> → Measure data over time with trends and aggregations</p>
          <p class="muted-text small"><strong>Goals</strong> → Desired outcomes using trackers/habits to measure progress</p>
          <p class="muted-text small"><strong>Objectives</strong> → One-time actionable tasks with due dates</p>
          <p class="muted-text small"><strong>Activity</strong> → Historical entries feeding trackers and analytics</p>
        </div>
      </div>
      <button onclick="openSystemsAddMenu()">+ Add</button>
    </div>
    ${activeSystemsSection === "Overview" ? `
      <div class="systems-overview-layout">
        <div class="overview-left-column">
          <div class="card category-cards-card">
            <h3>Systems Dashboard</h3>
            <div id="systemsDashboard"></div>
          </div>
        </div>
        <div class="overview-center-column">
          <div class="card today-habits-card">
            <h3>Today Habits</h3>
            <div id="habitsList"></div>
          </div>
        </div>
        <div class="overview-right-column">
          <div class="card activity-feed-card">
            <h3>Activity Feed</h3>
            <div id="activityFeed"></div>
          </div>
        </div>
      </div>
    ` : ""}
    ${activeSystemsSection === "Habits" ? `
      <div class="section-toolbar card">
        <div>
          <h3>Habits</h3>
          <p class="muted-text">Recurring behaviors. Track streaks, consistency, and frequency.</p>
        </div>
        <button onclick="openSystemsForm('habit')">Add Habit</button>
      </div>
      <div id="habitsList"></div>
    ` : ""}
    ${activeSystemsSection === "Trackers" ? `
      <div class="section-toolbar card">
        <div>
          <h3>Trackers</h3>
          <p class="muted-text">Measure all progress: goals, counters, tapers, metrics, and custom tracking.</p>
        </div>
        <div class="button-row">
          <button onclick="openSystemsForm('tracker')">Add Tracker</button>
          <button class="secondary-btn" onclick="openSystemsForm('log')">Add Log</button>
        </div>
      </div>
      <div id="trackersSummaryCards" class="card trackers-summary-cards"></div>
      <div class="card list-controls" id="trackerCategoryFilterMount"></div>
      <div id="trackersUnifiedList"></div>
    ` : ""}
    ${activeSystemsSection === "Objectives" ? `
      <div class="section-toolbar card">
        <div>
          <h3>Objectives</h3>
          <p class="muted-text">One-time actionable tasks with due dates and priorities.</p>
        </div>
        <button onclick="openSystemsForm('objective')">Add Objective</button>
      </div>
      <div class="card">
        <div id="systemsObjectives"></div>
      </div>
    ` : ""}
    ${activeSystemsSection === "Activity" ? `
      <div class="section-toolbar card">
        <div>
          <h3>Activity Log</h3>
          <p class="muted-text">Historical entries. What happened, when, and how much. Feeds trackers and analytics.</p>
        </div>
        <button onclick="openSystemsForm('log')">Add Log</button>
      </div>
      <div class="card">
        <div id="activityFeed"></div>
      </div>
    ` : ""}
    <button class="floating-add-btn systems-fab" onclick="openSystemsAddMenu()">+</button>
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
          <input id="friendBirthday" type="date">
          <input id="friendPhoneHandle" placeholder="Phone or social handle">
          <select id="friendRelationshipType">
            ${getSocialTypes().map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("")}
          </select>
          <select id="friendPriority">
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <input id="friendLastContacted" type="date">
          <input id="friendLastSeen" type="date">
          <input id="friendFavoriteFood" placeholder="Favorite food">
          <textarea id="friendFavoriteActivities" placeholder="Favorite activities"></textarea>
          <textarea id="friendGiftIdeas" placeholder="Gift ideas"></textarea>
          <textarea id="friendImportantNotes" placeholder="Important notes"></textarea>
          <textarea id="friendPreferredHangoutStyle" placeholder="Preferred hangout style"></textarea>
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
          <select id="friendRelationshipFilter" onchange="renderFriends()">
            <option value="All">All relationships</option>
            <option>Friend</option>
            <option>Family</option>
            <option>Dating</option>
            <option>Networking</option>
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
          <textarea id="hangoutChecklist" placeholder="Checklist, one item per line"></textarea>
          <input id="hangoutFollowUpReminder" type="date">
          <select id="hangoutRating">
            <option value="">Rating after</option>
            <option>5</option>
            <option>4</option>
            <option>3</option>
            <option>2</option>
            <option>1</option>
          </select>
          <input id="hangoutMoodAfter" placeholder="Mood after">
          <textarea id="hangoutMemories" placeholder="Photos/memories notes"></textarea>
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
          <option>Food</option>
          <option>Luxury</option>
          <option>Study</option>
          <option>Fitness</option>
          <option>Events</option>
          <option>Date Night</option>
          <option>Group</option>
        </select>
        <input id="ideaCost" placeholder="Cost">
        <textarea id="ideaNotes" placeholder="Notes"></textarea>
        <label class="inline-check"><input id="ideaFavorite" type="checkbox"> Favorite idea</label>
        <div class="friend-selector">
          <label>Link Friends (optional)</label>
          <input id="ideaFriendSearch" placeholder="Search friends to link" oninput="populateIdeaFriendSelect()">
          <select id="ideaFriendSelect" onchange="addSelectedFriendToIdea()">
            <option value="">Select a friend...</option>
          </select>
          <div id="selectedIdeaFriends" class="selected-friends-chips"></div>
        </div>
        <button id="ideaSaveButton" onclick="saveIdea()">Save Idea</button>
        <button class="secondary-btn" onclick="resetIdeaForm()">Clear Idea Form</button>
      </div>
      <div class="card">
        <h3>Saved Ideas</h3>
        <div class="list-controls">
          <input id="ideaSearch" placeholder="Search ideas" oninput="renderIdeas()">
          <select id="ideaCategoryFilter" onchange="renderIdeas()">
            <option value="All">All categories</option>
            <option>Cheap</option>
            <option>Active</option>
            <option>Chill</option>
            <option>Food</option>
            <option>Luxury</option>
            <option>Study</option>
            <option>Fitness</option>
            <option>Events</option>
            <option>Date Night</option>
            <option>Group</option>
          </select>
          <select id="ideaFavoriteFilter" onchange="renderIdeas()">
            <option value="All">All ideas</option>
            <option value="Favorites">Favorites</option>
          </select>
          <select id="ideaFriendFilter" onchange="renderIdeas()">
            <option value="All">All friends</option>
          </select>
        </div>
        <div id="ideasList"></div>
      </div>
    ` : ""}
    ${activeSocialSection === "Insights" ? `
      <div class="card">
        <h3>Smart Suggestions</h3>
        <div id="smartSocialSuggestions"></div>
      </div>
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
    <div class="card collapsible-card">
      <button type="button" class="collapse-header" onclick="toggleManageOptions()">
        <span>Manage Options</span>
        <span>${manageOptionsOpen ? "▲" : "▼"}</span>
      </button>
      <p class="muted-text">Manage dropdown options for Categories, Types, and Units used across Planner, Systems, and All Zip Data.</p>
      <div class="${manageOptionsOpen ? "" : "hidden"} option-manager-content">
        <div class="option-manager">
        <div class="option-toolbar">
          <label class="muted-text small">Option group</label>
          <select id="optionGroupSelector" onchange="renderSelectedOptionGroup()">
            <optgroup label="General">
              <option value="category">Categories</option>
              <option value="unit">Units</option>
            </optgroup>
            <optgroup label="System Types">
              <option value="habitTypes">Habit Types</option>
              <option value="trackerTypes">Tracker Types</option>
              <option value="objectiveTypes">Objective Types</option>
              <option value="activityTypes">Activity Types</option>
              <option value="socialTypes">Social Types</option>
            </optgroup>
          </select>
        </div>
        
        <div class="option-toolbar">
          <input id="newOptionInput" placeholder="Add new option">
          <button onclick="addCustomOptionFromManager()">Add</button>
          <input id="optionSearchInput" placeholder="Filter options" oninput="renderSelectedOptionGroup()">
          <button class="secondary-btn" onclick="resetOptionsToDefaultsFromManager()">Reset</button>
        </div>
        
        <div id="optionsList" class="option-list"></div>
      </div>
      </div>
    </div>
    <div class="card">
      <h3>Data Sync Status</h3>
      <div id="offlineModeBanner" class="offline-banner" style="display:none; background:#fff3cd; color:#856404; padding:10px; border-radius:4px; margin-bottom:10px;">
        ⚠️ Offline mode active — local storage only.
      </div>
      <div id="syncStatusDisplay">
        <p><strong>Local Storage:</strong> <span id="localStorageStatus">Checking...</span></p>
        <p><strong>Cloud Connection:</strong> <span id="cloudStatus">Checking...</span></p>
        <p><strong>Last Sync:</strong> <span id="lastSyncTime">Never</span></p>
      </div>
      <p id="syncErrorMessage" class="sync-error" style="display:none; color:red; margin:10px 0;"></p>
      <button onclick="forceSyncFromCloud()">Sync from Cloud</button>
      <button onclick="forceSyncToCloud()">Sync to Cloud</button>
      <button id="testCloudSyncButton" onclick="testCloudSync()" class="secondary-btn">Test Cloud Sync</button>
      <p id="testCloudSyncResult" class="test-result" style="display:none; margin:10px 0;"></p>
      <p id="cloudSyncNotConnected" class="muted-text" style="display:none;">Cloud sync not connected. Local backup still works.</p>
    </div>
    <div class="card backup-restore-card">
      <h3>Backup + Restore</h3>
      <p class="settings-warning">Local data is saved per browser and per URL/port. Switching between localhost, Replit, Netlify, Codex preview, or different ports may show different data unless you import a backup.</p>
      <p class="muted-text">Backup includes plannerData, scheduleData, systemsData, socialData, and allZipData. Uses safe merge logic to preserve newer data.</p>
      <button onclick="downloadFullBackup()">Download Backup JSON</button>
      <textarea id="allDataImportJson" placeholder="Paste Flow Planner backup JSON here to restore all data"></textarea>
      <button onclick="importAllData()">Restore From Backup</button>
    </div>
    <div class="card">
      <h3>All Zip Data Export/Import</h3>
      <p class="muted-text">Export all data as a unified master log (Google Sheets-style schema) with fields: id, date, source, category, type, name, amount, unit, startTime, endTime, durationMinutes, status, notes, linkedGoalId, linkedHabitId, linkedPlannerBlockId, createdAt, updatedAt.</p>
      <p class="muted-text">Supports planner blocks, habits, routines, manual metrics, goals, social logs, study hours, body metrics, taper/recovery logs, and course/license hours.</p>
      <div class="list-controls">
        <select id="allZipDataCategoryFilter" onchange="filterAllZipData()">
          <option value="All">All Categories</option>
        </select>
        <select id="allZipDataTypeFilter" onchange="filterAllZipData()">
          <option value="All">All Types</option>
        </select>
        <select id="allZipDataUnitFilter" onchange="filterAllZipData()">
          <option value="All">All Units</option>
        </select>
        <select id="allZipDataSourceFilter" onchange="filterAllZipData()">
          <option value="All">All Sources</option>
          <option>Planner</option>
          <option>Systems</option>
          <option>Social</option>
          <option>manual</option>
        </select>
        <select id="allZipDataGoalFilter" onchange="filterAllZipData()">
          <option value="All">All Goals</option>
        </select>
        <input id="allZipDataStartDate" type="date" onchange="filterAllZipData()" placeholder="Start date">
        <input id="allZipDataEndDate" type="date" onchange="filterAllZipData()" placeholder="End date">
      </div>
      <div class="button-row">
        <button onclick="exportAllZipDataAsJSON()">Export as JSON</button>
        <button onclick="exportAllZipDataAsCSV()">Export as CSV</button>
      </div>
      <label class="file-upload-box">
        <span>Import All Zip Data (JSON or CSV)</span>
        <input id="allZipDataImportFile" type="file" accept=".json,.csv,application/json,text/csv" onchange="handleAllZipDataImport(event)">
      </label>
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

function renderPlannerNav() {
  const dayBlocks = getBlocksForDate(selectedPlannerDate).filter(block => !block.isBuffer);
  return `
    <div class="planner-nav card">
      <div>
        <p class="eyebrow">Planner</p>
        <h2>${formatDashboardDate(selectedPlannerDate)}</h2>
        <p class="muted-text">${dayBlocks.length} block${dayBlocks.length === 1 ? "" : "s"} scheduled</p>
      </div>
      <div class="planner-date-controls">
        <button class="secondary-btn" onclick="changePlannerDate(-1)">Prev</button>
        <input type="date" value="${selectedPlannerDate}" onchange="selectPlannerDate(this.value)">
        <button class="secondary-btn" onclick="changePlannerDate(1)">Next</button>
        <button onclick="goToPlannerToday(); activePlannerSection='Day'; main.innerHTML=getPageHTML('Planner'); renderPlanner();">Today</button>
      </div>
      <div class="planner-nav-actions">
        <button onclick="openTimeBlockModal()">+ Block</button>
      </div>
    </div>
  `;
}

function setPlannerSection(section) {
  activePlannerSection = section;
  openBlockActionMenuIndex = null;
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
    openBlockActionMenuIndex = null;
    setActiveBottomNav(tab);
    main.innerHTML = getPageHTML(tab);

    if (tab === "Home") renderHome();
    if (tab === "Planner") renderPlanner();
    if (tab === "Systems") renderSystems();
    if (tab === "Social") renderSocial();
    if (tab === "Settings") renderSettings();
  });
});

document.addEventListener("click", event => {
  if (openBlockActionMenuIndex === null) return;
  if (event.target.closest(".block-actions")) return;
  openBlockActionMenuIndex = null;
  renderTimeBlocks();
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

function setPage(tab) {
  openBlockActionMenuIndex = null;
  setActiveBottomNav(tab);
  main.innerHTML = getPageHTML(tab);

  if (tab === "Home") renderHome();
  if (tab === "Planner") renderPlanner();
  if (tab === "Systems") renderSystems();
  if (tab === "Social") renderSocial();
  if (tab === "Settings") renderSettings();
}

function getSmartSocialSuggestions() {
  const suggestions = [];
  
  // Suggest reaching out to friends not seen recently
  socialData.friends.forEach(friend => {
    const { score, reason } = computeFriendScore(friend);
    if (score > 50) {
      suggestions.push(`Reach out to ${friend.name} (${reason})`);
    }
  });

  // Suggest scheduling hangouts from ideas
  socialData.ideas.filter(idea => idea.favorite).forEach(idea => {
    suggestions.push(`Schedule hangout: ${idea.title}`);
  });

  return suggestions.slice(0, 3);
}

function renderSettings() {
  populateAllZipDataDropdowns();
  populateGoalProgressDropdown();
  renderOptionsLists();
}

function toggleManageOptions() {
  manageOptionsOpen = !manageOptionsOpen;
  console.log("toggleManageOptions called, manageOptionsOpen:", manageOptionsOpen);
  const content = document.querySelector(".option-manager-content");
  const arrow = document.querySelector(".collapse-header span:last-child");
  if (content) {
    content.classList.toggle("hidden", !manageOptionsOpen);
  }
  if (arrow) {
    arrow.textContent = manageOptionsOpen ? "▲" : "▼";
  }
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
          ${renderCategoryOptions()}
        </select>
        <details class="advanced-options link-options" open>
          <summary>Linked items</summary>
          <label class="muted-text small">Routine</label>
          <select id="blockLinkedRoutine">${renderLinkOptions(scheduleData.routines, "", "No linked routine")}</select>
          <label class="muted-text small">Habit</label>
          <select id="blockLinkedHabit">${renderLinkOptions(systemsData.habits, "", "No linked habit")}</select>
          <label class="muted-text small">Tracker</label>
          <select id="blockLinkedTracker" onchange="syncBlockTrackerDefaults()">${renderLinkOptions(systemsData.trackers, "", "No linked tracker")}</select>
          <label class="muted-text small">Goal</label>
          <select id="blockLinkedGoal">${renderLinkOptions(systemsData.goals, "", "No linked goal")}</select>
          <label class="muted-text small">Objective</label>
          <select id="blockLinkedObjective">${renderLinkOptions(systemsData.objectives, "", "No linked objective")}</select>
          <div class="habit-meta-row">
            <select id="blockTrackerAutoMode">
              <option value="none">Tracker logging off</option>
              <option value="fixed">Auto-log fixed amount on completion</option>
              <option value="duration">Auto-log block duration on completion</option>
            </select>
            <input id="blockTrackerLogAmount" type="number" step="any" placeholder="Fixed amount">
          </div>
          <label class="inline-check"><input type="checkbox" id="blockCreateHabit"> Create linked habit from this block</label>
          <label class="inline-check"><input type="checkbox" id="blockCreateTracker"> Create linked tracker from this block</label>
          <label class="inline-check"><input type="checkbox" id="blockCreateObjective"> Create linked objective from this block</label>
        </details>
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
  const createdLinks = maybeCreateLinkedItemsForBlock(title, category);
  const linkedRoutineId = document.getElementById("blockLinkedRoutine")?.value || "";
  const linkedHabitId = createdLinks.habitId || document.getElementById("blockLinkedHabit")?.value || "";
  const linkedTrackerId = createdLinks.trackerId || document.getElementById("blockLinkedTracker")?.value || "";
  const linkedGoalId = document.getElementById("blockLinkedGoal")?.value || "";
  const linkedObjectiveId = createdLinks.objectiveId || document.getElementById("blockLinkedObjective")?.value || "";
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
    routineId: linkedRoutineId || existing?.routineId || "",
    linkedRoutineId: linkedRoutineId || existing?.linkedRoutineId || "",
    systemHabitId: linkedHabitId,
    linkedHabitId,
    systemTrackerId: linkedTrackerId,
    linkedTrackerId,
    systemGoalId: linkedGoalId,
    linkedGoalId,
    systemObjectiveId: linkedObjectiveId,
    linkedObjectiveId,
    trackerAutoLogMode: document.getElementById("blockTrackerAutoMode")?.value || "none",
    trackerLogAmount: document.getElementById("blockTrackerLogAmount")?.value || "",
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
  if (createdLinks.objectiveId) {
    const objective = systemsData.objectives.find(item => item.id === createdLinks.objectiveId);
    if (objective) objective.linkedPlannerBlockId = block.id;
    saveSystemsData();
  }
  if (createdLinks.habitId) {
    const habit = systemsData.habits.find(item => item.id === createdLinks.habitId);
    if (habit) habit.linkedPlannerBlockId = block.id;
    saveSystemsData();
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

function maybeCreateLinkedItemsForBlock(title, category) {
  const links = { habitId: "", trackerId: "", objectiveId: "" };
  if (document.getElementById("blockCreateHabit")?.checked) {
    const habit = {
      id: createId("habit"),
      name: title,
      category,
      frequency: "Daily",
      targetFrequency: "Daily",
      target: title,
      unit: "times",
      linkedGoalId: document.getElementById("blockLinkedGoal")?.value || "",
      linkedTrackerId: "",
      linkedRoutineId: document.getElementById("blockLinkedRoutine")?.value || "",
      linkedPlannerBlockId: "",
      autoLogTrackerOnComplete: false,
      trackerLogAmount: "",
      notes: "Created from Planner block",
      completions: [],
      skippedDates: [],
      completionHistory: [],
      paused: false
    };
    systemsData.habits.push(habit);
    links.habitId = habit.id;
  }
  if (document.getElementById("blockCreateTracker")?.checked) {
    const tracker = normalizeUnifiedTrackerRecord({
      id: createId("tracker"),
      name: title,
      category: category || "Custom",
      unit: "hours",
      startValue: "0",
      currentValue: "0",
      targetValue: "",
      linkedHabitId: links.habitId || document.getElementById("blockLinkedHabit")?.value || "",
      autoLogOnPlannerComplete: true,
      autoLogAmount: "1",
      logValueMode: "increment",
      notes: "Created from Planner block"
    });
    systemsData.trackers.push(tracker);
    links.trackerId = tracker.id;
    const habit = links.habitId ? systemsData.habits.find(h => h.id === links.habitId) : null;
    if (habit) habit.linkedTrackerId = tracker.id;
  }
  if (document.getElementById("blockCreateObjective")?.checked) {
    const objective = createObjectiveRecord({
      title,
      category,
      linkedPlannerBlockId: "",
      linkedRoutineId: document.getElementById("blockLinkedRoutine")?.value || "",
      linkedHabitId: links.habitId || document.getElementById("blockLinkedHabit")?.value || "",
      linkedTrackerId: links.trackerId || document.getElementById("blockLinkedTracker")?.value || "",
      linkedGoalId: document.getElementById("blockLinkedGoal")?.value || ""
    });
    systemsData.objectives.push(objective);
    links.objectiveId = objective.id;
  }
  if (links.habitId || links.trackerId || links.objectiveId) saveSystemsData();
  return links;
}

function syncBlockTrackerDefaults() {
  const tracker = systemsData.trackers.find(t => t.id === document.getElementById("blockLinkedTracker")?.value);
  if (!tracker) return;
  const amount = document.getElementById("blockTrackerLogAmount");
  if (amount && !amount.value) amount.value = tracker.autoLogAmount || "1";
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
  if (document.getElementById("blockLinkedRoutine")) document.getElementById("blockLinkedRoutine").value = block.linkedRoutineId || block.routineId || "";
  if (document.getElementById("blockLinkedHabit")) document.getElementById("blockLinkedHabit").value = getPlannerBlockHabitId(block);
  if (document.getElementById("blockLinkedTracker")) document.getElementById("blockLinkedTracker").value = getPlannerBlockTrackerId(block);
  if (document.getElementById("blockLinkedGoal")) document.getElementById("blockLinkedGoal").value = getPlannerBlockGoalId(block);
  if (document.getElementById("blockLinkedObjective")) document.getElementById("blockLinkedObjective").value = getPlannerBlockObjectiveId(block);
  if (document.getElementById("blockTrackerAutoMode")) document.getElementById("blockTrackerAutoMode").value = block.trackerAutoLogMode || "none";
  if (document.getElementById("blockTrackerLogAmount")) document.getElementById("blockTrackerLogAmount").value = block.trackerLogAmount || "";
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
  const blockLayouts = getVisualBlockLayouts(blocks);

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
        ${blocks.map(({ block, index }) => renderVisualTimeBlock(block, index, overlapIndexes.has(index), timelineStart, pxPerMinute, blockLayouts.get(index))).join("")}
      </div>
    `
    : `<div class="empty-state"><p>No blocks for this day.</p><button onclick="focusTimeBlockForm()">Create time block</button></div>`;

  enableVisualBlockInteractions();
  enableTaskDragDrop();
}

function getVisualBlockLayouts(blocks) {
  const layouts = new Map();
  let cluster = [];
  let clusterEnd = null;

  const flushCluster = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    const assigned = cluster.map(item => {
      const start = timeToMinutes(item.block.start);
      const end = timeToMinutes(item.block.end);
      let lane = laneEnds.findIndex(laneEnd => laneEnd <= start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = end;
      return { ...item, lane };
    });
    const total = Math.max(laneEnds.length, 1);
    assigned.forEach(item => layouts.set(item.index, { lane: item.lane, total }));
    cluster = [];
    clusterEnd = null;
  };

  blocks.forEach(item => {
    const start = timeToMinutes(item.block.start || "00:00");
    const end = timeToMinutes(item.block.end || item.block.start || "00:00");
    if (cluster.length && start >= clusterEnd) flushCluster();
    cluster.push(item);
    clusterEnd = clusterEnd === null ? end : Math.max(clusterEnd, end);
  });
  flushCluster();

  return layouts;
}

function getVisualBlockPositionStyle(top, height, layout) {
  const base = `top:${top}px;height:${height}px`;
  if (!layout || layout.total <= 1) return base;
  const width = 100 / layout.total;
  const left = layout.lane * width;
  return `${base};left:calc(10px + ${left}%);right:auto;width:calc(${width}% - 14px)`;
}

function renderTaskPreview(block) {
  const tasks = Array.isArray(block.tasks) ? block.tasks : [];
  if (!tasks.length) return "";
  const visibleTasks = tasks.slice(0, 3);
  const remaining = tasks.length - visibleTasks.length;
  return `
    <div class="visual-task-preview" aria-label="Tasks preview">
      ${visibleTasks.map(task => `
        <span class="${task.completed ? "task-done" : ""}">${escapeHTML(task.text)}</span>
      `).join("")}
      ${remaining > 0 ? `<span class="muted-text">+${remaining} more</span>` : ""}
    </div>
  `;
}

function renderVisualTimeBlock(block, index, isOverlapping, timelineStart, pxPerMinute, layout) {
  const startMinutes = timeToMinutes(block.start || "06:00");
  const endMinutes = timeToMinutes(block.end || block.start || "06:30");
  const top = Math.max((startMinutes - timelineStart) * pxPerMinute, 0);
  const height = Math.max((endMinutes - startMinutes) * pxPerMinute, 34);
  const categoryClass = getCategoryClass(block.category);
  const isMenuOpen = openBlockActionMenuIndex === index;
  const positionStyle = getVisualBlockPositionStyle(top, height, layout);

  return `
    <div class="timeline-block visual-block ${categoryClass} ${block.completed ? "completed-block" : ""} ${isOverlapping ? "overlap-block" : ""} ${isMenuOpen ? "action-menu-open" : ""} block-type-${block.type || "task"}"
      draggable="true"
      data-index="${index}"
      style="${positionStyle}">
      <div class="visual-block-main" onclick="editTimeBlock(${index})">
        <div class="visual-block-title">
          <strong>${escapeHTML(block.title || "Untitled block")}</strong>
          <span>${escapeHTML(block.start)}-${escapeHTML(block.end)}</span>
        </div>
        <div class="visual-block-meta">
          ${renderCategoryPill(block.category)}
          ${block.type && block.type !== "task" ? `<span class="block-tag block-tag-${block.type}">${block.type}</span>` : ""}
          <span class="block-status ${block.completed ? "status-complete" : "status-open"}">${block.completed ? "Complete" : "Open"}</span>
          ${isOverlapping ? `<span class="overlap-pill">Overlap</span>` : ""}
        </div>
        ${renderConnectionBadges({
          routineId: block.linkedRoutineId || block.routineId,
          habitId: getPlannerBlockHabitId(block),
          trackerId: getPlannerBlockTrackerId(block),
          goalId: getPlannerBlockGoalId(block),
          objectiveId: getPlannerBlockObjectiveId(block)
        })}
        ${renderTaskPreview(block)}
      </div>
      <div class="block-actions" onclick="event.stopPropagation()">
        <button class="block-actions-trigger" type="button" aria-label="Actions for ${escapeHTML(block.title || "block")}" onclick="toggleBlockActionMenu(event, ${index})">⋯</button>
        ${isMenuOpen ? `
          <div class="block-actions-menu" role="menu">
            <button type="button" onclick="toggleBlockComplete(${index})">${block.completed ? "Reopen" : "Complete"}</button>
            <button type="button" onclick="editTimeBlock(${index})">Edit</button>
            <button type="button" onclick="duplicateTimeBlock(${index})">Duplicate</button>
            <button type="button" class="danger-menu-item" onclick="deleteTimeBlock(${index})">Delete</button>
          </div>
        ` : ""}
      </div>
      ${block.isBuffer ? "" : `<div class="resize-handle" data-index="${index}" title="Drag to resize"></div>`}
    </div>
  `;
}

function toggleBlockActionMenu(event, index) {
  event.stopPropagation();
  openBlockActionMenuIndex = openBlockActionMenuIndex === index ? null : index;
  renderTimeBlocks();
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
  const blk = scheduleData.blocks[blockIndex];
  const wasComplete = blk.completed;
  const task = blk.tasks[taskIndex];
  task.completed = !task.completed;
  blk.completed = blk.tasks.length
    ? blk.tasks.every(item => item.completed)
    : blk.completed;
  if (blk.completed && !wasComplete && getPlannerBlockHabitId(blk)) {
    completeHabitFromPlannerBlock(blk);
    autoLogTrackersForPlannerBlock(blk);
  } else if (!blk.completed && wasComplete) {
    removePlannerAutoLogsForBlock(blk);
  }
  if (blk.completed && !wasComplete) autoCompleteObjectivesForPlannerBlock(blk);
  saveScheduleData();
  renderPlanner();
}

function toggleBlockComplete(index) {
  const block = scheduleData.blocks[index];
  const wasComplete = block.completed;
  block.completed = !block.completed;
  block.tasks = block.tasks.map(task => ({
    ...task,
    completed: block.completed ? true : task.completed
  }));
  if (block.completed && !wasComplete && getPlannerBlockHabitId(block)) {
    completeHabitFromPlannerBlock(block);
    autoLogTrackersForPlannerBlock(block);
  } else if (!block.completed && wasComplete) {
    removePlannerAutoLogsForBlock(block);
  }
  if (block.completed && !wasComplete) autoCompleteObjectivesForPlannerBlock(block);

  // Log to All Zip Data when block is marked complete
  if (block.completed && !wasComplete) {
    logToAllZipData({
      id: block.id,
      date: block.date || getTodayISO(),
      source: "Planner",
      category: block.category || "",
      type: block.type || "task",
      name: block.title || "",
      amount: "",
      unit: "",
      startTime: block.startTime || "",
      endTime: block.endTime || "",
      durationMinutes: block.durationMinutes || "",
      status: "completed",
      notes: block.notes || "",
      linkedGoalId: block.linkedGoalId || "",
      linkedHabitId: block.linkedHabitId || "",
      linkedPlannerBlockId: "",
      createdAt: block.createdAt || ""
    });
  }

  saveScheduleData();
  renderPlanner();
}

function completeHabitFromPlannerBlock(block) {
  const habit = systemsData.habits.find(item => item.id === getPlannerBlockHabitId(block));
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
      linkedItemType: "habit",
      linkedMetricId: "",
      linkedTrackerId: "",
      linkedGoalId: "",
      linkedPlannerBlockId: block.id,
      linkedRoutineId: block.linkedRoutineId || block.routineId || "",
      linkedObjectiveId: getPlannerBlockObjectiveId(block),
      logSource: "habit",
      plannerAutoLogKey: "",
      inactive: false
    });
  }
  autoCompleteObjectivesForHabit(habit);
  saveSystemsData();
}

function deleteTaskFromBlock(blockIndex, taskIndex) {
  if (!scheduleData.blocks[blockIndex]) return;
  scheduleData.blocks[blockIndex].tasks.splice(taskIndex, 1);
  scheduleData.blocks[blockIndex].completed = scheduleData.blocks[blockIndex].tasks.length
    ? scheduleData.blocks[blockIndex].tasks.every(task => task.completed)
    : false;
  saveScheduleData();
  renderPlanner();
}

function deleteTimeBlock(index) {
  const block = scheduleData.blocks[index];
  if (!block) return;
  if (!confirm("Delete this time block?")) return;
  removePlannerAutoLogsForBlock(block);
  const date = block.date;
  scheduleData.blocks.splice(index, 1);
  if (editingBlockIndex === index) editingBlockIndex = null;
  // Only recreate buffers if the deleted block was not a buffer itself
  if (!block.isBuffer) {
    addBufferBlocksForDate(date);
  }
  saveScheduleData();
  renderHome();
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

function normalizeRoutineTimeRanges(value, fallbackStart = "", fallbackEnd = "") {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  const ranges = source
    .map(range => ({
      start: range && typeof range === "object" ? (range.start || fallbackStart) : fallbackStart,
      end: range && typeof range === "object" ? (range.end || fallbackEnd) : fallbackEnd
    }))
    .filter(range => range.start && range.end);

  if (!ranges.length && fallbackStart && fallbackEnd) {
    ranges.push({ start: fallbackStart, end: fallbackEnd });
  }

  return ranges;
}

function getRoutineDayNameMap() {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
}

function getRoutineDayIndexFromKey(key) {
  const numeric = Number(key);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) return numeric;
  const idx = getRoutineDayNameMap().findIndex(day => day.toLowerCase() === String(key).toLowerCase());
  return idx >= 0 ? idx : null;
}

function buildRoutineTimesByDay(dayTimes) {
  const names = getRoutineDayNameMap();
  const result = {};
  Object.keys(dayTimes || {}).forEach(dayKey => {
    const dayIndex = getRoutineDayIndexFromKey(dayKey);
    if (dayIndex === null) return;
    result[names[dayIndex]] = normalizeRoutineTimeRanges(dayTimes[dayKey]);
  });
  return result;
}

function normalizeRoutineDayTimes(routine) {
  const legacyDayTimes = routine && routine.dayTimes && typeof routine.dayTimes === "object"
    ? routine.dayTimes
    : {};
  const namedTimesByDay = routine && routine.timesByDay && typeof routine.timesByDay === "object"
    ? routine.timesByDay
    : {};
  const dayTimes = { ...namedTimesByDay, ...legacyDayTimes };
  const normalized = {};
  Object.keys(dayTimes).forEach(dayKey => {
    const dayIndex = getRoutineDayIndexFromKey(dayKey);
    if (dayIndex === null) return;
    normalized[dayIndex] = normalizeRoutineTimeRanges(dayTimes[dayKey], routine.start, routine.end);
  });
  return normalized;
}

function getRoutineTimeRangesForDay(routine, dayIndex) {
  return normalizeRoutineTimeRanges(
    routine.dayTimes && routine.dayTimes[dayIndex],
    routine.start,
    routine.end
  );
}

function routineBlockExists(date, routineId, range) {
  return scheduleData.blocks.some(block =>
    block.date === date &&
    block.routineId === routineId &&
    block.start === range.start &&
    block.end === range.end
  );
}

function createRoutinePlannerBlock(routine, date, range) {
  return {
    id: createId("block"),
    routineId: routine.id,
    linkedRoutineId: routine.id,
    title: routine.name,
    date,
    start: range.start,
    end: range.end,
    category: routine.type,
    notes: routine.notes || "",
    type: "routine",
    systemHabitId: routine.linkedHabitId || "",
    linkedHabitId: routine.linkedHabitId || "",
    systemTrackerId: routine.linkedTrackerId || "",
    linkedTrackerId: routine.linkedTrackerId || "",
    systemGoalId: routine.linkedGoalId || "",
    linkedGoalId: routine.linkedGoalId || "",
    systemObjectiveId: routine.linkedObjectiveId || "",
    linkedObjectiveId: routine.linkedObjectiveId || "",
    trackerAutoLogMode: routine.trackerAutoLogMode || "none",
    trackerLogAmount: routine.trackerLogAmount || "",
    completed: false,
    tasks: routine.tasks.map(task => ({ text: task, completed: false }))
  };
}

function updateFutureBlocksFromRoutine(routine) {
  const today = getTodayISO();
  scheduleData.blocks.forEach(block => {
    if ((block.routineId || block.linkedRoutineId) !== routine.id) return;
    if ((block.date || "") < today) return;
    block.title = routine.name;
    block.category = routine.type || routine.category || block.category;
    block.notes = routine.notes || "";
    block.tasks = (routine.tasks || []).map(task => {
      const existing = (block.tasks || []).find(item => item.text === task);
      return { text: task, completed: Boolean(existing?.completed) };
    });
    block.linkedRoutineId = routine.id;
    block.routineId = routine.id;
    block.systemHabitId = routine.linkedHabitId || "";
    block.linkedHabitId = routine.linkedHabitId || "";
    block.systemTrackerId = routine.linkedTrackerId || "";
    block.linkedTrackerId = routine.linkedTrackerId || "";
    block.systemGoalId = routine.linkedGoalId || "";
    block.linkedGoalId = routine.linkedGoalId || "";
    block.systemObjectiveId = routine.linkedObjectiveId || "";
    block.linkedObjectiveId = routine.linkedObjectiveId || "";
    block.trackerAutoLogMode = routine.trackerAutoLogMode || "none";
    block.trackerLogAmount = routine.trackerLogAmount || "";
  });
}

function addRoutineBlocksForDate(routine, date, dayIndex) {
  let addedCount = 0;
  getRoutineTimeRangesForDay(routine, dayIndex).forEach(range => {
    if (routineBlockExists(date, routine.id, range)) return;
    scheduleData.blocks.push(createRoutinePlannerBlock(routine, date, range));
    addedCount++;
  });
  return addedCount;
}

function countRoutineBlocksForDate(routine, date, dayIndex) {
  return getRoutineTimeRangesForDay(routine, dayIndex).filter(range =>
    routineBlockExists(date, routine.id, range)
  ).length;
}

function addRoutineBlocksForWeek(routines = scheduleData.routines) {
  let addedCount = 0;
  let existingCount = 0;
  getWeekDates().forEach(day => {
    const dayIndex = new Date(`${day.iso}T00:00:00`).getDay();
    let addedForDay = 0;
    routines.forEach(routine => {
      if (!routine.repeatDays.includes(dayIndex)) return;
      existingCount += countRoutineBlocksForDate(routine, day.iso, dayIndex);
      addedForDay += addRoutineBlocksForDate(routine, day.iso, dayIndex);
    });
    if (addedForDay) addBufferBlocksForDate(day.iso);
    addedCount += addedForDay;
  });
  return { addedCount, existingCount };
}

function getDayTimeRowsFromForm(dayIndex) {
  return [...document.querySelectorAll(`.day-time-row[data-day="${dayIndex}"]`)]
    .map(row => {
      const startEl = row.querySelector(".day-start-input");
      const endEl = row.querySelector(".day-end-input");
      return {
        start: startEl ? startEl.value : "",
        end: endEl ? endEl.value : ""
      };
    });
}

function isRoutineSameTimeMode() {
  const toggle = document.getElementById("routineSameTimeMode");
  return toggle ? toggle.checked : true;
}

function usesCustomRoutineTimes(routine) {
  if (!routine) return false;
  const repeatDays = Array.isArray(routine.repeatDays) ? routine.repeatDays : [];
  return repeatDays.some(dayIndex => {
    const ranges = getRoutineTimeRangesForDay(routine, dayIndex);
    if (ranges.length !== 1) return true;
    return ranges[0].start !== routine.start || ranges[0].end !== routine.end;
  });
}

function getFirstRoutineRange(dayTimes, repeatDays) {
  for (const dayIndex of repeatDays) {
    const range = dayTimes[dayIndex] && dayTimes[dayIndex][0];
    if (range && range.start && range.end) return range;
  }
  return { start: "", end: "" };
}

function saveRoutine() {
  const name = document.getElementById("routineName").value.trim();
  const type = document.getElementById("routineType").value;
  const start = document.getElementById("routineStart").value;
  const end = document.getElementById("routineEnd").value;
  const sameTimeMode = isRoutineSameTimeMode();
  const repeatDays = getSelectedRoutineDays();
  const tasks = document.getElementById("routineTasks").value
    .split("\n")
    .map(task => task.trim())
    .filter(Boolean);
  const notes = document.getElementById("routineNotes").value.trim();

  if (!name || !repeatDays.length) {
    alert("Add a routine name and at least one repeat day.");
    return;
  }

  const dayTimes = {};
  let routineStart = start;
  let routineEnd = end;

  if (sameTimeMode) {
    if (!start || !end) {
      alert("Add a start time and end time for this routine.");
      return;
    }
    repeatDays.forEach(dayIndex => {
      dayTimes[dayIndex] = [{ start, end }];
    });
  } else {
    let hasInvalidCustomTimes = false;
    repeatDays.forEach(dayIndex => {
      const rows = getDayTimeRowsFromForm(dayIndex);
      const validRanges = rows
        .filter(range => range.start && range.end)
        .map(range => ({ start: range.start, end: range.end }));
      if (!validRanges.length || validRanges.length !== rows.length) {
        hasInvalidCustomTimes = true;
      }
      dayTimes[dayIndex] = validRanges;
    });
    if (hasInvalidCustomTimes) {
      alert("Every selected day needs at least one complete start/end time row.");
      return;
    }
    const firstRange = getFirstRoutineRange(dayTimes, repeatDays);
    routineStart = firstRange.start;
    routineEnd = firstRange.end;
  }

  const autoAdd = document.getElementById("routineAutoAdd")?.checked || false;
  const existing = editingRoutineIndex !== null ? scheduleData.routines[editingRoutineIndex] : null;

  const routine = {
    id: existing ? existing.id : createId("routine"),
    name,
    type,
    start: routineStart,
    end: routineEnd,
    repeatDays,
    dayTimes,
    timesByDay: buildRoutineTimesByDay(dayTimes),
    tasks,
    linkedHabitId: document.getElementById("routineLinkedHabit")?.value || "",
    linkedTrackerId: document.getElementById("routineLinkedTracker")?.value || "",
    linkedGoalId: document.getElementById("routineLinkedGoal")?.value || "",
    linkedObjectiveId: document.getElementById("routineLinkedObjective")?.value || "",
    category: type,
    trackerAutoLogMode: document.getElementById("routineTrackerAutoMode")?.value || "none",
    trackerLogAmount: document.getElementById("routineTrackerLogAmount")?.value || "",
    syncFutureBlocks: Boolean(document.getElementById("routineSyncFutureBlocks")?.checked),
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
    if (routine.syncFutureBlocks || confirm("Update future blocks from this routine?")) {
      updateFutureBlocksFromRoutine(routine);
    }
  }

  editingRoutineIndex = null;
  autoInsertRoutineBlocks(routine);
  saveScheduleData();
  activePlannerSection = "Routines";
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
}

function autoInsertRoutineBlocks(routine) {
  addRoutineBlocksForWeek([routine]);
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
            <p>${escapeHTML(routine.type)}</p>
            <p>${renderRoutineScheduleSummary(routine)}</p>
            ${routine.autoAdd ? `<span class="auto-add-badge">Auto-add on</span>` : ""}
            ${renderConnectionBadges({
              habitId: routine.linkedHabitId,
              trackerId: routine.linkedTrackerId,
              goalId: routine.linkedGoalId,
              objectiveId: routine.linkedObjectiveId
            })}
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

function renderRoutineScheduleSummary(routine) {
  return routine.repeatDays.map(dayIndex => {
    const ranges = getRoutineTimeRangesForDay(routine, dayIndex)
      .map(range => `${escapeHTML(range.start)}-${escapeHTML(range.end)}`)
      .join(", ");
    return `${getDayName(dayIndex)} ${ranges}`;
  }).join(" • ");
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

  // Log to All Zip Data when routine is completed
  logToAllZipData({
    id: routine.id + "_" + today,
    date: today,
    source: "Planner",
    category: routine.category || "",
    type: "routine",
    name: routine.title || "",
    amount: "",
    unit: "",
    startTime: routine.start || "",
    endTime: routine.end || "",
    durationMinutes: routine.durationMinutes || "",
    status: "completed",
    notes: routine.notes || "",
    linkedGoalId: routine.linkedGoalId || "",
    linkedHabitId: routine.linkedHabitId || "",
    linkedPlannerBlockId: "",
    createdAt: routine.createdAt || ""
  });

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
  const autoAddRoutines = scheduleData.routines.filter(routine => routine.autoAdd);
  if (!autoAddRoutines.length) return;
  const result = addRoutineBlocksForWeek(autoAddRoutines);
  if (result.addedCount) {
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
  const sameTimeEl = document.getElementById("routineSameTimeMode");
  if (sameTimeEl) sameTimeEl.checked = !usesCustomRoutineTimes(routine);
  const autoAddEl = document.getElementById("routineAutoAdd");
  if (autoAddEl) autoAddEl.checked = routine.autoAdd || false;
  if (document.getElementById("routineLinkedHabit")) document.getElementById("routineLinkedHabit").value = routine.linkedHabitId || "";
  if (document.getElementById("routineLinkedTracker")) document.getElementById("routineLinkedTracker").value = routine.linkedTrackerId || "";
  if (document.getElementById("routineLinkedGoal")) document.getElementById("routineLinkedGoal").value = routine.linkedGoalId || "";
  if (document.getElementById("routineLinkedObjective")) document.getElementById("routineLinkedObjective").value = routine.linkedObjectiveId || "";
  if (document.getElementById("routineTrackerAutoMode")) document.getElementById("routineTrackerAutoMode").value = routine.trackerAutoLogMode || "none";
  if (document.getElementById("routineTrackerLogAmount")) document.getElementById("routineTrackerLogAmount").value = routine.trackerLogAmount || "";
  if (document.getElementById("routineSyncFutureBlocks")) document.getElementById("routineSyncFutureBlocks").checked = Boolean(routine.syncFutureBlocks);
  document.querySelectorAll("input[name='routineDay']").forEach(input => {
    input.checked = routine.repeatDays.includes(Number(input.value));
  });
  document.getElementById("routineSaveButton").textContent = "Update Routine";

  updateRoutineTimeMode();
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
  return getRoutineTimeRangesForDay(routine, dayIndex)[0] || { start: routine.start, end: routine.end };
}

function updateRoutineTimeMode() {
  const sameTimeMode = isRoutineSameTimeMode();
  const globalTimes = document.getElementById("routineGlobalTimes");
  const startEl = document.getElementById("routineStart");
  const endEl = document.getElementById("routineEnd");

  if (globalTimes) globalTimes.style.display = sameTimeMode ? "" : "none";
  if (startEl) startEl.disabled = !sameTimeMode;
  if (endEl) endEl.disabled = !sameTimeMode;

  updateDayTimesSection();
}

function updateDayTimesSection() {
  const section = document.getElementById("dayTimesSection");
  const rowsBox = document.getElementById("dayTimeRows");
  if (!section || !rowsBox) return;

  if (isRoutineSameTimeMode()) {
    section.style.display = "none";
    rowsBox.innerHTML = "";
    routineCopySourceDay = null;
    return;
  }

  const checkedInputs = [...document.querySelectorAll("input[name='routineDay']:checked")];
  const defaultStart = document.getElementById("routineStart") ? document.getElementById("routineStart").value : "";
  const defaultEnd = document.getElementById("routineEnd") ? document.getElementById("routineEnd").value : "";
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  if (!checkedInputs.length) {
    section.style.display = "none";
    rowsBox.innerHTML = "";
    routineCopySourceDay = null;
    return;
  }

  section.style.display = "";
  const selectedDays = checkedInputs
    .map(input => Number(input.value))
    .sort((a, b) => a - b);
  if (routineCopySourceDay !== null && !selectedDays.includes(routineCopySourceDay)) {
    routineCopySourceDay = null;
  }

  const existingValues = {};
  [0, 1, 2, 3, 4, 5, 6].forEach(i => {
    const rows = getDayTimeRowsFromForm(i);
    if (rows.length) existingValues[i] = rows;
  });

  if (editingRoutineIndex !== null) {
    const routine = scheduleData.routines[editingRoutineIndex];
    if (routine) {
      routine.repeatDays.forEach(dayIndex => {
        if (!existingValues[dayIndex]) {
          existingValues[dayIndex] = getRoutineTimeRangesForDay(routine, dayIndex);
        }
      });
    }
  }

  rowsBox.innerHTML = selectedDays
    .map(dayIndex => {
      const ranges = existingValues[dayIndex] && existingValues[dayIndex].length
        ? existingValues[dayIndex]
        : [{ start: defaultStart, end: defaultEnd }];
      return `
        <div class="day-time-group">
          <div class="day-time-group-header">
            <span class="day-time-label">${dayNames[dayIndex]}</span>
            <div class="day-time-tools">
              <button type="button" class="secondary-btn small-btn" onclick="addRoutineTimeRow(${dayIndex})">+ Add time</button>
              <button type="button" class="secondary-btn small-btn" onclick="toggleRoutineCopyPanel(event, ${dayIndex})">Copy times</button>
            </div>
          </div>
          ${ranges.map((range, rowIndex) => renderRoutineTimeRow(dayIndex, range, rowIndex, ranges.length, defaultStart, defaultEnd)).join("")}
          ${routineCopySourceDay === dayIndex ? renderRoutineCopyPanel(dayIndex, selectedDays, dayNames) : ""}
        </div>
      `;
    }).join("");
}

function renderRoutineTimeRow(dayIndex, range, rowIndex, rowCount, defaultStart = "", defaultEnd = "") {
  return `
    <div class="day-time-row" data-day="${dayIndex}">
      <input class="day-start-input" type="time" value="${escapeHTML(range.start || defaultStart)}">
      <input class="day-end-input" type="time" value="${escapeHTML(range.end || defaultEnd)}">
      <button type="button" class="secondary-btn small-btn" onclick="removeRoutineTimeRow(${dayIndex}, ${rowIndex})" ${rowCount === 1 ? "disabled" : ""}>Remove</button>
    </div>
  `;
}

function renderRoutineCopyPanel(sourceDay, selectedDays, dayNames) {
  const targetDays = selectedDays.filter(dayIndex => dayIndex !== sourceDay);
  return `
    <div class="routine-copy-panel">
      ${targetDays.length ? `
        <div class="routine-copy-targets">
          ${targetDays.map(dayIndex => `
            <label>
              <input type="checkbox" name="routineCopyTarget_${sourceDay}" value="${dayIndex}">
              ${dayNames[dayIndex]}
            </label>
          `).join("")}
        </div>
        <div class="button-row compact-row">
          <button type="button" class="secondary-btn small-btn" onclick="copyRoutineTimesToDays(${sourceDay}, 'replace')">Replace existing times</button>
          <button type="button" class="secondary-btn small-btn" onclick="copyRoutineTimesToDays(${sourceDay}, 'add')">Add to existing times</button>
          <button type="button" class="secondary-btn small-btn" onclick="closeRoutineCopyPanel()">Cancel</button>
        </div>
      ` : `<p class="muted-text">Select another repeat day first.</p>`}
    </div>
  `;
}

function toggleRoutineCopyPanel(event, dayIndex) {
  event.stopPropagation();
  routineCopySourceDay = routineCopySourceDay === dayIndex ? null : dayIndex;
  updateDayTimesSection();
}

function closeRoutineCopyPanel() {
  routineCopySourceDay = null;
  updateDayTimesSection();
}

function addRoutineTimeRow(dayIndex) {
  const currentRows = getDayTimeRowsFromForm(dayIndex);
  const row = document.createElement("div");
  row.className = "day-time-row";
  row.dataset.day = String(dayIndex);
  row.innerHTML = `
    <input class="day-start-input" type="time" value="">
    <input class="day-end-input" type="time" value="">
    <button type="button" class="secondary-btn small-btn" onclick="removeRoutineTimeRow(${dayIndex}, ${currentRows.length})">Remove</button>
  `;
  const group = [...document.querySelectorAll(".day-time-group")]
    .find(item => item.querySelector(`.day-time-row[data-day="${dayIndex}"]`));
  if (!group) return;
  group.appendChild(row);
  syncRoutineTimeRemoveButtons(dayIndex);
}

function setRoutineTimeRowsForDay(dayIndex, ranges) {
  const group = [...document.querySelectorAll(".day-time-group")]
    .find(item => item.querySelector(`.day-time-row[data-day="${dayIndex}"]`));
  if (!group) return;
  group.querySelectorAll(`.day-time-row[data-day="${dayIndex}"]`).forEach(row => row.remove());
  const panel = group.querySelector(".routine-copy-panel");
  ranges.forEach((range, rowIndex) => {
    const wrapper = document.createElement("template");
    wrapper.innerHTML = renderRoutineTimeRow(dayIndex, range, rowIndex, ranges.length).trim();
    const row = wrapper.content.firstElementChild;
    if (panel) group.insertBefore(row, panel);
    else group.appendChild(row);
  });
  syncRoutineTimeRemoveButtons(dayIndex);
}

function copyRoutineTimesToDays(sourceDay, mode) {
  const sourceRanges = getDayTimeRowsFromForm(sourceDay);
  if (!sourceRanges.length || sourceRanges.some(range => !range.start || !range.end)) {
    alert("Complete every time row for the source day before copying.");
    return;
  }

  const targetDays = [...document.querySelectorAll(`input[name="routineCopyTarget_${sourceDay}"]:checked`)]
    .map(input => Number(input.value));
  if (!targetDays.length) {
    alert("Choose at least one day to copy times to.");
    return;
  }

  const message = mode === "replace"
    ? "Replace existing times on the selected days?"
    : "Add these times to the selected days?";
  if (!confirm(message)) return;

  targetDays.forEach(dayIndex => {
    const nextRanges = mode === "add"
      ? [...getDayTimeRowsFromForm(dayIndex), ...sourceRanges]
      : sourceRanges;
    setRoutineTimeRowsForDay(dayIndex, nextRanges.map(range => ({ ...range })));
  });

  routineCopySourceDay = null;
  updateDayTimesSection();
}

function removeRoutineTimeRow(dayIndex, rowIndex) {
  const rows = [...document.querySelectorAll(`.day-time-row[data-day="${dayIndex}"]`)];
  if (rows.length <= 1 || !rows[rowIndex]) return;
  rows[rowIndex].remove();
  syncRoutineTimeRemoveButtons(dayIndex);
}

function syncRoutineTimeRemoveButtons(dayIndex) {
  const rows = [...document.querySelectorAll(`.day-time-row[data-day="${dayIndex}"]`)];
  rows.forEach((row, index) => {
    const button = row.querySelector("button");
    if (!button) return;
    button.disabled = rows.length === 1;
    button.setAttribute("onclick", `removeRoutineTimeRow(${dayIndex}, ${index})`);
  });
}

function autoFillSelectedDay() {
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
  let existingCount = 0;

  matchingRoutines.forEach(routine => {
    existingCount += countRoutineBlocksForDate(routine, today, todayDay);
    addedCount += addRoutineBlocksForDate(routine, today, todayDay);
  });

  if (addedCount) addBufferBlocksForDate(today);
  saveScheduleData();
  renderPlanner();
  alert(`${addedCount} added, ${existingCount} already existed`);
}

function autoFillThisWeek() {
  const result = addRoutineBlocksForWeek(scheduleData.routines);
  saveScheduleData();
  activePlannerSection = "Week";
  main.innerHTML = getPageHTML("Planner");
  renderPlanner();
  alert(`${result.addedCount} added, ${result.existingCount} already existed`);
}

function getStartOfWeekISO(dateIso) {
  const date = new Date(`${dateIso}T00:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return toLocalISO(date);
}

function getDateRangeLength(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  return Math.max(Math.round((end - start) / 86400000) + 1, 1);
}

function getWeekDates(startIso = plannerWeekStart, endIso = plannerWeekEnd) {
  const rangeLength = getDateRangeLength(startIso, endIso);
  const start = new Date(`${startIso}T00:00:00`);

  return Array.from({ length: rangeLength }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dayIndex = date.getDay();

    return {
      iso: `${year}-${month}-${day}`,
      label: getDayName(dayIndex),
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
  const rangeLabel = `${formatShortDate(plannerWeekStart)} – ${formatShortDate(plannerWeekEnd)}`;

  box.innerHTML = `
    <div class="planner-range-header">
      <div>
        <p class="eyebrow">Selected range</p>
        <strong>${escapeHTML(rangeLabel)}</strong>
      </div>
      <div class="planner-range-controls">
        <button class="secondary-btn" onclick="shiftPlannerWeekRange(-1)">Prev</button>
        <input type="date" value="${plannerWeekStart}" onchange="setPlannerWeekRange(this.value, plannerWeekEnd)">
        <input type="date" value="${plannerWeekEnd}" onchange="setPlannerWeekRange(plannerWeekStart, this.value)">
        <button class="secondary-btn" onclick="shiftPlannerWeekRange(1)">Next</button>
        <button onclick="resetPlannerWeekRange()">This Week</button>
      </div>
    </div>
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

function formatShortDate(iso) {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function setPlannerWeekRange(startIso, endIso) {
  if (!startIso || !endIso) return;
  if (startIso > endIso) {
    [startIso, endIso] = [endIso, startIso];
  }
  plannerWeekStart = startIso;
  plannerWeekEnd = endIso;
  renderWeeklyView();
}

function shiftPlannerWeekRange(direction) {
  const length = getDateRangeLength(plannerWeekStart, plannerWeekEnd);
  const offset = direction * length;
  plannerWeekStart = getDateOffset(plannerWeekStart, offset);
  plannerWeekEnd = getDateOffset(plannerWeekEnd, offset);
  renderWeeklyView();
}

function resetPlannerWeekRange() {
  plannerWeekStart = getStartOfWeekISO(getTodayISO());
  plannerWeekEnd = getDateOffset(plannerWeekStart, 6);
  renderWeeklyView();
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
      <div>
        <strong>${escapeHTML(monthLabel)}</strong>
        <input type="month" value="${visiblePlannerMonth}" onchange="setPlannerMonth(this.value)">
      </div>
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

function changePlannerDate(offset) {
  selectPlannerDate(getDateOffset(selectedPlannerDate, offset));
}

function changePlannerMonth(offset) {
  const [year, month] = visiblePlannerMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  visiblePlannerMonth = toLocalISO(date).slice(0, 7);
  renderMonthlyPlannerView();
}

function setPlannerMonth(monthValue) {
  if (!monthValue) return;
  visiblePlannerMonth = monthValue;
  renderMonthlyPlannerView();
}

function goToPlannerToday() {
  selectedPlannerDate = getTodayISO();
  visiblePlannerMonth = selectedPlannerDate.slice(0, 7);
  if (activePlannerSection === "Month") renderMonthlyPlannerView();
  else {
    main.innerHTML = getPageHTML("Planner");
    renderPlanner();
  }
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
  renderHomeObjectives();
  renderHomeCompletedToday();
  renderHomeHistory();
  renderHomeSnapshot();
  renderProductivitySummary("homeProductivitySummary");
  renderHomeTimeline();
  renderHomeSystemsHabits();
  renderHomeGoalProgress();
  renderHomeSocialReminder();
  renderHomeSuggestions();
  renderHomeStats();
  }

function isObjectiveDone(objective) {
  return objective.status === "Complete" || objective.status === "Skipped" || objective.status === "Deferred";
}

function getObjectiveRank(objective) {
  const priorityScore = { Priority: 0, High: 1, Medium: 2, Low: 3 };
  const typeScore = objective.focus ? -2 : objective.type === "Quick Win" ? 1 : objective.type === "Objective" ? 0 : 2;
  return (priorityScore[objective.priority] ?? 2) * 10 + typeScore;
}

function getTodayObjectives() {
  const today = getTodayISO();
  return systemsData.objectives
    .filter(objective => !isObjectiveDone(objective))
    .filter(objective => !objective.dueDate || objective.dueDate <= today || objective.linkedPlannerBlockId)
    .sort((a, b) => getObjectiveRank(a) - getObjectiveRank(b) || (a.dueTime || "99:99").localeCompare(b.dueTime || "99:99"));
}

function renderHomeObjectives() {
  const box = document.getElementById("homeObjectives");
  if (!box) return;
  const today = getTodayISO();
  const open = systemsData.objectives.filter(objective => !isObjectiveDone(objective));
  const focus = open.find(objective => objective.focus && (!objective.dueDate || objective.dueDate <= today)) || null;
  const top = getTodayObjectives().slice(0, 3);
  const overdue = open.filter(objective => objective.dueDate && objective.dueDate < today).slice(0, 3);
  const upcomingLinked = open
    .filter(objective => objective.linkedPlannerBlockId)
    .map(objective => ({
      objective,
      block: scheduleData.blocks.find(block => block.id === objective.linkedPlannerBlockId)
    }))
    .filter(item => item.block && item.block.date >= today)
    .sort((a, b) => (a.block.date || "").localeCompare(b.block.date || "") || (a.block.start || "").localeCompare(b.block.start || ""))
    .slice(0, 3)
    .map(item => item.objective);

  box.innerHTML = `
    ${focus ? `<div class="focus-objective">${renderObjectiveCard(focus, true)}</div>` : ""}
    <div class="objective-section">
      <div class="objective-section-title"><strong>Top 3 priorities</strong><button class="secondary-btn" onclick="quickAddObjective('Task')">+ Task</button></div>
      ${top.length ? top.map(objective => renderObjectiveCard(objective)).join("") : `<p class="muted-text">No priority objectives for today.</p>`}
    </div>
    ${overdue.length ? `<div class="objective-section"><strong>Overdue</strong>${overdue.map(objective => renderObjectiveCard(objective)).join("")}</div>` : ""}
    ${upcomingLinked.length ? `<div class="objective-section"><strong>Upcoming planner-linked</strong>${upcomingLinked.map(objective => renderObjectiveCard(objective)).join("")}</div>` : ""}
  `;
}

function renderObjectiveCard(objective, isFocus = false) {
  const index = systemsData.objectives.findIndex(item => item.id === objective.id);
  const block = objective.linkedPlannerBlockId ? scheduleData.blocks.find(item => item.id === objective.linkedPlannerBlockId) : null;
  const habit = objective.linkedHabitId ? systemsData.habits.find(item => item.id === objective.linkedHabitId) : null;
  const tracker = objective.linkedTrackerId ? systemsData.trackers.find(item => item.id === objective.linkedTrackerId) : null;
  const dueStatus = getObjectiveDueStatus(objective);
  const dueBadge = formatDueDateDisplay(objective.dueDate, objective.dueTime);
  const meta = [
    objective.priority,
    objective.type,
    objective.estimatedMinutes ? `${objective.estimatedMinutes}m` : ""
  ].filter(Boolean);
  return `
  <div class="objective-card ${isFocus ? "focus" : ""}">
  <div class="objective-main">
  <div>
  <strong>${escapeHTML(objective.title)}</strong>
  ${dueBadge ? `<span class="objective-due-badge objective-due-${dueStatus}">${escapeHTML(dueBadge)}</span>` : ""}
  <p>${meta.map(escapeHTML).join(" • ")}</p>
  ${block ? `<p>Planner: ${escapeHTML(block.title || "Block")} ${escapeHTML(block.start || "")}</p>` : ""}
  ${habit ? `<p>Habit: ${escapeHTML(habit.name)}</p>` : ""}
  ${tracker ? `<p>Tracker: ${escapeHTML(tracker.name)}</p>` : ""}
  ${objective.notes ? `<p>${escapeHTML(objective.notes)}</p>` : ""}
  </div>
  <span class="objective-status">${escapeHTML(objective.status)}</span>
  </div>
  <div class="objective-actions">
  <button onclick="setObjectiveStatus(${index}, 'Complete')">Done</button>
  <button class="secondary-btn" onclick="setObjectiveStatus(${index}, 'In progress')">Start</button>
  <button class="secondary-btn" onclick="deferObjective(${index})">Defer</button>
  <button class="secondary-btn" onclick="openObjectiveModal(${index})">Edit</button>
  <button class="secondary-btn" onclick="toggleFocusObjective(${index})">${objective.focus ? "Unfocus" : "Focus"}</button>
  </div>
  </div>
  `;
  }

function getObjectiveDueStatus(objective) {
  if (!objective.dueDate) return "none";
  const today = getTodayISO();
  if (objective.dueDate < today) return "overdue";
  if (objective.dueDate === today) return "today";
  return "upcoming";
}

function formatDueDateDisplay(dueDate, dueTime) {
  if (!dueDate) return "";
  const today = getTodayISO();
  const tomorrow = getDateOffset(today, 1);
  const timeStr = dueTime ? ` at ${dueTime}` : "";
  
  if (dueDate < today) {
    const daysAgo = Math.floor((new Date(today) - new Date(dueDate)) / (1000 * 60 * 60 * 24));
    return `${daysAgo}d overdue`;
  }
  if (dueDate === today) return `Today${timeStr}`;
  if (dueDate === tomorrow) return `Tomorrow${timeStr}`;
  
  const date = new Date(dueDate + "T00:00:00");
  const options = { month: "short", day: "numeric" };
  return date.toLocaleDateString("en-US", options) + timeStr;
}

function getSmartIndicators(objective) {
  const indicators = [];
  
  // Check if completed late
  if (objective.status === "Complete" && objective.completedDate && objective.dueDate) {
    const dueDate = new Date(objective.dueDate + "T00:00:00");
    const completedDate = new Date(objective.completedDate + "T00:00:00");
    const diffDays = Math.floor((completedDate - dueDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays > 0) {
      indicators.push({ type: "late", label: `Completed ${diffDays}d late` });
    } else if (diffDays < 0) {
      indicators.push({ type: "early", label: `Completed ${Math.abs(diffDays)}d early` });
    }
  }
  
  // Check if repeatedly deferred
  if (objective.deferredCount && objective.deferredCount >= 2) {
    indicators.push({ type: "deferred", label: `Deferred ${objective.deferredCount}x` });
  }
  
  // Check if overdue and still active
  if (!isObjectiveDone(objective) && objective.dueDate && objective.dueDate < getTodayISO()) {
    const daysOverdue = Math.floor((new Date(getTodayISO()) - new Date(objective.dueDate + "T00:00:00")) / (1000 * 60 * 60 * 24));
    if (daysOverdue >= 7) {
      indicators.push({ type: "late", label: `${daysOverdue}d overdue` });
    }
  }
  
  return indicators;
}

function getCompletedObjectiveType(objective) {
  if (objective.linkedPlannerBlockId) return "Planner-linked";
  if (objective.linkedHabitId) return "Habit-linked";
  if (objective.type === "Objective") return "Objective";
  return "Task";
}

function getObjectiveLinkedLabel(objective) {
  const block = objective.linkedPlannerBlockId ? scheduleData.blocks.find(item => item.id === objective.linkedPlannerBlockId) : null;
  const habit = objective.linkedHabitId ? systemsData.habits.find(item => item.id === objective.linkedHabitId) : null;
  const tracker = objective.linkedTrackerId ? systemsData.trackers.find(item => item.id === objective.linkedTrackerId) : null;
  if (block) return `Planner: ${block.title || "Block"}`;
  if (habit) return `Habit: ${habit.name}`;
  if (tracker) return `Tracker: ${tracker.name}`;
  return "";
}

function getCompletedObjectivesToday() {
  const today = getTodayISO();
  return systemsData.objectives
    .filter(objective => objective.status === "Complete" && objective.completedDate === today)
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
}

function setCompletedObjectiveFilter(filter) {
  completedObjectiveFilter = filter;
  renderHomeCompletedToday();
}

function renderHomeCompletedToday() {
  const box = document.getElementById("homeCompletedToday");
  if (!box) return;
  const allCompleted = getCompletedObjectivesToday();
  const filtered = allCompleted.filter(objective => {
    const type = getCompletedObjectiveType(objective);
    if (completedObjectiveFilter === "All") return true;
    if (completedObjectiveFilter === "Tasks") return type === "Task";
    if (completedObjectiveFilter === "Objectives") return type === "Objective";
    if (completedObjectiveFilter === "Planner-linked") return type === "Planner-linked";
    return true;
  });
  const filters = ["All", "Tasks", "Objectives", "Planner-linked"];
  box.innerHTML = `
    <details class="completed-today-panel" ${allCompleted.length ? "open" : ""}>
      <summary>
        <span>Completed Today <strong class="count-badge">${allCompleted.length}</strong></span>
        <span class="muted-text small">Show finished work</span>
      </summary>
      <div class="completed-filter-row">
        ${filters.map(filter => `
          <button class="${completedObjectiveFilter === filter ? "" : "secondary-btn"}" onclick="setCompletedObjectiveFilter('${filter}')">${filter}</button>
        `).join("")}
      </div>
      <div class="completed-objective-list">
        ${filtered.length ? filtered.map(renderCompletedObjectiveCard).join("") : `<p class="muted-text">No completed tasks yet today.</p>`}
      </div>
    </details>
  `;
}

function renderCompletedObjectiveCard(objective) {
  const index = systemsData.objectives.findIndex(item => item.id === objective.id);
  const type = getCompletedObjectiveType(objective);
  const linkedLabel = getObjectiveLinkedLabel(objective);
  const smartIndicators = getSmartIndicators(objective);
  
  return `
    <div class="completed-objective-card" onclick="openObjectiveDetailModal(${index})">
      <div>
        <strong>${escapeHTML(objective.title)}</strong>
        <p>
          <span class="objective-type-badge">${escapeHTML(type)}</span>
          <span class="completed-card-timestamp">Completed at ${escapeHTML(objective.completedAt || "today")}</span>
        </p>
        ${smartIndicators.length ? `<div style="margin-top:4px">${smartIndicators.map(indicator => 
          `<span class="smart-indicator smart-indicator-${indicator.type}">${escapeHTML(indicator.label)}</span>`
        ).join("")}</div>` : ""}
        ${linkedLabel ? `<p class="completed-card-links">${escapeHTML(linkedLabel)}</p>` : ""}
      </div>
      <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
        <button class="secondary-btn" onclick="openObjectiveModal(${index})">Edit</button>
        <button class="secondary-btn" onclick="reopenObjective(${index})">Reopen</button>
      </div>
    </div>
  `;
}

function openObjectiveDetailModal(index) {
  const objective = systemsData.objectives[index];
  if (!objective) return;
  
  const linkedLabel = getObjectiveLinkedLabel(objective);
  const smartIndicators = getSmartIndicators(objective);
  const dueStatus = getObjectiveDueStatus(objective);
  const dueBadge = formatDueDateDisplay(objective.dueDate, objective.dueTime);
  
  const modalHTML = `
    <div id="objectiveDetailModal" class="modal-backdrop" onclick="closeObjectiveDetailModalFromBackdrop(event)">
      <div class="planner-sheet objective-modal" role="dialog" aria-modal="true">
        <div class="sheet-handle"></div>
        <div class="objective-modal-header">
          <h3>Task Details</h3>
          <button class="icon-btn" onclick="closeObjectiveDetailModal()">x</button>
        </div>
        
        <div class="objective-modal-form">
          <div>
            <strong style="font-size:16px">${escapeHTML(objective.title)}</strong>
            ${dueBadge ? `<span class="objective-due-badge objective-due-${dueStatus}">${escapeHTML(dueBadge)}</span>` : ""}
          </div>
          
          <div class="history-card-meta">
            <span class="objective-type-badge">${escapeHTML(objective.type)}</span>
            <span>${escapeHTML(objective.priority)}</span>
            <span class="objective-status">${escapeHTML(objective.status)}</span>
            ${objective.category ? `<span>${escapeHTML(objective.category)}</span>` : ""}
            ${objective.estimatedMinutes ? `<span>${objective.estimatedMinutes}m estimated</span>` : ""}
          </div>
          
          ${smartIndicators.length ? `<div>${smartIndicators.map(indicator => 
            `<span class="smart-indicator smart-indicator-${indicator.type}">${escapeHTML(indicator.label)}</span>`
          ).join("")}</div>` : ""}
          
          ${linkedLabel ? `<p style="font-size:13px;color:var(--text-muted)">${escapeHTML(linkedLabel)}</p>` : ""}
          ${objective.tags ? `<p style="font-size:13px;color:var(--text-muted)">Tags: ${escapeHTML(objective.tags)}</p>` : ""}
          ${objective.notes ? `<div style="padding:10px;background:var(--surface-2);border-radius:8px;font-size:13px;white-space:pre-wrap">${escapeHTML(objective.notes)}</div>` : ""}
          
          <div class="history-card-dates">
            ${objective.createdAt ? `<div><span>Created</span><strong>${new Date(objective.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong></div>` : ""}
            ${objective.dueDate ? `<div><span>Due</span><strong>${new Date(objective.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}${objective.dueTime ? ` at ${objective.dueTime}` : ""}</strong></div>` : ""}
            ${objective.completedDate ? `<div><span>Completed</span><strong>${new Date(objective.completedDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}${objective.completedAt ? ` at ${objective.completedAt}` : ""}</strong></div>` : ""}
            ${objective.deferredCount ? `<div><span>Deferred</span><strong>${objective.deferredCount} time${objective.deferredCount === 1 ? "" : "s"}</strong></div>` : ""}
          </div>
          
          <div class="objective-modal-actions">
            ${objective.status === "Complete" ? `
              <button class="secondary-btn" onclick="reopenObjective(${index}); closeObjectiveDetailModal()">Reopen</button>
            ` : `
              <button onclick="setObjectiveStatus(${index}, 'Complete'); closeObjectiveDetailModal()">Mark Complete</button>
            `}
            <button class="secondary-btn" onclick="closeObjectiveDetailModal(); openObjectiveModal(${index})">Edit</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  const modalContainer = document.createElement("div");
  modalContainer.id = "objectiveDetailModalContainer";
  modalContainer.innerHTML = modalHTML;
  document.body.appendChild(modalContainer);
}

function closeObjectiveDetailModal() {
  const container = document.getElementById("objectiveDetailModalContainer");
  if (container) container.remove();
}

function closeObjectiveDetailModalFromBackdrop(event) {
  if (event.target && event.target.id === "objectiveDetailModal") {
    closeObjectiveDetailModal();
  }
}

// History Section Functions
function setHistoryFilter(filter) {
  historyFilter = filter;
  renderHomeHistory();
}

function setHistorySort(sort) {
  historySort = sort;
  renderHomeHistory();
}

function setHistorySearch(query) {
  historySearch = query;
  renderHomeHistory();
}

function getFilteredHistoryObjectives() {
  const today = getTodayISO();
  const weekStart = getDateOffset(today, -new Date(today).getDay());
  const monthStart = today.slice(0, 8) + "01";
  
  let objectives = [...systemsData.objectives];
  
  // Apply filter
  switch (historyFilter) {
    case "Active":
      objectives = objectives.filter(o => !isObjectiveDone(o));
      break;
    case "Completed":
      objectives = objectives.filter(o => o.status === "Complete");
      break;
    case "Overdue":
      objectives = objectives.filter(o => !isObjectiveDone(o) && o.dueDate && o.dueDate < today);
      break;
    case "Tasks":
      objectives = objectives.filter(o => o.type === "Task");
      break;
    case "Objectives":
      objectives = objectives.filter(o => o.type === "Objective");
      break;
    case "This week":
      objectives = objectives.filter(o => 
        (o.createdAt && o.createdAt.slice(0, 10) >= weekStart) ||
        (o.completedDate && o.completedDate >= weekStart)
      );
      break;
    case "This month":
      objectives = objectives.filter(o => 
        (o.createdAt && o.createdAt.slice(0, 10) >= monthStart) ||
        (o.completedDate && o.completedDate >= monthStart)
      );
      break;
  }
  
  // Apply search
  if (historySearch.trim()) {
    const query = historySearch.toLowerCase();
    objectives = objectives.filter(o => 
      o.title.toLowerCase().includes(query) ||
      (o.tags && o.tags.toLowerCase().includes(query)) ||
      (o.notes && o.notes.toLowerCase().includes(query)) ||
      (o.category && o.category.toLowerCase().includes(query))
    );
  }
  
  // Apply sort
  switch (historySort) {
    case "dueDate":
      objectives.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
      break;
    case "createdAt":
      objectives.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      break;
    case "completedDate":
      objectives.sort((a, b) => (b.completedDate || "").localeCompare(a.completedDate || ""));
      break;
    case "priority":
      const priorityOrder = { High: 0, Medium: 1, Low: 2 };
      objectives.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));
      break;
    case "updatedAt":
      objectives.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      break;
  }
  
  return objectives;
}

function renderHomeHistory() {
  const box = document.getElementById("homeHistory");
  if (!box) return;
  
  const objectives = getFilteredHistoryObjectives();
  const filters = ["All", "Active", "Completed", "Overdue", "Tasks", "Objectives", "This week", "This month"];
  const totalCount = systemsData.objectives.length;
  
  box.innerHTML = `
    <details class="history-section">
      <summary>
        <span>Task & Objective History <strong class="count-badge">${totalCount}</strong></span>
      </summary>
      
      <div class="history-filters">
        ${filters.map(filter => `
          <button class="history-filter-btn ${historyFilter === filter ? "active" : ""}" onclick="setHistoryFilter('${filter}')">${filter}</button>
        `).join("")}
      </div>
      
      <div class="history-search-row">
        <input type="text" placeholder="Search tasks & objectives..." value="${escapeHTML(historySearch)}" oninput="setHistorySearch(this.value)">
        <select onchange="setHistorySort(this.value)">
          <option value="dueDate" ${historySort === "dueDate" ? "selected" : ""}>Sort by Due Date</option>
          <option value="createdAt" ${historySort === "createdAt" ? "selected" : ""}>Sort by Created</option>
          <option value="completedDate" ${historySort === "completedDate" ? "selected" : ""}>Sort by Completed</option>
          <option value="priority" ${historySort === "priority" ? "selected" : ""}>Sort by Priority</option>
          <option value="updatedAt" ${historySort === "updatedAt" ? "selected" : ""}>Sort by Updated</option>
        </select>
      </div>
      
      <div class="history-list">
        ${objectives.length ? objectives.slice(0, 20).map(renderHistoryCard).join("") : `<p class="muted-text">No items match your filters.</p>`}
        ${objectives.length > 20 ? `<p class="muted-text" style="text-align:center">Showing 20 of ${objectives.length} items</p>` : ""}
      </div>
    </details>
  `;
}

function renderHistoryCard(objective) {
  const index = systemsData.objectives.findIndex(item => item.id === objective.id);
  const dueStatus = getObjectiveDueStatus(objective);
  const dueBadge = formatDueDateDisplay(objective.dueDate, objective.dueTime);
  const smartIndicators = getSmartIndicators(objective);
  const linkedLabel = getObjectiveLinkedLabel(objective);
  
  const createdDate = objective.createdAt ? new Date(objective.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  const completedDate = objective.completedDate ? new Date(objective.completedDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  
  return `
    <div class="history-card">
      <div class="history-card-header">
        <div>
          <span class="history-card-title">${escapeHTML(objective.title)}</span>
          ${dueBadge ? `<span class="objective-due-badge objective-due-${dueStatus}">${escapeHTML(dueBadge)}</span>` : ""}
        </div>
        <span class="objective-status">${escapeHTML(objective.status)}</span>
      </div>
      
      <div class="history-card-meta">
        <span class="objective-type-badge">${escapeHTML(objective.type)}</span>
        <span>${escapeHTML(objective.priority)}</span>
        ${objective.category ? `<span>${escapeHTML(objective.category)}</span>` : ""}
        ${objective.estimatedMinutes ? `<span>${objective.estimatedMinutes}m</span>` : ""}
      </div>
      
      ${smartIndicators.length ? `<div style="margin-top:6px">${smartIndicators.map(indicator => 
        `<span class="smart-indicator smart-indicator-${indicator.type}">${escapeHTML(indicator.label)}</span>`
      ).join("")}</div>` : ""}
      
      ${linkedLabel ? `<p style="font-size:12px;color:var(--text-muted);margin-top:6px">${escapeHTML(linkedLabel)}</p>` : ""}
      ${objective.notes ? `<p style="font-size:12px;color:var(--text-muted);margin-top:4px">${escapeHTML(objective.notes.slice(0, 100))}${objective.notes.length > 100 ? "..." : ""}</p>` : ""}
      
      <div class="history-card-dates">
        ${createdDate ? `<div><span>Created</span><strong>${createdDate}</strong></div>` : ""}
        ${objective.dueDate ? `<div><span>Due</span><strong>${new Date(objective.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong></div>` : ""}
        ${completedDate ? `<div><span>Completed</span><strong>${completedDate}${objective.completedAt ? ` at ${objective.completedAt}` : ""}</strong></div>` : ""}
      </div>
      
      <div class="history-card-actions">
        ${objective.status !== "Complete" ? `
          <button onclick="setObjectiveStatus(${index}, 'Complete')">Done</button>
          <button class="secondary-btn" onclick="deferObjective(${index})">Defer</button>
        ` : `
          <button class="secondary-btn" onclick="reopenObjective(${index})">Reopen</button>
        `}
        <button class="secondary-btn" onclick="openObjectiveModal(${index})">Edit</button>
        <button class="danger-btn" onclick="deleteObjective(${index})">Delete</button>
      </div>
    </div>
  `;
}

function deleteObjective(index) {
  if (!confirm("Delete this item? This cannot be undone.")) return;
  systemsData.objectives.splice(index, 1);
  saveSystemsData();
  renderHome();
}

function quickAddObjective(type = "Task") {
  openObjectiveModal(null, type);
}

function openObjectiveModal(index = null, defaultType = "Task") {
  editingObjectiveIndex = index;
  const isEdit = index !== null;
  const objective = isEdit ? systemsData.objectives[index] : null;
  
  const modalHTML = `
    <div id="objectiveModal" class="modal-backdrop" onclick="closeObjectiveModalFromBackdrop(event)">
      <div class="planner-sheet objective-modal" role="dialog" aria-modal="true">
        <div class="sheet-handle"></div>
        <div class="objective-modal-header">
          <h3>${isEdit ? "Edit" : "New"} ${objective?.type || defaultType}</h3>
          <button class="icon-btn" onclick="closeObjectiveModal()">x</button>
        </div>
        
        <div class="objective-modal-form">
          <div>
            <label>Title *</label>
            <input type="text" id="objectiveTitle" value="${escapeHTML(objective?.title || "")}" placeholder="What do you want to accomplish?">
          </div>
          
          <div class="objective-modal-row">
            <div>
              <label>Type</label>
              <select id="objectiveType">
                <option value="Task" ${(objective?.type || defaultType) === "Task" ? "selected" : ""}>Task</option>
                <option value="Objective" ${(objective?.type || defaultType) === "Objective" ? "selected" : ""}>Objective</option>
              </select>
            </div>
            <div>
              <label>Priority</label>
              <select id="objectivePriority">
                <option value="Low" ${objective?.priority === "Low" ? "selected" : ""}>Low</option>
                <option value="Medium" ${(objective?.priority || "Medium") === "Medium" ? "selected" : ""}>Medium</option>
                <option value="High" ${objective?.priority === "High" ? "selected" : ""}>High</option>
              </select>
            </div>
          </div>
          
          <div class="objective-modal-row">
            <div>
              <label>Due Date</label>
              <input type="date" id="objectiveDueDate" value="${objective?.dueDate || getTodayISO()}">
            </div>
            <div>
              <label>Due Time</label>
              <input type="time" id="objectiveDueTime" value="${objective?.dueTime || ""}">
            </div>
          </div>
          
          <div class="objective-modal-row">
            <div>
              <label>Estimated Minutes</label>
              <input type="number" id="objectiveEstimatedMinutes" value="${objective?.estimatedMinutes || ""}" placeholder="e.g. 30" min="0">
            </div>
            <div>
              <label>Category</label>
              <select id="objectiveCategory">
                <option value="">Select category</option>
                <option value="Work" ${objective?.category === "Work" ? "selected" : ""}>Work</option>
                <option value="Personal" ${objective?.category === "Personal" ? "selected" : ""}>Personal</option>
                <option value="Health" ${objective?.category === "Health" ? "selected" : ""}>Health</option>
                <option value="Learning" ${objective?.category === "Learning" ? "selected" : ""}>Learning</option>
                <option value="Finance" ${objective?.category === "Finance" ? "selected" : ""}>Finance</option>
                <option value="Social" ${objective?.category === "Social" ? "selected" : ""}>Social</option>
                <option value="Home" ${objective?.category === "Home" ? "selected" : ""}>Home</option>
                <option value="School" ${objective?.category === "School" ? "selected" : ""}>School</option>
              </select>
            </div>
          </div>
          
          <div>
            <label>Tags</label>
            <input type="text" id="objectiveTags" value="${escapeHTML(objective?.tags || "")}" placeholder="Comma-separated tags">
          </div>
          
          <div>
            <label>Notes</label>
            <textarea id="objectiveNotes" placeholder="Add any notes..." rows="3">${escapeHTML(objective?.notes || "")}</textarea>
          </div>
          
          <details class="objective-advanced-section">
            <summary>Link to other items</summary>
            <div class="objective-modal-links">
              <div>
                <label>Link to Planner Block</label>
                <select id="objectiveLinkedPlannerBlock">
                  <option value="">None</option>
                  ${scheduleData.blocks.filter(b => b.date === getTodayISO()).map(b => 
                    `<option value="${b.id}" ${objective?.linkedPlannerBlockId === b.id ? "selected" : ""}>${escapeHTML(b.name)}</option>`
                  ).join("")}
                </select>
              </div>
              <div>
                <label>Link to Habit</label>
                <select id="objectiveLinkedHabit">
                  <option value="">None</option>
                  ${systemsData.habits.map(h => 
                    `<option value="${h.id}" ${objective?.linkedHabitId === h.id ? "selected" : ""}>${escapeHTML(h.name)}</option>`
                  ).join("")}
                </select>
              </div>
              <div>
                <label>Link to Tracker</label>
                <select id="objectiveLinkedTracker" onchange="toggleTrackerAmountField()">
                  <option value="">None</option>
                  ${systemsData.trackers.map(t => 
                    `<option value="${t.id}" ${objective?.linkedTrackerId === t.id ? "selected" : ""}>${escapeHTML(t.name)}</option>`
                  ).join("")}
                </select>
              </div>
              <div id="trackerAmountContainer" style="display:${objective?.linkedTrackerId ? "block" : "none"}">
                <label>Tracker Log Amount</label>
                <input type="number" id="objectiveTrackerLogAmount" value="${objective?.trackerLogAmount || ""}" placeholder="Amount to log on completion">
              </div>
              
              <div class="objective-auto-complete-options">
                <label style="display:flex;align-items:center;gap:8px">
                  <input type="checkbox" id="objectiveAutoCompleteFromPlanner" ${objective?.autoCompleteFromPlanner !== false ? "checked" : ""}>
                  Auto-complete when linked planner block is completed
                </label>
                <label style="display:flex;align-items:center;gap:8px">
                  <input type="checkbox" id="objectiveAutoCompleteFromHabit" ${objective?.autoCompleteFromHabit !== false ? "checked" : ""}>
                  Auto-complete when linked habit is completed
                </label>
              </div>
            </div>
          </details>
          
          <div class="objective-modal-actions">
            <button class="secondary-btn" onclick="closeObjectiveModal()">Cancel</button>
            <button onclick="saveObjectiveFromModal()">${isEdit ? "Update" : "Create"}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  const modalContainer = document.createElement("div");
  modalContainer.id = "objectiveModalContainer";
  modalContainer.innerHTML = modalHTML;
  document.body.appendChild(modalContainer);
  
  setTimeout(() => {
    const titleInput = document.getElementById("objectiveTitle");
    if (titleInput) titleInput.focus();
  }, 100);
}

function toggleTrackerAmountField() {
  const trackerId = document.getElementById("objectiveLinkedTracker")?.value;
  const container = document.getElementById("trackerAmountContainer");
  if (container) container.style.display = trackerId ? "block" : "none";
}

function closeObjectiveModal() {
  editingObjectiveIndex = null;
  const container = document.getElementById("objectiveModalContainer");
  if (container) container.remove();
}

function closeObjectiveModalFromBackdrop(event) {
  if (event.target && event.target.id === "objectiveModal") {
    closeObjectiveModal();
  }
}

function saveObjectiveFromModal() {
  const title = document.getElementById("objectiveTitle")?.value.trim();
  if (!title) {
    alert("Please enter a title.");
    return;
  }
  
  const isEdit = editingObjectiveIndex !== null;
  const existingObjective = isEdit ? systemsData.objectives[editingObjectiveIndex] : null;
  const now = new Date().toISOString();
  
  const objective = {
    id: existingObjective?.id || createId("objective"),
    title,
    type: document.getElementById("objectiveType")?.value || "Task",
    status: existingObjective?.status || "Not started",
    priority: document.getElementById("objectivePriority")?.value || "Medium",
    dueDate: document.getElementById("objectiveDueDate")?.value || getTodayISO(),
    dueTime: document.getElementById("objectiveDueTime")?.value || "",
    estimatedMinutes: document.getElementById("objectiveEstimatedMinutes")?.value || "",
    category: document.getElementById("objectiveCategory")?.value || "",
    tags: document.getElementById("objectiveTags")?.value.trim() || "",
    notes: document.getElementById("objectiveNotes")?.value.trim() || "",
    linkedPlannerBlockId: document.getElementById("objectiveLinkedPlannerBlock")?.value || "",
    linkedHabitId: document.getElementById("objectiveLinkedHabit")?.value || "",
    linkedTrackerId: document.getElementById("objectiveLinkedTracker")?.value || "",
    trackerLogAmount: document.getElementById("objectiveTrackerLogAmount")?.value || "",
    completedDate: existingObjective?.completedDate || "",
    completedAt: existingObjective?.completedAt || "",
    autoCompleteFromPlanner: document.getElementById("objectiveAutoCompleteFromPlanner")?.checked !== false,
    autoCompleteFromHabit: document.getElementById("objectiveAutoCompleteFromHabit")?.checked !== false,
    focus: existingObjective?.focus || false,
    recurring: existingObjective?.recurring || "",
    subtasks: existingObjective?.subtasks || [],
    createdAt: existingObjective?.createdAt || now,
    updatedAt: now,
    deferredCount: existingObjective?.deferredCount || 0
  };
  
  if (isEdit) {
    systemsData.objectives[editingObjectiveIndex] = objective;
  } else {
    systemsData.objectives.push(objective);
  }
  
  closeObjectiveModal();
  saveSystemsData();
  main.innerHTML = getPageHTML("Home");
  renderHome();
}

function setObjectiveStatus(index, status) {
  const objective = systemsData.objectives[index];
  if (!objective) return;
  objective.status = status;
  objective.updatedAt = new Date().toISOString();
  if (status === "Complete") {
    objective.completedDate = getTodayISO();
    objective.completedAt = new Date().toTimeString().slice(0, 5);
    completeObjectiveIntegrations(objective);
  } else {
    objective.completedDate = "";
    objective.completedAt = "";
  }
  saveSystemsData();
  renderSystems();
  renderHome();
}

function reopenObjective(index) {
  const objective = systemsData.objectives[index];
  if (!objective) return;
  objective.status = "Not started";
  objective.completedDate = "";
  objective.completedAt = "";
  saveSystemsData();
  renderSystems();
  renderHome();
}

function deferObjective(index) {
  const objective = systemsData.objectives[index];
  if (!objective) return;
  objective.status = "Deferred";
  objective.dueDate = getDateOffset(getTodayISO(), 1);
  objective.deferredCount = (objective.deferredCount || 0) + 1;
  objective.updatedAt = new Date().toISOString();
  saveSystemsData();
  renderSystems();
  renderHome();
}

function toggleFocusObjective(index) {
  const objective = systemsData.objectives[index];
  if (!objective) return;
  const nextFocus = !objective.focus;
  systemsData.objectives.forEach(item => item.focus = false);
  objective.focus = nextFocus;
  saveSystemsData();
  renderSystems();
  renderHome();
}

function completeObjectiveIntegrations(objective) {
  const today = getTodayISO();
  if (objective.linkedPlannerBlockId) {
    const block = scheduleData.blocks.find(item => item.id === objective.linkedPlannerBlockId);
    if (block && !block.completed) {
      block.completed = true;
      block.tasks = (block.tasks || []).map(task => ({ ...task, completed: true }));
      saveScheduleData();
    }
  }
  if (objective.linkedHabitId) {
    const habit = systemsData.habits.find(item => item.id === objective.linkedHabitId);
    if (habit && !habit.completions.includes(today)) {
      habit.completions.push(today);
      if (!Array.isArray(habit.completionHistory)) habit.completionHistory = [];
      habit.completionHistory.push({
        date: today,
        time: new Date().toTimeString().slice(0, 5),
        plannerBlockId: objective.linkedPlannerBlockId || ""
      });
    }
  }
  if (!objective.linkedTrackerId || !objective.trackerLogAmount) return;
  const tracker = systemsData.trackers.find(item => item.id === objective.linkedTrackerId);
  if (!tracker) return;
  const dup = systemsData.logs.some(log =>
    log.linkedObjectiveId === objective.id && getLogLinkedTrackerId(log) === tracker.id && log.date === today
  );
  if (!dup) {
    systemsData.logs.push({
      id: createId("log"),
      title: tracker.name,
      type: tracker.category || "Custom",
      valueType: tracker.category || "Custom",
      value: String(objective.trackerLogAmount),
      unit: tracker.unit || "",
      date: today,
      notes: `Objective complete — ${objective.title}`,
      linkedHabitId: objective.linkedHabitId || "",
      linkedItemType: "tracker",
      linkedMetricId: "",
      linkedTrackerId: tracker.id,
      linkedGoalId: objective.linkedGoalId || "",
      linkedPlannerBlockId: objective.linkedPlannerBlockId || "",
      linkedRoutineId: objective.linkedRoutineId || "",
      linkedObjectiveId: objective.id,
      logSource: "manual",
      plannerAutoLogKey: "",
      inactive: false
    });
  }
  recalcTrackerCurrentFromLogs(tracker);
}

function autoCompleteObjectivesForPlannerBlock(block) {
  let changed = false;
  systemsData.objectives.forEach(objective => {
    if (isObjectiveDone(objective) || !objective.autoCompleteFromPlanner) return;
    if (objective.linkedPlannerBlockId !== block.id) return;
    objective.status = "Complete";
    objective.completedDate = getTodayISO();
    objective.completedAt = new Date().toTimeString().slice(0, 5);
    completeObjectiveIntegrations(objective);
    changed = true;
  });
  if (changed) saveSystemsData();
}

function autoCompleteObjectivesForHabit(habit) {
  let changed = false;
  systemsData.objectives.forEach(objective => {
    if (isObjectiveDone(objective) || !objective.autoCompleteFromHabit) return;
    if (objective.linkedHabitId !== habit.id) return;
    objective.status = "Complete";
    objective.completedDate = getTodayISO();
    objective.completedAt = new Date().toTimeString().slice(0, 5);
    completeObjectiveIntegrations(objective);
    changed = true;
  });
  if (changed) saveSystemsData();
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
      <button onclick="openSystemsSection('Trackers')"><span>Goal preview</span><strong>${escapeHTML(focus.goalPreview)}</strong></button>
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
      action: "openSystemsSection('Trackers')"
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
        <button class="secondary-btn" onclick="openSystemsSection('Trackers')">Open goals</button>
      </div>
    `
    : `<div class="empty-state small"><p>No goals yet.</p><button onclick="openSystemsSection('Trackers')">Add first goal</button></div>`;
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
    log: editingLogIndex === null ? "Add Log" : "Edit Log",
    tracker: editingTrackerIndex === null ? "Add Tracker" : "Edit Tracker",
    trackerLog: "Manual tracker log",
    goal: editingGoalIndex === null ? "Add Goal" : "Edit Goal",
    objective: editingObjectiveIndex === null ? "Add Objective" : "Edit Objective"
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
        ${activeSystemsForm === "tracker" ? renderTrackerFormFields() : ""}
        ${activeSystemsForm === "trackerLog" ? renderTrackerManualLogFormFields() : ""}
        ${activeSystemsForm === "goal" ? renderGoalFormFields() : ""}
        ${activeSystemsForm === "objective" ? renderObjectiveFormFields() : ""}
      </div>
    </div>
  `;
}

function renderHabitFormFields() {
  return `
    <p class="form-section-label">Core Fields</p>
    <input id="habitName" placeholder="Habit name">
    <select id="habitCategory">
      <option value="">Category</option>
      ${renderCategoryOptions()}
    </select>
    <select id="habitType">
      <option value="">Type</option>
      ${renderHabitTypeOptions()}
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
    
    <p class="form-section-label">Completion Type</p>
    <div class="completion-type-toggle">
      <label>
        <input type="radio" name="habitCompletionType" value="checkbox" checked onchange="toggleHabitTargetFields()">
        Checkbox only
      </label>
      <label>
        <input type="radio" name="habitCompletionType" value="amount" onchange="toggleHabitTargetFields()">
        Amount-based
      </label>
    </div>
    
    <div id="habitTargetFields" class="habit-target-fields" style="display:none">
      <div class="habit-target-row">
        <div>
          <label style="font-size:12px;color:var(--text-muted)">Daily target</label>
          <input id="habitDailyTargetAmount" type="number" placeholder="e.g. 2" min="0" step="0.5">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-muted)">Weekly target</label>
          <input id="habitWeeklyTargetAmount" type="number" placeholder="e.g. 12" min="0" step="0.5">
        </div>
      </div>
      <div>
        <label style="font-size:12px;color:var(--text-muted)">Unit</label>
        <select id="habitUnit">
          <option value="">Unit</option>
          <option>times</option>
          <option>sessions</option>
          <option>classes</option>
          <option>minutes</option>
          <option>hours</option>
          <option>pages</option>
          <option>miles</option>
          <option>reps</option>
          <option>glasses</option>
          <option>calories</option>
          <option>steps</option>
          <option>dollars</option>
          <option>Custom</option>
        </select>
      </div>
    </div>
    
    <input id="habitTarget" placeholder="Target description (e.g. 30 min workout)" style="margin-top:10px">
    <textarea id="habitNotes" placeholder="Notes"></textarea>
    
    <details class="advanced-options link-options">
      <summary>Advanced Links & Automation</summary>
      <label class="muted-text small">Linked goal</label>
      <select id="habitLinkedGoalId">
        <option value="">Link to goal</option>
        ${systemsData.goals.map(g => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join("")}
      </select>
      <label class="muted-text small">Linked tracker</label>
      <select id="habitLinkedTrackerId">${renderLinkOptions(systemsData.trackers, "", "No linked tracker")}</select>
      <label class="muted-text small">Linked routine</label>
      <select id="habitLinkedRoutineId">${renderLinkOptions(scheduleData.routines, "", "No linked routine")}</select>
      <label class="muted-text small">Linked planner block</label>
      <select id="habitLinkedPlannerBlockId">${renderLinkOptions(scheduleData.blocks.filter(b => !b.isBuffer), "", "No linked planner block")}</select>
      <label class="inline-check"><input type="checkbox" id="habitAutoLogTracker"> Update linked tracker when completed</label>
      <input id="habitTrackerLogAmount" type="number" step="any" placeholder="Tracker amount on habit completion">
      <label class="inline-check"><input type="checkbox" id="habitAutoLogToTracker" checked style="width:auto;min-height:unset;margin:0"> Auto-log to linked tracker when completing</label>
      ${renderSharedUnitDatalist()}
    </details>
    
    <button id="habitSaveButton" onclick="saveHabit()">${editingHabitIndex === null ? "Save Habit" : "Update Habit"}</button>
    <button class="secondary-btn" onclick="closeSystemsForm()">Cancel</button>
  `;
}

function toggleHabitTargetFields() {
  const isAmount = document.querySelector('input[name="habitCompletionType"]:checked')?.value === "amount";
  const fields = document.getElementById("habitTargetFields");
  if (fields) fields.style.display = isAmount ? "grid" : "none";
}

function getRecentPlannerBlocksForLogSelect(limit = 100) {
  return [...scheduleData.blocks]
    .filter(b => !b.isBuffer && b.id)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.start || "").localeCompare(a.start || ""))
    .slice(0, limit);
}

function renderLogFormFields() {
  return `
    <p class="form-section-label">Core Fields</p>
    <label class="muted-text small">Linked tracker (optional)</label>
    <select id="logLinkedItemId" onchange="syncLogFieldsFromTracker()">
      <option value="">Choose tracker</option>
      ${systemsData.trackers.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join("")}
    </select>
    <div class="habit-meta-row">
      <input id="logValue" placeholder="Amount">
      ${renderUnitComboInput("logUnit")}
    </div>
    ${renderSharedUnitDatalist()}
    <input id="logDate" type="date" placeholder="Date">
    <textarea id="logNotes" placeholder="Notes"></textarea>
    <input id="logTitle" type="hidden">
    <input id="logType" type="hidden">
    
    <details class="advanced-options link-options">
      <summary>Advanced Links</summary>
      <div id="logLinkedItemSelectWrap" style="display:none"></div>
      <label class="muted-text small">Linked planner block</label>
      <select id="logLinkedPlannerBlockId">
        <option value="">None</option>
        ${getRecentPlannerBlocksForLogSelect().map(b => `
          <option value="${escapeHTML(b.id)}">${escapeHTML(b.date || "")} ${escapeHTML(b.start || "")} — ${escapeHTML(b.title || "")}</option>
        `).join("")}
      </select>
    </details>
    
    <button onclick="saveSystemLog()">${editingLogIndex === null ? "Save Log" : "Update Log"}</button>
    <button class="secondary-btn" onclick="closeSystemsForm()">Cancel</button>
  `;
}

// Milestone helper functions
function createMilestone(data = {}) {
  return {
    id: data.id || createId("milestone"),
    name: data.name || "",
    amount: data.amount || "",
    targetDate: data.targetDate || "",
    completed: data.completed || false,
    completedDate: data.completedDate || "",
    notes: data.notes || ""
  };
}

function normalizeMilestones(milestones) {
  if (!milestones) return [];
  if (typeof milestones === "string") {
    // Convert old text-based milestones to structured objects
    return milestones.split("\n")
      .map(line => line.trim())
      .filter(line => line)
      .map(line => createMilestone({ name: line }));
  }
  if (Array.isArray(milestones)) {
    return milestones.map(m => createMilestone(m));
  }
  return [];
}

function getNextMilestone(tracker) {
  const milestones = normalizeMilestones(tracker.milestones || []);
  const current = Number(tracker.currentValue) || 0;
  const incomplete = milestones.filter(m => !m.completed && m.amount);
  return incomplete
    .filter(m => Number(m.amount) > current)
    .sort((a, b) => Number(a.amount) - Number(b.amount))[0] || null;
}

function getMilestoneProgress(tracker) {
  const milestones = normalizeMilestones(tracker.milestones || []);
  const completed = milestones.filter(m => m.completed).length;
  const total = milestones.length;
  return { completed, total, percent: total > 0 ? (completed / total) * 100 : 0 };
}

function checkMilestoneCompletion(tracker) {
  const milestones = normalizeMilestones(tracker.milestones || []);
  const current = Number(tracker.currentValue) || 0;
  const today = getTodayISO();
  let hasNewCompletion = false;
  
  milestones.forEach(milestone => {
    if (!milestone.completed && milestone.amount && Number(milestone.amount) <= current) {
      milestone.completed = true;
      milestone.completedDate = today;
      hasNewCompletion = true;
      
      // Add activity log for milestone completion
      systemsData.logs.push({
        id: createId("log"),
        title: `Milestone completed: ${milestone.name}`,
        type: "Milestone",
        valueType: "Milestone",
        value: milestone.amount,
        unit: tracker.unit || "",
        date: today,
        notes: milestone.notes || "",
        linkedItemType: "tracker",
        linkedTrackerId: tracker.id,
        logSource: "milestone-auto",
        inactive: false
      });
    }
  });
  
  if (hasNewCompletion) {
    tracker.milestones = milestones;
    saveSystemsData();
  }
  
  return hasNewCompletion;
}

// Render milestone form fields
function renderMilestoneFormFields(milestones = []) {
  const normalized = normalizeMilestones(milestones);
  return `
    <div id="milestonesContainer">
      ${normalized.length === 0 ? '<p class="muted-text small">No milestones yet</p>' : ''}
      ${normalized.map((m, idx) => `
        <div class="milestone-row" data-idx="${idx}">
          <div class="milestone-header">
            <input type="text" placeholder="Milestone name" value="${escapeHTML(m.name)}" data-field="name">
            <input type="checkbox" ${m.completed ? "checked" : ""} data-field="completed">
            <button class="delete-milestone-btn" onclick="deleteMilestone(${idx})">×</button>
          </div>
          <div class="milestone-details">
            <input type="number" step="any" placeholder="Amount" value="${escapeHTML(m.amount)}" data-field="amount">
            <input type="date" placeholder="Target date" value="${escapeHTML(m.targetDate)}" data-field="targetDate">
            <input type="text" placeholder="Notes" value="${escapeHTML(m.notes)}" data-field="notes">
          </div>
        </div>
      `).join("")}
    </div>
    <button type="button" onclick="addMilestone()">+ Add Milestone</button>
  `;
}

function addMilestone() {
  const container = document.getElementById("milestonesContainer");
  if (!container) return;
  const idx = container.querySelectorAll(".milestone-row").length;
  const milestoneHtml = `
    <div class="milestone-row" data-idx="${idx}">
      <div class="milestone-header">
        <input type="text" placeholder="Milestone name" data-field="name">
        <input type="checkbox" data-field="completed">
        <button class="delete-milestone-btn" onclick="deleteMilestone(${idx})">×</button>
      </div>
      <div class="milestone-details">
        <input type="number" step="any" placeholder="Amount" data-field="amount">
        <input type="date" placeholder="Target date" data-field="targetDate">
        <input type="text" placeholder="Notes" data-field="notes">
      </div>
    </div>
  `;
  const emptyMsg = container.querySelector(".muted-text");
  if (emptyMsg) emptyMsg.remove();
  container.insertAdjacentHTML("beforeend", milestoneHtml);
}

function deleteMilestone(idx) {
  const row = document.querySelector(`.milestone-row[data-idx="${idx}"]`);
  if (row) row.remove();
  const container = document.getElementById("milestonesContainer");
  if (container && container.querySelectorAll(".milestone-row").length === 0) {
    container.innerHTML = '<p class="muted-text small">No milestones yet</p>';
  }
}

function getMilestonesFromForm() {
  const container = document.getElementById("milestonesContainer");
  if (!container) return [];
  const rows = container.querySelectorAll(".milestone-row");
  return Array.from(rows).map(row => {
    const name = row.querySelector('[data-field="name"]')?.value || "";
    const amount = row.querySelector('[data-field="amount"]')?.value || "";
    const targetDate = row.querySelector('[data-field="targetDate"]')?.value || "";
    const completed = row.querySelector('[data-field="completed"]')?.checked || false;
    const notes = row.querySelector('[data-field="notes"]')?.value || "";
    return createMilestone({ name, amount, targetDate, completed, completedDate: completed ? getTodayISO() : "", notes });
  }).filter(m => m.name || m.amount);
}

// Render tracker form fields
function renderTrackerFormFields() {
  return `
    <p class="form-section-label">Core Fields</p>
    <input id="trackerName" placeholder="Name">
    <label class="muted-text small">Category</label>
    <select id="trackerCategory">
      <option value="">Category</option>
      ${renderCategoryOptions()}
    </select>
    <label class="muted-text small">Type</label>
    <select id="trackerType">
      <option value="">Type</option>
      ${getTrackerTypes().map(t => `<option value="${escapeHTML(t)}" ${t === (editingTracker?.type || "") ? "selected" : ""}>${escapeHTML(t)}</option>`).join("")}
    </select>
    <label class="muted-text small">Unit</label>
    ${renderUnitComboInput("trackerUnit", "", "e.g. classes, hours...")}
    ${renderSharedUnitDatalist()}
    <div class="habit-meta-row">
      <input id="trackerStartValue" type="number" step="any" placeholder="Start value">
      <input id="trackerCurrentValue" type="number" step="any" placeholder="Current value">
    </div>
    <div class="habit-meta-row">
      <input id="trackerTargetValue" type="number" step="any" placeholder="Target value (optional)">
      <select id="trackerDirection">
        <option value="increase">Increase toward target</option>
        <option value="decrease">Decrease / taper toward target</option>
      </select>
    </div>
    <textarea id="trackerNotes" placeholder="Notes"></textarea>
    
    <details class="advanced-options">
      <summary>Advanced Options & Links</summary>
      <p class="form-section-label">Behavior</p>
      <select id="trackerLogValueMode">
        <option value="increment">Log amounts add up</option>
        <option value="absolute">Logs are measurements</option>
      </select>
      <select id="trackerResetType">
        ${TRACKER_RESET_TYPES.map(r => `<option value="${escapeHTML(r)}">${escapeHTML(r)}</option>`).join("")}
      </select>
      <input id="trackerResetCustomNote" placeholder="Reset detail (optional)">
      <div class="habit-meta-row">
        <input id="trackerStartDate" type="date" placeholder="Start date">
        <input id="trackerTargetDate" type="date" placeholder="Target / end date">
      </div>
      
      <p class="form-section-label">Links</p>
      <label class="muted-text small">Linked habit</label>
      <select id="trackerLinkedHabit">
        <option value="">No linked habit</option>
        ${systemsData.habits.map(h => `<option value="${h.id}">${escapeHTML(h.name)}</option>`).join("")}
      </select>
      <label class="muted-text small">Linked goal</label>
      <select id="trackerLinkedGoal">${renderLinkOptions(systemsData.goals, "", "No linked goal")}</select>
      <label class="muted-text small">Linked routine</label>
      <select id="trackerLinkedRoutine">${renderLinkOptions(scheduleData.routines, "", "No linked routine")}</select>
      <label class="muted-text small">Linked planner block</label>
      <select id="trackerLinkedPlanner">${renderLinkOptions(scheduleData.blocks.filter(b => !b.isBuffer), "", "No linked planner block")}</select>
      <label class="muted-text small">Linked objective</label>
      <select id="trackerLinkedObjective">${renderLinkOptions(systemsData.objectives, "", "No linked objective")}</select>
      
      <p class="form-section-label">Automation</p>
      <label class="inline-check"><input type="checkbox" id="trackerAutoLogPlanner"> Auto-log when linked habit's planner block is completed</label>
      <div class="habit-meta-row">
        <input id="trackerAutoLogAmount" type="number" step="any" placeholder="Auto-log amount" value="1">
        ${renderUnitComboInput("trackerAutoLogUnit", "", "Auto-log unit")}
      </div>
      <label class="inline-check"><input type="checkbox" id="trackerPreventDupAuto" checked> Prevent duplicate auto-logs</label>
      
      <p class="form-section-label">Milestones</p>
      ${renderMilestoneFormFields(editingTracker?.milestones || [])}
    </details>
    
    <button id="trackerSaveButton" onclick="saveUnifiedTrackerFromModal()">${editingTrackerIndex === null ? "Save Tracker" : "Update Tracker"}</button>
    <button class="secondary-btn" onclick="closeSystemsForm()">Cancel</button>
  `;
}

function renderTrackerManualLogFormFields() {
  const tracker = systemsData.trackers.find(t => t.id === manualLogTrackerId);
  if (!tracker) return "<p>Tracker not found.</p>";
  const blocks = scheduleData.blocks.filter(b => !b.isBuffer && b.id && b.date === getTodayISO());
  return `
    <p class="muted-text">Manual entry for <strong>${escapeHTML(tracker.name)}</strong></p>
    <input id="manualLogDate" type="date" onchange="refreshManualLogPlannerBlockOptions()">
    <div class="habit-meta-row">
      <input id="manualLogValue" type="number" step="any" placeholder="Value / amount" required>
      ${renderUnitComboInput("manualLogUnit", tracker.unit || "", "Unit")}
    </div>
    ${renderSharedUnitDatalist()}
    <textarea id="manualLogNotes" placeholder="Notes"></textarea>
    <label class="muted-text small">Optional linked habit</label>
    <select id="manualLogLinkedHabit">
      <option value="">None</option>
      ${systemsData.habits.map(h => `<option value="${h.id}" ${h.id === tracker.linkedHabitId ? "selected" : ""}>${escapeHTML(h.name)}</option>`).join("")}
    </select>
    <label class="muted-text small">Optional planner block</label>
    <select id="manualLogPlannerBlock">
      <option value="">None</option>
      ${blocks.map(b => `<option value="${escapeHTML(b.id)}">${escapeHTML(b.start || "")}–${escapeHTML(b.end || "")} ${escapeHTML(b.title || "")}</option>`).join("")}
    </select>
    <button onclick="saveTrackerManualLog()">Save log</button>
    <button class="secondary-btn" onclick="closeSystemsForm()">Cancel</button>
  `;
}

function refreshManualLogPlannerBlockOptions() {
  const sel = document.getElementById("manualLogPlannerBlock");
  const dateInput = document.getElementById("manualLogDate");
  if (!sel || !dateInput) return;
  const d = dateInput.value || getTodayISO();
  const blocks = scheduleData.blocks.filter(b => !b.isBuffer && b.id && b.date === d);
  sel.innerHTML = `<option value="">None</option>${blocks.map(b =>
    `<option value="${escapeHTML(b.id)}">${escapeHTML(b.start || "")}–${escapeHTML(b.end || "")} ${escapeHTML(b.title || "")}</option>`
  ).join("")}`;
}

function saveTrackerManualLog() {
  const tracker = systemsData.trackers.find(t => t.id === manualLogTrackerId);
  if (!tracker) return;
  const value = document.getElementById("manualLogValue")?.value.trim();
  if (value === "" || isNaN(Number(value))) {
    alert("Enter a numeric value.");
    return;
  }
  const date = document.getElementById("manualLogDate")?.value || getTodayISO();
  const unit = document.getElementById("manualLogUnit")?.value.trim() || tracker.unit || "";
  const notes = document.getElementById("manualLogNotes")?.value.trim() || "";
  const habitId = document.getElementById("manualLogLinkedHabit")?.value || "";
  const blockId = document.getElementById("manualLogPlannerBlock")?.value || "";
  const block = blockId ? scheduleData.blocks.find(b => b.id === blockId) : null;
  systemsData.logs.push({
    id: createId("log"),
    title: tracker.name,
    type: tracker.category || "Custom",
    valueType: tracker.category || "Custom",
    value,
    unit,
    date,
    notes: notes || "Manual tracker log",
    linkedHabitId: habitId,
    linkedItemType: "tracker",
    linkedMetricId: "",
    linkedTrackerId: tracker.id,
    linkedGoalId: tracker.linkedGoalId || getPlannerBlockGoalId(block) || "",
    linkedPlannerBlockId: blockId,
    linkedRoutineId: tracker.linkedRoutineId || block?.linkedRoutineId || block?.routineId || "",
    linkedObjectiveId: tracker.linkedObjectiveId || getPlannerBlockObjectiveId(block) || "",
    logSource: "manual",
    plannerAutoLogKey: "",
    inactive: false
  });
  rememberTrackerUnit(unit);
  recalcTrackerCurrentFromLogs(tracker);
  manualLogTrackerId = null;
  activeSystemsForm = null;
  saveSystemsData();
  activeSystemsSection = "Trackers";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function openTrackerManualLog(trackerId) {
  openSystemsForm("trackerLog", trackerId);
}

function renderGoalFormFields() {
  return `
    <p class="form-section-label">Core Fields</p>
    <input id="goalName" placeholder="Goal name">
    <select id="goalType">
      <option>Increase toward target</option>
      <option>Decrease toward target</option>
      <option>Do not exceed limit</option>
      <option>Stay within range</option>
      <option>Habit-based</option>
      <option>Taper</option>
    </select>
    <select id="goalCategory">
      <option>Study</option>
      <option>Savings</option>
      <option>Fitness</option>
      <option>Sleep</option>
      <option>Reading</option>
      <option>Calories</option>
      <option>Work</option>
      <option>Personal</option>
      <option>Taper</option>
      <option>Custom</option>
    </select>
    <div class="habit-meta-row">
      <input id="goalStartValue" type="number" placeholder="Start amount / minimum">
      <input id="goalCurrentValue" type="number" placeholder="Current amount / used">
    </div>
    <div class="habit-meta-row">
      <input id="goalTargetValue" type="number" placeholder="Target amount / limit / maximum">
      ${renderUnitComboInput("goalUnit")}
    </div>
    ${renderSharedUnitDatalist()}
    <div class="habit-meta-row">
      <input id="goalStartDate" type="date" placeholder="Start date">
      <input id="goalDeadline" type="date" placeholder="Deadline">
    </div>
    <textarea id="goalMilestones" placeholder="Milestones, one per line"></textarea>
    <textarea id="goalNotes" placeholder="Notes"></textarea>
    
    <details class="advanced-options link-options">
      <summary>Advanced Options & Links</summary>
      <p class="form-section-label">Behavior</p>
      <select id="goalResetCycle">
        <option value="daily">Reset cycle: daily</option>
        <option value="weekly">Reset cycle: weekly</option>
        <option value="monthly">Reset cycle: monthly</option>
      </select>
      <input id="goalRecurringTarget" placeholder="Recurring target (optional)">
      
      <p class="form-section-label">Links</p>
      <label class="muted-text small">Linked tracker</label>
      <select id="goalLinkedTracker">
        <option value="">No linked tracker</option>
        ${systemsData.trackers.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join("")}
      </select>
      <label class="muted-text small">Linked habit</label>
      <select id="goalLinkedHabit">
        <option value="">No linked habit</option>
        ${systemsData.habits.map(h => `<option value="${h.id}">${escapeHTML(h.name)}</option>`).join("")}
      </select>
      <label class="muted-text small">Linked routine</label>
      <select id="goalLinkedRoutine">${renderLinkOptions(scheduleData.routines, "", "No linked routine")}</select>
      <label class="muted-text small">Linked planner block</label>
      <select id="goalLinkedPlanner">${renderLinkOptions(scheduleData.blocks.filter(b => !b.isBuffer), "", "No linked planner block")}</select>
      <label class="muted-text small">Linked objective</label>
      <select id="goalLinkedObjective">${renderLinkOptions(systemsData.objectives, "", "No linked objective")}</select>
    </details>
    
    <button id="goalSaveButton" onclick="saveGoal()">${editingGoalIndex === null ? "Save Goal" : "Update Goal"}</button>
    <button class="secondary-btn" onclick="closeSystemsForm()">Cancel</button>
  `;
}

function createObjectiveRecord(overrides = {}) {
  return {
    id: overrides.id || createId("objective"),
    title: overrides.title || "",
    type: overrides.type || "Task",
    status: overrides.status || "Not started",
    priority: overrides.priority || "Medium",
    dueDate: overrides.dueDate || getTodayISO(),
    dueTime: overrides.dueTime || "",
    estimatedMinutes: overrides.estimatedMinutes || "",
    category: overrides.category || "",
    tags: overrides.tags || "",
    notes: overrides.notes || "",
    linkedPlannerBlockId: overrides.linkedPlannerBlockId || "",
    linkedRoutineId: overrides.linkedRoutineId || "",
    linkedHabitId: overrides.linkedHabitId || "",
    linkedTrackerId: overrides.linkedTrackerId || "",
    linkedGoalId: overrides.linkedGoalId || "",
    trackerLogAmount: overrides.trackerLogAmount || "",
    completedDate: overrides.completedDate || "",
    completedAt: overrides.completedAt || "",
    autoCompleteFromPlanner: overrides.autoCompleteFromPlanner !== false,
    autoCompleteFromHabit: overrides.autoCompleteFromHabit !== false,
    focus: Boolean(overrides.focus),
    recurring: overrides.recurring || "",
    subtasks: Array.isArray(overrides.subtasks) ? overrides.subtasks : []
  };
}

function renderObjectiveFormFields() {
  return `
    <p class="form-section-label">Core Fields</p>
    <input id="objectiveTitle" placeholder="Task / objective title">
    <div class="habit-meta-row">
      <select id="objectiveType">
        <option value="">Type</option>
        ${getObjectiveTypes().map(t => `<option value="${escapeHTML(t)}" ${t === (editingObjective?.type || "") ? "selected" : ""}>${escapeHTML(t)}</option>`).join("")}
      </select>
      <select id="objectivePriority">
        <option>Priority</option>
        <option>High</option>
        <option>Medium</option>
        <option>Low</option>
      </select>
    </div>
    <div class="habit-meta-row">
      <input id="objectiveDueDate" type="date" placeholder="Due date">
      <input id="objectiveDueTime" type="time" placeholder="Due time">
    </div>
    <input id="objectiveCategory" placeholder="System/category">
    <input id="objectiveEstimatedMinutes" type="number" min="0" step="5" placeholder="Estimated minutes">
    <textarea id="objectiveNotes" placeholder="Notes"></textarea>
    
    <details class="advanced-options link-options">
      <summary>Advanced Links & Automation</summary>
      <label class="muted-text small">Linked planner block</label>
      <select id="objectiveLinkedPlanner">${renderLinkOptions(scheduleData.blocks.filter(b => !b.isBuffer), "", "No linked planner block")}</select>
      <label class="muted-text small">Linked routine</label>
      <select id="objectiveLinkedRoutine">${renderLinkOptions(scheduleData.routines, "", "No linked routine")}</select>
      <label class="muted-text small">Linked habit</label>
      <select id="objectiveLinkedHabit">${renderLinkOptions(systemsData.habits, "", "No linked habit")}</select>
      <label class="muted-text small">Linked tracker</label>
      <select id="objectiveLinkedTracker">${renderLinkOptions(systemsData.trackers, "", "No linked tracker")}</select>
      <label class="muted-text small">Linked goal</label>
      <select id="objectiveLinkedGoal">${renderLinkOptions(systemsData.goals, "", "No linked goal")}</select>
      
      <p class="form-section-label">Automation</p>
      <input id="objectiveTrackerLogAmount" type="number" step="any" placeholder="Tracker amount on completion">
      <label class="inline-check"><input type="checkbox" id="objectiveAutoPlanner" checked> Complete when planner block is completed</label>
      <label class="inline-check"><input type="checkbox" id="objectiveAutoHabit" checked> Complete when linked habit is completed</label>
    </details>
    
    <button id="objectiveSaveButton" onclick="saveObjectiveFromModal()">${editingObjectiveIndex === null ? "Save Objective" : "Update Objective"}</button>
    <button class="secondary-btn" onclick="closeSystemsForm()">Cancel</button>
  `;
}

function saveObjectiveFromModal() {
  const title = document.getElementById("objectiveTitle")?.value.trim() || "";
  if (!title) {
    alert("Add an objective title.");
    return;
  }
  const prev = editingObjectiveIndex !== null ? systemsData.objectives[editingObjectiveIndex] : null;
  const objective = createObjectiveRecord({
    ...(prev || {}),
    id: prev?.id || createId("objective"),
    title,
    type: document.getElementById("objectiveType")?.value || "Task",
    priority: document.getElementById("objectivePriority")?.value || "Medium",
    dueDate: document.getElementById("objectiveDueDate")?.value || "",
    dueTime: document.getElementById("objectiveDueTime")?.value || "",
    estimatedMinutes: document.getElementById("objectiveEstimatedMinutes")?.value || "",
    category: document.getElementById("objectiveCategory")?.value.trim() || "",
    notes: document.getElementById("objectiveNotes")?.value.trim() || "",
    linkedPlannerBlockId: document.getElementById("objectiveLinkedPlanner")?.value || "",
    linkedRoutineId: document.getElementById("objectiveLinkedRoutine")?.value || "",
    linkedHabitId: document.getElementById("objectiveLinkedHabit")?.value || "",
    linkedTrackerId: document.getElementById("objectiveLinkedTracker")?.value || "",
    linkedGoalId: document.getElementById("objectiveLinkedGoal")?.value || "",
    trackerLogAmount: document.getElementById("objectiveTrackerLogAmount")?.value || "",
    autoCompleteFromPlanner: document.getElementById("objectiveAutoPlanner")?.checked !== false,
    autoCompleteFromHabit: document.getElementById("objectiveAutoHabit")?.checked !== false
  });
  if (editingObjectiveIndex === null) systemsData.objectives.push(objective);
  else systemsData.objectives[editingObjectiveIndex] = objective;
  editingObjectiveIndex = null;
  activeSystemsForm = null;
  saveSystemsData();
  activeSystemsSection = "Objectives";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function fillEditingObjectiveForm() {
  if (editingObjectiveIndex === null || !document.getElementById("objectiveTitle")) return;
  const objective = systemsData.objectives[editingObjectiveIndex];
  if (!objective) return;
  document.getElementById("objectiveTitle").value = objective.title || "";
  document.getElementById("objectiveType").value = objective.type || "Task";
  document.getElementById("objectivePriority").value = objective.priority || "Medium";
  document.getElementById("objectiveDueDate").value = objective.dueDate || "";
  document.getElementById("objectiveDueTime").value = objective.dueTime || "";
  document.getElementById("objectiveCategory").value = objective.category || "";
  document.getElementById("objectiveEstimatedMinutes").value = objective.estimatedMinutes || "";
  document.getElementById("objectiveLinkedPlanner").value = objective.linkedPlannerBlockId || "";
  document.getElementById("objectiveLinkedRoutine").value = objective.linkedRoutineId || "";
  document.getElementById("objectiveLinkedHabit").value = objective.linkedHabitId || "";
  document.getElementById("objectiveLinkedTracker").value = objective.linkedTrackerId || "";
  document.getElementById("objectiveLinkedGoal").value = objective.linkedGoalId || "";
  document.getElementById("objectiveTrackerLogAmount").value = objective.trackerLogAmount || "";
  document.getElementById("objectiveAutoPlanner").checked = objective.autoCompleteFromPlanner !== false;
  document.getElementById("objectiveAutoHabit").checked = objective.autoCompleteFromHabit !== false;
  document.getElementById("objectiveNotes").value = objective.notes || "";
}

function editObjective(index) {
  openSystemsForm("objective", index);
}

function deleteObjective(index) {
  if (!confirm("Delete this objective?")) return;
  systemsData.objectives.splice(index, 1);
  saveSystemsData();
  renderSystems();
  renderHome();
}

function renderSystemsObjectives() {
  const box = document.getElementById("systemsObjectives");
  if (!box) return;
  const list = [...systemsData.objectives].sort((a, b) => getObjectiveRank(a) - getObjectiveRank(b));
  box.innerHTML = list.length
    ? `<div class="systems-card-grid">${list.map(objective => {
      const index = systemsData.objectives.findIndex(item => item.id === objective.id);
      return `
        <div class="system-item objective-system-card">
          ${renderObjectiveCard(objective)}
          ${renderConnectionBadges({
            plannerBlockId: objective.linkedPlannerBlockId,
            routineId: objective.linkedRoutineId,
            habitId: objective.linkedHabitId,
            trackerId: objective.linkedTrackerId,
            goalId: objective.linkedGoalId
          })}
          <div class="button-row">
            <button class="secondary-btn" onclick="editObjective(${index})">Edit Links</button>
            <button class="danger-btn" onclick="deleteObjective(${index})">Delete</button>
          </div>
        </div>
      `;
    }).join("")}</div>`
    : `<div class="empty-state"><p>No objectives yet.</p><button onclick="openSystemsForm('objective')">Add first objective</button></div>`;
}

function openSystemsForm(kind, index = null) {
  systemsAddMenuOpen = false;
  activeSystemsForm = kind;
  editingHabitIndex = kind === "habit" ? index : null;
  editingMetricIndex = null;
  editingGoalIndex = kind === "goal" ? index : null;
  editingTrackerIndex = kind === "tracker" ? index : null;
  editingLogIndex = kind === "log" ? index : null;
  editingObjectiveIndex = kind === "objective" ? index : null;
  manualLogTrackerId = kind === "trackerLog" ? index : null;
  if (kind === "habit") activeSystemsSection = "Habits";
  if (kind === "log" || kind === "tracker" || kind === "goal" || kind === "trackerLog") activeSystemsSection = "Trackers";
  if (kind === "objective") activeSystemsSection = "Objectives";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
  fillDefaultLogDate();
  fillEditingManualLogForm();
  const firstInput = document.querySelector("#systemsModal input, #systemsModal select, #systemsModal textarea");
  firstInput?.focus();
}

function openSystemsFormForSection() {
  const map = {
    Overview: "habit",
    Habits: "habit",
    Trackers: "tracker",
    Objectives: "objective",
    Activity: "log"
  };
  openSystemsForm(map[activeSystemsSection] || "habit");
}

function openSystemsAddMenu() {
  systemsAddMenuOpen = !systemsAddMenuOpen;
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function renderSystemsAddMenu() {
  return `
    <div class="planner-modal-backdrop" onclick="closeSystemsAddMenuFromBackdrop(event)">
      <div class="planner-sheet systems-sheet systems-add-menu" role="dialog" aria-modal="true">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <h3>Add to Systems</h3>
          <button class="icon-btn" onclick="closeSystemsAddMenu()">x</button>
        </div>
        <div class="add-options-grid">
          <button class="add-option-card" onclick="openSystemsForm('habit'); closeSystemsAddMenu();">
            <div class="add-option-icon">✓</div>
            <div class="add-option-content">
              <strong>Add Habit</strong>
              <span class="add-option-desc">Track daily streaks and consistency</span>
            </div>
          </button>
          <button class="add-option-card" onclick="openSystemsForm('tracker'); closeSystemsAddMenu();">
            <div class="add-option-icon">📊</div>
            <div class="add-option-content">
              <strong>Add Tracker</strong>
              <span class="add-option-desc">Monitor goals, metrics, and progress</span>
            </div>
          </button>
          <button class="add-option-card" onclick="openSystemsForm('objective'); closeSystemsAddMenu();">
            <div class="add-option-icon">🎯</div>
            <div class="add-option-content">
              <strong>Add Objective</strong>
              <span class="add-option-desc">Actionable tasks with due dates</span>
            </div>
          </button>
          <button class="add-option-card" onclick="openSystemsForm('log'); closeSystemsAddMenu();">
            <div class="add-option-icon">📝</div>
            <div class="add-option-content">
              <strong>Add Log</strong>
              <span class="add-option-desc">Quick note or manual entry</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  `;
}

function closeSystemsAddMenu() {
  systemsAddMenuOpen = false;
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function closeSystemsAddMenuFromBackdrop(event) {
  if (event.target && event.target.classList.contains("planner-modal-backdrop")) closeSystemsAddMenu();
}

function closeSystemsForm() {
  activeSystemsForm = null;
  systemsAddMenuOpen = false;
  editingHabitIndex = null;
  editingTrackerIndex = null;
  editingGoalIndex = null;
  editingObjectiveIndex = null;
  editingMetricIndex = null;
  editingLogIndex = null;
  manualLogTrackerId = null;
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function closeSystemsFormFromBackdrop(event) {
  if (event.target && event.target.id === "systemsModal") closeSystemsForm();
}

function renderSystems() {
  seedTrackerPresetsFromTrackers();
  fillEditingHabitForm();
  fillEditingTrackerForm();
  fillEditingGoalForm();
  fillEditingObjectiveForm();
  renderSystemsSummaryChips();
  renderSystemsDashboard();
  renderSystemsObjectives();
  renderActivityFeed();
  renderHabitsList();
  renderTrackersSummaryCards();
  renderTrackersUnifiedList();
  fillDefaultLogDate();
  updateLogLinkedItemOptions();
  fillEditingLogForm();
  fillEditingManualLogForm();
}

function saveHabit() {
  const name = document.getElementById("habitName").value.trim();
  if (!name) return;
  const unit = document.getElementById("habitUnit")?.value.trim() || "";

  const completionType = document.querySelector('input[name="habitCompletionType"]:checked')?.value || "checkbox";
  const linkedGoalId = document.getElementById("habitLinkedGoalIdNew")?.value || document.getElementById("habitLinkedGoalId")?.value || "";

  const habit = {
    id: editingHabitIndex === null ? createId("habit") : systemsData.habits[editingHabitIndex].id,
    name,
    category: document.getElementById("habitCategory").value,
    type: document.getElementById("habitType").value || "Daily",
    frequency: document.getElementById("habitFrequency").value,
    targetFrequency: document.getElementById("habitTargetFrequency")?.value || document.getElementById("habitFrequency").value,
    target: document.getElementById("habitTarget").value.trim(),
    unit: document.getElementById("habitUnit")?.value || "",
    linkedGoalId,
    unit,
    linkedGoalId: document.getElementById("habitLinkedGoalId")?.value || "",
    linkedTrackerId: document.getElementById("habitLinkedTrackerId")?.value || "",
    linkedRoutineId: document.getElementById("habitLinkedRoutineId")?.value || "",
    linkedPlannerBlockId: document.getElementById("habitLinkedPlannerBlockId")?.value || "",
    autoLogTrackerOnComplete: Boolean(document.getElementById("habitAutoLogTracker")?.checked),
    trackerLogAmount: document.getElementById("habitTrackerLogAmount")?.value || "",
    notes: document.getElementById("habitNotes").value.trim(),
    completions: editingHabitIndex === null ? [] : systemsData.habits[editingHabitIndex].completions,
    skippedDates: editingHabitIndex === null ? [] : (systemsData.habits[editingHabitIndex].skippedDates || []),
    completionHistory: editingHabitIndex === null ? [] : (systemsData.habits[editingHabitIndex].completionHistory || []),
    paused: editingHabitIndex === null ? false : Boolean(systemsData.habits[editingHabitIndex].paused),
    // Amount-based completion fields
    completionType,
    dailyTargetAmount: document.getElementById("habitDailyTargetAmount")?.value || "",
    weeklyTargetAmount: document.getElementById("habitWeeklyTargetAmount")?.value || "",
    autoLogToTracker: document.getElementById("habitAutoLogToTracker")?.checked !== false
  };

  if (editingHabitIndex === null) {
    systemsData.habits.push(habit);
  } else {
    systemsData.habits[editingHabitIndex] = habit;
  }

  rememberTrackerUnit(unit);
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
  const habitGoalElNew = document.getElementById("habitLinkedGoalIdNew");
  if (habitGoalElNew) habitGoalElNew.value = habit.linkedGoalId || "";
  if (document.getElementById("habitLinkedTrackerId")) document.getElementById("habitLinkedTrackerId").value = habit.linkedTrackerId || "";
  if (document.getElementById("habitLinkedRoutineId")) document.getElementById("habitLinkedRoutineId").value = habit.linkedRoutineId || "";
  if (document.getElementById("habitLinkedPlannerBlockId")) document.getElementById("habitLinkedPlannerBlockId").value = habit.linkedPlannerBlockId || "";
  if (document.getElementById("habitAutoLogTracker")) document.getElementById("habitAutoLogTracker").checked = Boolean(habit.autoLogTrackerOnComplete);
  if (document.getElementById("habitTrackerLogAmount")) document.getElementById("habitTrackerLogAmount").value = habit.trackerLogAmount || "";
  document.getElementById("habitNotes").value = habit.notes;
  document.getElementById("habitSaveButton").textContent = "Update Habit";
  
  // Fill completion type fields
  const completionType = habit.completionType || "checkbox";
  const radioCheckbox = document.querySelector('input[name="habitCompletionType"][value="checkbox"]');
  const radioAmount = document.querySelector('input[name="habitCompletionType"][value="amount"]');
  if (radioCheckbox && radioAmount) {
    radioCheckbox.checked = completionType === "checkbox";
    radioAmount.checked = completionType === "amount";
    toggleHabitTargetFields();
  }
  
  const dailyTargetEl = document.getElementById("habitDailyTargetAmount");
  if (dailyTargetEl) dailyTargetEl.value = habit.dailyTargetAmount || "";
  const weeklyTargetEl = document.getElementById("habitWeeklyTargetAmount");
  if (weeklyTargetEl) weeklyTargetEl.value = habit.weeklyTargetAmount || "";
  const autoLogEl = document.getElementById("habitAutoLogToTracker");
  if (autoLogEl) autoLogEl.checked = habit.autoLogToTracker !== false;
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
      valueType: "Boolean",
      value: "1",
      unit: "completion",
      date: today,
      notes: "Completed habit",
      linkedHabitId: habit.id,
      linkedItemType: "habit",
      linkedMetricId: "",
      linkedTrackerId: "",
      linkedGoalId: "",
      linkedPlannerBlockId: "",
      logSource: "habit",
      plannerAutoLogKey: "",
      inactive: false
    });
  }

  systemsData.trackers
    .filter(t => t.linkedHabitId === habit.id || (habit.autoLogTrackerOnComplete && habit.linkedTrackerId === t.id))
    .forEach(tracker => {
      const dup = systemsData.logs.some(log =>
        log.linkedTrackerId === tracker.id && log.date === today && log.notes === "Habit auto"
      );
      if (dup) return;
      systemsData.logs.push({
        id: createId("log"),
        title: tracker.name,
        type: tracker.category || "Custom",
        valueType: tracker.category || "Custom",
        value: habit.trackerLogAmount || tracker.autoLogAmount || "1",
        unit: tracker.unit || "count",
        date: today,
        notes: "Habit auto",
        linkedHabitId: habit.id,
        linkedItemType: "tracker",
        linkedMetricId: "",
        linkedTrackerId: tracker.id,
        linkedGoalId: "",
        linkedPlannerBlockId: "",
        linkedRoutineId: habit.linkedRoutineId || "",
        linkedObjectiveId: "",
        logSource: "habit",
        plannerAutoLogKey: "",
        inactive: false
      });
      recalcTrackerCurrentFromLogs(tracker);
    });

  autoCompleteObjectivesForHabit(habit);
  saveSystemsData();
  renderSystems();
}

// Habit Completion Modal Functions
function openHabitCompleteModal(index) {
  const habit = systemsData.habits[index];
  if (!habit || habit.paused) return;
  
  habitCompleteModalIndex = index;
  const today = getTodayISO();
  const todayProgress = getHabitTodayProgress(habit);
  const dailyTarget = Number(habit.dailyTargetAmount) || 0;
  const weeklyProgress = getHabitWeeklyProgress(habit);
  const weeklyTarget = Number(habit.weeklyTargetAmount) || 0;
  
  const modalHTML = `
    <div id="habitCompleteModal" class="modal-backdrop" onclick="closeHabitCompleteModalFromBackdrop(event)">
      <div class="habit-complete-modal" role="dialog" aria-modal="true">
        <div class="sheet-handle"></div>
        <div class="habit-complete-header">
          <h3>Log Progress</h3>
          <button class="icon-btn" onclick="closeHabitCompleteModal()">x</button>
        </div>
        <p style="margin-bottom:12px;color:var(--text-muted);font-size:14px">${escapeHTML(habit.name)}</p>
        
        ${dailyTarget > 0 ? `
          <div class="habit-today-progress">
            <p>Today: <strong>${todayProgress} / ${dailyTarget} ${escapeHTML(habit.unit || "")}</strong></p>
            <div class="tracker-progress-bar">
              <div class="tracker-progress-fill" style="width:${Math.min(100, (todayProgress / dailyTarget) * 100)}%"></div>
            </div>
          </div>
        ` : ""}
        
        ${weeklyTarget > 0 ? `
          <div class="habit-today-progress" style="margin-top:8px">
            <p>This week: <strong>${weeklyProgress} / ${weeklyTarget} ${escapeHTML(habit.unit || "")}</strong></p>
            <div class="tracker-progress-bar">
              <div class="tracker-progress-fill" style="width:${Math.min(100, (weeklyProgress / weeklyTarget) * 100)}%"></div>
            </div>
          </div>
        ` : ""}
        
        <div class="habit-complete-form">
          <div class="habit-complete-row">
            <div>
              <label>Amount</label>
              <input type="number" id="habitCompleteAmount" value="1" min="0" step="0.5" placeholder="Amount">
            </div>
            <div>
              <label>Unit</label>
              <input type="text" id="habitCompleteUnit" value="${escapeHTML(habit.unit || "")}" placeholder="Unit">
            </div>
          </div>
          <div>
            <label>Date</label>
            <input type="date" id="habitCompleteDate" value="${today}">
          </div>
          <div>
            <label>Notes (optional)</label>
            <textarea id="habitCompleteNotes" placeholder="Add any notes..." rows="2"></textarea>
          </div>
          <div class="habit-complete-actions">
            <button class="secondary-btn" onclick="closeHabitCompleteModal()">Cancel</button>
            <button onclick="saveHabitCompletion()">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to page
  const modalContainer = document.createElement("div");
  modalContainer.id = "habitCompleteModalContainer";
  modalContainer.innerHTML = modalHTML;
  document.body.appendChild(modalContainer);
  
  // Focus the amount input
  setTimeout(() => {
    const amountInput = document.getElementById("habitCompleteAmount");
    if (amountInput) amountInput.focus();
  }, 100);
}

function closeHabitCompleteModal() {
  habitCompleteModalIndex = null;
  const container = document.getElementById("habitCompleteModalContainer");
  if (container) container.remove();
}

function closeHabitCompleteModalFromBackdrop(event) {
  if (event.target && event.target.id === "habitCompleteModal") {
    closeHabitCompleteModal();
  }
}

function saveHabitCompletion() {
  if (habitCompleteModalIndex === null) return;
  
  const habit = systemsData.habits[habitCompleteModalIndex];
  if (!habit) {
    closeHabitCompleteModal();
    return;
  }
  
  const amount = document.getElementById("habitCompleteAmount")?.value || "1";
  const unit = document.getElementById("habitCompleteUnit")?.value || habit.unit || "";
  const date = document.getElementById("habitCompleteDate")?.value || getTodayISO();
  const notes = document.getElementById("habitCompleteNotes")?.value.trim() || "";
  
  const amountNum = Number(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    alert("Please enter a valid amount greater than 0.");
    return;
  }
  
  // Add habit log entry with amount
  systemsData.logs.push({
    id: createId("log"),
    title: habit.name,
    type: "Habit",
    valueType: "Number",
    value: String(amountNum),
    unit: unit,
    date: date,
    notes: notes || `Logged ${amountNum} ${unit}`,
    linkedHabitId: habit.id,
    linkedItemType: "habit",
    linkedMetricId: "",
    linkedTrackerId: "",
    linkedGoalId: habit.linkedGoalId || "",
    linkedPlannerBlockId: "",
    logSource: "habit",
    plannerAutoLogKey: "",
    inactive: false
  });

  // Log to All Zip Data when habit is completed
  logToAllZipData({
    id: habit.id + "_" + date,
    date: date,
    source: "Systems",
    category: habit.category || "",
    type: "habit",
    name: habit.name || "",
    amount: String(amountNum),
    unit: unit,
    startTime: "",
    endTime: "",
    durationMinutes: "",
    status: "completed",
    notes: notes || "",
    linkedGoalId: habit.linkedGoalId || "",
    linkedHabitId: "",
    linkedPlannerBlockId: habit.linkedPlannerBlockId || "",
    createdAt: habit.createdAt || ""
  });

  // Update habit completion history
  if (!Array.isArray(habit.completionHistory)) habit.completionHistory = [];
  habit.completionHistory.push({
    date: date,
    time: new Date().toTimeString().slice(0, 5),
    amount: amountNum,
    unit: unit,
    notes: notes
  });
  
  // Check if daily target is met to mark as complete for the day
  const dailyTarget = Number(habit.dailyTargetAmount) || 0;
  const todayProgress = getHabitTodayProgress(habit);
  
  if (dailyTarget > 0 && todayProgress >= dailyTarget && date === getTodayISO()) {
    if (!habit.completions.includes(date)) {
      habit.completions.push(date);
    }
  } else if (dailyTarget === 0 && !habit.completions.includes(date)) {
    // For habits without daily target, any log counts as completion
    habit.completions.push(date);
  }
  
  // Remove from skipped if was skipped
  habit.skippedDates = (habit.skippedDates || []).filter(d => d !== date);
  
  // Auto-log to linked trackers if enabled
  if (habit.autoLogToTracker !== false) {
    systemsData.trackers
      .filter(t => t.linkedHabitId === habit.id)
      .forEach(tracker => {
        systemsData.logs.push({
          id: createId("log"),
          title: tracker.name,
          type: tracker.category || "Custom",
          valueType: "Number",
          value: String(amountNum),
          unit: unit || tracker.unit || "count",
          date: date,
          notes: "Habit auto",
          linkedHabitId: habit.id,
          linkedItemType: "tracker",
          linkedMetricId: "",
          linkedTrackerId: tracker.id,
          linkedGoalId: "",
          linkedPlannerBlockId: "",
          logSource: "habit",
          plannerAutoLogKey: "",
          inactive: false
        });
        recalcTrackerCurrentFromLogs(tracker);
      });
  }
  
  autoCompleteObjectivesForHabit(habit);
  saveSystemsData();
  closeHabitCompleteModal();
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
  const value = document.getElementById("logValue").value.trim();
  const linkedItemId = document.getElementById("logLinkedItemId")?.value || "";
  const tracker = systemsData.trackers.find(t => t.id === linkedItemId);
  const title = tracker?.name || document.getElementById("logTitle").value.trim();
  const unit = document.getElementById("logUnit").value.trim() || tracker?.unit || "";
  const date = document.getElementById("logDate").value || getTodayISO();
  const linkedPlannerBlockId = document.getElementById("logLinkedPlannerBlockId")?.value || "";
  const linkedBlock = linkedPlannerBlockId ? scheduleData.blocks.find(block => block.id === linkedPlannerBlockId) : null;
  if (!linkedItemId || !value) {
    alert("Choose a tracker and enter an amount.");
    return;
  }
  const prev = editingLogIndex !== null ? systemsData.logs[editingLogIndex] : null;

  const payload = {
    title,
    type: tracker?.category || document.getElementById("logType").value || "Custom",
    valueType: tracker?.category || document.getElementById("logType").value || "Custom",
    value,
    unit,
    date,
    notes: document.getElementById("logNotes").value.trim(),
    linkedItemType: "tracker",
    linkedHabitId: tracker?.linkedHabitId || "",
    linkedMetricId: "",
    linkedTrackerId: linkedItemId,
    linkedGoalId: tracker?.linkedGoalId || getPlannerBlockGoalId(linkedBlock) || "",
    linkedPlannerBlockId,
    linkedRoutineId: tracker?.linkedRoutineId || linkedBlock?.linkedRoutineId || linkedBlock?.routineId || "",
    linkedObjectiveId: tracker?.linkedObjectiveId || getPlannerBlockObjectiveId(linkedBlock) || "",
    logSource: prev?.logSource ?? "manual",
    plannerAutoLogKey: prev?.plannerAutoLogKey ?? "",
    inactive: Boolean(prev?.inactive)
  };

  let log;
  if (editingLogIndex !== null) {
    const id = systemsData.logs[editingLogIndex].id;
    systemsData.logs[editingLogIndex] = { ...systemsData.logs[editingLogIndex], ...payload, id };
    log = systemsData.logs[editingLogIndex];
  } else {
    log = { id: createId("log"), ...payload };
    systemsData.logs.push(log);
  }

  // Log to All Zip Data when manual metric is logged
  logToAllZipData({
    id: log.id,
    date: log.date,
    source: log.logSource || "manual",
    category: log.type || "",
    type: "log",
    name: log.title || "",
    amount: log.value || "",
    unit: log.unit || "",
    startTime: "",
    endTime: "",
    durationMinutes: "",
    status: "",
    notes: log.notes || "",
    linkedGoalId: log.linkedGoalId || "",
    linkedHabitId: log.linkedHabitId || "",
    linkedPlannerBlockId: log.linkedPlannerBlockId || "",
    createdAt: log.createdAt || ""
  });

  syncLinkedItemsFromLog(log);
  recalcAllTrackerCurrentsFromLogs();
  rememberTrackerUnit(unit);

  editingLogIndex = null;
  activeSystemsForm = null;
  saveSystemsData();
  activeSystemsSection = "Trackers";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function updateLogLinkedItemOptions() {
  syncLogFieldsFromTracker();
}

function syncLogFieldsFromTracker() {
  const trackerId = document.getElementById("logLinkedItemId")?.value || "";
  const tracker = systemsData.trackers.find(t => t.id === trackerId);
  if (!tracker) return;
  const title = document.getElementById("logTitle");
  const type = document.getElementById("logType");
  const unit = document.getElementById("logUnit");
  if (title) title.value = tracker.name || "";
  if (type) type.value = tracker.category || "Custom";
  if (unit && !unit.value) unit.value = tracker.unit || "";
}

function isWeightRelated(item) {
  return /weight|weigh|lb|lbs|pound|fat|cut|loss|lose/i.test(`${item.name || ""} ${item.category || ""} ${item.unit || ""} ${item.notes || ""}`);
}

function isTaperRelated(item) {
  return /taper|reduce|reduction|decrease|cut/i.test(`${item.name || ""} ${item.category || ""} ${item.goalType || ""} ${item.unit || ""} ${item.notes || ""}`);
}

function getLogLinkedTrackerId(log) {
  return log.linkedTrackerId || log.trackerId || log.linkedMetricId || "";
}

function inferResetTypeFromRecurringText(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return "No reset";
  if (/\bdaily\b|each day|every day/.test(t)) return "Daily";
  if (/\bweekly\b|each week|every week|per week|\/week/.test(t)) return "Weekly";
  if (/\bmonthly\b|each month|every month|per month|\/month/.test(t)) return "Monthly";
  if (/\bmilestone\b/.test(t)) return "Milestone-based";
  if (t.trim().length) return "Custom recurring";
  return "No reset";
}

function mapLegacyMetricTypeToCategory(metricType) {
  const t = metricType || "Counter";
  if (t === "Counter") return "Counter";
  if (t === "Boolean") return "Habit-linked";
  if (t === "Time") return "Goal";
  if (t === "Milestone") return "Milestone";
  if (/taper/i.test(t)) return "Taper";
  if (/weight|body/i.test(t)) return "Body Metric";
  return "Custom";
}

function inferTrackerDirection(category, startVal, targetVal) {
  const s = Number(startVal);
  const e = Number(targetVal);
  if (!isNaN(s) && !isNaN(e) && e < s) return "decrease";
  if (category === "Taper") return "decrease";
  return "increase";
}

function inferLogValueMode(category, legacyMetricType) {
  if (legacyMetricType === "Counter" || legacyMetricType === "Time") return "increment";
  if (category === "Counter" || category === "Goal") return "increment";
  return "absolute";
}

function legacyTrackerTypeToCategory(oldType) {
  const t = oldType || "Custom";
  if (t === "Weight") return "Body Metric";
  if (t === "Taper") return "Taper";
  if (t === "Spending" || t === "Finance") return "Finance";
  return "Custom";
}

function normalizeUnifiedTrackerRecord(tracker) {
  const rawCat = String(tracker.category || legacyTrackerTypeToCategory(tracker.type) || "").trim() || "Custom";
  const category = rawCat;
  const startValue = tracker.startValue ?? "";
  const targetValue = tracker.targetValue ?? "";
  const direction = tracker.direction || inferTrackerDirection(category, startValue, targetValue);
  return {
    id: tracker.id || createId("tracker"),
    name: tracker.name || "",
    category,
    type: tracker.type || "", // System type field for backward compatibility
    unit: tracker.unit || "",
    startValue,
    currentValue: tracker.currentValue ?? "0",
    targetValue,
    resetType: TRACKER_RESET_TYPES.includes(tracker.resetType) ? tracker.resetType : inferResetTypeFromRecurringText(tracker.resetCustomNote || tracker.recurringTarget),
    resetCustomNote: tracker.resetCustomNote || tracker.recurringTarget || "",
    startDate: tracker.startDate || "",
    targetDate: tracker.targetDate || tracker.deadline || "",
    linkedHabitId: tracker.linkedHabitId || "",
    linkedGoalId: tracker.linkedGoalId || "",
    linkedRoutineId: tracker.linkedRoutineId || "",
    linkedPlannerBlockId: tracker.linkedPlannerBlockId || "",
    linkedObjectiveId: tracker.linkedObjectiveId || "",
    notes: tracker.notes || "",
    direction,
    logValueMode: tracker.logValueMode === "increment" || tracker.logValueMode === "absolute"
      ? tracker.logValueMode
      : inferLogValueMode(category, tracker.legacyMetricType || ""),
    legacyMetricType: tracker.legacyMetricType || "",
    autoLogOnPlannerComplete: Boolean(tracker.autoLogOnPlannerComplete),
    autoLogAmount: tracker.autoLogAmount !== undefined && tracker.autoLogAmount !== null ? String(tracker.autoLogAmount) : "1",
    autoLogUnit: tracker.autoLogUnit !== undefined && tracker.autoLogUnit !== null ? String(tracker.autoLogUnit) : "",
    preventDuplicateAutoLogs: tracker.preventDuplicateAutoLogs !== false,
    archived: Boolean(tracker.archived),
    legacyGoalId: tracker.legacyGoalId || "",
    milestones: Array.isArray(tracker.milestones) ? tracker.milestones.map(milestone => ({
      id: milestone.id || createId("milestone"),
      title: milestone.title || "",
      completed: Boolean(milestone.completed)
    })) : []
  };
}

function mapGoalResetCycleToTrackerReset(resetCycle) {
  if (resetCycle === "daily") return "Daily";
  if (resetCycle === "weekly") return "Weekly";
  if (resetCycle === "monthly") return "Monthly";
  return inferResetTypeFromRecurringText(resetCycle);
}

function mapGoalTypeToTrackerDirection(goal) {
  if (goal.goalType === "Decrease toward target" || goal.goalType === "Taper") return "decrease";
  return inferTrackerDirection(goal.category, goal.startValue, goal.targetValue);
}

function migrateSystemsToUnifiedTrackers() {
  const hadUnifiedFlag = Boolean(systemsData._trackersUnifiedV1);
  const metrics = systemsData.metrics || [];
  const oldTrackers = systemsData.trackers || [];
  const trackerIds = new Set();
  systemsData.trackers.forEach(t => trackerIds.add(t.id));

  function migrateGoalsIntoTrackers() {
    if (systemsData._goalsAsTrackersV1) return false;
    let changed = false;
    systemsData.goals.forEach(goal => {
      if (!goal?.id) return;
      const existing = goal.linkedTrackerId
        ? systemsData.trackers.find(t => t.id === goal.linkedTrackerId)
        : systemsData.trackers.find(t => t.legacyGoalId === goal.id);
      if (existing) {
        existing.targetValue = existing.targetValue || goal.targetValue || "";
        existing.milestones = existing.milestones?.length ? existing.milestones : (goal.milestones || []);
        existing.legacyGoalId = goal.id;
        trackerIds.add(existing.id);
        changed = true;
        return;
      }
      const tracker = normalizeUnifiedTrackerRecord({
        id: createId("tracker"),
        name: goal.name,
        category: goal.category || "Goal",
        unit: goal.unit,
        startValue: goal.startValue ?? "",
        currentValue: goal.currentValue ?? "0",
        targetValue: goal.targetValue ?? "",
        resetType: mapGoalResetCycleToTrackerReset(goal.resetCycle),
        resetCustomNote: goal.recurringTarget || "",
        startDate: goal.startDate || "",
        targetDate: goal.deadline || "",
        linkedHabitId: goal.linkedHabitId || "",
        notes: goal.notes || "",
        direction: mapGoalTypeToTrackerDirection(goal),
        logValueMode: goal.goalType === "Do not exceed limit" ? "increment" : "absolute",
        legacyGoalId: goal.id,
        milestones: goal.milestones || []
      });
      systemsData.trackers.push(tracker);
      trackerIds.add(tracker.id);
      systemsData.logs.forEach(log => {
        if (log.linkedGoalId === goal.id) {
          log.linkedTrackerId = tracker.id;
          log.linkedItemType = "tracker";
        }
      });
      changed = true;
    });
    systemsData._goalsAsTrackersV1 = true;
    return changed;
  }

  let migratedGoals = false;

  if (hadUnifiedFlag && !metrics.length) {
    migratedGoals = migrateGoalsIntoTrackers();
    recalcAllTrackerCurrentsFromLogs();
    if (migratedGoals) saveSystemsData();
    return;
  }

  function pushTracker(t) {
    if (!t.id) t.id = createId("tracker");
    if (trackerIds.has(t.id)) return;
    trackerIds.add(t.id);
    systemsData.trackers.push(normalizeUnifiedTrackerRecord(t));
  }

  if (!hadUnifiedFlag) {
    systemsData.trackers = [];
    metrics.forEach(metric => {
      const category = mapLegacyMetricTypeToCategory(metric.type);
      const direction = inferTrackerDirection(category, metric.startValue, metric.targetValue);
      const logValueMode = inferLogValueMode(category, metric.type);
      const resetType = inferResetTypeFromRecurringText(metric.recurringTarget);
      pushTracker({
        id: metric.id,
        name: metric.name,
        category,
        unit: metric.unit,
        startValue: metric.startValue ?? "",
        currentValue: metric.currentValue ?? "0",
        targetValue: metric.targetValue ?? "",
        resetType,
        resetCustomNote: metric.recurringTarget || "",
        startDate: metric.startDate || "",
        targetDate: metric.deadline || "",
        linkedHabitId: metric.linkedHabitId || "",
        notes: metric.notes || "",
        direction,
        logValueMode,
        legacyMetricType: metric.type || ""
      });
      (metric.entries || []).forEach(entry => {
        if (entry.logId) {
          const log = systemsData.logs.find(l => l.id === entry.logId);
          if (log) {
            log.linkedTrackerId = metric.id;
            if (!log.linkedItemType) log.linkedItemType = "tracker";
          }
          return;
        }
        if (entry.value === undefined || entry.value === "") return;
        systemsData.logs.push({
          id: createId("log"),
          title: metric.name,
          type: metric.type || "Custom",
          valueType: metric.type || "Custom",
          value: String(entry.value),
          unit: metric.unit || "",
          date: entry.date || getTodayISO(),
          notes: "Imported from metric history",
          linkedHabitId: "",
          linkedItemType: "tracker",
          linkedMetricId: "",
          linkedTrackerId: metric.id,
          linkedGoalId: "",
          linkedPlannerBlockId: "",
          logSource: "manual",
          plannerAutoLogKey: "",
          inactive: false
        });
      });
    });

    oldTrackers.forEach(tracker => {
      if (trackerIds.has(tracker.id)) return;
      const category = legacyTrackerTypeToCategory(tracker.type);
      pushTracker({
        id: tracker.id,
        name: tracker.name,
        category,
        unit: tracker.unit || "",
        startValue: tracker.startValue ?? "",
        currentValue: tracker.currentValue ?? "",
        targetValue: tracker.targetValue ?? "",
        resetType: inferResetTypeFromRecurringText(tracker.recurringTarget),
        resetCustomNote: tracker.recurringTarget || "",
        startDate: tracker.startDate || "",
        targetDate: tracker.targetDate || "",
        linkedHabitId: "",
        notes: tracker.notes || "",
        direction: inferTrackerDirection(category, tracker.startValue, tracker.targetValue),
        logValueMode: inferLogValueMode(category, "")
      });
    });
  } else if (metrics.length) {
    systemsData.trackers.forEach(t => trackerIds.add(t.id));
    metrics.forEach(metric => {
      if (systemsData.trackers.some(t => t.id === metric.id)) return;
      const category = mapLegacyMetricTypeToCategory(metric.type);
      pushTracker({
        id: metric.id,
        name: metric.name,
        category,
        unit: metric.unit,
        startValue: metric.startValue ?? "",
        currentValue: metric.currentValue ?? "0",
        targetValue: metric.targetValue ?? "",
        resetType: inferResetTypeFromRecurringText(metric.recurringTarget),
        resetCustomNote: metric.recurringTarget || "",
        startDate: metric.startDate || "",
        targetDate: metric.deadline || "",
        linkedHabitId: metric.linkedHabitId || "",
        notes: metric.notes || "",
        direction: inferTrackerDirection(category, metric.startValue, metric.targetValue),
        logValueMode: inferLogValueMode(category, metric.type),
        legacyMetricType: metric.type || ""
      });
      (metric.entries || []).forEach(entry => {
        if (entry.logId) {
          const log = systemsData.logs.find(l => l.id === entry.logId);
          if (log) log.linkedTrackerId = metric.id;
          return;
        }
        if (entry.value === undefined || entry.value === "") return;
        systemsData.logs.push({
          id: createId("log"),
          title: metric.name,
          type: metric.type || "Custom",
          valueType: metric.type || "Custom",
          value: String(entry.value),
          unit: metric.unit || "",
          date: entry.date || getTodayISO(),
          notes: "Imported from metric history",
          linkedHabitId: "",
          linkedItemType: "tracker",
          linkedMetricId: "",
          linkedTrackerId: metric.id,
          linkedGoalId: "",
          linkedPlannerBlockId: "",
          logSource: "manual",
          plannerAutoLogKey: "",
          inactive: false
        });
      });
    });
  }

  migratedGoals = migrateGoalsIntoTrackers();

  systemsData.metrics = [];
  systemsData.logs.forEach(log => {
    const tid = log.linkedMetricId || log.trackerId;
    if (tid && !log.linkedTrackerId) log.linkedTrackerId = tid;
    if (log.linkedTrackerId && (!log.linkedItemType || log.linkedItemType === "metric")) {
      log.linkedItemType = "tracker";
    }
  });
  systemsData._trackersUnifiedV1 = true;
  recalcAllTrackerCurrentsFromLogs();
  saveSystemsData();
}

function logDateInTrackerWindow(tracker, logDate, anchorDate) {
  if (!logDate) return false;
  if (tracker.resetType === "No reset" || tracker.resetType === "Milestone-based" || tracker.resetType === "Custom recurring") {
    return true;
  }
  if (tracker.resetType === "Daily") return logDate === anchorDate;
  if (tracker.resetType === "Weekly") return getWeekKey(logDate) === getWeekKey(anchorDate);
  if (tracker.resetType === "Monthly") return logDate.slice(0, 7) === anchorDate.slice(0, 7);
  return true;
}

function getSortedLogsForTracker(trackerId) {
  return systemsData.logs
    .filter(log => !log.inactive && getLogLinkedTrackerId(log) === trackerId)
    .sort((a, b) => {
      const da = a.date || "";
      const db = b.date || "";
      if (da !== db) return da.localeCompare(db);
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
}

function recalcTrackerCurrentFromLogs(tracker, anchorDate = getTodayISO()) {
  const logs = getSortedLogsForTracker(tracker.id).filter(log =>
    !isNaN(getLogNumber(log)) && logDateInTrackerWindow(tracker, log.date || "", anchorDate)
  );
  const start = Number(tracker.startValue) || 0;
  const target = Number(tracker.targetValue);
  const direction = tracker.direction || "increase";
  const logValueMode = tracker.logValueMode || "increment";
  
  if (logValueMode === "increment") {
    if (logs.length) {
      const sum = logs.reduce((acc, log) => acc + getLogNumber(log), 0);
      tracker.currentValue = String(start + sum);
    } else {
      tracker.currentValue = String(start);
    }
  } else {
    if (logs.length) {
      tracker.currentValue = String(getLogNumber(logs[logs.length - 1]));
    } else {
      tracker.currentValue = String(start);
    }
  }
  
  // Calculate progress percent
  const current = Number(tracker.currentValue) || 0;
  if (!isNaN(target) && target !== start) {
    if (direction === "decrease") {
      // Taper/decrease: progress = (start - current) / (start - target)
      const totalToReduce = start - target;
      const reducedSoFar = start - current;
      tracker.progressPercent = Math.max(0, Math.min(100, (reducedSoFar / totalToReduce) * 100));
    } else {
      // Normal increase: progress = (current - start) / (target - start)
      const totalToIncrease = target - start;
      const increasedSoFar = current - start;
      tracker.progressPercent = Math.max(0, Math.min(100, (increasedSoFar / totalToIncrease) * 100));
    }
  } else {
    tracker.progressPercent = 0;
  }
  
  // Check for milestone completions
  checkMilestoneCompletion(tracker);
}

function recalcAllTrackerCurrentsFromLogs() {
  const anchor = getTodayISO();
  systemsData.trackers.forEach(tracker => recalcTrackerCurrentFromLogs(tracker, anchor));
}

function syncLinkedItemsFromLog(log) {
  const numericValue = getLogNumber(log);
  const trackerId = getLogLinkedTrackerId(log);
  if (trackerId) {
    const tracker = systemsData.trackers.find(item => item.id === trackerId);
    if (tracker) recalcTrackerCurrentFromLogs(tracker);
  }

  if (!isNaN(numericValue) && log.linkedGoalId) {
    const goal = systemsData.goals.find(item => item.id === log.linkedGoalId);
    if (goal) {
      if (goal.goalType === "Do not exceed limit") {
        const cycleLogs = getLogsForGoalResetCycle(goal, log)
          .filter(item => item.id !== log.id)
          .map(getLogNumber)
          .filter(value => !isNaN(value));
        goal.currentValue = String(cycleLogs.reduce((sum, value) => sum + value, numericValue));
      } else {
        goal.currentValue = String(numericValue);
      }
    }
  }

  if (!trackerId && !log.linkedGoalId && !isNaN(numericValue)) {
    const normalizedTitle = (log.title || "").trim().toLowerCase();
    const tracker = systemsData.trackers.find(item =>
      item.name.trim().toLowerCase() === normalizedTitle ||
      (log.linkedHabitId && item.linkedHabitId === log.linkedHabitId)
    );
    if (!tracker) return;
    log.linkedTrackerId = tracker.id;
    log.linkedItemType = "tracker";
    recalcTrackerCurrentFromLogs(tracker);
  }
}

function deleteSystemLog(index) {
  systemsData.logs.splice(index, 1);
  recalcAllTrackerCurrentsFromLogs();
  saveSystemsData();
  renderSystems();
}

function getLogsForGoalResetCycle(goal, referenceLog) {
  const referenceDate = referenceLog.date || getTodayISO();
  return systemsData.logs.filter(log => {
    if (log.inactive) return false;
    if (log.linkedGoalId !== goal.id) return false;
    const logDate = log.date || "";
    if (!logDate) return false;
    if (goal.resetCycle === "daily") return logDate === referenceDate;
    if (goal.resetCycle === "monthly") return logDate.slice(0, 7) === referenceDate.slice(0, 7);
    return getWeekKey(logDate) === getWeekKey(referenceDate);
  });
}

function getWeekKey(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

function fillDefaultLogDate() {
  const input = document.getElementById("logDate");
  if (input && !input.value) input.value = getTodayISO();
}

function renderSystemsDashboard() {
  const box = document.getElementById("systemsDashboard");
  if (!box) return;
  const today = getTodayISO();
  const weekDates = getLastNDates(7);
  
  const activeHabits = systemsData.habits.filter(habit => !habit.paused);
  const completedToday = activeHabits.filter(habit => habit.completions.includes(today)).length;
  const activeTrackers = systemsData.trackers.filter(t => !isTrackerComplete(t)).length;
  const overdueObjectives = systemsData.objectives.filter(obj => !isObjectiveDone(obj) && obj.dueDate && obj.dueDate < today).length;
  const logsThisWeek = systemsData.logs.filter(log => weekDates.includes(log.date)).length;
  
  const buckets = getSystemBuckets();
  
  if (!buckets.length || (systemsData.habits.length === 0 && systemsData.trackers.length === 0 && systemsData.objectives.length === 0)) {
    box.innerHTML = `
      <div class="empty-state">
        <p>No systems data yet</p>
        <button onclick="openSystemsForm('habit')">Add first habit</button>
        <button class="secondary-btn" onclick="openSystemsForm('tracker')">Create tracker</button>
        <button class="secondary-btn" onclick="openSystemsForm('log')">Log something</button>
      </div>
    `;
    return;
  }
  
  box.innerHTML = `
    <div class="category-cards-grid">
      ${buckets.map(systemName => {
        const matches = item => `${item.category || ""} ${item.type || ""} ${item.name || ""} ${item.title || ""}`.toLowerCase().includes(systemName.toLowerCase());
        const habits = systemsData.habits.filter(matches);
        const trackers = systemsData.trackers.filter(matches);
        const objectives = systemsData.objectives.filter(matches);
        const overdue = objectives.filter(obj => !isObjectiveDone(obj) && obj.dueDate && obj.dueDate < today).length;
        const bestStreak = habits.reduce((best, habit) => Math.max(best, getHabitStreak(habit)), 0);
        const plannedMinutes = getPlannerMinutesForSystem(systemName);
        
        return `
          <div class="category-card">
            <div class="category-card-header">
              <span class="category-name">${escapeHTML(systemName)}</span>
              <span class="category-time">${formatMinutes(plannedMinutes)}</span>
            </div>
            <div class="category-card-stats">
              <div class="category-stat">
                <span class="stat-value">${habits.length}</span>
                <span class="stat-label">habits</span>
              </div>
              <div class="category-stat">
                <span class="stat-value">${trackers.length}</span>
                <span class="stat-label">trackers</span>
              </div>
              <div class="category-stat">
                <span class="stat-value">${objectives.length}</span>
                <span class="stat-label">objectives</span>
              </div>
            </div>
            <div class="category-card-footer">
              <span class="category-streak">Best streak: ${bestStreak}</span>
              <span class="category-overdue ${overdue > 0 ? 'overdue' : ''}">Overdue: ${overdue}</span>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderSystemsSummaryChips() {
  const box = document.getElementById("systemsSummaryChips");
  if (!box) return;
  const today = getTodayISO();
  const weekDates = getLastNDates(7);
  
  const activeHabits = systemsData.habits.filter(habit => !habit.paused);
  const completedToday = activeHabits.filter(habit => habit.completions.includes(today)).length;
  const activeTrackers = systemsData.trackers.filter(t => !isTrackerComplete(t)).length;
  const overdueObjectives = systemsData.objectives.filter(obj => !isObjectiveDone(obj) && obj.dueDate && obj.dueDate < today).length;
  const logsThisWeek = systemsData.logs.filter(log => weekDates.includes(log.date)).length;
  
  box.innerHTML = `
    <div class="summary-chip">
      <span class="chip-value">${completedToday}</span>
      <span class="chip-label">Habits done today</span>
    </div>
    <div class="summary-chip">
      <span class="chip-value">${activeTrackers}</span>
      <span class="chip-label">Active trackers</span>
    </div>
    <div class="summary-chip ${overdueObjectives > 0 ? 'chip-warning' : ''}">
      <span class="chip-value">${overdueObjectives}</span>
      <span class="chip-label">Objectives overdue</span>
    </div>
    <div class="summary-chip">
      <span class="chip-value">${logsThisWeek}</span>
      <span class="chip-label">Logs this week</span>
    </div>
  `;
}

function getSystemBuckets() {
  const preferred = ["Fitness", "School", "Finance", "MMA", "Sleep", "Social", "Career"];
  const found = new Set(preferred);
  [...systemsData.habits, ...systemsData.trackers, ...systemsData.goals, ...systemsData.objectives, ...scheduleData.routines]
    .forEach(item => {
      const category = item.category || item.type;
      if (category) found.add(category);
    });
  return [...found].filter(Boolean).slice(0, 12);
}

function getPlannerMinutesForSystem(systemName) {
  const weekDates = new Set(getLastNDates(7));
  return scheduleData.blocks
    .filter(block => !block.isBuffer && weekDates.has(block.date))
    .filter(block => {
      const text = `${block.category || ""} ${block.title || ""}`.toLowerCase();
      return text.includes(systemName.toLowerCase());
    })
    .reduce((sum, block) => sum + Math.max(timeToMinutes(block.end || "00:00") - timeToMinutes(block.start || "00:00"), 0), 0);
}

function renderSystemEcosystemCards() {
  const today = getTodayISO();
  return `
    <div class="system-ecosystem-grid">
      ${getSystemBuckets().map(systemName => {
        const matches = item => `${item.category || ""} ${item.type || ""} ${item.name || ""} ${item.title || ""}`.toLowerCase().includes(systemName.toLowerCase());
        const habits = systemsData.habits.filter(matches);
        const trackers = systemsData.trackers.filter(matches);
        const goals = systemsData.goals.filter(matches);
        const routines = scheduleData.routines.filter(matches);
        const overdue = systemsData.objectives.filter(objective => matches(objective) && !isObjectiveDone(objective) && objective.dueDate && objective.dueDate < today);
        const bestStreak = habits.reduce((best, habit) => Math.max(best, getHabitStreak(habit)), 0);
        return `
          <div class="ecosystem-card">
            <div class="ecosystem-card-head">
              <strong>${escapeHTML(systemName)}</strong>
              <span>${formatMinutes(getPlannerMinutesForSystem(systemName))}</span>
            </div>
            <div class="ecosystem-counts">
              <span>${habits.length} habits</span>
              <span>${trackers.length} trackers</span>
              <span>${goals.length} goals</span>
              <span>${routines.length} routines</span>
            </div>
            <p class="muted-text">${bestStreak} best streak • ${overdue.length} overdue objectives</p>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function getUnifiedActivityFeed(limit = 40) {
  const habitEvents = systemsData.habits.flatMap(habit =>
    (habit.completionHistory || []).map(entry => ({
      date: entry.date || "",
      time: entry.time || "",
      type: "Habit",
      title: habit.name,
      detail: getHabitStreak(habit) ? `${getHabitStreak(habit)} day streak` : "Completed",
      links: { habitId: habit.id, plannerBlockId: entry.plannerBlockId || "" }
    }))
  );
  const blockEvents = scheduleData.blocks
    .filter(block => block.completed && !block.isBuffer)
    .map(block => ({
      date: block.date || "",
      time: block.end || block.start || "",
      type: "Planner",
      title: block.title || "Completed block",
      detail: `${block.start || ""}-${block.end || ""}`,
      links: {
        routineId: block.linkedRoutineId || block.routineId,
        habitId: getPlannerBlockHabitId(block),
        trackerId: getPlannerBlockTrackerId(block),
        goalId: getPlannerBlockGoalId(block),
        objectiveId: getPlannerBlockObjectiveId(block)
      }
    }));
  const logEvents = systemsData.logs
    .filter(log => !log.inactive)
    .map(log => ({
      date: log.date || "",
      time: "",
      type: "Tracker",
      title: log.title || log.type || "Log",
      detail: `${log.value || ""} ${log.unit || ""}`.trim(),
      links: {
        habitId: log.linkedHabitId,
        trackerId: getLogLinkedTrackerId(log),
        goalId: log.linkedGoalId,
        plannerBlockId: log.linkedPlannerBlockId,
        routineId: log.linkedRoutineId,
        objectiveId: log.linkedObjectiveId
      }
    }));
  const objectiveEvents = systemsData.objectives
    .filter(objective => objective.status === "Complete")
    .map(objective => ({
      date: objective.completedDate || objective.dueDate || "",
      time: objective.completedAt || "",
      type: "Objective",
      title: objective.title,
      detail: objective.priority || "Complete",
      links: {
        plannerBlockId: objective.linkedPlannerBlockId,
        routineId: objective.linkedRoutineId,
        habitId: objective.linkedHabitId,
        trackerId: objective.linkedTrackerId,
        goalId: objective.linkedGoalId,
        objectiveId: objective.id
      }
    }));
  return [...habitEvents, ...blockEvents, ...logEvents, ...objectiveEvents]
    .filter(event => event.date)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .slice(0, limit);
}

function renderActivityFeed() {
  const box = document.getElementById("activityFeed");
  if (!box) return;
  const events = getUnifiedActivityFeed();
  const isOverview = box.closest('.activity-feed-card') !== null;
  
  if (!events.length) {
    box.innerHTML = `<div class="empty-state small"><p>No activity yet.</p><button onclick="openSystemsForm('log')">Add first log</button></div>`;
    return;
  }
  
  if (isOverview) {
    // Overview: limit to 8 items with date grouping
    const limitedEvents = events.slice(0, 8);
    const groupedEvents = groupEventsByDate(limitedEvents);
    
    box.innerHTML = `
      <div class="activity-feed-list">
        ${limitedEvents.map(event => `
          <div class="activity-feed-item">
            <span class="activity-icon">${getActivityIcon(event.type)}</span>
            <div class="activity-content">
              <strong>${escapeHTML(event.title)}</strong>
              <span class="activity-meta">${escapeHTML(event.type)}${event.detail ? ` • ${escapeHTML(event.detail)}` : ""}</span>
            </div>
            <span class="activity-time">${escapeHTML(event.date === getTodayISO() ? "" : event.date + " ")}${escapeHTML(event.time || "")}</span>
          </div>
        `).join("")}
      </div>
      <button class="secondary-btn" onclick="activeSystemsSection='Activity'; main.innerHTML=getPageHTML('Systems'); renderSystems();" style="width:100%;margin-top:12px">View all activity</button>
    `;
  } else {
    // Activity tab: show all events
    box.innerHTML = `<div class="activity-feed-list">${events.map(event => `
      <div class="activity-feed-item">
        <span class="activity-dot"></span>
        <div>
          <div class="activity-feed-head">
            <strong>${escapeHTML(event.title)}</strong>
            <span>${escapeHTML(event.date)} ${escapeHTML(event.time || "")}</span>
          </div>
          <p>${escapeHTML(event.type)}${event.detail ? ` • ${escapeHTML(event.detail)}` : ""}</p>
          ${renderConnectionBadges(event.links)}
        </div>
      </div>
    `).join("")}</div>`;
  }
}

function groupEventsByDate(events) {
  const today = getTodayISO();
  const yesterday = getDateOffset(today, -1);
  const groups = {};
  
  events.forEach(event => {
    let dateLabel = event.date;
    if (event.date === today) {
      dateLabel = "Today";
    } else if (event.date === yesterday) {
      dateLabel = "Yesterday";
    } else {
      const date = new Date(`${event.date}T00:00:00`);
      dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    
    if (!groups[dateLabel]) groups[dateLabel] = [];
    groups[dateLabel].push(event);
  });
  
  return groups;
}

function getActivityIcon(type) {
  const icons = {
    'Habit': '✓',
    'Objective': '🎯',
    'Tracker': '📊',
    'Planner': '📅',
    'Streak': '🔥',
    'Log': '📝'
  };
  return icons[type] || '•';
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

function renderHabitsList() {
  const box = document.getElementById("habitsList");
  if (!box) return;
  const isOverview = box.closest('.today-habits-card') !== null;
  const today = getTodayISO();

  if (!systemsData.habits.length) {
    box.innerHTML = `<div class="empty-state"><p>No habits saved yet.</p><button onclick="openSystemsForm('habit')">Add first habit</button></div>`;
    return;
  }

  if (isOverview) {
    // Overview: compact habit cards with key metrics
    box.innerHTML = `<div class="habits-overview-list">${systemsData.habits.map((habit, index) => {
      const doneToday = habit.completions.includes(today);
      const skippedToday = (habit.skippedDates || []).includes(today);
      const pct = getHabitCompletionPct(habit, 30);
      const weekly = getHabitWeeklyConsistency(habit);
      const streak = getHabitStreak(habit);
      const skipCount = getHabitSkippedCount(habit, 30);
      const isAmountBased = habit.completionType === "amount";
      const todayProgress = getHabitTodayProgress(habit);
      const dailyTarget = Number(habit.dailyTargetAmount) || 0;
      const hasMetDailyTarget = dailyTarget > 0 && todayProgress >= dailyTarget;
      
      const buttonLabel = isAmountBased 
        ? (hasMetDailyTarget ? "Done" : "Log") 
        : (doneToday ? "Done" : "Complete");
      const buttonAction = isAmountBased 
        ? `openHabitCompleteModal(${index})` 
        : `completeHabitToday(${index})`;
      const buttonDisabled = habit.paused || (!isAmountBased && doneToday);
      
      return `
        <div class="habit-compact-card ${doneToday ? 'completed' : ''} ${habit.paused ? 'paused' : ''}">
          <div class="habit-compact-header">
            <span class="habit-category-pill">${escapeHTML(habit.category || "General")}</span>
            <span class="habit-frequency-pill">${escapeHTML(habit.frequency)}</span>
            ${streak > 0 ? `<span class="habit-streak-badge">🔥 ${streak}</span>` : ""}
          </div>
          <div class="habit-compact-title">
            <strong>${escapeHTML(habit.name)}</strong>
            ${isAmountBased && dailyTarget > 0 ? `<span class="habit-progress">${todayProgress}/${dailyTarget} ${escapeHTML(habit.unit || "")}</span>` : ""}
          </div>
          <div class="habit-compact-stats">
            <span class="habit-stat">${pct}% 30d</span>
            <span class="habit-stat">${weekly}% week</span>
            <span class="habit-stat">${skipCount} skips</span>
          </div>
          ${renderHabitMiniHeatmap(habit)}
          <div class="habit-compact-actions habit-action-grid">
            <button class="habit-action-btn primary" onclick="${buttonAction}" ${buttonDisabled ? "disabled" : ""}>${buttonLabel}</button>
            <button class="habit-action-btn" onclick="skipHabitToday(${index})" ${habit.paused || skippedToday ? "disabled" : ""}>Skip</button>
            <button class="habit-action-btn" onclick="scheduleHabitInPlanner(${index})">Plan</button>
            <button class="habit-action-btn" onclick="toggleHabitPaused(${index})">${habit.paused ? "Resume" : "Pause"}</button>
            <button class="habit-action-btn" onclick="editHabit(${index})">Edit</button>
            <button class="habit-action-btn danger" onclick="deleteHabit(${index})">Delete</button>
          </div>
        </div>
      `;
    }).join("")}</div>`;
  } else {
    // Habits tab: full cards with details
    box.innerHTML = `<div class="systems-card-grid">${systemsData.habits.map((habit, index) => {
      const doneToday = habit.completions.includes(today);
      const skippedToday = (habit.skippedDates || []).includes(today);
      const pct = getHabitCompletionPct(habit, 30);
      const weekly = getHabitWeeklyConsistency(habit);
      const isAmountBased = habit.completionType === "amount";
      const todayProgress = getHabitTodayProgress(habit);
      const dailyTarget = Number(habit.dailyTargetAmount) || 0;
      const hasMetDailyTarget = dailyTarget > 0 && todayProgress >= dailyTarget;
      
      const buttonLabel = isAmountBased 
        ? (hasMetDailyTarget ? "Done" : "Log Progress") 
        : (doneToday ? "Done" : "Complete");
      const buttonAction = isAmountBased 
        ? `openHabitCompleteModal(${index})` 
        : `completeHabitToday(${index})`;
      const buttonDisabled = habit.paused || (!isAmountBased && doneToday);
      
      return `
        <div class="system-item habit-card ${habit.paused ? "paused" : ""}">
          <div class="item-title">
            <strong>${escapeHTML(habit.name)}</strong>
            <span class="streak-badge">${getHabitStreak(habit)} streak</span>
          </div>
          <div class="habit-pill-row">
            <span class="metric-type-pill metric-type-progress">${escapeHTML(habit.category || "No category")}</span>
            <span class="metric-type-pill metric-type-milestone">${escapeHTML(habit.type || "Daily")}</span>
            <span class="metric-type-pill">${escapeHTML(habit.targetFrequency || habit.frequency)}</span>
            ${isAmountBased ? `<span class="metric-type-pill">Amount</span>` : ""}
            ${habit.paused ? `<span class="metric-type-pill metric-type-milestone">Paused</span>` : ""}
          </div>
          ${isAmountBased && dailyTarget > 0 ? `
            <div class="habit-today-progress">
              <p>Today: <strong>${todayProgress} / ${dailyTarget} ${escapeHTML(habit.unit || "")}</strong></p>
              <div class="tracker-progress-bar">
                <div class="tracker-progress-fill" style="width:${Math.min(100, (todayProgress / dailyTarget) * 100)}%"></div>
              </div>
            </div>
          ` : ""}
          ${renderConnectionBadges({
            plannerBlockId: habit.linkedPlannerBlockId,
            routineId: habit.linkedRoutineId,
            trackerId: habit.linkedTrackerId,
            goalId: habit.linkedGoalId
          })}
          <div class="habit-stat-row">
            <div><strong>${pct}%</strong><span>30-day completion</span></div>
            <div><strong>${weekly}%</strong><span>weekly consistency</span></div>
            <div><strong>${getHabitSkippedCount(habit, 30)}</strong><span>skips</span></div>
          </div>
          ${renderHabitHeatmap(habit)}
          ${habit.target ? `<p>${escapeHTML(habit.target)} ${escapeHTML(habit.unit || "")}</p>` : ""}
          ${habit.notes ? `<p>${escapeHTML(habit.notes)}</p>` : ""}
          <div class="button-row three-actions">
            <button onclick="${buttonAction}" ${buttonDisabled ? "disabled" : ""}>${buttonLabel}</button>
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
    }).join("")}</div>`;
  }
}

function renderHabitMiniHeatmap(habit) {
  const days = 14;
  const today = getTodayISO();
  let html = '<div class="habit-mini-heatmap">';
  
  for (let i = days - 1; i >= 0; i--) {
    const date = getDateOffset(today, -i);
    const completed = habit.completions.includes(date);
    const skipped = habit.skippedDates.includes(date);
    const isToday = i === 0;
    
    let dotClass = 'heatmap-dot';
    if (completed) dotClass += ' completed';
    else if (skipped) dotClass += ' skipped';
    else dotClass += ' empty';
    if (isToday) dotClass += ' today';
    
    html += `<span class="${dotClass}"></span>`;
  }
  
  html += '</div>';
  return html;
}

function getHabitTodayProgress(habit) {
  const today = getTodayISO();
  const todayLogs = systemsData.logs.filter(log => 
    log.linkedHabitId === habit.id && 
    log.date === today && 
    log.type === "Habit"
  );
  return todayLogs.reduce((sum, log) => sum + (Number(log.value) || 0), 0);
}

function getHabitWeeklyProgress(habit) {
  const today = new Date(getTodayISO());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const startISO = startOfWeek.toISOString().slice(0, 10);
  
  const weekLogs = systemsData.logs.filter(log => 
    log.linkedHabitId === habit.id && 
    log.date >= startISO && 
    log.date <= getTodayISO() && 
    log.type === "Habit"
  );
  return weekLogs.reduce((sum, log) => sum + (Number(log.value) || 0), 0);
}

function renderSystemsLogsList() {
  const box = document.getElementById("systemsLogsList");
  if (!box) return;
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
  const current = Number(tracker.currentValue);
  const target = Number(tracker.targetValue);
  const start = Number(tracker.startValue);
  if (isNaN(current) || isNaN(target)) return 0;
  const decrease = tracker.direction === "decrease";
  if (decrease) {
    const s = isNaN(start) ? current : start;
    const denom = s - target;
    if (denom === 0) return current <= target ? 100 : 0;
    return Math.min(100, Math.max(0, Math.round(((s - current) / denom) * 100)));
  }
  if (!isNaN(start) && !isNaN(target) && target !== start) {
    return Math.min(100, Math.max(0, Math.round(((current - start) / (target - start)) * 100)));
  }
  if (!target) return 0;
  return Math.min(100, Math.max(0, Math.round((current / target) * 100)));
}

function logTrackerById(id) {
  const tracker = systemsData.trackers.find(t => t.id === id);
  if (!tracker) return;
  const raw = prompt(`Log value for "${tracker.name}" (${tracker.unit || "unit"}):`);
  if (raw === null || raw.trim() === "") return;
  systemsData.logs.push({
    id: createId("log"),
    title: tracker.name,
    type: tracker.category || "Custom",
    valueType: tracker.category || "Custom",
    value: raw.trim(),
    unit: tracker.unit || "",
    date: getTodayISO(),
    notes: "",
    linkedHabitId: "",
    linkedItemType: "tracker",
    linkedMetricId: "",
    linkedTrackerId: tracker.id,
    linkedGoalId: "",
    linkedPlannerBlockId: "",
    logSource: "manual",
    plannerAutoLogKey: "",
    inactive: false
  });
  recalcTrackerCurrentFromLogs(tracker);
  saveSystemsData();
  renderSystems();
}

function quickIncrementTracker(id) {
  const tracker = systemsData.trackers.find(t => t.id === id);
  if (!tracker) return;
  systemsData.logs.push({
    id: createId("log"),
    title: tracker.name,
    type: tracker.category || "Custom",
    valueType: tracker.category || "Custom",
    value: "1",
    unit: tracker.unit || "count",
    date: getTodayISO(),
    notes: "",
    linkedHabitId: "",
    linkedItemType: "tracker",
    linkedMetricId: "",
    linkedTrackerId: tracker.id,
    linkedGoalId: "",
    linkedPlannerBlockId: "",
    logSource: "manual",
    plannerAutoLogKey: "",
    inactive: false
  });
  recalcTrackerCurrentFromLogs(tracker);
  saveSystemsData();
  renderSystems();
}

function deleteTrackerById(id) {
  if (!confirm("Delete this tracker? Logs stay in your history but are unlinked.")) return;
  const idx = systemsData.trackers.findIndex(t => t.id === id);
  if (idx === -1) return;
  if (editingTrackerIndex === idx) editingTrackerIndex = null;
  systemsData.trackers.splice(idx, 1);
  systemsData.logs.forEach(log => {
    if (getLogLinkedTrackerId(log) === id) {
      log.linkedTrackerId = "";
      log.linkedMetricId = "";
      log.trackerId = "";
      if (log.linkedItemType === "tracker") log.linkedItemType = "";
    }
  });
  saveSystemsData();
  renderSystems();
}

function editTrackerLog(index) {
  openSystemsForm("log", index);
}

function resetTrackerForm() {
  editingTrackerIndex = null;
  editingGoalIndex = null;
  activeSystemsSection = "Trackers";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

// ---------------- GOALS ----------------

function saveGoal() {
  const name = document.getElementById("goalName").value.trim();
  const goalType = document.getElementById("goalType")?.value || "Increase toward target";
  const category = document.getElementById("goalCategory").value;
  const startValue = document.getElementById("goalStartValue").value;
  const currentValue = document.getElementById("goalCurrentValue").value;
  const targetValue = document.getElementById("goalTargetValue").value;
  const unit = document.getElementById("goalUnit").value.trim();
  const resetCycle = document.getElementById("goalResetCycle")?.value || "weekly";
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
    name, category, goalType, resetCycle, startValue, currentValue, targetValue,
    unit, startDate, deadline,
    linkedTrackerId, linkedHabitId, recurringTarget, milestones,
    linkedPlannerBlockId: document.getElementById("goalLinkedPlanner")?.value || (editingGoalIndex === null
      ? ""
      : systemsData.goals[editingGoalIndex].linkedPlannerBlockId || ""),
    linkedRoutineId: document.getElementById("goalLinkedRoutine")?.value || "",
    linkedObjectiveId: document.getElementById("goalLinkedObjective")?.value || "",
    notes
  };

  if (editingGoalIndex === null) {
    systemsData.goals.push(goal);
  } else {
    systemsData.goals[editingGoalIndex] = goal;
  }

  rememberTrackerUnit(unit);
  editingGoalIndex = null;
  activeSystemsForm = null;
  saveSystemsData();
  activeSystemsSection = "Trackers";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function resetGoalForm() {
  editingGoalIndex = null;
  editingTrackerIndex = null;
  editingMetricIndex = null;
  activeSystemsSection = "Trackers";
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
  if (document.getElementById("goalType")) document.getElementById("goalType").value = goal.goalType || "Increase toward target";
  document.getElementById("goalCategory").value = goal.category || "Custom";
  document.getElementById("goalStartValue").value = goal.startValue || "";
  document.getElementById("goalCurrentValue").value = goal.currentValue || "";
  document.getElementById("goalTargetValue").value = goal.targetValue || "";
  document.getElementById("goalUnit").value = goal.unit || "";
  const resetCycleEl = document.getElementById("goalResetCycle");
  if (resetCycleEl) resetCycleEl.value = goal.resetCycle || "weekly";
  const recurringEl = document.getElementById("goalRecurringTarget");
  if (recurringEl) recurringEl.value = goal.recurringTarget || "";
  document.getElementById("goalStartDate").value = goal.startDate || "";
  document.getElementById("goalDeadline").value = goal.deadline || "";
  document.getElementById("goalLinkedTracker").value = goal.linkedTrackerId || "";
  document.getElementById("goalLinkedHabit").value = goal.linkedHabitId || "";
  if (document.getElementById("goalLinkedRoutine")) document.getElementById("goalLinkedRoutine").value = goal.linkedRoutineId || "";
  if (document.getElementById("goalLinkedPlanner")) document.getElementById("goalLinkedPlanner").value = goal.linkedPlannerBlockId || "";
  if (document.getElementById("goalLinkedObjective")) document.getElementById("goalLinkedObjective").value = goal.linkedObjectiveId || "";
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

  if (goal.goalType === "Do not exceed limit") {
    if (!target) return 0;
    return Math.max(0, Math.round((current / target) * 100));
  }

  if (goal.goalType === "Stay within range") {
    const min = start;
    const max = target;
    if (min === null || isNaN(min) || isNaN(max) || max <= min) return 0;
    return Math.min(100, Math.max(0, Math.round(((current - min) / (max - min)) * 100)));
  }

  const isDecreasingGoal = goal.goalType === "Decrease toward target" || goal.goalType === "Taper";
  const isDecreasing = start !== null
    ? target < start
    : (isDecreasingGoal || goal.category === "Weight" || goal.category === "Taper") && target < current;

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

function getWeightGoalStats(goal) {
  if (goal.goalType === "Do not exceed limit" || goal.goalType === "Stay within range") return null;
  if (!isWeightRelated(goal)) return null;
  const start = getGoalStartValue(goal);
  const current = getGoalCurrentValue(goal);
  const target = getGoalTargetValue(goal);
  if (start === null || isNaN(current) || isNaN(target) || target >= start) return null;
  const lost = Math.max(0, start - current);
  const remaining = Math.max(0, current - target);
  return { current, lost, remaining };
}

function getDoNotExceedStats(goal) {
  if (goal.goalType !== "Do not exceed limit") return null;
  const used = getGoalCurrentValue(goal);
  const limit = getGoalTargetValue(goal);
  if (isNaN(used) || isNaN(limit)) return null;
  const remaining = Math.max(0, limit - used);
  const overBy = Math.max(0, used - limit);
  const usagePct = limit ? Math.max(0, Math.round((used / limit) * 100)) : 0;
  const status = used > limit ? "Exceeded" : usagePct >= 80 ? "Close" : "On Track";
  return { used, limit, remaining, overBy, usagePct, status };
}

function getRangeGoalStats(goal) {
  if (goal.goalType !== "Stay within range") return null;
  const min = getGoalStartValue(goal);
  const current = getGoalCurrentValue(goal);
  const max = getGoalTargetValue(goal);
  if (min === null || isNaN(current) || isNaN(max)) return null;
  const status = current < min ? "Below Range" : current > max ? "Above Range" : "In Range";
  return { min, current, max, status };
}

function getTaperGoalStats(goal) {
  if (!isTaperRelated(goal)) return null;
  const start = getGoalStartValue(goal);
  const current = getGoalCurrentValue(goal);
  const target = getGoalTargetValue(goal);
  if (start === null || isNaN(current) || isNaN(target) || target >= start) return null;
  const reduced = Math.max(0, start - current);
  const remaining = Math.max(0, current - target);
  const logs = systemsData.logs
    .filter(log => log.linkedGoalId === goal.id || /taper/i.test(log.type || ""))
    .filter(log => !isNaN(getLogNumber(log)))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const latestDate = logs.length ? logs[logs.length - 1].date : "";
  const weeksLeft = goal.deadline
    ? Math.max((new Date(`${goal.deadline}T00:00:00`) - new Date(`${getTodayISO()}T00:00:00`)) / 604800000, 0)
    : 0;
  const pacePerWeek = weeksLeft ? remaining / weeksLeft : null;
  return { start, current, target, reduced, remaining, latestDate, pacePerWeek, logs };
}

function renderTaperTrendHistory(logs, unit) {
  if (!logs.length) return `<p class="muted-text">No taper logs yet.</p>`;
  const values = logs.slice(-10).map(getLogNumber);
  return `
    <div class="taper-history">
      <p class="muted-text">Trend history</p>
      ${renderMiniBars(values)}
      ${logs.slice(-3).reverse().map(log => `
        <div class="home-list-item">
          <strong>${escapeHTML(log.date || "No date")}</strong>
          <p>${escapeHTML(log.value || "")} ${unit}</p>
        </div>
      `).join("")}
    </div>
  `;
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
      systemsData.logs.push({
        id: createId("log"),
        title: goal.name,
        type: goal.category,
        valueType: goal.category || "Custom",
        value,
        unit: goal.unit,
        date: getTodayISO(),
        notes: `Goal: ${goal.name}`,
        linkedHabitId: goal.linkedHabitId || "",
        linkedItemType: "tracker",
        linkedMetricId: "",
        linkedTrackerId: goal.linkedTrackerId,
        linkedGoalId: goal.id,
        linkedPlannerBlockId: "",
        logSource: "manual",
        plannerAutoLogKey: "",
        inactive: false
      });
      recalcTrackerCurrentFromLogs(tracker);
    }
  }
  saveSystemsData();
  renderSystems();
}

function renderGoalsList(elementId = "goalsList") {
  const box = document.getElementById(elementId);
  if (!box) return;

  if (!systemsData.goals.length) {
    box.innerHTML = `<div class="empty-state"><p>No tracker goals yet.</p><button onclick="openSystemsForm('tracker')">Create tracker</button></div>`;
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
        ${renderConnectionBadges({
          plannerBlockId: goal.linkedPlannerBlockId,
          routineId: goal.linkedRoutineId,
          trackerId: goal.linkedTrackerId,
          habitId: goal.linkedHabitId,
          objectiveId: goal.linkedObjectiveId
        })}
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

// ---------------- TRACKERS (unified metrics + logs) ----------------

function getLogSourceDisplay(src) {
  if (src === "habit") return "Habit completion";
  if (src === "planner") return "Planner block completion";
  return "Manual";
}

function rememberTrackerCategory(name) {
  const n = String(name || "").trim();
  if (!n) return;
  const lower = n.toLowerCase();
  if (TRACKER_CATEGORIES.some(c => c.toLowerCase() === lower)) return;
  if (!systemsData.savedTrackerCategories) systemsData.savedTrackerCategories = [];
  if (!systemsData.savedTrackerCategories.some(c => c.toLowerCase() === lower)) {
    systemsData.savedTrackerCategories.push(n);
    saveSystemsData();
  }
}

function rememberTrackerUnit(unit) {
  const u = String(unit || "").trim();
  if (!u) return;
  const lower = u.toLowerCase();
  if (DEFAULT_TRACKER_UNITS.some(x => x.toLowerCase() === lower)) return;
  if (!systemsData.savedTrackerUnits) systemsData.savedTrackerUnits = [];
  if (!systemsData.savedTrackerUnits.some(x => x.toLowerCase() === lower)) {
    systemsData.savedTrackerUnits.push(u);
    saveSystemsData();
  }
}

function getCustomUnitValues() {
  const seen = new Set();
  return (systemsData.savedTrackerUnits || [])
    .map(unit => String(unit || "").trim())
    .filter(unit => {
      if (!unit) return false;
      const key = unit.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return !DEFAULT_TRACKER_UNITS.some(defaultUnit => defaultUnit.toLowerCase() === key);
    });
}

function getAllUnitOptions() {
  const units = getAllUnits();
  const seen = new Set();
  const unique = units.filter(unit => {
    const key = unit.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (systemsData.unitSortMode === "alpha") {
    return unique.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }
  return unique;
}

function buildUnitDatalistInnerHtml() {
  return getAllUnitOptions()
    .map(unit => `<option value="${escapeHTML(unit)}"></option>`)
    .join("");
}

function renderUnitComboInput(id, value = "", placeholder = "Unit", extraAttrs = "") {
  return `
    <input
      id="${escapeHTML(id)}"
      class="unit-combo"
      list="sharedUnitOptions"
      autocomplete="off"
      placeholder="${escapeHTML(placeholder)}"
      value="${escapeHTML(value || "")}"
      onchange="rememberUnitFromInput('${escapeHTML(id)}')"
      ${extraAttrs}
    >
  `;
}

function renderSharedUnitDatalist() {
  return `<datalist id="sharedUnitOptions">${buildUnitDatalistInnerHtml()}</datalist>`;
}

function renderUnitsSettings() {
  const customUnits = getCustomUnitValues();
  const sortMode = systemsData.unitSortMode || "defaults";
  return `
    <div class="card units-settings-card">
      <h3>Units</h3>
      <p class="muted-text">Shared units for trackers, goals, logs, habits, planner auto-logging, and objective progress.</p>
      <div class="unit-settings-row">
        ${renderUnitComboInput("newCustomUnit", "", "Add custom unit")}
        ${renderSharedUnitDatalist()}
        <button onclick="addCustomUnitFromSettings()">Add Unit</button>
      </div>
      <div class="unit-sort-controls">
        <label class="inline-check">
          <input type="radio" name="unitSortMode" value="defaults" ${sortMode !== "alpha" ? "checked" : ""} onchange="setUnitSortMode('defaults')">
          Keep defaults first
        </label>
        <label class="inline-check">
          <input type="radio" name="unitSortMode" value="alpha" ${sortMode === "alpha" ? "checked" : ""} onchange="setUnitSortMode('alpha')">
          Sort alphabetically
        </label>
      </div>
      <div class="unit-chip-list">
        ${customUnits.length ? customUnits.map(unit => `
          <span class="unit-chip">
            ${escapeHTML(unit)}
            <button type="button" aria-label="Delete ${escapeHTML(unit)}" onclick="deleteCustomUnit('${encodeURIComponent(unit)}')">x</button>
          </span>
        `).join("") : `<p class="muted-text small">No custom units yet. Existing saved units are migrated here automatically.</p>`}
      </div>
      <button class="secondary-btn" onclick="restoreDefaultUnits()">Restore Default Units</button>
    </div>
  `;
}

function rememberUnitFromInput(id) {
  const value = document.getElementById(id)?.value || "";
  rememberTrackerUnit(value);
}

function refreshSettingsPage() {
  if (typeof main !== "undefined" && main) {
    main.innerHTML = getPageHTML("Settings");
  }
}

function addCustomUnitFromSettings() {
  const input = document.getElementById("newCustomUnit");
  const value = input ? input.value.trim() : "";
  if (!value) return;
  const before = getAllUnitOptions().length;
  rememberTrackerUnit(value);
  if (getAllUnitOptions().length === before) {
    showToast("That unit already exists.", "error");
  } else {
    showToast("Unit added.");
  }
  refreshSettingsPage();
}

function deleteCustomUnit(unit) {
  const target = decodeURIComponent(String(unit || "")).toLowerCase();
  systemsData.savedTrackerUnits = getCustomUnitValues()
    .filter(item => item.toLowerCase() !== target);
  saveSystemsData();
  refreshSettingsPage();
}

function restoreDefaultUnits() {
  if (!confirm("Restore default units and remove custom unit choices? Existing tracker and log data will keep its saved unit text.")) return;
  systemsData.savedTrackerUnits = [];
  saveSystemsData();
  refreshSettingsPage();
}

function setUnitSortMode(mode) {
  systemsData.unitSortMode = mode === "alpha" ? "alpha" : "defaults";
  saveSystemsData();
  refreshSettingsPage();
}

function rememberUnitsFromValues(values) {
  let changed = false;
  values.forEach(value => {
    const before = (systemsData.savedTrackerUnits || []).length;
    rememberTrackerUnit(value);
    if ((systemsData.savedTrackerUnits || []).length !== before) changed = true;
  });
  return changed;
}

function collectExistingUnitsIntoSettings() {
  const unitValues = [
    ...systemsData.habits.map(item => item.unit),
    ...systemsData.logs.map(item => item.unit),
    ...systemsData.trackers.flatMap(item => [item.unit, item.autoLogUnit]),
    ...systemsData.goals.map(item => item.unit),
    ...systemsData.metrics.map(item => item.unit)
  ];
  const before = JSON.stringify(systemsData.savedTrackerUnits || []);
  unitValues.forEach(unit => {
    const u = String(unit || "").trim();
    if (!u) return;
    const key = u.toLowerCase();
    if (DEFAULT_TRACKER_UNITS.some(defaultUnit => defaultUnit.toLowerCase() === key)) return;
    if (!systemsData.savedTrackerUnits.some(existing => String(existing).toLowerCase() === key)) {
      systemsData.savedTrackerUnits.push(u);
    }
  });
  systemsData.savedTrackerUnits = getCustomUnitValues();
  if (JSON.stringify(systemsData.savedTrackerUnits || []) !== before) saveSystemsData();
}

function buildTrackerCategoryDatalistInnerHtml() {
  const opts = getAllCategories();
  const seen = new Set();
  return opts
    .filter(c => {
      const k = c.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(c => `<option value="${escapeHTML(c)}"></option>`)
    .join("");
}

function buildTrackerUnitDatalistInnerHtml() {
  return buildUnitDatalistInnerHtml();
}

function getTrackerFilterCategoryValues() {
  const set = new Set(["All", ...TRACKER_CATEGORIES]);
  (systemsData.savedTrackerCategories || []).forEach(c => { if (c) set.add(c); });
  systemsData.trackers.forEach(t => { if (t.category) set.add(t.category); });
  const rest = [...set].filter(c => c !== "All").sort((a, b) => a.localeCompare(b));
  return ["All", ...rest];
}

function populateTrackerCategoryFilterMount() {
  const box = document.getElementById("trackerCategoryFilterMount");
  if (!box) return;
  const types = getTrackerTypes();
  box.innerHTML = `
    <label class="inline-check" style="margin:0">
      <span style="margin-right:8px;font-weight:600">Type</span>
      <select id="trackerCategoryFilter" onchange="setTrackerCategoryFilter(this.value)">
        ${types.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("")}
      </select>
    </label>
  `;
  const sel = document.getElementById("trackerCategoryFilter");
  if (sel) sel.value = trackerCategoryFilter;
}

function seedTrackerPresetsFromTrackers() {
  if (!systemsData.savedTrackerCategories) systemsData.savedTrackerCategories = [];
  if (!systemsData.savedTrackerUnits) systemsData.savedTrackerUnits = [];
  systemsData.trackers.forEach(t => {
    if (t.category && !TRACKER_CATEGORIES.includes(t.category)) {
      if (!systemsData.savedTrackerCategories.some(c => c.toLowerCase() === t.category.toLowerCase())) {
        systemsData.savedTrackerCategories.push(t.category);
      }
    }
    [t.unit, t.autoLogUnit].forEach(unit => {
      const u = String(unit || "").trim();
      if (!u) return;
      if (DEFAULT_TRACKER_UNITS.some(defaultUnit => defaultUnit.toLowerCase() === u.toLowerCase())) return;
      if (!systemsData.savedTrackerUnits.some(saved => String(saved).toLowerCase() === u.toLowerCase())) {
        systemsData.savedTrackerUnits.push(u);
      }
    });
  });
}

function autoLogTrackersForPlannerBlock(block) {
  if (!block || block.isBuffer || !block.completed) return;
  const date = block.date || getTodayISO();
  let changed = false;
  const explicitTrackerId = getPlannerBlockTrackerId(block);
  const explicitTracker = explicitTrackerId ? systemsData.trackers.find(t => t.id === explicitTrackerId) : null;
  if (explicitTracker && block.trackerAutoLogMode && block.trackerAutoLogMode !== "none") {
    const key = `${explicitTracker.id}::${block.id}::${date}`;
    const dup = systemsData.logs.some(l =>
      !l.inactive && (l.plannerAutoLogKey === key || (l.logSource === "planner" && getLogLinkedTrackerId(l) === explicitTracker.id && l.linkedPlannerBlockId === block.id && l.date === date))
    );
    if (!dup) {
      const minutes = Math.max(timeToMinutes(block.end || block.start || "00:00") - timeToMinutes(block.start || "00:00"), 0);
      const value = block.trackerAutoLogMode === "duration"
        ? String(roundForDisplay(minutes / 60))
        : (String(block.trackerLogAmount || explicitTracker.autoLogAmount || "1").trim() || "1");
      systemsData.logs.push({
        id: createId("log"),
        title: explicitTracker.name,
        type: explicitTracker.category || "Custom",
        valueType: explicitTracker.category || "Custom",
        value,
        unit: block.trackerAutoLogMode === "duration" ? (explicitTracker.unit || "hours") : (explicitTracker.autoLogUnit || explicitTracker.unit || ""),
        date,
        notes: `Source: Planner completion — ${block.title || "Block"}`,
        linkedHabitId: getPlannerBlockHabitId(block),
        linkedItemType: "tracker",
        linkedMetricId: "",
        linkedTrackerId: explicitTracker.id,
        linkedGoalId: getPlannerBlockGoalId(block),
        linkedPlannerBlockId: block.id,
        linkedRoutineId: block.linkedRoutineId || block.routineId || "",
        linkedObjectiveId: getPlannerBlockObjectiveId(block),
        logSource: "planner",
        plannerAutoLogKey: key,
        inactive: false
      });
      recalcTrackerCurrentFromLogs(explicitTracker);
      changed = true;
    }
  }
  const habitId = getPlannerBlockHabitId(block);
  if (!habitId) {
    if (changed) saveSystemsData();
    return;
  }
  systemsData.trackers.forEach(tracker => {
    if (!tracker.autoLogOnPlannerComplete) return;
    if (tracker.linkedHabitId !== habitId) return;
    const key = `${tracker.id}::${block.id}::${date}`;
    if (tracker.preventDuplicateAutoLogs !== false) {
      const dup = systemsData.logs.some(l =>
        !l.inactive && (l.plannerAutoLogKey === key || (l.logSource === "planner" && getLogLinkedTrackerId(l) === tracker.id && l.linkedPlannerBlockId === block.id && l.date === date))
      );
      if (dup) return;
    }
    const amt = String(tracker.autoLogAmount ?? "1").trim() || "1";
    const unit = (tracker.autoLogUnit || "").trim() || tracker.unit || "";
    systemsData.logs.push({
      id: createId("log"),
      title: tracker.name,
      type: tracker.category || "Custom",
      valueType: tracker.category || "Custom",
      value: amt,
      unit,
      date,
      notes: `Source: Planner completion — ${block.title || "Block"}`,
      linkedHabitId: habitId,
      linkedItemType: "tracker",
      linkedMetricId: "",
      linkedTrackerId: tracker.id,
      linkedGoalId: getPlannerBlockGoalId(block),
      linkedPlannerBlockId: block.id,
      linkedRoutineId: block.linkedRoutineId || block.routineId || "",
      linkedObjectiveId: getPlannerBlockObjectiveId(block),
      logSource: "planner",
      plannerAutoLogKey: key,
      inactive: false
    });
    recalcTrackerCurrentFromLogs(tracker);
    changed = true;
  });
  if (changed) saveSystemsData();
}

function removePlannerAutoLogsForBlock(block) {
  if (!block || !block.id) return;
  let removed = false;
  for (let i = systemsData.logs.length - 1; i >= 0; i--) {
    const log = systemsData.logs[i];
    if (log.inactive) continue;
    if (log.logSource !== "planner") continue;
    if (!getLogLinkedTrackerId(log)) continue;
    if (log.linkedPlannerBlockId !== block.id) continue;
    systemsData.logs.splice(i, 1);
    removed = true;
  }
  if (removed) {
    recalcAllTrackerCurrentsFromLogs();
    saveSystemsData();
  }
}

function setTrackerCategoryFilter(value) {
  trackerCategoryFilter = value || "All";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function isTrackerComplete(tracker) {
  return getTrackerProgress(tracker) >= 100;
}

function isTrackerBehind(tracker) {
  if (!tracker.targetDate || isTrackerComplete(tracker)) return false;
  return tracker.targetDate < getTodayISO() && getTrackerProgress(tracker) < 100;
}

function renderTrackersSummaryCards() {
  const box = document.getElementById("trackersSummaryCards");
  if (!box) return;
  const weekDates = getLastNDates(7);
  const trackers = systemsData.trackers;
  const active = trackers.filter(t => !isTrackerComplete(t)).length;
  const completedGoals = trackers.filter(t => isTrackerComplete(t)).length;
  const thisWeek = trackers.filter(t =>
    getSortedLogsForTracker(t.id).some(log => weekDates.includes(log.date))
  ).length;
  const streakLinked = trackers.filter(t => {
    if (!t.linkedHabitId) return false;
    const habit = systemsData.habits.find(h => h.id === t.linkedHabitId);
    if (!habit) return false;
    return getHabitStreak(habit) > 0 && getSortedLogsForTracker(t.id).some(log => weekDates.includes(log.date));
  }).length;

  box.innerHTML = `
    <div class="systems-summary-grid trackers-dash">
      <div><strong>${active}</strong><span>Active trackers</span></div>
      <div><strong>${completedGoals}</strong><span>Completed</span></div>
      <div><strong>${thisWeek}</strong><span>This week</span></div>
      <div><strong>${streakLinked}</strong><span>Streak-linked</span></div>
    </div>
  `;
  populateTrackerCategoryFilterMount();
}

function renderTrackerLogEntryRow(tracker, log) {
  const masterIndex = systemsData.logs.findIndex(l => l.id === log.id);
  const src = getLogSourceDisplay(log.logSource || inferLegacyLogSource(log));
  return `
    <div class="tracker-log-row">
      <div>
        <strong>${escapeHTML(log.date || "")}</strong>
        <span class="log-source-pill">${escapeHTML(src)}</span>
        <span>${escapeHTML(log.value || "")} ${escapeHTML(log.unit || tracker.unit || "")}</span>
        ${log.notes ? `<p class="muted-text">${escapeHTML(log.notes)}</p>` : ""}
      </div>
      <div class="button-row">
        <button class="secondary-btn" onclick="editTrackerLog(${masterIndex})">Edit</button>
        <button class="danger-btn" onclick="deleteSystemLog(${masterIndex})">Delete</button>
      </div>
    </div>
  `;
}

function renderSingleTrackerCard(tracker) {
  const pct = getTrackerProgress(tracker);
  const unit = escapeHTML(tracker.unit || "");
  const tLogs = getSortedLogsForTracker(tracker.id);
  const mini = tLogs.map(getLogNumber).filter(v => !isNaN(v)).slice(-10);
  const idx = systemsData.trackers.findIndex(t => t.id === tracker.id);
  const hasTarget = tracker.targetValue !== "" && tracker.targetValue !== undefined && tracker.targetValue !== null;
  const habit = tracker.linkedHabitId ? systemsData.habits.find(h => h.id === tracker.linkedHabitId) : null;
  const streak = habit ? getHabitStreak(habit) : 0;
  const currentLabel = `${escapeHTML(String(tracker.currentValue || 0))}${unit ? ` ${unit}` : ""}`;
  const startLabel = tracker.startValue !== "" && tracker.startValue !== undefined ? `${escapeHTML(String(tracker.startValue))}${unit ? ` ${unit}` : ""}` : "Start";
  const targetLabel = hasTarget ? `${escapeHTML(String(tracker.targetValue))}${unit ? ` ${unit}` : ""}` : "No target";
  const milestones = Array.isArray(tracker.milestones) ? tracker.milestones.filter(m => m.title) : [];
  const logsHtml = tLogs.length
    ? `<div class="tracker-log-history">${tLogs.slice().reverse().map(log => renderTrackerLogEntryRow(tracker, log)).join("")}</div>`
    : `<p class="muted-text small">No log entries yet.</p>`;

  return `
    <div class="system-item tracker-card">
      <div class="tracker-card-header">
        <div>
          <strong>${escapeHTML(tracker.name)}</strong>
          <div class="habit-pill-row">
            <span class="metric-type-pill">${escapeHTML(tracker.category || "Custom")}</span>
            ${tracker.resetType && tracker.resetType !== "No reset" ? `<span class="metric-type-pill">${escapeHTML(tracker.resetType)}</span>` : ""}
            ${habit ? `<span class="metric-type-pill">Habit: ${escapeHTML(habit.name)}</span>` : ""}
            ${streak ? `<span class="streak-badge">${streak} streak</span>` : ""}
          </div>
        </div>
        <div class="tracker-current-value">${currentLabel}</div>
      </div>
      ${renderConnectionBadges({
        habitId: tracker.linkedHabitId,
        goalId: tracker.linkedGoalId,
        plannerBlockId: tracker.linkedPlannerBlockId,
        routineId: tracker.linkedRoutineId,
        objectiveId: tracker.linkedObjectiveId
      })}
      ${hasTarget ? `
        <div class="tracker-progress-bar">
          <div class="tracker-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="tracker-scale-row">
          <span>${startLabel}</span>
          <strong>${currentLabel}</strong>
          <span>${targetLabel}</span>
        </div>
        <p class="tracker-pct">${pct}% ${tracker.direction === "decrease" ? "toward reduction target" : "toward target"}</p>
      ` : `<p class="muted-text small">Current value: <strong>${currentLabel}</strong></p>`}
      ${mini.length ? renderMiniBars(mini) : ""}
      ${tracker.startDate || tracker.targetDate ? `<p class="muted-text">${escapeHTML(tracker.startDate || "—")} → ${escapeHTML(tracker.targetDate || "—")}</p>` : ""}
      ${milestones.length ? `
        <div class="milestone-progress">
          <p class="muted-text small">Milestones: ${progress.completed}/${progress.total}</p>
          ${nextMilestone ? `<p class="muted-text small">Next: ${escapeHTML(nextMilestone.name)} at ${escapeHTML(nextMilestone.amount)}${tracker.unit ? " " + escapeHTML(tracker.unit) : ""}</p>` : ""}
          ${overdue.length ? `<p class="muted-text small" style="color:var(--danger)">${overdue.length} overdue</p>` : ""}
          ${upcoming && !nextMilestone ? `<p class="muted-text small">Upcoming: ${escapeHTML(upcoming.targetDate)}</p>` : ""}
        </div>
      ` : ""}
      ${tracker.resetCustomNote ? `<p class="muted-text">${escapeHTML(tracker.resetCustomNote)}</p>` : ""}
      ${tracker.notes ? `<p>${escapeHTML(tracker.notes)}</p>` : ""}
      <div class="button-row tracker-footer-actions">
        <button onclick="openSystemsForm('trackerLog', '${tracker.id}')">Log</button>
        <button class="secondary-btn" onclick="openSystemsForm('tracker', ${idx})">Edit</button>
        <button class="secondary-btn" onclick="toggleTrackerLogs('${tracker.id}')">View Logs</button>
        <button class="danger-btn" onclick="deleteTrackerById('${tracker.id}')">Delete</button>
      </div>
      <div id="trackerLogs-${escapeHTML(tracker.id)}" class="tracker-logs-collapsed">
        <h4 class="tracker-subhead">Log history</h4>
        ${logsHtml}
      </div>
    </div>
  `;
}

function toggleTrackerLogs(id) {
  const el = document.getElementById(`trackerLogs-${id}`);
  if (el) el.classList.toggle("tracker-logs-collapsed");
}

function renderTrackersUnifiedList() {
  const box = document.getElementById("trackersUnifiedList");
  if (!box) return;
  const list = getTrackersFilteredForList();
  const all = systemsData.trackers;
  box.innerHTML = list.length
    ? `<div class="systems-card-grid">${list.map(renderSingleTrackerCard).join("")}</div>`
    : !all.length
      ? `<div class="empty-state"><p>No trackers yet.</p><button onclick="openSystemsForm('tracker')">Add first tracker</button></div>`
      : `<div class="empty-state"><p>No trackers match this filter.</p><button onclick="setTrackerCategoryFilter('All')">Show all</button></div>`;
}

function getTrackersFilteredForList() {
  const trackers = systemsData.trackers.filter(t =>
    trackerCategoryFilter === "All" || t.type === trackerCategoryFilter
  );
  
  // Include goals as trackers for display
  const goalsAsTrackers = systemsData.goals
    .filter(g => trackerCategoryFilter === "All" || g.type === trackerCategoryFilter || (trackerCategoryFilter === "Goal" && g.type === "Goal"))
    .map(g => ({
      id: g.id,
      name: g.name,
      category: g.category || "Goal",
      unit: g.unit || "",
      startValue: g.startValue || 0,
      currentValue: g.currentValue || 0,
      targetValue: g.targetValue || 0,
      direction: g.type === "Decrease toward target" || g.type === "Do not exceed limit" ? "decrease" : "increase",
      notes: g.notes || "",
      isGoal: true,
      linkedHabitId: g.linkedHabitId || "",
      linkedTrackerId: g.linkedTrackerId || "",
      deadline: g.deadline || "",
      milestones: g.milestones || ""
    }));
  
  return [...trackers, ...goalsAsTrackers];
}

function saveUnifiedTrackerFromModal() {
  const name = document.getElementById("trackerName").value.trim();
  if (!name) {
    alert("Add a name.");
    return;
  }
  const prev = editingTrackerIndex !== null ? systemsData.trackers[editingTrackerIndex] : null;
  const category = document.getElementById("trackerCategory").value.trim();
  const type = document.getElementById("trackerType").value.trim();
  const unit = document.getElementById("trackerUnit").value.trim();
  const autoLogUnit = document.getElementById("trackerAutoLogUnit")?.value.trim() ?? "";
  const trackerRaw = {
    id: editingTrackerIndex === null ? createId("tracker") : systemsData.trackers[editingTrackerIndex].id,
    name,
    category,
    type,
    unit,
    startValue: document.getElementById("trackerStartValue").value,
    currentValue: document.getElementById("trackerCurrentValue").value,
    targetValue: document.getElementById("trackerTargetValue").value,
    direction: document.getElementById("trackerDirection").value,
    logValueMode: document.getElementById("trackerLogValueMode").value,
    resetType: document.getElementById("trackerResetType").value,
    resetCustomNote: document.getElementById("trackerResetCustomNote")?.value.trim() || "",
    startDate: document.getElementById("trackerStartDate").value || "",
    targetDate: document.getElementById("trackerTargetDate").value || "",
    linkedHabitId: document.getElementById("trackerLinkedHabit").value || "",
    linkedGoalId: document.getElementById("trackerLinkedGoal")?.value || "",
    linkedRoutineId: document.getElementById("trackerLinkedRoutine")?.value || "",
    linkedPlannerBlockId: document.getElementById("trackerLinkedPlanner")?.value || "",
    linkedObjectiveId: document.getElementById("trackerLinkedObjective")?.value || "",
    milestones: getMilestonesFromForm(),
    legacyMetricType: prev?.legacyMetricType || "",
    autoLogOnPlannerComplete: Boolean(document.getElementById("trackerAutoLogPlanner")?.checked),
    autoLogAmount: document.getElementById("trackerAutoLogAmount")?.value ?? "1",
    autoLogUnit,
    preventDuplicateAutoLogs: document.getElementById("trackerPreventDupAuto")?.checked !== false,
    notes: document.getElementById("trackerNotes").value.trim()
  };
  const tracker = normalizeUnifiedTrackerRecord(trackerRaw);
  rememberTrackerCategory(tracker.category);
  rememberTrackerUnit(tracker.unit);
  rememberTrackerUnit(autoLogUnit);
  if (editingTrackerIndex === null) systemsData.trackers.push(tracker);
  else systemsData.trackers[editingTrackerIndex] = tracker;
  recalcAllTrackerCurrentsFromLogs();
  editingTrackerIndex = null;
  activeSystemsForm = null;
  saveSystemsData();
  activeSystemsSection = "Trackers";
  main.innerHTML = getPageHTML("Systems");
  renderSystems();
}

function fillEditingTrackerForm() {
  if (editingTrackerIndex === null) return;
  const el = id => document.getElementById(id);
  if (!el("trackerName")) return;
  const t = systemsData.trackers[editingTrackerIndex];
  if (!t) return;
  el("trackerName").value = t.name || "";
  const catIn = el("trackerCategory");
  if (catIn) {
    catIn.value = t.category || "";
    const catList = document.getElementById("trackerCategoryList");
    if (catList) catList.innerHTML = buildTrackerCategoryDatalistInnerHtml();
  }
  const unitIn = el("trackerUnit");
  if (unitIn) {
    unitIn.value = t.unit || "";
  }
  el("trackerStartValue").value = t.startValue ?? "";
  el("trackerCurrentValue").value = t.currentValue ?? "";
  el("trackerTargetValue").value = t.targetValue ?? "";
  el("trackerDirection").value = t.direction === "decrease" ? "decrease" : "increase";
  el("trackerLogValueMode").value = t.logValueMode === "absolute" ? "absolute" : "increment";
  el("trackerResetType").value = TRACKER_RESET_TYPES.includes(t.resetType) ? t.resetType : "No reset";
  if (el("trackerResetCustomNote")) el("trackerResetCustomNote").value = t.resetCustomNote || "";
  el("trackerStartDate").value = t.startDate || "";
  el("trackerTargetDate").value = t.targetDate || "";
  el("trackerLinkedHabit").value = t.linkedHabitId || "";
  if (el("trackerLinkedGoal")) el("trackerLinkedGoal").value = t.linkedGoalId || "";
  if (el("trackerLinkedRoutine")) el("trackerLinkedRoutine").value = t.linkedRoutineId || "";
  if (el("trackerLinkedPlanner")) el("trackerLinkedPlanner").value = t.linkedPlannerBlockId || "";
  if (el("trackerLinkedObjective")) el("trackerLinkedObjective").value = t.linkedObjectiveId || "";
  if (el("trackerAutoLogPlanner")) el("trackerAutoLogPlanner").checked = Boolean(t.autoLogOnPlannerComplete);
  if (el("trackerAutoLogAmount")) el("trackerAutoLogAmount").value = t.autoLogAmount ?? "1";
  if (el("trackerAutoLogUnit")) el("trackerAutoLogUnit").value = t.autoLogUnit || "";
  if (el("trackerPreventDupAuto")) el("trackerPreventDupAuto").checked = t.preventDuplicateAutoLogs !== false;
  if (el("trackerMilestones")) el("trackerMilestones").value = (t.milestones || []).map(item => item.title || "").join("\n");
  el("trackerNotes").value = t.notes || "";
  const btn = el("trackerSaveButton");
  if (btn) btn.textContent = "Update Tracker";
}

function fillEditingManualLogForm() {
  if (activeSystemsForm !== "trackerLog" || !manualLogTrackerId) return;
  const dateEl = document.getElementById("manualLogDate");
  if (!dateEl) return;
  dateEl.value = getTodayISO();
  refreshManualLogPlannerBlockOptions();
  const tracker = systemsData.trackers.find(tr => tr.id === manualLogTrackerId);
  const valEl = document.getElementById("manualLogValue");
  if (valEl) valEl.value = "";
  const unitEl = document.getElementById("manualLogUnit");
  if (unitEl && tracker) unitEl.value = tracker.unit || "";
  const notesEl = document.getElementById("manualLogNotes");
  if (notesEl) notesEl.value = "";
  const habitEl = document.getElementById("manualLogLinkedHabit");
  if (habitEl && tracker) habitEl.value = tracker.linkedHabitId || "";
  const blockEl = document.getElementById("manualLogPlannerBlock");
  if (blockEl) blockEl.value = "";
  valEl?.focus();
}

function fillEditingLogForm() {
  if (editingLogIndex === null) return;
  if (!document.getElementById("logTitle")) return;
  const log = systemsData.logs[editingLogIndex];
  if (!log) return;
  document.getElementById("logTitle").value = log.title || "";
  document.getElementById("logType").value = log.type || "Custom";
  document.getElementById("logValue").value = log.value || "";
  document.getElementById("logUnit").value = log.unit || "";
  document.getElementById("logDate").value = log.date || getTodayISO();
  document.getElementById("logNotes").value = log.notes || "";
  const lt = log.linkedGoalId ? "goal" : log.linkedHabitId ? "habit" : getLogLinkedTrackerId(log) ? "tracker" : "";
  const li = document.getElementById("logLinkedItemType");
  if (li) li.value = lt;
  updateLogLinkedItemOptions();
  const wrap = document.getElementById("logLinkedItemId");
  const idVal = getLogLinkedTrackerId(log) || log.linkedGoalId || "";
  if (wrap) wrap.value = idVal;
  syncLogFieldsFromTracker();
  const plannerSel = document.getElementById("logLinkedPlannerBlockId");
  if (plannerSel) plannerSel.value = log.linkedPlannerBlockId || "";
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
  ].filter(Boolean).concat(getSmartSocialSuggestions()).slice(0, 6);

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
  populateIdeaFriendSelect();
  populateIdeaFriendFilter();
  renderSelectedIdeaFriends();
  renderFriendSuggestions();
  renderNeglectedFriends();
  renderMostSeenMonth();
  renderSocialBalance();
  renderSocialInsights();
  renderSmartSocialSuggestions();
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
    birthday: document.getElementById("friendBirthday").value,
    phoneHandle: document.getElementById("friendPhoneHandle").value.trim(),
    favoriteFood: document.getElementById("friendFavoriteFood").value.trim(),
    giftIdeas: document.getElementById("friendGiftIdeas").value.trim(),
    importantNotes: document.getElementById("friendImportantNotes").value.trim(),
    relationshipType: document.getElementById("friendRelationshipType").value,
    priority: document.getElementById("friendPriority").value,
    lastContacted: document.getElementById("friendLastContacted").value,
    lastSeen: document.getElementById("friendLastSeen").value,
    favoriteActivities: document.getElementById("friendFavoriteActivities").value.trim(),
    preferredHangoutStyle: document.getElementById("friendPreferredHangoutStyle").value.trim(),
    interests: "",
    details: "",
    contactNotes: document.getElementById("friendPhoneHandle").value.trim(),
    notes: document.getElementById("friendImportantNotes").value.trim()
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
  const relationshipFilter = document.getElementById("friendRelationshipFilter")?.value || "All";
  const sort = document.getElementById("friendSort")?.value || "name";
  const priorityRank = { High: 1, Medium: 2, Low: 3 };
  const friends = socialData.friends
    .map((friend, index) => ({ friend, index }))
    .filter(({ friend }) =>
      (!search || [
        friend.name,
        friend.phoneHandle,
        friend.favoriteFood,
        friend.favoriteActivities,
        friend.giftIdeas,
        friend.importantNotes,
        friend.preferredHangoutStyle
      ].join(" ").toLowerCase().includes(search)) &&
      (priorityFilter === "All" || friend.priority === priorityFilter) &&
      (relationshipFilter === "All" || friend.relationshipType === relationshipFilter)
    )
    .sort((a, b) => {
      if (sort === "lastSeen") return (b.friend.lastSeen || "").localeCompare(a.friend.lastSeen || "");
      if (sort === "priority") return (priorityRank[a.friend.priority] || 9) - (priorityRank[b.friend.priority] || 9);
      return a.friend.name.localeCompare(b.friend.name);
    });

  box.innerHTML = friends.length
    ? friends.map(({ friend: f, index: i }) => `
    <div class="social-item friend-card">
      <div class="item-title">
        <strong>${escapeHTML(f.name)}</strong>
        <span class="priority-pill ${f.priority.toLowerCase()}">${escapeHTML(f.priority)}</span>
      </div>
      <p>${escapeHTML(f.relationshipType)} • Last contacted: ${f.lastContacted || "Not logged yet"} • Last seen: ${f.lastSeen || "Not logged yet"}</p>
      <p>${escapeHTML(f.favoriteFood ? `Favorite food: ${f.favoriteFood}` : f.favoriteActivities || "")}</p>
      <div class="button-row three-actions">
        <button onclick="quickContactFriend(${i})">Contact</button>
        <button onclick="toggleFriendDetail(${i})">View</button>
        <button onclick="editFriend(${i})">Edit</button>
      </div>
      <button class="danger-btn" onclick="deleteFriend(${i})">Delete</button>
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

  const linkedIdeas = socialData.ideas
    .filter(idea => idea.linkedFriendIds && idea.linkedFriendIds.includes(friend.name))
    .slice(0, 5);

  return `
    <div class="detail-panel">
      <p><strong>Birthday:</strong> ${escapeHTML(friend.birthday || "None added")}</p>
      <p><strong>Contact:</strong> ${escapeHTML(friend.phoneHandle || friend.contactNotes || "None added")}</p>
      <p><strong>Gift ideas:</strong> ${escapeHTML(friend.giftIdeas || "None added")}</p>
      <p><strong>Important notes:</strong> ${escapeHTML(friend.importantNotes || friend.notes || "None added")}</p>
      <p><strong>Favorite activities:</strong> ${escapeHTML(friend.favoriteActivities || "None added")}</p>
      <p><strong>Preferred hangout style:</strong> ${escapeHTML(friend.preferredHangoutStyle || "None added")}</p>
      <p><strong>Memory log:</strong></p>
      <p><strong>Related hangouts:</strong></p>
      ${
        relatedHangouts.length
          ? relatedHangouts.map(h => `<p>${escapeHTML(h.date || "No date")} - ${escapeHTML(h.activity)}</p>`).join("")
          : "<p>No related hangouts yet.</p>"
      }
      <p><strong>Linked Ideas:</strong></p>
      ${
        linkedIdeas.length
          ? linkedIdeas.map(idea => `<p>${escapeHTML(idea.favorite ? "* " + idea.title : idea.title)} (${escapeHTML(idea.category)})</p>`).join("")
          : "<p>No linked ideas yet.</p>"
      }
    </div>
  `;
}

function toggleFriendDetail(index) {
  viewingFriendIndex = viewingFriendIndex === index ? null : index;
  renderFriends();
}

function quickContactFriend(i) {
  const friend = socialData.friends[i];
  friend.lastContacted = getTodayISO();
  saveSocialData();
  if (friend.phoneHandle) {
    window.location.href = friend.phoneHandle.includes("@") ? `mailto:${friend.phoneHandle}` : `tel:${friend.phoneHandle}`;
  }
  renderSocial();
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
  const checklist = document.getElementById("hangoutChecklist").value.trim();
  const followUpReminder = document.getElementById("hangoutFollowUpReminder").value;
  const rating = document.getElementById("hangoutRating").value;
  const moodAfter = document.getElementById("hangoutMoodAfter").value.trim();
  const memories = document.getElementById("hangoutMemories").value.trim();
  const notes = document.getElementById("hangoutNotes").value.trim();

  if (!activity || !people.length) return;

  const hangout = {
    activity,
    date,
    time,
    location,
    people,
    cost,
    checklist,
    followUpReminder,
    rating,
    moodAfter,
    memories,
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
      <p><strong>Checklist:</strong> ${escapeHTML(hangout.checklist || "None added")}</p>
      <p><strong>Mood after:</strong> ${escapeHTML(hangout.moodAfter || "None added")}</p>
      <p><strong>Rating:</strong> ${escapeHTML(hangout.rating || "None added")}</p>
      <p><strong>Memories:</strong> ${escapeHTML(hangout.memories || "None added")}</p>
      <p><strong>Follow-up:</strong> ${escapeHTML(hangout.followUpReminder || "None added")}</p>
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
    hangout.checklist ? `Checklist: ${hangout.checklist}` : "",
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
let selectedIdeaFriendIds = [];

function populateIdeaFriendSelect() {
  const search = document.getElementById("ideaFriendSearch")?.value.trim().toLowerCase() || "";
  const select = document.getElementById("ideaFriendSelect");
  if (!select) return;

  const friends = socialData.friends.filter(friend =>
    friend.name.toLowerCase().includes(search)
  );

  select.innerHTML = friends.length
    ? `<option value="">Select a friend...</option>` +
      friends.map(friend => `<option value="${friend.name}">${escapeHTML(friend.name)}</option>`).join("")
    : `<option disabled>${socialData.friends.length ? "No friends match search" : "No friends saved yet"}</option>`;
}

function addSelectedFriendToIdea() {
  const select = document.getElementById("ideaFriendSelect");
  if (!select) return;

  const friendName = select.value;
  if (!friendName) return;

  const friend = socialData.friends.find(f => f.name === friendName);
  if (!friend) return;

  if (!selectedIdeaFriendIds.includes(friendName)) {
    selectedIdeaFriendIds.push(friendName);
    renderSelectedIdeaFriends();
  }

  select.value = "";
  document.getElementById("ideaFriendSearch").value = "";
  populateIdeaFriendSelect();
}

function removeSelectedIdeaFriend(friendName) {
  selectedIdeaFriendIds = selectedIdeaFriendIds.filter(id => id !== friendName);
  renderSelectedIdeaFriends();
}

function renderSelectedIdeaFriends() {
  const container = document.getElementById("selectedIdeaFriends");
  if (!container) return;

  if (selectedIdeaFriendIds.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = selectedIdeaFriendIds.map(friendName => {
    const friend = socialData.friends.find(f => f.name === friendName);
    const displayName = friend ? friend.name : friendName;
    return `<span class="friend-chip">${escapeHTML(displayName)} <button onclick="removeSelectedIdeaFriend('${escapeHTML(friendName)}')" class="chip-remove">×</button></span>`;
  }).join("");
}

function populateIdeaFriendFilter() {
  const select = document.getElementById("ideaFriendFilter");
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = `<option value="All">All friends</option>` +
    socialData.friends.map(friend => `<option value="${friend.name}">${escapeHTML(friend.name)}</option>`).join("");
  
  if (currentValue && socialData.friends.find(f => f.name === currentValue)) {
    select.value = currentValue;
  }
}

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
    favorite,
    linkedFriendIds: [...selectedIdeaFriendIds]
  };

  if (editingIdeaIndex === null) {
    socialData.ideas.push(idea);
  } else {
    socialData.ideas[editingIdeaIndex] = idea;
  }

  editingIdeaIndex = null;
  selectedIdeaFriendIds = [];
  saveSocialData();
  activeSocialSection = "Ideas";
  main.innerHTML = getPageHTML("Social");
  renderSocial();
}

function renderIdeas() {
  const box = document.getElementById("ideasList");
  if (!box) return;

  const search = document.getElementById("ideaSearch")?.value.trim().toLowerCase() || "";
  const categoryFilter = document.getElementById("ideaCategoryFilter")?.value || "All";
  const favoriteFilter = document.getElementById("ideaFavoriteFilter")?.value || "All";
  const friendFilter = document.getElementById("ideaFriendFilter")?.value || "All";

  const ideas = socialData.ideas
    .map((idea, index) => ({ idea, index }))
    .filter(({ idea }) => {
      const linkedFriendNames = (idea.linkedFriendIds || []).map(id => {
        const friend = socialData.friends.find(f => f.name === id);
        return friend ? friend.name : id;
      }).join(" ");

      return (
        (!search || [idea.title, idea.category, idea.cost, idea.notes, linkedFriendNames].join(" ").toLowerCase().includes(search)) &&
        (categoryFilter === "All" || idea.category === categoryFilter) &&
        (favoriteFilter !== "Favorites" || idea.favorite) &&
        (friendFilter === "All" || (idea.linkedFriendIds && idea.linkedFriendIds.includes(friendFilter)))
      );
    });

  box.innerHTML = ideas.length
    ? ideas.map(({ idea, index: i }) => {
      const linkedFriendNames = (idea.linkedFriendIds || []).map(id => {
        const friend = socialData.friends.find(f => f.name === id);
        return friend ? friend.name : id;
      }).filter(name => name);

      return `
    <div class="social-item">
      <div class="item-title">
        <strong>${escapeHTML(idea.favorite ? `* ${idea.title}` : idea.title)}</strong>
        <span>${escapeHTML(idea.category)}</span>
      </div>
      <p>${escapeHTML(idea.cost || "")}</p>
      <p>${escapeHTML(idea.notes || "")}</p>
      ${linkedFriendNames.length ? `<p class="linked-friends"><strong>Linked friends:</strong> ${escapeHTML(linkedFriendNames.join(", "))}</p>` : ""}
      <div class="button-row">
        <button onclick="useIdea(${i})">Turn into Hangout</button>
        <button onclick="toggleIdeaFavorite(${i})">${idea.favorite ? "Unfavorite" : "Favorite"}</button>
      </div>
      <div class="button-row">
        <button onclick="editIdea(${i})">Edit</button>
        <button class="danger-btn" onclick="deleteIdea(${i})">Delete</button>
      </div>
    </div>
  `}).join("")
    : "<p>No ideas match those filters.</p>";
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
  selectedIdeaFriendIds = [];
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
    document.getElementById("friendBirthday").value = friend.birthday || "";
    document.getElementById("friendPhoneHandle").value = friend.phoneHandle || friend.contactNotes || "";
    document.getElementById("friendRelationshipType").value = friend.relationshipType || "Friend";
    document.getElementById("friendPriority").value = friend.priority;
    document.getElementById("friendLastContacted").value = friend.lastContacted || "";
    document.getElementById("friendLastSeen").value = friend.lastSeen || "";
    document.getElementById("friendFavoriteFood").value = friend.favoriteFood || "";
    document.getElementById("friendFavoriteActivities").value = friend.favoriteActivities || "";
    document.getElementById("friendGiftIdeas").value = friend.giftIdeas || "";
    document.getElementById("friendImportantNotes").value = friend.importantNotes || friend.notes || "";
    document.getElementById("friendPreferredHangoutStyle").value = friend.preferredHangoutStyle || "";
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
    document.getElementById("hangoutChecklist").value = hangout.checklist || "";
    document.getElementById("hangoutFollowUpReminder").value = hangout.followUpReminder || "";
    document.getElementById("hangoutRating").value = hangout.rating || "";
    document.getElementById("hangoutMoodAfter").value = hangout.moodAfter || "";
    document.getElementById("hangoutMemories").value = hangout.memories || "";
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
    selectedIdeaFriendIds = Array.isArray(idea.linkedFriendIds) ? [...idea.linkedFriendIds] : [];
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
  const avgSpend = getAverageHangoutSpend();
  const highPriorityNeglected = socialData.friends.filter(friend =>
    friend.priority === "High" && (getDaysSince(friend.lastSeen) === null || getDaysSince(friend.lastSeen) >= 21)
  ).length;

  box.innerHTML = `
    <div class="summary-grid">
      <div><strong>${completedThisMonth.length}</strong><span>Hangouts this month</span></div>
      <div><strong>${friendsSeenThisMonth.length}</strong><span>Friends seen this month</span></div>
      <div><strong>${socialData.hangouts.length}</strong><span>Total hangouts</span></div>
      <div><strong>${notSeenRecently.length}</strong><span>Neglected friends</span></div>
      <div><strong>${avgScore}</strong><span>Avg friend score</span></div>
      <div><strong>${avgSpend ? `$${avgSpend}` : "$0"}</strong><span>Avg spend</span></div>
    </div>
    <p><strong>Top suggestion:</strong> ${topFriend ? `${escapeHTML(topFriend.friend.name)} (score ${topFriend.score})` : "Add friends to get suggestions."}</p>
    <p><strong>Priority balance:</strong> High ${priorityCounts.High || 0} · Medium ${priorityCounts.Medium || 0} · Low ${priorityCounts.Low || 0}</p>
    <p><strong>Hangout frequency:</strong> ${getHangoutFrequencyText()}</p>
    <p><strong>Neglected high-priority people:</strong> ${highPriorityNeglected}</p>
  `;
}

function renderSmartSocialSuggestions() {
  const box = document.getElementById("smartSocialSuggestions");
  if (!box) return;

  const suggestions = getSmartSocialSuggestions();
  box.innerHTML = suggestions.length
    ? suggestions.map(text => `<div class="suggestion-item"><strong>${escapeHTML(text)}</strong></div>`).join("")
    : "<p>Add friends, ideas, and planner blocks to unlock smarter suggestions.</p>";
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
  const diffTime = today - seenDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
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

// ==================== CLOUD SYNC INITIALIZATION ====================

// Autosync timer
let autosyncTimer = null;
let syncDebounceTimer = null;

// Check Supabase connection on startup
async function checkCloudConnection() {
  console.log("[SYNC] Checking cloud connection on startup");
  const cloudStatus = document.getElementById("cloudStatus");
  const cloudSyncNotConnected = document.getElementById("cloudSyncNotConnected");
  const offlineModeBanner = document.getElementById("offlineModeBanner");
  
  if (cloudStatus) {
    cloudStatus.textContent = "Checking...";
    cloudStatus.style.color = "blue";
  }

  if (DataService.isSupabaseConfigured()) {
    try {
      // Try to get owner ID to verify connection
      const ownerId = await window.flowSupabaseStorage.getOwnerId?.();
      if (ownerId) {
        console.log("[SYNC] Cloud connection successful");
        DataService.syncStatus.isCloudConnected = true;
        if (cloudStatus) {
          cloudStatus.textContent = "Connected ✓";
          cloudStatus.style.color = "green";
        }
        if (cloudSyncNotConnected) {
          cloudSyncNotConnected.style.display = "none";
        }
        if (offlineModeBanner) {
          offlineModeBanner.style.display = "none";
        }
      } else {
        console.log("[SYNC] Could not get owner ID");
        DataService.syncStatus.isCloudConnected = false;
        if (cloudStatus) {
          cloudStatus.textContent = "Offline";
          cloudStatus.style.color = "orange";
        }
        if (cloudSyncNotConnected) {
          cloudSyncNotConnected.style.display = "block";
        }
        if (offlineModeBanner) {
          offlineModeBanner.style.display = "block";
        }
      }
    } catch (error) {
      console.error("[SYNC] Connection check failed:", error);
      DataService.syncStatus.isCloudConnected = false;
      if (cloudStatus) {
        cloudStatus.textContent = "Error";
        cloudStatus.style.color = "red";
      }
      if (cloudSyncNotConnected) {
        cloudSyncNotConnected.style.display = "block";
      }
      if (offlineModeBanner) {
        offlineModeBanner.style.display = "block";
      }
    }
  } else {
    console.log("[SYNC] Supabase not configured");
    DataService.syncStatus.isCloudConnected = false;
    if (cloudStatus) {
      cloudStatus.textContent = "Not Configured";
      cloudStatus.style.color = "gray";
    }
    if (cloudSyncNotConnected) {
      cloudSyncNotConnected.style.display = "block";
    }
    if (offlineModeBanner) {
      offlineModeBanner.style.display = "block";
    }
  }

  updateSyncStatusDisplay();
}

// Debounced autosync after major changes
function triggerAutosync() {
  console.log("[SYNC] Autosync triggered (debounced)");
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(async () => {
    console.log("[SYNC] Executing debounced autosync");
    const data = {
      plannerData,
      scheduleData,
      systemsData,
      socialData,
      allZipData,
      allZipCustomOptions
    };
    await DataService.saveToSupabase(data);
    updateSyncStatusDisplay();
  }, 2000); // 2 second debounce
}

// Periodic autosync every 60 seconds
function startPeriodicAutosync() {
  console.log("[SYNC] Starting periodic autosync (60 seconds)");
  if (autosyncTimer) clearInterval(autosyncTimer);
  
  autosyncTimer = setInterval(async () => {
    console.log("[SYNC] Periodic autosync running");
    const data = {
      plannerData,
      scheduleData,
      systemsData,
      socialData,
      allZipData,
      allZipCustomOptions
    };
    const result = await DataService.saveToSupabase(data);
    if (result) {
      console.log("[CLOUD] Periodic autosync successful");
    }
    updateSyncStatusDisplay();
  }, 60000); // 60 seconds
}

// Initialize cloud sync on app load
function initializeCloudSync() {
  console.log("[SYNC] Initializing cloud sync");
  checkCloudConnection();
  startPeriodicAutosync();
  
  // Update sync timestamp display every minute
  setInterval(updateSyncStatusDisplay, 60000);
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeCloudSync);
} else {
  initializeCloudSync();
}