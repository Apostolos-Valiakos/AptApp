<template>
  <!-- The client's QR (their qr_token, what reception scans at /qr-scanner),
       with a quiet zone and medium error correction so a cracked screen or
       a dim phone still scans. -->
  <canvas ref="canvas" :width="size" :height="size" class="bg-white rounded-xl" role="img" :aria-label="label" data-testid="pass-qr"></canvas>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import QRCode from "qrcode";

const props = withDefaults(defineProps<{ token: string; label: string; size?: number }>(), { size: 280 });
const canvas = ref<HTMLCanvasElement | null>(null);

const draw = () => {
  if (canvas.value && props.token) QRCode.toCanvas(canvas.value, props.token, { width: props.size, margin: 2, errorCorrectionLevel: "M" }).catch(() => {});
};
onMounted(draw);
watch(() => props.token, draw);
</script>
