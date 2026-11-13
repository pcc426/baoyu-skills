import { describe, expect, test } from "bun:test";

import {
  buildApiUrl,
  buildRequestBody,
  extractImageFromResponse,
  getDefaultModel,
  resolveSize,
  validatePixelSize,
} from "./sensenova";
import type { CliArgs } from "../types";

function makeArgs(overrides: Partial<CliArgs> = {}): CliArgs {
  return {
    prompt: null,
    promptFiles: [],
    imagePath: "out.png",
    provider: "sensenova",
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

describe("SenseNova provider", () => {
  test("default model and base URL", () => {
    delete process.env.SENSENOVA_IMAGE_MODEL;
    delete process.env.SENSENOVA_BASE_URL;
    expect(getDefaultModel()).toBe("sensenova-u1.5-lite");
    expect(buildApiUrl("generations")).toBe("https://token.sensenova.cn/v1/images/generations");
    expect(buildApiUrl("edits")).toBe("https://token.sensenova.cn/v1/images/edits");
  });

  test("rejects sizes that are not multiples of 32 with a concrete suggestion", () => {
    expect(() => validatePixelSize(1200, 1600)).toThrow("multiples of 32");
    expect(() => validatePixelSize(1200, 1600)).toThrow("1216x1600");
    expect(() => validatePixelSize(1536, 2048)).not.toThrow();
  });

  test("rejects out-of-range edges and extreme aspect ratios", () => {
    expect(() => validatePixelSize(4096, 4096)).not.toThrow();
    expect(() => validatePixelSize(512, 512)).not.toThrow();
    expect(() => validatePixelSize(480, 640)).toThrow("between 512 and 4096");
    expect(() => validatePixelSize(2048, 512)).toThrow("aspect ratio");
  });

  test("resolveSize prefers --size, then --ar preset, then 3:4 default", () => {
    expect(resolveSize(makeArgs({ size: "1536x2048" }))).toBe("1536x2048");
    expect(resolveSize(makeArgs({ aspectRatio: "3:4" }))).toBe("1536x2048");
    expect(resolveSize(makeArgs())).toBe("1536x2048");
    expect(() => resolveSize(makeArgs({ size: "1200x1600" }))).toThrow("32");
  });

  test("body disables watermark and prompt extension by default", async () => {
    delete process.env.SENSENOVA_WATERMARK;
    delete process.env.SENSENOVA_PROMPT_EXTEND;
    const { endpoint, body } = await buildRequestBody("卡片文案", "sensenova-u1.5-lite", makeArgs());
    expect(endpoint).toBe("generations");
    expect(body.n).toBe(1);
    expect(body.watermark).toBe(false);
    expect(body.prompt_extend).toBe(false);
    expect(body.size).toBe("1536x2048");
    expect(body.output_format).toBe("png");
  });

  test("rejects n greater than 1", async () => {
    await expect(buildRequestBody("x", "sensenova-u1.5-lite", makeArgs({ n: 2 }))).rejects.toThrow(
      "only one image"
    );
  });

  test("extracts base64 payloads", async () => {
    const bytes = await extractImageFromResponse({ data: [{ b64_json: Buffer.from("hi").toString("base64") }] });
    expect(Buffer.from(bytes).toString("utf8")).toBe("hi");
  });
});
