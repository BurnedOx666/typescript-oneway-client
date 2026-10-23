"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnepayException = void 0;
exports.decodeWebhookPayload = decodeWebhookPayload;
const axios_1 = __importDefault(require("axios"));
const jwt = __importStar(require("jsonwebtoken"));
const crypto_js_1 = require("crypto-js");
class OnepayException extends Error {
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = "OnepayException";
        // Keeps `err instanceof OnepayException` working when a consumer compiles
        // this package down to ES5.
        Object.setPrototypeOf(this, OnepayException.prototype);
    }
}
exports.OnepayException = OnepayException;
function isOnepayResponse(value) {
    return (typeof value === "object" &&
        value !== null &&
        "status" in value &&
        "code" in value);
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
function decodeWebhookPayload(payload, secret) {
    let decoded;
    try {
        decoded = jwt.verify(payload, secret, { algorithms: ["HS256"] });
    }
    catch (err) {
        throw new OnepayException(400, "Invalid webhook signature", { cause: err });
    }
    if (typeof decoded !== "object" || decoded === null) {
        throw new OnepayException(400, "Invalid webhook payload");
    }
    return decoded;
}
// ── Client ─────────────────────────────────────────────────
class OnepayClient {
    /**
     * @param domain    Base URL of the OnePay API, e.g. `https://api.example.com`.
     * @param apiKey    Public key, sent as `X-ACCESS-KEY`.
     * @param secretKey Private key, used to sign each request.
     * @param timeout   Per-request timeout in **milliseconds**. Defaults to 30s.
     */
    constructor(domain, apiKey, secretKey, timeout = 30000) {
        this.domain = domain;
        this.apiKey = apiKey;
        this.secretKey = secretKey;
        this.timeout = timeout;
        this.http = axios_1.default.create({
            baseURL: this.domain,
            timeout: this.timeout,
            headers: {
                "Content-Type": "application/json",
                "X-ACCESS-KEY": this.apiKey,
            },
        });
        this.http.interceptors.request.use((config) => {
            const time = Date.now().toString();
            const token = crypto_js_1.enc.Base64.stringify((0, crypto_js_1.HmacSHA256)(time, this.secretKey));
            config.headers.set("X-ACCESS-TOKEN", `${time}:${token}`);
            return config;
        });
        this.http.interceptors.response.use((res) => {
            if (!isOnepayResponse(res.data)) {
                throw new OnepayException(500, "No data received from OnePay API");
            }
            else if (res.data.status !== "success") {
                throw new OnepayException(res.data.code, res.data.msg || "Unknown error");
            }
            else {
                return res;
            }
        }, (error) => {
            const response = error.response;
            if (isOnepayResponse(response?.data)) {
                throw new OnepayException(response.data.code, response.data.msg || "Unknown error", { cause: error });
            }
            // A response that is not the OnePay envelope — a gateway error page, a
            // proxy timeout, an HTML 5xx. Report the transport status rather than
            // reading `code`/`msg` off a body that has neither.
            if (response) {
                throw new OnepayException(response.status, `Unexpected response from OnePay API (HTTP ${response.status})`, { cause: error });
            }
            // No response at all: DNS failure, connection refused, client timeout,
            // aborted request. `error.message` is the only thing that says which.
            throw new OnepayException(500, `Failed to reach OnePay API: ${error.message}`, { cause: error });
        });
    }
    // ── Contacts ───────────────────────────────────────────────
    async createContact(data) {
        const res = await this.http.post("/v1/contacts", { ...data });
        return res.data.data.contact_id;
    }
    async updateContact(contactId, data) {
        const payload = {};
        if (typeof data.name === "string")
            payload.name = data.name;
        if (typeof data.phone === "string")
            payload.phone = data.phone;
        if (typeof data.email === "string")
            payload.email = data.email;
        if (typeof data.street === "string")
            payload.street = data.street;
        if (typeof data.city === "string")
            payload.city = data.city;
        if (typeof data.state === "string")
            payload.state = data.state;
        if (typeof data.zip_code === "string")
            payload.zip_code = data.zip_code;
        if (typeof data.country === "string")
            payload.country = data.country;
        await this.http.put(`/v1/contacts/${contactId}`, payload);
    }
    // ── Providers & Payment Methods ────────────────────────────
    /** Either `ip` or `countryCode` must be supplied. */
    async getProviders(ip, countryCode) {
        const res = await this.http.get("/v1/payments/providers", {
            params: {
                ip,
                country_code: countryCode,
            },
        });
        return res.data.data;
    }
    /** Either `ip` or `countryCode` must be supplied. */
    async getPaymentMethods(ip, countryCode) {
        const res = await this.http.get("/v1/payments/methods", {
            params: {
                ip,
                country_code: countryCode,
            },
        });
        return res.data.data;
    }
    // ── Payments ───────────────────────────────────────────────
    async createPayment(data) {
        const res = await this.http.post("/v1/payments/intent", { ...data });
        return res.data.data;
    }
    async getPayment(paymentId) {
        const res = await this.http.get(`/v1/payments/intent/${paymentId}`);
        return res.data.data;
    }
    async capturePayment(data) {
        const res = await this.http.post("/v1/payments/capture", { ...data });
        return res.data.data;
    }
    async refundPayment(data) {
        const res = await this.http.post("/v1/payments/refund", { ...data });
        return res.data.data;
    }
    /** Stop a recurring subscription: a Xendit plan or a Coda schedule. */
    async deactivateSubscription(data) {
        const res = await this.http.post("/v1/payments/subscription/plan/deactivate", { ...data });
        return res.data.data;
    }
}
exports.default = OnepayClient;
//# sourceMappingURL=main.js.map