import UIKit
import WebKit

// Wraps the deployed APEX Coaching Platform web app in a full-screen WKWebView —
// this is the whole app. Camera (barcode scanning) and photo library access
// (progress photos, messages) both flow straight through WKWebView's native
// getUserMedia/file-input support; the matching usage-description strings live
// in Info.plist since iOS silently kills the process without them.
final class ViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler, WKUIDelegate {
    private var webView: WKWebView!
    private let spinner = UIActivityIndicatorView(style: .large)
    private let siteURL = URL(string: "https://apexcoachingplatform-appl.vercel.app")!
    private let nearBlack = UIColor(red: 9.0 / 255.0, green: 9.0 / 255.0, blue: 9.0 / 255.0, alpha: 1)

    // WKWebView — unlike Safari's own browser chrome — never resizes its own
    // frame for the on-screen keyboard; it just lets the keyboard overlay on
    // top of whatever was already rendered there. That means the page's own
    // `window.visualViewport`/`window.innerHeight` never change either, so
    // no amount of web-side JS (listening for a resize that never fires) can
    // detect the keyboard at all — confirmed the real cause after a web-side
    // visualViewport fix still left bottom sheets' search results and footer
    // buttons genuinely covered by the keyboard in production. The actual
    // fix has to happen here: shrink the webView's own bottom anchor by the
    // keyboard's real height when it shows, so the page's viewport ACTUALLY
    // resizes — which then makes visualViewport/innerHeight correctly
    // reflect the smaller space for any web-side layout that depends on it.
    private var webViewBottomConstraint: NSLayoutConstraint!

    // Two pre-built top constraints, exactly one ever active — the normal
    // one (pinned below the status bar/notch, today's behavior for every
    // screen) and the edge-to-edge one (pinned to the raw view top), used
    // only for the login screen's full-bleed gym photo. See isEdgeToEdge
    // below for what toggles between them.
    private var webViewTopConstraint: NSLayoutConstraint!
    private var webViewTopConstraintEdgeToEdge: NSLayoutConstraint!

    // The FCM token AppDelegate obtains from APNs often arrives before the
    // page has finished its first load (or before GoogleService-Info.plist
    // exists at all, in which case this just never fires) — held here and
    // flushed once the web app is actually ready to run JS against it.
    private var pendingFCMToken: String?
    private var webViewReady = false
    // Opening with no signal — see loadSite() and didFailProvisionalNavigation.
    private var triedSavedCopy = false
    // Instant open (1.0.4): see loadSite().
    private let hasSavedCopyKey = "apexHasSavedCopy"
    private let savedCopyStaleKey = "apexSavedCopyStale"
    private var openedFromSavedCopy = false
    private var offlineView: UIView?

    // Apple Health reads for the web app — see HealthBridge.swift.
    private let health = HealthBridge()
    // Train Solo in-app subscriptions — see PurchasesBridge.swift. Only
    // offered to the page once RevenueCat is configured.
    private let purchases = PurchasesBridge()

    // The strip above the webview (status bar + notch) is this view's own
    // background showing through — it doesn't track the page's background
    // on its own. The coach console is always dark but the client app (and
    // the login/activate screens) are light, so this is driven by a
    // postMessage from the web app (src/App.jsx's NativeStatusBarSync)
    // rather than hardcoded, which would otherwise put a black bar over
    // the client app's light background. A cold launch starts from the
    // last screen's look (see lastDarkKey below) until the page posts.
    private var isDarkBackground = false {
        didSet {
            guard isDarkBackground != oldValue else { return }
            view.backgroundColor = isDarkBackground ? nearBlack : .white
            // The webview's own backdrop (what shows before the page paints)
            // matches too, so a dark screen never flashes white while loading.
            webView?.backgroundColor = isDarkBackground ? nearBlack : .white
            setNeedsStatusBarAppearanceUpdate()
        }
    }

