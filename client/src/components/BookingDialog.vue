<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    class="fresha-dialog h-full md:h-auto md:rounded-xl rounded-none"
    :showHeader="false"
    :breakpoints="{ '960px': '100vw', '640px': '100vw' }"
    :style="{ width: '95vw', maxWidth: '1200px' }"
    :contentStyle="{
      padding: '0',
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }"
  >
    <div
      class="relative flex flex-col md:flex-row flex-1 min-h-0 md:flex-none md:max-h-[90vh] md:h-[800px] bg-white"
    >
      <!-- Left pane: form -->
      <div
        class="flex-grow flex flex-col w-full md:w-2/3 border-b md:border-b-0 md:border-r border-gray-200 order-2 md:order-1 h-full overflow-hidden"
        :class="
          isEditMode ? 'border-l-4 border-l-[var(--p-primary-color)]' : ''
        "
      >
        <!-- Header -->
        <div
          class="px-4 md:px-6 py-2.5 md:py-4 border-b border-gray-100 flex justify-between items-center gap-3 bg-white sticky top-0 z-10 flex-shrink-0"
        >
          <div class="min-w-0">
            <h2 class="text-base md:text-xl font-bold text-gray-900 truncate">
              {{
                isEditMode
                  ? t("booking.editAppointment")
                  : isBlockEdit
                    ? t("booking.editBlock")
                    : t("booking.newAppointment")
              }}
            </h2>
            <div class="text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1 flex items-center gap-2">
              <i class="pi pi-clock text-xs opacity-60"></i>
              <span>{{ formatDate(shownStartTime) }}</span>
              <span
                v-if="isEditMode"
                class="rounded-full px-2 md:px-3 py-0.5 md:py-1 text-[10px] md:text-xs font-bold uppercase"
                :class="getStatusColor(form.status)"
              >
                {{ form.status }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- Phones: the client's details (notes, history, debts) open
                 over the form from here. -->
            <button
              v-if="isMobile"
              type="button"
              class="w-10 h-10 rounded-full bg-[var(--p-primary-50)] text-[var(--p-primary-700)] flex items-center justify-center disabled:opacity-40"
              :disabled="!selectedClient"
              :aria-label="t('bookingSidebar.clientDetails')"
              data-testid="booking-client-panel"
              @click="showMobileSidebar = true"
            >
              <i class="pi pi-user"></i>
            </button>
            <button
              @click="dialogVisible = false"
              :aria-label="t('common.close')"
              class="w-10 h-10 md:w-8 md:h-8 rounded-full bg-gray-100 hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors duration-200"
            >
              <i class="pi pi-times text-sm"></i>
            </button>
          </div>
        </div>

        <!-- Tab bar — pill group -->
        <div class="flex px-3 md:px-6 py-2 flex-shrink-0">
          <div class="flex w-full md:w-auto gap-1 p-1 bg-gray-50 rounded-full" role="tablist">
            <button
              v-for="tab in visibleTabs"
              :key="tab.key"
              role="tab"
              :aria-selected="currentTab === tab.key"
              @click="currentTab = tab.key"
              class="flex-1 md:flex-none min-w-0 truncate py-2 px-1 md:px-4 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap rounded-full"
              :class="
                currentTab === tab.key
                  ? 'bg-[var(--p-primary-50)] text-[var(--p-primary-700)] font-bold'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              "
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <!-- Opening a past visit: a moving bar, and the form dimmed and locked
             until its data is in. -->
        <ProgressBar
          v-if="loadingPastId"
          mode="indeterminate"
          class="flex-shrink-0 !h-[3px] !rounded-none"
          data-testid="booking-loading-bar"
        />
        <!-- Tab content -->
        <div
          class="flex-grow overflow-y-auto p-4 md:p-6 space-y-6 transition-opacity"
          :class="{ 'opacity-40 pointer-events-none': loadingPastId }"
          :aria-busy="!!loadingPastId"
        >
          <!-- Inert for staff: they read the booking but can't use anything in it. -->
          <div class="space-y-6" :inert="isReadOnly">
          <!-- BOOKING TAB -->
          <div v-if="currentTab === 'Booking'" class="space-y-6">
            <!-- Client selector -->
            <div class="space-y-2">
              <label
                class="text-xs font-bold text-gray-500 uppercase tracking-wider"
                >{{ t("booking.clientLabel") }}</label
              >

              <ClientSelector
                v-if="!form.client_id"
                @select="onClientPicked"
              />

              <div v-else class="flex gap-2">
                <div
                  class="flex-grow flex justify-between items-center p-3 border border-gray-200 rounded-xl bg-gray-50 hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer group"
                  data-testid="booking-client-clear"
                  @click="clearSelectedClient"
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="w-8 h-8 rounded-full bg-[var(--p-primary-100)] text-[var(--p-primary-600)] font-bold flex items-center justify-center text-sm"
                    >
                      {{ selectedClient?.first_name?.[0] || "?"
                      }}{{ selectedClient?.last_name?.[0] || "?" }}
                    </div>
                    <div>
                      <div class="font-bold text-gray-900 text-sm">
                        {{ selectedClient?.full_name }}
                      </div>
                      <div class="text-xs text-gray-500">
                        {{ selectedClient?.phone }}
                      </div>
                    </div>
                  </div>
                  <div
                    class="w-6 h-6 rounded-full bg-gray-200 group-hover:bg-red-100 flex items-center justify-center transition-colors"
                  >
                    <i
                      class="pi pi-times text-xs text-gray-400 group-hover:text-red-500"
                    ></i>
                  </div>
                </div>
                <!-- No profile for the walk-in client: it stands for "no
                     specific client" and its details can't be edited. Nor
                     for a client added offline, until it syncs. -->
                <Button
                  v-if="!isWalkInSelected && !isTempId(String(form.client_id))"
                  icon="pi pi-eye"
                  class="p-button-outlined p-button-secondary w-12"
                  style="
                    color: var(--p-primary-color);
                    border-color: var(--p-primary-color);
                  "
                  v-tooltip.top="t('booking.viewProfile')"
                  @click="openClientProfile"
                />
              </div>
            </div>

            <div
              v-if="groupedWithTime"
              class="mb-3 flex items-center gap-2 rounded-lg bg-[var(--p-primary-50)] border border-[var(--p-primary-200)] px-3 py-2 text-sm text-[var(--p-primary-800)]"
            >
              <i class="pi pi-link text-xs"></i>
              {{ t("booking.groupedWithExisting", { time: groupedWithTime }) }}
            </div>

            <!-- Services -->
            <BookingServices
              :isHidden="isHiddenRow"
              :hiddenPart="hiddenPart"
              v-model="servicesList"
              :services="services"
              :staff="staff"
              :baseStartTime="new Date(form.start_time)"
              :default-staff-id="currentStaffId"
              :timeOff="props.timeOff || []"
              :workingHours="props.workingHours || []"
              :requireStaff="true"
              :shopMinTime="props.shopMinTime"
              :shopMaxTime="props.shopMaxTime"
            />

            <!-- Status + Block time -->
            <div
              class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100"
            >
              <div>
                <label
                  class="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2"
                  >{{ t("booking.statusLabel") }}</label
                >
                <Dropdown
                  v-model="form.status"
                  :options="statusOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="w-full"
                >
                  <template #option="slotProps">
                    <div class="flex items-center gap-2">
                      <div
                        class="w-3 h-3 rounded-full"
                        :class="getStatusDot(slotProps.option.value)"
                      ></div>
                      {{ slotProps.option.label }}
                    </div>
                  </template>
                </Dropdown>
              </div>

              <div class="flex flex-col justify-end pb-2">
                <Button
                  type="button"
                  :label="t('booking.blockTime')"
                  icon="pi pi-ban"
                  :class="form.is_block ? '' : 'p-button-outlined'"
                  :severity="form.is_block ? 'warning' : 'secondary'"
                  v-tooltip.top="t('booking.blockTimeNote')"
                  @click="form.is_block = !form.is_block"
                />
              </div>
            </div>
          </div>

          <!-- PRODUCTS TAB -->
          <div v-if="currentTab === 'Products'" class="space-y-4">
            <div
              class="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3"
            >
              <i class="pi pi-shopping-bag text-blue-600 mt-1"></i>
              <div>
                <h4 class="text-sm font-bold text-blue-900">
                  {{ t("booking.retailProducts.title") }}
                </h4>
                <p class="text-xs text-blue-700">
                  {{ t("booking.retailProducts.note") }}
                </p>
              </div>
            </div>

            <BookingProducts
              v-model="productsList"
              :allProducts="allProducts"
            />
          </div>

          <!-- PAYMENT TAB -->
          <div v-if="currentTab === 'Payment'" class="space-y-6">
            <PaymentSteps
              v-if="!isPaymentSettled"
              v-model="paymentStep"
              :canReachCharge="canReachCharge"
              :total="combinedTotalDueNow"
            />

            <!-- Step 1: checkout. A booking with nothing to pay shows only this
                 side, and what can still be added to it. -->
            <div v-show="isPaymentSettled || paymentStep === 1" class="space-y-6">
              <PaymentSummary
                :totalDueNow="combinedTotalDueNow"
                :servicesTotal="servicesTotal - hiddenServicesTotal"
                :productsTotal="productsTotal"
                :discountAmount="discountAmount"
                :previousDebt="previousDebt"
                :packagesTotal="pendingPackagesTotal"
                :giftCardsTotal="pendingGiftCardsTotal"
                :sameDayAppointmentsTotal="selectedSiblingsOwedTotal"
                :depositAmount="Math.max(0, form.deposit_amount - hiddenServicesTotal) + selectedSiblingsDepositTotal"
              />

              <!-- Same-day appointments (different staff) — visible to any
                   role so staff can see the client's full day at a glance;
                   only admin/frontdesk/super_admin can select siblings to
                   combine into one payment (canCombineDayPayment). -->
              <div
                v-if="siblingAppointments.length"
                class="p-4 bg-gray-50 rounded-xl border border-gray-100"
              >
                <h4 class="text-sm font-bold text-gray-700 mb-3">
                  {{ t("payment.sameDayAppointments") }}
                </h4>
                <div
                  v-for="sib in siblingAppointments"
                  :key="sib.id"
                  class="flex items-center gap-3 py-1.5"
                >
                  <Checkbox
                    v-model="selectedSiblingIds"
                    :value="sib.id"
                    :disabled="!canCombineDayPayment || sib.owed <= 0"
                  />
                  <div class="flex-1 min-w-0 text-sm text-gray-700 truncate">
                    {{ sib.services.map((s: any) => s.service_name).join(", ") }}
                    <span class="text-gray-400">
                      — {{ sib.services[0]?.staff_name }}</span
                    >
                  </div>
                  <div class="text-sm font-semibold text-gray-800 flex-shrink-0">
                    {{ formatMoney(sib.owed) }}
                    <span
                      v-if="sib.payment_status === 'paid'"
                      class="text-xs font-normal text-green-600"
                      >({{ t("payment.paid") }})</span
                    >
                  </div>
                </div>
              </div>

              <BookingDiscount
                v-if="!isPaymentSettled"
                v-model="discount"
                :codes="discountCodes"
                :discountAmount="discountAmount"
              />

              <div v-if="canSellExtras">
                <BookingPackages
                  ref="packageSaleRef"
                  view="sell"
                  :clientId="form.client_id"
                  :appointmentId="form.id"
                  :servicesList="servicesList"
                  v-model:pendingPackages="pendingPackages"
                  :ensureSaved="ensureSavedForPackage"
                />
                <BookingGiftCards
                  ref="giftCardSaleRef"
                  :clientId="form.client_id"
                  :defaultCustomerName="selectedClient?.full_name"
                  v-model:pendingGiftCards="pendingGiftCards"
                />
                <div class="flex flex-wrap items-center gap-2 mt-2">
                  <button
                    type="button"
                    class="text-xs font-bold text-[var(--p-primary-600)] hover:underline flex items-center gap-1"
                    data-testid="payment-add-sale"
                    @click="saleChoicesOpen = !saleChoicesOpen"
                  >
                    <i class="pi pi-plus text-[10px]"></i>
                    {{ t("payment.stepper.addSale") }}
                  </button>
                  <template v-if="saleChoicesOpen">
                    <Button
                      :label="t('payment.stepper.salePackage')"
                      icon="pi pi-box"
                      size="small"
                      severity="secondary"
                      outlined
                      data-testid="payment-sell-package"
                      @click="openSale(packageSaleRef)"
                    />
                    <Button
                      :label="t('payment.stepper.saleGiftCard')"
                      icon="pi pi-ticket"
                      size="small"
                      severity="secondary"
                      outlined
                      data-testid="payment-sell-gift-card"
                      @click="openSale(giftCardSaleRef)"
                    />
                  </template>
                </div>
              </div>
            </div>

            <!-- Step 2 starts with what the client already has; undoing a used
                 visit stays possible once it has paid the whole booking. -->
            <div v-show="isPaymentSettled || paymentStep === 2">
              <BookingPackages
                ref="bookingPackagesRef"
                view="use"
                :clientId="form.client_id"
                :appointmentId="form.id"
                :servicesList="servicesList"
                :pendingPackages="pendingPackages"
                :ensureSaved="ensureSavedForPackage"
                @changed="onPackageChanged"
              />
            </div>

            <BookingPayments
              ref="bookingPaymentsRef"
              :step="paymentStep"
              :totalDueNow="combinedTotalDueNow"
              :currentApptTotal="currentApptTotal"
              :previousDebt="previousDebt"
              :salesTotal="pendingPackagesTotal + pendingGiftCardsTotal"
              :depositAmount="form.deposit_amount + selectedSiblingsDepositTotal"
              :loading="paymentLoading"
              :paidPaymentMethod="shownPaidMethod"
              :clientId="form.client_id"
              :catalogServices="services"
              :appointmentServices="servicesList"
              v-model:paymentMethod="selectedPaymentMethod"
              v-model:amountToPay="amountToPayNow"
              v-model:giftCardId="selectedGiftCardId"
              v-model:membershipRedemptions="selectedMembershipRedemptions"
              @pay="recordPayment"
            >
              <template #beforeCharge>
                <div v-if="canChangePrice || (canChangePriceOrRefund && form.deposit_amount > 0)" class="flex flex-wrap gap-3">
                  <Button
                    v-if="canChangePrice"
                    :label="t('priceChange.button')"
                    icon="pi pi-pencil"
                    severity="info"
                    outlined
                    class="flex-1 !py-3 !font-semibold !border-2"
                    data-testid="payment-price-change"
                    @click="priceChangeVisible = true"
                  />
                  <Button
                    v-if="form.deposit_amount > 0"
                    :label="t('refund.button')"
                    icon="pi pi-replay"
                    severity="danger"
                    outlined
                    class="flex-1 !py-3 !font-semibold !border-2"
                    @click="refundVisible = true"
                  />
                </div>
              </template>
            </BookingPayments>

            <!-- Nothing to pay: the price and what was paid can still be corrected. -->
            <div v-if="isPaymentSettled && canChangePriceOrRefund" class="flex flex-wrap gap-3">
              <Button
                v-if="canChangePrice"
                :label="t('priceChange.button')"
                icon="pi pi-pencil"
                severity="info"
                outlined
                class="flex-1 !py-3 !font-semibold !border-2"
                data-testid="payment-price-change"
                @click="priceChangeVisible = true"
              />
              <Button
                v-if="form.deposit_amount > 0"
                :label="t('refund.button')"
                icon="pi pi-replay"
                severity="danger"
                outlined
                class="flex-1 !py-3 !font-semibold !border-2"
                data-testid="payment-refund"
                @click="refundVisible = true"
              />
            </div>

            <PriceChangeDialog
              v-model:visible="priceChangeVisible"
              :appointmentId="form.id"
              :currentTotal="currentApptTotal + selectedSiblingsTotal"
              :otherAppointmentIds="selectedSiblingIds"
              :ensureSaved="ensureSavedForPackage"
              @changed="onPriceChangedInPayment"
            />
            <RefundDialog
              v-model:visible="refundVisible"
              :appointmentId="form.id"
              :maxRefundable="form.deposit_amount"
              :ensureSaved="ensureSavedForPackage"
              @refunded="onRefunded"
            />
          </div>

          <!-- NOTES TAB -->
          <div v-if="currentTab === 'Notes'" class="space-y-4">
            <div>
              <label
                class="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2"
              >
                {{ t("booking.notes.internalNote") }}
              </label>
              <div
                class="border-l-4 border-l-amber-400 rounded-r-lg overflow-hidden"
              >
                <Textarea
                  v-model="form.internal_notes"
                  rows="3"
                  class="w-full bg-amber-50"
                  :placeholder="t('booking.notes.internalPlaceholder')"
                />
              </div>
            </div>
          </div>
          </div>
        </div>

        <!-- Footer bar -->
        <div
          class="booking-footer px-3 md:px-6 py-2.5 md:py-4 border-t border-gray-200 flex flex-row justify-between items-center bg-gradient-to-r from-gray-50 to-white flex-shrink-0 gap-2 md:gap-3"
        >
          <!-- Phones: one row. Repeat and delete go in this menu. -->
          <template v-if="isMobile && moreItems.length && currentTab !== 'Payment'">
            <Button
              icon="pi pi-ellipsis-v"
              severity="secondary"
              outlined
              class="flex-shrink-0"
              :aria-label="t('booking.moreActions')"
              data-testid="booking-more"
              @click="moreMenu?.toggle($event)"
            />
            <Menu ref="moreMenu" :model="moreItems" :popup="true" />
          </template>
          <Button
            v-if="!isMobile && isEditMode && !isReadOnly && currentTab !== 'Payment'"
            :label="t('booking.cancelAppt')"
            icon="pi pi-trash"
            class="p-button-danger p-button-text p-button-sm w-full sm:w-auto"
            data-testid="booking-delete"
            @click="confirmDelete"
          />
          <div class="flex flex-row items-center gap-2 md:gap-3 ml-auto flex-1 md:flex-none min-w-0">
            <Button
              v-if="showPaymentNav && paymentStep > 1"
              :label="t('payment.stepper.back')"
              icon="pi pi-arrow-left"
              severity="secondary"
              outlined
              class="flex-1 sm:flex-none"
              data-testid="payment-back"
              @click="paymentStep--"
            />
            <div
              v-if="currentTab !== 'Payment'"
              class="flex items-center gap-2 md:mr-4"
            >
              <!-- <Checkbox v-model="notifyClient" binary inputId="notify" />
              <label for="notify" class="text-sm text-gray-600">
                {{ t("booking.emailClient") }}
              </label> -->
              <!-- <Checkbox
                v-model="form.save_receipt"
                binary
                inputId="saveReceipt"
              />
              <label
                for="saveReceipt"
                class="text-sm font-medium text-gray-700 cursor-pointer"
              >
                Save Receipt
              </label> -->
              <Button
                v-if="currentTab !== 'Payment' && !isReadOnly"
                :label="t('booking.tabs.payment')"
                data-testid="booking-payment-tab"
                @click="currentTab = 'Payment'"
                severity="success"
              />
            </div>
            <Button
              v-if="!isMobile && !form.is_block && !isReadOnly && currentTab !== 'Payment'"
              :label="t('booking.repeat.button')"
              icon="pi pi-copy"
              outlined
              :disabled="!canRepeatBooking"
              v-tooltip.top="!canRepeatBooking ? t('booking.repeat.needClientAndStaff') : null"
              @click="showRepeatDialog = true"
            />
            <Button
              v-if="!isReadOnly"
              :label="t('booking.save')"
              @click="save()"
              data-testid="booking-save"
              :loading="loading"
              :disabled="!canSaveBooking"
              v-tooltip.top="!canSaveBooking ? t('booking.validation.staffRequired') : null"
              class="flex-1 md:flex-none md:px-8 min-w-0"
            />
            <Button
              v-if="showPaymentNav && paymentStep < 3"
              :label="t('payment.stepper.next')"
              icon="pi pi-arrow-right"
              iconPos="right"
              severity="success"
              class="flex-1 sm:flex-none"
              :disabled="paymentStep === 2 && !canReachCharge"
              data-testid="payment-next"
              @click="paymentStep++"
            />
            <!-- <div class="flex flex-col justify-end gap-3 pb-2">
              <div class="flex items-center gap-2">
                <i
                  class="pi pi-info-circle text-gray-400 text-xs"
                  v-tooltip="
                    'If unchecked, this will be hidden from reports when completed'
                  "
                ></i>
              </div>
            </div> -->
          </div>
        </div>
      </div>

      <!-- Right pane: client sidebar -->
      <div
        v-show="showMobileSidebar || !isMobile"
        class="bg-gray-50 md:w-[35%] md:order-2 md:border-l border-gray-200 md:h-full md:overflow-y-auto flex-shrink-0"
        :class="isMobile ? 'absolute inset-0 z-20 overflow-y-auto' : ''"
      >
        <div
          v-if="isMobile"
          class="sticky top-0 z-10 px-2 py-2 flex items-center gap-2 bg-white border-b border-gray-200"
        >
          <button
            type="button"
            class="w-10 h-10 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100"
            :aria-label="t('common.back')"
            data-testid="booking-client-panel-back"
            @click="showMobileSidebar = false"
          >
            <i class="pi pi-arrow-left"></i>
          </button>
          <span class="font-bold text-sm text-gray-800 truncate">
            {{ selectedClient?.full_name || t("bookingSidebar.noneSelected") }}
          </span>
        </div>

        <div class="md:h-full" :inert="isReadOnly">
          <BookingSidebar
            class="w-full bg-gray-50 h-full"
            :client="selectedClient"
            :calculated-balance="sidebarBalance"
            v-model:bookingNotes="form.booking_notes"
            @debt-changed="onDebtChanged"
            :loading-id="loadingPastId"
            @open-appointment="openPastAppointment"
          />
        </div>
      </div>
    </div>

    <RepeatBookingDialog
      v-model:visible="showRepeatDialog"
      :services="servicesList"
      :clientId="form.client_id"
      :staff="props.staff || []"
      :workingHours="props.workingHours || []"
      :timeOff="props.timeOff || []"
      @created="emit('refresh')"
    />

    <ClientProfileDialog
      v-model:visible="showClientProfile"
      :clientId="currentProfileId"
      @refresh="() => {}"
    />
  </Dialog>
  <ConfirmDialog></ConfirmDialog>
  <!-- Deleting a booking: the question, and why (optional, kept in the log). -->
  <ConfirmDialog group="delete-booking">
    <template #message="{ message }">
      <div class="w-full space-y-3">
        <p>{{ message.message }}</p>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{{ t("booking.deleteDialog.reason") }}</label>
          <Textarea v-model="deleteReason" rows="2" maxlength="500" class="w-full" data-testid="delete-reason" />
        </div>
      </div>
    </template>
  </ConfirmDialog>
</template>

<script setup lang="ts">
import { useSettingsStore } from "../stores/settings";
import { fullyHidden, hiddenAmount } from "../utils/paymentFilters";
import { api, ApiError } from "../api/http";
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import BookingProducts from "./booking/bookingProducts.vue";
import BookingServices from "./booking/bookingServices.vue";
import BookingPayments from "./booking/bookingPayments.vue";
import BookingDiscount from "./booking/BookingDiscount.vue";
import BookingPackages from "./booking/BookingPackages.vue";
import BookingGiftCards from "./booking/BookingGiftCards.vue";
import PriceChangeDialog from "./booking/PriceChangeDialog.vue";
import RefundDialog from "./booking/RefundDialog.vue";
import {
  emptyDiscount,
  computeDiscountAmount,
  discountFromAppointment,
  discountPayload,
  type DiscountState,
} from "../utils/discount";
import BookingSidebar from "./booking/bookingSideBar.vue";
import ClientSelector from "./ClientSelector.vue";
import RepeatBookingDialog from "./booking/RepeatBookingDialog.vue";
import PaymentSteps from "./booking/PaymentSteps.vue";
import PaymentSummary from "./booking/PaymentSummary.vue";
import ClientProfileDialog from "./ClientProfileDialog.vue";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { fetchOrQueue } from "../offline/queue";
import { knownOverlapIds } from "../offline/overlaps";
import { isTempId } from "../offline/tempIds";
import { askOverCapacity, personsOf, placesOf } from "../utils/capacity";
import { formatMoney } from "../utils/format";
import { useBookingTotals } from "../composables/useBookingTotals";
import { appendNote, firstStartOf, sameDayAppointmentFor } from "../utils/sameDayGrouping";
import { useCalendarStore } from "../stores/calendar";
import {
  isStaffAvailable,
  toLocalDateStr,
  describeWorkingDay,
  overtimeConfirmMessage,
} from "../utils/staffAvailability";
import { matchVariationName } from "../utils/serviceVariations";
import { comboLineLabel } from "../utils/comboSplit";
import { markManualStarts } from "../utils/serviceSequence";
import {
  snapshotServices,
  describeServiceChanges,
  type ServiceSnapshot,
} from "../utils/appointmentChanges";
import { useAuthStore } from "../stores/auth";
const confirm = useConfirm();
const toast = useToast();
const { t, locale } = useI18n();
const authStore = useAuthStore();
const canChangePriceOrRefund = computed(() => authStore.isShopAdmin);
// A completed appointment's price is final (the server refuses it too).
const canChangePrice = computed(
  () =>
    canChangePriceOrRefund.value &&
    form.value.status !== "completed" &&
    !siblingAppointments.value.some((s: any) => selectedSiblingIds.value.includes(s.id) && s.status === "completed"),
);
const selectedSiblingsTotal = computed(() =>
  siblingAppointments.value
    .filter((s: any) => selectedSiblingIds.value.includes(s.id))
    .reduce((sum: number, s: any) => sum + Number(s.total_cost || 0), 0),
);
// Combining several of a client's same-day appointments into one payment
// crosses staff ownership (a plain "staff" role normally only ever sees/acts
// on their own bookings) — gated the same way canSellExtras already gates
// packages/gift cards server-side. The read (siblingAppointments fetch) stays
// open to every role so a plain staff member can still see the day's total.
const canCombineDayPayment = computed(() => authStore.isShopAdmin);
// Plain staff only read a booking; the server refuses their changes too.
const isReadOnly = computed(() => authStore.user?.role === "staff");
const priceChangeVisible = ref(false);
const refundVisible = ref(false);

const props = defineProps([
  "visible",
  "appointment",
  "services",
  "staff",
  "allProducts",
  "timeOff",
  "workingHours",
  "shopMinTime",
  "shopMaxTime",
]);

const emit = defineEmits(["update:visible", "save", "refresh", "open-appointment"]);
const showRepeatDialog = ref(false);
const canRepeatBooking = computed(
  () =>
    !!form.value.client_id &&
    servicesList.value.length > 0 &&
    servicesList.value.every((s) => s.service_id && s.staff_id),
);
const currentStaffId = ref<number | string | null>(null);

const isRecurring = ref(false);
const recurrenceForm = ref<{ freq: string; end_date: Date | null }>({
  freq: "Weekly",
  end_date: null,
});

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit("update:visible", val),
});

