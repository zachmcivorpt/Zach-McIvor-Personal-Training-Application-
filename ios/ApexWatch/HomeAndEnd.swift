import SwiftUI
import WatchKit

// The home screen when no workout runs, and End workout (#307, owner-approved
// glass mock-ups). Every figure is the member's own: heart rate and resting
// heart rate from Apple Health on the Watch, today's session and this week's
// count from the phone (`store.home`). Nothing is shown that isn't known.

struct HomeView: View {
    @EnvironmentObject var store: WorkoutStore
    @EnvironmentObject var health: WorkoutSessionManager

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text("APEX")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(measureBlue)

                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 15))
                        .foregroundColor(measureBlue)
                    Text(health.latestHeartRate.map { "\(Int($0.rounded()))" } ?? "–")
                        .font(.system(size: 40, weight: .semibold).monospacedDigit())
                    Text("BPM")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
                .accessibilityElement(children: .combine)
                if let resting = health.restingHeartRate {
                    Text("Resting \(Int(resting.rounded()))")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .padding(.bottom, 2)
                }

                if let today = store.home?.today {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("TODAY")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.secondary)
                        Text(today.label)
                            .font(.system(size: 15, weight: .semibold))
                            .lineLimit(2)
                        Text(today.done ? "Done" : "\(today.exercises) exercise\(today.exercises == 1 ? "" : "s")")
                            .font(.system(size: 12))
                            .foregroundColor(today.done ? measureBlue : .secondary)
                    }
                    .glassBox()
                }

                if let week = store.home?.week, week.target > 0 || week.done > 0 {
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("THIS WEEK")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.secondary)
                            Text(week.target > 0 ? "\(week.done) of \(week.target)" : "\(week.done)")
                                .font(.system(size: 15, weight: .semibold).monospacedDigit())
                        }
                        Spacer(minLength: 4)
                        WeekDots(done: week.done, total: max(week.target, week.done))
                    }
                    .glassBox()
                }

                Text(store.home == nil
                     ? "Start your workout in the APEX app on your iPhone. It shows here to log your sets."
                     : "Start a workout on your iPhone to log it here.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .padding(.top, 2)
            }
            .padding(.horizontal, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .glassScreen()
        .onAppear {
            health.refreshHealthStats()
            store.refresh()
        }
    }
}

struct WeekDots: View {
    let done: Int
    let total: Int

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<min(total, 7), id: \.self) { i in
                if i < done {
                    Circle().fill(measureBlue).frame(width: 8, height: 8)
                        .shadow(color: measureBlue.opacity(0.8), radius: 3)
                } else {
                    Circle().stroke(Color.white.opacity(0.3), lineWidth: 1.5).frame(width: 8, height: 8)
                }
            }
        }
        .accessibilityLabel("\(done) of \(total) sessions")
    }
}

/// Complete / Save for later / Cancel workout. Cancel asks first.
struct EndWorkoutView: View {
    @EnvironmentObject var store: WorkoutStore
    @EnvironmentObject var health: WorkoutSessionManager
    @State private var confirmCancel = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                if confirmCancel {
                    Text("Cancel this workout?")
                        .font(.system(size: 16, weight: .semibold))
                    Text(store.loggedSetCount() > 0
                         ? "The \(store.loggedSetCount()) set\(store.loggedSetCount() == 1 ? "" : "s") you've logged won't be saved."
                         : "Nothing from this workout will be saved.")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .padding(.bottom, 4)
                    Button("CANCEL WORKOUT") { store.endWorkout("discardWorkout") }
                        .buttonStyle(GlassButtonStyle(kind: .red))
                    Button("KEEP GOING") { confirmCancel = false }
                        .buttonStyle(GlassButtonStyle())
                } else {
                    Text("End workout")
                        .font(.system(size: 16, weight: .semibold))
                    Text(summary)
                        .font(.system(size: 12).monospacedDigit())
                        .foregroundColor(.secondary)
                        .padding(.bottom, 4)
                    Button("COMPLETE") { store.endWorkout("finishWorkout") }
                        .buttonStyle(GlassButtonStyle(kind: .blue))
                    Button("SAVE FOR LATER") { store.endWorkout("saveForLater") }
                        .buttonStyle(GlassButtonStyle())
                    Button("CANCEL WORKOUT") { confirmCancel = true }
                        .buttonStyle(GlassButtonStyle(kind: .redText))
                }
            }
            .padding(.horizontal, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .glassScreen()
    }

    private var summary: String {
        let sets = store.loggedSetCount()
        var parts = ["\(sets) set\(sets == 1 ? "" : "s")"]
        if let start = health.startDate {
            parts.append("\(max(0, Int(Date().timeIntervalSince(start) / 60))) min")
        }
        return parts.joined(separator: " · ")
    }
}
