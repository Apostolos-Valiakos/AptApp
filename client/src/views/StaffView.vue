<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl bg-[var(--p-primary-50)] flex items-center justify-center"
          >
            <i class="pi pi-id-card text-[var(--p-primary-600)]"></i>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">
              {{ t("staff.title") }}
            </h1>
            <p class="text-sm text-gray-500">{{ t("staff.addNew") }}</p>
          </div>
        </div>
        <Button :label="t('staff.addNew')" icon="pi pi-plus" @click="openNew" />
      </div>
    </div>

    <!-- Data Table Card -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <DataTable
        :value="filteredStaff"
        :rows="10"
        paginator
        :rowsPerPageOptions="[10, 20, 50]"
        responsiveLayout="scroll"
        class="p-datatable-sm"
        :loading="tableLoading"
      >
        <template #header>
          <div class="flex justify-between items-center">
            <span class="p-input-icon-left">
              <i class="pi pi-search mr-3" />
              <InputText
                v-model="search"
                :placeholder="t('staff.search')"
                class="w-80"
              />
            </span>
          </div>
        </template>

        <template #empty>
          <div
            class="flex flex-col items-center justify-center py-16 text-center"
          >
            <i class="pi pi-users text-5xl text-gray-200 mb-4"></i>
            <p class="text-gray-500 font-semibold text-lg">
              {{ t("staff.empty.title") }}
            </p>
            <p class="text-gray-400 text-sm mt-1">
              {{ t("staff.empty.subtitle") }}
            </p>
          </div>
        </template>

        <!-- Name + Email column with avatar -->
        <Column field="name" :header="t('staff.table.name')">
          <template #body="slotProps">
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-[var(--p-primary-100)] text-[var(--p-primary-600)] flex-shrink-0"
              >
                {{ slotProps.data.name?.charAt(0)?.toUpperCase() }}
              </div>
              <div class="min-w-0">
                <div class="font-semibold text-gray-900">
                  {{ slotProps.data.name }}
                </div>
                <div class="text-xs text-gray-400 truncate">
                  {{ slotProps.data.email || "—" }}
                </div>
              </div>
            </div>
          </template>
        </Column>

        <Column field="phone" :header="t('staff.table.phone')">
          <template #body="slotProps">
            <span class="text-sm text-gray-700">{{
              slotProps.data.phone || "—"
            }}</span>
          </template>
        </Column>

        <Column field="specialty" :header="t('staff.table.specialty')">
          <template #body="slotProps">
            <Tag
              v-if="slotProps.data.specialty"
              :value="slotProps.data.specialty"
              severity="secondary"
            />
            <span v-else class="text-xs text-gray-400">—</span>
          </template>
        </Column>

        <Column :header="t('common.actions')" style="width: 130px">
          <template #body="slotProps">
            <div class="flex gap-1.5 items-center">
              <Button
                icon="pi pi-pencil"
                class="p-button-rounded p-button-text p-button-sm"
                v-tooltip.top="t('staff.tooltips.edit')"
                :aria-label="t('staff.tooltips.edit')"
                @click="editStaff(slotProps.data)"
              />
              <Button
                icon="pi pi-key"
                class="p-button-rounded p-button-text p-button-sm p-button-secondary"
                v-tooltip.top="t('staff.tooltips.createLogin')"
                :aria-label="t('staff.tooltips.createLogin')"
                @click="openLoginDialog(slotProps.data)"
              />
              <Button
                icon="pi pi-calendar-times"
                class="p-button-rounded p-button-text p-button-sm"
                severity="warn"
                v-tooltip.top="t('staff.tooltips.timeOff')"
                :aria-label="t('staff.tooltips.timeOff')"
                @click="openTimeOffDialog(slotProps.data)"
              />
              <Button
                icon="pi pi-clock"
                class="p-button-rounded p-button-text p-button-sm"
                severity="info"
                v-tooltip.top="t('staff.tooltips.workingHours')"
                :aria-label="t('staff.tooltips.workingHours')"
                @click="openWorkingHoursDialog(slotProps.data)"
              />
              <Button
                icon="pi pi-trash"
                class="p-button-rounded p-button-text p-button-danger p-button-sm"
                v-tooltip.top="t('staff.tooltips.delete')"
                :aria-label="t('staff.tooltips.delete')"
                @click="confirmDelete(slotProps.data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>

  <!-- Add/Edit Staff Dialog -->
  <Dialog
    v-model:visible="showDialog"
    :header="
      editingStaff.id ? t('staff.dialog.editStaff') : t('staff.dialog.newStaff')
    "
    modal
    class="w-full max-w-2xl"
  >
    <div class="space-y-5 mt-2">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("staff.dialog.firstName")
          }}</label>
          <InputText v-model="editingStaff.first_name" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("staff.dialog.lastName")
          }}</label>
          <InputText v-model="editingStaff.last_name" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("common.email")
          }}</label>
          <InputText v-model="editingStaff.email" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("common.phone")
          }}</label>
          <InputText v-model="editingStaff.phone" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("staff.dialog.specialty")
          }}</label>
          <InputText v-model="editingStaff.specialty" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("staff.dialog.hourlyRate")
          }}</label>
          <InputNumber
            v-model="editingStaff.hourly_rate"
            mode="currency"
            currency="EUR"
            class="w-full"
          />
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">{{
            t("staff.dialog.servicesProvided")
          }}</label>
          <MultiSelect
            v-model="editingStaff.service_ids"
            :options="services"
            optionLabel="name"
            optionValue="id"
            display="chip"
            :placeholder="t('staff.dialog.selectServices')"
            class="w-full"
            filter
          />
        </div>
        <div class="md:col-span-2 flex items-center gap-3">
          <ToggleSwitch v-model="editingStaff.visible_in_calendar" />
          <div>
            <div class="text-sm font-medium text-gray-700">
              {{ t("staff.dialog.visibleInCalendar") }}
            </div>
            <div class="text-xs text-gray-400">
              {{ t("staff.dialog.visibleInCalendarNote") }}
            </div>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <Button
        :label="t('common.cancel')"
        icon="pi pi-times"
        text
        @click="showDialog = false"
      />
      <Button
        :label="t('common.save')"
        icon="pi pi-check"
        @click="saveStaff"
        :loading="loading"
      />
    </template>
  </Dialog>

  <!-- Create Login Dialog -->
  <Dialog
    v-model:visible="showLoginDialog"
    :header="t('staff.loginDialog.title')"
    modal
    class="w-full max-w-md"
  >
    <div class="space-y-5 pt-2">
      <p class="text-sm text-gray-600">
        {{
          t("staff.loginDialog.description", { name: loginStaffTarget?.name })
        }}
      </p>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("staff.loginDialog.username")
        }}</label>
        <InputText
          v-model="newLogin.username"
          class="w-full"
          placeholder="e.g. maria.stylist"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("staff.loginDialog.password")
        }}</label>
        <InputText
          v-model="newLogin.password"
          class="w-full"
          type="password"
          placeholder="••••••••"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{
          t("staff.loginDialog.role")
        }}</label>
        <Dropdown
          v-model="newLogin.role"
          :options="loginRoleOptions"
          optionLabel="label"
          optionValue="value"
          class="w-full"
        />
      </div>
    </div>
    <template #footer>
      <Button
        :label="t('common.cancel')"
        icon="pi pi-times"
        text
        @click="showLoginDialog = false"
      />
      <Button
        :label="t('staff.loginDialog.createAccount')"
        icon="pi pi-user-plus"
        class="p-button-success"
        @click="createLogin"
        :loading="loading"
      />
    </template>
  </Dialog>

  <!-- Time Off (Leave / Break) Dialog -->
  <Dialog
    v-model:visible="showTimeOffDialog"
    :header="t('staff.timeOff.title', { name: timeOffTarget?.name })"
    modal
    class="w-full max-w-2xl"
  >
    <div class="space-y-4 mt-2">
      <!-- Existing entries -->
      <div v-if="timeOffLoading" class="text-center py-6 text-gray-400 text-sm">
        {{ t("common.loading") }}
      </div>
      <div
        v-else-if="timeOffEntries.length === 0"
        class="text-center py-6 text-gray-400 text-sm"
      >
        {{ t("staff.timeOff.empty") }}
      </div>
      <div v-else class="space-y-2 max-h-64 overflow-y-auto">
        <div
          v-for="entry in timeOffEntries"
          :key="entry.id"
          class="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100"
        >
          <div class="flex items-center gap-3">
            <Tag
              :value="
                entry.type === 'leave'
                  ? t('staff.timeOff.leave')
                  : t('staff.timeOff.break')
              "
              :severity="entry.type === 'leave' ? 'warn' : 'info'"
            />
            <div>
              <div class="text-sm font-medium text-gray-800">
                <template v-if="entry.type === 'leave'">
                  {{ formatDate(entry.start_date) }}
                  <span v-if="entry.start_date !== entry.end_date">
                    — {{ formatDate(entry.end_date) }}</span
                  >
                </template>
                <template v-else>
                  {{ formatDate(entry.start_date) }},
                  {{ entry.start_time?.slice(0, 5) }}–{{
                    entry.end_time?.slice(0, 5)
                  }}
                </template>
              </div>
              <div v-if="entry.reason" class="text-xs text-gray-400">
                {{ entry.reason }}
              </div>
            </div>
          </div>
          <Button
            icon="pi pi-trash"
            class="p-button-rounded p-button-text p-button-sm p-button-danger"
            @click="deleteTimeOffEntry(entry.id)"
          />
        </div>
      </div>

      <!-- Add new entry -->
      <div v-if="!addMode" class="flex gap-2 pt-2 border-t border-gray-100">
        <Button
          :label="t('staff.timeOff.addLeave')"
          icon="pi pi-plus"
          text
          size="small"
          @click="startAddLeave"
        />
        <Button
          :label="t('staff.timeOff.addBreak')"
          icon="pi pi-plus"
          text
          size="small"
          @click="startAddBreak"
        />
      </div>

      <div
        v-else
        class="p-4 bg-[var(--p-primary-50)] rounded-xl space-y-3 border border-[var(--p-primary-100)]"
      >
        <div class="text-sm font-bold text-gray-700">
          {{
            addMode === "leave"
              ? t("staff.timeOff.addLeave")
              : t("staff.timeOff.addBreak")
          }}
        </div>

        <div v-if="addMode === 'leave'" class="grid grid-cols-2 gap-3">
          <div class="min-w-0">
            <label class="block text-xs text-gray-500 mb-1">{{
              t("staff.timeOff.startDate")
            }}</label>
            <DatePicker
              v-model="newTimeOff.start_date"
              dateFormat="dd/mm/yy"
              showIcon
              class="w-full"
              inputClass="w-full"
            />
          </div>
          <div class="min-w-0">
            <label class="block text-xs text-gray-500 mb-1">{{
              t("staff.timeOff.endDate")
            }}</label>
            <DatePicker
              v-model="newTimeOff.end_date"
              dateFormat="dd/mm/yy"
              showIcon
              class="w-full"
              inputClass="w-full"
            />
          </div>
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="min-w-0">
            <label class="block text-xs text-gray-500 mb-1">{{
              t("staff.timeOff.date")
            }}</label>
            <DatePicker
              v-model="newTimeOff.start_date"
              dateFormat="dd/mm/yy"
              showIcon
              class="w-full"
              inputClass="w-full"
            />
          </div>
          <div class="min-w-0">
            <label class="block text-xs text-gray-500 mb-1">{{
              t("staff.timeOff.startTime")
            }}</label>
            <DatePicker
              v-model="newTimeOff.start_time"
              timeOnly
              hourFormat="24"
              class="w-full"
              inputClass="w-full"
            />
          </div>
          <div class="min-w-0">
            <label class="block text-xs text-gray-500 mb-1">{{
              t("staff.timeOff.endTime")
            }}</label>
            <DatePicker
              v-model="newTimeOff.end_time"
              timeOnly
              hourFormat="24"
              class="w-full"
              inputClass="w-full"
            />
          </div>
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">{{
            t("staff.timeOff.reason")
          }}</label>
          <InputText
            v-model="newTimeOff.reason"
            class="w-full"
            :placeholder="t('staff.timeOff.reasonPlaceholder')"
          />
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <Button
            :label="t('common.cancel')"
            text
            size="small"
            @click="cancelAddTimeOff"
          />
          <Button
            :label="t('common.save')"
            size="small"
            @click="saveTimeOff()"
            :loading="timeOffSaving"
          />
        </div>
      </div>
    </div>
  </Dialog>

  <!-- Working Hours Dialog -->
  <Dialog
    v-model:visible="showWorkingHoursDialog"
    :header="t('staff.workingHours.title', { name: workingHoursTarget?.name })"
    modal
    class="w-full max-w-2xl"
  >
    <div class="space-y-4 mt-2">
      <div v-if="workingHoursLoading" class="text-center py-6 text-gray-400 text-sm">
        {{ t("common.loading") }}
      </div>
      <template v-else>
        <div class="flex items-center gap-3 pb-3 border-b border-gray-100">
          <ToggleSwitch v-model="workingHoursEnabled" />
          <div>
            <div class="text-sm font-medium text-gray-700">
              {{ t("staff.workingHours.enabledLabel") }}
            </div>
            <div class="text-xs text-gray-400">
              {{ t("staff.workingHours.enabledHint") }}
            </div>
          </div>
        </div>

        <div v-if="workingHoursEnabled" class="space-y-3">
          <div
            v-for="day in workingHoursDays"
            :key="day.day_of_week"
            class="p-3 bg-gray-50 rounded-xl border border-gray-100"
          >
            <div class="flex items-center gap-3">
              <Checkbox :modelValue="day.active" binary @update:modelValue="toggleWorkingDay(day)" />
              <span class="text-sm font-medium text-gray-800 w-24 flex-shrink-0">
                {{ t(`staff.workingHours.days.${day.day_of_week}`) }}
              </span>

              <div v-if="day.active" class="flex-1 space-y-2 min-w-0">
                <div
                  v-for="(range, idx) in day.ranges"
                  :key="idx"
                  class="flex items-center gap-2"
                >
                  <DatePicker
                    v-model="range.start_time"
                    timeOnly
                    hourFormat="24"
                    class="w-full"
                    inputClass="w-full"
                  />
                  <span class="text-gray-400 text-sm flex-shrink-0">—</span>
                  <DatePicker
                    v-model="range.end_time"
                    timeOnly
                    hourFormat="24"
                    class="w-full"
                    inputClass="w-full"
                  />
                  <Button
                    icon="pi pi-trash"
                    class="p-button-rounded p-button-text p-button-sm p-button-danger flex-shrink-0"
                    @click="removeWorkingRange(day, idx)"
                  />
                </div>
                <Button
                  :label="t('staff.workingHours.addRange')"
                  icon="pi pi-plus"
                  text
                  size="small"
                  @click="addWorkingRange(day)"
                />
              </div>
              <span v-else class="text-xs text-gray-400">{{ t("staff.workingHours.dayOff") }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
    <template #footer>
      <Button
        :label="t('common.cancel')"
        text
        @click="showWorkingHoursDialog = false"
      />
      <Button
        :label="t('common.save')"
        @click="saveWorkingHours()"
        :loading="workingHoursSaving"
      />
    </template>
  </Dialog>

  <ConfirmDialog></ConfirmDialog>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { useCalendarStore } from "../stores/calendar";

const { t } = useI18n();

// ... (imports remain same) ...

const toast = useToast();
const confirm = useConfirm();
const calendarStore = useCalendarStore();
const staff = ref([]);
const services = ref([]);
const loading = ref(false);
const tableLoading = ref(false);
const showDialog = ref(false);
const search = ref("");

const editingStaff = ref<any>({});

// NEW: Login Dialog State
const showLoginDialog = ref(false);
const loginStaffTarget = ref<any>(null);
const newLogin = ref({ username: "", password: "", role: "staff" });
const loginRoleOptions = computed(() => [
  { label: t("staff.loginDialog.roleStaff"), value: "staff" },
  { label: t("staff.loginDialog.roleFrontdesk"), value: "frontdesk" },
]);

// Time Off (Leave / Break) Dialog State
const showTimeOffDialog = ref(false);
const timeOffTarget = ref<any>(null);
const timeOffEntries = ref<any[]>([]);
const timeOffLoading = ref(false);
const timeOffSaving = ref(false);
const addMode = ref<"leave" | "break" | null>(null);
const newTimeOff = ref<any>({
  start_date: null,
  end_date: null,
  start_time: null,
  end_time: null,
  reason: "",
});

// Working Hours Dialog State — day_of_week: 0=Sun..6=Sat (matches the DB and
// JS Date#getDay()); displayed Mon->Sun in the UI via WEEKDAY_DISPLAY_ORDER.
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const showWorkingHoursDialog = ref(false);
const workingHoursTarget = ref<any>(null);
const workingHoursLoading = ref(false);
const workingHoursSaving = ref(false);
const workingHoursEnabled = ref(false);
const workingHoursDays = ref<any[]>([]);

// ... (Existing fetch/save logic remains same) ...
const fetchData = async () => {
  tableLoading.value = true;
  try {
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };
    const [staffRes, servicesRes] = await Promise.all([
      fetch("/api/v1/staff", { headers }),
      fetch("/api/v1/services", { headers }),
    ]);
    if (!staffRes.ok || !servicesRes.ok) throw new Error("Request failed");
    staff.value = await staffRes.json();
    services.value = await servicesRes.json();
  } catch (err) {
    console.error(err);
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("staff.toast.loadFailed"),
      life: 4000,
    });
  } finally {
    tableLoading.value = false;
  }
};

