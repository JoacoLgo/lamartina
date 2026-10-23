/**
 * Configuración de Babel (el "traductor" que prepara tu código antes de ejecutarlo).
 *
 * Por qué existe este archivo: la librería de estado (zustand) usa una sintaxis
 * moderna (`import.meta`) que el empaquetador web de Expo todavía no traduce
 * por defecto, y en el NAVEGADOR eso deja la pantalla en blanco. Esta opción
 * le pide a Expo que la traduzca.
 */
module.exports = function (api) {
  api.cache(true);

  // babel-preset-expo viene dentro de `expo`; según cómo npm acomode las carpetas
  // puede estar en la raíz o anidado, así que lo buscamos de las dos formas.
  let preset;
  try {
    preset = require.resolve('babel-preset-expo');
  } catch {
    preset = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });
  }

  return {
    presets: [[preset, { unstable_transformImportMeta: true }]],
  };
};
