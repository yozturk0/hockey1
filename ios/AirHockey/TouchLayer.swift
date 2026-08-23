import SwiftUI
import UIKit

/// Raw multi-touch. SwiftUI gestures cannot track two fingers independently,
/// which the same-device two-player mode needs, so we drop to UIKit.
struct TouchLayer: UIViewRepresentable {
    /// (touchID, point in view, phase) — phase 0 began, 1 moved, 2 ended
    let onTouch: (Int, CGPoint, Int) -> Void

    func makeUIView(context: Context) -> RawTouchView {
        let v = RawTouchView()
        v.isMultipleTouchEnabled = true
        v.backgroundColor = .clear
        v.onTouch = onTouch
        return v
    }

    func updateUIView(_ uiView: RawTouchView, context: Context) {
        uiView.onTouch = onTouch
    }
}

final class RawTouchView: UIView {
    var onTouch: ((Int, CGPoint, Int) -> Void)?

    private func report(_ touches: Set<UITouch>, _ phase: Int) {
        for t in touches {
            onTouch?(ObjectIdentifier(t).hashValue, t.location(in: self), phase)
        }
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) { report(touches, 0) }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) { report(touches, 1) }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { report(touches, 2) }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { report(touches, 2) }
}

/// Maps between screen points and the 100x200 field, keeping the rink centred.
struct RinkLayout {
    let ox: CGFloat, oy: CGFloat, s: CGFloat

    init(size: CGSize) {
        let pad: CGFloat = 6
        let s = min((size.width - pad * 2) / CGFloat(Field.W),
                    (size.height - pad * 2) / CGFloat(Field.H))
        self.s = s
        self.ox = (size.width - CGFloat(Field.W) * s) / 2
        self.oy = (size.height - CGFloat(Field.H) * s) / 2
    }

    func px(_ x: Double) -> CGFloat { ox + CGFloat(x) * s }
    func py(_ y: Double) -> CGFloat { oy + CGFloat(y) * s }
    func len(_ v: Double) -> CGFloat { CGFloat(v) * s }
    func point(_ v: Vec) -> CGPoint { CGPoint(x: px(v.x), y: py(v.y)) }

    func field(_ p: CGPoint) -> Vec {
        Vec(x: Double((p.x - ox) / s), y: Double((p.y - oy) / s))
    }
}
