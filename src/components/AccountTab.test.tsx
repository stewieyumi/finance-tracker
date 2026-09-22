import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountTab } from "./AccountTab";
import { TransactionHistoryItem } from "../types/finance";
import React from "react";

vi.mock("@react-oauth/google", () => ({
  GoogleLogin: () => <div data-testid="google-login-mock">Google Login</div>
}));

const mockTransactions: TransactionHistoryItem[] = [
  { id: "tx1", title: "Test Inflow", amount: 100, type: "inflow", date: "2026-09-01T12:00:00", wallet: "main" },
  { id: "tx2", title: "Test Expense", amount: -50, type: "expense", date: "2026-09-02T12:00:00", wallet: "main" }
];

describe("AccountTab", () => {
  const defaultProps = {
    googleUser: null,
    onGoogleLogout: vi.fn(),
    onGoogleSuccess: vi.fn(),
    onGoogleError: vi.fn(),
    onOpenSettings: vi.fn(),
    importInputRef: React.createRef<HTMLInputElement>(),
    onImportFile: vi.fn(),
    allTransactions: mockTransactions,
    onOpenLedger: vi.fn(),
    walletLabels: { main: "Main Wallet" },
    formatDateTime: (d: string) => d,
  };

  it("renders transaction history", () => {
    render(<AccountTab {...defaultProps} />);

    expect(screen.getByText("Test Inflow")).toBeInTheDocument();
    expect(screen.getByText("Test Expense")).toBeInTheDocument();
    expect(screen.getByText("2 records")).toBeInTheDocument();
  });

  it("renders user profile when googleUser is provided", () => {
    const googleUser = { name: "Test User", email: "test@example.com", picture: "" };
    render(<AccountTab {...defaultProps} googleUser={googleUser} />);

    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
  });

  it("calls onGoogleLogout when Sign Out is clicked", () => {
    const googleUser = { name: "Test User", email: "test@example.com", picture: "" };
    render(<AccountTab {...defaultProps} googleUser={googleUser} />);

    fireEvent.click(screen.getByText("Sign Out"));
    expect(defaultProps.onGoogleLogout).toHaveBeenCalled();
  });

  it("calls onOpenSettings when Open Settings is clicked", () => {
    render(<AccountTab {...defaultProps} />);

    fireEvent.click(screen.getByText("Open Settings"));
    expect(defaultProps.onOpenSettings).toHaveBeenCalled();
  });

  it("calls onOpenLedger when Manage Ledger is clicked", () => {
    render(<AccountTab {...defaultProps} />);

    fireEvent.click(screen.getByText("Manage Ledger"));
    expect(defaultProps.onOpenLedger).toHaveBeenCalled();
  });
});
