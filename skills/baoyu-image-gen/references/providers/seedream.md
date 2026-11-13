# Seedream (字节豆包 / 火山方舟 Ark)

`--provider seedream`，鉴权走 `ARK_API_KEY`，端点 `https://ark.cn-beijing.volces.com/api/v3/images/generations`（可用 `SEEDREAM_BASE_URL` 覆盖）。协议是 Ark 自己的 JSON 形态，不是 OpenAI Images：参考图放在 `image` 字段（字符串或字符串数组），没有 multipart。

## 模型 ID

| 代次 | Model ID | 备注 |
|------|----------|------|
| Seedream 5.5 | `doubao-seedream-5-5-261028` | 当前默认；多轮编辑、原生 RGBA、细图层拆分、富文本 OCR |
| Seedream 5.0 pro | `doubao-seedream-5-0-pro-260628` | 旧旗舰，支持交互编辑、图层拆分（≤16 层） |
| Seedream 5.0 flash | `doubao-seedream-5-0-flash-260915` | 更快更便宜 |
| Seedream 5.0 lite | `doubao-seedream-5-0-lite-*` | 支持组图 |
| Seedream 4.5 / 4.0 / 3.0 | `doubao-seedream-4-5-*` / `4-0-*` / `3-0-t2i-*` | 4.x 支持组图；3.0 只支持显式 WxH |

模型 ID 带日期后缀，版本更新后旧 ID 仍可用；换新版本只改 model。

## 尺寸

**Seedream 5.5（唯一支持 4.6MP 上限的一代）**

- 方式 1：`1K` / `1.5K` / `2K`（默认 `2K`）。比例靠 prompt 里的自然语言描述，模型自己判断。
- 方式 2：显式 `宽x高`。约束：总像素 **921,600 – 4,624,220**（`1280x720` 到 `2048x2048x1.1025`），宽高比 **[1/16, 16]**。
- 不支持 `3K` / `4K` / `adaptive`。注意 5.5 的上限比 5.0（16.7MP）低得多。

**其他代次**

- 5.0：`2K` / `3K` / WxH，上限 16.7MP。
- 4.5：`2K` / `4K` / WxH。
- 4.0：`1K` / `2K` / `4K` / WxH。
- 3.0：只能显式 WxH。

卡片场景直接用 `--size 1536x2048`（3.15MP，比例 3:4），在 5.5 的合法区间内。

## 参考图

- 5.5：单图生图 1 张；多图生图 **2–10 张**（超过 10 张本地直接报错）。
- 5.0 pro / flash：多图 2–10 张；5.0 lite、4.5、4.0：多图 2–14 张。
- 本地文件会被读成 data URL 塞进 `image` 字段；单张或数组由张数决定。
- 5.5 的 RGBA 图生图最多可输入 10 张参考图，输入图不必带透明通道。

## 输出与开关

- 5.5 默认 `output_format: png`；5.0 也支持 png；4.x 只有 jpeg，适配器默认扩展名是 `.jpg`。
- `watermark` 适配器固定传 `false`（上游默认 true）。
- 5.5 的 `background` 支持 `auto` / `transparent` / `opaque`，适配器不暴露，保持 `auto`。
- 5.5 **不支持组图生成、联网搜索、流式输出**；组图是 5.0 lite / 4.5 / 4.0 的能力。

## 提示词优化：5.5 没有关闭开关

`optimize_prompt_options.mode` 在 5.5 上只有 `standard` 一个可选值，而且默认就是 `standard`。也就是说 5.5 的提示词优化**无法关闭**，模型会按自己的理解补全/改写 prompt。逐字文案任务（读书卡、海报小字）必须实测错字率，不能假设「逐字照写」。5.0 pro / 4.0 还有 `fast` 可选，但同样没有 off。

## 计费

- 结构：输入图 + 输出图两段计费，**文本 token 免费**；纯文生图没有输入图那一段更便宜。
- 官方锚点：2K 方图**编辑**单张约 **¥0.28**，不到 5.0 pro 的一半；生成速度比 5.0 pro 快约 40%。
- 1536x2048 低于 2K 方图的像素量，实际单价应不高于 ¥0.28，以 `usage` 回传为准。

## 坑

1. **5.5 上限只有 4.6MP**：`4096x4096` 会被拒，`4K` 档位也不存在。想要 4K 只能用 5.0。
2. **参考图超过 10 张**：本地校验直接报错，不要指望服务端兜底。
3. **组图会 400**：5.5 不支持 `sequential_image_generation`，一套卡要并发多请求，不能一次出。
4. **提示词优化常开**：逐字文案先跑 1 张核对，别直接批量。
5. **模型要先在方舟控制台开通**：没开通时返回 404 / model not found，不是 key 的问题。
6. **非幂等**：请求超时后服务端可能仍生成并计费，失败先查控制台再重跑。

## 官方文档

- 图片生成 API：https://ark.volcengine.com/region:cn-beijing/docs/image-generation-api
- Seedream 5.5 特色能力：https://docs.volcengine.com/docs/ark/seedream-5-5
- 模型列表与价格：https://ark.volcengine.com/region:cn-beijing/model/detail?Id=doubao-seedream-5-5
