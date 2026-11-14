import React from "react";
import { UpcomingBillsCard, type UpcomingBill } from "./UpcomingBillsCard";
import { getMonthKey } from "../utils/dateHelpers";
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
  upcomingBills: UpcomingBill[];
  activeReceivables: ReceivableViewModel[];
  activeShoots: Shoot[];
  selectedMonth: string;
  onSelectMonth: (month: string) => void;

  onConfirmPriorBillPayments?: (billId: string, months: string[]) => void;
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
  onAddPayment: (rec: ReceivableViewModel, amount: number, paydayDay?: number) => void;
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

  calendarSync?: React.ReactNode;
  onChangeShootStatus?: (id: string, status: ShootStatus) => void;
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
  upcomingBills,
  activeReceivables,
  activeShoots,
  selectedMonth,
  onSelectMonth,

  onToggleBillStatus,
  onConfirmPriorBillPayments,
  onAddBill,
  onDeleteBill,
  onSaveBillEdit,
  onResetMonthOverride,

  onToggleReceivableStatus,
  onAddPayment,
  onAddReceivable,
  onDeleteReceivable,
  onSaveReceivableEdit,

  calendarSync,
  onChangeShootStatus,
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
  const [billJump, setBillJump] = React.useState<{ id: string; sequence: number }>();

  return (
    <div
      id="operations-section"
      className="space-y-4 sm:space-y-5 animate-in fade-in zoom-in-95 duration-400 ease-out"
    >
      <nav aria-label="Plan sections" className="grid grid-cols-3 gap-1 rounded-xl bg-fill p-1">
        {([
          ["bills", "Commitments"],
          ["inflows", "Inflows"],
          ["gigs", "Gigs & Tasks"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            aria-pressed={opsTab === tab}
            onClick={() => setOpsTab(tab)}
            className={`min-h-11 rounded-lg px-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-blue-500 ${opsTab === tab
              ? "bg-surface-elevated text-strong shadow-sm"
              : "text-muted hover:bg-fill-strong hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {opsTab === "bills" && selectedMonth === getMonthKey(new Date()) && (
        <UpcomingBillsCard bills={upcomingBills} onSelect={bill => {
          onSelectMonth(bill.month);
          setBillJump(previous => ({ id: bill.id, sequence: (previous?.sequence ?? 0) + 1 }));
        }} action={
          <a href="#plan-commitments" className="rounded-lg bg-fill px-3 py-2 text-xs font-medium text-primary hover:bg-fill-strong">
            View All
          </a>
        } />
      )}

      {opsTab === "bills" && (
        <div id="plan-commitments" tabIndex={-1} className="scroll-mt-4 animate-in fade-in zoom-in-95 duration-300 ease-out">
          <ErrorBoundary>
            <BillsTable
              key={billJump?.sequence ?? 0}
              jumpToBillId={billJump?.id}
              activeBills={activeBills}
              selectedMonth={selectedMonth}
              onToggleStatus={onToggleBillStatus}
              onConfirmPriorBillPayments={onConfirmPriorBillPayments}
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
              defaultWallet={defaultWallet}
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
              calendarSync={calendarSync}
              onChangeStatus={onChangeShootStatus}
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
