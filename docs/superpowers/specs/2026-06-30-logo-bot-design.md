# Slack Logo Bot Design

## Purpose

Build a Slack bot that lets company employees request approved brand logo assets through a guided conversation. The bot reads logo files from a specific Google Drive folder, uses an AI-generated metadata catalog to understand inconsistent folder and file naming, and can produce custom-size PNG outputs from SVG sources.

The first version optimizes for reliable internal use, low risk to existing Drive organization, and a small operational surface. It does not rename, move, or delete existing Drive files.

## Product Goals

- Let employees request logo assets directly in Slack.
- Support natural language requests and guided follow-up questions.
- Read assets from the company Google Drive brand maintenance folder.
- Build and maintain metadata with AI, not manual spreadsheet entry.
- Support custom dimensions as a first-version feature.
- Preserve logo aspect ratio while outputting exact requested canvas sizes.
- Avoid modifying the existing Drive folder structure in the first version.
- Surface low-confidence catalog items for human review in Taiwan Mandarin.

## Non-Goals For Version 1

- No full asset management admin console.
- No automatic Drive file renaming or folder restructuring.
- No destructive Drive operations.
- No company-wide Drive search.
- No support for every historical campaign or archived asset as a normal logo.
- No forced distortion, cropping, or stretching of logos.

## Observed Drive Structure

The current Drive structure is irregular but usable for AI-assisted cataloging. Based on the provided Finder screenshots, a representative path looks like:

```text
品牌維護 / Logos原始檔 / The News Lens 關鍵評論網 / SVG
品牌維護 / Logos原始檔 / The News Lens 關鍵評論網 / PNG
```

The brand folder may contain:

- `PNG` and `SVG` folders for commonly used assets.
- `.ai` Illustrator files in the brand root.
- Archive folders such as `封存` or `@封存`.
- Campaign or historical folders such as `十週年CI`.
- Brand folders with mixed English and Chinese names.

Example SVG names:

- `logo-blue.svg`
- `logo-en-blue.svg`
- `logo-en-white.svg`
- `mark-blk.svg`
- `mark-white.svg`

Example PNG names:

- `tnl-primary.png`
- `tnl-primary-b.png`
- `tnl-en-primary.png`
- `tnl-mark-w.png`
- `tnl-pfp-jp.png`
- `tnl-plus.png`

The production bot should use the Google Drive API and Drive file ids, not local Google Drive sync paths.

## Recommended Approach

Use a Slack bot backed by an AI-generated asset catalog.

```text
Google Drive
  -> Drive Scanner
  -> AI Metadata Builder
  -> Catalog Store
  -> Slack Bot
  -> User
```

This separates offline catalog understanding from real-time Slack responses. The AI can handle inconsistent naming during catalog generation, while the Slack bot uses structured catalog records for fast and predictable retrieval.

## System Components

### Drive Scanner

The scanner reads the configured Google Drive root folder and produces an inventory of files and folders. It records:

- Drive file id
- name
- extension
- MIME type
- parent folder path
- modified time
- file size
- known folder semantics

The scanner is read-only in version 1.

It initially supports:

- SVG
- PNG
- AI

Other file types are ignored or marked unsupported.

### File Metadata Extractor

The extractor reads deterministic file facts:

- SVG `viewBox`, `width`, and `height`
- PNG width and height
- file extension and MIME type

AI must not guess dimensions. Aspect ratio and intrinsic dimensions must come from the file itself.

### AI Metadata Builder

The AI Metadata Builder converts file paths and names into structured catalog fields. It uses folder names, file names, extensions, and extracted dimensions to infer:

- brand
- brand aliases
- asset type
- variant
- language
- format
- color
- background
- layout
- usage
- status
- confidence
- review status
- reason for review when needed

AI output must be structured, validated, and stored with confidence and inference source fields.

### Catalog Store

Use SQLite for the MVP, with a migration path to Postgres later. SQLite is sufficient for early local development and production pilots, while still supporting relational queries, scanner runs, manual overrides, and review states.

The first production pilot should use SQLite unless deployment constraints require a hosted database. The schema should avoid SQLite-specific assumptions so Postgres migration remains straightforward.

The catalog should store:

- brands
- assets
- scanner runs
- manual overrides
- generated output cache records

### Slack Bot

The Slack bot handles user interaction. It queries the catalog rather than directly guessing from Drive.

Supported entry points:

- Direct message to the bot
- Slash command or Slack shortcut, such as `/logo`
- Guided follow-up after ambiguous natural language requests

The bot should use progressive guided conversation:

