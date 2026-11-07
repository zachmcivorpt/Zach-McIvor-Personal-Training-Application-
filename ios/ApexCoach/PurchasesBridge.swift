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
    static let revenueCatAPIKey = "appl_fUjrmJnNYhdXtCKLNHcctznlgLi"

    static var isConfigured: Bool {
        revenueCatAPIKey.hasPrefix("appl_") && !revenueCatAPIKey.contains("REPLACE")
    }

    static func configure() {
        guard isConfigured else { return }
        Purchases.configure(withAPIKey: revenueCatAPIKey)
    }
}

// What happened around Apple's sheets, step by step, kept on the phone
// (#183). The white screen after a purchase was only ever seen on a device;
// this records each step of the hand-back (sheet closed, app active, fresh
// page, every "is it showing?" answer, cover off) so the next report says
// exactly which one failed. Shown in Train Solo → Profile → Purchase log
// (test accounts in the iPhone app). Never leaves the phone by itself.
enum PurchaseTrace {
    private static let key = "apexPurchaseTrace"
    private static var started = Date()

    static func start(_ event: String) {
        started = Date()
        UserDefaults.standard.set([String](), forKey: key)
        let stamp = ISO8601DateFormatter().string(from: started)
        log("\(event) · \(stamp) · iOS \(UIDevice.current.systemVersion)")
    }

    static func log(_ event: String) {
        let ms = Int(Date().timeIntervalSince(started) * 1000)
        var lines = UserDefaults.standard.stringArray(forKey: key) ?? []
        lines.append("+\(ms)ms \(event)")
        if lines.count > 150 { lines.removeFirst(lines.count - 150) }
        UserDefaults.standard.set(lines, forKey: key)
    }

    static func lines() -> [String] {
        UserDefaults.standard.stringArray(forKey: key) ?? []
    }
}

