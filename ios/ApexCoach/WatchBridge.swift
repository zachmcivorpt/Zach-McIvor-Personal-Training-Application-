import Foundation
import WatchConnectivity
import WebKit
import HealthKit

// Apple Watch workout logging (REGRESSION_TESTS.md #189).
//
// The workout lives on the phone's web page (src/lib/watchBridge.js); this
// bridge only carries it between the page and the Watch app (ios/ApexWatch):
//
//   page  → here : apexWatch.postMessage({ action: "workout", workout })
//                  { action: "clear", reason } — no workout running
//                  ("finished" | "discarded", passed to the Watch so its
//                  Apple Health workout is saved or thrown away, #262)
//                  { action: "ack", id } — a Watch action was applied
//   here  → Watch: WCSession application context ["workout": JSON string]
//   Watch → here : sendMessage / transferUserInfo ["action": JSON string]
//   here  → page : window "apexWatch" CustomEvent
//
// Watch actions are kept (UserDefaults) until the page acks them: the phone
// may be locked with the page asleep, or the page reloading. They are sent
// again whenever the page posts a workout or the app comes back to the
// front; the page drops repeats by id. A "clear" drops them (that workout
// is over).
final class WatchBridge: NSObject, WCSessionDelegate {
    static let shared = WatchBridge()

    weak var webView: WKWebView?

    private let pendingKey = "apexWatchPendingActions"
    private let contextKey = "apexWatchLastWorkout"
    private var pageHasWorkout = false

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    // MARK: page → Watch

    func handle(_ body: [String: Any]) {
        switch (body["action"] as? String) ?? "" {
        case "workout":
            guard let workout = body["workout"],
                  JSONSerialization.isValidJSONObject(workout),
                  let data = try? JSONSerialization.data(withJSONObject: workout),
                  let json = String(data: data, encoding: .utf8)
            else { return }
            pageHasWorkout = true
            UserDefaults.standard.set(json, forKey: contextKey)
            pushContext(json)
            deliverPending()
            launchWatchWorkout(sessionId: (workout as? [String: Any])?["sessionId"] as? String)
        case "clear":
            pageHasWorkout = false
            UserDefaults.standard.removeObject(forKey: contextKey)
            UserDefaults.standard.removeObject(forKey: pendingKey)
            UserDefaults.standard.removeObject(forKey: launchedKey)
            pushContext(nil, ended: body["reason"] as? String)
        case "ack":
            guard let id = body["id"] as? String else { return }
            var pending = loadPending()
            pending.removeAll { ($0["id"] as? String) == id }
            savePending(pending)
        default:
            return
        }
    }

    // The page was (re)loaded or the app came back to the front: it may
    // have missed actions while asleep.
    func pageMayHaveMissedActions() {
        if pageHasWorkout { deliverPending() }
    }

    func webViewReplaced() {
        pageHasWorkout = false
    }

    // A workout started on the phone opens the APEX Watch app with an Apple
    // Health workout running (#262) — once per workout, only with the Watch
    // app installed. The Watch also starts one itself when the workout arrives.
    private let launchedKey = "apexWatchLaunchedSession"
    private lazy var healthStore = HKHealthStore()

    private func launchWatchWorkout(sessionId: String?) {
        guard let id = sessionId, HKHealthStore.isHealthDataAvailable(), WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        guard UserDefaults.standard.string(forKey: launchedKey) != id else { return }
        UserDefaults.standard.set(id, forKey: launchedKey)
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        healthStore.startWatchApp(with: config) { _, _ in }
    }

    private func pushContext(_ json: String?, ended: String? = nil) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        var context: [String: Any] = ["sentAt": Date().timeIntervalSince1970]
        if let json = json { context["workout"] = json }
        if json == nil, let ended = ended { context["ended"] = ended }
        try? session.updateApplicationContext(context)
        // Live too when the Watch app is open, so a logged set shows at once.
        if session.isReachable {
            session.sendMessage(context, replyHandler: nil, errorHandler: nil)
        }
    }

    // MARK: Watch → page

    private func receive(_ payload: [String: Any]) {
        guard let json = payload["action"] as? String,
              let data = json.data(using: .utf8),
              let action = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let type = action["type"] as? String
        else { return }
        DispatchQueue.main.async {
            if type == "requestState" {
                self.pushContext(UserDefaults.standard.string(forKey: self.contextKey))
                return
            }
            guard action["id"] is String else { return }
            var pending = self.loadPending()
            if !pending.contains(where: { ($0["id"] as? String) == (action["id"] as? String) }) {
                pending.append(action)
                // A runaway queue never grows without bound.
                if pending.count > 300 { pending.removeFirst(pending.count - 300) }
                self.savePending(pending)
            }
            self.dispatch(action)
        }
    }

    private func deliverPending() {
        for action in loadPending() { dispatch(action) }
    }

    private func dispatch(_ action: [String: Any]) {
        guard let webView = webView,
              let data = try? JSONSerialization.data(withJSONObject: action),
              let json = String(data: data, encoding: .utf8)
        else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('apexWatch',{detail:\(json)}));true", completionHandler: nil)
    }

    private func loadPending() -> [[String: Any]] {
        guard let data = UserDefaults.standard.data(forKey: pendingKey),
              let list = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
        else { return [] }
        return list
    }

    private func savePending(_ list: [[String: Any]]) {
        if list.isEmpty {
            UserDefaults.standard.removeObject(forKey: pendingKey)
        } else if let data = try? JSONSerialization.data(withJSONObject: list) {
            UserDefaults.standard.set(data, forKey: pendingKey)
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        guard activationState == .activated else { return }
        DispatchQueue.main.async {
            self.pushContext(UserDefaults.standard.string(forKey: self.contextKey))
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // Switched to another Watch: start talking to the new one.
        WCSession.default.activate()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        receive(message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        receive(message)
        replyHandler(["ok": true])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        receive(userInfo)
    }
}
