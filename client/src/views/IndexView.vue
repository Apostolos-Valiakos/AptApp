<template>
  <div class="landing-container">
    <section class="relative py-20 overflow-hidden bg-white">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div class="grid lg:grid-cols-2 gap-12 items-center">
          <div class="text-left">
            <Tag
              value="Νέα Εποχή στη Διαχείριση"
              severity="info"
              class="mb-4 !bg-[#ff93d4] !text-white border-none"
            />
            <h1
              class="text-5xl lg:text-7xl font-extrabold text-gray-900 mb-6 leading-tight"
            >
              Οργανώστε την επιχείρησή σας με τo
              <span class="text-[#ff7ec7]">Interventio</span>
            </h1>
            <p class="text-lg text-gray-600 mb-8 leading-relaxed">
              Η απόλυτη πλατφόρμα για Θεραπευτήρια και ειδικά κέντρα θεραπειών.
              Διαχειριστείτε ραντεβού, προσωπικό και την πρόοδο των πελατών σας,
              όλα σε ένα μέρος.
            </p>
            <div class="flex flex-wrap gap-4">
              <Button
                label="Request a Demo"
                icon="pi pi-calendar"
                class="p-button-lg !bg-[#ff93d4] border-none hover:!bg-pink-500 transition-all shadow-lg"
                @click="openDemo"
              />
              <Button
                label="Είσοδος"
                icon="pi pi-sign-in"
                outline
                class="p-button-lg !text-white !border-[#ff93d4] hover:!bg-pink-500"
                @click="router.push('/login')"
              />
            </div>
          </div>
          <div class="relative">
            <div
              class="absolute -top-20 -right-20 w-64 h-64 bg-pink-100 rounded-full blur-3xl opacity-50"
            ></div>
            <img
              src="https://petaloudakids.gr/wp-content/uploads/2025/04/11.webp"
              alt="Salon Management"
              class="rounded-3xl shadow-2xl border-8 border-white transform hover:-rotate-2 transition-transform duration-500"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="py-20 bg-[#fff5f9]">
      <div class="max-w-7xl mx-auto px-4 text-center mb-16">
        <h2 class="text-3xl font-bold text-gray-800">
          Εργαλεία Σχεδιασμένα για Εσάς
        </h2>
        <p class="text-gray-500 mt-2">
          Όλα όσα χρειάζεται ένας ιδιοκτήτης και το προσωπικό του
        </p>
      </div>

      <div class="max-w-7xl mx-auto px-4 grid md:grid-cols-3 gap-8">
        <Card class="border-none shadow-sm hover:shadow-md transition-shadow">
          <template #title>
            <div
              class="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center mb-4"
            >
              <i class="pi pi-comments text-[#ff93d4] text-xl"></i>
            </div>
            Real-time Chat
          </template>
          <template #content>
            <p class="text-gray-600">
              Άμεση επικοινωνία μεταξύ των μελών του προσωπικού για τον καλύτερο
              συντονισμό των ραντεβού.
            </p>
          </template>
        </Card>

        <Card class="border-none shadow-sm hover:shadow-md transition-shadow">
          <template #title>
            <div
              class="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center mb-4"
            >
              <i class="pi pi-chart-line text-[#ff93d4] text-xl"></i>
            </div>
            Tracking Πελατών
          </template>
          <template #content>
            <p class="text-gray-600">
              Παρακολουθήστε την πρόοδο των πελατών με εξειδικευμένο exercise
              tracking (ιδανικό για Physio & Wellness).
            </p>
          </template>
        </Card>

        <Card class="border-none shadow-sm hover:shadow-md transition-shadow">
          <template #title>
            <div
              class="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center mb-4"
            >
              <i class="pi pi-file-pdf text-[#ff93d4] text-xl"></i>
            </div>
            Ψηφιακό Αρχείο
          </template>
          <template #content>
            <p class="text-gray-600">
              Ανεβάστε ιατρικά αρχεία, ιστορικό ή φωτογραφίες απευθείας στην
              καρτέλα του κάθε πελάτη.
            </p>
          </template>
        </Card>
      </div>
    </section>

    <section class="py-20 bg-white">
      <div class="max-w-5xl mx-auto px-4">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold">Επιλέξτε το Πλάνο σας</h2>
        </div>
        <div class="grid md:grid-cols-2 gap-8">
          <div
            class="p-8 border-2 border-gray-100 rounded-3xl hover:border-[#ff93d4] transition-colors"
          >
            <h3 class="text-xl font-bold mb-2">Starter</h3>
            <div class="text-4xl font-extrabold mb-6">
              €30<span class="text-lg text-gray-400 font-medium">/μήνα</span>
            </div>
            <ul class="space-y-4 mb-8">
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Βασικές
                Λειτουργίες
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Διαχείριση
                απεριόριστων Ραντεβού
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Απεριόριστοι
                Πελάτες
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Exercise
                Tracking
              </li>
            </ul>
            <Button
              label="Ξεκινήστε Τώρα"
              class="w-full !bg-gray-800 border-none py-3"
            />
          </div>

          <div
            class="p-8 border-2 border-[#ff93d4] bg-pink-50/30 rounded-3xl relative"
          >
            <div
              class="absolute top-0 right-8 transform -translate-y-1/2 bg-[#ff93d4] text-white px-4 py-1 rounded-full text-sm font-bold"
            >
              POPULAR
            </div>
            <h3 class="text-xl font-bold mb-2">Business Plus</h3>
            <div class="text-4xl font-extrabold mb-6">
              €50<span class="text-lg text-gray-400 font-medium">/μήνα</span>
            </div>
            <ul class="space-y-4 mb-8">
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Διαχείριση
                απεριόριστων Ραντεβού
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Απεριόριστοι
                Πελάτες
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Πλήρης
                διαμόρφωση με βάση την επιχείρησή σας
              </li>
              <li class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500"></i> Αναλυτικές
                αναφορές απόδοσης
              </li>
            </ul>
            <Button
              label="Ξεκινήστε Τώρα"
              class="w-full !bg-[#ff93d4] border-none py-3 shadow-lg shadow-pink-200"
            />
          </div>
        </div>
      </div>
    </section>

    <Dialog
      v-model:visible="showDemoModal"
      header="Request a Demo"
      :style="{ width: '400px' }"
      modal
    >
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <label for="name">Ονοματεπώνυμο</label>
          <InputText id="name" v-model="demoForm.name" class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label for="email">Email</label>
          <InputText id="email" v-model="demoForm.email" class="w-full" />
        </div>
        <Button
          label="Αποστολή"
          @click="submitDemo"
          class="!bg-[#ff93d4] border-none mt-2"
        />
      </div>
    </Dialog>

    <footer class="py-12 bg-gray-900 text-white text-center">
      <div class="flex items-center justify-center mb-6">
        <span class="text-2xl font-bold tracking-tight"
          >Petalouda<span class="text-[#ff93d4]">Booking</span></span
        >
      </div>
      <div class="flex justify-center gap-6 mb-8">
        <a href="#" class="text-gray-400 hover:text-[#ff93d4] text-2xl"
          ><i class="pi pi-instagram"></i
        ></a>
        <a href="#" class="text-gray-400 hover:text-[#ff93d4] text-2xl"
          ><i class="pi pi-facebook"></i
        ></a>
        <a href="#" class="text-gray-400 hover:text-[#ff93d4] text-2xl"
          ><i class="pi pi-twitter"></i
        ></a>
      </div>
      <p class="text-gray-400 text-sm">
        © 2026 Interventio Booking System. All rights reserved.
      </p>
    </footer>
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

