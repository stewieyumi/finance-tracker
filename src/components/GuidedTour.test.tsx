import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GuidedTour } from "./GuidedTour";

describe("GuidedTour", () => {
  it("introduces the main areas, supports Back, then offers shortcut setup only after finishing", async () => {
    const onClose = vi.fn();
    const setup = vi.fn();
    render(<GuidedTour onClose={onClose} onSetupQuickExpense={setup} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Your dashboard" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Your wallets" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Your dashboard" })).toBeInTheDocument();
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByRole("button", { name: "Set up Quick Expense" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish tour" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Quick Expense with Back Tap" })).toHaveFocus());
    expect(setup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Set up Quick Expense" }));
    expect(setup).toHaveBeenCalledOnce();
  });

  it.each(["Skip tour", "Escape"])("dismisses via %s without opening shortcut setup", action => {
    const onClose = vi.fn();
    const setup = vi.fn();
    render(<GuidedTour onClose={onClose} onSetupQuickExpense={setup} />);
    if (action === "Escape") fireEvent.keyDown(screen.getByRole("heading"), { key: "Escape" });
    else fireEvent.click(screen.getByRole("button", { name: action }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(setup).not.toHaveBeenCalled();
  });

  it("lets users decline the optional shortcut after the tour", () => {
    const onClose = vi.fn();
    const setup = vi.fn();
    render(<GuidedTour onClose={onClose} onSetupQuickExpense={setup} />);
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish tour" }));
    fireEvent.click(screen.getByRole("button", { name: "Maybe later" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(setup).not.toHaveBeenCalled();
  });
});
