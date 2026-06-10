const SUPABASE_URL = "https://vryerurkxahqotzjidyc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyeWVydXJreGFocW90emppZHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDkxNTQsImV4cCI6MjA5NDA4NTE1NH0.jNNOCQ0YkWFKKvj6s7uyXalI2ATMOMSnSAStHQFm944";

const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
const supabaseClient = hasSupabaseConfig
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;

console.log("[SUPABASE] initialized", !!supabaseClient);

let ownerIdPromise;

async function getOwnerId() {
  if (!supabaseClient) return null;
  if (!ownerIdPromise) {
    ownerIdPromise = (async () => {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (sessionData.session?.user?.id) return sessionData.session.user.id;

      const { data, error } = await supabaseClient.auth.signInAnonymously();
      if (error) throw error;
      return data.user?.id || null;
    })();
  }
  return ownerIdPromise;
}

async function withOwner(record) {
  const ownerId = await getOwnerId();
  if (!ownerId) throw new Error("Supabase auth did not return a user id.");
  return {
    ...record,
    owner_id: ownerId,
    updated_at: new Date().toISOString()
  };
}

async function replaceTable(tableName, rows) {
  if (!supabaseClient) return { skipped: true };
  const ownerId = await getOwnerId();
  const { error: deleteError } = await supabaseClient
    .from(tableName)
    .delete()
    .eq("owner_id", ownerId);
  if (deleteError) throw deleteError;
  if (!rows.length) return { count: 0 };
  const rowsWithOwner = await Promise.all(rows.map(withOwner));
  const { error } = await supabaseClient.from(tableName).insert(rowsWithOwner);
  if (error) throw error;
  return { count: rows.length };
}

function mapPlannerBlock(block, index) {
  return {
    local_id: String(block.id || `block-${index}`),
    title: block.title || "",
    date: block.date || null,
    start_time: block.start || block.time || null,
    end_time: block.end || null,
    category: block.category || "Personal",
    notes: block.notes || "",
    completed: Boolean(block.completed),
    payload: block
  };
}

function mapHabit(habit, index) {
  return {
    local_id: String(habit.id || `habit-${index}`),
    name: habit.name || "",
    category: habit.category || "",
    frequency: habit.frequency || habit.targetFrequency || "Daily",
    target: habit.target || "",
    notes: habit.notes || "",
    payload: habit
  };
}

function mapGoal(goal, index) {
  return {
    local_id: String(goal.id || `goal-${index}`),
    name: goal.name || "",
    category: goal.category || "Custom",
    deadline: goal.targetDate || goal.deadline || null,
    status: goal.status || "",
    unit: goal.unit || "",
    notes: goal.notes || "",
    payload: goal
  };
}

function mapFriend(friend, index) {
  return {
    local_id: String(friend.id || `friend-${index}`),
    name: friend.name || "",
    relationship_type: friend.relationshipType || "Friend",
    priority: friend.priority || "Medium",
    birthday: friend.birthday || null,
    phone_handle: friend.phoneHandle || friend.contactNotes || "",
    last_contacted: friend.lastContacted || null,
    last_seen: friend.lastSeen || null,
    payload: friend
  };
}

function mapHangout(hangout, index) {
  return {
    local_id: String(hangout.id || `hangout-${index}`),
    activity: hangout.activity || "",
    date: hangout.date || null,
    time: hangout.time || null,
    location: hangout.location || "",
    people: Array.isArray(hangout.people) ? hangout.people : [],
    cost: hangout.cost || "",
    completed: Boolean(hangout.completed),
    payload: hangout
  };
}

function mapSocialIdea(idea, index) {
  return {
    local_id: String(idea.id || `idea-${index}`),
    title: idea.title || "",
    category: idea.category || "Cheap",
    cost: idea.cost || "",
    favorite: Boolean(idea.favorite),
    notes: idea.notes || "",
    payload: idea
  };
}

function mapLog(log, index) {
  return {
    local_id: String(log.id || `log-${index}`),
    title: log.title || "",
    type: log.type || log.valueType || log.source || "Custom",
    value: log.value ?? "",
    unit: log.unit || log.valueType || "",
    date: log.date || null,
    notes: log.notes || "",
    payload: log
  };
}

let saveTimer;
async function saveAll(data) {
  if (!supabaseClient) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await Promise.all([
        replaceTable("planner_blocks", [
          ...(data.scheduleData?.blocks || []).map(mapPlannerBlock),
          ...(data.plannerData?.plans || []).map((plan, index) => mapPlannerBlock({ ...plan, id: `legacy-plan-${index}`, start: plan.time }, index))
        ]),
        replaceTable("habits", data.systemsData?.habits?.map(mapHabit) || []),
        replaceTable("goals", data.systemsData?.goals?.map(mapGoal) || []),
        replaceTable("friends", data.socialData?.friends?.map(mapFriend) || []),
        replaceTable("hangouts", data.socialData?.hangouts?.map(mapHangout) || []),
        replaceTable("social_ideas", data.socialData?.ideas?.map(mapSocialIdea) || []),
        replaceTable("logs", data.systemsData?.logs?.map(mapLog) || []),
        replaceTable("settings", [{ key: "flow_backup", value: data }])
      ]);
      localStorage.setItem("flowSupabaseLastSync", new Date().toISOString());
    } catch (error) {
      console.warn("[CLOUD] Legacy sync failed; localStorage fallback is still active.", error);
    }
  }, 400);
}

