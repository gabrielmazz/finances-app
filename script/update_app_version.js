#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Uso: npm run version:set -- <major.minor.patch[-pre-release]>');
  process.exit(1);
}

const files = {
  app: path.join(projectRoot, 'app.json'),
  package: path.join(projectRoot, 'package.json'),
  login: path.join(projectRoot, 'screens', 'LoginScreen.tsx'),
  loginWeb: path.join(projectRoot, 'screens', 'LoginScreen.web.tsx'),
};

const original = new Map(Object.entries(files).map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]));
const appConfig = JSON.parse(original.get('app'));
const packageConfig = JSON.parse(original.get('package'));

appConfig.expo.version = version;
packageConfig.version = version;

const updated = new Map([
  ['app', `${JSON.stringify(appConfig, null, 2)}\n`],
  ['package', `${JSON.stringify(packageConfig, null, 2)}\n`],
  ['login', original.get('login').replace(/(<Text[^>]*>Versão )[^<]+(<\/Text>)/, `$1${version}$2`)],
  ['loginWeb', original.get('loginWeb').replace(/(<Text[^>]*>Versão )[^<]+(<\/Text>)/, `$1${version}$2`)],
]);

for (const [name, content] of updated) {
  if (content === original.get(name)) {
    console.error(`Não foi possível atualizar a versão em ${files[name]}.`);
    process.exit(1);
  }
}

for (const [name, content] of updated) {
  fs.writeFileSync(files[name], content);
}

console.log(`Versão da aplicação atualizada para ${version}: app.json, package.json, LoginScreen.tsx e LoginScreen.web.tsx.`);