    // Set for the full-bleed photo screens — the Coaching login, the
    // Coaching / Train Solo chooser, and Train Solo's login/register/
    // questionnaire screens (src/App.jsx's NativeStatusBarSync and
    // src/solo/SoloThemeContext.jsx) — extends the webview's own frame up
    // behind the status bar/notch so the photo/video reaches the top edge
    // instead of sitting below a plain native strip. Every other screen
    // (the client app, coach console, Train Solo once signed in) keeps the
    // normal pinned-below-safe-area frame. The pages' own top padding
    // (env(safe-area-inset-top), 0 everywhere else) keeps their logo and
    // form clear of the status bar. The rubber-band bounce is also off on
    // these screens, so the photo stays still.
    private var isEdgeToEdge = false {
        didSet {
            guard isEdgeToEdge != oldValue else { return }
            webViewTopConstraint.isActive = !isEdgeToEdge
            webViewTopConstraintEdgeToEdge.isActive = isEdgeToEdge
            webView?.scrollView.bounces = !isEdgeToEdge
            setNeedsStatusBarAppearanceUpdate()
        }
    }

    // The last screen's look is remembered, so a cold launch opens the way
    // the app was left — full screen on the login photo for a signed-out
    // user, the normal white strip for a signed-in client — instead of
    // starting white and visibly jumping once the page posts its theme.
    private let lastDarkKey = "apexLastDarkBackground"
    private let lastEdgeKey = "apexLastEdgeToEdge"

    override var preferredStatusBarStyle: UIStatusBarStyle {
        // The edge-to-edge frame is only ever used against the login
        // screens' dark gym photo, so its status bar icons are light
        // regardless of isDarkBackground (which those screens now also
        // set, so a frame that isn't edge-to-edge shows a dark strip).
        (isDarkBackground || isEdgeToEdge) ? .lightContent : .darkContent
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
        config.userContentController.add(self, name: "apexHealth")
        config.userContentController.add(self, name: "apexRest")
        if PurchasesConfig.isConfigured {
            config.userContentController.add(self, name: "apexPurchases")
        }

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .white
        health.webView = webView
        purchases.webView = webView
        view.addSubview(webView)

        // Pin below the status bar/notch — a bare WKWebView doesn't auto-inset
        // for the safe area the way Safari does, so without this the app's own
        // header renders underneath the system status bar and its buttons.
        // The edge-to-edge alternative (pinned to the raw view top instead)
        // is pre-built here too but starts inactive — see isEdgeToEdge above
        // for when it's swapped in.
        webViewBottomConstraint = webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        webViewTopConstraint = webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor)
        webViewTopConstraintEdgeToEdge = webView.topAnchor.constraint(equalTo: view.topAnchor)
        NSLayoutConstraint.activate([
            webViewTopConstraint,
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webViewBottomConstraint,
        ])
        isDarkBackground = UserDefaults.standard.bool(forKey: lastDarkKey)
        isEdgeToEdge = UserDefaults.standard.bool(forKey: lastEdgeKey)

        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardWillChangeFrame(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil
        )

        spinner.color = isDarkBackground ? .lightGray : .gray
        spinner.center = view.center
        spinner.autoresizingMask = [.flexibleLeftMargin, .flexibleRightMargin, .flexibleTopMargin, .flexibleBottomMargin]
        view.addSubview(spinner)
        spinner.startAnimating()

