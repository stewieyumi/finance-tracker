import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";

describe("BottomNav", () => {
  it("renders all navigation tabs with labels", () => {
    render(<BottomNav activeTab="home" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Operations" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wallets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expenses" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
  });

  it("marks the active tab with aria-current page and active styling", () => {
    render(<BottomNav activeTab="home" onChange={vi.fn()} />);

    const homeButton = screen.getByRole("button", { name: "Dashboard" });
    expect(homeButton).toHaveAttribute("aria-current", "page");
    expect(homeButton).toHaveClass("bg-blue-500/10");

    const walletsButton = screen.getByRole("button", { name: "Wallets" });
    expect(walletsButton).not.toHaveAttribute("aria-current");
  });

  it("calls onChange when a tab is clicked", () => {
    const onChange = vi.fn();
    render(<BottomNav activeTab="home" onChange={onChange} />);

    const walletsButton = screen.getByRole("button", { name: "Wallets" });
    fireEvent.click(walletsButton);

    expect(onChange).toHaveBeenCalledWith("wallets");
  });
});
