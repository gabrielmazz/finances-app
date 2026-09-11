module.exports = {
	testEnvironment: 'node',
	// A relative glob keeps discovery stable when Codex/Windows executes the
	// WSL workspace through a UNC path. Prefixing with <rootDir> duplicates the
	// UNC mount segments in Jest 29 and causes every test to be skipped.
	testMatch: ['**/tests/**/*.test.ts'],
	testPathIgnorePatterns: ['[/\\\\]node_modules[/\\\\]', '[/\\\\]backend[/\\\\]tests[/\\\\]'],
	transform: {
		'^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
	},
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1',
	},
	setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
