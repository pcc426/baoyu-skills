import path from "node:path";
import { readFile } from "node:fs/promises";

import type { CliArgs } from "../types";

const DEFAULT_MODEL = "MiniMax-H3-Image";
const MAX_REFERENCE_IMAGES = 16;
const MAX_REFERENCE_IMAGE_BYTES = 64 * 1024 * 1024;
const MIN_AREA = 655_360;
const MAX_AREA = 20_000_000;
const MAX_ASPECT_RATIO = 3;
const MAX_IMAGES_PER_REQUEST = 10;

/**
 * H3 接口非幂等：请求发出后即使客户端超时/断连，服务端仍会生成并计费。
 * 因此禁用自动重试，失败由调用方确认后手动重跑。
 */
export const maxAttempts = 1;

type MinimaxH3RequestBody = {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  aspect_ratio?: string;
  area?: "1K" | "2K" | "4K";
  output_format?: "png" | "jpeg" | "webp";
  response_format?: "url" | "b64_json";
  disable_prompt_enhanced?: boolean;
  images?: Array<{ image_url: string }>;
};

type MinimaxH3Response = {
  data?: Array<{ url?: string; b64_json?: string; size?: string }>;
  usage?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { text_tokens?: number; image_tokens?: number };
    output_tokens_details?: { image_tokens?: number };
  };
  base_resp?: { status_code?: number; status_msg?: string };
};

export function getDefaultModel(): string {
  return process.env.MINIMAX_H3_IMAGE_MODEL || DEFAULT_MODEL;
}

function getApiKey(): string | null {
  return process.env.MINIMAX_API_KEY || null;
}

export function getBaseUrl(): string {
  const base = process.env.MINIMAX_H3_BASE_URL || process.env.MINIMAX_BASE_URL || "https://api.minimax.cn";
  return base.replace(/\/+$/g, "");
}

export function buildApiUrl(endpoint: "generations" | "edits"): string {
  const base = getBaseUrl();
  return base.endsWith("/v1") ? `${base}/images/${endpoint}` : `${base}/v1/images/${endpoint}`;
}

/** 默认关闭提示词增强：卡片要求逐字文案，扩写会破坏文字占比与原文 */
function wantsPromptEnhance(): boolean {
  const flag = process.env.MINIMAX_H3_PROMPT_ENHANCED;
  return flag === "1" || flag === "true";
}

