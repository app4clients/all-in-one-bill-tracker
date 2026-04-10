import { google } from "googleapis";

const ACTIVE_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
]);

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isEntitlementActive(subscriptionState, expiresAt, isRefunded) {
  if (isRefunded) {
    return false;
  }
  if (!ACTIVE_STATES.has(subscriptionState)) {
    return false;
  }
  if (!expiresAt) {
    return true;
  }
  return expiresAt.getTime() > Date.now();
}

export async function getAndroidPublisherClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const authClient = await auth.getClient();
  return google.androidpublisher({ version: "v3", auth: authClient });
}

export async function verifySubscriptionToken({ packageName, purchaseToken, expectedProductIds }) {
  const androidpublisher = await getAndroidPublisherClient();

  const { data } = await androidpublisher.purchases.subscriptionsv2.get({
    packageName,
    token: purchaseToken,
  });

  const lineItem = data.lineItems?.[0];
  const productId = lineItem?.productId ?? "";
  const latestOrderId = data.latestOrderId ?? null;
  const subscriptionState = data.subscriptionState ?? "SUBSCRIPTION_STATE_UNSPECIFIED";
  const expiryTime = parseDate(lineItem?.expiryTime ?? null);
  const startTime = parseDate(data.startTime ?? null);
  const acknowledged = data.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
  const isAutoRenewing = Boolean(lineItem?.autoRenewingPlan?.autoRenewEnabled);

  const cancellationContext = data.canceledStateContext;
  const isRefunded = Boolean(cancellationContext?.systemInitiatedCancellation);

  if (!productId || !expectedProductIds.includes(productId)) {
    throw new Error("Product ID does not match allowed subscription products.");
  }

  const entitlementActive = isEntitlementActive(subscriptionState, expiryTime, isRefunded);

  return {
    entitlementActive,
    subscriptionState,
    productId,
    latestOrderId,
    purchaseToken,
    acknowledged,
    isAutoRenewing,
    isRefunded,
    startTime,
    expiryTime,
    basePlanId: lineItem?.autoRenewingPlan?.basePlanId ?? null,
    offerId: lineItem?.offerDetails?.offerId ?? null,
    rawPayload: data,
  };
}
