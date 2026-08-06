import { isAccountAlreadyOnboarded } from '../src/onboardingGate.js';

describe('isAccountAlreadyOnboarded', () => {
  test('a genuinely new account (no profile, no lifts) is not already onboarded', () => {
    expect(isAccountAlreadyOnboarded(undefined, 0)).toBe(false);
    expect(isAccountAlreadyOnboarded({}, 0)).toBe(false);
    expect(isAccountAlreadyOnboarded({}, undefined)).toBe(false);
  });

  test('an explicit onboardingComplete flag counts as already onboarded', () => {
    expect(isAccountAlreadyOnboarded({ onboardingComplete: true }, 0)).toBe(true);
  });

  test('an explicit onboardingComplete flag of false does not, by itself', () => {
    expect(isAccountAlreadyOnboarded({ onboardingComplete: false }, 0)).toBe(false);
  });

  test('a saved name counts as already onboarded, even with no completion flag', () => {
    // Covers accounts that finished setup before onboardingComplete existed.
    expect(isAccountAlreadyOnboarded({ name: 'George' }, 0)).toBe(true);
  });

  test('an empty name string does not count', () => {
    expect(isAccountAlreadyOnboarded({ name: '' }, 0)).toBe(false);
  });

  test('any real lift history counts as already onboarded', () => {
    expect(isAccountAlreadyOnboarded({}, 1)).toBe(true);
    expect(isAccountAlreadyOnboarded({}, 200)).toBe(true);
  });

  test('zero lifts does not count', () => {
    expect(isAccountAlreadyOnboarded({}, 0)).toBe(false);
  });

  test('any single true signal is enough — they are not required together', () => {
    expect(isAccountAlreadyOnboarded({ onboardingComplete: true, name: '' }, 0)).toBe(true);
    expect(isAccountAlreadyOnboarded({ name: 'George' }, 0)).toBe(true);
    expect(isAccountAlreadyOnboarded(undefined, 5)).toBe(true);
  });
});