// === STATE ===
const form = ref<any>({
  id: null,
  client_id: null,
  start_time: new Date(),
  status: "new",
  internal_notes: "",
  booking_notes: "",
  deposit_amount: 0,
  payment_status: "unpaid",
  payment_method: "card",
  is_block: false,
  save_receipt: true,
  is_eoppy: false,
});

// State lifted from children
const servicesList = ref<Array<any>>([]);
const productsList = ref<Array<any>>([]);

// A staff member is required per service row — every block needs to land on
// a specific person's calendar column. A time-off block still needs exactly
// one staff member picked on its single row (see saveAsTimeOff below), even
// though it has no real service selected.
const missingStaffService = computed(() =>
  form.value.is_block
    ? !servicesList.value[0]?.staff_id
    : servicesList.value.some((s: any) => s.service_id && !s.staff_id),
);
const canSaveBooking = computed(
  () => servicesList.value.length > 0 && !missingStaffService.value,
);

// UI State
const currentTab = ref("Booking");
const tabs = [
  { key: "Booking", label: computed(() => t("booking.tabs.booking")) },
  { key: "Products", label: computed(() => t("booking.tabs.products")) },
  { key: "Notes", label: computed(() => t("booking.tabs.notes")) },
  { key: "Payment", label: computed(() => t("booking.tabs.payment")) },
] as const;
const visibleTabs = computed(() => tabs.filter((tab) => tab.key !== "Payment" || !isReadOnly.value));

