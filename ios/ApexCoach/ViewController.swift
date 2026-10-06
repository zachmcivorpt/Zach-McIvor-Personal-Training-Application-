import UIKit
import WebKit

// Wraps the deployed APEX Coaching Platform web app in a full-screen WKWebView —
// this is the whole app. Camera (barcode scanning) and photo library access
// (progress photos, messages) both flow straight through WKWebView's native
// getUserMedia/file-input support; the matching usage-description strings live
// in Info.plist since iOS silently kills the process without them.
final class ViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private var webView: WKWebView!
    private let spinner = UIActivityIndicatorView(style: .large)
    private let siteURL = URL(string: "https://apexcoachingplatform-appl.vercel.app")!
    private let nearBlack = UIColor(red: 9.0 / 255.0, green: 9.0 / 255.0, blue: 9.0 / 255.0, alpha: 1)

    // The FCM token AppDelegate obtains from APNs often arrives before the
    // page has finished its first load (or before GoogleService-Info.plist
    // exists at all, in which case this just never fires) — held here and
    // flushed once the web app is actually ready to run JS against it.
    private var pendingFCMToken: String?
    private var webViewReady = false

    // The strip above the webview (status bar + notch) is this view's own
    // background showing through — it doesn't track the page's background
    // on its own. The coach console is always dark but the client app (and
    // the login/activate screens) are light, so this is driven by a
    // postMessage from the web app (src/App.jsx's NativeStatusBarSync)
    // rather than hardcoded, which would otherwise put a black bar over
    // the client app's and auth screens' light backgrounds. Starts false
    // so a cold launch (before the page has loaded and posted anything)
    // matches today's existing white strip exactly.
    private var isDarkBackground = false {
        didSet {
            guard isDarkBackground != oldValue else { return }
            view.backgroundColor = isDarkBackground ? nearBlack : .white
            setNeedsStatusBarAppearanceUpdate()
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        isDarkBackground ? .lightContent : .darkContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white

        NotificationCenter.default.addObserver(
            self, selector: #selector(handleFCMToken(_:)), name: .apexFCMToken, object: nil
        )

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(self, name: "apexTheme")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .white
        view.addSubview(webView)

        // Pin below the status bar/notch — a bare WKWebView doesn't auto-inset
        // for the safe area the way Safari does, so without this the app's own
        // header renders underneath the system status bar and its buttons.
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        spinner.color = .gray
        spinner.center = view.center
        spinner.autoresizingMask = [.flexibleLeftMargin, .flexibleRightMargin, .flexibleTopMargin, .flexibleBottomMargin]
        view.addSubview(spinner)
        spinner.startAnimating()

        webView.load(URLRequest(url: siteURL))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
        webViewReady = true
        if let token = pendingFCMToken {
            pendingFCMToken = nil
            sendTokenToWeb(token)
        }
    }

    @objc private func handleFCMToken(_ note: Notification) {
        guard let token = note.object as? String else { return }
        if webViewReady {
            sendTokenToWeb(token)
        } else {
            pendingFCMToken = token
        }
    }

    // Hands the token to window.__apexNativePush.setToken (src/lib/nativeBridge.js),
    // which saves it onto the signed-in user's own fcmTokens array — the
    // exact same field and arrayUnion pattern src/lib/push.js's enablePush()
    // already uses for every other build.
    private func sendTokenToWeb(_ token: String) {
        let escaped = token.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        webView.evaluateJavaScript("window.__apexNativePush && window.__apexNativePush.setToken(\"\(escaped)\");")
    }

    // window.webkit.messageHandlers.apexTheme.postMessage({ dark }) —
    // src/App.jsx posts this once on mount and again every time the
    // active route changes.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "apexTheme",
              let body = message.body as? [String: Any],
              let dark = body["dark"] as? Bool
        else { return }
        isDarkBackground = dark
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        // WKUserContentController holds a strong reference to its message
        // handler — without removing it, this ViewController (and its
        // WKWebView) would never deallocate.
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "apexTheme")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        spinner.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        spinner.stopAnimating()
    }

    // Keep everything on our own domain inside the app; anything else (an
    // external link in a message, a support page, etc.) opens in Safari
    // instead of trapping the user in a webview with no browser chrome.
    //
    // Only a top-level (main-frame) navigation counts as "leaving the app" —
    // Firebase Auth loads its own project authDomain (…firebaseapp.com) in a
    // hidden IFRAME on every sign-in, plain email/password included, to
    // handle session persistence. That's a sub-frame navigation to a
    // different host, not a user tapping a link; sending it out to Safari
    // (as this used to do for any host mismatch) breaks the auth handshake
    // silently — sign-in still "worked" from cached local state, but every
    // Firestore query gated on it, like the coach's client list, came back
    // empty. Sub-frame requests always stay in the webview regardless of host.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        if !isMainFrame || url.host == siteURL.host || url.scheme == "about" {
            decisionHandler(.allow)
        } else {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    override var prefersStatusBarHidden: Bool { false }
}
