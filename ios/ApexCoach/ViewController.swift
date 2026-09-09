import UIKit
import WebKit

// Wraps the deployed APEX Coaching Platform web app in a full-screen WKWebView —
// this is the whole app. Camera (barcode scanning) and photo library access
// (progress photos, messages) both flow straight through WKWebView's native
// getUserMedia/file-input support; the matching usage-description strings live
// in Info.plist since iOS silently kills the process without them.
final class ViewController: UIViewController, WKNavigationDelegate {
    private var webView: WKWebView!
    private let spinner = UIActivityIndicatorView(style: .large)
    private let siteURL = URL(string: "https://apexcoachingplatform-appl.vercel.app")!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

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
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        if url.host == siteURL.host || url.scheme == "about" {
            decisionHandler(.allow)
        } else {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    override var prefersStatusBarHidden: Bool { false }
}
