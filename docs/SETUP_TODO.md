# Logo Bot 上線待辦清單

> 本文件列出讓 Logo Bot 能實際運作所需的**外部服務設定**（需要 IT／管理員權限）與**尚未完成的程式功能**。
> 現況（2026-07-10 更新）：**Part B 的四個阻斷性缺口（B1–B4）已全部補完**，另把 AI 呼叫抽成供應商介面（可換 Gemini）。端到端邏輯已就緒，86 個測試通過、TypeScript strict 編譯乾淨。剩下的是 Part A 的外部金鑰設定與實機測試。

---

## Part A — 需要人類／IT 處理的外部設定

這些帳號、權限、金鑰無法由開發端代為申請，需要你或 IT 部門處理。
完成後請把各項值填入專案根目錄的 `.env`（可複製 `.env.example`）。

### 1. Slack App

到 https://api.slack.com/apps → **Create New App**（From scratch），然後：

| 設定項目 | 做什麼 | 對應 .env 變數 |
|---------|--------|---------------|
| Socket Mode | 開啟，並產生 App-Level Token（`xapp-...cf51`） | `SLACK_APP_TOKEN` |
| OAuth & Permissions | 加 Bot Token Scopes（見下），安裝到工作區後取得 `xoxb-...D1eSy6` | `SLACK_BOT_TOKEN` |
| Basic Information | 取得 Signing Secret `be7...91` | `SLACK_SIGNING_SECRET` |
| Slash Commands | 新增一個 `/logo` 指令 | — |
| Event Subscriptions | 訂閱 Bot Event：`message.im` | — |
| Interactivity & Shortcuts | 開啟（按鈕互動才會運作） | — |

**需要的 Bot Token Scopes：**
- `commands`（slash 指令）
- `chat:write`（回覆訊息）
- `im:history`、`im:read`（讀取 DM）
- `app_mentions:read`（被 @ 時回應，選用）
- `files:write`（上傳產出的 PNG，若要回傳檔案則必要）

> **要問 IT 的問題：** 公司是否允許自建 Slack App？是否需要 workspace 管理員核准安裝？是否有既有的 App 管理流程？

### 2. Google 服務帳號（存取 Drive）

到 Google Cloud Console：

1. [x] 建立或選定一個 GCP 專案
2. [x] 啟用 **Google Drive API**
3. [x] 建立 **Service Account**，並下載 JSON 金鑰
4. [x] 把 Logo 原始檔所在的 **Drive 資料夾分享給該 service account 的 email**（唯讀 Viewer 即可）
5. [x] 取得該資料夾的 **Folder ID**（網址列 `folders/` 後面那串）`1Y6avk_W5jRsl5Ab-PWiBvOo_AFGoFEv2`

| 取得的東西 | 對應 .env 變數 |
|-----------|---------------|
| Service Account JSON 金鑰的**檔案路徑**（推薦） | `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` |
| 或：Service Account JSON 金鑰（整包貼上，備用） | `GOOGLE_SERVICE_ACCOUNT_KEY` |
| Drive 根資料夾 ID | `DRIVE_ROOT_FOLDER_ID` |

> **金鑰放法（推薦）**：把 IT 給的 `.json` 放在專案**外**的路徑（例如 `~/logos-bot-secrets/service-account.json`，勿放進 repo），然後在 `.env` 設 `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` 指向它。程式會優先讀檔案路徑，沒有時才退回讀整包 `GOOGLE_SERVICE_ACCOUNT_KEY`。

> **要問 IT 的問題：** Logo 原始檔目前放在哪個 Drive／共用雲端硬碟？是否能分享給 service account？公司對 service account 金鑰的保管有無規範（如需放進 secret manager）？

### 3. AI 供應商金鑰（自然語言理解）

這個 bot 有兩處用 AI 做自然語言理解，是目前設計的核心：

1. **解析使用者的話**（`src/bot/request-parser.ts`）：使用者在 Slack 打「我要 TNL 藍色的 logo，要 SVG」這種自由文字，程式呼叫 AI 拆成結構化欄位（品牌 / 顏色 / 格式 / 尺寸）。這是 bot「聽得懂人話」的關鍵。
2. **建立目錄時推斷檔案含意**（`src/catalog/ai-builder.ts`）：掃描 Drive 時，AI 依檔名與資料夾路徑推斷每個檔案是什麼（例如 `logo-en-white.svg` → 英文版 / 白色 / logo），並給信心分數。

**供應商可自由切換（已抽成介面）。** AI 呼叫已抽成 `src/ai/provider.ts` 的 `AiProvider` 介面，切換只是改 `.env`，不動程式：

