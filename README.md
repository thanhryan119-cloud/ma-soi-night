# Ma Sói Online by Ryan

Web app realtime giúp quản trò (Host) tổ chức một buổi chơi Ma Sói **trực tiếp**: Host chiếu mã QR, người chơi quét bằng điện thoại, nhận vai bí mật, thao tác ban đêm và bỏ phiếu ban ngày — tất cả trên điện thoại. Song ngữ Tiếng Việt / English.

- **Host** (`/host/CODE`): sảnh chờ + QR, cấu hình & chia vai, bảng điều khiển game (pha, lời dẫn, đồng hồ, nhật ký, can thiệp), nhạc nền.
- **Màn trình chiếu** (`/screen/CODE`): chỉ thông tin công khai, hỗ trợ hiển thị song ngữ.
- **Người chơi** (`/join/CODE`): mobile-first, thẻ vai nhấn-giữ-để-xem, nút giả ban đêm, rung khi đến lượt, tự vào lại sau khi reload/mất mạng.
- **Bot giả lập**: thêm bot để một mình test ván 8 người trên một máy.

Kiến trúc, data model và danh sách sự kiện realtime: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Realtime: **Socket.IO** trên một Node server riêng (`server/index.ts`) — server là nguồn sự thật duy nhất, mỗi client chỉ nhận đúng phần dữ liệu được phép thấy.
- i18n: `next-intl` — toàn bộ chữ nằm trong `messages/vi.json` và `messages/en.json`.
- QR: `qrcode.react` · Test: `vitest`

## Chạy local

Yêu cầu Node.js ≥ 20.

```powershell
npm install
```

```powershell
npm run dev
```

Lệnh trên chạy song song:

| Tiến trình | Địa chỉ |
|---|---|
| Web (Next.js) | http://localhost:3000 |
| Socket server | http://localhost:4000 (`/health`, `/info`) |

Mở http://localhost:3000 → **Tạo phòng**.

### Chơi thật với điện thoại trong cùng Wi‑Fi

Điện thoại không vào được `localhost` của laptop. Khi Host mở bằng `localhost`, app tự tìm IP LAN (ví dụ `http://192.168.1.20:3000`) và dùng nó cho mã QR — có ô chọn lại địa chỉ nếu máy có nhiều mạng. Nếu Windows Firewall hỏi, hãy cho phép Node.js truy cập mạng riêng (Private) cho cổng 3000 và 4000.

### Test một mình với bot

Ở sảnh chờ bấm **Thêm bot đủ 8 người** → **Chia vai ngẫu nhiên** → **Bắt đầu**. Bot tự hành động (đêm, vote, thợ săn) qua đúng đường kiểm tra như người thật. Mở thêm một tab `/join/CODE` (hoặc điện thoại) nếu muốn tự chơi cùng 7 bot; Host có thể đổi tay vai của bất kỳ ai ở sảnh.

## Test

```powershell
npm test
```

- `tests/night.test.ts` — xử lý kết quả đêm (bảo vệ, cứu, độc, cặp đôi, thợ săn) và đồng thuận của Sói.
- `tests/votes.test.ts` — đếm phiếu lên dàn (top 1 / top N / ngưỡng, các luật hòa phiếu), vote sống/chết (đa số tương đối / tuyệt đối), điều kiện thắng.
- `tests/engine.test.ts` — luồng game, chống vote hai lần, kiểm tra đúng pha/đúng vai, **bảo mật vai** (view của người chơi không chứa vai người khác, không lộ token), và 30 ván mô phỏng 8 bot chơi đến hết.
- `tests/i18n.test.ts` — `vi.json` và `en.json` có **cùng bộ key**, cùng placeholder, không chuỗi rỗng, và mọi key tĩnh dùng trong code đều tồn tại.

```powershell
npm run typecheck
```

## Deploy

App gồm 2 phần deploy riêng:

### 1. Socket server → Railway (hoặc Render)

- Repo gốc, **Start command**: `npm run server` (Build command: `npm install`).
- Biến môi trường:
  - `PORT` — Railway/Render tự cấp.
  - `CORS_ORIGIN` — domain web, ví dụ `https://ma-soi.vercel.app` (nhiều domain cách nhau bằng dấu phẩy).
  - `DATA_FILE` *(tùy chọn)* — đường dẫn file snapshot, ví dụ `/data/rooms.json` nếu gắn Volume, để phòng sống sót qua lần redeploy.
  - `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` *(tùy chọn)* — bật cửa hàng (xem mục Cửa hàng bên dưới).
  - `PUBLIC_WEB_URL` *(tùy chọn)* — domain web để payOS đưa người mua quay về, ví dụ `https://ma-soi.vercel.app`.
  - `ADMIN_EMAILS` *(tùy chọn)* — email Google được vào trang quản lý mã giảm giá `/admin/codes` (nhiều email cách nhau bằng dấu phẩy).
