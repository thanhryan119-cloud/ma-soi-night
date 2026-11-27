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
    version: "1.7.3",
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
