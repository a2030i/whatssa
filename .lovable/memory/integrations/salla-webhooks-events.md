---
name: Salla Webhook Integration
description: Updated Salla webhook handler supporting merchant dashboard events (2025+)
type: integration
---

## ⚠️ Important: Merchant vs Partners API Events

لوحة تاجر سلة (s.salla.sa) **لا توفر أحداث الطلبات المباشرة** مثل `order.created` أو `order.updated`.
هذه الأحداث متاحة فقط عبر **بوابة شركاء سلة** (Partners Dashboard).

### البديل للتجار
- استخدم حدث **"انشاء فاتورة طلب"** (`invoice.created`) كبديل لتتبع الطلبات الجديدة
- استخدم أحداث الشحنات لتتبع حالة التوصيل

## Merchant Dashboard Events (Available)

### السلات المتروكة
| الحدث في سلة | Event Name | الفائدة |
|---|---|---|
| انشاء سلة مشتريات متروكة | `abandoned.cart` | إرسال تذكير تلقائي للعميل |
| تم تحديث سلة مشتريات متروكة | `abandoned.cart.updated` | تتبع تغييرات السلة |
| شراء سلة متروكة | `abandoned.cart.purchased` | تتبع نجاح حملات الاسترداد |

### الشحنات
| الحدث في سلة | Event Name | الفائدة |
|---|---|---|
| طلب إنشاء شحنة | `shipment.creating` | إشعار العميل بالتجهيز |
| تم إنشاء شحنة | `shipment.created` | إرسال رقم التتبع |
| تم تحديث شحنة | `shipment.updated` | تحديثات حالة الشحن |
| تم إلغاء شحنة | `shipment.cancelled` | إشعار بإلغاء الشحنة |

### الفاتورة (بديل الطلبات)
| الحدث في سلة | Event Name | الفائدة |
|---|---|---|
| انشاء فاتورة طلب | `invoice.created` | ⭐ أفضل بديل لتأكيد الطلبات |

### العملاء
| الحدث في سلة | Event Name | الفائدة |
|---|---|---|
| تمت إضافة عميل | `customer.created` | رسالة ترحيب |
| تم تحديث بيانات عميل | `customer.updated` | مزامنة CRM |
| تسجيل دخول عميل | `customer.login` | تتبع نشاط |

### المنتجات
| الحدث في سلة | Event Name | الفائدة |
|---|---|---|
| تم إنشاء منتج | `product.created` | مزامنة كتالوج |
| تم تحديث بيانات منتج | `product.updated` | تحديث بيانات |
| تم حذف منتج | `product.deleted` | إلغاء تفعيل |
| تم تحديث سعر المنتج | `product.price.updated` | تحديث أسعار |
| المنتج متاح | `product.available` | إشعار توفر |
| قرب نفاذ كمية منتج | `product.quantity.low` | تنبيه مخزون |

### أخرى
| الحدث في سلة | Event Name | الفائدة |
|---|---|---|
| تطبيق كوبون خصم | `coupon.applied` | تتبع استخدام |
| إضافة تقييم جديد | `review.added` | مراقبة تقييمات |

## Partners API Events (Not Available in Merchant Dashboard)
| Event | Handler |
|---|---|
| `order.created` | handleOrder |
| `order.updated` | handleOrder |
| `order.status.updated` | handleOrderStatus |
| `order.cancelled` | handleOrderCancelled |
| `order.refunded` | handleOrderRefunded |
| `order.deleted` | handleOrderDeleted |
| `order.payment.updated` | handleOrderPaymentUpdated |
| `order.products.updated` | handleOrderProductsUpdated |

## Notification Variables
- `{{customer_name}}`, `{{order_number}}`, `{{total}}`, `{{currency}}`
- `{{payment_method}}`, `{{payment_status}}`, `{{items_summary}}`
- `{{checkout_url}}` (uses `data.urls.checkout`)
- `{{tracking_number}}`, `{{shipping_company}}`, `{{status}}`
- `{{product_name}}`, `{{price}}`, `{{quantity}}`
- `{{coupon_code}}`, `{{rating}}`
