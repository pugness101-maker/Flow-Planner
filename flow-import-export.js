console.log("Flow import/export disabled temporarily to prevent app crash.");

// Temporary safe wrapper.
// The main Flow Planner app should load even if import/export is not active.

window.flowImportExport = {
  disabled: true,
  reason: "Temporarily disabled because pages was not globally available."
};
