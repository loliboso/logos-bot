# PNG 指定尺寸 + 底色選擇 設計

> 狀態：設計已與使用者逐段確認通過（2026-07-14）。下一步是 writing-plans 產出實作計畫，尚未開始寫程式。

## 背景與動機

目前指定尺寸（resize）功能有兩個缺口：

1. **PNG 無法指定尺寸**：`src/bot/conversation.ts` 的尺寸關卡只在資產 `can_resize=true` 時才問尺寸，而 scan 時 `can_resize = (format === "svg")`，所以 PNG 一律 false，選 PNG 時根本不會被問尺寸。但實際使用情境（社群大頭照、簡報等）都需要指定尺寸。
2. **底色無法選**：`src/bot/delivery.ts` 的 background 寫死跟著資產屬性走，使用者無從選擇。透明的資產輸出就透明，但社群大頭照常需要補白底或黑底。

底層 `src/renderer/renderer.ts` 的 `renderCustomSize` **已完整支援** svg + png 來源縮放，以及任意底色的畫布填充（開一張指定尺寸畫布、來源等比縮放置中貼上）。缺口在「問答流程」與「參數傳遞」，不在 render 本身。

## 已確認的核心決策

1. **PNG 指定尺寸的來源策略**：同品牌同條件**有 SVG 就用 SVG render**（向量放大不失真），沒有才用 PNG 原檔縮放。此為現有 `asset-resolver.selectBestSource` 邏輯，畫質最佳。
2. **所有格式都能指定尺寸**：拿掉 `can_resize` 的限制，SVG/PNG 都會被問尺寸。
3. **底色問使用者**：選項 `透明 / 白底 / 黑底`。**只在使用者選了自訂尺寸（width/height 非 null）時才問** —— 原始尺寸直接給原檔，沒有畫布可填色。
4. **`.ai` 格式**：PostScript 無法被 resvg/sharp render。選 AI + 指定尺寸時，找同品牌同條件的 svg/png 來 render；完全沒有可 render 來源才退回 `.ai` 原檔並說明「原始檔不支援縮放，這是原檔」。

## §1 資料流改動

### ① `ParsedRequest` 新增 `background` 欄位

型別 `"transparent" | "white" | "black" | null`。

- `rule-parser` 順手支援關鍵字：`白底 / white bg / white background` → `white`、`黑底 / black bg` → `black`、`透明 / transparent` → `transparent`；沒講 → `null`（走問答）。
- 沿用「只在關鍵字出現時才填，否則 null」的既有原則。

### ② 尺寸關卡放寬（`conversation.ts` 現行約 line 117-131）

判斷條件從「有 `can_resize` 資產」改成「有可 render 來源（format 為 svg 或 png）」：

```
const renderableCount = assets.filter((a) => a.format === "svg" || a.format === "png").length;
if (renderableCount > 0) { ...問尺寸... }
```

效果：選 PNG 也會被問「需要指定尺寸嗎」。

### ③ 新增底色問答

- **只在指定尺寸時問**（`state.parsed.width !== null && state.parsed.height !== null` 且尚未問過底色）。
- 選項：`透明 / 白底 / 黑底`（value：`transparent / white / black`）。
- 需要一個 `backgroundResolved: boolean` 狀態旗標，區分「已選透明」（也是 background 有值）與「還沒問」，避免重複問（比照現有 `sizeResolved` 的作法）。

### 問答順序

品牌 → 格式 → 顏色 → 尺寸 →（若指定尺寸）底色 → 交付。

## §2 來源選擇與 render

### ④ asset-resolver（`asset-resolver.ts` 現行 selectBestSource）

現況已是「指定尺寸時優先 SVG、fallback 最大 PNG」，符合決策 1，**幾乎不用改**。確保 ①② 放行後 PNG 來源能進到 render 路徑。

### ⑤ `.ai` 處理

選 AI + 指定尺寸：`selectBestSource` 在 `wantsCustomSize` 時本來就優先挑 svg/png，所以會自動避開 `.ai` 去找可 render 來源。若該品牌同條件**完全沒有** svg/png，則退回 `.ai` 原檔（原檔交付路徑），並在訊息說明「原始檔不支援縮放，這是原檔」。

### ⑥ delivery 傳 background（`delivery.ts` 現行約 line 95-101）

- `renderCustomSize` 的 `background` 參數從寫死的 `asset.background` 改成傳使用者選的 `state.parsed.background`（fallback：null 時視為 `transparent`）。
- renderer 非透明填色：目前 `src/renderer/renderer.ts` 寫死灰色 `{r:128,g:128,b:128}`，改成依值填 `white`（255,255,255,alpha 1）或 `black`（0,0,0,alpha 1）。

**畫質結論**：選 PNG 指定尺寸時，只要同品牌有 SVG，實際輸出走 SVG 向量 render → 放大不失真。

## §3 錯誤處理

- 自訂尺寸驗證：沿用既有 `validateDimensions`（整數、>0、≤ MAX_OUTPUT_SIZE）。
- AI 無可 render 來源 → 退回原檔 + 說明訊息（見 ⑤）。
- 白色 logo + 透明底的既有提醒（`delivery.ts` buildWhiteLogoWarning）保留；但若使用者這次**選了非透明底色（白/黑）**，不觸發該警告 —— 有底色就無辨識問題。

## §4 測試與檔案異動

**修改**
- `src/bot/request-parser.ts`：`ParsedRequest` 加 `background` 欄位。
- `src/bot/rule-parser.ts`：background 關鍵字解析。
- `src/bot/conversation.ts`：尺寸關卡放寬（②）、新增底色問答與 `backgroundResolved` 旗標（③）、`applyAnswer` 處理 `background` field。
- `src/bot/asset-resolver.ts`：確認 PNG/AI 來源選擇正確（大致現成，補測試）。
- `src/bot/delivery.ts`：傳 `state.parsed.background` 給 renderer（⑥）；非透明底色時不觸發白 logo 警告。
- `src/renderer/renderer.ts`：非透明填色依 background 值（white/black），取代寫死灰色。

**測試策略（TDD，全離線）**
- `rule-parser`：background 關鍵字（白底/黑底/透明/無 → 對應值或 null）。
- `conversation`：PNG 資產會被問尺寸；只有指定尺寸才問底色、原始尺寸不問；`backgroundResolved` 不重複問；問答順序。
- `asset-resolver`：PNG+指定尺寸且有 SVG → 選 SVG；無 SVG → 選最大 PNG；AI+指定尺寸 → 選 svg/png，皆無 → 退回 ai。
- `renderer`：background=white/black 時畫布填對應顏色（新增，這條目前無測試）。
- `delivery`：傳遞 background 到 renderer；選白/黑底時不觸發白 logo 警告。

## 待辦（下個步驟）

1. 使用者複審本 spec。
2. 通過後 → invoke `writing-plans` 產出實作計畫。
3. 依計畫 TDD 實作 §1–§4。
4. build + 全套測試 + 實機 smoke 驗證。
