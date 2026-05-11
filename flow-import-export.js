/**
 * Flow Planner — Enhanced Import / Export
 * Drop this file AFTER app.js in index.html.
 * It monkey-patches the Settings page and adds all import/export logic.
 *
 * What it adds:
 *   • Export full backup (JSON download)
 *   • Import: file upload OR paste JSON
 *   • Live preview (counts everything before committing)
 *   • Merge mode  — adds new items, never deletes what you have
 *   • Replace mode — full overwrite (with confirm dialog)
 *   • Validation with friendly error messages
 *   • Re-renders app cleanly after import
 */

/* ─── State ──────────────────────────────────────────────────────────────── */

let _importPreviewState = null;   // parsed backup waiting for user choice
let _importMode         = "file"; // "file" | "paste"

/* ─── Override the Settings page ────────────────────────────────────────── */

// Keep the original Settings for the Social-import card at the bottom.
const _originalSettings = pages.Settings;

pages.Settings = () => `
  ${renderExportCard()}
  ${renderImportCard()}
  ${renderClearDataCard()}
  ${renderSocialImportCard()}
`;

// Re-export so getPageHTML() picks up the new version
// (getPageHTML already calls pages[tab] so no extra work needed)

/* ─── Export Card ────────────────────────────────────────────────────────── */

