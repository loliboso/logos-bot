# Rule-First Request Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-request Gemini/AI call in `RequestParser` with local rule-based parsing (brand alias matching + keyword tables + size regex), so the request path makes zero AI calls and responds in milliseconds instead of ~20s.

**Architecture:** Two new pure modules — `BrandMatcher` (word-boundary alias matching against `config/brands.json` ∪ catalog aliases/display_name) and `rule-parser` (color/format/language/asset-type keyword tables + size regex). `RequestParser.parseUserRequest` keeps its signature but becomes synchronous internally, delegating to these. A separate coverage report is generated at scan time. The AI provider layer stays untouched (scan's AiBuilder still uses it).

**Tech Stack:** TypeScript, vitest, better-sqlite3. No new dependencies.

## Global Constraints

- Request path makes **zero AI calls**. `GeminiProvider`/`VertexProvider`/`AnthropicProvider`/`AiProvider`/factory stay in the codebase (scan still uses them) but `RequestParser` must not call any of them.
- Brand matching is **word-boundary based**, NOT raw substring. Confirmed necessary: alias `inside` (INSIDE 硬塞) is a literal substring of `business insider`/`money-insider`/`techinsider`; `tnl` sits inside `tnl mediagene`. Raw `includes()` would wrongly match multiple brands.
- Match is **case-insensitive**.
- Brand match sources: `config/brands.json` aliases ∪ catalog `aliases` ∪ catalog `display_name`, keyed/joined by catalog brand id.
- Colors/formats/languages/sizes are only filled when the keyword actually appears; otherwise stay `null` (existing guided-dialog behavior is unchanged — only the parse mechanism changes).
- `ParsedRequest` interface shape is unchanged (dm-handler, commands, conversation, no-match all consume it as-is).
- Real catalog vocabulary (accepted assets): colors `black blue dark gradient gray green green-blue primary white`; formats `ai png svg`; languages `en ja zh`; asset_types `icon logo mark special`.

---

## File Structure

- **Create** `src/bot/brand-matcher.ts` — `BrandMatcher` class: loads brand id → alias-set map, exposes `match(text): string[]` returning matched catalog brand ids (0/1/many), word-boundary + case-insensitive.
- **Create** `src/bot/rule-parser.ts` — pure functions extracting color/format/language/asset_type (keyword tables) and width/height (regex) from free text.
- **Modify** `src/bot/request-parser.ts` — `RequestParser` takes a `BrandMatcher` instead of `AiProvider`; `parseUserRequest` becomes rule-based. Keep `ParsedRequest` and method name; brand becomes the single matched id (or null), plus a new `brandCandidates: string[]` for the many-match case.
- **Modify** `src/index.ts` & `src/bot/commands.ts` & `src/bot/dm-handler.ts` — construct/consume the new `RequestParser`; feed matched brand ids straight into the flow instead of `findBrandByAlias`.
- **Create** `src/catalog/coverage-report.ts` — generates `data/reports/brand_coverage.md` from the DB + `config/brands.json`.
- **Modify** `src/scanner/run-scan.ts` — call coverage report generation after `exportReviewReports`.
- **Create** `config/brands-config.ts` — tiny loader: reads & parses `config/brands.json` into a typed map (single place, testable).

---

### Task 1: Brand config loader

**Files:**
- Create: `src/config/brands-config.ts`
- Test: `tests/config/brands-config.test.ts`

**Interfaces:**
- Consumes: `config/brands.json` (shape `{ [brandId]: { aliases: string[], notes: string } }`)
- Produces: `loadBrandConfig(path?: string): Record<string, { aliases: string[]; notes: string }>` — defaults to `config/brands.json` resolved from repo root.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, test, expect } from "vitest";
import { loadBrandConfig } from "../../src/config/brands-config";