- Kiểm tra: `https://<server>/health` trả `{"ok":true}`.

**Cập nhật server sau khi sửa code** (Railway CLI đã đăng nhập một lần bằng `npx @railway/cli login`):

```powershell
npm run deploy:server
```

### 2. Web → Vercel

- Import repo, framework **Next.js** (mặc định).
- Biến môi trường: `NEXT_PUBLIC_SOCKET_URL=https://<socket-server-của-bạn>`.

## Cửa hàng (payOS)

Font tên, hiệu ứng tên và khung avatar (trừ mặc định) được bán qua [payOS](https://payos.vn), **50.000đ mỗi món** (`ITEM_PRICE_VND` trong `shared/cosmetics.ts`). Mua một lần, món đồ gắn với tài khoản Google và tự đeo ngay. Khách chưa đăng nhập vẫn thử xem trước được nhưng phải đăng nhập mới mua.

1. Tạo kênh thanh toán trên https://my.payos.vn, lấy *Client ID*, *API Key*, *Checksum Key* và đặt vào biến môi trường của socket server.
2. Trong kênh thanh toán, đặt **Webhook URL** = `https://<socket-server>/payos/webhook` (payOS gửi thử một đơn mẫu, server trả 200).
3. Khi chạy local, webhook không tới được máy bạn: lúc người mua quay về `/profile?order=…`, server tự hỏi payOS trạng thái đơn nên vẫn mở khoá được.

### Mã giảm giá

Trang **`/admin/codes`** (nút "Quản lý mã giảm giá" ở trang Hồ sơ) dành cho email trong `ADMIN_EMAILS`. Sau khi thêm email, hãy đăng xuất rồi đăng nhập Google lại để server ghi nhận email. Ở trang này có thể tạo mã giảm theo % hoặc theo số tiền, giới hạn tổng lượt dùng, đặt ngày hết hạn, tạm dừng hoặc xoá mã, và xem số lượt đã dùng cùng doanh thu của từng mã. Mỗi tài khoản chỉ dùng mỗi mã một lần; lượt dùng được tính khi thanh toán xong. Mã giảm 100% (hoặc giảm từ 50.000đ trở lên) mở khoá món ngay, không qua payOS. Người mua nhập mã ở khung mua ("Có mã giảm giá?"). Mã lưu ở `codes.json`.

Server luôn kiểm tra quyền sở hữu (vào phòng, đổi hồ sơ, `PATCH /me`), nên món chưa mua không hiện cho người khác dù máy khách gửi lên. Bot vẫn đeo đồ ngẫu nhiên để khoe hàng. Đơn hàng lưu ở `orders.json`, món đã mua lưu trong `users.json` (cùng thư mục `DATA_FILE`).

## Cấu trúc thư mục

```
shared/          Logic dùng chung server + client (TypeScript thuần)
  types.ts       Data model: Room, Player, Phase, Game, Vote, LogEntry, actions
  roles.ts       Đăng ký vai dạng plugin + cấu hình gợi ý theo số người
  rules.ts       Hàm thuần: resolveNight, cascadeDeaths, tallyNomination, tallyVerdict, checkWin
  engine.ts      State machine & kiểm tra mọi hành động
  views.ts       Lọc state cho từng người xem (host / player / screen)
  bots.ts        Bot giả lập
server/index.ts  Socket.IO server, lưu snapshot, dọn phòng sau 12h
messages/        vi.json, en.json
src/app/         Trang Next.js: / , /host/[code], /screen/[code], /join/[code]
src/components/  UI host, player, screen
tests/           Vitest
```

## Ghi chú vận hành

- Phòng tự hủy sau **12 giờ** không hoạt động.
- Trạng thái phòng được ghi ra `.data/rooms.json` (≈1 giây sau mỗi thay đổi) và khôi phục khi server khởi động lại; client tự kết nối lại và vào đúng người, đúng vai.
- Hỗ trợ 4–20 người chơi mỗi phòng.
