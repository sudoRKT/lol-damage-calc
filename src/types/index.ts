// Barrel for the frozen type contract. Import from '@/types' or './types'.
// LEAD-owned. Teammates import from here; they do not edit these files.

export * from './data';
export * from './scenario';
export * from './result';
export { MOCK_SCENARIO, MOCK_RESULT } from './mock-result';

// The one implementation of the wiki's progression rule, and the one validator for the
// curated file. The engine imports the expander rather than writing its own: two
// implementations of an interpolation rule are two chances to disagree.
export * from './scaling';
export * from './validate-curated';
