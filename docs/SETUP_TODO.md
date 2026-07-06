# Logo Bot 上線待辦清單

> 本文件列出讓 Logo Bot 能實際運作所需的**外部服務設定**（需要 IT／管理員權限）與**尚未完成的程式功能**。
> 現況：15 項任務的程式骨架已完成、65 個測試通過、TypeScript strict 編譯乾淨；但部分執行期功能仍是骨架（見 Part B）。

---

## Part A — 需要人類／IT 處理的外部設定

這些帳號、權限、金鑰無法由開發端代為申請，需要你或 IT 部門處理。
完成後請把各項值填入專案根目錄的 `.env`（可複製 `.env.example`）。

### 1. Slack App

到 https://api.slack.com/apps → **Create New App**（From scratch），然後：

| 設定項目 | 做什麼 | 對應 .env 變數 |
|---------|--------|---------------|
| Socket Mode | 開啟，並產生 App-Level Token（`xapp-...`） | `SLACK_APP_TOKEN` |
| OAuth & Permissions | 加 Bot Token Scopes（見下），安裝到工作區後取得 `xoxb-...` | `SLACK_BOT_TOKEN` |
| Basic Information | 取得 Signing Secret | `SLACK_SIGNING_SECRET` |
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

1. 建立或選定一個 GCP 專案
2. 啟用 **Google Drive API**
3. 建立 **Service Account**，並下載 JSON 金鑰
4. 把 Logo 原始檔所在的 **Drive 資料夾分享給該 service account 的 email**（唯讀 Viewer 即可）
5. 取得該資料夾的 **Folder ID**（網址列 `folders/` 後面那串）

| 取得的東西 | 對應 .env 變數 |
|-----------|---------------|
| Service Account JSON 金鑰（整包貼上） | `GOOGLE_SERVICE_ACCOUNT_KEY` |
| Drive 根資料夾 ID | `DRIVE_ROOT_FOLDER_ID` |

> **要問 IT 的問題：** Logo 原始檔目前放在哪個 Drive／共用雲端硬碟？是否能分享給 service account？公司對 service account 金鑰的保管有無規範（如需放進 secret manager）？

### 3. Anthropic API Key（Claude）

取得 Claude API 金鑰（sk-ant-...）→ 填入 `ANTHROPIC_API_KEY`。

**為什麼需要？** 這個 bot 有兩處用 Claude 做自然語言理解，是目前設計的核心：

1. **解析使用者的話**（`src/bot/request-parser.ts`）：使用者在 Slack 打「我要 TNL 藍色的 logo，要 SVG」這種自由文字，程式呼叫 Claude 拆成結構化欄位（品牌 / 顏色 / 格式 / 尺寸）。這是 bot「聽得懂人話」的關鍵。
2. **建立目錄時推斷檔案含意**（`src/catalog/ai-builder.ts`）：掃描 Drive 時，Claude 依檔名與資料夾路徑推斷每個檔案是什麼（例如 `logo-en-white.svg` → 英文版 / 白色 / logo），並給信心分數。

**能不能不用 AI？** 可以，但要取捨：
- 替代方案是**關鍵字比對／規則式解析**（硬寫規則，例如看到「SVG」就設 format=svg）。對固定、規律的檔名與簡單指令堪用；但使用者講得口語、或檔名不規則時容易失準。
- 好處：省 API 成本、不需外部服務、無資料外送疑慮。
- **這是一個尚待你決定的方向**。若選規則版，本項（Anthropic 金鑰）可省略，但需要額外開發規則解析器（會改動下方 B 區的範圍）。

> **要問 IT 的問題：** 公司是否已有 Anthropic 帳號／計費？還是要新申請？用量成本由誰負擔？公司對「將檔名／使用者訊息傳給外部 AI 服務」有無資安或隱私規範？

### 4. 執行環境

- Node.js 20+ 的執行主機（bot 需長時間運行，Socket Mode 為長連線）
- 資料庫為本機 SQLite 檔（`DATABASE_PATH`，預設 `./data/catalog.db`），需可持久化存放

> **要問 IT 的問題：** 這個 bot 要跑在哪裡（同事的機器 / 內部伺服器 / 雲端）？是否有現成的部署方式？

### `.env` 範例

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
DRIVE_ROOT_FOLDER_ID=...
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_PATH=./data/catalog.db
MAX_OUTPUT_SIZE=4000
```

---

## Part B — 尚未完成的程式功能（開發端待補）

以下是目前程式的骨架缺口。**即使 Part A 全部設定完成，在補完這些之前 bot 仍無法回傳實際檔案。** 這些不需要外部金鑰即可開發與測試。

### B1. 缺少掃描進入點（阻斷性）
- `src/index.ts` 只啟動 bot，從未呼叫 `runFullScan`。
- 結果：catalog（品牌／asset 目錄）永遠是空的，bot 查不到任何 logo。
- 待補：加一個 `scan` CLI 指令（例如 `pnpm scan`）來執行 `runFullScan`。

### B2. 掃描不會下載檔案內容
- `src/scanner/run-scan.ts` 中 `dimensions` 永遠是 `null`，也沒有從 Drive 抓 SVG／PNG 的 bytes。
- 結果：asset 的尺寸為空、自訂尺寸算圖時沒有來源內容可用。
- 待補：在掃描流程中呼叫 Drive 下載，並用 `extractSvgDimensions` / `extractPngDimensions` 填入尺寸。

### B3. 回覆訊息不含實際檔案（阻斷性）
- `buildDeliveryMessage`（`src/bot/response-builder.ts`）只組出一段文字（檔名）。
- 缺少：Drive 原始檔連結、以及把算好的 PNG 上傳到 Slack。
- 自訂尺寸流程（`handleResolvedAsset` in `src/bot/dm-handler.ts`）只驗證數字，**沒有真的呼叫 `renderCustomSize`**。
- 待補：直接下載回傳 Drive 連結；自訂尺寸則下載來源→`renderCustomSize`→用 `files:write` 上傳 PNG。

### B4. 對話狀態分裂
- `src/bot/commands.ts` 和 `src/bot/dm-handler.ts` 各自持有一份 `conversations` Map。
- 結果：DM 提問時狀態存在 A，使用者點按鈕時到 B 找 → 找不到，多輪對話會中斷。
- 待補：抽出共用的 conversation store（單一 Map 或存 DB），兩個 handler 共用。

### （選用）B5. 若決定改用規則式解析（取代 Anthropic）
- 僅在 Part A 第 3 項選擇「不用 AI」時才需要。
- 待補：改寫 `request-parser.ts` 與 `ai-builder.ts`，用關鍵字表／正則規則取代 Claude 呼叫。
- 影響：可移除 `ANTHROPIC_API_KEY` 需求；但自然語言彈性會下降。

### 建議實作順序
1. B4（共用對話狀態）— 純程式重構，最單純
2. B1（scan CLI）— 讓 catalog 能被填
3. B2（掃描下載內容）— 讓尺寸與來源正確
4. B3（真正回傳檔案 / 上傳 PNG）— 完成端到端體驗

完成 B1–B4 後，配合 Part A 的金鑰即可做完整的端到端測試。

---

## 現況驗證指令（不需金鑰）

```bash
pnpm install      # 安裝相依套件
pnpm test         # 執行全部測試（目前 65 個通過）
pnpm build        # TypeScript strict 編譯檢查
```
