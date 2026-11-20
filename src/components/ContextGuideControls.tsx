import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { getFinanceSubject } from "../utils/financeAuth";
import { GUIDE_OPEN_EVENT, GUIDE_PREFERENCE_EVENT, readGuidePreferences, saveGuidePreferences } from "../utils/contextGuidePreferences";

export function GuideButton({ screen, name, compact = false }: { screen: string; name: string; compact?: boolean }) {
  return <button data-guide-replay={screen} type="button" aria-label={`${name} guide`} onClick={() => window.dispatchEvent(new CustomEvent(GUIDE_OPEN_EVENT, { detail: screen }))}
    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-muted hover:bg-fill hover:text-primary"><CircleHelp size={15} aria-hidden="true" /><span className={compact ? "hidden sm:inline" : undefined}>Guide</span></button>;
}
export function GuidePreferences() {
  const subject = getFinanceSubject();
  const [automatic, setAutomatic] = useState(() => subject ? readGuidePreferences(subject).automatic : true);
  useEffect(() => {
    const changed = () => setAutomatic(subject ? readGuidePreferences(subject).automatic : true);
    changed(); window.addEventListener(GUIDE_PREFERENCE_EVENT, changed); window.addEventListener("storage", changed);
    return () => { window.removeEventListener(GUIDE_PREFERENCE_EVENT, changed); window.removeEventListener("storage", changed); };
  }, [subject]);
  return <label className="flex min-h-12 items-start justify-between gap-4 rounded-xl bg-fill p-3 text-sm text-primary">
    <span><span className="block font-semibold">First-visit guides</span><span className="mt-1 block text-xs text-muted">Show a short guide the first time you open each area. Replay any guide with its Guide button. This preference is saved on this device.</span></span>
    <input type="checkbox" aria-label="Show first-visit guides" checked={automatic} disabled={!subject} onChange={event => {
      if (!subject) return; const next = event.target.checked; setAutomatic(next);
      saveGuidePreferences(subject, { ...readGuidePreferences(subject), automatic: next });
    }} className="mt-1 size-5 shrink-0 accent-blue-600" />
  </label>;
}
