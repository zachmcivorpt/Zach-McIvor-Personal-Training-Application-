import SwiftUI
import WatchKit

// APEX on Apple Watch (REGRESSION_TESTS.md #188): log the sets of the
// workout that's running in the APEX iPhone app. Black, one accent
// (MEASURE_BLUE), large figures — the app's own look.

let measureBlue = Color(red: 0x2F / 255.0, green: 0x8F / 255.0, blue: 0xFF / 255.0) // MEASURE_BLUE #2F8FFF

@main
struct ApexWatchApp: App {
    @StateObject private var store = WorkoutStore()

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                RootView()
            }
            .environmentObject(store)
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

    var body: some View {
        if let workout = store.workout {
            List {
                if store.restEndsAt != nil {
                    RestBanner()
                }
                ForEach(workout.exercises) { exercise in
                    NavigationLink(value: exercise.id) {
                        ExerciseRow(exercise: exercise)
                    }
                }
            }
            .navigationTitle(workout.label)
            .navigationDestination(for: String.self) { id in
                ExerciseView(exerciseId: id)
            }
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text("APEX")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(measureBlue)
                    Text("No workout running")
                        .font(.system(size: 20, weight: .semibold))
                    Text("Start your workout in the APEX app on your iPhone. It shows here to log your sets.")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                    Button("Check again") { store.refresh() }
                        .padding(.top, 6)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
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
                    .font(.system(size: 13, weight: .bold))
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
    }
}

struct ExerciseView: View {
    @EnvironmentObject var store: WorkoutStore
    let exerciseId: String

    var body: some View {
        if let exercise = store.workout?.exercises.first(where: { $0.id == exerciseId }) {
            List {
                if store.restEndsAt != nil {
                    RestBanner()
                }
                if !exercise.target.isEmpty {
                    Text(exercise.target)
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
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
                }
                Button {
                    store.addSet(exercise)
                } label: {
                    Label("Add set", systemImage: "plus")
                }
            }
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
            Button {
                store.logSet(exercise, index: index, reps: reps.rounded(), weight: weight)
                dismiss()
            } label: {
                Text("LOG SET")
                    .font(.system(size: 15, weight: .bold))
                    .frame(maxWidth: .infinity)
            }
            .tint(measureBlue)
            .disabled(reps <= 0)
        }
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
