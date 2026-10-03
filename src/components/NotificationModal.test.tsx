import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationModal } from "./NotificationModal";
import { AppNotification } from "../types/finance";

const mockNotifications: AppNotification[] = [
  {
    id: "overdue_bill_b1_October 2026",
    type: "overdue_commitment",
    title: "Overdue: Electricity",
    message: "Electricity was due 2 days ago.",
    amount: 3500,
    actionRoute: "operations/bills",
  },
  {
    id: "upcoming_bill_b2_October 2026",
    type: "upcoming_commitment",
    title: "Upcoming: Internet",
    message: "Internet is due tomorrow.",
    amount: 1500,
    actionRoute: "operations/bills",
  },
  {
    id: "pending_rec_r1_October 2026",
    type: "pending_receivable",
    title: "Pending: Project Payment",
    message: "Project Payment is due today.",
    amount: 10000,
    actionRoute: "operations/inflows",
  },
];

describe("NotificationModal", () => {
  it("does not render when isOpen is false", () => {
    render(
      <NotificationModal
        isOpen={false}
        onClose={vi.fn()}
        notifications={mockNotifications}
        onDismiss={vi.fn()}
        onClearAll={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders with proper accessibility dialog label when open", () => {
    render(
      <NotificationModal
        isOpen={true}
        onClose={vi.fn()}
        notifications={mockNotifications}
        onDismiss={vi.fn()}
        onClearAll={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-label", "Notification Center");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("renders notification items and displays count badge", () => {
    render(
      <NotificationModal
        isOpen={true}
        onClose={vi.fn()}
        notifications={mockNotifications}
        onDismiss={vi.fn()}
        onClearAll={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByText("Overdue: Electricity")).toBeInTheDocument();
    expect(screen.getByText("Upcoming: Internet")).toBeInTheDocument();
    expect(screen.getByText("Pending: Project Payment")).toBeInTheDocument();

    // Check count in header
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("3 pending alerts")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <NotificationModal
        isOpen={true}
        onClose={onClose}
        notifications={mockNotifications}
        onDismiss={vi.fn()}
        onClearAll={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    const closeBtn = screen.getByRole("button", { name: /close notification center/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss with the correct notification ID", () => {
    const onDismiss = vi.fn();
    render(
      <NotificationModal
        isOpen={true}
        onClose={vi.fn()}
        notifications={mockNotifications}
        onDismiss={onDismiss}
        onClearAll={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    const dismissFirst = screen.getByRole("button", { name: "Dismiss Overdue: Electricity" });
    fireEvent.click(dismissFirst);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith("overdue_bill_b1_October 2026");
  });

  it("calls onClearAll when Clear All is clicked", () => {
    const onClearAll = vi.fn();
    render(
      <NotificationModal
        isOpen={true}
        onClose={vi.fn()}
        notifications={mockNotifications}
        onDismiss={vi.fn()}
        onClearAll={onClearAll}
        onNavigate={vi.fn()}
      />
    );

    const clearAllBtn = screen.getByRole("button", { name: /clear all/i });
    fireEvent.click(clearAllBtn);

    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("renders sensible empty state when there are no notifications", () => {
    render(
      <NotificationModal
        isOpen={true}
        onClose={vi.fn()}
        notifications={[]}
        onDismiss={vi.fn()}
        onClearAll={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByText("All caught up!")).toBeInTheDocument();
    expect(
      screen.getByText(/no pending reminders, upcoming bills, or overdue payments/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear all/i })).not.toBeInTheDocument();
  });

  it("calls onNavigate with route and closes when action button is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <NotificationModal
        isOpen={true}
        onClose={vi.fn()}
        notifications={mockNotifications}
        onDismiss={vi.fn()}
        onClearAll={vi.fn()}
        onNavigate={onNavigate}
      />
    );

    const viewBillsButtons = screen.getAllByRole("button", { name: /view bills/i });
    fireEvent.click(viewBillsButtons[0]);

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("operations/bills");
  });

  it("click inside content does not close modal", () => {
    const onClose = vi.fn();
    render(
      <NotificationModal
        isOpen={true}
        onClose={onClose}
        notifications={mockNotifications}
        onDismiss={vi.fn()}
        onClearAll={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Notifications"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
