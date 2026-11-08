import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SyncConflictModal } from "./SyncConflictModal";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";

const snapshots = {
  localSnapshot: { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 },
  cloudSnapshot: { ...INITIAL_UNIFIED_DATA, updatedAt: 2000 },
  cloudRevision: 2,
};

describe("SyncConflictModal keyboard and explicit choice", () => {
  it("moves focus into the unresolved conflict and returns it when resolved", () => {
    const onKeepLocal = vi.fn();
    const onKeepCloud = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    try {
      const { rerender } = render(<SyncConflictModal isOpen {...snapshots} onKeepLocal={onKeepLocal} onKeepCloud={onKeepCloud} />);
      const dialog = screen.getByRole("dialog", { name: "Sync Conflict" });
      expect(dialog).toHaveFocus();
      fireEvent.keyDown(window, { key: "Escape" });
      fireEvent.click(dialog);
      expect(dialog).toBeInTheDocument();
      expect(onKeepLocal).not.toHaveBeenCalled();
      expect(onKeepCloud).not.toHaveBeenCalled();
      rerender(<SyncConflictModal isOpen={false} {...snapshots} onKeepLocal={onKeepLocal} onKeepCloud={onKeepCloud} />);
      expect(opener).toHaveFocus();
    } finally {
      opener.remove();
    }
  });

  it.each([
    ["Keep This Device Data", "local"],
    ["Use Cloud Data", "cloud"],
  ])("requires confirmation before %s invokes its resolution", (name, choice) => {
    const onKeepLocal = vi.fn();
    const onKeepCloud = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      render(<SyncConflictModal isOpen {...snapshots} onKeepLocal={onKeepLocal} onKeepCloud={onKeepCloud} />);
      fireEvent.click(screen.getByRole("button", { name }));
      expect(onKeepLocal).not.toHaveBeenCalled();
      expect(onKeepCloud).not.toHaveBeenCalled();
      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name }));
      expect(choice === "local" ? onKeepLocal : onKeepCloud).toHaveBeenCalledOnce();
      expect(choice === "local" ? onKeepCloud : onKeepLocal).not.toHaveBeenCalled();
    } finally {
      confirm.mockRestore();
    }
  });
});
