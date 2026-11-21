// A PrimeVue confirmation as a promise: true when accepted, false when
// declined or closed. `confirm` is useConfirm() of the calling screen.
export type Confirm = { require: (options: any) => void };

export const askConfirm = (confirm: Confirm, options: Record<string, unknown>): Promise<boolean> =>
  new Promise((resolve) => {
    confirm.require({
      ...options,
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    });
  });
