const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = require(path.join(root, 'jest.config.js'));
module.exports = { ...base, rootDir: root, moduleNameMapper: {
  '^firebase/(.*)$': path.join(root, 'node_modules/firebase/$1'),
  ...base.moduleNameMapper,
} };
