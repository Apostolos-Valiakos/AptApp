import { ref } from "vue";

// Proof the password was just retyped, for the sensitive pages (see
// SensitiveGate.vue). Kept in memory only: leaving the page or reloading forgets it.
export const reauthToken = ref<string | null>(null);