const loading = ref(false);
const paymentLoading = ref(false);
const showClientProfile = ref(false);
const currentProfileId = ref<string | null>(null);
const notifyClient = ref(true);
const amountToPayNow = ref(0);
const selectedPaymentMethod = ref<"card" | "cash" | "gift-card" | "membership">(
  "card",
);
const selectedGiftCardId = ref<string | null>(null);
const selectedMembershipRedemptions = ref<any[]>([]);
const bookingPaymentsRef = ref<any>(null);

const statusOptions = computed(() => [
  { label: t("common.status.new"), value: "new" },
  { label: t("common.status.confirmed"), value: "confirmed" },
  { label: t("common.status.arrived"), value: "arrived" },
  { label: t("common.status.started"), value: "started" },
  { label: t("common.status.completed"), value: "completed" },
  { label: t("common.status.noShow"), value: "no-show" },
  { label: t("common.status.noResponse"), value: "no-response" },
  { label: t("common.status.cancelled"), value: "cancelled" },
]);

// Mobile Sidebar Logic
const showMobileSidebar = ref(false);
const isMobile = ref(false);

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

const toggleMobileSidebar = () => {
  showMobileSidebar.value = !showMobileSidebar.value;
};

// Phones: repeat and delete, behind the ⋯ button of the footer.
const moreMenu = ref<any>(null);
const moreItems = computed(() => [
  ...(!form.value.is_block && !isReadOnly.value
    ? [{ label: t("booking.repeat.button"), icon: "pi pi-copy", disabled: !canRepeatBooking.value, command: () => (showRepeatDialog.value = true) }]
    : []),
  ...(isEditMode.value && !isReadOnly.value
    ? [{ label: t("booking.cancelAppt"), icon: "pi pi-trash", class: "booking-menu-danger", command: () => confirmDelete() }]
    : []),
]);

