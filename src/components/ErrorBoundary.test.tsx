import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

describe("ErrorBoundary", () => {
  it("uses a notice-specific message while keeping the dashboard available", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const BrokenNotice = (): React.ReactNode => { throw new Error("Synthetic update notice failure"); };
    try {
      render(<><ErrorBoundary message="The update notice couldn't load. You can keep using the app."><BrokenNotice /></ErrorBoundary><main>Dashboard remains available</main></>);
      expect(screen.getByRole("alert")).toHaveTextContent("The update notice couldn't load. You can keep using the app.");
      expect(screen.queryByText(/Something broke in this card/)).not.toBeInTheDocument();
      expect(screen.getByRole("main")).toHaveTextContent("Dashboard remains available");
    } finally {
      log.mockRestore();
    }
  });

  it("keeps the existing card fallback and retries without reloading the app", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let broken = true;
    const Card = () => { if (broken) throw new Error("Synthetic card failure"); return <p>Recovered card</p>; };
    try {
      render(<ErrorBoundary><Card /></ErrorBoundary>);
      expect(screen.getByText("Something broke in this card. Other features remain operational.")).toBeInTheDocument();
      broken = false;
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(screen.getByText("Recovered card")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      log.mockRestore();
    }
  });
});
