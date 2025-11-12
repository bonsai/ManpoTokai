export type Station = {
  id: number;
  name: string;
  distanceMeters: number; // 起点（日本橋）からの距離（メートル）
  description?: string;
  reward?: { coins?: number; badge?: string };
};

// 簡易サンプル：本番では五十三次を正確な距離で全部入れてください。
// 距離はおおよその値の例です（メートル）。
export const STATIONS: Station[] = [
  { id: 0, name: "日本橋", distanceMeters: 0, description: "東海道の起点", reward: { badge: "start" } },
  { id: 1, name: "品川", distanceMeters: 8000, description: "品川宿" },
  { id: 2, name: "川崎", distanceMeters: 16000, description: "川崎宿" },
  { id: 3, name: "神奈川（浦賀道）", distanceMeters: 30000, description: "神奈川宿" },
  // ... 中略（五十三次をすべて入れる）
  { id: 53, name: "京都", distanceMeters: 492000, description: "東海道の終点", reward: { badge: "goal", coins: 500 } }
];