/**
 * Helper to determine if the application is running in static Demo Mode.
 * Triggers when:
 * 1. Environment variable VITE_DEMO_MODE === 'true'
 * 2. URL search parameter ?demo=true is present
 * 3. Hosted on GitHub Pages (*.github.io)
 */
export function isDemoMode(): boolean {
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    return true;
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname.endsWith('github.io')) {
      return true;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'true') {
      return true;
    }
  }
  return false;
}
