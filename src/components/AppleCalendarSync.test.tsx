import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { UnifiedFinanceData } from "../types/finance";
import AppleCalendarSync from "./AppleCalendarSync";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { getFinanceAuth } from "../utils/financeAuth";

vi.mock("../utils/financeAuth", () => ({ getFinanceAuth: vi.fn() }));
vi.mock("../hooks/useCloudSync", () => ({ notifyAuthTokenRejected: vi.fn() }));
const gig = { id: "sample", title: "Sample gig", date: "2026-11-05", status: "Pencil" as const, completed: false };
const remote = { uid: "sample-uid", etag: '"one"', group: "done", gig: { ...gig, completed: true } };
const auth = { key: "owner", sub: "owner", headers: { "X-Finance-Session": "binding" } };
const connection = { id: "a".repeat(32), email: "calendar@example.test" };
const preview = { connectionId: connection.id, events: [remote], missingCalendars: [], skipped: 0 };
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
function Fixture() {
  const [data, setData] = useState<UnifiedFinanceData>({ ...INITIAL_UNIFIED_DATA, library: { ...INITIAL_UNIFIED_DATA.library, shoots: [gig] } });
  return <><AppleCalendarSync data={data} setData={setData} />
    <button onClick={() => setData(prev => ({ ...prev, library: { ...prev.library, shoots: [{ ...gig, title: "Newer local edit" }] } }))}>Edit during request</button>
    <output>{data.library.shoots[0].title} {data.library.shoots[0].completed ? "done" : "unfinished"}</output></>;
}
beforeEach(() => {
  vi.mocked(getFinanceAuth).mockReturnValue(auth);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, init) => response(JSON.parse(init.body).action === "status" ? { connection } : preview)));
});
afterEach(() => { vi.unstubAllGlobals(); });
it("loads a review without changing data and applies only the selected calendar version", async () => {
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Apple Calendar" }));
  await screen.findByRole("button", { name: "Use calendar version" });
  expect(screen.getByRole("status", { hidden: true }).textContent).toContain("unfinished");
  vi.mocked(fetch).mockResolvedValueOnce(response({ gig: remote.gig }) as any);
  fireEvent.click(screen.getByRole("button", { name: "Use calendar version" }));
  await waitFor(() => expect(screen.getByText("Sample gig done")).toBeInTheDocument());
  expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as string)).toMatchObject({ action: "pull", expected: { etag: '"one"' } });
});
it("preserves an edit made while the calendar import is in flight", async () => {
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Apple Calendar" }));
  await screen.findByRole("button", { name: "Use calendar version" });
  let finish!: (value: any) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "Use calendar version" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit during request" }));
  await act(async () => { finish(response({ gig: remote.gig })); });
  expect(screen.getByText("Newer local edit unfinished")).toBeInTheDocument();
  expect(screen.getByText(/changed while syncing/)).toBeInTheDocument();
});
it("rejects an account change before applying a response", async () => {
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Apple Calendar" }));
  await screen.findByRole("button", { name: "Use calendar version" });
  let finish!: (value: any) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "Use calendar version" }));
  vi.mocked(getFinanceAuth).mockReturnValue({ ...auth, key: "another", sub: "another" });
  await act(async () => { finish(response({ gig: remote.gig })); });
  expect(screen.getByText("Sample gig unfinished")).toBeInTheDocument();
  expect(screen.getByText(/account changed/)).toBeInTheDocument();
});

