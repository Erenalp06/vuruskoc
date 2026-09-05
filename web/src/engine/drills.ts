// Named tennis drill catalog + a recommender that maps an analysis result to a
// short training plan. Text-only (no video yet) — deterministic, offline.
// Turkish is authoritative; EN falls back to TR until translated.
import type { Correction, Metric } from "./coaching";
import type { Stroke } from "./swing";

export type Drill = {
  id: string;
  name: string;
  /** target keys: "<metric>", "<metric>:low|high", "follow_through", or a
   *  focus tag: "forehand" | "backhand" | "serve" | "power" | "consistency" | "timing" */
  targets: string[];
  level: 1 | 2 | 3; // 1 warm-up / any level · 3 advanced
  equipment: string; // "yok" | "duvar" | "top sepeti" | "partner" | "medicine ball"
  why: string;
  steps: string[];
  reps: string;
};

export const DRILLS: Drill[] = [
  {
    id: "shadow_unit_turn",
    name: "Gölge Unit Turn",
    targets: ["hip_rotation:low", "shoulder_angle:low", "forehand", "backhand"],
    level: 1,
    equipment: "yok",
    why: "Omuz ve kalçayı tek parça çevirmeyi kas hafızasına yazar; 'kolla vurma' alışkanlığını kırar.",
    steps: [
      "Yan dur, non-dominant elini raket boğazına koy.",
      "Topsuz, sadece gövdeyi bir bütün olarak geriye çevir — sırtın kısmen file'ye baksın.",
      "Kalçadan başlat, öne sür, kolu en sona bırak.",
    ],
    reps: "3×15 yavaş tekrar",
  },
  {
    id: "back_to_net",
    name: "Sırtını File'ye Dön",
    targets: ["shoulder_angle:low", "hip_rotation:low", "forehand"],
    level: 1,
    equipment: "yok",
    why: "Yeterince coil olmadığını hissettirir; tam gövde dönüşünün referans noktasını verir.",
    steps: [
      "Hazırlık pozisyonunda gövdeni öyle çevir ki omuzların çizgisi file'ye dik olsun.",
      "Bu noktada 1 sn dur, sonra vuruşa geç.",
      "Her vuruştan önce bu 'sırt file'ye' hissini ara.",
    ],
    reps: "20 besleme / gölge",
  },
  {
    id: "medicine_ball_rotation",
    name: "Medicine Ball Rotasyon Atışı",
    targets: ["hip_rotation:low", "power", "forehand"],
    level: 2,
    equipment: "medicine ball + duvar",
    why: "Kalça–gövde–kol güç zincirini yüklü halde çalıştırır; rotasyonel patlayıcılığı artırır.",
    steps: [
      "Yan dur, topu iki elle bel hizasında tut.",
      "Kalçanı geriye sar, sonra patlayıcı şekilde dönerek topu duvara fırlat.",
      "Bacaktan yukarı zincirle — kollar son.",
    ],
    reps: "4×8 her taraf",
  },
  {
    id: "waiters_tray",
    name: "Garson Tepsisi Backswing",
    targets: ["racket_lag:low", "forehand"],
    level: 1,
    equipment: "yok",
    why: "Backswing sonunda avuç içi yukarı bakan pozisyon = raket gecikmesinin başlangıcı.",
    steps: [
      "Backswing'in en ucunda dur: raket yüzü hafif yukarı, avuç içi 'tepsi taşır' gibi.",
      "Bilek gevşek, raket kafası elinin gerisinde.",
      "Oradan bileği zorlamadan bırak.",
    ],
    reps: "3×12 gölge, sonra beslemeyle 20",
  },
  {
    id: "lasso_lag",
    name: "Kement (Lasso) Drill",
    targets: ["racket_lag:low", "timing", "forehand"],
    level: 2,
    equipment: "yok",
    why: "Raketi kafanın üstünde daire çizip bırakmak, bileğin doğal gecikmesini öğretir.",
    steps: [
      "Raketi baş üstünde bir tam daire çevir.",
      "Daire aşağı inerken durmadan vuruşa bağla.",
      "Bilek hiç kilitlenmesin — raket kafası hep geriden gelsin.",
    ],
    reps: "15 kement + vuruş",
  },
  {
    id: "waist_backswing",
    name: "Bel Hizası Backswing",
    targets: ["racket_lag:high", "elbow_angle:low", "consistency"],
    level: 1,
    equipment: "yok",
    why: "Aşırı büyük/geriye düşen backswing'i kompaktlaştırır; zamanlamayı kolaylaştırır.",
    steps: [
      "Hazırlıkta raketi bel hizasından yukarı çıkarma.",
      "Dirseği gövdene yakın tut, koltuk altında bir mendil sıkışıyormuş gibi.",
      "Kısa hazırlık → hızlı ileri.",
    ],
    reps: "besleme ile 20",
  },
  {
    id: "reach_and_push",
    name: "Uzan ve İt",
    targets: ["elbow_angle:high", "forehand"],
    level: 1,
    equipment: "yok",
    why: "Temasta kol fazla düzse güç ve uzanım kaybolur; vuruş boyunca kolu aktif uzatmayı çalıştırır.",
    steps: [
      "Vuruşu yavaşça yap, temas anında kolu topa doğru 'uzat ve it' diye düşün.",
      "Temastan sonra raket eli file yönünde ilerlesin.",
      "Gevşek ama uzayan bir kol — kilitli değil.",
    ],
    reps: "3×10 yavaş",
  },
  {
    id: "split_load_hit",
    name: "Split-step → Çök → Vur",
    targets: ["knee_angle:high", "power", "timing"],
    level: 2,
    equipment: "partner / sepet",
    why: "Dik duruşu kırar; yerden itiş için diz bükümünü zamanlamaya bağlar.",
    steps: [
      "Besleme gelirken split-step yap.",
      "İnişte dizleri belirgin bük (mini-squat), aynı anda gövdeyi çevir.",
      "Bacaktan yukarı iterek vur.",
    ],
    reps: "3×10 besleme",
  },
  {
    id: "chair_touch",
    name: "Sandalye Dokunuşu",
    targets: ["knee_angle:high"],
    level: 1,
    equipment: "sandalye",
    why: "Yeterince çökmediğinde geri bildirim verir — kalçan sandalyeye değmeli.",
    steps: [
      "Arkana bir sandalye koy.",
      "Her hazırlıkta kalçanı geriye götürüp sandalyeye hafifçe değdir.",
      "Değince patlayıcı şekilde yukarı çık ve vur.",
    ],
    reps: "20 gölge",
  },
  {
    id: "tall_stance_rally",
    name: "Yüksek Duruş Ral",
    targets: ["knee_angle:low"],
    level: 1,
    equipment: "partner / duvar",
    why: "Fazla çömelme varsa: daha dik, atletik bir duruşla ral yaparak dengeyi geri getirir.",
    steps: [
      "Bilinçli olarak daha az diz bük — hafif, tetikte bir duruş.",
      "Kısa mesafeden yavaş ral.",
      "Her toptan sonra hemen tarafsız duruşa dön.",
    ],
    reps: "2×20 ral",
  },
  {
    id: "finish_shoulder",
    name: "Karşı Omuz Bitiş",
    targets: ["follow_through", "forehand", "backhand"],
    level: 1,
    equipment: "yok",
    why: "Vuruşu kesme alışkanlığını bitirir; raketi karşı omuz üstünde bitirmek topspin ve kontrolü artırır.",
    steps: [
      "Her gölge vuruşta raketi karşı omzunun üstünde dondur, 1 sn tut.",
      "Dirsek yukarı, raket başı aşağı-arkaya baksın.",
      "Sonra beslemeyle aynı bitişi tuttur.",
    ],
    reps: "3×15",
  },
  {
    id: "wall_30",
    name: "Duvarda 30 Ral",
    targets: ["consistency", "forehand", "backhand"],
    level: 1,
    equipment: "duvar",
    why: "Temas tutarlılığı ve ritim — tek başına yapılabilen en verimli antrenman.",
    steps: [
      "Duvardan 4-5 m uzakta dur.",
      "Kontrollü, orta hızda 30 kesintisiz vuruş hedefle.",
      "Sayı düşerse hızı azalt, forma odaklan.",
    ],
    reps: "5 set, en iyi seriyi kaydet",
  },
  {
    id: "crosscourt_10",
    name: "Beslemeli Çapraz 10'lu",
    targets: ["forehand", "backhand", "consistency", "power"],
    level: 2,
    equipment: "partner / sepet",
    why: "Tek bir yöne tekrar ederek vuruş kalıbını sağlamlaştırır; güç + isabet birlikte.",
    steps: [
      "Partner aynı yöne besler, sen hep çapraz köşeye gönder.",
      "İlk 5: %70 hız, temiz form. Son 5: %90 hız.",
      "Hedef: 10'da en az 7 kort içi.",
    ],
    reps: "4×10",
  },
  {
    id: "spanish_x",
    name: "İspanyol X Drill",
    targets: ["forehand", "power", "timing"],
    level: 3,
    equipment: "partner",
    why: "Sürekli hareket + açık duruş forehand + toparlanma — modern forehand'in temeli.",
    steps: [
      "Kort ortasından başla, partner geniş açıya besler.",
      "Yana kayarak açık duruşta vur, hemen ortaya toparlan.",
      "Sağ–sol dönüşümlü, X çizerek.",
    ],
    reps: "3×90 sn",
  },
  {
    id: "figure_8",
    name: "Figure-8 Raket Yolu",
    targets: ["racket_lag:low", "timing"],
    level: 2,
    equipment: "yok",
    why: "Raketin sürekli hareket halinde kalmasını (duraklamayan yay) öğretir.",
    steps: [
      "Raketle önünde yatık bir 8 çiz, durmadan.",
      "8'in alt kavisini forehand vuruşuna bağla.",
      "Hiç durma noktası olmasın.",
    ],
    reps: "15 tekrar",
  },
  {
    id: "trophy_freeze",
    name: "Trophy Freeze",
    targets: ["serve", "shoulder_angle:low"],
    level: 1,
    equipment: "yok",
    why: "Servis 'trophy' pozisyonunu (atış kolu yukarı, vuruş omzu açık) dondurarak sabitler.",
    steps: [
      "Atışı yap, trophy pozisyonunda 2 sn don.",
      "Kontrol: atış kolu yukarı, dirsek kulak hizası, sırt hafif yay.",
      "Oradan yukarı patla.",
    ],
    reps: "3×10",
  },
  {
    id: "serve_to_wall",
    name: "Duvara Servis Atışı",
    targets: ["serve", "racket_lag:low", "power"],
    level: 2,
    equipment: "duvar",
    why: "Pronasyon ve raket hızını topsuz baskıyla çalıştırır.",
    steps: [
      "Duvara 3 m mesafe, servis hareketiyle raketi duvara 'çarpmadan' hızlan-yavaşla.",
      "Bilek ve önkolun dönüşünü (pronasyon) abart.",
      "Sonra gerçek servise geç.",
    ],
    reps: "20 kuru + 20 servis",
  },
  {
    id: "knee_bend_jump",
    name: "Diz-Bük Zıpla (servis)",
    targets: ["serve", "knee_angle:high", "power"],
    level: 2,
    equipment: "yok",
    why: "Servise bacak sürüşü ekler; dik servis atanlar için güç kaynağı.",
    steps: [
      "Trophy'de dizleri belirgin bük.",
      "Temasa giderken bacaklardan yukarı zıpla, iniş kortun içine.",
      "Bacak → gövde → kol sıralaması.",
    ],
    reps: "3×8",
  },
];

