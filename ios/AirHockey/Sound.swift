import AVFoundation
import UIKit

/// Procedural audio: every clip is synthesised once at launch, so the app ships
/// with no audio assets and a hit never waits on disk.
final class Sound {
    static let shared = Sound()

    private let engine = AVAudioEngine()
    private var players: [AVAudioPlayerNode] = []
    private var next = 0
    private let format: AVAudioFormat
    private let rate: Double = 44100
    private var started = false

    private var hitBuffers: [AVAudioPCMBuffer] = []     // indexed by intensity bucket
    private var wallBuffers: [AVAudioPCMBuffer] = []
    private var goalWin: AVAudioPCMBuffer?
    private var goalLose: AVAudioPCMBuffer?
    private var overWin: AVAudioPCMBuffer?
    private var overLose: AVAudioPCMBuffer?
    private var countLow: AVAudioPCMBuffer?
    private var countHigh: AVAudioPCMBuffer?
    private var uiTap: AVAudioPCMBuffer?
    private var joinCue: AVAudioPCMBuffer?
    private var halfCue: AVAudioPCMBuffer?

    private let lightHaptic = UIImpactFeedbackGenerator(style: .light)
    private let heavyHaptic = UIImpactFeedbackGenerator(style: .heavy)
    private let notify = UINotificationFeedbackGenerator()

    var enabled = true

    private init() {
        format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!
        let mixer = engine.mainMixerNode
        for _ in 0..<10 {
            let p = AVAudioPlayerNode()
            engine.attach(p)
            engine.connect(p, to: mixer, format: format)
            players.append(p)
        }
        buildBuffers()
    }

    // MARK: - session

    func start() {
        guard !started else { return }
        do {
            let s = AVAudioSession.sharedInstance()
            // .ambient keeps the player's own music going; the game is not the
            // reason anyone opened their phone.
            try s.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
            try s.setActive(true)
            try engine.start()
            players.forEach { $0.play() }
            started = true
            lightHaptic.prepare(); heavyHaptic.prepare(); notify.prepare()
        } catch {
            started = false
        }
    }

    func stop() {
        guard started else { return }
        engine.pause()
        started = false
    }

    // MARK: - synthesis

    /// One decaying partial. `f0 -> f1` sweeps exponentially over the clip.
    private struct Partial {
        var f0: Double, f1: Double, dur: Double, gain: Double
        var wave: Wave = .sine, delay: Double = 0, cutoff: Double = 0
    }
    private enum Wave { case sine, triangle, square, noise }

    private func render(_ parts: [Partial]) -> AVAudioPCMBuffer {
        let total = parts.map { $0.delay + $0.dur }.max() ?? 0.2
        let frames = AVAudioFrameCount((total + 0.05) * rate)
        let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buf.frameLength = frames
        let L = buf.floatChannelData![0]
        let R = buf.floatChannelData![1]
        for i in 0..<Int(frames) { L[i] = 0; R[i] = 0 }

        var noiseState: Double = 0
        for p in parts {
            let start = Int(p.delay * rate)
            let count = Int(p.dur * rate)
            var phase: Double = 0
            // one-pole lowpass state, used when `cutoff` is set
            var lp: Double = 0
            let alpha = p.cutoff > 0 ? min(1, 2 * .pi * p.cutoff / rate) : 1
            for n in 0..<count {
                let idx = start + n
                if idx >= Int(frames) { break }
                let t = Double(n) / Double(count)
                // exponential frequency sweep
                let f = p.f0 * pow(max(p.f1, 20) / p.f0, t)
                phase += 2 * .pi * f / rate
                var v: Double
                switch p.wave {
                case .sine:     v = sin(phase)
                case .triangle: v = 2 / .pi * asin(sin(phase))
                case .square:   v = sin(phase) >= 0 ? 0.7 : -0.7
                case .noise:
                    noiseState = Double.random(in: -1...1)
                    v = noiseState
                }
                if p.cutoff > 0 { lp += alpha * (v - lp); v = lp }
                // fast attack, exponential decay
                let atk = min(1, Double(n) / (rate * 0.004))
                let env = atk * pow(1 - t, 2.2)
                let s = Float(v * env * p.gain)
                L[idx] += s
                R[idx] += s
            }
        }
        // soft clip so stacked partials never crackle
        for i in 0..<Int(frames) {
            L[i] = tanhf(L[i] * 1.1)
            R[i] = L[i]
        }
        return buf
    }

