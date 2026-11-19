// #305: the Apple Watch app runs on watchOS 8 (Series 3's last version).
// watchOS 9-only SwiftUI/WatchKit APIs would raise the minimum again.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const read = (p) => readFileSync(`${process.cwd()}/${p}`, "utf8");

describe("Watch app on watchOS 8 (#305)", () => {
  it("deploys to watchOS 8.0", () => {
    expect(read("ios/project-watch.yml")).toMatch(/deploymentTarget: "8\.0"/);
  });
  it("uses no watchOS 9-only APIs", () => {
    const swift = readdirSync(`${process.cwd()}/ios/ApexWatch`)
      .filter((f) => f.endsWith(".swift"))
      .map((f) => read(`ios/ApexWatch/${f}`).replace(/\/\/.*$/gm, ""))
      .join("\n");
    for (const api of [/NavigationStack/, /navigationDestination/, /NavigationLink\(value:/, /WKApplicationDelegate/, /NavigationSplitView/]) {
      expect(swift).not.toMatch(api);
    }
  });
});
