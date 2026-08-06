// Pure predicate for "has this account already finished setup" — used by
// App's loadSummary (src/app.jsx) to decide whether a fresh device/browser
// with no press_onboarded flag in localStorage should still skip Onboarding
// for an account that's actually already set up. A real account is
// anything with an explicit completion flag, a saved name, or any real
// lift history — never re-onboard those, no matter what this specific
// browser remembers. Extracted into its own dependency-free module so this
// can be verified with a plain test instead of only by reading it inline
// inside a much larger component.
export function isAccountAlreadyOnboarded(profile, liftsCount) {
  return !!(profile?.onboardingComplete || profile?.name || liftsCount > 0);
}
