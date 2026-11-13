# DashScope (阿里通义万象)

## Model Families

**`qwen-image-3.0*` / `qwen-image-2.0*`** — recommended modern family (identical sizing envelope). Members: `qwen-image-3.0-pro`, `qwen-image-2.0-pro`, `qwen-image-2.0-pro-2026-04-22`, `qwen-image-2.0-pro-2026-03-03`, `qwen-image-2.0`, `qwen-image-2.0-2026-03-03`.

- `qwen-image-3.0-pro` is the newest flagship; `qwen-image-2.0-pro` remains the built-in default until the 3.0 request shape is verified end to end
- Free-form `size` in `宽*高` format
- Total pixels must be between `512*512` and `2048*2048`
- Default ≈ `1024*1024`
- Best choice for custom ratios (e.g. `21:9`) and text-heavy Chinese/English layouts

**Fixed-size family** — `qwen-image-max`, `qwen-image-max-2025-12-30`, `qwen-image-plus`, `qwen-image-plus-2026-01-09`, `qwen-image`.

- Only five sizes allowed: `1664*928`, `1472*1104`, `1328*1328`, `1104*1472`, `928*1664`
- Default is `1664*928`
- `qwen-image` currently has the same capability as `qwen-image-plus`

**`wan2.7-image*`** — multimodal Wan 2.7 family. Members: `wan2.7-image-pro`, `wan2.7-image`. This is the newest Wan generation; `wan2.6-*` / `wan2.5-*` are older and not routed by name in this adapter.

- Free-form `size` in `宽*高` format, plus aspect-ratio inference
- `wan2.7-image-pro` text-to-image (no `--ref`): total pixels in `[768*768, 4096*4096]`, ratio in `[1:8, 8:1]`
- `wan2.7-image-pro` with reference images and `wan2.7-image` (all scenarios): total pixels in `[768*768, 2048*2048]`, ratio in `[1:8, 8:1]`
- `wan2.7-image` supports only `1K` / `2K` tiers; 4K is pro-only and text-to-image only
- 3:4 card size `1536*2048` (3.15MP) is valid for both models (below the 4.19MP ceiling)
- Default: `1024*1024` (`--quality normal`) or `2048*2048` (`--quality 2k`); 4K requires explicit `--size`
- `--ref` for image editing / multi-image fusion (see Reference Images)
- API does NOT use `prompt_extend`; the skill omits it for this family
- The Wan 2.7 API defaults `n` to **4** in non-collage mode and bills per image; baoyu-image-gen forces `n: 1` and rejects `--n > 1` to avoid paying for discarded images.

**Legacy** — `z-image-turbo`, `z-image-ultra`, `wanx-v1`. Only use when the user explicitly asks for legacy behavior.

## Size Resolution

- `--size` wins over `--ar`
- For `qwen-image-3.0*` / `qwen-image-2.0*`: prefer explicit `--size`; otherwise infer from `--ar` using the recommended table below
- For `qwen-image-max/plus/image`: only use the five fixed sizes; if the requested ratio doesn't fit, switch to `qwen-image-2.0-pro` or `qwen-image-3.0-pro`
- For `wan2.7-image*`: explicit `--size` is validated against the per-mode pixel/ratio limits; otherwise the size is derived from `--ar` and `--quality` (`normal` ≈ 1K, `2k` ≈ 2K). To request 4K with `wan2.7-image-pro` text-to-image, pass `--size` explicitly (e.g. `4096*4096`, `3840*2160`)
- `--quality` is a baoyu-image-gen preset, not an official DashScope field. The mapping of `normal`/`2k` onto the `qwen-image-3.0*` / `qwen-image-2.0*` and `wan2.7-image*` tables is an implementation choice, not an API guarantee

### Recommended `qwen-image-3.0*` / `qwen-image-2.0*` sizes

| Ratio | `normal` | `2k` |
|-------|----------|------|
| `1:1` | `1024*1024` | `1536*1536` |
| `2:3` | `768*1152` | `1024*1536` |
| `3:2` | `1152*768` | `1536*1024` |
| `3:4` | `960*1280` | `1080*1440` |
| `4:3` | `1280*960` | `1440*1080` |
| `9:16` | `720*1280` | `1080*1920` |
| `16:9` | `1280*720` | `1920*1080` |
| `21:9` | `1344*576` | `2048*872` |

## Reference Images

- Only `wan2.7-image-pro` and `wan2.7-image` accept `--ref`; all other DashScope models reject it — steer the user to another provider/model.
- Up to 9 reference images per request; each source image must be 240–8000px per edge, ratio within `[1:8, 8:1]`, and ≤20MB. Local files are inlined as base64 data URLs; `http(s)://` URLs are forwarded as-is.
- Any `--ref` clamps the wan2.7-image-pro ceiling from 4K to 2K (4K is text-to-image only).
- Official docs say the generated image follows the aspect ratio of the **last input image** when a resolution tier is used; passing an explicit `宽*高` overrides that and is the safer choice for fixed card layouts.

## Pricing (Beijing, list price)

- `wan2.7-image`: **¥0.20 / image**
- `wan2.7-image-pro`: **¥0.50 / image**
- Input images are not billed separately; only successfully generated images are charged. 50-image free quota exists on some regions/deployments within 90 days of activation — check the console, don't treat it as a permanent price.
- `qwen-image-2.0-pro` / `qwen-image-3.0-pro` are priced separately (roughly ¥0.20–0.30 / image depending on size tier); confirm in the console before budgeting a set.

## Not Exposed

`negative_prompt`, `prompt_extend`, `watermark`, `thinking_mode`, `seed`, `bbox_list`, `enable_sequential`, `color_palette` are not CLI flags; wan2.7 uses API defaults (e.g. `thinking_mode=true`). Always `n=1` for wan2.7 — grid/collage mode requires calling the API directly.

Note: DashScope's wan2.7 request schema has **no `prompt_extend` field** — third-party gateways that accept `prompt_extend` map it onto `thinking_mode`. The wan2.7 defaults are therefore `thinking_mode=true` (slower, better quality; only applies to text-to-image without refs) and `watermark=false`. The adapter deliberately sends only `size`, `n: 1`, `watermark: false`.

## Official References

- [Qwen-Image API](https://help.aliyun.com/zh/model-studio/qwen-image-api)
- [Text-to-image guide](https://help.aliyun.com/zh/model-studio/text-to-image)
- [Qwen-Image Edit API](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api)
- [Wan 2.7 image generation & editing API](https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference)
