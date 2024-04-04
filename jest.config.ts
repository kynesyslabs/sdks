import { pathsToModuleNameMapper } from 'ts-jest';

import type { JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
	moduleNameMapper: pathsToModuleNameMapper({
		"$xm/*": ["multichain/*"],
		// SEE: tsconfig.json > compilerOptions > paths
		// '$lib/*': ['src/lib/*']
	}),
	preset: 'ts-jest',
	roots: ['<rootDir>'],
	modulePaths: ['./'],
	transform: { '^.+\\.(t|j)s?$': ['ts-jest', { isolatedModules: true }] },

	// INFO: Tests involving ledger lookups need this
	testTimeout: 20_000,
};

export default jestConfig;
