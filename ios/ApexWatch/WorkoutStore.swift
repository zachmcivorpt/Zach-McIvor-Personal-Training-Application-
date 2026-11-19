import Foundation
import WatchConnectivity
import WatchKit

// The Watch side of workout logging (REGRESSION_TESTS.md #189). The workout
// itself lives on the iPhone (the web page's WorkoutSession); this keeps the
// latest copy the phone sent and sends the Watch's actions back through
// ios/ApexCoach/WatchBridge.swift. A set logged here shows straight away
// (`pending`) and stays shown until the phone's copy has it, so a locked
// phone never makes a logged set look lost.

struct WatchSet: Codable, Identifiable {
    let index: Int
    var reps: Double?
    var weight: Double?
    var done: Bool
    var pr: Bool
    var prevReps: Double?
    var prevWeight: Double?
    var id: Int { index }
}

struct WatchExercise: Codable, Identifiable {
    let id: String
    let name: String
    let target: String
    let timed: Bool
    let restSeconds: Double
    var sets: [WatchSet]
}

struct WatchRest: Codable {
    let endsAt: Double // ms since 1970
    let total: Double
    let label: String
}

struct WatchWorkout: Codable {
    let sessionId: String
    let label: String
    var exercises: [WatchExercise]
    var rest: WatchRest?
}

// The home screen when no workout runs (#307): today's session and this
// week's count, from the phone (src/lib/watchHome.js).
struct WatchHomeToday: Codable {
    let label: String
    let exercises: Int
    let done: Bool
}

struct WatchHomeWeek: Codable {
    let done: Int
    let target: Int
}

struct WatchHome: Codable {
    let today: WatchHomeToday?
    let week: WatchHomeWeek?
}

struct PendingSet {
    let reps: Double
    let weight: Double
}

