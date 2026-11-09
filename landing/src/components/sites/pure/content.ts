export type Lang = "el" | "en";
export type Localized = Record<Lang, string>;

export const ASSETS = "/sites/pure";

// Where the booking app lives. Empty in production (the app's server also
// serves this page, so "/login" is same-origin); set NEXT_PUBLIC_APP_URL when
// the two run on different ports in development (see .env.development).
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

export const CONTACT = {
  name: "Pure Massage & Spa Experience",
  phone: "241 061 4838",
  phoneHref: "tel:+302410614838",
  email: "purespaexperience@gmail.com",
  address: { el: ["Ρούσβελτ 63", "Λάρισα, 412 22"], en: ["Rousvelt 63", "Larissa, 412 22"] },
  mapsHref: "https://www.google.com/maps/search/?api=1&query=Pure+Massage+%26+Spa+Experience+Rousvelt+63+Larissa",
  mapsEmbed: "https://www.google.com/maps?q=Pure+Massage+%26+Spa+Experience,+Rousvelt+63,+Larissa&z=16&output=embed",
  instagram: "https://www.instagram.com/pure_spa_experience/",
  facebook: "https://www.facebook.com/purespaexperience",
};

/** Interface copy. Headlines marked NEW were written for this page and are open to edits. */
export const UI = {
  book: { el: "Κλείστε ραντεβού", en: "Book now" },
  login: { el: "Είσοδος", en: "Log in" },
  menu: { el: "Μενού", en: "Menu" },
  close: { el: "Κλείσιμο", en: "Close" },
  call: { el: "Καλέστε μας", en: "Call us" },
  scrollToExplore: { el: "Κάντε scroll", en: "Scroll to explore" },
  // NEW
  heroTitle: {
    el: "Μασάζ, περιποίηση προσώπου και premium τελετουργίες ευεξίας με φυσικά προϊόντα, στο κέντρο της Λάρισας",
    en: "Massage, facials and premium wellness rituals with natural products, in the heart of Larissa",
  },
  reelTitle: {
    el: ["Όχι απλώς ένα spa,", "μια εμπειρία"],
    en: ["Not just a spa,", "an experience"],
  },
  reelText: {
    el: "Καλώς ήρθατε στο Pure Massage & Spa Experience! Ο ιδιαίτερος χώρος μας δημιουργήθηκε το 2023 με σκοπό την παροχή εξαιρετικών υπηρεσιών περιποίησης και αναζωογόνησης, χρησιμοποιώντας μόνο φυσικά προϊόντα και εξειδικευμένες τεχνικές, προσφέροντάς σας την απόλυτη ευεξία.",
    en: "Welcome to Pure Massage & Spa Experience! Our space was created in 2023 to offer exceptional care and rejuvenation, using only natural products and specialised techniques, for a feeling of complete wellbeing.",
  },
  reelCta: { el: "Οι θεραπείες μας", en: "Our treatments" },
  reelPlay: { el: ["Δείτε", "τον χώρο"], en: ["Play", "film"] },
  treatmentsTitle: { el: "Οι θεραπείες μας", en: "Signature treatments" },
  treatmentsNote: {
    el: "Θεραπείες προσώπου, υπηρεσίες μασάζ, premium θεραπείες, όλα στον ολοκαίνουργιο χώρο μας!",
    en: "Facials, massage and premium treatments, all in our brand-new space.",
  },
  priceListCta: { el: "Πλήρης τιμοκατάλογος", en: "Full price list" },
  priceListTitle: { el: "Τιμοκατάλογος", en: "Price list" },
  productsLabel: { el: "Τι θα βρείτε στα ράφια μας", en: "What you can find on our shelves" },
  productsTitle: { el: "Τα προϊόντα μας", en: "Our products" },
  productsText: {
    el: "Όλες οι θεραπείες στον χώρο μας γίνονται αποκλειστικά με προϊόντα AHAVA Dead Sea. Ενημερωθείτε για τα προϊόντα της AHAVA που μπορείτε να προμηθευτείτε στο Pure Massage Spa.",
    en: "Every treatment here is carried out exclusively with AHAVA Dead Sea products. These are the AHAVA products you can also take home from Pure Massage Spa.",
  },
  laserLabel: { el: "Αποτρίχωση με laser", en: "Laser hair removal" },
  // NEW
  spaceTitle: { el: "Ένας χώρος φτιαγμένος για ηρεμία", en: "A space made for stillness" },
  spaceText: {
    el: [
      "Βρισκόμαστε στο κέντρο της Λάρισας, επί της οδού Ρούσβελτ, σε έναν ολοκαίνουργιο χώρο που θα ικανοποιήσει κάθε σας ανάγκη.",
      "Δωμάτια μασάζ, hammam, sauna και κρυοσάουνα: συνεχίστε το scroll για μια βόλτα στον χώρο μας.",
    ],
    en: [
      "You will find us in the centre of Larissa, on Rousvelt Street, in a brand-new space designed around your every need.",
      "Massage rooms, hammam, sauna and cryosauna: keep scrolling for a walk through the spa.",
    ],
  },
  // NEW
  journeyTitle: {
    el: ["Περάστε μέσα,", "χαμηλώστε ρυθμούς", "κι αφήστε τη μέρα πίσω"],
    en: ["Step inside,", "slow down", "and leave the day behind"],
  },
  // NEW
  endSubtitle: { el: "Έτοιμοι για την απόλυτη χαλάρωση;", en: "Ready to truly unwind?" },
  endTitle: { el: ["Κλείστε το", "ραντεβού σας"], en: ["Book your", "visit"] },
  continueScroll: { el: "Συνεχίστε το scroll", en: "Continue to scroll" },
  phoneLabel: { el: "Τηλέφωνο", en: "Phone" },
  emailLabel: { el: "Email", en: "Email" },
  findUs: { el: ["Θα μας βρείτε", "στη Λάρισα"], en: ["Find us", "in Larissa"] },
  openMaps: { el: "Άνοιγμα στο Google Maps", en: "Open in Google Maps" },
  rights: {
    el: "© 2026 Pure Spa & Massage Experience",
    en: "© 2026 Pure Spa & Massage Experience",
  },
  stripSubtitle: { el: ["Συνεχίστε το scroll", "για να μας καλέσετε"], en: ["Keep scrolling", "to call us"] },
  stripTitle: { el: "Κλείστε ραντεβού", en: "Book your visit" },
} as const;

