const scopedBases = [
  "ft_master_data_v1", "finance_data", "ft_sync_pending", "ft_sync_base_revision", "ft_sync_conflict",
  "ft_sync_conflict_backups", "ft_sync_last_resolved_conflict", "ft_import_preimage",
];
export const localAccountEpochKey = (sub: string) => `ft_account_epoch_v1_${sub}`;
export function clearAccountLocalData(sub: string) {
  const keys = new Set(scopedBases.map(base => `${base}_${sub}`));
  keys.add(`ft_context_guides_v1_${encodeURIComponent(sub)}`);
  const pendingPrefix = `ft_sync_pending_writer:${encodeURIComponent(sub)}:`;
  const found = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((key): key is string => Boolean(key));
  for (const key of found) if (keys.has(key) || key.startsWith(pendingPrefix)) localStorage.removeItem(key);
  for (const key of ["ft_last_profile", "ft_google_user"]) {
    const raw = localStorage.getItem(key);
    if (raw) { try { if (JSON.parse(raw)?.sub === sub) localStorage.removeItem(key); } catch { /* Unrelated legacy metadata is not deleted. */ } }
  }
}
export function prepareAccountEpoch(sub: string, epoch: string | undefined) {
  if (!epoch) return;
  const key = localAccountEpochKey(sub);
  if (localStorage.getItem(key) === epoch) return;
  clearAccountLocalData(sub);
  localStorage.setItem(key, epoch);
}
