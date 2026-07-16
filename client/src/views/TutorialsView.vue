<template>
  <div class="tutorials-container bg-white">
    <!-- ═══════════════════════════════════════════════════════
         HERO
    ═══════════════════════════════════════════════════════ -->
    <section class="relative overflow-hidden bg-white pt-16 pb-14">
      <div
        class="absolute -top-32 -right-32 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-pink-100 rounded-full blur-3xl opacity-40 pointer-events-none hidden sm:block"
      ></div>

      <div
        class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center"
      >
        <span
          class="inline-flex items-center gap-2 bg-pink-50 text-[#ff93d4] text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full border border-pink-200 mb-6"
        >
          <i class="pi pi-book"></i> Οδηγοί Χρήσης
        </span>

        <h1
          class="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-4"
        >
          Πώς λειτουργεί το
          <span class="text-[#ff93d4]">Interventio</span>
        </h1>

        <p class="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
          Βήμα-βήμα οδηγίες για όλες τις βασικές λειτουργίες της εφαρμογής — από
          τον προγραμματισμό ραντεβού μέχρι τη διαχείριση πληρωμών και αναφορών.
        </p>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         STICKY SECTION NAV
    ═══════════════════════════════════════════════════════ -->
    <div
      class="sticky top-16 z-30 bg-white/95 backdrop-blur border-b border-gray-100"
    >
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex gap-2 overflow-x-auto py-3 no-scrollbar">
          <button
            v-for="section in sections"
            :key="section.id"
            @click="scrollToSection(section.id)"
            class="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors"
            :class="
              activeSection === section.id
                ? 'bg-[#ff93d4] text-white'
                : 'bg-gray-50 text-gray-600 hover:bg-pink-50 hover:text-[#ff93d4]'
            "
          >
            <i :class="section.icon" class="text-xs"></i>
            {{ section.title }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════
         SECTIONS
    ═══════════════════════════════════════════════════════ -->
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-16">
      <section
        v-for="section in sections"
        :key="section.id"
        :id="section.id"
        class="scroll-mt-32"
      >
        <div class="flex items-start gap-4 mb-2">
          <div
            class="w-12 h-12 rounded-2xl bg-pink-50 text-[#ff93d4] flex items-center justify-center flex-shrink-0"
          >
            <i :class="section.icon" class="text-xl"></i>
          </div>
          <div>
            <h2 class="text-2xl font-extrabold text-gray-900">
              {{ section.title }}
            </h2>
            <p class="text-sm text-gray-500 mt-1">{{ section.description }}</p>
          </div>
        </div>

        <div class="mt-6 space-y-3">
          <div
            v-for="(topic, ti) in section.topics"
            :key="ti"
            class="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm"
          >
            <button
              @click="toggleTopic(section.id, ti)"
              class="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <span class="font-bold text-gray-800 text-sm sm:text-base">{{
                topic.q
              }}</span>
              <i
                class="pi pi-chevron-down text-gray-400 text-xs flex-shrink-0 transition-transform"
                :class="isOpen(section.id, ti) ? 'rotate-180' : ''"
              ></i>
            </button>

            <div v-show="isOpen(section.id, ti)" class="px-5 pb-5">
              <ol class="space-y-2.5">
                <li
                  v-for="(step, si) in topic.steps"
                  :key="si"
                  class="flex gap-3 text-sm text-gray-600 leading-relaxed"
                >
                  <span
                    class="flex-shrink-0 w-5 h-5 rounded-full bg-pink-50 text-[#ff93d4] text-[11px] font-bold flex items-center justify-center mt-0.5"
                  >
                    {{ si + 1 }}
                  </span>
                  <span v-html="step"></span>
                </li>
              </ol>
              <p
                v-if="topic.note"
                class="mt-3 text-xs text-gray-400 italic flex items-start gap-1.5"
              >
                <i class="pi pi-info-circle mt-0.5"></i>
                <span>{{ topic.note }}</span>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ═══════════════════════════════════════════════════════
         CTA FOOTER
    ═══════════════════════════════════════════════════════ -->
    <section class="py-16 bg-[#fff5f9] text-center">
      <div class="max-w-2xl mx-auto px-4">
        <h3 class="text-2xl font-extrabold text-gray-900 mb-3">
          Δεν βρήκατε αυτό που ψάχνατε;
        </h3>
        <p class="text-gray-600 mb-6">
          Επικοινωνήστε μαζί μας και θα σας βοηθήσουμε άμεσα.
        </p>
        <div class="flex flex-wrap justify-center gap-4">
          <a
            href="mailto:interventiobooking@gmail.com"
            class="inline-flex items-center gap-2 bg-[#ff93d4] hover:bg-pink-500 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg shadow-pink-200 transition-colors"
          >
            <i class="pi pi-envelope"></i> Επικοινωνία
          </a>
          <router-link
            to="/"
            class="inline-flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-xl text-sm font-bold transition-colors"
          >
            <i class="pi pi-home"></i> Αρχική Σελίδα
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

