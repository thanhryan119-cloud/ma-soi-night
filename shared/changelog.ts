// What changed in each version, newest first. The first entry is the app's
// version. Every version also lands in each player's mailbox as a letter.
// Add a new entry at the top for every release.

export interface Release {
  version: string;
  /** yyyy-mm-dd */
  date: string;
  title: { vi: string; en: string };
  items: { vi: string[]; en: string[] };
}

export const CHANGELOG: Release[] = [
  {
    version: "1.10.4",
    date: "2026-11-27",
    title: { vi: "Trang chủ gọn hơn", en: "A tidier home page" },
    items: {
      vi: [
        "Bảng người online và bảng xếp hạng lên trước, bốn ô giới thiệu chuyển xuống bên dưới.",
        "Trên máy tính, bảng người online cao bằng bảng xếp hạng, đông người thì cuộn bên trong.",
        "Ô giới thiệu đầu tiên đổi thành Chơi ngay trên web, muốn thì cài lên màn hình chính.",
      ],
      en: [
        "The online list and the leaderboard come first, the four intro boxes moved below them.",
        "On a computer the online list is as tall as the leaderboard and scrolls inside when it is busy.",
        "The first intro box now says Play in the browser, and you can still add it to your home screen.",
      ],
    },
  },
  {
    version: "1.10.3",
    date: "2026-11-27",
    title: { vi: "Chỉnh vai không cần cuộn", en: "Set up roles without scrolling" },
    items: {
      vi: [
        "Trên máy tính, phần chỉnh vai của chủ phòng vừa khít màn hình, không phải cuộn lên xuống.",
        "Bảng Vai trong ván liệt kê đủ các vai sẽ có và báo số vai đã khớp số người chưa.",
        "Vai chia thành ba thẻ Cơ bản, Nâng cao, Phe thứ 3, mỗi vai là một ô nhỏ có nút cộng trừ.",
        "Nút thêm bot và xóa bot nằm chung hàng với nút Bắt đầu.",
        "Nút xúc xắc cạnh các map chia ngay một bộ vai ngẫu nhiên.",
      ],
      en: [
        "On a computer the owner's role setup fits the screen, no scrolling up and down.",
        "The Roles in play box lists every role in the game and says whether the count matches the players.",
        "Roles sit in three tabs, Basic, Advanced and Third party, each one a small tile with plus and minus.",
        "Add bots and remove bots sit on the same row as Start.",
        "The dice next to the maps deals a random set of roles right away.",
      ],
    },
  },
  {
    version: "1.10.2",
    date: "2026-11-27",
    title: { vi: "Chủ phòng chuẩn bị ván gọn hơn", en: "A tidier setup for the room owner" },
    items: {
      vi: [
        "Nút Bắt đầu và Chơi liền với bot nhỏ lại, nằm chung một hàng.",
        "Chia sẻ link và Cài đặt phòng chuyển lên cạnh tiêu đề, phần bot và vai có nhiều chỗ hơn.",
        "Chạm vào một map gợi ý là dùng luôn, không cần bấm thêm nút.",
        "Trong phòng chờ không còn ô lời dẫn của quản trò, ô này hiện ra khi ván bắt đầu.",
      ],
      en: [
        "The Start and Play now with bots buttons are smaller and sit on one row.",
        "Share link and room settings moved up next to the title, so bots and roles get more room.",
        "Tap a suggested map to use it right away, no extra button.",
        "The narrator box no longer shows in the waiting room, it appears once the game starts.",
      ],
    },
  },
  {
    version: "1.10.1",
    date: "2026-11-27",
    title: { vi: "Lá bài lật ra ngay trong ván", en: "Role cards turn over during the game" },
    items: {
      vi: [
        "Sáng ra, dưới mỗi người nằm xuống có một lá bài. Lộ vai thì lá lật ngửa, giữ bí mật thì lá úp.",
        "Người bị treo cổ và Thằng ngốc lộ mặt cũng lật bài trên màn hình chung.",
        "Sói tiên tri và Đồng cốt thấy luôn lá bài của người vừa soi.",
        "Tới lượt mình ban đêm, lá bài của bạn hiện cạnh lời nhắc.",
        "Hết ván, cả bàn lật bài lần lượt từng người.",
        "Chạm vào tên một vai để xem lá bài kèm lời giải thích.",
      ],
      en: [
        "At dawn each fallen player gets a card, face up when roles are revealed and face down when they stay secret.",
        "The hanged player and a revealed Idiot turn their card over on the shared screen.",
        "The Wolf Seer and the Medium see the card of the player they looked at.",
        "When your night turn comes, your own card shows next to the prompt.",
        "At the end of the game the whole table turns their cards over one by one.",
        "Tap a role name to see its card along with what it does.",
      ],
    },
  },
  {
    version: "1.10.0",
    date: "2026-11-27",
    title: { vi: "Vào trận nhanh hơn, không còn chờ chủ phòng", en: "Faster games, no more waiting on the owner" },
    items: {
      vi: [
        "Đủ 4 người là phòng tự đếm ngược 45 giây rồi bắt đầu, thiếu ghế thì bot vào cho đủ. Chủ phòng vẫn có thể bấm Đợi thêm.",
        "Chủ phòng bỏ đi mà không bấm gì quá 90 giây thì người khác được bấm Nhận làm chủ phòng. Sau 3 phút phòng tự chuyển cho người chờ lâu nhất.",
        "Phòng ít người lâu thì hiện gợi ý thêm bot. Người chơi có thể nhắc chủ phòng thêm bot chỉ bằng một nút.",
        "Bấm Chơi ngay khi chưa có phòng nào đang chờ sẽ mở phòng mới cho bạn, người đến sau vào chung. Ghép nhanh luôn ưu tiên phòng đông người nhất.",
        "Trang chủ hiện số người đang chờ ván, bấm vào là vào ngay.",
      ],
      en: [
        "Once 4 people are in, the room counts down 45 seconds and starts, with bots in any empty seats. The owner can still tap Wait longer.",
        "If the owner walks away for 90 seconds, others can tap Take over the room. After 3 minutes the room passes to whoever has waited longest.",
        "A room that stays small suggests adding bots, and players can ask the owner for bots with one tap.",
        "Tapping Play now when no room is waiting opens a new one for you, and the next people join you there. Quick join always picks the fullest room.",
        "The home page shows how many people are waiting for a game, tap it to join.",
      ],
    },
  },
  {
    version: "1.9.1",
    date: "2026-11-27",
    title: { vi: "Thẻ cà phê có ảnh đại diện của sốp", en: "The coffee card gets the dev avatar" },
    items: {
      vi: ["Thẻ mã QR cà phê giờ có ảnh đại diện của sốp ở mép trên, mã QR vẫn để trống để app ngân hàng quét dễ.", "Bỏ dòng tên chủ tài khoản dưới mã QR cho gọn."],
      en: ["The coffee QR card now shows the dev avatar on its top edge, leaving the QR code clear so banking apps read it easily.", "The account holder name under the QR is gone for a cleaner card."],
    },
  },
  {
    version: "1.9.0",
    date: "2026-11-27",
    title: { vi: "Sổ Tiên Tri cho người đã chết", en: "The Ghosts' Prophecy for dead players" },
    items: {
      vi: [
        "Chết rồi vẫn có việc để làm. Bấm 🔮 Tiên tri để đoán đêm nay ai nằm xuống, hôm nay ai lên giá treo và phe nào sẽ thắng.",
        "Đoán trúng điều ít hồn ma khác chọn thì càng nhiều điểm, trúng 3 lần liên tiếp được thêm một nửa. Chọn phe thắng càng sớm càng được nhân nhiều.",
        "Vòng đêm khoá khi bầy Sói chọn xong mồi, vòng ngày khoá khi có kết quả đề cử, nên không ai đoán ăn gian được.",
        "Sau mỗi vòng, Chat người chết báo bao nhiêu hồn ma đoán trúng và ai ăn đậm nhất.",
        "Cuối ván, hồn ma nhiều điểm nhất được trao danh hiệu Thầy Bói Âm Phủ trên màn kết thúc cho cả bàn cùng xem.",
        "Người xem ván cũng chơi được. Tỉ lệ đoán trúng và số lần làm Thầy Bói được lưu vào hồ sơ, kèm nhiệm vụ mới để nhận vàng.",
      ],
      en: [
        "Dying no longer means sitting idle. Tap 🔮 Prophecy to guess who dies tonight, who hangs today and which side will win.",
        "A right guess few other ghosts made scores more, and three right in a row earn half again. The earlier you pick the winning side, the bigger the multiplier.",
        "Night bets close once the wolves pick their prey and day bets close when the nominations are in, so nobody can peek.",
        "After each round the dead players' chat says how many ghosts guessed right and who scored the most.",
        "At the end of the game the top ghost is crowned the Underworld Fortune Teller on the results screen for the whole table.",
        "Spectators can play too. Your accuracy and Fortune Teller titles are saved to your profile, with new quests that pay gold.",
      ],
    },
  },
  {
    version: "1.8.2",
    date: "2026-11-27",
    title: { vi: "Danh sách phòng ngay trang chủ, mời sốp ly cà phê", en: "Rooms on the home page, buy the dev a coffee" },
    items: {
      vi: [
        "Trang chủ hiện luôn danh sách phòng đang mở và đang chơi, bấm Vào là ngồi ngay hoặc Xem nếu ván đã bắt đầu.",
        "Nút ☕ Mời sốp ly cà phê nằm ngay dưới nút Vào chơi ngay. Bấm vào là có mã QR để quét bằng app ngân hàng, có cả nút tải ảnh QR và chép số tài khoản.",
        "Mọi vai và mọi món trang trí vẫn miễn phí cho tất cả mọi người.",
      ],
      en: [
        "The home page now lists the open rooms and the games in progress. Tap Join to take a seat, or Watch once a game has started.",
        "A ☕ Buy the dev a coffee button sits right under Play now. It shows a QR code to scan with your banking app, with buttons to download the QR and copy the account number.",
        "Every role and every cosmetic is still free for everyone.",
      ],
    },
  },
  {
    version: "1.8.1",
    date: "2026-11-27",
    title: { vi: "Mọi nhân vật và hiệu ứng giờ miễn phí", en: "Every role and effect is now free" },
    items: {
      vi: [
        "Cửa hàng đã đóng. Mọi vai đặc biệt mở cho mọi phòng, mỗi ngày, không cần thẻ vai.",
        "Mọi font, hiệu ứng tên, khung avatar, khung chat và nền thẻ hồ sơ đều dùng được miễn phí, kể cả khi chưa đăng nhập.",
        "Thêm trang Ủng hộ (nút 💝). Nếu muốn giúp duy trì máy chủ, bạn quét mã QR ngay trên trang để chuyển khoản. Ủng hộ là tự nguyện và không mở khoá gì thêm.",
        "Vàng từ nhiệm vụ giờ là điểm thành tích để khoe.",
      ],
      en: [
        "The shop is closed. Every special role is open in every room, every day, no role card needed.",
        "Every font, name effect, avatar frame, chat decoration and card background is free to use, even without signing in.",
        "New Donate page (the 💝 button). If you want to help keep the servers running, scan the QR code right on the page to send a bank transfer. Donations are voluntary and unlock nothing extra.",
        "Gold from quests is now a score to show off.",
      ],
    },
  },
  {
    version: "1.8.0",
    date: "2026-11-27",
    title: { vi: "Hiệu ứng âm thanh cho cả ván chơi", en: "Sound effects for the whole game" },
    items: {
      vi: [
        "Sói hú khi màn đêm buông xuống, chuông và chim hót lúc trời sáng, tiếng kêu thất thanh khi có người bị giết trong đêm.",
        "Tiếng búa gõ khi mở vote, tiếng đóng dấu khi bạn bỏ phiếu, tiếng gõ nhẹ mỗi khi người khác vote.",
        "Trống dồn và tiếng sập cửa khi treo cổ, tiếng súng của thợ săn, tiếng tích tắc 5 giây cuối và kèn chiến thắng hay nhạc buồn lúc hết ván.",
        "Mỗi nút bấm có tiếng click nhẹ, và điện thoại reo khẽ khi tới lượt bạn bỏ phiếu hay bắn súng.",
        "Ban đêm điện thoại người chơi im lặng hoàn toàn, không click, không rung, không báo lượt, không tiếng chọn mục tiêu, để ngồi chung bàn cũng không ai đoán được ai có chức năng đêm.",
        "Bấm nút 🔔 ở góc trên để tắt hoặc bật hiệu ứng, máy sẽ nhớ lựa chọn của bạn.",
      ],
      en: [
        "Wolves howl as night falls, a bell and birdsong greet the dawn, and a scream rings out when someone was killed in the night.",
        "A gavel opens each vote, a stamp lands when you cast yours, and a soft tap sounds as others vote.",
        "A drum roll and trapdoor for the hanging, the hunter's gunshot, ticking in the last 5 seconds and a fanfare or a dirge when the game ends.",
        "Every button gives a soft click, and your phone chimes when it is your turn to vote or shoot.",
        "At night players' phones stay fully silent, with no clicks, no vibration, no turn chime and no sound for picking a target, so nobody at the same table can tell who has a night role.",
        "Tap the 🔔 button at the top to mute or unmute the effects, and your device remembers the choice.",
      ],
    },
  },
  {
    version: "1.7.9",
    date: "2026-11-27",
    title: { vi: "Bảng xếp hạng mới, xếp riêng theo từng phe", en: "New leaderboard, ranked by faction too" },
    items: {
      vi: [
        "Bảng xếp hạng có giao diện mới, ba người dẫn đầu đứng trên bục, người hạng nhất ở giữa.",
        "Thêm các hạng mục xếp theo tỉ lệ thắng khi chơi Phe Sói, Phe Dân và Phe độc lập, bên cạnh hạng mục Tổng.",
        "Cần ít nhất 5 ván ở Phe Sói hoặc Phe Dân, hoặc 3 ván ở Phe độc lập, để có tên trong hạng mục đó. Cặp đôi của Thần Tình Yêu tính vào Phe độc lập.",
      ],
      en: [
        "The leaderboard has a new look, with the top three on a podium and first place in the middle.",
        "New categories rank players by their win rate on the Werewolf team, the Village team and Solo roles, next to the Overall ranking.",
        "You need at least 5 games on the Werewolf or Village team, or 3 Solo games, to show up in that category. Cupid's lovers count as Solo.",
      ],
    },
  },
  {
    version: "1.7.8",
    date: "2026-11-27",
    title: { vi: "Nền thẻ hồ sơ hiện ở danh sách online và bảng xếp hạng", en: "Profile card backgrounds in the online list and leaderboard" },
    items: {
      vi: [
        "Mỗi người trong danh sách đang online, ở trang chủ, sảnh chờ và khung chat máy chủ, giờ hiện nền thẻ hồ sơ của họ phía sau dòng tên.",
        "Bảng xếp hạng cũng hiện nền thẻ hồ sơ trên cả dòng của từng người.",
        "Cột tên trong bảng xếp hạng rộng hơn nên tên không còn bị cắt chỉ còn vài chữ.",
      ],
      en: [
        "Everyone in the online list, on the home page, in the lobby and in the server chat, now shows their profile card background behind their row.",
        "The leaderboard shows each player's card background across their whole row too.",
        "The name column in the leaderboard is wider, so names are no longer cut down to a few letters.",
      ],
    },
  },
  {
    version: "1.7.7",
    date: "2026-11-27",
    title: { vi: "Đồ trang trí giảm còn 29.000đ", en: "Decor on sale at 29,000 VND" },
    items: {
      vi: [
        "Mọi món trang trí trong cửa hàng giờ chỉ còn 29.000đ thay vì 49.000đ, giảm 41%. Gồm font tên, hiệu ứng tên, khung avatar, nền chat và nền thẻ hồ sơ.",
        "Mã giảm giá vẫn dùng được và được trừ tiếp trên giá mới.",
        "Thẻ vai đặc biệt vẫn giữ giá 49.000đ, mua theo bộ vẫn được giảm 20%.",
      ],
      en: [
        "Every decor item in the shop is now 29,000 VND instead of 49,000 VND, 41% off. That covers name fonts, name effects, avatar frames, chat backgrounds and profile card backgrounds.",
        "Discount codes still work and come off the new price.",
        "Special role cards stay at 49,000 VND, and bundles are still 20% off.",
      ],
    },
  },
  {
    version: "1.7.6",
    date: "2026-11-27",
    title: { vi: "Chơi mượt hơn trên Safari và iPhone", en: "Smoother on Safari and iPhone" },
    items: {
      vi: [
        "Nền trời đêm được vẽ lại theo cách nhẹ hơn, nên trên Safari và iPhone game không còn giật khi sao nhấp nháy hay mắt sói hiện ra.",
        "Trời sao, mặt trăng và những cặp mắt sói vẫn y như cũ.",
        "Lúc biện hộ và bỏ phiếu treo cổ trên điện thoại, khung chat luôn chiếm ít nhất nửa màn hình nên không còn bị che mất trên iPhone. Ảnh người bị đề cử nhỏ lại một chút cho gọn.",
      ],
      en: [
        "The night sky backdrop is drawn in a lighter way, so the game no longer stutters on Safari and iPhone while stars twinkle and wolf eyes appear.",
        "The stars, the moon and the wolf eyes look exactly as before.",
        "During the defense and the verdict vote on phones, the chat always keeps at least half the screen, so it no longer disappears on iPhone. Nominee pictures are a little smaller to make room.",
      ],
    },
  },
  {
    version: "1.7.5",
    date: "2026-11-27",
    title: { vi: "Nền thẻ, nền chat và hiệu ứng tên vẽ lại", en: "Redrawn card backgrounds, chat decorations and name effects" },
    items: {
      vi: [
        "Mỗi nền thẻ hồ sơ giờ là một bức tranh có chuyển động nhẹ. Trời sao có chòm sao sói và sao băng, Trăng máu có sói tru trên vách đá, Rừng thông có mắt sói lấp ló và đom đóm, Sương mù là nghĩa địa trong sương trôi.",
        "Hoa văn tarot có biểu tượng mặt trời và trăng với tia sáng xoay chậm, Viền vàng có góc chạm hoa văn nạm ngọc và vệt sáng lướt qua.",
        "Nền chat có thêm chi tiết riêng. Bầu sao lấp lánh, Trăng khuyết treo ở góc, Vệt máu nhỏ giọt, Băng giá có cột băng rủ, Than hồng có lửa và tàn lửa bay, Viền vàng có góc chạm hoa văn.",
        "Hiệu ứng tên đậm nét hơn. Máu có giọt rỉ xuống, Chập chờn như ánh nến, Ánh bạc và Nhiễu sóng sắc hơn.",
        "Món mới là hiệu ứng tên Lửa cháy và Dát vàng, nền chat Dấu chân sói, nền thẻ Làng đêm với cửa sổ sáng đèn và khói bếp.",
      ],
      en: [
        "Every profile card background is now a small moving picture. Starry sky has a wolf constellation and a shooting star, Blood moon a wolf howling on a cliff, Pine forest wolf eyes and fireflies in the dark, Mist a graveyard in drifting fog.",
        "Tarot pattern has a sun and moon emblem with slowly turning rays, Gold trim has jewelled corners and a glint that sweeps across.",
        "Chat backgrounds have their own details. Starry sky twinkles, Crescent moon hangs off the corner, Blood streaks drip, Frost grows icicles, Embers have flames and rising sparks, Gold trim has carved corners.",
        "Name effects are bolder. Blood drips, Flicker burns like a candle, Silver shimmer and Glitch are sharper.",
        "New items are the Fire and Gold leaf name effects, the Wolf tracks chat background and the Night village card with lit windows and chimney smoke.",
      ],
    },
  },
  {
    version: "1.7.4",
    date: "2026-11-27",
    title: { vi: "Khung avatar vẽ lại và bốn khung mới", en: "Redrawn avatar frames and four new ones" },
    items: {
      vi: [
        "Mọi khung avatar trong cửa hàng được vẽ lại nhiều lớp và chi tiết hơn, mỗi khung có hiệu ứng chuyển động nhẹ riêng.",
        "Viền trắng thành Viền bạc đánh bóng có đinh tán và vệt sáng chạy quanh.",
        "Viền máu nhỏ giọt, Viền kép có mặt số xoay, Trăng khuyết lấp lánh sao, Gai thành bụi gai móc có giọt máu, Nhịp tim có đường điện tim chạy quanh.",
        "Bốn khung mới là Vương miện vàng nạm ngọc, Băng giá, Ấn cổ với vòng chữ rune xoay và Tai sói lông xám.",
        "Khung vẫn rõ ở mọi cỡ, từ danh sách người chơi tới thẻ hồ sơ. Ai đã mua khung cũ vẫn giữ nguyên.",
      ],
      en: [
        "Every avatar frame in the shop is redrawn with more layers and detail, and each one has its own gentle motion.",
        "White ring is now a polished Silver bezel with studs and a glint that runs round it.",
        "Blood ring drips, Double ring has a turning dial, Crescent moon twinkles with stars, Thorns is a hooked bramble with drops of blood, Heartbeat has a pulse trace running round it.",
        "Four new frames, a jewelled Royal crown, Frost, Ancient runes with a turning ring of runes, and grey-furred Wolf ears.",
        "Frames stay clear at every size, from the player list to the profile card. Frames you already bought are still yours.",
      ],
    },
  },
  {
    version: "1.7.3",
    date: "2026-11-27",
    title: { vi: "Cảnh báo bộ vai lệch phe", en: "A warning for lopsided setups" },
    items: {
      vi: [
        "Khi tự chọn hoặc tự gán vai làm một phe mạnh hơn hẳn, phần cấu hình vai báo ngay phe nào đang lấn át và mức độ lệch.",
        "Cảnh báo ghi rõ lý do, ví dụ quá nhiều sói, thiếu Tiên tri hay có vai quá mạnh.",
        "Kèm gợi ý đổi vài vai để hai phe cân lại, chỉ cần bấm một nút để áp dụng, hoặc dùng luôn bộ vai chuẩn.",
      ],
      en: [
        "When the roles you pick or hand out make one side much stronger, the role setup now says which side leads and by how much.",
        "The warning explains why, such as too many wolves, no Seer or a role that is too strong.",
        "It suggests a few role swaps to even the sides that you apply with one button, or you can switch to the standard setup.",
      ],
    },
  },
  {
    version: "1.7.2",
    date: "2026-11-27",
    title: { vi: "Cửa hàng mới, mỗi món chỉ 49.000đ", en: "A new shop, every item now 49,000 VND" },
    items: {
      vi: [
        "Mỗi món trong cửa hàng giảm từ 50.000đ còn 49.000đ.",
        "Cửa hàng được làm lại với banner mới, menu theo bạn khi cuộn và lời giới thiệu cho từng mục.",
        "Bộ thẻ vai liệt kê từng vai kèm một dòng nói vai đó làm gì, cùng số tiền bạn tiết kiệm khi mua theo bộ.",
        "Đóng được từng cuộc trò chuyện riêng trong khung chat. Khi người đó nhắn mới thì cuộc trò chuyện tự hiện lại.",
      ],
      en: [
        "Every item in the shop drops from 50,000 VND to 49,000 VND.",
        "The shop is redone with a new banner, a menu that follows you as you scroll and a line about each section.",
        "Role card bundles list every role with a line about what it does, and how much you save by buying the bundle.",
        "Private conversations in the chat box can be closed one by one. They come back when that person writes again.",
      ],
    },
  },
  {
    version: "1.7.1",
    date: "2026-11-27",
    title: { vi: "Nick nhanh và rủ nhau chơi từ sảnh chờ", en: "Quick accounts and getting a game going from the lobby" },
    items: {
      vi: [
        "Danh sách người đang online nằm ngay dưới danh sách phòng trong sảnh chờ.",
        "Cạnh mỗi người có nút Kết bạn, Xin vào phòng họ đang chờ, Xem ván họ đang chơi và Rủ chơi để tạo phòng mới rồi mời họ vào.",
        "Khi có người xin vào, bạn thấy một thẻ để cho họ vào phòng chỉ bằng một chạm.",
        "Nút Đăng xuất ở cuối trang hồ sơ của bạn.",
        "Vào sảnh hay Chơi ngay cần đăng nhập trước, bằng Google hoặc nick nhanh với tên đăng nhập và mật khẩu.",
        "Nick nhanh liên kết được với Google ở trang hồ sơ, hoặc tự liên kết khi bấm nút đăng nhập Google lúc đang dùng nick đó.",
      ],
      en: [
        "Who is online now sits right under the room list in the lobby.",
        "Each person has buttons to add them as a friend, ask to join the room they wait in, watch their game, or make a new room and invite them.",
        "When someone asks to join, a card lets you bring them in with one tap.",
        "A Sign out button at the bottom of your profile page.",
        "The lobby and Play now ask you to sign in first, with Google or a quick account made from a login name and a password.",
        "A quick account can link Google from the profile page, or links it by itself when you press a Google sign-in button while using it.",
      ],
    },
  },
  {
    version: "1.7.0",
    date: "2026-11-27",
    title: { vi: "Bạn bè, bộ sưu tập vai và lá bài sói mới", en: "Friends, a role collection and new wolf cards" },
    items: {
      vi: [
        "Vẽ lại lá Sói To Xấu Xa, Sói Bịt Miệng, Sói Trắng và Sói Nguyền, cùng một bộ với Ma Sói nhưng dễ phân biệt hơn.",
        "Trang chủ mới với nút Chơi ngay, người đang online, bạn bè và hướng dẫn.",
        "Kết bạn, nhắn tin riêng và mời bạn vào phòng từ danh sách online.",
        "Bộ sưu tập vai, lá bài lên đồng, bạc, vàng, cầu vồng theo số trận thắng. Chạm vào lá để đọc vai làm gì.",
        "Xếp hạng tách Thường và Chuẩn, mọi ván đều được ghi lại.",
        "Xem lại ván cũ từ lịch sử trận đấu.",
        "Người xem có thể vào xem ván đang chơi và chat với người chết.",
        "Bộ vai dựng sẵn để chọn nhanh khi tạo phòng.",
        "Chủ phòng có thể nhường phòng cho người khác.",
        "Chat phòng được giữ qua các ván và không mất khi server khởi động lại.",
        "Nền thẻ hồ sơ, món trang trí mới trong cửa hàng. Sửa hồ sơ trong một cửa sổ riêng.",
        "Biểu tượng ứng dụng và gợi ý cài lên điện thoại.",
        "Máy dùng tiếng Anh sẽ mở game bằng tiếng Anh.",
        "Gọi vai ban đêm nhanh hơn, giọng quản trò đọc được trên điện thoại.",
      ],
      en: [
        "Redrawn Big Bad Wolf, Silencer, White Wolf and Cursed Wolf cards, one set with the Werewolf but easier to tell apart.",
        "A new home page with a Play now button, who's online, friends and a tutorial.",
        "Friends, private messages and room invites from the online list.",
        "A role collection whose cards turn bronze, silver, gold and rainbow with wins. Tap a card to read the role.",
        "Casual and Standard leaderboards, with every game recorded.",
        "Replay past games from the match history.",
        "Spectators can watch a running game and chat with the dead.",
        "Ready-made role setups to pick from when making a room.",
        "Room owners can hand the room to another player.",
        "Room chat stays across games and survives a server restart.",
        "Profile card backgrounds in the shop, and profile editing in its own window.",
        "An app icon and an install prompt on phones.",
        "English devices start the game in English.",
        "Faster night calls, and the narrator's voice works on phones.",
      ],
    },
  },
  {
    version: "1.6.2",
    date: "2026-11-27",
    title: { vi: "Link mời mở thẳng bằng Chrome", en: "Invite links open straight in Chrome" },
    items: {
      vi: [
        "Bấm link mời trong Messenger, Zalo hay Facebook sẽ tự mở bằng Chrome. Máy Android không có Chrome thì mở bằng trình duyệt mặc định.",
        "Trên iPhone, nếu app chặn tự mở thì chạm vào bất kỳ đâu trên trang là sang Chrome.",
      ],
      en: [
        "Invite links tapped in Messenger, Zalo or Facebook open straight in Chrome. Android phones without Chrome use the default browser.",
        "On iPhone, if the app blocks it, tap anywhere on the page to switch to Chrome.",
      ],
    },
  },
  {
    version: "1.6.1",
    date: "2026-11-27",
    title: { vi: "Mở link bằng trình duyệt, hồ sơ gọn hơn", en: "Links open in your browser, a tidier profile" },
    items: {
      vi: [
        "Bấm link mời trong Messenger, Zalo hay Facebook trên Android sẽ tự mở bằng trình duyệt mặc định của máy.",
        "Trên iPhone, link mời có nút Mở bằng Safari hoặc Chrome ngay đầu trang.",
        "Thống kê theo vai trong hồ sơ được thu gọn, bấm Xem theo vai để mở.",
        "Phần Theo phe hiện đủ phe Sói, phe Dân làng và phe độc lập.",
        "Ván làm Cặp đôi được tính cho phe độc lập.",
      ],
      en: [
        "Invite links tapped in Messenger, Zalo or Facebook on Android open in the phone's default browser.",
        "On iPhone, invite links show Open in Safari and Open in Chrome buttons at the top.",
        "Per-role stats on the profile are folded away. Tap Show roles to open them.",
        "The faction row shows Wolves, Village and Independent.",
        "Games as one of Cupid's lovers count for the independent faction.",
      ],
    },
  },
  {
    version: "1.6.0",
    date: "2026-11-26",
    title: { vi: "Phòng chơi gọn gàng, bot chơi hộ, chat người chết", en: "Tidier rooms, stand-in bots, a chat for the dead" },
    items: {
      vi: [
        "Tạo phòng cần đăng nhập Google, mỗi tài khoản giữ 1 phòng. Người vào chơi thì không cần.",
        "Quản trò thoát thì người chơi tiếp theo lên làm quản trò, phòng không bị hủy.",
        "Mỗi người chỉ ngồi 1 phòng một lúc. Phòng tự đóng 10 phút sau khi hết ván hoặc khi mọi người đã rời đi.",
        "Chat chung toàn server ở trang chủ và sảnh online.",
        "Đổi tên thoải mái, cả khi đang chơi.",
        "Thêm bot và phân vai hiện ngay trong phòng chờ, ai cũng thấy.",
        "Loa bật tắt giọng quản trò và phụ đề có ở cả màn người chơi.",
        "Ai không vote thì hết giờ sẽ được vote ngẫu nhiên.",
        "Thanh vai trong ván, ẩn hiện được, giơ chuột hoặc chạm vào vai để xem giải thích.",
        "Người bị đưa lên dàn được biện hộ trên chat suốt lúc biện hộ và lúc vote treo cổ.",
        "Người chết có khung chat riêng, người sống không đọc được. Hết ván ai cũng xem được.",
        "Mất kết nối hoặc không làm lượt của mình quá 1 phút thì bot chơi hộ. Vào lại là chơi tiếp.",
        "Khung chat có mốc Sáng ngày, Đêm để biết ai nói lúc nào.",
        "Có số phiên bản, trang Có gì mới và hộp thư nhận tin cập nhật.",
      ],
      en: [
        "Making a room needs a Google account, one room per account. Joining needs nothing.",
        "If the host leaves, the next player takes over instead of the room closing.",
        "Everyone sits in one room at a time. Rooms close 10 minutes after the game or once everyone has left.",
        "A server-wide chat on the home page and the online lobby.",
        "Change your name any time, even mid-game.",
        "Bots and role setup show right in the lobby, for everyone.",
        "The narrator's speaker and subtitles show on the player screen too.",
        "Anyone who hasn't voted when time runs out votes at random.",
        "A bar with the roles in the game. Fold it away, hover or tap a role to read what it does.",
        "Players on trial can plead in the chat through the defense and the verdict vote.",
        "The dead have a chat of their own the living can't read. Everyone can read it after the game.",
        "Offline or idle on your turn for a minute and a bot plays for you. Come back and carry on.",
        "Day and night markers in the chat show when things were said.",
        "Version numbers, a What's new page and a mailbox for updates.",
      ],
    },
  },
  {
    version: "1.5.0",
    date: "2026-11-25",
    title: { vi: "Mở toàn bộ vai cho mọi người", en: "Every role open to everyone" },
    items: {
      vi: [
        "Mọi vai đều miễn phí cho tất cả. Cửa hàng giữ đồ trang trí.",
        "Gợi ý cách chơi cho từng vai.",
        "Chia vai theo 3 nhóm cơ bản, nâng cao, phe thứ ba. Gợi ý vai dùng mọi vai đã mở.",
        "Bot nói thật hay nói dối tùy phe, và vote theo đó.",
        "Nút Chơi ngay vào thẳng một phòng đang mở.",
        "Bảng xếp hạng hiện mọi tài khoản, ai chơi đủ 5 trận lên đầu.",
        "Lá bài trang chủ nhiều hơn, giơ chuột xem vai làm gì, bấm để rút lá khác.",
      ],
      en: [
        "Every role is free for everyone. The shop keeps the cosmetics.",
        "Play tips for every role.",
        "Roles in three groups, basic, advanced and third party. Suggestions use every open role.",
        "Bots lie or tell the truth by their side, and vote like it.",
        "A Play now button drops you into an open room.",
        "The leaderboard shows every account, players with 5+ games on top.",
        "More home page cards. Hover to see what a role does, click to draw another.",
      ],
    },
  },
  {
    version: "1.4.0",
    date: "2026-11-24",
    title: { vi: "Nhiệm vụ hằng ngày và 13 vai mới", en: "Daily quests and 13 new roles" },
    items: {
      vi: [
        "Nhiệm vụ hằng ngày nhận vàng.",
        "13 vai mới như Người Sói Lai, Chị Em, Đứa Trẻ Hoang, Trưởng Làng, Sói Trắng, Kẻ Phóng Hỏa và nhiều vai khác.",
        "Chat dễ đọc hơn khi cả bàn nói cùng lúc.",
      ],
      en: [
        "Daily quests that pay gold.",
        "13 new roles including the Lycan, the Sisters, the Wild Child, the Mayor, the White Wolf and the Arsonist.",
        "Easier to read chat when everyone talks at once.",
      ],
    },
  },
  {
    version: "1.3.0",
    date: "2026-11-23",
    title: { vi: "Cửa hàng, thẻ bài mới, màn máy tính", en: "Shop, new cards, desktop layout" },
    items: {
      vi: [
        "Cửa hàng trang trí tên, khung ảnh, kiểu chat.",
        "Luật Sói Nguyền và các vai Sói Tiên Tri, Già làng, Thằng Ngốc.",
        "Thẻ bài vẽ lại theo phong cách stencil.",
        "Mỗi người một màu chat, link chia sẻ phòng cho cả nhóm.",
        "Bố cục riêng cho màn hình máy tính.",
      ],
      en: [
        "A shop for name styles, avatar frames and chat looks.",
        "The Cursed Wolf rule plus the Wolf Seer, the Elder and the Village Idiot.",
        "Role cards redrawn in a stencil style.",
        "A chat colour per player and a share link for rooms.",
        "A desktop layout for the game screen.",
      ],
    },
  },
  {
    version: "1.2.0",
    date: "2026-11-20",
    title: { vi: "Sảnh online và quản trò tự động", en: "Online lobby and auto narrator" },
    items: {
      vi: [
        "Sảnh online với phòng máy làm quản trò và mật khẩu phòng.",
        "Quản trò tự động dẫn cả ván.",
        "Bot đọc chat và trả lời.",
        "Lúc biện hộ chỉ người lên dàn được nói.",
        "Thống kê, hồ sơ người chơi và bảng xếp hạng.",
      ],
      en: [
        "An online lobby with machine-hosted rooms and passwords.",
        "The auto narrator runs the whole game.",
        "Bots read and answer the chat.",
        "During the defense only the players on trial may speak.",
        "Stats, player profiles and a leaderboard.",
      ],
    },
  },
  {
    version: "1.1.0",
    date: "2026-11-19",
    title: { vi: "Chat, bảng vẽ, mic và giao diện tarot", en: "Chat, board, mic and the tarot look" },
    items: {
      vi: [
        "Chat, bảng vẽ chung và mic mở lúc thảo luận.",
        "Giọng quản trò đọc từng bước.",
        "Giao diện tarot gothic với mắt sói rình trong đêm.",
      ],
      en: [
        "Chat, a shared drawing board and an open mic during the discussion.",
        "A narrator voice reads every step.",
        "A gothic tarot look with wolf eyes lurking in the dark.",
      ],
    },
  },
  {
    version: "1.0.0",
    date: "2026-11-18",
    title: { vi: "Ra mắt Ma Sói Online", en: "Ma Soi Online launches" },
    items: {
      vi: [
        "Chơi Ma Sói theo thời gian thực, quản trò một máy, người chơi trên điện thoại.",
        "Tài khoản Google, ảnh đại diện và trang trí hồ sơ.",
        "Xem ai vote cho ai sau khi vote kín.",
      ],
      en: [
        "Realtime Werewolf with one host screen and players on their phones.",
        "Google accounts, photo avatars and profile cosmetics.",
        "See who voted for whom after secret votes.",
      ],
    },
  },
];

export const APP_VERSION = CHANGELOG[0].version;
