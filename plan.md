# 東海道ウォークゲーム — 設計図

最終目的:
- ユーザーが手入力（または他アプリからのコピペ）で歩数を登録し、歩数に応じて仮想の東海道（日本橋→京都）を進む。到達判定や期限付きチャレンジを設け、ゲーム性を持たせる。

作成日: 2025-11-12
作成者: bonsai (設計案)

---

## 1. 要約（概要）
ユーザーは日々の歩数を手入力／コピペ／CSV で登録し、累計で東海道上を進む。各宿場到達で報酬やバッジを得られるほか、「○日以内に次の宿場へ到達せよ」といった期限付きチャレンジやスタミナ・アイテム要素でゲーム性を高める。初期はブラウザ（PWA）や Capacitor で APK を配布できるようにする。

---

## 2. ゴール（MVP）
必須機能（MVP）
- 歩数の手入力 UI（単日追加・日付指定・ソース記録）
- 歩数履歴一覧（編集・削除）
- 累計歩数→距離→東海道上の現在位置表示（宿場到達判定）
- 宿場到達時の報酬（バッジ、コイン）表示
- 単純な到達予測（現在の平均ペースから○日で到達可能か判定）
- ローカル永続化（IndexedDB / localForage）
- 簡易チュートリアル（入力方法、宿場の見方）
- APK 化のための Capacitor 対応

必須でないが優先度高
- CSV インポート（コピペや他アプリからの移行）
- デイリーチャレンジ（期限付きミッション）
- ユーザー設定（歩幅、日間活動時間）

長期機能
- Google Fit / HealthKit 連携
- ソーシャル（フレンド、ランキング）
- OCR による歩数スクショ取り込み
- バックグラウンド計測（ネイティブ）

---

## 3. ユーザーストーリー（代表）
- 新規ユーザー: 「手入力で歩数を登録して東海道を進めたい」
- コピペユーザー: 「他アプリの歩数を貼り付けて素早く記録したい」
- ゲーマー: 「期限内に宿場を目指すチャレンジで報酬を得たい」
- 継続ユーザー: 「連続到達（streak）でボーナスを狙いたい」

---

## 4. 基本 UX / 画面一覧
- ダッシュボード
  - 今日の合計歩数、累計距離、現在の宿場、次の宿場までの距離・割合
- 歩数入力（Quick Add）
  - 数字入力、日付、ソース、ワンタップで追加
  - ペースト欄（文字列解析して数値抽出）
- 履歴一覧（編集/削除）
- 宿場詳細（画像・説明・報酬）
- チャレンジ一覧（進行状況表示）
- 設定（歩幅、daily active hours、データエクスポート）
- インポート/エクスポート（CSV）

モバイル向け UI を想定。手入力が主なので操作は最小クリックで済むように。

---

## 5. データモデル（主要）
- User (ローカル / オプションでサーバー)
  - id, displayName, stepLengthMeters, dailyActiveHours, preferences
- StepEntry
  - id: string (UUID)
  - dateIso: string (YYYY-MM-DD)
  - steps: number
  - source?: string
  - note?: string
- Station
  - id, name, distanceMeters (起点からの累積m), description, reward
- ProgressState (計算結果キャッシュ)
  - totalSteps, totalDistanceMeters, currentStationId, nextStationId, progressedBetween (0..1)
- Challenge
  - id, targetStationId, startDate, daysAllowed, status (active/succeeded/failed), reward
- Inventory / Items (ゲーム用)
  - userId, itemId, count

保存形式: JSON を IndexedDB に保存。サンプルキー:
- 'user:profile'
- 'user:entries'
- 'user:stations'（静的、バンドル）
- 'user:challenges'

同期: 将来的に Firebase / own server に同期可能に設計（オフラインファースト）。

---

## 6. 進捗計算（ビジネスロジック）
- 歩数 → 距離: distanceMeters = totalSteps * stepLengthMeters
- 位置特定: clampedDistance = min(distanceMeters, totalRoute)
  - currentStation = max station where station.distanceMeters <= clampedDistance
  - nextStation = station after currentStation
  - progressedBetween = (clampedDistance - currentStation.distanceMeters) / (nextStation.distanceMeters - currentStation.distanceMeters)
- 到達判定: 到達は clampedDistance >= station.distanceMeters（到達時に報酬付与）
- 到達予測:
  - recentStepsPerHour: 推定値（過去 N 日の平均など or ユーザー入力）
  - stepsNeeded = ceil((nextStation.distanceMeters - clampedDistance) / stepLengthMeters)
  - hoursNeeded = stepsNeeded / recentStepsPerHour
  - 「○日以内に到達可否」は hoursNeeded <= dailyActiveHours * days

注意: 歩幅はユーザ調整可能。初期値 0.72 m 推奨。

---

