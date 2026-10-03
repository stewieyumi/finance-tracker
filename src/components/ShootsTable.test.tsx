import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShootsTable } from "./ShootsTable";
import { Shoot } from "../types/finance";
import { syncShootsToNotion } from "../utils/notionSync";

vi.mock("../utils/notionSync", () => ({
  syncShootsToNotion: vi.fn(),
}));

const mockShoots: Shoot[] = [
  {
    id: "shoot-1",
    title: "Wedding Video Coverage",
    date: "2026-10-15",
    category: "Solo Shoot",
    status: "Confirmed",
    completed: false,
  },
  {
    id: "shoot-2",
    title: "Commercial Color Grade",
    date: "2026-10-20",
    category: "Video Edit",
    status: "Pencil",
    completed: true,
  },
];

describe("ShootsTable - Mobile Card Interactions", () => {
  it("opens edit modal when tapping the main shoot card", () => {
    const setEditingId = vi.fn();
    const setEditForm = vi.fn();
    const onToggleCompletion = vi.fn();

    render(
      <ShootsTable
        activeShoots={mockShoots}
        selectedMonth="October 2026"
        onToggleCompletion={onToggleCompletion}
        onAddShoot={vi.fn()}
        onDeleteShoot={vi.fn()}
        onSaveEdit={vi.fn()}
        editingId={null}
        setEditingId={setEditingId}
        editForm={{}}
        setEditForm={setEditForm}
      />
    );

    const card = screen.getByTestId("shoot-mobile-card-shoot-1");
    fireEvent.click(card);

    expect(setEditingId).toHaveBeenCalledWith("shoot-1");
    expect(setEditForm).toHaveBeenCalledWith(
      expect.objectContaining({ id: "shoot-1", title: "Wedding Video Coverage" })
    );
    expect(onToggleCompletion).not.toHaveBeenCalled();
  });

  it("toggles completion without opening edit when tapping the completion button", () => {
    const setEditingId = vi.fn();
    const setEditForm = vi.fn();
    const onToggleCompletion = vi.fn();

    render(
      <ShootsTable
        activeShoots={mockShoots}
        selectedMonth="October 2026"
        onToggleCompletion={onToggleCompletion}
        onAddShoot={vi.fn()}
        onDeleteShoot={vi.fn()}
        onSaveEdit={vi.fn()}
        editingId={null}
        setEditingId={setEditingId}
        editForm={{}}
        setEditForm={setEditForm}
      />
    );

    const toggleBtn = screen.getByRole("button", {
      name: "Mark Wedding Video Coverage as settled",
    });
    fireEvent.click(toggleBtn);

    expect(onToggleCompletion).toHaveBeenCalledWith("shoot-1");
    expect(setEditingId).not.toHaveBeenCalled();
    expect(setEditForm).not.toHaveBeenCalled();
  });

  it("triggers edit without bubbling when tapping the edit button", () => {
    const setEditingId = vi.fn();
    const setEditForm = vi.fn();

    render(
      <ShootsTable
        activeShoots={mockShoots}
        selectedMonth="October 2026"
        onToggleCompletion={vi.fn()}
        onAddShoot={vi.fn()}
        onDeleteShoot={vi.fn()}
        onSaveEdit={vi.fn()}
        editingId={null}
        setEditingId={setEditingId}
        editForm={{}}
        setEditForm={setEditForm}
      />
    );

    const editBtn = screen.getByRole("button", {
      name: "Edit Wedding Video Coverage",
    });
    fireEvent.click(editBtn);

    expect(setEditingId).toHaveBeenCalledTimes(1);
    expect(setEditingId).toHaveBeenCalledWith("shoot-1");
  });

  it("does not trigger edit when tapping the sync button", () => {
    const setEditingId = vi.fn();
    const setEditForm = vi.fn();

    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    try {
      render(
        <ShootsTable
          activeShoots={mockShoots}
          selectedMonth="October 2026"
          onToggleCompletion={vi.fn()}
          onAddShoot={vi.fn()}
          onDeleteShoot={vi.fn()}
          onSaveEdit={vi.fn()}
          editingId={null}
          setEditingId={setEditingId}
          editForm={{}}
          setEditForm={setEditForm}
        />
      );

      const syncBtn = screen.getByRole("button", {
        name: "Export Wedding Video Coverage to calendar",
      });
      fireEvent.click(syncBtn);

      expect(setEditingId).not.toHaveBeenCalled();
      expect(setEditForm).not.toHaveBeenCalled();
    } finally {
      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
      clickSpy.mockRestore();
    }
  });
});

