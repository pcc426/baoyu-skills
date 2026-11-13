import path from "node:path";
import { readFile } from "node:fs/promises";

import type { CliArgs } from "../types";

const DEFAULT_MODEL = "sensenova-u1.5-lite";
const DEFAULT_SIZE = "1536x2048";
const MAX_REFERENCE_IMAGES = 5;
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const MIN_EDGE = 512;
const MAX_EDGE = 4096;
const SIZE_MULTIPLE = 32;
const MAX_ASPECT_RATIO = 3;

const ASPECT_RATIO_TO_SIZE: Record<string, string> = {
  "1:1": "2048x2048",
  "3:4": "1536x2048",
  "4:3": "2048x1536",
  "2:3": "1360x2048",
  "3:2": "2048x1360",
  "9:16": "1152x2048",
  "16:9": "2048x1152",
  "1:2": "1024x2048",
  "2:1": "2048x1024",
};

type SensenovaRequestBody = {
  model: string;
  prompt: string;
  n: 1;
  size: string;
  output_format: "png" | "jpeg" | "webp";
  response_format: "url" | "b64_json";
  watermark: boolean;
  prompt_extend: boolean;
  images?: Array<{ image_url: string }>;
};

type SensenovaResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    images_count?: number;
  };
};

export function getDefaultModel(): string {
  return process.env.SENSENOVA_IMAGE_MODEL || DEFAULT_MODEL;
}

function getApiKey(): string | null {
  return process.env.SENSENOVA_API_KEY || null;
}

export function getBaseUrl(): string {
  return (process.env.SENSENOVA_BASE_URL || "https://token.sensenova.cn/v1").replace(/\/+$/g, "");
}

export function buildApiUrl(endpoint: "generations" | "edits"): string {
  return `${getBaseUrl()}/images/${endpoint}`;
}

/** 默认关水印与提示词扩写：两者都会破坏「逐字文案 + 固定文字占比」的卡片 */
function wantsWatermark(): boolean {
  return process.env.SENSENOVA_WATERMARK === "1" || process.env.SENSENOVA_WATERMARK === "true";
}

function wantsPromptExtend(): boolean {
  return process.env.SENSENOVA_PROMPT_EXTEND === "1" || process.env.SENSENOVA_PROMPT_EXTEND === "true";
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

function suggestSize(width: number, height: number): string {
  const snappedWidth = Math.min(MAX_EDGE, Math.max(MIN_EDGE, Math.round(width / SIZE_MULTIPLE) * SIZE_MULTIPLE));
  const snappedHeight = Math.min(MAX_EDGE, Math.max(MIN_EDGE, Math.round(height / SIZE_MULTIPLE) * SIZE_MULTIPLE));
  return `${snappedWidth}x${snappedHeight}`;
}

export function validatePixelSize(width: number, height: number): void {
  if (width % SIZE_MULTIPLE !== 0 || height % SIZE_MULTIPLE !== 0) {
    throw new Error(
      `SenseNova requires width and height to be multiples of ${SIZE_MULTIPLE}. ` +
        `${width}x${height} is invalid — use ${suggestSize(width, height)}.`
    );
  }
  if (width < MIN_EDGE || width > MAX_EDGE || height < MIN_EDGE || height > MAX_EDGE) {
    throw new Error(
      `SenseNova requires each edge between ${MIN_EDGE} and ${MAX_EDGE}. ` +
        `${width}x${height} is invalid — use ${suggestSize(width, height)}.`
    );
  }
  const ratio = Math.max(width / height, height / width);
  if (ratio > MAX_ASPECT_RATIO) {
    throw new Error(`SenseNova aspect ratio must not exceed ${MAX_ASPECT_RATIO}:1 (got ${width}x${height}).`);
  }
}

export function resolveSize(args: CliArgs): string {
  if (args.size) {
    const parsed = parsePixelSize(args.size);
    if (!parsed) {
      throw new Error("SenseNova --size must be in WxH format, for example 1536x2048.");
    }
    validatePixelSize(parsed.width, parsed.height);
    return `${parsed.width}x${parsed.height}`;
  }

  if (args.aspectRatio) {
    const mapped = ASPECT_RATIO_TO_SIZE[args.aspectRatio];
    if (!mapped) {
      throw new Error(
        `SenseNova has no preset for aspect ratio ${args.aspectRatio}. Pass --size <WxH> (multiples of ${SIZE_MULTIPLE}) instead.`
      );
    }
    return mapped;
  }

  return DEFAULT_SIZE;
}

export function validateArgs(_model: string, args: CliArgs): void {
  if (args.n > 1) {
    throw new Error("SenseNova supports only one image per request (n must be 1).");
  }
  if (args.referenceImages.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`SenseNova accepts at most ${MAX_REFERENCE_IMAGES} reference images per request.`);
  }
  resolveSize(args);
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  throw new Error(`SenseNova reference images must be PNG, JPG, or WebP: ${filename}`);
}

export async function buildReferenceImages(
  referenceImages: string[],
): Promise<Array<{ image_url: string }> | undefined> {
  if (referenceImages.length === 0) return undefined;

  const images: Array<{ image_url: string }> = [];
  for (const refPath of referenceImages) {
    const bytes = await readFile(refPath);
    if (bytes.length > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error(`SenseNova reference image must be smaller than 10MB: ${refPath}`);
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
): Promise<{ endpoint: "generations" | "edits"; body: SensenovaRequestBody }> {
  validateArgs(model, args);

  const body: SensenovaRequestBody = {
    model,
    prompt,
    n: 1,
    size: resolveSize(args),
    output_format: "png",
    response_format: "url",
    watermark: wantsWatermark(),
    prompt_extend: wantsPromptExtend(),
  };

  const images = await buildReferenceImages(args.referenceImages);
  if (images) {
    body.images = images;
    return { endpoint: "edits", body };
  }

  return { endpoint: "generations", body };
}

async function downloadImage(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image from SenseNova: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function extractImageFromResponse(result: SensenovaResponse): Promise<Uint8Array> {
  const b64 = result.data?.[0]?.b64_json;
  if (b64) {
    return Uint8Array.from(Buffer.from(b64, "base64"));
  }

  const url = result.data?.[0]?.url;
  if (url) {
    return downloadImage(url);
  }

  throw new Error("No image data in SenseNova response");
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
    throw new Error(
      "SENSENOVA_API_KEY is required. Create one at https://platform.sensenova.cn/console/keys"
    );
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
    throw new Error(`SenseNova API error (${response.status}): ${err}`);
  }

  const result = (await response.json()) as SensenovaResponse;
  return extractImageFromResponse(result);
}
