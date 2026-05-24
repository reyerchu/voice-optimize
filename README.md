# 🎙️ 聲音優化室 · Voice Optimize

把 Podcast 錄音變成可發布成品的自助後製工具。上傳錄音 → 自動產生逐字稿 →
像編輯文件一樣刪掉不要的段落（**刪文字＝刪音訊**）→ 一鍵降噪與廣播級響度正規化 →
匯出 MP3。另可由逐字稿用 Claude 產生標題、摘要、章節與社群貼文。

線上服務：<https://voice-optimize.will.guide>

## 功能

- **拖曳上傳** 音檔（MP3 / WAV / M4A / AAC…，上限 500MB）
- **自動逐字稿**：呼叫內部 S2T（Whisper）服務，回傳分段時間軸
- **文字稿剪輯**：點選段落試聽、勾選要剪掉的段落，保留的時間範圍即為輸出內容
- **一鍵贅字／空段標記**（嗯、呃、那個、空白段…）
- **音訊處理**（ffmpeg，本機執行）：
  - 降噪 + 80Hz 高通去低頻嗡聲（`afftdn` / `highpass`）
  - EBU R128 響度正規化到 -16 LUFS（`loudnorm`，Podcast 標準）
  - 移除過長靜默（`silenceremove`）
- **匯出 MP3** 並下載
- **AI Show Notes**：標題、摘要、章節、社群貼文（Claude）

無需登入，以瀏覽器 cookie 綁定匿名 session。

## 技術架構

| 層 | 技術 |
|----|------|
| 前端 / 後端 | Next.js 16（App Router）、React 19、Tailwind v4 |
| 波形 | wavesurfer.js v7 |
| 資料庫 | PostgreSQL + Prisma 7（`Session` / `Project` / `Export`） |
| 逐字稿 | 內部 S2T（Whisper）HTTP 服務 |
| 音訊處理 | 本機 ffmpeg（`afftdn`、`loudnorm`、`silenceremove`、`atrim`+`concat`） |
| AI 文案 | Anthropic Claude（`@anthropic-ai/sdk`） |

## 開發

```bash
npm install
cp .env.example .env   # 填入實際設定
npx prisma generate
npx prisma db push     # 建立資料表
npm run dev            # http://localhost:3000
```

需求：系統已安裝 `ffmpeg`／`ffprobe`，且可連到 S2T 服務與 PostgreSQL。

## 部署（8HD-8）

```bash
npm run build
pm2 start npx --name voice-optimize -- next start -p 3852
pm2 save
```

對外由 8HD-a 的 Apache 反向代理至 `192.168.1.114:3852`，Let's Encrypt 憑證。

## 流程圖

```
上傳音檔 ──► Project(UPLOADED) ──► 背景轉錄(S2T) ──► READY + transcript
                                                        │
        編輯器：波形 + 逐字稿，勾選保留段落、處理選項 ◄─┘
                          │
                          ▼
   匯出：ffmpeg(atrim+concat 保留段 → 降噪 → 去靜默 → loudnorm) ──► MP3 下載
```
