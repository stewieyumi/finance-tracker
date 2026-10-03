import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { QuickAddModal, QuickAddAction } from "./QuickAddModal";

describe("QuickAddModal", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSelectAction: vi.fn(),
  };

  it("does not render when isOpen is false", () => {
    const { container } = render(<QuickAddModal {...defaultProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders dialog with accessible name", () => {
    render(<QuickAddModal {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-label", "Quick Add Menu");
    expect(screen.getByText("Quick Add")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<QuickAddModal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    render(<QuickAddModal {...defaultProps} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on click inside modal content", () => {
    const onClose = vi.fn();
    render(<QuickAddModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Quick Add"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes via close button", () => {
    const onClose = vi.fn();
    render(<QuickAddModal {...defaultProps} onClose={onClose} />);
    const closeBtn = screen.getByRole("button", { name: /close quick add menu/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  const expectedActions: { action: QuickAddAction; text: string }[] = [
    { action: "expense", text: "Scan / Add Expense" },
    { action: "bill", text: "Add Bill or Commitment" },
    { action: "inflow", text: "Add Inflow / Receivable" },
    { action: "gig", text: "Add Freelance Gig / Shoot" },
    { action: "wallet", text: "Manage Accounts & Wallets" },
  ];

  expectedActions.forEach(({ action, text }) => {
    it(`invokes onSelectAction("${action}") and onClose when "${text}" is clicked`, () => {
      const onSelectAction = vi.fn();
      const onClose = vi.fn();

      render(
        <QuickAddModal
          isOpen={true}
          onClose={onClose}
          onSelectAction={onSelectAction}
        />
      );

      const actionButton = screen.getByText(text);
      fireEvent.click(actionButton);

      expect(onSelectAction).toHaveBeenCalledWith(action);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
