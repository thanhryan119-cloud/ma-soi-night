"use client";

import { useParams } from "next/navigation";
import ScreenApp from "@/components/screen/ScreenApp";

/** Watching a running game from your own device. */
export default function WatchPage() {
  const { code } = useParams<{ code: string }>();
  return <ScreenApp code={String(code).toUpperCase()} spectate />;
}