describe("ShootsTable - Notion Sync Interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Notion sync button in the header", () => {
    render(
      <ShootsTable
        activeShoots={mockShoots}
        selectedMonth="October 2026"
        onToggleCompletion={vi.fn()}
        onAddShoot={vi.fn()}
        onDeleteShoot={vi.fn()}
        onSaveEdit={vi.fn()}
        editingId={null}
        setEditingId={vi.fn()}
        editForm={{}}
        setEditForm={vi.fn()}
      />
    );

    const notionBtn = screen.getByRole("button", { name: "Sync to Notion" });
    expect(notionBtn).toBeInTheDocument();
    expect(notionBtn).toHaveTextContent("Notion");
  });

  it("calls syncShootsToNotion and shows success status on completion", async () => {
    vi.mocked(syncShootsToNotion).mockResolvedValueOnce({
      success: true,
      total: 2,
      processed: 2,
      created: 1,
      updated: 1,
    });

    render(
      <ShootsTable
        activeShoots={mockShoots}
        selectedMonth="October 2026"
        onToggleCompletion={vi.fn()}
        onAddShoot={vi.fn()}
        onDeleteShoot={vi.fn()}
        onSaveEdit={vi.fn()}
        editingId={null}
        setEditingId={vi.fn()}
        editForm={{}}
        setEditForm={vi.fn()}
      />
    );

    const notionBtn = screen.getByRole("button", { name: "Sync to Notion" });
    fireEvent.click(notionBtn);

    expect(syncShootsToNotion).toHaveBeenCalledWith(mockShoots);
    const status = await screen.findByTestId("notion-sync-status");
    expect(status).toHaveTextContent("Synced 2 gigs · 1 created · 1 updated");
  });

  it("disables the Notion button and shows spinner while syncing", async () => {
    let resolveSync: any;
    vi.mocked(syncShootsToNotion).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSync = resolve;
        })
    );

    render(
      <ShootsTable
        activeShoots={mockShoots}
        selectedMonth="October 2026"
        onToggleCompletion={vi.fn()}
        onAddShoot={vi.fn()}
        onDeleteShoot={vi.fn()}
        onSaveEdit={vi.fn()}
        editingId={null}
        setEditingId={vi.fn()}
        editForm={{}}
        setEditForm={vi.fn()}
      />
    );

    const notionBtn = screen.getByRole("button", { name: "Sync to Notion" });
    fireEvent.click(notionBtn);

    expect(notionBtn).toBeDisabled();
    expect(notionBtn).toHaveTextContent("Syncing...");

    // Clicking again while syncing does not trigger duplicate sync
    fireEvent.click(notionBtn);
    expect(syncShootsToNotion).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSync({
        success: true,
        total: 2,
        processed: 2,
        created: 2,
        updated: 0,
      });
    });

    expect(notionBtn).not.toBeDisabled();
    expect(notionBtn).toHaveTextContent("Notion");
  });

  it("shows partial failure message when batch fails mid-sync", async () => {
    vi.mocked(syncShootsToNotion).mockResolvedValueOnce({
      success: false,
      total: 23,
      processed: 10,
      created: 8,
      updated: 2,
      failedBatch: 2,
      error: "Notion sync failed.",
    });

    render(
      <ShootsTable
        activeShoots={mockShoots}
        selectedMonth="October 2026"
        onToggleCompletion={vi.fn()}
        onAddShoot={vi.fn()}
        onDeleteShoot={vi.fn()}
        onSaveEdit={vi.fn()}
        editingId={null}
        setEditingId={vi.fn()}
        editForm={{}}
        setEditForm={vi.fn()}
      />
    );

    const notionBtn = screen.getByRole("button", { name: "Sync to Notion" });
    fireEvent.click(notionBtn);

    const status = await screen.findByTestId("notion-sync-status");
    expect(status).toHaveTextContent("Synced 10/23 gigs · batch 2 failed");
  });

  it("shows failure message when sync fails completely", async () => {
    vi.mocked(syncShootsToNotion).mockResolvedValueOnce({
      success: false,
      total: 2,
      processed: 0,
      created: 0,
      updated: 0,
      error: "Notion database schema mismatch.",
    });

    render(
      <ShootsTable
        activeShoots={mockShoots}
        selectedMonth="October 2026"
        onToggleCompletion={vi.fn()}
        onAddShoot={vi.fn()}
        onDeleteShoot={vi.fn()}
        onSaveEdit={vi.fn()}
        editingId={null}
        setEditingId={vi.fn()}
        editForm={{}}
        setEditForm={vi.fn()}
      />
    );

    const notionBtn = screen.getByRole("button", { name: "Sync to Notion" });
    fireEvent.click(notionBtn);

    const status = await screen.findByTestId("notion-sync-status");
    expect(status).toHaveTextContent("Notion database schema mismatch.");
  });
});
