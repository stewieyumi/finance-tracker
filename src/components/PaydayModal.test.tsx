import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { PaydayModal } from "./PaydayModal";
import { exportPaydaysToCalendar } from "../utils/calendarExport";

vi.mock("../utils/calendarExport", () => ({
  exportPaydaysToCalendar: vi.fn(),
}));

describe("PaydayModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    paydayDays: [15, 30],
    paydayAllocations: { main: 5000, savings: 3000 },
    remainingBuffer: 2000,
    walletLabels: { main: "Main Wallet", savings: "Savings Vault" },
    onConfigureBaselines: vi.fn(),
    onExecutePaydaySplit: vi.fn(),
    onExportCalendar: vi.fn(),
  };

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <PaydayModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders payday modal with title and allocations", () => {
    render(<PaydayModal {...defaultProps} />);
    expect(screen.getByText(/Payday Flow \(15th & 30th\)/i)).toBeInTheDocument();
    expect(screen.getByText("Main Wallet")).toBeInTheDocument();
    expect(screen.getByText("₱5,000.00")).toBeInTheDocument();
    expect(screen.getByText("₱3,000.00")).toBeInTheDocument();
    expect(screen.getByText("₱2,000.00")).toBeInTheDocument();
  });

  it("renders with dialog accessibility", () => {
    render(<PaydayModal {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-label", "Payday Distribution Modal");
  });

  it("triggers onExportCalendar when header export button is clicked", () => {
    render(<PaydayModal {...defaultProps} />);
    const exportBtn = screen.getByLabelText("Export Paydays to Calendar");
    fireEvent.click(exportBtn);
    expect(defaultProps.onExportCalendar).toHaveBeenCalledWith([15, 30]);
  });

  it("triggers onExportCalendar when body export button is clicked", () => {
    render(<PaydayModal {...defaultProps} />);
    const bodyExportBtn = screen.getByText("Export Paydays (.ics)");
    fireEvent.click(bodyExportBtn);
    expect(defaultProps.onExportCalendar).toHaveBeenCalledWith([15, 30]);
  });

  it("falls back to exportPaydaysToCalendar when onExportCalendar is not provided", () => {
    render(<PaydayModal {...defaultProps} onExportCalendar={undefined} />);
    const exportBtn = screen.getByLabelText("Export Paydays to Calendar");
    fireEvent.click(exportBtn);
    expect(exportPaydaysToCalendar).toHaveBeenCalledWith([15, 30]);
  });

  it("calls onConfigureBaselines and onClose when settings button is clicked", () => {
    const onConfigureBaselines = vi.fn();
    const onClose = vi.fn();
    render(
      <PaydayModal
        {...defaultProps}
        onConfigureBaselines={onConfigureBaselines}
        onClose={onClose}
      />
    );
    const settingsBtn = screen.getByTitle("Configure Baselines & Routing");
    fireEvent.click(settingsBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfigureBaselines).toHaveBeenCalledTimes(1);
  });

  it("calls onExecutePaydaySplit and onClose when distribute button is clicked", () => {
    const onExecutePaydaySplit = vi.fn();
    const onClose = vi.fn();
    render(
      <PaydayModal
        {...defaultProps}
        onExecutePaydaySplit={onExecutePaydaySplit}
        onClose={onClose}
      />
    );
    const distributeBtn = screen.getByText("Auto-Distribute to Wallets");
    fireEvent.click(distributeBtn);
    expect(onExecutePaydaySplit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(<PaydayModal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    render(<PaydayModal {...defaultProps} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on click inside content", () => {
    const onClose = vi.fn();
    render(<PaydayModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Planned wallet allocations for this payout:"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when close button (X) is clicked", () => {
    const onClose = vi.fn();
    render(<PaydayModal {...defaultProps} onClose={onClose} />);
    const closeBtn = screen.getByLabelText("Close payday modal");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onUndoSplit when Undo is clicked, without calling onClose", () => {
    const onUndoSplit = vi.fn();
    const onClose = vi.fn();
    const latestExecution = {
      id: "exec-123",
      date: "2026-03-15",
      timestamp: 1773532800000,
      allocations: { main: 5000 },
      billContributions: [],
    };

    render(
      <PaydayModal
        {...defaultProps}
        onClose={onClose}
        latestExecution={latestExecution}
        onUndoSplit={onUndoSplit}
      />
    );

    const undoBtn = screen.getByRole("button", { name: /undo/i });
    fireEvent.click(undoBtn);

    expect(onUndoSplit).toHaveBeenCalledWith("exec-123");
    expect(onClose).not.toHaveBeenCalled();
  });
});
