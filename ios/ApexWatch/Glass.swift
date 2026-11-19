import SwiftUI

// Frosted glass on the Watch (#307, owner-approved mock-up): the black-and-
// white gym photo, blurred, behind every screen; boxes and buttons are a
// translucent white fill with a hairline edge. watchOS 8 has no Material, so
// the photo is blurred ahead of time (Assets: Backdrop) and the glass is a
// plain see-through fill over it. One accent (MEASURE_BLUE); red only for
// Cancel workout.

struct GlassBackdrop: View {
    var body: some View {
        Image("Backdrop")
            .resizable()
            .scaledToFill()
            .overlay(LinearGradient(colors: [Color.black.opacity(0.1), Color.black.opacity(0.55)], startPoint: .top, endPoint: .bottom))
            .ignoresSafeArea()
    }
}

struct GlassShape: View {
    var cornerRadius: CGFloat = 12

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.white.opacity(0.09))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.18), lineWidth: 0.5)
            )
    }
}

extension View {
    /// A glass box around content (outside a List).
    func glassBox() -> some View {
        padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(GlassShape())
    }

    /// A glass row inside a List.
    func glassRow() -> some View {
        listRowBackground(GlassShape())
    }

    /// The blurred gym photo behind a screen.
    func glassScreen() -> some View {
        background(GlassBackdrop())
    }
}

let dangerRed = Color(red: 1.0, green: 0.27, blue: 0.23)

struct GlassButtonStyle: ButtonStyle {
    enum Kind { case glass, blue, red, redText }
    var kind: Kind = .glass

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(kind == .redText ? dangerRed : .white)
            .frame(maxWidth: .infinity, minHeight: 34)
            .background(
                Capsule().fill(fill).overlay(Capsule().stroke(edge, lineWidth: 0.5))
            )
            .shadow(color: kind == .blue ? measureBlue.opacity(0.45) : .clear, radius: 6)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }

    private var fill: Color {
        switch kind {
        case .blue: return measureBlue.opacity(0.85)
        case .red: return dangerRed.opacity(0.85)
        default: return Color.white.opacity(0.1)
        }
    }

    private var edge: Color {
        switch kind {
        case .blue: return Color(red: 0.63, green: 0.8, blue: 1).opacity(0.6)
        case .red: return Color(red: 1, green: 0.63, blue: 0.59).opacity(0.5)
        default: return Color.white.opacity(0.2)
        }
    }
}
