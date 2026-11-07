import React, { useState, useMemo, useEffect, useRef } from "react";
import { Camera, Check, Circle, Edit2, Save, Trash2, Plus, Filter, ChevronDown, Calendar, X, CalendarPlus, Upload, RefreshCw } from "lucide-react";
import { Shoot, ShootCategory, ShootStatus, EditFormData } from "../types/finance";
import { exportGigToCalendar } from "../utils/calendarExport";
import { GIG_BOOKING_STATUSES, GIG_CALENDAR_GROUPS, getGigCalendarGroup } from "../utils/gigStatus";
import { Modal } from "./ui/Modal";
import { syncShootsToNotion } from "../utils/notionSync";

const SHOOT_CATEGORIES: (ShootCategory | "All")[] = ["All", "Solo Shoot", "Assistant", "Video Edit", "Event", "Commercial", "Other"];

interface ShootsTableProps {
  calendarSync?: React.ReactNode;
  onChangeStatus?: (id: string, status: ShootStatus) => void;
  gigsLabel?: string;
  gigCategories?: string[];
  activeShoots: Shoot[];
  selectedMonth: string;
  onToggleCompletion: (id: string) => void;
  onAddShoot: (shoot: { title: string; date: string; category: ShootCategory; status: ShootStatus }) => void;
  onDeleteShoot: (id: string) => void;
  onSaveEdit: (category: "shoots") => void;
  editingId: string | null;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  editForm: EditFormData;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormData>>;
}

const formatShortDate = (dateStr?: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mIndex = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return `${monthNames[mIndex] || parts[1]} ${day}`;
  }
  return dateStr;
};

