// Service Worker for Push Notifications
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "رسالة جديدة";
  const options = {
    body: data.body || "لديك رسالة جديدة في صندوق الوارد",
    icon: "/placeholder.svg",
    badge: "/placeholder.svg",
    dir: "rtl",
    lang: "ar",
    tag: data.tag || "new-message",
    data: { url: data.url || "/inbox" },
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
