# onepay_client

TypeScript SDK for the OnePay Payments API. Provides a fully-typed client for managing contacts, creating payments, handling captures/refunds, managing subscriptions, and verifying webhooks.

Requires Node.js 16.9 or newer (`OnepayException` attaches the originating error via `Error.cause`).

## Installation

```bash
npm install git+https://github.com/BurnedOx666/typescript-oneway-client.git
```

```bash
yarn add git+https://github.com/BurnedOx666/typescript-oneway-client.git
```

To pin a release, append the tag:

```bash
npm install git+https://github.com/BurnedOx666/typescript-oneway-client.git#1.5.0
```

## Quick Start

```typescript
import OnepayClient from "onepay_client";

const client = new OnepayClient(
  "https://api.yourdomain.com", // domain
  "YOUR_PUBLIC_KEY",            // apiKey
  "YOUR_PRIVATE_KEY",           // secretKey
  30_000,                       // timeout in milliseconds (optional, default 30s)
);
```

Each request is signed automatically: the client sends `X-ACCESS-KEY` (your public key) and `X-ACCESS-TOKEN` (`<unix-ms>:<base64 HMAC-SHA256 of the timestamp>`). Tokens are valid for 5 minutes, so the machine running the SDK needs a reasonably accurate clock.

## Usage

### Contacts

```typescript
// Create a contact
const contactId = await client.createContact({
  name: "John Doe",
  email: "john@example.com",
  phone: "+919876543210",
  country: "IN",
});

// Update a contact
await client.updateContact(contactId, {
  name: "John D.",
  city: "Mumbai",
});
```

### Providers & Payment Methods

Both calls need either an `ip` or a `countryCode` — the API resolves the country from the IP when only the IP is given.

```typescript
// Get available payment providers for a region
const providers = await client.getProviders(undefined, "IN");

for (const provider of providers) {
  console.log(`${provider.name} (${provider.slug})`);
  for (const pm of provider.payment_methods) {
    console.log(`  - ${pm.slug}`);
  }
}

// Get available payment methods
const methods = await client.getPaymentMethods(undefined, "IN");

for (const method of methods) {
  console.log(`${method.method} via ${method.provider}`);
}
```

### Create a Payment

```typescript
const result = await client.createPayment({
  contact_id: contactId,
  provider: "razorpay",
  amount: 499.0,
  currency: "INR",
  return_url: "https://yourdomain.com/payment/callback",
  ip: "103.21.58.1",
  user_agent: "Mozilla/5.0...",
  payment_method: "upi",             // optional
  capture_mode: "automatic",          // optional: "manual" | "automatic"
  meta_data: { order_id: "ORD123" },  // optional
});

console.log(result.payment_id); // Internal payment ID
console.log(result.link);       // Redirect the user here to complete payment
```

`ip` accepts both IPv4 and IPv6 addresses.

Optional fields and their server-side defaults:

| Field | Default | Notes |
|---|---|---|
| `country_code` | resolved from `ip` | ISO 3166-1 alpha-2, uppercase |
| `capture_mode` | `"automatic"` | `"manual"` requires a provider that allows it |
| `capture_expiry_period` | `2880` | Minutes to hold an authorization; 12–7200 |
| `refund_speed` | `"normal"` | `"normal"` \| `"optimum"` |

### Create a Razer Gold Payment

With `provider: "razergold"` the payer completes the payment on Razer Gold's hosted page:
redirect the browser to `result.link` as a top-level navigation, not in an iframe. Without
`payment_method` the page is Razer's Payment Wall; with it, the payer goes straight to the
Razer channel configured for that method. Razer's page stays valid for 20 minutes, and a
retry is a new `createPayment` call, which returns a new `payment_id`. Razer Gold payments
are one-time only: `recurring_conf`, `capturePayment` and `refundPayment` are not available
for this provider.

```typescript
const result = await client.createPayment({
  contact_id: contactId,
  provider: "razergold",
  amount: 10.0,
  currency: "MYR",
  country_code: "MY",
  return_url: "https://yourdomain.com/payment/callback",
  ip: "103.21.58.1",
  user_agent: "Mozilla/5.0...",
});
```

### Create a Recurring / Subscription Payment

```typescript
const result = await client.createPayment({
  contact_id: contactId,
  provider: "xendit",
  amount: 99.0,
  currency: "USD",
  return_url: "https://yourdomain.com/subscription/callback",
  ip: "103.21.58.1",
  user_agent: "Mozilla/5.0...",
  recurring_conf: {
    interval: "MONTH",
    interval_count: 1,
    total_recurrence: 12,
  },
});

console.log(result.recurring); // true
```

### Get Payment Status

```typescript
const payment = await client.getPayment("...");

console.log(payment.status);
// "created" | "pending" | "received" | "success" | "failed" | "processing" | "refunded" | "cancelled"
```

### Capture a Payment (Manual Mode)

Only available for payments in `received` status, on providers that allow manual capture.

