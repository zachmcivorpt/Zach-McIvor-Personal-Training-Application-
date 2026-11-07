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

    func logSet(_ exercise: WatchExercise, index: Int, reps: Double, weight: Double) {
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
        DispatchQueue.main.async {
            guard let json = json,
                  let data = json.data(using: .utf8),
                  let next = try? JSONDecoder().decode(WatchWorkout.self, from: data)
            else {
                if context["sentAt"] != nil {
                    // No workout running on the phone.
                    self.workout = nil
                    self.pending = [:]
                    self.restEndsAt = nil
                }
                return
            }
            if self.workout?.sessionId != next.sessionId { self.pending = [:] }
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
