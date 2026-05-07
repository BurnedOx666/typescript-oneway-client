# onepay_client

TypeScript SDK for the OnePay Payments API. Provides a fully-typed client for managing contacts, creating payments, handling captures/refunds, managing subscriptions, and verifying webhooks.

## Installation

```bash
npm install git+https://github.com/BurnedOx/typescript-oneway-client.git

# or

yarn add git+https://github.com/BurnedOx/typescript-oneway-client.git
```

## Quick Start

```typescript
import OnepayClient from "onepay_client";

const client = new OnepayClient(
  "https://api.yourdomain.com", // domain
  "YOUR_PUBLIC_KEY",            // apiKey
  "YOUR_PRIVATE_KEY",           // secretKey
);
```

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

```typescript
// Full capture
await client.capturePayment({ payment_id: "..." });

// Partial capture
await client.capturePayment({ payment_id: "...", amount: 200.0 });
```

### Refund a Payment

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

When OnePay sends a webhook to your server, the payload is a JWT signed with your webhook secret. Use `decodeWebhookPayload` to verify and decode it.

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

## Error Handling

All API errors throw `OnepayException` with `code` and `message` properties.

```typescript
import { OnepayException } from "onepay_client";

try {
  await client.getPayment("invalid-id");
} catch (err) {
  if (err instanceof OnepayException) {
    console.error(`Error ${err.code}: ${err.message}`);
  }
}
```

## Exported Types

| Type | Description |
|---|---|
| `OnepayClient` | Main SDK client (default export) |
| `PaymentIntent` | Full payment record returned by `getPayment()` and webhook decode |
| `PaymentLink` | Result of `createPayment()` — contains `payment_id`, `link`, and the intent |
| `PaymentPayload` | Input type for `createPayment()` |
| `CapturePaymentPayload` | Input type for `capturePayment()` |
| `RefundPaymentPayload` | Input type for `refundPayment()` |
| `DeactivateSubscriptionPayload` | Input type for `deactivateSubscription()` |
| `PaymentProvider` | Provider object from `getProviders()` |
| `PaymentMethodInfo` | Payment method nested inside a provider (slug + logo) |
| `ContactPayload` | Input type for `createContact()` / `updateContact()` |
| `OnepayResponse` | Raw API response wrapper |
| `OnepayException` | Error thrown on API failures |
| `decodeWebhookPayload` | Standalone function to verify & decode webhook JWTs |

## License

MIT