const byId = Object.fromEntries(DRILLS.map((d) => [d.id, d]));

/** Build the target keys a correction should be matched against. */
function keysFor(c: Correction): string[] {
  const m = (c.clipMetric ?? c.metric) as Metric;
  return [`${m}:${c.direction}`, m, "power", "consistency"];
}

/** A short training plan for this result: drills for the weak areas + 1-2 general. */
export function recommendDrills(
  corrections: Correction[], stroke: Stroke, allInRange: boolean, max = 5
): Drill[] {
  const picked = new Map<string, { d: Drill; hits: number }>();
  const bump = (d: Drill, w = 1) => {
    const e = picked.get(d.id);
    if (e) e.hits += w;
    else picked.set(d.id, { d, hits: w });
  };

  const wanted = new Set<string>();
  for (const c of corrections) for (const k of keysFor(c)) wanted.add(k);

  for (const d of DRILLS) {
    const hit = d.targets.filter((t) => wanted.has(t)).length;
    if (hit) bump(d, hit + (d.level === 1 ? 0.3 : 0)); // slight nudge to easier drills
  }

  // always add 1-2 general drills for the stroke / consistency
  const general = DRILLS.filter((d) => d.targets.includes(stroke) || d.targets.includes("consistency"));
  if (allInRange) {
    // nothing wrong → give a maintenance plan
    for (const d of general.slice(0, 3)) bump(d, 0.5);
  } else {
    for (const d of general.slice(0, 2)) if (!picked.has(d.id)) bump(d, 0.4);
  }

  return [...picked.values()]
    .sort((a, b) => b.hits - a.hits || a.d.level - b.d.level)
    .slice(0, max)
    .map((e) => e.d);
}

export { byId as DRILLS_BY_ID };
