import SwiftUI
import WatchKit
import HealthKit

// APEX on Apple Watch (REGRESSION_TESTS.md #189): log the sets of the
// workout that's running in the APEX iPhone app. Frosted glass over the
// blurred gym photo (#307, Glass.swift), one accent (MEASURE_BLUE), large
// figures — the app's own look.

let measureBlue = Color(red: 0x2F / 255.0, green: 0x8F / 255.0, blue: 0xFF / 255.0) // MEASURE_BLUE #2F8FFF

// The iPhone starts the Watch app when a workout begins (HKHealthStore
// startWatchApp, WatchBridge.swift) and watchOS hands over the workout here;
// a session kept running after a relaunch is recovered (#262).
// WKExtensionDelegate (not WKApplicationDelegate, watchOS 9+) so the app
// runs on watchOS 8 — the last version for Series 3 (#305).
final class ApexWatchDelegate: NSObject, WKExtensionDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        WorkoutSessionManager.shared.start(apexSessionId: nil, configuration: workoutConfiguration)
    }

    func handleActiveWorkoutRecovery() {
        WorkoutSessionManager.shared.recover()
    }
}

@main
struct ApexWatchApp: App {
    @WKExtensionDelegateAdaptor(ApexWatchDelegate.self) private var delegate
    @StateObject private var store = WorkoutStore()
    @StateObject private var health = WorkoutSessionManager.shared

    var body: some Scene {
        WindowGroup {
            NavigationView {
                RootView()
            }
            .environmentObject(store)
            .environmentObject(health)
        }
    }
}

func formatNumber(_ value: Double?) -> String {
    guard let v = value else { return "–" }
    if v == v.rounded() { return String(Int(v)) }
    return String(format: "%.1f", v)
}

func setSummary(_ set: WatchSet, timed: Bool) -> String {
    let reps = formatNumber(set.reps) + (timed ? "s" : "")
    if let w = set.weight, w > 0 { return "\(formatNumber(w)) kg × \(reps)" }
    return timed ? reps : "\(reps) reps"
}

struct RootView: View {
    @EnvironmentObject var store: WorkoutStore
    @EnvironmentObject var health: WorkoutSessionManager

    var body: some View {
        if let workout = store.workout {
            List {
                if health.running {
                    LiveWorkoutRow()
                }
                if store.restEndsAt != nil {
                    RestBanner()
                }
                ForEach(workout.exercises) { exercise in
                    // NavigationLink(destination:), not value/navigationDestination
                    // (watchOS 9+): runs on watchOS 8 (#305).
                    NavigationLink {
                        ExerciseView(exerciseId: exercise.id)
                    } label: {
                        ExerciseRow(exercise: exercise)
                    }
                    .glassRow()
                }
                // Complete / Save for later / Cancel from the Watch (#307).
                NavigationLink {
                    EndWorkoutView()
                } label: {
                    Text("END WORKOUT")
                        .font(.system(size: 13, weight: .bold))
                        .frame(maxWidth: .infinity)
                }
                .listRowBackground(Capsule().fill(Color.white.opacity(0.1)).overlay(Capsule().stroke(Color.white.opacity(0.2), lineWidth: 0.5)))
            }
            .glassScreen()
            .navigationTitle(workout.label)
        } else {
            HomeView()
        }
    }
}

struct ExerciseRow: View {
    @EnvironmentObject var store: WorkoutStore
    let exercise: WatchExercise

    var body: some View {
        let done = store.doneCount(exercise)
        let total = exercise.sets.count
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(exercise.name)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(2)
                Text("\(done)/\(total) sets")
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }
            Spacer(minLength: 0)
            if total > 0 && done >= total {
                Image(systemName: "checkmark.circle.fill").foregroundColor(measureBlue)
            }
        }
        .padding(.vertical, 2)
    }
}

// Elapsed time and live heart rate from the Apple Health workout (#262).
// No calorie figure: every number APEX shows is measured, and the rings
// already show Apple's.
struct LiveWorkoutRow: View {
    @EnvironmentObject var health: WorkoutSessionManager

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let secs = max(0, Int(context.date.timeIntervalSince(health.startDate ?? context.date)))
            HStack(alignment: .firstTextBaseline) {
                Text(secs >= 3600
                     ? String(format: "%d:%02d:%02d", secs / 3600, (secs % 3600) / 60, secs % 60)
                     : String(format: "%d:%02d", secs / 60, secs % 60))
                    .font(.system(size: 28, weight: .semibold).monospacedDigit())
                Spacer()
                if let bpm = health.heartRate {
                    HeartRateLabel(bpm: bpm, size: 17)
                }
            }
        }
        .listRowBackground(Color.clear)
    }
}

struct HeartRateLabel: View {
    let bpm: Double
    let size: CGFloat

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "heart.fill")
                .font(.system(size: size * 0.8))
                .foregroundColor(measureBlue)
            Text("\(Int(bpm.rounded()))")
                .font(.system(size: size, weight: .semibold).monospacedDigit())
        }
        .accessibilityLabel("Heart rate \(Int(bpm.rounded())) beats per minute")
    }
}

