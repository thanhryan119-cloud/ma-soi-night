"use client";

import { useParams } from "next/navigation";
import ScreenApp from "@/components/screen/ScreenApp";

export default function ScreenPage() {
  const { code } = useParams<{ code: string }>();
  return <ScreenApp code={String(code).toUpperCase()} />;
}