// ==================== UNIFIED CLOUD SYNC ====================

// Create unified sync state object
function createSyncState(data) {
  return {
    plannerData: data.plannerData || null,
    scheduleData: data.scheduleData || null,
    systemsData: data.systemsData || null,
    socialData: data.socialData || null,
    allZipData: data.allZipData || null,
    settingsData: data.settingsData || null,
    customOptionsData: data.customOptionsData || null,
    updatedAt: new Date().toISOString()
  };
}

// Merge arrays by id, preserve newer records, prevent duplicates
function mergeArraysById(localArray, remoteArray, arrayName) {
  console.log(`[MERGE] Merging ${arrayName}`);
  if (!localArray || !Array.isArray(localArray)) return remoteArray || [];
  if (!remoteArray || !Array.isArray(remoteArray)) return localArray;

  const merged = [...localArray];
  const localIds = new Set();
  localArray.forEach(item => {
    if (item.id) localIds.add(String(item.id));
  });

  const seenIds = new Set(localIds);

  remoteArray.forEach(remoteItem => {
    if (!remoteItem.id) {
      console.log(`[MERGE] Skipping item without id in ${arrayName}`);
      return;
    }

    const id = String(remoteItem.id);
    if (seenIds.has(id)) {
      console.log(`[MERGE] Duplicate id ${id} in ${arrayName}, checking timestamps`);
      const localIndex = merged.findIndex(item => String(item.id) === id);
      if (localIndex !== -1) {
        const localItem = merged[localIndex];
        const localTime = localItem.updatedAt || localItem.createdAt || 0;
        const remoteTime = remoteItem.updatedAt || remoteItem.createdAt || 0;

        if (remoteTime > localTime) {
          console.log(`[MERGE] Remote is newer for ${id} in ${arrayName}`);
          merged[localIndex] = remoteItem;
        } else {
          console.log(`[MERGE] Local is newer or same for ${id} in ${arrayName}`);
        }
      }
    } else {
      console.log(`[MERGE] Adding new item ${id} to ${arrayName}`);
      merged.push(remoteItem);
      seenIds.add(id);
    }
  });

  console.log(`[MERGE] ${arrayName}: local=${localArray.length}, remote=${remoteArray.length}, merged=${merged.length}`);
  return merged;
}

// Merge objects with timestamp comparison
function mergeObjectsWithTimestamp(localObj, remoteObj, objName) {
  console.log(`[MERGE] Merging ${objName}`);
  if (!localObj) return remoteObj || {};
  if (!remoteObj) return localObj;

  const localTime = localObj.updatedAt || 0;
  const remoteTime = remoteObj.updatedAt || 0;

  if (remoteTime > localTime) {
    console.log(`[MERGE] Remote is newer for ${objName}`);
    return remoteObj;
  }
  console.log(`[MERGE] Local is newer or same for ${objName}`);
  return localObj;
}

// Merge cloud and local data with conflict protection
function mergeCloudAndLocalData(localData, cloudData) {
  console.log("[MERGE] Starting merge of cloud and local data");
  const merged = { ...localData };

  if (cloudData.plannerData) {
    merged.plannerData = mergeObjectsWithTimestamp(localData.plannerData, cloudData.plannerData, "plannerData");
  }

  if (cloudData.scheduleData) {
    merged.scheduleData = localData.scheduleData || {};
    if (cloudData.scheduleData.blocks) {
      merged.scheduleData.blocks = mergeArraysById(localData.scheduleData?.blocks, cloudData.scheduleData.blocks, "plannerBlocks");
    }
    if (cloudData.scheduleData.routines) {
      merged.scheduleData.routines = mergeArraysById(localData.scheduleData?.routines, cloudData.scheduleData.routines, "routines");
    }
  }

  if (cloudData.systemsData) {
    merged.systemsData = localData.systemsData || {};
    if (cloudData.systemsData.habits) {
      merged.systemsData.habits = mergeArraysById(localData.systemsData?.habits, cloudData.systemsData.habits, "habits");
    }
    if (cloudData.systemsData.goals) {
      merged.systemsData.goals = mergeArraysById(localData.systemsData?.goals, cloudData.systemsData.goals, "goals");
    }
    if (cloudData.systemsData.logs) {
      merged.systemsData.logs = mergeArraysById(localData.systemsData?.logs, cloudData.systemsData.logs, "logs");
    }
    if (cloudData.systemsData.tasks) {
      merged.systemsData.tasks = mergeArraysById(localData.systemsData?.tasks, cloudData.systemsData.tasks, "tasks");
    }
  }

  if (cloudData.socialData) {
    merged.socialData = localData.socialData || {};
    if (cloudData.socialData.friends) {
      merged.socialData.friends = mergeArraysById(localData.socialData?.friends, cloudData.socialData.friends, "friends");
    }
    if (cloudData.socialData.hangouts) {
      merged.socialData.hangouts = mergeArraysById(localData.socialData?.hangouts, cloudData.socialData.hangouts, "hangouts");
    }
    if (cloudData.socialData.ideas) {
      merged.socialData.ideas = mergeArraysById(localData.socialData?.ideas, cloudData.socialData.ideas, "ideas");
    }
  }

  if (cloudData.allZipData) {
    merged.allZipData = mergeArraysById(localData.allZipData, cloudData.allZipData, "allZipData");
  }

  if (cloudData.settingsData) {
    merged.settingsData = mergeObjectsWithTimestamp(localData.settingsData, cloudData.settingsData, "settingsData");
  }

  if (cloudData.customOptionsData) {
    merged.customOptionsData = mergeObjectsWithTimestamp(localData.customOptionsData, cloudData.customOptionsData, "customOptionsData");
  }

  merged.updatedAt = new Date().toISOString();
  console.log("[MERGE] Merge complete");
  return merged;
}

