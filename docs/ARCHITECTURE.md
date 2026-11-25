# Kiến trúc — Ma Sói Online

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
| `lobby:enter` | `{ profile: { name, avatar }, authToken? }` → `{ online, rooms }` | Trang sảnh chờ (`/lobby`) |
| `lobby:leave` | – | Rời trang sảnh chờ |
| `lobby:createRoom` | `{ machine, locale, withPassword, password, profile, authToken?, settings? }` → `{ code, playerId, token }` (máy dẫn) hoặc `{ code, hostToken }` (người dẫn) | Sảnh chờ |
| `player:leave` | – → `{ abandoned }` | Người chơi bấm Thoát / Rời phòng |
| `owner:action` | `OwnerAction` | Trưởng phòng của phòng máy dẫn |
| `room:setPassword` | `{ withPassword, password }` | Quản trò, hoặc trưởng phòng |
| `profile:get` | `{ playerId }` → `{ profile: PublicProfile }` | Bất kỳ ai trong phòng (bấm avatar/tên) |
| `global:join` | `{ authToken? }` → `{ messages, online, dms, peers }` | Ô Chat chung (gọi lại khi đăng nhập/đăng xuất). Server nhớ socket nào là tài khoản nào để làm danh sách Online |
| `dm:send` | `{ to, text, authToken }` → `{ msg, peer }` | Nhắn riêng giữa hai tài khoản. Bị chặn khi cả hai đang ngồi cùng một ván đang chạy |

`HostAction`: `setLocale`, `kick`, `rename`, `updateSettings`, `setRoleCounts`, `useSuggested`, `assignRandom`, `assignManual`, `addBots`, `removeBots`, `start`, `next`, `timer`, `override` (`kill`/`revive`/`changeRole`/`cancelVote`/`revote`), `actAs`, `confirmWin`, `dismissWin`, `endGame`, `newGame`.

`PlayerAction`: `setLocale`, `updateProfile`, `night` (`targets` / `save` + `poisonId`), `vote` (`choice`: id người chơi | `skip` | `execute` | `spare`), `hunterShot`.

### Server → Client

| Sự kiện | Ý nghĩa |
|---|---|
| `state` | `ClientState` đã lọc theo người xem (host / player / screen) — gửi lại sau *mỗi* thay đổi |
| `kicked` | Người chơi bị mời ra |
| `roomClosed` | Phòng hết hạn (12 giờ không hoạt động) |
| `global:online` | Danh sách tài khoản đang mở Chat chung và số khách (gộp 300 ms, chỉ gửi khi khác) |
| `dm:new` | `{ msg, peer }` một tin nhắn riêng, gửi tới mọi máy của người gửi và người nhận |

### Chơi online (`shared/multiplayer.ts`, `server/lobby.ts`)