// State για το Modal του Demo
const showDemoModal = ref(false);

// Δεδομένα της φόρμας
const demoForm = reactive({
  name: "",
  email: "",
});

// Συνάρτηση ανοίγματος του Modal (αντικαθιστά το router.push('/demo') αν προτιμάς Modal)
const openDemo = () => {
  showDemoModal.value = true;
};

// Logic για την υποβολή της φόρμας
const submitDemo = async () => {
  if (!demoForm.name || !demoForm.email) {
    // Εδώ μπορείς να προσθέσεις ένα toast error αν θέλεις
    return;
  }

  // Προσομοίωση αποστολής στο Backend
  try {
    console.log("Sending demo request:", demoForm);

    // Εδώ θα έμπαινε το axios.post('/api/demo', demoForm)

    // Κλείσιμο modal και καθαρισμός φόρμας
    showDemoModal.value = false;
    demoForm.name = "";
    demoForm.email = "";

    // Προαιρετικά: Ειδοποίηση επιτυχίας (απαιτεί ToastService στο main.ts)
    /*
    toast.add({ 
      severity: 'success', 
      summary: 'Επιτυχία', 
      detail: 'Το αίτημά σας στάλθηκε! Θα επικοινωνήσουμε σύντομα.', 
      life: 3000 
    });
    */
  } catch (error) {
    console.error("Error submitting demo:", error);
  }
};
</script>

<style scoped>
.landing-container {
  font-family: "Inter", sans-serif;
}

/* Custom shadow for pink aesthetics */
.shadow-pink-200 {
  shadow-color: rgba(255, 147, 212, 0.4);
}
</style>
