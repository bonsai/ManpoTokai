```markdown
# Google Fitness REST (PKCE) — 設定と手順（Capacitor / Browser 用）

このドキュメントは、TypeScript のみで Google Fitness REST を使い、歩数データを取得する際の手順と注意点をまとめたものです。

## 1) GCP 側の準備（OAuth 同意画面とクライアント作成）
1. Google Cloud Console を開く（https://console.cloud.google.com/）。
2. 新規プロジェクトを作るか既存プロジェクトを選択。
3. 「OAuth 同意画面」を設定（アプリ名、サポートメール、プライバシーポリシーURL 必須）。
   - fitness scopes は「敏感なスコープ」に該当することが多く、公開アプリで使う場合は審査が必要になります。テストユーザーに限定してまず動作確認するのが良いです。
4. 認証情報 > OAuth 2.0 クライアントを作成：
   - Web アプリのクライアントを作る場合：リダイレクト URI に `https://yourdomain.com/auth/callback` を登録。
   - Capacitor (Android) アプリで外部ブラウザを使う場合：カスタムスキーム `myapp://oauth2redirect` を登録（「その他」->リダイレクトURI）し、Android側でインテントフィルタを設定。
   - Android ネイティブ用クライアント（package name + SHA-1）を作る方法もありますが、PKCE + 外部ブラウザの組合せが実装が簡単で安全です。
5. クライアントID をメモしておく。

## 2) 必要なスコープ（例）
- https://www.googleapis.com/auth/fitness.activity.read
- openid
- email
- profile

（書き込みも必要なら `https://www.googleapis.com/auth/fitness.activity.write` を追加）

## 3) PKCE を使った認可フロー（推奨）
- SPA/Capacitor では PKCE を使い、外部ブラウザ（system browser）を通して認可コードを取得します。
- 手順:
  1. code_verifier を生成し保存（セキュアな一時ストレージ）。
  2. code_challenge = base64url(SHA256(code_verifier))
  3. 認可 URL を生成して外部ブラウザで開く（Capacitor: Browser.open）。
  4. 認可後に redirect URI に code が付いて戻される。Capacitor では App.addListener('appUrlOpen', ...) で受け取る。
  5. 受け取った code と code_verifier を使って token endpoint に POST してアクセストークン + refresh_token を取得。
  6. refresh_token は安全に保管（Secure Storage）。

## 4) トークンの扱い
- access_token: 有効期限あり（expires_in）
- refresh_token: 長期トークン（ただし Google は特定条件下で refresh_token を返さないことがある）
- リフレッシュは token endpoint に grant_type=refresh_token を POST して行う。

## 5) Capacitor の注意点（APK で動かすとき）
- WebView ではなく外部ブラウザ（system browser）を使う:
  - WebView 内での OAuth は refresh_token が使えない・安全性が低い問題があるため、system browser + custom scheme の組合せを推奨。
  - 使用例: capacitor-community/browser または @capacitor/browser
- Android の AndroidManifest に intent filter を追加して custom scheme を捕まえる：
  - <intent-filter>
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.DEFAULT" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data android:scheme="myapp" android:host="oauth2redirect" />
    </intent-filter>
- リダイレクトURI（例）:
  - myapp://oauth2redirect
  - https://yourdomain.com/auth/callback （もしサーバー側を使う場合）

## 6) Fitness API 呼び出し
- aggregate エンドポイントに POST（users/me/dataset:aggregate）
- ボディで aggregateBy に `com.google.step_count.delta` を指定
- レスポンスから bucket[].dataset[].point[].value[].intVal を掘る

## 7) 審査・公開に関する注意
- fitness スコープはセンシティブ/制限付きの可能性が高いです。公開アプリで継続的に使うには Google の審査とプライバシーポリシーや利用目的の明示が必要です。最初は「テストユーザー」で動作確認してください。

## 8) テストの流れ（短く）
1. GCP で OAuth クライアント作成（Web or Other）
2. ローカルでコード生成（PKCE）→ open auth URL → 同意 → redirect にて code 受領
3. code を token endpoint に渡して tokens を取得
4. access_token で aggregate を呼ぶ → 歩数取得

## 9) セキュリティ
- refresh_token / access_token は可能ならネイティブの Secure Storage（Keychain / Android keystore）に保管する。
- トークン漏洩に注意。ログに書かない。
```