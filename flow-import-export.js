console.log("Flow Import/Export Module Loaded");

(function() {
  'use strict';

  // Safe access to global variables
  const getGlobal = (name, fallback) => {
    try {
      return typeof window[name] !== 'undefined' ? window[name] : fallback;
    } catch (e) {
      return fallback;
    }
  };

  // Generate stable ID for import rows
  function generateStableId(source, date, type, startTime, endTime, amount) {
    const parts = [
      source || 'import',
      date || '',
      type || '',
      startTime || '',
      endTime || '',
      String(amount || '')
    ];
    return parts.join('|').replace(/\|+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');
  }

  // Parse CSV line (handles quoted fields)
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  // Parse Google Sheets CSV
  function parseGoogleSheetsCSV(csvText, layoutType) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      throw new Error("CSV must have at least a header row and one data row");
    }

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }

    // Convert based on layout type
    return convertToMasterLog(rows, layoutType);
  }

  // Convert layout-specific rows to master log schema
  function convertToMasterLog(rows, layoutType) {
    const now = new Date().toISOString();
    const masterRows = [];

    rows.forEach((row, index) => {
      let masterRow = {
        id: '',
        date: '',
        source: 'import',
        category: '',
        type: '',
        name: '',
        amount: '',
        unit: '',
        startTime: '',
        endTime: '',
        durationMinutes: '',
        status: 'completed',
        notes: '',
        linkedGoalId: '',
        linkedHabitId: '',
        linkedPlannerBlockId: '',
        createdAt: now,
        updatedAt: now
      };

      switch (layoutType) {
        case 'session':
          // Date, Duration (hrs), Amount (g), Full Start, Full End, Break Dur.
          masterRow.date = formatDate(row.date || row['date']);
          masterRow.amount = row['amount (g)'] || row.amount || '';
          masterRow.unit = 'g';
          masterRow.category = 'Health';
          masterRow.type = 'Taper';
          masterRow.startTime = formatTime(row['full start'] || '');
          masterRow.endTime = formatTime(row['full end'] || '');
          masterRow.durationMinutes = parseDurationHours(row['duration (hrs)'] || '');
          masterRow.notes = `Break duration: ${row['break dur.'] || 'N/A'}`;
          break;

        case 'weight':
          // Date, lb
          masterRow.date = formatDate(row.date);
          masterRow.amount = row.lb || row.amount || '';
          masterRow.unit = 'lbs';
          masterRow.category = 'Health';
          masterRow.type = 'Weight';
          masterRow.name = 'Weight Log';
          break;

        case 'metrics':
          // Date, Bedtime, Wake-Up, Nap Start, Nap End, Nap Duration, Sleep Duration, 
          // Time Awake, Last Use → Bed Gap, Screen Time, Social Time, Social %, Use Day
          masterRow.date = formatDate(row.date);
          masterRow.category = 'Health';
          masterRow.type = 'Metrics';
          masterRow.name = 'Daily Metrics';
          masterRow.notes = [
            `Bedtime: ${row.bedtime || 'N/A'}`,
            `Wake-Up: ${row['wake-up'] || 'N/A'}`,
            `Sleep Duration: ${row['sleep duration'] || 'N/A'}`,
            `Screen Time: ${row['screen time'] || 'N/A'}`,
            `Social Time: ${row['social time'] || 'N/A'}`,
            `Use Day: ${row['use day'] || 'N/A'}`
          ].join(', ');
          break;

        case 'buy':
          // Date, Purchased (g), Cost, Cost per g, Running $/Month, g/Day, Time Start, Finish, Notes, Last Dur.
          masterRow.date = formatDate(row.date);
          masterRow.amount = row['purchased (g)'] || row.amount || '';
          masterRow.unit = 'g';
          masterRow.category = 'Finance';
          masterRow.type = 'Purchase';
          masterRow.name = 'Purchase Log';
          masterRow.startTime = formatTime(row['time start'] || '');
          masterRow.endTime = formatTime(row.finish || '');
          masterRow.notes = [
            `Cost: ${row.cost || 'N/A'}`,
            `Cost per g: ${row['cost per g'] || 'N/A'}`,
            row.notes || ''
          ].filter(Boolean).join(', ');
          break;

        case 'social':
          // date, friend/name, startTime, endTime, duration, notes, type/category
          masterRow.date = formatDate(row.date);
          masterRow.category = 'Social';
          masterRow.type = row['type/category'] || 'Hangout';
          masterRow.name = row['friend/name'] || 'Social';
          masterRow.startTime = formatTime(row.starttime || row['start time'] || '');
          masterRow.endTime = formatTime(row.endtime || row['end time'] || '');
          masterRow.durationMinutes = parseDurationMinutes(row.duration || '');
          masterRow.notes = row.notes || '';
          break;

        case 'sessions_json':
          // Sessions JSON format: amount, date, startTime, endDate, endTime, duration, status, notes
          masterRow.date = parseUSDate(row.date);
          masterRow.amount = row.amount || '';
          masterRow.unit = 'g';
          masterRow.category = 'Health';
          masterRow.type = 'Session';
          masterRow.name = 'Session Log';
          masterRow.startTime = parseTimeAMPM(row.startTime);
          masterRow.endTime = parseTimeAMPM(row.endTime);
          masterRow.durationMinutes = parseDurationHMSToMinutes(row.duration);
          masterRow.status = row.status || 'completed';
          masterRow.notes = row.notes || '';
          break;

        default:
          // Generic CSV - try to map common fields
          masterRow.date = formatDate(row.date);
          masterRow.amount = row.amount || row.value || '';
          masterRow.unit = row.unit || '';
          masterRow.category = row.category || 'Custom';
          masterRow.type = row.type || 'Log';
          masterRow.name = row.name || row.title || 'Imported Log';
          masterRow.startTime = formatTime(row.starttime || row['start time'] || '');
          masterRow.endTime = formatTime(row.endtime || row['end time'] || '');
          masterRow.durationMinutes = row.durationminutes || row['duration minutes'] || '';
          masterRow.notes = row.notes || '';
      }

      // Generate stable ID
      masterRow.id = generateStableId(
        masterRow.source,
        masterRow.date,
        masterRow.type,
        masterRow.startTime,
        masterRow.endTime,
        masterRow.amount
      );

      masterRows.push(masterRow);
    });

    return masterRows;
  }

  // Format date to ISO
  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toISOString().split('T')[0];
    } catch (e) {
      return dateStr;
    }
  }

  // Format time string
  function formatTime(timeStr) {
    if (!timeStr) return '';
    return timeStr.trim().substring(0, 5); // HH:MM
  }

  // Parse duration in hours to minutes
  function parseDurationHours(hoursStr) {
    if (!hoursStr) return '';
    const hours = parseFloat(hoursStr);
    if (isNaN(hours)) return '';
    return String(Math.round(hours * 60));
  }

  // Parse duration in minutes
  function parseDurationMinutes(minStr) {
    if (!minStr) return '';
    const mins = parseFloat(minStr);
    if (isNaN(mins)) return '';
    return String(Math.round(mins));
  }

  // Parse US date format (M/D/YYYY) to ISO
  function parseUSDate(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        const year = parts[2];
        return `${year}-${month}-${day}`;
      }
      return formatDate(dateStr);
    } catch (e) {
      return formatDate(dateStr);
    }
  }

  // Parse time with AM/PM to HH:MM format
  function parseTimeAMPM(timeStr) {
    if (!timeStr) return '';
    try {
      const parts = timeStr.trim().split(' ');
      if (parts.length === 2) {
        const time = parts[0];
        const period = parts[1].toUpperCase();
        const [hours, minutes, seconds] = time.split(':');
        let hour = parseInt(hours, 10);
        if (period === 'PM' && hour !== 12) hour += 12;
        if (period === 'AM' && hour === 12) hour = 0;
        return `${String(hour).padStart(2, '0')}:${minutes}`;
      }
      return formatTime(timeStr);
    } catch (e) {
      return formatTime(timeStr);
    }
  }

  // Parse duration from HH:MM:SS to minutes
  function parseDurationHMSToMinutes(durationStr) {
    if (!durationStr) return '';
    try {
      const parts = durationStr.split(':');
      if (parts.length === 3) {
        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        const seconds = parseInt(parts[2], 10) || 0;
        return String(hours * 60 + minutes + Math.round(seconds / 60));
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  // Merge imported allZipData with existing
  function mergeAllZipData(existingData, importedData) {
    const existingMap = new Map(existingData.map(item => [item.id, item]));
    let newCount = 0;
    let updateCount = 0;
    let skipCount = 0;
    const errors = [];

    importedData.forEach(importedRow => {
      if (!importedRow.id) {
        errors.push(`Row missing ID: ${JSON.stringify(importedRow)}`);
        return;
      }

      const existing = existingMap.get(importedRow.id);

      if (!existing) {
        // New row
        existingData.push(importedRow);
        newCount++;
      } else {
        // Existing row - check if update needed
        const importedTime = new Date(importedRow.updatedAt).getTime();
        const existingTime = new Date(existing.updatedAt).getTime();

        if (importedTime > existingTime) {
          // Update with newer data
          const index = existingData.findIndex(item => item.id === importedRow.id);
          if (index !== -1) {
            existingData[index] = { ...existing, ...importedRow };
            updateCount++;
          }
        } else {
          // Merge missing fields
          let merged = false;
          Object.keys(importedRow).forEach(key => {
            if (existing[key] === undefined || existing[key] === '') {
              existing[key] = importedRow[key];
              merged = true;
            }
          });
          if (merged) {
            updateCount++;
          } else {
            skipCount++;
          }
        }
      }
    });

    return { newCount, updateCount, skipCount, errors };
  }

  // Import preview state
  let importPreviewData = null;

  // Show import preview
  function showImportPreview(data) {
    importPreviewData = data;
    const previewDiv = document.getElementById('importPreview');
    if (!previewDiv) {
      console.error("[IMPORT/EXPORT] Import preview element not found");
      return;
    }

    previewDiv.innerHTML = `
      <div class="import-preview-content">
        <h4>Import Preview</h4>
        <div class="preview-stats">
          <div><strong>${data.rowsDetected}</strong><span>Rows Detected</span></div>
          <div><strong>${data.rowsNew}</strong><span>New Rows</span></div>
          <div><strong>${data.rowsUpdated}</strong><span>Updated Rows</span></div>
          <div><strong>${data.rowsSkipped}</strong><span>Skipped Rows</span></div>
          ${data.errors.length > 0 ? `<div><strong>${data.errors.length}</strong><span>Errors</span></div>` : ''}
        </div>
        ${data.errors.length > 0 ? `
          <div class="import-errors">
            <h5>Errors:</h5>
            <ul>${data.errors.map(e => `<li>${escapeHTML(e)}</li>`).join('')}</ul>
          </div>
        ` : ''}
        <div class="button-row">
          <button onclick="flowImportExport.confirmImport()">Confirm Import</button>
          <button class="secondary-btn" onclick="flowImportExport.cancelImport()">Cancel</button>
        </div>
      </div>
    `;
  }

  // Escape HTML
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Export full backup
  function exportFullBackup() {
    try {
      const json = DataService.exportAllData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flow-planner-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log("[IMPORT/EXPORT] Full backup exported successfully");
    } catch (e) {
      console.error("[IMPORT/EXPORT] Export failed:", e);
      alert("Export failed: " + e.message);
    }
  }

  // Import full backup
  function importFullBackup(jsonString) {
    try {
      const success = DataService.importAllData(jsonString);
      if (success) {
        console.log("[IMPORT/EXPORT] Full backup imported successfully");
        return { success: true, message: "Import successful! Data has been merged." };
      } else {
        return { success: false, message: "Import failed. Please check the JSON format." };
      }
    } catch (e) {
      console.error("[IMPORT/EXPORT] Import failed:", e);
      return { success: false, message: "Import failed: " + e.message };
    }
  }

  // Import All Zip Data from JSON
  function importAllZipDataJSON(jsonString) {
    try {
      const importedData = JSON.parse(jsonString);
      if (!Array.isArray(importedData)) {
        return { success: false, message: "Invalid format: Expected array of rows" };
      }

      const allZipData = getGlobal('allZipData', []);
      const result = mergeAllZipData(allZipData, importedData);

      return {
        success: true,
        message: `Import preview: ${result.newCount} new, ${result.updateCount} updated, ${result.skipCount} skipped`,
        preview: {
          rowsDetected: importedData.length,
          rowsNew: result.newCount,
          rowsUpdated: result.updateCount,
          rowsSkipped: result.skipCount,
          errors: result.errors,
          data: importedData
        }
      };
    } catch (e) {
      console.error("[IMPORT/EXPORT] JSON import failed:", e);
      return { success: false, message: "Import failed: " + e.message };
    }
  }

  // Import Google Sheets CSV
  function importGoogleSheetsCSV(csvText, layoutType) {
    try {
      const importedRows = parseGoogleSheetsCSV(csvText, layoutType);
      const allZipData = getGlobal('allZipData', []);
      const result = mergeAllZipData(allZipData, importedRows);

      return {
        success: true,
        message: `Import preview: ${result.newCount} new, ${result.updateCount} updated, ${result.skipCount} skipped`,
        preview: {
          rowsDetected: importedRows.length,
          rowsNew: result.newCount,
          rowsUpdated: result.updateCount,
          rowsSkipped: result.skipCount,
          errors: result.errors,
          data: importedRows
        }
      };
    } catch (e) {
      console.error("[IMPORT/EXPORT] CSV import failed:", e);
      return { success: false, message: "Import failed: " + e.message };
    }
  }

  // Confirm import
  function confirmImport() {
    if (!importPreviewData || !importPreviewData.data) {
      console.error("[IMPORT/EXPORT] No import data to confirm");
      return;
    }

    try {
      const allZipData = getGlobal('allZipData', []);
      const result = mergeAllZipData(allZipData, importPreviewData.data);

      // Save to DataService
      DataService.saveAllZipData(allZipData);

      // Call saveAllAppState if available
      const saveAllAppState = getGlobal('saveAllAppState', null);
      if (saveAllAppState && typeof saveAllAppState === 'function') {
        saveAllAppState();
      }

      console.log("[IMPORT/EXPORT] Import confirmed:", result);
      alert(`Import completed: ${result.newCount} new, ${result.updateCount} updated, ${result.skipCount} skipped`);

      // Clear preview
      importPreviewData = null;
      const previewDiv = document.getElementById('importPreview');
      if (previewDiv) previewDiv.innerHTML = '';

      // Refresh current page if possible
      const currentPage = getGlobal('activePage', null);
      if (currentPage) {
        const setPage = getGlobal('setPage', null);
        if (setPage && typeof setPage === 'function') {
          setPage(currentPage);
        }
      }
    } catch (e) {
      console.error("[IMPORT/EXPORT] Confirm import failed:", e);
      alert("Import failed: " + e.message);
    }
  }

  // Cancel import
  function cancelImport() {
    importPreviewData = null;
    const previewDiv = document.getElementById('importPreview');
    if (previewDiv) previewDiv.innerHTML = '';
    console.log("[IMPORT/EXPORT] Import cancelled");
  }

  // Add UI to Settings page
  function addSettingsUI() {
    const settingsContent = document.querySelector('.settings-content');
    if (!settingsContent) {
      console.log("[IMPORT/EXPORT] Settings page not ready, will retry");
      return false;
    }

    // Check if UI already added
    if (document.getElementById('flowImportExportSection')) {
      return true;
    }

    const uiHTML = `
      <div id="flowImportExportSection" class="card">
        <h3>Import/Export</h3>
        
        <h4>Full Backup</h4>
        <p class="muted-text">Export or import complete application backup (all data).</p>
        <div class="button-row">
          <button onclick="flowImportExport.exportFullBackup()">Export Full Backup</button>
        </div>
        <div class="form-group">
          <textarea id="fullBackupImportJson" placeholder="Paste full backup JSON here..." rows="5"></textarea>
          <button onclick="flowImportExport.handleFullBackupImport()">Import Full Backup</button>
        </div>

        <h4>All Zip Data Import</h4>
        <p class="muted-text">Import master log data from JSON or Google Sheets CSV.</p>
        
        <div class="form-group">
          <label>Import Type</label>
          <select id="importLayoutType">
            <option value="generic">Generic CSV/JSON</option>
            <option value="session">Session/Coke Use</option>
            <option value="weight">Weight Log</option>
            <option value="metrics">Daily Metrics</option>
            <option value="buy">Purchase/Buy Log</option>
            <option value="social">Social Hangouts</option>
            <option value="sessions_json">Sessions JSON</option>
          </select>
        </div>

        <div class="form-group">
          <label>Paste JSON or CSV data</label>
          <textarea id="allZipImportData" placeholder="Paste JSON array or CSV data here..." rows="5"></textarea>
        </div>
        
        <div class="button-row">
          <button onclick="flowImportExport.handleAllZipImport()">Preview Import</button>
        </div>

        <div id="importPreview" class="import-preview"></div>
      </div>
    `;

    settingsContent.insertAdjacentHTML('beforeend', uiHTML);
    console.log("[IMPORT/EXPORT] Settings UI added");
    return true;
  }

  // Handle full backup import
  function handleFullBackupImport() {
    const textarea = document.getElementById('fullBackupImportJson');
    const jsonString = textarea.value.trim();
    if (!jsonString) {
      alert("Please paste a backup JSON to import.");
      return;
    }

    const result = importFullBackup(jsonString);
    if (result.success) {
      alert(result.message);
      textarea.value = '';
      location.reload();
    } else {
      alert(result.message);
    }
  }

  // Handle All Zip Data import
  function handleAllZipImport() {
    const textarea = document.getElementById('allZipImportData');
    const layoutType = document.getElementById('importLayoutType').value;
    const data = textarea.value.trim();
    if (!data) {
      alert("Please paste JSON or CSV data to import.");
      return;
    }

    let result;
    try {
      // Try JSON first
      result = importAllZipDataJSON(data);
    } catch (e) {
      // Fall back to CSV
      result = importGoogleSheetsCSV(data, layoutType);
    }

    if (result.success) {
      if (result.preview) {
        showImportPreview(result.preview);
      } else {
        alert(result.message);
      }
    } else {
      alert(result.message);
    }
  }

  // Initialize module
  function init() {
    console.log("[IMPORT/EXPORT] Initializing");

    // Try to add UI to Settings
    const addUI = () => {
      if (addSettingsUI()) {
        console.log("[IMPORT/EXPORT] UI added successfully");
      } else {
        console.log("[IMPORT/EXPORT] Settings not ready, retrying...");
        setTimeout(addUI, 500);
      }
    };

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addUI);
    } else {
      addUI();
    }
  }

  // Public API
  window.flowImportExport = {
    disabled: false,
    exportFullBackup,
    importFullBackup,
    importAllZipDataJSON,
    importGoogleSheetsCSV,
    confirmImport,
    cancelImport,
    handleFullBackupImport,
    handleAllZipImport,
    generateStableId,
    parseGoogleSheetsCSV,
    mergeAllZipData
  };

  console.log("[IMPORT/EXPORT] Module loaded successfully");

  // Start initialization
  init();

})();