const openNew = () => {
  editingStaff.value = {
    id: null,
    first_name: "",
    last_name: "",
    service_ids: [],
    visible_in_calendar: true,
  };
  showDialog.value = true;
};

const editStaff = (data: any) => {
  const nameParts = (data.name || "").split(" ");
  editingStaff.value = {
    ...data,
    first_name: nameParts[0],
    last_name: nameParts.slice(1).join(" "),
    service_ids: data.service_ids || [],
  };
  showDialog.value = true;
};

const saveStaff = async () => {
  // ... (Keep existing save logic, ensure you add Authorization header) ...
  loading.value = true;
  const token = localStorage.getItem("token");
  const url = editingStaff.value.id
    ? `/api/v1/staff/${editingStaff.value.id}`
    : "/api/v1/staff";
  const method = editingStaff.value.id ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(editingStaff.value),
    });
    if (!res.ok) throw new Error("Failed");
    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("staff.toast.saved"),
      life: 3000,
    });
    showDialog.value = false;
    fetchData();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("staff.toast.saveFailed"),
      life: 3000,
    });
  } finally {
    loading.value = false;
  }
};

// NEW: Login Handlers
const openLoginDialog = (staffMember: any) => {
  loginStaffTarget.value = staffMember;
  // Suggest a username automatically (e.g., first.last)
  const suggested = staffMember.name.toLowerCase().replace(/\s/g, ".");
  newLogin.value = { username: suggested, password: "", role: "staff" };
  showLoginDialog.value = true;
};

