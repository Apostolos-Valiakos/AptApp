// The redesigned portal's screens, loaded together by the router. Until the
// switch-over (step 6.2) "/portal/home" is shared with the old portal, so it
// shows whichever one is on (portal/flag.ts).
import { defineComponent, h, type Component } from "vue";
import { portalV2 } from "./flag";
import ClientHomeView from "../views/portal/ClientHomeView.vue";
import HomeView from "./views/HomeView.vue";
import BookView from "./views/BookView.vue";
import BookingsView from "./views/BookingsView.vue";
import WalletView from "./views/WalletView.vue";
import PassView from "./views/PassView.vue";

const byPortal = (old: Component, redesigned: Component) =>
  defineComponent({ name: "PortalPick", render: () => h(portalV2.value ? redesigned : old) });

export const Home = byPortal(ClientHomeView, HomeView);

export { BookView as Book, BookingsView as Bookings, WalletView as Wallet, PassView as Pass };
