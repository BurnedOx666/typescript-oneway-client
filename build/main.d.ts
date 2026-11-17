export type ProviderSlug = "stripe" | "razorpay" | "billdesk" | "xendit" | "razergold";
export type PaymentMethodType = "upi" | "card" | "netbanking" | "wallet";
export type PaymentStatus = "created" | "pending" | "received" | "success" | "failed" | "processing" | "refunded" | "cancelled";
export type SubscriptionStatus = "active" | "inactive";
export type CaptureMode = "manual" | "automatic";
export type RefundSpeed = "normal" | "optimum";
export type RecurringInterval = "DAY" | "WEEK" | "MONTH";
export interface OnepayResponse<T = any> {
    status: string;
    code: number;
    msg: string;
    data: T;
}
export declare class OnepayException extends Error {
    readonly code: number;
    constructor(code: number, message: string, options?: {
        cause?: unknown;
    });
}
export interface ContactPayload {
    name?: string;
    phone?: string;
    email?: string;
    street?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    country?: string;
}
export interface RecurringConfig {
    interval?: RecurringInterval;
    interval_count?: number;
    total_recurrence?: number;
}
export interface PaymentPayload {
    contact_id: string;
    provider: ProviderSlug;
    amount: number;
    currency: string;
    return_url: string;
    /** Client IP address. IPv4 and IPv6 are both accepted. */
    ip: string;
    user_agent: string;
    payment_method?: PaymentMethodType;
    /** ISO 3166-1 alpha-2, uppercase. Resolved from `ip` when omitted. */
    country_code?: string;
    meta_data?: Record<string, any> | null;
    /** Defaults to `"automatic"` server-side. */
    capture_mode?: CaptureMode;
    /** Minutes to hold an authorization before it expires. 12–7200, defaults to 2880. */
    capture_expiry_period?: number;
    /** Defaults to `"normal"` server-side. */
    refund_speed?: RefundSpeed;
    /** When set, the payment is created as a recurring subscription. */
    recurring_conf?: RecurringConfig;
}
export interface CapturePaymentPayload {
    payment_id: string;
    amount?: number;
}
export interface RefundPaymentPayload {
    payment_id: string;
    amount?: number;
    speed?: RefundSpeed;
}
export interface DeactivateSubscriptionPayload {
    payment_id: string;
}
export interface PaymentIntent {
    id: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    invoice_number: string | null;
    trx_id: string | null;
    amount: number;
    currency: string;
    return_url: string | null;
    payment_method: string | null;
    status: PaymentStatus;
    renew_id: string | null;
    plan_id: string | null;
    subscription_status: SubscriptionStatus | null;
    next_billing_date: string | null;
    provider_id: string;
    contact_id: string;
    merchant_id: string;
    ip: string | null;
    user_agent: string | null;
    meta_data: Record<string, any> | null;
    payment_intent: Record<string, any> | null;
    logs: Record<string, any> | null;
}
export interface PaymentLink {
    payment_id: string;
    link: string;
    recurring: boolean;
    payment_intent: PaymentIntent;
}
/** Payment method as nested inside a `PaymentProvider`. */
export interface PaymentMethodInfo {
    slug: PaymentMethodType;
    logo: string | null;
}
/** Payment method as returned by `getPaymentMethods()`. */
export interface PaymentMethod {
    id: string;
    created_at: string;
    method: PaymentMethodType;
    logo: string | null;
    config: Record<string, any> | null;
    provider: ProviderSlug;
}
export interface PaymentProvider {
    id: string;
    name: string;
    slug: ProviderSlug;
    logo: string | null;
    description: string | null;
    is_recommended: boolean;
    payment_methods: PaymentMethodInfo[];
}
export interface SuccessResult {
    success: boolean;
}
/**
 * Verify and decode a webhook delivery.
 *
 * OnePay posts `{ "payload": "<jwt>" }`, where the JWT is the payment record
 * signed with the webhook's secret using HS256.
 *
 * @param payload The `payload` string from the webhook body.
 * @param secret  The webhook secret from the OnePay dashboard.
 */
export declare function decodeWebhookPayload(payload: string, secret: string): PaymentIntent;
export default class OnepayClient {
    private readonly domain;
    private readonly apiKey;
    private readonly secretKey;
    private readonly timeout;
    private readonly http;
    /**
     * @param domain    Base URL of the OnePay API, e.g. `https://api.example.com`.
     * @param apiKey    Public key, sent as `X-ACCESS-KEY`.
     * @param secretKey Private key, used to sign each request.
     * @param timeout   Per-request timeout in **milliseconds**. Defaults to 30s.
     */
    constructor(domain: string, apiKey: string, secretKey: string, timeout?: number);
    createContact(data: ContactPayload): Promise<string>;
    updateContact(contactId: string, data: ContactPayload): Promise<void>;
    /** Either `ip` or `countryCode` must be supplied. */
    getProviders(ip?: string, countryCode?: string): Promise<PaymentProvider[]>;
    /** Either `ip` or `countryCode` must be supplied. */
    getPaymentMethods(ip?: string, countryCode?: string): Promise<PaymentMethod[]>;
    createPayment(data: PaymentPayload): Promise<PaymentLink>;
    getPayment(paymentId: string): Promise<PaymentIntent>;
    capturePayment(data: CapturePaymentPayload): Promise<SuccessResult>;
    refundPayment(data: RefundPaymentPayload): Promise<SuccessResult>;
    deactivateSubscription(data: DeactivateSubscriptionPayload): Promise<Record<string, any>>;
}
