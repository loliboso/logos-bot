# PNG Resize + Background Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users request a custom size for PNG (and all) logo assets, routing through SVG when available for lossless quality, and choose a background (transparent/white/black) when a custom size is picked.

**Architecture:** Extend `ParsedRequest` with a `background` field. Widen the conversation's size gate from "SVG-only" to "any renderable source (svg|png)". Add a background question that only fires after a custom size is chosen. Thread the chosen background through `ResolvedAsset` into `renderCustomSize`, whose canvas-fill already supports arbitrary colors (currently hardcoded gray). The renderer and asset-resolver's source-preference logic are already correct and need minimal change.

**Tech Stack:** TypeScript, vitest, sharp, @resvg/resvg-js. No new dependencies.

## Global Constraints

- No new dependencies.
- Background options are exactly `transparent | white | black` (values `transparent`/`white`/`black`).
- Background is asked ONLY when a custom size is chosen (width/height both non-null). "Original size" (width/height null) never asks background.
- PNG custom-size prefers an SVG source of the same brand+filters when one exists (lossless); falls back to the largest PNG. This is existing `selectBestSource` behavior — preserve it.
- `.ai` sources cannot be rendered; custom-size selection must prefer svg/png and only fall back to `.ai` (original delivery) when no renderable source exists.
- Fields fill from rules only when a keyword appears, else null (existing convention).
- Existing guided-dialog behavior otherwise preserved.

---

## File Structure

- **Modify** `src/bot/request-parser.ts` — add `background: "transparent"|"white"|"black"|null` to `ParsedRequest`; populate from rule-parser.
- **Modify** `src/bot/rule-parser.ts` — add background keyword table to `parseFields`.
- **Modify** `src/bot/conversation.ts` — add `backgroundResolved` to `ConversationState`; widen size gate; add background question; handle `background` in `applyAnswer`.
- **Modify** `src/bot/asset-resolver.ts` — add `background` to `ResolvedAsset`, populated from `state.parsed.background`; confirm `.ai` avoidance on custom size.
- **Modify** `src/bot/delivery.ts` — pass `result.background` to `renderCustomSize`; suppress white-logo warning when a non-transparent background was chosen.
- **Modify** `src/renderer/renderer.ts` — fill canvas with the requested color (white/black) instead of hardcoded gray.

---

### Task 1: Add `background` to ParsedRequest + rule-parser keywords

**Files:**
- Modify: `src/bot/request-parser.ts` (ParsedRequest interface + spread already carries new fields via `...fields`)
- Modify: `src/bot/rule-parser.ts` (add BACKGROUND table + return it)
- Test: `tests/bot/rule-parser.test.ts` (add cases)

**Interfaces:**
- Produces: `parseFields(text)` return object gains `background: "transparent"|"white"|"black"|null`.
- `ParsedRequest` gains `background: "transparent"|"white"|"black"|null`.

- [ ] **Step 1: Write the failing test** (append to existing `tests/bot/rule-parser.test.ts`)

```typescript
  test("extracts background keywords", () => {
    expect(parseFields("白底").background).toBe("white");
    expect(parseFields("black bg").background).toBe("black");
    expect(parseFields("透明背景").background).toBe("transparent");
  });

  test("background is null when no keyword", () => {
    expect(parseFields("我要 logo").background).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bot/rule-parser.test.ts`
Expected: FAIL — `background` is undefined on the return object.

- [ ] **Step 3: Implement** — in `src/bot/rule-parser.ts` add the table and include it in the return:

```typescript
const BACKGROUND: Rule[] = [
  { re: /白底|white\s?bg|white background/i, value: "white" },
  { re: /黑底|black\s?bg|black background/i, value: "black" },
  { re: /透明|transparent/i, value: "transparent" },
];
```

Then in `parseFields`'s returned object add:
```typescript
    background: first(BACKGROUND, text) as "transparent" | "white" | "black" | null,
```

