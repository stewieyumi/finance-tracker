import React, { useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { Modal } from "./ui/Modal";

type Device = "android" | "windows" | "iphone" | "mac" | "other";
function currentDevice(): Device {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(ua) && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "mac";
  return "other";
}
interface Props {
  onClose: () => void;
  canPrompt: boolean;
  busy: boolean;
  added: boolean;
  status: string;
  onInstall: () => void;
}

export function InstallAppGuide({ onClose, canPrompt, busy, added, status, onInstall }: Props) {
  const [device, setDevice] = useState<Device>(currentDevice);
  const heading = useRef<HTMLHeadingElement>(null);
  const listClass = "list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted";
  return <Modal isOpen onClose={onClose} ariaLabel="Install Finance Tracker" manageFocus initialFocusRef={heading} className="!items-start">
    <div className="my-auto w-full max-w-lg rounded-3xl border border-subtle bg-surface-modal p-5 shadow-xl sm:p-6"
      onKeyDown={event => { if (event.key !== "Tab" && event.key !== "Escape") event.stopPropagation(); }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-fill text-primary"><Download size={20} aria-hidden="true" /></span>
          <h2 ref={heading} tabIndex={-1} className="text-lg font-bold text-strong outline-none">Install Finance Tracker</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">Open it from your Home Screen, Start menu, or Dock—without finding a browser tab.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close install guide" className="grid min-h-11 min-w-11 place-items-center rounded-xl text-muted hover:bg-fill"><X size={20} aria-hidden="true" /></button>
      </div>
      {(canPrompt || busy) && !added && <button type="button" disabled={busy} onClick={onInstall}
        className="mt-4 min-h-11 w-full rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">{busy ? "Waiting for your browser…" : "Install app"}</button>}
      {status && <p role="status" className="mt-3 rounded-xl bg-fill p-3 text-sm text-primary">{status}</p>}
      {added && !status && <p className="mt-3 text-sm text-muted">You’re already using app mode here. You can use these steps on another device too.</p>}
      <fieldset className="my-4">
        <legend className="mb-2 text-xs font-semibold text-muted">Your device</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([['android', 'Android'], ['windows', 'Windows'], ['iphone', 'iPhone / iPad'], ['mac', 'Mac']] as const).map(([id, label]) =>
            <button key={id} type="button" aria-pressed={device === id} onClick={() => setDevice(id)}
              className={`min-h-11 rounded-xl px-2 py-2 text-xs font-semibold ${device === id ? "bg-blue-600 text-white" : "bg-fill text-primary hover:bg-fill-strong"}`}>{label}</button>)}
        </div>
      </fieldset>
      {device === "android" && <section aria-label="Android installation" className="space-y-2">
        <h3 className="text-sm font-semibold text-primary">In Chrome on Android</h3>
        <ol className={listClass}><li>Open Finance Tracker in Chrome.</li><li>Tap the <strong>⋮ menu → Install and create shortcut → Install</strong>.</li><li>Confirm, then open Finance Tracker from its icon.</li></ol>
        <p className="text-xs leading-relaxed text-muted">Some versions say “Add to Home screen.” If you opened this inside another app, open the page in Chrome first.</p>
        <a href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en" target="_blank" rel="noopener noreferrer" className="inline-block min-h-11 py-3 text-xs text-primary underline">Chrome’s Android instructions</a>
      </section>}
      {device === "windows" && <section aria-label="Windows installation" className="space-y-3">
        <div><h3 className="mb-2 text-sm font-semibold text-primary">Microsoft Edge</h3><ol className={listClass}><li>Open Finance Tracker in Edge.</li><li>Select <strong>⋯ → More tools → Apps → Install this site as an app</strong>.</li><li>Confirm. You can pin the installed app to Start or your taskbar.</li></ol></div>
        <div><h3 className="mb-2 text-sm font-semibold text-primary">Google Chrome</h3><p className="text-sm leading-relaxed text-muted">Choose <strong>⋮ → Cast, save, and share → Install page as app</strong>, or use the Install icon in the address bar when it appears.</p></div>
        <a href="https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge" target="_blank" rel="noopener noreferrer" className="inline-block min-h-11 py-3 text-xs text-primary underline">Microsoft’s installation instructions</a>
      </section>}
      {device === "iphone" && <section aria-label="iPhone installation" className="space-y-2">
        <h3 className="text-sm font-semibold text-primary">In Safari on iPhone or iPad</h3>
        <ol className={listClass}><li>Open Finance Tracker in Safari.</li><li>Tap <strong>Share → Add to Home Screen</strong>.</li><li>If shown, enable <strong>Open as Web App</strong>, then tap <strong>Add</strong>.</li></ol>
        <p className="text-xs leading-relaxed text-muted">Open Finance Tracker from the new Home Screen icon.</p>
      </section>}
      {device === "mac" && <section aria-label="Mac installation" className="space-y-2">
        <h3 className="text-sm font-semibold text-primary">In Safari on Mac</h3>
        <ol className={listClass}><li>Open Finance Tracker in Safari.</li><li>Choose <strong>File → Add to Dock</strong>.</li><li>Confirm the name and choose <strong>Add</strong>.</li></ol>
        <p className="text-xs leading-relaxed text-muted">In Chrome, use the address-bar Install icon or ⋮ → Cast, save, and share → Install page as app.</p>
      </section>}
      {device === "other" && <p className="text-sm text-muted">Choose your device above to see its steps. Your browser may also have an Install option in its menu.</p>}
      <p className="mt-4 border-t border-subtle pt-3 text-xs leading-relaxed text-muted">Already added it? Open your existing app icon. Sign in with the same account if asked. Internet is still needed for cloud sync, receipt scanning, and automatic Shortcut saving.</p>
      <button type="button" onClick={onClose} className="mt-4 min-h-11 w-full rounded-xl bg-fill px-4 text-sm font-semibold text-primary hover:bg-fill-strong">Done</button>
    </div>
  </Modal>;
}