- **Sảnh chờ** (`/lobby`): ai mở trang này là "đang online" (vào kênh `lobby`). Server gửi `lobby:state { online, rooms }` mỗi khi có người đến/đi hoặc phòng thay đổi (gộp 300 ms, chỉ gửi khi khác). Vào một phòng thì tự rời sảnh. Danh sách phòng chỉ gồm phòng tạo từ sảnh (`room.listed`) mà còn người thật online (hoặc quản trò còn mở bảng điều khiển).
- **Mật khẩu**: tích "Đặt mật khẩu" mới hiện ô nhập, không tích thì phòng mở. Server lưu `salt:sha256` (`room.passwordHash`, không bao giờ gửi về máy khách); `player:join` kiểm tra mật khẩu. `room:check` trả `locked` để màn vào phòng hiện ô mật khẩu.
- **Máy làm quản trò** (`room.machineHost`): người tạo vào phòng như người chơi và là trưởng phòng (`room.ownerId`). Máy luôn tự dẫn (`autoAdvance`) và mọi điện thoại hiện lời dẫn (`noScreen`); mỗi bước có 6 giây để đọc. Trưởng phòng chỉ có `OwnerAction`: chỉnh luật, số vai, bot, mời ra (trừ chính mình), mật khẩu, bắt đầu (máy tự chia vai ngẫu nhiên) và ván mới. Không có chia vai tay, can thiệp hay hành động thay người khác, nên trưởng phòng không bao giờ thấy vai người khác. Trưởng phòng offline quá 30 giây thì người ngồi lâu nhất còn online lên thay.
- **Thoát game** (`leaveRoom`): trước ván hoặc khi ván đã xong thì chỉ rời phòng. Đang chơi thì thoát hẳn: ghế đó thành bot (giữ tên và vai, đổi token nên máy cũ không vào lại được; `player:resume` trả `err.abandoned`), người thoát bị tính 1 trận thua có `outcome: "abandon"` (cộng vào `losses` và `abandons`). Nếu bật `autoKickAway` (mặc định bật ở phòng máy dẫn, tắt ở phòng người dẫn), người mất kết nối quá 5 phút (`AWAY_LIMIT_MS`) khi đang chơi bị loại y như vậy.
- **Phòng online, ban ngày**: người bị đưa lên giàn được chat cả lúc biện hộ lẫn lúc mọi người bỏ phiếu treo cổ (`defenderChat`); người khác chỉ đọc. Mặc định thảo luận 2 phút, biện hộ 30 giây; phòng online tạo từ sảnh dùng mặc định này, không lấy luật đã lưu của quản trò.
- **Sói thức dậy**: màn hình sói luôn có dải "Đồng đội" (ai, còn sống không, đang chọn cắn ai).
- **Khởi động lại server**: các phòng được khôi phục sẽ hẹn lại bộ tự dẫn, bot và hạn 5 phút cho người vắng (đặt `AWAY_LIMIT_MS` để đổi hạn này), nên ván máy dẫn chạy tiếp sau mỗi lần deploy.
- **Tốc độ bot** (`settings.botSpeed`, ×1 / ×1.5 / ×2 / ×3, mặc định ×2): chia thời gian chờ của bot khi hành động, chat và bào chữa. Thời lượng tối thiểu của mỗi bước đêm không đổi, nên bot nhanh không làm lộ vai.

### Thống kê & bảng xếp hạng (`shared/stats.ts`)

Chỉ người chơi đăng nhập Google mới có thống kê (khách và bot thì không). Khi ván chuyển sang `gameOver`, server cộng ván đó vào `stats.json` (cạnh `users.json`) đúng một lần (`game.statsRecorded`): số ván, thắng/thua/hòa, sống sót, theo vai, theo phe, cặp đôi, chuỗi thắng và 10 ván gần nhất. Thắng/thua tính theo vai cuối cùng: thắng cùng phe của mình, cặp đôi thắng khi `winner = lovers`, hòa không tính là thắng. Chỉ ván có từ `MIN_HUMANS_FOR_STATS` = 6 người thật (không kể bot) mới được cộng vào các con số; ván ít người hơn vẫn hiện trong "ván gần đây" với nhãn "Không tính" nhưng không ảnh hưởng số ván, tỉ lệ thắng hay chuỗi thắng.

HTTP công khai: `GET /leaderboard` (mọi tài khoản; ai đủ `MIN_RANKED_GAMES` = 5 ván mới được xếp hạng, theo tỉ lệ thắng → số ván thắng → số ván; người chưa đủ xếp bên dưới theo số ván đã chơi), `GET /profiles/:userId`. `GET /me` trả thêm `stats` của chính mình.

### Cửa hàng (`server/shop.ts`, `server/payos.ts`)

Mỗi font/hiệu ứng/khung trừ mặc định là một món `<loại>:<id>` (ví dụ `effect:glow`), giá `ITEM_PRICE_VND` = 50.000đ. `User.owned` giữ các món đã mua; `limitStyle()` gỡ mọi món chưa sở hữu ở `addPlayer`, `updateProfile`, `PATCH /me`, hồ sơ công khai và bảng xếp hạng. `Player.owned` chỉ nằm trên server (không có trong view).