In `src/bot/request-parser.ts`, add to the `ParsedRequest` interface (after `height`):
```typescript
  background: "transparent" | "white" | "black" | null;
```
(No change to `parseUserRequest` body needed — it already spreads `...fields`, which now includes `background`.)

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run tests/bot/rule-parser.test.ts && npm run build`
Expected: PASS; build clean (ParsedRequest consumers still compile because `background` is added everywhere it's constructed — verify test fixtures that build a ParsedRequest literal; if any fail to compile, add `background: null` to them).

- [ ] **Step 5: Commit**

```bash
git add src/bot/request-parser.ts src/bot/rule-parser.ts tests/bot/rule-parser.test.ts
git commit -m "feat: parse background keyword + add background to ParsedRequest"
```

---

### Task 2: Widen the size gate to all renderable formats

**Files:**
- Modify: `src/bot/conversation.ts` (the size-selection block, currently gated on `can_resize`)
- Test: `tests/bot/conversation.test.ts`

**Interfaces:**
- Consumes: `AssetRecord.format`. No new exported symbols.

- [ ] **Step 1: Write the failing test** (append to `tests/bot/conversation.test.ts`)

```typescript
  test("asks size for a PNG-only brand (not just SVG)", () => {
    const mgr = new ConversationManager();
    const parsed = {
      brand: "b", brandCandidates: ["b"], format: "png", color: "black",
      language: null, asset_type: null, width: null, height: null,
      background: null, raw_text: "b png",
    };
    const state = mgr.startConversation("u", "c", parsed as any);
    state.resolvedBrandId = "b";
    const assets = [
      { format: "png", color: "black", can_resize: false } as any,
    ];
    const q = mgr.getNextQuestion(state, [], assets);
    expect(q?.field).toBe("size");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bot/conversation.test.ts`
Expected: FAIL — current gate counts `a.can_resize` (false for PNG), so no size question is returned.

- [ ] **Step 3: Implement** — in `src/bot/conversation.ts`, replace the size-gate line:

Change:
```typescript
      const resizableCount = assets.filter((a) => a.can_resize).length;
      if (resizableCount > 0) {
```
to:
```typescript
      // Any raster/vector source can be rendered to a custom size (renderer
      // handles both svg and png). .ai cannot be rendered, so it doesn't count.
      const renderableCount = assets.filter(
        (a) => a.format === "svg" || a.format === "png"
      ).length;
      if (renderableCount > 0) {
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run tests/bot/conversation.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/conversation.ts tests/bot/conversation.test.ts
git commit -m "feat: offer custom size for PNG sources, not just SVG"
```

---

### Task 3: Background question (only after custom size chosen)

**Files:**
- Modify: `src/bot/conversation.ts` (add `backgroundResolved` to state + start; add background question after size; handle `background` in `applyAnswer`)
- Test: `tests/bot/conversation.test.ts`

**Interfaces:**
- `ConversationState` gains `backgroundResolved: boolean` (initialized `false` in `startConversation`).
- New `Question` with `field: "background"`, options transparent/white/black.

- [ ] **Step 1: Write the failing tests** (append to `tests/bot/conversation.test.ts`)

```typescript
  function baseParsed(over: any = {}) {
    return {
      brand: "b", brandCandidates: ["b"], format: "png", color: "black",
      language: null, asset_type: null, width: null, height: null,
      background: null, raw_text: "x", ...over,
    };
  }

  test("asks background after a custom size is set", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed({ width: 500, height: 500 }) as any);
    state.resolvedBrandId = "b";
    state.sizeResolved = true; // size already answered as custom
    const assets = [{ format: "png", color: "black", can_resize: false } as any];
    const q = mgr.getNextQuestion(state, [], assets);
    expect(q?.field).toBe("background");
    expect(q?.options?.map((o) => o.value)).toEqual(["transparent", "white", "black"]);
  });

  test("does NOT ask background for original size", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed() as any);
    state.resolvedBrandId = "b";
    state.sizeResolved = true; // chose original → width/height stay null
    const assets = [{ format: "png", color: "black", can_resize: false } as any];
    const q = mgr.getNextQuestion(state, [], assets);
    expect(q).toBeNull();
  });

  test("applyAnswer sets background and marks it resolved", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed({ width: 500, height: 500 }) as any);
    const next = mgr.applyAnswer(state, "background", "white");
    expect(next.parsed.background).toBe("white");
    expect(next.backgroundResolved).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/bot/conversation.test.ts`
Expected: FAIL — `backgroundResolved` undefined; no background question; `applyAnswer` doesn't handle `background`.

- [ ] **Step 3: Implement** in `src/bot/conversation.ts`:

(a) Add to `ConversationState` interface (after `sizeResolved`):
```typescript
  /** Whether the background question has been answered (custom-size only). */
  backgroundResolved: boolean;
```

(b) In `startConversation`, add `backgroundResolved: false,` next to `sizeResolved: false,`.

(c) In `getNextQuestion`, AFTER the size-selection block and BEFORE `return null;`, add:
```typescript
    // Background is only meaningful once a custom size is chosen — the render
    // canvas is what gets a fill. Original size returns the source untouched.
    const hasCustomSize = state.parsed.width !== null && state.parsed.height !== null;
    if (hasCustomSize && !state.backgroundResolved) {
      return {
        text: "要什麼底色？",
        field: "background",
        options: [
          { label: "透明", value: "transparent" },
          { label: "白底", value: "white" },
          { label: "黑底", value: "black" },
        ],
      };
    }