type Topic = { q: string; steps: string[]; note?: string };
type Section = {
  id: string;
  icon: string;
  title: string;
  description: string;
  topics: Topic[];
};

const sections: Section[] = [
  {
    id: "appointments",
    icon: "pi pi-calendar",
    title: "Ραντεβού",
    description: "Προγραμματισμός, επαναλαμβανόμενα ραντεβού και πληρωμές.",
    topics: [
      {
        q: "Πώς δημιουργώ ένα νέο ραντεβού;",
        steps: [
          "Μεταβείτε στο <strong>Ημερολόγιο</strong> και κάντε κλικ σε ένα κενό χρονικό διάστημα.",
          "Επιλέξτε τον πελάτη από τη λίστα, ή πατήστε το <strong>+</strong> για να δημιουργήσετε νέο πελάτη επιτόπου.",
          "Προσθέστε μία ή περισσότερες υπηρεσίες, επιλέγοντας θεραπευτή και ώρα για κάθε μία.",
          "Προαιρετικά, προσθέστε σημείωση ραντεβού (ορατή στον πελάτη) ή εσωτερική σημείωση (μόνο για το προσωπικό).",
          "Πατήστε <strong>Αποθήκευση</strong>.",
        ],
      },
      {
        q: "Πώς δημιουργώ επαναλαμβανόμενο ραντεβού;",
        steps: [
          "Κατά τη δημιουργία ραντεβού, ενεργοποιήστε την επιλογή <strong>«Επανάληψη Ραντεβού»</strong>.",
          "Επιλέξτε συχνότητα (Ημερήσια, Εβδομαδιαία, Δεκαπενθήμερη ή Μηνιαία) και ημερομηνία λήξης.",
          "Πατήστε <strong>Αποθήκευση</strong> — το σύστημα δημιουργεί αυτόματα όλα τα ραντεβού της σειράς.",
        ],
        note: "Μόνο η πρώτη επανάληψη δέχεται προκαταβολή· οι υπόλοιπες ξεκινούν ως απλήρωτες. Αν υπάρχει ήδη ραντεβού στον ίδιο θεραπευτή/πελάτη/ώρα, παραλείπεται αυτόματα για να αποφευχθούν διπλοκρατήσεις.",
      },
      // {
      //   q: "Πώς προσθέτω προϊόντα σε ένα ραντεβού;",
      //   steps: [
      //     "Ανοίξτε το ραντεβού και μεταβείτε στην καρτέλα <strong>«Λιανική»</strong>.",
      //     "Επιλέξτε προϊόν (και παραλλαγή, αν υπάρχει) και ποσότητα.",
      //     "Το κόστος προστίθεται αυτόματα στο συνολικό κόστος του ραντεβού και το απόθεμα ενημερώνεται κατά την αποθήκευση.",
      //   ],
      // },
      {
        q: "Πώς καταχωρώ πληρωμή;",
        steps: [
          "Ανοίξτε το ραντεβού και μεταβείτε στην καρτέλα <strong>«Πληρωμή»</strong>.",
          "Δείτε το κόστος του τρέχοντος ραντεβού, τυχόν παλαιότερο υπόλοιπο του πελάτη και το συνολικό οφειλόμενο ποσό.",
          "Επιλέξτε μέθοδο πληρωμής (μετρητά, κάρτα, τραπεζικό έμβασμα) και το ποσό.",
          "Πατήστε <strong>«Ολοκλήρωση Πληρωμής»</strong> ή <strong>«Εξόφληση Υπολοίπου»</strong>.",
        ],
        note: "Η πληρωμή κατανέμεται αυτόματα: πρώτα εξοφλεί το τρέχον ραντεβού, και ό,τι περισσέψει πηγαίνει στα παλαιότερα απλήρωτα ραντεβού του ίδιου πελάτη, ξεκινώντας από το παλαιότερο.",
      },
      {
        q: "Πώς ακυρώνω ή διαγράφω ένα ραντεβού;",
        steps: [
          "Ανοίξτε το ραντεβού και πατήστε <strong>«Ακύρωση Ραντεβού»</strong>.",
          "Αν το ραντεβού ανήκει σε επαναλαμβανόμενη σειρά, θα ερωτηθείτε αν θέλετε να ακυρώσετε μόνο αυτό ή αυτό και όλα τα επόμενα.",
        ],
      },
      {
        q: "Τι σημαίνουν οι καταστάσεις ενός ραντεβού;",
        steps: [
          "<strong>Νέο</strong> — μόλις δημιουργήθηκε.",
          "<strong>Επιβεβαιωμένο</strong> — έχει καταχωρηθεί μερική πληρωμή.",
          "<strong>Ολοκληρωμένο</strong> — έχει εξοφληθεί πλήρως.",
          "<strong>Ακυρωμένο</strong> / <strong>Δεν προσήλθε</strong> — δεν πραγματοποιήθηκε.",
        ],
      },
    ],
  },
  {
    id: "clients",
    icon: "pi pi-address-book",
    title: "Πελάτες",
    description: "Προφίλ, υπόλοιπο, αρχεία και ιστορικό κάθε πελάτη.",
    topics: [
      {
        q: "Πώς προσθέτω νέο πελάτη;",
        steps: [
          "Μεταβείτε στην ενότητα <strong>Πελάτες</strong> και πατήστε <strong>«Νέος Πελάτης»</strong>.",
          "Συμπληρώστε τουλάχιστον όνομα και επώνυμο (email/τηλέφωνο προαιρετικά).",
          "Επιλέξτε τις ενεργές υπηρεσίες του πελάτη (Εργοθεραπεία / Φυσιοθεραπεία / Λογοθεραπεία), αν είναι ενεργοποιημένες στο κατάστημά σας.",
          "Πατήστε <strong>Αποθήκευση</strong>.",
        ],
      },
      {
        q: "Τι περιλαμβάνει το προφίλ ενός πελάτη;",
        steps: [
          "<strong>Στοιχεία</strong> — όνομα, επικοινωνία, ημερομηνία γέννησης, σημειώσεις και προσαρμοσμένα πεδία.",
          "<strong>Ιστορικό</strong> — όλα τα προηγούμενα ραντεβού με ποσοστό προσέλευσης.",
          "<strong>Αρχεία</strong> — αξιολογητικά και έγγραφα του πελάτη.",
          "<strong>Υπόλοιπο</strong> — το τρέχον οφειλόμενο ποσό, ορατό στους ιδιοκτήτες.",
        ],
      },
      {
        q: "Πώς λειτουργεί το υπόλοιπο (balance) του πελάτη;",
        steps: [
          "Το υπόλοιπο υπολογίζεται αυτόματα ως: <em>(κόστος υπηρεσιών όλων των περασμένων ραντεβού) − (ό,τι έχει ήδη πληρωθεί).</em>",
          "Ενημερώνεται αυτόματα μετά από κάθε πληρωμή, δημιουργία, επεξεργασία ή διαγραφή ραντεβού.",
          "Το ανοίξετε το προφίλ πελάτη, το υπόλοιπο υπολογίζεται πάντα ξανά για να είναι σίγουρα ενημερωμένο.",
        ],
      },
      {
        q: "Πώς ανεβάζω αρχεία (αξιολογητικά) για έναν πελάτη;",
        steps: [
          "Ανοίξτε το προφίλ του πελάτη και μεταβείτε στην καρτέλα <strong>«Αξιολογητικά»</strong>.",
          "Πατήστε πάνω στην περιοχή μεταφόρτωσης και επιλέξτε το αρχείο (έως 5MB).",
          "Το αρχείο εμφανίζεται στη λίστα και μπορείτε να το προβάλετε ή να το κατεβάσετε ανά πάσα στιγμή.",
        ],
      },
      {
        q: "Πώς προσκαλώ έναν πελάτη στην Πύλη Πελάτη;",
        steps: [
          "Στη λίστα πελατών, πατήστε το εικονίδιο <strong>«Πρόσκληση στην Πύλη»</strong> δίπλα στον πελάτη.",
          "Απαιτείται ο πελάτης να έχει καταχωρημένο email.",
          "Ο πελάτης λαμβάνει πρόσβαση να βλέπει τα δικά του ραντεβού κα αρχεία.",
        ],
      },
      {
        q: "Πώς διαγράφω έναν πελάτη;",
        steps: [
          "Στη λίστα πελατών, πατήστε το εικονίδιο διαγραφής δίπλα στον πελάτη (διαθέσιμο μόνο σε ιδιοκτήτες).",
          "Επιβεβαιώστε τη διαγραφή στο παράθυρο που εμφανίζεται.",
        ],
      },
    ],
  },
  {
    id: "staff",
    icon: "pi pi-users",
    title: "Προσωπικό",
    description: "Μέλη προσωπικού, ειδικότητες και λογαριασμοί εισόδου.",
    topics: [
      {
        q: "Πώς προσθέτω νέο μέλος προσωπικού;",
        steps: [
          "Μεταβείτε στην ενότητα <strong>Προσωπικό</strong> και πατήστε <strong>«Νέο Μέλος»</strong>.",
          "Συμπληρώστε όνομα, επικοινωνία και ειδικότητα.",
          "Επιλέξτε τις υπηρεσίες που μπορεί να παρέχει το μέλος.",
          "Πατήστε <strong>Αποθήκευση</strong>.",
        ],
      },
      {
        q: "Πώς δημιουργώ λογαριασμό εισόδου για μέλος προσωπικού;",
        steps: [
          "Στη λίστα προσωπικού, πατήστε το εικονίδιο <strong>κλειδί</strong> δίπλα στο μέλος.",
          "Ορίστε όνομα χρήστη και κωδικό πρόσβασης.",
          "Το μέλος μπορεί πλέον να συνδεθεί και να διαχειρίζεται τα δικά του ραντεβού.",
        ],
      },
      {
        q: "Πώς απενεργοποιώ ή διαγράφω ένα μέλος προσωπικού;",
        steps: [
          "Στη λίστα προσωπικού, πατήστε το εικονίδιο διαγραφής δίπλα στο μέλος.",
          "Επιβεβαιώστε — το μέλος γίνεται ανενεργό και δεν εμφανίζεται πλέον στις επιλογές νέων ραντεβού.",
        ],
      },
    ],
  },
  {
    id: "services",
    icon: "pi pi-wrench",
    title: "Υπηρεσίες",
    description: "Ο κατάλογος υπηρεσιών που προσφέρει το κατάστημά σας.",
    topics: [
      {
        q: "Πώς δημιουργώ μια νέα υπηρεσία;",
        steps: [
          "Μεταβείτε στην ενότητα <strong>Υπηρεσίες</strong> και πατήστε <strong>«Νέα Υπηρεσία»</strong>.",
          "Συμπληρώστε όνομα, κατηγορία, διάρκεια (σε λεπτά) και τιμή.",
          "Επιλέξτε χρώμα — θα χρησιμοποιείται για τα ραντεβού αυτής της υπηρεσίας στο ημερολόγιο.",
          "Πατήστε <strong>Αποθήκευση</strong>.",
        ],
      },
      {
        q: "Πώς επεξεργάζομαι ή διαγράφω μια υπηρεσία;",
        steps: [
          "Στη λίστα υπηρεσιών, πατήστε το εικονίδιο επεξεργασίας για αλλαγές, ή το εικονίδιο διαγραφής για αφαίρεση.",
        ],
        note: "Η διαγραφή μιας υπηρεσίας δεν επηρεάζει τα ήδη καταχωρημένα ραντεβού που τη χρησιμοποιούν.",
      },
    ],
  },
  // {
  //   id: "products",
  //   icon: "pi pi-shopping-bag",
  //   title: "Προϊόντα",
  //   description: "Διαχείριση αποθέματος και πωλήσεων λιανικής.",
  //   topics: [
  //     {
  //       q: "Πώς δημιουργώ ένα νέο προϊόν;",
  //       steps: [
  //         "Μεταβείτε στην ενότητα <strong>Προϊόντα</strong> και πατήστε <strong>«Νέο Προϊόν»</strong>.",
  //         "Συμπληρώστε όνομα και περιγραφή.",
  //         "Προσθέστε μία ή περισσότερες παραλλαγές (π.χ. μεγέθη), κάθε μία με δικιά της τιμή και αρχικό απόθεμα.",
  //         "Πατήστε <strong>Αποθήκευση</strong>.",
  //       ],
  //     },
  //     {
  //       q: "Πώς προσαρμόζω το απόθεμα ενός προϊόντος;",
  //       steps: [
  //         "Στη λίστα προϊόντων, πατήστε <strong>«Προσαρμογή Αποθέματος»</strong> για την παραλλαγή που θέλετε.",
  //         "Εισάγετε τη νέα ποσότητα και επιβεβαιώστε.",
  //       ],
  //     },
  //     {
  //       q: "Πώς πουλάω ένα προϊόν;",
  //       steps: [
  //         "Τα προϊόντα πωλούνται μέσα από ένα ραντεβού, στην καρτέλα «Λιανική» (δείτε την ενότητα Ραντεβού παραπάνω).",
  //         "Το απόθεμα ενημερώνεται αυτόματα με κάθε πώληση.",
  //       ],
  //     },
  //   ],
  // },
  {
    id: "financials",
    icon: "pi pi-chart-bar",
    title: "Αναλυτικά & Οικονομικά",
    description:
      "Αναφορές, KPIs και επισκόπηση εσόδων — διαθέσιμο σε ιδιοκτήτες.",
    topics: [
      {
        q: "Τι δείχνουν οι κάρτες στην κορυφή της σελίδας;",
        steps: [
          "<strong>Συνολικές Πωλήσεις</strong> — αξία υπηρεσιών & προϊόντων στο επιλεγμένο διάστημα.",
          "<strong>Εισπράξεις Σήμερα</strong> — ό,τι έχει πληρωθεί σήμερα.",
          "<strong>Συνολικό Χρέος</strong> — άθροισμα υπολοίπων όλων των πελατών.",
          "<strong>Διατήρηση Πελατών</strong> — ποσοστό επαναλαμβανόμενων έναντι νέων πελατών.",
        ],
      },
      {
        q: "Πώς φιλτράρω τα αναλυτικά ανά ημερομηνία;",
        steps: [
          "Χρησιμοποιήστε τα πεδία <strong>«Από» / «Έως»</strong> στο πάνω μέρος της σελίδας.",
          "Πατήστε <strong>«Σήμερα»</strong> για γρήγορο φιλτράρισμα της τρέχουσας ημέρας.",
          "Πατήστε <strong>«Εφαρμογή»</strong> για να ενημερωθούν όλες οι κάρτες και οι αναφορές.",
        ],
      },
      {
        q: "Τι αναφορές είναι διαθέσιμες στις καρτέλες;",
        steps: [
          "<strong>Δημογραφικά</strong> — κατανομή πελατών ανά ηλικιακή ομάδα.",
          "<strong>Απόδοση Υπηρεσιών</strong> — πλήθος, εισπράξεις και οφειλές ανά υπηρεσία.",
          "<strong>Πωλήσεις ανά Υπηρεσία</strong> — γράφημα κατανομής εσόδων.",
          "<strong>Πληρωμές</strong> — αναλυτική καταγραφή όλων των συναλλαγών του διαστήματος.",
        ],
      },
    ],
  },
];

const openTopics = ref<Set<string>>(new Set());
const activeSection = ref(sections[0].id);

const keyFor = (sectionId: string, topicIndex: number) =>
  `${sectionId}-${topicIndex}`;

const isOpen = (sectionId: string, topicIndex: number) =>
  openTopics.value.has(keyFor(sectionId, topicIndex));

const toggleTopic = (sectionId: string, topicIndex: number) => {
  const key = keyFor(sectionId, topicIndex);
  if (openTopics.value.has(key)) {
    openTopics.value.delete(key);
  } else {
    openTopics.value.add(key);
  }
  // trigger reactivity for Set mutation
  openTopics.value = new Set(openTopics.value);
};

const scrollToSection = (id: string) => {
  activeSection.value = id;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
};
</script>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