final class WorkoutStore: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var workout: WatchWorkout?
    @Published private(set) var pending: [String: PendingSet] = [:]
    @Published private(set) var restEndsAt: Date?
    @Published private(set) var restTotal: Double = 0
    @Published private(set) var phoneReachable = false
    @Published private(set) var home: WatchHome?

    // A workout ended here is not shown again if the phone re-sends it
    // before the end reaches it (asleep, locked) — for a minute (#307).
    private var endedSessionId: String?
    private var endedAt: Date?

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    static func key(_ exerciseId: String, _ index: Int) -> String { "\(exerciseId)#\(index)" }

    // The set as it should show: the phone's copy, or what was just logged here.
    func display(_ exercise: WatchExercise, _ set: WatchSet) -> WatchSet {
        guard let p = pending[WorkoutStore.key(exercise.id, set.index)] else { return set }
        var shown = set
        shown.reps = p.reps
        shown.weight = p.weight > 0 ? p.weight : nil
        shown.done = true
        return shown
    }

    func doneCount(_ exercise: WatchExercise) -> Int {
        exercise.sets.filter { display(exercise, $0).done }.count
    }

    // MARK: actions

    func logSet(_ exercise: WatchExercise, index: Int, reps: Double, weight rawWeight: Double) {
        // The Crown lands just off a step (49.9963 for 50, #306): snap to 0.25 kg.
        let weight = (rawWeight * 4).rounded() / 4
        pending[WorkoutStore.key(exercise.id, index)] = PendingSet(reps: reps, weight: weight)
        send(["type": "logSet", "exerciseId": exercise.id, "setIndex": index, "reps": Int(reps.rounded()), "weight": weight])
        WKInterfaceDevice.current().play(.success)
        if exercise.restSeconds > 0 {
            restEndsAt = Date().addingTimeInterval(exercise.restSeconds)
            restTotal = exercise.restSeconds
            send(["type": "startRest", "exerciseId": exercise.id])
        }
    }

    func addSet(_ exercise: WatchExercise) {
        guard var w = workout, let i = w.exercises.firstIndex(where: { $0.id == exercise.id }) else { return }
        // Shown at once; the phone's copy replaces it.
        let n = w.exercises[i].sets.count
        w.exercises[i].sets.append(WatchSet(index: n, reps: nil, weight: nil, done: false, pr: false, prevReps: nil, prevWeight: nil))
        workout = w
        send(["type": "addSet", "exerciseId": exercise.id])
    }

    /// End workout from the Watch (#307): "finishWorkout" (Complete),
    /// "saveForLater" or "discardWorkout". The phone does exactly what its
    /// own buttons do; the Watch goes back to its home screen at once.
    func endWorkout(_ type: String) {
        guard let w = workout else { return }
        send(["type": type])
        endedSessionId = w.sessionId
        endedAt = Date()
        WorkoutSessionManager.shared.end(save: type != "discardWorkout")
        workout = nil
        pending = [:]
        restEndsAt = nil
        WKInterfaceDevice.current().play(type == "discardWorkout" ? .directionDown : .success)
    }

    func loggedSetCount() -> Int {
        guard let w = workout else { return 0 }
        return w.exercises.reduce(0) { $0 + doneCount($1) }
    }

    func skipRest() {
        restEndsAt = nil
        send(["type": "skipRest"])
    }

    func refresh() {
        send(["type": "requestState"])
    }

    private func send(_ action: [String: Any]) {
        var body = action
        body["id"] = UUID().uuidString
        guard WCSession.isSupported(),
              WCSession.default.activationState == .activated,
              let data = try? JSONSerialization.data(withJSONObject: body),
              let json = String(data: data, encoding: .utf8)
        else { return }
        let payload: [String: Any] = ["action": json]
        let session = WCSession.default
        if session.isReachable {
            // Falls back to the queued transfer; the phone drops a repeat by id.
            session.sendMessage(payload, replyHandler: { _ in }, errorHandler: { _ in
                session.transferUserInfo(payload)
            })
        } else {
            session.transferUserInfo(payload)
        }
    }

    // MARK: phone → Watch

    private func apply(_ context: [String: Any]) {
        let json = context["workout"] as? String
        let homeJSON = context["home"] as? String
        DispatchQueue.main.async {
            if let h = homeJSON?.data(using: .utf8), let next = try? JSONDecoder().decode(WatchHome.self, from: h) {
                self.home = next
            }
            guard let json = json,
                  let data = json.data(using: .utf8),
                  let next = try? JSONDecoder().decode(WatchWorkout.self, from: data)
            else {
                if context["sentAt"] != nil {
                    // No workout running on the phone: end the Apple Health
                    // workout too — saved unless the phone discarded it (#262).
                    WorkoutSessionManager.shared.end(save: (context["ended"] as? String) != "discarded")
                    self.workout = nil
                    self.pending = [:]
                    self.restEndsAt = nil
                }
                return
            }
            if let ended = self.endedSessionId, ended == next.sessionId,
               let at = self.endedAt, Date().timeIntervalSince(at) < 60 {
                return
            }
            if self.workout?.sessionId != next.sessionId { self.pending = [:] }
            // A workout is running on the phone: record it in Apple Health (#262).
            WorkoutSessionManager.shared.start(apexSessionId: next.sessionId)
            // A set the phone now has with these numbers no longer needs the local copy.
            for exercise in next.exercises {
                for set in exercise.sets where set.done {
                    let k = WorkoutStore.key(exercise.id, set.index)
                    if let p = self.pending[k], set.reps == p.reps { self.pending[k] = nil }
                }
            }
            self.workout = next
            if let rest = next.rest {
                let end = Date(timeIntervalSince1970: rest.endsAt / 1000)
                self.restEndsAt = end > Date() ? end : nil
                self.restTotal = rest.total
            } else {
                // Keep a rest started here whose startRest hasn't reached the phone yet.
                let localRestRunning = (self.restEndsAt?.timeIntervalSinceNow ?? 0) > 0
                if !(localRestRunning && !self.pending.isEmpty) { self.restEndsAt = nil }
            }
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { self.phoneReachable = session.isReachable }
        if !session.receivedApplicationContext.isEmpty { apply(session.receivedApplicationContext) }
        if activationState == .activated { refresh() }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.phoneReachable = session.isReachable }
        if session.isReachable { refresh() }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        apply(applicationContext)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        apply(message)
    }
}
