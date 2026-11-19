import Foundation
import HealthKit

// The Apple Health workout the Watch records while a workout runs on the
// iPhone (REGRESSION_TESTS.md #262): a strength-training HKWorkoutSession
// with a live builder. It gives live heart rate, keeps the APEX Watch app on
// screen (and running with the wrist down), and on Finish saves the workout
// to Apple Health so it counts toward the Activity rings.
//
// It follows the phone's workout only (WorkoutStore): starts when a workout
// arrives, ends when the phone says it's over — saved after Finish, thrown
// away after Discard. Nothing here touches the APEX workout log.
final class WorkoutSessionManager: NSObject, ObservableObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    static let shared = WorkoutSessionManager()

    // A session the phone never ended (it crashed, the Watch lost it) still stops.
    static let maxDuration: TimeInterval = 4 * 60 * 60

    let healthStore = HKHealthStore()

    @Published private(set) var heartRate: Double?
    @Published private(set) var startDate: Date?
    @Published private(set) var running = false

    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private(set) var apexSessionId: String?
    private var saveOnEnd = true
    private var capTimer: Timer?

    static func configuration() -> HKWorkoutConfiguration {
        let c = HKWorkoutConfiguration()
        c.activityType = .traditionalStrengthTraining
        c.locationType = .indoor
        return c
    }

    private var shareTypes: Set<HKSampleType> {
        var set: Set<HKSampleType> = [HKObjectType.workoutType()]
        if let t = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) { set.insert(t) }
        if let t = HKQuantityType.quantityType(forIdentifier: .heartRate) { set.insert(t) }
        return set
    }

    private var readTypes: Set<HKObjectType> {
        var set: Set<HKObjectType> = []
        if let t = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) { set.insert(t) }
        if let t = HKQuantityType.quantityType(forIdentifier: .heartRate) { set.insert(t) }
        if let t = HKQuantityType.quantityType(forIdentifier: .restingHeartRate) { set.insert(t) }
        return set
    }

    // MARK: home screen (#307)

    /// The Watch's latest heart rate (last hour) and resting heart rate (last
    /// week) from Apple Health, for the home screen when no workout runs.
    @Published private(set) var latestHeartRate: Double?
    @Published private(set) var restingHeartRate: Double?

    func refreshHealthStats() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        healthStore.requestAuthorization(toShare: shareTypes, read: readTypes) { _, _ in
            self.latest(.heartRate, within: 3600) { self.latestHeartRate = $0 }
            self.latest(.restingHeartRate, within: 7 * 86400) { self.restingHeartRate = $0 }
        }
    }

    private func latest(_ id: HKQuantityTypeIdentifier, within seconds: TimeInterval, _ done: @escaping (Double?) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return }
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let since = HKQuery.predicateForSamples(withStart: Date().addingTimeInterval(-seconds), end: nil, options: [])
        let query = HKSampleQuery(sampleType: type, predicate: since, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
            let value = (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            DispatchQueue.main.async { done(value) }
        }
        healthStore.execute(query)
    }

    // MARK: start / end

    /// Starts recording for the phone's workout, once. A session already
    /// running (e.g. started by the phone through startWatchApp) is adopted.
    func start(apexSessionId id: String?, configuration: HKWorkoutConfiguration = WorkoutSessionManager.configuration()) {
        if session != nil {
            if apexSessionId == nil { apexSessionId = id }
            return
        }
        guard HKHealthStore.isHealthDataAvailable() else { return }
        healthStore.requestAuthorization(toShare: shareTypes, read: readTypes) { ok, _ in
            guard ok else { return }
            DispatchQueue.main.async { self.begin(apexSessionId: id, configuration: configuration) }
        }
    }

    private func begin(apexSessionId id: String?, configuration: HKWorkoutConfiguration) {
        guard session == nil else { return }
        do {
            let s = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
            attach(s, b, apexSessionId: id)
            let now = Date()
            s.startActivity(with: now)
            b.beginCollection(withStart: now) { _, _ in }
            startDate = now
        } catch {
            return
        }
    }

    /// A session the system kept running after the Watch app was relaunched.
    func recover() {
        healthStore.recoverActiveWorkoutSession { recovered, _ in
            guard let s = recovered else { return }
            DispatchQueue.main.async {
                guard self.session == nil else { return }
                let b = s.associatedWorkoutBuilder()
                self.attach(s, b, apexSessionId: nil)
                self.startDate = b.startDate ?? s.startDate ?? Date()
            }
        }
    }

    private func attach(_ s: HKWorkoutSession, _ b: HKLiveWorkoutBuilder, apexSessionId id: String?) {
        s.delegate = self
        b.delegate = self
        session = s
        builder = b
        apexSessionId = id
        saveOnEnd = true
        running = true
        capTimer?.invalidate()
        capTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            guard let self = self, let start = self.startDate else { return }
            if Date().timeIntervalSince(start) > WorkoutSessionManager.maxDuration { self.end(save: true) }
        }
    }

    /// The phone's workout is over: save it to Apple Health (Finish) or
    /// throw it away (Discard).
    func end(save: Bool) {
        guard let s = session else { return }
        saveOnEnd = save
        if s.state == .ended || s.state == .stopped {
            finish(at: Date())
        } else {
            s.end()
        }
    }

    private func finish(at date: Date) {
        guard let b = builder else { reset(); return }
        // Under a minute is a stray start (an old copy of a workout), not training.
        let save = saveOnEnd && (startDate.map { date.timeIntervalSince($0) >= 60 } ?? true)
        b.endCollection(withEnd: date) { _, _ in
            if save {
                b.finishWorkout { _, _ in DispatchQueue.main.async { self.reset() } }
            } else {
                b.discardWorkout()
                DispatchQueue.main.async { self.reset() }
            }
        }
    }

    private func reset() {
        capTimer?.invalidate()
        capTimer = nil
        session = nil
        builder = nil
        apexSessionId = nil
        running = false
        heartRate = nil
        startDate = nil
    }

    // MARK: HKWorkoutSessionDelegate

    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        guard toState == .ended else { return }
        DispatchQueue.main.async {
            guard workoutSession === self.session else { return }
            self.finish(at: date)
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async {
            guard workoutSession === self.session else { return }
            self.end(save: true)
        }
    }

    // MARK: HKLiveWorkoutBuilderDelegate

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate),
              collectedTypes.contains(hrType),
              let value = workoutBuilder.statistics(for: hrType)?.mostRecentQuantity()?
                .doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        else { return }
        DispatchQueue.main.async { self.heartRate = value }
    }
}
