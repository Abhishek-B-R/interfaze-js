import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Interfaze, InterfazeError, type InterfazeOptions } from "../src/index.js";
import { completion, jsonResponse, mockInterfaze } from "./helpers.js";

describe("client construction", () => {
  const saved = process.env["INTERFAZE_API_KEY"];
  beforeEach(() => {
    delete process.env["INTERFAZE_API_KEY"];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env["INTERFAZE_API_KEY"];
    else process.env["INTERFAZE_API_KEY"] = saved;
  });

  it("throws a clear error when no API key is available", () => {
    expect(() => new Interfaze({})).toThrow(InterfazeError);
    expect(() => new Interfaze({})).toThrow(/INTERFAZE_API_KEY/);
  });

  it("accepts an explicit apiKey", () => {
    const i = new Interfaze({ apiKey: "sk-test" });
    expect(i).toBeInstanceOf(Interfaze);
  });

  it("reads INTERFAZE_API_KEY from the environment", () => {
    process.env["INTERFAZE_API_KEY"] = "sk-env";
    expect(() => new Interfaze({})).not.toThrow();
  });

  it("exposes only the curated surface (no 404-prone resources)", () => {
    const i = new Interfaze({ apiKey: "sk-test" }) as unknown as Record<string, unknown>;
    expect(i["chat"]).toBeDefined();
    expect(i["models"]).toBeDefined();
    expect(i["tasks"]).toBeDefined();
    expect(i["embeddings"]).toBeUndefined();
    expect(i["responses"]).toBeUndefined();
    expect(i["audio"]).toBeUndefined();
    expect(i["images"]).toBeUndefined();
    expect(i["batches"]).toBeUndefined();
  });

  it("still exposes the raw OpenAI client as an escape hatch", () => {
    const i = new Interfaze({ apiKey: "sk-test" });
    expect(i.openai).toBeDefined();
    expect(i.openai.chat.completions).toBeDefined();
  });

  it("defaults the timeout above the server's 800s cap", () => {
    const i = new Interfaze({ apiKey: "sk-test" });
    expect((i.openai as unknown as { timeout: number }).timeout).toBe(900_000);
  });

  it("respects an explicit timeout", () => {
    const i = new Interfaze({ apiKey: "sk-test", timeout: 30_000 });
    expect((i.openai as unknown as { timeout: number }).timeout).toBe(30_000);
  });
});

describe("defaultHeaders", () => {
  it.each([
    ["a plain object", { "x-trace": "abc" }],
    ["a Headers instance", new Headers({ "x-trace": "abc" })],
    ["an array of tuples", [["x-trace", "abc"]]],
  ])("forwards headers given as %s", async (_label, defaultHeaders) => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), {
      defaultHeaders: defaultHeaders as InterfazeOptions["defaultHeaders"],
      bypassCache: true,
    });
    await interfaze.chat.completions.create({ messages: [{ role: "user", content: "hi" }] });

    expect(calls[0]!.headers.get("x-trace")).toBe("abc");
    expect(calls[0]!.headers.get("x-interfaze-bypass-cache")).toBe("true");
  });
});
