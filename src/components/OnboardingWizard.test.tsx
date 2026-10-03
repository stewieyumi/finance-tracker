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
      />
    );

    // Step 1 -> Step 2
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(screen.getByText(/Payday Salary & Schedule/i)).toBeInTheDocument();

    // Step 2 -> Step 1 (Back)
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByText(/Welcome to Finance Tracker/i)).toBeInTheDocument();
  });
});
