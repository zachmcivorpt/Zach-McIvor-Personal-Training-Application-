import UIKit
import UserNotifications
import FirebaseCore
import FirebaseMessaging

extension Notification.Name {
    static let apexFCMToken = Notification.Name("apexFCMToken")
}

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Firebase needs GoogleService-Info.plist, which can't be generated
        // from here — it comes from the Firebase console and gets dropped
        // into this project by hand (see APNS_SETUP.txt). Guard on its
        // presence so every build before that step still launches exactly
        // as it does today, with push simply not wired up yet.
        guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
            return true
        }

        FirebaseApp.configure()
        Messaging.messaging().delegate = self

        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                application.registerForRemoteNotifications()
            }
        }

        return true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    // Hands the raw APNs token to Firebase, which turns it into an FCM
    // token (delivered below via MessagingDelegate) — the same kind of
    // token the web app's own enablePush() saves into fcmTokens, so the
    // existing onNewMessage/onNewCheckIn Cloud Functions need no changes
    // to start reaching this device too.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Push just won't be available this session — nothing else in the
        // app depends on it, so there's nothing to recover here.
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        NotificationCenter.default.post(name: .apexFCMToken, object: fcmToken)
    }

    // Foreground presentation while the app is open — mirrors what the
    // web app's listenForegroundPush()/in-app toast does on other builds.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }
}
