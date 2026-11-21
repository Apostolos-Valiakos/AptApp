<template>
  <!-- The portal's frame: the redesigned one when it's switched on for this
       device (portal/flag.ts), else the one before it. The router loads this
       file on its own, so neither shell is in the staff app's download. -->
  <PortalShell v-if="portalV2" />
  <ClientLayout v-else />
</template>

<script setup lang="ts">
import { portalV2 } from "./flag";
import PortalShell from "./PortalShell.vue";
import ClientLayout from "../components/ClientLayout.vue";
</script>