onMounted(async () => {
  try {
    discountCodes.value = (await api.get("/api/v1/discount-codes")).filter((c: any) => c.is_active);
  } catch {
    // codes are optional; fixed/percent discounts still work
  }
  checkMobile();
  window.addEventListener("resize", checkMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
});

// === COMPUTED ===
const isEditMode = computed(() => !!form.value.id);
const isBlockEdit = computed(() => !!form.value.time_off_id);

// --- Client selection (server-side search — with 5000+ clients we never load
// the full list, see calendar.ts) ---
const selectedClient = ref<any>(null);
const onClientPicked = (client: any) => {
  selectedClient.value = client;
  form.value.client_id = client.id;
  refreshClientBalance(client.id);
  groupWithSameDayAppointment(client.id);
};

// The stored balance can be stale (debt appears when an appointment's time
// passes), so the server recalculates it whenever a client is shown here.
const refreshClientBalance = async (clientId: string) => {
  if (!clientId) return;
  try {
    const { balance } = await api.get(`/api/v1/clients/${clientId}/balance`);
    if (selectedClient.value?.id === clientId) {
      selectedClient.value.outstanding_balance = Number(balance) || 0;
    }
  } catch {
    // keep the stored figure if the refresh fails
  }
};

// A payment or write-off made from the sidebar.
const onDebtChanged = (e: { appointmentId?: string; amount: number; remaining?: number; newBalance: number }) => {
  if (selectedClient.value) selectedClient.value.outstanding_balance = Number(e.newBalance) || 0;
  if (e.appointmentId && e.appointmentId === form.value.id) {
    form.value.deposit_amount = Number(form.value.deposit_amount || 0) + Number(e.amount || 0);
    // Part of it settled: still partly unpaid.
    form.value.payment_status = Number(e.remaining) > 0 ? "partial" : "paid";
  }
  emit("refresh");
};

const clearSelectedClient = () => {
  form.value.client_id = null;
  selectedClient.value = null;
};

// Re-hydrates selectedClient for an existing appointment without ever loading
// the full client list — an instant approximation from the appointment payload
// itself, refined a moment later with the full slim record (adds custom_fields).
const loadClientById = async (clientId: string, fallback: any) => {
  selectedClient.value = fallback;
  if (!clientId) return;
  try {
    const rows = await api.get(`/api/v1/clients?slim=true&id=${clientId}`);
    if (rows[0]) selectedClient.value = rows[0];
  } catch {
    // keep the fallback if the lookup fails
  }
  await refreshClientBalance(clientId);
};

// This client's other active appointments the same calendar day, across
// every staff member — powers the Payment tab's combined-day checklist.
// Fetched regardless of role (so a plain staff member still sees the full
// day read-only); only the checkbox interaction is gated client-side by
// canCombineDayPayment.
const loadSiblingAppointments = async (clientId: string, startTime: Date) => {
  siblingsLoading.value = true;
  try {
    const dateStr = toLocalDateStr(startTime);
    const all = await api.get(`/api/v1/clients/${clientId}/appointments-on-date?date=${dateStr}`).catch(() => null);
    if (all) {
      siblingAppointments.value = all.filter(
        (a: any) => a.id !== form.value.id,
      );
      // Pre-select the day's other unpaid appointments, so checkout totals
      // the whole day by default; staff can untick to pay one only.
      if (canCombineDayPayment.value) {
        selectedSiblingIds.value = siblingAppointments.value
          .filter((s: any) => Number(s.owed) > 0)
          .map((s: any) => s.id);
      }
    }
  } catch {
    // leave the list empty if this fails — not critical to saving/paying
  } finally {
    siblingsLoading.value = false;
  }
};

// A new booking for a client who already has an appointment that day is
// added to that appointment instead (same client, same day, not cancelled
// or no-show): the dialog switches to the existing appointment and appends
// the new service rows at their own times. Not for the shared walk-in
// client, time blocks or recurring bookings. groupRequest discards a stale
// lookup when the client, date or dialog changes meanwhile.
const walkInClientId = ref<string | null>(null);
const groupedWithTime = ref<string | null>(null);
let groupRequest = 0;

const groupWithSameDayAppointment = async (clientId: string) => {
  if (!clientId || form.value.id || form.value.is_block || isRecurring.value) return;
  if (clientId === walkInClientId.value) return;
  const request = ++groupRequest;
  const dateStr = toLocalDateStr(new Date(form.value.start_time));
  try {
    const existing = sameDayAppointmentFor(await api.get(`/api/v1/appointments?date=${dateStr}`), clientId);
    if (!existing) return;
    if (
      request !== groupRequest ||
      !props.visible ||
      form.value.id ||
      form.value.client_id !== clientId ||
      isRecurring.value
    ) return;

    const newRows = servicesList.value.map((r: any) => ({ ...r, _manualStart: true }));
    const newProducts = productsList.value.map((p: any) => ({ ...p }));
    const newBookingNotes = (form.value.booking_notes || "").trim();
    const newInternalNotes = (form.value.internal_notes || "").trim();

    loadExistingAppointment(existing, null);
    servicesList.value = [...servicesList.value, ...newRows];
    productsList.value = [...productsList.value, ...newProducts];
    form.value.booking_notes = appendNote(form.value.booking_notes || "", newBookingNotes);
    form.value.internal_notes = appendNote(form.value.internal_notes || "", newInternalNotes);

    const start = new Date(firstStartOf(existing));
    groupedWithTime.value = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
    nextTick(suggestAmountToPay);
  } catch {
    // keep it as a separate new booking if the lookup fails
  }
};

// Pre-selects the shop's single walk-in client on a brand-new, blank
// appointment — lets staff save fast and attribute it to a real client
// later via the same "×" clear-and-search flow used for any appointment.
// Silently does nothing if it fails; staff can still pick a client by hand.
const loadWalkInClient = async () => {
  try {
    const walkIn = await api.get("/api/v1/clients/walk-in").catch(() => null);
    if (walkIn) {
      walkInClientId.value = walkIn.id;
      selectedClient.value = walkIn;
      form.value.client_id = walkIn.id;
      refreshClientBalance(walkIn.id);
    }
  } catch {
    // leave the client picker blank if this fails
  }
};

// Financial Calculations
const discount = ref<DiscountState>(emptyDiscount());
const discountCodes = ref<any[]>([]);
const originalDiscountAmount = ref(0);

// Packages picked to buy alongside this payment (Payment tab) — sold in
// full when the payment is submitted, added to the displayed total so
// staff pay "service + package" as one number. See recordPayment below.
const pendingPackages = ref<
  { package_type_id: string; name: string; price: number }[]
>([]);
const pendingPackagesTotal = computed(() =>
  pendingPackages.value.reduce((sum, p) => sum + Number(p.price), 0),
);
const bookingPackagesRef = ref<any>(null);

const pendingGiftCards = ref<
  { card_number: string; customer_name: string; initial_amount: number }[]
>([]);
const pendingGiftCardsTotal = computed(() =>
  pendingGiftCards.value.reduce((sum, g) => sum + Number(g.initial_amount), 0),
);

// This client's other active appointments the same calendar day (any staff
// member), fetched fresh per-dialog-open — see the watch init below. Lets
// an admin/frontdesk/super_admin fold several same-day appointments into
// one combined payment (canCombineDayPayment); a plain staff member still
// sees the list and the combined total read-only.
const siblingAppointments = ref<any[]>([]);
const selectedSiblingIds = ref<string[]>([]);
const savedStatus = ref("");
// Services the cash/card filters hide, whole or in part: still part of the
// booking (saved with it), just not shown, and left out of the money shown.
// The hidden part is paid, so what's due doesn't change.
const settingsForFilters = useSettingsStore();
const hiddenPart = (row: any) => hiddenAmount(row?._hidden, settingsForFilters);
const isHiddenRow = (row: any) => fullyHidden(row?._charged, row?._hidden, settingsForFilters);
// The header and the "paid with" note follow the services shown.
const shownStartTime = computed(() => {
  if (!hiddenServicesTotal.value) return form.value.start_time;
  const times = servicesList.value
    .filter((row: any) => !isHiddenRow(row) && row.start_time)
    .map((row: any) => new Date(row.start_time).getTime());
  return times.length ? new Date(Math.min(...times)) : form.value.start_time;
});
const shownPaidMethod = computed(() => {
  if (!hiddenServicesTotal.value) return form.value.payment_method;
  const ways = [
    ...new Set(servicesList.value.filter((row: any) => !isHiddenRow(row) && row._paidWith).map((row: any) => row._paidWith)),
  ];
  return ways.length === 1 && !String(ways[0]).includes(",") ? ways[0] : null;
});
const hiddenServicesTotal = computed(() =>
  servicesList.value.reduce((sum: number, row: any) => sum + hiddenPart(row), 0),
);
const siblingsLoading = ref(false);
// The money side (totals, earlier debt, what's due now): see
// composables/useBookingTotals.ts.
const {
  selectedSiblingsOwedTotal,
  selectedSiblingsDepositTotal,
  servicesTotal,
  productsTotal,
  discountAmount,
  currentApptTotal,
  previousDebt,
  totalDueNow,
  combinedTotalDueNow,
  suggestedAmount,
} = useBookingTotals({
  services: servicesList,
  products: productsList,
  discount,
  client: selectedClient,
  isEdit: isEditMode,
  form,
  siblings: siblingAppointments,
  selectedSiblingIds,
  pendingPackagesTotal,
  pendingGiftCardsTotal,
  savedUnpaid: computed(() => Math.max(0, originalSnapshot.value.price - originalSnapshot.value.deposit)),
  savedStatus,
});

// The payment tab's steps: 1 checkout, 2 way of paying, 3 price change and charge.
const paymentStep = ref(1);
const packageSaleRef = ref<any>(null);
const giftCardSaleRef = ref<any>(null);
const saleChoicesOpen = ref(false);
const canSellExtras = computed(() => !!form.value.client_id && authStore.isShopAdmin);
const openSale = (sale: any) => {
  saleChoicesOpen.value = false;
  sale?.openSell();
};
const isPaymentSettled = computed(() => combinedTotalDueNow.value <= 0);
const showPaymentNav = computed(() => currentTab.value === "Payment" && !isPaymentSettled.value && !isReadOnly.value);
// Nothing unsaved on the payment tab outlives the dialog or moves to another
// booking. What was already saved (a used visit, a price change) stays.
const resetPayment = () => {
  paymentStep.value = 1;
  saleChoicesOpen.value = false;
  priceChangeVisible.value = false;
  refundVisible.value = false;
  pendingPackages.value = [];
  pendingGiftCards.value = [];
  selectedPaymentMethod.value = "card";
  selectedGiftCardId.value = null;
  selectedMembershipRedemptions.value = [];
  bookingPaymentsRef.value?.disableSplit();
};
const canReachCharge = computed(() => !!bookingPaymentsRef.value?.canContinue);
// Only earlier debt left on this booking: nothing to check out, straight to paying it.
watch(currentTab, (tab) => {
  if (tab !== "Payment") return;
  saleChoicesOpen.value = false;
  paymentStep.value = form.value.deposit_amount >= currentApptTotal.value && previousDebt.value > 0 ? 2 : 1;
});
// Something sold is paid in full: the amount to pay grows and shrinks with it.
watch(
  () => pendingPackagesTotal.value + pendingGiftCardsTotal.value,
  (sales, before) => {
    amountToPayNow.value = Math.max(0, Math.min(combinedTotalDueNow.value, amountToPayNow.value + sales - before));
  },
);
watch(isPaymentSettled, (settled) => {
  if (settled) paymentStep.value = 1;
});

const originalServices = ref<ServiceSnapshot[]>([]);
// The client's balance beside the booking: earlier debt, and what's left on this
// booking once it's completed (its remainder is owed now).
const sidebarBalance = computed(() =>
  previousDebt.value +
  (form.value.id && savedStatus.value === "completed" ? Math.max(0, originalSnapshot.value.price - originalSnapshot.value.deposit) : 0),
);
const originalSnapshot = ref({ price: 0, deposit: 0, isPast: false });

// Suggests a sensible default amount: pay off whatever's explicitly owed for
// this appointment plus any currently-checked same-day siblings, falling
// back to the full combined total (incl. old debt) only once there's
// nothing left owed on the selected set. Called once on dialog open (via
// nextTick below, so currentApptTotal/totalDueNow have settled) and again
// whenever the sibling selection itself changes — selecting a sibling is a
// deliberate "include this in the payment" action, so the suggested amount
// must track it upward too, not just clamp down (see the clamp watch below,
// which only ever handles decreases).
const suggestAmountToPay = () => {
  amountToPayNow.value = suggestedAmount();
};

watch(selectedSiblingIds, () => nextTick(suggestAmountToPay), { deep: true });

// Only clamp the entered amount when the total due drops below it (e.g. a
// service is removed). suggestAmountToPay above handles increases (initial
// suggestion + sibling selection); this only ever needs to handle decreases
// so a user's custom partial-payment amount is never silently overwritten by
// an unrelated service-price change.
watch(combinedTotalDueNow, (newVal) => {
  if (amountToPayNow.value > newVal) {
    amountToPayNow.value = Math.max(0, newVal); // a client in credit owes nothing
  }
});

// Fills the form from an existing appointment (EDIT MODE). Also used when a
// new booking is grouped into the client's existing appointment that day.
// The version of the appointment this dialog is editing: sent with saves as
// base_version, so an edit made from an outdated copy (changed on another
// device, or online while this one was offline) is refused instead of
// overwriting the newer change. Updated after each save/payment here; null
// when unknown (a change of this appointment is already waiting to sync).
const currentVersion = ref<number | null>(null);
const calendarStoreForOverlaps = useCalendarStore();

const loadExistingAppointment = (val: any, resolvedStaffId: any) => {
  currentVersion.value = val.version ?? null;
  savedStatus.value = val.status || "";
  form.value = {
    id: val.id,
    client_id: val.client_id || null,
    start_time: val.start_time ? new Date(val.start_time) : new Date(),
    status: val.status || "new",
    internal_notes: val.internal_notes || "",
    booking_notes: val.booking_notes || "",
    deposit_amount: Number(val.deposit_amount || 0),
    payment_status: val.payment_status || "unpaid",
    payment_method: val.payment_method || "card",
    is_block: !!val.is_block,
    save_receipt:
      val.save_receipt !== undefined ? !!val.save_receipt : true,
    is_eoppy: !!val.is_eoppy,
  };

  if (val.client_id) {
    loadClientById(val.client_id, {
      id: val.client_id,
      first_name: val.first_name,
      last_name: val.last_name,
      full_name: `${val.first_name || ""} ${val.last_name || ""}`.trim(),
      phone: val.client_phone,
      outstanding_balance: Number(val.client_outstanding_balance || 0),
    });
  } else {
    selectedClient.value = null;
  }

  let rule = null;
  if (val.recurrence) {
    try {
      rule =
        typeof val.recurrence === "string"
          ? JSON.parse(val.recurrence)
          : val.recurrence;
    } catch (e) {
      console.warn("Invalid recurrence format, resetting:", val.recurrence);
      rule = null;
    }
  }

  if (rule) {
    isRecurring.value = true;
    recurrenceForm.value = {
      freq: rule.freq || "Weekly",
      end_date: rule.end_date ? new Date(rule.end_date) : null,
    };
  } else {
    isRecurring.value = false;
    recurrenceForm.value = { freq: "Weekly", end_date: null };
  }

  if (val.services?.length > 0) {
    servicesList.value = markManualStarts(val.services.map((s: any) => {
      // Which variation this row was is now persisted server-side
      // (appointment_services.variation_name — s.variation_name here),
      // independent of price/duration, so it survives later edits to
      // either (e.g. extending the duration). s.variation_name is only
      // absent for appointments saved before that column existed; for
      // those, fall back once here to reverse-matching the saved price/
      // duration against the service's current variation list — same as
      // before, still breaks if price/duration are edited afterward,
      // but that's now limited to pre-migration data only.
      const catalogService = props.services?.find(
        (cs: any) => cs.id === s.service_id,
      );
      const resolvedVariationName =
        s.variation_name ||
        matchVariationName(
          catalogService,
          Number(s.price || 0),
          s.duration_minutes || 60,
        );
      return {
        service_id: s.service_id,
        staff_id: s.staff_id,
        start_time: s.start_time
          ? new Date(s.start_time)
          : new Date(val.start_time),
        duration_override: s.duration_minutes || 60,
        price_override: Number(s.price || 0),
        variation_name: resolvedVariationName || null,
        combo_service_id: s.combo_service_id || null,
        persons: personsOf(s),
        service_archived: !!s.service_archived,
        _paidWith: s.paid_with || null,
        _hidden: s.hidden || null,
        _charged: s.charged ?? null,
        _label: comboLineLabel(
          resolvedVariationName
            ? `${catalogService?.name || s.service_name || ""} — ${resolvedVariationName}`
            : catalogService?.name || s.service_name || "",
          s.combo_name,
        ),
      };
    }));
  } else {
    servicesList.value = [
      {
        service_id: null,
        staff_id: resolvedStaffId,
        start_time: new Date(form.value.start_time),
        duration_override: 60,
        price_override: 0,
      },
    ];
  }

  productsList.value = Array.isArray(val.products)
    ? val.products.map((p: any) => ({
        product_id: p.product_id,
        quantity: p.quantity || 1,
        price: Number(p.price || 0),
      }))
    : [];

  originalServices.value = snapshotServices(servicesList.value);
  discount.value = discountFromAppointment(val);
  originalDiscountAmount.value = discountAmount.value;
  const apptStartTime = val.services?.[0]?.start_time || val.start_time;
  originalSnapshot.value = {
    price: currentApptTotal.value,
    deposit: form.value.deposit_amount,
    isPast: apptStartTime ? new Date(apptStartTime) < new Date() : false,
  };

  if (form.value.client_id && form.value.start_time) {
    loadSiblingAppointments(form.value.client_id, form.value.start_time);
  }
};

// === INITIALIZATION ===
watch(
  [() => props.appointment, () => props.visible],
  ([val, visible]) => {
    resetPayment();
    if (!visible) return;
    // Never carry a stale same-day-payment selection into a new dialog
    // instance — EDIT MODE below repopulates siblingAppointments if this
    // appointment has a client + start_time; NEW MODE (a brand-new,
    // unsaved appointment) never has siblings to show.
    selectedSiblingIds.value = [];
    siblingAppointments.value = [];
    let resolvedStaffId = null;
    if (val?.staff_id && props.staff) {
      const found = props.staff.find((s: any) => s.id == val.staff_id);
      if (found) resolvedStaffId = found.id;
    }

    groupedWithTime.value = null;
    groupRequest++;
    if (val && val.id) {
      // === EDIT MODE ===
      loadExistingAppointment(val, resolvedStaffId);
    } else {
      // === NEW MODE ===
      const newStart = val?.start_time ? new Date(val.start_time) : new Date();
      // A drag-select on the calendar carries both ends of the selected span
      // (SchedulerView's `select` handler passes end_time through) — use that
      // as the new service's duration instead of always defaulting to 60.
      const draggedDurationMinutes = val?.end_time
        ? Math.max(
            5,
            Math.round(
              (new Date(val.end_time).getTime() - newStart.getTime()) / 60000,
            ),
          )
        : 60;

      // A caller (e.g. the client search's "Book an appointment" button) can
      // pre-select a client for a brand-new booking — everything else below
      // still behaves exactly like starting from a blank slot. Otherwise,
      // pre-select the shop's walk-in client so a booking can be saved fast
      // and attributed to a real client later (see loadWalkInClient below).
      if (val?.client_id) {
        loadClientById(val.client_id, {
          id: val.client_id,
          first_name: val.first_name,
          last_name: val.last_name,
          full_name: `${val.first_name || ""} ${val.last_name || ""}`.trim(),
          phone: val.phone,
          outstanding_balance: Number(val.outstanding_balance || 0),
        });
      } else {
        selectedClient.value = null;
        loadWalkInClient();
      }

      // Clicking an existing "break" block on the scheduler reopens this same
      // dialog in NEW MODE (no appointment id exists for a time-off row) but
      // pre-filled as an edit: is_block starts true, and time_off_id/
      // time_off_staff_id are kept so Save can replace (or, if the block
      // toggle is clicked off, delete) the right staff_time_off row. See
      // saveAsTimeOff/unblockTimeOff below.
      form.value = {
        id: null,
        client_id: val?.client_id || null,
        start_time: newStart,
        status: "new",
        internal_notes: val?.time_off_id ? val.reason || "" : "",
        deposit_amount: 0,
        payment_status: "unpaid",
        is_block: !!val?.time_off_id,
        time_off_id: val?.time_off_id || null,
        time_off_staff_id: val?.time_off_id
          ? val.staff_id || resolvedStaffId
          : null,
        save_receipt: true,
        is_eoppy: false,
      };

      isRecurring.value = false;
      recurrenceForm.value = { freq: "Weekly", end_date: null };

      servicesList.value = [
        {
          service_id: null,
          staff_id: resolvedStaffId,
          start_time: newStart,
          duration_override: draggedDurationMinutes,
          price_override: 0,
        },
      ];

      productsList.value = [];
      discount.value = emptyDiscount();
      originalDiscountAmount.value = 0;
      originalSnapshot.value = { price: 0, deposit: 0, isPast: false };
      if (val?.client_id && !val?.time_off_id) groupWithSameDayAppointment(val.client_id);
    }

    // Suggest a sensible default amount after the form (and computed values) have settled.
    // Using nextTick so computed properties (currentApptTotal, totalDueNow) read the new form state.
    nextTick(() => {
      suggestAmountToPay();
      loadedBooking = bookingSnapshot();
    });
    currentTab.value = "Booking";
    showMobileSidebar.value = false;
  },
  { immediate: true },
);

// === METHODS ===

// A past visit clicked in the sidebar replaces this booking in the dialog, so
// edits not yet saved need a yes first. There is no route for one appointment:
// it comes from its day's list, the same shape the calendar gets.
let loadedBooking = "";
const bookingSnapshot = () =>
  JSON.stringify({
    status: form.value.status,
    start: form.value.start_time,
    internal: form.value.internal_notes || "",
    notes: form.value.booking_notes || "",
    services: servicesList.value.map((s: any) => [
      s.service_id,
      s.staff_id,
      s.start_time,
      s.duration_override,
      s.price_override,
      s.variation_name || null,
      s.persons || 1,
    ]),
    products: productsList.value,
    discount: discount.value,
    sales: [pendingPackages.value, pendingGiftCards.value],
  });
const discardUnsavedEdits = () =>
  new Promise<boolean>((resolve) => {
    if (bookingSnapshot() === loadedBooking) return resolve(true);
    confirm.require({
      header: t("booking.openPast.header"),
      message: t("booking.openPast.message"),
      icon: "pi pi-exclamation-triangle",
      acceptLabel: t("booking.openPast.discard"),
      rejectLabel: t("booking.openPast.keep"),
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    });
  });

let pastRequest = 0;
const loadingPastId = ref<string | null>(null);
const openPastAppointment = async (past: any) => {
  if (past.id === form.value.id) return;
  const request = ++pastRequest;
  if (!(await discardUnsavedEdits()) || request !== pastRequest) return;
  loadingPastId.value = past.id;
  try {
    const dayRows = await api.get(`/api/v1/appointments?date=${toLocalDateStr(new Date(past.start_time))}`);
    if (request !== pastRequest || !props.visible) return;
    const found = dayRows.find((a: any) => a.id === past.id);
    if (!found) throw new Error("not in the day's list");
    emit("open-appointment", found);
  } catch {
    if (request !== pastRequest) return;
    toast.add({ severity: "error", summary: t("common.error"), detail: t("booking.openPast.failed"), life: 3500 });
  } finally {
    if (request === pastRequest) loadingPastId.value = null;
  }
};

// Package visits attach to a saved appointment: save pending edits first.
const ensureSavedForPackage = async (): Promise<string | null> => {
  if (!(await save(false))) return null;
  return form.value.id || null;
};

const onPackageChanged = (data: any) => {
  if (data.new_balance !== undefined && selectedClient.value) {
    selectedClient.value.outstanding_balance = Number(data.new_balance);
  }
  if (data.amount) form.value.deposit_amount += Number(data.amount);
  if (data.status) form.value.status = data.status;
  if (data.payment_status) form.value.payment_status = data.payment_status;
  originalSnapshot.value = {
    ...originalSnapshot.value,
    deposit: form.value.deposit_amount,
  };
  emit("save");
};

// A manual checkout price change re-derives each service's price_override
// server-side (see /api/v1/appointments/:id/price-change) — the server is
// the sole authority on the split, so servicesList is replaced verbatim from
// its response rather than re-deriving the same math client-side too.
const onPriceChanged = (data: any) => {
  if (Array.isArray(data.services)) {
    // Only the prices changed: each row keeps everything else (its variation, label).
    const rowFor = (s: any) =>
      servicesList.value.find(
        (r: any) =>
          r.service_id === s.service_id &&
          r.staff_id === s.staff_id &&
          new Date(r.start_time).getTime() === new Date(s.start_time).getTime(),
      );
    servicesList.value = markManualStarts(data.services.map((s: any) => ({
      ...rowFor(s),
      service_id: s.service_id,
      staff_id: s.staff_id,
      start_time: new Date(s.start_time),
      duration_override: s.duration_override,
      price_override: Number(s.price_override),
      persons: personsOf(s),
    })));
    originalServices.value = snapshotServices(servicesList.value);
  }
  // The new price replaces any discount; what's left on the products is their price now.
  if (data.discount_cleared) {
    discount.value = emptyDiscount();
    originalDiscountAmount.value = 0;
    if (Array.isArray(data.products)) {
      productsList.value = data.products.map((p: any) => ({
        product_id: p.product_id,
        quantity: p.quantity,
        price: Number(p.price || 0),
      }));
    }
  }
  // The same-day appointments paid with this one have new prices too.
  siblingAppointments.value = siblingAppointments.value.map((s: any) =>
    data.totals?.[s.id] === undefined
      ? s
      : { ...s, total_cost: data.totals[s.id], owed: Math.max(0, data.totals[s.id] - Number(s.deposit_amount || 0)) },
  );
  if (data.new_balance !== undefined && selectedClient.value) {
    selectedClient.value.outstanding_balance = Number(data.new_balance);
  }
  if (data.version !== undefined) currentVersion.value = data.version;
  if (data.booking_notes !== undefined) form.value.booking_notes = data.booking_notes || "";
  // The dialog stays open: charging comes right after this.
  originalSnapshot.value = { ...originalSnapshot.value, price: currentApptTotal.value };
  loadedBooking = bookingSnapshot();
  emit("refresh");
};

const onRefunded = (data: any) => {
  if (data.new_balance !== undefined && selectedClient.value) {
    selectedClient.value.outstanding_balance = Number(data.new_balance);
  }
  // deposit_amount tracks "amount paid so far" for this dialog's own display
  // (max refundable, balance summary) — a refund reduces net-collected, so
  // it needs to shrink the same way a payment grows it.
  form.value.deposit_amount = Math.max(
    0,
    form.value.deposit_amount - Number(data.amount || 0),
  );
  originalSnapshot.value = {
    ...originalSnapshot.value,
    deposit: form.value.deposit_amount,
  };
  emit("save");
};

// A price change can move what's owed after the amount was chosen. Paying the
// whole amount simply follows it; a split, a part payment, a gift card or a
// membership needs a person to look again.
const onPriceChangedInPayment = (data: any) => {
  const dueBefore = combinedTotalDueNow.value;
  const amountBefore = amountToPayNow.value;
  const paidWhole = amountBefore === dueBefore || amountBefore === suggestedAmount();
  const simple =
    paidWhole &&
    !bookingPaymentsRef.value?.splitEnabled &&
    !["gift-card", "membership"].includes(selectedPaymentMethod.value);
  const wasSettled = isPaymentSettled.value;
  onPriceChanged(data);
  nextTick(() => {
    const due = combinedTotalDueNow.value;
    if (due <= 0) return;
    if (wasSettled) {
      amountToPayNow.value = suggestedAmount();
      return;
    }
    if (simple) {
      amountToPayNow.value = Math.min(due, Math.max(0, amountBefore + due - dueBefore));
      toast.add({ severity: "info", summary: t("payment.stepper.amountFollowed", { amount: formatMoney(amountToPayNow.value) }), life: 3500 });
      return;
    }
    amountToPayNow.value = Math.min(due, amountBefore);
    toast.add({ severity: "warn", summary: t("payment.stepper.checkAmount"), life: 4000 });
  });
};

const confirmChanges = (): Promise<boolean> => {
  if (!form.value.id || form.value.is_block) return Promise.resolve(true);
  const lines = describeServiceChanges(
    originalServices.value,
    snapshotServices(servicesList.value),
    {
      services: props.services || [],
      staff: props.staff || [],
      t,
      locale: locale.value,
    },
  );
  if (discountAmount.value !== originalDiscountAmount.value) {
    lines.push(
      `${t("discount.line")}: ${formatMoney(originalDiscountAmount.value)} → ${formatMoney(discountAmount.value)}`,
    );
  }
  if (lines.length === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    confirm.require({
      header: t("booking.changeConfirm.header"),
      message: `${t("booking.changeConfirm.intro")}\n\n${lines
        .map((l) => `• ${l}`)
        .join("\n")}\n\n${t("booking.changeConfirm.question")}`,
      icon: "pi pi-question-circle",
      acceptLabel: t("booking.changeConfirm.apply"),
      rejectLabel: t("booking.changeConfirm.cancel"),
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    });
  });
};

