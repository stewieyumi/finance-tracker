import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickExpenseShortcutSetup } from "./QuickExpenseShortcutSetup";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("../utils/financeAuth", () => ({ getFinanceAuth: auth }));
const data = { ...INITIAL_UNIFIED_DATA, wallets: { maya: 1000, cash: 500 }, settings: { ...INITIAL_UNIFIED_DATA.settings, defaultWallet: "maya", customWallets: [{ id: "maya", label: "Maya" }, { id: "cash", label: "Cash" }] } };
const active = { connected: true, walletId: "maya", walletLabel: "Maya", expiresAt: Date.now() + 86400000 };
beforeEach(() => {
  auth.mockReturnValue({ key: "session:a", sub: "a", headers: { "X-Finance-Session": "binding-a" } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ connected: false }))));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("offers a ready-made preset and loads status only when automatic saving is opened", async () => {
  render(<QuickExpenseShortcutSetup globalData={data} />);
  expect(screen.getByRole("link", { name: "Add to Apple Shortcuts" })).toHaveAttribute("href", "/shortcuts/Finance%20Tracker%20Quick%20Expense.shortcut");
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Automatic saving" }));
  expect(await screen.findByRole("button", { name: "Create connection" })).toBeEnabled();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/quick-expense", expect.objectContaining({ method: "GET", cache: "no-store", headers: expect.objectContaining({ "X-Finance-Shortcut": "1", "X-Finance-Session": "binding-a" }) })));
});
it("creates a wallet-bound connection and exposes the key only after a successful explicit request", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{"connected":false}')).mockResolvedValueOnce(new Response(JSON.stringify({ ...active, token: "fixture-private-key" })));
  render(<QuickExpenseShortcutSetup globalData={data} />);
  fireEvent.click(screen.getByRole("button", { name: "Automatic saving" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Create connection" })).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Shortcut payment wallet"), { target: { value: "cash" } });
  fireEvent.click(screen.getByRole("button", { name: "Create connection" }));
  expect(await screen.findByLabelText("Private shortcut key")).toHaveValue("fixture-private-key");
  expect(screen.getByLabelText("Private shortcut key")).toHaveAttribute("type", "password");
  expect(vi.mocked(fetch).mock.calls[1][1]?.body).toBe(JSON.stringify({ action: "connect", walletId: "cash" }));
});
it("does not create a key when sign-in is absent, and displays recoverable server failures", async () => {
  auth.mockReturnValue({ key: "", sub: null, headers: {} });
  render(<QuickExpenseShortcutSetup globalData={data} />);
  fireEvent.click(screen.getByRole("button", { name: "Automatic saving" }));
  expect(screen.getByRole("status")).toHaveTextContent("Reconnect your sign-in"); expect(fetch).not.toHaveBeenCalled();
});
it("does not expose an old account's connection key after an account switch", async () => {
  let resolve!: (res: Response) => void;
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{"connected":false}')).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  render(<QuickExpenseShortcutSetup globalData={data} />);
  fireEvent.click(screen.getByRole("button", { name: "Automatic saving" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Create connection" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Create connection" }));
  auth.mockReturnValue({ key: "session:b", sub: "b", headers: { "X-Finance-Session": "binding-b" } });
  await act(async () => resolve(new Response(JSON.stringify({ ...active, token: "old-account-key" }))));
  expect(screen.queryByLabelText("Private shortcut key")).not.toBeInTheDocument();
});
it("disconnects only on confirmation and removes the one-time key from the view", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(active))).mockResolvedValueOnce(new Response('{"connected":false}'));
  render(<QuickExpenseShortcutSetup globalData={data} />);
  fireEvent.click(screen.getByRole("button", { name: "Automatic saving" }));
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Disconnected");
  expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
});
it("keeps failure messages visible and never claims a failed connection succeeded", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not saved: Sync your app first." }), { status: 409 }));
  render(<QuickExpenseShortcutSetup globalData={data} />);
  fireEvent.click(screen.getByRole("button", { name: "Automatic saving" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Sync your app first");
  expect(screen.queryByLabelText("Private shortcut key")).not.toBeInTheDocument();
});
