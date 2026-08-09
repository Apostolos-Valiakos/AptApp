<template>
  <div class="max-w-lg mx-auto space-y-6">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center">
          <i class="pi pi-qrcode text-[var(--p-primary-600)]"></i>
        </div>
        <div>
          <h1 class="text-xl font-bold text-gray-900">{{ t('qrScanner.title') }}</h1>
          <p class="text-sm text-gray-500">{{ t('qrScanner.subtitle') }}</p>
        </div>
      </div>

      <div v-if="!scanning && !result" class="text-center py-6">
        <Button :label="t('qrScanner.start')" icon="pi pi-camera" @click="startScanning" />
      </div>

      <div v-show="scanning" id="qr-reader" class="rounded-xl overflow-hidden"></div>

      <div v-if="scanning" class="text-center mt-4">
        <Button :label="t('qrScanner.stop')" text severity="secondary" @click="stopScanning" />
      </div>

      <div v-if="scanError" class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        {{ scanError }}
      </div>
    </div>

    <div v-if="result" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div class="flex items-center gap-3">
        <div class="w-14 h-14 rounded-full bg-[var(--p-primary-100)] text-[var(--p-primary-600)] flex items-center justify-center text-xl font-bold">
          {{ result.client.first_name?.[0] }}{{ result.client.last_name?.[0] }}
        </div>
        <div>
          <div class="text-lg font-bold text-gray-900">{{ result.client.full_name }}</div>
          <div class="text-sm text-gray-500">{{ result.client.phone || '—' }}</div>
        </div>
      </div>

      <div v-if="result.membership" class="p-3 bg-gray-50 rounded-lg flex justify-between items-center">
        <span class="text-sm text-gray-600">{{ t('qrScanner.membership') }}</span>
        <Tag :value="`${result.membership.tier_name} (${result.membership.status})`" severity="info" />
      </div>
      <div v-else class="text-xs text-gray-400">{{ t('qrScanner.noMembership') }}</div>

      <div
        v-if="result.contest"
        class="p-3 rounded-lg flex items-center gap-2"
        :class="result.contest.entry_added ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'"
      >
        <i class="pi" :class="result.contest.entry_added ? 'pi-check-circle' : 'pi-info-circle'"></i>
        <span class="text-sm">
          {{ result.contest.entry_added
            ? t('qrScanner.contestEntryAdded', { contest: result.contest.name })
            : t('qrScanner.contestAlreadyEntered', { contest: result.contest.name }) }}
        </span>
      </div>

      <Button :label="t('qrScanner.scanNext')" icon="pi pi-refresh" class="w-full" @click="scanNext" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { Html5Qrcode } from "html5-qrcode";

const { t } = useI18n();

const scanning = ref(false);
const scanError = ref("");
const result = ref<any>(null);
let html5QrCode: Html5Qrcode | null = null;

const token = () => localStorage.getItem("token");

const handleDecoded = async (decodedText: string) => {
  await stopScanning();
  try {
    const res = await fetch("/api/v1/qr/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ token: decodedText }),
    });
    const data = await res.json();
    if (!res.ok) {
      scanError.value = data.error || t("qrScanner.notFound");
      return;
    }
    result.value = data;
  } catch {
    scanError.value = t("qrScanner.scanFailed");
  }
};

const startScanning = async () => {
  scanError.value = "";
  result.value = null;
  scanning.value = true;
  html5QrCode = new Html5Qrcode("qr-reader");
  try {
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText: string) => handleDecoded(decodedText),
      () => {}, // per-frame scan failures — expected constantly, ignore
    );
  } catch (err) {
    scanning.value = false;
    scanError.value = t("qrScanner.cameraFailed");
  }
};

const stopScanning = async () => {
  if (html5QrCode) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch {}
    html5QrCode = null;
  }
  scanning.value = false;
};

const scanNext = () => {
  result.value = null;
  scanError.value = "";
  startScanning();
};

onUnmounted(() => {
  stopScanning();
});
</script>
