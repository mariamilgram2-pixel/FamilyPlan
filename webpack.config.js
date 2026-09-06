const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const webpack = require('webpack');
const path = require('path');
const fs = require('fs');

// Load .env file manually so EXPO_PUBLIC_* vars are available at build time
function loadEnv() {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) process.env[key] = value;
      }
    });
}

module.exports = async function (env, argv) {
  loadEnv();

  const config = await createExpoWebpackConfigAsync(env, argv);

  // Inject all EXPO_PUBLIC_* variables into the bundle
  const expoPublicVars = {};
  Object.keys(process.env)
    .filter(key => key.startsWith('EXPO_PUBLIC_'))
    .forEach(key => {
      expoPublicVars[`process.env.${key}`] = JSON.stringify(process.env[key]);
    });

  if (Object.keys(expoPublicVars).length > 0) {
    config.plugins.push(new webpack.DefinePlugin(expoPublicVars));
  }

  // Web bundle: skip Node's `crypto` (expo-modules-core/uuid falls back to
  // the browser's native crypto.getRandomValues at runtime).
  config.resolve = config.resolve || {};
  config.resolve.fallback = { ...(config.resolve.fallback || {}), crypto: false };

  return config;
};