        loadSite()
    }

    // With no signal when the app opens, the first load fails; the app then
    // opens the copy of APEX this phone already keeps from last time
    // (WKWebView's own web cache: the page plus its scripts, which the site
    // serves as cacheable). The web app runs on its on-phone data
    // (Firestore's local cache) and sends anything logged once it's back
    // online. Only with no saved copy yet (never opened online) does the
    // native "You're offline" message show.
    //
    // Instant open: once the app has loaded the site once, every launch opens
    // the copy already on the phone (.returnCacheDataElseLoad) instead of
    // first asking the server whether the page changed — that round trip was
    // most of the spinner. Right after it opens, checkForNewVersion() asks the
    // server in the background; if a newer version is live, the NEXT launch
    // loads it fresh. Never reloads under someone mid-workout. If the saved
    // copy's code files are gone from the phone, index.html's stale-copy
    // guard reloads the latest version once.
    private func loadSite() {
        triedSavedCopy = false
        let defaults = UserDefaults.standard
        openedFromSavedCopy = defaults.bool(forKey: hasSavedCopyKey) && !defaults.bool(forKey: savedCopyStaleKey)
        let policy: URLRequest.CachePolicy = openedFromSavedCopy ? .returnCacheDataElseLoad : .useProtocolCachePolicy
        webView.load(URLRequest(url: siteURL, cachePolicy: policy, timeoutInterval: 15))
    }

    // Compares the main script the page is running with the one the live
    // site serves now (Vite gives every release a new /assets/index-<hash>.js).
    // Different → mark the saved copy stale so the next launch loads fresh.
    private func checkForNewVersion() {
        var request = URLRequest(url: siteURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            guard let self = self, let data = data, let html = String(data: data, encoding: .utf8),
                  let live = Self.mainScriptPath(in: html) else { return }
            DispatchQueue.main.async {
                let js = "(function(){var s=document.querySelector('script[type=module][src*=\"/assets/index-\"]');return s?new URL(s.src).pathname:'';})()"
                self.webView.evaluateJavaScript(js) { result, _ in
                    guard let running = result as? String, !running.isEmpty else { return }
                    if running != live {
                        UserDefaults.standard.set(true, forKey: self.savedCopyStaleKey)
                    }
                }
            }
        }.resume()
    }

    static func mainScriptPath(in html: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: "/assets/index-[A-Za-z0-9_-]+\\.js"),
              let match = regex.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)),
              let range = Range(match.range, in: html) else { return nil }
        return String(html[range])
    }

    private func isNoConnection(_ error: Error) -> Bool {
        let e = error as NSError
        guard e.domain == NSURLErrorDomain else { return false }
        return [
            NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut,
            NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDataNotAllowed,
            NSURLErrorInternationalRoamingOff, NSURLErrorResourceUnavailable,
        ].contains(e.code)
    }

    private func showOfflineMessage() {
        guard offlineView == nil else { return }
        let cover = UIView()
        cover.backgroundColor = .white
        cover.translatesAutoresizingMaskIntoConstraints = false
        let label = UILabel()
        label.text = "You're offline.\nConnect to the internet once to open APEX. After that it opens without a connection."
        label.numberOfLines = 0
        label.textAlignment = .center
        label.font = .systemFont(ofSize: 15)
        label.textColor = .darkGray
        let retry = UIButton(type: .system)
        retry.setTitle("Try again", for: .normal)
        retry.titleLabel?.font = .boldSystemFont(ofSize: 16)
        retry.addTarget(self, action: #selector(retryLoad), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [label, retry])
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(stack)
        view.addSubview(cover)
        NSLayoutConstraint.activate([
            cover.topAnchor.constraint(equalTo: view.topAnchor),
            cover.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            cover.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            cover.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: cover.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: cover.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: cover.trailingAnchor, constant: -32),
        ])
        offlineView = cover
    }

    @objc private func retryLoad() {
        offlineView?.removeFromSuperview()
        offlineView = nil
        view.bringSubviewToFront(spinner)
        spinner.startAnimating()
        loadSite()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
        offlineView?.removeFromSuperview()
        offlineView = nil
        triedSavedCopy = false
        webViewReady = true
        let defaults = UserDefaults.standard
        defaults.set(true, forKey: hasSavedCopyKey)
        if openedFromSavedCopy {
            checkForNewVersion()
        } else {
            // Just loaded the live version: the phone's copy is current again.
            defaults.set(false, forKey: savedCopyStaleKey)
        }
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

    // keyboardWillChangeFrame (not just WillShow) also covers switching
    // between keyboards of different heights (e.g. the numeric pad handing
    // off to a full QWERTY one) and iPad's floating/undocked keyboard,
    // neither of which fires a plain WillShow again once already visible.
    // The end frame is reported in SCREEN coordinates; converting it into
    // this view's own coordinate space (rather than assuming it matches
    // `view.bounds` exactly) is what makes this correct in a split-screen
    // iPad multitasking layout too, not just full-screen iPhone.
    @objc private func keyboardWillChangeFrame(_ note: Notification) {
        guard
            let endFrameValue = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue,
            let duration = note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double,
            let curveRaw = note.userInfo?[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt
        else { return }
        let endFrameInView = view.convert(endFrameValue.cgRectValue, from: nil)
        // A keyboard that's undocked/floating (iPad) or being dismissed
        // reports an end frame below/outside this view — in both cases the
        // overlap with THIS view is what matters, not the keyboard's own
        // full height, so this is clamped to 0 rather than ever going
        // negative or over-subtracting a keyboard that isn't really here.
        let overlap = max(0, view.bounds.maxY - endFrameInView.minY)
        // The webView's bottom anchor is already pinned to the view's own
        // bottom (which can include the home-indicator safe area) — only
        // the keyboard height BEYOND that safe-area inset should actually
        // shrink the webView, or the page would get double-inset by the
        // same bottom safe area once the keyboard also covers it.
        let additionalInset = max(0, overlap - view.safeAreaInsets.bottom)
        webViewBottomConstraint.constant = -additionalInset
        let curve = UIView.AnimationCurve(rawValue: Int(curveRaw)) ?? .easeInOut
        let animator = UIViewPropertyAnimator(duration: duration, curve: curve) {
            self.view.layoutIfNeeded()
        }
        animator.startAnimation()
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
        if message.name == "apexHealth" {
            if let body = message.body as? [String: Any] { health.handle(body) }
            return
        }
        if message.name == "apexRest" {
            if let body = message.body as? [String: Any] { RestTimerBridge.handle(body) }
            return
        }
        if message.name == "apexPurchases" {
            if let body = message.body as? [String: Any] { purchases.handle(body) }
            return
        }
        guard message.name == "apexTheme",
              let body = message.body as? [String: Any],
              let dark = body["dark"] as? Bool
        else { return }
        isDarkBackground = dark
        // Optional, not guarded like `dark` above — a stale cached web
        // bundle that predates this field just omits it, which should mean
        // "not edge-to-edge" (today's existing behavior) rather than
        // dropping the whole message and also losing the dark/light update.
        isEdgeToEdge = (body["edgeToEdge"] as? Bool) ?? false
        UserDefaults.standard.set(isDarkBackground, forKey: lastDarkKey)
        UserDefaults.standard.set(isEdgeToEdge, forKey: lastEdgeKey)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        // WKUserContentController holds a strong reference to its message
        // handler — without removing it, this ViewController (and its
        // WKWebView) would never deallocate.
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "apexTheme")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "apexHealth")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "apexRest")
        if PurchasesConfig.isConfigured {
            webView.configuration.userContentController.removeScriptMessageHandler(forName: "apexPurchases")
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        spinner.stopAnimating()
    }

    // iOS can end the page's process while the app sits in the background
    // (memory pressure); without this the app came back to a blank screen.
    // Reload it — from the saved copy, so it's back straight away.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        view.bringSubviewToFront(spinner)
        spinner.startAnimating()
        loadSite()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if isNoConnection(error) {
            if !triedSavedCopy {
                triedSavedCopy = true
                webView.load(URLRequest(url: siteURL, cachePolicy: .returnCacheDataDontLoad, timeoutInterval: 15))
                return
            }
            showOfflineMessage()
        }
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

    // Voice notes record through the page's getUserMedia. iOS already asks
    // once for microphone access (NSMicrophoneUsageDescription); without
    // this, WKWebView would ask again on every visit. Only APEX's own pages
    // are granted — anything else gets the normal prompt.
    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(origin.host == siteURL.host ? .grant : .prompt)
    }

    override var prefersStatusBarHidden: Bool { false }
}
