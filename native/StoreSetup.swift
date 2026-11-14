import Foundation
import Darwin

enum StoreSetup {
    static let hostName = "app.tabpilot.bridge"

    static func register() throws {
        guard CredentialVault.storeBuild, let origin = CredentialVault.extensionOrigin,
              let program = Bundle.main.executableURL, FileManager.default.isExecutableFile(atPath: program.path),
              Bundle.main.bundleURL.deletingLastPathComponent().standardizedFileURL.path == "/Applications"
        else { throw problem("请先把 Tab Cadence Bridge 拖入「应用程序」文件夹，再从那里打开。") }

        let files = FileManager.default
        let folder = try files.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                   appropriateFor: nil, create: true)
            .appendingPathComponent("Google/Chrome/NativeMessagingHosts", isDirectory: true)
        try files.createDirectory(at: folder, withIntermediateDirectories: true)
        let target = folder.appendingPathComponent(hostName + ".json")
        let value: [String: Any] = [
            "name": hostName,
            "description": "Tab Cadence Mac companion",
            "type": "stdio",
            "path": program.path,
            "allowed_origins": [origin],
        ]
        let payload = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
        if files.fileExists(atPath: target.path) {
            guard try target.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true,
                  let entry = try JSONSerialization.jsonObject(with: Data(contentsOf: target)) as? [String: Any],
                  entry["name"] as? String == hostName, entry["type"] as? String == "stdio",
                  entry["path"] as? String == program.path, entry["allowed_origins"] as? [String] == [origin]
            else { throw problem("此账户已有另一份 Tab Pilot 助手注册。请使用独立 macOS 用户账户验收商店版。") }
            return
        }
        try payload.write(to: target, options: [.withoutOverwriting])
        try files.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
    }

    private static func problem(_ message: String) -> NSError {
        NSError(domain: "app.tabcadence.setup", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
