// The plumbing the admin pages shared by copy: a list loaded from one URL
// (kept as it was when the server refuses), and calls that report a failure
// with the page's own message and reload the page after a change.
import { ref, type Ref } from "vue";
import { api, ifRefused, withMessage } from "../api/http";
import { useNotify } from "./useNotify";

/**
 * A list from `url`: `items`, `loading` and `reload()`. `loading` starts true
 * (a page that loads on opening), or false with { loadsLater: true }.
 */
export const useResource = <T = any>(url: string, initial: T = [] as unknown as T, { loadsLater = false } = {}) => {
  const items = ref(initial) as Ref<T>;
  const loading = ref(!loadsLater);
  const reload = async () => {
    loading.value = true;
    try {
      items.value = await api.get(url).catch(ifRefused(items.value));
    } finally {
      loading.value = false;
    }
  };
  return { items, loading, reload };
};

/**
 * `call(url, method, body)`: a request whose failure carries `failed()` as its
 * message (an empty answer becomes {}). `run(fn)`: does `fn`, then `reload()`;
 * a failure is shown as an error toast. Answers true when it all went through.
 */
export const useAdminActions = (failed: () => string, reload: () => unknown) => {
  const notify = useNotify();
  const call = (url: string, method = "GET", body?: any) =>
    api.request(method, url, body || undefined).then((data: any) => data ?? {}).catch(withMessage(failed()));
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
      return true;
    } catch (e: any) {
      notify.error(e.message);
      return false;
    }
  };
  return { call, run };
};
