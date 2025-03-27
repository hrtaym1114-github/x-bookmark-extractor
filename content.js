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
    const skipDuplicates = request.skipDuplicates || false;
    
    extractTweets(count, skipDuplicates)
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
function extractTweets(count, skipDuplicates = false) {
  return new Promise((resolve, reject) => {
    try {
      const tweets = [];
      const processedTweetIds = new Set(); // 既に処理済みのツイートIDを保持するSet
      
      // 最大スクロール回数を増やす（1000件のツイートを取得するために十分な値）
      const maxScrollAttempts = Math.max(300, Math.ceil(count / 2));
      let scrollAttempts = 0;
      
      // 前回のツイート数を記録して、新しいツイートが読み込まれているか確認
      let previousTweetCount = 0;
      let noNewTweetsCounter = 0;
      const maxNoNewTweetsAttempts = 15; // 新しいツイートが読み込まれない状態が続く最大回数をさらに増やす
      
      // 進行状況表示のための変数
      const startTime = new Date();
      let lastLogTime = startTime;
      
      // DOM変更を監視するMutationObserverの設定
      let observer = null;
      let isWaitingForMutation = false;
      
      // スクロール戦略変数
      let scrollStrategy = "normal"; // "normal", "aggressive", "reset"
      let consecutiveAggressiveScrolls = 0;
      const maxConsecutiveAggressiveScrolls = 3;
      
      // 重複排除オプションが有効な場合は、取得目標数を増やす
      const targetCount = skipDuplicates ? Math.min(count * 2, count + 300) : count;
      
      // スクロール開始時にログ出力
      console.log(`ツイート抽出を開始します: 目標=${count}件, 重複排除=${skipDuplicates ? 'あり' : 'なし'}, 実際の取得目標=${targetCount}件`);
      
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
        const currentTime = new Date();
        
        // 10秒ごとに詳細なログを出力
        if (currentTime - lastLogTime > 10000) {
          console.log(`経過時間: ${Math.floor((currentTime - startTime) / 1000)}秒, スクロール試行: ${scrollAttempts + 1}/${maxScrollAttempts}, 検出ツイート: ${tweetElements.length}件, 抽出済み: ${tweets.length}件`);
          lastLogTime = currentTime;
        }
        
        // 新しいツイートを追加（重複を排除）
        const previousLength = tweets.length;
        for (let i = 0; i < tweetElements.length && tweets.length < targetCount; i++) {
          const tweetElement = tweetElements[i];
          
          // ツイートの一意のIDを取得（時間要素のハッシュ値などを使用）
          let tweetId = null;
          const timeElement = tweetElement.querySelector('time');
          if (timeElement) {
            const timeStamp = timeElement.getAttribute('datetime');
            const tweetTextElement = tweetElement.querySelector('div[data-testid="tweetText"]');
            const tweetTextSnippet = tweetTextElement ? tweetTextElement.textContent.substring(0, 50) : '';
            tweetId = `${timeStamp}_${tweetTextSnippet}`;
          } else {
            // 代替の識別子を使用
            tweetId = `tweet_${i}_${Math.random().toString(36).substring(2, 15)}`;
          }
          
          // 既に処理済みのツイートでなければ追加
          if (!processedTweetIds.has(tweetId)) {
            processedTweetIds.add(tweetId);
            const tweetData = extractTextFromTweet(tweetElement);
            if (tweetData) {
              tweets.push(tweetData);
            }
          }
        }
        
        // 新しいツイートが読み込まれた場合にログ出力
        if (tweets.length > previousLength) {
          console.log(`新しく${tweets.length - previousLength}件のツイートを抽出しました（合計: ${tweets.length}/${targetCount}件）`);
          // 新しいツイートが読み込まれたらスクロール戦略をリセット
          if (scrollStrategy !== "normal") {
            console.log(`スクロール戦略を通常モードに戻します`);
            scrollStrategy = "normal";
            consecutiveAggressiveScrolls = 0;
          }
        }
        
        // 新しいツイートが読み込まれているか確認
        if (tweets.length === previousTweetCount) {
          noNewTweetsCounter++;
          console.log(`新しいツイートが読み込まれていません: ${noNewTweetsCounter}/${maxNoNewTweetsAttempts}`);
          
          // 新しいツイートが読み込まれない状態が続く場合、スクロール戦略を変更
          if (noNewTweetsCounter >= 3 && noNewTweetsCounter < maxNoNewTweetsAttempts) {
            // 通常→積極的→リセット の順でスクロール戦略を変更
            if (scrollStrategy === "normal") {
              scrollStrategy = "aggressive";
              console.log("スクロール戦略を積極的モードに変更します");
            } else if (scrollStrategy === "aggressive") {
              consecutiveAggressiveScrolls++;
              if (consecutiveAggressiveScrolls >= maxConsecutiveAggressiveScrolls) {
                scrollStrategy = "reset";
                console.log("スクロール戦略をリセットモードに変更します");
                consecutiveAggressiveScrolls = 0;
              }
            } else if (scrollStrategy === "reset") {
              scrollStrategy = "normal";
              console.log("スクロール戦略を通常モードに戻します");
            }
          }
        } else {
          noNewTweetsCounter = 0;
          previousTweetCount = tweets.length;
        }
        
        // 目標数に達したか、最大スクロール回数に達した場合、または新しいツイートが一定回数読み込まれない場合は終了
        if (tweets.length >= targetCount || scrollAttempts >= maxScrollAttempts || noNewTweetsCounter >= maxNoNewTweetsAttempts) {
          // MutationObserverを停止
          if (observer) {
            observer.disconnect();
          }
          
          const endTime = new Date();
          const durationSeconds = Math.floor((endTime - startTime) / 1000);
          console.log(`ツイート抽出完了: ${tweets.length}件（目標: ${count}件）, 所要時間: ${durationSeconds}秒`);
          
          // 重複排除オプションが有効な場合は、実際に必要な数のツイートを返す
          if (skipDuplicates) {
            const uniqueTweets = tweets.slice(0, count);
            resolve(uniqueTweets);
          } else {
            resolve(tweets.slice(0, count));
          }
          return;
        }
        
        // MutationObserverを使用して新しいコンテンツのロードを検出
        if (observer === null) {
          // メインコンテンツエリアを特定
          const mainElement = document.querySelector('main[role="main"]');
          const targetNode = mainElement || document.body;
          
          observer = new MutationObserver((mutations) => {
            if (isWaitingForMutation) {
              console.log(`DOM変更を検出: ${mutations.length}件の変更`);
              isWaitingForMutation = false;
              
              // 短い遅延後に次のスクロールサイクルを開始
              setTimeout(() => {
                scrollAndCollect();
              }, 300);
            }
          });
          
          observer.observe(targetNode, { 
            childList: true, 
            subtree: true, 
            attributes: false,
            characterData: false
          });
        }
        
        // ブラウザのレンダリングを待ってからスクロール
        requestAnimationFrame(() => {
          // スクロールして続行
          scrollAttempts++;
          
          // 現在のスクロール戦略に基づいてスクロール
          if (scrollStrategy === "normal") {
            // 通常のスクロール
            if (scrollAttempts % 5 === 0) {
              // 5回ごとにより大きなスクロールを実行
              window.scrollBy(0, 2000);
              console.log("大きなスクロールを実行");
            } else {
              window.scrollBy(0, 1200);
            }
          } else if (scrollStrategy === "aggressive") {
            // 積極的なスクロール：ページ最下部へ
            window.scrollTo(0, document.body.scrollHeight);
            console.log("積極的なスクロールを実行: ページ最下部まで移動");
            
            // タイムラインコンテナを特定して、表示を更新
            try {
              const timelineContainer = document.querySelector('[aria-label="タイムライン: ブックマーク"]') || 
                                       document.querySelector('[data-testid="primaryColumn"]');
              
              if (timelineContainer) {
                // コンテナの表示状態を一時的に変更して強制的に再描画
                timelineContainer.style.opacity = "0.99";
                setTimeout(() => {
                  timelineContainer.style.opacity = "";
                }, 50);
              }
            } catch (e) {
              console.log("タイムラインコンテナの操作に失敗:", e);
            }
          } else if (scrollStrategy === "reset") {
            // リセットモード：ページトップに戻ってから少し下へ
            window.scrollTo(0, 0);
            console.log("スクロールをリセット: ページトップに戻ります");
            
            // 少し待ってから下へスクロール
            setTimeout(() => {
              window.scrollBy(0, 500);
              console.log("リセット後、少し下へスクロール");
            }, 500);
          }
          
          // スクロール後、DOM更新を待ってから次の処理を実行
          setTimeout(() => {
            // スクロール後にページの読み込みを確認
            const currentElements = getTweetElements();
            if (currentElements.length > tweetElements.length) {
              console.log(`スクロール後に${currentElements.length - tweetElements.length}件の新しいツイート要素を検出`);
              // 新しい要素が見つかった場合は直ちに次のサイクルを開始
              setTimeout(scrollAndCollect, 300);
            } else {
              // 「もっと見る」ボタンがあれば自動でクリック
              const showMoreButtons = Array.from(document.querySelectorAll('div[role="button"]')).filter(
                button => button.textContent && (
                  button.textContent.includes('さらに表示') || 
                  button.textContent.includes('もっと見る') ||
                  button.textContent.includes('Show more')
                )
              );
              
              if (showMoreButtons.length > 0) {
                console.log("「もっと見る」ボタンを検出しました。クリックします。");
                showMoreButtons[0].click();
                // クリック後に少し待ってから次のサイクルを開始
                setTimeout(scrollAndCollect, 1000);
              } else {
                // 新しい要素が見つからなかった場合はMutation待ちに移行
                console.log("DOM変更を待機中...");
                isWaitingForMutation = true;
                
                // 一定時間後にもMutation検出がなければタイムアウトとして次のサイクルを開始
                setTimeout(() => {
                  if (isWaitingForMutation) {
                    console.log("DOM変更待機タイムアウト。次のサイクルを開始します。");
                    isWaitingForMutation = false;
                    scrollAndCollect();
                  }
                }, 2000);
              }
            }
          }, 700);
        });
      }
      
      // 処理開始
      scrollAndCollect();
    } catch (error) {
      reject(error);
    }
  });
}
