import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InstallAppGuide } from "./InstallAppGuide";
const props = { onClose: vi.fn(), canPrompt: false, added: false, busy: false, status: "", onInstall: vi.fn() };
afterEach(() => vi.restoreAllMocks());

it("shows Android steps without a pretend native install button", () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 15) Chrome/150");
  render(<InstallAppGuide {...props} />);
  expect(screen.getByRole("region", { name: "Android installation" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  expect(screen.getByText(/Install and create shortcut/)).toBeInTheDocument();
});
it("explains Windows browsers and allows other-device instructions without changing install state", () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150");
  const install = vi.fn();
  render(<InstallAppGuide {...props} canPrompt onInstall={install} />);
  expect(screen.getByRole("region", { name: "Windows installation" })).toBeInTheDocument();
  expect(install).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "iPhone / iPad" }));
  expect(screen.getByText(/Share → Add to Home Screen/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Install app" }));
  expect(install).toHaveBeenCalledOnce();
});
it("focuses the guide and restores the opener when dismissed with Escape", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Installation help</button>{open && <InstallAppGuide {...props} onClose={() => setOpen(false)} />}</>;
  }
  render(<Harness />);
  const opener = screen.getByRole("button", { name: "Installation help" });
  opener.focus();
  fireEvent.click(opener);
  expect(screen.getByRole("heading", { name: "Install Finance Tracker" })).toHaveFocus();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});
