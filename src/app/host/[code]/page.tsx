"use client";

import { useParams } from "next/navigation";
import HostApp from "@/components/host/HostApp";

export default function HostPage() {
  const { code } = useParams<{ code: string }>();
  return <HostApp code={String(code).toUpperCase()} />;
}
