import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeleteAccountSettings } from "./DeleteAccountSettings";

describe("account deletion confirmation", () => {
  it("requires explicit typed confirmation and cancel/Escape never deletes", () => {
    const remove = vi.fn(); render(<DeleteAccountSettings email="a@example.test" onExport={vi.fn()} onDelete={remove} />);
    const opener = screen.getByRole("button", { name: "Delete account" }); opener.focus(); fireEvent.click(opener);
    const input = screen.getByRole("textbox", { name: "Type DELETE to confirm" }); expect(input).toHaveFocus();
    const confirm = screen.getByRole("button", { name: "Permanently delete" }); expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "delete" } }); expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "DELETE" } }); expect(confirm).toBeEnabled();
    fireEvent.keyDown(input, { key: "Escape" }); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(opener).toHaveFocus();
    expect(remove).not.toHaveBeenCalled();
  });
  it("shows failure without clearing the confirmation or claiming deletion", async () => {
    const remove = vi.fn().mockRejectedValue(new Error("Synthetic deletion unavailable"));
    render(<DeleteAccountSettings onExport={vi.fn()} onDelete={remove} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Type DELETE to confirm" }), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Synthetic deletion unavailable"));
    expect(remove).toHaveBeenCalledOnce(); expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("blocks duplicate submission and dismissal while deletion is awaiting acknowledgement", async () => {
    let resolve!: () => void; const remove = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    render(<DeleteAccountSettings onExport={vi.fn()} onDelete={remove} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    const input = screen.getByRole("textbox", { name: "Type DELETE to confirm" }); fireEvent.change(input, { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled(); fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument(); expect(remove).toHaveBeenCalledOnce();
    resolve(); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
