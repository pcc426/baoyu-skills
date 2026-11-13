# MiniMax H3 Image — `--provider minimax-h3`

H3 与老的 `image-01`（`--provider minimax`）是**两套完全不同**的接口：端点、参数、计费单位都不一样。适配器单独放在 `scripts/providers/minimax-h3.ts`，老 provider 原样保留。

## 接口

| 项 | 值 |
|---|---|
| Base URL | `https://api.minimax.cn`（国内站；`MINIMAX_H3_BASE_URL` / `MINIMAX_BASE_URL` 可覆盖） |
| 文生图 | `POST /v1/images/generations` |
| 参考图编辑 | `POST /v1/images/edits` |
| 模型 | `MiniMax-H3-Image`（默认，标准档）、`MiniMax-H3-Image-Highspeed`（速度档，输出 token 单价翻倍） |
| 鉴权 | `Authorization: Bearer $MINIMAX_API_KEY`（与 image-01 共用同一把 key） |

## 参数与硬约束

| 参数 | 规则 |
|---|---|
| `prompt` | ≤32,000 字符；关闭增强后只读前约 4,096 token |
| `n` | 1–10，默认 1 |
| `size` | `WxH`：总面积 655,360–20,000,000 像素、比例 ≤3:1 |
| `aspect_ratio` + `area` | 另一种写法：`size: "auto"` + `aspect_ratio`（如 `3:4`）+ `area`（`1K`/`2K`/`4K`） |
| 两种写法 | **不可混用**；给了 `WxH` 就不能再传 `aspect_ratio` 或 `area` |
| 参考图 | 1–16 张；公网 URL、`mm_file://`、或 data URI；单文件 ≤64MB；边长 128–8192；长短边比 ≤4:1 |
| 输出格式 | `png`（适配器默认）/ `jpeg` / `webp` |
| 返回 | `url`（24 小时有效）或 `b64_json` |
| 不支持 | mask 局部编辑、透明背景、预览图 |

## 两个必须知道的坑

**1. 接口非幂等 → 禁止自动重试**
请求发出后即使客户端超时/断连，服务端仍会生成并计费。适配器导出 `maxAttempts = 1`，`main.ts` 会据此跳过全局的 3 次重试。失败请人工确认后重跑。

**2. prompt 增强默认开启**
`disable_prompt_enhanced` 默认 `false`，模型会自行扩写提示词。生成接口默认传 `true`；需要增强时设 `MINIMAX_H3_PROMPT_ENHANCED=1`。

**注意：参考图编辑（`/images/edits`）不接受这个参数**——传了会 400：`invalid params, disable_prompt_enhanced is not supported for image edits, prompts are always enhanced`。适配器在带 `--ref` 时会自动省略该字段，并在 stderr 提示「提示词将始终被增强」，此时务必逐字核对成图文字。

## 计费（按 token，不按张）

| 项 | 标准档 | Highspeed |
|---|---|---|
| 输入文本 / 百万 token | $2.30 | $2.30 |
| 输入图像 / 百万 token | $1.50 | $3.00 |
| 输出图像 / 百万 token | $3.80 | $7.60 |

实测 1536x2048 单张：`input_tokens=1760`（全为文本）+ `output_tokens=4070` → **≈$0.0195 ≈ ¥0.14/张**。
适配器会把 usage 折算成美元打到 stderr：`[minimax-h3] usage in=... out=... → ≈$0.0xxx`。

**尺寸经济学**：2K 档是甜点——面积是 1K 的 4 倍、价格只贵 7%；4K 面积再翻 4 倍、价格约 3 倍。4K 限时 5 折要求交付图 ≥1660 万像素，属促销价，不要写进长期成本模型。

## 用法

```bash
# 文生图（3:4 卡片）
npx -y bun scripts/main.ts --provider minimax-h3 \
  --size 1536x2048 --promptfiles card.md --image card.png

# 一次 4 张抽卡
npx -y bun scripts/main.ts --provider minimax-h3 \
  --ar 3:4 --n 4 --prompt "..." --image card.png

# 参考图编辑（最多 16 张）
npx -y bun scripts/main.ts --provider minimax-h3 \
  --size 1536x2048 --ref style.png character.png \
  --prompt "沿用图1画风与图2人物，重绘这张卡" --image out.png
```

## 实测（2026-11）

- 1536x2048 单张 **9.1 秒**（对比 SenseNova 的 150 秒，快 16 倍）
- 真实读书卡：文字基本逐字，但出现 1 处错字（痛苦→痛若）、1 处结构标签乱码（导师式重申→导师试重蹂）、并自行增加了提示词里没有的标签
- 建议：逐字文案一律用反引号包裹（见 SKILL.md「Verbatim Text in Generated Images」），交付前逐字核对
- 优势场景：抽卡、风格探索、批量出图；文字密集的正文卡建议用 SenseNova 或 gpt-image-2 复核