const confirmOvertime = (entries: { name: string; hours: string | null }[]): Promise<boolean> =>
  new Promise((resolve) => {
    confirm.require({
      header: t("booking.overtime.header"),
      message: overtimeConfirmMessage(entries, t),
      icon: "pi pi-clock",
      acceptLabel: t("booking.overtime.accept"),
      rejectLabel: t("common.cancel"),
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    });
  });

// A "block time" dialog has no client or real service — it just needs one
// staff member + a time span, which already live on servicesList's single
// row (see missingStaffService above). Saves through the exact same
// staff_time_off mechanism as the Staff page's own time-off dialog (type
// "break", same conflict/force pattern), rather than creating a blocked
// `appointments` row.
const saveAsTimeOff = async (force = false): Promise<boolean> => {
  const svc = servicesList.value[0];
  const staffId = svc?.staff_id;
  if (!staffId || !svc?.start_time) return false;

  const start = new Date(svc.start_time);
  const end = new Date(start.getTime() + (svc.duration_override || 60) * 60000);
  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const toTimeStr = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  try {
    // Overlapping bookings: 409 with the list, asked about before forcing.
    const conflict = await api
      .post(`/api/v1/staff/${staffId}/time-off`, {
        type: "break",
        start_date: toDateStr(start),
        end_date: toDateStr(start),
        start_time: toTimeStr(start),
        end_time: toTimeStr(end),
        reason: form.value.internal_notes || null,
        force,
      })
      .then(() => null)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 409) return e.data || {};
        throw e;
      });

    if (conflict) {
      const data = conflict;
      const list = (data.conflicts || [])
        .map(
          (c: any) =>
            `• ${c.client_name || "—"} — ${c.service_name || ""} (${formatDate(c.start_time)})`,
        )
        .join("\n");
      return new Promise((resolve) => {
        confirm.require({
          message: t("staff.timeOff.conflictMessage", {
            count: (data.conflicts || []).length,
            list,
          }),
          header: t("staff.timeOff.conflictHeader"),
          icon: "pi pi-exclamation-triangle",
          acceptClass: "p-button-warning",
          accept: async () => resolve(await saveAsTimeOff(true)),
          reject: () => resolve(false),
          onHide: () => resolve(false),
        });
      });
    }

    // Editing an existing block: the replacement above is already safely
    // created (and conflict-checked only against real appointments, never
    // against this old row), so it's now safe to remove the original —
    // using its original staff id, which may differ if the block was moved
    // to another staff member in this edit.
    if (form.value.time_off_id && form.value.time_off_staff_id) {
      await api.del(`/api/v1/staff/${form.value.time_off_staff_id}/time-off/${form.value.time_off_id}`).catch(() => {});
    }

    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("staff.timeOff.saved"),
      life: 3000,
    });
    emit("save");
    emit("update:visible", false);
    return true;
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("staff.timeOff.saveFailed"),
      life: 4000,
    });
    return false;
  }
};