```

(d) In `applyAnswer`'s switch, add a case:
```typescript
      case "background":
        next.parsed.background = value as "transparent" | "white" | "black";
        next.backgroundResolved = true;
        break;
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run tests/bot/conversation.test.ts && npm run build`
Expected: PASS; build clean. If the custom-size input path (`applyCustomSizeInput`) needs `backgroundResolved` to remain false so the question fires after custom entry, confirm it doesn't set it — it shouldn't.

- [ ] **Step 5: Commit**

```bash
git add src/bot/conversation.ts tests/bot/conversation.test.ts
git commit -m "feat: ask background (transparent/white/black) after custom size"
```

---

### Task 4: Thread background through ResolvedAsset

**Files:**
- Modify: `src/bot/asset-resolver.ts` (add `background` to `ResolvedAsset`, set from `state.parsed.background`)
- Test: `tests/bot/asset-resolver.test.ts`

**Interfaces:**
- `ResolvedAsset` gains `background: "transparent" | "white" | "black" | null`.
- Consumes: `state.parsed.background` (Task 1).

- [ ] **Step 1: Write the failing test** (append to `tests/bot/asset-resolver.test.ts`)

```typescript
  test("carries the chosen background into ResolvedAsset", () => {
    const repo = makeRepo([
      { id: "a1", brand_id: "b", format: "png", color: "black", can_resize: false, intrinsic_width: 800 } as any,
    ]);
    const resolver = new AssetResolver(repo);
    const state = {
      resolvedBrandId: "b",
      parsed: { format: "png", color: "black", language: null, asset_type: null, width: 500, height: 500, background: "white" },
    } as any;
    const result = resolver.resolve(state);
    expect(result?.background).toBe("white");
  });
```

(If `tests/bot/asset-resolver.test.ts` has no `makeRepo` helper, mirror the existing repo-stub pattern used in that file; the key assertion is `result.background === "white"`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bot/asset-resolver.test.ts`
Expected: FAIL — `ResolvedAsset` has no `background`.

- [ ] **Step 3: Implement** in `src/bot/asset-resolver.ts`:

Add to `ResolvedAsset` interface:
```typescript
  background: "transparent" | "white" | "black" | null;
```
In `resolve`, add to the returned object:
```typescript
      background: state.parsed.background,
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run tests/bot/asset-resolver.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/asset-resolver.ts tests/bot/asset-resolver.test.ts
git commit -m "feat: carry chosen background through ResolvedAsset"
```

---

### Task 5: Renderer fills canvas with chosen color

**Files:**
- Modify: `src/renderer/renderer.ts` (replace hardcoded gray fill with white/black by request)
- Test: `tests/renderer/renderer.test.ts` (or the existing renderer test file — check `tests/renderer/`)

**Interfaces:**
- `RenderRequest.background` is already `"transparent" | string`. Interpret `"white"` → white, `"black"` → black, `"transparent"` → transparent alpha 0. Any other string keeps current behavior (treat as opaque gray fallback is removed; unknown non-transparent → white to be safe).

- [ ] **Step 1: Write the failing test** (append to the renderer test file)

```typescript
  test("fills the canvas white when background is white", async () => {
    // 1x1 transparent PNG source, render to 4x4 with white bg → corner pixel opaque white
    const src = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const out = await renderCustomSize({ source: src, sourceFormat: "png", width: 4, height: 4, background: "white" });
    const { data } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2], data[3]]).toEqual([255, 255, 255, 255]);
  });

  test("fills the canvas black when background is black", async () => {
    const src = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const out = await renderCustomSize({ source: src, sourceFormat: "png", width: 4, height: 4, background: "black" });
    const { data } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2], data[3]]).toEqual([0, 0, 0, 255]);
  });
```

