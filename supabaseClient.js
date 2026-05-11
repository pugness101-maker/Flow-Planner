import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://vryerurkxahqotzjidyc.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey && !supabaseAnonKey.includes("<"));
const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;

let ownerIdPromise;

async function getOwnerId() {
  if (!supabase) return null;
  if (!ownerIdPromise) {
    ownerIdPromise = (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user?.id) return sessionData.session.user.id;

      const { data, error } = await supabase.auth.signInAnonymously();
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
  if (!supabase) return { skipped: true };
  const ownerId = await getOwnerId();
  const { error: deleteError } = await supabase
    .from(tableName)
    .delete()
    .eq("owner_id", ownerId);
  if (deleteError) throw deleteError;
  if (!rows.length) return { count: 0 };
  const rowsWithOwner = await Promise.all(rows.map(withOwner));
  const { error } = await supabase.from(tableName).insert(rowsWithOwner);
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
    deadline: goal.deadline || null,
    status: goal.status || "",
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
    type: log.type || log.valueType || "Custom",
    value: log.value || "",
    date: log.date || null,
    notes: log.notes || "",
    payload: log
  };
}

let saveTimer;
async function saveAll(data) {
  if (!supabase) return;
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
      console.warn("Supabase sync failed; localStorage fallback is still active.", error);
    }
  }, 400);
}

window.flowSupabaseStorage = {
  client: supabase,
  enabled: Boolean(supabase),
  getOwnerId,
  saveAll
};
