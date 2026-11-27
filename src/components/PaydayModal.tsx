import { BudgetSetupModal } from "./BudgetSetupModal";
import { FinancialCheckupPanel } from "./FinancialCheckupPanel";
import { exportPaydaysToCalendar } from "../utils/calendarExport";
import { GuideButton } from './ContextGuideControls';
import React, { useId, useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import type { PaydayExecution, FinanceTransitionCommitter, ReceivedIncomeDraft, UnifiedFinanceData } from '../types/finance';
import { Modal } from './ui/Modal';
import { entryDialogStyles } from './ui/dialogStyles';
import { MonthlyBudgetPanel } from './MonthlyBudgetPanel';
import { CashDistributionPanel } from './CashDistributionPanel';

interface PaydayModalProps {
  isOpen: boolean; onClose: () => void;
  globalData?: UnifiedFinanceData; selectedMonth?: string;
  commitBudgetTransition?: FinanceTransitionCommitter; onBudgetMessage?: (message: string) => void;
  initialReceipt?: ReceivedIncomeDraft; unpaidCommitments?: number; distributionDisabled?: boolean;
  paydayDays?: number[]; paydayAllocations: Record<string, number>;
  onConfigureBaselines: () => void;
  onConfigureSavings?: () => void;
  latestExecution?: PaydayExecution; onUndoSplit?: (id: string) => void;
  onExportCalendar?: (paydayDays: number[]) => void;
}
export const PaydayModal: React.FC<PaydayModalProps> = ({ isOpen, onClose, globalData, selectedMonth, commitBudgetTransition,
  onBudgetMessage = () => {}, initialReceipt, unpaidCommitments, distributionDisabled, paydayAllocations,
  latestExecution, onUndoSplit, onConfigureBaselines, onConfigureSavings, paydayDays, onExportCalendar }) => {
  const id = useId();
  const [tab, setTab] = useState<'budget' | 'distribute' | 'checkup'>(initialReceipt ? 'distribute' : 'budget');
  const [settingUp, setSettingUp] = useState(false);
  if (!isOpen) return null;
  const closeSetup = () => { setSettingUp(false); requestAnimationFrame(() => document.getElementById(`${id}-build-budget`)?.focus()); };
  if (settingUp && globalData && selectedMonth) return <BudgetSetupModal key={selectedMonth} data={globalData} month={selectedMonth} unpaidCommitments={unpaidCommitments ?? 0} commitTransition={commitBudgetTransition} onSaved={onBudgetMessage} onClose={closeSetup} />;
  return <Modal isOpen onClose={onClose} manageFocus ariaLabel="Budget Plan">
    <div data-guide-screen="payday" className={`${entryDialogStyles.card} max-w-lg !overflow-hidden flex flex-col space-y-4`}>
      <div className="flex shrink-0 items-center justify-between gap-3"><h2 className="text-base font-semibold text-primary">Budget Plan</h2>
        <div className="flex items-center gap-1"><GuideButton screen="payday" name="Budget Plan" /><button type="button" onClick={onClose} aria-label="Close budget plan" className={entryDialogStyles.close}><X size={18} aria-hidden="true" /></button></div>
      </div>
      <div data-guide-target="budget-tabs" role="tablist" aria-label="Budget Plan sections" className="grid shrink-0 grid-cols-3 gap-1 rounded-xl bg-fill p-1" onKeyDown={event => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); const keys = ['budget', 'distribute', 'checkup'] as const;
          const index = keys.indexOf(tab); const next = event.key === 'Home' ? keys[0] : event.key === 'End' ? keys[2] : keys[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
          setTab(next); document.getElementById(`${id}-${next}`)?.focus();
        }
      }}>
        {([['budget', 'Budget'], ['distribute', 'Auto-Distribute'], ['checkup', 'Checkup']] as const).map(([key, label]) => <button key={key} id={`${id}-${key}`} type="button" role="tab" aria-selected={tab === key} aria-controls={`${id}-${key}-panel`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} className={`min-h-11 min-w-0 rounded-lg px-2 text-xs font-semibold ${tab === key ? 'bg-surface-elevated text-primary shadow-sm' : 'text-muted'}`}>{label}</button>)}
      </div>
      <div data-guide-target="budget-content" tabIndex={-1} className="min-h-0 overflow-y-auto overscroll-contain">
        <div id={`${id}-budget-panel`} role="tabpanel" aria-labelledby={`${id}-budget`} hidden={tab !== 'budget'}>
          {globalData && selectedMonth ? <MonthlyBudgetPanel key={selectedMonth} data={globalData} month={selectedMonth} commitTransition={commitBudgetTransition} setupButtonId={`${id}-build-budget`} onSetup={() => setSettingUp(true)} /> : <p className="text-xs text-muted">Open your account to create a budget.</p>}
        </div>
        <div id={`${id}-checkup-panel`} role="tabpanel" aria-labelledby={`${id}-checkup`} hidden={tab !== 'checkup'}>
          {globalData && selectedMonth && <FinancialCheckupPanel key={selectedMonth} data={globalData} month={selectedMonth} unpaidCommitments={unpaidCommitments ?? 0} commitTransition={commitBudgetTransition} onSaved={onBudgetMessage} onConfigureSavings={onConfigureSavings ? () => { onClose(); onConfigureSavings(); } : undefined} onBuildBudget={() => { setTab('budget'); document.getElementById(`${id}-budget`)?.focus(); }} />}
        </div>
        <div id={`${id}-distribute-panel`} role="tabpanel" aria-labelledby={`${id}-distribute`} hidden={tab !== 'distribute'}>
          {distributionDisabled ? <p role="status" className="text-xs text-warning">Switch to the current month before recording a distribution.</p> : globalData ? <CashDistributionPanel key={initialReceipt?.receiptId ?? 'manual'} data={globalData} commitTransition={commitBudgetTransition} onSaved={onBudgetMessage} initialReceipt={initialReceipt} suggestedAllocations={paydayAllocations} /> : <p className="text-xs text-muted">Open your account to distribute money.</p>}
          <button type="button" onClick={() => { onClose(); onConfigureBaselines(); }} className="mt-3 min-h-11 rounded-xl px-3 text-xs text-muted hover:bg-fill">Optional regular-pay settings</button>
          {(globalData?.settings?.perPayoutSalary ?? 0) > 0 && paydayDays?.length && <button type="button" onClick={() => onExportCalendar ? onExportCalendar(paydayDays) : exportPaydaysToCalendar(paydayDays)} className="mt-2 min-h-11 rounded-xl px-3 text-xs text-primary">Export Paydays (.ics)</button>}
          {latestExecution && onUndoSplit && <details className="mt-3 text-xs"><summary className="min-h-11 cursor-pointer content-center text-muted">Earlier regular-pay distribution</summary><div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-fill p-3"><span className="flex items-center gap-1"><CheckCircle2 size={13} />Distributed {latestExecution.date}</span><button type="button" onClick={() => onUndoSplit(latestExecution.id)} className="min-h-11 rounded-lg px-3 text-negative">Undo earlier distribution</button></div></details>}
        </div>
      </div>
    </div>
  </Modal>;
};