export const MENU_SECTIONS: { target: string; label: Localized }[] = [
  { target: "home-hero", label: { el: "Αρχική", en: "Home" } },
  { target: "home-reel", label: { el: "Η εμπειρία", en: "The experience" } },
  { target: "home-featured", label: { el: "Θεραπείες", en: "Treatments" } },
  { target: "home-products", label: { el: "Προϊόντα", en: "Products" } },
  { target: "home-goal", label: { el: "Ο χώρος", en: "The space" } },
  { target: "footer-section", label: { el: "Επικοινωνία", en: "Contact" } },
];

export interface Treatment {
  id: string;
  photo: string;
  clip?: string;
  category: Localized;
  name: Localized;
  /** Price and duration exactly as listed on the spa's site; some treatments list no price. */
  meta: string;
  /** The app service this card shows the live price of (see PriceLink). */
  link?: PriceLink;
  text: Localized;
}

const CATEGORY = {
  massage: { el: "Pure Massage Experience", en: "Pure Massage Experience" },
  premium: { el: "Pure Premium Treatments", en: "Pure Premium Treatments" },
  facial: { el: "Facial Treatments", en: "Facial Treatments" },
  express: { el: "Express Massage", en: "Express Massage" },
  special: { el: "Special Treatments", en: "Special Treatments" },
};

