import {readFileSync, writeFileSync} from 'fs';
import {semver} from 'check-more-types';

if (process.argv.length <= 2) {
  console.error('Please provide a version');
  process.exit(1);
}
let version = process.argv[2];
if (version !== 'DEV' && !semver(version)) {
  console.error('Provided versionfrom id semver format');
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync('package.json').toString());
packageJson.version = version;
writeFileSync('package.json', JSON.stringify(packageJson, null, 2));

if (version === 'DEV') version = '0.0.0';

// Tauri config json
const tauriConfJson = JSON.parse(readFileSync('src-tauri/tauri.conf.json').toString());
tauriConfJson.package.version = version;
tauriConfJson.tauri.windows = tauriConfJson.tauri.windows.map((window) => {
  window.userAgent = `IBControl/${
    version === '0.0.0' ? 'DEV' : version
  } (https://github.com/Raphiiko/IBControl)`;
  return window;
});
writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(tauriConfJson, null, 2));

// Tauri cargo toml
let tauriCargoToml = readFileSync('src-tauri/Cargo.toml').toString();
tauriCargoToml = tauriCargoToml.replaceAll(
  /\[package\]\r?\nname = "ibcontrol"\r?\nversion = "[0-9]+\.[0-9]+\.[0-9]+"/g,
  `[package]\r\nname = "ibcontrol"\r\nversion = "${version}"`
);
writeFileSync('src-tauri/Cargo.toml', tauriCargoToml);

console.log(`Set all versions to v${version}.`);
