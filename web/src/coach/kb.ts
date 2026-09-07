// Curated tennis knowledge base — short, checked Turkish chunks. Used by the
// rule-based coach (coach/respond.ts). No LLM. Grow this file over time.
//
// `targets` uses the same keys as engine/drills.ts:
//   "<metric>", "<metric>:low|high", "follow_through", or a focus tag
//   ("forehand" | "backhand" | "serve" | "footwork" | "power" | "consistency").

export type KBChunk = {
  id: string;
  topic: "temel" | "forehand" | "backhand" | "servis" | "ayak" | "antrenman" | "sözlük";
  title: string;
  body: string;
  tags: string[];
  targets?: string[];
};

export const KB: KBChunk[] = [
  // ── temeller ────────────────────────────────────────────────────────
  {
    id: "unit-turn",
    topic: "temel",
    title: "Unit turn (tek parça gövde dönüşü)",
    body:
      "Hazırlıkta omuzlar ve kalça birlikte, tek parça olarak geriye döner; kol pasif kalır. " +
      "İyi bir unit turn'de non-dominant omzun topa/file'ye bakar. Gücün büyük kısmı buradan gelir — " +
      "kolunla vurmaya çalışırsan hem güç hem tutarlılık düşer.",
    tags: ["unit turn", "gövde dönüşü", "hazırlık", "coil", "omuz", "kalça", "güç"],
    targets: ["shoulder_angle:low", "hip_rotation:low", "power"],
  },
  {
    id: "kinetic-chain",
    topic: "temel",
    title: "Kinetik zincir (güç zinciri)",
    body:
      "Güç yerden başlar: bacak itişi → kalça rotasyonu → gövde → omuz → dirsek → bilek → raket. " +
      "Her halka bir öncekinden hız alır. Bir halka atlanırsa (ör. bacak yok, sadece kol) zincir kırılır " +
      "ve topa aktarılan enerji ciddi düşer.",
    tags: ["kinetik zincir", "güç zinciri", "bacak", "rotasyon", "zincir", "güç aktarımı"],
    targets: ["power", "knee_angle:high", "hip_rotation:low"],
  },
  {
    id: "contact-point",
    topic: "temel",
    title: "Temas noktası ve zamanlama",
    body:
      "İdeal temas gövdenin önünde, bel–göğüs hizasında ve raket kolu uzanmışken olur. " +
      "Geç temas (top yanına/arkasına geçmişken vurmak) en yaygın hatadır: kol katlanır, güç ve kontrol kaybolur. " +
      "Çözüm genelde daha erken hazırlık ve öne adım.",
    tags: ["temas noktası", "geç temas", "zamanlama", "erken hazırlık", "temas anı", "kontrol"],
    targets: ["elbow_angle:low", "timing"],
  },
  {
    id: "follow-through",
    topic: "temel",
    title: "Follow-through (bitiş)",
    body:
      "Vuruş temasta bitmez — raket topun içinden geçip yukarı ve gövdenin önünden çaprazlayarak " +
      "karşı omzun üstünde biter. Bitişi kesmek raket kafa hızını ve topspin'i düşürür, kolu da zorlar. " +
      "Her vuruşta 'raket karşı omuzda' hedefiyle bitir.",
    tags: ["follow-through", "takip", "bitiş", "topspin", "raket hızı", "karşı omuz"],
    targets: ["follow_through"],
  },
  {
    id: "split-step",
    topic: "temel",
    title: "Split-step",
    body:
      "Rakip topa vurmadan hemen önce yapılan küçük, tetikte bir zıplama. İnişte ağırlık ayak " +
      "toplarında olur ve iki yöne de patlayabilecek atletik bir duruşa geçersin. Split-step olmadan " +
      "ilk adım yavaş kalır, geç temas artar.",
    tags: ["split-step", "split step", "hazır duruş", "ilk adım", "atletik duruş", "footwork"],
    targets: ["footwork", "knee_angle:high", "timing"],
  },
  {
    id: "non-dominant-arm",
    topic: "temel",
    title: "Non-dominant (boşta olan) kol",
    body:
      "Forehand'de boştaki el rakete ya da topa doğru uzanıp gövdeyi çevirir ve dengeyi verir; " +
      "temasa doğru içeri toplanır. Backhand'de (özellikle tek el) itiş ve denge için kritiktir. " +
      "Boştaki kolu 'ölü' bırakmak dönüşü ve dengeyi bozar.",
    tags: ["boşta el", "non-dominant", "sol el", "denge", "işaret eli", "gövde dönüşü"],
    targets: ["shoulder_angle:low", "hip_rotation:low"],
  },

  // ── forehand ────────────────────────────────────────────────────────
  {
    id: "fh-basic",
    topic: "forehand",
    title: "Forehand temel akış",
    body:
      "Split-step → unit turn (raketi geriye) → hafif diz bükümü ile yüklen → kalçadan başlayarak " +
      "öne dönüş → gövdenin önünde, uzanmış kolla temas → raketi karşı omuzda bitir. " +
      "Raket kafası temasa kadar elinin gerisinde 'gecikir' (lag).",
    tags: ["forehand temel", "forehand akış", "forehand nasıl", "temel forehand"],
    targets: ["forehand"],
  },
  {
    id: "fh-power",
    topic: "forehand",
    title: "Forehand'de güç nereden gelir",
    body:
      "Güç koldan değil rotasyondan ve yerden gelir. Sıralama: bacak itişi → kalça açılır → gövde → " +
      "omuz → kol en son. Kol boyunca gevşek kalırsan raket kafası kamçı gibi hızlanır. " +
      "Kasarak vurmak hızı düşürür.",
    tags: ["forehand güç", "daha sert forehand", "forehand hız", "güç", "kamçı"],
    targets: ["forehand", "power", "racket_lag:low", "hip_rotation:low"],
  },
  {
    id: "fh-topspin",
    topic: "forehand",
    title: "Forehand topspin",
    body:
      "Topspin, raketin temasta aşağıdan yukarıya (low-to-high) hareket etmesiyle olur. " +
      "Raket yüzü hafif kapalı, bitiş yüksek. Ağı geçme payı ve iniş güvenliği artar. " +
      "Düz vuruşta risk yüksektir; rally'de topspin daha güvenli.",
    tags: ["topspin", "forehand topspin", "aşağıdan yukarı", "low to high", "spin"],
    targets: ["forehand", "consistency"],
  },
  {
    id: "fh-common-errors",
    topic: "forehand",
    title: "Forehand'de yaygın hatalar",
    body:
      "1) Kolla vurmak (unit turn yok). 2) Geç temas — kol katlanıyor. 3) Erken açılmak — omuz kalçadan " +
      "önce dönüyor. 4) Bitişi kesmek. 5) Aceleci, çok büyük backswing. 6) Ayakta dik durmak, yüklenmemek. " +
      "Çoğu hata hazırlık ve zamanlamaya bağlı.",
    tags: ["forehand hata", "forehand yanlış", "forehand neden kötü", "forehand sorun"],
    targets: ["forehand", "shoulder_angle:low", "hip_rotation:low", "elbow_angle:low", "racket_lag:low", "knee_angle:high", "follow_through"],
  },
  {
    id: "fh-late-contact",
    topic: "forehand",
    title: "Geç teması düzeltmek",
    body:
      "Geç temas = top yanına/arkasına geçmişken vurmak. Nedenler: geç hazırlık, split-step yok, öne " +
      "adım yok, çok büyük backswing. Egzersiz: besleme gelirken raketi topun sekmesinden önce geriye al; " +
      "temasta ön ayağa ağırlık aktar. Kısa, kompakt hazırlıkla çalış.",
    tags: ["geç temas", "geç kalıyorum", "top arkamda", "erken hazırlık", "kompakt backswing"],
    targets: ["forehand", "elbow_angle:low", "racket_lag:high", "timing"],
  },
  {
    id: "fh-arming",
    topic: "forehand",
    title: "'Kolla vurma' (arming) sorunu",
    body:
      "Gövde dönmeden sadece kolu sallamak: güç zayıf, top kısa, omuz/dirsek zorlanır. " +
      "Belirti: omuz dönüşü ve kalça rotasyonu düşük. Çözüm: topsuz unit turn tekrarları, " +
      "'sırtını file'ye dön' hissi, kolu en sona bırakma.",
    tags: ["kolla vurma", "arming", "gövde dönmüyor", "kısa top", "güçsüz forehand"],
    targets: ["forehand", "shoulder_angle:low", "hip_rotation:low"],
  },

  // ── backhand ────────────────────────────────────────────────────────
  {
    id: "bh-one-vs-two",
    topic: "backhand",
    title: "Tek el vs çift el backhand",
    body:
      "Çift el: daha stabil, öğrenmesi kolay, yüksek toplara ve güce iyi; erişimi biraz kısıtlı. " +
      "Tek el: daha uzun erişim, doğal slice, estetik; ama zamanlama ve güç için daha çok antrenman ister. " +
      "Yeni başlayan için çift el genelde daha hızlı sonuç verir.",
    tags: ["tek el backhand", "çift el backhand", "backhand seçimi", "hangi backhand"],
    targets: ["backhand"],
  },
  {
    id: "bh-basic",
    topic: "backhand",
    title: "Backhand temel akış",
    body:
      "Split-step → erken unit turn (backhand'de dönüş forehand'den daha erken olmalı) → yüklen → " +
      "kalçadan öne → gövdenin önünde temas → yukarı bitiş. Çift elde non-dominant el ittirir, " +
      "tek elde arka omuz vuruşu sürükler.",
    tags: ["backhand temel", "backhand akış", "backhand nasıl"],
    targets: ["backhand"],
  },
  {
    id: "bh-slice",
    topic: "backhand",
    title: "Backhand slice",
    body:
      "Raket yukarıdan aşağıya, yüzü hafif açık; top alttan spin alır ve alçak, kayan bir yörünge çizer. " +
      "Savunmada zaman kazanmak, ritmi bozmak, file'ye gelmek için kullanılır. Bitiş öne ve dışa doğru, " +
      "raketi 'kesip' bırakma.",
    tags: ["slice", "backhand slice", "alttan spin", "kesik", "savunma"],
    targets: ["backhand", "consistency"],
  },
  {
    id: "bh-common-errors",
    topic: "backhand",
    title: "Backhand'de yaygın hatalar",
    body:
      "1) Geç dönüş — backhand daha erken hazırlık ister. 2) Çift elde üst el pasif, alt elle çekmek. " +
      "3) Tek elde omuz erken açılıyor, top 'saçılıyor'. 4) Yüklenmeden, dik durarak vurmak. " +
      "5) Bitişi kısa kesmek.",
    tags: ["backhand hata", "backhand neden kötü", "backhand sorun", "backhand yanlış"],
    targets: ["backhand", "shoulder_angle:low", "hip_rotation:low", "knee_angle:high", "follow_through"],
  },

  // ── servis ──────────────────────────────────────────────────────────
  {
    id: "serve-basic",
    topic: "servis",
    title: "Servis temel akış",
    body:
      "Ritmik başlangıç → atış ve raketi aynı anda kaldır (trophy) → bacakları bük, sırtı hafif yayla → " +
      "bacaklardan yukarı sürü + gövdeyi aç → en yüksek noktada, kol tam uzanmışken temas → " +
      "önkol dönüşü (pronasyon) → kortun içine iniş.",
    tags: ["servis temel", "servis akış", "servis nasıl", "temel servis"],
    targets: ["serve"],
  },
  {
    id: "serve-trophy",
    topic: "servis",
    title: "Trophy pozisyonu",
    body:
      "Atış kolu yukarı uzanmış, vuruş kolu dirsekten bükülü ve kulak hizasında, vuruş omzu açık, " +
      "sırt hafif yay. Bu pozisyon güç birikiminin merkezidir. Düşük/kapalı trophy = topu yükseğe " +
      "alamama ve gücü yukarı yönlendirememe.",
    tags: ["trophy", "trophy pozisyonu", "servis hazırlık", "omuz açısı", "servis güç"],
    targets: ["serve", "shoulder_angle:low"],
  },
  {
    id: "serve-toss",
    topic: "servis",
    title: "Servis atışı (toss)",
    body:
      "Atış kolu düz, top parmak uçlarından bırakılır (fırlatılmaz). İdeal yükseklik: raketle uzanınca " +
      "değebileceğin noktanın biraz üstü. Tutarsız atış = tutarsız servis. Aynı noktaya 20 kuru atış " +
      "çalışması en verimli servis egzersizidir.",
    tags: ["toss", "servis atışı", "top atışı", "atış tutarsız", "servis atış yüksekliği"],
    targets: ["serve", "consistency"],
  },
  {
    id: "serve-pronation",
    topic: "servis",
    title: "Pronasyon (önkol dönüşü)",
    body:
      "Temasta önkol ve bilek doğal olarak içeri döner (avuç içi dışa bakar). Raket hızının büyük kısmı " +
      "buradan gelir ve düz/slice/kick servisi bu dönüşün zamanlaması ayırır. Zorla 'bilek kırma' değil, " +
      "gevşek bir kırbaç dönüşü.",
    tags: ["pronasyon", "önkol dönüşü", "bilek", "servis hız", "kick servis", "slice servis"],
    targets: ["serve", "racket_lag:low", "power"],
  },
  {
    id: "serve-legs",
    topic: "servis",
    title: "Serviste bacak kullanımı",
    body:
      "Trophy'de dizler belirgin bükülür; temasa giderken bacaklardan yukarı zıplanır, iniş kortun içine. " +
      "Bacak sürüşü hem güç hem de temas yüksekliği ekler. Dik, bacaksız servis = düşük güç ve dar açı.",
    tags: ["servis bacak", "diz bükümü servis", "zıplama", "servis güç bacak"],
    targets: ["serve", "knee_angle:high", "power"],
  },
  {
    id: "serve-common-errors",
    topic: "servis",
    title: "Serviste yaygın hatalar",
    body:
      "1) Tutarsız atış. 2) Düşük/kapalı trophy — omuz açılmıyor. 3) Bacak yok, dik duruş. " +
      "4) Pronasyon yok, 'itme' servisi. 5) Temas çok önde/arkada. 6) Bel aşırı yaylanıp incinme riski. " +
      "Önce atış + trophy'yi sabitle.",
    tags: ["servis hata", "servis neden kötü", "servis sorun", "çift hata", "servis yanlış"],
    targets: ["serve", "shoulder_angle:low", "knee_angle:high", "racket_lag:low"],
  },

  // ── ayak / footwork ────────────────────────────────────────────────
  {
    id: "fw-recovery",
    topic: "ayak",
    title: "Toparlanma (recovery)",
    body:
      "Her vuruştan sonra hızlıca kortun ortasına (ya da açıya göre optimal noktaya) dön. " +
      "Vurup yerinde kalmak, bir sonraki topu geç yakalatır. Kayma adımlarıyla (side-shuffle) " +
      "toparlan, sırtın file'ye dönük kalmasın.",
    tags: ["toparlanma", "recovery", "vurup kalmak", "kort ortası", "footwork"],
    targets: ["footwork"],
  },
  {
    id: "fw-adjustment-steps",
    topic: "ayak",
    title: "Ayar adımları (küçük adımlar)",
    body:
      "Topa yaklaşırken son 1-2 metrede büyük adım değil, çok sayıda küçük ayar adımı atılır. " +
      "Bu, temas mesafesini hassas ayarlar ve dengeli vuruş sağlar. Büyük adımla dalmak = kötü mesafe, " +
      "kötü denge, geç temas.",
    tags: ["küçük adım", "ayar adımı", "mesafe ayarı", "denge", "footwork"],
    targets: ["footwork", "timing"],
  },
  {
    id: "fw-loading",
    topic: "ayak",
    title: "Dış ayakla yüklenme",
    body:
      "Groundstroke'ta ağırlık önce dış (arka) ayağa yüklenir, sonra öne aktarılır. Bu yükleme " +
      "kinetik zincirin ilk basamağı. Yüklenmeden vurmak = güç yok, sadece kol.",
    tags: ["yüklenme", "dış ayak", "ağırlık aktarımı", "arka ayak", "footwork"],
    targets: ["footwork", "knee_angle:high", "power"],
  },

  // ── antrenman ──────────────────────────────────────────────────────
  {
    id: "home-no-racket",
    topic: "antrenman",
    title: "Evde raketsiz / kortsuz çalışma",
    body:
      "Raketsiz de çok şey çalışılır: gölge vuruşlar (unit turn + bitiş), split-step tekrarları, " +
      "ayna karşısında trophy pozisyonu, medicine ball ile rotasyon atışı, ip atlama (footwork), " +
      "duvara top atıp yakalama (el-göz). Günde 10-15 dk düzenli tekrar forma yazar.",
    tags: ["evde antrenman", "raketsiz", "kortsuz", "ev egzersiz", "gölge vuruş"],
    targets: ["consistency", "footwork"],
  },
  {
    id: "home-wall",
    topic: "antrenman",
    title: "Duvar antrenmanı",
    body:
      "Bir duvar + top yeter. 4-5 m mesafeden kontrollü, orta hızda kesintisiz ral hedefle " +
      "(30+ vuruş serileri). Temas tutarlılığı, ritim ve form için tek başına yapılabilen en verimli " +
      "antrenman. Sayı düşerse hızı azalt, forma odaklan.",
    tags: ["duvar antrenmanı", "duvarda çalışma", "duvar", "ral", "tutarlılık"],
    targets: ["consistency", "forehand", "backhand"],
  },
  {
    id: "warmup",
    topic: "antrenman",
    title: "Isınma",
    body:
      "Antrenmandan önce: 3-5 dk hafif koşu/ip, dinamik esneme (kol dairesi, kalça salınımı, bacak sallama), " +
      "sonra mini-court'ta yavaş yumuşak vuruşlarla ısın, kademeli hızlan. Soğukken sert vurmak sakatlık riski.",
    tags: ["ısınma", "warmup", "esneme", "antrenman öncesi", "sakatlık"],
    targets: [],
  },
  {
    id: "weekly-structure",
    topic: "antrenman",
    title: "Haftalık yapı (amatör)",
    body:
      "Örnek: 2 gün teknik/drill (zayıf alan odaklı), 1 gün oyun/point, 1 gün fitness/footwork, " +
      "1-2 gün dinlenme. Her teknik seansında tek bir ana konuya odaklan — aynı anda 5 şeyi düzeltmeye " +
      "çalışmak işe yaramaz.",
    tags: ["haftalık plan", "antrenman programı", "kaç gün", "haftalık yapı"],
    targets: [],
  },
  {
    id: "shadow-swings",
    topic: "antrenman",
    title: "Gölge vuruş (shadow swing)",
    body:
      "Topsuz, yavaş ve bilinçli tekrarla vuruş kalıbını kas hafızasına yazma yöntemi. " +
      "Her tekrarda tek bir noktaya odaklan (ör. unit turn, ya da bitiş). 3×15 yavaş tekrar, " +
      "sonra normal hız. Antrenman öncesi ve evde ideal.",
    tags: ["gölge vuruş", "shadow swing", "topsuz tekrar", "kas hafızası"],
    targets: ["consistency"],
  },
  {
    id: "consistency-first",
    topic: "antrenman",
    title: "Önce tutarlılık, sonra güç",
    body:
      "Amatör gelişiminde sıra: temas tutarlılığı → derinlik → yön → spin → güç. Güçle başlayıp " +
      "form bozmak yaygın hata. Önce 10'da 8-9 kort içi tutturacak kadar sağlam bir vuruşun olsun, " +
      "hız sonra gelir.",
    tags: ["tutarlılık", "önce ne çalışmalı", "gelişim sırası", "sıralama", "güç mü kontrol mü"],
    targets: ["consistency"],
  },

  // ── sözlük (metrik/terim açıklamaları) ─────────────────────────────
  {
    id: "gloss-racket-lag",
    topic: "sözlük",
    title: "Raket gecikmesi (racket lag) nedir?",
    body:
      "Backswing sonunda ve öne dönüşün başında raket kafasının elinin gerisinde kalması. " +
      "Bu gecikme temasa kadar 'yaylanıp' bırakılır ve kamçı etkisiyle raket hızı üretir. " +
      "Az lag = itme, çok lag/aşırı geride = kontrol kaybı.",
    tags: ["racket lag", "raket gecikmesi nedir", "lag nedir", "kamçı"],
    targets: ["racket_lag:low", "racket_lag:high"],
  },
  {
    id: "gloss-hip-rotation",
    topic: "sözlük",
    title: "Kalça rotasyonu nedir?",
    body:
      "Vuruş sırasında kalçanın geriye sarılıp öne açılması. Kinetik zincirin ilk büyük halkası; " +
      "gücün yerden gövdeye aktarıldığı yer. Ölçümde düşük çıkması genelde 'kolla vurma' işaretidir.",
    tags: ["kalça rotasyonu nedir", "hip rotation", "kalça dönüşü", "rotasyon nedir"],
    targets: ["hip_rotation:low"],
  },
  {
    id: "gloss-shoulder-turn",
    topic: "sözlük",
    title: "Omuz dönüşü (unit turn) nedir?",
    body:
      "Hazırlıkta omuz çizgisinin file'ye dik olacak kadar geriye dönmesi. Kalçayla birlikte tek parça " +
      "olduğunda 'unit turn' denir. Yeterince dönmemek yükleme eksikliği ve güç kaybı demektir.",
    tags: ["omuz dönüşü nedir", "unit turn nedir", "coil nedir", "omuz açısı nedir"],
    targets: ["shoulder_angle:low"],
  },
  {
    id: "gloss-knee-bend",
    topic: "sözlük",
    title: "Diz bükümü nedir?",
    body:
      "Yüklenme fazında dizlerin bükülüp, sonra öne/yukarı itiş için açılması. Yerden gelen gücün " +
      "kaynağı. Çok dik = güç yok; aşırı derin çömelme = denge ve hız kaybı. Atletik bir orta nokta ideal.",
    tags: ["diz bükümü nedir", "knee bend", "yüklenme nedir", "bacak itişi nedir"],
    targets: ["knee_angle:high", "knee_angle:low"],
  },
  {
    id: "gloss-contact-frame",
    topic: "sözlük",
    title: "Temas karesi nedir?",
    body:
      "VuruşKoç'un, raketin topa değdiği (ya da topsuz vuruşta değeceği) anı tahmin ettiği video karesi. " +
      "Skorlanan açıların çoğu bu kareden ölçülür. Topsuz gölge vuruşta bu yalnızca kinematik bir tahmindir.",
    tags: ["temas karesi nedir", "temas anı nedir", "contact frame", "hangi kare"],
    targets: [],
  },
  {
    id: "gloss-swingscore",
    topic: "sözlük",
    title: "SwingScore nedir, ne kadar güvenilir?",
    body:
      "0–100 arası bir mekanik puan; ölçülen açıların pro (THETIS) aralıklarına uzaklığından hesaplanır. " +
      "Tek klipte hassas bir not DEĞİL — birden çok vuruşun ortalamasına bak. Aggregate'te 'iyiyi kötünün " +
      "üstüne sıralar', mutlak doğruluk iddiası yok.",
    tags: ["swingscore nedir", "puan güvenilir mi", "skor ne demek", "kaç puan"],
    targets: [],
  },
];

export const KB_BY_ID: Record<string, KBChunk> = Object.fromEntries(KB.map((c) => [c.id, c]));
