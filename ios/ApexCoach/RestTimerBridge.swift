import Foundation
import UserNotifications

// The rest timer's lock-screen alert. The web app's timer can't run while
// the phone is locked, so when a rest starts the page asks for a local
// notification at the moment it ends (src/lib/restNotification.js):
//   window.webkit.messageHandlers.apexRest.postMessage({ action: "schedule", seconds, title, body })
//   window.webkit.messageHandlers.apexRest.postMessage({ action: "cancel" })
// Only one is ever pending — a new rest replaces it, Skip cancels it. While
// the app is open AppDelegate hides it, since the in-app timer already dings.
enum RestTimerBridge {
    static let identifier = "apex-rest-timer"

    static func handle(_ body: [String: Any]) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        guard (body["action"] as? String) == "schedule",
              let seconds = (body["seconds"] as? NSNumber)?.doubleValue,
              seconds >= 1, seconds <= 3600
        else { return }

        let content = UNMutableNotificationContent()
        content.title = (body["title"] as? String) ?? "Rest's up"
        content.body = (body["body"] as? String) ?? "Time for your next set."
        content.sound = .default

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
    }
}
