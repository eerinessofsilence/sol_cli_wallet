/** @type {import("prettier").Config & import("prettier-plugin-tailwindcss").PluginOptions} */
export default {
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './src/tailwind.css',
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all',
};
