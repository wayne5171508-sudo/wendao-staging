# 改版流程

正式站：https://wayne5171508-sudo.github.io/wendao/ （`main` 分支，`deploy.sh`）
測試站：https://wayne5171508-sudo.github.io/wendao-staging/ （repo `wendao-staging`，`deploy-staging.sh`）

1. **開分支**：從最新 `main` 開 `feat/…` 或 `fix/…`，改完提交。
2. **推測試站**：在該分支執行 `sh deploy-staging.sh`，約 1 分鐘後生效。
3. **手機實測**：用手機開測試站，跑完下方測試清單。
4. **PR 合併**：開 PR，確認後合併進 `main`。
5. **上正式站**：切到 `main`、`git pull`，執行 `sh deploy.sh`。

## 測試站與正式站的差異

- 左上角紅色「測試版」標籤，標題【測試】，主畫面圖示右上角有紅色「測」，App 名稱「問道青冥(測試)」。
- 存檔、音量等 localStorage key 加 `staging_` 前綴，SW 快取叫 `staging-wendao-…`。兩站在同一網域（github.io），不加前綴會互相覆蓋存檔與快取。
- **測試站的存檔和正式站分開**：要用正式進度測試，先在正式站「閣 → 匯出存檔」，再到測試站「匯入存檔」。
- Firebase 用 `staging/firebase-config.js`。目前是 `null`（不連雲端，單機）；建好測試專案後貼上設定再部署。偵測到正式專案 ID 時 `deploy-staging.sh` 會停止。
- 測試站不含 `deploy.sh`、`deploy-staging.sh`、`firebase.json`、`database.rules.json`。

## 指令

```sh
sh deploy-staging.sh          # 部署目前分支（須先提交）到測試站
DRY=1 sh deploy-staging.sh    # 只產生測試版檔案、印出路徑，不推送
swift staging/make-icons.swift  # 正式圖示換了之後，重新產生測試站圖示
```

網址加 `?dev` 為開發模式（顯示測試關卡、可模擬道侶在線）。**`?dev` 不會關閉雲端**，雲端開關只看 Firebase 設定。部署的分支與 commit 記在測試站的 `staging.json`。

## 測試清單（手機，每次改版跑一次）

- [ ] **續緣**：標題畫面按「續緣」，進度、境界、背包、離線收益正確。
- [ ] **戰鬥換劍**：法寶頁換主手（含逆天劍與一般劍），進戰鬥看立繪與劍光；施放劍氣、雷法、護體、萬劍。
- [ ] **十連扣款**：十連抽前後記下靈石，扣款與獎勵數量正確，保底計數有累加。
- [ ] **雲端登入**：登入、登出、換帳號；雲端存檔上傳與還原（測試站需先建好測試 Firebase 專案）。
- [ ] **雙修影片**：靈泉、雲床各一次，影片可播、可跳過，播完接續演出圖與結算。
- [ ] **更名**：第一次免費、之後扣靈石、24 小時限制與不合規名字的提示。
- [ ] **離線與 SW 更新**：開飛航模式重開遊戲能玩；部署新版後重開一次即換成新版（看 `staging.json` 的版本）。
