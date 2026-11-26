"use client";

import { useEffect, useState } from "react";

/** True when this page is shown inside a window over a room (an iframe), so it leaves out its own chat and back links. */
export const isEmbedded = () => typeof window !== "undefined" && window.self !== window.top;

export function useEmbedded() {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => setEmbedded(isEmbedded()), []);
  return embedded;
}
