<template>
  <div class="spa-landing">
    <!-- ═══════════════════════════════════════════════════════
         NAV
    ═══════════════════════════════════════════════════════ -->
    <nav
      class="fixed top-0 left-0 right-0 z-50 bg-[#F9F5F0]/95 backdrop-blur border-b border-[#D4A97A]/20 shadow-sm"
    >
      <div
        class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16"
      >
        <div
          class="text-xl font-semibold tracking-wide text-[#2C2C2C]"
          style="font-family: &quot;Georgia&quot;, serif"
        >
          <span class="text-[#8B6F4E]">Pure</span> Spa &amp; Massage Experience
        </div>
        <div
          class="hidden md:flex items-center gap-8 text-sm font-medium text-[#5C4A3A]"
        >
          <a href="#about" class="hover:text-[#8B6F4E] transition-colors"
            >Σχετικά</a
          >
          <a href="#services" class="hover:text-[#8B6F4E] transition-colors"
            >Υπηρεσίες</a
          >
          <a href="#contact" class="hover:text-[#8B6F4E] transition-colors"
            >Επικοινωνία</a
          >
          <!-- <Button
            label="Είσοδος"
            icon="pi pi-sign-in"
            size="small"
            class="!bg-[#8B6F4E] border-none !text-white hover:!bg-[#7A5F3E]"
            @click="router.push('/login')"
          /> -->
        </div>
        <Button
          label="Είσοδος"
          icon="pi pi-sign-in"
          size="small"
          class="md:hidden !bg-[#8B6F4E] border-none !text-white"
          @click="router.push('/login')"
        />
      </div>
    </nav>

    <!-- ═══════════════════════════════════════════════════════
         HERO
    ═══════════════════════════════════════════════════════ -->
    <section
      class="relative min-h-screen flex items-center justify-center overflow-hidden pt-16"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-[#3A2E28] via-[#2C2420] to-[#1A1510]"
      ></div>
      <!-- subtle grain overlay -->
      <div
        class="absolute inset-0 opacity-[0.04]"
        style="
          background-image: url(&quot;data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAAAUVBMVEWFhYWDg4N3d3dtbW17e3t1dXWBgYGHh4t5eXlzc3OLi4ubm5uVlZWPj4+NjY19fX2JiYl/f39ra2uRkZGZmZlpaWmXl5dvb29xcXGTk5NnZ2c8TV1mAAAAG3RSTlNAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAvEOwtAAAFVklEQVR4XpWWB67c2BUFb3g557T/hRo9/WUMZHlgr4Bg8Z4qQgQJlHI4A8SzFVrapvmTF9O7dmYRFZ60YiBhJRCgh1FYhiLAmdvX0CzTOpNE77ME0Zty/nWWzchDtiqrmQDeuv3powQ5ta2eN0FY0InkqDD73lT9c9lEzwUNqgFHs9VQce3TVClFCQrSTfOiYkVJQBmpbq2L6iZavPnAPcoU0dSw0SUTqz/GtrGuXfbyyBniKykOWQWGqwwMA7QiYAxi+IlPdqo+hYHnUt5ZPfnsHJyNiDtnpJyayNBkF6cWoYGAMY92ZBRzp3ghcQ==&quot;);
          background-size: 200px;
          background-repeat: repeat;
        "
      ></div>

      <div class="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <p
          class="text-[#D4A97A] text-xs tracking-[0.4em] uppercase mb-6 font-light"
        >
          Λάρισα, Ελλάδα
        </p>
        <h1
          class="text-5xl md:text-7xl font-light text-white mb-6 leading-tight"
          style="font-family: &quot;Georgia&quot;, serif"
        >
          Καλώς ήρθατε στο<br />
          <span class="text-[#D4A97A] italic"
            >Pure Spa &amp; Massage Experience</span
          >
        </h1>
        <p
          class="text-gray-300 text-lg mb-10 max-w-2xl mx-auto leading-relaxed font-light"
        >
          Ανακαλύψτε μια μοναδική εμπειρία χαλάρωσης και αναζωογόνησης με
          εξειδικευμένες θεραπείες και φυσικά προϊόντα.
        </p>
        <div class="flex flex-wrap justify-center gap-4">
          <Button
            label="Δείτε τις Υπηρεσίες"
            icon="pi pi-arrow-down"
            class="!bg-[#8B6F4E] border-none !py-3 !px-8 hover:!bg-[#7A5F3E] shadow-xl"
            @click="scrollToServices"
          />
          <Button
            label="Είσοδος Συστήματος"
            icon="pi pi-sign-in"
            outlined
            class="!border-[#D4A97A] !text-[#D4A97A] !py-3 !px-8 hover:!bg-[#D4A97A]/10"
            @click="router.push('/login')"
          />
        </div>
      </div>

      <div
        class="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[#D4A97A]/50"
      >
        <div class="w-px h-12 bg-[#D4A97A]/30"></div>
        <i class="pi pi-angle-down text-xs scroll-bounce"></i>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         ABOUT
    ═══════════════════════════════════════════════════════ -->
    <section id="about" class="py-24 bg-[#F9F5F0]">
      <div class="max-w-5xl mx-auto px-4 text-center">
        <p
          class="text-[#8B6F4E] text-xs tracking-[0.3em] uppercase mb-4 font-semibold"
        >
          Σχετικά μας
        </p>
        <h2
          class="text-4xl font-light text-[#2C2C2C] mb-6"
          style="font-family: &quot;Georgia&quot;, serif"
        >
          Η Τέχνη της Χαλάρωσης
        </h2>
        <div class="w-16 h-0.5 bg-[#D4A97A] mx-auto mb-8"></div>
        <p class="text-[#5C4A3A] text-lg leading-relaxed max-w-3xl mx-auto">
          Στο <strong>Pure Spa &amp; Massage Experience</strong> στη Λάρισα,
          πιστεύουμε ότι η ευεξία είναι τέχνη. Χρησιμοποιούμε αποκλειστικά
          φυσικά προϊόντα και εξειδικευμένες τεχνικές για να σας προσφέρουμε μια
          εμπειρία που αναζωογονεί σώμα και πνεύμα.
        </p>

        <div class="grid md:grid-cols-3 gap-8 mt-16">
          <div class="text-center">
            <div
              class="w-14 h-14 bg-[#8B6F4E]/10 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <i class="pi pi-heart text-[#8B6F4E] text-xl"></i>
            </div>
            <h4 class="font-semibold text-[#2C2C2C] mb-2">Φυσικά Προϊόντα</h4>
            <p class="text-sm text-[#7A6A5A] leading-relaxed">
              100% φυσικά συστατικά για κάθε θεραπεία
            </p>
          </div>
          <div class="text-center">
            <div
              class="w-14 h-14 bg-[#8B6F4E]/10 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <i class="pi pi-star text-[#8B6F4E] text-xl"></i>
            </div>
            <h4 class="font-semibold text-[#2C2C2C] mb-2">
              Εξειδικευμένες Τεχνικές
            </h4>
            <p class="text-sm text-[#7A6A5A] leading-relaxed">
              Εκπαιδευμένοι θεραπευτές με πολυετή εμπειρία
            </p>
          </div>
          <div class="text-center">
            <div
              class="w-14 h-14 bg-[#8B6F4E]/10 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <i class="pi pi-shield text-[#8B6F4E] text-xl"></i>
            </div>
            <h4 class="font-semibold text-[#2C2C2C] mb-2">Πλήρης Χαλάρωση</h4>
            <p class="text-sm text-[#7A6A5A] leading-relaxed">
              Περιβάλλον σχεδιασμένο για βαθιά ηρεμία
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         SERVICES
    ═══════════════════════════════════════════════════════ -->
    <section id="services" class="py-24 bg-[#EDE8E1]">
      <div class="max-w-7xl mx-auto px-4">
        <div class="text-center mb-16">
          <p
            class="text-[#8B6F4E] text-xs tracking-[0.3em] uppercase mb-4 font-semibold"
          >
            Υπηρεσίες
          </p>
          <h2
            class="text-4xl font-light text-[#2C2C2C] mb-4"
            style="font-family: &quot;Georgia&quot;, serif"
          >
            Οι Θεραπείες μας
          </h2>
          <div class="w-16 h-0.5 bg-[#D4A97A] mx-auto"></div>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="service in services"
            :key="service.title"
            class="group bg-[#F9F5F0] rounded-2xl overflow-hidden border border-[#D4A97A]/20 hover:border-[#8B6F4E]/40 hover:shadow-xl transition-all duration-300"
          >
            <div
              class="h-1 w-full"
              :style="{ background: service.color }"
            ></div>
            <div class="p-7">
              <div
                class="w-12 h-12 rounded-full flex items-center justify-center mb-4"
                :style="{ background: service.iconBg }"
              >
                <i :class="[service.icon, 'text-xl text-[#8B6F4E]']"></i>
              </div>
              <h3 class="font-semibold text-[#2C2C2C] mb-2 text-lg">
                {{ service.title }}
              </h3>
              <p class="text-sm text-[#7A6A5A] leading-relaxed">
                {{ service.description }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         CONTACT
    ═══════════════════════════════════════════════════════ -->
    <section id="contact" class="py-24 bg-[#2C2C2C]">
      <div class="max-w-5xl mx-auto px-4">
        <div class="text-center mb-16">
          <p
            class="text-[#D4A97A] text-xs tracking-[0.3em] uppercase mb-4 font-semibold"
          >
            Επικοινωνία
          </p>
          <h2
            class="text-4xl font-light text-white mb-4"
            style="font-family: &quot;Georgia&quot;, serif"
          >
            Βρείτε μας
          </h2>
          <div class="w-16 h-0.5 bg-[#D4A97A] mx-auto"></div>
        </div>

        <div class="grid md:grid-cols-3 gap-8 text-center">
          <div>
            <div
              class="w-14 h-14 bg-[#D4A97A]/10 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <i class="pi pi-map-marker text-[#D4A97A] text-xl"></i>
            </div>
            <h4 class="text-white font-semibold mb-2">Διεύθυνση</h4>
            <p class="text-gray-400 text-sm leading-relaxed">
              Ρούσβελτ 63, Λάρισα<br />412 22
            </p>
          </div>
          <div>
            <div
              class="w-14 h-14 bg-[#D4A97A]/10 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <i class="pi pi-phone text-[#D4A97A] text-xl"></i>
            </div>
            <h4 class="text-white font-semibold mb-2">Ραντεβού</h4>
            <p class="text-gray-400 text-sm leading-relaxed">
              Επικοινωνήστε μαζί μας<br />για ραντεβού
            </p>
          </div>
          <div>
            <div
              class="w-14 h-14 bg-[#D4A97A]/10 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <i class="pi pi-globe text-[#D4A97A] text-xl"></i>
            </div>
            <h4 class="text-white font-semibold mb-2">Online</h4>
            <p class="text-gray-400 text-sm leading-relaxed">
              puremassagespa.gr
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════
         FOOTER
    ═══════════════════════════════════════════════════════ -->
    <footer class="py-10 bg-[#1A1510] text-center">
      <div class="max-w-7xl mx-auto px-4">
        <div
          class="text-xl font-light text-white mb-2"
          style="font-family: &quot;Georgia&quot;, serif"
        >
          <span class="text-[#D4A97A]">Pure</span> Spa &amp; Massage Experience
        </div>
        <p class="text-gray-500 text-xs mb-4">Ρούσβελτ 63, Λάρισα 412 22</p>
        <div class="flex justify-center gap-4 mb-6">
          <a
            href="#"
            class="text-gray-500 hover:text-[#D4A97A] transition-colors"
          >
            <i class="pi pi-instagram text-xl"></i>
          </a>
          <a
            href="#"
            class="text-gray-500 hover:text-[#D4A97A] transition-colors"
          >
            <i class="pi pi-facebook text-xl"></i>
          </a>
        </div>
        <div class="border-t border-gray-800 pt-6 text-xs text-gray-600">
          © 2026 Pure Spa &amp; Massage Experience. All rights reserved.
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import Button from "primevue/button";

const router = useRouter();

const services = [
  {
    title: "Περιποίηση Προσώπου",
    description:
      "Εξατομικευμένες θεραπείες προσώπου με φυσικά προϊόντα για λαμπερό και αναζωογονημένο δέρμα.",
    icon: "pi pi-sparkles",
    color: "linear-gradient(90deg, #D4A97A, #E8C99A)",
    iconBg: "#D4A97A22",
  },
  {
    title: "Pure Premium Treatments",
    description:
      "Πολυτελείς θεραπείες ολιστικής προσέγγισης για βαθιά χαλάρωση και αναγέννηση.",
    icon: "pi pi-star",
    color: "linear-gradient(90deg, #8B6F4E, #A68563)",
    iconBg: "#8B6F4E22",
  },
  {
    title: "Ειδικές Θεραπείες",
    description:
      "Στοχευμένες θεραπείες για ειδικές ανάγκες του δέρματος και του σώματος.",
    icon: "pi pi-heart",
    color: "linear-gradient(90deg, #B8956A, #D4A97A)",
    iconBg: "#B8956A22",
  },
  {
    title: "Pure Massage Experience",
    description:
      "Μοναδικές τεχνικές μασάζ που συνδυάζουν αρώματα και αφές για πλήρη αποκατάσταση.",
    icon: "pi pi-sun",
    color: "linear-gradient(90deg, #7A5F3E, #8B6F4E)",
    iconBg: "#7A5F3E22",
  },
  {
    title: "Express Massage",
    description:
      "Γρήγορες θεραπείες για άμεση ανακούφιση από την καθημερινή κούραση.",
    icon: "pi pi-bolt",
    color: "linear-gradient(90deg, #C8A882, #D4A97A)",
    iconBg: "#C8A88222",
  },
  {
    title: "Laser AI Alexandrite 755nm",
    description:
      "Τεχνολογία αιχμής για αποτρίχωση και δερματολογικές θεραπείες.",
    icon: "pi pi-verified",
    color: "linear-gradient(90deg, #6B5344, #8B6F4E)",
    iconBg: "#6B534422",
  },
];

const scrollToServices = () => {
  document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
};
</script>

<style scoped>
.spa-landing {
  font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
}

@keyframes scroll-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(6px);
  }
}
.scroll-bounce {
  animation: scroll-bounce 1.5s ease-in-out infinite;
}
</style>
