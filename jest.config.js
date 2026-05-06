module.exports = {
	testEnvironment: 'node',
	testMatch: ['<rootDir>/tests/**/*.test.ts'],
	transform: {
		'^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
	},
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1',
	},
	setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
