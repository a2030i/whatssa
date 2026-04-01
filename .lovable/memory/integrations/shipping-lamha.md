---
name: Lamha Shipping Integration
description: Full Lamha v2 API integration for shipping management with webhook support
type: feature
---

## Lamha API v2
- Base URL: `https://app.lamha.sa/api/v2`
- Auth: `X-LAMHA-TOKEN` header (token from store_integrations.metadata.api_token)
- Rate Limit: 60 req/min

## Edge Functions

### lamha-create-shipment
- Creates order in Lamha via `POST /create-order`
- Supports `create_shippment: true/false` flag
- Sets `callback_url` to lamha-webhook for auto status updates
- Maps payment_method to Lamha format (cod/paid)
- Stores lamha_order_id in shipment_events metadata

### lamha-bulk-create
- Sends up to 50 orders at once
- Sequential processing with 1s delay (rate limiting)
- Skips already-sent orders
- Returns per-order results (success/failed/skipped)

### lamha-label
- Fetches shipping label PDF via `GET /label-shipment/{order_id}`
- Resolves lamha_order_id from shipment_events if not provided
- Returns PDF as base64 for frontend display/download

### lamha-webhook
- Receives Lamha status callbacks (POST)
- Verifies HMAC SHA-256 via X-Lamha-Store-Token header
- Resolves order by lamha_order_id from shipment_events
- Updates order status and sends WhatsApp notifications
- Payload: `{ success, msg, status_id, order_id, status_name }`

### lamha-sync-status
- Polling fallback via `GET /show-order/{order_id}`
- Checks active shipments not in terminal state
- Resolves lamha_order_id from shipment_events metadata
- Used as cron backup if webhooks are missed

## Status Mapping (Lamha → System)
| Lamha Status | status_id | System shipment_status | Order status |
|---|---|---|---|
| جديد | 0 | new | - |
| معلق | 1 | pending | - |
| تم التنفيذ | 2 | fulfilled | - |
| جاهز للالتقاط | 3 | ready_for_pickup | - |
| ملغي | 5 | cancelled | cancelled |
| تم الالتقاط | 6 | picked_up | shipped |
| جاري الشحن | 7 | shipping | shipped |
| تم التوصيل | 8 | delivered | delivered |
| فشل التوصيل | 9 | delivery_failed | pending |
| مرتجع | 10 | returned | refunded |

## Integration Config (store_integrations.metadata)
```json
{
  "api_token": "Lamha_xxx",
  "carrier_id": "10",
  "default_weight": "0.5",
  "webhook_secret": "for HMAC verification",
  "shipper": {
    "name": "اسم المتجر",
    "phone": "+966...",
    "country": "SA",
    "city": "Riyadh",
    "district": "",
    "address_line1": "",
    "national_address": ""
  },
  "shipment_notifications": {
    "enabled": true,
    "channel_id": "uuid",
    "template_name": "shipment_update",
    "notify_statuses": ["picked_up","shipping","delivered","delivery_failed","returned"]
  }
}
```

## UI Status: Hidden (per user request)
