// @vitest-environment jsdom
//
// Regression coverage for a real production bug: a client reported that
// "sometimes the app doesn't record foods entered" — tracing it down,
// the save failures WERE being reported, but the error toast rendered
// with the exact same green checkmark icon as a success toast (Toast
// previously ignored whether the message was an error at all). In a
// noisy gym, glancing at a phone, a failure toast that looks identical
// to a success one is as good as no error message at all.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Toast } from "./ui";

afterEach(() => cleanup());

describe("Toast", () => {
  it("shows a checkmark for a routine success message (default tone)", () => {
    // Toast renders via createPortal straight to document.body, outside
    // RTL's own container — query the document, not the container.
    render(<Toast message="Food added" show />);
    expect(screen.getByText("Food added")).toBeTruthy();
    expect(document.querySelector(".lucide-check")).toBeTruthy();
    expect(document.querySelector(".lucide-circle-alert")).toBeNull();
  });

  it("shows a distinct error icon (not a checkmark) for tone='error'", () => {
    render(<Toast message="Couldn't save — check your connection and try again" show tone="error" />);
    expect(screen.getByText("Couldn't save — check your connection and try again")).toBeTruthy();
    expect(document.querySelector(".lucide-circle-alert")).toBeTruthy();
    expect(document.querySelector(".lucide-check")).toBeNull();
  });
});
