import Foundation
import RevenueCat
import StoreKit
import UIKit
import WebKit

// Train Solo subscriptions (Plus / All Access) bought inside the iPhone app.
// Apple requires In-App Purchase for these, so the web app's paywall asks
// native code through
//   window.webkit.messageHandlers.apexPurchases.postMessage({ id, action, ... })
// (src/lib/purchases.js) and gets its answer back through
//   window.__apexNativePurchases.receive({ id, result | error, cancelled })
//
// RevenueCat does the App Store work (receipts, renewals, restores). The
// customer is identified to RevenueCat by their Train Solo uid, so a
// purchase lands on the right account; RevenueCat then tells our server
// (functions soloRevenueCatWebhook), which writes the entitlement the app
// reads. Nothing here unlocks anything by itself.
//
// App Store Connect product ids are the plan names, the same keys the
// website's Stripe prices use: apex_solo_plus_monthly, apex_solo_plus_yearly,
// apex_solo_all_access_monthly, apex_solo_all_access_yearly. They must be in
// RevenueCat's current offering.
//
// Until a RevenueCat public key is set below, the bridge stays off: the
// apexPurchases handler isn't registered, so the web app knows not to offer
// a purchase it can't make.
enum PurchasesConfig {
    // RevenueCat → Project → API keys → App Store public key (starts "appl_").
    // A public key, safe to ship in the app.
    static let revenueCatAPIKey = "appl_REPLACE_WITH_REVENUECAT_PUBLIC_KEY"

    static var isConfigured: Bool {
        revenueCatAPIKey.hasPrefix("appl_") && !revenueCatAPIKey.contains("REPLACE")
    }

    static func configure() {
        guard isConfigured else { return }
        Purchases.configure(withAPIKey: revenueCatAPIKey)
    }
}

final class PurchasesBridge {
    weak var webView: WKWebView?
    private let plans = ["plus_monthly", "plus_yearly", "all_access_monthly", "all_access_yearly"]
    private func productId(_ plan: String) -> String { "apex_solo_\(plan)" }

    func handle(_ body: [String: Any]) {
        guard let id = body["id"] as? String, let action = body["action"] as? String else { return }
        guard PurchasesConfig.isConfigured else {
            reply(id, error: "Subscriptions aren't available in this version of the app.")
            return
        }
        switch action {
        case "identify":
            guard let uid = body["uid"] as? String, !uid.isEmpty else { return reply(id, error: "Missing account.") }
            Purchases.shared.logIn(uid) { _, _, error in
                if let error = error { self.reply(id, error: error.localizedDescription) } else { self.reply(id, result: ["ok": true]) }
            }
        case "logout":
            Purchases.shared.logOut { _, _ in self.reply(id, result: ["ok": true]) }
        case "offerings":
            offerings(id)
        case "purchase":
            guard let plan = body["plan"] as? String, plans.contains(plan) else { return reply(id, error: "Unknown plan.") }
            purchase(id, plan: plan, uid: body["uid"] as? String)
        case "restore":
            Purchases.shared.restorePurchases { _, error in
                if let error = error { self.reply(id, error: error.localizedDescription) } else { self.reply(id, result: ["ok": true]) }
            }
        case "manage":
            Task { @MainActor in
                if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
                    try? await AppStore.showManageSubscriptions(in: scene)
                } else if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
                    await UIApplication.shared.open(url)
                }
                self.reply(id, result: ["ok": true])
            }
        default:
            reply(id, error: "Unknown purchase request.")
        }
    }

    // The App Store's own products and localised prices, with the free trial
    // only where this Apple ID is still eligible for it.
    private func offerings(_ id: String) {
        Purchases.shared.getOfferings { offerings, error in
            if let error = error { return self.reply(id, error: error.localizedDescription) }
            let packages = offerings?.current?.availablePackages ?? []
            let wanted = packages.filter { pkg in self.plans.contains { self.productId($0) == pkg.storeProduct.productIdentifier } }
            let ids = wanted.map { $0.storeProduct.productIdentifier }
            Purchases.shared.checkTrialOrIntroDiscountEligibility(productIdentifiers: ids) { eligibility in
                let list: [[String: Any]] = wanted.compactMap { pkg in
                    let product = pkg.storeProduct
                    guard let plan = self.plans.first(where: { self.productId($0) == product.productIdentifier }) else { return nil }
                    var trialDays = 0
                    if let intro = product.introductoryDiscount, intro.paymentMode == .freeTrial,
                       eligibility[product.productIdentifier]?.status == .eligible {
                        let p = intro.subscriptionPeriod
                        switch p.unit {
                        case .day: trialDays = p.value
                        case .week: trialDays = p.value * 7
                        case .month: trialDays = p.value * 30
                        case .year: trialDays = p.value * 365
                        @unknown default: trialDays = 0
                        }
                    }
                    return ["plan": plan, "productId": product.productIdentifier, "price": product.localizedPriceString, "trialDays": trialDays]
                }
                self.reply(id, result: list)
            }
        }
    }

    private func purchase(_ id: String, plan: String, uid: String?) {
        let buy = {
            Purchases.shared.getOfferings { offerings, error in
                if let error = error { return self.reply(id, error: error.localizedDescription) }
                guard let pkg = offerings?.current?.availablePackages.first(where: { $0.storeProduct.productIdentifier == self.productId(plan) }) else {
                    return self.reply(id, error: "That plan isn't available right now.")
                }
                Purchases.shared.purchase(package: pkg) { _, _, error, userCancelled in
                    if userCancelled { return self.reply(id, error: "Cancelled.", cancelled: true) }
                    if let error = error { return self.reply(id, error: error.localizedDescription) }
                    self.reply(id, result: ["ok": true])
                }
            }
        }
        // Always buy as the signed-in Train Solo account.
        if let uid = uid, !uid.isEmpty, Purchases.shared.appUserID != uid {
            Purchases.shared.logIn(uid) { _, _, error in
                if let error = error { return self.reply(id, error: error.localizedDescription) }
                buy()
            }
        } else {
            buy()
        }
    }

    private func reply(_ id: String, result: Any? = nil, error: String? = nil, cancelled: Bool = false) {
        var msg: [String: Any] = ["id": id]
        if let error = error {
            msg["error"] = error
            if cancelled { msg["cancelled"] = true }
        } else {
            msg["result"] = result ?? NSNull()
        }
        guard let data = try? JSONSerialization.data(withJSONObject: msg), let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript("window.__apexNativePurchases && window.__apexNativePurchases.receive(\(json));")
        }
    }
}
