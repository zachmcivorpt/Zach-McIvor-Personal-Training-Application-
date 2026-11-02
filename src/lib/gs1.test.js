import { describe, expect, it } from "vitest";
import { parseScannedCode, parseElementString, parseDigitalLink, normaliseGtin, isVariableMeasureGtin } from "./gs1";

// 9312345678907 is a valid EAN-13 (check digit 7); 99312345678900 a valid
// variable-measure GTIN-14 (indicator 9, check digit 0).
describe("GS1 QR / Data Matrix codes", () => {
  it("a plain barcode passes through unchanged", () => {
    expect(parseScannedCode("9312345678907")).toMatchObject({ kind: "barcode", gtin: "9312345678907", netWeightGrams: null });
  });

  it("GS1 Digital Link QR: product number, weight and use-by", () => {
    const r = parseScannedCode("https://id.gs1.org/01/09312345678907/10/AB12?3103=000512&17=261130");
    expect(r).toMatchObject({ kind: "gs1", gtin: "9312345678907", netWeightGrams: 512, useBy: "2026-11-30", variableMeasure: false });
  });

  it("Digital Link on a brand's own domain, weight in the path, gtin alias", () => {
    expect(parseScannedCode("https://qr.example.com.au/01/99312345678900/3102/00048")).toMatchObject({ kind: "gs1", netWeightGrams: null }); // malformed weight is ignored, not trusted
    expect(parseScannedCode("https://qr.example.com.au/gtin/99312345678900/3102/000048")).toMatchObject({ kind: "gs1", gtin: "99312345678900", netWeightGrams: 480, variableMeasure: true });
  });

  it("Data Matrix element string with FNC1 separators and symbology id", () => {
    const r = parseScannedCode("]d201993123456789003103000750" + "10LOT7\x1d" + "17261201");
    expect(r).toMatchObject({ kind: "gs1", gtin: "99312345678900", netWeightGrams: 750, useBy: "2026-12-01" });
    expect(parseElementString("0109312345678907" + "3922" + "1299\x1d" + "3103001250")).toEqual({ "01": "09312345678907", 3922: "1299", 3103: "001250" });
  });

  it("printed (AI) form, and pounds converted to grams", () => {
    expect(parseScannedCode("(01)09312345678907(3202)000110")).toMatchObject({ kind: "gs1", netWeightGrams: 499 });
  });

  it("use-by day 00 means the end of that month", () => {
    expect(parseScannedCode("(01)09312345678907(17)270200").useBy).toBe("2027-02-28");
  });

  it("a website QR code is a link, not a product", () => {
    expect(parseScannedCode("https://www.woolworths.com.au/recipes/beef").kind).toBe("url");
    expect(parseDigitalLink("https://www.woolworths.com.au/recipes/beef")).toBeNull();
  });

  it("a product number with a wrong check digit is not trusted", () => {
    expect(parseScannedCode("https://id.gs1.org/01/09312345678900").kind).toBe("url");
  });

  it("GTIN-14 normalisation", () => {
    expect(normaliseGtin("09312345678907")).toBe("9312345678907");
    expect(normaliseGtin("99312345678900")).toBe("99312345678900");
    expect(isVariableMeasureGtin("99312345678900")).toBe(true);
    expect(isVariableMeasureGtin("9312345678907")).toBe(false);
  });
});
