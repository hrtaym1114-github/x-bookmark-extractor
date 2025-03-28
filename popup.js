document.addEventListener('DOMContentLoaded', function() {
  const extractBtn = document.getElementById('extract-btn');
  const copyBtn = document.getElementById('copy-btn');
  const downloadBtn = document.getElementById('download-btn');
  const textFormatBtn = document.getElementById('text-format');
  const csvFormatBtn = document.getElementById('csv-format');
  const countInput = document.getElementById('count');
  const skipDuplicatesCheckbox = document.getElementById('skip-duplicates');
  const statusDiv = document.getElementById('status');
  const resultDiv = document.getElementById('result');
  const tweetsContainer = document.getElementById('tweets-container');
  const actionPanel = document.getElementById('action-panel');
  
  // 履歴関連の要素
  const historyInfoDiv = document.getElementById('history-info');
  const savedCountSpan = document.getElementById('saved-count');
  const viewHistoryBtn = document.getElementById('view-history-btn');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const historyModal = document.getElementById('history-modal');
  const historyList = document.getElementById('history-list');
  const modalClose = document.querySelector('.modal-close');
  
  // 抽出したツイートデータを保存
  let extractedTweets = [];
  // 現在の出力形式
  let currentFormat = 'text';
  // 保存済みの抽出済みツイートID
  let savedTweetIds = new Set();
  // 保存済みのツイートメタデータ
  let savedTweetMetadata = {};
  
  console.log('X.com ブックマーク抽出ツール: ポップアップが読み込まれました');
  
  // 保存されたツイートIDとメタデータを読み込む
  loadSavedTweetData();
  
  // 保存済みツイートデータをロードする関数
  function loadSavedTweetData() {
    chrome.storage.local.get(['savedTweetIds', 'savedTweetMetadata'], function(result) {
      // ツイートIDの読み込み
      if (result.savedTweetIds && Array.isArray(result.savedTweetIds)) {
        savedTweetIds = new Set(result.savedTweetIds);
        console.log(`${savedTweetIds.size}件の過去のツイートIDが読み込まれました`);
        
        // 履歴情報を表示
        historyInfoDiv.style.display = 'block';
        savedCountSpan.textContent = savedTweetIds.size;
        
        // 履歴があれば履歴確認・クリアボタンを有効化
        if (savedTweetIds.size > 0) {
          viewHistoryBtn.disabled = false;
          clearHistoryBtn.disabled = false;
        } else {
          viewHistoryBtn.disabled = true;
          clearHistoryBtn.disabled = true;
        }
      } else {
        savedTweetIds = new Set();
        console.log('保存済みのツイートIDはありません');
        historyInfoDiv.style.display = 'none';
      }
      
      // ツイートメタデータの読み込み
      savedTweetMetadata = result.savedTweetMetadata || {};
    });
  }
  
  // ツイートデータを保存する関数
  function saveTweetIds(newTweets) {
    // 保存するツイートIDの最大数（過去10000件まで保持）
    const MAX_SAVED_TWEETS = 10000;
    
    // 新しいツイートIDとメタデータを抽出して追加
    const tweetIds = [];
    const newMetadata = {};
    
    newTweets.forEach(tweet => {
      // ツイートURLからIDを抽出
      let tweetId;
      if (tweet.tweetUrl) {
        const urlParts = tweet.tweetUrl.split('/');
        tweetId = urlParts[urlParts.length - 1];
      } else {
        // URLが無い場合はタイムスタンプとテキスト先頭を組み合わせて一意のIDを生成
        tweetId = `${tweet.timestamp}_${tweet.tweetText.substring(0, 30)}`;
      }
      
      tweetIds.push(tweetId);
      
      // メタデータを保存
      newMetadata[tweetId] = {
        userName: tweet.userName,
        userId: tweet.userId,
        date: tweet.date,
        tweetText: tweet.tweetText.substring(0, 100) + (tweet.tweetText.length > 100 ? '...' : ''),
        tweetUrl: tweet.tweetUrl,
        extractedAt: new Date().toISOString()
      };
    });
    
    // 既存のIDと新しいIDを結合
    const allIds = [...savedTweetIds, ...tweetIds];
    // 重複を除去して最新のMAX_SAVED_TWEETS件だけを保持
    const uniqueIds = [...new Set(allIds)].slice(-MAX_SAVED_TWEETS);
    
    // メタデータを更新
    const updatedMetadata = {...savedTweetMetadata, ...newMetadata};
    
    // ストレージに保存
    chrome.storage.local.set(
      {
        savedTweetIds: uniqueIds,
        savedTweetMetadata: updatedMetadata
      }, 
      function() {
        console.log(`${uniqueIds.length}件のツイートIDを保存しました`);
        // メモリ上のデータも更新
        savedTweetIds = new Set(uniqueIds);
        savedTweetMetadata = updatedMetadata;
        
        // 履歴情報を更新
        historyInfoDiv.style.display = 'block';
        savedCountSpan.textContent = savedTweetIds.size;
        
        // ボタンの有効化
        viewHistoryBtn.disabled = false;
        clearHistoryBtn.disabled = false;
      }
    );
  }
  
  // ツイートが既に保存済みかチェックする関数
  function isTweetSaved(tweet) {
    // ツイートURLからIDを抽出
    let tweetId = null;
    if (tweet.tweetUrl) {
      const urlParts = tweet.tweetUrl.split('/');
      tweetId = urlParts[urlParts.length - 1];
    } else {
      // URLが無い場合はタイムスタンプとテキスト先頭を組み合わせて一意のIDを生成
      tweetId = `${tweet.timestamp}_${tweet.tweetText.substring(0, 30)}`;
    }
    
    return savedTweetIds.has(tweetId);
  }
  
  // 抽出ボタンのクリックイベント
  extractBtn.addEventListener('click', function() {
    const count = parseInt(countInput.value);
    const skipDuplicates = skipDuplicatesCheckbox.checked;
    
    if (isNaN(count) || count < 1) {
      showStatus('エラー: 有効な数値を入力してください', 'error');
      return;
    }
    
    showStatus('ツイートを抽出中...', 'success');
    
    // バックグラウンドスクリプトにメッセージを送信
    chrome.runtime.sendMessage(
      { 
        action: 'extractTweets', 
        count: count,
        skipDuplicates: skipDuplicates 
      },
      function(response) {
        console.log('ポップアップがレスポンスを受信:', response);
        
        if (chrome.runtime.lastError) {
          console.error('エラー:', chrome.runtime.lastError);
          showStatus('エラーが発生しました: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        
        if (!response || !response.success) {
          showStatus('ツイートの抽出に失敗しました: ' + (response && response.error ? response.error : '不明なエラー'), 'error');
          return;
        }
        
        let tweets = response.tweets;
        
        if (tweets.length === 0) {
          showStatus('ツイートが見つかりませんでした', 'error');
          return;
        }
        
        // 重複排除オプションが有効で、保存済みのツイートがある場合
        if (skipDuplicates && savedTweetIds.size > 0) {
          // 抽出前のツイート数
          const beforeCount = tweets.length;
          
          // 保存済みでないツイートのみをフィルタリング
          tweets = tweets.filter(tweet => !isTweetSaved(tweet));
          
          // 除外されたツイート数
          const excludedCount = beforeCount - tweets.length;
          
          if (excludedCount > 0) {
            console.log(`${excludedCount}件の重複ツイートを除外しました`);
          }
          
          if (tweets.length === 0) {
            showStatus(`ツイートが見つかりませんでした（${excludedCount}件は過去に取得済み）`, 'error');
            return;
          }
        }
        
        // 新しいツイートIDを保存（重複排除オプションに関わらず常に保存）
        saveTweetIds(tweets);
        
        // 抽出したツイートを保存
        extractedTweets = tweets;
        
        // 結果を表示
        displayTweets(tweets);
        showStatus(`${tweets.length}件のツイートを抽出しました${skipDuplicates ? ' (重複除外)' : ''}`, 'success');
        resultDiv.style.display = 'block';
        actionPanel.style.display = 'block';
      }
    );
  });
  
  // テキスト形式ボタンのクリックイベント
  textFormatBtn.addEventListener('click', function() {
    if (currentFormat !== 'text') {
      currentFormat = 'text';
      textFormatBtn.classList.add('active');
      csvFormatBtn.classList.remove('active');
      if (extractedTweets.length > 0) {
        displayTweets(extractedTweets);
      }
    }
  });
  
  // CSV形式ボタンのクリックイベント
  csvFormatBtn.addEventListener('click', function() {
    if (currentFormat !== 'csv') {
      currentFormat = 'csv';
      csvFormatBtn.classList.add('active');
      textFormatBtn.classList.remove('active');
      if (extractedTweets.length > 0) {
        displayTweets(extractedTweets);
      }
    }
  });
  
  // 履歴確認ボタンのクリックイベント
  viewHistoryBtn.addEventListener('click', function() {
    displayHistory();
    historyModal.style.display = 'flex';
  });
  
  // 履歴クリアボタンのクリックイベント
  clearHistoryBtn.addEventListener('click', function() {
    if (confirm('過去に取得したブックマークの履歴をクリアしますか？')) {
      clearHistory();
    }
  });
  
  // モーダルを閉じるボタンのクリックイベント
  modalClose.addEventListener('click', function() {
    historyModal.style.display = 'none';
  });
  
  // モーダル外をクリックしたときにモーダルを閉じる
  historyModal.addEventListener('click', function(event) {
    if (event.target === historyModal) {
      historyModal.style.display = 'none';
    }
  });
  
  // 履歴を表示する関数
  function displayHistory() {
    historyList.innerHTML = '';
    
    if (savedTweetIds.size === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = '取得済みのブックマークはありません';
      emptyMessage.style.padding = '15px';
      emptyMessage.style.textAlign = 'center';
      historyList.appendChild(emptyMessage);
      return;
    }
    
    // 日付でグループ化するためのオブジェクト
    const groupedByDate = {};
    
    // savedTweetIdsから各IDのメタデータを取得してグループ化
    [...savedTweetIds].forEach(tweetId => {
      const metadata = savedTweetMetadata[tweetId];
      if (metadata) {
        // 抽出日を取得（YYYY-MM-DD形式）
        const extractedDate = metadata.extractedAt ? metadata.extractedAt.split('T')[0] : '不明';
        
        if (!groupedByDate[extractedDate]) {
          groupedByDate[extractedDate] = [];
        }
        
        groupedByDate[extractedDate].push({
          id: tweetId,
          ...metadata
        });
      }
    });
    
    // 日付でソートして表示（新しい順）
    Object.keys(groupedByDate)
      .sort((a, b) => b.localeCompare(a))
      .forEach(date => {
        // 日付ヘッダー
        const dateHeader = document.createElement('div');
        dateHeader.textContent = `${date} (${groupedByDate[date].length}件)`;
        dateHeader.style.fontWeight = 'bold';
        dateHeader.style.padding = '10px 5px';
        dateHeader.style.backgroundColor = '#f8f9fa';
        dateHeader.style.borderBottom = '1px solid #dee2e6';
        historyList.appendChild(dateHeader);
        
        // その日のツイート
        groupedByDate[date].forEach(tweet => {
          const tweetItem = document.createElement('div');
          tweetItem.className = 'history-item';
          
          const tweetContent = document.createElement('div');
          tweetContent.innerHTML = `
            <div><strong>${tweet.userName || '不明'}</strong> @${tweet.userId || '不明'}</div>
            <div>${tweet.tweetText || '内容なし'}</div>
            <div style="font-size: 12px; color: #6c757d;">${tweet.date || '日時不明'}</div>
          `;
          
          if (tweet.tweetUrl) {
            const linkBtn = document.createElement('a');
            linkBtn.href = tweet.tweetUrl;
            linkBtn.target = '_blank';
            linkBtn.textContent = 'ツイートを開く';
            linkBtn.style.fontSize = '12px';
            linkBtn.style.color = '#1DA1F2';
            linkBtn.style.textDecoration = 'none';
            linkBtn.style.display = 'block';
            linkBtn.style.marginTop = '5px';
            tweetContent.appendChild(linkBtn);
          }
          
          tweetItem.appendChild(tweetContent);
          historyList.appendChild(tweetItem);
        });
      });
  }
  
  // 履歴をクリアする関数
  function clearHistory() {
    chrome.storage.local.remove(['savedTweetIds', 'savedTweetMetadata'], function() {
      console.log('ブックマーク履歴をクリアしました');
      savedTweetIds = new Set();
      savedTweetMetadata = {};
      
      // UI更新
      savedCountSpan.textContent = '0';
      viewHistoryBtn.disabled = true;
      clearHistoryBtn.disabled = true;
      
      // モーダルが開いていたら閉じる
      if (historyModal.style.display === 'flex') {
        historyModal.style.display = 'none';
      }
      
      showStatus('ブックマーク履歴をクリアしました', 'success');
    });
  }
  
  // コピーボタンのクリックイベント
  copyBtn.addEventListener('click', function() {
    if (extractedTweets.length === 0) {
      showStatus('コピーするデータがありません', 'error');
      return;
    }
    
    let content = '';
    
    if (currentFormat === 'csv') {
      content = generateCSV(extractedTweets);
    } else {
      content = generateText(extractedTweets);
    }
    
    navigator.clipboard.writeText(content)
      .then(() => {
        showStatus('データをクリップボードにコピーしました', 'success');
      })
      .catch(err => {
        showStatus('コピーに失敗しました: ' + err.message, 'error');
      });
  });
  
  // ダウンロードボタンのクリックイベント
  downloadBtn.addEventListener('click', function() {
    if (extractedTweets.length === 0) {
      showStatus('ダウンロードするデータがありません', 'error');
      return;
    }
    
    let content = '';
    let filename = '';
    let mimeType = '';
    
    if (currentFormat === 'csv') {
      content = generateCSV(extractedTweets);
      filename = 'x_bookmarks_' + new Date().toISOString().slice(0, 10) + '.csv';
      mimeType = 'text/csv';
    } else {
      content = generateText(extractedTweets);
      filename = 'x_bookmarks_' + new Date().toISOString().slice(0, 10) + '.txt';
      mimeType = 'text/plain';
    }
    
    // ダウンロード用のリンクを作成
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    // リソースの解放
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showStatus(`${filename} をダウンロードしました`, 'success');
    }, 100);
  });
  
  // ステータスメッセージを表示
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = type;
    statusDiv.style.display = 'block';
    
    // 3秒後に非表示（エラーの場合は表示したまま）
    if (type !== 'error') {
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 3000);
    }
  }
  
  // ツイートを表示
  function displayTweets(tweets) {
    tweetsContainer.innerHTML = '';
    
    tweets.forEach((tweet, index) => {
      const tweetDiv = document.createElement('div');
      tweetDiv.style.marginBottom = '10px';
      tweetDiv.style.paddingBottom = '10px';
      tweetDiv.style.borderBottom = index < tweets.length - 1 ? '1px solid #eee' : 'none';
      
      if (currentFormat === 'text') {
        // テキスト形式で表示
        tweetDiv.textContent = tweet.text;
      } else {
        // CSV形式のプレビューを表示
        const previewText = `${tweet.userName} (${tweet.userId}) - ${tweet.date}\n${tweet.tweetText.substring(0, 100)}${tweet.tweetText.length > 100 ? '...' : ''}`;
        tweetDiv.textContent = previewText;
      }
      
      tweetsContainer.appendChild(tweetDiv);
    });
  }
  
  // テキスト形式でデータを生成
  function generateText(tweets) {
    return tweets.map(tweet => tweet.text).join('\n\n');
  }
  
  // CSV形式でデータを生成
  function generateCSV(tweets) {
    // CSVヘッダー
    const header = '\uFEFFユーザー名,ユーザーID,投稿日時,ツイート内容,リンク,ツイートURL,リプライ数,リツイート数,いいね数,閲覧数';
    
    // CSV行を生成
    const rows = tweets.map(tweet => {
      // CSV形式に合わせてエスケープ
      const userName = escapeCsvField(tweet.userName);
      const userId = escapeCsvField(tweet.userId);
      const date = escapeCsvField(tweet.date);
      const tweetText = escapeCsvField(tweet.tweetText);
      const links = escapeCsvField(tweet.links.join(' '));
      const tweetUrl = escapeCsvField(tweet.tweetUrl);
      const replyCount = escapeCsvField(tweet.replyCount);
      const retweetCount = escapeCsvField(tweet.retweetCount);
      const likeCount = escapeCsvField(tweet.likeCount);
      const viewCount = escapeCsvField(tweet.viewCount);
      
      return `${userName},${userId},${date},${tweetText},${links},${tweetUrl},${replyCount},${retweetCount},${likeCount},${viewCount}`;
    });
    
    // ヘッダーと行を結合
    return header + '\n' + rows.join('\n');
  }
  
  // CSVフィールドのエスケープ処理
  function escapeCsvField(field) {
    if (field === null || field === undefined) {
      return '';
    }
    
    const stringField = String(field);
    
    // ダブルクオート、改行、カンマを含む場合はクオートで囲む
    if (stringField.includes('"') || stringField.includes('\n') || stringField.includes(',')) {
      // ダブルクオートをエスケープ
      return '"' + stringField.replace(/"/g, '""') + '"';
    }
    
    return stringField;
  }
});
