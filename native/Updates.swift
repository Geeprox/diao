import AppKit
#if canImport(Sparkle)
import Sparkle
#endif

#if canImport(Sparkle)
final class DiaoUpdates: NSObject, SPUUpdaterDelegate {
    private let notify: (String, String?) -> Void
    private let canRestart: () -> Bool
    private let nativeHost: Bool
    private var stagedRelease: String?
    private var installTimer: Timer?
    private var requestedCheck = false
    private lazy var controller = SPUStandardUpdaterController(startingUpdater: false, updaterDelegate: self, userDriverDelegate: nil)

    static var available: Bool {
        guard Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") is String,
              Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") is String else { return false }
        #if DIAO_UPDATE_FIXTURE
        return true
        #else
        return CredentialVault.storeBuild && Bundle.main.bundleURL.deletingLastPathComponent().path == "/Applications"
        #endif
    }

    init(nativeHost: Bool, canRestart: @escaping () -> Bool, notify: @escaping (String, String?) -> Void) {
        self.nativeHost = nativeHost
        self.canRestart = canRestart
        self.notify = notify
        super.init()
        controller.startUpdater()
    }

    func checkNow() {
        guard controller.updater.canCheckForUpdates else { return }
        requestedCheck = true
        notify("checking", nil)
        controller.updater.checkForUpdatesInBackground()
    }

    func updater(_ updater: SPUUpdater, willInstallUpdateOnQuit item: SUAppcastItem, immediateInstallationBlock _: @escaping () -> Void) -> Bool {
        requestedCheck = false
        stagedRelease = item.versionString
        notify("staged", item.versionString)
        // Sparkle 会在正常退出时安装。Chrome 连接长期运行时，等当前提醒、切换和钥匙串操作结束后主动交接。
        installTimer?.invalidate()
        installTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] timer in
            guard let self else { timer.invalidate(); return }
            guard self.canRestart(), let release = self.stagedRelease else { return }
            timer.invalidate()
            self.notify("installing", release)
            // 按 Sparkle 的退出安装契约交接，不唤起后台 Agent 的更新对话框。
            NSApp.terminate(nil)
        }
        return true
    }

    func updaterShouldRelaunchApplication(_ updater: SPUUpdater) -> Bool {
        // Chrome 会重建原生消息端口，不能把后台助手重新打开成安装窗口。
        !nativeHost
    }

    func updater(_ updater: SPUUpdater, didFinishUpdateCycleFor mode: SPUUpdateCheck, error: (any Error)?) {
        if stagedRelease != nil { return }
        if requestedCheck {
            requestedCheck = false
            notify(error == nil || (error as NSError?)?.code == 1001 ? "current" : "failed", nil)
        }
    }
}
#else
final class DiaoUpdates {
    static let available = false
    init(nativeHost: Bool, canRestart: @escaping () -> Bool, notify: @escaping (String, String?) -> Void) {}
    func checkNow() {}
}
#endif
