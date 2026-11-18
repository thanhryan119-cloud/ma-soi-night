"use client";

import { useParams } from "next/navigation";
import PlayerApp from "@/components/player/PlayerApp";

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  return <PlayerApp code={String(code).toUpperCase()} />;
}