    private func buildBuffers() {
        // Puck vs paddle, in 8 intensity buckets from a tap to a full smash.
        for b in 0..<8 {
            let t = Double(b) / 7.0
            let base = 300 + t * 480
            hitBuffers.append(render([
                Partial(f0: base * 1.9, f1: base * 0.72, dur: 0.085 + t * 0.05,
                        gain: 0.20 + t * 0.20, wave: .triangle),
                Partial(f0: base * 0.55, f1: base * 0.30, dur: 0.12,
                        gain: 0.13 + t * 0.12, wave: .sine, cutoff: 1400),
                Partial(f0: 1700 + t * 2600, f1: 900, dur: 0.035,
                        gain: 0.10 + t * 0.14, wave: .noise, cutoff: 5200),
            ]))
        }
        for b in 0..<5 {
            let t = Double(b) / 4.0
            wallBuffers.append(render([
                Partial(f0: 190 + t * 150, f1: 90, dur: 0.075,
                        gain: 0.09 + t * 0.11, wave: .sine, cutoff: 900),
                Partial(f0: 700 + t * 800, f1: 400, dur: 0.03,
                        gain: 0.045 + t * 0.07, wave: .noise, cutoff: 2200),
            ]))
        }

        func arp(_ freqs: [Double], step: Double, dur: Double, gain: Double) -> [Partial] {
            freqs.enumerated().flatMap { i, f -> [Partial] in
                [Partial(f0: f, f1: f, dur: dur, gain: gain, wave: .triangle, delay: Double(i) * step),
                 Partial(f0: f / 2, f1: f / 2, dur: dur * 1.2, gain: gain * 0.45,
                         wave: .sine, delay: Double(i) * step)]
            }
        }

        goalWin  = render(arp([523.25, 659.25, 783.99, 1046.5], step: 0.075, dur: 0.19, gain: 0.24))
        goalLose = render(arp([440, 349.23, 293.66], step: 0.075, dur: 0.19, gain: 0.22))
        overWin  = render(arp([523.25, 659.25, 783.99, 1046.5, 1318.5], step: 0.13, dur: 0.34, gain: 0.20))
        overLose = render(arp([392, 349.23, 311.13, 261.63], step: 0.13, dur: 0.34, gain: 0.20))
        countLow  = render([Partial(f0: 560, f1: 560, dur: 0.10, gain: 0.15, wave: .square, cutoff: 2400)])
        countHigh = render([Partial(f0: 900, f1: 900, dur: 0.20, gain: 0.16, wave: .square, cutoff: 2400)])
        uiTap     = render([Partial(f0: 660, f1: 880, dur: 0.055, gain: 0.11, wave: .sine)])
        joinCue   = render(arp([587.33, 880], step: 0.09, dur: 0.16, gain: 0.18))
        // Half time: two short whistle blasts, unmistakably "stop and turn".
        halfCue   = render([0.0, 0.24].flatMap { d in
            [Partial(f0: 1180, f1: 1240, dur: 0.20, gain: 0.12, wave: .square,
                     delay: d, cutoff: 3000),
             Partial(f0: 1760, f1: 1820, dur: 0.20, gain: 0.07, wave: .sine, delay: d)]
        })
    }

    // MARK: - playback

    private func play(_ buf: AVAudioPCMBuffer?) {
        guard enabled, started, let buf else { return }
        let p = players[next]
        next = (next + 1) % players.count
        p.scheduleBuffer(buf, at: nil, options: .interrupts, completionHandler: nil)
    }

    func hit(_ speed: Double) {
        let t = min(1, max(0, speed / Field.puckMax))
        play(hitBuffers[min(7, Int(t * 7.999))])
        if t > 0.55 { heavyHaptic.impactOccurred(intensity: 0.9) }
        else { lightHaptic.impactOccurred(intensity: 0.5 + t * 0.4) }
    }

    func wall(_ speed: Double) {
        let t = min(1, max(0, speed / Field.puckMax))
        guard t > 0.06 else { return }
        play(wallBuffers[min(4, Int(t * 4.999))])
    }

    func goal(mine: Bool) {
        play(mine ? goalWin : goalLose)
        notify.notificationOccurred(mine ? .success : .warning)
    }

    /// Half time — the whistle plus a distinctive double buzz.
    func half() {
        play(halfCue)
        notify.notificationOccurred(.warning)
        heavyHaptic.impactOccurred(intensity: 0.9)
    }

    func over(win: Bool) {
        play(win ? overWin : overLose)
        notify.notificationOccurred(win ? .success : .error)
    }

    func count(_ n: Int) { play(n <= 1 ? countHigh : countLow) }
    func ui() { play(uiTap); lightHaptic.impactOccurred(intensity: 0.4) }
    func join() { play(joinCue); notify.notificationOccurred(.success) }
}
