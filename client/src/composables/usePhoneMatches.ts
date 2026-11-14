// The clients who already have the phone being typed (or pasted) into a new
// client form, so the form can offer them instead of a duplicate. Online it
// asks the server; offline it looks in the client list kept on this device.
import { ref, watch, type Ref } from "vue";
import { api, ApiError } from "../api/http";
import { isOnline } from "../offline/queue";
import { cachedClientsWithPhone } from "../offline/localData";
import { MIN_PHONE_DIGITS, phoneKey } from "../utils/phone";

export const usePhoneMatches = (phone: Ref<string | null | undefined>) => {
  const matches = ref<any[]>([]);
  // Whether the last look was the server's (offline, only this device's list was seen).
  const checkedOnServer = ref(true);
  let request = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const look = async (value: string) => {
    const current = ++request;
    let found: any[];
    let onServer = true;
    try {
      if (!isOnline.value) throw new Error("offline");
      found = await api.get(`/api/v1/clients/by-phone?phone=${encodeURIComponent(value)}`);
    } catch (err) {
      if (err instanceof ApiError) found = [];
      else {
        found = await cachedClientsWithPhone(value).catch(() => []);
        onServer = false;
      }
    }
    if (current !== request) return; // the phone changed meanwhile
    matches.value = found;
    checkedOnServer.value = onServer;
  };

  // A pasted number is looked up at once; typing, once it stops for a moment.
  watch(phone, (value, before) => {
    clearTimeout(timer);
    const key = phoneKey(value);
    if (key.length < MIN_PHONE_DIGITS) {
      request++;
      matches.value = [];
      return;
    }
    const pasted = phoneKey(before).length < MIN_PHONE_DIGITS - 1;
    timer = setTimeout(() => look(String(value)), pasted ? 0 : 300);
  });

  /** The clients the server named when it refused a duplicate (409 phone_exists). */
  const showMatches = (found: any[]) => {
    request++;
    matches.value = found || [];
    checkedOnServer.value = true;
  };
  const reset = () => {
    clearTimeout(timer);
    request++;
    matches.value = [];
    checkedOnServer.value = true;
  };

  return { matches, checkedOnServer, showMatches, reset };
};
