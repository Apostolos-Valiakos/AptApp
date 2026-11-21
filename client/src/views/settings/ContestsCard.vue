<template>
  <div
    class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8"
  >
    <div class="flex items-center justify-between mb-6">
      <div>
        <h3 class="text-lg font-bold text-gray-900">{{ t("profile.contests.title") }}</h3>
        <p class="text-sm text-gray-500">
          {{ t("profile.contests.subtitle") }}
        </p>
      </div>
      <Button
        :label="t('profile.contests.addNew')"
        icon="pi pi-plus"
        size="small"
        class="!bg-[var(--p-primary-color)] border-none !text-white"
        @click="openContestDialog()"
      />
    </div>

    <!-- Loading -->
    <div v-if="isLoadingContests" class="space-y-3">
      <Skeleton
        v-for="n in 2"
        :key="n"
        height="60px"
        class="rounded-xl"
      />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="contests.length === 0"
      class="text-center py-10 text-gray-400"
    >
      <i class="pi pi-trophy text-4xl mb-3 block"></i>
      <p class="text-sm">{{ t("profile.contests.empty") }}</p>
    </div>

    <!-- Contest list -->
    <div v-else class="space-y-3">
      <div
        v-for="c in contests"
        :key="c.id"
        class="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-[var(--p-primary-200)] transition-colors"
      >
        <img
          v-if="c.image_url"
          :src="c.image_url"
          class="w-14 h-14 rounded-lg object-cover flex-shrink-0"
        />
        <div
          v-else
          class="w-14 h-14 rounded-lg bg-[var(--p-primary-50)] flex items-center justify-center flex-shrink-0"
        >
          <i
            class="pi pi-trophy text-[var(--p-primary-color)] text-xl"
          ></i>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-gray-900 text-sm">{{
              c.name
            }}</span>
            <span
              :class="[
                'text-xs font-bold px-2 py-0.5 rounded-full',
                contestStatus(c) === 'active'
                  ? 'bg-green-100 text-green-700'
                  : contestStatus(c) === 'upcoming'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-500',
              ]"
            >
              {{
                contestStatus(c) === "active"
                  ? t("profile.contests.active")
                  : contestStatus(c) === "upcoming"
                    ? t("profile.contests.upcoming")
                    : t("profile.contests.ended")
              }}
            </span>
          </div>
          <p class="text-xs text-gray-400 mt-0.5 truncate">
            {{ formatDate(c.start_date) }} – {{ formatDate(c.end_date) }}
          </p>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0">
          <Button
            icon="pi pi-pencil"
            text
            rounded
            size="small"
            class="!text-gray-400 hover:!text-[var(--p-primary-color)]"
            @click="openContestDialog(c)"
          />
          <Button
            icon="pi pi-trash"
            text
            rounded
            size="small"
            class="!text-gray-400 hover:!text-red-500"
            @click="deleteContest(c.id)"
          />
        </div>
      </div>
    </div>

    <!-- Contest create / edit dialog -->
    <Dialog
      v-model:visible="contestDialogVisible"
      :header="editingContest ? t('profile.contests.editTitle') : t('profile.contests.newTitle')"
      :style="{ width: '580px', maxWidth: '105vw' }"
      modal
    >
      <div class="space-y-4 pt-2">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >{{ t("profile.contests.name") }} *</label
          >
          <InputText
            v-model="contestForm.name"
            class="w-full"
            :placeholder="t('profile.contests.namePlaceholder')"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >{{ t("profile.contests.description") }}</label
          >
          <Textarea
            v-model="contestForm.description"
            class="w-full"
            rows="3"
            :placeholder="t('profile.contests.descriptionPlaceholder')"
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >{{ t("profile.contests.start") }} *</label
            >
            <DatePicker
              v-model="contestForm.start_date"
              class="w-full"
              dateFormat="dd/mm/yy"
              showIcon
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >{{ t("profile.contests.end") }} *</label
            >
            <DatePicker
              v-model="contestForm.end_date"
              class="w-full"
              dateFormat="dd/mm/yy"
              showIcon
            />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >{{ t("profile.contests.image") }}</label
          >
          <div
            class="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-[var(--p-primary-color)] transition-colors"
            @click="contestImageInput?.click()"
          >
            <img
              v-if="contestImagePreview"
              :src="contestImagePreview"
              class="mx-auto max-h-32 rounded-lg object-cover mb-2"
            />
            <div v-else class="text-gray-400 py-4">
              <i class="pi pi-image text-3xl block mb-2"></i>
              <span class="text-sm">{{ t("profile.contests.pickImage") }}</span>
            </div>
            <p v-if="contestImagePreview" class="text-xs text-gray-400">
              {{ t("profile.contests.changeImage") }}
            </p>
          </div>
          <input
            ref="contestImageInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onContestImageChange"
          />
        </div>
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" text @click="contestDialogVisible = false" />
        <Button
          :label="editingContest ? t('common.save') : t('profile.contests.create')"
          icon="pi pi-check"
          class="!bg-[var(--p-primary-color)] border-none"
          :loading="isSavingContest"
          @click="saveContest"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
