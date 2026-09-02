import React, { useState, useMemo, useEffect, useRef } from "react";
import { Camera, Check, Circle, Edit2, Save, Trash2, Plus, Filter, ChevronDown, Calendar, X } from "lucide-react";
import { Shoot, ShootCategory, ShootStatus, EditFormData } from "../types/finance";

const SHOOT_CATEGORIES: (ShootCategory | "All")[] = ["All", "Solo Shoot", "Assistant", "Video Edit", "Event", "Commercial", "Other"];

interface ShootsTableProps {
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

export const ShootsTable: React.FC<ShootsTableProps> = React.memo(({
  activeShoots,
  selectedMonth,
  onToggleCompletion,
  onAddShoot,
  onDeleteShoot,
  onSaveEdit,
  editingId,
  setEditingId,
  editForm,
  setEditForm
}) => {
  const [newShoot, setNewShoot] = useState<{
    title: string;
    date: string;
    category: ShootCategory;
    status: ShootStatus;
  }>({
    title: "",
    date: "",
    category: "Solo Shoot",
    status: "Confirmed"
  });

  const [selectedFilter, setSelectedFilter] = useState<"All" | ShootCategory>("All");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredShoots = useMemo(() => {
    if (selectedFilter === "All") return activeShoots;
    return activeShoots.filter(s => s.category === selectedFilter);
  }, [activeShoots, selectedFilter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShoot.title) return;
    onAddShoot({
      title: newShoot.title,
      date: newShoot.date,
      category: newShoot.category,
      status: newShoot.status
    });
    setNewShoot({ title: "", date: "", category: "Solo Shoot", status: "Confirmed" });
  };

  const handleStartEdit = (shoot: Shoot) => {
    setEditingId(shoot.id);
    setEditForm({ ...shoot });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  return (
    <div className="bg-[#101014] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl w-full">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
          <Camera size={13} className="text-amber-400" />
          {selectedMonth} Upcoming Shoots & Production Gigs
        </h2>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
            {activeShoots.filter(s => s.completed).length}/{activeShoots.length} Done
          </span>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowFilterDropdown(prev => !prev)}
              aria-label="Filter shoots by category"
              className={"h-7 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition " + (
                selectedFilter !== "All"
                  ? "bg-amber-600/20 border-amber-500/50 text-amber-400"
                  : "bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white"
              )}
            >
              <Filter size={11} className={selectedFilter !== "All" ? "text-amber-400" : "text-zinc-400"} />
              <span className="text-[11px]">{selectedFilter === "All" ? "Filter" : selectedFilter}</span>
              <ChevronDown size={10} className="text-zinc-500" />
            </button>

            {showFilterDropdown && (
              <div className="absolute right-0 mt-1.5 w-40 bg-[#181822]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl p-1 z-30 space-y-0.5">
                {SHOOT_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => { setSelectedFilter(cat); setShowFilterDropdown(false); }}
                    className={"w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between " + (
                      selectedFilter === cat
                        ? "bg-amber-600/20 text-amber-400 font-semibold"
                        : "text-zinc-300 hover:bg-white/[0.06]"
                    )}
                  >
                    <span>{cat}</span>
                    {selectedFilter === cat && <Check size={11} className="text-amber-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE CARDS (< lg) */}
      <div className="block lg:hidden space-y-2 mb-3">
        {filteredShoots.length === 0 ? (
          <div className="py-6 text-center text-zinc-500 text-xs italic">
            No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} production gigs found.
          </div>
        ) : (
          filteredShoots.map(shoot => {
            const isEditing = editingId === shoot.id;
            return (
              <div
                key={shoot.id}
                className={"p-3 rounded-xl border transition-all " + (
                  shoot.completed
                    ? "bg-zinc-950/40 border-zinc-900/60 opacity-45"
                    : "bg-[#14141a] border-zinc-800/80 shadow-sm"
                )}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editForm.title || ""}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      placeholder="Gig title"
                      className="bg-[#0b0b0d] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white text-xs w-full outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={editForm.category || "Solo Shoot"}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value as ShootCategory })}
                        className="bg-[#0b0b0d] border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs"
                      >
                        <option value="Solo Shoot">Solo Shoot</option>
                        <option value="Assistant">Assistant</option>
                        <option value="Video Edit">Video Edit</option>
                        <option value="Event">Event</option>
                        <option value="Commercial">Commercial</option>
                        <option value="Other">Other</option>
                      </select>
                      <select
                        value={editForm.status || "Confirmed"}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ShootStatus })}
                        className="bg-[#0b0b0d] border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs"
                      >
                        <option value="Confirmed">Confirmed</option>
                        <option value="Pencil">Pencil</option>
                        <option value="Moved">Moved</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button onClick={handleCancelEdit} aria-label="Cancel edit" className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg text-xs"><X size={12} /></button>
                      <button onClick={() => onSaveEdit("shoots")} aria-label="Save changes" className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs"><Save size={12} /></button>
                      <button onClick={() => onDeleteShoot(shoot.id)} aria-label="Delete shoot" className="p-1.5 text-zinc-400 hover:text-rose-400 bg-zinc-800 rounded-lg text-xs"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <button onClick={() => onToggleCompletion(shoot.id)} aria-label={`Mark ${shoot.title} as ${shoot.completed ? "active" : "done"}`} className="shrink-0 focus:outline-none">
                          {shoot.completed ? (
                            <span className="w-4 h-4 rounded-full bg-amber-950/70 border border-amber-500/50 text-amber-400 flex items-center justify-center">
                              <Check size={9} className="stroke-[3]" />
                            </span>
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-zinc-900/60 border border-zinc-700/60 text-zinc-500 flex items-center justify-center">
                              <Circle size={6} />
                            </span>
                          )}
                        </button>
                        <span className={"text-xs font-semibold truncate " + (shoot.completed ? "line-through text-zinc-500" : "text-zinc-100")}>
                          {shoot.title}
                        </span>
                      </div>

                      <span className={"text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0 " + (
                        shoot.status === "Confirmed" ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/40" :
                        shoot.status === "Pencil" ? "bg-amber-950/80 text-amber-300 border border-amber-800/40" :
                        "bg-zinc-800 text-zinc-300 border border-zinc-700/40"
                      )}>{shoot.status}</span>
                    </div>

                    <div className="flex items-center justify-between pl-6 text-[10px] text-zinc-400">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="bg-zinc-800/80 text-zinc-300 border border-zinc-700/40 px-1.5 py-0.2 rounded font-medium">
                          {shoot.category}
                        </span>
                        {shoot.date && <span>• {formatShortDate(shoot.date)}</span>}
                      </div>

                      <button
                        onClick={() => handleStartEdit(shoot)}
                        aria-label={`Edit ${shoot.title}`}
                        className="px-2 py-0.5 text-zinc-400 hover:text-amber-300 bg-zinc-800/70 rounded text-[10px]"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP TABLE (≥ lg) */}
      <div className="hidden lg:block">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-zinc-400 border-b border-white/[0.06] text-[11px]">
              <th className="py-2.5 px-3 font-semibold w-[90px]">Done</th>
              <th className="py-2.5 px-3 font-semibold">Shoot / Gig Title</th>
              <th className="py-2.5 px-3 font-semibold text-center w-[120px]">Date</th>
              <th className="py-2.5 px-3 font-semibold text-center w-[110px]">Status</th>
              <th className="py-2.5 px-3 font-semibold text-center w-[110px]">Category</th>
              <th className="py-2.5 px-3 font-semibold text-right w-[90px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {filteredShoots.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500 italic">
                  No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} production gigs found.
                </td>
              </tr>
            ) : (
              filteredShoots.map((shoot) => {
                const isEditing = editingId === shoot.id;
                return (
                  <tr key={shoot.id} className={"group transition-all duration-150 " + (shoot.completed ? "opacity-45" : "hover:bg-white/[0.02]")}>
                    {/* DONE TOGGLE */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <button onClick={() => onToggleCompletion(shoot.id)} aria-label={`Toggle completion for ${shoot.title}`} className="flex items-center gap-1.5 focus:outline-none">
                        {shoot.completed ? (
                          <span className="flex items-center justify-center gap-1 w-[72px] text-amber-400 text-[10px] font-semibold bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-600/30">
                            <Check size={10} className="stroke-[3]" /> Done
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-1 w-[72px] text-zinc-400 text-[10px] font-medium bg-zinc-900/40 px-2 py-0.5 rounded-lg border border-zinc-700/30">
                            <Circle size={6} /> Active
                          </span>
                        )}
                      </button>
                    </td>

                    {/* TITLE */}
                    <td className="py-2.5 px-3 text-zinc-200 font-medium">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.title || ""}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          className="bg-[#0b0b0d] border border-zinc-700 rounded-md px-2 py-1 text-white text-xs w-full focus:ring-1 focus:ring-amber-500 outline-none"
                        />
                      ) : (
                        <span className={shoot.completed ? "line-through text-zinc-500" : ""}>{shoot.title}</span>
                      )}
                    </td>

                    {/* DATE */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="text"
                          placeholder="e.g. Sep 12"
                          value={editForm.date || ""}
                          onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                          className="bg-[#0b0b0d] border border-zinc-700 rounded-md px-1.5 py-0.5 text-white text-xs w-24 text-center"
                        />
                      ) : (
                        shoot.date ? (
                          <span className="inline-flex items-center gap-1 text-zinc-300 font-mono text-[11px]">
                            <Calendar size={10} className="text-zinc-500" />
                            {formatShortDate(shoot.date)}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )
                      )}
                    </td>

                    {/* STATUS */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {isEditing ? (
                        <select
                          value={editForm.status || "Confirmed"}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ShootStatus })}
                          className="bg-[#0b0b0d] border border-zinc-700 rounded-md px-1.5 py-1 text-white text-xs"
                        >
                          <option value="Confirmed">Confirmed</option>
                          <option value="Pencil">Pencil</option>
                          <option value="Moved">Moved</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      ) : (
                        <span className={"text-[10px] font-semibold px-2 py-0.5 rounded-md " + (
                          shoot.status === "Confirmed" ? "bg-emerald-950/70 text-emerald-300 border border-emerald-800/40" :
                          shoot.status === "Pencil" ? "bg-amber-950/70 text-amber-300 border border-amber-800/40" :
                          "bg-zinc-800 text-zinc-300 border border-zinc-700/40"
                        )}>
                          {shoot.status}
                        </span>
                      )}
                    </td>

                    {/* CATEGORY */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {isEditing ? (
                        <select
                          value={editForm.category || "Solo Shoot"}
                          onChange={(e) => setEditForm({ ...editForm, category: e.target.value as ShootCategory })}
                          className="bg-[#0b0b0d] border border-zinc-700 rounded-md px-1.5 py-1 text-white text-xs"
                        >
                          <option value="Solo Shoot">Solo Shoot</option>
                          <option value="Assistant">Assistant</option>
                          <option value="Video Edit">Video Edit</option>
                          <option value="Event">Event</option>
                          <option value="Commercial">Commercial</option>
                          <option value="Other">Other</option>
                        </select>
                      ) : (
                        <span className="bg-[#1c1c24] border border-white/[0.08] px-2 py-0.5 rounded-md text-[10px] font-medium text-amber-300/90">
                          {shoot.category}
                        </span>
                      )}
                    </td>

                    {/* ACTIONS */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 justify-end">
                        {isEditing ? (
                          <>
                            <button onClick={handleCancelEdit} aria-label="Cancel edit" className="p-1 text-zinc-400 hover:text-white bg-zinc-800 rounded-md text-[10px] transition"><X size={11} /></button>
                            <button onClick={() => onSaveEdit("shoots")} aria-label="Save shoot" className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[10px] transition"><Save size={11} /></button>
                            <button onClick={() => onDeleteShoot(shoot.id)} aria-label="Delete shoot" className="p-1 text-zinc-400 hover:text-rose-400 bg-zinc-800 rounded-md text-[10px] transition"><Trash2 size={11} /></button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleStartEdit(shoot)}
                            aria-label={`Edit ${shoot.title}`}
                            className="px-2 py-1 text-zinc-400 hover:text-amber-300 hover:bg-white/[0.05] rounded-md text-[11px] flex items-center transition"
                          >
                            <Edit2 size={10} className="mr-1" /> Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ADD GIG FORM */}
      <form onSubmit={handleSubmit} className="mt-3.5 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[260px]">
          <input
            type="text"
            placeholder="Gig title / project..."
            value={newShoot.title}
            onChange={(e) => setNewShoot({ ...newShoot, title: e.target.value })}
            className="bg-[#0b0b0d] border border-zinc-800 focus:border-amber-500/60 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none flex-1"
          />

          <input
            type="text"
            placeholder="Date (e.g. Sep 12)"
            value={newShoot.date}
            onChange={(e) => setNewShoot({ ...newShoot, date: e.target.value })}
            className="bg-[#0b0b0d] border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 font-mono outline-none w-28"
          />

          <select
            value={newShoot.category}
            onChange={(e) => setNewShoot({ ...newShoot, category: e.target.value as ShootCategory })}
            className="bg-[#0b0b0d] border border-zinc-800 rounded-xl px-2 py-1.5 text-xs text-white outline-none"
          >
            <option value="Solo Shoot">Solo Shoot</option>
            <option value="Assistant">Assistant</option>
            <option value="Video Edit">Video Edit</option>
            <option value="Event">Event</option>
            <option value="Commercial">Commercial</option>
            <option value="Other">Other</option>
          </select>

          <select
            value={newShoot.status}
            onChange={(e) => setNewShoot({ ...newShoot, status: e.target.value as ShootStatus })}
            className="bg-[#0b0b0d] border border-zinc-800 rounded-xl px-2 py-1.5 text-xs text-white outline-none"
          >
            <option value="Confirmed">Confirmed</option>
            <option value="Pencil">Pencil</option>
            <option value="Moved">Moved</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        <button
          type="submit"
          className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-lg shadow-amber-950/40 transition whitespace-nowrap"
        >
          <Plus size={13} />
          <span>Add Gig</span>
        </button>
      </form>
    </div>
  );
});
