---
name: Salla Webhook Integration
description: Updated Salla webhook handler supporting all current Salla store events (2025+)
type: integration
---

## Supported Webhook Events (Updated 2026-04)

### Order Events
| Salla Event | Handler | Description |
|---|---|---|
| `order.created` | handleOrder | إنشاء طلب جديد |
| `order.updated` | handleOrder | تحديث بيانات الطلب |
| `order.status.updated` | handleOrderStatus | تغيير حالة الطلب |
| `order.cancelled` | handleOrderCancelled | إلغاء الطلب (حدث مستقل) |
| `order.refunded` | handleOrderRefunded | استرجاع الطلب (حدث مستقل) |
| `order.deleted` | handleOrderDeleted | حذف الطلب (soft delete) |
| `order.payment.updated` | handleOrderPaymentUpdated | تحديث حالة/طريقة الدفع |
| `order.products.updated` | handleOrderProductsUpdated | تحديث منتجات الطلب |
| `order.coupon.updated` | handleOrderFinancialUpdate | تحديث كوبون الطلب |
| `order.total.price.updated` | handleOrderFinancialUpdate | تحديث إجمالي السعر |

### Shipment Events
| Salla Event | Handler | Description |
|---|---|---|
| `order.shipment.creating` | handleShipmentCreated | بدء إنشاء شحنة |
| `order.shipment.created` | handleShipmentCreated | تم إنشاء الشحنة |
| `order.shipment.cancelled` | handleShipmentCancelled | إلغاء الشحنة |
| `order.shipment.return.creating` | handleShipmentReturn | بدء إرجاع شحنة |
| `order.shipment.return.created` | handleShipmentReturn | تم إنشاء طلب إرجاع |
| `order.shipment.return.cancelled` | handleShipmentReturn | إلغاء طلب إرجاع |
| `order.shipping.address.updated` | handleShippingAddressUpdated | تحديث عنوان الشحن |
| `shipment.creating/created/cancelled/updated` | mapped to order.shipment.* | أحداث الشحن القديمة |

### Other Events
| Salla Event | Handler |
|---|---|
| `customer.created/updated` | handleCustomer |
| `abandoned.cart` | handleAbandonedCart |
| `abandoned.cart.purchased` | handleCartPurchased |
| `product.created/updated/price.updated/status.updated/image.updated` | handleProduct |
| `product.deleted` | handleProductDeleted |

## Notification Variables
- `{{customer_name}}`, `{{order_number}}`, `{{total}}`, `{{currency}}`
- `{{payment_method}}`, `{{payment_status}}`, `{{items_summary}}`
- `{{checkout_url}}` (uses `data.urls.checkout` per deprecation notice)
- `{{tracking_number}}`, `{{shipping_company}}`, `{{status}}`

## Deprecation Notes (Salla May 2025)
- `data.checkout_url` and `data.rating_link` deprecated → use `data.urls.checkout` and `data.urls.rating`
