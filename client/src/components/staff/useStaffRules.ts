// A staff member's rules kept from a date (bonus, product commission). The
// list shows the saved rules with the changes made in the dialog on top: "+"
// adds a rule from a date (replacing one from the same date) and the bin takes
// one off. Nothing reaches the server until the staff form's Save calls
// `commit`; closing the dialog drops the changes. `fill` puts today's rule in
// the form.
//
// `form` is the section's fields: a change typed in but not added with "+"
// is added by Save too (it isn't lost), unless it's incomplete, which stops
// the Save (`incomplete`). The date alone isn't a change.
import { computed, ref, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "../../api/http";
import { useNotify } from "../../composables/useNotify";
import { toLocalDateStr } from "../../utils/staffAvailability";

type Dated = { id?: string; effective_from?: string };
export type ShownRule<R> = R & { key: string; pending?: boolean };

type Form = { values: () => unknown; canAdd: () => boolean; addRule: () => void };

export const useStaffRules = <R extends Dated>(path: string, staffId: () => string | null | undefined, fill: (rule: R) => void, form?: Form) => {
  const { t } = useI18n();
  const notify = useNotify();
  const url = (id: string) => `/api/v1/staff/${id}/${path}`;
  const saved = ref([]) as Ref<R[]>;
  const current = ref(null) as Ref<R | null>;
  const loaded = ref(false);
  const added = ref([]) as Ref<(R & { effective_from: string })[]>;
  const removed = ref<string[]>([]);

  // The fields as they were last filled in or added; anything else is a change.
  const snapshot = () => JSON.stringify(form?.values() ?? null);
  const baseline = ref(snapshot());
  const edited = computed(() => !!form && snapshot() !== baseline.value);
  const incomplete = computed(() => edited.value && !form!.canAdd());

  // A staff member not saved yet has no rules: the form keeps its defaults.
  const load = async () => {
    const id = staffId();
    if (!id) {
      baseline.value = snapshot();
      loaded.value = true;
      return;
    }
    try {
      const data = await api.get(url(id));
      saved.value = Array.isArray(data?.rules) ? data.rules : [];
      current.value = data?.current ?? null;
      if (data?.current) fill(data.current);
      baseline.value = snapshot();
      loaded.value = true;
    } catch {
      notify.error(t("bonus.failed"));
    }
  };

  // Newest first; an added rule hides a saved one from the same date (the
  // server replaces it).
  const rules = computed<ShownRule<R>[]>(() => {
    const addedDates = new Set(added.value.map((r) => r.effective_from));
    const kept = saved.value
      .filter((r) => !removed.value.includes(r.id as string) && !addedDates.has(r.effective_from as string))
      .map((r) => ({ ...r, key: r.id as string }));
    const fresh = added.value.map((r) => ({ ...r, key: `new-${r.effective_from}`, pending: true }));
    return [...kept, ...fresh].sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)));
  });
  const dirty = computed(() => added.value.length > 0 || removed.value.length > 0 || edited.value);

  const add = (from: Date, body: Omit<R, "id" | "effective_from">) => {
    const effective_from = toLocalDateStr(from);
    added.value = [...added.value.filter((r) => r.effective_from !== effective_from), { ...(body as R), effective_from }];
    baseline.value = snapshot();
  };
  const remove = (rule: ShownRule<R>) => {
    if (rule.pending) added.value = added.value.filter((r) => r.effective_from !== rule.effective_from);
    else removed.value = [...removed.value, rule.id as string];
  };

  // Sends the changes for `id` (the staff member, just saved). Each one done is
  // dropped from the list of changes, so trying again after a failure only
  // sends what's left. Throws on the first failure.
  const commit = async (id: string) => {
    if (incomplete.value) throw new Error("incomplete rule");
    if (edited.value) form!.addRule();
    for (const ruleId of [...removed.value]) {
      await api.del(`${url(id)}/${ruleId}`);
      removed.value = removed.value.filter((r) => r !== ruleId);
    }
    for (const rule of [...added.value]) {
      await api.post(url(id), rule);
      added.value = added.value.filter((r) => r !== rule);
    }
  };

  return { rules, current, loaded, dirty, incomplete, load, add, remove, commit };
};