// Toggling the block button off while editing an existing block ("unclick")
// just removes the staff_time_off row — the time becomes available again,
// with no appointment created in its place.
const unblockTimeOff = async (): Promise<boolean> => {
  if (!form.value.time_off_id || !form.value.time_off_staff_id) return false;
  try {
    await api.del(`/api/v1/staff/${form.value.time_off_staff_id}/time-off/${form.value.time_off_id}`);
    toast.add({
      severity: "success",
      summary: t("common.success"),
      detail: t("staff.timeOff.deleted"),
      life: 3000,
    });
    emit("save");
    emit("update:visible", false);
    return true;
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("common.error"),
      detail: t("staff.timeOff.saveFailed"),
      life: 4000,
    });
    return false;
  }
};

// Resolves false only when the user declined the change confirmation.
const save = async (close = true): Promise<boolean> => {
  if (isReadOnly.value) return false;
  if (!(await confirmChanges())) return false;

  // Check if editing an existing recurring appointment
  const isSeriesEdit = form.value.id && props.appointment?.group_id;
  const isConvertingToSeries =
    form.value.id && !props.appointment?.group_id && isRecurring.value;

  if (isSeriesEdit) {
    return new Promise((resolve) => {
      confirm.require({
        message: t("booking.editDialog.message"),
        header: t("booking.editDialog.header"),
        icon: "pi pi-question-circle",
        rejectLabel: t("booking.editDialog.thisOnly"),
        acceptLabel: t("booking.editDialog.thisAndFuture"),
        accept: async () => {
          resolve(await executeSave(close, "series"));
        },
        reject: async () => {
          resolve(await executeSave(close, "single"));
        },
      });
    });
  }
  return executeSave(close, isConvertingToSeries ? "series" : "single");
};

// Opened after the current question has closed (see offerCancelInstead).
const askSaveThisOnly = (close: boolean) =>
  new Promise<boolean>((resolve) => {
    setTimeout(() => {
      confirm.require({
        header: t("booking.seriesHasPayments.header"),
        message: t("booking.seriesHasPayments.message"),
        icon: "pi pi-exclamation-triangle",
        acceptLabel: t("booking.editDialog.thisOnly"),
        rejectLabel: t("common.cancel"),
        rejectClass: "p-button-outlined p-button-secondary",
        accept: () => resolve(executeSave(close, "single")),
        reject: () => resolve(false),
        onHide: () => resolve(false),
      });
    }, 0);
  });

