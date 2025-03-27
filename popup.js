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
  
  // 抽出したツイートデータを保存
  let extractedTweets = [];
  // 現在の出力形式
  let currentFormat = 'text';
  // 保存済みの抽出済みツイートID
  let savedTweetIds = new Set();
  
  console.log('X.com ブックマーク抽出ツール: ポップアップが読み込まれました');
  
  // 保存されたツイートIDを読み込む
  loadSavedTweetIds();
  
  // 保存済みツイートIDをロードする関数
  function loadSavedTweetIds() {
    chrome.storage.local.get(['savedTweetIds'], function(result) {
      if (result.savedTweetIds && Array.isArray(result.savedTweetIds)) {
        savedTweetIds = new Set(result.savedTweetIds);
        console.log(`${savedTweetIds.size}件の過去のツイートIDが読み込まれました`);
      } else {
        savedTweetIds = new Set();
        console.log('保存済みのツイートIDはありません');
      }
    });
  }
  
  // ツイートIDを保存する関数
  function saveTweetIds(newTweets) {
    // 保存するツイートIDの最大数（過去10000件まで保持）
    const MAX_SAVED_TWEETS = 10000;
    
    // 新しいツイートIDを抽出して追加
    const tweetIds = newTweets.map(tweet => {
      // ツイートURLからIDを抽出
      if (tweet.tweetUrl) {
        const urlParts = tweet.tweetUrl.split('/');
        return urlParts[urlParts.length - 1];
      }
      // URLが無い場合はタイムスタンプとテキスト先頭を組み合わせて一意のIDを生成
      return `${tweet.timestamp}_${tweet.tweetText.substring(0, 30)}`;
    });
    
    // 既存のIDと新しいIDを結合
    const allIds = [...savedTweetIds, ...tweetIds];
    // 重複を除去して最新のMAX_SAVED_TWEETS件だけを保持
    const uniqueIds = [...new Set(allIds)].slice(-MAX_SAVED_TWEETS);
    
    // ストレージに保存
    chrome.storage.local.set({savedTweetIds: uniqueIds}, function() {
      console.log(`${uniqueIds.length}件のツイートIDを保存しました`);
      // メモリ上のセットも更新
      savedTweetIds = new Set(uniqueIds);
    });
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