**Vai**: mọi vai mở cho tất cả mọi người, không bán. `RoleDef.advanced` chỉ để gom các vai nâng cao vào nhóm thu gọn trong phần chia vai và để `suggestRoles()` mặc định chỉ dùng vai cơ bản (`CORE_ROLES`). Gợi ý của phòng dùng mọi vai.

| Route | Ai gọi | Việc |
|---|---|---|
| `GET /shop` | công khai | `{ enabled, price, items }` |
| `POST /shop/checkout` | đã đăng nhập | `{ itemId, returnUrl }` → tạo link payOS (ký HMAC-SHA256), trả `checkoutUrl`; bấm lại thì dùng lại link còn hạn |
| `GET /shop/orders/:orderCode` | chủ đơn | đơn còn chờ thì hỏi payOS; đã trả thì mở khoá |
| `POST /payos/webhook` | payOS | kiểm chữ ký, `code = "00"` và đủ tiền thì mở khoá (mỗi đơn đúng một lần) |
| `GET /shop/codes/:code` | đã đăng nhập | mã còn dùng được không, giá sau khi giảm |
| `GET/POST /shop/admin/codes`, `PATCH/DELETE /shop/admin/codes/:code` | email trong `ADMIN_EMAILS` | quản lý mã giảm giá (`shared/codes.ts`, lưu `codes.json`) |

Mã giảm giá: `POST /shop/checkout` nhận thêm `code`; giá payOS là giá sau giảm, đơn lưu `code`. Lượt dùng (`uses`, `usedBy`) chỉ cộng khi đơn được trả (`fulfil`), mỗi tài khoản một lần. Giá về 0 thì mở khoá ngay, không tạo link payOS. `User.email` được ghi lại ở mỗi lần đăng nhập Google để nhận ra quản trị viên.

## 4. Luật xử lý đêm (`shared/rules.ts › resolveNight`)

1. Bảo vệ che chở → chặn cú cắn của Sói (không chặn độc).
2. Bình cứu của Phù thủy → hủy cú cắn.
3. Bình độc → giết mục tiêu.
4. Người yêu chết → người còn lại chết theo (`cascadeDeaths`).
5. Thợ săn chết → vào pha `hunter` để bắn (bị độc thì không bắn, trừ khi bật tùy chọn).

Vai đặc biệt:

- **Sói Nguyền** cắn cùng bầy (`alsoWakesIn: ["werewolf"]`), rồi có bước riêng ngay sau bầy: một lần mỗi ván được nguyền người bị cắn. Nếu cú cắn không bị Bảo vệ/bình cứu chặn, người đó không chết mà đổi vai thành `werewolf` (mất chức năng cũ, `game.cursed`), sáng ra công bố "đêm bình yên". Bị chặn thì lời nguyền chưa mất. Bị độc cùng đêm thì vẫn chết.
- **Sói Tiên Tri** cắn cùng bầy và mỗi đêm soi được *chính xác vai* của một người (`SeerResult.roleId`).
- **Già làng** chịu được nhát cắn đầu tiên (`game.elderHits`); độc và treo cổ vẫn chết.
- **Thằng Ngốc** bị vote treo cổ thì lật bài, sống, nhưng mất quyền vote (`game.revealedIdiots`, `VerdictRecord.idiotRevealed`).

Vai dân làng đặc biệt thêm:

- **Người Sói Lai** (`lycan`) thuộc phe dân nhưng Tiên tri soi ra Sói (`seenAsWolf: true`).
- **Chị Em** (`sister`, phải đủ 2 người, `err.sistersPair`) biết nhau từ đầu (`MeView.teammates`, thấy nhau là "Chị Em" theo vai được chia).
- **Đứa Trẻ Hoang** (`wildChild`) đêm đầu chọn thần tượng (`game.wildModels`). Thần tượng chết (đêm, treo cổ, thợ săn, quản trò) thì `applyDeaths` đổi vai đứa trẻ thành `werewolf` (`game.wildTurned`).
- **Thầy Đồng** (`medium`) mỗi đêm gọi hồn một người đã chết, biết chính xác vai (`SeerResult.roleId`). Bước này chỉ được gọi khi đã có người chết (`NightBehaviour.needsDead`).

