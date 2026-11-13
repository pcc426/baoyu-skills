# SenseNova (商汤日日新 U1.5) — `--provider sensenova`

商汤走 OpenAI 图像规范，因此接入成本低；但尺寸、参考图协议、默认开关三处与 OpenAI 不同，踩错就会静默变差（水印）或直接 400（尺寸）。

## 接口

| 项 | 值 |
|---|---|
| Base URL | `https://token.sensenova.cn/v1`（`SENSENOVA_BASE_URL` 可覆盖） |
| 文生图 | `POST /images/generations` |
| 参考图编辑 | `POST /images/edits` |
| 模型 | `sensenova-u1.5-lite`（默认，质量档）、`sensenova-u1.5-fast`（速度档） |
| 鉴权 | `Authorization: Bearer $SENSENOVA_API_KEY` |

## 参数与硬约束

| 参数 | 规则 |
|---|---|
| `n` | **只能为 1**，传 >1 会 400 |
| `size` | 宽高均为 **32 的倍数**，每条边 512–4096，比例 ≤3:1 |
| 参考图 | 最多 **5 张**；本地文件转 data URI，放在 JSON `images:[{image_url}]`；只支持 PNG/JPG/WebP |
| `output_format` | `png`（默认走 png）/ `jpeg` / `webp` |
| `response_format` | `url`（24 小时有效）或 `b64_json` |

**尺寸对照**（3:4 卡片一律用 `1536x2048`）：

| 用途 | 合法值 | 备注 |
|---|---|---|
| 3:4 卡片 | `1536x2048` | 1536=32×48、2048=32×64 |
| 1:1 | `2048x2048` | 2K 档 |
| 4:3 | `2048x1536` | |
| 9:16 | `1152x2048` | |

`1200x1600` **不合法**（1200÷32=37.5），脚本会拒绝并提示最近的合法值（`1216x1600`）。

## 两个默认开关（必须显式关）

| 字段 | 默认 | 本 provider 行为 |
|---|---|---|
| `watermark` | `true` | 强制 `false`；否则右下角压「日日新 sensenova」品牌标 |
| `prompt_extend` | `true` | 强制 `false`；否则模型扩写提示词，逐字文案和文字占比都会被打乱 |

需要时可用 `SENSENOVA_WATERMARK=1` / `SENSENOVA_PROMPT_EXTEND=1` 打开，但生图卡片场景不要开。

## 用法

```bash
# 文生图（3:4 卡片）
npx -y bun scripts/main.ts --provider sensenova \
  --size 1536x2048 --promptfiles card.md --image card.png

# 参考图编辑（最多 5 张）
npx -y bun scripts/main.ts --provider sensenova \
  --size 1536x2048 --ref style.png character.png \
  --prompt "沿用图1画风与图2人物，重绘这张卡" --image out.png
```

## 实测（2026-11，公测免费档）

- 1536x2048 单张耗时 **150–160 秒**（同步接口，无轮询，无法通过并发掩盖延迟）
- 真实读书卡（70–75% 文字占比、3000 字提示词）：**零错字零乱码**，三个模块要点完整
- 短板：**嵌套文字**会丢字——卡片里再画一本书、书皮上写书名时，书名被写错
- 排版指令遵循不完美：要求「左对齐」时出过居中，字号层级倒是准确
- 产出 3.4–5.0MB PNG

## 计费

公测期 Token Plan 免费，积分池 12 万 / 5 小时 + 120 万 / 周；付费档未公布单价。响应带 `usage`（input_tokens/output_tokens/images_count），当前适配器不透传，需要精确计费时直接抓响应。