(Add `import sharp from "sharp";` to the test file if not present.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderer/renderer.test.ts`
Expected: FAIL — current code fills gray `128,128,128`, so pixels are `[128,128,128,255]`.

- [ ] **Step 3: Implement** in `src/renderer/renderer.ts` — replace the canvas `background` block:

Change:
```typescript
      background: isTransparent
        ? { r: 0, g: 0, b: 0, alpha: 0 }
        : { r: 128, g: 128, b: 128, alpha: 1 },
```
to:
```typescript
      background: isTransparent
        ? { r: 0, g: 0, b: 0, alpha: 0 }
        : background === "black"
        ? { r: 0, g: 0, b: 0, alpha: 1 }
        : { r: 255, g: 255, b: 255, alpha: 1 },
```
(`isTransparent` is already `background === "transparent"`. Non-transparent, non-black → white.)

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run tests/renderer/renderer.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/renderer.ts tests/renderer/renderer.test.ts
git commit -m "feat: renderer fills canvas with chosen white/black background"
```

---

### Task 6: Delivery passes chosen background + suppresses white-logo warning

**Files:**
- Modify: `src/bot/delivery.ts` (pass `result.background` to `renderCustomSize`; skip white-logo warning when a non-transparent background was chosen)
- Test: `tests/bot/delivery.test.ts` (check the existing delivery test file for the port-stub pattern)

**Interfaces:**
- Consumes: `ResolvedAsset.background` (Task 4).

- [ ] **Step 1: Write the failing test** (append to `tests/bot/delivery.test.ts`, mirroring its existing stub pattern)

```typescript
  test("renders with the chosen background and skips white-logo warning on black bg", async () => {
    const calls: any = { rendered: null, messages: [] };
    const ports = {
      respond: async (m: any) => { calls.messages.push(m); },
      downloadSource: async () => Buffer.from(""),
      uploadFile: async () => true,
      maxOutputSize: 4000,
    };
    const result = {
      asset: { id: "a1", source_path: "b/x.png", format: "png", color: "white", background: "transparent" },
      needsCustomSize: true, requestedWidth: 500, requestedHeight: 500, background: "black",
    } as any;
    // Spy is optional; the key assertion is no white-logo warning was posted.
    await handleResolvedAsset(result, ports as any);
    const warned = calls.messages.some((m: any) => JSON.stringify(m).includes("白色"));
    expect(warned).toBe(false);
  });
```

(If the real `renderCustomSize` runs during this test and needs a valid source, either provide a tiny valid PNG buffer from `downloadSource` or follow the delivery test file's existing approach for stubbing the render. Keep the assertion focused on the warning suppression.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bot/delivery.test.ts`
Expected: FAIL — current code passes `asset.background` (transparent) so the white-logo warning fires, and ignores `result.background`.

- [ ] **Step 3: Implement** in `src/bot/delivery.ts`:

(a) Change the `renderCustomSize` background argument:
```typescript
    background: result.background && result.background !== "transparent"
      ? result.background
      : "transparent",
```

(b) Change the custom-size white-logo warning guard (the one after upload, ~line 111) to skip when a non-transparent bg was chosen:
```typescript
  if (
    asset.color === "white" &&
    asset.background === "transparent" &&
    (!result.background || result.background === "transparent")
  ) {
    await ports.respond(buildWhiteLogoWarning());
  }
```
(Leave the direct-download branch's warning at line ~77 unchanged — it has no custom background.)

- [ ] **Step 4: Run full suite + build**

Run: `npx vitest run && npm run build`
Expected: all PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/bot/delivery.ts tests/bot/delivery.test.ts
git commit -m "feat: deliver custom-size renders with chosen background"
```

---

### Task 7: Full verification + smoke

**Files:** none (verification task)

- [ ] **Step 1: Full suite + build**

Run: `npx vitest run && npm run build`
Expected: all green, build clean.

- [ ] **Step 2: Confirm the flow end-to-end (no AI on request path still holds)**

Run: `grep -rn "generateStructured\|AiProvider" src/bot/`
Expected: no matches (background parsing is rule-based).

- [ ] **Step 3: Smoke the render path against a real asset**

Use a scripted harness (compile + node, like the parser smoke) or the `verify` skill: resolve a PNG-only brand at 500x500 with `background: "black"`, confirm the output PNG is 500x500 with an opaque black corner pixel. Record the observation.

- [ ] **Step 4: Commit any cleanup**

```bash
git add -A && git commit -m "chore: png-resize-background verification"
```

---

## Self-Review

**Spec coverage:**
- §1① background field + rule keywords — Task 1.
- §1② size gate widened to svg|png — Task 2.
- §1③ background question, custom-size-only, `backgroundResolved` flag, applyAnswer — Task 3.
- §2④ asset-resolver source preference (SVG-first, existing) + carry background — Task 4 (background) ; SVG-first is already implemented and covered by existing tests, no change needed.
- §2⑤ `.ai` avoidance — existing `selectBestSource` prefers svg/png on custom size; Task 4's test brand is PNG-only which exercises the fallback. (If a dedicated `.ai`-with-no-renderable test is wanted it can be added, but current logic already skips `.ai` when svg/png exist.)
- §2⑥ delivery passes background + renderer fill — Tasks 5, 6.
- §3 error handling: validateDimensions reused (unchanged); white-logo warning suppressed on non-transparent bg — Task 6.
- §4 tests — each task is TDD.

**Placeholder scan:** No TBD/TODO; each code step shows the exact change.

**Type consistency:** `background: "transparent"|"white"|"black"|null` is identical across `ParsedRequest` (Task 1), `parseFields` return (Task 1), `ResolvedAsset` (Task 4). `RenderRequest.background` stays `"transparent" | string` (Task 5 interprets it). `backgroundResolved: boolean` defined in Task 3 and set in `applyAnswer` (Task 3).

**Note on existing test fixtures:** Several tests construct `ParsedRequest` literals. Task 1 Step 4 explicitly checks the build and adds `background: null` to any fixture that fails to compile, so the new required field doesn't silently break other suites.
