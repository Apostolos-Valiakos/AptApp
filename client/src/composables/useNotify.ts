import { useToast } from "primevue/usetoast";
import { useI18n } from "vue-i18n";

/**
 * The app's usual messages: an error (4 s) or a success (3 s), titled
 * "Error"/"Success" unless another title is given.
 */
export const useNotify = () => {
  const toast = useToast();
  const { t } = useI18n();
  return {
    error: (detail?: string, summary = t("common.error")) => toast.add({ severity: "error", summary, detail, life: 4000 }),
    success: (detail?: string, summary = t("common.success")) => toast.add({ severity: "success", summary, detail, life: 3000 }),
  };
};
