export interface GuidePreferences { automatic: boolean; completed: string[]; }
export const guidePreferenceKey = (subject: string) => `ft_context_guides_v1_${encodeURIComponent(subject)}`;
export const GUIDE_PREFERENCE_EVENT = "ft-context-guides-preferences";
export const GUIDE_OPEN_EVENT = "ft-context-guide-open";
const fallback = new Map<string, GuidePreferences>();
const defaults = (): GuidePreferences => ({ automatic: true, completed: [] });
export function readGuidePreferences(subject: string): GuidePreferences {
  let raw: string | null;
  try { raw = localStorage.getItem(guidePreferenceKey(subject)); }
  catch { return fallback.get(subject) ?? defaults(); }
  if (raw === null) return fallback.get(subject) ?? defaults();
  try {
    const value = JSON.parse(raw);
    return { automatic: value?.automatic !== false, completed: Array.isArray(value?.completed) ? value.completed.filter((id: unknown) => typeof id === "string") : [] };
  } catch { return defaults(); }
}
export function saveGuidePreferences(subject: string, preferences: GuidePreferences) {
  try { localStorage.setItem(guidePreferenceKey(subject), JSON.stringify(preferences)); fallback.delete(subject); }
  catch { fallback.set(subject, preferences); }
  window.dispatchEvent(new Event(GUIDE_PREFERENCE_EVENT));
}