const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const ShootsTable: React.FC<ShootsTableProps> = React.memo(({
  calendarSync, onChangeStatus, gigsLabel, gigCategories, activeShoots, selectedMonth, onToggleCompletion, onAddShoot, onDeleteShoot, onSaveEdit, editingId, setEditingId, editForm, setEditForm
}) => {
  const categoriesList = gigCategories?.length ? gigCategories : ["Solo Shoot", "Assistant", "Video Edit", "Event", "Commercial", "Other"];
  const filterList = ["All", ...categoriesList];

  const [calendarGig, setCalendarGig] = useState<Shoot | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newShoot, setNewShoot] = useState({ title: "", date: "", category: "Solo Shoot" as ShootCategory, status: "Confirmed" as ShootStatus });
  const [selectedFilter, setSelectedFilter] = useState<"All" | ShootCategory>("All");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const todayStr = getLocalToday();

  const [isSyncingNotion, setIsSyncingNotion] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    type: "success" | "partial" | "error";
    message: string;
  } | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, []);

  const handleSyncToNotion = async () => {
    if (isSyncingNotion) return;
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    setIsSyncingNotion(true);
    setSyncStatus(null);

    try {
      const result = await syncShootsToNotion(activeShoots);
      if (result.success) {
        setSyncStatus({
          type: "success",
          message: `Synced ${result.total} gigs · ${result.created} created · ${result.updated} updated`,
        });
      } else {
        if (result.processed > 0 && result.failedBatch) {
          setSyncStatus({
            type: "partial",
            message: `Synced ${result.processed}/${result.total} gigs · batch ${result.failedBatch} failed`,
          });
        } else {
          setSyncStatus({
            type: "error",
            message: result.error || "Notion sync failed.",
          });
        }
      }
    } catch {
      setSyncStatus({
        type: "error",
        message: "Notion sync failed.",
      });
    } finally {
      setIsSyncingNotion(false);
      syncTimeoutRef.current = setTimeout(() => {
        setSyncStatus(null);
      }, 4500);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowFilterDropdown(false); };
    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredShoots = useMemo(() => {
    if (selectedFilter === "All") return activeShoots;
    return activeShoots.filter(s => s.category === selectedFilter);
  }, [activeShoots, selectedFilter]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newShoot.title.trim();
    if (!title) return;
    onAddShoot({ title, date: newShoot.date, category: newShoot.category, status: newShoot.status });
    setNewShoot({ title: "", date: "", category: "Solo Shoot", status: "Confirmed" });
    setIsAdding(false);
  };

  const handleStartEdit = (shoot: Shoot) => { setEditingId(shoot.id); setEditForm({ ...shoot }); };
  const handleCancelEdit = () => { setEditingId(null); setEditForm({}); };

  const statusSelect = (shoot: Shoot) => (
    <label className="relative shrink-0" onClick={event => event.stopPropagation()}>
      <span className="sr-only">Booking status for {shoot.title}</span>
      <select
        value={shoot.status}
        disabled={!onChangeStatus}
        onChange={event => onChangeStatus?.(shoot.id, event.target.value as ShootStatus)}
        className={`min-h-9 appearance-none rounded-lg py-1 pl-2.5 pr-7 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${GIG_CALENDAR_GROUPS[getGigCalendarGroup(shoot)].chip}`}
      >
        {GIG_BOOKING_STATUSES.map(status => <option key={status} value={status} className="bg-surface text-primary">{status}</option>)}
      </select>
      <ChevronDown size={12} aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
    </label>
  );

  const handleAddToCalendar = (shoot: Shoot) => {
    if (!shoot.date) {
      alert("Please set a date for this gig first.");
      return;
    }
    setCalendarGig(shoot);
  };

  return (
    <div className="w-full rounded-2xl bg-surface p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2"><Camera size={13} className="text-amber-400" />{selectedMonth} Upcoming Shoots & Production Gigs</h2>
        <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-end">
          {syncStatus && (
            <span
              data-testid="notion-sync-status"
              className={`text-[11px] font-medium px-2 py-0.5 rounded-lg transition-all animate-in fade-in ${
                syncStatus.type === "success"
                  ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                  : syncStatus.type === "partial"
                  ? "text-amber-400 bg-amber-500/10 border border-amber-500/20"
                  : "text-rose-400 bg-rose-500/10 border border-rose-500/20"
              }`}
            >
              {syncStatus.message}
            </span>
          )}
          <span className="text-[11px] text-faint font-mono hidden md:inline">{activeShoots.filter(s => s.completed).length}/{activeShoots.length} Done</span>
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setShowFilterDropdown(prev => !prev)} className={`h-7 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${selectedFilter !== "All" ? "bg-amber-600/20 border-amber-500/50 text-amber-400" : "bg-inverse/[0.04] border-inverse/[0.08] text-muted hover:text-primary"}`}>
              <Filter size={11} className={selectedFilter !== "All" ? "text-amber-400" : "text-muted"} />
              <span className="text-[11px]">{selectedFilter === "All" ? "Filter" : selectedFilter}</span>
              <ChevronDown size={10} className="text-faint" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 mt-1.5 w-40 bg-surface-high/95 backdrop-blur-xl border border-inverse/[0.1] rounded-xl shadow-2xl p-1 z-30 space-y-0.5">
                {filterList.map(cat => (
                  <button key={cat} onClick={() => { setSelectedFilter(cat); setShowFilterDropdown(false); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${selectedFilter === cat ? "bg-amber-600/20 text-amber-400 font-semibold" : "text-secondary hover:bg-inverse/[0.06]"}`}>
                    <span>{cat}</span>{selectedFilter === cat && <Check size={11} className="text-amber-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <details className="mb-3 rounded-xl bg-fill/50 px-3 py-1">
        <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-muted">Advanced integrations</summary>
        <p className="pb-3 text-xs leading-relaxed text-muted">Optional connected services. To add a one-time copy instead, use Add to Calendar on a gig or task.</p>
        <div className="flex flex-wrap items-center gap-2 pb-3">
          {calendarSync}
          <button
            type="button"
            onClick={handleSyncToNotion}
            disabled={isSyncingNotion}
            aria-label="Sync to Notion"
            className={`min-h-11 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${
              isSyncingNotion
                ? "bg-inverse/[0.04] border-inverse/[0.08] text-faint cursor-not-allowed opacity-75"
                : "bg-inverse/[0.04] border-inverse/[0.08] text-muted hover:text-primary hover:border-inverse/[0.15]"
            }`}
          >
            {isSyncingNotion ? (
              <>
                <RefreshCw size={11} className="animate-spin text-amber-400" />
                <span className="text-[11px]">Syncing...</span>
              </>
            ) : (
              <>
                <Upload size={11} className="text-muted" />
                <span className="text-[11px]">Notion</span>
              </>
            )}
          </button>
        </div>
      </details>

      {/* MOBILE LIST */}
      <div className="mb-3 block overflow-hidden rounded-xl bg-surface-low divide-y divide-subtle lg:hidden">
        {filteredShoots.length === 0 ? (
          <div className="py-6 text-center text-faint text-xs italic">No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} production gigs found.</div>
        ) : filteredShoots.map(shoot => (
          <div
            key={shoot.id}
            data-testid={`shoot-mobile-card-${shoot.id}`}
            onClick={() => handleStartEdit(shoot)}
            className={`cursor-pointer px-3 py-2.5 transition-colors hover:bg-surface-high ${shoot.completed ? "bg-surface-low" : ""}`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCompletion(shoot.id);
                    }}
                    className="shrink-0 min-w-[36px] min-h-[36px] -ml-1.5 -my-1.5 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 rounded-full"
                    disabled={shoot.status === "Cancelled"}
                    aria-label={shoot.completed ? `Mark ${shoot.title} as unfinished` : `Mark ${shoot.title} as done`}
                  >
                    <div className="shrink-0">
                      {shoot.completed ? <span className="w-4 h-4 rounded-full chip-emerald flex items-center justify-center"><Check size={9} className="stroke-[3]" /></span> : <span className="w-4 h-4 rounded-full bg-fill/60 border border-strong/60 text-faint flex items-center justify-center"><Circle size={6} /></span>}
                    </div>
                  </button>
                  <span className={`privacy-blur text-xs font-semibold truncate ${shoot.completed ? "line-through text-faint" : "text-strong"} hover:text-amber-400 transition-colors`}>{shoot.title}</span>
                </div>
                {statusSelect(shoot)}
              </div>
              <div className="flex items-center justify-between pl-6 text-[10px] text-muted">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="chip-amber px-1.5 py-0.2 rounded font-medium">{shoot.category}</span>
                  {shoot.date && (shoot.date === todayStr ? <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-[1px] rounded font-bold uppercase tracking-wider text-[9px] ml-1">Due Today</span> : <span>• {formatShortDate(shoot.date)}</span>)}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToCalendar(shoot);
                    }}
                    className="min-h-9 px-2 text-muted hover:text-primary bg-fill-strong/70 rounded-lg text-[10px] whitespace-nowrap flex items-center gap-1 transition"
                    title="Add to Calendar"
                    aria-label={`Export ${shoot.title} to calendar`}
                  >
                    <CalendarPlus size={12} /> Add to Calendar
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(shoot);
                    }}
                    className="px-2 py-0.5 text-muted hover:text-amber-300 bg-fill-strong/70 rounded text-[10px] whitespace-nowrap transition shadow-sm"
                    aria-label={`Edit ${shoot.title}`}
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* DESKTOP LIST */}
      <div className="hidden lg:block overflow-x-auto pb-2">
        <table className="w-full text-left text-xs min-w-[750px]">
          <thead>
            <tr className="text-muted border-b border-inverse/[0.06] text-[11px] uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold w-[10%]">Done</th>
              <th className="py-3 px-4 font-semibold w-[30%]">Shoots/Gigs</th>
              <th className="py-3 px-4 font-semibold text-center w-[15%]">Date</th>
              <th className="py-3 px-4 font-semibold text-center w-[15%]">Status</th>
              <th className="py-3 px-4 font-semibold text-center w-[15%]">Category</th>
              <th className="py-3 px-4 font-semibold text-right w-[15%]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {filteredShoots.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-faint italic">No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} production gigs found.</td></tr>
            ) : filteredShoots.map(shoot => (
              <tr key={shoot.id} className={`group transition-all duration-150 ${shoot.completed ? "bg-surface-low" : "hover:bg-inverse/[0.02]"}`}>
                <td className="py-3 px-4 whitespace-nowrap">
                  <button type="button" disabled={shoot.status === "Cancelled"} aria-label={shoot.completed ? `Mark ${shoot.title} as unfinished` : `Mark ${shoot.title} as done`} onClick={() => onToggleCompletion(shoot.id)} className="flex min-h-9 items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50">
                    {shoot.completed ? <span className="flex items-center justify-center gap-1 w-[72px] text-[10px] font-bold chip-emerald px-2 py-0.5 rounded-lg"><Check size={10} className="stroke-[3]" /> Done</span> : <span className="flex items-center justify-center gap-1 w-[72px] text-muted text-[10px] font-medium bg-fill/40 px-2 py-0.5 rounded-lg border border-strong/30"><Circle size={6} /> Active</span>}
                  </button>
                </td>
                <td className="py-3 px-4 text-primary font-medium">
                  <button
                    type="button"
                    onClick={() => onToggleCompletion(shoot.id)}
                    className={`privacy-blur text-left ${shoot.completed ? "line-through text-faint" : "hover:text-amber-400 transition-colors"} focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 rounded`}
                  >
                    {shoot.title}
                  </button>
                </td>
                <td className="py-3 px-4 text-center whitespace-nowrap">
                  {shoot.date ? (shoot.date === todayStr ? <span className="inline-flex items-center gap-1 text-rose-400 font-bold text-[10px] bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md shadow-[0_0_10px_rgba(244,63,94,0.1)]"><Calendar size={10} className="text-rose-400" />DUE TODAY</span> : <span className="inline-flex items-center gap-1 text-secondary font-mono text-[11px]"><Calendar size={10} className="text-faint" />{formatShortDate(shoot.date)}</span>) : <span className="text-disabled">—</span>}
                </td>
                <td className="py-3 px-4 text-center whitespace-nowrap">
                  {statusSelect(shoot)}
                </td>
                <td className="py-3 px-4 text-center whitespace-nowrap">
                  <span className="chip-amber px-2 py-0.5 rounded-md text-[10px] font-medium">{shoot.category}</span>
                </td>
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1 justify-end shrink-0">
                    <button type="button" onClick={() => handleAddToCalendar(shoot)} className="min-h-9 whitespace-nowrap shrink-0 px-2 py-1 text-muted hover:text-primary hover:bg-fill rounded-md text-[11px] flex items-center transition" title="Add to Calendar"><CalendarPlus size={12} className="mr-1" /> Add to Calendar</button>
                    <button onClick={() => handleStartEdit(shoot)} className="whitespace-nowrap shrink-0 px-2 py-1 text-muted hover:text-amber-300 hover:bg-inverse/[0.05] rounded-md text-[11px] flex items-center transition"><Edit2 size={10} className="mr-1" /> Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={() => setIsAdding(true)} className="w-full mt-3.5 py-3.5 border border-dashed border-inverse/[0.15] hover:border-amber-500/50 hover:bg-amber-500/10 text-muted hover:text-amber-400 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2">
        <Plus size={15} /> Add New Gig
      </button>

      {/* EDIT MODAL */}
      {editingId && activeShoots.some(s => s.id === editingId) && (
        <div className="fixed inset-0 z-[200] bg-[var(--bg-modal-scrim)] backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={(e) => { if(e.target === e.currentTarget) handleCancelEdit(); }}>
          <div className="bg-surface-elevated border border-inverse/[0.08] rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400"><Edit2 size={18} /></div>
                <div><h3 className="text-sm font-bold text-strong leading-tight">Edit Gig</h3><p className="text-[11px] text-muted font-medium">{editForm.title}</p></div>
              </div>
              <button onClick={handleCancelEdit} className="text-faint hover:text-strong p-2 bg-inverse/[0.03] hover:bg-inverse/[0.08] rounded-full transition"><X size={16}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Gig / Project Title</label>
                <input type="text" value={editForm.title || ""} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-amber-500" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2">
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Date</label>
                  <input type="date" value={editForm.date || ""} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Category</label>
                  <select value={editForm.category || "Solo Shoot"} onChange={(e) => setEditForm({ ...editForm, category: e.target.value as ShootCategory })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-amber-500">
                    {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Status</label>
                  <select value={editForm.status || "Confirmed"} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ShootStatus })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-amber-500">
                    <option value="Confirmed">Confirmed</option><option value="Pencil">Pencil</option><option value="Moved">Moved</option><option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-4 border-t border-inverse/[0.04]">
                <button onClick={() => { onDeleteShoot(editingId); handleCancelEdit(); }} className="p-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition flex items-center justify-center shadow-sm"><Trash2 size={16} /></button>
                <button onClick={() => { onSaveEdit("shoots"); handleCancelEdit(); }} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20 transition active:scale-[0.98]"><Save size={16} /> Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD MODAL */}
      {isAdding && (
        <div className="fixed inset-0 z-[200] bg-[var(--bg-modal-scrim)] backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={(e) => { if(e.target === e.currentTarget) setIsAdding(false); }}>
          <div className="bg-surface-elevated border border-inverse/[0.08] rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400"><Plus size={18} /></div>
                <div><h3 className="text-sm font-bold text-strong leading-tight">Add New Gig</h3><p className="text-[11px] text-muted font-medium">Log a new production gig or task</p></div>
              </div>
              <button onClick={() => setIsAdding(false)} className="text-faint hover:text-strong p-2 bg-inverse/[0.03] hover:bg-inverse/[0.08] rounded-full transition"><X size={16}/></button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Gig / Project Title</label>
                <input type="text" value={newShoot.title} onChange={(e) => setNewShoot({ ...newShoot, title: e.target.value })} autoFocus placeholder="e.g. Wedding Edit, Product Shoot" className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-amber-500" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2">
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Date</label>
                  <input type="date" value={newShoot.date} onChange={(e) => setNewShoot({ ...newShoot, date: e.target.value })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Category</label>
                  <select value={newShoot.category} onChange={(e) => setNewShoot({ ...newShoot, category: e.target.value as ShootCategory })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-amber-500">
                    {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Status</label>
                  <select value={newShoot.status} onChange={(e) => setNewShoot({ ...newShoot, status: e.target.value as ShootStatus })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-amber-500">
                    <option value="Confirmed">Confirmed</option><option value="Pencil">Pencil</option><option value="Moved">Moved</option><option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-4 border-t border-inverse/[0.04]">
                <button type="submit" className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20 transition active:scale-[0.98]"><Plus size={16} /> Add Gig</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {calendarGig && (
        <Modal isOpen manageFocus onClose={() => setCalendarGig(null)} ariaLabel="Add gig to calendar">
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-subtle bg-surface p-4 shadow-xl">
            <h2 className="text-sm font-semibold text-primary">Add to Calendar</h2>
            <p className="break-words text-sm font-medium text-primary">{calendarGig.title}</p>
            <p className="text-xs leading-relaxed text-muted">Share or download this event, then open it in your calendar app to add it. No Apple account setup needed.</p>
            <p className="text-xs leading-relaxed text-muted">This is a one-time copy. Later edits, completion, and status changes won’t sync automatically in either direction.</p>
            <button type="button" className="min-h-11 w-full rounded-xl bg-fill p-3 text-sm text-primary hover:bg-fill-strong"
              onClick={() => { exportGigToCalendar(calendarGig); setCalendarGig(null); }}>
              Share or open calendar file
            </button>
            <button type="button" className="min-h-11 w-full rounded-xl bg-fill p-3 text-sm text-primary hover:bg-fill-strong"
              onClick={() => { exportGigToCalendar(calendarGig, false); setCalendarGig(null); }}>
              Download calendar file (.ics)
            </button>
            <button type="button" className="min-h-11 w-full rounded-xl p-3 text-sm text-muted hover:bg-fill"
              onClick={() => setCalendarGig(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
});