```text
User starts with free text
  -> Bot extracts known fields
  -> Bot asks only the next necessary question
  -> Bot uses buttons for small option sets
  -> Bot opens a modal only when options are too many or complex
  -> Bot returns the selected original file or generated custom output
```

The bot should not ask for information the user already provided.

## User Experience

### Natural Language First

Users can write requests such as:

```text
我要 TNL 藍色 SVG
給我關鍵評論網透明 PNG，500x500
The News Lens 英文版白色 logo，1200x630
```

The bot extracts as much as possible, then asks only for missing required information.

### Guided Questions

If a request is incomplete, the bot asks one question at a time.

Example:

```text
User: 我要關鍵評論網 logo
Bot: 你想要哪種格式？
[PNG] [SVG] [AI 原始檔] [不確定]
```

Then:

```text
Bot: 要哪個版本？
[主色] [黑色] [白色]
```

Then:

```text
Bot: 需要指定尺寸嗎？
[原始尺寸] [500x500] [1200x630] [自訂尺寸]
```

### Disambiguation

If a query maps to multiple brands or assets, the bot asks the user to choose. For example, `TNL` may refer to:

- The News Lens 關鍵評論網
- TNL Mediagene
- TNL Research

The bot must not silently choose among plausible brands when ambiguity affects the output.

### Response Content

Responses should include:

- asset preview when available
- file name
- format
- source variant
- requested output size when custom generated
- download or uploaded file
- source information, such as `來源：logo-blue.svg`

Messages shown to employees should be concise and in Taiwan Mandarin when Chinese is appropriate.

## Metadata Model

### Brand

```json
{
  "id": "the-news-lens",
  "display_name": "The News Lens 關鍵評論網",
  "aliases": ["TNL", "The News Lens", "關鍵評論網"],
  "group": "TNL Mediagene",
  "importance": "primary",
  "drive_folder_id": "...",
  "status": "active"
}
```

### Asset

```json
{
  "id": "the-news-lens-logo-en-blue-svg",
  "brand_id": "the-news-lens",
  "asset_type": "logo",
  "variant": "logo",
  "language": "en",
  "format": "svg",
  "color": "blue",
  "background": "transparent",
  "layout": "horizontal",
  "usage": ["general"],
  "source_drive_file_id": "...",
  "source_path": "The News Lens 關鍵評論網/SVG/logo-en-blue.svg",
  "intrinsic_width": 300,
  "intrinsic_height": 100,
  "can_resize": true,
  "status": "active",
  "confidence": 0.93,
  "review_status": "accepted"
}
```

### Inference Metadata

```json
{
  "confidence": 0.93,
  "inferred_from": ["folder_name", "file_name", "file_extension", "svg_viewbox"],
  "review_reason": null
}
```

## Naming Inference Rules

Initial rules:

- `logo`: full logo, usually with wordmark or text.
- `mark`: brand mark, icon, or compact symbol.
- `en`: English version.
- `blue` or `primary`: primary color.
- `blk` or `b`: black.
- `white` or `w`: white.
- `pfp`: profile picture or social avatar; review if unclear.
- `plus`: possible sub-brand, product line, or special version; review unless configured.
- `封存` or `@封存`: archived by default and excluded from active catalog.
- Campaign folders such as `十週年CI`: not treated as general logo assets unless explicitly allowed.

These rules seed the AI builder, but final catalog records must still include confidence and review state.

## AI Review Workflow

Scanner output is grouped into three report categories:

- `accepted_assets.csv`: assets safe for bot use.
- `needs_review.csv`: assets requiring human confirmation.
- `ignored_assets.csv`: archived, campaign, unsupported, or non-logo assets.

Review-facing text must use Taiwan Mandarin.

For version 1, review reports are generated as CSV files plus a machine-readable JSON export. A full internal review page is deferred until after the scanner has been run on real Drive data and review volume is known.

Example review row:

```text
檔案路徑：The News Lens 關鍵評論網/PNG/tnl-plus.png
AI 判斷品牌：The News Lens 關鍵評論網
AI 判斷 Logo 類型：特殊版本 / 可能是 TNL Plus
AI 判斷顏色：主色
AI 信心分數：0.62
需要確認的原因：檔名中的 plus 可能代表子品牌、產品線或特殊版本，需要確認是否可作為一般 Logo 提供。
建議處理方式：請確認這個檔案應歸類為一般 Logo、TNL Plus 子品牌，或不提供給一般同仁使用。
```

Manual overrides must be stored separately and reapplied after every scan so AI regeneration does not erase human decisions.

