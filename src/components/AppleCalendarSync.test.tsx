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
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
function Fixture() {
  const [data, setData] = useState<UnifiedFinanceData>({ ...INITIAL_UNIFIED_DATA, library: { ...INITIAL_UNIFIED_DATA.library, shoots: [gig] } });
  return <><AppleCalendarSync data={data} setData={setData} />
    <button onClick={() => setData(prev => ({ ...prev, library: { ...prev.library, shoots: [{ ...gig, title: "Newer local edit" }] } }))}>Edit during request</button>
    <output>{data.library.shoots[0].title} {data.library.shoots[0].completed ? "done" : "unfinished"}</output></>;
}
beforeEach(() => {
  vi.mocked(getFinanceAuth).mockReturnValue(auth);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ events: [remote], missingCalendars: [], skipped: 0 })));
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
  expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string)).toMatchObject({ action: "pull", expected: { etag: '"one"' } });
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
