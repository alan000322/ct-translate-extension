## 1. 訊息層 Port 串流契約（src/utils/messaging.ts）

- [x] 1.1 對應設計「訊息層改為長壽命 Port 連線取代一次性 sendMessage」並滿足 Long-lived Port replaces one-shot messaging for streaming：在 src/utils/messaging.ts 以 chrome.runtime.connect({ name: "translate-stream" }) 提供 content 端 requestTranslateStream 與 background 端 registerTranslateStreamHandler，取代一次性 sendMessage/sendResponse。交付：content 開一條 translate-stream Port 即可逐步收到譯文片段，頁面 context 無 API key。驗證：手動於 DevTools 觀察 content 與 background 間為持續 Port 訊息而非單次回應，且 page context 查無 key。
- [x] 1.2 對應設計「Port 串流訊息封套採 start / chunk / done / error（提議預設，apply 時確認）」並滿足 Streaming message envelope：定義並實作型別化訊息封套——content→background `{ type: "start", id, text }`、`{ type: "cancel", id }`；background→content `{ type: "chunk", id, delta }`、`{ type: "done", id }`、`{ type: "error", id, message }`，其中 id 由 content 以 crypto.randomUUID() 產生、delta 為增量片段（非累積）。交付：content 能依 id 配對請求並區分 chunk/done/error 三態。驗證：對一段文字觸發，確認收到多則 chunk（delta 串接等於全文）後恰一則 done；錯誤情境收到 error 後無後續 chunk/done。
- [x] 1.3 對應設計「中途取消斷開 Port 並中止 provider 串流」並滿足 Mid-stream cancellation：content 於 toggle off 或離開時送 `{ type: "cancel", id }` 並/或 port.disconnect()，並對已取消 id 之後續 chunk 予以丟棄；background 於 onDisconnect 或收到 cancel 時 abort。交付：取消後 content 不再寫入該段、background 停止推送，且取消不被當成 error。驗證：手動於串流途中 toggle off，確認停止寫入、wrapper 依 toggle 移除、無 [翻譯失敗] 提示。

## 2. Provider 串流輸出（src/core/translate/providers）

- [x] 2.1 對應設計「provider 以 async generator 逐步 yield chunk」並滿足 LLM providers stream output as chunks：為 src/core/translate/providers/openai.ts（chat.completions.create 加 stream: true）、anthropic.ts（messages 串流）、gemini.ts（generateContentStream）新增串流函式，簽章 (text, targetLangName, opts, signal?) => AsyncIterable<string>，逐步 yield 增量譯文且可被 signal 中止；保留既有非串流函式供 fallback。交付：每家串流函式 yield 的片段串接後等於完整譯文且僅含譯文。驗證：以各家測試 key 跑一段英文，逐步印出片段並確認串接結果為純繁中譯文。
- [x] 2.2 對應設計「分派器 translateText 暴露串流介面並保留非串流 Google 翻譯」並滿足 Dispatcher exposes a unified streaming interface：在 src/core/translate/translate-text.ts 新增 translateTextStream(text, config, signal): AsyncIterable<string>，依 active provider 路由至各 LLM 串流 generator，並把 google-translate 非串流結果以單一 chunk 形式併入同一介面、向 provider 傳遞 signal。交付：呼叫端對 provider 是否原生串流無感。驗證：分別將 active provider 設為某 LLM 與 google-translate，各觸發一次確認皆能以同一串流介面取得譯文（LLM 多片段、google-translate 單片段）。

## 3. Background entrypoint 串流模型（src/entrypoints/background/index.ts）

- [x] 3.1 對應設計「background entrypoint 改寫為 Port 串流模型」：將 src/entrypoints/background/index.ts 從完整 await translateText 後 sendResponse，改為註冊 Port 處理——收到 start 後讀 config、建立 AbortController、for await 消費 translateTextStream 並逐 chunk postMessage，結束送 done；以 id→AbortController map 管理並於 onDisconnect 清理。交付：background 對單段請求以 chunk 串流回應並正確結束/清理連線。驗證：手動翻一段觀察 background 持續推 chunk 後送 done，且串流結束/取消後無洩漏的 AbortController（DevTools 檢查）。
- [x] 3.2 對應設計「串流失敗回退為非串流翻譯」並滿足 Fallback to non-streaming on streaming failure：當 provider 串流在產生任何 chunk 前拋錯時，background 回退呼叫該 provider 既有非串流函式，取得完整字串後以單一 chunk + done 推送；若回退亦失敗則送 error。交付：串流故障時使用者仍看到完整譯文（非逐字），雙重失敗才顯示失敗提示。驗證：以模擬串流拋錯（如暫時關閉 stream 旗標或注入錯誤）觸發一次，確認譯文仍整段出現；再以無效 key 觸發確認顯示 [翻譯失敗]。

## 4. 內容渲染：打字機增量 append（src/core/translate/insert.ts、walker.ts、node-translation.ts）

- [x] 4.1 對應設計「頁內譯文逐字增量 append 的打字機渲染保留雙語與 toggle」並滿足 Typewriter incremental rendering preserves bilingual insertion and toggle：在 src/core/translate/insert.ts 新增增量 API（如 appendChunk(wrapper, delta)）把 delta 累加進既有 data-ct-body 節點，取代一次性 fillWrapper 全文替換；done 時定版、error 時改用 failWrapper。交付：譯文逐字長出，且雙語對照（段落下方、block 前加 br、notranslate class）、toggle 還原、逐段失敗隔離行為不變。驗證：手動翻一段較長英文觀察譯文逐字出現；再觸發同段確認移除（toggle）；以無效 key 確認僅該段顯示失敗、他段完好。
- [x] 4.2 對應設計「串流預設開啟」並滿足 Streaming is the default for single-paragraph AI translation：在 src/core/translate/walker.ts 與 src/entrypoints/content/node-translation.ts 將翻譯路徑改為消費 requestTranslateStream（建立 placeholder→逐 chunk append→done 定版/ error 提示），使單段懸停 AI 翻譯預設走串流、不新增使用者開關、不改 config schema 與 popup。交付：預設設定下懸停翻譯即為打字機效果，非串流僅為內部 fallback。驗證：以預設 config 觸發懸停翻譯確認逐字串流；檢視 popup 與 config schema 無新增串流開關。

## 5. 端到端驗證

- [x] 5.1 串接全鏈路手動驗收（涵蓋上述行為）：交付：擴充能 build 並載入 Chrome，懸停單段 AI 翻譯逐字浮現、途中可取消、串流失敗回退仍出全文、Google 翻譯整段出現、單段失敗隔離。驗證：wxt build 成功並載入後，依序手動驗證（a）LLM 逐字串流（b）途中 toggle off 取消（c）模擬串流失敗回退（d）google-translate 整段（e）無效 key 之 [翻譯失敗] 僅影響該段。
