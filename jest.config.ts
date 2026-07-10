import { pathsToModuleNameMapper } from 'ts-jest';

import type { JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
	moduleNameMapper: {
		// The source now uses ESM-style ".js" specifiers on a few relative
		// imports (required so the emitted build resolves under Node's strict
		// ESM resolver). ts-jest runs the .ts source, so strip the ".js" and
		// let it resolve to the .ts file.
		"^(\\.{1,2}/.*)\\.js$": "$1",
		...pathsToModuleNameMapper({
			"@/*": ["src/*"]
			// SEE: tsconfig.json > compilerOptions > paths
			// '$lib/*': ['src/lib/*']
		}),
	},
	preset: 'ts-jest',
	roots: ['<rootDir>'],
	modulePaths: ['./'],
	transform: { '^.+\\.(t|j)s?$': 'ts-jest' },

	// Transform ESM-only packages from node_modules
	transformIgnorePatterns: [
		'node_modules/(?!(@scure|@noble)/)'
	],

	// INFO: Tests involving ledger lookups need this
	testTimeout: 20_000,
};

export default jestConfig;
