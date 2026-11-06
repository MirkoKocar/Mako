importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: "AIzaSyBi9t1TN8fAsbvtxY9wqy3ywa_Ir37D9IY",
  authDomain: "fixhub-2edf6.firebaseapp.com",
  projectId: "fixhub-2edf6",
  storageBucket: "fixhub-2edf6.firebasestorage.app",
  messagingSenderId: "303318214890",
  appId: "1:303318214890:web:f324c659ae5fbf81a1cf93"
})

const messaging = firebase.messaging()

// Notificaciones cuando la app está en background/cerrada
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {}
  self.registration.showNotification(title || 'MAKO', {
    body: body || 'Tenés una notificación nueva.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data,
    vibrate: [200, 100, 200],
  })
})

// Al tocar la notificación, abrir la app
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        clientList[0].focus()
      } else {
        clients.openWindow('/')
      }
    })
  )
})
