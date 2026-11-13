import { describe, expect, test } from "bun:test";

import {
  buildApiUrl,
  buildRequestBody,
  extractImageFromResponse,
  getDefaultModel,
  maxAttempts,
  validatePixelSize,
} from "./minimax-h3";
import type { CliArgs } from "../types";

function makeArgs(overrides: Partial<CliArgs> = {}): CliArgs {
  return {
    prompt: null,
    promptFiles: [],
    imagePath: "out.png",
    provider: "minimax-h3",
    model: null,
    aspectRatio: null,
    size: null,
    quality: "2k",
    imageSize: null,
    imageApiDialect: null,
    responseFormat: null,
    referenceImages: [],
    n: 1,
    batchFile: null,
    jobs: null,
    json: false,
    help: false,
    ...overrides,
  };
}

describe("MiniMax H3 provider", () => {
  test("never retries: the endpoint is not idempotent", () => {
    expect(maxAttempts).toBe(1);
  });

  test("default model and domestic base URL", () => {
    delete process.env.MINIMAX_H3_IMAGE_MODEL;
    expect(getDefaultModel()).toBe("MiniMax-H3-Image");
    expect(buildApiUrl("generations")).toBe("https://api.minimax.cn/v1/images/generations");
  });

  test("area and ratio limits follow the published rules", () => {
    expect(() => validatePixelSize(1536, 2048)).not.toThrow();
    expect(() => validatePixelSize(512, 512)).toThrow("total pixels");
    expect(() => validatePixelSize(4096, 4096)).not.toThrow();
    expect(() => validatePixelSize(6144, 6144)).toThrow("total pixels");
    expect(() => validatePixelSize(4096, 1024)).toThrow("aspect ratio");
  });

  test("explicit size wins over aspect ratio mode", async () => {
    const { body } = await buildRequestBody("x", "MiniMax-H3-Image", makeArgs({ size: "1536x2048" }));
    expect(body.size).toBe("1536x2048");
    expect(body.aspect_ratio).toBeUndefined();
    expect(body.area).toBeUndefined();
  });

  test("aspect ratio mode maps to auto + area tier", async () => {
    const { body } = await buildRequestBody("x", "MiniMax-H3-Image", makeArgs({ aspectRatio: "3:4" }));
    expect(body.size).toBe("auto");
    expect(body.aspect_ratio).toBe("3:4");
    expect(body.area).toBe("2K");
  });

  test("prompt enhancement is off by default and n is forwarded", async () => {
    delete process.env.MINIMAX_H3_PROMPT_ENHANCED;
    const { body } = await buildRequestBody("x", "MiniMax-H3-Image", makeArgs({ n: 4 }));
    expect(body.disable_prompt_enhanced).toBe(true);
    expect(body.n).toBe(4);
  });

  test("rejects invalid combinations", async () => {
    await expect(
      buildRequestBody("x", "MiniMax-H3-Image", makeArgs({ size: "1536x2048", aspectRatio: "3:4" }))
    ).rejects.toThrow("not both");
    await expect(buildRequestBody("x", "MiniMax-H3-Image", makeArgs({ n: 11 }))).rejects.toThrow(
      "at most 10"
    );
  });

  test("extracts base64 payloads without network", async () => {
    const bytes = await extractImageFromResponse({
      data: [{ b64_json: Buffer.from("ok").toString("base64") }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    expect(Buffer.from(bytes).toString("utf8")).toBe("ok");
  });
});