// Contests (entries come from clients' QR scans): the list, and making or changing one.
import { onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Skeleton from "primevue/skeleton";
import Dialog from "primevue/dialog";
import DatePicker from "primevue/datepicker";
import { api, withMessage } from "../../api/http";
import { useNotify } from "../../composables/useNotify";
import { useResource } from "../../composables/useResource";
import { formatDate as dateText } from "../../utils/format";

const { t, locale } = useI18n();
const toast = useToast();
const notify = useNotify();

const { items: contests, loading: isLoadingContests, reload: fetchContests } = useResource<any[]>("/api/v1/contests");
onMounted(fetchContests);
const contestDialogVisible = ref(false);
const editingContest = ref<any>(null);
const isSavingContest = ref(false);
const contestImageInput = ref<HTMLInputElement | null>(null);
const contestImagePreview = ref<string | null>(null);
const contestImageFile = ref<File | null>(null);

const contestForm = reactive({
  name: "",
  description: "",
  start_date: null as Date | null,
  end_date: null as Date | null,
});

const contestStatus = (c: any): "active" | "upcoming" | "ended" => {
  const now = Date.now();
  const start = new Date(c.start_date).getTime();
  const end = new Date(c.end_date).getTime();
  if (now < start) return "upcoming";
  if (now > end) return "ended";
  return "active";
};

const formatDate = (d: string) => dateText(d, locale.value);

const openContestDialog = (c?: any) => {
  editingContest.value = c || null;
  contestImagePreview.value = c?.image_url || null;
  contestImageFile.value = null;
  Object.assign(contestForm, {
    name: c?.name || "",
    description: c?.description || "",
    start_date: c ? new Date(c.start_date) : null,
    end_date: c ? new Date(c.end_date) : null,
  });
  contestDialogVisible.value = true;
};

const onContestImageChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  contestImageFile.value = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    contestImagePreview.value = ev.target?.result as string;
  };
  reader.readAsDataURL(file);
};

const saveContest = async () => {
  if (!contestForm.name || !contestForm.start_date || !contestForm.end_date) {
    toast.add({
      severity: "warn",
      summary: t("profile.contestToast.required"),
      detail: t("profile.contestToast.requiredDetail"),
      life: 3000,
    });
    return;
  }
  isSavingContest.value = true;
  const fd = new FormData();
  fd.append("name", contestForm.name);
  fd.append("description", contestForm.description || "");
  fd.append("start_date", contestForm.start_date.toISOString());
  fd.append("end_date", contestForm.end_date.toISOString());
  if (contestImageFile.value) fd.append("image", contestImageFile.value);

  try {
    const url = editingContest.value ? `/api/v1/contests/${editingContest.value.id}` : "/api/v1/contests";
    const method = editingContest.value ? "PUT" : "POST";
    await api.upload(url, fd, method).catch(withMessage(t("profile.toast.saveFailed")));
    contestDialogVisible.value = false;
    await fetchContests();
    toast.add({ severity: "success", summary: t("profile.contestToast.saved"), life: 2000 });
  } catch (e: any) {
    notify.error(e.message);
  } finally {
    isSavingContest.value = false;
  }
};

const deleteContest = async (id: number) => {
  try {
    await api.del(`/api/v1/contests/${id}`).catch(withMessage(t("profile.toast.saveFailed")));
    contests.value = contests.value.filter((c) => c.id !== id);
    toast.add({ severity: "success", summary: t("profile.contestToast.deleted"), life: 2000 });
  } catch (e: any) {
    notify.error(e.message);
  }
};
</script>
