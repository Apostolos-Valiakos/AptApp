<template>
  <div class="landing-container">
    <!-- ═══════════════════════════════════════════════════════
         HERO SECTION
    ═══════════════════════════════════════════════════════ -->
    <section class="relative overflow-hidden bg-white pt-16 pb-24">
      <!-- background blobs -->
      <div
        class="absolute -top-32 -right-32 w-[300px] h-[300px] sm:w-[600px] sm:h-[600px] bg-pink-100 rounded-full blur-3xl opacity-40 pointer-events-none hidden sm:block"
      ></div>
      <div
        class="absolute -bottom-20 -left-20 w-80 h-80 bg-pink-50 rounded-full blur-3xl opacity-60 pointer-events-none"
      ></div>

      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div class="grid lg:grid-cols-2 gap-16 items-center">
          <!-- LEFT: copy -->
          <div class="text-left">
            <span
              class="inline-flex items-center gap-2 bg-pink-50 text-[#ff93d4] text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full border border-pink-200 mb-6"
            >
              <i class="pi pi-verified"></i> Σχεδιασμένο για Θεραπευτήρια
            </span>

            <h1
              class="text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6"
            >
              Διαχειριστείτε το Θεραπευτήριό σας
              <span class="text-[#ff93d4]"> χωρίς χαοτικά χαρτιά.</span>
            </h1>

            <p class="text-lg text-gray-600 mb-4 leading-relaxed">
              Το <strong>Interventio</strong> είναι η all-in-one πλατφόρμα για
              Εργοθεραπεία, Φυσιοθεραπεία & Λογοθεραπεία. Ραντεβού, πελάτες,
              ΕΟΠΠΥ, πληρωμές και αναλύσεις <br />
              Όλα σε ένα ασφαλές σύστημα.
            </p>

            <ul class="space-y-2 mb-8 text-sm text-gray-600">
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Ημερολόγιο
                πολλαπλών θεραπευτών με drag &amp; drop
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Αυτόματη
                παρακολούθηση χρεών &amp; πληρωμών ΕΟΠΠΥ
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Πύλη πελατών
                για ψηφιακά αρχεία &amp; ιστορικό
              </li>
            </ul>

            <div class="flex flex-wrap gap-4">
              <Button
                label="Ζητήστε Demo"
                icon="pi pi-calendar"
                class="!bg-[#ff93d4] border-none hover:!bg-pink-500 !py-3 !px-7 !text-base shadow-lg shadow-pink-200"
                @click="openDemo"
              />
              <Button
                label="Είσοδος"
                icon="pi pi-sign-in"
                severity="secondary"
                outlined
                class="!py-3 !px-7 !text-base"
                @click="router.push('/login')"
              />
            </div>

            <!-- trust badges -->
            <div class="flex items-center gap-6 mt-8 text-xs text-gray-400">
              <span class="flex items-center gap-1"
                ><i class="pi pi-lock"></i> Ασφαλή Δεδομένα</span
              >
              <span class="flex items-center gap-1"
                ><i class="pi pi-globe"></i> Ελληνική Υποστήριξη</span
              >
              <span class="flex items-center gap-1"
                ><i class="pi pi-cloud"></i> Cloud SaaS</span
              >
            </div>
          </div>

          <!-- RIGHT: hero image -->
          <div class="relative flex items-center justify-center">
            <div
              class="absolute inset-0 bg-gradient-to-br from-pink-100 to-white rounded-3xl transform rotate-2 scale-105"
            ></div>
            <img
              src="https://petaloudakids.gr/wp-content/uploads/2025/04/11.webp"
              alt="Παιδιά σε θεραπεία"
              class="relative rounded-3xl shadow-2xl border-4 border-white object-cover w-full max-h-[480px]"
              style="object-position: top"
            />
            <!-- floating stat card -->
            <div
              class="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 flex items-center gap-3"
            >
              <div
                class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"
              >
                <i class="pi pi-check text-green-600"></i>
              </div>
              <div>
                <div class="text-xs text-gray-500">Ραντεβού Σήμερα</div>
                <div class="text-lg font-extrabold text-gray-900">24 / 24</div>
              </div>
            </div>
            <!-- floating stat card 2 -->
            <div
              class="absolute -top-6 -right-4 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 flex items-center gap-3"
            >
              <div
                class="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center"
              >
                <i class="pi pi-users text-[#ff93d4]"></i>
              </div>
              <div>
                <div class="text-xs text-gray-500">Ενεργοί Πελάτες</div>
                <div class="text-lg font-extrabold text-gray-900">+180</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         STATS BAR
    ═══════════════════════════════════════════════════════ -->
    <section class="bg-gray-900 py-10">
      <div
        class="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8 text-center"
      >
        <div>
          <div class="text-3xl font-extrabold text-white">500+</div>
          <div class="text-sm text-gray-400 mt-1">Πελάτες Διαχείρισης</div>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-[#ff93d4]">15k+</div>
          <div class="text-sm text-gray-400 mt-1">Ραντεβού / Μήνα</div>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-white">99.9%</div>
          <div class="text-sm text-gray-400 mt-1">Uptime SLA</div>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-[#ff93d4]">< 2 ώρες</div>
          <div class="text-sm text-gray-400 mt-1">Χρόνος Απόκρισης</div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         PROBLEM / SOLUTION
    ═══════════════════════════════════════════════════════ -->
    <section class="py-20 bg-[#fff5f9]">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-14">
          <h2 class="text-3xl font-extrabold text-gray-900 mb-3">
            Αναγνωρίζετε αυτά τα προβλήματα;
          </h2>
          <p class="text-gray-500 max-w-xl mx-auto">
            Τα περισσότερα θεραπευτήρια χάνουν χρόνο και χρήμα λόγω
            αναποτελεσματικών διαδικασιών.
          </p>
        </div>
        <div class="grid md:grid-cols-3 gap-6">
          <div class="bg-white rounded-2xl p-6 border border-red-100 shadow-sm">
            <i class="pi pi-times-circle text-red-400 text-2xl mb-3"></i>
            <h4 class="font-bold text-gray-800 mb-2">
              Χαμένα Ραντεβού & Συγκρούσεις
            </h4>
            <p class="text-sm text-gray-500">
              Διπλές κρατήσεις, παρεξηγήσεις ωραρίου και ξεχασμένα ραντεβού
              χαλάνε την εμπιστοσύνη των πελατών.
            </p>
          </div>
          <div class="bg-white rounded-2xl p-6 border border-red-100 shadow-sm">
            <i class="pi pi-times-circle text-red-400 text-2xl mb-3"></i>
            <h4 class="font-bold text-gray-800 mb-2">
              Χειρόγραφο Ιστορικό Πελατών
            </h4>
            <p class="text-sm text-gray-500">
              Χαρτιά, φακέλοι, Excel — η αναζήτηση πληροφοριών για έναν πελάτη
              παίρνει πολύτιμα λεπτά.
            </p>
          </div>
          <div class="bg-white rounded-2xl p-6 border border-red-100 shadow-sm">
            <i class="pi pi-times-circle text-red-400 text-2xl mb-3"></i>
            <h4 class="font-bold text-gray-800 mb-2">Αδιαφανή Οικονομικά</h4>
            <p class="text-sm text-gray-500">
              Δεν ξέρετε ποιος πελάτης χρωστά, πόσα ΕΟΠΠΥ συνεδρίες απομένουν ή
              ποιες υπηρεσίες αποδίδουν.
            </p>
          </div>
        </div>
        <div class="mt-8 text-center">
          <div
            class="inline-flex items-center gap-2 bg-pink-50 text-[#ff93d4] font-bold px-6 py-3 rounded-full border border-pink-200 text-sm"
          >
            <i class="pi pi-arrow-down"></i>
            Το Interventio λύνει όλα τα παραπάνω
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         FEATURES GRID
    ═══════════════════════════════════════════════════════ -->
    <section class="py-20 bg-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-14">
          <h2 class="text-3xl font-extrabold text-gray-900 mb-3">
            Όλα όσα χρειάζεται το Θεραπευτήριό σας
          </h2>
          <p class="text-gray-500">
            Ένα σύστημα. Μηδέν χαρτιά. Πλήρης έλεγχος.
          </p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            class="group p-6 rounded-2xl border border-gray-100 hover:border-[#ff93d4] hover:shadow-lg transition-all duration-300"
          >
            <div
              class="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#ff93d4] transition-colors"
            >
              <i
                class="pi pi-calendar text-[#ff93d4] text-xl group-hover:text-white transition-colors"
              ></i>
            </div>
            <h3 class="font-bold text-gray-900 mb-2">Έξυπνο Ημερολόγιο</h3>
            <p class="text-sm text-gray-500">
              Ημερολόγιο βασισμένο σε θεραπευτή, με drag & drop,
              επαναλαμβανόμενα ραντεβού και προβολή ανά ημέρα ή εβδομάδα.
            </p>
          </div>

          <div
            class="group p-6 rounded-2xl border border-gray-100 hover:border-[#ff93d4] hover:shadow-lg transition-all duration-300"
          >
            <div
              class="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#ff93d4] transition-colors"
            >
              <i
                class="pi pi-file-edit text-[#ff93d4] text-xl group-hover:text-white transition-colors"
              ></i>
            </div>
            <h3 class="font-bold text-gray-900 mb-2">Καρτέλα Πελάτη 360°</h3>
            <p class="text-sm text-gray-500">
              Πλήρες ιστορικό ραντεβού, παρακολούθηση ασκήσεων, ψηφιακά αρχεία,
              σημειώσεις και ισορροπία λογαριασμού.
            </p>
          </div>

          <div
            class="group p-6 rounded-2xl border border-gray-100 hover:border-[#ff93d4] hover:shadow-lg transition-all duration-300"
          >
            <div
              class="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#ff93d4] transition-colors"
            >
              <i
                class="pi pi-verified text-[#ff93d4] text-xl group-hover:text-white transition-colors"
              ></i>
            </div>
            <h3 class="font-bold text-gray-900 mb-2">
              Πλήρης ΕΟΠΠΥ Υποστήριξη
            </h3>
            <p class="text-sm text-gray-500">
              Παρακολούθηση ΕΟΠΠΥ vs Ιδιωτικών συνεδριών ανά πελάτη και
              υπηρεσία. Αυτόματος υπολογισμός υπολοίπου.
            </p>
          </div>

          <div
            class="group p-6 rounded-2xl border border-gray-100 hover:border-[#ff93d4] hover:shadow-lg transition-all duration-300"
          >
            <div
              class="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#ff93d4] transition-colors"
            >
              <i
                class="pi pi-chart-bar text-[#ff93d4] text-xl group-hover:text-white transition-colors"
              ></i>
            </div>
            <h3 class="font-bold text-gray-900 mb-2">Αναλυτικές Αναφορές</h3>
            <p class="text-sm text-gray-500">
              Έσοδα, χρέη πελατών, απόδοση υπηρεσιών και προσωπικού σε
              γραφήματα. Εξαγωγή CSV μεγάλων αρχείων πληρωμών.
            </p>
          </div>

          <div
            class="group p-6 rounded-2xl border border-gray-100 hover:border-[#ff93d4] hover:shadow-lg transition-all duration-300"
          >
            <div
              class="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#ff93d4] transition-colors"
            >
              <i
                class="pi pi-user text-[#ff93d4] text-xl group-hover:text-white transition-colors"
              ></i>
            </div>
            <h3 class="font-bold text-gray-900 mb-2">Πύλη Πελάτη</h3>
            <p class="text-sm text-gray-500">
              Οι πελάτες συνδέονται με δικό τους λογαριασμό, βλέπουν τα ραντεβού
              τους και κατεβάζουν έγγραφα — χωρίς τηλεφωνήματα.
            </p>
          </div>

          <div
            class="group p-6 rounded-2xl border border-gray-100 hover:border-[#ff93d4] hover:shadow-lg transition-all duration-300"
          >
            <div
              class="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#ff93d4] transition-colors"
            >
              <i
                class="pi pi-comments text-[#ff93d4] text-xl group-hover:text-white transition-colors"
              ></i>
            </div>
            <h3 class="font-bold text-gray-900 mb-2">Real-time Chat Ομάδας</h3>
            <p class="text-sm text-gray-500">
              Άμεση επικοινωνία μεταξύ θεραπευτών. Ενημερωθείτε για αλλαγές
              ραντεβού χωρίς WhatsApp ή email.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         EOPPY SPOTLIGHT
    ═══════════════════════════════════════════════════════ -->
    <section class="py-20 bg-gradient-to-br from-gray-900 to-gray-800">
      <div class="max-w-5xl mx-auto px-4">
        <div class="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span
              class="inline-flex items-center gap-2 bg-pink-900/30 text-[#ff93d4] text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full mb-6"
            >
              <i class="pi pi-verified"></i> Μόνο στο Interventio
            </span>
            <h2 class="text-3xl font-extrabold text-white mb-4">
              Πλήρης Ενσωμάτωση ΕΟΠΠΥ
            </h2>
            <p class="text-gray-400 mb-6 leading-relaxed">
              Κάθε ραντεβού σημαίνεται αυτόματα ως ΕΟΠΠΥ ή ιδιωτικό. Το σύστημα
              παρακολουθεί ξεχωριστά τα χρέη για κάθε κατηγορία, ώστε να ξέρετε
              πάντα πού βρίσκεστε.
            </p>
            <ul class="space-y-3 text-sm text-gray-300">
              <li class="flex items-center gap-3">
                <div
                  class="w-6 h-6 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0"
                >
                  <i class="pi pi-check text-[#ff93d4] text-xs"></i>
                </div>
                Διαχωρισμός ΕΟΠΠΥ / Ιδιωτικών ανά πελάτη
              </li>
              <li class="flex items-center gap-3">
                <div
                  class="w-6 h-6 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0"
                >
                  <i class="pi pi-check text-[#ff93d4] text-xs"></i>
                </div>
                Αυτόματος υπολογισμός υπολοίπου FIFO
              </li>
              <li class="flex items-center gap-3">
                <div
                  class="w-6 h-6 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0"
                >
                  <i class="pi pi-check text-[#ff93d4] text-xs"></i>
                </div>
                Αναφορά breakdown ανά υπηρεσία στην καρτέλα ραντεβού
              </li>
              <li class="flex items-center gap-3">
                <div
                  class="w-6 h-6 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0"
                >
                  <i class="pi pi-check text-[#ff93d4] text-xs"></i>
                </div>
                Υποστήριξη Εργοθεραπείας, Φυσιοθεραπείας, Λογοθεραπείας
              </li>
            </ul>
          </div>
          <div class="bg-gray-800 rounded-2xl p-6 border border-gray-700">
            <div class="text-xs text-gray-500 uppercase tracking-wider mb-4">
              Καρτέλα Πελάτη — Σύνοψη ΕΟΠΠΥ
            </div>
            <div class="space-y-3">
              <div
                class="flex justify-between items-center p-3 bg-gray-700/50 rounded-xl"
              >
                <span class="text-sm text-gray-300">Εργοθεραπεία ΕΟΠΠΥ</span>
                <span class="text-sm font-bold text-[#ff93d4]"
                  >12 συνεδρίες</span
                >
              </div>
              <div
                class="flex justify-between items-center p-3 bg-gray-700/50 rounded-xl"
              >
                <span class="text-sm text-gray-300">Φυσιοθεραπεία ΕΟΠΠΥ</span>
                <span class="text-sm font-bold text-[#ff93d4]"
                  >8 συνεδρίες</span
                >
              </div>
              <div
                class="flex justify-between items-center p-3 bg-gray-700/50 rounded-xl"
              >
                <span class="text-sm text-gray-300">Ιδιωτικές Συνεδρίες</span>
                <span class="text-sm font-bold text-white">5 συνεδρίες</span>
              </div>
              <div
                class="border-t border-gray-700 pt-3 flex justify-between items-center"
              >
                <span class="text-sm text-gray-400">Υπόλοιπο Λογαριασμού</span>
                <span class="text-base font-extrabold text-red-400"
                  >€ 120.00</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         TESTIMONIALS
    ═══════════════════════════════════════════════════════ -->
    <section class="py-20 bg-[#fff5f9]">
      <div class="max-w-5xl mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-extrabold text-gray-900">
            Τι λένε τα Θεραπευτήρια
          </h2>
        </div>
        <div class="grid md:grid-cols-3 gap-6">
          <div
            class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
          >
            <div class="flex gap-1 mb-4">
              <i
                class="pi pi-star-fill text-yellow-400"
                v-for="n in 5"
                :key="n"
              ></i>
            </div>
            <p class="text-sm text-gray-600 italic mb-4">
              "Εξαλείψαμε εντελώς τα χαρτιά. Κάθε θεραπευτής έχει το δικό του
              ημερολόγιο και η διαχείριση ΕΟΠΠΥ έχει γίνει παιχνιδάκι."
            </p>
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center font-bold text-[#ff93d4]"
              >
                Μ
              </div>
              <div>
                <div class="text-sm font-bold text-gray-900">
                  Μαρία Παπαδοπούλου
                </div>
                <div class="text-xs text-gray-400">
                  Κέντρο Εργοθεραπείας, Αθήνα
                </div>
              </div>
            </div>
          </div>

          <div
            class="bg-white rounded-2xl p-6 shadow-sm border border-pink-100 border-2 relative"
          >
            <div
              class="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#ff93d4] text-white text-xs font-bold px-4 py-1 rounded-full"
            >
              Αγαπημένο
            </div>
            <div class="flex gap-1 mb-4">
              <i
                class="pi pi-star-fill text-yellow-400"
                v-for="n in 5"
                :key="n"
              ></i>
            </div>
            <p class="text-sm text-gray-600 italic mb-4">
              "Τελικά ξέρω κάθε μέρα πόσα χρωστάει ο κάθε πελάτης. Το σύστημα
              πληρωμών εξοικονομεί ώρες κάθε μήνα."
            </p>
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center font-bold text-[#ff93d4]"
              >
                Γ
              </div>
              <div>
                <div class="text-sm font-bold text-gray-900">
                  Γιώργος Νικολάου
                </div>
                <div class="text-xs text-gray-400">
                  Φυσικοθεραπευτήριο, Θεσσαλονίκη
                </div>
              </div>
            </div>
          </div>

          <div
            class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
          >
            <div class="flex gap-1 mb-4">
              <i
                class="pi pi-star-fill text-yellow-400"
                v-for="n in 5"
                :key="n"
              ></i>
            </div>
            <p class="text-sm text-gray-600 italic mb-4">
              "Οι γονείς λατρεύουν την πύλη πελάτη. Βλέπουν μόνοι τους τα
              ραντεβού και κατεβάζουν αξιολογήσεις. Μηδέν τηλεφωνήματα."
            </p>
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center font-bold text-[#ff93d4]"
              >
                Ε
              </div>
              <div>
                <div class="text-sm font-bold text-gray-900">
                  Ελένη Κωνσταντίνου
                </div>
                <div class="text-xs text-gray-400">
                  Κέντρο Λογοθεραπείας, Πάτρα
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <!-- ═══════════════════════════════════════════════════════
         CTA BANNER
    ═══════════════════════════════════════════════════════ -->
    <section class="py-20 bg-gradient-to-br from-[#ff93d4] to-pink-600">
      <div class="max-w-3xl mx-auto px-4 text-center">
        <h2 class="text-3xl font-extrabold text-white mb-4">
          Έτοιμοι να οργανώσετε το Θεραπευτήριό σας;
        </h2>
        <p class="text-pink-100 mb-8 text-lg">
          Ξεκινήστε σήμερα με 14 ημέρες δωρεάν. Χωρίς κάρτα, χωρίς δεσμεύσεις.
        </p>
        <div class="flex flex-wrap justify-center gap-4">
          <Button
            label="Ζητήστε Demo"
            icon="pi pi-calendar"
            class="!bg-white !text-[#ff93d4] border-none !py-3 !px-8 !text-base font-bold hover:!bg-pink-50 shadow-xl"
            @click="openDemo"
          />
          <Button
            label="Δείτε τα Πλάνα"
            icon="pi pi-arrow-down"
            outlined
            class="!border-white !text-white !py-3 !px-8 !text-base hover:!bg-white/10"
            @click="scrollToPricing"
          />
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         PRICING
    ═══════════════════════════════════════════════════════ -->
    <section class="py-20 bg-white" id="pricing">
      <div class="max-w-5xl mx-auto px-4">
        <div class="text-center mb-4">
          <h2 class="text-3xl font-extrabold text-gray-900">
            Απλά, Διαφανή Πλάνα
          </h2>
          <p class="text-gray-500 mt-2">
            Χωρίς κρυφές χρεώσεις. Ακύρωση ανά πάσα στιγμή.
          </p>
        </div>

        <!-- billing toggle placeholder -->
        <div class="flex justify-center mb-10">
          <span
            class="inline-flex items-center gap-2 bg-green-50 text-green-700 text-sm font-semibold px-4 py-2 rounded-full border border-green-200"
          >
            <i class="pi pi-tag"></i> Ετήσια πληρωμή: 2 μήνες δωρεάν
          </span>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <!-- SOLO -->
          <div
            class="p-8 border-2 border-gray-100 rounded-3xl hover:border-[#ff93d4] transition-all duration-300"
          >
            <div
              class="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2"
            >
              Solo
            </div>
            <h3 class="text-xl font-extrabold text-gray-900 mb-1">
              Μεμονωμένος Θεραπευτής
            </h3>
            <p class="text-xs text-gray-400 mb-5">
              Ιδανικό για ατομικές πρακτικές με 1 θεραπευτή.
            </p>
            <div class="text-4xl font-extrabold text-gray-900 mb-1">
              €39<span class="text-lg text-gray-400 font-medium">/μήνα</span>
            </div>
            <div class="text-xs text-gray-400 mb-6">
              ή €390/χρόνο (εξοικονομείτε €78)
            </div>
            <ul class="space-y-3 mb-8 text-sm text-gray-600">
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> 1 Θεραπευτής
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Απεριόριστοι
                Πελάτες
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Ημερολόγιο &
                Ραντεβού
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Καρτέλες
                Πελατών
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Πληρωμές &
                ΕΟΠΠΥ
              </li>
              <li class="flex items-center gap-2 text-gray-300">
                <i class="pi pi-times-circle"></i> Πύλη Πελάτη
              </li>
              <li class="flex items-center gap-2 text-gray-300">
                <i class="pi pi-times-circle"></i> Αναλυτικές Αναφορές
              </li>
              <li class="flex items-center gap-2 text-gray-300">
                <i class="pi pi-times-circle"></i> Chat Ομάδας
              </li>
            </ul>
            <Button
              label="Ξεκινήστε Δωρεάν"
              severity="secondary"
              outlined
              class="w-full !py-3"
              @click="openDemo"
            />
          </div>

          <!-- CLINIC (POPULAR) -->
          <div
            class="p-8 border-2 border-[#ff93d4] bg-pink-50/30 rounded-3xl relative shadow-xl shadow-pink-100"
          >
            <div
              class="absolute top-0 right-8 transform -translate-y-1/2 bg-[#ff93d4] text-white px-5 py-1.5 rounded-full text-xs font-extrabold tracking-wide"
            >
              ΠΙΟ ΔΗΜΟΦΙΛΕΣ
            </div>
            <div
              class="text-xs font-bold uppercase tracking-widest text-[#ff93d4] mb-2"
            >
              Clinic
            </div>
            <h3 class="text-xl font-extrabold text-gray-900 mb-1">
              Κέντρο Θεραπειών
            </h3>
            <p class="text-xs text-gray-400 mb-5">
              Για κέντρα με ομάδα έως 6 θεραπευτών.
            </p>
            <div class="text-4xl font-extrabold text-gray-900 mb-1">
              €89<span class="text-lg text-gray-400 font-medium">/μήνα</span>
            </div>
            <div class="text-xs text-gray-400 mb-6">
              ή €890/χρόνο (εξοικονομείτε €178)
            </div>
            <ul class="space-y-3 mb-8 text-sm text-gray-600">
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Έως 6
                Θεραπευτές
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Απεριόριστοι
                Πελάτες
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Ημερολόγιο &
                Επαναλαμβανόμενα
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Πλήρης ΕΟΠΠΥ
                Υποστήριξη
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Πύλη Πελάτη
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Αναλυτικές
                Αναφορές & Γραφήματα
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Chat Ομάδας &
                Ψηφιακό Αρχείο
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Διαχείριση
                Προϊόντων & Αποθέματος
              </li>
            </ul>
            <Button
              label="Ξεκινήστε Δωρεάν"
              class="w-full !py-3 !bg-[#ff93d4] border-none shadow-lg shadow-pink-200"
              @click="openDemo"
            />
          </div>

          <!-- ENTERPRISE -->
          <div
            class="p-8 border-2 border-gray-100 rounded-3xl hover:border-gray-400 transition-all duration-300"
          >
            <div
              class="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2"
            >
              Enterprise
            </div>
            <h3 class="text-xl font-extrabold text-gray-900 mb-1">
              Μεγάλο Κέντρο
            </h3>
            <p class="text-xs text-gray-400 mb-5">
              Για κλινικές και κέντρα με πολλαπλές ειδικότητες.
            </p>
            <div class="text-4xl font-extrabold text-gray-900 mb-1">
              €149<span class="text-lg text-gray-400 font-medium">/μήνα</span>
            </div>
            <div class="text-xs text-gray-400 mb-6">
              ή €1.490/χρόνο (εξοικονομείτε €298)
            </div>
            <ul class="space-y-3 mb-8 text-sm text-gray-600">
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Απεριόριστοι
                Θεραπευτές
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Όλα από το
                Clinic
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Προτεραιότητα
                Υποστήριξης (< 2ω)
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Custom
                Εγκατάσταση & Εκπαίδευση
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Custom
                Branding (λογότυπο)
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Export
                Δεδομένων (CSV / Excel)
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Dedicated
                Account Manager
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> SLA Uptime
                99.9%
              </li>
            </ul>
            <Button
              label="Επικοινωνήστε μαζί μας"
              severity="secondary"
              outlined
              class="w-full !py-3"
              @click="openDemo"
            />
          </div>
        </div>

        <p class="text-center text-xs text-gray-400 mt-8">
          Όλα τα πλάνα περιλαμβάνουν 14 ημέρες δωρεάν δοκιμή. Δεν απαιτείται
          κάρτα.
        </p>
      </div>
    </section>
    <!-- ═══════════════════════════════════════════════════════
         FOOTER
    ═══════════════════════════════════════════════════════ -->
    <footer class="py-14 bg-gray-900 text-white">
      <div class="max-w-7xl mx-auto px-4">
        <div class="grid md:grid-cols-4 gap-8 mb-10">
          <div class="md:col-span-2">
            <div class="text-2xl font-extrabold mb-3">
              Interventio<span class="text-[#ff93d4]">Booking</span>
            </div>
            <p class="text-gray-400 text-sm leading-relaxed max-w-xs">
              Η πλατφόρμα διαχείρισης που φτιάχτηκε αποκλειστικά για
              Θεραπευτήρια στην Ελλάδα.
            </p>
            <div class="flex gap-4 mt-4">
              <a
                href="#"
                class="text-gray-500 hover:text-[#ff93d4] transition-colors"
                ><i class="pi pi-instagram text-xl"></i
              ></a>
              <a
                href="#"
                class="text-gray-500 hover:text-[#ff93d4] transition-colors"
                ><i class="pi pi-facebook text-xl"></i
              ></a>
            </div>
          </div>
          <div>
            <div
              class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4"
            >
              Πλατφόρμα
            </div>
            <ul class="space-y-2 text-sm text-gray-400">
              <li>
                <a href="#pricing" class="hover:text-white transition-colors"
                  >Τιμολόγηση</a
                >
              </li>
              <li>
                <a
                  href="#"
                  class="hover:text-white transition-colors"
                  @click.prevent="openDemo"
                  >Request Demo</a
                >
              </li>
              <li>
                <a
                  href="#"
                  class="hover:text-white transition-colors"
                  @click.prevent="router.push('/login')"
                  >Είσοδος</a
                >
              </li>
            </ul>
          </div>
          <div>
            <div
              class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4"
            >
              Επικοινωνία
            </div>
            <ul class="space-y-2 text-sm text-gray-400">
              <li class="flex items-center gap-2">
                <i class="pi pi-envelope text-xs"></i>
                interventiobooking@gmail.com
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-globe text-xs"></i> interventio.gr
              </li>
            </ul>
          </div>
        </div>
        <div
          class="border-t border-gray-800 pt-6 text-center text-xs text-gray-500"
        >
          © 2026 Interventio Booking System. All rights reserved.
        </div>
      </div>
    </footer>

    <!-- ═══════════════════════════════════════════════════════
         DEMO MODAL
    ═══════════════════════════════════════════════════════ -->
    <Dialog
      v-model:visible="showDemoModal"
      header="Ζητήστε Demo"
      :style="{ width: '420px', maxWidth: '90vw' }"
      modal
    >
      <div class="space-y-4 pt-2">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >Ονοματεπώνυμο</label
          >
          <InputText
            id="name"
            v-model="demoForm.name"
            class="w-full"
            placeholder="π.χ. Μαρία Παπαδοπούλου"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >Email</label
          >
          <InputText
            id="email"
            v-model="demoForm.email"
            class="w-full"
            placeholder="info@therapycentre.gr"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >Τύπος Θεραπευτηρίου</label
          >
          <Dropdown
            v-model="demoForm.type"
            :options="[
              'Εργοθεραπεία',
              'Φυσιοθεραπεία',
              'Λογοθεραπεία',
              'Πολλαπλές Ειδικότητες',
            ]"
            placeholder="Επιλέξτε..."
            class="w-full"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Ακύρωση" text @click="showDemoModal = false" />
        <Button
          label="Αποστολή Αιτήματος"
          icon="pi pi-send"
          class="!bg-[#ff93d4] border-none"
          @click="submitDemo"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import Card from "primevue/card";
import Tag from "primevue/tag";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { useToast } from "primevue/usetoast";

const router = useRouter();
const toast = useToast();

const showDemoModal = ref(false);

const demoForm = reactive({
  name: "",
  email: "",
  type: "",
});

const openDemo = () => {
  showDemoModal.value = true;
};

const scrollToPricing = () => {
  document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
};

const submitDemo = async () => {
  if (!demoForm.name || !demoForm.email) {
    toast.add({
      severity: "warn",
      summary: "Συμπληρώστε τα πεδία",
      detail: "Παρακαλώ εισάγετε όνομα και email.",
      life: 3000,
    });
    return;
  }

  try {
    showDemoModal.value = false;
    demoForm.name = "";
    demoForm.email = "";
    demoForm.type = "";

    toast.add({
      severity: "success",
      summary: "Το αίτημά σας στάλθηκε!",
      detail: "Θα επικοινωνήσουμε μαζί σας εντός 24 ωρών.",
      life: 4000,
    });
  } catch (error) {
    toast.add({
      severity: "error",
      summary: "Σφάλμα",
      detail: "Δοκιμάστε ξανά αργότερα.",
      life: 3000,
    });
  }
};
</script>

<style scoped>
.landing-container {
  font-family: "Inter", sans-serif;
}
</style>