const createLogin = async () => {
  if (!newLogin.value.username || !newLogin.value.password) return;

  loading.value = true;
  const token = localStorage.getItem("token");

  try {
    const res = await fetch(
      `/api/v1/staff/${loginStaffTarget.value.id}/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newLogin.value),
      },
    );

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed");

    toast.add({
      severity: "success",
      summary: t("staff.toast.accountCreated"),
      detail: t("staff.toast.accountDetail", {
        name: loginStaffTarget.value.name,
      }),
      life: 4000,
    });
    showLoginDialog.value = false;
  } catch (e: any) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: e.message,
      life: 4000,
    });
  } finally {
    loading.value = false;
  }
};

// Add confirmDelete and deleteStaff functions
// --- Time Off (Leave / Break) Handlers ---
const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const toDateStr = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const toTimeStr = (d: Date) => {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

const openTimeOffDialog = async (staffMember: any) => {
  timeOffTarget.value = staffMember;
  addMode.value = null;
  showTimeOffDialog.value = true;
  await fetchTimeOffEntries();
};

const fetchTimeOffEntries = async () => {
  timeOffLoading.value = true;
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(
      `/api/v1/staff/${timeOffTarget.value.id}/time-off`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    timeOffEntries.value = res.ok ? await res.json() : [];
  } finally {
    timeOffLoading.value = false;
  }
};

const startAddLeave = () => {
  addMode.value = "leave";
  newTimeOff.value = {
    start_date: new Date(),
    end_date: new Date(),
    start_time: null,
    end_time: null,
    reason: "",
  };
};

const startAddBreak = () => {
  addMode.value = "break";
  const defaultStart = new Date();
  defaultStart.setHours(13, 0, 0, 0);
  const defaultEnd = new Date();
  defaultEnd.setHours(14, 0, 0, 0);
  newTimeOff.value = {
    start_date: new Date(),
    end_date: new Date(),
    start_time: defaultStart,
    end_time: defaultEnd,
    reason: "",
  };
};

const cancelAddTimeOff = () => {
  addMode.value = null;
};

const saveTimeOff = async (force = false) => {
  timeOffSaving.value = true;
  const token = localStorage.getItem("token");
  const isLeave = addMode.value === "leave";

  const payload: any = {
    type: addMode.value,
    start_date: toDateStr(newTimeOff.value.start_date),
    end_date: toDateStr(
      isLeave ? newTimeOff.value.end_date : newTimeOff.value.start_date,
    ),
    reason: newTimeOff.value.reason || null,
    force,
  };
  if (!isLeave) {
    payload.start_time = toTimeStr(newTimeOff.value.start_time);
    payload.end_time = toTimeStr(newTimeOff.value.end_time);
  }

  try {
    const res = await fetch(
      `/api/v1/staff/${timeOffTarget.value.id}/time-off`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );

    if (res.status === 409) {
      const data = await res.json();
      const list = (data.conflicts || [])
        .map(
          (c: any) =>
            `• ${c.client_name || "—"} — ${c.service_name || ""} (${formatDate(c.start_time)})`,
        )
        .join("\n");
      confirm.require({
        message: t("staff.timeOff.conflictMessage", {
          count: data.conflicts.length,
          list,
        }),
        header: t("staff.timeOff.conflictHeader"),
        icon: "pi pi-exclamation-triangle",
        acceptClass: "p-button-warning",
        accept: () => saveTimeOff(true),
      });
      return;
    }

    if (!res.ok) throw new Error("Failed");

    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("staff.timeOff.saved"),
      life: 3000,
    });
    addMode.value = null;
    await fetchTimeOffEntries();
    await calendarStore.refreshTimeOff();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("staff.timeOff.saveFailed"),
      life: 4000,
    });
  } finally {
    timeOffSaving.value = false;
  }
};

const deleteTimeOffEntry = async (entryId: string) => {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(
      `/api/v1/staff/${timeOffTarget.value.id}/time-off/${entryId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) throw new Error("Failed");
    timeOffEntries.value = timeOffEntries.value.filter((e) => e.id !== entryId);
    toast.add({
      severity: "success",
      summary: t("staff.timeOff.deleted"),
      life: 3000,
    });
    await calendarStore.refreshTimeOff();
  } catch {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("staff.timeOff.deleteFailed"),
      life: 4000,
    });
  }
};

