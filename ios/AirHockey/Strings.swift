import Foundation
import SwiftUI

/// Language support. Turkish is the original text, kept word for word.
/// English is written to be plain and easy: short sentences, everyday words,
/// nothing fancy. This is the Swift twin of `web/i18n.js` — keep the two in
/// step whenever a screen gains or loses a line.
final class Lang: ObservableObject {
    static let shared = Lang()

    static let codes = ["en", "tr"]
    static let names = ["en": "English", "tr": "Türkçe"]

    @Published private(set) var code: String

    /// Whether the player has ever answered the language question. The
    /// first-run sheet keys off this, so it appears exactly once.
    private(set) var answered: Bool

    private init() {
        let saved = UserDefaults.standard.string(forKey: "ah_lang")
        answered = saved.map(Lang.codes.contains) ?? false
        code = answered ? saved! : "en"
    }

    /// `remember: false` previews a language without answering the question,
    /// which is what the first-run sheet does while the player is deciding.
    func set(_ c: String, remember: Bool = true) {
        code = Lang.codes.contains(c) ? c : "en"
        if remember {
            answered = true
            UserDefaults.standard.set(code, forKey: "ah_lang")
        }
    }
}

/// Look up one line in the player's language, filling in `{it}` / `{itCap}`
/// with whatever the device in the middle should be called.
func S(_ key: String) -> String {
    let table = strings[Lang.shared.code] ?? strings["en"]!
    var s = table[key] ?? strings["en"]![key] ?? key
    if s.contains("{") {
        s = s.replacingOccurrences(of: "{itCap}", with: S("dev.itCap"))
        s = s.replacingOccurrences(of: "{it}", with: S("dev.it"))
    }
    return s
}

/// Whether a line exists at all, so a caller can fall back rather than print
/// a bare key at the player.
func hasString(_ key: String) -> Bool {
    strings["en"]?[key] != nil
}

/// `S(...)` with one number dropped in.
func S(_ key: String, _ n: Int) -> String {
    S(key).replacingOccurrences(of: "{n}", with: "\(n)")
}

/// `S(...)` with one piece of text dropped in.
func S(_ key: String, _ v: String) -> String {
    S(key).replacingOccurrences(of: "{v}", with: v)
}