| 供應商 | 設定 | 狀態 |
|--------|------|------|
| **Vertex AI Gemini**（目前選定） | `AI_PROVIDER=vertex` + `VERTEX_PROJECT_ID` + 現有 service account（選填 `VERTEX_LOCATION`，預設 `global`） | ✅ 已實作（以 service account OAuth 呼叫 Vertex AI REST） |
| Google AI Studio Gemini（備援） | `AI_PROVIDER=gemini` + `GEMINI_API_KEY` | ✅ 已實作 |
| Anthropic Claude | `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`（sk-ant-...） | ✅ 已實作 |

> **決策脈絡：** 公司是 Google Workspace + GCP，選 Gemini 讓計費與整合統一。（另有一條路：啟動 Claude Code 的環境本身跑在 AWS Bedrock 上，理論上公司 AWS 帳號已有 Claude 存取；但此專案 npm 依賴樹壞掉裝不了 bedrock-sdk，故先走 Gemini。三條路的程式都已備妥，日後可改 `.env` 切換。）

**公司正式環境（目前採用）：** 在 GCP 專案啟用 Vertex AI API、連結 Billing，並對現有 service account 授予 `roles/aiplatform.user`。程式以該 service account 取得短期 OAuth token，不需 Google AI Studio API key。

> **要問 IT 的問題：** 用哪個 GCP 專案／計費帳戶開 Gemini？用量成本由誰負擔？公司對「將檔名／使用者訊息傳給 Gemini」有無資安或隱私規範（注意：Google AI Studio 免費層可能會用資料訓練，正式使用建議走付費層或 Vertex AI）？

### 4. 執行環境

- Node.js 20+ 的執行主機（bot 需長時間運行，Socket Mode 為長連線）
- 資料庫為本機 SQLite 檔（`DATABASE_PATH`，預設 `./data/catalog.db`），需可持久化存放

> **部署地點與金鑰放法見下方「部署與金鑰管理」章節**——那裡有給 IT 討論用的完整對照。

### `.env` 範例

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
# Google 金鑰：擇一。推薦用檔案路徑（金鑰檔放 repo 外）。
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/Users/you/logos-bot-secrets/service-account.json
# GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}   # 備用：整包貼上
DRIVE_ROOT_FOLDER_ID=1Y6avk_W5jRsl5Ab-PWiBvOo_AFGoFEv2
# AI 供應商：目前選 Vertex AI Gemini，沿用上方 service account。
AI_PROVIDER=vertex
VERTEX_PROJECT_ID=slack-drive-integration-502007
VERTEX_LOCATION=global
GEMINI_MODEL=gemini-2.5-flash
# AI_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-...
DATABASE_PATH=./data/catalog.db
MAX_OUTPUT_SIZE=4000
```

---

## 部署與金鑰管理（上線前跟 IT 討論）

### 先破除一個常見誤解：同事「不會」碰到金鑰

這是「一個」長期運行的伺服器程式（Socket Mode 長連線），跑在**某一台機器/服務上**。同事是透過 **Slack 這個介面**去用它——打 `/logo`、收檔案，全程在 Slack 裡。

```
同事 A ─┐
同事 B ─┼──→ Slack ──→ 【一台機器上跑的 bot 程式】──→ Google Drive / Gemini
同事 C ─┘                    ↑
                    金鑰只存在這裡，就這一份
