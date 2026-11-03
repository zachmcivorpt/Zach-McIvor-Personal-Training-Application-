// @vitest-environment jsdom
//
// #126: the Nutrition Goal editor now lives in its own module (the client
// app no longer loads the whole coach client screen to open it), and in the
// client app it saves on the phone first and closes straight away instead
// of waiting for the server. The coach console keeps waiting.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const app = vi.hoisted(() => ({ updateUser: null }));
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({ db: { weighIns: {} }, updateUser: (...a) => app.updateUser(...a) }),
}));

import { NutritionTargetsCard } from "./NutritionTargetsCard";

afterEach(cleanup);

function renderCard(props) {
  const onClose = vi.fn();
  const showToast = vi.fn();
  render(<NutritionTargetsCard client={{ id: "c1", nutritionTargets: { calories: 2000, proteinPct: 30, carbsPct: 40, fatPct: 30 } }} showToast={showToast} open onClose={onClose} {...props} />);
  // Make it dirty: move the calorie slider.
  fireEvent.change(screen.getAllByRole("slider")[0], { target: { value: "2100" } });
  return { onClose, showToast };
}

describe("Nutrition Goal editor save speed (#126)", () => {
  it("client app: closes as soon as it's saved on the phone, without waiting for the server", async () => {
    app.updateUser = vi.fn(() => new Promise(() => {})); // the server never answers
    const { onClose, showToast } = renderCard({ saveLocalFirst: true });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "SAVE" })));
    expect(app.updateUser).toHaveBeenCalledWith("c1", { nutritionTargets: { calories: 2100, proteinPct: 30, carbsPct: 40, fatPct: 30 } });
    expect(onClose).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Nutrition targets saved");
  });

  it("coach console: still waits for the server before closing", async () => {
    app.updateUser = vi.fn(() => new Promise(() => {}));
    const { onClose } = renderCard({});
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "SAVE" })));
    expect(onClose).not.toHaveBeenCalled();
  });
});