const parseTimeToDate = (time: string) => {
  const [h, m] = (time || "09:00").split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

const defaultRange = () => {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date();
  end.setHours(17, 0, 0, 0);
  return { start_time: start, end_time: end };
};

const buildEmptyWorkingDays = () =>
  WEEKDAY_DISPLAY_ORDER.map((dow) => ({ day_of_week: dow, active: false, ranges: [] as any[] }));

const openWorkingHoursDialog = async (staffMember: any) => {
  workingHoursTarget.value = staffMember;
  showWorkingHoursDialog.value = true;
  workingHoursLoading.value = true;
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`/api/v1/staff/${staffMember.id}/working-hours`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = res.ok ? await res.json() : { enabled: false, ranges: [] };
    workingHoursEnabled.value = !!data.enabled;
    const days = buildEmptyWorkingDays();
    for (const r of data.ranges || []) {
      const day = days.find((d) => d.day_of_week === r.day_of_week);
      if (day) {
        day.active = true;
        day.ranges.push({
          start_time: parseTimeToDate(r.start_time),
          end_time: parseTimeToDate(r.end_time),
        });
      }
    }
    workingHoursDays.value = days;
  } finally {
    workingHoursLoading.value = false;
  }
};

// Checking a day for the first time auto-seeds one default range, so the UI
// never has to represent "day on, zero ranges" — unchecking (or removing the
// last range) clears it back to "day off" entirely.
const toggleWorkingDay = (day: any) => {
  day.active = !day.active;
  if (day.active && day.ranges.length === 0) {
    day.ranges.push(defaultRange());
  } else if (!day.active) {
    day.ranges = [];
  }
};

