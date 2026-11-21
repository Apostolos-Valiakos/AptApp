// Production builds only (see vite.config.mjs): Pinia and vue-router import
// Vue Devtools' setup from @vue/devtools-api, but call it only when devtools
// are on, which a production build never has. This stands in for it, so the
// devtools code (about 150 KB) stays out of the app.
export const setupDevtoolsPlugin = () => {};
