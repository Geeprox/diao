import Foundation

enum StoreSetup {
    static let hostName = "app.tabpilot.bridge"

    enum Failure: Error {
        case needsInstallation
        case incompleteBundle
        case connectionConflict
    }

    static func register() throws {
        guard CredentialVault.storeBuild, let origin = CredentialVault.extensionOrigin,
              let program = Bundle.main.executableURL, FileManager.default.isExecutableFile(atPath: program.path)
        else { throw Failure.incompleteBundle }
        guard Bundle.main.bundleURL.deletingLastPathComponent().standardizedFileURL.path == "/Applications"
        else { throw Failure.needsInstallation }

        let files = FileManager.default
        let folder = try files.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                   appropriateFor: nil, create: true)
            .appendingPathComponent("Google/Chrome/NativeMessagingHosts", isDirectory: true)
        try files.createDirectory(at: folder, withIntermediateDirectories: true)
        let target = folder.appendingPathComponent(hostName + ".json")
        if files.fileExists(atPath: target.path) {
            guard try target.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true,
                  let entry = try? JSONSerialization.jsonObject(with: Data(contentsOf: target)) as? [String: Any],
                  entry["name"] as? String == hostName, entry["type"] as? String == "stdio",
                  entry["path"] as? String == program.path, entry["allowed_origins"] as? [String] == [origin]
            else { throw Failure.connectionConflict }
            return
        }

        let entry: [String: Any] = [
            "name": hostName,
            "description": "Tab Cadence Mac companion",
            "type": "stdio",
            "path": program.path,
            "allowed_origins": [origin],
        ]
        let payload = try JSONSerialization.data(withJSONObject: entry, options: [.prettyPrinted, .sortedKeys])
        try payload.write(to: target, options: [.withoutOverwriting])
        try files.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
    }
}