final class PurchasesBridge {
    weak var webView: WKWebView?
    // Apple's purchase sheet can leave the page undrawn (black) but still
    // tappable (#134). ViewController covers the page with a picture of
    // itself just before the sheet (then calls the block to show it) and
    // takes the cover off once the page has reloaded after it.
    var coverPageForSheet: ((@escaping () -> Void) -> Void)?
    // What Apple's sheet answered, for the page (#161: the screen after says
    // so; #183: handed to the fresh page natively, see ViewController):
    // ["ok": true | "cancelled": true | "error": message, "tier": plus|all_access].
    var sheetFinished: (([String: Any]) -> Void)?
    // Apple's Manage Subscriptions sheet has closed (#166): the same frozen
    // page as after the purchase sheet, so the same recovery, then Home.
    var manageSheetFinished: (() -> Void)?
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
        case "trace":
            reply(id, result: PurchaseTrace.lines())
        case "programPrices":
            programPrices(id, programIds: body["programIds"] as? [String] ?? [])
        case "buyProgram":
            guard let programId = body["programId"] as? String, PurchasesBridge.validProgramId(programId) else { return reply(id, error: "Unknown program.") }
            buyProgram(id, programId: programId, uid: body["uid"] as? String)
        case "restore":
            Purchases.shared.restorePurchases { _, error in
                if let error = error { self.reply(id, error: error.localizedDescription) } else { self.reply(id, result: ["ok": true]) }
            }
        case "manage":
            // Like the purchase sheet (#134, #166): the page is covered by a
            // picture of itself while Apple's sheet is up — WebKit stops
            // drawing it there — and recovered once the sheet has closed.
            let show: () -> Void = {
                _ = Task { @MainActor in
                    if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
                        try? await AppStore.showManageSubscriptions(in: scene)
                    } else if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
                        await UIApplication.shared.open(url)
                    }
                    self.reply(id, result: ["ok": true])
                    self.manageSheetFinished?()
                }
            }
            DispatchQueue.main.async {
                if let cover = self.coverPageForSheet { cover(show) } else { show() }
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
                let showSheet = {
                    PurchaseTrace.log("sheet: asking Apple for \(plan)")
                    Purchases.shared.purchase(package: pkg) { _, _, error, userCancelled in
                        var outcome: [String: Any] = ["tier": plan.hasPrefix("all_access") ? "all_access" : "plus"]
                        if userCancelled {
                            outcome["cancelled"] = true
                        } else if let error = error {
                            outcome["error"] = PurchasesBridge.message(for: error)
                        } else {
                            outcome["ok"] = true
                        }
                        PurchaseTrace.log("sheet answered: \(userCancelled ? "cancelled" : error == nil ? "bought" : "error \((error! as NSError).code)") · app \(UIApplication.shared.applicationState.rawValue)")
                        defer { DispatchQueue.main.async { self.sheetFinished?(outcome) } }
                        if userCancelled { return self.reply(id, error: "Cancelled.", cancelled: true) }
                        if let error = error { return self.reply(id, error: PurchasesBridge.message(for: error)) }
                        self.reply(id, result: ["ok": true])
                    }
                }
                DispatchQueue.main.async {
                    if let cover = self.coverPageForSheet { cover(showSheet) } else { showSheet() }
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

    // Single programs bought in the app (#191): one App Store non-consumable
    // per program, `apex_solo_program_<programId>`, created in App Store
    // Connect. A program without one simply has no price in the app.
    static let programPrefix = "apex_solo_program_"
    static func validProgramId(_ id: String) -> Bool {
        !id.isEmpty && id.count <= 100 && id.allSatisfy { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }
    }

    // Apple's own localised price for each program that has a product.
    private func programPrices(_ id: String, programIds: [String]) {
        let ids = Array(programIds.filter(PurchasesBridge.validProgramId).prefix(100)).map { PurchasesBridge.programPrefix + $0 }
        guard !ids.isEmpty else { return reply(id, result: [[String: Any]]()) }
        Purchases.shared.getProducts(ids) { products in
            let list: [[String: Any]] = products.map { p in
                ["programId": String(p.productIdentifier.dropFirst(PurchasesBridge.programPrefix.count)), "price": p.localizedPriceString]
            }
            self.reply(id, result: list)
        }
    }

    // Same sequence as a subscription (#135, #161, #183): the page is covered
    // before Apple's sheet, and Apple's answer is handed to a fresh page.
    private func buyProgram(_ id: String, programId: String, uid: String?) {
        let buy = {
            Purchases.shared.getProducts([PurchasesBridge.programPrefix + programId]) { products in
                guard let product = products.first else {
                    return self.reply(id, error: "That program can't be bought in the app right now.")
                }
                let showSheet = {
                    PurchaseTrace.log("sheet: asking Apple for program \(programId)")
                    Purchases.shared.purchase(product: product) { _, _, error, userCancelled in
                        var outcome: [String: Any] = ["kind": "program", "programId": programId]
                        if userCancelled {
                            outcome["cancelled"] = true
                        } else if let error = error {
                            outcome["error"] = PurchasesBridge.message(for: error)
                        } else {
                            outcome["ok"] = true
                        }
                        PurchaseTrace.log("sheet answered (program): \(userCancelled ? "cancelled" : error == nil ? "bought" : "error")")
                        defer { DispatchQueue.main.async { self.sheetFinished?(outcome) } }
                        if userCancelled { return self.reply(id, error: "Cancelled.", cancelled: true) }
                        if let error = error { return self.reply(id, error: PurchasesBridge.message(for: error)) }
                        self.reply(id, result: ["ok": true])
                    }
                }
                DispatchQueue.main.async {
                    if let cover = self.coverPageForSheet { cover(showSheet) } else { showSheet() }
                }
            }
        }
        if let uid = uid, !uid.isEmpty, Purchases.shared.appUserID != uid {
            Purchases.shared.logIn(uid) { _, _, error in
                if let error = error { return self.reply(id, error: error.localizedDescription) }
                buy()
            }
        } else {
            buy()
        }
    }

    // Ask to Buy / a bank's extra check: the payment waits for approval
    // (#183). Said plainly instead of RevenueCat's technical wording.
    static func message(for error: Error) -> String {
        if (error as NSError).code == ErrorCode.paymentPendingError.rawValue {
            return "Your purchase is waiting for approval. Your membership starts as soon as it's approved."
        }
        return error.localizedDescription
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