describe("loadBrandConfig", () => {
  test("loads the real brands.json keyed by brand id with alias arrays", () => {
    const cfg = loadBrandConfig();
    expect(cfg["the-news-lens-關鍵評論網"].aliases).toContain("關鍵評論網");
    expect(cfg["inside-硬塞"].aliases).toContain("INSIDE");
    expect(Object.keys(cfg).length).toBeGreaterThanOrEqual(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/brands-config.test.ts`
Expected: FAIL — "Cannot find module '../../src/config/brands-config'".

- [ ] **Step 3: Write minimal implementation**

```typescript
import { readFileSync } from "fs";
import { join } from "path";

export interface BrandConfigEntry {
  aliases: string[];
  notes: string;
}

export function loadBrandConfig(
  path: string = join(process.cwd(), "config", "brands.json")
): Record<string, BrandConfigEntry> {
  return JSON.parse(readFileSync(path, "utf-8"));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config/brands-config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/brands-config.ts tests/config/brands-config.test.ts
git commit -m "feat: brand config loader for rule-first parser"
```

---

### Task 2: BrandMatcher (word-boundary alias matching)

**Files:**
- Create: `src/bot/brand-matcher.ts`
- Test: `tests/bot/brand-matcher.test.ts`

**Interfaces:**
- Consumes: `loadBrandConfig` (Task 1); catalog brands via an injected list `{ id: string; display_name: string; aliases: string[] }[]` (so the matcher is testable without a DB — the caller passes `repo`-loaded brands).
- Produces:
  - `class BrandMatcher { constructor(brands: BrandSource[], config: Record<string, BrandConfigEntry>); match(text: string): string[]; }`
  - `interface BrandSource { id: string; display_name: string; aliases: string[]; }`
  - `match` returns an array of matched catalog brand ids (deduped), possibly empty or multiple.

Word-boundary rule: an alias matches if it appears in the text delimited by start/end or non-alphanumeric characters. For CJK aliases (no spaces), fall back to substring containment since Chinese has no word delimiters — but only when the alias is length ≥ 2 and contains CJK. ASCII aliases use `\b`-style boundaries built from escaped alias text.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, test, expect } from "vitest";
import { BrandMatcher, BrandSource } from "../../src/bot/brand-matcher";

const brands: BrandSource[] = [
  { id: "inside-硬塞", display_name: "INSIDE 硬塞", aliases: ["INSIDE 硬塞"] },
  { id: "techinsider", display_name: "techinsider", aliases: ["techinsider"] },
  { id: "bi", display_name: "BI", aliases: ["BI"] },
  { id: "the-news-lens-關鍵評論網", display_name: "The News Lens 關鍵評論網", aliases: ["The News Lens 關鍵評論網"] },
  { id: "tnl-mediagene", display_name: "TNL Mediagene", aliases: ["TNL Mediagene"] },
];
const config = {
  "inside-硬塞": { aliases: ["INSIDE", "硬塞"], notes: "" },
  "techinsider": { aliases: ["techinsider", "tech-insider"], notes: "" },
  "bi": { aliases: ["BI", "business insider"], notes: "" },
  "the-news-lens-關鍵評論網": { aliases: ["tnl", "關鍵評論網"], notes: "" },
  "tnl-mediagene": { aliases: ["tnl mediagene", "tnmg"], notes: "" },
};

describe("BrandMatcher", () => {
  test("'INSIDE' matches only 硬塞, not techinsider/business insider", () => {
    const m = new BrandMatcher(brands, config);
    expect(m.match("我要 INSIDE 的 logo")).toEqual(["inside-硬塞"]);
  });

  test("CJK alias matches by containment", () => {
    const m = new BrandMatcher(brands, config);
    expect(m.match("給我關鍵評論網的圖")).toEqual(["the-news-lens-關鍵評論網"]);
  });

  test("no alias present → empty", () => {
    const m = new BrandMatcher(brands, config);
    expect(m.match("隨便給我一個東西")).toEqual([]);
  });

  test("ambiguous 'tnl' matches both news-lens and mediagene", () => {
    const m = new BrandMatcher(brands, config);
    const result = m.match("我要 tnl 的檔案").sort();
    expect(result).toContain("the-news-lens-關鍵評論網");
    expect(result).toContain("tnl-mediagene");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bot/brand-matcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { BrandConfigEntry } from "../config/brands-config";

export interface BrandSource {
  id: string;
  display_name: string;
  aliases: string[];
}

const CJK = /[一-鿿぀-ヿ]/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True if `alias` occurs in `text` at word boundaries (ASCII) or by
 *  containment (CJK, which has no word delimiters). Case-insensitive. */
function aliasMatches(text: string, alias: string): boolean {
  const t = text.toLowerCase();
  const a = alias.toLowerCase().trim();
  if (!a) return false;
  if (CJK.test(a)) return a.length >= 2 && t.includes(a);
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(a)}([^a-z0-9]|$)`, "i");
  return re.test(text);
}

export class BrandMatcher {
  private table: { id: string; aliases: string[] }[];

  constructor(brands: BrandSource[], config: Record<string, BrandConfigEntry>) {
    this.table = brands.map((b) => {
      const configAliases = config[b.id]?.aliases ?? [];
      const aliases = [...new Set([b.display_name, ...b.aliases, ...configAliases])];
      return { id: b.id, aliases };
    });
  }

  match(text: string): string[] {
    const hits = new Set<string>();
    for (const brand of this.table) {
      if (brand.aliases.some((a) => aliasMatches(text, a))) hits.add(brand.id);
    }
    return [...hits];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bot/brand-matcher.test.ts`
Expected: PASS (all 4)

- [ ] **Step 5: Commit**

```bash
git add src/bot/brand-matcher.ts tests/bot/brand-matcher.test.ts
git commit -m "feat: word-boundary BrandMatcher for rule-first parsing"
```

---

### Task 3: rule-parser (color/format/language/asset_type/size)

**Files:**
- Create: `src/bot/rule-parser.ts`
- Test: `tests/bot/rule-parser.test.ts`

**Interfaces:**
- Produces: `parseFields(text: string): { format: string|null; color: string|null; language: string|null; asset_type: string|null; width: number|null; height: number|null; }`

Keyword tables (only these; unknown → null):
- format: `svg|向量` → svg, `png` → png, `ai|原始檔|原檔` → ai
- color: `黑|black|blk` → black, `白|white` → white, `藍|blue|主色|primary` → primary, `灰|gray|grey` → gray, `綠|green` → green
- language: `英文|english|en` → en, `中文|chinese|zh` → zh, `日文|japanese|ja` → ja
- asset_type: `icon|圖示` → icon, `mark|標記|符號` → mark, `logo|標誌` → logo
- size: regex `/(\d{2,5})\s*[x×]\s*(\d{2,5})/i` → width, height

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, test, expect } from "vitest";
import { parseFields } from "../../src/bot/rule-parser";

describe("parseFields", () => {
  test("extracts format, color, size from a mixed sentence", () => {
    const r = parseFields("我要藍色的 svg，500x500");
    expect(r.format).toBe("svg");
    expect(r.color).toBe("primary");
    expect(r.width).toBe(500);
    expect(r.height).toBe(500);
  });

  test("black + png + english", () => {
    const r = parseFields("black png english");
    expect(r.color).toBe("black");
    expect(r.format).toBe("png");
    expect(r.language).toBe("en");
  });

  test("empty when no keywords", () => {
    expect(parseFields("給我 logo")).toEqual({
      format: null, color: null, language: null,
      asset_type: "logo", width: null, height: null,
    });
  });

  test("full-width × size separator", () => {
    const r = parseFields("1200×630");
    expect(r.width).toBe(1200);
    expect(r.height).toBe(630);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bot/rule-parser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
interface Rule { re: RegExp; value: string; }

const FORMAT: Rule[] = [
  { re: /\b(svg)\b|向量/i, value: "svg" },
  { re: /\b(png)\b/i, value: "png" },
  { re: /\b(ai)\b|原始檔|原檔/i, value: "ai" },
];
const COLOR: Rule[] = [
  { re: /\b(black|blk)\b|黑/i, value: "black" },
  { re: /\b(white)\b|白/i, value: "white" },
  { re: /\b(blue|primary)\b|藍|主色/i, value: "primary" },
  { re: /\b(gray|grey)\b|灰/i, value: "gray" },
  { re: /\b(green)\b|綠/i, value: "green" },
];
const LANGUAGE: Rule[] = [
  { re: /\b(english|en)\b|英文/i, value: "en" },
  { re: /\b(chinese|zh)\b|中文/i, value: "zh" },
  { re: /\b(japanese|ja)\b|日文/i, value: "ja" },
];
const ASSET_TYPE: Rule[] = [
  { re: /\b(icon)\b|圖示/i, value: "icon" },
  { re: /\b(mark)\b|標記|符號/i, value: "mark" },
  { re: /\b(logo)\b|標誌/i, value: "logo" },
];

function first(rules: Rule[], text: string): string | null {
  for (const r of rules) if (r.re.test(text)) return r.value;
  return null;
}

export function parseFields(text: string) {
  const size = text.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
  return {
    format: first(FORMAT, text),
    color: first(COLOR, text),
    language: first(LANGUAGE, text),
    asset_type: first(ASSET_TYPE, text),
    width: size ? parseInt(size[1], 10) : null,
    height: size ? parseInt(size[2], 10) : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bot/rule-parser.test.ts`
Expected: PASS (all 4)

- [ ] **Step 5: Commit**

```bash
git add src/bot/rule-parser.ts tests/bot/rule-parser.test.ts
git commit -m "feat: rule-parser keyword tables + size regex"
```

---

### Task 4: Rewire RequestParser to rules (no AI)

**Files:**
- Modify: `src/bot/request-parser.ts` (full rewrite of the class body; keep `ParsedRequest` shape, add `brandCandidates`)
- Test: `tests/bot/request-parser.test.ts` (new)

**Interfaces:**
- Consumes: `BrandMatcher` (Task 2), `parseFields` (Task 3).
- Produces:
  - `interface ParsedRequest { brand: string | null; brandCandidates: string[]; format: string|null; color: string|null; language: string|null; asset_type: string|null; width: number|null; height: number|null; raw_text: string; }`
  - `class RequestParser { constructor(matcher: BrandMatcher); parseUserRequest(text: string): ParsedRequest; }` — **synchronous** (no longer async; callers must drop `await`, handled in Task 5).
  - `brand` = the single matched brand id when exactly one matches, else null. `brandCandidates` = all matched ids (for the disambiguation case).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, test, expect } from "vitest";
import { RequestParser } from "../../src/bot/request-parser";
import { BrandMatcher, BrandSource } from "../../src/bot/brand-matcher";

const brands: BrandSource[] = [
  { id: "inside-硬塞", display_name: "INSIDE 硬塞", aliases: ["INSIDE 硬塞"] },
  { id: "cool3c", display_name: "Cool3c", aliases: ["Cool3c"] },
];
const config = {
  "inside-硬塞": { aliases: ["INSIDE", "硬塞"], notes: "" },
  "cool3c": { aliases: ["Cool3c"], notes: "" },
};

describe("RequestParser (rule-based)", () => {
  test("single brand match populates brand + fields, no candidates ambiguity", () => {
    const p = new RequestParser(new BrandMatcher(brands, config));
    const r = p.parseUserRequest("我要 INSIDE 的黑色 svg");
    expect(r.brand).toBe("inside-硬塞");
    expect(r.brandCandidates).toEqual(["inside-硬塞"]);
    expect(r.color).toBe("black");
    expect(r.format).toBe("svg");
    expect(r.raw_text).toBe("我要 INSIDE 的黑色 svg");
  });

  test("no brand match → brand null, empty candidates", () => {
    const p = new RequestParser(new BrandMatcher(brands, config));
    const r = p.parseUserRequest("隨便給我東西");
    expect(r.brand).toBeNull();
    expect(r.brandCandidates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bot/request-parser.test.ts`
Expected: FAIL — constructor signature mismatch / `brandCandidates` undefined.

- [ ] **Step 3: Write minimal implementation** (full file replace)

```typescript
import { BrandMatcher } from "./brand-matcher";
import { parseFields } from "./rule-parser";

export interface ParsedRequest {
  brand: string | null;
  brandCandidates: string[];
  format: string | null;
  color: string | null;
  language: string | null;
  asset_type: string | null;
  width: number | null;
  height: number | null;
  raw_text: string;
}

/**
 * Parses a logo request entirely with local rules — brand alias matching plus
 * keyword/size extraction. No AI calls (that was the ~20s bottleneck). The AI
 * provider layer remains for the scan-time catalog builder.
 */
export class RequestParser {
  constructor(private matcher: BrandMatcher) {}

  parseUserRequest(text: string): ParsedRequest {
    const candidates = this.matcher.match(text);
    const fields = parseFields(text);
    return {
      brand: candidates.length === 1 ? candidates[0] : null,
      brandCandidates: candidates,
      ...fields,
      raw_text: text,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bot/request-parser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bot/request-parser.ts tests/bot/request-parser.test.ts
git commit -m "feat: RequestParser uses local rules, zero AI calls"
```

---

### Task 5: Wire the new parser into dm-handler, commands, index

**Files:**
- Modify: `src/index.ts:25` (construct BrandMatcher + RequestParser)
- Modify: `src/bot/dm-handler.ts:97-101` (drop `await`; use `brandCandidates`)
- Modify: `src/bot/commands.ts:30-34` (same)
- Modify: `src/bot/conversation.ts` — `getNextQuestion` brand block: use `state.parsed.brandCandidates` for disambiguation, and the `!brand && !resolvedBrandId` guard uses `brandCandidates.length === 0`.
- Test: extend `tests/bot/conversation.test.ts` if present, else add a focused case in `tests/bot/request-parser.test.ts`.

**Interfaces:**
- Consumes: `ParsedRequest.brandCandidates` (Task 4). Existing `repo.findBrandByAlias` is replaced at call sites by feeding matched ids directly; `repo.getBrandById(id)` resolves display names for buttons.

- [ ] **Step 1: Write the failing test** (conversation uses candidates)

```typescript
import { describe, test, expect } from "vitest";
import { ConversationManager } from "../../src/bot/conversation";

describe("getNextQuestion brand disambiguation via candidates", () => {
  test("multiple brandCandidates → asks to choose", () => {
    const mgr = new ConversationManager();
    const parsed = {
      brand: null, brandCandidates: ["a", "b"],
      format: null, color: null, language: null, asset_type: null,
      width: null, height: null, raw_text: "tnl",
    };
    const state = mgr.startConversation("u", "c", parsed as any);
    const brands = [
      { id: "a", display_name: "Brand A", aliases: [] },
      { id: "b", display_name: "Brand B", aliases: [] },
    ];
    const q = mgr.getNextQuestion(state, brands as any, []);
    expect(q?.field).toBe("brand_id");
    expect(q?.options?.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bot/conversation.test.ts`
Expected: FAIL — current guard reads `state.parsed.brand` (a string), not `brandCandidates`.

- [ ] **Step 3: Write minimal implementation**

In `src/bot/conversation.ts`, replace the brand guard/disambiguation:

```typescript
    const candidates = state.parsed.brandCandidates ?? [];
    if (candidates.length === 0 && !state.resolvedBrandId) {
      return null; // Cannot proceed without any brand hint
    }

    // Brand disambiguation
    if (!state.resolvedBrandId) {
      if (candidates.length > 1) {
        return {
          text: "找到多個符合的品牌，請選擇：",
          field: "brand_id",
          options: brands.map((b) => ({ label: b.display_name, value: b.id })),
        };
      }
      if (candidates.length === 1) {
        state.resolvedBrandId = candidates[0];
      }
    }
```

In `src/bot/dm-handler.ts` (around line 97-101), replace:

```typescript
      const parsed = parser.parseUserRequest(text);
      const state = conversationManager.startConversation(userId, channelId, parsed);

      const brands = parsed.brandCandidates.map((id) => repo.getBrandById(id)).filter((b): b is NonNullable<typeof b> => b !== null);
      if (parsed.brand) state.resolvedBrandId = parsed.brand;

      const assets = state.resolvedBrandId ? repo.getActiveAssets(state.resolvedBrandId) : [];
      const question = conversationManager.getNextQuestion(state, brands, assets);
```

Apply the identical change in `src/bot/commands.ts` (lines 30-37), using `command.user_id`/`command.channel_id`.

In `src/index.ts` (around line 25), replace parser construction:

```typescript
import { BrandMatcher } from "./bot/brand-matcher";
import { loadBrandConfig } from "./config/brands-config";
// ...
  const brandConfig = loadBrandConfig();
  const allBrands = repo.getAllBrands(); // see Step 3b
  const matcher = new BrandMatcher(allBrands, brandConfig);
  const parser = new RequestParser(matcher);
```

- [ ] **Step 3b: Add `getAllBrands` to CatalogRepo**

In `src/catalog/catalog-repo.ts`, add:

```typescript
  getAllBrands(): BrandRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM brands WHERE status = 'active'`)
      .all() as any[];
    return rows.map(this.toBrandRecord);
  }
```

- [ ] **Step 4: Run tests + build to verify green**

Run: `npx vitest run && npm run build`
Expected: all tests PASS, build clean. Fix any `await parser` leftovers (parser is now sync).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/bot/dm-handler.ts src/bot/commands.ts src/bot/conversation.ts src/catalog/catalog-repo.ts tests/bot/conversation.test.ts
git commit -m "feat: wire rule-first parser through dm-handler, commands, conversation"
```

---

### Task 6: Brand no-match asks for brand (never AI)

**Files:**
- Modify: `src/bot/dm-handler.ts` — when `parsed.brandCandidates.length === 0`, ask the brand directly instead of returning a generic error.
- Test: `tests/bot/dm-handler.test.ts` if present; otherwise a targeted conversation test.

**Interfaces:**
- Consumes: `ParsedRequest.brandCandidates` (Task 4).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, test, expect } from "vitest";
import { ConversationManager } from "../../src/bot/conversation";

describe("zero brand candidates", () => {
  test("getNextQuestion returns null (no brand hint) so handler can ask brand", () => {
    const mgr = new ConversationManager();
    const parsed = {
      brand: null, brandCandidates: [],
      format: "svg", color: null, language: null, asset_type: null,
      width: null, height: null, raw_text: "給我一個 svg",
    };
    const state = mgr.startConversation("u", "c", parsed as any);
    expect(mgr.getNextQuestion(state, [], [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails/passes**

Run: `npx vitest run tests/bot/conversation.test.ts`
Expected: PASS after Task 5's guard change (this locks the behavior in). If it fails, the guard from Task 5 is wrong — fix there.

- [ ] **Step 3: Implement the handler-side brand prompt**

In `src/bot/dm-handler.ts`, after computing `question`, when `question === null` and there is no resolved brand, send a brand-asking message (reuse `buildQuestionMessage` from `response-builder`):

```typescript
      if (!question && !state.resolvedBrandId) {
        conversations.set(userId, state);
        await say("你要哪個品牌的 Logo？請直接輸入品牌名稱（例如 INSIDE、關鍵評論網、TNL Mediagene）。");
        return;
      }
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run && npm run build`
Expected: PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/dm-handler.ts tests/bot/conversation.test.ts
git commit -m "feat: ask for brand on zero matches, never call AI"
```

---

### Task 7: Brand coverage report (machine-generated, read-only)

**Files:**
- Create: `src/catalog/coverage-report.ts`
- Modify: `src/scanner/run-scan.ts` (call after `exportReviewReports`)
- Test: `tests/catalog/coverage-report.test.ts`

**Interfaces:**
- Consumes: a better-sqlite3 `Database`, an output dir, and `loadBrandConfig` (Task 1).
- Produces: `generateCoverageReport(db: Database.Database, outputDir: string, configPath?: string): string` — writes `<outputDir>/brand_coverage.md` and returns the markdown. Only counts `status='active' AND review_status='accepted'` assets.

Report columns per brand: display_name, 別名已設定 (✅ if brand id present in `config/brands.json` with ≥2 aliases, else ❌), formats present, colors present, languages present, accepted count, 缺口提醒 (⚠️ single format, or missing common colors, or ❌ alias).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, test, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtempSync } from "fs";
import { generateCoverageReport } from "../../src/catalog/coverage-report";

function seed(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE brands (id TEXT PRIMARY KEY, display_name TEXT, aliases TEXT, brand_group TEXT, importance TEXT, drive_folder_id TEXT, status TEXT);
           CREATE TABLE assets (id TEXT PRIMARY KEY, brand_id TEXT, asset_type TEXT, variant TEXT, language TEXT, format TEXT, color TEXT, status TEXT, review_status TEXT);`);
  db.prepare(`INSERT INTO brands VALUES ('cool3c','Cool3c','[]',NULL,'primary',NULL,'active')`).run();
  db.prepare(`INSERT INTO assets VALUES ('a1','cool3c','logo','logo','en','png','primary','active','accepted')`).run();
  return db;
}

describe("generateCoverageReport", () => {
  test("writes a markdown table counting only accepted assets", () => {
    const db = seed();
    const dir = mkdtempSync(join(tmpdir(), "cov-"));
    const md = generateCoverageReport(db, dir, join(process.cwd(), "config", "brands.json"));
    expect(md).toContain("Cool3c");
    expect(md).toContain("png");
    const onDisk = readFileSync(join(dir, "brand_coverage.md"), "utf-8");
    expect(onDisk).toBe(md);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/catalog/coverage-report.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import Database from "better-sqlite3";
import { writeFileSync } from "fs";
import { join } from "path";
import { loadBrandConfig } from "../config/brands-config";

const COMMON_COLORS = ["black", "white", "primary"];

export function generateCoverageReport(
  db: Database.Database,
  outputDir: string,
  configPath?: string
): string {
  const config = loadBrandConfig(configPath);
  const brands = db.prepare(`SELECT id, display_name FROM brands WHERE status='active' ORDER BY display_name`).all() as any[];

  const rows: string[] = [
    "# 品牌覆蓋報告",
    "",
    "| 品牌 | 別名已設定 | 格式 | 顏色 | 語言 | accepted 數 | 缺口提醒 |",
    "|------|:--------:|------|------|------|:---------:|---------|",
  ];

  for (const b of brands) {
    const assets = db.prepare(
      `SELECT format, color, language FROM assets WHERE brand_id=? AND status='active' AND review_status='accepted'`
    ).all(b.id) as any[];
    const formats = [...new Set(assets.map((a) => a.format))].sort();
    const colors = [...new Set(assets.map((a) => a.color).filter(Boolean))].sort();
    const langs = [...new Set(assets.map((a) => a.language).filter(Boolean))].sort();

    const aliasCount = config[b.id]?.aliases?.length ?? 0;
    const aliasSet = aliasCount >= 2 ? "✅" : "❌";

    const gaps: string[] = [];
    if (aliasCount < 2) gaps.push("未設定別名");
    if (formats.length === 1) gaps.push(`只有 ${formats[0].toUpperCase()}`);
    const missing = COMMON_COLORS.filter((c) => !colors.includes(c));
    if (colors.length && missing.length) gaps.push(`缺${missing.join("/")}`);

    rows.push(
      `| ${b.display_name} | ${aliasSet} | ${formats.join(", ") || "—"} | ${colors.join(", ") || "—"} | ${langs.join(", ") || "—"} | ${assets.length} | ${gaps.length ? "⚠️ " + gaps.join("；") : "—"} |`
    );
  }

  const md = rows.join("\n") + "\n";
  writeFileSync(join(outputDir, "brand_coverage.md"), md);
  return md;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/catalog/coverage-report.test.ts`
Expected: PASS

- [ ] **Step 5: Wire into scan + commit**

In `src/scanner/run-scan.ts`, after `exportReviewReports(db, outputDir);` add:

```typescript
  generateCoverageReport(db, outputDir);
```

and import it at the top: `import { generateCoverageReport } from "../catalog/coverage-report";`

```bash
git add src/catalog/coverage-report.ts src/scanner/run-scan.ts tests/catalog/coverage-report.test.ts
git commit -m "feat: machine-generated brand coverage report at scan time"
```

---

### Task 8: Full-suite verification + cleanup

**Files:** none (verification task)

- [ ] **Step 1: Run the whole suite + build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS, build clean, no `await parser.parseUserRequest` leftovers.

- [ ] **Step 2: Grep for stray AI usage on the request path**

Run: `grep -rn "generateStructured\|aiProvider\|AiProvider" src/bot/`
Expected: no matches in `request-parser.ts`, `dm-handler.ts`, `commands.ts` (matches only in scan-side files are fine — none should be under src/bot/).

- [ ] **Step 3: Manual smoke via the verify skill**

Drive the DM flow with a representative request (e.g. "我要 INSIDE 的黑色 svg") using the `verify` skill / a scripted harness, confirming zero AI calls and a sub-second response. Record the observation.

- [ ] **Step 4: Commit any cleanup**

```bash
git add -A && git commit -m "chore: rule-first parser verification cleanup"
```

---

## Self-Review

**Spec coverage:**
- §1 brands.json — DONE before this plan (all 40 brands enriched). Loaded by Task 1.
- §2 rule parse flow (brand/color/format/size, 0 AI) — Tasks 2, 3, 4, 5.
- §2 brand 1 match → lock; many → disambiguate; 0 → ask brand — Tasks 5, 6.
- §2 word-boundary matching (memory constraint) — Task 2.
- §3 coverage report (accepted-only, alias column, gap hints, read-only, overwrite each scan) — Task 7.
- §4 modules independently testable, providers retained — every module is pure/injectable; no provider deleted.

**Placeholder scan:** No TBD/TODO; every code step has full code.

**Type consistency:** `ParsedRequest` gains `brandCandidates: string[]` in Task 4 and is consumed with that exact name in Tasks 5–6. `BrandMatcher.match(): string[]`, `parseFields()` return shape, `generateCoverageReport()` signature all consistent across references. `BrandSource` matches `BrandRecord`'s `{id, display_name, aliases}` subset (repo returns `BrandRecord[]`, assignable).

**Note on `getNextQuestion` options:** in the many-candidates case, the handler passes `brands` = candidates resolved via `getBrandById`, so the button options come from those records (Task 5 Step 3).
