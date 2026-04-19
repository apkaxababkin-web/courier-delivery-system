/** @type {const} */
const themeColors = {
  primary:    { light: '#1A73E8', dark: '#4A9EFF' },
  background: { light: '#F5F6F8', dark: '#1C1C1E' },
  surface:    { light: '#FFFFFF', dark: '#2C2C2E' },
  foreground: { light: '#1C1C1E', dark: '#F5F5F5' },
  muted:      { light: '#6B7280', dark: '#9CA3AF' },
  accent:     { light: '#F0F4F8', dark: '#2C2C2E' },
  border:     { light: '#D1D5DB', dark: '#3A3A3C' },
  success:    { light: '#34A853', dark: '#4ADE80' },
  warning:    { light: '#FBBC04', dark: '#FCD34D' },
  error:      { light: '#EA4335', dark: '#F87171' },
};

// Background pattern for light theme (subtle dots)
const backgroundPattern = `
  <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="2" cy="2" r="1" fill="%23E5E7EB" opacity="0.5"/>
  </svg>
`.trim();

module.exports = { themeColors, backgroundPattern };