```

- 同事的電腦**什麼都不用裝，也不會拿到任何金鑰**。
- 金鑰只需存在 bot 跑的那**一台**機器/服務上，**份數永遠是一份**——上線只是把這一份從你的筆電換個地方放，不是「發給每個人」。

### 金鑰怎麼放，取決於 bot 部署在哪

程式的 config 已寫成分層解析（`src/config.ts`）：**優先讀 `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` 檔案路徑，沒有才退回讀 `GOOGLE_SERVICE_ACCOUNT_KEY` 整包內容**。因此下列前兩種情境「程式完全不用改」：

| 部署情境 | 金鑰怎麼進來 | 程式要改嗎 |
|---|---|---|
| **① 內部伺服器 / 同事機器**（最單純） | 金鑰檔放該機器某路徑（如 `/etc/logos-bot/service-account.json`），`.env` 的 `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` 指過去，設好檔案權限（只有跑 bot 的系統帳號讀得到） | 否 |
| **② 容器 / 雲端**（Docker、Cloud Run…） | 容器是無狀態的，不適合放檔案。用 **Google Secret Manager** 存金鑰，部署時注入成環境變數 `GOOGLE_SERVICE_ACCOUNT_KEY`（整包） | 否 |
| **③ GCP 原生（最乾淨，無金鑰）** | bot 跑在 Cloud Run / GCE / GKE 時，用 **Workload Identity / 附掛 Service Account** 把身分綁到運算資源，SDK 自動取得權限，**完全沒有金鑰檔要保管**（沒有金鑰＝沒有外洩風險，Google 最推薦） | 需小改一個檔（拿掉 `DriveClient` 傳入的 credentials，讓 Google SDK 自動偵測），幾行而已 |

**同一套金鑰管理邏輯也適用 Gemini / Anthropic 金鑰**——差別只在 Gemini/Anthropic 是純字串，直接放環境變數或 Secret Manager 即可，沒有「檔案 vs 內容」的分層問題。

### 要問 IT 的問題

> **這個 bot 要部署到哪裡？**（同事的機器 / 內部伺服器 / GCP Cloud Run / 其他）
> — 這個答案直接決定用上面①②③哪一種：內部伺服器 → 檔案路徑就好；GCP 容器 → Secret Manager 或 Workload Identity。
>
> 其他：公司對 service account 金鑰保管有無規範（是否要求放進 Secret Manager）？SQLite 資料檔（`DATABASE_PATH`）要放在哪個可持久化的位置？

---

## Part B — 程式功能（已完成 ✅）

原本的四個阻斷性缺口已全部補完（2026-07-10）。

### B1. 掃描進入點 ✅
- 新增 `npm run scan`（`src/scan.ts`）執行 `runFullScan`，填充 catalog 並輸出審查報告到 `data/reports/`。
- config 改成惰性驗證：scan 只需 Google + AI 供應商金鑰，缺 Slack token 也能跑。

### B2. 掃描下載內容並填尺寸 ✅
- `DriveClient.downloadFile()` 下載 SVG/PNG bytes；新增 `extractIntrinsicDimensions()` 正規化尺寸。
- `run-scan.ts` 掃描時下載並填入 `intrinsic_width/height`；下載失敗安全降級為 null。

### B3. 回傳實際檔案（Drive 連結 + PNG 上傳）✅
- 邏輯抽到 `src/bot/delivery.ts`，用注入的 ports 介面（可完整單元測試）。
- 直接下載 → 回 Drive `webViewLink`；自訂尺寸 → 下載來源 → `renderCustomSize` → `files.uploadV2` 上傳 PNG。
- 注意：slash 指令的回覆是 ephemeral 無法上傳檔案，自訂尺寸會提示改用 DM；DM 與按鈕互動可正常上傳。

### B4. 共用對話狀態 ✅
- 新增 `src/bot/conversation-store.ts`（`ConversationStore`），`index.ts` 建立單一實例注入兩個 handler。多輪對話不再中斷。

### AI 供應商介面 ✅（可切換 Vertex / Gemini / Anthropic）
- 新增 `src/ai/provider.ts`（`AiProvider` 介面）、`src/ai/vertex-provider.ts`、`src/ai/anthropic-provider.ts`、`src/ai/gemini-provider.ts`、`src/ai/factory.ts`。
- `RequestParser` 與 `AiBuilder` 依賴 `AiProvider`；`index.ts` / `scan.ts` 改用 `createAiProvider()`，依 `.env` 自動選供應商。
- **Vertex provider 用 REST + 現有 `googleapis` 取得 service-account OAuth token**，用 function calling 強制模式 ANY 取得結構化輸出。
- **切換供應商 = 改 `.env`**：`AI_PROVIDER=vertex`（+`VERTEX_PROJECT_ID` + service account）、`gemini`（+`GEMINI_API_KEY`）或 `anthropic`（+`ANTHROPIC_API_KEY`）。程式與測試都不用動。

---

## 尚待決定 / 下一步

1. **實機端到端測試**：填好 `.env`（Slack tokens + Vertex 設定）後，先 `npm run scan` 建目錄，再 `npm run dev` 啟動 bot，於 Slack 實測 `/logo` 與 DM。Vertex provider 已以 service account 串接，仍需以真實 API 呼叫驗證 IAM、Billing 與 API 狀態。
3. **（選用）算圖磁碟快取**：`OutputCache` / `generated_outputs` 資料表已存在但尚未接上 delivery 流程；高流量時可加，避免重複算圖。
4. **（備援）Anthropic / Bedrock**：兩者程式都已備妥，改 `.env` 即可切。Bedrock 目前受阻於專案 npm 依賴樹壞掉（`knip`/`eslint-utils` peer 衝突使 `npm install` 全數失敗）——若日後要用，需先修依賴樹再 `npm i @anthropic-ai/bedrock-sdk`。

---

## 現況驗證指令（不需金鑰）

```bash
npm install      # 安裝相依套件（若換過 Node 版本，跑 npm rebuild better-sqlite3）
npm test         # 執行全部測試（目前 86 個通過）
npm run build    # TypeScript strict 編譯檢查
```