const addWorkingRange = (day: any) => {
  day.ranges.push(defaultRange());
};

const removeWorkingRange = (day: any, idx: number) => {
  day.ranges.splice(idx, 1);
  if (day.ranges.length === 0) day.active = false;
};

const saveWorkingHours = async (force = false) => {
  workingHoursSaving.value = true;
  const token = localStorage.getItem("token");
  const schedule = workingHoursDays.value
    .filter((d) => d.active && d.ranges.length > 0)
    .map((d) => ({
      day_of_week: d.day_of_week,
      ranges: d.ranges.map((r: any) => ({
        start_time: toTimeStr(r.start_time),
        end_time: toTimeStr(r.end_time),
      })),
    }));

  try {
    const res = await fetch(`/api/v1/staff/${workingHoursTarget.value.id}/working-hours`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ enabled: workingHoursEnabled.value, schedule, force }),
    });

    if (res.status === 409) {
      const data = await res.json();
      const list = (data.conflicts || [])
        .map(
          (c: any) =>
            `• ${c.client_name || "—"} — ${c.service_name || ""} (${formatDate(c.start_time)})`,
        )
        .join("\n");
      confirm.require({
        message: t("staff.workingHours.conflictMessage", {
          count: data.conflicts.length,
          list,
        }),
        header: t("staff.workingHours.conflictHeader"),
        icon: "pi pi-exclamation-triangle",
        acceptClass: "p-button-warning",
        accept: () => saveWorkingHours(true),
      });
      return;
    }

    if (!res.ok) throw new Error("Failed");

    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("staff.workingHours.saved"),
      life: 3000,
    });
    showWorkingHoursDialog.value = false;
    await fetchData();
    await calendarStore.refreshWorkingHours();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("staff.workingHours.saveFailed"),
      life: 4000,
    });
  } finally {
    workingHoursSaving.value = false;
  }
};

const confirmDelete = (staff: any) => {
  confirm.require({
    message: t("staff.confirmDelete", { name: staff.name }),
    header: t("common.confirmDelete"),
    icon: "pi pi-exclamation-triangle",
    acceptClass: "p-button-danger",
    accept: () => deleteStaff(staff),
  });
};

const deleteStaff = async (staff: any) => {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`/api/v1/staff/${staff.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to delete");

    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("staff.toast.deleted"),
      life: 3000,
    });
    fetchData();
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("staff.toast.deleteFailed"),
      life: 4000,
    });
  }
};

const filteredStaff = computed(() => {
  if (!search.value) return staff.value;
  const term = search.value.toLowerCase();
  return staff.value.filter((s: any) => s.name.toLowerCase().includes(term));
});

onMounted(fetchData);
</script>