function renderExportCard() {
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div>
          <h3>Export Backup</h3>
          <p class="muted-text" style="margin-top:4px">Download everything as a JSON file. Keep it safe — you can restore from it any time.</p>
        </div>
        <button onclick="flowExportBackup()" style="width:auto;min-width:160px;margin-top:0">
          Download Backup
        </button>
      </div>
    </div>
  `;
}

/* ─── Import Card ────────────────────────────────────────────────────────── */

function renderImportCard() {
  const hasPreview = Boolean(_importPreviewState);
  const counts     = hasPreview ? _getImportCounts(_importPreviewState) : null;

  return `
    <div class="card">
      <h3>Import Backup</h3>
      <p class="settings-warning" style="margin-top:6px">
        <strong>Merge</strong> adds new items without touching your existing data.<br>
        <strong>Replace</strong> overwrites everything — export first if unsure.
      </p>

      <!-- Mode toggle -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
        <button
          class="${_importMode === "file" ? "" : "secondary-btn"}"
          onclick="flowSetImportMode('file')"
          style="margin-top:0"
        >Upload File</button>
        <button
          class="${_importMode === "paste" ? "" : "secondary-btn"}"
          onclick="flowSetImportMode('paste')"
          style="margin-top:0"
        >Paste JSON</button>
      </div>

      <!-- Input area -->
      ${_importMode === "file" ? `
        <label class="file-upload-box" style="margin-top:10px">
          <span>Choose a JSON backup file</span>
          <input
            type="file"
            accept=".json,application/json"
            onchange="flowHandleImportFile(event)"
          >
        </label>
      ` : `
        <textarea
          id="flowImportPasteArea"
          placeholder="Paste your Flow Planner backup JSON here…"
          style="min-height:130px;margin-top:10px;font-family:monospace;font-size:12px"
        ></textarea>
        <button class="secondary-btn" onclick="flowPreviewFromPaste()" style="margin-top:8px">
          Preview JSON
        </button>
      `}

      <!-- Preview -->
      <div id="flowImportPreview" style="margin-top:10px">
        ${hasPreview
          ? _renderPreviewGrid(counts, _importPreviewState)
          : `<p class="muted-text" style="text-align:center;padding:14px 0;font-size:13px">
              Upload or paste a backup to see a preview before importing.
             </p>`
        }
      </div>

      <!-- Action buttons (only shown when preview is ready) -->
      ${hasPreview ? `
        <p class="muted-text" style="margin-top:2px;font-size:13px">
          How do you want to handle your existing data?
        </p>
        <div class="button-row" style="margin-top:8px">
          <button class="secondary-btn" onclick="flowConfirmImport('merge')">
            Merge (safe)
          </button>
          <button class="danger-btn" onclick="flowConfirmImport('replace')">
            Replace all
          </button>
        </div>
        <button class="secondary-btn" onclick="flowCancelImport()" style="margin-top:8px">
          Cancel
        </button>
      ` : ""}
    </div>
  `;
}

/* ─── Clear-data Card ────────────────────────────────────────────────────── */

function renderClearDataCard() {
  return `
    <div class="card">
      <h3>Clear Data</h3>
      <p class="muted-text" style="margin-top:4px">
        Permanently delete sections of your data. Export a backup first!
      </p>
      <div style="display:grid;gap:8px;margin-top:10px">
        <button class="danger-btn" onclick="clearPlanner()">Clear Planner</button>
        <button class="danger-btn" onclick="clearSystems()">Clear Systems</button>
        <button class="danger-btn" onclick="clearSocial()">Clear Social</button>
      </div>
    </div>
  `;
}

/* ─── Social-import Card (preserve existing UI) ──────────────────────────── */

function renderSocialImportCard() {
  return `
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
  `;
}

/* ─── Preview grid renderer ──────────────────────────────────────────────── */

function _renderPreviewGrid(counts, parsed) {
  const exportedAt = parsed.exportedAt
    ? new Date(parsed.exportedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  const items = [
    ["Blocks",    counts.blocks   ],
    ["Routines",  counts.routines ],
    ["Habits",    counts.habits   ],
    ["Goals",     counts.goals    ],
    ["Metrics",   counts.metrics  ],
    ["Trackers",  counts.trackers ],
    ["Logs",      counts.logs     ],
    ["Friends",   counts.friends  ],
    ["Hangouts",  counts.hangouts ],
    ["Ideas",     counts.ideas    ],
  ];

  return `
    <div style="border:1px solid var(--border);border-radius:14px;overflow:hidden">
      ${exportedAt ? `
        <div style="padding:9px 14px;background:var(--surface-2);border-bottom:1px solid var(--border)">
          <p class="muted-text" style="font-size:12px">
            Backup from ${escapeHTML(exportedAt)}
          </p>
        </div>
      ` : ""}
      <div style="padding:12px 14px">
        <p style="font-weight:700;font-size:13px;margin-bottom:10px">
          Preview — what will be imported:
        </p>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
          ${items.map(([label, n]) => `
            <div style="text-align:center;padding:8px 4px;border-radius:10px;background:var(--surface);border:1px solid var(--border)">
              <strong style="display:block;font-size:17px;letter-spacing:-0.5px">${n}</strong>
              <span style="font-size:10px;color:var(--text-muted)">${escapeHTML(label)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

/* ─── Count helper ───────────────────────────────────────────────────────── */

function _getImportCounts(parsed) {
  // Support both {plannerData, scheduleData, …} (old native format)
  // and {data: {planner, schedule, …}} (export-module format)
  const d        = parsed.data || parsed;
  const planner  = d.plannerData  || d.planner  || {};
  const schedule = d.scheduleData || d.schedule || {};
  const systems  = d.systemsData  || d.systems  || {};
  const social   = d.socialData   || d.social   || {};

  return {
    blocks:   (schedule.blocks   || []).filter(b => !b.isBuffer).length,
    routines: (schedule.routines || []).length,
    habits:   (systems.habits    || []).length,
    goals:    (systems.goals     || []).length,
    metrics:  (systems.metrics   || []).length,
    trackers: (systems.trackers  || []).length,
    logs:     (systems.logs      || []).length,
    friends:  (social.friends    || []).length,
    hangouts: (social.hangouts   || []).length,
    ideas:    (social.ideas      || []).length,
  };
}

/* ─── Validation ─────────────────────────────────────────────────────────── */

function _validateImport(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "Must be a JSON object, not an array or primitive.";
  }

  const d = parsed.data || parsed;

  // Detect at least one recognised section
  const knownKeys = [
    "plannerData","scheduleData","systemsData","socialData",
    "planner","schedule","systems","social",
  ];
  const hasSection = knownKeys.some(k => d[k] && typeof d[k] === "object");
  if (!hasSection) {
    return "No Flow Planner data found. The JSON must include at least one of: plannerData, scheduleData, systemsData, or socialData.";
  }

  // Spot-check array types
  const checks = [
    [d.plannerData  || d.planner,  "plans",    "plannerData.plans"   ],
    [d.scheduleData || d.schedule, "blocks",   "scheduleData.blocks" ],
    [d.scheduleData || d.schedule, "routines", "scheduleData.routines"],
    [d.systemsData  || d.systems,  "habits",   "systemsData.habits"  ],
    [d.systemsData  || d.systems,  "goals",    "systemsData.goals"   ],
    [d.socialData   || d.social,   "friends",  "socialData.friends"  ],
    [d.socialData   || d.social,   "hangouts", "socialData.hangouts" ],
  ];

  for (const [section, key, label] of checks) {
    if (section && section[key] !== undefined && !Array.isArray(section[key])) {
      return `${label} must be an array, got ${typeof section[key]}.`;
    }
  }

  return null; // null = valid
}

/* ─── Public action handlers ─────────────────────────────────────────────── */

function flowSetImportMode(mode) {
  _importMode = mode;
  _importPreviewState = null;
  main.innerHTML = getPageHTML("Settings");
}

function flowHandleImportFile(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onerror = () => showToast("Could not read that file.", "error");
  reader.onload  = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); }
    catch { showToast("Invalid JSON file — check the file and try again.", "error"); return; }

    const err = _validateImport(parsed);
    if (err) { showToast(err, "error"); return; }

    _importPreviewState = parsed;
    main.innerHTML = getPageHTML("Settings");
    // Scroll preview into view
    document.getElementById("flowImportPreview")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  reader.readAsText(file);
}

function flowPreviewFromPaste() {
  const raw = document.getElementById("flowImportPasteArea")?.value?.trim();
  if (!raw) { showToast("Paste your backup JSON first.", "error"); return; }

  // Strip optional markdown fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch { showToast("Invalid JSON — check for missing commas, brackets, or quotes.", "error"); return; }

  const err = _validateImport(parsed);
  if (err) { showToast(err, "error"); return; }

  _importPreviewState = parsed;
  main.innerHTML = getPageHTML("Settings");
}

function flowCancelImport() {
  _importPreviewState = null;
  main.innerHTML = getPageHTML("Settings");
}

function flowConfirmImport(mode) {
  if (!_importPreviewState) return;

  if (mode === "replace") {
    if (!confirm(
      "Replace ALL your current data with this backup?\n\nThis cannot be undone — export your current backup first if you want to keep it."
    )) return;
  }

  const parsed  = _importPreviewState;
  const d       = parsed.data || parsed;

  const incoming = {
    plannerData:  d.plannerData  || d.planner  || null,
    scheduleData: d.scheduleData || d.schedule || null,
    systemsData:  d.systemsData  || d.systems  || null,
    socialData:   d.socialData   || d.social   || null,
  };

  try {
    if (mode === "replace") {
      _doReplace(incoming);
    } else {
      _doMerge(incoming);
    }
  } catch (err) {
    showToast("Import failed: " + (err.message || "Unknown error"), "error");
    return;
  }

  _importPreviewState = null;
  _importMode = "file";

  const verb = mode === "replace" ? "replaced" : "merged";
  showToast(`Data ${verb} successfully — reloading…`);

  setTimeout(() => {
    // Reset editing state
    editingBlockIndex   = null;
    editingHabitIndex   = null;
    editingGoalIndex    = null;
    editingMetricIndex  = null;
    editingFriendIndex  = null;
    editingHangoutIndex = null;
    editingIdeaIndex    = null;
    editingRoutineIndex = null;
    selectedPlannerDate = getTodayISO();
    visiblePlannerMonth = selectedPlannerDate.slice(0, 7);

    setActiveBottomNav("Home");
    main.innerHTML = getPageHTML("Home");
    renderHome();
  }, 900);
}

/* ─── Replace logic ──────────────────────────────────────────────────────── */

function _doReplace(incoming) {
  if (incoming.plannerData) {
    plannerData = normalizePlannerBackupData(incoming.plannerData);
    savePlannerData();
  }
  if (incoming.scheduleData) {
    scheduleData = normalizeScheduleBackupData(incoming.scheduleData);
    saveScheduleData();
  }
  if (incoming.systemsData) {
    systemsData = normalizeSystemsBackupData(incoming.systemsData);
    saveSystemsData();
  }
  if (incoming.socialData) {
    socialData = normalizeSocialBackupData(incoming.socialData);
    saveSocialData();
  }
}

/* ─── Merge logic ────────────────────────────────────────────────────────── */

function _doMerge(incoming) {
  // ── Planner (merge plans by title+date) ──
  if (incoming.plannerData) {
    const norm = normalizePlannerBackupData(incoming.plannerData);
    const existingKeys = new Set(plannerData.plans.map(p => `${p.title}::${p.date}`));
    norm.plans.forEach(plan => {
      const key = `${plan.title}::${plan.date}`;
      if (!existingKeys.has(key)) {
        plannerData.plans.push(plan);
        existingKeys.add(key);
      }
    });
    savePlannerData();
  }

  // ── Schedule (merge blocks + routines by ID) ──
  if (incoming.scheduleData) {
    const norm = normalizeScheduleBackupData(incoming.scheduleData);

    const existingBlockIds = new Set(scheduleData.blocks.map(b => b.id));
    norm.blocks.filter(b => !b.isBuffer).forEach(block => {
      if (!existingBlockIds.has(block.id)) {
        scheduleData.blocks.push(block);
        existingBlockIds.add(block.id);
      }
    });

    const existingRoutineIds = new Set(scheduleData.routines.map(r => r.id));
    norm.routines.forEach(routine => {
      if (!existingRoutineIds.has(routine.id)) {
        scheduleData.routines.push(routine);
        existingRoutineIds.add(routine.id);
      }
    });

    saveScheduleData();
  }

  // ── Systems (merge all arrays by ID) ──
  if (incoming.systemsData) {
    const norm = normalizeSystemsBackupData(incoming.systemsData);

    function mergeById(existing, incoming) {
      const ids = new Set(existing.map(item => item.id));
      incoming.forEach(item => {
        if (!ids.has(item.id)) { existing.push(item); ids.add(item.id); }
      });
    }

    mergeById(systemsData.habits,   norm.habits);
    mergeById(systemsData.logs,     norm.logs);
    mergeById(systemsData.trackers, norm.trackers);
    mergeById(systemsData.goals,    norm.goals);
    mergeById(systemsData.metrics,  norm.metrics);
    saveSystemsData();
  }

  // ── Social ──
  if (incoming.socialData) {
    const norm = normalizeSocialBackupData(incoming.socialData);

    // Friends — dedupe by name (case-insensitive)
    const existingNames = new Set(socialData.friends.map(f => f.name.trim().toLowerCase()));
    norm.friends.forEach(friend => {
      const key = friend.name.trim().toLowerCase();
      if (!existingNames.has(key)) {
        socialData.friends.push(friend);
        existingNames.add(key);
      }
    });

    // Hangouts — dedupe by existing key function
    const existingHangoutKeys = new Set(socialData.hangouts.map(getHangoutDuplicateKey));
    norm.hangouts.forEach(hangout => {
      const key = getHangoutDuplicateKey(hangout);
      if (!existingHangoutKeys.has(key)) {
        socialData.hangouts.push(hangout);
        existingHangoutKeys.add(key);
      }
    });

    // Ideas — dedupe by title (case-insensitive)
    const existingIdeaTitles = new Set(socialData.ideas.map(i => i.title.trim().toLowerCase()));
    norm.ideas.forEach(idea => {
      const key = idea.title.trim().toLowerCase();
      if (!existingIdeaTitles.has(key)) {
        socialData.ideas.push(idea);
        existingIdeaTitles.add(key);
      }
    });

    saveSocialData();
  }
}

/* ─── Export ─────────────────────────────────────────────────────────────── */

function flowExportBackup() {
  const backup = {
    exportedAt:   new Date().toISOString(),
    version:      "2",
    appVersion:   "Flow Planner",
    plannerData,
    scheduleData,
    systemsData,
    socialData,
  };

  const json = JSON.stringify(backup, null, 2);

  // Also copy to clipboard silently (best-effort)
  if (navigator.clipboard) navigator.clipboard.writeText(json).catch(() => {});

  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `flow-planner-backup-${getTodayISO()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast("Backup downloaded — keep that file somewhere safe!");
}
