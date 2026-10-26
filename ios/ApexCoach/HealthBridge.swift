import Foundation
import HealthKit
import WebKit

// Apple Health for the web app, which has no HealthKit of its own. The page
// posts window.webkit.messageHandlers.apexHealth.postMessage({ id, action })
// (src/lib/appleHealth.js) and gets its answer back through
// window.__apexNativeHealth.receive({ id, result | error }).
//
// Read-only: steps, sleep, resting heart rate and body weight, summarised
// per calendar day. Nothing is ever written to Apple Health. iOS never says
// whether read access was granted (a "no" just looks like an empty Health
// app), so a denied permission simply comes back as no data.
final class HealthBridge {
    weak var webView: WKWebView?
    private let store = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        if let t = HKObjectType.quantityType(forIdentifier: .stepCount) { types.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .restingHeartRate) { types.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .bodyMass) { types.insert(t) }
        if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(t) }
        return types
    }

    func handle(_ body: [String: Any]) {
        guard let id = body["id"] as? String, let action = body["action"] as? String else { return }
        guard HKHealthStore.isHealthDataAvailable() else {
            reply(id, error: "Apple Health isn't available on this device.")
            return
        }
        switch action {
        case "authorize":
            store.requestAuthorization(toShare: nil, read: readTypes) { ok, error in
                if let error = error {
                    self.reply(id, error: error.localizedDescription)
                } else {
                    self.reply(id, result: ["ok": ok])
                }
            }
        case "read":
            let days = min(max((body["days"] as? Int) ?? 7, 1), 30)
            readDays(days) { self.reply(id, result: ["days": $0]) }
        default:
            reply(id, error: "Unknown Apple Health request.")
        }
    }

    private let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    // One entry per local calendar day (yyyy-MM-dd, the web app's own
    // localDateKey format) that has anything: steps totalled, resting heart
    // rate averaged, the day's last weight, and sleep for the night that
    // ENDED that morning.
    private func readDays(_ days: Int, completion: @escaping ([[String: Any]]) -> Void) {
        let calendar = Calendar.current
        let now = Date()
        let start = calendar.date(byAdding: .day, value: -(days - 1), to: calendar.startOfDay(for: now))!
        let group = DispatchGroup()

        var steps: [String: Double] = [:]
        var restingHR: [String: Double] = [:]
        var weight: [String: Double] = [:]
        var sleep: [String: Double] = [:]

        func daily(_ id: HKQuantityTypeIdentifier, _ options: HKStatisticsOptions, _ unit: HKUnit, into apply: @escaping (String, HKStatistics) -> Void) {
            guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return }
            group.enter()
            let query = HKStatisticsCollectionQuery(
                quantityType: type,
                quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: now, options: .strictStartDate),
                options: options,
                anchorDate: start,
                intervalComponents: DateComponents(day: 1)
            )
            query.initialResultsHandler = { _, results, _ in
                results?.enumerateStatistics(from: start, to: now) { stats, _ in
                    apply(self.dayFormatter.string(from: stats.startDate), stats)
                }
                group.leave()
            }
            store.execute(query)
        }

        daily(.stepCount, .cumulativeSum, .count()) { key, s in
            if let q = s.sumQuantity() { steps[key] = q.doubleValue(for: .count()) }
        }
        let bpm = HKUnit.count().unitDivided(by: .minute())
        daily(.restingHeartRate, .discreteAverage, bpm) { key, s in
            if let q = s.averageQuantity() { restingHR[key] = q.doubleValue(for: bpm) }
        }
        let kg = HKUnit.gramUnit(with: .kilo)
        daily(.bodyMass, .discreteMostRecent, kg) { key, s in
            if let q = s.mostRecentQuantity() { weight[key] = q.doubleValue(for: kg) }
        }

        // Sleep: every "asleep" stage (unspecified 1, core 3, deep 4, REM 5;
        // not in-bed 0 or awake 2), with overlapping samples from more than
        // one source (iPhone + Apple Watch) merged so a night isn't counted
        // twice. A night belongs to the day it ends on.
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            let predicate = HKQuery.predicateForSamples(withStart: start.addingTimeInterval(-12 * 3600), end: now, options: [])
            let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                var byDay: [String: [(Date, Date)]] = [:]
                for case let s as HKCategorySample in samples ?? [] where [1, 3, 4, 5].contains(s.value) {
                    let key = self.dayFormatter.string(from: s.endDate)
                    byDay[key, default: []].append((s.startDate, s.endDate))
                }
                for (key, intervals) in byDay {
                    var total: TimeInterval = 0
                    var current: (Date, Date)?
                    for iv in intervals.sorted(by: { $0.0 < $1.0 }) {
                        if let c = current, iv.0 <= c.1 {
                            current = (c.0, max(c.1, iv.1))
                        } else {
                            if let c = current { total += c.1.timeIntervalSince(c.0) }
                            current = iv
                        }
                    }
                    if let c = current { total += c.1.timeIntervalSince(c.0) }
                    sleep[key] = total / 3600
                }
                group.leave()
            }
            store.execute(query)
        }

        group.notify(queue: .main) {
            var keys = Set(steps.keys).union(restingHR.keys).union(weight.keys).union(sleep.keys)
            keys = keys.filter { $0 >= self.dayFormatter.string(from: start) }
            let out: [[String: Any]] = keys.sorted().map { key in
                var day: [String: Any] = ["date": key]
                if let v = steps[key] { day["steps"] = v }
                if let v = sleep[key] { day["sleepHours"] = v }
                if let v = restingHR[key] { day["restingHeartRate"] = v }
                if let v = weight[key] { day["weightKg"] = v }
                return day
            }
            completion(out)
        }
    }

    private func reply(_ id: String, result: Any? = nil, error: String? = nil) {
        var payload: [String: Any] = ["id": id]
        if let error = error { payload["error"] = error } else { payload["result"] = result ?? NSNull() }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8)
        else { return }
        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript("window.__apexNativeHealth && window.__apexNativeHealth.receive(\(json));")
        }
    }
}
