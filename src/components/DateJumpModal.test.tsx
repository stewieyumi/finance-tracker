import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateJumpModal } from "./DateJumpModal";

describe("DateJumpModal", () => {
  it("reflects the initial selected month and year", () => {
    render(
      <DateJumpModal
        isOpen={true}
        onClose={vi.fn()}
        onJump={vi.fn()}
        selectedMonth="October 2026"
      />
    );

    const octoberBtn = screen.getByRole("button", { name: "October" });
    expect(octoberBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("2026")).toBeInTheDocument();
  });

  it("updates month selection when a month button is clicked", () => {
    const onJump = vi.fn();
    render(
      <DateJumpModal
        isOpen={true}
        onClose={vi.fn()}
        onJump={onJump}
        selectedMonth="January 2026"
      />
    );

    const marchBtn = screen.getByRole("button", { name: "March" });
    fireEvent.click(marchBtn);
    expect(marchBtn).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Jump Now" }));
    expect(onJump).toHaveBeenCalledWith("March 2026");
  });

  it("returns expected 'Month Year' on Jump Now", () => {
    const onJump = vi.fn();
    render(
      <DateJumpModal
        isOpen={true}
        onClose={vi.fn()}
        onJump={onJump}
        selectedMonth="August 2025"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "December" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2027" } });

    fireEvent.click(screen.getByRole("button", { name: "Jump Now" }));
    expect(onJump).toHaveBeenCalledWith("December 2027");
  });

  it("updates selection when 'Jump to Current Month' is clicked", () => {
    const onJump = vi.fn();
    render(
      <DateJumpModal
        isOpen={true}
        onClose={vi.fn()}
        onJump={onJump}
        selectedMonth="January 2024"
      />
    );

    const now = new Date();
    const currentMonthLong = now.toLocaleString("default", { month: "long" });
    const currentYearStr = String(now.getFullYear());

    fireEvent.click(screen.getByRole("button", { name: "Jump to Current Month" }));

    fireEvent.click(screen.getByRole("button", { name: "Jump Now" }));
    expect(onJump).toHaveBeenCalledWith(`${currentMonthLong} ${currentYearStr}`);
  });

  it("triggers onClose on Cancel, close button, or Escape key", () => {
    const onClose = vi.fn();
    render(
      <DateJumpModal
        isOpen={true}
        onClose={onClose}
        onJump={vi.fn()}
        selectedMonth="August 2026"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