Phe và bầy Sói: `RoleDef.team` là phe thắng (`wolves` / `village` / `solo`, `teamOf()`), còn `isWolf()` là "thuộc bầy" (`RoleDef.pack`, mặc định = phe Sói): thức dậy cắn cùng bầy, biết nhau, không bị bầy cắn, được tính là Sói khi đếm đa số. Kẻ Phản Bội thuộc phe Sói nhưng không thuộc bầy; Sói Trắng thuộc bầy nhưng phe solo.

- **Trưởng Làng** (`voteWeight: 2`): phiếu tính gấp đôi ở cả vote lên dàn lẫn vote treo (`tallyNomination` / `tallyVerdict` nhận `weights`).
- **Sói To Xấu Xa** cắn cùng bầy, rồi bước riêng cắn thêm một người (`NightInput.extraBite`, Phù thủy không cứu được) cho tới khi có một con Sói chết (`packHasLost`).
- **Kẻ Phản Bội** (`pack: false`) biết bầy Sói (`MeView.teammates`), bầy không biết hắn, Tiên tri soi ra dân. Khi đếm đa số hắn được tính là người.
- **Hiệp Sĩ Rỉ Sét**: bị Sói cắn chết thì `game.rustNight` = đêm sau; cuối đêm đó một con Sói ngẫu nhiên chết (`cause: "rust"`).
- **Sói Bịt Miệng** cắn cùng bầy và mỗi đêm chọn một người: hôm sau người đó không chat, không mic, không vote (`game.silenced`, `isSilenced`, `canSpeak` → `err.silenced`, công khai qua `PlayerView.silenced`).
- **Kẻ Chán Đời** (solo): bị dân treo cổ thì thắng một mình (`game.tannerWin` → winner `tanner`).
- **Sói Trắng** (solo, `pack: true`): cắn cùng bầy, đêm chẵn được giết một con Sói (`NightBehaviour.nights`).
- **Sát Nhân Hàng Loạt** (solo): mỗi đêm giết một người (`cause: "killer"`, chỉ Bảo vệ chặn được), Sói cắn không chết (`biteImmune`).
- **Kẻ Phóng Hỏa** (solo): mỗi đêm tưới xăng một nhà (`game.doused`) hoặc châm lửa đốt hết nhà đã tưới (`cause: "fire"`, không gì chặn được).

Sát thủ solo (`soloKiller`) thắng khi chỉ còn mình, hoặc còn 1 đối 1 với người không giết được ai. Khi họ còn sống thì cả dân lẫn Sói đều chưa thắng. Winner của vai solo là id của vai đó (`SoloWinner`). Vai có thể bỏ lượt (`optional`) gửi `targets: []`.

Thứ tự đêm đã lưu từ trước (thiếu bước mới) được `completeNightOrder()` tự chèn bước mới vào đúng chỗ.

Sau mỗi lần có người chết (đêm, treo cổ, thợ săn, quản trò can thiệp) `checkWin` chạy; kết quả chỉ được công bố khi Host bấm **Công bố** (hoặc chọn **Chơi tiếp**).

## 5. Thêm vai mới

1. Thêm id vào `RoleId` (và `NightStepId` nếu vai thức dậy ban đêm) trong `shared/types.ts`.
2. Thêm `RoleDef` vào `ROLES` trong `shared/roles.ts` (phe, emoji, `night.order`, `validTargets`…).
3. Nếu vai có hành động đêm mới: xử lý trong `nightAction()` (`shared/engine.ts`) và (nếu ảnh hưởng tử vong) trong `resolveNight()`.
4. Thêm `roles.<id>.name|desc|action` và `script.step.<id>` vào `messages/vi.json` + `messages/en.json`. Test `i18n.test.ts` sẽ báo nếu thiếu.