## 7. 手入力 / コピペ / CSV インポート設計
入力 UI 要点:
- Quick Add: 単一フィールドに数値を入れて即追加（デフォルト日: 今日）
- Paste解析: 貼り付け文字列から正規表現で歩数抽出（例: (\d{1,7})\s*steps）
- CSV: 行フォーマット: date,steps,source
  - 例: 2025-11-12,8234,coca-cola
- バリデーション:
  - steps >= 0 && steps <= 200000 (警告閾値)
  - 同日重複検出: 既存の同日エントリがある場合、上書き or 合算を UI で選択
- 履歴編集で誤入力リカバリを簡単にする（undo / restore）

---

## 8. ゲーム設計（メカニクス）
コア:
- 宿場到達で報酬: coins / badge
- デイリーチャレンジ: 例「3日以内に次宿場を到達」達成でボーナス
- スタミナ: 1 日あたりの歩行時間（デフォルト 2 時間）をスタミナとして扱う。回復アイテムあり。
- ブースト: 1 回使うと当日の歩数 ×1.2（デザイン次第）
- イベント: 週末ボーナス、連続到達ボーナス（streak）
バランス:
- 報酬は次宿場までの追加距離に比例
- 到達期限はユーザー層に応じて柔軟に（緩めのデフォルト）

---

## 9. Google Fit / HealthKit（オプション）
- 将来的に自動取り込み対応。初期は手入力重視で M/V P を作る。
- 実装方法（概要）
  - OAuth2 (PKCE) + Google Fitness REST (aggregate)
  - HealthKit は iOS ネイティブで対応（Capacitor プラグイン必要）
- 注意:
  - Fitness スコープは敏感データに該当し得る → 同意画面・審査・プライバシーポリシー必須
  - ブラウザ（PWA）では長期バックグラウンド計測不可。ネイティブ化で対応。

---

## 10. ストレージ・同期・セキュリティ
- ローカル: IndexedDB（localForage）を推奨
- 機密情報: OAuth リフレッシュトークン等はネイティブなら Secure Storage。ブラウザは注意。
- プライバシー: ユーザーが歩数データをどこに送るか明示（同意 UI）。公開時はプライバシーポリシー必須。
- データ移行: CSV エクスポート/インポートを用意

---

## 11. テスト計画
- 機能テスト
  - 手入力追加 → 履歴反映 → 累計・宿場更新
  - 貼り付け解析（多種フォーマット）
  - CSV インポート（有効/無効データ）
  - 到達予測ロジック（単体テスト）
- UX テスト
  - 初回ユーザーのオンボーディング
  - 誤入力時の回復
- プラットフォームテスト
  - Android Chrome / WebView (Capacitor) / iOS Safari（PWA）
- 自動テスト
  - unit tests: progress 計算、step parsing
  - e2e: 代表的なユーザーフロー（入力→宿場到達）

---

## 12. ロードマップ（短期→中期）
フェーズ 0 (準備)
- 五十三次の宿場データ精査（距離・画像・説明）
- UI デザイン（ワイヤー）
フェーズ 1 (MVP)
- 手入力、履歴、進捗計算、宿場到達報酬、IndexedDB 保存、Capacitor APK ビルド
フェーズ 2
- CSV インポート、チャレンジ実装、報酬/スタミナ/アイテム実装
フェーズ 3
- Google Fit / HealthKit 連携、ソーシャル機能、イベント実装、公開申請（Google 審査）
フェーズ 4
- OCR、分析ダッシュボード、A/B テストでバランス調整

---

## 13. 高レベル実装タスク（開発 Backlog の候補）
- データ: 五十三次 JSON の作成
- Core: progress.ts（進捗ロジック）単体テスト
- UI: 歩数入力コンポーネント（Quick Add + Paste parse）
- UI: 履歴一覧と編集
- UI: ダッシュボード（現在地・次宿場）
- Game: 到達報酬ハンドラ、チャレンジエンジン
- Storage: IndexedDB wrapper + import/export
- Build: Capacitor の設定・APK ビルドスクリプト
- Docs: プライバシーポリシー・利用規約テンプレ

---

## 14. KPI / メトリクス（運用時）
- MAU / DAU
- 継続率（1週間 / 1か月）
- チャレンジ参加率・成功率
- 平均入力回数（ユーザーあたり / 日）
- CSV / Google Fit からの移行率（導入後）

---

## 15. 参考 / 備考
- 歩幅の初期値 0.72m（ユーザーにカスタム可能）
- 東海道全長約 492 km（=492,000 m）を基準に宿場ごとの累積 m を算出して扱う
- プライバシー関係は初期段階でも明示必須

---

## 付録: 単純な進捗擬似コード（参考）
```ts
const totalSteps = sum(entries.map(e => e.steps));
const distance = totalSteps * stepLengthMeters;
const clamped = Math.min(distance, totalRouteMeters);
find current and next station by comparing station.distanceMeters to clamped;
progressedBetween = (clamped - current.distanceMeters) / (next.distanceMeters - current.distanceMeters);
```

---
