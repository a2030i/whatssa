// Service Worker for Web Push Notifications
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data?.text() || "إشعار جديد" };
  }

  const title = data.title || "رسالة جديدة";
  const options = {
    body: data.body || "لديك رسالة جديدة في صندوق الوارد",
    icon: "/placeholder.svg",
    badge: "/placeholder.svg",
    dir: "rtl",
    lang: "ar",
    tag: data.tag || "new-message",
    data: { url: data.url || "/inbox" },
    vibrate: [200, 100, 200],
    actions: [
      { action: "open", title: "فتح" },
      { action: "dismiss", title: "تجاهل" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/inbox";

  if (event.action === "dismiss") return;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