/** Saves the booking; true once saved (or queued offline), false if it wasn't. */
const executeSave = async (close = true, scope = "single", allowOverCapacity = false): Promise<boolean> => {
  // Unblocking (toggling an existing block's button off) and editing a
  // block's time/duration are both time-off-only flows with no client/
  // service involved — skip the normal booking validations entirely.
  const isTimeOffFlow = form.value.is_block || !!form.value.time_off_id;
  if (!form.value.client_id && !isTimeOffFlow) {
    toast.add({
      severity: "warn",
      summary: t("common.error"),
      detail: t("booking.validation.selectClient"),
      life: 3000,
    });
    return false;
  }
  if (servicesList.value.length === 0) {
    toast.add({
      severity: "warn",
      summary: t("common.error"),
      detail: t("booking.validation.addService"),
      life: 3000,
    });
    return false;
  }
  if (missingStaffService.value) {
    toast.add({
      severity: "warn",
      summary: t("common.error"),
      detail: t("booking.validation.staffRequired"),
      life: 3000,
    });
    return false;
  }

  if (form.value.time_off_id && !form.value.is_block) {
    loading.value = true;
    const ok = await unblockTimeOff();
    loading.value = false;
    return ok;
  }

  if (form.value.is_block) {
    loading.value = true;
    const ok = await saveAsTimeOff();
    loading.value = false;
    return ok;
  }

  // Hard pre-save check — the staff dropdown in BookingServices already
  // filters out unavailable staff, but that's only a filter on the options
  // list; it isn't re-validated if the time changes after a staff member was
  // picked, or if the field was pre-filled by dragging a calendar slot. The
  // server is the actual authority (see assertStaffAvailable), this is just
  // fast feedback before making a network call.
  // Outside working hours (incl. a scheduled day off) is allowed as overtime
  // for admin, super admin and frontdesk after a confirmation; leave and
  // breaks always block. A click on the calendar may already have confirmed
  // it for that staff member (appointment.overtime_confirmed_staff_id).
  let allowOvertime = false;
  if (!form.value.is_block) {
    const overtime: { staffId: any; name: string; hours: string | null }[] = [];
    for (const svc of servicesList.value) {
      if (!svc.staff_id || !svc.start_time) continue;
      const start = new Date(svc.start_time);
      const end = new Date(
        start.getTime() + (svc.duration_override || 60) * 60000,
      );
      const availability = isStaffAvailable({
        staffList: props.staff || [],
        workingHours: props.workingHours || [],
        timeOff: props.timeOff || [],
        staffId: svc.staff_id,
        start,
        end,
      });
      if (availability.available) continue;
      if (availability.reason === "outside_hours" && authStore.isShopAdmin) {
        overtime.push({
          staffId: svc.staff_id,
          name: (props.staff || []).find((s: any) => String(s.id) === String(svc.staff_id))?.name || "",
          hours: describeWorkingDay(props.workingHours || [], props.staff || [], svc.staff_id, start),
        });
        continue;
      }
      toast.add({
        severity: "error",
        summary: t("common.error"),
        detail: t("booking.validation.staffUnavailable"),
        life: 4000,
      });
      return false;
    }
    if (overtime.length > 0) {
      const preConfirmed = props.appointment?.overtime_confirmed_staff_id;
      const needsConfirm = overtime.some((o) => String(o.staffId) !== String(preConfirmed));
      if (needsConfirm && !(await confirmOvertime(overtime))) return false;
      allowOvertime = true;
    }
  }

  loading.value = true;

  let url = form.value.id
    ? `/api/v1/appointments/${form.value.id}?scope=${scope}`
    : "/api/v1/appointments";

  const method = form.value.id ? "PUT" : "POST";

  try {
    const payload = {
      ...form.value,
      allow_overtime: allowOvertime,
      recurrence: isRecurring.value
        ? {
            freq: recurrenceForm.value.freq,
            end_date: recurrenceForm.value.end_date,
          }
        : null,
      services: servicesList.value.map((s) => ({
        ...s,
        price_override: Number(s.price_override) || Number(s.price) || 0,
        // Persons only mean something in a shared place (the sauna).
        persons: placesOf((props.staff || []).find((m: any) => String(m.id) === String(s.staff_id))) > 1 ? personsOf(s) : 1,
      })),
      ...(allowOverCapacity ? { allow_over_capacity: true } : {}),
      products: productsList.value,
      ...discountPayload(discount.value),
      ...(method === "PUT" && currentVersion.value != null && !isTempId(String(form.value.id))
        ? { base_version: currentVersion.value }
        : {}),
    };

    const firstStart = servicesList.value[0]?.start_time ? new Date(servicesList.value[0].start_time) : null;
    const result = await fetchOrQueue(url, method, payload, {
      kind: "appointment",
      label: [
        selectedClient.value ? `${selectedClient.value.first_name || ""} ${selectedClient.value.last_name || ""}`.trim() : "",
        firstStart ? firstStart.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "",
      ].filter(Boolean).join(" · ") || t("booking.editDialog.title"),
      createsId: method === "POST" ? "id" : undefined,
      offlineExtras: {
        offline_known_overlaps: knownOverlapIds(calendarStoreForOverlaps.events, payload.services, form.value.id),
        // Made offline: when it was really booked, not when it syncs.
        ...(method === "POST" ? { booked_at: new Date().toISOString() } : {}),
      },
    });

    if (result.queued) {
      // No network reached the server — the write is kept in IndexedDB,
      // shown on the calendar as "not synced", and replayed once reconnected.
      // A new booking gets a temporary id, so saving or paying again from
      // this dialog updates the same booking instead of making a second one.
      if (method === "POST" && result.tempId) form.value.id = result.tempId;
      // The queued change will move the version on; the next save mustn't
      // repeat the check against the old one.
      currentVersion.value = null;
      toast.add({
        severity: "warn",
        summary: t("booking.toast.savedOffline"),
        detail: t("booking.toast.savedOfflineDetail"),
        life: 5000,
      });
      originalSnapshot.value = {
        price: currentApptTotal.value,
        deposit: form.value.deposit_amount,
        isPast: originalSnapshot.value.isPast,
      };
      if (close) {
        emit("save");
        dialogVisible.value = false;
      }
      return true; // saved on this device, syncs later
    }

    const res = result.response;
    const data = await res.json();

    if (!res.ok) {
      // A shared place (the sauna) would be over its places: ask, then book anyway.
      if (data.error === "over_capacity") {
        loading.value = false;
        return (await askOverCapacity(confirm, t, data)) ? executeSave(close, scope, true) : false;
      }
      // "This and future" would replace a paid booking: offer this one only.
      if (data.error === "series_has_payments") {
        loading.value = false;
        return askSaveThisOnly(close);
      }
      if (data.error === "staff_unavailable") {
        throw new Error(t("booking.validation.staffUnavailable"));
      }
      if (data.error === "repeated_service") {
        throw new Error(t("booking.validation.repeatedService"));
      }
      if (["stale_appointment", "appointment_missing", "slot_taken"].includes(data.error)) {
        throw new Error(t(`offline.conflict.${data.error}`));
      }
      throw new Error(data.error || "Failed to save");
    }

    // A series edit replaces this booking's row, so it answers with the new id too.
    if (method === "POST" || data.id) {
      form.value.id = data.id;
    }
    if (data.version !== undefined) currentVersion.value = data.version;
    savedStatus.value = form.value.status;

    if (data.new_balance !== undefined && selectedClient.value) {
      selectedClient.value.outstanding_balance = Number(data.new_balance);
    }

    originalServices.value = snapshotServices(servicesList.value);
    originalDiscountAmount.value = discountAmount.value;
    originalSnapshot.value = {
      price: currentApptTotal.value,
      deposit: form.value.deposit_amount,
      isPast: originalSnapshot.value.isPast,
    };

    if (close) {
      emit("save");
      dialogVisible.value = false;
    }
    return true;
  } catch (e) {
    console.error(e);
    toast.add({
      severity: "error",
      summary: t("booking.toast.saveFailed"),
      detail: (e as Error).message || t("booking.toast.saveFailedDetail"),
      life: 4000,
    });
    return false;
  } finally {
    loading.value = false;
  }
};

const recordPayment = async (
  split: {
    amount2: number;
    payment_method2: string;
    gift_card_id2: string | null;
    redemptions2?: any[];
  } | null,
) => {
  if (
    amountToPayNow.value <= 0 &&
    pendingPackagesTotal.value <= 0 &&
    pendingGiftCardsTotal.value <= 0
  ) {
    toast.add({ severity: "warn", summary: t("booking.toast.paymentFailed"), detail: t("payment.nothingToPay"), life: 3500 });
    return;
  }
  paymentLoading.value = true;

  // The entered amount covers "service + package" together (see totalDueNow),
  // but only the non-package part goes through the appointment's own debt
  // logic server-side — the package is sold in full, separately, regardless
  // of how much of the service itself is actually being paid right now.
  const packageTotal = pendingPackagesTotal.value;
  const giftCardTotal = pendingGiftCardsTotal.value;
  // Packages and gift cards are paid first: by the first way of paying, and
  // what it doesn't cover by the second. Only the rest goes to what's owed.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const extrasOnFirst = Math.min(amountToPayNow.value, packageTotal + giftCardTotal);
  const extrasOnSecond = round2(packageTotal + giftCardTotal - extrasOnFirst);
  const serviceLegAmount = round2(amountToPayNow.value - extrasOnFirst);
  const serviceLegAmount2 = split ? round2(Math.max(0, split.amount2 - extrasOnSecond)) : 0;

  // Save any pending form changes (services, notes) before processing payment.
  // Do NOT force status='completed' here — the transaction endpoint handles that
  // atomically so a failed payment can't leave the appointment marked complete.
  if (!(await save(false))) {
    paymentLoading.value = false;
    return;
  }

  if (!form.value.id) {
    // No booking to attach the payment to (the save above didn't go through).
    // A booking saved offline has a temporary id here, and its payment is
    // queued behind it — that case doesn't reach this branch.
    toast.add({
      severity: "warn",
      summary: t("booking.toast.paymentFailed"),
      detail: t("booking.toast.paymentWaitingForSync"),
      life: 5000,
    });
    paymentLoading.value = false;
    return;
  }

  try {
    const result = await fetchOrQueue(
      "/api/v1/transactions",
      "POST",
      {
        appointment_id: form.value.id,
        ...(selectedSiblingIds.value.length > 0
          ? { appointment_ids: [form.value.id, ...selectedSiblingIds.value] }
          : {}),
        client_id: form.value.client_id,
        amount: serviceLegAmount,
        payment_method: selectedPaymentMethod.value,
        gift_card_id: selectedGiftCardId.value,
        redemptions: selectedMembershipRedemptions.value,
        ...(packageTotal > 0
          ? {
              package_purchases: pendingPackages.value.map((p) => ({
                package_type_id: p.package_type_id,
              })),
            }
          : {}),
        ...(giftCardTotal > 0
          ? { gift_card_purchases: pendingGiftCards.value }
          : {}),
        ...(split
          ? {
              amount2: serviceLegAmount2,
              extras_amount2: extrasOnSecond,
              payment_method2: split.payment_method2,
              gift_card_id2: split.gift_card_id2,
              redemptions2: split.redemptions2,
            }
          : {}),
      },
      {
        kind: "payment",
        label:
          `${t("payment.title")} — ${selectedClient.value?.first_name || ""}`.trim(),
      },
    );

    if (result.queued) {
      const totalPaidThisVisit = serviceLegAmount + serviceLegAmount2;
      // Reflect the payment locally right away so staff aren't blocked, but
      // this is optimistic — the server hasn't actually seen it yet. The
      // queued request already carries package_purchases, so the package(s)
      // will be created once it syncs.
      form.value.deposit_amount += totalPaidThisVisit;
      currentVersion.value = null; // the queued payment will change it
      pendingPackages.value = [];
      pendingGiftCards.value = [];
      // Any selected siblings' owed/payment_status are about to change once
      // the queue flushes server-side — clear rather than show stale figures
      // while offline.
      selectedSiblingIds.value = [];
      siblingAppointments.value = [];
      toast.add({
        severity: "warn",
        summary: t("booking.toast.savedOffline"),
        detail: t("booking.toast.paymentQueuedDetail"),
        life: 5000,
      });
      selectedGiftCardId.value = null;
      selectedMembershipRedemptions.value = [];
      if (
        selectedPaymentMethod.value === "gift-card" ||
        selectedPaymentMethod.value === "membership"
      ) {
        selectedPaymentMethod.value = "card";
      }
      bookingPaymentsRef.value?.disableSplit();
      paymentStep.value = 1;
      paymentLoading.value = false;
      return;
    }

    const res = result.response;

    if (res.ok) {
      const data = await res.json();
      const totalPaidThisVisit = serviceLegAmount + serviceLegAmount2;

      // Update local deposit_amount for immediate UI feedback (package
      // purchases never touch the appointment's own deposit/payment_status).
      form.value.deposit_amount += totalPaidThisVisit;

      // Any paid siblings' owed/payment_status are now stale (the server
      // already updated them) — clear rather than show outdated figures;
      // re-opening the dialog refetches fresh state.
      selectedSiblingIds.value = [];
      siblingAppointments.value = [];

      // Use the authoritative balance returned by the server instead of guessing by subtraction
      if (data.new_balance !== undefined && selectedClient.value) {
        selectedClient.value.outstanding_balance = Number(data.new_balance);
      }
      if (data.appointment_version !== undefined) currentVersion.value = data.appointment_version;

      if (data.packages_purchased?.length) {
        toast.add({
          severity: "success",
          summary: t("packages.sell.sold"),
          detail: data.packages_purchased.map((p: any) => p.name).join(", "),
          life: 3000,
        });
        pendingPackages.value = [];
        bookingPackagesRef.value?.load();
      }

      if (data.gift_cards_purchased?.length) {
        toast.add({
          severity: "success",
          summary: t("giftCards.quickSell.sold"),
          detail: data.gift_cards_purchased
            .map((g: any) => g.card_number)
            .join(", "),
          life: 3000,
        });
        pendingGiftCards.value = [];
      }

      // Every recorded payment is confirmed: a split one with both legs,
      // otherwise the amount and method (package and gift-card sales have
      // their own toasts above).
      if (!split && (serviceLegAmount > 0 || selectedPaymentMethod.value === "membership")) {
        toast.add({
          severity: "success",
          summary: t("payment.recordedToast"),
          detail: t("payment.recordedToastDetail", {
            amount: formatMoney(serviceLegAmount),
            method: t(`payment.methodLabels.${selectedPaymentMethod.value}`),
          }),
          life: 4000,
        });
      }
      if (split) {
        toast.add({
          severity: "success",
          summary: t("payment.split.paidToast"),
          detail: t("payment.split.paidToastDetail", {
            method1: t(`payment.methodLabels.${selectedPaymentMethod.value}`),
            amount1: formatMoney(amountToPayNow.value),
            method2: t(`payment.methodLabels.${split.payment_method2}`),
            amount2: formatMoney(split.amount2),
          }),
          life: 5000,
        });
      }

      // Reset gift-card selection — its cached remaining_balance is now stale,
      // and any further payment (e.g. covering a shortfall) needs a fresh pick.
      selectedGiftCardId.value = null;
      selectedMembershipRedemptions.value = [];
      if (
        selectedPaymentMethod.value === "gift-card" ||
        selectedPaymentMethod.value === "membership"
      ) {
        selectedPaymentMethod.value = "card";
      }
      bookingPaymentsRef.value?.disableSplit();
      paymentStep.value = 1;

      emit("save"); // Refresh the background calendar
    } else {
      const errData = await res.json().catch(() => ({}));
      toast.add({
        severity: "error",
        summary: t("booking.toast.paymentFailed"),
        detail: errData.error || t("booking.toast.paymentFailedDetail"),
        life: 4000,
      });
    }
  } catch (e) {
    console.error(e);
    toast.add({
      severity: "error",
      summary: t("booking.toast.paymentFailed"),
      detail: t("booking.toast.networkError"),
      life: 4000,
    });
  } finally {
    paymentLoading.value = false;
  }
};