private let strings: [String: [String: String]] = [
    "tr": [
        // the thing in the middle, named for this device
        "dev.it":       Device.isPad ? "iPad'i" : "telefonu",
        "dev.itCap":    Device.isPad ? "iPad'i" : "Telefonu",
        "dev.same":     Device.isPad ? "Aynı iPad'de 2 Kişi" : "Aynı Telefonda 2 Kişi",

        // first launch
        "lang.pick":    "Dil / Language",
        "lang.sub":     "Hangi dilde oynamak istersin?",
        "lang.go":      "Devam",
        "lang.title":   "Dil",
        "lang.hint":    "Dili istediğin zaman buradan değiştirebilirsin.",

        // menu
        "menu.tagline": "Oda kodunu paylaş, anında oyna.\nKayıt yok, indirme yok.",
        "menu.play":    "Oyna",
        "menu.playSub": "Bilgisayara karşı, hemen",
        "menu.online":  "Online Oyna",
        "menu.onlineSub": "Arkadaşınla, uzaktan",
        "menu.localSub": "Tek ekran, çift dokunuş",
        "menu.name":    "Adın",
        "menu.namePh":  "Oyuncu",
        "menu.settings": "Ayarlar",

        // shared
        "com.back":     "← Geri",
        "com.target":   "Kaç golde biter?",
        "com.mode":     "Oyun modu",
        "com.classic":  "Klasik",
        "com.classicSub": "Kurallar sabit",
        "com.lucky":    "Şanslı",
        "com.luckySub": "Sopalar büyür, buz değişir",
        "com.half":     "Devre arası",
        "com.halfSub":  "Yarı yolda kısa mola",
        "com.ok":       "Tamam",
        "plan.goals":   "golde",
        "plan.half":    "devre",
        "plan.end":     "biter",

        // online setup
        "on.title":     "Online Oyna",
        "on.create":    "Oda Oluştur",
        "on.createHint": "Sen kur, kodu arkadaşına gönder.",
        "on.join":      "Odaya Katıl",
        "on.joinHint":  "Arkadaşının gönderdiği 4 haneli kodu gir.",
        "on.joinBtn":   "Katıl",

        // lobby
        "lob.title":    "Oda Kodu",
        "lob.copy":     "Kodu Kopyala",
        "lob.share":    "Paylaş",
        "lob.you":      "Sen",
        "lob.waiting":  "Bekleniyor…",
        "lob.shareCode": "Kodu paylaş",
        "lob.ready":    "Hazır",
        "lob.hostNote": "Kuralları sen belirliyorsun. Rakip katılınca oyun başlar.",
        "lob.guestNote": "Oda sahibi kuralları belirledi.",
        "lob.leave":    "← Odadan Çık",
        "lob.copied":   "Kod kopyalandı: {v}",
        "lob.invite":   "Air Hockey oynayalım! Oda kodum: {v}",

        // same-device setup
        "loc.put":      "{itCap} aranıza koyun.\n",
        "loc.bottom":   "Alt yarı",
        "loc.mid":      " bir oyuncunun, ",
        "loc.top":      "üst yarı",
        "loc.tail":     " diğerinin.",
        "loc.halfSub":  "Yarı yolda {it} çevirin",
        "loc.halfHint": "Devrede {it} 180° çevirirsiniz — herkes bir yarıyı da diğer taraftan oynar.",
        "loc.start":    "Başlat",

        // settings
        "set.title":    "Ayarlar",
        "set.solo":     "Bilgisayara karşı",
        "set.soloHint": "\"Oyna\" tuşu bu kurallarla başlar",
        "set.soloHalf": "Sahayı yarıda çevir",
        "set.floor":    "Zemin",
        "set.floorHint": "Çocuklar için açık ve sade zeminler daha rahat görünür.",
        "set.puck":     "Top Rengi",
        "set.puckHint": "Tema, sahaya uygun olanı seçer.",
        "set.server":   "Sunucu",
        "set.serverHint": "Oyunun çalıştığı adres. Aynı Wi-Fi'da test için http://192.168.1.20:8080",
        "set.serverPh": "https://sunucu-adresin",
        "set.sound":    "Ses ve titreşim",
        "set.save":     "Kaydet",
        "set.close":    "Kapat",

        "theme.krem":   "Krem",
        "theme.buz":    "Buz",
        "theme.cim":    "Çim",
        "theme.gece":   "Gece",

        "puck.tema":    "Tema",
        "puck.siyah":   "Siyah",
        "puck.kirmizi": "Kırmızı",
        "puck.turuncu": "Turuncu",
        "puck.sari":    "Sarı",
        "puck.yesil":   "Yeşil",
        "puck.mavi":    "Mavi",
        "puck.mor":     "Mor",
        "puck.beyaz":   "Beyaz",

        // match
        "game.me":      "SEN",
        "game.foe":     "Rakip",
        "game.bot":     "BİLGİSAYAR",
        "game.p1":      "OYUNCU 1",
        "game.p2":      "OYUNCU 2",
        "game.goal":    "GOL!",
        "game.foeGoal": "Rakip Attı",
        "game.go":      "BAŞLA!",
        "game.waitFoe": "Rakip bekleniyor…",
        "hud.lucky":    "ŞANSLI · ",
        "hud.half":     " DEVRE · ",
        "hud.goals":    " GOL",

        // lucky twists
        "fx.p1":        "OYUNCU 1",
        "fx.p2":        "OYUNCU 2",
        "fx.mine":      "SOPAN",
        "fx.theirs":    "RAKİP",
        "fx.grow":      " BÜYÜDÜ",
        "fx.shrink":    " KÜÇÜLDÜ",
        "fx.fast":      "BUZ KAYGAN",
        "fx.slow":      "BUZ AĞIR",

        // half time
        "half.word":    "DEVRE",
        "half.turn":    "{itCap} 180° çevirin",
        "half.noteTurn": "Alt taraf yukarı, üst taraf aşağı.\nBöylece herkes ekranın iki yanını da kullanır.",
        "half.noteWait": "İkiniz de hazır deyince ikinci yarı başlar.",
        "half.btnTurn": "Çevirdik, Devam",
        "half.btnReady": "Hazırım",
        "half.waitFoe": "Rakip bekleniyor…",

        // game over
        "over.win":     "Kazandın!",
        "over.lose":    "Kaybettin",
        "over.soloWin": "Kazandın!",
        "over.soloLose": "Bilgisayar kazandı",
        "over.p1Win":   "Oyuncu 1 Kazandı!",
        "over.p2Win":   "Oyuncu 2 Kazandı!",
        "over.again":   "Tekrar Oyna",
        "over.menu":    "Ana Menü",

        // connection
        "net.ok":       "Sunucuya bağlı",
        "net.connecting": "Bağlanıyor…",
        "net.idle":     "Çevrimdışı",
        "net.again":    "Sunucuya yeniden bağlanılıyor…",
        "net.wait":     "Sunucuya bağlanılıyor…",
        "net.peerIn":   "Rakip bağlandı!",
        "net.peerOut":  "Rakip ayrıldı — bekleniyor…",
        "net.badURL":   "Sunucu adresi geçersiz",
        "net.lost":     "Bağlantı koptu",
        "net.closed":   "Bağlantı kapandı",
        "net.badCode":  "4 haneli oda kodunu gir.",
        "err.create":   "Oda oluşturulamadı, tekrar dene.",
        "err.notFound": "Bu kodla bir oda bulunamadı.",
        "err.full":     "Bu oda dolu.",
        "err.timeout":  "Oda zaman aşımına uğradı.",
    ],

    "en": [
        "dev.it":       Device.isPad ? "the iPad" : "the phone",
        "dev.itCap":    Device.isPad ? "The iPad" : "The phone",
        "dev.same":     Device.isPad ? "2 Players on One iPad" : "2 Players on One Phone",

        "lang.pick":    "Language / Dil",
        "lang.sub":     "Which language do you want to play in?",
        "lang.go":      "Go",
        "lang.title":   "Language",
        "lang.hint":    "You can change the language here any time.",

        "menu.tagline": "Share the room code and play right away.\nNo sign up, no download.",
        "menu.play":    "Play",
        "menu.playSub": "Against the computer, right now",
        "menu.online":  "Play Online",
        "menu.onlineSub": "With a friend, far away",
        "menu.localSub": "One screen, two fingers",
        "menu.name":    "Your name",
        "menu.namePh":  "Player",
        "menu.settings": "Settings",

        "com.back":     "← Back",
        "com.target":   "How many goals to win?",
        "com.mode":     "Game type",
        "com.classic":  "Classic",
        "com.classicSub": "Rules stay the same",
        "com.lucky":    "Lucky",
        "com.luckySub": "Paddles grow, ice changes",
        "com.half":     "Half time",
        "com.halfSub":  "A short break in the middle",
        "com.ok":       "Done",
        "plan.goals":   "goals",
        "plan.half":    "half time",
        "plan.end":     "game ends",

        "on.title":     "Play Online",
        "on.create":    "Make a Room",
        "on.createHint": "You make the room, then send the code to your friend.",
        "on.join":      "Join a Room",
        "on.joinHint":  "Type the 4-letter code your friend sent you.",
        "on.joinBtn":   "Join",

        "lob.title":    "Room Code",
        "lob.copy":     "Copy Code",
        "lob.share":    "Share",
        "lob.you":      "You",
        "lob.waiting":  "Waiting…",
        "lob.shareCode": "Share the code",
        "lob.ready":    "Ready",
        "lob.hostNote": "You pick the rules. The game starts when your friend joins.",
        "lob.guestNote": "The person who made the room picked the rules.",
        "lob.leave":    "← Leave Room",
        "lob.copied":   "Code copied: {v}",
        "lob.invite":   "Let's play Air Hockey! My room code is: {v}",

        "loc.put":      "Put {it} between you.\n",
        "loc.bottom":   "The bottom half",
        "loc.mid":      " is for one player, ",
        "loc.top":      "the top half",
        "loc.tail":     " for the other.",
        "loc.halfSub":  "Turn {it} around in the middle",
        "loc.halfHint": "At half time you turn {it} around 180° — so you both get to play from each side.",
        "loc.start":    "Start",

        "set.title":    "Settings",
        "set.solo":     "Against the computer",
        "set.soloHint": "The \"Play\" button starts a match with these rules",
        "set.soloHalf": "Turn the rink around at the break",
        "set.floor":    "Floor",
        "set.floorHint": "Light, simple floors are easier for kids to see.",
        "set.puck":     "Puck Colour",
        "set.puckHint": "\"Theme\" picks the colour that fits the floor.",
        "set.server":   "Server",
        "set.serverHint": "The address the game runs on. To test on the same Wi-Fi, use http://192.168.1.20:8080",
        "set.serverPh": "https://your-server",
        "set.sound":    "Sound and buzz",
        "set.save":     "Save",
        "set.close":    "Close",

        "theme.krem":   "Cream",
        "theme.buz":    "Ice",
        "theme.cim":    "Grass",
        "theme.gece":   "Night",

        "puck.tema":    "Theme",
        "puck.siyah":   "Black",
        "puck.kirmizi": "Red",
        "puck.turuncu": "Orange",
        "puck.sari":    "Yellow",
        "puck.yesil":   "Green",
        "puck.mavi":    "Blue",
        "puck.mor":     "Purple",
        "puck.beyaz":   "White",

        "game.me":      "YOU",
        "game.foe":     "Player 2",
        "game.bot":     "COMPUTER",
        "game.p1":      "PLAYER 1",
        "game.p2":      "PLAYER 2",
        "game.goal":    "GOAL!",
        "game.foeGoal": "THEY SCORED",
        "game.go":      "GO!",
        "game.waitFoe": "Waiting for the other player…",
        "hud.lucky":    "LUCKY · ",
        "hud.half":     " HALF · ",
        "hud.goals":    " GOALS",

        "fx.p1":        "PLAYER 1",
        "fx.p2":        "PLAYER 2",
        "fx.mine":      "YOUR PADDLE",
        "fx.theirs":    "THEIR PADDLE",
        "fx.grow":      " GOT BIGGER",
        "fx.shrink":    " GOT SMALLER",
        "fx.fast":      "ICE IS SLIPPERY",
        "fx.slow":      "ICE IS SLOW",

        "half.word":    "HALF TIME",
        "half.turn":    "Turn {it} around 180°",
        "half.noteTurn": "The bottom player goes up, the top player goes down.\nThat way you both use each side of the screen.",
        "half.noteWait": "The second half starts when you are both ready.",
        "half.btnTurn": "We turned it, go on",
        "half.btnReady": "I am ready",
        "half.waitFoe": "Waiting for the other player…",

        "over.win":     "You Won!",
        "over.lose":    "You Lost",
        "over.soloWin": "You Won!",
        "over.soloLose": "The computer won",
        "over.p1Win":   "Player 1 Won!",
        "over.p2Win":   "Player 2 Won!",
        "over.again":   "Play Again",
        "over.menu":    "Main Menu",

        "net.ok":       "Connected to the server",
        "net.connecting": "Connecting…",
        "net.idle":     "Offline",
        "net.again":    "Connecting to the server again…",
        "net.wait":     "Connecting to the server…",
        "net.peerIn":   "Your friend joined!",
        "net.peerOut":  "Your friend left — waiting…",
        "net.badURL":   "That server address does not work",
        "net.lost":     "Connection lost",
        "net.closed":   "The connection closed",
        "net.badCode":  "Type the 4-letter room code.",
        "err.create":   "The room could not be made. Please try again.",
        "err.notFound": "No room was found with that code.",
        "err.full":     "This room is full.",
        "err.timeout":  "The room was closed because nobody played for a while.",
    ],
]
