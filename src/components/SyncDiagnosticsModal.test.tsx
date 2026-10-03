import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SyncDiagnosticsModal } from "./SyncDiagnosticsModal";
import { UnifiedFinanceData } from "../types/finance";

describe("SyncDiagnosticsModal", () => {
  const mockGlobalData: UnifiedFinanceData = {
    wallets: {
      gotyme: 12500,
      cash: 500,
      bank: 1000,
    },
    library: {
      bills: [
        {
          id: "b1",
          name: "Internet",
          amount: 1500,
          dueDay: "15",
          type: "Bill",
        },
        {
          id: "b2",
          name: "Electricity",
          amount: 2500,
          dueDay: "20",
          type: "Bill",
        },
      ],
      receivables: [],
      shoots: [],
    },
    logs: {},
    settings: {
      theme: "dark",
    },
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    globalData: mockGlobalData,
    totalLiquid: 14000,
    debugLog: "Push sync successful at 10:00",
    onForcePush: vi.fn(),
    onForcePull: vi.fn(),
  };

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <SyncDiagnosticsModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders with dialog accessibility", () => {
    render(<SyncDiagnosticsModal {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-label", "Sync Diagnostics");
  });

  it("renders local finance state and debug log from props", () => {
    render(<SyncDiagnosticsModal {...defaultProps} />);
    expect(screen.getByText("Sync & Cloud Diagnostics")).toBeInTheDocument();
    expect(screen.getByText("₱14,000.00")).toBeInTheDocument();
    expect(screen.getByText("₱12500")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // Bills in Memory
    expect(
      screen.getByText("Push sync successful at 10:00")
    ).toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(<SyncDiagnosticsModal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    render(<SyncDiagnosticsModal {...defaultProps} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on click inside content", () => {
    const onClose = vi.fn();
    render(<SyncDiagnosticsModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Sync & Cloud Diagnostics"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when close button is clicked", () => {
    const onClose = vi.fn();
    render(<SyncDiagnosticsModal {...defaultProps} onClose={onClose} />);
    const closeBtn = screen.getByLabelText("Close diagnostics");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onForcePush when Force Cloud Push button is clicked", () => {
    const onForcePush = vi.fn();
    render(
      <SyncDiagnosticsModal {...defaultProps} onForcePush={onForcePush} />
    );
    const pushBtn = screen.getByRole("button", {
      name: /force cloud push/i,
    });
    fireEvent.click(pushBtn);
    expect(onForcePush).toHaveBeenCalledTimes(1);
  });

  it("calls onForcePull when Force Cloud Pull button is clicked", () => {
    const onForcePull = vi.fn();
    render(
      <SyncDiagnosticsModal {...defaultProps} onForcePull={onForcePull} />
    );
    const pullBtn = screen.getByRole("button", {
      name: /force cloud pull/i,
    });
    fireEvent.click(pullBtn);
    expect(onForcePull).toHaveBeenCalledTimes(1);
  });
});
