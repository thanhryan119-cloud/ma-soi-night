"use client";

// Lobby control: type how many bots to add instead of adding them one by one.

import { useState } from "react";
import { MAX_PLAYERS } from "@shared/engine";
import { useT } from "@/lib/i18n";

export function AddBots({ players, onAdd }: { players: number; onAdd: (count: number) => void }) {
  const t = useT();
  const room = MAX_PLAYERS - players;
  // Start at whatever fills the room to 8, or 1 once it already has 8.
  const [text, setText] = useState(String(Math.max(1, 8 - players)));
  const count = Math.min(room, Math.max(0, Math.floor(Number(text)) || 0));
  const add = () => {
    if (count < 1) return;
    onAdd(count);
    setText("1");
  };
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <span className="text-sm">🤖</span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={room}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={room < 1}
        aria-label={t("host.botCount")}
        className="ui-select w-16 text-center"
      />
      <button type="submit" className="btn-ghost btn-sm" disabled={count < 1}>
        {t("host.addBots", { count: Math.max(count, 1) })}
      </button>
    </form>
  );
}
