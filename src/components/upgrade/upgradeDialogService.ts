import type { PaidFeature } from '../../common';

type OpenUpgradeDialogFn = ((feature?: PaidFeature) => void) | null;

let openUpgradeDialogFn: OpenUpgradeDialogFn = null;

export const registerUpgradeDialog = (fn: OpenUpgradeDialogFn): void => {
  openUpgradeDialogFn = fn;
};

export const openUpgradeDialog = (feature?: PaidFeature): void => {
  if (openUpgradeDialogFn) {
    openUpgradeDialogFn(feature);
  }
};
