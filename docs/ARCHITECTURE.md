# Kiến trúc — Ma Sói Night

## 1. Tổng quan

```
┌────────────────────────┐        WebSocket (Socket.IO)        ┌──────────────────────────┐
│ Next.js (Vercel)       │ ◀──────────────────────────────────▶ │ Node + Socket.IO (Railway)│
│  /            trang chủ │   client gửi "action"               │  rooms: Map<code, Room>   │
│  /host/[code] quản trò  │   server đẩy "state" đã lọc         │  shared/engine.ts         │
│  /screen/[code] chiếu   │   theo người xem                    │  shared/views.ts (lọc)    │
│  /join/[code] người chơi│                                     │  .data/rooms.json (snap)  │
└────────────────────────┘                                     └──────────────────────────┘
            ▲                         shared/ (TypeScript thuần, dùng chung)
            └──────────── types · roles · rules · engine · views · bots ───────────┘
```

**Vì sao chọn Socket.IO server riêng (không dùng Supabase/Firestore)?**

- **Bảo mật vai**: server tự tính "view" riêng cho từng socket (`shared/views.ts`). Vai của người khác *không bao giờ* rời khỏi server. Với Firestore/Supabase Realtime, muốn giấu vai phải chia dữ liệu thành nhiều document và viết security rules phức tạp — rất dễ lộ.
- **Một nguồn sự thật**: toàn bộ luật chơi chạy trong một tiến trình, mọi hành động đi qua `engine.ts` và được kiểm tra (đúng pha, đúng vai, còn sống, mục tiêu hợp lệ, chống vote 2 lần).
- **Độ trễ thấp** (một hop WebSocket, < 100ms trong LAN), tự reconnect, phù hợp 5–20 người/phòng.
- **Chạy offline trong LAN**: chơi được ở nơi không có Internet tốt — laptop quản trò chạy cả 2 server, điện thoại vào qua Wi‑Fi.

## 2. Data model (`shared/types.ts`)

| Kiểu | Nội dung chính |
|---|---|
| `Room` | `code`, `hostToken` (bí mật), `locale` mặc định, `players[]`, `settings`, `assignment` (vai gán ở sảnh), `phase`, `game`, `timer`, `log[]`, `lastActivity` |
| `Player` | `id`, `token` (bí mật, để resume), `name`, `avatar`, `locale`, `isBot`, `connected`, `alive` |
| `RoleDef` (`shared/roles.ts`) | `id`, `team`, `emoji`, `color`, `seenAsWolf`, `max`, `night` (step, thứ tự, kiểu UI, số mục tiêu, `validTargets()`), `shootsOnDeath` |
| `Phase` | `kind` (`lobby → roleReveal → night → dawn → [hunter] → discussion → nominate → defense → verdict → verdictResult → … → gameOver`), `night`, `day`, `steps[]`, `stepIndex`, `verdictIndex` |
| `Game` | `roles`, `lovers`, `bodyguardLast`, `potions`, `nightState` (hành động đêm), `seerResults`, `lastDeaths`, `nominees`, `vote`, `verdicts`, `pendingHunters`, `pendingWin`, `winner` |
| `NightState` (Action) | `cupidPair`, `protectId`, `wolfVotes` (sói → mục tiêu, realtime), `wolfTarget`, `witchSave`, `witchPoisonId`, `seerTarget`, `done{}` |
| `VoteState` (Vote) | `kind` (`nominate`/`verdict`), `ballots` (voter → lựa chọn), `closed`, `candidates` (vote lại khi hòa), `nomineeId` |
| `LogEntry` (GameLog) | `t`, `night`, `day`, `key` i18n, `params`, `public` (hiện ở timeline cuối ván) |

Log và thông báo hệ thống lưu **key i18n + tham số**, client tự dịch theo ngôn ngữ của từng người.

## 3. Sự kiện realtime

### Client → Server (có ack `{ ok, error?, params? }`)

| Sự kiện | Payload | Ai gửi |
|---|---|---|
| `host:create` | `{ locale }` → `{ code, hostToken }` | Host |
| `host:resume` | `{ code, hostToken }` | Host (mỗi lần reconnect) |
| `host:action` | `HostAction` (xem dưới) | Host |
| `screen:watch` | `{ code }` | Màn chiếu |
| `room:check` | `{ code }` → `{ phase, locale }` | Người chơi |
| `player:join` | `{ code, name, avatar, locale }` → `{ playerId, token }` | Người chơi |
| `player:resume` | `{ code, playerId, token }` | Người chơi (reconnect) |
| `player:action` | `PlayerAction` | Người chơi |

`HostAction`: `setLocale`, `kick`, `rename`, `updateSettings`, `setRoleCounts`, `useSuggested`, `assignRandom`, `assignManual`, `addBots`, `removeBots`, `start`, `next`, `timer`, `override` (`kill`/`revive`/`changeRole`/`cancelVote`/`revote`), `actAs`, `confirmWin`, `dismissWin`, `endGame`, `newGame`.

`PlayerAction`: `setLocale`, `updateProfile`, `night` (`targets` / `save` + `poisonId`), `vote` (`choice`: id người chơi | `skip` | `execute` | `spare`), `hunterShot`.

### Server → Client

| Sự kiện | Ý nghĩa |
|---|---|
| `state` | `ClientState` đã lọc theo người xem (host / player / screen) — gửi lại sau *mỗi* thay đổi |
| `kicked` | Người chơi bị mời ra |
| `roomClosed` | Phòng hết hạn (12 giờ không hoạt động) |

## 4. Luật xử lý đêm (`shared/rules.ts › resolveNight`)

1. Bảo vệ che chở → chặn cú cắn của Sói (không chặn độc).
2. Bình cứu của Phù thủy → hủy cú cắn.
3. Bình độc → giết mục tiêu.
4. Người yêu chết → người còn lại chết theo (`cascadeDeaths`).
5. Thợ săn chết → vào pha `hunter` để bắn (bị độc thì không bắn, trừ khi bật tùy chọn).

Sau mỗi lần có người chết (đêm, treo cổ, thợ săn, quản trò can thiệp) `checkWin` chạy; kết quả chỉ được công bố khi Host bấm **Công bố** (hoặc chọn **Chơi tiếp**).

## 5. Thêm vai mới

1. Thêm id vào `RoleId` (và `NightStepId` nếu vai thức dậy ban đêm) trong `shared/types.ts`.
2. Thêm `RoleDef` vào `ROLES` trong `shared/roles.ts` (phe, emoji, `night.order`, `validTargets`…).
3. Nếu vai có hành động đêm mới: xử lý trong `nightAction()` (`shared/engine.ts`) và (nếu ảnh hưởng tử vong) trong `resolveNight()`.
4. Thêm `roles.<id>.name|desc|action` và `script.step.<id>` vào `messages/vi.json` + `messages/en.json`. Test `i18n.test.ts` sẽ báo nếu thiếu.
