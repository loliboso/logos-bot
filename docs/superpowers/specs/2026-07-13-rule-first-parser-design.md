# Rule-First 請求解析 + 品牌設定檔 + 覆蓋報告 設計

> 狀態：設計已與使用者逐段確認通過（2026-07-13）。下一步是 writing-plans 產出實作計畫，尚未開始寫程式。

## 背景與動機

目前每則 Slack 請求都會呼叫 Gemini 解析自然語言（`src/bot/request-parser.ts`），實測「我要 TNL Mediagene 的 logo」這類請求端到端要等 **20 幾秒**，AI 呼叫是主要瓶頸。

本專案的請求領域其實是**封閉、小型、結構化**的：品牌固定 23 個、顏色/格式是固定詞彙、尺寸是 `500x500` 這種 regex。這種領域用「本地規則 + 缺欄位就用既有按鈕反問」幾乎能覆蓋所有情況，每一步都是秒級，不需要 AI 猜。

**目標**：把「解析整句」從「打 Gemini」換成「本地規則」，請求路徑全程 0 次 AI 呼叫。同時給使用者一張人類可維護的品牌總表（別名 + 缺口）。

## 已確認的核心決策

1. **品牌別名來源 = 手動維護設定檔**（不靠現有薄弱的 catalog aliases，也不重跑 AI 生成）。現有 catalog 裡 23 個品牌的 `aliases` 幾乎只有自己的全名，不足以支撐規則比對，所以別名表是這個優化的關鍵素材。
2. **「單一表格」拆成兩份**：人編的品牌設定檔（真相來源）＋ 機器產的覆蓋報告（唯讀）。尊重「人編 vs 機器衍生」界線，與專案既有 `override-repo` 哲學一致，維護點單一。
3. **顏色/格式關鍵字寫死在程式碼**（跨品牌通用、極少變動），設定檔只放品牌別名 + 命名規範備忘。尺寸用 regex。
4. **缺欄位 = 用既有引導對話「反問使用者」**（按鈕），不是程式內部再猜。
5. **品牌規則比不中 → 直接按鈕反問品牌，完全不 call Gemini**。請求解析路徑徹底拿掉 AI。
6. **Gemini/Vertex/Anthropic provider 實作全部保留**：scan 的 AI builder 仍在用，且未來新功能可能需要。只是「請求解析」這條路不再用 AI。
7. **實作結構採「獨立模組」**：rule-parser、brand-matcher、coverage-report 各自單一職責、可獨立測試。

## §1 品牌別名設定檔（人維護的真相來源）

**檔案**：`config/brands.json`，以 **catalog 的 brand id** 為 key（才能 join 回目錄）：

```json
{
  "the-news-lens": {
    "aliases": ["TNL", "The News Lens", "關鍵評論網", "thenewslens"],
    "notes": "命名規範備忘：SVG 用 logo-*, PNG 用 tnl-*"
  },
  "cool3c": {
    "aliases": ["Cool3c", "Cool3C", "cool3c", "酷三C"],
    "notes": ""
  }
}
```

- `aliases`：品牌各種俗稱/大小寫變體，rule-parser 拿來比對使用者文字。
- `notes`：命名規範備忘，純給人看，程式不解讀。
- `npm run scan` 若偵測到設定檔缺某些 catalog 品牌，會在覆蓋報告列出「尚未設定別名的品牌」提醒補，但**不自動改設定檔**（尊重人編）。
- 初版由工具依 catalog 現有 23 品牌產骨架（brand id + display_name 當第一個 alias），使用者再手動補俗稱。

## §2 規則解析流程（三步，全程無 AI）

一則新請求進 `app.message`：

```
使用者文字
  │
  ├─ rule-parser 掃整句：
  │    • 品牌：BrandMatcher 用別名表比對 → 命中的 brand id（可能 0/1/多個）
  │    • 顏色：關鍵字表（黑/black/blk→black、白/white/w→white、藍/blue/主色/primary→…）
  │    • 格式：關鍵字表（svg/向量→svg、png→png、ai/原始檔→ai）
  │    • 尺寸：regex（500x500 → w/h）
  │
  ├─ 品牌 = 1 個 → 鎖定，交給既有 ConversationManager 補問缺欄位（格式/顏色/尺寸按鈕）
  ├─ 品牌 = 多個 → 既有歧義按鈕「找到多個品牌請選」
  └─ 品牌 = 0 個 → 直接按鈕反問「你要哪個品牌？」（不 call Gemini）
```

