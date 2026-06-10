console.log("Flow Import/Export Module Loaded");

(function() {
  "use strict";

  function getGlobal(name, fallback) {
    try { return typeof window[name] !== "undefined" ? window[name] : fallback; } catch { return fallback; }
  }

  function escapeHTML(value = "") {
    const div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  }

  function parseCSVLine(line) {
    const result = [];
    let current = "";
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { result.push(current.trim()); current = ""; }
      else current += char;
    }
    result.push(current.trim());
    return result;
  }

  function parseDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
  }

  function generateStableId(source, date, type, startTime, endTime, amount) {
    return [source || "import", date || "", type || "", startTime || "", endTime || "", amount || ""].join("-").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  }

  function parsePlanningCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error("CSV must include a header and at least one row.");
    const headers = parseCSVLine(lines[0]).map(header => header.toLowerCase());
    return lines.slice(1).map((line, index) => {
      const values = parseCSVLine(line);
      const row = {};
      headers.forEach((header, column) => { row[header] = values[column] || ""; });
      const type = (row.section || row.type || "log").toLowerCase();
      return {
        id: row.id || generateStableId("planning", row.date || row["due date"], type, row.start || row["start time"], row.end || row["end time"], index),
        title: row.title || row.name || row.task || row.notes || "Imported item",
        date: parseDate(row.date || row["due date"] || row["target date"]),
        type,
        priority: row.priority || "Medium",
        status: row.status || "Not Started",
        notes: row.notes || row.description || ""
      };
    });
  }

  function mergeAllZipData(existingData, importedData) {
    const existing = Array.isArray(existingData) ? existingData : [];
    const map = new Map(existing.map(item => [item.id, item]));
    let newCount = 0;
    let updateCount = 0;
    importedData.forEach(item => {
      if (!item.id) item.id = generateStableId("import", item.date, item.type, "", "", item.title);
      if (map.has(item.id)) {
        Object.assign(map.get(item.id), item, { updatedAt: new Date().toISOString() });
        updateCount += 1;
      } else {
        existing.push({ ...item, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        newCount += 1;
      }
    });
    return { newCount, updateCount, skipCount: 0, errors: [] };
  }

  let importPreviewData = null;

  function importAllZipDataJSON(jsonString) {
    const importedData = JSON.parse(jsonString);
    if (!Array.isArray(importedData)) return { success: false, message: "Expected a JSON array." };
    const result = mergeAllZipData(getGlobal("allZipData", []), importedData);
    return { success: true, message: "Preview ready.", preview: { rowsDetected: importedData.length, rowsNew: result.newCount, rowsUpdated: result.updateCount, rowsSkipped: result.skipCount, errors: result.errors, data: importedData } };
  }

  function importGoogleSheetsCSV(csvText) {
    const importedRows = parsePlanningCSV(csvText);
    const result = mergeAllZipData(getGlobal("allZipData", []), importedRows);
    return { success: true, message: "Preview ready.", preview: { rowsDetected: importedRows.length, rowsNew: result.newCount, rowsUpdated: result.updateCount, rowsSkipped: result.skipCount, errors: result.errors, data: importedRows } };
  }

  function showImportPreview(data) {
    importPreviewData = data;
    const preview = document.getElementById("importPreview");
    if (!preview) return;
    preview.innerHTML = `<div class="import-preview-content"><h4>Import Preview</h4><div class="preview-stats"><div><strong>${data.rowsDetected}</strong><span>Rows</span></div><div><strong>${data.rowsNew}</strong><span>New</span></div><div><strong>${data.rowsUpdated}</strong><span>Updated</span></div><div><strong>${data.rowsSkipped}</strong><span>Skipped</span></div></div>${data.errors.length ? `<div class="import-errors">${data.errors.map(escapeHTML).join("<br>")}</div>` : ""}<div class="button-row"><button onclick="flowImportExport.confirmImport()">Confirm</button><button class="secondary-btn" onclick="flowImportExport.cancelImport()">Cancel</button></div></div>`;
  }

  function confirmImport() {
    if (!importPreviewData?.data) return;
    const allZipData = getGlobal("allZipData", []);
    const result = mergeAllZipData(allZipData, importPreviewData.data);
    DataService.saveAllZipData(allZipData);
    getGlobal("saveAllAppState", () => {})();
    alert(`Import completed: ${result.newCount} new, ${result.updateCount} updated.`);
    cancelImport();
  }

  function cancelImport() {
    importPreviewData = null;
    const preview = document.getElementById("importPreview");
    if (preview) preview.innerHTML = "";
  }

  function handleAllZipImport() {
    const text = document.getElementById("allZipImportData")?.value.trim();
    if (!text) return alert("Paste JSON or CSV first.");
    let result;
    try { result = importAllZipDataJSON(text); } catch { result = importGoogleSheetsCSV(text); }
    if (result.preview) showImportPreview(result.preview);
    else alert(result.message);
  }

  window.flowImportExport = { importAllZipDataJSON, importGoogleSheetsCSV, confirmImport, cancelImport, handleAllZipImport, generateStableId, parsePlanningCSV, mergeAllZipData };
})();