export const TREATMENTS: Treatment[] = [
  {
    id: "pure-massage",
    photo: "pure-massage",
    clip: "clip-pure-massage",
    category: CATEGORY.massage,
    name: { el: "Pure Massage", en: "Pure Massage" },
    meta: "27€ • 60'",
    link: { service: "Pure Massage", variation: "1 ώρα" },
    text: { el: "Μεσαίας έντασης μασάζ για τόνωση και ευεξία.", en: "A medium-pressure massage for tone and wellbeing." },
  },
  {
    id: "hot-stones",
    photo: "hot-stones",
    clip: "clip-hot-stones",
    category: CATEGORY.special,
    name: { el: "Hot Stones Anti-Stress", en: "Hot Stones Anti-Stress" },
    meta: "45€ • 60'",
    link: { service: "Hot Stones Massage", variation: "1 ώρα" },
    text: {
      el: "Μασάζ με θερμούς λίθους βασάλτη που προσφέρουν αίσθηση βαθιάς χαλάρωσης. Η συνεδρία συνδυάζεται με χρήση sauna.",
      en: "A massage with warm basalt stones for a feeling of deep relaxation. The session is combined with use of the sauna.",
    },
  },
  {
    id: "holistic",
    photo: "holistic",
    category: CATEGORY.massage,
    name: { el: "Pure Holistic Therapy", en: "Pure Holistic Therapy" },
    meta: "30€ • 60'",
    link: { service: "Holistic Therapy", variation: "1 ώρα" },
    text: {
      el: "Μεσαίας προς υψηλής έντασης μασάζ με πρόσθετες εφαρμογές (βεντούζες, κρουστικό πιστόλι, woodstick), αναλόγως των αναγκών σας.",
      en: "A medium to firm massage with added techniques (cupping, massage gun, woodstick) where needed, tailored to you.",
    },
  },
  {
    id: "turkish-bath",
    photo: "turkish-bath",
    clip: "clip-turkish-bath",
    category: CATEGORY.premium,
    name: { el: "Turkish Bath", en: "Turkish Bath" },
    meta: "55€ • 50'",
    text: {
      el: "Peeling απολέπισης με butter scrub από τη Νεκρά Θάλασσα, τούρκικο μπάνιο, μασάζ αφρού και ενυδάτωση με κρέμα σώματος AHAVA.",
      en: "Exfoliation with a Dead Sea butter scrub, Turkish bath, foam massage and hydration with AHAVA body cream.",
    },
  },
  {
    id: "sport-massage",
    photo: "sport-massage",
    category: CATEGORY.massage,
    name: { el: "Sport Massage", en: "Sport Massage" },
    meta: "30€ • 60'",
    link: { service: "Sports Massage", variation: "SPORT" },
    text: {
      el: "Υψηλής έντασης μάλαξη, η οποία συνδυάζεται με deep tissue χειρισμούς, διατάσεις και πρόσθετες εφαρμογές.",
      en: "Firm massage combined with deep-tissue work, stretching and added techniques.",
    },
  },
  {
    id: "mud-therapy",
    photo: "mud-therapy",
    category: CATEGORY.premium,
    name: { el: "Λασποθεραπεία", en: "Mud Therapy" },
    meta: "65€ • 70'",
    link: { service: "Λάσπη Νεκράς Θάλασσας" },
    text: {
      el: "Ορυκτή λάσπη από τη Νεκρά Θάλασσα περιποιείται την επιδερμίδα και ανακουφίζει από πόνους και ενοχλήσεις.",
      en: "Mineral mud from the Dead Sea cares for the skin while easing aches and discomfort.",
    },
  },
  {
    id: "facial",
    photo: "facial",
    clip: "clip-facial",
    category: CATEGORY.facial,
    name: { el: "Pure Facial Treatment", en: "Pure Facial Treatment" },
    meta: "28€ • 40'",
    link: { service: "Pure Facial Treatment" },
    text: {
      el: "Ολοκληρωμένη περιποίηση προσώπου με 7 προϊόντα AHAVA για βαθιά ενυδάτωση και λάμψη.",
      en: "A complete facial with 7 AHAVA products for deep hydration and glow.",
    },
  },
  {
    id: "chocolate",
    photo: "chocolate",
    category: CATEGORY.premium,
    name: { el: "Pure Chocolate Experience", en: "Pure Chocolate Experience" },
    meta: "58€ • 70'",
    link: { service: "Σοκολατοθεραπεία" },
    text: {
      el: "Πραγματική σοκολάτα σε συνδυασμό βουτύρου και αιθέριων ελαίων λιώνει μπροστά σας, για θρέψη και ενυδάτωση που διαρκεί ημέρες.",
      en: "Real chocolate with butter and essential oils melts in front of you, for nourishment and hydration that lasts for days.",
    },
  },
  {
    id: "royal-gold",
    photo: "royal-gold",
    category: CATEGORY.facial,
    name: { el: "Royal Gold Mineral", en: "Royal Gold Mineral" },
    meta: "45€ • 50'",
    link: { service: "Royal 24K Gold Mineral" },
    text: {
      el: "Ανόρθωση και επαναφορά της σφριγηλότητας. Ο καθαρός χρυσός 24Κ αποκαλύπτει τη φυσική λάμψη του δέρματος.",
      en: "Lifting and renewed firmness. Pure 24K gold reveals the skin's natural glow.",
    },
  },
  {
    id: "salt-bath",
    photo: "salt-bath",
    category: CATEGORY.premium,
    name: { el: "Μπάνιο Αλατιού", en: "Salt Bath" },
    meta: "45€ • 40'",
    link: { service: "Μπάνιο Αλατιού" },
    text: {
      el: "Απολέπιση σώματος με άλατα από τη Νεκρά Θάλασσα, λάδι με βιταμίνες και αιθέρια έλαια, και βαθιά ενυδάτωση AHAVA.",
      en: "Body exfoliation with Dead Sea salts, vitamin oil and essential oils, finished with deep AHAVA hydration.",
    },
  },
  {
    id: "four-hands",
    photo: "four-hands",
    category: CATEGORY.massage,
    name: { el: "Four Hands Massage", en: "Four Hands Massage" },
    meta: "55'",
    text: { el: "Μοναδική αίσθηση απόλαυσης με συνδυασμό τεσσάρων χεριών.", en: "A unique feeling of indulgence from four hands working together." },
  },
  {
    id: "hammam",
    photo: "hammam",
    category: CATEGORY.express,
    name: { el: "Hammam", en: "Hammam" },
    meta: "13€ • 30'",
    link: { service: "ΧΑΜΑΜ" },
    text: {
      el: "Εντατική αποτοξίνωση και βαθιά χαλάρωση των μυών σε υγρό, θερμό περιβάλλον. Παρέχεται scrub, γάντι απολέπισης, πετσέτα, μπουρνούζι και παντόφλες.",
      en: "Intensive detox and deep muscle relaxation in warm, humid air. Scrub, exfoliating glove, towel, robe and slippers are provided.",
    },
  },
];

