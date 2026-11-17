import axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import * as jwt from "jsonwebtoken";
import { enc, HmacSHA256 } from "crypto-js";

// ── Enums ──────────────────────────────────────────────────

export type ProviderSlug = "stripe" | "razorpay" | "billdesk" | "xendit" | "razergold";

export type PaymentMethodType = "upi" | "card" | "netbanking" | "wallet";

export type PaymentStatus =
  | "created"
  | "pending"
  | "received"
  | "success"
  | "failed"
  | "processing"
  | "refunded"
  | "cancelled";

export type SubscriptionStatus = "active" | "inactive";

export type CaptureMode = "manual" | "automatic";

export type RefundSpeed = "normal" | "optimum";

export type RecurringInterval = "DAY" | "WEEK" | "MONTH";

// ── Envelope & errors ──────────────────────────────────────

export interface OnepayResponse<T = any> {
  status: string;
  code: number;
  msg: string;
  data: T;
}

export class OnepayException extends Error {
  public readonly code: number;

  constructor(code: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = "OnepayException";
    // Keeps `err instanceof OnepayException` working when a consumer compiles
    // this package down to ES5.
    Object.setPrototypeOf(this, OnepayException.prototype);
  }
}

function isOnepayResponse(value: unknown): value is OnepayResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "code" in value
  );
}

// ── Payloads ───────────────────────────────────────────────

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

// ── Resources ──────────────────────────────────────────────

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

// ── Webhooks ───────────────────────────────────────────────

/**
 * Verify and decode a webhook delivery.
 *
 * OnePay posts `{ "payload": "<jwt>" }`, where the JWT is the payment record
 * signed with the webhook's secret using HS256.
 *
 * @param payload The `payload` string from the webhook body.
 * @param secret  The webhook secret from the OnePay dashboard.
 */
export function decodeWebhookPayload(
  payload: string,
  secret: string
): PaymentIntent {
  let decoded: unknown;

  try {
    decoded = jwt.verify(payload, secret, { algorithms: ["HS256"] });
  } catch (err) {
    throw new OnepayException(400, "Invalid webhook signature", { cause: err });
  }

  if (typeof decoded !== "object" || decoded === null) {
    throw new OnepayException(400, "Invalid webhook payload");
  }

  return decoded as PaymentIntent;
}

// ── Client ─────────────────────────────────────────────────

export default class OnepayClient {
  private readonly http: AxiosInstance;

  /**
   * @param domain    Base URL of the OnePay API, e.g. `https://api.example.com`.
   * @param apiKey    Public key, sent as `X-ACCESS-KEY`.
   * @param secretKey Private key, used to sign each request.
   * @param timeout   Per-request timeout in **milliseconds**. Defaults to 30s.
   */
  constructor(
    private readonly domain: string,
    private readonly apiKey: string,
    private readonly secretKey: string,
    private readonly timeout: number = 30_000
  ) {
    this.http = axios.create({
      baseURL: this.domain,
      timeout: this.timeout,
      headers: {
        "Content-Type": "application/json",
        "X-ACCESS-KEY": this.apiKey,
      },
    });

    this.http.interceptors.request.use((config) => {
      const time = Date.now().toString();
      const token = enc.Base64.stringify(HmacSHA256(time, this.secretKey));
      config.headers.set("X-ACCESS-TOKEN", `${time}:${token}`);
      return config;
    });

    this.http.interceptors.response.use(
      (res: AxiosResponse<OnepayResponse>) => {
        if (!isOnepayResponse(res.data)) {
          throw new OnepayException(500, "No data received from OnePay API");
        } else if (res.data.status !== "success") {
          throw new OnepayException(
            res.data.code,
            res.data.msg || "Unknown error"
          );
        } else {
          return res;
        }
      },
      (error: AxiosError<OnepayResponse>) => {
        const response = error.response;

        if (isOnepayResponse(response?.data)) {
          throw new OnepayException(
            response!.data.code,
            response!.data.msg || "Unknown error",
            { cause: error }
          );
        }

        // A response that is not the OnePay envelope — a gateway error page, a
        // proxy timeout, an HTML 5xx. Report the transport status rather than
        // reading `code`/`msg` off a body that has neither.
        if (response) {
          throw new OnepayException(
            response.status,
            `Unexpected response from OnePay API (HTTP ${response.status})`,
            { cause: error }
          );
        }

        // No response at all: DNS failure, connection refused, client timeout,
        // aborted request. `error.message` is the only thing that says which.
        throw new OnepayException(
          500,
          `Failed to reach OnePay API: ${error.message}`,
          { cause: error }
        );
      }
    );
  }

