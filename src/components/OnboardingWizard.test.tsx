import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingWizard } from "./OnboardingWizard";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { UnifiedFinanceData } from "../types/finance";

describe("OnboardingWizard", () => {
  it("renders Welcome step and navigates through the wizard to completion", () => {
    const onComplete = vi.fn();

    render(
      <OnboardingWizard
        globalData={INITIAL_UNIFIED_DATA}
        onComplete={onComplete}
        onSkip={vi.fn()}
        userName="Alex"
      />
    );

    // Step 1: Welcome
    expect(screen.getByText("Welcome, Alex!")).toBeInTheDocument();
    const getStartedBtn = screen.getByRole("button", { name: /get started/i });
    fireEvent.click(getStartedBtn);

    // Step 2: Salary & Payday
    expect(screen.getByText(/Payday Salary & Schedule/i)).toBeInTheDocument();
    const salaryInput = screen.getByLabelText("Gross Salary");
    fireEvent.change(salaryInput, { target: { value: "30000" } });

    // Add a deduction
    const addDeductionBtn = screen.getByRole("button", { name: /add deduction/i });
    fireEvent.click(addDeductionBtn);
    expect(screen.getByText(/Net Usable Salary:/i)).toBeInTheDocument();

    const nextToWalletsBtn = screen.getByRole("button", { name: /next: wallets/i });
    fireEvent.click(nextToWalletsBtn);

    // Step 3: Wallets
    expect(screen.getByText(/Accounts & Wallets/i)).toBeInTheDocument();
    const nextToGoalBtn = screen.getByRole("button", { name: /next: milestone goal/i });
    fireEvent.click(nextToGoalBtn);

    // Step 4: Milestone Goal
    expect(screen.getByText(/Milestone Goal/i)).toBeInTheDocument();
    const goalInput = screen.getByLabelText("Goal Name");
    fireEvent.change(goalInput, { target: { value: "Japan 2027" } });

    const targetInput = screen.getByLabelText("Target Amount");
    fireEvent.change(targetInput, { target: { value: "100000" } });

    const nextToThemeBtn = screen.getByRole("button", { name: /next: appearance/i });
    fireEvent.click(nextToThemeBtn);

    // Step 5: Appearance & Finish
    expect(screen.getByText(/Appearance & Launch/i)).toBeInTheDocument();
    const finishBtn = screen.getByRole("button", { name: /finish setup & launch/i });
    fireEvent.click(finishBtn);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const completedData: UnifiedFinanceData = onComplete.mock.calls[0][0];

    // Assert that configuration was set correctly
    expect(completedData.settings?.hasCompletedOnboarding).toBe(true);
    expect(completedData.settings?.grossPerPayoutSalary).toBe(30000);
    expect(completedData.settings?.salaryDeductions?.length).toBe(1);
    expect(completedData.settings?.perPayoutSalary).toBe(29000); // 30000 - 1000
    expect(completedData.settings?.goalName).toBe("Japan 2027");
    expect(completedData.settings?.targetFund).toBe(100000);
    expect(completedData.updatedAt).toBeGreaterThan(0);

    // Assert no fake transactions were created
    expect(completedData.library.bills).toEqual([]);
    expect(completedData.library.receivables).toEqual([]);
    expect(completedData.library.expenses).toEqual([]);
    expect(completedData.library.shoots).toEqual([]);
  });

  it("navigates back to previous steps", () => {
    const onComplete = vi.fn();

    render(
      <OnboardingWizard
        globalData={INITIAL_UNIFIED_DATA}
        onComplete={onComplete}
        onSkip={vi.fn()}
      />
    );

    // Step 1 -> Step 2
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(screen.getByText(/Payday Salary & Schedule/i)).toBeInTheDocument();

    // Step 2 -> Step 1 (Back)
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByText(/Welcome to Finance Tracker/i)).toBeInTheDocument();
  });
  it("can skip setup without applying partial wizard edits", () => {
    const onComplete = vi.fn();
    const onSkip = vi.fn();
    render(<OnboardingWizard globalData={INITIAL_UNIFIED_DATA} onComplete={onComplete} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    fireEvent.change(screen.getByLabelText("Gross Salary"), { target: { value: "30000" } });
    fireEvent.click(screen.getByRole("button", { name: /skip setup/i }));

    expect(onSkip).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("lets a beginner type custom payday dates without rewriting the draft and saves the chosen schedule", () => {
    const data = structuredClone(INITIAL_UNIFIED_DATA);
    data.wallets.main = 1234.56;
    const original = structuredClone(data);
    const onComplete = vi.fn();
    render(<OnboardingWizard globalData={data} onComplete={onComplete} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    fireEvent.click(screen.getByRole("button", { name: "Custom Days" }));
    const days = screen.getByLabelText("Custom Payday Days") as HTMLInputElement;
    fireEvent.change(days, { target: { value: "" } });
    expect(days).toHaveValue("");
    for (const character of "5, 20") {
      fireEvent.change(days, { target: { value: days.value + character } });
    }
    expect(days).toHaveValue("5, 20");
    fireEvent.click(screen.getByRole("button", { name: /next: wallets/i }));
    expect(screen.getByRole("heading", { name: /accounts & wallets/i })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByLabelText("Custom Payday Days")).toHaveValue("5, 20");
    fireEvent.click(screen.getByRole("button", { name: /next: wallets/i }));
    fireEvent.click(screen.getByRole("button", { name: /next: milestone goal/i }));
    fireEvent.click(screen.getByRole("button", { name: /next: appearance/i }));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /finish setup & launch/i }));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0][0].settings.paydayDays).toEqual([5, 20]);
    expect(onComplete.mock.calls[0][0].wallets).toEqual(original.wallets);
    expect(onComplete.mock.calls[0][0].library).toEqual(original.library);
    expect(data).toEqual(original);
  });

  it.each(["", "0, 20", "5, 32", "5.5, 20", "5, 20days", "5,"])("explains invalid custom dates (%s) without silently using another schedule", value => {
    const onComplete = vi.fn();
    render(<OnboardingWizard globalData={INITIAL_UNIFIED_DATA} onComplete={onComplete} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    fireEvent.click(screen.getByRole("button", { name: "Custom Days" }));
    fireEvent.change(screen.getByLabelText("Custom Payday Days"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: /next: wallets/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/whole days from 1 to 31/i);
    expect(screen.getByLabelText("Custom Payday Days")).toHaveAttribute("aria-invalid", "true");
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /15th & 30th/i }));
    fireEvent.click(screen.getByRole("button", { name: /next: wallets/i }));
    expect(screen.getByRole("heading", { name: /accounts & wallets/i })).toBeInTheDocument();
  });

  it("names deduction and wallet controls and announces selected preferences", () => {
    render(<OnboardingWizard globalData={INITIAL_UNIFIED_DATA} onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(screen.getByRole("button", { name: /15th & 30th/i })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /add deduction/i }));
    expect(screen.getByRole("textbox", { name: "Deduction 1 name" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Deduction 1 type" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Deduction 1 value" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove deduction 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next: wallets/i }));
    expect(screen.getByRole("textbox", { name: "New wallet name" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /^Wallet \d+ name$/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /next: milestone goal/i }));
    fireEvent.click(screen.getByRole("button", { name: /next: appearance/i }));
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "false");
  });
});