/**
 * Links a page item to a service in the booking app (by its name there, and
 * a variation's name when the price is a variation's), so the page shows the
 * app's current price and duration. `meta` stays as the fallback, used when
 * the app can't be reached or the service was renamed or removed.
 */
export interface PriceLink {
  service: string;
  variation?: string;
}

export interface PriceGroup {
  title: string;
  note?: Localized;
  items: { name: Localized; meta: string; link?: PriceLink }[];
}

const same = (name: string): Localized => ({ el: name, en: name });

/** The complete menu, with prices and durations as listed on the spa's site. */
export const PRICE_LIST: PriceGroup[] = [
  {
    title: "Pure Massage Experience",
    note: {
      el: "Σε όλες τις συνεδρίες περιλαμβάνεται μασάζ σε όλο το σώμα, στο πέλμα και στο κεφάλι.",
      en: "Every session includes a full-body, foot and head massage.",
    },
    items: [
      { name: same("Pure Massage"), meta: "27€ • 60'", link: { service: "Pure Massage", variation: "1 ώρα" } },
      { name: same("Pure Holistic Therapy"), meta: "30€ • 60'", link: { service: "Holistic Therapy", variation: "1 ώρα" } },
      { name: same("Sport Massage"), meta: "30€ • 60'", link: { service: "Sports Massage", variation: "SPORT" } },
      { name: { el: "Κατακράτηση - Κυτταρίτιδα", en: "Water retention - Cellulite" }, meta: "40'" },
      { name: same("Hot Stones Anti-Stress Experience Massage"), meta: "65'" },
      { name: same("Four Hands Massage"), meta: "55'" },
    ],
  },
  {
    title: "Express Massage",
    note: {
      el: "Η χρήση του ντους δεν περιλαμβάνεται στα express massage (εκτός της sauna).",
      en: "Use of the shower is not included with express massages (except with the sauna).",
    },
    items: [
      { name: { el: "Πλάτη - Αυχένας - Κεφάλι", en: "Back - Neck - Head" }, meta: "20€ • 30'", link: { service: "Πλάτη | Αυχένας | Κεφάλι" } },
      { name: { el: "Πόδια - Πέλματα", en: "Legs - Feet" }, meta: "20€ • 30'", link: { service: "Πόδια | Πέλματα" } },
      { name: same("Head massage"), meta: "12€ • 15'", link: { service: "Head Massage" } },
      { name: same("Foot massage"), meta: "12€ • 15'", link: { service: "Foot Massage" } },
      { name: same("Hammam"), meta: "13€ • 30'", link: { service: "ΧΑΜΑΜ" } },
      { name: same("Sauna"), meta: "30'", link: { service: "ΣΑΟΥΝΑ" } },
      { name: { el: "Κρυοσάουνα", en: "Cryosauna" }, meta: "" },
    ],
  },
  {
    title: "Pure Premium Treatments",
    note: {
      el: "Όλες οι premium συνεδρίες συνδυάζονται με χρήση σάουνας 20 λεπτών.",
      en: "All premium sessions are combined with 20 minutes in the sauna.",
    },
    items: [
      { name: same("Turkish Bath"), meta: "55€ • 50'" },
      { name: { el: "Λασποθεραπεία", en: "Mud Therapy" }, meta: "65€ • 70'", link: { service: "Λάσπη Νεκράς Θάλασσας" } },
      { name: { el: "Μπάνιο Αλατιού", en: "Salt Bath" }, meta: "45€ • 40'", link: { service: "Μπάνιο Αλατιού" } },
      { name: same("Pure Chocolate Experience"), meta: "58€ • 70'", link: { service: "Σοκολατοθεραπεία" } },
    ],
  },
  {
    title: "Special Treatments",
    items: [
      { name: { el: "Κατακράτηση - Κυτταρίτιδα", en: "Water retention - Cellulite" }, meta: "35€ • 60'", link: { service: "Μασάζ Κατά της Κυτταρίτιδας με φύκια" } },
      { name: { el: "Massage Εγκυμοσύνης", en: "Pregnancy Massage" }, meta: "30€ • 60'", link: { service: "Μασάζ Εγκυμοσύνης" } },
      { name: same("Hot Stones Anti-Stress Experience Massage"), meta: "45€ • 60'", link: { service: "Hot Stones Massage", variation: "1 ώρα" } },
      { name: { el: "Ρεφλεξολογία", en: "Reflexology" }, meta: "40€ • 60'" },
      { name: same("Bachelor / Bachelorette"), meta: "" },
    ],
  },
  {
    title: "Facial Treatments",
    note: {
      el: "Όλες οι θεραπείες γίνονται αποκλειστικά με προϊόντα AHAVA Dead Sea και συνοδεύονται με τη χρήση παλμικού υπερήχου.",
      en: "All treatments use AHAVA Dead Sea products exclusively and include pulsed ultrasound.",
    },
    items: [
      { name: same("Pure Facial Treatment"), meta: "28€ • 40'", link: { service: "Pure Facial Treatment" } },
      { name: same("Mineral Even Tone pRETINOL"), meta: "20€ • 50'", link: { service: "Minereal Event p-Retinol" } },
      { name: same("Royal Gold Mineral"), meta: "45€ • 50'", link: { service: "Royal 24K Gold Mineral" } },
      { name: same("Botox Effect AOS Mineral"), meta: "45€ • 50'", link: { service: "Botox Effect AOS Mineral" } },
      { name: same("Express Deep Face Detox"), meta: "20€ • 20'", link: { service: "Express Deep Face Detox" } },
      { name: same("Men Mineral Energy"), meta: "40'" },
      { name: { el: "Express Deep Face Detox (πακέτο 4 θεραπειών)", en: "Express Deep Face Detox (pack of 4)" }, meta: "20' x 4" },
    ],
  },
];

