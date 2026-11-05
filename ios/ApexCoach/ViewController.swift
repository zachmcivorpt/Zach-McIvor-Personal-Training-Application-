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
    // Apple's purchase sheet (#134): a still picture of the page shown over
    // it while the sheet is up and until the page has reloaded after it.
    private var purchaseCover: UIView?
    private var purchaseSheetOpen = false
    private var navigationsSinceSheet = 0
    // After Apple's sheet a brand-new web view is loaded (#161); until then
    // the old page's own reload must not take the cover off.
    private var awaitingFreshPage = false
    // The page a rebuilt web view opens instead of the current one (#166:
    // Train Solo Home after Manage Subscriptions). Cleared once shown.
    private var freshPageURL: URL?

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

        webView = makeWebView(config)
        purchases.coverPageForSheet = { [weak self] show in
            guard let self = self else { return show() }
            self.coverPageForPurchase(then: show)
        }
        purchases.sheetFinished = { [weak self] bought in self?.purchaseSheetDidFinish(bought: bought) }
        purchases.manageSheetFinished = { [weak self] in self?.manageSheetDidFinish() }
        view.addSubview(webView)

        // Pin below the status bar/notch — a bare WKWebView doesn't auto-inset
        // for the safe area the way Safari does, so without this the app's own
        // header renders underneath the system status bar and its buttons.
        // The edge-to-edge alternative (pinned to the raw view top instead)
        // is pre-built here too but starts inactive — see isEdgeToEdge above
        // for when it's swapped in.
        pinWebView()
        isDarkBackground = UserDefaults.standard.bool(forKey: lastDarkKey)
        isEdgeToEdge = UserDefaults.standard.bool(forKey: lastEdgeKey)

        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardWillChangeFrame(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil
        )
        // Coming back to the app (after Apple's purchase sheet, Face ID,
        // another app): if iOS ended the page while we were away and didn't
        // tell us, the screen is left black. Check and reload (#132).
        NotificationCenter.default.addObserver(
            self, selector: #selector(checkPageAlive), name: UIApplication.didBecomeActiveNotification, object: nil
        )

        spinner.color = isDarkBackground ? .lightGray : .gray
        spinner.center = view.center
        spinner.autoresizingMask = [.flexibleLeftMargin, .flexibleRightMargin, .flexibleTopMargin, .flexibleBottomMargin]
        view.addSubview(spinner)
        spinner.startAnimating()

        loadSite()
    }

    // The web view and its settings. Also used to replace a page iOS has
    // stopped drawing with a brand-new web view (rebuildWebView, #154).
    private func makeWebView(_ config: WKWebViewConfiguration) -> WKWebView {
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = self
        wv.uiDelegate = self
        wv.translatesAutoresizingMaskIntoConstraints = false
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.isOpaque = false
        wv.backgroundColor = isDarkBackground ? nearBlack : .white
        wv.scrollView.bounces = !isEdgeToEdge
        health.webView = wv
        purchases.webView = wv
        return wv
    }

    // The web view's constraints. Also used after re-attaching it to the
    // screen (revealAfterPurchase), which drops them. Keeps the current
    // keyboard inset and edge-to-edge choice.
    private func pinWebView() {
        let bottomInset = webViewBottomConstraint?.constant ?? 0
        webViewBottomConstraint = webView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: bottomInset)
        webViewTopConstraint = webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor)
        webViewTopConstraintEdgeToEdge = webView.topAnchor.constraint(equalTo: view.topAnchor)
        NSLayoutConstraint.activate([
            isEdgeToEdge ? webViewTopConstraintEdgeToEdge : webViewTopConstraint,
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webViewBottomConstraint,
        ])
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
    // `url`: a page of the site to open instead of its front page — the
    // page the member was on, when a web view is replaced (#161).
    private func loadSite(_ url: URL? = nil) {
        triedSavedCopy = false
        let defaults = UserDefaults.standard
        openedFromSavedCopy = defaults.bool(forKey: hasSavedCopyKey) && !defaults.bool(forKey: savedCopyStaleKey)
        let policy: URLRequest.CachePolicy = openedFromSavedCopy ? .returnCacheDataElseLoad : .useProtocolCachePolicy
        webView.load(URLRequest(url: url ?? siteURL, cachePolicy: policy, timeoutInterval: 15))
    }

    // The page the web view is on, if it's one of ours.
    private func currentSitePage(_ wv: WKWebView?) -> URL? {
        guard let url = wv?.url, url.host == siteURL.host else { return nil }
        return url
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
        calibrateScreenPicture()
        // Reloaded after Apple's purchase sheet: give the page a moment to
        // paint, then show it again (#134).
        if purchaseCover != nil && !purchaseSheetOpen && !awaitingFreshPage {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                guard let self = self, !self.purchaseSheetOpen, !self.awaitingFreshPage, self.purchaseCover != nil else { return }
                self.revealAfterPurchase()
            }
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
    // Blank-page guard (#132): after the In-App Purchase sheet the page
    // could be gone (black screen) with no termination callback. Ask the
    // page whether the app is drawn; no answer within 2s, an error, or an
    // empty #root means it's gone, so load it again (the saved copy opens
    // instantly, and the purchase itself is already recorded by Apple).
    @objc private func checkPageAlive() {
        guard webView != nil, !webView.isLoading, !purchaseSheetOpen, purchaseCover == nil else { return }
        // Not just "is there content" (#154): iOS can leave the page with all
        // its content but undrawn (white) after the app comes back. Ask for
        // a drawn frame; none → re-attach the web view and ask again; still
        // none → a brand-new web view (what closing the app did).
        pageDrawsFrame { [weak self] drawn in
            guard let self = self else { return }
            if drawn {
                // The page says it's drawn — but an unpainted page still
                // says so (#162). Check what's really on screen.
                self.checkPageVisible()
                return
            }
            self.reattachWebView()
            self.pageDrawsFrame { [weak self] drawn in
                guard let self = self, !drawn else { return }
                self.rebuildWebView()
            }
        }
    }

    // White screen when coming back to the app (#162): a real screen (not a
    // loading placeholder) that comes out as one flat colour in a picture
    // of the web view is a page WebKit has stopped painting — every APEX
    // screen has text on it. Re-attach the web view; still flat → a
    // brand-new web view on the same page.
    private func checkPageVisible() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self = self, !self.webView.isLoading, !self.purchaseSheetOpen, self.purchaseCover == nil else { return }
            self.pageDrawsFrame(appReady: true) { [weak self] ready in
                guard let self = self, ready else { return }
                self.pageLooksBlank { [weak self] blank in
                    guard let self = self, blank else { return }
                    self.wakeWebKit()
                    self.reattachWebView()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                        guard let self = self else { return }
                        self.pageLooksBlank { [weak self] stillBlank in
                            guard let self = self, stillBlank else { return }
                            self.rebuildWebView()
                        }
                    }
                }
            }
        }
    }

    // A small picture of what the web view is showing: true when it's one
    // flat colour (#162). No picture → false (nothing done).
    //
    // #163: WebKit's own takeSnapshot re-renders the page itself, so it can
    // look fine while the screen shows white — that let the cover come off
    // onto a white page after a purchase. The picture is now taken from the
    // screen (drawHierarchy: what the member actually sees), once that has
    // been confirmed to work on this phone (screenPictureWorks, checked on a
    // normal screen after the first load); until then WebKit's picture.
    private func pageLooksBlank(_ done: @escaping (Bool) -> Void) {
        if screenPictureWorks == true, let cg = screenPicture() {
            return done(ViewController.isOneColour(cg))
        }
        let config = WKSnapshotConfiguration()
        config.snapshotWidth = NSNumber(value: 64)
        webView.takeSnapshot(with: config) { image, _ in
            guard let cg = image?.cgImage else { return done(false) }
            done(ViewController.isOneColour(cg))
        }
    }

    // nil = not known yet; true/false once checked on a normal screen.
    private var screenPictureWorks: Bool?

    // What the web view shows on screen right now, 64 points wide.
    private func screenPicture() -> CGImage? {
        let bounds = webView.bounds
        guard bounds.width > 1, bounds.height > 1 else { return nil }
        let size = CGSize(width: 64, height: max(1, (bounds.height * 64 / bounds.width).rounded()))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            _ = self.webView.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: false)
        }
        return image.cgImage
    }

    // Once, after the first normal load: does the screen picture show the
    // page? (A real screen is never one flat colour.) If it doesn't, this
    // phone's screen pictures can't be trusted and WebKit's is used instead.
    private func calibrateScreenPicture() {
        guard screenPictureWorks == nil, purchaseCover == nil else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            guard let self = self, self.screenPictureWorks == nil, self.purchaseCover == nil,
                  UIApplication.shared.applicationState == .active else { return }
            self.pageDrawsFrame(appReady: true) { [weak self] ready in
                guard let self = self, ready, self.screenPictureWorks == nil, let cg = self.screenPicture() else { return }
                self.screenPictureWorks = !ViewController.isOneColour(cg)
            }
        }
    }

    static func isOneColour(_ cg: CGImage) -> Bool {
        let w = cg.width
        let h = cg.height
        guard w > 0, h > 0 else { return false }
        var pixels = [UInt8](repeating: 0, count: w * h * 4)
        return pixels.withUnsafeMutableBytes { buf -> Bool in
            guard let ctx = CGContext(
                data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
            let p = buf.bindMemory(to: UInt8.self)
            let r0 = Int(p[0])
            let g0 = Int(p[1])
            let b0 = Int(p[2])
            var i = 4
            while i + 2 < p.count {
                if abs(Int(p[i]) - r0) > 10 || abs(Int(p[i + 1]) - g0) > 10 || abs(Int(p[i + 2]) - b0) > 10 { return false }
                i += 4
            }
            return true
        }
    }

    // Asks the page to report a drawn frame: two requestAnimationFrames, and
    // the app's #root has content. An undrawn, gone or empty page doesn't
    // answer in time (or answers 0) → false.
    // `appReady`: also require a real screen, not a loading placeholder
    // (marked data-apex-loading) — unless the purchase screens are up (#161).
    private func pageDrawsFrame(timeout: TimeInterval = 1.5, appReady: Bool = false, _ done: @escaping (Bool) -> Void) {
        var answered = false
        let giveUp = DispatchWorkItem {
            guard !answered else { return }
            answered = true
            done(false)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: giveUp)
        let check = appReady
            ? "var stage=document.querySelector('[data-testid=\"solo-purchase-stage\"],[data-testid=\"solo-welcome\"]');var busy=document.querySelector('[data-apex-loading]');r(el&&(stage||!busy)?el.childElementCount:0)"
            : "r(el?el.childElementCount:0)"
        let js = "return await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){var el=document.getElementById('root');" + check + "})})})"
        webView.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
            guard !answered else { return }
            answered = true
            giveUp.cancel()
            if case .success(let value) = result, ((value as? NSNumber)?.intValue ?? 0) > 0 {
                done(true)
            } else {
                done(false)
            }
        }
    }

    // Takes the web view off the screen and puts it back (what leaving and
    // reopening the app does to it), keeping its constraints and the cover.
    private func reattachWebView() {
        webView.removeFromSuperview()
        view.insertSubview(webView, at: 0)
        pinWebView()
        view.layoutIfNeeded()
        if let cover = purchaseCover { view.bringSubviewToFront(cover) }
    }

    // A brand-new web view on the same configuration (same cookies,
    // storage and sign-in), loading the site: what force-closing the app
    // did, without closing it.
    private func rebuildWebView() {
        let old: WKWebView = webView
        // Reopen the page they were on, not the front page (#161): the front
        // page sends someone signed in only to Train Solo to the chooser.
        // After Manage Subscriptions: Train Solo Home (#166).
        let resume = freshPageURL ?? currentSitePage(old)
        let config = old.configuration
        old.stopLoading()
        old.navigationDelegate = nil
        old.uiDelegate = nil
        old.removeFromSuperview()
        webView = makeWebView(config)
        view.insertSubview(webView, at: 0)
        pinWebView()
        view.layoutIfNeeded()
        webViewReady = false
        view.bringSubviewToFront(spinner)
        spinner.startAnimating()
        // The purchase screen (its own spinner) stays on top of everything.
        if let cover = purchaseCover { view.bringSubviewToFront(cover) }
        loadSite(resume)
    }

    // Apple's In-App Purchase sheet (#134). With the sheet up, WebKit can
    // stop drawing the page: black behind the sheet and after it, while the
    // page still takes taps (a tap on the invisible Subscribe button bought
    // again). So just before the sheet, a picture of the page covers it and
    // takes the taps. Once the sheet answers, the page reloads itself
    // (SoloPaywall.jsx); an older saved copy that doesn't is reloaded from
    // here. The cover comes off when that load has finished.
    private func coverPageForPurchase(then show: @escaping () -> Void) {
        purchaseSheetOpen = true
        navigationsSinceSheet = 0
        webView.takeSnapshot(with: nil) { [weak self] image, _ in
            guard let self = self else { return show() }
            if let image = image {
                self.purchaseCover?.removeFromSuperview()
                let cover = UIImageView(image: image)
                cover.frame = self.webView.frame
                cover.contentMode = .scaleToFill
                cover.isUserInteractionEnabled = true
                self.view.insertSubview(cover, aboveSubview: self.webView)
                self.purchaseCover = cover
            }
            show()
        }
    }

    // White page after a purchase (#153, #154, #161): with Apple's sheet over
    // it, WebKit can stop drawing the page and never start again — and the
    // page's own "I've drawn" answer can't be trusted then (it still runs and
    // answers). Re-attaching or reloading in place didn't always bring it
    // back; closing and reopening the app did. So after every purchase sheet:
    //  1. a solid "Confirming your membership" screen replaces the picture of
    //     the page at once (never a blank frame),
    //  2. a second later (the page has saved the result by then,
    //     SoloPaywall.jsx), a brand-new web view opens the page they were on,
    //  3. the screen comes off only once that new page has drawn the app.
    private func purchaseSheetDidFinish(bought: Bool) {
        freshPageURL = nil
        purchaseSheetOpen = false
        showPurchaseStageCover(title: bought ? "Confirming your membership" : "One moment", detail: bought ? "One moment." : "")
        awaitingFreshPage = true
        purchaseRebuilds = 0
        // The new web view is made only once Apple's sheet has fully gone
        // and the app is active again (#163) — one made while the app is
        // still inactive can come up unpainted too.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            guard let self = self, self.awaitingFreshPage else { return }
            self.whenAppActive { [weak self] in
                guard let self = self, self.awaitingFreshPage else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                    guard let self = self, self.awaitingFreshPage else { return }
                    self.awaitingFreshPage = false
                    self.rebuildWebView()
                }
            }
        }
        // Never leave the screen up for long — but never uncover onto a
        // white page either (#163): after 15s the screen offers Continue.
        // Counted from the sheet closing, whatever else is waited for (#177:
        // "One moment" stayed up for good after a cancel).
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            guard let self = self, !self.purchaseSheetOpen, self.purchaseCover != nil else { return }
            self.awaitingFreshPage = false
            self.offerContinue()
        }
    }

    // Runs `block` once the app is active AND Apple's sheet has really gone
    // (checked every 0.25s). #175: after a cancel, Manage Subscriptions can
    // answer while its sheet (the cancel confirmation) is still up; a page
    // made then froze under it and showed white once it closed. The sheet
    // can stay up as long as the member likes, so wait up to 10 minutes.
    private func whenAppActive(tries: Int = 0, _ block: @escaping () -> Void) {
        // A sheet counts only while it's really on screen (#177): after a
        // cancel iOS can leave Apple's (dismissed, windowless) controller
        // presented, which kept "One moment" up for good.
        let sheet = presentedViewController
        let sheetGone = sheet == nil || sheet?.view.window == nil || sheet?.isBeingDismissed == true
        if (UIApplication.shared.applicationState == .active && sheetGone) || tries >= 2400 { return block() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            guard let self = self else { return }
            self.whenAppActive(tries: tries + 1, block)
        }
    }

    // The page still isn't showing: the purchase screen stays, with a
    // Continue button that opens a fresh page (never a white screen).
    private func offerContinue() {
        guard purchaseCover != nil else { return }
        showPurchaseStageCover(title: "You're all set", detail: "Tap Continue to open APEX.", showContinue: true)
    }

    @objc private func continueAfterPurchase() {
        purchaseRebuilds = 0
        showPurchaseStageCover(title: "One moment", detail: "")
        rebuildWebView() // its didFinish reveals again
    }

    // A plain native screen in the app's colours with a title, a line and a
    // spinner — the same words the page shows next, so the hand-over is
    // seamless. Replaces the picture of the page, taking all taps.
    private func showPurchaseStageCover(title: String, detail: String, showContinue: Bool = false) {
        // The same look as the page's own purchase screens (SoloPurchaseStage,
        // #163): APEX mark, title, a line, and the thin blue line — in Train
        // Solo's colours, so the hand-over to the page is seamless.
        let dark = isDarkBackground
        let ink = dark ? UIColor.white : UIColor(red: 20.0 / 255.0, green: 19.0 / 255.0, blue: 15.0 / 255.0, alpha: 1)
        let stage = UIView(frame: view.bounds)
        stage.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        stage.backgroundColor = dark ? UIColor(red: 10.0 / 255.0, green: 10.0 / 255.0, blue: 11.0 / 255.0, alpha: 1) : .white
        stage.isUserInteractionEnabled = true
        let mark = UIImageView(image: UIImage(named: dark ? "ApexMarkWhite" : "ApexMarkBlack"))
        mark.contentMode = .scaleAspectFit
        mark.alpha = 0.9
        mark.translatesAutoresizingMaskIntoConstraints = false
        let titleLabel = UILabel()
        titleLabel.text = title
        titleLabel.font = .systemFont(ofSize: 20, weight: .semibold)
        titleLabel.textColor = ink
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0
        let detailLabel = UILabel()
        detailLabel.text = detail
        detailLabel.font = .systemFont(ofSize: 13)
        detailLabel.textColor = ink.withAlphaComponent(0.55)
        detailLabel.textAlignment = .center
        detailLabel.numberOfLines = 0
        detailLabel.isHidden = detail.isEmpty
        var items: [UIView] = [mark, titleLabel, detailLabel]
        if showContinue {
            let button = UIButton(type: .system)
            button.setTitle("CONTINUE", for: .normal)
            button.titleLabel?.font = .systemFont(ofSize: 13, weight: .bold)
            button.setTitleColor(dark ? UIColor(red: 10.0 / 255.0, green: 10.0 / 255.0, blue: 11.0 / 255.0, alpha: 1) : .white, for: .normal)
            button.backgroundColor = ink
            button.layer.cornerRadius = 16
            button.contentEdgeInsets = UIEdgeInsets(top: 14, left: 48, bottom: 14, right: 48)
            button.addTarget(self, action: #selector(continueAfterPurchase), for: .touchUpInside)
            items.append(button)
        } else {
            // The thin blue line: a 96 x 2 track with a pulsing blue half.
            let track = UIView()
            track.backgroundColor = ink.withAlphaComponent(dark ? 0.1 : 0.08)
            track.layer.cornerRadius = 1
            track.translatesAutoresizingMaskIntoConstraints = false
            let fill = UIView()
            fill.backgroundColor = UIColor(red: 47.0 / 255.0, green: 143.0 / 255.0, blue: 1, alpha: 1)
            fill.layer.cornerRadius = 1
            fill.translatesAutoresizingMaskIntoConstraints = false
            track.addSubview(fill)
            NSLayoutConstraint.activate([
                track.widthAnchor.constraint(equalToConstant: 96),
                track.heightAnchor.constraint(equalToConstant: 2),
                fill.leadingAnchor.constraint(equalTo: track.leadingAnchor),
                fill.topAnchor.constraint(equalTo: track.topAnchor),
                fill.bottomAnchor.constraint(equalTo: track.bottomAnchor),
                fill.widthAnchor.constraint(equalToConstant: 48),
            ])
            UIView.animate(withDuration: 1.0, delay: 0, options: [.repeat, .autoreverse, .curveEaseInOut], animations: { fill.alpha = 0.35 }, completion: nil)
            items.append(track)
        }
        let stack = UIStackView(arrangedSubviews: items)
        stack.axis = .vertical
        stack.spacing = 8
        stack.alignment = .center
        stack.setCustomSpacing(32, after: mark)
        stack.setCustomSpacing(32, after: detail.isEmpty ? titleLabel : detailLabel)
        stack.translatesAutoresizingMaskIntoConstraints = false
        stage.addSubview(stack)
        NSLayoutConstraint.activate([
            mark.widthAnchor.constraint(equalToConstant: 32),
            mark.heightAnchor.constraint(equalToConstant: 32),
            stack.centerYAnchor.constraint(equalTo: stage.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: stage.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: stage.trailingAnchor, constant: -32),
        ])
        let previous = purchaseCover
        view.addSubview(stage)
        purchaseCover = stage
        previous?.removeFromSuperview()
    }

    // The new page has loaded: wait until it reports the app is on screen
    // (asked again every half second, up to ~10s), then show it.
    private var purchaseRebuilds = 0

    private func revealAfterPurchase(tries: Int = 0) {
        // What leaving and reopening the app did (#166): tell WebKit the app
        // is at the front again, which unfreezes a page it stopped drawing
        // under Apple's sheet — the page was all there, just not drawn.
        if tries == 0 { wakeWebKit() }
        pageDrawsFrame(appReady: true) { [weak self] drawn in
            guard let self = self, self.purchaseCover != nil, !self.awaitingFreshPage else { return }
            if drawn {
                // Also check what's really on screen before uncovering it:
                // one flat colour → another brand-new web view (twice at
                // most), then Continue — never a white screen (#163).
                self.pageLooksBlank { [weak self] blank in
                    guard let self = self, self.purchaseCover != nil, !self.awaitingFreshPage else { return }
                    if blank {
                        // Wake WebKit and look again before replacing the page.
                        self.wakeWebKit()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                            guard let self = self, self.purchaseCover != nil, !self.awaitingFreshPage else { return }
                            self.pageLooksBlank { [weak self] stillBlank in
                                guard let self = self, self.purchaseCover != nil, !self.awaitingFreshPage else { return }
                                if stillBlank {
                                    self.retryFreshPageOrContinue()
                                } else {
                                    self.uncoverAfterPurchase()
                                }
                            }
                        }
                        return
                    }
                    // (The retry count is only reset when a new purchase
                    // starts or Continue is tapped, so a check that keeps
                    // disagreeing can't rebuild in a loop.)
                    self.uncoverAfterPurchase()
                }
                return
            }
            if tries >= 12 {
                self.retryFreshPageOrContinue()
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                guard let self = self else { return }
                self.revealAfterPurchase(tries: tries + 1)
            }
        }
    }

    private func uncoverAfterPurchase() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self = self else { return }
            // The checks can't always see a page WebKit has stopped drawing
            // (#163, #173), so wake it as the cover comes off and twice
            // more just after — harmless on a page that's fine.
            self.wakeWebKit()
            self.removePurchaseCover()
            for delay in [0.5, 1.5] {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.wakeWebKit() }
            }
            self.verifyShownAfterPurchase()
        }
    }

    // Makes WebKit draw the page again after Apple's sheet (#166, #173).
    //  1. "The app came to the front" for the web view's window scene — the
    //     signal WebKit (ApplicationStateTracker) unfreezes a page on. ONLY
    //     that one: #166 also posted "entered background", which the rest of
    //     the app hears too — after a purchase the whole app, native
    //     screens included, stayed black until the member left and came back.
    //  2. The web view's frame 1 pt shorter and back: a new size makes
    //     WebKit lay the page out and commit a fresh picture of it.
    //  3. The page itself is asked to repaint.
    // All public and harmless on a page that's fine.
    private func wakeWebKit() {
        guard let wv = webView else { return }
        if let scene = wv.window?.windowScene {
            NotificationCenter.default.post(name: UIScene.willEnterForegroundNotification, object: scene)
        }
        if let bottom = webViewBottomConstraint {
            let constant = bottom.constant
            bottom.constant = constant - 1
            view.layoutIfNeeded()
            DispatchQueue.main.async { [weak self] in
                guard let self = self, self.webViewBottomConstraint === bottom,
                      bottom.constant == constant - 1 else { return }
                bottom.constant = constant
                self.view.layoutIfNeeded()
            }
        }
        wv.evaluateJavaScript("(function(){var s=document.documentElement.style;s.transform='translateZ(0)';requestAnimationFrame(function(){requestAnimationFrame(function(){s.transform='';});});})()")
    }

    // Apple's Manage Subscriptions sheet has closed (#166) — usually after a
    // cancel. The page under it is frozen the same way as after a purchase:
    // "One moment", a brand-new web view on Train Solo Home (the plan is
    // re-read from the server on open, #133), shown once it's really drawn.
    private func manageSheetDidFinish() {
        purchaseSheetDidFinish(bought: false)
        freshPageURL = siteURL.appendingPathComponent("solo/home")
    }

    private func retryFreshPageOrContinue() {
        if purchaseRebuilds < 2 {
            purchaseRebuilds += 1
            rebuildWebView() // its didFinish reveals again
        } else {
            offerContinue()
        }
    }

    // Uncovered: look again a moment later; white then → the purchase
    // screen back up and a fresh page (#163).
    private func verifyShownAfterPurchase() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            guard let self = self, self.purchaseCover == nil, !self.purchaseSheetOpen else { return }
            self.pageLooksBlank { [weak self] blank in
                guard let self = self, blank, self.purchaseCover == nil else { return }
                self.showPurchaseStageCover(title: "One moment", detail: "")
                self.wakeWebKit()
                self.revealAfterPurchase(tries: 1)
            }
        }
    }

    private func removePurchaseCover() {
        guard let cover = purchaseCover else { return }
        purchaseCover = nil
        freshPageURL = nil
        UIView.animate(withDuration: 0.2, animations: { cover.alpha = 0 }, completion: { _ in cover.removeFromSuperview() })
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        navigationsSinceSheet += 1
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        view.bringSubviewToFront(spinner)
        spinner.startAnimating()
        // Back on the page they were on, not the front page (#161).
        loadSite(currentSitePage(webView))
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
