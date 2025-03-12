// バックグラウンドスクリプト
console.log('X.com ブックマーク抽出ツール: バックグラウンドスクリプトが読み込まれました');

// コンテンツスクリプトが読み込まれているタブのIDを追跡
const contentScriptLoaded = {};

// ポップアップとコンテンツスクリプト間の通信を中継
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('バックグラウンドスクリプトがメッセージを受信:', request);
  
  // コンテンツスクリプトからの読み込み通知
  if (request.action === 'contentScriptLoaded' && sender.tab) {
    contentScriptLoaded[sender.tab.id] = true;
    console.log(`タブID ${sender.tab.id} にコンテンツスクリプトが読み込まれました`);
    return false;
  }
  
  if (request.action === 'extractTweets') {
    // 現在のアクティブなタブを取得
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs || tabs.length === 0) {
        sendResponse({ success: false, error: 'アクティブなタブが見つかりません' });
        return;
      }
      
      const activeTab = tabs[0];
      
      // X.comのブックマークページかチェック
      if (!activeTab.url.includes('twitter.com/i/bookmarks') && !activeTab.url.includes('x.com/i/bookmarks')) {
        sendResponse({ success: false, error: 'X.comのブックマークページで実行してください' });
        return;
      }
      
      try {
        // コンテンツスクリプトが読み込まれているか確認
        if (!contentScriptLoaded[activeTab.id]) {
          console.log(`タブID ${activeTab.id} にコンテンツスクリプトを挿入します`);
          // コンテンツスクリプトを動的に挿入
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.js']
          });
          
          // スクリプトが読み込まれるのを少し待つ
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // コンテンツスクリプトにメッセージを送信
        chrome.tabs.sendMessage(activeTab.id, request, (response) => {
          if (chrome.runtime.lastError) {
            console.error('エラー:', chrome.runtime.lastError);
            // エラーが発生した場合、再度コンテンツスクリプトを挿入して再試行
            chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              files: ['content.js']
            }, () => {
              // 少し待ってから再試行
              setTimeout(() => {
                chrome.tabs.sendMessage(activeTab.id, request, (retryResponse) => {
                  if (chrome.runtime.lastError) {
                    sendResponse({ 
                      success: false, 
                      error: '再試行後もコンテンツスクリプトとの通信に失敗しました'
                    });
                  } else {
                    sendResponse(retryResponse);
                  }
                });
              }, 1000);
            });
            return;
          }
          
          // ポップアップにレスポンスを転送
          sendResponse(response);
        });
      } catch (error) {
        console.error('スクリプト実行エラー:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'コンテンツスクリプトの実行に失敗しました'
        });
      }
    });
    
    // 非同期レスポンスを使用することを示す
    return true;
  }
});

// コンテンツスクリプトの読み込み状態を追跡
const contentScriptStatus = {};

// タブが更新されたときにコンテンツスクリプトの状態をリセット
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    if (tab.url && (tab.url.includes('twitter.com') || tab.url.includes('x.com'))) {
      // コンテンツスクリプトが読み込まれたことを確認するためのメッセージを送信
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
        contentScriptStatus[tabId] = !chrome.runtime.lastError && response && response.pong;
      });
    }
  }
});
