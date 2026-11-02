// @vitest-environment jsdom
//
// GS1 QR / Data Matrix codes in the food scanner — fresh meat increasingly
// carries only these, no barcode. A weighed pack's code names the product
// (a stable number) and carries its net weight: the food page opens at
// that weight. A plain website QR code can't identify the food, so the
// scanner says so and keeps scanning.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

const scan = vi.hoisted(() => ({ text: "", formats: null }));
vi.mock("barcode-detector/polyfill", () => ({}));
vi.mock("html5-qrcode", () => ({
  Html5QrcodeSupportedFormats: { EAN_13: 9, EAN_8: 10, UPC_A: 14, UPC_E: 15, CODE_128: 5, CODE_39: 3, ITF: 8, QR_CODE: 0, DATA_MATRIX: 6 },
  Html5Qrcode: class {
    constructor(_id, opts) {
      scan.formats = opts?.formatsToSupport;
    }
    async start(_c, _cfg, onSuccess) {
      setTimeout(() => onSuccess(scan.text), 0);
    }
    stop() {
      return Promise.resolve();
    }
    clear() {}
    getRunningTrackCapabilities() {
      return {};
    }
  },
}));

const app = vi.hoisted(() => ({ customFoods: [] }));
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: { customFoods: app.customFoods },
    createFood: vi.fn((f) => ({ id: "new", ...f })),
    updateFood: vi.fn(),
    findCustomFoodByBarcode: vi.fn(() => Promise.resolve(null)),
  }),
}));
vi.mock("../lib/barcodeLookup", async (orig) => ({ ...(await orig()), lookupBarcode: vi.fn(() => Promise.reject(Object.assign(new Error("not found"), { notFound: true }))) }));

beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn() }, configurable: true });
});
afterEach(() => cleanup());

async function open(text, onAdd = vi.fn()) {
  scan.text = text;
  const { BarcodeScanSheet } = await import("./NutritionFeatures");
  render(<BarcodeScanSheet open onClose={() => {}} onAdd={onAdd} />);
  return onAdd;
}

describe("food scanner: QR and Data Matrix codes", () => {
  it("asks the scanner for QR and Data Matrix as well as barcodes", async () => {
    await open("https://example.com");
    await waitFor(() => expect(scan.formats).toEqual(expect.arrayContaining([0, 6, 9])));
  });

  it("a meat pack's GS1 QR finds the remembered product and opens at the pack weight", async () => {
    app.customFoods = [{ id: "mince", name: "Beef Mince 5 Star", barcode: "99312345678900", cals: 176, protein: 20, carbs: 0, fat: 10.5, per: 100, defaultQty: 100 }];
    const onAdd = await open("https://id.gs1.org/01/99312345678900?3103=000512&17=261130");
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0]).toMatchObject({ id: "mince", defaultQty: 512 });
    expect(app.customFoods[0].defaultQty).toBe(100); // the library food itself isn't changed
  });

  it("a weighed pack seen for the first time asks for its label once", async () => {
    app.customFoods = [];
    await open("]d201993123456789003103000480" + "17261201");
    await waitFor(() => expect(document.body.textContent).toMatch(/weighed pack \(meat, deli\)/));
    expect(document.body.textContent).toMatch(/pack weight 480g/);
  });

  it("an ordinary packaged product's QR uses its normal product number", async () => {
    app.customFoods = [{ id: "yog", name: "Yoghurt", barcode: "9312345678907", cals: 60, protein: 5, carbs: 7, fat: 1, per: 100, defaultQty: 170 }];
    const onAdd = await open("https://id.gs1.org/01/09312345678907");
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0]).toMatchObject({ id: "yog", defaultQty: 170 });
  });

  it("a website QR code says it isn't the product and logs nothing", async () => {
    const onAdd = await open("https://www.woolworths.com.au/recipes");
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/website link, not the product/));
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(onAdd).not.toHaveBeenCalled();
  });
});
