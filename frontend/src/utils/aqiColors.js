// ─────────────────────────────────────────────────────────────────────────────
// Shared AQI colour constants — CPCB standard
// Used across IndiaMap, Dashboard, Chatbot, and ParameterAnalyzer pages.
// ─────────────────────────────────────────────────────────────────────────────

export const AQI_COLORS = {
  Good:         "#00b050",
  Satisfactory: "#92d050",
  Moderate:     "#ffbf00",
  Poor:         "#ff0000",
  "Very Poor":  "#7030a0",
  Severe:       "#c00000",
};

/**
 * Returns the hex color for a given AQI category string.
 * Falls back to a neutral gray if the category is unrecognised.
 *
 * @param {string} category - e.g. "Good", "Moderate", "Severe"
 * @returns {string} hex color
 */
export function getAqiColor(category) {
  return AQI_COLORS[category] ?? "#6b7280";
}