export function parsePixelSize(size: string): { width: number; height: number } | null {
  const match = size.trim().match(/^(\d+)\s*[xX*]\s*(\d+)$/);
  if (!match) return null;
  const width = parseInt(match[1]!, 10);
  const height = parseInt(match[2]!, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function validatePixelSize(width: number, height: number): void {
  const area = width * height;
  if (area < MIN_AREA || area > MAX_AREA) {
    throw new Error(
      `MiniMax H3 requires total pixels between ${MIN_AREA} and ${MAX_AREA} (got ${width}x${height} = ${area}).`
    );
  }
  const ratio = Math.max(width / height, height / width);
  if (ratio > MAX_ASPECT_RATIO) {
    throw new Error(`MiniMax H3 aspect ratio must not exceed ${MAX_ASPECT_RATIO}:1 (got ${width}x${height}).`);
  }
}

export function validateArgs(_model: string, args: CliArgs): void {
  if (args.n > MAX_IMAGES_PER_REQUEST) {
    throw new Error(`MiniMax H3 supports at most ${MAX_IMAGES_PER_REQUEST} images per request.`);
  }
  if (args.referenceImages.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`MiniMax H3 accepts at most ${MAX_REFERENCE_IMAGES} reference images per request.`);
  }
  if (args.size && args.aspectRatio) {
    throw new Error("MiniMax H3 accepts either --size <WxH> or --ar <ratio>, not both.");
  }
  if (args.size) {
    const parsed = parsePixelSize(args.size);
    if (!parsed) {
      throw new Error("MiniMax H3 --size must be in WxH format, for example 1536x2048.");
    }
    validatePixelSize(parsed.width, parsed.height);
  }
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  throw new Error(`MiniMax H3 reference images must be PNG, JPG, or WebP: ${filename}`);
}

export async function buildReferenceImages(
  referenceImages: string[],
): Promise<Array<{ image_url: string }> | undefined> {
  if (referenceImages.length === 0) return undefined;

  const images: Array<{ image_url: string }> = [];
  for (const refPath of referenceImages) {
    if (/^https?:\/\//i.test(refPath)) {
      images.push({ image_url: refPath });
      continue;
    }
    const bytes = await readFile(refPath);
    if (bytes.length > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error(`MiniMax H3 reference image must be smaller than 64MB: ${refPath}`);
    }
    images.push({
      image_url: `data:${getMimeType(refPath)};base64,${bytes.toString("base64")}`,
    });
  }
  return images;
}

export async function buildRequestBody(
  prompt: string,
  model: string,
  args: CliArgs,
): Promise<{ endpoint: "generations" | "edits"; body: MinimaxH3RequestBody }> {
  validateArgs(model, args);

  const body: MinimaxH3RequestBody = {
    model,
    prompt,
    output_format: "png",
    response_format: "url",
  };

  if (args.size) {
    body.size = args.size.trim().replace(/\s*[xX*]\s*/, "x");
  } else if (args.aspectRatio) {
    body.size = "auto";
    body.aspect_ratio = args.aspectRatio.replace(":", ":");
    body.area = args.quality === "normal" ? "1K" : "2K";
  } else {
    // 文生图默认走 2K 面积档的 3:4（卡片最常用比例）
    body.size = "auto";
    body.aspect_ratio = "3:4";
    body.area = "2K";
  }

  if (args.n > 1) {
    body.n = args.n;
  }

  const images = await buildReferenceImages(args.referenceImages);
  if (images) {
    // /images/edits 不支持 disable_prompt_enhanced，提示词始终会被增强
    console.error("[minimax-h3] reference images present: prompt enhancement cannot be disabled on edits");
    body.images = images;
    return { endpoint: "edits", body };
  }

  body.disable_prompt_enhanced = !wantsPromptEnhance();
  return { endpoint: "generations", body };
}

async function downloadImage(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image from MiniMax H3: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export function logUsage(result: MinimaxH3Response): void {
  const usage = result.usage;
  if (!usage) return;
  const textTokens = usage.input_tokens_details?.text_tokens ?? 0;
  const imageInputTokens = usage.input_tokens_details?.image_tokens ?? 0;
  const outputTokens = usage.output_tokens_details?.image_tokens ?? usage.output_tokens ?? 0;
  const cost = (textTokens / 1e6) * 2.3 + (imageInputTokens / 1e6) * 1.5 + (outputTokens / 1e6) * 3.8;
  console.error(
    `[minimax-h3] usage in=${usage.input_tokens ?? 0} (text ${textTokens}, image ${imageInputTokens}) ` +
      `out=${outputTokens} → ≈$${cost.toFixed(4)}`
  );
}

export async function extractImageFromResponse(result: MinimaxH3Response): Promise<Uint8Array> {
  const baseResp = result.base_resp;
  if (baseResp && baseResp.status_code !== undefined && baseResp.status_code !== 0) {
    throw new Error(baseResp.status_msg || `MiniMax H3 returned status_code=${baseResp.status_code}`);
  }

  logUsage(result);

  const b64 = result.data?.[0]?.b64_json;
  if (b64) {
    return Uint8Array.from(Buffer.from(b64, "base64"));
  }

  const url = result.data?.[0]?.url;
  if (url) {
    return downloadImage(url);
  }

  throw new Error("No image data in MiniMax H3 response");
}

export function getDefaultOutputExtension(): ".png" {
  return ".png";
}

export async function generateImage(
  prompt: string,
  model: string,
  args: CliArgs,
): Promise<Uint8Array> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY is required. Get one from https://platform.minimax.cn/");
  }

  const { endpoint, body } = await buildRequestBody(prompt, model, args);
  const response = await fetch(buildApiUrl(endpoint), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`MiniMax H3 API error (${response.status}): ${err}`);
  }

  const result = (await response.json()) as MinimaxH3Response;
  return extractImageFromResponse(result);
}