```typescript
// Full capture
await client.capturePayment({ payment_id: "..." });

// Partial capture
await client.capturePayment({ payment_id: "...", amount: 200.0 });
```

### Refund a Payment

Only available for payments in `success` status.

```typescript
// Full refund
await client.refundPayment({ payment_id: "..." });

// Partial refund with optimum speed
await client.refundPayment({
  payment_id: "...",
  amount: 100.0,
  speed: "optimum",
});
```

### Deactivate a Subscription

```typescript
await client.deactivateSubscription({ payment_id: "..." });
```

## Webhook Verification

When OnePay sends a webhook to your server, the body is `{ "payload": "<jwt>" }`, where the JWT is the payment record signed with your webhook secret using HS256. Use `decodeWebhookPayload` to verify and decode it.

```typescript
import { decodeWebhookPayload } from "onepay_client";

// In your webhook handler (e.g. Express / NestJS)
function handleWebhook(body: { payload: string }) {
  const webhookSecret = "YOUR_WEBHOOK_SECRET";
  const payment = decodeWebhookPayload(body.payload, webhookSecret);

  console.log(payment.id);     // Internal payment ID
  console.log(payment.status); // e.g. "success", "failed", "refunded"
  console.log(payment.amount);
}
```

An unverifiable payload throws `OnepayException` with code `400`.

## Error Handling

All failures throw `OnepayException`, which carries `code` and `message`.

```typescript
import { OnepayException } from "onepay_client";

try {
  await client.getPayment("invalid-id");
} catch (err) {
  if (err instanceof OnepayException) {
    console.error(`Error ${err.code}: ${err.message}`);
    console.error(err.cause); // underlying AxiosError, when there is one
  }
}
```

`code` is the OnePay error code when the API returned one. Otherwise it is the HTTP status for a non-OnePay response (a gateway or proxy error page), or `500` when the request never reached the API — a DNS failure, a refused connection, or a client timeout. In that last case `message` includes the transport-level reason.

## Exported Types

| Type | Description |
|---|---|
| `OnepayClient` | Main SDK client (default export) |
| `PaymentIntent` | Full payment record returned by `getPayment()` and webhook decode |
| `PaymentLink` | Result of `createPayment()` — contains `payment_id`, `link`, and the intent |
| `PaymentPayload` | Input type for `createPayment()` |
| `RecurringConfig` | `recurring_conf` block of `PaymentPayload` |
| `CapturePaymentPayload` | Input type for `capturePayment()` |
| `RefundPaymentPayload` | Input type for `refundPayment()` |
| `DeactivateSubscriptionPayload` | Input type for `deactivateSubscription()` |
| `PaymentProvider` | Provider object from `getProviders()` |
| `PaymentMethodInfo` | Payment method nested inside a provider (slug + logo) |
| `PaymentMethod` | Payment method returned by `getPaymentMethods()` |
| `ContactPayload` | Input type for `createContact()` / `updateContact()` |
| `SuccessResult` | `{ success: boolean }`, returned by capture and refund |
| `OnepayResponse` | Raw API response wrapper |
| `OnepayException` | Error thrown on API failures |
| `decodeWebhookPayload` | Standalone function to verify & decode webhook JWTs |

Union types are exported as well: `ProviderSlug`, `PaymentMethodType`, `PaymentStatus`, `SubscriptionStatus`, `CaptureMode`, `RefundSpeed`, `RecurringInterval`.

## Changelog

### 1.5.0

- `"razergold"` added to `ProviderSlug`, so `createPayment({ provider: "razergold" })` type-checks.

### 1.3.0

- **Fixed:** the `timeout` constructor argument was passed to axios as-is while being documented in seconds, so the default of `30` meant every request aborted after 30 **milliseconds**. `timeout` is now explicitly milliseconds and defaults to `30_000`. Callers already passing a millisecond value (e.g. `30000`) are unaffected.
- **Fixed:** a non-JSON error response (proxy or gateway error page) produced an `OnepayException` with an `undefined` code. The HTTP status is now reported instead.
- **Fixed:** network failures and client timeouts were reported as a bare `"No data received from OnePay API"`. The transport reason is now included in the message.
- **Security:** bumped `jsonwebtoken` to `^9.0.3`, which pulls in a `jws` release that fixes an improper HMAC signature verification advisory ([GHSA-869p-cjfg-cm3x](https://github.com/advisories/GHSA-869p-cjfg-cm3x)). This affects `decodeWebhookPayload`. Upgrading is recommended for anyone consuming webhooks.
- **Security:** bumped `axios` to `^1.19.0`, clearing a batch of prototype-pollution, SSRF and DoS advisories.
- `OnepayException` now sets `name` and carries the originating error on `cause`.
- `getPaymentMethods()` returns `PaymentMethod[]` instead of `any[]`.
- Exported the underlying union types, and `RecurringConfig` / `PaymentMethod` / `SuccessResult`.
- Documented that `ip` accepts IPv6, matching the API as of 2026-05-29.
- Build target raised to ES2020; minimum supported Node is 16.9.

## License

MIT