**關鍵點**：
- 品牌比對用 `別名表 ∪ catalog 既有 aliases ∪ display_name`，大小寫不敏感、部分包含（`INSIDE` 命中 `INSIDE 硬塞`）。
- 顏色/格式**只在文字真的出現關鍵字時才填**；沒講就留 null，交給既有引導對話問 —— 跟現在行為完全一致，只是「解析」從 Gemini 換成規則。
- 全程 0 次 Gemini。`RequestParser` 仍是那個介面，但內部改呼叫 rule-parser。
- 顏色/格式規則已抓到的，反問品牌時保留（不重問）。
- 最小侵入：只換「解析整句」這一步，引導對話、delivery、no-match 全不動。

## §3 品牌覆蓋報告（機器產、唯讀）

`npm run scan` 跑完既有流程後，額外產出 `data/reports/brand_coverage.md`：

```markdown
# 品牌覆蓋報告（2026-07-13 掃描）

| 品牌 | 別名已設定 | 格式 | 顏色 | 語言 | accepted 數 | 缺口提醒 |
|------|:--------:|------|------|------|:---------:|---------|
| The News Lens 關鍵評論網 | ✅ | svg, png, ai | blue, white | en, zh | 12 | — |
| INSIDE 硬塞 | ❌ | png | primary | en | 1 | ⚠️ 只有 PNG，缺 SVG/AI；未設定別名 |
| Cool3c | ✅ | svg, png, ai | primary, white | — | 6 | ⚠️ 缺黑色版 |
```

- **只統計 accepted 資產**（bot 實際會給的），缺口要看的是「同事拿得到什麼」。
- **「別名已設定」欄**：對照 `config/brands.json`，沒設標 ❌ 並在缺口提醒列出 —— 提醒補別名的機制。
- **缺口提醒**：規則產生（只有一種格式、缺常見顏色等），給手動補素材的依據。
- 唯讀，每次 scan 覆寫，永遠反映最新 Drive 狀態。

## §4 測試與檔案異動

**新增**
- `src/bot/brand-matcher.ts` + 測試（別名比對：0/1/多命中、大小寫、部分包含、中英混）
- `src/bot/rule-parser.ts` + 測試（顏色/格式/尺寸關鍵字、組合句、空句）
- `config/brands.json`（先放 23 品牌初版別名骨架，工具產、使用者補）
- `src/catalog/coverage-report.ts` + 測試（表格產生、缺口偵測、別名對照）

**修改**
- `src/bot/request-parser.ts`：內部改用 rule-parser + brand-matcher，拿掉 AI 呼叫（介面不變，dm-handler/commands 不用大改）
- `src/scan.ts`：掃描後多產覆蓋報告
- `src/bot/dm-handler.ts`：品牌 0 命中時走「反問品牌」（目前是回錯誤訊息）

**保留不動**
- `GeminiProvider` / `VertexProvider` / `AnthropicProvider` / `AiProvider` / `factory` —— scan 的 AI builder 仍用，未來備用。
- `ConversationManager`、`delivery`、`no-match`、`asset-resolver`。

**測試策略**：rule-parser、brand-matcher 是純函式，用真實 23 品牌別名做 table-driven 測試；覆蓋報告用 in-memory DB。全部離線、不需 Slack/網路。

## 待辦（下個 session 從這裡繼續）

1. **使用者複審本 spec**（brainstorming 流程的 review gate）。
2. 通過後 → invoke `writing-plans` 產出實作計畫。
3. 依計畫實作 §1–§4，跑測試 + verify。
4. 實作後：使用者手動補齊 `config/brands.json` 的別名，重跑 scan 檢視覆蓋報告。

## 補充：本 session 已完成、與本設計相關的近期改動

- `24db04f` no-match 訊息列出品牌可選顏色 + 按鈕
- `64f67e3` 修 `npm start`：build 複製 schema.sql 到 dist
- `0f2f900` 原始檔改成上傳檔案 bytes（同事無 Drive 權限）
- `8546411` DM 加「處理中…」通知（遮住 20s 等待；本設計要治本縮短它）
- `.env`：金鑰路徑改相對 `./slack-...json`（專案從 Documents 搬到 Desktop 後修正）
- 已知：Slack slash 指令是 `/logos`（非 `/logo`）