struct RestBanner: View {
    @EnvironmentObject var store: WorkoutStore
    @State private var alerted = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = max(0, Int(((store.restEndsAt ?? context.date).timeIntervalSince(context.date)).rounded(.up)))
            HStack {
                VStack(alignment: .leading, spacing: 0) {
                    Text("REST")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(measureBlue)
                    Text(String(format: "%d:%02d", left / 60, left % 60))
                        .font(.system(size: 32, weight: .semibold).monospacedDigit())
                }
                Spacer()
                Button("Skip") { store.skipRest() }
                    .buttonStyle(GlassButtonStyle())
                    .frame(width: 60)
            }
            .onChange(of: left) { value in
                if value == 0 && !alerted {
                    alerted = true
                    WKInterfaceDevice.current().play(.notification)
                }
            }
        }
        .onChange(of: store.restEndsAt) { _ in alerted = false }
        .glassRow()
    }
}

struct ExerciseView: View {
    @EnvironmentObject var store: WorkoutStore
    @EnvironmentObject var health: WorkoutSessionManager
    let exerciseId: String

    var body: some View {
        if let exercise = store.workout?.exercises.first(where: { $0.id == exerciseId }) {
            List {
                if store.restEndsAt != nil {
                    RestBanner()
                }
                if !exercise.target.isEmpty || health.heartRate != nil {
                    HStack {
                        Text(exercise.target)
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                        Spacer()
                        if let bpm = health.heartRate {
                            HeartRateLabel(bpm: bpm, size: 13)
                        }
                    }
                    .listRowBackground(Color.clear)
                }
                ForEach(exercise.sets) { raw in
                    let set = store.display(exercise, raw)
                    NavigationLink {
                        SetEntryView(exercise: exercise, index: set.index)
                    } label: {
                        HStack {
                            Text("Set \(set.index + 1)")
                                .font(.system(size: 15, weight: .semibold))
                            Spacer()
                            if set.done {
                                Text(setSummary(set, timed: exercise.timed))
                                    .font(.system(size: 14).monospacedDigit())
                                if set.pr {
                                    Image(systemName: "trophy.fill").foregroundColor(measureBlue)
                                } else {
                                    Image(systemName: "checkmark").foregroundColor(measureBlue)
                                }
                            } else if set.prevReps != nil {
                                Text("Last " + setSummary(WatchSet(index: set.index, reps: set.prevReps, weight: set.prevWeight, done: true, pr: false, prevReps: nil, prevWeight: nil), timed: exercise.timed))
                                    .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    .glassRow()
                }
                Button {
                    store.addSet(exercise)
                } label: {
                    Label("Add set", systemImage: "plus")
                }
                .glassRow()
            }
            .glassScreen()
            .navigationTitle(exercise.name)
        } else {
            Text("This exercise is no longer in the workout.")
                .foregroundColor(.secondary)
        }
    }
}

struct SetEntryView: View {
    @EnvironmentObject var store: WorkoutStore
    @Environment(\.dismiss) private var dismiss
    let exercise: WatchExercise
    let index: Int

    enum Field { case reps, weight }
    @FocusState private var focus: Field?
    @State private var reps: Double = 0
    @State private var weight: Double = 0
    @State private var loaded = false

    private var repStep: Double { exercise.timed ? 5 : 1 }

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                valueBox(title: exercise.timed ? "SEC" : "REPS", value: formatNumber(reps), field: .reps)
                    .focusable(true)
                    .focused($focus, equals: .reps)
                    .digitalCrownRotation($reps, from: 0, through: 999, by: repStep, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                valueBox(title: "KG", value: formatNumber(weight), field: .weight)
                    .focusable(true)
                    .focused($focus, equals: .weight)
                    .digitalCrownRotation($weight, from: 0, through: 1000, by: 2.5, sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
            }
            Text("Turn the Crown to change")
                .font(.system(size: 11))
                .foregroundColor(.secondary)
            Button("LOG SET") {
                store.logSet(exercise, index: index, reps: reps.rounded(), weight: weight)
                dismiss()
            }
            .buttonStyle(GlassButtonStyle(kind: .blue))
            .disabled(reps <= 0)
            .opacity(reps <= 0 ? 0.5 : 1)
        }
        .glassScreen()
        .navigationTitle("Set \(index + 1)")
        .onAppear(perform: loadStartingValues)
    }

    private func valueBox(title: String, value: String, field: Field) -> some View {
        VStack(spacing: 0) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(focus == field ? measureBlue : .secondary)
            Text(value)
                .font(.system(size: 34, weight: .semibold).monospacedDigit())
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.09)))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(focus == field ? measureBlue : Color.white.opacity(0.2), lineWidth: focus == field ? 2 : 1)
        )
        .contentShape(Rectangle())
        .onTapGesture { focus = field }
    }

    // What they did this set (if logged), else last time's numbers, else the
    // set before it in this workout, else the target reps.
    private func loadStartingValues() {
        guard !loaded else { return }
        loaded = true
        let sets = exercise.sets.map { store.display(exercise, $0) }
        if let set = sets.first(where: { $0.index == index }) {
            if set.done {
                reps = set.reps ?? 0
                weight = set.weight ?? 0
            } else if let pr = set.prevReps {
                reps = pr
                weight = set.prevWeight ?? 0
            } else if let before = sets.last(where: { $0.index < index && $0.done }) {
                reps = before.reps ?? 0
                weight = before.weight ?? 0
            } else {
                reps = Double(exercise.target.split(separator: " ").compactMap { Double($0) }.dropFirst().first ?? 0)
            }
        }
        focus = .reps
    }
}
