import React, { useState, useMemo, useEffect, useRef } from "react";
import { Camera, Check, Circle, Edit2, Save, Trash2, Plus, Filter, ChevronDown, Calendar, X } from "lucide-react";
import { Shoot, ShootCategory, ShootStatus, EditFormData } from "../types/finance";

const SHOOT_CATEGORIES: (ShootCategory | "All")[] = ["All", "Solo Shoot", "Assistant", "Video Edit", "Event", "Commercial", "Other"];

interface ShootsTableProps {
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
  gigsLabel, gigCategories, activeShoots, selectedMonth, onToggleCompletion, onAddShoot, onDeleteShoot, onSaveEdit, editingId, setEditingId, editForm, setEditForm
}) => {
  const categoriesList = gigCategories?.length ? gigCategories : ["Solo Shoot", "Assistant", "Video Edit", "Event", "Commercial", "Other"];
  const filterList = ["All", ...categoriesList];

  const [isAdding, setIsAdding] = useState(false);
  const [newShoot, setNewShoot] = useState({ title: "", date: "", category: "Solo Shoot" as ShootCategory, status: "Confirmed" as ShootStatus });
  const [selectedFilter, setSelectedFilter] = useState<"All" | ShootCategory>("All");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const todayStr = getLocalToday();

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

  return (
    <div className="bg-[#101014] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2"><Camera size={13} className="text-amber-400" />{selectedMonth} Upcoming Shoots & Production Gigs</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">{activeShoots.filter(s => s.completed).length}/{activeShoots.length} Done</span>
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setShowFilterDropdown(prev => !prev)} className={`h-7 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${selectedFilter !== "All" ? "bg-amber-600/20 border-amber-500/50 text-amber-400" : "bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white"}`}>
              <Filter size={11} className={selectedFilter !== "All" ? "text-amber-400" : "text-zinc-400"} />
              <span className="text-[11px]">{selectedFilter === "All" ? "Filter" : selectedFilter}</span>
              <ChevronDown size={10} className="text-zinc-500" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 mt-1.5 w-40 bg-[#181822]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl p-1 z-30 space-y-0.5">
                {filterList.map(cat => (
                  <button key={cat} onClick={() => { setSelectedFilter(cat); setShowFilterDropdown(false); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${selectedFilter === cat ? "bg-amber-600/20 text-amber-400 font-semibold" : "text-zinc-300 hover:bg-white/[0.06]"}`}>
                    <span>{cat}</span>{selectedFilter === cat && <Check size={11} className="text-amber-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE LIST */}
      <div className="block lg:hidden space-y-2 mb-3">
        {filteredShoots.length === 0 ? (
          <div className="py-6 text-center text-zinc-500 text-xs italic">No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} production gigs found.</div>
        ) : filteredShoots.map(shoot => (
          <div key={shoot.id} className={`p-3 rounded-xl border transition-all ${shoot.completed ? "bg-zinc-950/40 border-zinc-900/60 opacity-45" : "bg-[#14141a] border-zinc-800/80 shadow-sm"}`}>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={() => onToggleCompletion(shoot.id)} className="shrink-0 focus:outline-none">
                    {shoot.completed ? <span className="w-4 h-4 rounded-full bg-emerald-950/70 border border-emerald-500/50 text-emerald-400 flex items-center justify-center"><Check size={9} className="stroke-[3]" /></span> : <span className="w-4 h-4 rounded-full bg-zinc-900/60 border border-zinc-700/60 text-zinc-500 flex items-center justify-center"><Circle size={6} /></span>}
                  </button>
                  <span className={`text-xs font-semibold truncate ${shoot.completed ? "line-through text-zinc-500" : "text-zinc-100"}`}>{shoot.title}</span>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${shoot.status === "Confirmed" ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/40" : shoot.status === "Pencil" ? "bg-amber-950/80 text-amber-300 border border-amber-800/40" : "bg-zinc-800 text-zinc-300 border border-zinc-700/40"}`}>{shoot.status}</span>
              </div>
              <div className="flex items-center justify-between pl-6 text-[10px] text-zinc-400">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="bg-zinc-800/80 text-zinc-300 border border-zinc-700/40 px-1.5 py-0.2 rounded font-medium">{shoot.category}</span>
                  {shoot.date && (shoot.date === todayStr ? <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-[1px] rounded font-bold uppercase tracking-wider text-[9px] ml-1">Due Today</span> : <span>• {formatShortDate(shoot.date)}</span>)}
                </div>
                <button onClick={() => handleStartEdit(shoot)} className="px-2 py-0.5 text-zinc-400 hover:text-amber-300 bg-zinc-800/70 rounded text-[10px] whitespace-nowrap shrink-0">Edit</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* DESKTOP LIST */}
      <div className="hidden lg:block">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-zinc-400 border-b border-white/[0.06] text-[11px]">
              <th className="py-2.5 px-3 font-semibold w-[90px]">Done</th><th className="py-2.5 px-3 font-semibold">Shoot / Gig Title</th><th className="py-2.5 px-3 font-semibold text-center w-[120px]">Date</th><th className="py-2.5 px-3 font-semibold text-center w-[110px]">Status</th><th className="py-2.5 px-3 font-semibold text-center w-[110px]">Category</th><th className="py-2.5 px-3 font-semibold text-right w-[90px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {filteredShoots.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-zinc-500 italic">No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} production gigs found.</td></tr>
            ) : filteredShoots.map(shoot => (
              <tr key={shoot.id} className={`group transition-all duration-150 ${shoot.completed ? "opacity-45" : "hover:bg-white/[0.02]"}`}>
                <td className="py-2.5 px-3 whitespace-nowrap">
                  <button onClick={() => onToggleCompletion(shoot.id)} className="flex items-center gap-1.5 focus:outline-none">
                    {shoot.completed ? <span className="flex items-center justify-center gap-1 w-[72px] text-emerald-400 text-[10px] font-bold bg-emerald-950/40 px-2 py-0.5 rounded-lg border border-emerald-600/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]"><Check size={10} className="stroke-[3]" /> Settled</span> : <span className="flex items-center justify-center gap-1 w-[72px] text-zinc-400 text-[10px] font-medium bg-zinc-900/40 px-2 py-0.5 rounded-lg border border-zinc-700/30"><Circle size={6} /> Active</span>}
                  </button>
                </td>
                <td className="py-2.5 px-3 text-zinc-200 font-medium"><span className={shoot.completed ? "line-through text-zinc-500" : ""}>{shoot.title}</span></td>
                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                  {shoot.date ? (shoot.date === todayStr ? <span className="inline-flex items-center gap-1 text-rose-400 font-bold text-[10px] bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md shadow-[0_0_10px_rgba(244,63,94,0.1)]"><Calendar size={10} className="text-rose-400" />DUE TODAY</span> : <span className="inline-flex items-center gap-1 text-zinc-300 font-mono text-[11px]"><Calendar size={10} className="text-zinc-500" />{formatShortDate(shoot.date)}</span>) : <span className="text-zinc-600">—</span>}
                </td>
                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${shoot.status === "Confirmed" ? "bg-emerald-950/70 text-emerald-300 border border-emerald-800/40" : shoot.status === "Pencil" ? "bg-amber-950/70 text-amber-300 border border-amber-800/40" : "bg-zinc-800 text-zinc-300 border border-zinc-700/40"}`}>{shoot.status}</span>
                </td>
                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                  <span className="bg-[#1c1c24] border border-white/[0.08] px-2 py-0.5 rounded-md text-[10px] font-medium text-amber-300/90">{shoot.category}</span>
                </td>
                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1 justify-end shrink-0">
                    <button onClick={() => handleStartEdit(shoot)} className="whitespace-nowrap shrink-0 px-2 py-1 text-zinc-400 hover:text-amber-300 hover:bg-white/[0.05] rounded-md text-[11px] flex items-center transition"><Edit2 size={10} className="mr-1" /> Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={() => setIsAdding(true)} className="w-full mt-3.5 py-3.5 border border-dashed border-white/[0.15] hover:border-amber-500/50 hover:bg-amber-500/10 text-zinc-400 hover:text-amber-400 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2">
        <Plus size={15} /> Add New Gig
      </button>

      {/* EDIT MODAL */}
      {editingId && activeShoots.some(s => s.id === editingId) && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={(e) => { if(e.target === e.currentTarget) handleCancelEdit(); }}>
          <div className="bg-[#121217] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400"><Edit2 size={18} /></div>
                <div><h3 className="text-sm font-bold text-white leading-tight">Edit Gig</h3><p className="text-[11px] text-zinc-400 font-medium">{editForm.title}</p></div>
              </div>
              <button onClick={handleCancelEdit} className="text-zinc-500 hover:text-white p-2 bg-white/[0.03] hover:bg-white/[0.08] rounded-full transition"><X size={16}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1.5 block">Gig / Project Title</label>
                <input type="text" value={editForm.title || ""} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1.5 block">Date</label>
                  <input type="date" value={editForm.date || ""} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1.5 block">Category</label>
                  <select value={editForm.category || "Solo Shoot"} onChange={(e) => setEditForm({ ...editForm, category: e.target.value as ShootCategory })} className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500">
                    {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1.5 block">Status</label>
                  <select value={editForm.status || "Confirmed"} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ShootStatus })} className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500">
                    <option value="Confirmed">Confirmed</option><option value="Pencil">Pencil</option><option value="Moved">Moved</option><option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-4 border-t border-white/[0.04]">
                <button onClick={() => { onDeleteShoot(editingId); handleCancelEdit(); }} className="p-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition flex items-center justify-center shadow-sm"><Trash2 size={16} /></button>
                <button onClick={() => { onSaveEdit("shoots"); handleCancelEdit(); }} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20 transition active:scale-[0.98]"><Save size={16} /> Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD MODAL */}
      {isAdding && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={(e) => { if(e.target === e.currentTarget) setIsAdding(false); }}>
          <div className="bg-[#121217] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400"><Plus size={18} /></div>
                <div><h3 className="text-sm font-bold text-white leading-tight">Add New Gig</h3><p className="text-[11px] text-zinc-400 font-medium">Log a new production gig or task</p></div>
              </div>
              <button onClick={() => setIsAdding(false)} className="text-zinc-500 hover:text-white p-2 bg-white/[0.03] hover:bg-white/[0.08] rounded-full transition"><X size={16}/></button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1.5 block">Gig / Project Title</label>
                <input type="text" value={newShoot.title} onChange={(e) => setNewShoot({ ...newShoot, title: e.target.value })} autoFocus placeholder="e.g. Wedding Edit, Product Shoot" className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1.5 block">Date</label>
                  <input type="date" value={newShoot.date} onChange={(e) => setNewShoot({ ...newShoot, date: e.target.value })} className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1.5 block">Category</label>
                  <select value={newShoot.category} onChange={(e) => setNewShoot({ ...newShoot, category: e.target.value as ShootCategory })} className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500">
                    {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1.5 block">Status</label>
                  <select value={newShoot.status} onChange={(e) => setNewShoot({ ...newShoot, status: e.target.value as ShootStatus })} className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500">
                    <option value="Confirmed">Confirmed</option><option value="Pencil">Pencil</option><option value="Moved">Moved</option><option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-4 border-t border-white/[0.04]">
                <button type="submit" className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20 transition active:scale-[0.98]"><Plus size={16} /> Add Gig</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});