const deleteReason = ref("");
const confirmDelete = () => {
  if (isReadOnly.value) return;
  const isSeries = !!props.appointment?.group_id;
  deleteReason.value = "";

  confirm.require({
    group: "delete-booking",
    message: isSeries
      ? t("booking.deleteDialog.messageRecurring")
      : t("booking.deleteDialog.messageSingle"),
    header: t("booking.deleteDialog.header"),
    icon: "pi pi-exclamation-triangle",
    rejectLabel: isSeries
      ? t("booking.editDialog.thisOnly")
      : t("booking.deleteDialog.no"),
    acceptLabel: isSeries
      ? t("booking.editDialog.thisAndFuture")
      : t("booking.deleteDialog.yes"),
    rejectClass: "p-button-outlined p-button-secondary",
    acceptClass: "p-button-danger",

    accept: async () => {
      await executeDelete(isSeries ? "series" : "single");
    },
    reject: async () => {
      if (isSeries) {
        await executeDelete("single");
      }
    },
  });
};

// A booking with payments isn't deleted (the server refuses: has_payments):
// it's cancelled instead — kept, marked cancelled, and what was paid stays
// the client's credit.
// Opened after the current question has closed: it's asked from the delete
// confirmation's accept, and PrimeVue hides the dialog right after that runs,
// which would hide this one too.
const offerCancelInstead = () => {
  setTimeout(askCancelInstead, 0);
};
const askCancelInstead = () => {
  confirm.require({
    header: t("booking.hasPayments.header"),
    message: t("booking.hasPayments.message"),
    icon: "pi pi-exclamation-triangle",
    acceptLabel: t("booking.hasPayments.accept"),
    rejectLabel: t("booking.hasPayments.reject"),
    acceptClass: "p-button-danger",
    rejectClass: "p-button-outlined p-button-secondary",
    accept: cancelInstead,
  });
};

const cancelInstead = async () => {
  try {
    const result = await fetchOrQueue(`/api/v1/appointments/${form.value.id}/cancel`, "POST", {}, {
      kind: "appointment",
      label: `${t("booking.cancelAppt")} · ${selectedClient.value?.first_name || ""} ${selectedClient.value?.last_name || ""}`.trim(),
    });
    if (result.queued) {
      toast.add({ severity: "warn", summary: t("booking.toast.savedOffline"), detail: t("booking.toast.savedOfflineDetail"), life: 4000 });
    } else {
      const data = await result.response.json().catch(() => ({}));
      if (!result.response.ok) {
        toast.add({ severity: "error", summary: t("booking.toast.deleteFailed"), detail: data.error || t("booking.toast.deleteFailedDetail"), life: 4000 });
        return;
      }
      if (data.new_balance !== undefined && selectedClient.value) {
        selectedClient.value.outstanding_balance = Number(data.new_balance);
      }
      toast.add({ severity: "success", summary: t("booking.toast.cancelledKeptPayments"), detail: t("booking.toast.cancelledKeptPaymentsDetail"), life: 5000 });
    }
    emit("save");
    dialogVisible.value = false;
  } catch (e) {
    console.error(e);
    toast.add({ severity: "error", summary: t("booking.toast.deleteFailed"), detail: t("booking.toast.networkError"), life: 4000 });
  }
};

const executeDelete = async (scope: string) => {
  // Payments already known here: don't even try to delete.
  if (Number(form.value.deposit_amount || 0) !== 0) return offerCancelInstead();
  try {
    // Offline the deletion is queued (and the booking hidden right away).
    const result = await fetchOrQueue(`/api/v1/appointments/${form.value.id}?scope=${scope}`, "DELETE", { reason: deleteReason.value }, {
      kind: "delete",
      label: `${t("booking.cancelAppt")} · ${selectedClient.value?.first_name || ""} ${selectedClient.value?.last_name || ""}`.trim(),
    });
    if (result.queued) {
      toast.add({
        severity: "warn",
        summary: t("booking.toast.savedOffline"),
        detail: t("booking.toast.savedOfflineDetail"),
        life: 4000,
      });
      emit("save");
      dialogVisible.value = false;
      return;
    }
    const res = result.response;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.error === "has_payments") return offerCancelInstead();
      toast.add({
        severity: "error",
        summary: t("booking.toast.deleteFailed"),
        detail: data.error || t("booking.toast.deleteFailedDetail"),
        life: 4000,
      });
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.new_balance !== undefined && selectedClient.value) {
      selectedClient.value.outstanding_balance = Number(data.new_balance);
    }
    emit("save");
    dialogVisible.value = false;
  } catch (e) {
    console.error(e);
    toast.add({
      severity: "error",
      summary: t("booking.toast.deleteFailed"),
      detail: t("booking.toast.networkError"),
      life: 4000,
    });
  }
};

// --- Client Helpers ---
const isWalkInSelected = computed(
  () =>
    !!selectedClient.value?.is_walk_in ||
    (!!walkInClientId.value && form.value.client_id === walkInClientId.value),
);

const openClientProfile = () => {
  if (!form.value.client_id) return;
  currentProfileId.value = form.value.client_id;
  showClientProfile.value = true;
};

// Closing the booking dialog while the client profile is open leaves
// showClientProfile stuck true (this component instance is never unmounted),
// so the next open would remount ClientProfileDialog already-visible and empty.
watch(
  () => props.visible,
  (val) => {
    if (!val) {
      showClientProfile.value = false;
      currentProfileId.value = null;
    }
  },
);

// --- Formatters ---
const formatDate = (d: Date) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const getStatusColor = (s: string) => {
  const map: any = {
    new: "bg-blue-100 text-blue-800",
    confirmed: "bg-purple-100 text-purple-800",
    arrived: "bg-orange-100 text-orange-800",
    started: "bg-green-100 text-green-800",
    completed: "bg-gray-200 text-gray-800",
    cancelled: "bg-red-100 text-red-800",
    "no-show": "bg-red-200 text-red-900",
    "no-response": "bg-amber-100 text-amber-800",
  };
  return map[s] || "bg-gray-100";
};

const getStatusDot = (s: string) => {
  const map: any = {
    new: "bg-blue-500",
    confirmed: "bg-purple-500",
    arrived: "bg-orange-500",
    started: "bg-green-500",
    completed: "bg-gray-500",
    cancelled: "bg-red-500",
    "no-show": "bg-red-700",
    "no-response": "bg-amber-500",
  };
  return map[s] || "bg-gray-400";
};
</script>

<style scoped>
:global(.p-confirmdialog-message) {
  white-space: pre-line;
}

.fresha-dialog .p-dialog-header {
  display: none;
}
.p-dropdown,
.p-inputtext,
.p-calendar {
  border-radius: 0.5rem;
}
</style>

<!-- Not scoped: the dialog and the ⋯ menu are drawn outside this component. -->
<style>
/* Phones: the whole visible screen (the backdrop is 100dvh, see tailwind.css). */
@media (max-width: 767px) {
  .p-dialog.fresha-dialog {
    width: 100vw !important;
    height: 100% !important;
    max-height: 100% !important;
    margin: 0 !important;
    border-radius: 0 !important;
  }
  .p-dialog.fresha-dialog .p-dialog-content {
    border-radius: 0 !important;
    flex: 1 1 auto;
    min-height: 0;
  }
  .booking-footer {
    padding-bottom: calc(0.625rem + env(safe-area-inset-bottom));
  }
}
.booking-menu-danger .p-menu-item-label,
.booking-menu-danger .p-menu-item-icon {
  color: #dc2626 !important;
}
</style>
