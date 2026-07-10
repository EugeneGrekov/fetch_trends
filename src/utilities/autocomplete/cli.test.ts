import { describe, expect, it } from 'vitest';
import { shouldShowAutocompleteHelpOnEmptyInvocation } from './cli.js';

describe('autocomplete cli entry behavior', () => {
  it('shows help for a bare interactive invocation', () => {
    expect(shouldShowAutocompleteHelpOnEmptyInvocation(['node', 'src/cli.ts'], true)).toBe(true);
  });

  it('does not show help when stdin is piped', () => {
    expect(shouldShowAutocompleteHelpOnEmptyInvocation(['node', 'src/cli.ts'], false)).toBe(false);
  });

  it('does not show help when the user supplied flags', () => {
    expect(shouldShowAutocompleteHelpOnEmptyInvocation(['node', 'src/cli.ts', '--country', 'US'], true)).toBe(false);
  });
});