export const PRODUCTS = [
  "Mineral Body Lotion",
  "Advanced Smoothing Serum",
  "AHAVA For Men",
  "Deadsea Water",
  "Softening Butter Salt Scrub",
  "Dunaliella Peel-Off Mask",
  "24K Gold Mineral Mud Mask",
  "Mineral Botanic Velvet Body Lotion",
  "Purifying Mud Mask",
  "Overnight Deep Wrinkle Mask",
  "Halobacteria Nutri-action Cream",
  "Essential Day Moisturizer",
  "Mineral Mud Facial Treatment Mask",
];

export const PRODUCT_PHOTOS = ["products-shelf", "products-gold", "products-lotion", "products-men"];

export const LASER = {
  title: "Laser AI Alexandrite 755 nm",
  text: {
    el: "Η θεραπεία με laser Alexandrite 755 nm αποτελεί τη χρυσή λύση για την αφαίρεση ανεπιθύμητων τριχών. Η ακτινοβολία του laser απορροφάται από τη μελανίνη της τρίχας και μεταφέρει ενέργεια στο θυλάκιο, χωρίς να βλάπτει τους γύρω ιστούς. Η διαδικασία είναι γρήγορη, με άμεση επιστροφή στις καθημερινές δραστηριότητες, και απαιτεί ορισμένες συνεδρίες για βέλτιστα αποτελέσματα.",
    en: "Alexandrite 755 nm laser treatment is the gold standard for removing unwanted hair. The laser light is absorbed by the melanin in the hair and carries energy to the follicle without harming the surrounding tissue. The procedure is quick, you return to daily life straight away, and a course of sessions gives the best results.",
  },
  points: [
    {
      title: { el: "Υψηλή απόδοση", en: "High performance" },
      text: { el: "Ειδικά για άτομα με ανοιχτόχρωμο δέρμα και σκούρες τρίχες.", en: "Especially for light skin with dark hair." },
    },
    {
      title: { el: "Ακρίβεια & ασφάλεια", en: "Precision & safety" },
      text: { el: "Το μήκος κύματος στοχεύει μόνο στο θυλάκιο της τρίχας.", en: "The wavelength targets only the hair follicle." },
    },
    {
      title: { el: "Ταχύτητα", en: "Speed" },
      text: { el: "Η μεγάλη διάμετρος της δέσμης καλύπτει γρήγορα μεγάλες περιοχές, όπως πλάτη και πόδια.", en: "The wide beam covers large areas such as the back and legs quickly." },
    },
    {
      title: { el: "Άνεση", en: "Comfort" },
      text: { el: "Το ενσωματωμένο σύστημα ψύξης δροσίζει το δέρμα πριν, κατά τη διάρκεια και μετά τον παλμό.", en: "Built-in cooling chills the skin before, during and after each pulse." },
    },
  ],
};

