// The portal's screens, loaded together by the router the first time a
// client opens the portal (the staff app never downloads them).
import HomeView from "./views/HomeView.vue";
import BookView from "./views/BookView.vue";
import BookingsView from "./views/BookingsView.vue";
import WalletView from "./views/WalletView.vue";
import PassView from "./views/PassView.vue";
import ProfileView from "./views/ProfileView.vue";

export { HomeView as Home, BookView as Book, BookingsView as Bookings, WalletView as Wallet, PassView as Pass, ProfileView as Profile };
