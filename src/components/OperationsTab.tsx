import React from "react";
import { BillsTable } from "./BillsTable";
import { ReceivablesTable } from "./ReceivablesTable";
import { ShootsTable } from "./ShootsTable";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  Bill,
  BillViewModel,
  BillType,
  ReceivableViewModel,
  ReceivableCategory,
  ReceivableFrequency,
  Shoot,
  ShootCategory,
  ShootStatus,
  EditFormData,
  CustomWallet,
} from "../types/finance";

type OpsTab = "bills" | "inflows" | "gigs";

interface OperationsTabProps {
  opsTab: OpsTab;
  setOpsTab: React.Dispatch<React.SetStateAction<OpsTab>>;
  activeBills: BillViewModel[];
  activeReceivables: ReceivableViewModel[];
  activeShoots: Shoot[];
  selectedMonth: string;

  onToggleBillStatus: (bill: BillViewModel, skipWalletMutation?: boolean) => void;
  onAddBill: (bill: {
    name: string;
    amount: number;
    dueDay: string;
    type: BillType;
    startMonth: string;
    endMonth: string;
    wallet?: string;
  }) => Bill | null;
  onDeleteBill: (id: string) => void;
  onSaveBillEdit: (
    category: "bills",
    scope?: "monthOnly" | "default"
  ) => boolean;
  onResetMonthOverride: (billId: string) => void;

  onToggleReceivableStatus: (rec: ReceivableViewModel) => void;
  onAddPayment: (rec: ReceivableViewModel, amount: number) => void;
  onAddReceivable: (rec: {
    name: string;
    amount: number;
    category: ReceivableCategory;
    frequency: ReceivableFrequency;
    biMonthlyDays?: number[];
    monthlyDay?: number;
    date?: string;
    wallet?: string;
  }) => void;
  onDeleteReceivable: (id: string) => void;
  onSaveReceivableEdit: () => void;

  onToggleShootCompletion: (id: string) => void;
  onAddShoot: (shoot: {
    title: string;
    date: string;
    category: ShootCategory;
    status: ShootStatus;
  }) => void;
  onDeleteShoot: (id: string) => void;
  onSaveShootEdit: () => void;

  editingId: string | null;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  editForm: EditFormData;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormData>>;

  customWallets?: CustomWallet[];
  defaultWallet?: string;
  inflowsLabel?: string;
  inflowCategories?: string[];
  gigsLabel?: string;
  gigCategories?: string[];
  highlightOverdue?: boolean;
}

export const OperationsTab: React.FC<OperationsTabProps> = ({
  opsTab,
  setOpsTab,
  activeBills,
  activeReceivables,
  activeShoots,
  selectedMonth,

  onToggleBillStatus,
  onAddBill,
  onDeleteBill,
  onSaveBillEdit,
  onResetMonthOverride,

  onToggleReceivableStatus,
  onAddPayment,
  onAddReceivable,
  onDeleteReceivable,
  onSaveReceivableEdit,

  onToggleShootCompletion,
  onAddShoot,
  onDeleteShoot,
  onSaveShootEdit,

  editingId,
  setEditingId,
  editForm,
  setEditForm,

  customWallets,
  defaultWallet,
  inflowsLabel,
  inflowCategories,
  gigsLabel,
  gigCategories,
  highlightOverdue,
}) => {
  return (
    <div
      id="operations-section"
      className="space-y-4 sm:space-y-5 animate-in fade-in zoom-in-95 duration-400 ease-out"
    >
      <div className="bg-surface-elevated/90 backdrop-blur-xl border border-inverse/[0.08] p-1.5 rounded-2xl flex items-center shadow-lg w-full mx-auto">
        <button
          onClick={() => setOpsTab("bills")}
          className={`flex-1 py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-xl transition-all duration-300 ${
            opsTab === "bills"
              ? "bg-blue-600/20 text-blue-400 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]"
              : "text-faint hover:text-secondary"
          }`}
        >
          Commitments
        </button>

        <button
          onClick={() => setOpsTab("inflows")}
          className={`flex-1 py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-xl transition-all duration-300 ${
            opsTab === "inflows"
              ? "bg-emerald-600/20 text-emerald-400 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.3)]"
              : "text-faint hover:text-secondary"
          }`}
        >
          Inflows
        </button>

        <button
          onClick={() => setOpsTab("gigs")}
          className={`flex-1 py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-xl transition-all duration-300 ${
            opsTab === "gigs"
              ? "bg-amber-600/20 text-amber-400 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)]"
              : "text-faint hover:text-secondary"
          }`}
        >
          Gigs & Tasks
        </button>
      </div>

      {opsTab === "bills" && (
        <div className="animate-in fade-in zoom-in-95 duration-300 ease-out">
          <ErrorBoundary>
            <BillsTable
              activeBills={activeBills}
              selectedMonth={selectedMonth}
              onToggleStatus={onToggleBillStatus}
              onAddBill={onAddBill}
              onDeleteBill={onDeleteBill}
              onSaveEdit={onSaveBillEdit}
              onResetMonthOverride={onResetMonthOverride}
              editingId={editingId}
              setEditingId={setEditingId}
              editForm={editForm}
              setEditForm={setEditForm}
              customWallets={customWallets}
              defaultWallet={defaultWallet}
              highlightOverdue={highlightOverdue}
            />
          </ErrorBoundary>
        </div>
      )}

      {opsTab === "inflows" && (
        <div className="animate-in fade-in zoom-in-95 duration-300 ease-out">
          <ErrorBoundary>
            <ReceivablesTable
              inflowsLabel={inflowsLabel}
              inflowCategories={inflowCategories}
              customWallets={customWallets}
              activeReceivables={activeReceivables}
              selectedMonth={selectedMonth}
              onToggleStatus={onToggleReceivableStatus}
              onAddPayment={onAddPayment}
              onAddReceivable={onAddReceivable}
              onDeleteReceivable={onDeleteReceivable}
              onSaveEdit={() => onSaveReceivableEdit()}
              editingId={editingId}
              setEditingId={setEditingId}
              editForm={editForm}
              setEditForm={setEditForm}
            />
          </ErrorBoundary>
        </div>
      )}

      {opsTab === "gigs" && (
        <div className="animate-in fade-in zoom-in-95 duration-300 ease-out">
          <ErrorBoundary>
            <ShootsTable
              gigsLabel={gigsLabel}
              gigCategories={gigCategories}
              activeShoots={activeShoots}
              selectedMonth={selectedMonth}
              onToggleCompletion={onToggleShootCompletion}
              onAddShoot={onAddShoot}
              onDeleteShoot={onDeleteShoot}
              onSaveEdit={() => onSaveShootEdit()}
              editingId={editingId}
              setEditingId={setEditingId}
              editForm={editForm}
              setEditForm={setEditForm}
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
};
