import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShootsTable } from "./ShootsTable";
import { Shoot } from "../types/finance";

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
