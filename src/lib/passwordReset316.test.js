// @vitest-environment jsdom
// #316: "Forgot password?" failed with auth/unauthorized-continue-uri. The
// reset email must still go out, without the link back, when Firebase
// refuses the continue URL; any other error is still reported.
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("firebase/auth", () => ({ sendPasswordResetEmail: send }));
import { sendResetEmail } from "./passwordReset";

const err = (code) => Object.assign(new Error(code), { code });
beforeEach(() => send.mockReset());

describe("sendResetEmail (#316)", () => {
  it("sends with the link back when Firebase accepts it", async () => {
    send.mockResolvedValue();
    await sendResetEmail("AUTH", "a@b.co", "/login");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2]).toMatchObject({ url: expect.stringMatching(/\/login$/) });
  });
  it("refused link back → the plain reset email still goes", async () => {
    send.mockRejectedValueOnce(err("auth/unauthorized-continue-uri")).mockResolvedValueOnce();
    await sendResetEmail("AUTH", "a@b.co", "/login");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]).toEqual(["AUTH", "a@b.co"]);
  });
  it("other errors are still thrown", async () => {
    send.mockRejectedValueOnce(err("auth/too-many-requests"));
    await expect(sendResetEmail("AUTH", "a@b.co", "/login")).rejects.toThrow("auth/too-many-requests");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