// Sync data to cloud
async function syncToCloud(data) {
  console.log("[SYNC] syncToCloud called");
  if (!supabaseClient) {
    console.log("[SYNC] Supabase not configured");
    return { success: false, error: "Supabase not configured" };
  }

  try {
    const ownerId = await getOwnerId();
    if (!ownerId) {
      console.log("[SYNC] No owner ID");
      return { success: false, error: "No owner ID" };
    }

    const syncState = createSyncState(data);
    console.log("[CLOUD] Uploading sync state with updatedAt:", syncState.updatedAt);

    // First, check if there's existing cloud data
    const { data: existingData, error: fetchError } = await supabaseClient
      .from("flow_planner_sync")
      .select("data, updated_at")
      .eq("user_id", ownerId)
      .maybeSingle();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("[CLOUD] Fetch error:", fetchError);
      throw fetchError;
    }

    // Conflict protection: if cloud is newer, don't overwrite
    if (existingData && existingData.updated_at) {
      const cloudTime = new Date(existingData.updated_at).getTime();
      const localTime = new Date(data.updatedAt || Date.now()).getTime();
      
      if (cloudTime > localTime) {
        console.log("[SYNC] Cloud data is newer, skipping upload to prevent overwrite");
        return { success: false, error: "Cloud data is newer", conflict: true };
      }
    }

    // Upsert sync state
    const { error: upsertError } = await supabaseClient
      .from("flow_planner_sync")
      .upsert({
        user_id: ownerId,
        data: syncState,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "user_id"
      });

    if (upsertError) {
      console.error("[CLOUD] Upsert error:", upsertError);
      throw upsertError;
    }

    console.log("[SYNC] Upload successful");
    localStorage.setItem("flow-planner-last-sync", new Date().toISOString());
    return { success: true };
  } catch (error) {
    console.error("[SYNC] syncToCloud error:", error);
    return { success: false, error: error.message };
  }
}

// Sync data from cloud
async function syncFromCloud(localData) {
  console.log("[SYNC] syncFromCloud called");
  if (!supabaseClient) {
    console.log("[SYNC] Supabase not configured");
    return { success: false, error: "Supabase not configured", data: null };
  }

  try {
    const ownerId = await getOwnerId();
    if (!ownerId) {
      console.log("[SYNC] No owner ID");
      return { success: false, error: "No owner ID", data: null };
    }

    console.log("[CLOUD] Fetching sync state");
    const { data, error } = await supabaseClient
      .from("flow_planner_sync")
      .select("data, updated_at")
      .eq("user_id", ownerId)
      .maybeSingle();

    if (error) {
      console.error("[CLOUD] Fetch error:", error);
      throw error;
    }

    if (!data) {
      console.log("[CLOUD] No cloud data found");
      return { success: true, data: null, isNew: true };
    }

    console.log("[CLOUD] Cloud data found, updatedAt:", data.updated_at);

    // Conflict protection: if local is newer, don't overwrite
    if (localData && localData.updatedAt) {
      const cloudTime = new Date(data.updated_at).getTime();
      const localTime = new Date(localData.updatedAt).getTime();
      
      if (localTime > cloudTime) {
        console.log("[SYNC] Local data is newer, skipping download to prevent overwrite");
        return { success: false, error: "Local data is newer", conflict: true, data: data.data };
      }
    }

    console.log("[SYNC] Download successful");
    localStorage.setItem("flow-planner-last-sync", new Date().toISOString());
    return { success: true, data: data.data };
  } catch (error) {
    console.error("[SYNC] syncFromCloud error:", error);
    return { success: false, error: error.message, data: null };
  }
}

window.flowSupabaseStorage = {
  client: supabaseClient,
  enabled: Boolean(supabaseClient),
  getOwnerId,
  saveAll,
  syncToCloud,
  syncFromCloud,
  mergeCloudAndLocalData
};
