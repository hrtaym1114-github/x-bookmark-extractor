// X.comのブックマークページからツイートを抽出するコンテンツスクリプト
console.log('X.com ブックマーク抽出ツール: コンテンツスクリプトが読み込まれました');

// ページ読み込み完了時にバックグラウンドに通知
chrome.runtime.sendMessage({ action: 'contentScriptLoaded', url: window.location.href });

// メッセージリスナーを設定
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('コンテンツスクリプトがメッセージを受信:', request);
  
  // pingリクエストに応答
  if (request.action === 'ping') {
    sendResponse({ pong: true });
    return;
  }
  
  if (request.action === 'extractTweets') {
    const count = request.count || 10;
    
    extractTweets(count)
      .then(tweets => {
        sendResponse({ success: true, tweets: tweets });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // 非同期レスポンスを使用することを示す
  }
});

// ツイートを抽出する関数
function extractTweets(count) {
  return new Promise((resolve, reject) => {
    try {
      const tweets = [];
      const maxScrollAttempts = 20;
      let scrollAttempts = 0;
      
      // ツイート要素を取得する関数
      function getTweetElements() {
        // X.comのDOMからツイート要素を取得
        return document.querySelectorAll('article[data-testid="tweet"]');
      }
      
      // ツイートから詳細情報を抽出する関数
      function extractTextFromTweet(tweetElement) {
        // ツイート本文を取得
        const tweetTextElement = tweetElement.querySelector('div[data-testid="tweetText"]');
        const tweetText = tweetTextElement ? tweetTextElement.textContent : '';
        
        // ユーザー名を取得
        const userElement = tweetElement.querySelector('div[dir="ltr"] > span');
        const userName = userElement ? userElement.textContent : '';
        
        // ユーザーID（@アカウント名）を取得
        let userId = '';
        const userIdElement = tweetElement.querySelector('div[dir="ltr"]:nth-child(2) > span');
        if (userIdElement) {
          userId = userIdElement.textContent;
        } else {
          // 別の方法でユーザーIDを取得する試み
          const userLinkElement = tweetElement.querySelector('a[role="link"][href*="/"]');
          if (userLinkElement) {
            const href = userLinkElement.getAttribute('href');
            if (href && href.startsWith('/')) {
              const parts = href.split('/');
              if (parts.length > 1) {
                userId = '@' + parts[1];
              }
            }
          }
        }
        
        // 日時を取得
        const timeElement = tweetElement.querySelector('time');
        const timestamp = timeElement ? timeElement.getAttribute('datetime') : '';
        const date = timestamp ? new Date(timestamp).toLocaleString('ja-JP') : '';
        
        // リンクを取得
        const links = [];
        const linkElements = tweetTextElement ? tweetTextElement.querySelectorAll('a[href]') : [];
        linkElements.forEach(link => {
          const href = link.getAttribute('href');
          if (href && !href.startsWith('/') && !links.includes(href)) {
            links.push(href);
          }
        });
        
        // ツイートのURLを取得
        let tweetUrl = '';
        const tweetTimeLink = tweetElement.querySelector('time')?.closest('a');
        if (tweetTimeLink) {
          const href = tweetTimeLink.getAttribute('href');
          if (href) {
            tweetUrl = 'https://x.com' + href;
          }
        }
        
        // エンゲージメント指標を取得（リプライ、リツイート、いいね、閲覧数）
        let replyCount = '0';
        let retweetCount = '0';
        let likeCount = '0';
        let viewCount = '0';
        
        try {
          // デバッグ情報
          console.log('エンゲージメント情報を取得中...');
          
          // X.comのブックマークページのエンゲージメント指標を取得する方法
          
          // 方法1: aria-labelから直接取得する
          const actionGroup = tweetElement.querySelector('div[role="group"]');
          if (actionGroup) {
            // グループのaria-labelからエンゲージメント数を取得
            const groupAriaLabel = actionGroup.getAttribute('aria-label');
            console.log('アクショングループのaria-label:', groupAriaLabel);
            
            if (groupAriaLabel) {
              // 正規表現で各エンゲージメント数を抽出
              const replyMatch = groupAriaLabel.match(/(\d+(?:[.,]\d+)?[KkMm]?)\s*件の返信/);
              const retweetMatch = groupAriaLabel.match(/(\d+(?:[.,]\d+)?[KkMm]?)\s*件のリポスト/);
              const likeMatch = groupAriaLabel.match(/(\d+(?:[.,]\d+)?[KkMm]?)\s*件のいいね/);
              const bookmarkMatch = groupAriaLabel.match(/(\d+(?:[.,]\d+)?[KkMm]?)\s*件のブックマーク/);
              const viewMatch = groupAriaLabel.match(/(\d+(?:[.,]\d+)?[KkMm]?)\s*件の表示/);
              
              // 値を設定
              if (replyMatch) {
                replyCount = replyMatch[1];
                console.log('リプライ数をaria-labelから取得:', replyCount);
              }
              
              if (retweetMatch) {
                retweetCount = retweetMatch[1];
                console.log('リツイート数をaria-labelから取得:', retweetCount);
              }
              
              if (likeMatch) {
                likeCount = likeMatch[1];
                console.log('いいね数をaria-labelから取得:', likeCount);
              }
              
              if (viewMatch) {
                viewCount = viewMatch[1];
                console.log('閲覧数をaria-labelから取得:', viewCount);
              }
            }
          }
          
          // 方法2: 各ボタンのaria-labelから取得
          if (replyCount === '0' || retweetCount === '0' || likeCount === '0' || viewCount === '0') {
            console.log('方法2でエンゲージメントを探す');
            
            // データ属性でボタンを探す
            const replyButton = tweetElement.querySelector('[data-testid="reply"]').closest('div[role="button"]');
            const retweetButton = tweetElement.querySelector('[data-testid="retweet"]').closest('div[role="button"]');
            const likeButton = tweetElement.querySelector('[data-testid="like"]').closest('div[role="button"]');
            const analyticsButton = tweetElement.querySelector('[data-testid="analytics"]').closest('a[role="link"]');
            
            // 各ボタンのaria-labelから数字を取得
            if (replyButton && replyCount === '0') {
              const ariaLabel = replyButton.getAttribute('aria-label');
              console.log('リプライボタンのaria-label:', ariaLabel);
              
              if (ariaLabel) {
                const match = ariaLabel.match(/(\d+(?:[.,]\d+)?[KkMm]?)\s*件の返信/);
                if (match) {
                  replyCount = match[1];
                  console.log('リプライ数をボタンから取得:', replyCount);
                }
              }
            }
            
            if (retweetButton && retweetCount === '0') {
              const ariaLabel = retweetButton.getAttribute('aria-label');
              console.log('リツイートボタンのaria-label:', ariaLabel);
              
              if (ariaLabel) {
                const match = ariaLabel.match(/(\d+(?:[.,]\d+)?[KkMm]?)\s*件のリポスト/);
                if (match) {
                  retweetCount = match[1];
                  console.log('リツイート数をボタンから取得:', retweetCount);
                }
              }
            }
            
            if (likeButton && likeCount === '0') {
              const ariaLabel = likeButton.getAttribute('aria-label');
              console.log('いいねボタンのaria-label:', ariaLabel);
              
              if (ariaLabel) {
                const match = ariaLabel.match(/(\d+(?:[.,]\d+)?[KkMm]?)\s*件のいいね/);
                if (match) {
                  likeCount = match[1];
                  console.log('いいね数をボタンから取得:', likeCount);
                }
              }
            }
            
            if (analyticsButton && viewCount === '0') {
              const ariaLabel = analyticsButton.getAttribute('aria-label');
              console.log('閲覧ボタンのaria-label:', ariaLabel);
              
              if (ariaLabel) {
                const match = ariaLabel.match(/(\d+(?:[.,]\d+)?[KkMm]?)\s*件の表示/);
                if (match) {
                  viewCount = match[1];
                  console.log('閲覧数をボタンから取得:', viewCount);
                }
              }
            }
          }
          
          // 方法3: span要素から直接数字を取得
          if (replyCount === '0' || retweetCount === '0' || likeCount === '0' || viewCount === '0') {
            console.log('方法3でエンゲージメントを探す');
            
            // データ属性でボタンを探す
            const replyButton = tweetElement.querySelector('[data-testid="reply"]').closest('div[role="button"]');
            const retweetButton = tweetElement.querySelector('[data-testid="retweet"]').closest('div[role="button"]');
            const likeButton = tweetElement.querySelector('[data-testid="like"]').closest('div[role="button"]');
            const analyticsButton = tweetElement.querySelector('[data-testid="analytics"]').closest('a[role="link"]');
            
            // 各ボタンの中の数字のみを含むspanを探す
            if (replyButton && replyCount === '0') {
              const spans = replyButton.querySelectorAll('span.css-1jxf684');
              spans.forEach(span => {
                if (/^\d+(?:[.,]\d+)?[KkMm]?$/.test(span.textContent.trim())) {
                  replyCount = span.textContent.trim();
                  console.log('リプライ数をspanから取得:', replyCount);
                }
              });
            }
            
            if (retweetButton && retweetCount === '0') {
              const spans = retweetButton.querySelectorAll('span.css-1jxf684');
              spans.forEach(span => {
                if (/^\d+(?:[.,]\d+)?[KkMm]?$/.test(span.textContent.trim())) {
                  retweetCount = span.textContent.trim();
                  console.log('リツイート数をspanから取得:', retweetCount);
                }
              });
            }
            
            if (likeButton && likeCount === '0') {
              const spans = likeButton.querySelectorAll('span.css-1jxf684');
              spans.forEach(span => {
                if (/^\d+(?:[.,]\d+)?[KkMm]?$/.test(span.textContent.trim())) {
                  likeCount = span.textContent.trim();
                  console.log('いいね数をspanから取得:', likeCount);
                }
              });
            }
            
            if (analyticsButton && viewCount === '0') {
              const spans = analyticsButton.querySelectorAll('span.css-1jxf684');
              spans.forEach(span => {
                if (/^\d+(?:[.,]\d+)?[KkMm]?$/.test(span.textContent.trim())) {
                  viewCount = span.textContent.trim().replace(',', '');
                  console.log('閲覧数をspanから取得:', viewCount);
                }
              });
            }
          }
        } catch (error) {
          console.error('エンゲージメント取得エラー:', error);
        }
        
        // エンゲージメント情報をテキストに追加
        const engagementText = `\nリプライ: ${replyCount}, リツイート: ${retweetCount}, いいね: ${likeCount}, 閲覧数: ${viewCount}`;
        
        // テキスト形式で返す
        const formattedText = `${userName ? userName + ' ' : ''}${userId ? userId + ' - ' : ''}${date ? date + '\n' : ''}\n${tweetText}\n${links.length > 0 ? '\nリンク: ' + links.join(', ') : ''}${tweetUrl ? '\nツイートURL: ' + tweetUrl : ''}${engagementText}`;
        
        // 構造化データも返す
        return {
          text: formattedText,
          userName: userName,
          userId: userId,
          date: date,
          timestamp: timestamp,
          tweetText: tweetText,
          links: links,
          tweetUrl: tweetUrl,
          replyCount: replyCount,
          retweetCount: retweetCount,
          likeCount: likeCount,
          viewCount: viewCount
        };
      }
      
      // スクロールしながらツイートを収集
      function scrollAndCollect() {
        const tweetElements = getTweetElements();
        
        // 新しいツイートを追加
        for (let i = tweets.length; i < tweetElements.length && i < count; i++) {
          const tweetData = extractTextFromTweet(tweetElements[i]);
          if (tweetData) {
            tweets.push(tweetData);
          }
        }
        
        // 目標数に達したか、最大スクロール回数に達した場合は終了
        if (tweets.length >= count || scrollAttempts >= maxScrollAttempts) {
          resolve(tweets.slice(0, count));
          return;
        }
        
        // スクロールして続行
        scrollAttempts++;
        window.scrollBy(0, 800);
        setTimeout(scrollAndCollect, 500);
      }
      
      // 処理開始
      scrollAndCollect();
    } catch (error) {
      reject(error);
    }
  });
}
