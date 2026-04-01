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

### lamha-carriers
- Fetches available carriers via `GET /carriers`
- Returns list with carrier_id, name, has_cancel, has_cod, has_parcel, has_international
- Used in UI for carrier selection before shipment creation

### lamha-create-shipment
- Supports 3 actions via `action` parameter:
  - `create-order`: Creates order in Lamha only (create_shippment=false, no carrier needed)
  - `create-order-shipment`: Creates order + shipment together (requires carrier_id)
  - `create-shipment`: Creates shipment for existing Lamha order via `POST /create-shipment` (requires carrier_id)
- Sets `callback_url` for auto status updates
- Maps payment_method to Lamha format (cod/paid)
- Stores lamha_order_id in shipment_events metadata

### lamha-bulk-create
- Sends up to 50 orders at once
- Sequential processing with 1s delay (rate limiting)
- Skips already-sent orders

### lamha-label
- Fetches shipping label PDF via `GET /label-shipment/{order_id}`
- Returns PDF as base64

### lamha-webhook
- Receives Lamha status callbacks (POST)
- Verifies HMAC SHA-256 via X-Lamha-Store-Token header
- Updates order status and sends WhatsApp notifications

### lamha-sync-status
- Polling fallback via `GET /show-order/{order_id}`

## API Flow
1. User selects carrier from dropdown (fetched via lamha-carriers)
2. Option A: Send order + shipment together → `create-order-shipment` with carrier_id
3. Option B: Create order only → `create-order` (no carrier), then later `create-shipment` with carrier

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

## UI Status: Visible in order detail dialog with carrier picker
