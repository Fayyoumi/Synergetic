import { roomRoute } from "@/lib/server/roomRoute";

/** Room info. Seats are listed only for the host and seated players. */
export async function GET(_request: Request, { params }: RouteContext<"/api/rooms/[code]">) {
  const { code } = await params;
  return roomRoute(code, (svc, c) => svc.get(c));
}
