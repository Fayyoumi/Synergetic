/** End-of-night summary for a room (shared by the API and the UI). */
export type NightView = {
  code: string;
  status: "lobby" | "playing" | "ended";
  gamesPlayed: number;
  players: { seatId: string; name: string; color: string; points: number }[];
  titles: { id: string; seatId: string; name: string; title: string }[];
  mySeatId: string | null;
};