it("guides a new user through connecting without changing financial data or retaining the password", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ connection: null }) as any);
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Apple Calendar" }));
  await screen.findByRole("button", { name: "Connect iCloud" });
  expect(screen.getByRole("link", { name: "your Apple Account" })).toHaveAttribute("href", "https://account.apple.com/");
  fireEvent.change(screen.getByLabelText("Apple Account email"), { target: { value: "calendar@example.test" } });
  fireEvent.change(screen.getByLabelText("App-specific password"), { target: { value: "abcd-efgh-ijkl-mnop" } });
  let finish!: (value: any) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "Connect iCloud" }));
  expect(screen.getByLabelText("App-specific password")).toHaveValue("");
  expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string)).toMatchObject({ action: "connect", connectionId: null });
  await act(async () => { finish(response({ connection })); });
  await screen.findByText("Connected · calendar@example.test");
  expect(screen.queryByLabelText("App-specific password")).not.toBeInTheDocument();
  expect(screen.getByText("Sample gig unfinished")).toBeInTheDocument();
});
it("disconnects through confirmation and clears the old review without changing gigs", async () => {
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Apple Calendar" }));
  await screen.findByRole("button", { name: "Use calendar version" });
  fireEvent.click(screen.getByRole("button", { name: /^Disconnect$/ }));
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  vi.mocked(fetch).mockResolvedValueOnce(response({ connection: null }) as any);
  fireEvent.click(screen.getByRole("button", { name: "Confirm disconnect" }));
  await screen.findByRole("button", { name: "Connect iCloud" });
  expect(screen.queryByRole("button", { name: "Use calendar version" })).not.toBeInTheDocument();
  expect(screen.getByText("Sample gig unfinished")).toBeInTheDocument();
  expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as string)).toEqual({ action: "disconnect", connectionId: connection.id });
});
it("clears the password on a failed reconnect and keeps the working account available", async () => {
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Apple Calendar" }));
  await screen.findByRole("button", { name: "Use calendar version" });
  fireEvent.click(screen.getByRole("button", { name: "Reconnect or change account" }));
  fireEvent.change(screen.getByLabelText("App-specific password"), { target: { value: "abcd-efgh-ijkl-mnop" } });
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "Reconnect iCloud using a valid app-specific password." }) } as any);
  fireEvent.click(screen.getByRole("button", { name: "Connect iCloud" }));
  await screen.findByText("Reconnect iCloud using a valid app-specific password.");
  expect(screen.getByLabelText("App-specific password")).toHaveValue("");
  expect(screen.getByText("Connected · calendar@example.test")).toBeInTheDocument();
});
it("clears unsent credentials when the modal closes", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ connection: null }) as any);
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Apple Calendar" }));
  await screen.findByRole("button", { name: "Connect iCloud" });
  fireEvent.change(screen.getByLabelText("App-specific password"), { target: { value: "abcd-efgh-ijkl-mnop" } });
  fireEvent.click(screen.getByRole("button", { name: "Close Apple Calendar review" }));
  vi.mocked(fetch).mockResolvedValueOnce(response({ connection: null }) as any);
  fireEvent.click(screen.getByRole("button", { name: "Apple Calendar" }));
  await screen.findByRole("button", { name: "Connect iCloud" });
  expect(screen.getByLabelText("App-specific password")).toHaveValue("");
});
it("discards connection results when the app account changes during connect", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ connection: null }) as any);
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Apple Calendar" }));
  await screen.findByRole("button", { name: "Connect iCloud" });
  fireEvent.change(screen.getByLabelText("Apple Account email"), { target: { value: "calendar@example.test" } });
  fireEvent.change(screen.getByLabelText("App-specific password"), { target: { value: "abcd-efgh-ijkl-mnop" } });
  let finish!: (value: any) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "Connect iCloud" }));
  vi.mocked(getFinanceAuth).mockReturnValue({ ...auth, key: "another", sub: "another" });
  await act(async () => { finish(response({ connection })); });
  expect(screen.queryByText("Connected · calendar@example.test")).not.toBeInTheDocument();
  expect(screen.getByText(/account changed/)).toBeInTheDocument();
});

it("handles a non-JSON platform error with a clear retry message and recovers on retry", async () => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new SyntaxError("Unexpected token A: A server error occurred"); } } as any);
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Apple Calendar" }));
  await screen.findByText("Calendar service is unavailable. Please try again shortly.");
  expect(screen.queryByText(/Unexpected token/)).not.toBeInTheDocument();
  expect(screen.getByText("Sample gig unfinished")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
  await screen.findByRole("button", { name: "Use calendar version" });
  expect(screen.getByText("Sample gig unfinished")).toBeInTheDocument();
});
