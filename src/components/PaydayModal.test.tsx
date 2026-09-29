import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { PaydayModal } from "./PaydayModal";

describe("PaydayModal", () => {
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

  it("calls onConfigureBaselines when settings button is clicked", () => {
    render(<PaydayModal {...defaultProps} />);
    const settingsBtn = screen.getByTitle("Configure Baselines & Routing");
    fireEvent.click(settingsBtn);
    expect(defaultProps.onConfigureBaselines).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onExecutePaydaySplit when distribute button is clicked", () => {
    render(<PaydayModal {...defaultProps} />);
    const distributeBtn = screen.getByText("Auto-Distribute to Wallets");
    fireEvent.click(distributeBtn);
    expect(defaultProps.onExecutePaydaySplit).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
