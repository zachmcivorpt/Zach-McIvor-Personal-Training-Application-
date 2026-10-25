// @vitest-environment jsdom
//
// Field renders a <label>, which forwards a tap on its title/hint to the
// first button inside it. Chip groups and −/+ steppers use `group` (a
// plain <div>) so tapping the title never toggles a chip or steps a value.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Field } from "./ui";

afterEach(cleanup);

function renderField(props) {
  const onFirst = vi.fn();
  render(
    <Field label="CATEGORIES" hint="Pick any" {...props}>
      <div>
        <button type="button" onClick={onFirst}>
          Home Training
        </button>
        <button type="button">Fat Loss</button>
      </div>
    </Field>
  );
  return onFirst;
}

describe("Field group", () => {
  it("a plain Field (label) forwards a tap on its title to the first button — why group exists", () => {
    const onFirst = renderField({});
    fireEvent.click(screen.getByText("CATEGORIES"));
    expect(onFirst).toHaveBeenCalledTimes(1);
  });

  it("a group Field never toggles the first chip from a tap on its title or hint", () => {
    const onFirst = renderField({ group: true });
    fireEvent.click(screen.getByText("CATEGORIES"));
    fireEvent.click(screen.getByText("Pick any"));
    expect(onFirst).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Home Training"));
    expect(onFirst).toHaveBeenCalledTimes(1);
  });

  it("keeps text inputs labelled when not a group", () => {
    render(
      <Field label="PROGRAM NAME">
        <input aria-label="name" />
      </Field>
    );
    expect(screen.getByText("PROGRAM NAME").closest("label")).not.toBeNull();
  });
});