  // ── Contacts ───────────────────────────────────────────────

  public async createContact(data: ContactPayload): Promise<string> {
    const res = await this.http.post<OnepayResponse<{ contact_id: string }>>(
      "/v1/contacts",
      { ...data }
    );
    return res.data.data.contact_id;
  }

  public async updateContact(
    contactId: string,
    data: ContactPayload
  ): Promise<void> {
    const payload: ContactPayload = {};

    if (typeof data.name === "string") payload.name = data.name;
    if (typeof data.phone === "string") payload.phone = data.phone;
    if (typeof data.email === "string") payload.email = data.email;
    if (typeof data.street === "string") payload.street = data.street;
    if (typeof data.city === "string") payload.city = data.city;
    if (typeof data.state === "string") payload.state = data.state;
    if (typeof data.zip_code === "string") payload.zip_code = data.zip_code;
    if (typeof data.country === "string") payload.country = data.country;

    await this.http.put(`/v1/contacts/${contactId}`, payload);
  }

  // ── Providers & Payment Methods ────────────────────────────

  /** Either `ip` or `countryCode` must be supplied. */
  public async getProviders(
    ip?: string,
    countryCode?: string
  ): Promise<PaymentProvider[]> {
    const res = await this.http.get<OnepayResponse<PaymentProvider[]>>(
      "/v1/payments/providers",
      {
        params: {
          ip,
          country_code: countryCode,
        },
      }
    );
    return res.data.data;
  }

  /** Either `ip` or `countryCode` must be supplied. */
  public async getPaymentMethods(
    ip?: string,
    countryCode?: string
  ): Promise<PaymentMethod[]> {
    const res = await this.http.get<OnepayResponse<PaymentMethod[]>>(
      "/v1/payments/methods",
      {
        params: {
          ip,
          country_code: countryCode,
        },
      }
    );
    return res.data.data;
  }

  // ── Payments ───────────────────────────────────────────────

  public async createPayment(data: PaymentPayload): Promise<PaymentLink> {
    const res = await this.http.post<OnepayResponse<PaymentLink>>(
      "/v1/payments/intent",
      { ...data }
    );
    return res.data.data;
  }

  public async getPayment(paymentId: string): Promise<PaymentIntent> {
    const res = await this.http.get<OnepayResponse<PaymentIntent>>(
      `/v1/payments/intent/${paymentId}`
    );
    return res.data.data;
  }

  public async capturePayment(
    data: CapturePaymentPayload
  ): Promise<SuccessResult> {
    const res = await this.http.post<OnepayResponse<SuccessResult>>(
      "/v1/payments/capture",
      { ...data }
    );
    return res.data.data;
  }

  public async refundPayment(
    data: RefundPaymentPayload
  ): Promise<SuccessResult> {
    const res = await this.http.post<OnepayResponse<SuccessResult>>(
      "/v1/payments/refund",
      { ...data }
    );
    return res.data.data;
  }

  public async deactivateSubscription(
    data: DeactivateSubscriptionPayload
  ): Promise<Record<string, any>> {
    const res = await this.http.post<OnepayResponse<Record<string, any>>>(
      "/v1/payments/subscription/plan/deactivate",
      { ...data }
    );
    return res.data.data;
  }
}