export interface Scene {
  photo: string;
  /** CSS object-position for the full-screen crop. */
  focus?: string;
  label: Localized;
  text: Localized;
}

/** The scroll-driven walk through the spa, in the order a guest moves through it. */
export const SCENES: Scene[] = [
  {
    photo: "reception",
    label: { el: "Υποδοχή", en: "Reception" },
    text: { el: "Ρούσβελτ 63, στο κέντρο της Λάρισας.", en: "Rousvelt 63, in the centre of Larissa." },
  },
  {
    photo: "lounge",
    label: { el: "Lounge", en: "Lounge" },
    text: { el: "Λίγα λεπτά ηρεμίας πριν και μετά τη θεραπεία σας.", en: "A few quiet minutes before and after your treatment." },
  },
  {
    photo: "massage-room",
    label: { el: "Δωμάτια μασάζ", en: "Massage rooms" },
    text: { el: "Ζεστό φως, για ένα άτομο ή για δύο.", en: "Warm light, for one or for two." },
  },
  {
    photo: "pure-massage",
    label: { el: "Pure Massage", en: "Pure Massage" },
    text: { el: "Μασάζ σε όλο το σώμα, στο πέλμα και στο κεφάλι.", en: "Full-body, foot and head massage." },
  },
  {
    photo: "hot-stones",
    label: { el: "Hot Stones", en: "Hot Stones" },
    text: { el: "Θερμοί λίθοι βασάλτη για βαθιά χαλάρωση.", en: "Warm basalt stones for deep relaxation." },
  },
  {
    photo: "hammam",
    label: { el: "Hammam", en: "Hammam" },
    text: { el: "Θερμές ψηφίδες, ατμός και απολέπιση.", en: "Heated mosaic, steam and exfoliation." },
  },
  {
    photo: "turkish-bath",
    label: { el: "Turkish Bath", en: "Turkish Bath" },
    text: { el: "Μασάζ αφρού με αρώματα ιβίσκου και σύκου.", en: "Foam massage scented with hibiscus and fig." },
  },
  {
    photo: "sauna",
    focus: "50% 60%",
    label: { el: "Sauna", en: "Sauna" },
    text: { el: "Θερμοθεραπεία για χαλάρωση των μυών.", en: "Heat therapy to relax the muscles." },
  },
  {
    photo: "facial",
    label: { el: "Περιποίηση προσώπου", en: "Facial care" },
    text: { el: "Αποκλειστικά με προϊόντα AHAVA Dead Sea.", en: "Exclusively with AHAVA Dead Sea products." },
  },
];
