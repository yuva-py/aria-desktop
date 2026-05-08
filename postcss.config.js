// postcss.config.js
// ARIA uses vanilla CSS custom properties — no Tailwind directives in source.
// Tailwind is listed in package.json but not used as a PostCSS plugin here.
// Autoprefixer is kept for cross-platform vendor prefix support.
module.exports = {
  plugins: {
    autoprefixer: {},
  },
}
