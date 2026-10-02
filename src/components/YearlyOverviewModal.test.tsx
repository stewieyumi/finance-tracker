import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { YearlyOverviewModal } from "./YearlyOverviewModal";
import { UnifiedFinanceData } from "../types/finance";

const createMockData = (): UnifiedFinanceData => ({
  wallets: {
    main: 10000,
  },
  library: {
    bills: [
      {
        id: "bill-1",
        name: "Rent",
        amount: 15000,
        dueDay: "5",
        type: "Bill",
        startMonth: "Jan 2026",
      },
    ],
    receivables: [
      {
        id: "rec-1",
        name: "Retainer",
        amount: 30000,
        frequency: "Monthly",
        startMonth: "Jan 2026",
      },
    ],
    shoots: [],
    manualTransactions: [],
  },
  logs: {
    "Jan 2026": {
      billsPaid: ["bill-1"],
      recsCollected: {
        "rec-1": { amountReceived: 30000, collected: true },
      },
    },
  },
  settings: {
    milestoneWallet: "main",
    targetFund: 50000,
    goalName: "Emergency Fund",
    walletLabels: {
      main: "Main Account",
    },
  },
});

describe("YearlyOverviewModal", () => {
  it("does not render when closed", () => {
    const { container } = render(
      <YearlyOverviewModal
        isOpen={false}
        onClose={vi.fn()}
        globalData={createMockData()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders accessible dialog with correct label", () => {
    render(
      <YearlyOverviewModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={createMockData()}
        selectedYear="2026"
      />
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-label", "Yearly Overview Modal");
    expect(screen.getByText("Yearly Overview")).toBeInTheDocument();
  });

  it("closes modal on Escape key", () => {
    const onClose = vi.fn();
    render(
      <YearlyOverviewModal
        isOpen={true}
        onClose={onClose}
        globalData={createMockData()}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes modal on backdrop click", () => {
    const onClose = vi.fn();
    render(
      <YearlyOverviewModal
        isOpen={true}
        onClose={onClose}
        globalData={createMockData()}
      />
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close modal when clicking inside modal content", () => {
    const onClose = vi.fn();
    render(
      <YearlyOverviewModal
        isOpen={true}
        onClose={onClose}
        globalData={createMockData()}
      />
    );
    fireEvent.click(screen.getByText("Yearly Overview"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens year dropdown when clicked", () => {
    render(
      <YearlyOverviewModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={createMockData()}
        selectedYear="2026"
      />
    );
    const yearButton = screen.getByRole("button", { name: "2026" });
    fireEvent.click(yearButton);

    expect(screen.getByRole("button", { name: "2025" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2027" })).toBeInTheDocument();
  });

  it("updates visible year and closes dropdown when year is selected", () => {
    render(
      <YearlyOverviewModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={createMockData()}
        selectedYear="2026"
      />
    );
    const yearButton = screen.getByRole("button", { name: "2026" });
    fireEvent.click(yearButton);

    const year2027 = screen.getByRole("button", { name: "2027" });
    fireEvent.click(year2027);

    // Visible trigger button should now show 2027
    expect(screen.getByRole("button", { name: "2027" })).toBeInTheDocument();
    // Dropdown list options should no longer be rendered
    expect(screen.queryByRole("button", { name: "2025" })).not.toBeInTheDocument();
  });

  it("clicking within the dropdown does NOT close the modal", () => {
    const onClose = vi.fn();
    render(
      <YearlyOverviewModal
        isOpen={true}
        onClose={onClose}
        globalData={createMockData()}
        selectedYear="2026"
      />
    );
    const yearButton = screen.getByRole("button", { name: "2026" });
    fireEvent.click(yearButton);

    const year2027 = screen.getByRole("button", { name: "2027" });
    fireEvent.click(year2027);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("clicking outside the dropdown closes only the dropdown without closing modal", () => {
    const onClose = vi.fn();
    render(
      <YearlyOverviewModal
        isOpen={true}
        onClose={onClose}
        globalData={createMockData()}
        selectedYear="2026"
      />
    );
    const yearButton = screen.getByRole("button", { name: "2026" });
    fireEvent.click(yearButton);
    expect(screen.getByRole("button", { name: "2025" })).toBeInTheDocument();

    // Click outside dropdown (e.g. on modal header or modal box)
    fireEvent.mouseDown(screen.getByText("Yearly Overview"));

    // Dropdown closes
    expect(screen.queryByRole("button", { name: "2025" })).not.toBeInTheDocument();
    // Modal is NOT closed
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes modal on close button click and done button click", () => {
    const onClose = vi.fn();
    render(
      <YearlyOverviewModal
        isOpen={true}
        onClose={onClose}
        globalData={createMockData()}
      />
    );

    const doneButton = screen.getByRole("button", { name: "Done" });
    fireEvent.click(doneButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    const closeButton = screen.getByTitle("Close (Esc)");
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
