import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Modal } from "./Modal";

describe("Modal Primitive", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("does not render into DOM when isOpen is false", () => {
    const { container } = render(
      <Modal isOpen={false} onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Modal Content")).not.toBeInTheDocument();
  });

  it("renders into DOM when isOpen is true with standard accessibility attributes", () => {
    render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        ariaLabel="Test Dialog"
      >
        <div>Modal Content</div>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Test Dialog");
    expect(screen.getByText("Modal Content")).toBeInTheDocument();
  });

  it("supports aria-labelledby and custom role", () => {
    render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        ariaLabelledBy="dialog-title"
        role="alertdialog"
      >
        <h2 id="dialog-title">Alert Title</h2>
      </Modal>
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "dialog-title");
  });

  it("applies floating variant styling by default", () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Floating Content</div>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("items-center justify-center");
    expect(dialog.className).toContain("z-[100]");
  });

  it("applies sheet variant styling when specified", () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} variant="sheet">
        <div>Sheet Content</div>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("justify-end sm:justify-center");
    expect(dialog.className).toContain("p-0 sm:p-4");
  });

  it("locks body scroll on open and restores previous overflow value on close and unmount", () => {
    document.body.style.overflow = "scroll";

    const { rerender, unmount } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Content</div>
      </Modal>
    );

    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Modal isOpen={false} onClose={vi.fn()}>
        <div>Content</div>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("scroll");

    // Open again and test unmount cleanup
    rerender(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Content</div>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("handles Escape key dismissal and cleans up listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal isOpen={true} onClose={onClose}>
        <div>Content</div>
      </Modal>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1); // not called again after unmount
  });

  it("does not trigger onClose on Escape when closeOnEscape is false", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} closeOnEscape={false}>
        <div>Content</div>
      </Modal>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("triggers onClose when clicking backdrop directly by default", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose}>
        <div data-testid="modal-content">Content</div>
      </Modal>
    );

    const backdrop = screen.getByRole("dialog");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT trigger onClose when clicking inside the modal content", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose}>
        <div data-testid="modal-content">
          <button type="button">Inside Button</button>
        </div>
      </Modal>
    );

    fireEvent.click(screen.getByTestId("modal-content"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Inside Button" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does NOT trigger onClose on backdrop click when closeOnBackdropClick is false", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} closeOnBackdropClick={false}>
        <div>Content</div>
      </Modal>
    );

    const backdrop = screen.getByRole("dialog");
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });
});