## Custom Size Behavior

Custom dimensions are an MVP feature.

### Dimension Rules

- If the user specifies width and height, the output file must exactly match that canvas size.
- The logo content is scaled proportionally to fit within the requested canvas.
- The logo content is centered horizontally and vertically.
- The default canvas background is transparent.
- The bot never stretches, distorts, or crops the logo in version 1.
- If only width or only height is specified, output the natural proportional size without adding extra canvas.

Example:

```text
Requested canvas: 500 x 500
Source logo ratio: 300 x 100
Scaled logo content: 500 x 167
Output image: 500 x 500 transparent PNG
Placement: centered
```

### Source Selection

- Prefer SVG as the source for custom-size rendering.
- If SVG is unavailable, use the largest available PNG as fallback.
- If only AI exists, the bot should say no directly convertible file is available in version 1.

### Output Format

For version 1, custom-size output should prioritize PNG. Custom SVG wrappers may be considered later, but are not required for the MVP.

### Limits

- Reject invalid dimensions such as `0x500`.
- Limit maximum output size, initially `4000 x 4000`.
- Rate-limit repeated conversions.
- Cache generated outputs by source file id, requested size, background, and output format.

### White Logo Preview

If the selected logo is white with transparent background, the bot may show preview against a neutral checker or gray background, while the delivered file remains transparent.

## File Delivery

### Original Assets

Original assets should default to Drive links when no transformation is needed. This preserves the source of truth, avoids unnecessary Slack file duplication, and keeps Illustrator files in Drive.

If Slack users cannot access the linked Drive file because of permission policy, the bot may fall back to Slack upload for PNG and SVG assets. AI files should remain Drive links in version 1.

### Generated Assets

Generated custom-size PNGs should be uploaded to Slack. File names should include brand, variant, color, and dimensions, for example:

```text
the-news-lens-logo-blue-500x500.png
```

The bot should include a short source note:

```text
已產出 500 x 500 PNG，Logo 已等比例置中，來源：logo-blue.svg
```

## Permissions And Safety

- Use a Google service account or Workspace app limited to the configured Drive root folder.
- Do not ask each employee to authorize Drive access individually.
- Restrict Slack usage to the company workspace.
- Log requester, requested asset, generated size, timestamp, and delivery type.
- Do not expose raw AI reasoning to end users.
- Do not expose archived or low-confidence assets unless explicitly approved.
- Keep Drive scanner read-only in version 1.
- Do not use Drive global search as the main retrieval mechanism.

## Deployment Recommendation

Recommended stack:

- Node.js / TypeScript
- Slack Bolt for JavaScript
- Google Drive API
- SQLite for MVP catalog storage
- Postgres as future production upgrade
- Sharp plus an SVG renderer such as resvg or librsvg for image generation
- Structured AI outputs for catalog enrichment and request parsing

The AI provider should support strict structured JSON outputs. Implementation should define explicit JSON schemas for catalog enrichment and Slack request parsing before connecting the model.

## Testing Scope

Test coverage should include:

- Filename inference for `logo-en-blue.svg`, `mark-white.svg`, and `tnl-primary-b.png`.
- Brand alias matching for `TNL`, `關鍵評論網`, and `The News Lens`.
- Ambiguous brand disambiguation.
- Guided conversation state.
- Missing field follow-up questions.
- SVG dimension extraction.
- PNG dimension extraction.
- `500x500` canvas output with centered proportional logo.
- Width-only and height-only resize requests.
- Oversized and invalid dimension rejection.
- White logo preview messaging.
- Archive folder exclusion.
- Campaign folder exclusion.
- Manual override preservation after rescans.
- Low-confidence assets excluded from production catalog.

## Decisions To Confirm Before Implementation

- Final Slack app installation model and scopes.
- Exact Google Drive service account or Workspace app setup.
- Production hosting target for the bot process and SQLite database.
- AI provider choice, as long as it supports strict structured JSON outputs.

## MVP Acceptance Criteria

- Scanner can inventory one configured Drive root folder without modifying it.
- AI builder can generate accepted, review, and ignored catalog entries.
- Review reasons are written in Taiwan Mandarin.
- Slack bot can handle direct natural language requests.
- Slack bot can guide users one question at a time when required fields are missing.
- Slack bot can disambiguate multiple likely brands or variants.
- Bot can return existing SVG or PNG assets.
- Bot can generate a custom-size PNG with exact requested canvas dimensions and centered proportional logo content.
- Archived and low-confidence assets are not returned to general users.
