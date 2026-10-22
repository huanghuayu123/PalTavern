// PalTavern stylesheet pipeline.
// Vendor prefixes run first, then Tailwind's PostCSS plugin, then minify.
// The chat UI is plain CSS; this plugin list stays so any Tailwind syntax in a stylesheet still resolves.

const addVendorPrefixes = require('autoprefixer');
const tailwindProcessor = require('@tailwindcss/postcss');
const compressCss = require('postcss-minify');

/** @type {import('postcss-load-config').Config} */
const palTavernPostcss = {
  plugins: [addVendorPrefixes, tailwindProcessor, compressCss],
};

module.exports = palTavernPostcss;
